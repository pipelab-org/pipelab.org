import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HubCheckFailure, HubUnavailable } from "./check-failure.mjs";
import { admissionProducer } from "./admission-producer.mjs";
import { jsonBytes, sha256 } from "./evidence.mjs";
import { prepareBoundCatalog, writeCatalog } from "./generate.mjs";
import { acquireRulesObjects, readRulesMain } from "./rules-acquisition.mjs";
import { checkRulesWorkflowPolicy } from "./rules-workflow-policy.mjs";
import { materializeGitTree } from "./source-tree.mjs";
import { execFile as runProcess } from "node:child_process";
import { promisify } from "node:util";

function fileInventory(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return fileInventory(target, name + "/");
    if (!entry.isFile()) throw new Error("sync output must contain regular files");
    const bytes = readFileSync(target);
    return [{ path: name, size: bytes.length, sha256: sha256(bytes) }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

const run = promisify(runProcess);
const outputPaths = ["data/hub/generated", "assets/hub/community", "assets/hub/configs"];

async function verifyRoutineImport({ source, producer, rulesRepository, rulesMain, scratch, staged }) {
  const candidate = path.join(scratch, "candidate");
  await run("git", ["clone", "--quiet", "--shared", "--no-checkout", "--", source.root, candidate]);
  const git = (...args) => run("git", ["-C", candidate, ...args]);
  await git("checkout", "--quiet", "--detach", producer.sha);
  for (const relative of outputPaths) {
    const target = path.join(candidate, relative);
    const input = path.join(staged, relative);
    rmSync(target, { recursive: true, force: true });
    if (statSync(input, { throwIfNoEntry: false })) {
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(input, target, { recursive: true });
    }
  }
  await git("add", "--all");
  await git("-c", "user.name=Hub import", "-c", "user.email=hub-import@example.invalid",
    "commit", "--quiet", "--allow-empty", "-m", "Prepare Hub import candidate");
  const { stdout } = await git("rev-parse", "HEAD");
  const siteSHA = stdout.trim();
  const input = path.join(scratch, "acceptance-input.json");
  writeFileSync(input, jsonBytes({
    siteSHA, rulesSHA: rulesMain,
    source: {
      ...source, root: candidate,
      sourceBinding: { siteBase: producer.sha, rulesRepository, rulesMain, rulesSHA: rulesMain },
    },
  }));
  // Candidate checks run independently of the outer workflow's Rules reads.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    key !== "HUB_RULES_PUBLIC_API" && !key.startsWith("GITHUB_")));
  const options = { cwd: candidate, maxBuffer: 16 * 1024 * 1024, env };
  const checks = [
    ["install candidate dependencies", "npm", ["ci", "--ignore-scripts"]],
    ["install the Pipelock verifier", "bash", ["scripts/install-pipelock-verifier.sh"]],
    ["pass site preflight", "make", ["preflight"]],
  ];
  for (const [check, command, args] of checks) {
    try {
      await run(command, args, options);
    } catch (cause) {
      throw new HubCheckFailure("could not " + check, { cause });
    }
  }
  try {
    await run("make", ["--silent", "hub-acceptance", "HUB_ACCEPTANCE_INPUT=" + input], options);
  } catch (cause) {
    let step;
    try {
      const { steps } = JSON.parse(cause.stdout);
      step = Object.keys(steps).find(key => /^(?:[1-9]|10)$/.test(key) && steps[key].status === "fail");
    } catch {
      // A failure before the acceptance report has no step number.
    }
    const reason = step ? "routine Hub acceptance failed at step " + step : "routine Hub acceptance did not pass";
    throw new HubCheckFailure(reason, { cause });
  }
  const { stdout: tree } = await git("rev-parse", "HEAD^{tree}");
  return tree.trim();
}

// Only the read-only build job can prepare a delivery. Routine acceptance
// must pass while the Rules objects and the exact site base are still bound.
export async function prepareSyncImport({ source, output }, environment = process.env) {
  const { root, engine } = source;
  const identify = () => admissionProducer({ mode: "sync", environment, root, engine });
  let check = "identify the import producer";
  let scratch, staged;
  try {
    const producer = identify();
    check = "read current Rules main";
    const rulesMain = readRulesMain();
    check = "prepare the import workspace";
    const destination = path.resolve(output);
    staged = mkdtempSync(path.join(path.dirname(destination), ".hub-sync-"));
    scratch = mkdtempSync(path.join(tmpdir(), "hub-rules-import-"));
    check = "acquire the exact Rules main objects";
    const rulesRepository = acquireRulesObjects(scratch, { base: rulesMain, head: rulesMain });
    check = "verify the Rules workflow policy";
    const rulesPolicy = checkRulesWorkflowPolicy(rulesRepository, rulesMain);
    check = "generate the catalog from the committed snapshots";
    const site = path.join(scratch, "site");
    mkdirSync(site);
    materializeGitTree(root, producer.sha, site);
    const { catalog, assetRoot } = prepareBoundCatalog({
      ...source, root: site, mode: "routine",
      sourceBinding: { siteBase: producer.sha, siteRepository: root, rulesRepository, rulesMain, rulesSHA: rulesMain },
    }, scratch);
    writeCatalog(path.join(staged, "data/hub/generated"), catalog);
    cpSync(assetRoot, path.join(staged, "assets"), { recursive: true });

    check = "prepare and validate the routine acceptance candidate";
    const siteTree = await verifyRoutineImport({ source, producer, rulesRepository, rulesMain, scratch, staged });
    const manifest = {
      format: 1, producer, site_tree: siteTree, rules_sha: rulesMain, rules_policy: rulesPolicy,
      files: fileInventory(staged),
    };
    writeFileSync(path.join(staged, "hub-sync-manifest.json"), jsonBytes(manifest), { flag: "wx" });
    check = "verify the import file manifest";
    const verifier = fileURLToPath(new URL("./verify-sync-import.py", import.meta.url));
    execFileSync("python3", ["-I", verifier, staged, producer.sha, rulesMain], { stdio: "pipe" });
    check = "recheck current Rules main";
    if (readRulesMain() !== rulesMain) throw new HubCheckFailure("Rules main moved during the import");
    check = "recheck the import producer";
    identify();
    check = "publish the verified local delivery";
    // The destination is a new delivery directory, supplied by the build job.
    mkdirSync(destination);
    try {
      renameSync(staged, destination);
    } catch (error) {
      rmdirSync(destination);
      throw error;
    }
    return manifest;
  } catch (cause) {
    if (cause instanceof HubCheckFailure) throw cause;
    throw new HubCheckFailure("could not " + check, { cause });
  } finally {
    if (staged) rmSync(staged, { recursive: true, force: true });
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("usage: sync-import.mjs INPUT_JSON");
  try {
    const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const root = path.resolve(import.meta.dirname, "../..");
    const { rules_sha, files } = await prepareSyncImport({ ...input, source: { ...input.source, root } });
    console.log(JSON.stringify({ rules_sha, files: files.length }));
  } catch (error) {
    const reason = error instanceof HubCheckFailure ? error.message : "could not read or finish the import input";
    const unavailable = error instanceof HubUnavailable;
    console.error(unavailable ? "Hub import unavailable: " + reason + ". Retry the check." : "Hub import refused: " + reason);
    process.exitCode = unavailable ? 3 : 1;
  }
}
