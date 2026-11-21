import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertCatalogAssets, stageCatalogAssets } from "../scripts/hub/catalog-assets.mjs";
import { sha256 } from "../scripts/hub/evidence.mjs";
import { prepareBoundCatalog } from "../scripts/hub/generate.mjs";

const community = "/hub/community/example/active-bundle/bundle.yaml";
const retained = "/hub/community/example/removed-bundle/bundle.yaml";
const config = "/hub/configs/example-config/pipelock.yaml";
const license = "/hub/community/example/active-bundle/license.txt";
const retainedLicense = "/hub/community/example/removed-bundle/license.txt";
const retainedDirectory = "/hub/community/example/removed-bundle/";
const data = (route, value) => ({ route, bytes: Buffer.from(value) });

function fixture(t) {
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-catalog-assets-test-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const downloads = [
    data(community, "exact: community\r\n"),
    data(community + ".sig", "fixture signature\n"),
    data(license, "MIT License\n\nCopyright (c) 2026 Example\n"),
    data(retained, "exact: retained\n"),
    data(retained + ".sig", "retained signature\n"),
    data(retainedLicense, "MIT License\n\nCopyright (c) 2026 Retained Example\n"),
    data(config, "exact: assessed config\n"),
  ];
  const manifest = { entries: downloads.map(({ route, bytes }) => ({
    route, ownership: "hub", sha256: sha256(bytes),
    kind: route === config ? "config-download" : route === license || route === retainedLicense ? "license-download" : route.startsWith(retained) ? "retained-download" : "bundle-download",
  })) };
  return { scratch, manifest, downloads };
}

test("catalog assets stage exact bytes without touching sibling assets or previous runs", t => {
  const { scratch, manifest, downloads } = fixture(t);
  manifest.entries.push(
    { route: "/rules/official-bundle/bundle.yaml", kind: "bundle-download", ownership: "official-registry" },
    { route: "/hub/verifiers/example/conformance.json", kind: "verifier-conformance", ownership: "hub" },
  );
  const sibling = path.join(scratch, "hub/verifiers/example/conformance.json");
  mkdirSync(path.dirname(sibling), { recursive: true });
  writeFileSync(sibling, "keep");
  const first = stageCatalogAssets(scratch, manifest, downloads);
  const second = stageCatalogAssets(scratch, manifest, [...downloads].reverse());
  assert.notEqual(first, second);
  for (const root of [first, second]) {
    assert.deepEqual(readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => "/" + path.relative(root, path.join(entry.parentPath, entry.name))).sort(),
    downloads.map(({ route }) => route).sort());
    for (const { route, bytes } of downloads) assert.deepEqual(readFileSync(path.join(root, route.slice(1))), bytes);
  }
  assert.throws(() => stageCatalogAssets(scratch, manifest, downloads.slice(1)), /download missing/);
  assert.deepEqual(readdirSync(scratch).sort(), [path.basename(first), path.basename(second), "hub"].sort());
  assert.equal(readFileSync(sibling, "utf8"), "keep");
  assert.deepEqual(readFileSync(path.join(first, config.slice(1))), downloads.at(-1).bytes);
});

test("catalog asset staging refuses digest drift, orphan files and incomplete manifest pairs", t => {
  const { scratch, manifest, downloads } = fixture(t);
  for (const download of downloads) {
    const changed = downloads.map(entry => entry === download ? data(download.route, "different bytes") : entry);
    assert.throws(() => stageCatalogAssets(scratch, manifest, changed), /digest differs/);
  }
  for (const extra of [downloads[0], data("/rules/official-bundle/bundle.yaml", "orphan"), data("/hub/build.json", "sibling")]) {
    assert.throws(() => stageCatalogAssets(scratch, manifest, [...downloads, extra]), /unexpected or duplicate/);
  }
  const [first, ...remaining] = manifest.entries;
  assert.throws(() => stageCatalogAssets(scratch, { entries: remaining }, downloads), /incomplete catalog bundle pair/);
  assert.throws(() => stageCatalogAssets(scratch, { entries: [...manifest.entries, first] }, downloads), /duplicate catalog download route/);
  assert.deepEqual(readdirSync(scratch), []);
});

test("a retained signed pair is staged only with its license material", t => {
  const { scratch, manifest, downloads } = fixture(t);
  const without = { entries: manifest.entries.filter(entry => entry.route !== retainedLicense) };
  assert.throws(() => stageCatalogAssets(scratch, without, downloads.filter(file => file.route !== retainedLicense)), /served bundle requires license delivery/);
  const orphan = { entries: manifest.entries.filter(entry => !entry.route.startsWith(retained)) };
  assert.throws(() => stageCatalogAssets(scratch, orphan, downloads.filter(file => !file.route.startsWith(retained))), /must accompany a served bundle/);
  const staged = stageCatalogAssets(scratch, manifest, downloads);
  assert.deepEqual(readdirSync(path.join(staged, retainedDirectory.slice(1))).sort(), ["bundle.yaml", "bundle.yaml.sig", "license.txt"]);
});

test("catalog asset staging rejects escaped routes, mismatched kinds and an aliased scratch directory", t => {
  const { scratch, manifest, downloads } = fixture(t);
  for (const route of ["/hub/configs/../pipelock.yaml", "/hub/configs/example/../../pipelock.yaml",
    "/hub/configs/example%2fother/pipelock.yaml", "/hub/configs/example\\other/pipelock.yaml",
    "/hub/verifiers/example/pipelock.yaml", config + "\n", "/rules/official-bundle/bundle.yaml", community]) {
    const entries = manifest.entries.map(entry => entry.route === config ? { ...entry, route } : entry);
    assert.throws(() => stageCatalogAssets(scratch, { entries }, downloads), /invalid or duplicate catalog download route/);
  }
  const link = path.join(scratch, "alias");
  symlinkSync(scratch, link, "dir");
  assert.throws(() => stageCatalogAssets(link, manifest, downloads), /scratch must use its real path/);
  assert.deepEqual(readdirSync(scratch), ["alias"]);
  assert.throws(() => prepareBoundCatalog({}, scratch), /bound source required/);
  assert.throws(() => prepareBoundCatalog({ root: scratch, sourceBinding: {} }, link), /scratch must be outside the source checkout/);
});

test("candidate assets must match the regenerated set, including withdrawals", t => {
  const { scratch, manifest, downloads } = fixture(t);
  const staged = stageCatalogAssets(scratch, manifest, downloads);
  const candidate = stageCatalogAssets(scratch, manifest, downloads);
  assert.doesNotThrow(() => assertCatalogAssets(candidate, staged));

  const signature = path.join(candidate, community.slice(1) + ".sig");
  writeFileSync(signature, "changed signature");
  assert.throws(() => assertCatalogAssets(candidate, staged), /asset set differs/);
  writeFileSync(signature, downloads[1].bytes);
  const retired = path.join(candidate, retained.slice(1));
  rmSync(retired);
  assert.throws(() => assertCatalogAssets(candidate, staged), /asset set differs/);

  const withdrawnManifest = { entries: manifest.entries.filter(entry => !entry.route.startsWith(retainedDirectory)) };
  const withdrawn = stageCatalogAssets(scratch, withdrawnManifest, downloads.filter(file => !file.route.startsWith(retainedDirectory)));
  assert.throws(() => assertCatalogAssets(staged, withdrawn), /asset set differs/);
  symlinkSync(path.join(staged, retained.slice(1)), retired);
  assert.throws(() => assertCatalogAssets(candidate, staged), /must contain regular files/);
});
