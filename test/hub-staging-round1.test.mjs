import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";
import test from "node:test";
import { parse as toml } from "smol-toml";
import { parse as yaml } from "yaml";
import { sha256 } from "../scripts/hub/evidence.mjs";
import { assertStagingSource, stagingOverlay } from "../scripts/hub/staging-source.mjs";
import { hugoBuildEnvironment } from "../scripts/hub/acceptance.mjs";
import { installEnvironment } from "../scripts/hub/staging-forwarder.mjs";
import { assertDenied, assertHTMLRedirect, assertStagingResponse, verifyStagingClosed } from "../scripts/hub/staging-publication.mjs";
import { assertClearanceLedger, createClearanceReader } from "../scripts/hub/staging-authority.mjs";
import { assertEnvironmentPolicy, verifyProtectedEnvironment } from "../scripts/hub/staging-environment.mjs";
import { assertArchiveDigest, downloadPreparedArtifact } from "../scripts/hub/staging-artifact.mjs";
import { waitForStaging } from "../scripts/hub/staging-convergence.mjs";
import { verifyWranglerArchive } from "../scripts/hub/staging-wrangler.mjs";
import { assertStagingConfig } from "../scripts/hub/staging-config.mjs";
import { stagingFailureLabel } from "../scripts/hub/staging-workflow.mjs";

const closureManifest = () => ({ format: 1, entries: [
  { route: "/hub/", ownership: "hub", representations: ["html", "mirror"] },
  ...["/hub/index.json", "/hub/build.json", "/schemas/pipelab-hub/listing-v1.json"].map(route => ({ route, ownership: "hub", representations: ["json"] })),
] });
const temporary = t => { const directory = mkdtempSync(path.join(tmpdir(), "hub-round-test-")); t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; };
const baseFiles = { "data/hub/launch.toml": "open = false\n", "hugo.toml": "baseURL = 'https://pipelab.org/'\n", "static/_headers": "/*\n  X-Frame-Options: DENY\n", "static/robots.txt": "User-agent: *\nAllow: /\n" };
const writeFiles = (root, files) => { for (const [name, value] of Object.entries(files)) { const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value); } };

test("guard:production-base-identity", t => {
  for (const malicious of [false, true]) {
    const root = temporary(t), git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "--quiet"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid"); git("config", "commit.gpgsign", "false");
    writeFiles(root, baseFiles); git("add", "."); git("commit", "--quiet", "-m", "test: base"); const productionBaseSHA = git("rev-parse", "HEAD");
    const files = { ...baseFiles };
    if (malicious) { files["hugo.toml"] += '[security.exec]\nosEnv = [".*"]\n'; writeFiles(root, { ...files, "src/worker.js": "export default {};\n" }); git("add", "."); }
    git("commit", "--quiet", "--allow-empty", "-m", "test: intermediate source"); const baseSHA = git("rev-parse", "HEAD");
    writeFiles(root, stagingOverlay(files)); git("add", "."); git("commit", "--quiet", "-m", "test: staging delta"); const stagingSHA = git("rev-parse", "HEAD");
    assert.throws(() => assertStagingSource({ root, productionBaseSHA, baseSHA, stagingSHA }), /base must equal production main/);
  }
});
test("guard:hugo-secret-environment", () => {
  const env = hugoBuildEnvironment({ PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example", GITHUB_TOKEN: "synthetic", CASE_LEDGER_TOKEN: "synthetic", CF_ACCESS_CLIENT_SECRET: "synthetic", CF_ACCESS_CLIENT_ID: "synthetic", token_lower: "synthetic", HUGO_BASEURL: "other" });
  assert.deepEqual(env, { PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example" });
});
test("commented launch assignments open and unsupported forms write nothing", t => {
  const supported = stagingOverlay({ ...baseFiles, "data/hub/launch.toml": "open = false # closed\n" }); assert.equal(toml(supported["data/hub/launch.toml"]).open, true);
  assert.throws(() => stagingOverlay({ ...baseFiles, "data/hub/launch.toml": '"open" = false\n' }), /overlay must open/);
});
test("guard:combined-ca-trust", t => {
  const home = temporary(t), ca = path.join(home, "loopback.pem"); writeFileSync(ca, "temporary CA fixture\n");
  const env = installEnvironment({ home, ca, environment: { PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example" } });
  const roots = readFileSync(env.SSL_CERT_FILE, "utf8"); assert.ok(roots.includes(rootCertificates[0])); assert.ok(roots.includes("temporary CA fixture")); assert.equal(env.SSL_CERT_DIR, undefined);
});
test("guard:official-trust", t => {
  const home = temporary(t), roots = path.join(home, "public-roots.pem"), ca = path.join(home, "temporary.pem");
  writeFileSync(roots, rootCertificates[0]); writeFileSync(ca, "temporary CA fixture");
  const env = installEnvironment({ home, ca, official: true, environment: { SSL_CERT_FILE: roots, SSL_CERT_DIR: "/configured/roots", HTTPS_PROXY: "http://proxy.example" } });
  assert.equal(env.SSL_CERT_FILE, roots); assert.equal(env.SSL_CERT_DIR, "/configured/roots");
});
test("guard:loopback-no-proxy", t => {
  const env = installEnvironment({ home: temporary(t), environment: { HTTPS_PROXY: "http://proxy.example", NO_PROXY: "example.invalid" } });
  assert.ok(env.NO_PROXY.split(",").includes("127.0.0.1")); assert.ok(env.no_proxy.split(",").includes("localhost")); assert.equal(env.HTTPS_PROXY, "http://proxy.example");
});
test("guard:nofollow-directive", () => {
  const response = { status: 200, body: Buffer.from("expected"), headers: { "x-robots-tag": "noindex", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'", "strict-transport-security": "max-age=1" } };
  assert.throws(() => assertStagingResponse(response, response.body), /headers missing/);
});
test("guard:access-redirect-host", () => {
  assert.throws(() => assertDenied({ status: 302, headers: { location: "https://example.invalid?next=.cloudflareaccess.com/" }, body: Buffer.alloc(0) }), /denial not established/);
});
test("guard:html-redirect", () => {
  assert.doesNotThrow(() => assertHTMLRedirect({ status: 301, headers: { location: "/hub/example/" } }, "/hub/example/"));
  assert.throws(() => assertHTMLRedirect({ status: 301, headers: { location: "https://other.example/hub/example/" } }, "/hub/example/"), /invalid staging HTML redirect/);
});
test("live convergence retries until expected bytes and closure includes downloads", async () => {
  let attempts = 0;
  assert.equal(await waitForStaging(() => { if (++attempts < 3) throw new Error("propagating"); return "expected"; }, { timeout: 500, interval: 1 }), "expected");
  const paths = [], manifest = closureManifest(); manifest.entries.push({ ownership: "hub", route: "/hub/removed/bundle.yaml", representations: ["raw"] });
  let old = true;
  const result = await verifyStagingClosed({ manifest }, { environment: { CF_ACCESS_CLIENT_ID: "synthetic", CF_ACCESS_CLIENT_SECRET: "synthetic" },
    request: async (route, options) => { paths.push(route); if (options.headers?.["CF-Access-Client-Id"] !== "synthetic") return { status: 403, headers: {}, body: Buffer.alloc(0) }; if (old) { old = false; return { status: 200, headers: {} }; } return { status: 404, headers: {} }; },
    converge: check => waitForStaging(check, { timeout: 500, interval: 1 }) });
  assert.ok(result.checked > 5); assert.ok(paths.includes("/hub/removed/bundle.yaml"));
});
test("guard:convergence-deadline", { timeout: 1000 }, async () => {
  await assert.rejects(waitForStaging(() => new Promise(() => {}), { timeout: 10, interval: 1 }), /deadline expired/);
  await assert.rejects(waitForStaging(() => { throw new Error("live closed staging outputs unconfirmed"); }, { timeout: 30, interval: 1 }), /live closed staging outputs unconfirmed/);
  let calls = 0;
  await assert.rejects(waitForStaging(signal => {
    if (++calls === 1) throw new Error("live closed staging outputs unconfirmed");
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted request")), { once: true }));
  }, { timeout: 30, interval: 1 }), /live closed staging outputs unconfirmed/);
});
test("guard:wrangler-distribution-integrity", () => assert.throws(() => verifyWranglerArchive(Buffer.from("untrusted distribution")), /distribution integrity differs/));
test("guard:staging-config-parity", () => {
  const source = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"); assert.doesNotThrow(() => assertStagingConfig(source));
  assert.throws(() => assertStagingConfig(source.replace('"pipelab-org-hub-staging"', '"other-worker"')), /source configuration differs/);
});
test("ordinary direct staging deployments fail before hosting calls", () => {
  const command = assertStagingConfig().env.staging.build.command;
  assert.match(command, /refuse-direct-deploy$/);
  assert.throws(() => execFileSync(process.execPath, [new URL("../scripts/hub/staging-workflow.mjs", import.meta.url).pathname, "refuse-direct-deploy"], { stdio: "pipe", timeout: 5000 }), /Command failed/);
});

const policy = () => ({ name: "hub-staging", protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { id: 1 } }] }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
const branches = () => ({ total_count: 1, branch_policies: [{ name: "main", type: "branch" }] });
test("guard:environment-reviewer", () => {
  assert.doesNotThrow(() => assertEnvironmentPolicy(policy(), branches())); const environment = policy(); environment.protection_rules = [];
  assert.throws(() => assertEnvironmentPolicy(environment, branches()), /environment protection differs/);
});
test("guard:environment-main-only", () => {
  assert.throws(() => assertEnvironmentPolicy(policy(), { total_count: 1, branch_policies: [{ name: "*", type: "branch" }] }), /environment protection differs/);
});
const githubEnvironment = { GITHUB_REPOSITORY: "pipelab-org/pipelab.org", GITHUB_REF: "refs/heads/main", GITHUB_TOKEN: "synthetic" };
const githubResponse = (status, body, headers = {}) => ({ status, headers, body: JSON.stringify(body) });

test("guard:environment-metadata-reads-recover-from-transient-failures", async () => {
  const calls = [], pauses = [];
  const responses = [new Error("staging HTTPS request failed"), githubResponse(503), githubResponse(200, policy()), githubResponse(429), githubResponse(200, branches())];
  await verifyProtectedEnvironment({ environment: githubEnvironment, pause: async ms => { pauses.push(ms); }, request: async url => {
    calls.push(new URL(url).pathname.split("/").at(-1));
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  } });
  assert.deepEqual(calls, ["hub-staging", "hub-staging", "hub-staging", "deployment-branch-policies", "deployment-branch-policies"]);
  assert.deepEqual(pauses, [1000, 2000, 1000]);
});

test("guard:environment-unavailable-or-drifted-still-refuses", async () => {
  for (const [response, expectedAttempts] of [
    [githubResponse(403, policy()), 1],
    [githubResponse(404), 1],
    [githubResponse(503, undefined, { location: "https://example.invalid" }), 1],
    [githubResponse(429, undefined, { "retry-after": "60" }), 1],
    [{ ...githubResponse(200), body: "not JSON" }, 1],
    [githubResponse(503), 3],
  ]) {
    let attempts = 0;
    await assert.rejects(verifyProtectedEnvironment({ environment: githubEnvironment, pause: async () => {}, request: async () => {
      attempts++;
      return response;
    } }), /environment authority unavailable/);
    assert.equal(attempts, expectedAttempts);
  }
  const unprotected = { ...policy(), protection_rules: [] };
  await assert.rejects(verifyProtectedEnvironment({ environment: githubEnvironment, pause: async () => assert.fail("policy drift is not retried"),
    request: async url => githubResponse(200, url.includes("deployment-branch-policies") ? branches() : unprotected) }), /environment protection differs/);
});
test("guard:private-clearance-binding", async () => {
  const digest = "a".repeat(64), config = { ledger: { repository: "fixture/private-records", path: "record.json", ref: "main" }, clearance_directory: "clearances" };
  const record = { format: 1, package_sha256: digest, ledger_revision: "b".repeat(64), clearance_signature_base64: Buffer.alloc(64, 1).toString("base64") };
  const options = { token: "synthetic", request: async url => { assert.ok(url.endsWith("/clearances/" + digest + ".json?ref=main")); return { status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from(JSON.stringify(record)) }; } };
  const reader = createClearanceReader(config, options); assert.equal((await reader(digest)).signature.length, 64);
  record.package_sha256 = "c".repeat(64); await assert.rejects(reader(digest), /private clearance binding differs/);
});
test("guard:private-clearance-signature", async () => {
  const digest = "a".repeat(64), config = { ledger: { repository: "fixture/private-records", path: "record.json", ref: "main" }, clearance_directory: "clearances" };
  await assert.rejects(createClearanceReader(config, { token: "synthetic", request: async () => ({ status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from(JSON.stringify({ format: 1, package_sha256: digest, ledger_revision: "b".repeat(64), clearance_signature_base64: "invalid" })) }) })(digest), /signature malformed/);
});
test("workflow queues pending work, downloads authenticated archives, and keeps authorization private", () => {
  const workflow = yaml(readFileSync(new URL("../.github/workflows/hub-staging.yml", import.meta.url), "utf8"));
  assert.equal(workflow.concurrency.queue, "max");
  for (const key of ["clearance_signature", "upload_receipt", "receipt_signature"]) assert.equal(workflow.on.workflow_dispatch.inputs[key], undefined);
  assert.ok(workflow.jobs.deploy.steps.some(step => step.run?.includes("check-environment")));
  assert.ok(workflow.jobs.deploy.steps.some(step => step.run?.includes("staging-artifact.mjs download")));
  assert.ok(!workflow.jobs.deploy.steps.some(step => step.uses?.startsWith("actions/download-artifact@")));
});
test("guard:archive-digest", () => assert.throws(() => assertArchiveDigest(Buffer.from("tampered evidence and package"), "sha256:" + sha256("trusted zip")), /archive digest differs/));
test("authenticated archive digest is checked before any extraction", async t => {
  const directory = temporary(t), archive = path.join(directory, "fixture.zip");
  execFileSync("python3", ["-c", 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w") as z:\n z.writestr("package/worker/worker.js", "export default {};")\n z.writestr("evidence/proof.json", "1")', archive]);
  const good = readFileSync(archive);
  execFileSync("python3", ["-c", 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w") as z:\n z.writestr("package/worker/worker.js", "export default {};")\n z.writestr("evidence/proof.json", "2")', archive]);
  const changed = readFileSync(archive), destination = path.join(directory, "output"), revision = "a".repeat(40);
  const artifact = { id: 7, name: "hub-staging-package-1", expired: false, size_in_bytes: good.length, digest: "sha256:" + sha256(good), workflow_run: { id: 8, head_branch: "main", head_sha: revision } };
  const run = { id: 8, run_attempt: 1, repository: { full_name: "pipelab-org/pipelab.org" }, head_branch: "main", head_sha: revision, event: "workflow_dispatch", path: ".github/workflows/hub-staging.yml", status: "completed", conclusion: "success" };
  assert.equal(changed.length, good.length);
  let tamper = true, foreign = false;
  const request = async (url, options) => {
    if (options.output) assert.equal(path.dirname(path.dirname(options.output)), directory);
    if (url.endsWith("/zip")) return { status: 302, headers: { location: foreign ? "https://other.example/archive" : "https://fixture.blob.core.windows.net/archive?synthetic=1" } };
    if (url.startsWith("https://fixture.blob.core.windows.net/") || url === "https://other.example/archive") { assert.equal(options.headers, undefined); writeFileSync(options.output, tamper ? changed : good); return { status: 200, headers: {} }; }
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify(url.includes("/runs/") ? run : artifact)) };
  };
  const environment = { PACKAGE_ARTIFACT_ID: "7", PACKAGE_RUN_ID: "8", GITHUB_SHA: revision, GITHUB_TOKEN: "synthetic" };
  await assert.rejects(downloadPreparedArtifact(destination, { environment, request }), /archive digest differs/); assert.equal(existsSync(destination), false);
  tamper = false; foreign = true; await assert.rejects(downloadPreparedArtifact(destination, { environment, request }), /archive redirect refused/); assert.equal(existsSync(destination), false);
  foreign = false; await downloadPreparedArtifact(destination, { environment, request }); assert.equal(readFileSync(path.join(destination, "evidence/proof.json"), "utf8"), "1");
});
test("diagnostics name known controls and never echo arbitrary error content", () => {
  assert.equal(stagingFailureLabel(new Error("staging custom domain or zone routes differ from target")), "ingress");
  assert.equal(stagingFailureLabel(new Error("synthetic private diagnostic")), "operation");
});

test("guard:early-clearance-ledger", () => {
  assert.throws(() => assertClearanceLedger({ ledgerRevision: "a".repeat(64) }, "b".repeat(64)), /private clearance ledger differs/);
});
test("guard:private-clearance-configured", async () => {
  await assert.rejects(createClearanceReader({ ledger: {} })("a".repeat(64)), /private clearance source not configured/);
});
test("guard:archive-paths", t => {
  const root = temporary(t), archive = path.join(root, "paths.zip"), extracted = path.join(root, "extracted"); mkdirSync(extracted);
  execFileSync("python3", ["-c", 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w") as z: z.writestr("package/../../escape", "synthetic")', archive]);
  assert.throws(() => execFileSync("python3", [new URL("../scripts/hub/extract-staging-archive.py", import.meta.url).pathname, archive, extracted], { stdio: "pipe" }), /Command failed/);
  assert.equal(existsSync(path.join(root, "escape")), false);
});

test("guard:environment-context", async () => {
  await assert.rejects(verifyProtectedEnvironment({ environment: { GITHUB_REPOSITORY: "pipelab-org/pipelab.org", GITHUB_REF: "refs/heads/feature", GITHUB_TOKEN: "synthetic" },
    request: async url => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(url.includes("deployment-branch") ? branches() : policy())) }) }), /environment authority unavailable/);
});

test("guard:access-before-open", async () => {
  await assert.rejects(verifyStagingClosed({ manifest: closureManifest() }, { environment: { CF_ACCESS_CLIENT_ID: "synthetic", CF_ACCESS_CLIENT_SECRET: "synthetic" },
    request: async () => ({ status: 404, headers: {}, body: Buffer.from("closed") }), converge: check => check() }), /Access denial not established/);
});
