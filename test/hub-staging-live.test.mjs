import { generateKeyPairSync, sign } from "node:crypto";
import { stringify } from "yaml";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonical, sha256 } from "../scripts/hub/evidence.mjs";
import { verifyStagingPublication, assertStagingResponse, assertDenied } from "../scripts/hub/staging-publication.mjs";
import { assertInstalledBundle, verifyStagingInstalls, withBundleForwarder } from "../scripts/hub/staging-forwarder.mjs";
import { accessHeaders, stagingRequest } from "../scripts/hub/staging-http.mjs";

const environment = { CF_ACCESS_CLIENT_ID: "synthetic-client", CF_ACCESS_CLIENT_SECRET: "synthetic-secret" };
const security = { "x-robots-tag": "noindex, nofollow", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'", "strict-transport-security": "max-age=31536000" };
const response = body => ({ status: 200, headers: { ...security }, body: Buffer.from(body) });
function publication(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-live-test-")); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const identity = { format: 1, candidate: { site_sha: "a".repeat(40) } };
  const contents = new Map([
    ["/hub/fixture/index.html", '<main data-hub-id="fixture"></main>'], ["/hub/fixture/index.md", "ID: fixture\n"],
    ["/hub/build.json", canonical(identity) + "\n"], ["/hub/index.json", "{}"], ["/schemas/pipelab-hub/listing.json", "{}"],
    ["/hub/fixture/bundle.yaml", "bundle: fixture\n"], ["/hub/fixture/bundle.yaml.sig", "signature bytes\n"],
  ].map(([name, value]) => [name, Buffer.from(value)]));
  for (const [route, bytes] of contents) { const file = path.join(directory, route.slice(1)); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); }
  const manifest = { entries: [
    { route: "/hub/fixture/", kind: "listing", ownership: "hub", representations: ["html", "mirror"], listing_id: "fixture", facts: {} },
    ...[...contents].filter(([route]) => !route.endsWith("index.html") && !route.endsWith("index.md")).map(([route, bytes]) => ({ route,
      kind: route.endsWith("build.json") ? "build" : route.includes("bundle.yaml") ? "bundle-download" : route.startsWith("/schemas/") ? "schema" : "json",
      ownership: "hub", representations: [route.endsWith(".json") ? "json" : "raw"], sha256: sha256(bytes), listing_id: "fixture" })),
  ] };
  const records = [{ listing: { id: "fixture", type: "bundle" } }];
  const calls = [];
  const request = async (route, options = {}) => {
    calls.push({ route, authenticated: options.headers?.["CF-Access-Client-Id"] === environment.CF_ACCESS_CLIENT_ID });
    if (!calls.at(-1).authenticated) return { status: 403, headers: {}, body: Buffer.from("denied") };
    return response(contents.get(route === "/hub/fixture/" ? route + "index.html" : route));
  };
  return { directory, identity, manifest, records, contents, calls, request };
}

test("live checks every representation, explicit mirrors and post-warming denial", async t => {
  const f = publication(t); const result = await verifyStagingPublication(f, { request: f.request, environment, install: async () => ({ checked: 1 }) });
  assert.equal(result.checked, f.contents.size); assert.equal(result.denied, (f.contents.size + 1) * 4);
  for (const route of f.contents.keys()) assert.ok(f.calls.some(call => call.route === route && call.authenticated), route);
  assert.equal(f.calls.at(-1).route, "/hub/build.json");
});
test("guard:live-bytes", () => assert.throws(() => assertStagingResponse(response("changed"), Buffer.from("expected")), /bytes or status/));
test("guard:live-headers", () => {
  for (const name of Object.keys(security)) { const actual = response("expected"); delete actual.headers[name]; assert.throws(() => assertStagingResponse(actual, Buffer.from("expected")), /headers missing/, name); }
  const actual = response("expected"); actual.headers["cache-control"] = "private, no-store, public, max-age=30";
  assert.throws(() => assertStagingResponse(actual, Buffer.from("expected")), /headers missing/);
});
test("guard:authenticated-redirect", () => {
  const actual = response("expected"); actual.status = 302; actual.headers.location = "https://fixture.cloudflareaccess.com/login";
  assert.throws(() => assertStagingResponse(actual, Buffer.from("expected")), /bytes or status/);
});
test("guard:denied-auth", () => {
  assert.throws(() => assertDenied(response("login page")), /denial not established/);
  assert.throws(() => assertDenied({ status: 302, headers: { location: "https://other.example/" } }), /denial not established/);
  assert.doesNotThrow(() => assertDenied({ status: 302, headers: { location: "https://fixture.cloudflareaccess.com/login" } }));
});
test("guard:access-credentials", () => assert.throws(() => accessHeaders({}), /credentials unavailable/));
test("guard:request-target", async t => {
  const tools = mkdtempSync(path.join(tmpdir(), "hub-request-tools-"));
  const savedPath = process.env.PATH;
  t.after(() => { process.env.PATH = savedPath; rmSync(tools, { recursive: true, force: true }); });
  writeFileSync(path.join(tools, "curl"), `#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dump-header) headers="$2"; shift 2 ;;
    --output) body="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf 'HTTP/1.1 200 OK\\r\\n\\r\\n' > "$headers"
printf 'fixture' > "$body"
`);
  chmodSync(path.join(tools, "curl"), 0o700);
  process.env.PATH = tools + ":" + savedPath;
  await assert.rejects(stagingRequest("/hub/", { origin: "https://other.example" }), /unexpected staging request target/);
  await assert.rejects(stagingRequest("/hub/../other"), /unexpected staging request target/);
});
test("guard:live-identity", async t => {
  const f = publication(t); let builds = 0;
  const request = async (route, options) => {
    if (route === "/hub/build.json" && options.headers?.["CF-Access-Client-Id"] === environment.CF_ACCESS_CLIENT_ID && ++builds === 3) return response("changed identity");
    return f.request(route, options);
  };
  await assert.rejects(verifyStagingPublication(f, { request, environment, install: async () => ({ checked: 1 }) }), /bytes or status/);
});
test("guard:live-install-complete", async t => {
  const f = publication(t); await assert.rejects(verifyStagingPublication(f, { request: f.request, environment, install: async () => undefined }), /installation checks incomplete/);
});
test("guard:post-warming-denial", async t => {
  const f = publication(t); let warmed = false;
  const request = async (route, options) => {
    const authenticated = options.headers?.["CF-Access-Client-Id"] === environment.CF_ACCESS_CLIENT_ID;
    if (route.endsWith(".sig") && authenticated) warmed = true;
    if (warmed && !authenticated) return response("cached private bytes");
    return f.request(route, options);
  };
  await assert.rejects(verifyStagingPublication(f, { request, environment, install: async () => ({ checked: 1 }) }), /denial not established/);
});

const manifest = { entries: ["/hub/example/bundle.yaml", "/hub/example/bundle.yaml.sig"].map(route => ({ route, kind: "bundle-download", representations: ["raw"] })) };
function localGet(url, ca) {
  return new Promise((resolve, reject) => {
    get(url, { ...(ca ? { ca: readFileSync(ca) } : {}), agent: false, signal: AbortSignal.timeout(5000) }, incoming => {
      const chunks = []; incoming.on("data", chunk => chunks.push(chunk)); incoming.on("end", () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks) })); incoming.on("error", reject);
    }).on("error", reject);
  });
}
test("forwarder TLS trust, bundle bytes and signature retrieval", async () => {
  let temporaryCA; const calls = [];
  await withBundleForwarder({ manifest, headers: accessHeaders(environment), request: async (route, options) => {
    calls.push(route); assert.deepEqual(options.headers, accessHeaders(environment)); return response(Buffer.from([0, 255, route.length]));
  } }, async ({ origin, ca }) => {
    temporaryCA = ca; const bytes = Buffer.from([0, 255, "/hub/example/bundle.yaml".length]);
    await assert.rejects(localGet(origin + "/hub/example/bundle.yaml"), /certificate|issuer|self-signed/);
    assert.deepEqual((await localGet(origin + "/hub/example/bundle.yaml", ca)).body, bytes);
    assert.equal((await localGet(origin + "/hub/example/bundle.yaml.sig", ca)).status, 200);
  });
  assert.deepEqual(calls, ["/hub/example/bundle.yaml", "/hub/example/bundle.yaml.sig"]); assert.equal(existsSync(temporaryCA), false);
});
test("guard:forwarder-path", async () => {
  await withBundleForwarder({ manifest, headers: {}, request: async () => response("must not serve") }, async ({ origin, ca }) => {
    assert.equal((await localGet(origin + "/hub/not-listed/bundle.yaml", ca)).status, 404);
    assert.equal((await localGet(origin + "/hub/example/bundle.yaml?extra=1", ca)).status, 404);
  });
});
test("guard:forwarder-redirect", async () => {
  await withBundleForwarder({ manifest, headers: {}, request: async () => ({ status: 302, headers: { location: "https://other.example/" }, body: Buffer.from("redirect") }) }, async ({ origin, ca }) => {
    assert.equal((await localGet(origin + "/hub/example/bundle.yaml", ca)).status, 502);
  });
});
test("forwarder removes temporary trust after failure and timeout", { timeout: 5000 }, async () => {
  for (const mode of ["failure", "timeout"]) {
    let ca;
    await assert.rejects(withBundleForwarder({ manifest, headers: {}, timeout: 25 }, async info => {
      ca = info.ca;
      if (mode === "failure") throw new Error("fixture failure");
      await new Promise(resolve => info.signal.addEventListener("abort", resolve, { once: true }));
    }), mode === "failure" ? /fixture failure/ : /timed out/);
    assert.equal(existsSync(ca), false);
  }
});

test("pinned CLI installs exact signed community bytes through temporary TLS", { skip: !process.env.HUB_RELEASE_BIN }, async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-cli-test-")); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const key = generateKeyPairSync("ed25519"), publicHex = key.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  const bundle = { format_version: 2, name: "example-bundle", version: "2026.11.0", author: "Example maintainer", description: "Synthetic install fixture", tier: "community", key_id: publicHex, monotonic_version: 1, published_at: "2026-11-01T00:00:00Z", expires_at: "2099-11-01T00:00:00Z", rules: [
    { id: "example-rule", type: "injection", status: "stable", name: "Example rule", description: "Synthetic literal", severity: "high", confidence: "high", pattern: { regex: "fixture-literal" } },
  ] };
  const bytes = Buffer.from(stringify(bundle)), signature = Buffer.from(sign(null, bytes, key.privateKey).toString("base64") + "\n");
  const files = new Map([["/hub/example/bundle.yaml", bytes], ["/hub/example/bundle.yaml.sig", signature]]);
  const manifest = { entries: [...files].map(([route, contents]) => ({ route, kind: "bundle-download", listing_id: "example-bundle", representations: ["raw"], sha256: sha256(contents) })) };
  for (const [route, contents] of files) { const file = path.join(directory, route.slice(1)); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, contents); }
  const records = [{ listing: { id: "example-bundle", type: "bundle", bundle_name: "example-bundle", signer_fingerprint: publicHex }, badge: "community" }];
  const result = await verifyStagingInstalls({ binary: process.env.HUB_RELEASE_BIN, directory, manifest, records, headers: accessHeaders(environment), request: async route => response(files.get(route)) });
  assert.equal(result.checked, 1);
  const changed = Buffer.from(stringify({ ...bundle, description: "Changed signed fixture" }));
  const changedSignature = Buffer.from(sign(null, changed, key.privateKey).toString("base64") + "\n");
  await assert.rejects(verifyStagingInstalls({ binary: process.env.HUB_RELEASE_BIN, directory, manifest, records, headers: accessHeaders(environment),
    request: async route => response(route.endsWith(".sig") ? changedSignature : changed) }), /installed bundle bytes differ/);
});

test("guard:denied-body", () => {
  const body = Buffer.from("protected fixture bytes");
  assert.throws(() => assertDenied({ status: 403, headers: {}, body }, body), /denial contains protected bytes/);
});

test("guard:installed-name", t => {
  const root = mkdtempSync(path.join(tmpdir(), "hub-installed-test-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const rules = path.join(root, "rules"), directory = path.join(root, "source"), expectedName = "example-bundle";
  mkdirSync(path.join(rules, expectedName), { recursive: true }); mkdirSync(path.join(directory, "hub/example"), { recursive: true });
  const entries = ["bundle.yaml", "bundle.yaml.sig"].map(name => {
    const bytes = Buffer.from(name + " fixture bytes"); writeFileSync(path.join(rules, expectedName, name), bytes); writeFileSync(path.join(directory, "hub/example", name), bytes);
    return { route: "/hub/example/" + name, sha256: sha256(bytes) };
  });
  const input = { rules, directory, expectedName, bundle: entries[0], signature: entries[1] };
  assert.doesNotThrow(() => assertInstalledBundle(input)); mkdirSync(path.join(rules, "unexpected-bundle"));
  assert.throws(() => assertInstalledBundle(input), /installed bundle names differ/);
});

test("live HTML parity follows canonical directory bytes and validates file redirects", async t => {
  const f = publication(t), redirect = "/hub/fixture/index.html";
  const request = async (route, options) => route === redirect && options.headers?.["CF-Access-Client-Id"] === environment.CF_ACCESS_CLIENT_ID ?
    { status: 301, headers: { location: "/hub/fixture/" }, body: Buffer.alloc(0) } : f.request(route, options);
  const result = await verifyStagingPublication(f, { request, environment, install: async () => ({ checked: 1 }) });
  assert.equal(result.checked, f.contents.size); assert.equal(result.denied, (f.contents.size + 1) * 4);
});
