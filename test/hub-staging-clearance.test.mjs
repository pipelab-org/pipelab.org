import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, writeSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256 } from "../scripts/hub/evidence.mjs";
import { publicationClearancePayload } from "../scripts/hub/deployment-evidence.mjs";
import { createClearanceReader, createLedgerReader } from "../scripts/hub/staging-authority.mjs";
import { stagingAccountCommitment } from "../scripts/hub/staging-account.mjs";
import { STAGING_WORKER } from "../scripts/hub/staging-target.mjs";
import { isolatedTarget } from "./hub-staging-fixture.mjs";
const account = "a".repeat(32);
const isolated = isolatedTarget(account);
const fromFixture = name => import(pathToFileURL(path.join(isolated, "scripts/hub", name)));
const { createStagingAdapter, packageDigest } = await fromFixture("cloudflare-staging.mjs");
const { prepareStagingVersion } = await fromFixture("staging-workflow.mjs");
const { CLEARANCE_SCOPE, clearancePayload, loadPrivateKey, main, promptPassphrase, signClearance } = await fromFixture("staging-clearance.mjs");

// Disposable fixtures only: every key and passphrase here is generated per run and never saved.
const PASS = "fixture passphrase " + process.pid;
const pem = (key, passphrase = PASS) => key.privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase });
const plainPem = key => key.privateKey.export({ type: "pkcs8", format: "pem" });
const typed = (value = PASS) => async () => Buffer.from(value);
const der = key => key.publicKey.export({ type: "spki", format: "der" });
const operator = generateKeyPairSync("ed25519"), intruder = generateKeyPairSync("ed25519");
const authority = { clearance_public_key_der_base64: der(operator).toString("base64"), ledger: { repository: "example/ledger", path: "cases.json", ref: "main" }, clearance_directory: "clearances" };
const ledgerBytes = Buffer.from(JSON.stringify({ format: 1, scope: "hub-staging", cases: [] }) + "\n");
const closed = "00000000-0000-0000-0000-000000000001", version = "00000000-0000-0000-0000-000000000002";

function workspace(t) {
  const root = mkdtempSync(path.join(tmpdir(), "hub-clearance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, "package");
  mkdirSync(path.join(pkg, "assets"), { recursive: true }); mkdirSync(path.join(pkg, "worker"));
  writeFileSync(path.join(pkg, "assets/index.html"), "fixture");
  writeFileSync(path.join(pkg, "worker/worker.js"), "export default {};");
  writeFileSync(path.join(pkg, "deployment.json"), JSON.stringify({ name: STAGING_WORKER, account_sha256: stagingAccountCommitment(account), main: "worker/worker.js", assets: { directory: "assets" },
    routes: [{ pattern: "hub-staging.pipelab.org", custom_domain: true }], vars: {}, compatibility_date: "2026-02-10", compatibility_flags: ["nodejs_compat"], workers_dev: false, preview_urls: false }));
  writeFileSync(path.join(root, "operator.pem"), pem(operator));
  writeFileSync(path.join(root, "intruder.pem"), pem(intruder));
  writeFileSync(path.join(root, "cases.json"), ledgerBytes);
  return { root, pkg, digest: packageDigest(pkg), out: path.join(root, "clearances") };
}

function sign_(w, extra = [], config = authority, readPassphrase = typed()) {
  return main(["--key", path.join(w.root, "operator.pem"), "--package-sha256", w.digest, "--ledger", path.join(w.root, "cases.json"), "--out", w.out, ...extra], { authority: config, log: () => {}, readPassphrase });
}

// Stands in for the GitHub contents API that CI reads with CASE_LEDGER_TOKEN.
function ledgerServer(w, ledger = () => readFileSync(path.join(w.root, "cases.json"))) {
  return { token: "synthetic", request: async url => {
    const file = new URL(url).pathname.split("/contents/")[1];
    const body = file === "cases.json" ? ledger() : existsSync(path.join(w.root, file)) ? readFileSync(path.join(w.root, file)) : null;
    return body ? { status: 200, headers: { "content-type": "application/vnd.github.raw+json" }, body } : { status: 404, headers: {}, body: Buffer.alloc(0) };
  } };
}

function ciPrepare(w, operation, { server = ledgerServer(w), adapter } = {}) {
  const calls = [];
  const real = createStagingAdapter({ account: account, closedVersion: closed, token: "synthetic", request: async () => assert.fail("network must not run") });
  adapter ??= { assertIngress: async () => calls.push("ingress"), emergencyClose: async () => calls.push("close"),
    upload: async () => { calls.push("upload"); return { version }; }, importSignedReceipt: (...args) => { calls.push("import"); return real.importSignedReceipt(...args); } };
  return { calls, run: () => prepareStagingVersion({ operation, directory: w.pkg, adapter, authorityConfig: authority,
    readCurrentLedgerRevision: createLedgerReader(authority, server), readClearance: createClearanceReader(authority, server) }) };
}

const receiptFor = w => ({ scope: "pipelab-hub-staging-upload/v1", account: account, worker: STAGING_WORKER, version,
  package_sha256: w.digest, worker_sha256: sha256(readFileSync(path.join(w.pkg, "worker/worker.js"))), version_script_etag: "fixture-etag" });

test("clearance payload is byte-identical to the CI verifier's payload", () => {
  const a = "a".repeat(64), b = "b".repeat(64);
  assert.ok(clearancePayload(a, b).equals(publicationClearancePayload(a, b)));
  assert.equal(JSON.parse(clearancePayload(a, b)).scope, CLEARANCE_SCOPE);
});

test("signed publish clearance passes CI's real ledger and clearance readers", async t => {
  const w = workspace(t), file = await sign_(w);
  assert.equal(file, path.join(w.out, w.digest + ".json"));
  assert.deepEqual(readdirSync(w.out), [w.digest + ".json"]);
  const record = JSON.parse(readFileSync(file));
  assert.equal(record.ledger_revision, sha256(ledgerBytes));
  assert.equal(record.upload_receipt, undefined);
  const ci = ciPrepare(w, "publish");
  await ci.run();
  assert.deepEqual(ci.calls, ["ingress", "close", "upload"]);
});

test("signed rollback receipt is accepted by the real staging adapter", async t => {
  const w = workspace(t);
  writeFileSync(path.join(w.root, "receipt.json"), JSON.stringify(receiptFor(w)));
  await sign_(w, ["--receipt", path.join(w.root, "receipt.json")]);
  const ci = ciPrepare(w, "rollback");
  const { receipt } = await ci.run();
  assert.equal(receipt.version, version);
  assert.deepEqual(ci.calls, ["ingress", "import"]);
});

test("fails closed: ledger changed after signing (stale clearance)", async t => {
  const w = workspace(t); await sign_(w);
  const changed = Buffer.from(JSON.stringify({ format: 1, scope: "hub-staging", cases: [{ id: "hold" }] }) + "\n");
  const ci = ciPrepare(w, "publish", { server: ledgerServer(w, () => changed) });
  await assert.rejects(ci.run(), /clearance ledger differs/);
  assert.deepEqual(ci.calls, []);
});

test("fails closed: clearance for one package cannot clear another", async t => {
  const w = workspace(t); await sign_(w);
  writeFileSync(path.join(w.pkg, "worker/worker.js"), "export default { changed: true };");
  const ci = ciPrepare(w, "publish");
  await assert.rejects(ci.run(), /ledger authority unavailable/);
  assert.deepEqual(ci.calls, []);
});

test("fails closed: a clearance signature is not a receipt signature", async t => {
  const w = workspace(t); await sign_(w);
  const record = JSON.parse(readFileSync(path.join(w.out, w.digest + ".json")));
  const adapter = createStagingAdapter({ account: account, closedVersion: closed, token: "synthetic", request: async () => assert.fail("network must not run") });
  assert.throws(() => adapter.importSignedReceipt(receiptFor(w), Buffer.from(record.clearance_signature_base64, "base64"), der(operator)), /untrusted upload receipt/);
});

test("fails closed: key that is not the configured staging key", async t => {
  const w = workspace(t);
  await assert.rejects(main(["--key", path.join(w.root, "intruder.pem"), "--package-sha256", w.digest, "--ledger", path.join(w.root, "cases.json"), "--out", w.out], { authority, log: () => {}, readPassphrase: typed() }), /does not match the configured/);
  const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
  assert.throws(() => signClearance({ privateKey: loadPrivateKey(pem(ec), Buffer.from(PASS)), publicKey: der(operator), packageSHA256: w.digest, ledgerBytes }), /Ed25519 clearance private key required/);
  await assert.rejects(sign_(w, [], { ...authority, clearance_public_key_der_base64: "" }), /not configured/);
  assert.equal(existsSync(w.out), false);
});

test("fails closed: line-ending-converted or malformed ledger", async t => {
  const w = workspace(t);
  writeFileSync(path.join(w.root, "cases.json"), ledgerBytes.toString().replace("\n", "\r\n"));
  await assert.rejects(sign_(w), /carriage returns/);
  for (const bad of ["", "not json", JSON.stringify({ format: 2, cases: [] }), JSON.stringify({ format: 1 })]) {
    writeFileSync(path.join(w.root, "cases.json"), bad);
    await assert.rejects(sign_(w), /ledger file/);
  }
  assert.equal(existsSync(w.out), false);
});

test("fails closed: receipts that CI would not bind to this package", async t => {
  const w = workspace(t), base = receiptFor(w);
  for (const [receipt, pattern] of [
    [{ ...base, package_sha256: "c".repeat(64) }, /different package/],
    [{ ...base, account: "f".repeat(32) }, /not a staging receipt/],
    [{ ...base, worker: "pipelab-org" }, /not a staging receipt/],
    [{ ...base, scope: CLEARANCE_SCOPE }, /not a staging receipt/],
    [{ ...base, version_script_etag: "" }, /not a staging receipt/],
    [{ ...base, version: [version] }, /not a staging receipt/],
    [{ ...base, package_sha256: [w.digest] }, /not a staging receipt/],
    [{ ...base, worker_sha256: [base.worker_sha256] }, /not a staging receipt/],
    [{ ...base, note: "extra" }, /fields differ/],
    [[base], /fields differ/],
  ]) {
    writeFileSync(path.join(w.root, "receipt.json"), JSON.stringify(receipt));
    await assert.rejects(sign_(w, ["--receipt", path.join(w.root, "receipt.json")]), pattern);
  }
  assert.equal(existsSync(w.out), false);
});

test("fails closed: incomplete or unknown arguments", async t => {
  const w = workspace(t);
  await assert.rejects(main([], { authority }), /usage/);
  await assert.rejects(sign_(w, ["--force"]), /usage/);
  await assert.rejects(sign_(w, ["--passphrase", PASS]), /usage/);
  await assert.rejects(main(["--key", "k", "--package-sha256", "A".repeat(64), "--ledger", "l", "--out", w.out], { authority }), /64 lowercase hex/);
  const result = (() => { try { execFileSync(process.execPath, ["scripts/hub/staging-clearance.mjs"], { stdio: "pipe" }); return null; } catch (error) { return error; } })();
  assert.equal(result?.status, 1);
  assert.match(result.stderr.toString(), /^clearance not written: usage/);
});

test("fails closed: blank option values cannot prompt or write a clearance", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "hub-clearance-arguments-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = path.join(root, "operator.pem"), ledger = path.join(root, "cases.json"), out = path.join(root, "clearances");
  writeFileSync(key, pem(operator));
  writeFileSync(ledger, ledgerBytes);
  const valid = {
    "--key": key,
    "--package-sha256": "a".repeat(64),
    "--ledger": ledger,
    "--out": out,
  };
  const context = { authority, environment: {}, readPassphrase: async () => assert.fail("invalid arguments must not prompt") };
  for (const blank of ["", " \t\n"]) {
    for (const overrides of [
      { "--receipt": blank },
      { "--out": blank },
      { "--ledger": blank },
      { "--package-sha256": blank },
      { "--key": blank },
      { "--key": undefined, "--key-credential": blank },
      { "--key": blank, "--key-credential": "fixture-credential" },
      { "--key-credential": blank },
    ]) {
      const args = Object.entries({ ...valid, ...overrides }).filter(([, value]) => value !== undefined).flat();
      await assert.rejects(main(args, context), /^Error: usage:/, JSON.stringify(overrides));
      assert.equal(existsSync(out), false);
    }
  }
});

test("fails closed: an existing record is never replaced, and is refused before the prompt", async t => {
  const w = workspace(t), file = path.join(w.out, w.digest + ".json");
  await sign_(w);
  const before = readFileSync(file);
  let prompted = false;
  writeFileSync(path.join(w.root, "receipt.json"), JSON.stringify(receiptFor(w)));
  for (const extra of [[], ["--receipt", path.join(w.root, "receipt.json")]]) {
    await assert.rejects(sign_(w, extra, authority, async () => { prompted = true; return Buffer.from(PASS); }), /already exists and is never replaced; to re-sign, first preserve the existing record and its rollback receipt/);
  }
  assert.equal(prompted, false);
  assert.ok(readFileSync(file).equals(before));
  // The stated remedy works: remove the file, then re-sign with the receipt.
  rmSync(file);
  await sign_(w, ["--receipt", path.join(w.root, "receipt.json")]);
  assert.deepEqual(readdirSync(w.out), [w.digest + ".json"]);
  assert.equal(JSON.parse(readFileSync(file)).upload_receipt.version, version);
});

test("fails closed: records written by anyone else during or after signing are never lost", async t => {
  const w = workspace(t), file = path.join(w.out, w.digest + ".json");
  const theirs = Buffer.from(JSON.stringify({ format: 1, package_sha256: w.digest, upload_receipt: receiptFor(w) }) + "\n");
  mkdirSync(w.out);
  // Created during the prompt: the signer refuses and keeps it.
  await assert.rejects(sign_(w, [], authority, async () => { writeFileSync(file, theirs); return Buffer.from(PASS); }), /appeared while signing; it was left unchanged; inspect and preserve it/);
  assert.ok(readFileSync(file).equals(theirs));
  // A writer holding the record open writes after a refused run: its bytes stay.
  const fd = openSync(file, "r+");
  try {
    await assert.rejects(sign_(w), /already exists/);
    writeSync(fd, theirs, 0, theirs.length, 0);
  } finally { closeSync(fd); }
  assert.ok(readFileSync(file).equals(theirs));
  assert.deepEqual(readdirSync(w.out), [w.digest + ".json"]);
});

test("the signer has no code path that replaces, moves or deletes files", () => {
  const source = readFileSync(new URL("../scripts/hub/staging-clearance.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(rename|unlink|rm|rmdir|link|copyFile|truncate|ftruncate|open)(Sync)?\(/);
  assert.deepEqual(source.match(/writeFileSync\([^)]*\)/g), ['writeFileSync(file, bytes, { flag: "wx", mode: 0o600 })']);
});

test("fails closed: unencrypted, wrong-passphrase or empty-passphrase keys never sign", async t => {
  const w = workspace(t);
  writeFileSync(path.join(w.root, "operator.pem"), plainPem(operator));
  let prompted = false;
  await assert.rejects(sign_(w, [], authority, async () => { prompted = true; return Buffer.from(PASS); }), /passphrase-encrypted PKCS#8 private key required/);
  assert.equal(prompted, false, "an unencrypted key is refused before any prompt");
  writeFileSync(path.join(w.root, "operator.pem"), pem(operator) + plainPem(intruder));
  await assert.rejects(sign_(w), /passphrase-encrypted PKCS#8 private key required/);
  writeFileSync(path.join(w.root, "operator.pem"), pem(operator));
  await assert.rejects(sign_(w, [], authority, typed("wrong " + PASS)), /wrong passphrase or unreadable private key/);
  await assert.rejects(sign_(w, [], authority, typed("")), /passphrase required/);
  await assert.rejects(sign_(w, [], authority, async () => PASS), /passphrase required/);
  assert.equal(existsSync(w.out), false);
});

test("the typed passphrase buffer is wiped after the key is loaded", async t => {
  const w = workspace(t), seen = [];
  await sign_(w, [], authority, async () => { const value = Buffer.from(PASS); seen.push(value); return value; });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].every(byte => byte === 0));
  await assert.rejects(sign_(w, ["--receipt", path.join(w.root, "missing.json")], authority, typed()), /upload receipt is not JSON/);
  seen.length = 0;
  rmSync(path.join(w.out, w.digest + ".json"));
  await assert.rejects(sign_(w, [], authority, async () => { const value = Buffer.from("wrong"); seen.push(value); return value; }), /wrong passphrase/);
  assert.ok(seen[0].every(byte => byte === 0));
});

test("a key produced by OpenSSL signs a record CI accepts", async t => {
  const probe = spawnSync("openssl", ["version"], { encoding: "utf8" });
  if (probe.status !== 0) return t.skip("openssl not available");
  const w = workspace(t), key = path.join(w.root, "openssl.pem");
  const pass = "file:" + path.join(w.root, "pass.txt");
  writeFileSync(path.join(w.root, "pass.txt"), PASS + "\n");
  execFileSync("openssl", ["genpkey", "-algorithm", "ed25519", "-aes-256-cbc", "-pass", pass, "-out", key], { stdio: "pipe" });
  const publicDER = execFileSync("openssl", ["pkey", "-in", key, "-passin", pass, "-pubout", "-outform", "DER"]);
  const config = { ...authority, clearance_public_key_der_base64: publicDER.toString("base64") };
  writeFileSync(path.join(w.root, "operator.pem"), readFileSync(key));
  await sign_(w, [], config);
  const server = ledgerServer(w), calls = [];
  await prepareStagingVersion({ operation: "publish", directory: w.pkg, authorityConfig: config,
    adapter: { assertIngress: async () => calls.push("ingress"), emergencyClose: async () => calls.push("close"), upload: async () => { calls.push("upload"); return { version }; } },
    readCurrentLedgerRevision: createLedgerReader(config, server), readClearance: createClearanceReader(config, server) });
  assert.deepEqual(calls, ["ingress", "close", "upload"]);
});

class FakeTerminal extends EventEmitter {
  constructor(isTTY = true) { super(); this.isTTY = isTTY; this.isRaw = false; this.modes = []; }
  setRawMode(mode) { this.isRaw = mode; this.modes.push(mode); }
  resume() {} pause() {}
}
const sink = () => { const output = { text: "", write: chunk => { output.text += chunk; } }; return output; };

test("hidden prompt reads one line without echo and restores the terminal", { timeout: 10000 }, async () => {
  const input = new FakeTerminal(), output = sink();
  const pending = promptPassphrase({ input, output });
  assert.equal(input.isRaw, true);
  input.emit("data", Buffer.from("pa"));
  input.emit("data", Buffer.from("sx\x7fs ä\x7fé\r"));
  const value = await pending;
  assert.equal(value.toString(), "pass é");
  assert.equal(output.text, "Clearance key passphrase: \n");
  assert.deepEqual(input.modes, [true, false]);
  assert.equal(input.listenerCount("data"), 0);
});

test("fails closed: hidden prompt refuses non-terminals and cancellation", { timeout: 10000 }, async () => {
  for (const input of [new FakeTerminal(false), { isTTY: true }, undefined]) {
    await assert.rejects(promptPassphrase({ input, output: sink() }), /interactive terminal/);
  }
  for (const key of ["\x03", "\x04", "\x1b"]) {
    const input = new FakeTerminal(), pending = promptPassphrase({ input, output: sink() });
    input.emit("data", Buffer.from("secret" + key));
    await assert.rejects(pending, /cancelled/);
    assert.deepEqual(input.modes, [true, false]);
  }
});

test("fails closed: the CLI refuses piped stdin and passphrase environment variables", { timeout: 40000 }, t => {
  const w = workspace(t), copy = path.join(w.root, "signer");
  mkdirSync(copy);
  for (const file of ["staging-clearance.mjs", "staging-target.mjs", "staging-account.mjs"]) copyFileSync(new URL("../scripts/hub/" + file, import.meta.url), path.join(copy, file));
  writeFileSync(path.join(copy, "staging-authority.json"), JSON.stringify(authority));
  const run = spawnSync(process.execPath, [path.join(copy, "staging-clearance.mjs"), "--key", path.join(w.root, "operator.pem"), "--package-sha256", w.digest, "--ledger", path.join(w.root, "cases.json"), "--out", w.out],
    { input: PASS + "\n", env: { ...process.env, PASSPHRASE: PASS, CLEARANCE_PASSPHRASE: PASS }, encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^clearance not written: passphrase needs an interactive terminal/);
  assert.ok(!run.stdout.includes(PASS) && !run.stderr.includes(PASS));
  assert.equal(existsSync(w.out), false);
});

function credentialDirectory(w, contents) {
  const directory = path.join(w.root, "credentials");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "hub-staging-clearance"), contents);
  return { CREDENTIALS_DIRECTORY: directory };
}
const viaCredential = (w, environment, extra = [], config = authority) => main(["--key-credential", "hub-staging-clearance", "--package-sha256", w.digest, "--ledger", path.join(w.root, "cases.json"), "--out", w.out, ...extra],
  { authority: config, log: () => {}, environment, readPassphrase: async () => assert.fail("credential mode must not prompt") });

test("credential mode signs without a prompt and CI accepts the publish and rollback records", async t => {
  const w = workspace(t), environment = credentialDirectory(w, plainPem(operator));
  await viaCredential(w, environment);
  const publish = ciPrepare(w, "publish");
  await publish.run();
  assert.deepEqual(publish.calls, ["ingress", "close", "upload"]);
  rmSync(path.join(w.out, w.digest + ".json"));
  const receiptFile = path.join(w.root, " receipt.json ");
  writeFileSync(receiptFile, JSON.stringify(receiptFor(w)));
  await viaCredential(w, environment, ["--receipt", receiptFile]);
  const rollback = ciPrepare(w, "rollback");
  assert.equal((await rollback.run()).receipt.version, version);
});

test("fails closed: credential mode needs systemd's credential directory and one exact key", async t => {
  const w = workspace(t), good = credentialDirectory(w, plainPem(operator));
  for (const [environment, pattern] of [
    [{}, /credential directory unavailable/],
    [{ CREDENTIALS_DIRECTORY: "credentials" }, /credential directory unavailable/],
    [{ CREDENTIALS_DIRECTORY: path.join(w.root, "missing") }, /credential hub-staging-clearance unavailable/],
  ]) await assert.rejects(viaCredential(w, environment), pattern);
  for (const name of ["../hub-staging-clearance", "Hub", "a/b", "", "-x"]) {
    await assert.rejects(main(["--key-credential", name, "--package-sha256", w.digest, "--ledger", path.join(w.root, "cases.json"), "--out", w.out], { authority, log: () => {}, environment: good }), /plain systemd credential name|usage/);
  }
  for (const [contents, pattern] of [
    [pem(operator), /not a single PKCS#8 private key/],
    [plainPem(operator) + plainPem(intruder), /not a single PKCS#8 private key/],
    ["-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----\n", /not a readable private key/],
    [plainPem(intruder), /does not match the configured/],
  ]) {
    const messages = [];
    await assert.rejects(viaCredential(w, credentialDirectory(w, contents)).catch(error => { messages.push(error.message); throw error; }), pattern);
    assert.ok(!messages[0].includes("PRIVATE KEY-----") && !messages[0].includes(plainPem(intruder).split("\n")[1]));
  }
  await assert.rejects(viaCredential(w, good, ["--key", path.join(w.root, "operator.pem")]), /usage/);
  await assert.rejects(main(["--package-sha256", w.digest, "--ledger", path.join(w.root, "cases.json"), "--out", w.out], { authority, environment: good }), /usage/);
  assert.equal(existsSync(w.out), false);
});
