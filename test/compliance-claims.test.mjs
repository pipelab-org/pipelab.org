import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { checkMappingRows, checkProofFrameworkLinks } from "../scripts/compliance-claims.mjs";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/assess-compliance-v3.7.1.json", import.meta.url)));
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const routes = snapshot.frameworks.map(({ page }) => page.replace(/^content/, "").replace(/\.md$/, "/"));

for (const framework of snapshot.frameworks) {
  test(`${framework.page} uses shipped control IDs and statuses`, () => {
    assert.match(framework.source_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(checkMappingRows(source(framework.page), framework), []);
    assert.ok(source(framework.page).includes(`/blob/${snapshot.source_ref}/${framework.source_path}`));
  });
}

test("mapping checks reject invented IDs, overstated status, omitted and duplicated rows", () => {
  const framework = { controls: [{ id: "ASI10", status: "Not covered" }] };
  const table = "| ID | Status |\n|---|---|\n| ASI10 | Not covered |";
  assert.deepEqual(checkMappingRows(table, framework), []);
  for (const invalid of [table.replaceAll("ASI10", "ASI11"), table.replace("Not covered", "Covered"), table.split("\n").slice(0, 2).join("\n"), `${table}\n| ASI10 | Not covered |`]) {
    assert.ok(checkMappingRows(invalid, framework).length > 0, invalid);
  }
});

test("proof chips link to each existing shipped framework guide", () => {
  const proof = source("themes/pipelab/layouts/proof/single.html");
  assert.deepEqual(checkProofFrameworkLinks(proof, routes), []);
  for (const { page } of snapshot.frameworks) assert.ok(existsSync(new URL(`../${page}`, import.meta.url)), page);
});

test("proof chip checks reject missing links and wrong destinations", () => {
  const chip = '<a class="proof-chip" role="listitem" href="/learn/mitre-atlas/">MITRE ATLAS</a>';
  assert.deepEqual(checkProofFrameworkLinks(chip, ["/learn/mitre-atlas/"]), []);
  for (const invalid of [chip.replace('href="/learn/mitre-atlas/"', 'href="/learn/missing/"'), '<span class="proof-chip" role="listitem">MITRE ATLAS</span>']) {
    assert.ok(checkProofFrameworkLinks(invalid, ["/learn/mitre-atlas/"]).length > 0);
  }
});
