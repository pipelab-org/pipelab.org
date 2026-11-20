import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as toml } from "smol-toml";
import { assertClosedDiscovery } from "./acceptance.mjs";
import { preflightPullRequest } from "./contribution-preflight.mjs";
import { canonical, sha256 } from "./evidence.mjs";
import { prepareCandidateCatalog, writeCatalog } from "./generate.mjs";
import { readGit } from "./git-source.mjs";
import { assertPublication } from "./parity.mjs";
import { materializeGitTree } from "./source-tree.mjs";

export function rehearseCandidate({ number, base, head, siteBase, rulesFixtureRepository, source }) {
  const { root } = source;
  if (readGit(root, ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== siteBase) {
    throw new Error("rehearsal requires the exact site base checkout");
  }

  return preflightPullRequest({ number, base, head, fetchRules: true, site: root }, undefined,
    ({ loaded, repository }) => {
      const scratch = mkdtempSync(path.join(tmpdir(), "hub-candidate-"));
      try {
        const prepared = prepareCandidateCatalog(source, loaded, {
          siteBase, rulesSHA: head, rulesRepository: rulesFixtureRepository, candidateRepository: repository,
        }, scratch);
        const site = path.join(scratch, "site");
        mkdirSync(site);
        materializeGitTree(root, siteBase, site);

        const launch = path.join(site, "data/hub/launch.toml");
        if (toml(readFileSync(launch, "utf8")).open !== false) {
          throw new Error("rehearsal requires a closed site baseline");
        }

        const { catalog, assetRoot } = prepared;
        const generated = path.join(site, "data/hub/generated");
        rmSync(generated, { recursive: true, force: true });
        writeCatalog(generated, catalog);
        for (const name of ["community", "configs"]) {
          const relative = path.join("hub", name);
          const destination = path.join(site, "assets", relative);
          rmSync(destination, { recursive: true, force: true });
          const assets = path.join(assetRoot, relative);
          if (existsSync(assets)) cpSync(assets, destination, { recursive: true });
        }

        const manifest = catalog["routes.json"], records = catalog["listings.json"];
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^HUGO[_x]/i.test(key)));
        const build = (name, open) => {
          const directory = path.join(scratch, name);
          execFileSync("hugo", ["--gc", "--minify", "--destination", directory], {
            cwd: site, env, stdio: ["ignore", "pipe", "pipe"],
          });
          assertPublication({ directory, manifest, records, open, requireBuild: false });
          return directory;
        };
        assertClosedDiscovery(build("closed", false));
        writeFileSync(launch, "open = true\n");
        build("preview", true);
        return {
          site_sha: siteBase,
          tooling_identity: catalog["source.json"].tooling_identity,
          manifest_sha256: sha256(canonical(manifest)),
          listings: records.length,
          routes: manifest.entries.length,
        };
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("usage: candidate-rehearsal.mjs INPUT_JSON");
  const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const root = path.resolve(import.meta.dirname, "../..");
  const report = rehearseCandidate({ ...input, source: { ...input.source, root } });
  console.log(JSON.stringify({ ...report, mode: "local-candidate-rehearsal" }, null, 2));
  if (report.verdict === "UNAVAILABLE") process.exitCode = 3;
  else if (report.verdict !== "LOCAL-ELIGIBLE") process.exitCode = 1;
}
