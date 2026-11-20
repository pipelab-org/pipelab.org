import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { admissionProducer } from "./admission-producer.mjs";
import { jsonBytes, sha256 } from "./evidence.mjs";
import { prepareBoundCatalog, writeCatalog } from "./generate.mjs";
import { acquireRulesObjects, readRulesMain } from "./rules-acquisition.mjs";
import { checkRulesWorkflowPolicy } from "./rules-workflow-policy.mjs";
import { materializeGitTree } from "./source-tree.mjs";

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

// Produce files for the read-only build job. The caller runs routine acceptance
// against these files before they can be handed to any write-capable job.
export function prepareSyncImport({ source, output }, environment = process.env) {
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
    const { rules_sha, files } = prepareSyncImport({ ...input, source: { ...input.source, root } });
    console.log(JSON.stringify({ rules_sha, files: files.length }));
  } catch {
    console.error("Hub import could not prepare a source-bound candidate.");
    process.exitCode = 1;
  }
}
