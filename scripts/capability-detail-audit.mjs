import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseCapabilityFamilyMap } from "./capability-families.mjs";
import { verifyRobotsPolicy } from "./html-robots.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const families = parseCapabilityFamilyMap(
  readFileSync(path.join(root, "data/pipelock_capability_families.json"), "utf8"),
).families;
const hugo = process.env.HUGO_BIN || "hugo";
const HUGO_BUILD_TIMEOUT_MS = 120_000;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inventoryDraft = /^draft: true$/m.test(
  readFileSync(path.join(root, "content/capabilities.md"), "utf8"),
);

function buildSite(destination, buildDrafts) {
  const args = ["--gc", "--minify"];
  if (buildDrafts) args.push("--buildDrafts");
  args.push("--destination", destination);
  const build = spawnSync(hugo, args, {
    cwd: root,
    stdio: "inherit",
    timeout: HUGO_BUILD_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  if (build.error?.code === "ETIMEDOUT") {
    throw new Error(`${buildDrafts ? "draft" : "production"} capability build exceeded 120 seconds`);
  }
  if (build.error) throw build.error;
  if (build.status !== 0) {
    throw new Error(`${buildDrafts ? "draft" : "production"} capability build failed with status ${build.status}`);
  }
}

function verifyCapabilityPages(destination, expectNoIndex) {
  const inventory = readFileSync(path.join(destination, "capabilities", "index.html"), "utf8");
  verifyRobotsPolicy(inventory, expectNoIndex, "capability inventory");
  const home = readFileSync(path.join(destination, "index.html"), "utf8");
  if (!/href=(?:"\/capabilities\/"|\/capabilities\/(?=[\s>]))[^>]*>\s*<span[^>]*>Capabilities<\/span>/.test(home)) {
    throw new Error("Learn navigation does not link to the capability inventory");
  }
  let checked = 0;
  for (const family of families) {
    for (const capabilityId of family.capabilities) {
      const destinationPath = `/capabilities/${capabilityId}/`;
      const destinationPattern = new RegExp(`href=(?:"${escapeRegExp(destinationPath)}"|${escapeRegExp(destinationPath)}(?=[\\s>]))`);
      if (!destinationPattern.test(inventory)) {
        throw new Error(`capability inventory does not render link ${destinationPath}`);
      }
      const pagePath = path.join(destination, "capabilities", capabilityId, "index.html");
      const page = readFileSync(pagePath, "utf8");
      verifyRobotsPolicy(page, expectNoIndex, destinationPath);
      if (!page.includes(`>${capabilityId}</code>`)) {
        throw new Error(`${destinationPath} does not render capability ${capabilityId}`);
      }
      for (const section of ["operator-surface", "availability", "implementation", "references"]) {
        if (!new RegExp(`id=(?:"${section}"|${section}(?:\\s|>))`).test(page)) {
          throw new Error(`${destinationPath} does not render the ${section} documentation section`);
        }
      }
      if (!/class=(?:"capdoc-nav"|capdoc-nav(?:\s|>))/.test(page)) {
        throw new Error(`${destinationPath} does not render the documentation navigation`);
      }
      checked += 1;
    }
  }
  return checked;
}

function verifyProductionState(destination) {
  const inventoryPath = path.join(destination, "capabilities", "index.html");
  if (!inventoryDraft) return verifyCapabilityPages(destination, false);
  if (existsSync(inventoryPath)) throw new Error("draft capability inventory leaked into the production build");
  const home = readFileSync(path.join(destination, "index.html"), "utf8");
  if (/href=(?:"\/capabilities\/"|\/capabilities\/(?=[\s>]))/.test(home)) {
    throw new Error("draft capability navigation leaked into the production build");
  }
  for (const family of families) {
    for (const capabilityId of family.capabilities) {
      const pagePath = path.join(destination, "capabilities", capabilityId, "index.html");
      if (existsSync(pagePath)) throw new Error(`draft capability ${capabilityId} leaked into the production build`);
    }
  }
  return 0;
}

const draftDestination = mkdtempSync(path.join(tmpdir(), "pipelab-capability-details-draft-"));
const productionDestination = mkdtempSync(path.join(tmpdir(), "pipelab-capability-details-production-"));

try {
  buildSite(draftDestination, true);
  const draftChecked = verifyCapabilityPages(draftDestination, inventoryDraft);
  buildSite(productionDestination, false);
  const productionChecked = verifyProductionState(productionDestination);
  process.stdout.write(
    `verified ${draftChecked} draft capability routes and ${productionChecked || "zero leaked"} production routes\n`,
  );
} finally {
  rmSync(draftDestination, { recursive: true, force: true });
  rmSync(productionDestination, { recursive: true, force: true });
}
