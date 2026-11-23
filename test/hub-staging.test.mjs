import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { parse as yaml } from "yaml";
import { assertStagingSource, stagingOverlay } from "../scripts/hub/staging-source.mjs";
import { checkCheckout, stagingAcceptance, routineAcceptance } from "../scripts/hub/acceptance.mjs";
import { createLedgerReader, clearanceKey } from "../scripts/hub/staging-authority.mjs";
import { assertPreparedArtifact } from "../scripts/hub/staging-artifact.mjs";
import { assertStagingConfig } from "../scripts/hub/staging-config.mjs";
import { STAGING_ORIGIN, STAGING_WORKER } from "../scripts/hub/staging-target.mjs";
import { assertBuildReport } from "../scripts/hub/staging-workflow.mjs";
import { canonical, sha256 } from "../scripts/hub/evidence.mjs";

let dependencies = path.dirname(createRequire(import.meta.url).resolve("parse5"));
while (path.basename(dependencies) !== "node_modules") {
  const parent = path.dirname(dependencies);
  if (parent === dependencies) throw new Error("installed test dependencies unavailable");
  dependencies = parent;
}
function isolatedTarget(value) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-adapter-test-"));
  mkdirSync(path.join(directory, "scripts"));
  cpSync(new URL("../scripts/hub", import.meta.url), path.join(directory, "scripts/hub"), { recursive: true });
  cpSync(new URL("../wrangler.jsonc", import.meta.url), path.join(directory, "wrangler.jsonc"));
  symlinkSync(dependencies, path.join(directory, "node_modules"), "dir");
  const targetFile = path.join(directory, "scripts/hub/staging-target.mjs");
  writeFileSync(targetFile, readFileSync(targetFile, "utf8").replace(/STAGING_ACCOUNT_ID = "[^"]*"/, "STAGING_ACCOUNT_ID = " + JSON.stringify(value)));
  process.once("exit", () => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const isolated = isolatedTarget("a".repeat(32));
const unconfigured = isolatedTarget("");
const targetFile = path.join(isolated, "scripts/hub/staging-target.mjs");
const { createStagingAdapter: unconfiguredAdapter } = await import(pathToFileURL(path.join(unconfigured, "scripts/hub/cloudflare-staging.mjs")));
const { assertStagingTarget } = await import(pathToFileURL(path.join(unconfigured, "scripts/hub/staging-target.mjs")));
const { createStagingAdapter, packageDigest, assertDeployConfig, assertUploadCopy, runPinnedWrangler } = await import(pathToFileURL(path.join(isolated, "scripts/hub/cloudflare-staging.mjs")));
const { publishClearedVersion, publicationClearancePayload } = await import(pathToFileURL(path.join(isolated, "scripts/hub/deployment-evidence.mjs")));
const { deployStaging, prepareStagingVersion } = await import(pathToFileURL(path.join(isolated, "scripts/hub/staging-workflow.mjs")));
const { runStagingSession } = await import(pathToFileURL(path.join(isolated, "scripts/hub/staging-session.mjs")));
const { assertStagingTarget: configuredTarget } = await import(pathToFileURL(targetFile));
process.once("exit", () => rmSync(isolated, { recursive: true, force: true }));
const account = "a".repeat(32), closed = "00000000-0000-0000-0000-000000000001", version = "00000000-0000-0000-0000-000000000002";
const key = generateKeyPairSync("ed25519"), publicKey = key.publicKey.export({ type: "spki", format: "der" });

function fixture(t, changes = {}, factory = createStagingAdapter) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-package-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, "assets")); mkdirSync(path.join(directory, "worker"));
  writeFileSync(path.join(directory, "assets/index.html"), "closed fixture");
  writeFileSync(path.join(directory, "worker/worker.js"), "export default {};");
  const config = { name: "pipelab-org-hub-staging", account_id: account, main: "worker/worker.js", assets: { directory: "assets" },
    routes: [{ pattern: "hub-staging.pipelab.org", custom_domain: true }], vars: {}, compatibility_date: "2026-02-10", compatibility_flags: ["nodejs_compat"], workers_dev: false, preview_urls: false, ...changes.config };
  writeFileSync(path.join(directory, "deployment.json"), canonical(config));
  const state = { active: closed, versions: [closed, version], ledger: sha256("current ledger"), failClose: false, ambiguous: false, ...changes };
  const calls = [];
  const request = async (url, options) => {
    assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${account}/`) || url.startsWith("https://api.cloudflare.com/client/v4/zones/" + "b".repeat(32) + "/"));
    calls.push({ url, method: options.method });
    let result;
    if (state.inventoryUnavailable && url.endsWith("/workers/domains")) throw new Error("inventory unavailable");
    if (url.includes("/workers/domains")) result = state.domainPages?.[new URL(url).searchParams.get("page") ?? "1"]?.items ?? state.domains ?? [{ hostname: "hub-staging.pipelab.org", service: "pipelab-org-hub-staging", environment: "production", enabled: true, previews_enabled: false, zone_id: "b".repeat(32), ...state.domain }];
    else if (url.includes("/zones/")) result = state.zoneRoutes ?? [];
    else if (url.includes("/environments/production/routes?")) result = state.routes ?? [];
    else if (url.includes("/versions?")) {
      if (state.beforeCopy && !state.raced) { state.raced = true; state.beforeCopy(directory, config); }
      result = { items: state.versions.map(id => ({ id })) };
    }
    else if (url.endsWith("/subdomain")) result = { enabled: state.ingress ?? false, previews_enabled: false };
    else if (url.includes("/versions/")) result = { id: state.wrongId ?? version, resources: { script: { etag: state.etag ?? "fixture-etag" }, bindings: state.bindings ?? {}, script_runtime: state.runtime ?? { compatibility_date: config.compatibility_date, compatibility_flags: config.compatibility_flags } } };
    else if (options.method === "POST") {
      const deployment = JSON.parse(options.body); assert.equal(deployment.versions.length, 1); assert.equal(deployment.versions[0].percentage, 100);
      if (deployment.versions[0].version_id === closed && state.failClose) throw new Error("closure failed");
      state.active = deployment.versions[0].version_id;
      if (state.failActivate && state.active === version) throw new Error("activation unavailable");
      result = { id: "deployment" };
    } else result = { deployments: [{ strategy: "percentage", versions: [{ version_id: state.active, percentage: state.ambiguous ? 50 : 100 }] }] };
    const info = url.includes("/workers/domains") ? state.domainPages?.[new URL(url).searchParams.get("page") ?? "1"]?.info ?? state.domainInfo ?? { page: 1, per_page: 100, count: result.length, total_count: state.inventoryPartial ? result.length + 1 : result.length, total_pages: 1 } :
      url.includes("/environments/") ? state.serviceInfo === false ? undefined : { page: 1, per_page: 100, count: result.length, total_count: result.length, total_pages: 1 } : state.zoneInfo;
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ success: true, result, ...(info ? { result_info: info } : {}) })) };
  };
  const run = async (args, options) => {
    state.runCalls = (state.runCalls ?? 0) + 1;
    state.inspectEnv?.(options.env);
    assert.deepEqual(args, ["versions", "upload", "--config", "deployment.json", "--name", "pipelab-org-hub-staging", "--no-bundle", "--strict"]);
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, account); assert.equal(options.env.CF_ACCESS_CLIENT_SECRET, undefined); assert.equal(options.env.CASE_LEDGER_TOKEN, undefined);
    if (state.mutate) writeFileSync(path.join(directory, "assets/index.html"), "changed during upload");
    writeFileSync(options.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: "version-upload", version: 1, worker_name: state.uploadWorker ?? "pipelab-org-hub-staging", version_id: state.uploadId ?? version }) + "\n");
    return "untrusted console text";
  };
  const adapter = factory({ account, closedVersion: closed, packageDirectory: directory, token: "synthetic-token", request, run,
    verifyLiveClosed: async () => { calls.push({ liveClosed: true }); if (state.failLiveClose) throw new Error("closed outputs unconfirmed"); },
    verifyLiveVersion: async () => { if (state.hold) state.ledger = sha256("withdrawal"); if (state.failLive) throw new Error("live publication differs"); } });
  const approval = () => ({ version, publicKey, signature: sign(null, publicationClearancePayload(packageDigest(directory), sha256("current ledger")), key.privateKey) });
  const ledger = async () => { if (state.unavailable) throw new Error("ledger unavailable"); return state.ledger; };
  return { directory, config, state, calls, adapter, approval, ledger, request };
}

test("guard:account-configured", () => assert.throws(() => assertStagingTarget(account), /staging account id not configured/));
test("guard:target-exact", () => {
  assert.throws(() => configuredTarget("b".repeat(32)), /unexpected staging account/);
  assert.throws(() => configuredTarget(account, "pipelab-org"), /unexpected staging account/);
});
test("guard:config-exact", t => {
  const { config } = fixture(t);
  assert.doesNotThrow(() => assertDeployConfig(config, account));
  assert.throws(() => assertDeployConfig({ ...config, vars: { production: "value" } }, account), /unexpected staging deployment/);
  assert.throws(() => assertDeployConfig({ ...config, preview_urls: true }, account), /unexpected staging deployment/);
});
test("package digest covers Worker, every asset and deployment configuration", t => {
  const { directory } = fixture(t); const original = packageDigest(directory);
  for (const name of ["worker/worker.js", "assets/index.html", "deployment.json"]) {
    const file = path.join(directory, name), bytes = readFileSync(file); writeFileSync(file, "changed");
    assert.notEqual(packageDigest(directory), original, name); writeFileSync(file, bytes);
  }
  writeFileSync(path.join(directory, "assets/extra.bin"), "extra"); assert.notEqual(packageDigest(directory), original);
});
test("guard:package-symlink", t => {
  const { directory } = fixture(t); symlinkSync("index.html", path.join(directory, "assets/link"));
  assert.throws(() => packageDigest(directory), /regular files/);
});
test("guard:unknown-version", async t => {
  const { adapter, calls } = fixture(t); await assert.rejects(adapter.readVersionArtifact(version), /unknown staging version/); assert.equal(calls.length, 0);
});
test("trusted upload binds receipt and activates at 100 percent with live checks", async t => {
  const f = fixture(t), receipt = await f.adapter.upload(f.directory);
  assert.ok(Object.isFrozen(receipt)); assert.equal(receipt.package_sha256, packageDigest(f.directory));
  const result = await runStagingSession(f.approval(), { adapter: f.adapter, readCurrentLedgerRevision: f.ledger });
  assert.equal(result.version, version); assert.equal(f.state.active, version);
});
test("guard:upload-package-stable", async t => { const f = fixture(t, { mutate: true }); await assert.rejects(f.adapter.upload(f.directory), /upload version or package changed/); });
test("guard:upload-id", async t => { const f = fixture(t, { uploadId: "not-a-version" }); await assert.rejects(f.adapter.upload(f.directory), /untrusted Wrangler upload result/); });
test("guard:remote-version-id", async t => { const f = fixture(t, { wrongId: closed }); await assert.rejects(f.adapter.upload(f.directory), /upload identity not confirmed/); });
test("guard:closed-deployable", async t => { const f = fixture(t, { versions: [version] }); await assert.rejects(f.adapter.upload(f.directory), /outside deployable window/); });
test("guard:ingress-disabled", async t => { const f = fixture(t, { ingress: true }); await assert.rejects(f.adapter.assertIngress(), /alternate ingress/); });
test("guard:receipt-signature", async t => {
  const f = fixture(t); const receipt = await f.adapter.upload(f.directory);
  const signature = sign(null, Buffer.from(canonical(receipt)), key.privateKey);
  assert.doesNotThrow(() => f.adapter.importSignedReceipt(receipt, signature, publicKey));
  assert.throws(() => f.adapter.importSignedReceipt({ ...receipt, version: "00000000-0000-0000-0000-000000000003", package_sha256: "0".repeat(64) }, signature, publicKey), /untrusted upload receipt/);
});
test("guard:receipt-immutable", async t => {
  const f = fixture(t); const receipt = { ...await f.adapter.upload(f.directory), package_sha256: "0".repeat(64) };
  assert.throws(() => f.adapter.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey), /immutable upload receipt conflict/);
});
for (const [name, change, pattern] of [
  ["stale-clearance", { ledger: sha256("new hold") }, /does not match/],
  ["ledger-unavailable", { unavailable: true }, /ledger unavailable/],
  ["ledger-change", { hold: true }, /changed during publication/],
  ["activation-ambiguous", { ambiguous: true }, /withdrawal could not be confirmed/],
  ["activation-failed", { failActivate: true }, /activation unavailable/],
  ["live-check", { failLive: true }, /live publication differs/],
]) test("guard:" + name, async t => {
  const f = fixture(t, change); await f.adapter.upload(f.directory);
  await assert.rejects(publishClearedVersion(f.approval(), { ...f.adapter, readCurrentLedgerRevision: f.ledger }), pattern);
  if (!["stale-clearance", "ledger-unavailable"].includes(name)) assert.equal(f.state.active, closed);
});
test("guard:closure-failure", async t => {
  const f = fixture(t, { failClose: true }); await assert.rejects(f.adapter.emergencyClose(), /closure failed/);
});
test("guard:closure-live", async t => {
  const f = fixture(t, { failLiveClose: true }); await assert.rejects(f.adapter.emergencyClose(), /closed outputs unconfirmed/);
});
test("rollback requires fresh clearance after withdrawal", async t => {
  const f = fixture(t); await f.adapter.upload(f.directory);
  const stale = f.approval(); f.state.ledger = sha256("withdrawn");
  await assert.rejects(publishClearedVersion(stale, { ...f.adapter, readCurrentLedgerRevision: f.ledger }), /does not match/);
  const fresh = { ...stale, signature: sign(null, publicationClearancePayload(packageDigest(f.directory), f.state.ledger), key.privateKey) };
  await publishClearedVersion(fresh, { ...f.adapter, readCurrentLedgerRevision: f.ledger }); assert.equal(f.state.active, version);
});
test("reruns recover closed state and cancellation doesn't require ledger access", async t => {
  const f = fixture(t); await f.adapter.upload(f.directory);
  for (let index = 0; index < 2; index++) { await runStagingSession(f.approval(), { adapter: f.adapter, readCurrentLedgerRevision: f.ledger }); assert.equal(f.state.active, version); }
  const abort = new AbortController(); abort.abort(); f.state.unavailable = true;
  await assert.rejects(runStagingSession(f.approval(), { adapter: f.adapter, readCurrentLedgerRevision: f.ledger, signal: abort.signal }), /cancelled/);
  assert.equal(f.state.active, closed);
  await f.adapter.emergencyClose();
});
test("guard:cancel-during-publication", async t => {
  const f = fixture(t); await f.adapter.upload(f.directory); const abort = new AbortController();
  const adapter = { ...f.adapter, verifyLiveVersion: async () => abort.abort() };
  await assert.rejects(runStagingSession(f.approval(), { adapter, readCurrentLedgerRevision: f.ledger, signal: abort.signal }), /cancelled/);
  assert.equal(f.state.active, closed);
});
test("guard:ledger-configured", async () => {
  await assert.rejects(createLedgerReader({ ledger: {} })(), /not configured/);
  assert.throws(() => clearanceKey({}), /not configured/);
});
test("ledger reader hashes exact bytes on each call and refuses unavailable responses", async () => {
  let calls = 0; const config = { ledger: { repository: "fixture/private-records", path: "record.json", ref: "main" } };
  const request = async (url, options) => { assert.equal(url, "https://api.github.com/repos/fixture/private-records/contents/record.json?ref=main"); assert.equal(options.headers.Authorization, "Bearer synthetic"); return { status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from(String(++calls)) }; };
  const reader = createLedgerReader(config, { token: "synthetic", request });
  assert.equal(await reader(), sha256("1")); assert.equal(await reader(), sha256("2"));
  await assert.rejects(createLedgerReader(config, { token: "synthetic", request: async () => ({ status: 302, headers: { location: "https://login.example" }, body: Buffer.from("login") }) })(), /authority unavailable/);
  await assert.rejects(createLedgerReader(config, { token: "synthetic", request: async () => { throw new Error("unavailable"); } })(), /authority unavailable/);
});
test("guard:build-complete", () => {
  const report = { mode: "staging-build", opening_eligible: false, candidate: { site_sha: "a".repeat(40) }, staging: { staging_sha: "a".repeat(40) }, steps: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { status: i === 8 ? "fail" : "pass" }])) };
  assert.doesNotThrow(() => assertBuildReport(report, "a".repeat(40)));
  delete report.steps[8]; assert.throws(() => assertBuildReport(report, "a".repeat(40)), /acceptance incomplete/);
});
test("missing acceptance inputs fail and staging never claims opening eligibility", async () => {
  for (const run of [routineAcceptance, stagingAcceptance]) {
    const report = await run({}); assert.equal(report.opening_eligible, false); assert.equal(report.steps[1].status, "fail");
    assert.equal(report.steps[9].status, run === routineAcceptance ? "not-in-mode" : "fail");
  }
});
test("guard:committed-staging-delta", t => {
  const root = mkdtempSync(path.join(tmpdir(), "hub-staging-source-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid"); git("config", "commit.gpgsign", "false");
  const before = { "data/hub/launch.toml": "open = false\n", "hugo.toml": "baseURL = 'https://pipelab.org/'\n", "static/_headers": "/*\n  X-Frame-Options: DENY\n/x/*\n  Cache-Control: public, max-age=900\n", "static/robots.txt": "User-agent: *\nAllow: /\n" };
  const put = files => { for (const [name, value] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), value); } };
  put(before); git("add", "."); git("commit", "--quiet", "-m", "test: closed fixture"); const base = git("rev-parse", "HEAD");
  checkCheckout(root, base); const after = stagingOverlay(before); put(after); git("add", "."); git("commit", "--quiet", "-m", "test: staging fixture"); const staging = git("rev-parse", "HEAD");
  const input = { root, baseSHA: base, productionBaseSHA: base, stagingSHA: staging };
  assert.equal(assertStagingSource(input).delta.length, 4); checkCheckout(root, staging, "staging");
  assert.throws(() => checkCheckout(root, staging), /routine candidate must remain closed/);
  assert.doesNotMatch(after["static/_headers"], /public|max-age/);
  writeFileSync(path.join(root, "static/robots.txt"), "changed"); assert.throws(() => assertStagingSource(input), /exact and clean/);
  git("add", "."); git("commit", "--quiet", "-m", "test: wrong delta");
  assert.throws(() => assertStagingSource({ ...input, stagingSHA: git("rev-parse", "HEAD") }), /staging delta differs/);
  put(after); writeFileSync(path.join(root, "extra.txt"), "extra"); git("add", "."); git("commit", "--quiet", "-m", "test: extra source");
  assert.throws(() => assertStagingSource({ ...input, stagingSHA: git("rev-parse", "HEAD") }), /only the reviewed staging delta/);
});
test("workflow separates candidate builds from trusted deployment code", () => {
  const workflow = yaml(readFileSync(new URL("../.github/workflows/hub-staging.yml", import.meta.url), "utf8"));
  assert.deepEqual(workflow.permissions, { contents: "read", actions: "read" }); assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.jobs.deploy.environment, "hub-staging");
  const build = workflow.jobs.build.steps, deploy = workflow.jobs.deploy.steps;
  assert.ok(!JSON.stringify(build).includes("secrets.")); assert.ok(!JSON.stringify(deploy).includes("inputs.candidate_sha }}\",\"path"));
  for (const step of [...build, ...deploy]) if (step.uses && !step.uses.startsWith("./")) assert.match(step.uses, /@[a-f0-9]{40}$/);
  for (const step of [...build, ...deploy]) if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with["persist-credentials"], false);
  const publication = deploy.find(step => step.id === "publication"); assert.ok(publication.env.CASE_LEDGER_TOKEN); assert.ok(publication.env.CLOUDFLARE_API_TOKEN);
});

test("staging Worker responses are private and noindex", async () => {
  const { default: worker } = await import("../src/worker.js");
  const staging = await worker.fetch(new Request("https://hub-staging.pipelab.org/unknown"), {});
  assert.equal(staging.status, 404); assert.equal(staging.headers.get("cache-control"), "private, no-store"); assert.equal(staging.headers.get("x-robots-tag"), "noindex, nofollow");
  const production = await worker.fetch(new Request("https://pipelab.org/unknown"), {});
  assert.equal(production.status, 404); assert.equal(production.headers.get("cache-control"), null);
});
test("guard:package-root", t => {
  const { directory } = fixture(t); writeFileSync(path.join(directory, ".env"), "fixture=value");
  assert.throws(() => packageDigest(directory), /unexpected staging package root file/);
});

test("guard:hosting-response", async t => {
  const adapter = createStagingAdapter({ account, closedVersion: closed, token: "synthetic", request: async () => ({ status: 302, headers: { location: "https://other.example/" }, body: Buffer.from(JSON.stringify({ success: true, result: { items: [{ id: closed }] } })) }) });
  await assert.rejects(adapter.assertClosedDeployable(), /hosting API failed/);
});
test("guard:live-check-required", async t => {
  const f = fixture(t); const receipt = await f.adapter.upload(f.directory);
  const empty = createStagingAdapter({ account, closedVersion: closed, token: "synthetic", request: f.request });
  empty.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey);
  await assert.rejects(empty.verifyLiveVersion(version), /live publication check required/);
  await assert.rejects(empty.emergencyClose(), /live closure check required/);
});

test("guard:artifact-provenance", () => {
  const workflowSHA = "a".repeat(40), expected = { artifactID: "7", runID: "8", workflowSHA };
  const artifact = { id: 7, name: "hub-staging-package-1", expired: false, size_in_bytes: 100, digest: "sha256:" + "b".repeat(64), workflow_run: { id: 8, head_branch: "main", head_sha: workflowSHA } };
  const run = { id: 8, run_attempt: 1, repository: { full_name: "pipelab-org/pipelab.org" }, head_branch: "main", head_sha: workflowSHA, event: "workflow_dispatch", path: ".github/workflows/hub-staging.yml", status: "completed", conclusion: "success" };
  assert.equal(assertPreparedArtifact({ artifact, run }, expected), "7");
  for (const change of [{ head_branch: "feature" }, { conclusion: "failure" }, { head_sha: "c".repeat(40) }, { path: "untrusted.yml" }]) {
    assert.throws(() => assertPreparedArtifact({ artifact, run: { ...run, ...change } }, expected), /untrusted prepared staging artifact/);
  }
  assert.throws(() => assertPreparedArtifact({ artifact: { ...artifact, expired: true }, run }, expected), /untrusted prepared staging artifact/);
  assert.throws(() => assertPreparedArtifact({ artifact: { ...artifact, size_in_bytes: 0 }, run }, expected), /untrusted prepared staging artifact/);
});

test("unconfigured adapter refuses every operation before any network call", async () => {
  const adapter = unconfiguredAdapter({ account, closedVersion: closed, request: async () => assert.fail("network must not run") });
  for (const operation of [() => adapter.readActiveVersion(), () => adapter.readVersionArtifact(version), () => adapter.activateVersion(closed),
    () => adapter.upload("/missing"), () => adapter.emergencyClose(), () => adapter.assertIngress(), () => adapter.assertClosedDeployable()]) {
    await assert.rejects(operation(), /staging account id not configured/);
  }
  assert.throws(() => adapter.importSignedReceipt({}, Buffer.alloc(64), publicKey), /staging account id not configured/);
});

test("guard:wrangler-pin", async t => {
  const tools = mkdtempSync(path.join(tmpdir(), "hub-npx-tools-")); const savedPath = process.env.PATH;
  writeFileSync(path.join(tools, "npx"), "#!/bin/sh\nexit 0\n"); chmodSync(path.join(tools, "npx"), 0o700);
  process.env.PATH = tools + ":" + savedPath;
  t.after(() => { process.env.PATH = savedPath; rmSync(tools, { recursive: true, force: true }); });
  assert.throws(() => runPinnedWrangler("unapproved-version", [], {}), /unexpected Wrangler version/);
  const adapter = createStagingAdapter({ account, closedVersion: closed, wranglerVersion: "unapproved-version", request: async () => assert.fail("network must not run") });
  await assert.rejects(adapter.assertClosedDeployable(), /unexpected Wrangler version/);
});
test("workflow uses the committed Wrangler pin", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hub-staging.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("staging-workflow.mjs check-wrangler"));
  const implementation = readFileSync(new URL("../scripts/hub/staging-workflow.mjs", import.meta.url), "utf8");
  assert.ok(implementation.includes("runPinnedWrangler(WRANGLER_VERSION"));
  assert.doesNotMatch(implementation, /wrangler@[0-9]/);
});


test("guard:ingress-domains", async t => {
  const f = fixture(t, { domains: [{ hostname: "other.example", service: "pipelab-org-hub-staging", environment: "production" }] });
  await assert.rejects(f.adapter.upload(f.directory), /custom domain or zone routes differ/);
  assert.equal(f.state.runCalls ?? 0, 0);
});
test("guard:ingress-routes", async t => {
  const f = fixture(t); await f.adapter.upload(f.directory);
  f.state.routes = [{ pattern: "other.example/*", script: "pipelab-org-hub-staging" }];
  await assert.rejects(f.adapter.activateVersion(version), /custom domain or zone routes differ/);
  assert.equal(f.state.active, closed);
});
test("guard:copied-config", t => {
  const f = fixture(t); writeFileSync(path.join(f.directory, "deployment.json"), JSON.stringify({ ...f.config, vars: { unexpected: "value" } }));
  assert.throws(() => assertUploadCopy(f.directory, packageDigest(f.directory), account), /unexpected staging deployment configuration/);
});
test("guard:copied-digest", t => {
  const f = fixture(t), expected = packageDigest(f.directory); writeFileSync(path.join(f.directory, "assets/index.html"), "changed");
  assert.throws(() => assertUploadCopy(f.directory, expected, account), /upload version or package changed/);
});
test("source mutation during hosting reads never reaches Wrangler", async t => {
  const f = fixture(t, { beforeCopy: directory => writeFileSync(path.join(directory, "worker/worker.js"), "changed during await") });
  await assert.rejects(f.adapter.upload(f.directory), /upload version or package changed/); assert.equal(f.state.runCalls ?? 0, 0);
});
test("guard:structured-upload-worker", async t => {
  const f = fixture(t, { uploadWorker: "pipelab-org" }); await assert.rejects(f.adapter.upload(f.directory), /untrusted Wrangler upload result/);
});
test("guard:version-metadata", async t => {
  const f = fixture(t); const receipt = await f.adapter.upload(f.directory);
  assert.equal(receipt.worker_sha256, sha256(readFileSync(path.join(f.directory, "worker/worker.js"))));
  f.state.etag = "changed-version-metadata";
  await assert.rejects(f.adapter.readVersionArtifact(version), /staging version identity differs/);
});
test("nested candidate resolves dependencies and isolates both account states", t => {
  const root = mkdtempSync(path.join(tmpdir(), "hub-nested-test-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidate = path.join(root, "candidate"); mkdirSync(path.join(candidate, "test"), { recursive: true }); mkdirSync(path.join(candidate, "scripts"));
  cpSync(new URL("../scripts/hub", import.meta.url), path.join(candidate, "scripts/hub"), { recursive: true });
  cpSync(new URL("../wrangler.jsonc", import.meta.url), path.join(candidate, "wrangler.jsonc"));
  cpSync(new URL("./hub-staging.test.mjs", import.meta.url), path.join(candidate, "test/hub-staging.test.mjs"));
  const target = path.join(candidate, "scripts/hub/staging-target.mjs");
  writeFileSync(target, readFileSync(target, "utf8").replace(/STAGING_ACCOUNT_ID = "[^"]*"/, 'STAGING_ACCOUNT_ID = "' + "b".repeat(32) + '"'));
  symlinkSync(dependencies, path.join(root, "node_modules"), "dir");
  const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern=guard:account-configured|guard:target-exact|unconfigured adapter", "test/hub-staging.test.mjs"], { cwd: candidate, env: environment, timeout: 15_000, stdio: "pipe", encoding: "utf8" });
  assert.match(output, /^# tests 3$/m); assert.match(output, /^# pass 3$/m); assert.match(output, /^# skipped 0$/m);
});

test("guard:ingress-inventory-unavailable", async t => {
  const f = fixture(t, { inventoryUnavailable: true }); await assert.rejects(f.adapter.upload(f.directory), /inventory unavailable/); assert.equal(f.state.runCalls ?? 0, 0);
});
test("guard:receipt-worker-digest", async t => {
  const f = fixture(t), receipt = { ...await f.adapter.upload(f.directory), version: "00000000-0000-0000-0000-000000000003", worker_sha256: "invalid" };
  assert.throws(() => f.adapter.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey), /untrusted upload receipt/);
});

test("guard:ingress-complete", async t => {
  const f = fixture(t, { inventoryPartial: true }); await assert.rejects(f.adapter.upload(f.directory), /inventory incomplete/); assert.equal(f.state.runCalls ?? 0, 0);
});


for (const [name, domain] of [
  ["domain-enabled", { enabled: false }],
  ["domain-previews", { previews_enabled: true }],
  ["domain-environment", { environment: "other" }],
  ["domain-zone", { zone_id: undefined }],
]) test("guard:" + name, async t => {
  const f = fixture(t, { domain });
  await assert.rejects(f.adapter.upload(f.directory), /custom domain or zone routes differ|domain zone unavailable/);
  assert.equal(f.state.runCalls ?? 0, 0);
});
test("deprecated domain environment may be absent", async t => {
  const f = fixture(t, { domain: { environment: undefined } });
  await f.adapter.upload(f.directory); assert.equal(f.state.runCalls, 1);
});
test("domain inventory follows complete pagination", async t => {
  const other = { hostname: "other.example", service: "other-worker" };
  const target = { hostname: "hub-staging.pipelab.org", service: "pipelab-org-hub-staging", enabled: true, previews_enabled: false, zone_id: "b".repeat(32) };
  const info = page => ({ page, per_page: 1, count: 1, total_count: 2, total_pages: 2 });
  const f = fixture(t, { domainPages: { 1: { items: [other], info: info(1) }, 2: { items: [target], info: info(2) } } });
  await f.adapter.upload(f.directory);
  assert.ok(f.calls.some(call => call.url?.endsWith("/workers/domains?page=2")));
  f.state.domainPages[2].items = [{ ...target, previews_enabled: true }];
  await assert.rejects(f.adapter.upload(f.directory), /custom domain or zone routes differ/);
});
test("guard:domain-pagination-consistency", async t => {
  const f = fixture(t, { domainPages: {
    1: { items: [{ service: "other-worker" }], info: { page: 1, per_page: 1, count: 1, total_count: 3, total_pages: 2 } },
    2: { items: [{ hostname: "hub-staging.pipelab.org", service: "pipelab-org-hub-staging", enabled: true, previews_enabled: false, zone_id: "b".repeat(32) }], info: { page: 2, per_page: 1, count: 1, total_count: 2, total_pages: 2 } },
  } });
  await assert.rejects(f.adapter.upload(f.directory), /inventory incomplete/); assert.equal(f.state.runCalls ?? 0, 0);
});
test("guard:zone-worker-route", async t => {
  const f = fixture(t, { zoneRoutes: [{ pattern: "pipelab.org/*", script: "pipelab-org-hub-staging" }] });
  await assert.rejects(f.adapter.upload(f.directory), /custom domain or zone routes differ/); assert.equal(f.state.runCalls ?? 0, 0);
});
test("guard:zone-route-pagination", async t => {
  const f = fixture(t, { zoneInfo: { page: 1, per_page: 1, count: 0, total_count: 1, total_pages: 2 } });
  await assert.rejects(f.adapter.upload(f.directory), /inventory incomplete/);
  assert.equal(f.calls.filter(call => call.url?.includes("/zones/")).length, 1);
});
test("guard:close-ingress-independent", async t => {
  const f = fixture(t, { active: version, ingress: true, failLiveClose: true });
  await assert.rejects(f.adapter.emergencyClose(), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.errors[0].message, /alternate ingress/);
    assert.match(error.errors[1].message, /closed outputs unconfirmed/); return true;
  });
  assert.equal(f.state.active, closed);
  const activation = f.calls.findIndex(call => call.method === "POST");
  const confirmation = f.calls.findIndex((call, i) => i > activation && call.url?.endsWith("/deployments"));
  const audit = f.calls.findIndex(call => call.url?.endsWith("/subdomain"));
  assert.ok(activation >= 0 && confirmation > activation && audit > confirmation);
  assert.ok(f.calls.some(call => call.liveClosed));
});
test("guard:close-missing-manifest-activates", async t => {
  const f = fixture(t, { active: version }), saved = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_ACCOUNT_ID = account;
  t.after(() => { if (saved === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = saved; });
  const destination = path.join(f.directory, "missing-artifact");
  for (const malformed of [false, true]) {
    f.state.active = version;
    if (malformed) { mkdirSync(path.join(destination, "evidence"), { recursive: true }); writeFileSync(path.join(destination, "evidence/manifest.json"), "{"); }
    await assert.rejects(deployStaging(destination, "close", { adapterFactory: options => createStagingAdapter({ ...options, token: "synthetic", closedVersion: closed, request: f.request }) }));
    assert.equal(f.state.active, closed);
    assert.ok(f.calls.some(call => call.url?.endsWith("/deployments") && call.method === "GET"));
  }
});
for (const [name, change] of [
  ["version-bindings", { bindings: { DATABASE: { type: "secret_text" } } }],
  ["version-runtime-date", { runtime: { compatibility_date: "2026-01-01", compatibility_flags: ["nodejs_compat"] } }],
  ["version-runtime-flags", { runtime: { compatibility_date: "2026-02-10", compatibility_flags: [] } }],
]) test("guard:" + name, async t => {
  const f = fixture(t, change);
  await assert.rejects(f.adapter.upload(f.directory), /version configuration differs/);
  assert.equal(f.state.active, closed);
  delete f.state.bindings; delete f.state.runtime;
  await f.adapter.upload(f.directory);
  Object.assign(f.state, change);
  await assert.rejects(f.adapter.readVersionArtifact(version), /version configuration differs/);
});
test("guard:clearance-before-upload", async t => {
  const f = fixture(t), calls = [], digest = packageDigest(f.directory);
  const authorityConfig = { clearance_public_key_der_base64: publicKey.toString("base64") };
  const good = { ledgerRevision: sha256("current ledger"), signature: sign(null, publicationClearancePayload(digest, sha256("current ledger")), key.privateKey) };
  const adapter = { assertIngress: async () => calls.push("ingress"), emergencyClose: async () => calls.push("close"), upload: async () => { calls.push("upload"); return { version }; } };
  for (const signature of [Buffer.alloc(64), sign(null, publicationClearancePayload(sha256("other package"), good.ledgerRevision), key.privateKey)]) {
    await assert.rejects(prepareStagingVersion({ operation: "publish", directory: f.directory, adapter, authorityConfig, readCurrentLedgerRevision: f.ledger, readClearance: async () => ({ ...good, signature }) }), /clearance does not match/);
    assert.deepEqual(calls, []);
  }
  await prepareStagingVersion({ operation: "publish", directory: f.directory, adapter, authorityConfig, readCurrentLedgerRevision: f.ledger, readClearance: async () => good });
  assert.deepEqual(calls, ["ingress", "close", "upload"]);
});

test("guard:domain-pagination-metadata", async t => {
  const f = fixture(t, { domainInfo: { page: 1, per_page: 100, count: 2, total_count: 1, total_pages: 1 } });
  await assert.rejects(f.adapter.upload(f.directory), /inventory incomplete/); assert.equal(f.state.runCalls ?? 0, 0);
});
test("guard:domain-pagination-duplicates", async t => {
  const items = [{ service: "other-worker" }], info = page => ({ page, per_page: 1, count: 1, total_count: 2, total_pages: 2 });
  const f = fixture(t, { domainPages: { 1: { items, info: info(1) }, 2: { items, info: info(2) } } });
  await assert.rejects(f.adapter.upload(f.directory), /inventory incomplete/); assert.equal(f.state.runCalls ?? 0, 0);
});

test("guard:close-confirmation", async t => {
  const f = fixture(t, { active: version, ambiguous: true });
  await assert.rejects(f.adapter.emergencyClose(), /ambiguous staging activation/);
  assert.equal(f.state.active, closed);
  assert.ok(!f.calls.some(call => call.url?.endsWith("/subdomain")));
});

test("guard:service-inventory-metadata", async t => {
  const f = fixture(t, { serviceInfo: false });
  await assert.rejects(f.adapter.upload(f.directory), /inventory incomplete/); assert.equal(f.state.runCalls ?? 0, 0);
});
test("version rereads use the package configuration for uploads and signed rollback", async t => {
  const f = fixture(t, { bindings: [] }), receipt = await f.adapter.upload(f.directory);
  f.state.runtime = { compatibility_date: f.config.compatibility_date + "T00:00:00Z", compatibility_flags: f.config.compatibility_flags };
  assert.equal(await f.adapter.readVersionArtifact(version), packageDigest(f.directory));
  const rollback = createStagingAdapter({ account, closedVersion: closed, packageDirectory: f.directory, token: "synthetic", request: f.request });
  rollback.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey);
  assert.equal(await rollback.readVersionArtifact(version), packageDigest(f.directory));
  writeFileSync(path.join(f.directory, "deployment.json"), canonical({ ...f.config, compatibility_date: "2026-01-01" }));
  await assert.rejects(rollback.readVersionArtifact(version), /unexpected staging deployment configuration/);
});
test("guard:version-package-evidence", async t => {
  const f = fixture(t), receipt = await f.adapter.upload(f.directory);
  const rollback = createStagingAdapter({ account, closedVersion: closed, token: "synthetic", request: f.request });
  rollback.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey);
  await assert.rejects(rollback.readVersionArtifact(version), /deployment evidence unavailable/);
  writeFileSync(path.join(f.directory, "worker/worker.js"), "changed");
  await assert.rejects(f.adapter.readVersionArtifact(version), /upload version or package changed/);
});
test("guard:cancellation-close-reported", async t => {
  const f = fixture(t); await f.adapter.upload(f.directory);
  const abort = new AbortController(); let closes = 0, release;
  const adapter = { ...f.adapter, emergencyClose: async () => {
    if (++closes === 2) await new Promise((resolve, reject) => { release = () => reject(new Error("cancellation close failed")); });
    else await f.adapter.emergencyClose();
  }, verifyLiveVersion: async () => abort.abort() };
  const outcome = runStagingSession(f.approval(), { adapter, readCurrentLedgerRevision: f.ledger, signal: abort.signal }).then(value => ({ value }), error => ({ error }));
  await new Promise(setImmediate);
  try { assert.equal(closes, 2); } finally { release?.(); }
  const { error } = await outcome;
  assert.ok(error instanceof AggregateError);
  assert.ok(error.errors.some(error => error.message === "cancellation close failed"));
  assert.equal(closes, 3); assert.equal(f.state.active, closed);
});

test("guard:runtime-package-source", async t => {
  const updated = isolatedTarget(account), adapterFile = path.join(updated, "scripts/hub/cloudflare-staging.mjs");
  writeFileSync(adapterFile, readFileSync(adapterFile, "utf8").replace('compatibility_date: "2026-02-10"', 'compatibility_date: "2026-03-01"'));
  const { createStagingAdapter: futureAdapter } = await import(pathToFileURL(adapterFile));
  const f = fixture(t, { config: { compatibility_date: "2026-03-01" } }, futureAdapter), receipt = await f.adapter.upload(f.directory);
  f.state.runtime = { compatibility_date: "2026-03-01T00:00:00Z", compatibility_flags: f.config.compatibility_flags };
  assert.equal(await f.adapter.readVersionArtifact(version), receipt.package_sha256);
  const rollback = futureAdapter({ account, closedVersion: closed, packageDirectory: f.directory, token: "synthetic", request: f.request });
  rollback.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey);
  assert.equal(await rollback.readVersionArtifact(version), receipt.package_sha256);
});
test("guard:upload-environment-case", async t => {
  const name = "HtTpS_PrOxY", old = process.env[name]; process.env[name] = "http://proxy.example";
  t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
  const f = fixture(t, { inspectEnv: env => assert.equal(env[name], "http://proxy.example") });
  await f.adapter.upload(f.directory);
});

test("guard:deployment-config-parity", () => {
  const source = assertStagingConfig(), staging = source.env.staging;
  assert.equal(staging.name, STAGING_WORKER);
  assert.deepEqual(staging.routes, [{ pattern: new URL(STAGING_ORIGIN).hostname, custom_domain: true }]);
  assert.doesNotThrow(() => assertDeployConfig({
    name: staging.name, account_id: account, main: "worker/worker.js", assets: { directory: "assets" },
    routes: staging.routes, vars: staging.vars, workers_dev: staging.workers_dev, preview_urls: staging.preview_urls,
    compatibility_date: source.compatibility_date, compatibility_flags: source.compatibility_flags,
  }, account));
});
