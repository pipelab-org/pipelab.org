import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as toml } from "smol-toml";
import { canonical, sha256 } from "./evidence.mjs";
import { prepareBoundCatalog, writeCatalog } from "./generate.mjs";
import { assertCatalogAssets } from "./catalog-assets.mjs";
import { assertPublication } from "./parity.mjs";
import { publicationIdentity } from "./deployment-evidence.mjs";
import { verifyRetrieval } from "./retrieval.mjs";
import { assertSourceProgress, materializeGitTree } from "./source-tree.mjs";
import { readGit } from "./git-source.mjs";
import { readSiteMain } from "./admission-producer.mjs";

const gitSHA = /^[a-f0-9]{40}$/;
const method = JSON.parse(readFileSync(new URL("./routes.json", import.meta.url)));

function child(command, args, options) {
  return execFileSync(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
}

function checkCheckout(root, expected) {
  if (!gitSHA.test(expected ?? "")) throw new Error("exact site candidate SHA required");
  const git = (...args) => readGit(root, args, { encoding: "utf8" }).trim();
  if (git("rev-parse", "HEAD") !== expected || git("status", "--porcelain=v1")) {
    throw new Error("site candidate must be an exact clean source checkout");
  }
  if (toml(readFileSync(path.join(root, "data/hub/launch.toml"), "utf8")).open !== false) {
    throw new Error("routine candidate must remain closed");
  }
}

function checkGenerated(root, catalog) {
  const generated = path.join(root, "data/hub/generated");
  if (canonical(readdirSync(generated).sort()) !== canonical(Object.keys(catalog).sort())) {
    throw new Error("generated Hub file set differs");
  }
  writeCatalog(generated, catalog, { check: true });
}

export function assertClosedDiscovery(directory) {
  const hubReference = /(?:\/hub|\/schemas\/pipelab-hub)(?=$|[/?#\s"'<>)]|\])/m;
  for (const relative of ["sitemap.xml", "_redirects", "index.xml", "llms.txt", "llms-full.txt",
      ".well-known/product-facts.json", "index.md"]) {
    if (hubReference.test(readFileSync(path.join(directory, relative), "utf8"))) {
      throw new Error("closed site exposes a Hub route in " + relative);
    }
  }
}

export async function routineAcceptance({ source, siteSHA, rulesSHA }, { readMain = readSiteMain } = {}) {
  const report = {
    mode: "routine",
    candidate: { site_sha: siteSHA, rules_sha: rulesSHA, tooling_identity: null },
    deployment: null,
    steps: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [
      String(i + 1), { status: i === 8 ? "not-in-mode" : "fail", evidence: i === 8 ? null : "Not executed." },
    ])),
    opening_eligible: false,
  };
  const pass = (step, evidence) => { report.steps[step] = { status: "pass", evidence }; };
  const temporary = mkdtempSync(path.join(tmpdir(), "hub-acceptance-"));
  let current = 1;
  try {
    const root = realpathSync(source.root);
    const verifierRoot = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
    if (root !== verifierRoot) throw new Error("run Hub acceptance from the candidate checkout");
    checkCheckout(root, siteSHA);
    if (!gitSHA.test(rulesSHA ?? "") || source.sourceBinding?.rulesSHA !== rulesSHA) {
      throw new Error("exact rules source binding required");
    }

    const { siteBase } = source.sourceBinding;
    const assertCurrentBase = () => {
      if (siteBase !== readMain()) throw new Error("site baseline differs from current site main");
    };
    assertCurrentBase();
    assertSourceProgress(root, null, siteBase, siteSHA);
    current = 2;
    const { catalog, assetRoot } = prepareBoundCatalog({ ...source, root, mode: "routine" }, temporary);
    const records = catalog["listings.json"], manifest = catalog["routes.json"], binding = catalog["source.json"];
    report.candidate.tooling_identity = binding.tooling_identity;
    pass(1, { manifest_sha256: sha256(canonical(manifest)), records: records.length });

    current = 2;
    pass(2, "Catalog generation verified the listings, assessments and current latency evidence.");

    current = 3;
    checkGenerated(root, catalog);
    const site = path.join(temporary, "site");
    mkdirSync(site);
    materializeGitTree(root, siteSHA, site);
    assertCatalogAssets(path.join(site, "assets"), assetRoot);
    pass(3, "Regenerated records and staged asset set match the candidate.");
    current = 4;
    // Build the committed site's configuration without ambient Hugo overrides.
    const buildEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^HUGO[_x]/i.test(key)));
    const build = name => {
      const directory = path.join(temporary, name);
      child("hugo", ["--gc", "--minify", "--cleanDestinationDir", "--destination", directory], { cwd: site, env: buildEnv });
      return directory;
    };
    const closed = build("closed");
    writeFileSync(path.join(site, "data/hub/launch.toml"), "open = true\n");
    const open = build("open");
    pass(4, "Clean closed and open-overlay Hugo builds completed.");

    current = 5;
    const options = {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: temporary, HUBCHECK_BIN: source.binary,
        HUBCHECK_ENGINE_DIR: path.dirname(path.dirname(source.config)),
        HUBCHECK_REPOSITORY: source.repository, HUBCHECK_RULES_REPOSITORY: source.sourceBinding.rulesRepository,
        HUB_RELEASE_BIN: source.pipelockBinary, HUB_VERIFY_RETRIEVAL: "0" },
    };
    const testOutput = child(process.execPath, ["--test", "--test-reporter=tap", "test/hub-core.test.mjs", "test/hub-harness.test.mjs",
      "test/hub-source-tree.test.mjs", "test/hub-contribution-preflight.test.mjs", "test/hub-admission-producer.test.mjs",
      "test/hub-policy-blobs.test.mjs", "test/hub-publication.test.mjs", "test/hub-catalog-assets.test.mjs", "test/hub-search.test.mjs"], options).toString("utf8");
    if (!/^# tests [1-9][0-9]*$/m.test(testOutput) || !/^# skipped 0$/m.test(testOutput)) {
      throw new Error("Hub fixture run is incomplete");
    }
    assertClosedDiscovery(closed);
    pass(5, "Hub fixtures and closed discovery checks passed.");

    current = 6;
    assertPublication({ directory: closed, manifest, records, open: false });
    const buildConfig = Buffer.from(canonical(Object.fromEntries(["hugo.toml", "wrangler.jsonc", "data/hub/launch.toml"]
      .map(name => [name, sha256(readFileSync(path.join(site, name)))]))));
    const buildInputs = { manifest, records, siteSHA, rulesSHA, buildConfig };
    const identity = publicationIdentity({ ...buildInputs, directory: open });
    writeFileSync(path.join(site, "assets/hub/build.json"), canonical(identity) + "\n");
    const checkEvidence = directory => {
      const actual = publicationIdentity({ ...buildInputs, directory, checkBuildFile: true });
      if (canonical(identity) !== canonical(actual)) throw new Error("Hub output set differs from the measured build");
    };
    const withEvidence = build("evidence");
    checkEvidence(withEvidence);
    pass(6, identity);

    current = 7;
    const retrieval = await verifyRetrieval({ directory: withEvidence, manifest, records, binary: source.pipelockBinary });
    pass(7, { version: retrieval.version, checked: retrieval.checks.length });

    current = 8;
    checkEvidence(build("repeated"));
    pass(8, { output_set_sha256: identity.output_set_sha256 });

    current = 10;
    for (const name of method.policies) {
      if (!manifest.entries.some(entry => entry.kind === "policy" && entry.route === "/hub/" + name + "/" && Object.keys(entry.facts).length)) {
        throw new Error("policy page is missing: " + name);
      }
    }
    assertCurrentBase();
    pass(10, "Required policy routes are present and the site baseline is still current.");
  } catch (error) {
    report.steps[current] = { status: "fail", evidence: error.message.split("\n", 1)[0] };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (process.argv.length !== 3) throw new Error("usage: acceptance.mjs ROUTINE_INPUT_JSON");
  const report = await routineAcceptance(JSON.parse(readFileSync(input)));
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report.steps).some(step => step.status === "fail")) process.exitCode = 1;
}
