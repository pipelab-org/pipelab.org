import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  const cwd = candidate;
  const maxBuffer = 16 * 1024 * 1024;
  await run("npm", ["ci", "--ignore-scripts"], { cwd, maxBuffer });
  await run("bash", ["scripts/install-pipelock-verifier.sh"], { cwd, maxBuffer });
  await run("make", ["preflight"], { cwd, maxBuffer });
  await run("make", ["hub-acceptance", "HUB_ACCEPTANCE_INPUT=" + input], { cwd, maxBuffer });
}

// Only the read-only build job can prepare a delivery. Routine acceptance
// must pass while the Rules objects and the exact site base are still bound.
export async function prepareSyncImport({ source, output }, environment = process.env) {
  const { root, engine } = source;
  const identify = () => admissionProducer({ mode: "sync", environment, root, engine });
  const producer = identify();
  const rulesMain = readRulesMain();
  const destination = path.resolve(output);
  const staged = mkdtempSync(path.join(path.dirname(destination), ".hub-sync-"));
  let scratch;
  try {
    scratch = mkdtempSync(path.join(tmpdir(), "hub-rules-import-"));
    const rulesRepository = acquireRulesObjects(scratch, { base: rulesMain, head: rulesMain });
    const rulesPolicy = checkRulesWorkflowPolicy(rulesRepository, rulesMain);
    const site = path.join(scratch, "site");
    mkdirSync(site);
    materializeGitTree(root, producer.sha, site);
    const { catalog, assetRoot } = prepareBoundCatalog({
      ...source, root: site, mode: "routine",
      sourceBinding: { siteBase: producer.sha, siteRepository: root, rulesRepository, rulesMain, rulesSHA: rulesMain },
    }, scratch);
    writeCatalog(path.join(staged, "data/hub/generated"), catalog);
    cpSync(assetRoot, path.join(staged, "assets"), { recursive: true });

    const manifest = {
      format: 1, producer, rules_sha: rulesMain, rules_policy: rulesPolicy,
      files: fileInventory(staged),
    };
    writeFileSync(path.join(staged, "hub-sync-manifest.json"), jsonBytes(manifest), { flag: "wx" });
    const verifier = fileURLToPath(new URL("./verify-sync-import.py", import.meta.url));
    execFileSync("python3", ["-I", verifier, staged, producer.sha, rulesMain], { stdio: "pipe" });
    await verifyRoutineImport({ source, producer, rulesRepository, rulesMain, scratch, staged });
    if (readRulesMain() !== rulesMain) throw new Error("Rules main moved during the import");
    identify();
    // The destination is a new delivery directory, supplied by the build job.
    mkdirSync(destination);
    try {
      renameSync(staged, destination);
    } catch (error) {
      rmdirSync(destination);
      throw error;
    }
    return manifest;
  } finally {
    rmSync(staged, { recursive: true, force: true });
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("usage: sync-import.mjs INPUT_JSON");
  const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const root = path.resolve(import.meta.dirname, "../..");
  try {
    const { rules_sha, files } = await prepareSyncImport({ ...input, source: { ...input.source, root } });
    console.log(JSON.stringify({ rules_sha, files: files.length }));
  } catch {
    console.error("Hub import could not prepare a source-bound candidate.");
    process.exitCode = 1;
  }
}
