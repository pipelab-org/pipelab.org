import { assertClearance } from "./deployment-evidence.mjs";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { stagingBuildAcceptance } from "./acceptance.mjs";
import { assertDeployConfig, createStagingAdapter, packageDigest, stagingPackageConfig, stagingWranglerConfig } from "./cloudflare-staging.mjs";
import { clearanceKey, createLedgerReader, createClearanceReader, assertClearanceLedger, protectedClosedVersion, protectedLedgerConfig } from "./staging-authority.mjs";
import { runStagingSession } from "./staging-session.mjs";
import { verifyStagingClosed, verifyStagingPublication } from "./staging-publication.mjs";
import { assertStagingTarget, WRANGLER_VERSION } from "./staging-target.mjs";
import { encryptStagingReceipt, receiptEncryptionKey } from "./staging-receipt.mjs";
import { stagingFailureLabel } from "./staging-diagnostics.mjs";
import { assertStagingConfig } from "./staging-config.mjs";
import { runPinnedWrangler } from "./staging-wrangler.mjs";
import { verifyProtectedEnvironment } from "./staging-environment.mjs";
import { canonical, sha256 } from "./evidence.mjs";


const root = path.resolve(import.meta.dirname, "../..");
const read = file => JSON.parse(readFileSync(file));
const write = (file, value) => writeFileSync(file, canonical(value) + "\n");
const authority = read(new URL("./staging-authority.json", import.meta.url));
const sha = /^[a-f0-9]{40}$/;

export { stagingFailureLabel } from "./staging-diagnostics.mjs";

export function assertBuildReport(report, stagingSHA) {
  if (report.mode !== "staging-build" || report.opening_eligible !== false || report.candidate?.site_sha !== stagingSHA ||
      report.staging?.staging_sha !== stagingSHA || Array.from({ length: 10 }, (_, index) => index + 1).filter(step => step !== 9).some(step => report.steps?.[step]?.status !== "pass") ||
      report.steps?.[9]?.status !== "fail") throw new Error("staging build acceptance incomplete");
}

export function stagingBuildEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !/TOKEN|SECRET|CLIENT_ID|API_KEY|PASSWORD|KEY_ID|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?|PASSWD|APIKEY|NODE_OPTIONS|CLOUDFLARE_ACCOUNT_ID|HUB_STAGING_/i.test(key)));
}

export async function prepareStagingVersion({ operation, directory, adapter, authorityConfig = authority,
  readCurrentLedgerRevision = createLedgerReader(authorityConfig), readClearance = createClearanceReader(authorityConfig) }) {
  const publicKey = clearanceKey(authorityConfig), artifactSHA256 = packageDigest(directory);
  const material = await readClearance(artifactSHA256), ledgerRevision = await readCurrentLedgerRevision();
  assertClearanceLedger(material, ledgerRevision);
  assertClearance({ artifactSHA256, ledgerRevision, signature: material.signature, publicKey });
  await adapter.assertIngress();
  let receipt;
  if (operation === "rollback") {
    receipt = material.receipt;
    adapter.importSignedReceipt(receipt, material.receiptSignature, publicKey);
    if (receipt.package_sha256 !== artifactSHA256 || receipt.worker_sha256 !== sha256(readFileSync(path.join(directory, "worker/worker.js")))) throw new Error("rollback receipt package differs");
  } else {
    await adapter.emergencyClose();
    receipt = await adapter.upload(directory);
  }
  return { receipt, publicKey, signature: material.signature };
}

async function build(destination) {
  assertStagingConfig();
  const config = stagingPackageConfig();
  const { CANDIDATE_SHA: siteSHA, BASE_SHA: baseSHA, GITHUB_SHA: mainSHA, RUNNER_TEMP: scratch } = process.env;
  if (![siteSHA, baseSHA, mainSHA].every(value => sha.test(value ?? ""))) throw new Error("exact source SHAs required");
  const candidate = path.join(root, "candidate");
  const engine = read(path.join(scratch, "hub-build/engine.json"));
  const rules = path.join(scratch, "staging-rules.git");
  execFileSync("git", ["init", "--bare", "--quiet", rules]);
  const source = read(path.join(candidate, "data/hub/generated/source.json"));
  if (!sha.test(source.rules_sha ?? "")) throw new Error("committed Rules source required");
  execFileSync("git", ["-C", rules, "fetch", "--no-tags", "https://github.com/pipelab-org/pipelock-rules", "+refs/heads/main:refs/remotes/origin/main", source.rules_sha], { stdio: "ignore" });
  const rulesMain = execFileSync("git", ["-C", rules, "rev-parse", "refs/remotes/origin/main"], { encoding: "utf8" }).trim();
  mkdirSync(destination, { recursive: true });
  const evidence = path.join(destination, "evidence"), pkg = path.join(destination, "package");
  mkdirSync(evidence); mkdirSync(pkg);
  const report = await stagingBuildAcceptance({ siteSHA, rulesSHA: source.rules_sha,
    staging: { baseSHA, productionBaseSHA: mainSHA },
    source: { root: candidate, binary: engine.binary, engine: engine.identity, config: engine.destination + "/configs/claude-code.yaml",
      repository: scratch + "/hub-build/engine.git", pipelockBinary: scratch + "/hub-build/bin/pipelock", rulesFixtureRepository: scratch + "/hub-build/fixtures.git",
      sourceBinding: { siteBase: mainSHA, siteRepository: candidate, rulesRepository: rules, rulesSHA: source.rules_sha, rulesMain } },
  }, { onBuilt: ({ directory, manifest, records, identity }) => {
    cpSync(directory, path.join(pkg, "assets"), { recursive: true });
    for (const [name, value] of Object.entries({ manifest, records, identity })) write(path.join(evidence, name + ".json"), value);
  } });
  assertBuildReport(report, siteSHA);
  write(path.join(evidence, "build-report.json"), report);
  write(path.join(pkg, "deployment.json"), config);
  const bundle = mkdtempSync(path.join(tmpdir(), "hub-bundle-"));
  try {
    cpSync(path.join(candidate, "src"), path.join(bundle, "src"), { recursive: true });
    mkdirSync(path.join(bundle, "scripts/hub"), { recursive: true });
    cpSync(path.join(candidate, "scripts/hub/staging-target.mjs"), path.join(bundle, "scripts/hub/staging-target.mjs"));
    symlinkSync(path.join(root, "node_modules"), path.join(bundle, "node_modules"), "dir");
    const bundlerConfig = { ...stagingWranglerConfig(config, pkg), main: path.join(bundle, "src/worker.js") };
    write(path.join(bundle, "wrangler.json"), bundlerConfig);
    const env = stagingBuildEnvironment(process.env);
    await runPinnedWrangler(WRANGLER_VERSION, ["versions", "upload", "--dry-run", "--config", path.join(bundle, "wrangler.json"), "--outdir", path.join(pkg, "worker")], { cwd: root, env });
  } finally { rmSync(bundle, { recursive: true, force: true }); }
  write(path.join(evidence, "package.json"), { package_sha256: packageDigest(pkg), candidate_sha: siteSHA });
}

export async function deployStaging(destination, operation, { adapterFactory = createStagingAdapter, authorityConfig = authority,
  environment = process.env, ledgerOptions } = {}) {
  if (!["publish", "rollback", "close"].includes(operation)) throw new Error("invalid staging operation");
  const account = environment.CLOUDFLARE_ACCOUNT_ID;
  assertStagingTarget(account);
  const closedVersion = protectedClosedVersion(authorityConfig, environment);
  const pkg = path.join(destination, "package"), evidence = path.join(destination, "evidence");
  let manifest, records, identity, buildReport, ledgerConfig, output, encryptionKey;
  // Read closure evidence inside the callback, after closed activation. Missing
  // or malformed evidence must never prevent the independent close attempt.
  const closed = () => verifyStagingClosed({ manifest: manifest ?? read(path.join(evidence, "manifest.json")) });
  if (operation !== "close") {
    buildReport = read(path.join(evidence, "build-report.json"));
    if (typeof environment.CANDIDATE_SHA !== "string" || !sha.test(environment.CANDIDATE_SHA)) throw new Error("exact source SHAs required");
    assertBuildReport(buildReport, environment.CANDIDATE_SHA);
    if (packageDigest(pkg) !== read(path.join(evidence, "package.json")).package_sha256) throw new Error("staging package digest differs");
    assertDeployConfig(read(path.join(pkg, "deployment.json")), account);
    manifest = read(path.join(evidence, "manifest.json")); records = read(path.join(evidence, "records.json")); identity = read(path.join(evidence, "identity.json"));
    ledgerConfig = protectedLedgerConfig(authorityConfig, environment);
    if (operation === "publish") encryptionKey = receiptEncryptionKey(authorityConfig);
    if (!environment.RUNNER_TEMP || !path.isAbsolute(environment.RUNNER_TEMP)) throw new Error("staging output directory unavailable");
    output = path.join(environment.RUNNER_TEMP, "hub-staging-publication");
    // Never publish any output supplied by the prepared archive or a previous attempt.
    mkdirSync(output, { mode: 0o700 });
  }
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    const adapter = adapterFactory({ packageDirectory: pkg, account, closedVersion, token: environment.CLOUDFLARE_API_TOKEN, signal: abort.signal,
      verifyLiveClosed: closed, verifyLiveVersion: async () => {
        await adapter.assertIngress();
        await verifyStagingPublication({ directory: path.join(pkg, "assets"), manifest, records, identity, binary: environment.HUB_RELEASE_BIN });
      } });
    if (operation === "close") return await adapter.emergencyClose();
    const options = { token: environment.CASE_LEDGER_TOKEN ?? "", ...ledgerOptions };
    const readCurrentLedgerRevision = createLedgerReader(ledgerConfig, options);
    const readClearance = createClearanceReader(ledgerConfig, options);
    const { receipt, publicKey, signature } = await prepareStagingVersion({ operation, directory: pkg, adapter, authorityConfig: ledgerConfig, readCurrentLedgerRevision, readClearance });
    if (operation === "publish") {
      writeFileSync(path.join(output, "upload-receipt.jwe"), encryptStagingReceipt(receipt, encryptionKey) + "\n", { flag: "wx", mode: 0o600 });
    }
    const result = await runStagingSession({ version: receipt.version, publicKey, signature }, { adapter, readCurrentLedgerRevision, signal: abort.signal });
    write(path.join(output, "acceptance.json"), { mode: "staging", opening_eligible: false,
      candidate_sha: environment.CANDIDATE_SHA, package_sha256: result.artifact_sha256 });
  } finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [operation, destination] = process.argv.slice(2);
  try {
    if (operation === "refuse-direct-deploy") throw new Error("direct staging deploy is disabled");
    if (!destination || !["build", "publish", "rollback", "close", "check-target", "check-wrangler", "check-environment"].includes(operation)) throw new Error("usage: staging-workflow.mjs build|publish|rollback|close|check-target DIRECTORY");
    if (operation === "check-wrangler") {
      const version = (await runPinnedWrangler(WRANGLER_VERSION, ["--version"], { cwd: root })).trim();
      if (version !== WRANGLER_VERSION) throw new Error("unexpected Wrangler version");
    } else if (operation === "check-environment") await verifyProtectedEnvironment();
    else if (operation === "check-target") {
      assertStagingTarget(process.env.CLOUDFLARE_ACCOUNT_ID);
      protectedClosedVersion(authority, process.env);
    }
    else if (operation === "build") await build(path.resolve(destination));
    else await deployStaging(path.resolve(destination), operation);
  } catch (error) {
    // Report only fixed control labels, never candidate or remote diagnostics.
    console.error("Staging control refused: " + stagingFailureLabel(error));
    process.exitCode = 1;
  }
}
