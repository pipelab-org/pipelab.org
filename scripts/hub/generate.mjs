import { assertCatalogNames } from "./names.mjs";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enginePin } from "./build-harness.mjs";
import { deriveRecord } from "./records.mjs";
import { officialKeys, verifyBundle, readBundleFiles } from "./verify-bundle.mjs";
import { parseListing, resolveArtifact } from "./validate.mjs";
import { toolingIdentity, jsonBytes, acceptedMeasurement, assertRegeneration, bindWorkload, measurementBindings, measurementMethod, goWorkloadSHA256, sha256 } from "./evidence.mjs";
import { routeManifest } from "./route-manifest.mjs";

export function runHubcheck(binary, mode, request, { timeout = 120000 } = {}) {
  const output = execFileSync(binary, [mode], { input: JSON.stringify(request), encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GOMAXPROCS: "1" } });
  return JSON.parse(output);
}
export function assertEngineIdentity({ root, engine, binary }) {
  if (!engine || engine.version !== enginePin.version || engine.source_commit !== enginePin.source_commit || engine.go_version.split(" ")[2] !== enginePin.go_version || engine.harness_sha256 !== sha256(readFileSync(path.join(root, "scripts/hub/pipelock-harness/main.go"))) || engine.binary_sha256 !== sha256(readFileSync(binary))) throw new Error("engine executable identity differs");
}
// Recipe and verifier badges are admitted only from the site source directory.
export function assertFirstPartyListing(root, listingFile) {
  const refused = "first-party listing must be a regular file under data/hub/first-party";
  let trusted, file;
  try { trusted = realpathSync(path.join(root, "data/hub/first-party")); file = realpathSync(listingFile); }
  catch { throw new Error(refused); }
  const relative = path.relative(trusted, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !statSync(file).isFile()) throw new Error(refused);
}
// Caller supplies trusted input paths from an acquired source tree. No shell,
// URLs, commands, modules or executable contribution are accepted as inputs.
export function generateCatalog({ root, items, engine, binary, repository, config, publishers = [], removed = [], baseline = [], policies, mode = "routine" }) {
  if (!["routine", "report"].includes(mode)) throw new Error("unsupported generation mode");
  assertEngineIdentity({ root, engine, binary });
  const sourceConfig = execFileSync("git", ["-C", repository, "show", `${enginePin.source_commit}:configs/claude-code.yaml`]);
  if (sha256(readFileSync(config)) !== sha256(sourceConfig)) throw new Error("reader base config differs from pinned preset");
  const tooling = toolingIdentity(root, engine), official = officialKeys(repository), records = [];
  let core = [];
  const limits = JSON.parse(readFileSync(path.join(root, "data/hub/latency-limits.json")));
  for (const item of items) {
    const listing = parseListing(readFileSync(item.listing_file, "utf8"));
    const source = listing.type === "recipe" || listing.type === "verifier" ? "first-party" : "catalog";
    if (source === "first-party") assertFirstPartyListing(root, item.listing_file);
    let reader, independent, measurement = null, publisher;
    if (item.publisher) {
      const matches = publishers.filter(entry => entry.id === item.publisher.id);
      if (matches.length !== 1) throw new Error("exactly one registered publisher required");
      publisher = matches[0];
    }
    if (listing.type === "bundle") {
      independent = verifyBundle({ ...readBundleFiles(item.bundle_dir), official, publisher: (publisher?.keys || []).map(key => typeof key === "string" ? key : key.fingerprint) });
      reader = runHubcheck(binary, "reader", { bundle_dir: item.bundle_dir, config, trusted_keys: (publisher?.keys || []).map((key, i) => ({ name: `${publisher.id}-${i}`, public_key: typeof key === "string" ? key : key.fingerprint })) });
      core = reader.core;
      if (item.measurement_reference && item.workload_spec) {
        const workload = bindWorkload({ rules: reader.declared, ...item.workload_spec });
        const method = measurementMethod(root, config, JSON.parse(readFileSync(path.join(root, "data/hub/benchmark-method.json"))).pairs);
        const currentBindings = measurementBindings({ reader, workload, engine, method, executedWorkloadSHA256: goWorkloadSHA256(workload.harness) });
        measurement = { reference: item.measurement_reference, ...acceptedMeasurement(path.join(root, "data/hub/measurements"), item.measurement_reference, currentBindings, limits, { acceptance: false }) };
        if (mode === "routine" && measurement.verdict.status !== "pass") throw new Error("passing latency measurement required");
        // Records bind evidence by digest; samples remain in immutable artifacts.
        measurement = { reference: measurement.reference, verdict: measurement.verdict };
      } else if (mode !== "report") throw new Error("current accepted measurement required");
    }
    let evidencePresent = false;
    if (listing.evidence.artifact) { resolveArtifact(item.artifact_root, listing.evidence.artifact); evidencePresent = true; }
    const record = deriveRecord({ listing, reader, independent, publisher, tooling, evidencePresent, measurement, source });
    if (listing.type === "config") {
      if (!item.config_file || !item.assessed_config_sha256) throw new Error("config assessment required");
      record.config_sha256 = sha256(readFileSync(item.config_file)); record.assessed_config_sha256 = item.assessed_config_sha256;
    }
    records.push(record);
  }
  const officialInventory = readdirSync(path.join(root, "static/rules"), { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(path.join(root, "static/rules", entry.name, "bundle.yaml"))).map(entry => entry.name).sort();
  const officialRecords = records.filter(record => record.badge === "official").map(record => record.reader.name).sort();
  if (!records.length || JSON.stringify(officialInventory) !== JSON.stringify(officialRecords)) throw new Error("official served inventory differs from active catalog");
  const inventoryFile = path.join(root, "data/hub/generated/inventory.json");
  const inventory = existsSync(inventoryFile) ? JSON.parse(readFileSync(inventoryFile)) : { format: 1, removed: [], retained_names: [] };
  if (inventory.format !== 1 || !Array.isArray(inventory.removed) || inventory.retained_names !== undefined && !Array.isArray(inventory.retained_names)) throw new Error("invalid retained name inventory");
  const retainedNames = [...new Set([...inventory.removed, ...(inventory.retained_names || []), ...removed.flatMap(record => [record.id, record.facts?.["bundle.name"]].filter(Boolean))])].sort();
  assertCatalogNames(records, retainedNames);
  records.sort((a, b) => a.listing.id.localeCompare(b.listing.id));
  const manifest = routeManifest({ records, publishers, core, removed, baseline, policies, schemaBytes: readFileSync(path.join(root, "scripts/hub/schema/listing-v1.json")) });
  return {
    "listings.json": records, "routes.json": { format: manifest.format, entries: manifest.entries },
    "references.json": manifest.references, "sections.json": manifest.sections,
    "inventory.json": { format: 1, active: manifest.active, removed: manifest.removed, retained_names: retainedNames },
  };
}
export function writeCatalog(directory, catalog, { check = false } = {}) {
  if (!check) mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(catalog)) {
    const bytes = jsonBytes(value), file = path.join(directory, name);
    if (check) assertRegeneration(readFileSync(file), bytes); else writeFileSync(file, bytes);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output, flag] = process.argv.slice(2);
  if (!input || !output || flag && flag !== "--check") throw new Error("usage: generate.mjs INPUT_JSON OUTPUT_DIRECTORY [--check]");
  writeCatalog(output, generateCatalog(JSON.parse(readFileSync(input))), { check: flag === "--check" });
}
