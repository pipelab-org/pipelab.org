import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse as yaml } from "yaml";
import { verifyStagingClosed } from "../scripts/hub/staging-publication.mjs";
import { stagingFailureLabel } from "../scripts/hub/staging-diagnostics.mjs";
import { stagingBuildEnvironment } from "../scripts/hub/staging-workflow.mjs";
import { assertWranglerDependencyLock, installWranglerDependencies } from "../scripts/hub/staging-wrangler.mjs";

const manifest = () => ({ format: 1, entries: [
  { route: "/hub/", ownership: "hub", representations: ["html", "mirror"] },
  ...["/hub/index.json", "/hub/build.json", "/schemas/pipelab-hub/listing-v1.json"].map(route => ({ route, ownership: "hub", representations: ["json"] })),
  { route: "/hub/otherwise-unlisted/", ownership: "hub", representations: ["html", "mirror"] },
  { route: "/hub/otherwise-unlisted/bundle.yaml", ownership: "hub", representations: ["raw"] },
] });
const environment = { CF_ACCESS_CLIENT_ID: "synthetic", CF_ACCESS_CLIENT_SECRET: "synthetic" };
const closedOptions = (calls, exposed) => ({
  environment, converge: check => check(),
  request: async (route, options) => {
    calls.push(route);
    const authenticated = options.headers?.["CF-Access-Client-Id"] === "synthetic";
    return { status: !authenticated ? 403 : route === exposed ? 200 : 404, headers: {}, body: Buffer.alloc(0) };
  },
});

test("guard:close-manifest-required", async () => {
  for (const value of [undefined, {}, { format: 1, entries: [] }, { ...manifest(), format: 2 }]) {
    const calls = [];
    await assert.rejects(verifyStagingClosed({ manifest: value }, closedOptions(calls)), /complete closure manifest required/);
    assert.deepEqual(calls, []);
  }
  const incomplete = manifest(); incomplete.entries = incomplete.entries.filter(entry => entry.route !== "/hub/build.json");
  await assert.rejects(verifyStagingClosed({ manifest: incomplete }, closedOptions([])), /complete closure manifest required/);
});
test("guard:close-full-manifest", async () => {
  const routes = ["/hub/otherwise-unlisted/", "/hub/otherwise-unlisted/index.html", "/hub/otherwise-unlisted/index.md", "/hub/otherwise-unlisted/bundle.yaml"];
  for (const route of routes) {
    const calls = [];
    await assert.rejects(verifyStagingClosed({ manifest: manifest() }, closedOptions(calls, route)), error => {
      assert.match(error.message, /closed version must be the static-only staging Worker/);
      assert.match(stagingFailureLabel(error), /closed version must be the static-only staging Worker/); return true;
    });
    assert.ok(calls.includes(route));
  }
  const calls = [], result = await verifyStagingClosed({ manifest: manifest() }, closedOptions(calls));
  assert.equal(result.checked, 11);
  for (const route of routes) assert.equal(calls.filter(value => value === route).length, 3);
});
test("guard:close-workflow-manifest-download", () => {
  const workflow = yaml(readFileSync(new URL("../.github/workflows/hub-staging.yml", import.meta.url), "utf8"));
  const step = workflow.jobs.deploy.steps.find(item => item.run?.includes("staging-artifact.mjs download"));
  assert.equal(step.if, undefined);
  assert.equal(step["continue-on-error"], "${{ inputs.operation == 'close' }}");
  assert.match(step.env.PACKAGE_ARTIFACT_ID, /inputs.package_artifact_id/);
  const recovery = workflow.jobs.deploy.steps.find(item => item.name?.startsWith("Recover closed"));
  assert.match(recovery.if, /always\(\)/);
});
test("guard:dry-run-secret-environment", () => {
  assert.deepEqual(stagingBuildEnvironment({ PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example", lower_token: "synthetic", lower_secret: "synthetic", cf_access_client_id: "synthetic" }),
    { PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example" });
});
const fixtureLock = (metadata, extra = {}) => ({ name: "hub-wrangler-dependencies", lockfileVersion: 3, requires: true, packages: {
  "": { name: "hub-wrangler-dependencies", dependencies: metadata.dependencies, optionalDependencies: metadata.optionalDependencies },
  "node_modules/fixture": { version: "1.2.3", resolved: "https://registry.npmjs.org/fixture/-/fixture-1.2.3.tgz", integrity: "sha512-AAAA" },
  ...extra,
} });
test("guard:wrangler-exact-direct-dependencies", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-dependency-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const metadata = { dependencies: { fixture: "1.2.3" }, optionalDependencies: { optional: "2.0.0-beta.1" } };
  const lockText = JSON.stringify(fixtureLock(metadata));
  let calls = 0;
  const run = async (command, args, options) => {
    calls++;
    assert.equal(command, "npm"); assert.deepEqual(args, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    assert.equal(options.cwd, directory);
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, "package.json"))), { name: "hub-wrangler-dependencies", private: true, ...metadata });
    assert.equal(readFileSync(path.join(directory, "package-lock.json"), "utf8"), lockText);
  };
  await installWranglerDependencies(directory, metadata, { run, lockText }); assert.equal(calls, 1);
  for (const dependency of ["^1.2.3", "latest"]) {
    await assert.rejects(installWranglerDependencies(directory, { ...metadata, dependencies: { fixture: dependency } }, { run: async () => { calls++; }, lockText }), /direct dependencies must use exact versions/);
    assert.equal(calls, 1);
  }
});
test("guard:wrangler-dependency-lock-binds-every-package", async () => {
  const metadata = { dependencies: { fixture: "1.2.3" }, optionalDependencies: { optional: "2.0.0-beta.1" } };
  assert.doesNotThrow(() => assertWranglerDependencyLock(fixtureLock(metadata), metadata));
  const refused = [
    [{ ...fixtureLock(metadata), lockfileVersion: 2 }, /does not match/],
    [fixtureLock({ ...metadata, dependencies: { fixture: "1.2.4" } }), /does not match/],
    [fixtureLock({ ...metadata, optionalDependencies: {} }), /does not match/],
    [fixtureLock(metadata, { "node_modules/unpinned": { version: "1.0.0", resolved: "https://registry.npmjs.org/unpinned/-/unpinned-1.0.0.tgz" } }), /pinned registry tarball/],
    [fixtureLock(metadata, { "node_modules/weak": { version: "1.0.0", resolved: "https://registry.npmjs.org/weak/-/weak-1.0.0.tgz", integrity: "sha1-AAAA" } }), /pinned registry tarball/],
    [fixtureLock(metadata, { "node_modules/elsewhere": { version: "1.0.0", resolved: "https://example.invalid/elsewhere-1.0.0.tgz", integrity: "sha512-AAAA" } }), /pinned registry tarball/],
    [fixtureLock(metadata, { "node_modules/linked": { link: true, resolved: "../linked" } }), /pinned registry tarball/],
    [fixtureLock(metadata, { "outside/path": { version: "1.0.0", resolved: "https://registry.npmjs.org/x/-/x-1.0.0.tgz", integrity: "sha512-AAAA" } }), /pinned registry tarball/],
  ];
  for (const [lock, pattern] of refused) assert.throws(() => assertWranglerDependencyLock(lock, metadata), pattern);
  let calls = 0;
  await assert.rejects(installWranglerDependencies(mkdtempSync(path.join(tmpdir(), "hub-dependency-refusal-")), metadata,
    { run: async () => { calls++; }, lockText: JSON.stringify(refused[1][0]) }), /does not match/);
  assert.equal(calls, 0);
});
test("guard:wrangler-committed-lock-matches-pinned-release", () => {
  // Direct dependencies of wrangler 4.166.0 (registry package.json of the pinned, integrity-checked archive).
  const metadata = {
    dependencies: { "@cspotcode/source-map-support": "0.8.1", "@types/yargs": "17.0.24", cloudflare: "5.2.0", "devtools-protocol": "0.0.1182435",
      esbuild: "0.28.2", "path-to-regexp": "6.3.0", undici: "7.30.2", unenv: "2.0.0-rc.24", workerd: "1.20261119.1",
      "@cloudflare/kv-asset-handler": "0.5.1", "@cloudflare/unenv-preset": "2.16.2", "@cloudflare/workers-utils": "0.56.0", miniflare: "5.20261119.0-beta" },
    optionalDependencies: { fsevents: "2.3.3" },
  };
  const lock = JSON.parse(readFileSync(new URL("../scripts/hub/wrangler-dependencies.lock.json", import.meta.url), "utf8"));
  assertWranglerDependencyLock(lock, metadata);
  assert.ok(Object.keys(lock.packages).length > 100);
});

test("guard:close-diagnostic-redaction", () => {
  const error = new AggregateError([new Error("staging alternate ingress is enabled or unverified"), new Error("synthetic-sensitive-diagnostic")], "closed staging post-activation checks failed");
  assert.equal(stagingFailureLabel(error), "closure_postchecks:ingress,closure");
  assert.doesNotMatch(stagingFailureLabel(error), /synthetic-sensitive/);
});

test("guard:closure-host-denial", async () => {
  for (const exposed of ["/", "/api/results"]) {
    const options = closedOptions([]), original = options.request;
    options.request = async (route, options) => route === exposed && options.headers?.["CF-Access-Client-Id"] !== "synthetic" ?
      { status: 200, headers: {}, body: Buffer.from("exposed host") } : original(route, options);
    await assert.rejects(verifyStagingClosed({ manifest: manifest() }, options), /Access denial not established/);
  }
});
