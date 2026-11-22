import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { parse as yaml } from "yaml";
import { createStagingAdapter as unconfiguredAdapter } from "../scripts/hub/cloudflare-staging.mjs";
import { assertStagingTarget } from "../scripts/hub/staging-target.mjs";
import { assertStagingSource, stagingOverlay } from "../scripts/hub/staging-source.mjs";
import { checkCheckout, stagingAcceptance, routineAcceptance } from "../scripts/hub/acceptance.mjs";
import { createLedgerReader, clearanceKey } from "../scripts/hub/staging-authority.mjs";
import { assertPreparedArtifact } from "../scripts/hub/staging-artifact.mjs";
import { assertBuildReport } from "../scripts/hub/staging-workflow.mjs";
import { canonical, sha256 } from "../scripts/hub/evidence.mjs";

const isolated = mkdtempSync(path.join(tmpdir(), "hub-adapter-test-"));
mkdirSync(path.join(isolated, "scripts"));
cpSync(new URL("../scripts/hub", import.meta.url), path.join(isolated, "scripts/hub"), { recursive: true });
symlinkSync(new URL("../node_modules", import.meta.url), path.join(isolated, "node_modules"), "dir");
const targetFile = path.join(isolated, "scripts/hub/staging-target.mjs");
writeFileSync(targetFile, readFileSync(targetFile, "utf8").replace('STAGING_ACCOUNT_ID = ""', 'STAGING_ACCOUNT_ID = "' + "a".repeat(32) + '"'));
const { createStagingAdapter, packageDigest, assertDeployConfig, runPinnedWrangler } = await import(pathToFileURL(path.join(isolated, "scripts/hub/cloudflare-staging.mjs")));
const { publishClearedVersion, publicationClearancePayload } = await import(pathToFileURL(path.join(isolated, "scripts/hub/deployment-evidence.mjs")));
const { runStagingSession } = await import(pathToFileURL(path.join(isolated, "scripts/hub/staging-session.mjs")));
const { assertStagingTarget: configuredTarget } = await import(pathToFileURL(targetFile));
process.once("exit", () => rmSync(isolated, { recursive: true, force: true }));
const account = "a".repeat(32), closed = "00000000-0000-0000-0000-000000000001", version = "00000000-0000-0000-0000-000000000002";
const key = generateKeyPairSync("ed25519"), publicKey = key.publicKey.export({ type: "spki", format: "der" });

function fixture(t, changes = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-package-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, "assets")); mkdirSync(path.join(directory, "worker"));
  writeFileSync(path.join(directory, "assets/index.html"), "closed fixture");
  writeFileSync(path.join(directory, "worker/worker.js"), "export default {};");
  const config = { name: "pipelab-org-hub-staging", account_id: account, main: "worker/worker.js", assets: { directory: "assets" },
    routes: [{ pattern: "hub-staging.pipelab.org", custom_domain: true }], vars: {}, compatibility_date: "2026-02-10", compatibility_flags: ["nodejs_compat"], workers_dev: false, preview_urls: false };
  writeFileSync(path.join(directory, "deployment.json"), canonical(config));
  const state = { active: closed, versions: [closed, version], ledger: sha256("current ledger"), failClose: false, ambiguous: false, ...changes };
  const calls = [];
  const request = async (url, options) => {
    assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/pipelab-org-hub-staging/`));
    calls.push({ url, method: options.method });
    let result;
    if (url.includes("/versions?")) result = { items: state.versions.map(id => ({ id })) };
    else if (url.endsWith("/subdomain")) result = { enabled: state.ingress ?? false, previews_enabled: false };
    else if (url.includes("/versions/")) result = { id: state.wrongId ?? version };
    else if (options.method === "POST") {
      const deployment = JSON.parse(options.body); assert.equal(deployment.versions.length, 1); assert.equal(deployment.versions[0].percentage, 100);
      if (deployment.versions[0].version_id === closed && state.failClose) throw new Error("closure failed");
      state.active = deployment.versions[0].version_id;
      if (state.failActivate && state.active === version) throw new Error("activation unavailable");
      result = { id: "deployment" };
    } else result = { deployments: [{ strategy: "percentage", versions: [{ version_id: state.active, percentage: state.ambiguous ? 50 : 100 }] }] };
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ success: true, result })) };
  };
  const run = async (args, options) => {
    assert.deepEqual(args, ["versions", "upload", "--config", "deployment.json", "--no-bundle", "--strict"]);
    assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, account); assert.equal(options.env.CF_ACCESS_CLIENT_SECRET, undefined); assert.equal(options.env.CASE_LEDGER_TOKEN, undefined);
    if (state.mutate) writeFileSync(path.join(directory, "assets/index.html"), "changed during upload");
    return "Worker Version ID: " + (state.uploadId ?? version);
  };
  const adapter = createStagingAdapter({ account, closedVersion: closed, token: "synthetic-token", request, run,
    verifyLiveClosed: async () => { if (state.failLiveClose) throw new Error("closed outputs unconfirmed"); },
    verifyLiveVersion: async () => { if (state.hold) state.ledger = sha256("withdrawal"); if (state.failLive) throw new Error("live publication differs"); } });
  const approval = () => ({ version, publicKey, signature: sign(null, publicationClearancePayload(packageDigest(directory), sha256("current ledger")), key.privateKey) });
  const ledger = async () => { if (state.unavailable) throw new Error("ledger unavailable"); return state.ledger; };
  return { directory, config, state, calls, adapter, approval, ledger };
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
test("guard:upload-id", async t => { const f = fixture(t, { uploadId: "not-a-version" }); await assert.rejects(f.adapter.upload(f.directory), /upload version or package changed/); });
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
  const empty = createStagingAdapter({ account, closedVersion: closed, token: "synthetic" });
  empty.importSignedReceipt(receipt, sign(null, Buffer.from(canonical(receipt)), key.privateKey), publicKey);
  await assert.rejects(empty.verifyLiveVersion(version), /live publication check required/);
  await assert.rejects(empty.emergencyClose(), /live closure check required/);
});

test("guard:artifact-provenance", () => {
  const workflowSHA = "a".repeat(40), expected = { artifactID: "7", runID: "8", workflowSHA };
  const artifact = { id: 7, name: "hub-staging-package-1", expired: false, digest: "sha256:" + "b".repeat(64), workflow_run: { id: 8, head_branch: "main", head_sha: workflowSHA } };
  const run = { id: 8, run_attempt: 1, repository: { full_name: "pipelab-org/pipelab.org" }, head_branch: "main", head_sha: workflowSHA, event: "workflow_dispatch", path: ".github/workflows/hub-staging.yml", status: "completed", conclusion: "success" };
  assert.equal(assertPreparedArtifact({ artifact, run }, expected), "7");
  for (const change of [{ head_branch: "feature" }, { conclusion: "failure" }, { head_sha: "c".repeat(40) }, { path: "untrusted.yml" }]) {
    assert.throws(() => assertPreparedArtifact({ artifact, run: { ...run, ...change } }, expected), /untrusted prepared staging artifact/);
  }
  assert.throws(() => assertPreparedArtifact({ artifact: { ...artifact, expired: true }, run }, expected), /untrusted prepared staging artifact/);
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
  assert.ok(implementation.includes('"wrangler@" + WRANGLER_VERSION'));
  assert.doesNotMatch(implementation, /wrangler@[0-9]/);
});
