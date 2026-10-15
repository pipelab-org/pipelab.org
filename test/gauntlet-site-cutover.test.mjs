import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function source(relative) {
  return readFile(path.join(repoRoot, relative), "utf8");
}

test("Gauntlet readers use the site evidence store and Pipelock workflow", async () => {
  const [script, layout, headers] = await Promise.all([
    source("themes/pipelab/assets/js/gauntlet-continuous.js"),
    source("themes/pipelab/layouts/gauntlet/results.html"),
    source("static/_headers"),
  ]);

  assert.match(script, /var RAW_BASE = "\/gauntlet\/evidence";/);
  assert.match(script, /api\.github\.com\/repos\/pipelab-org\/pipelock\/actions\/workflows\/continuous-gauntlet\.yaml/);
  assert.doesNotMatch(script, /raw\.githubusercontent\.com/);
  assert.match(layout, /luckyPipewrench\/pipelock\/actions\/workflows\/continuous-gauntlet\.yaml/);
  assert.doesNotMatch(layout, /agent-egress-bench\/actions\/workflows\/continuous-gauntlet\.yaml/);
  assert.match(headers, /\/gauntlet\/evidence\/latest-verified\.json\n  Cache-Control: public, max-age=60, must-revalidate/);
  assert.match(headers, /\/gauntlet\/evidence\/results\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /raw\.githubusercontent\.com/);
});

test("the retired benchmark path shape redirects to every inventoried site copy", async () => {
  const [redirects, inventoryText] = await Promise.all([
    source("static/_redirects"),
    source("static/gauntlet/evidence/inventory.json"),
  ]);
  assert.match(redirects, /^\/gauntlet-site\/\* \/gauntlet\/evidence\/:splat 301$/m);

  const inventory = JSON.parse(inventoryText);
  for (const entry of inventory.entries) {
    const legacyPath = `/${entry.source_path}`;
    const redirected = legacyPath.replace(/^\/gauntlet-site\//, "/gauntlet/evidence/");
    assert.equal(redirected, `/${entry.planned_destination.path.slice("static/".length)}`);
  }
});
