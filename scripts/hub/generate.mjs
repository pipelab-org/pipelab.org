import { assessConfig } from "./config-assessment.mjs";
import { firstPartyRecipes, firstPartyVerifierItems, verifierEvidence } from "./first-party.mjs";
import { filterRuleDisplay } from "./rule-display.mjs";
import { reconcileLifecycle } from "./lifecycle.mjs";
import { acceptedSource, acquireHubTree, assertSourceProgress } from "./source-tree.mjs";
import { stageCatalogAssets } from "./catalog-assets.mjs";
import { loadAcquiredListings } from "./source-listings.mjs";
import { assertCatalogNames } from "./names.mjs";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, realpathSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readGit } from "./git-source.mjs";
import path from "node:path";
import { tmpdir } from "node:os";
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
export function generateCatalog(options) {
  return options.sourceBinding ? generateBoundCatalog(options) : generateFromListings(options);
}

// Returns matching metadata and an isolated asset root after all checks and
// writes succeed. The caller owns scratch cleanup and must consume these bytes
// in a disposable Hugo source tree alongside the site's other assets.
export function prepareBoundCatalog(options, scratchDirectory) {
  if (!options.sourceBinding) throw new Error("bound source required for catalog assets");
  const root = realpathSync(options.root);
  const scratch = realpathSync(scratchDirectory);
  const relative = path.relative(root, scratch);
  if (!relative || relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)) {
    throw new Error("catalog scratch must be outside the source checkout");
  }
  const downloads = [];
  const catalog = generateBoundCatalog(options, downloads);
  const assetRoot = stageCatalogAssets(scratchDirectory, catalog["routes.json"], downloads);
  return { catalog, assetRoot };
}

function generateBoundCatalog(options, downloads) {
  const binding = options.sourceBinding;
  if (options.items?.length || options.publishers?.length || options.lifecycle ||
      options.removed?.length || options.baseline?.length || binding.history) {
    throw new Error("bound source must be the sole contributor data producer");
  }
  const { siteBase, rulesRepository, rulesSHA, rulesMain } = binding;
  const rulesTip = readGit(rulesRepository, ["rev-parse", "refs/remotes/origin/main"], { encoding: "utf8" }).trim();
  if (rulesTip !== rulesMain) throw new Error("rules source does not bind the fetched main tip");
  const previous = acceptedSource(options.root, siteBase);
  assertSourceProgress(rulesRepository, previous.rules_sha, rulesSHA, rulesMain);
  const directory = mkdtempSync(path.join(tmpdir(), "hub-sources-"));
  try {
    acquireHubTree(rulesRepository, rulesSHA, directory);
    const { items, publishers, history } = loadAcquiredListings(directory, options.root);
    return generateFromListings({
      ...options, items, publishers,
      lifecycle: { accepted: previous.lifecycle, history },
    }, rulesSHA, downloads);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function generateFromListings({ root, items, engine, binary, repository, config, pipelockBinary,
  publishers = [], removed = [], baseline = [], lifecycle, policies, mode = "routine" }, rulesSHA, downloads) {
  if (!["routine", "report"].includes(mode)) throw new Error("unsupported generation mode");
  assertEngineIdentity({ root, engine, binary });
  const sourceConfig = readGit(repository, ["show", `${enginePin.source_commit}:configs/claude-code.yaml`]);
  if (sha256(readFileSync(config)) !== sha256(sourceConfig)) throw new Error("reader base config differs from pinned preset");
  const tooling = toolingIdentity(root, engine), official = officialKeys(repository), records = [];
  const boundSource = rulesSHA && { rules_sha: rulesSHA, tooling_identity: tooling };
  let core = [];
  const limits = JSON.parse(readFileSync(path.join(root, "data/hub/latency-limits.json")));
  for (const item of [...items, ...firstPartyVerifierItems(root).filter(entry => !items.some(item => path.resolve(item.listing_file) === path.resolve(entry.listing_file)))]) {
    const listing = parseListing(readFileSync(item.listing_file, "utf8"));
    const source = listing.type === "recipe" || listing.type === "verifier" ? "first-party" : "catalog";
    if (source === "first-party") assertFirstPartyListing(root, item.listing_file);
    let reader, independent, pair, measurement = null, publisher;
    if (item.publisher) {
      const matches = publishers.filter(entry => entry.id === item.publisher.id);
      if (matches.length !== 1) throw new Error("exactly one registered publisher required");
      publisher = matches[0];
    }
    if (listing.type === "bundle") {
      pair = readBundleFiles(item.bundle_dir);
      independent = verifyBundle({ ...pair, official, publisher: (publisher?.keys || []).map(key => typeof key === "string" ? key : key.fingerprint) });
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
    const conformance = listing.type === "verifier" ? verifierEvidence(item.artifact_root, listing) : null;
    const record = deriveRecord({ listing, reader, independent, publisher, tooling, evidencePresent, measurement, source });
    if (downloads && record.badge === "community") {
      downloads.push(
        { route: record.route + "bundle.yaml", bytes: pair.bytes },
        { route: record.route + "bundle.yaml.sig", bytes: pair.signature },
      );
    }
    if (conformance) {
      record.conformance = conformance;
      record.pipelock_version = listing.release;
      record.facts = { "Verifier release": listing.release, "Recorded cases": String(conformance.cases) };
      record.display_facts = Object.entries(record.facts).map(([key, value]) => ({ key, value }));
    }
    if (listing.type === "config") {
      if (!rulesSHA && !item.config_file) throw new Error("generated config download required");
      const result = assessConfig(listing, pipelockBinary);
      const bytes = rulesSHA ? result.bytes : readFileSync(item.config_file);
      record.config_sha256 = sha256(bytes);
      if (record.config_sha256 !== result.sha256) throw new Error("config download differs from the generated, assessed bytes");
      record.assessed_config_sha256 = result.sha256;
      downloads?.push({ route: record.route + "pipelock.yaml", bytes });
      const assessment = result.assessment;
      record.config_assessment = assessment;
      record.pipelock_version = assessment.version;
      record.facts = {
        "Base preset": assessment.base_preset,
        "Base grade": assessment.base_grade,
        "Config grade": assessment.grade,
        "Config score": assessment.total_score + "/" + assessment.max_score,
        "Pipelock version": assessment.version,
        "Edition": assessment.edition,
        "Score scope": "Every change from the base preset is listed. The grade covers scored categories only.",
      };
      for (const [index, change] of assessment.changes.entries()) {
        record.facts["Change " + (index + 1) + " (" + change.effect + ")"] = change.text;
      }
      for (const category of assessment.categories.filter(category => category.delta)) {
        record.facts[category.name + " score change"] = (category.delta > 0 ? "+" : "") + category.delta;
      }
      for (const [index, finding] of assessment.findings.entries()) {
        record.facts["New finding " + (index + 1) + " (" + finding.severity + ")"] = finding.message;
      }
      record.display_facts = Object.entries(record.facts).map(([key, value]) => ({ key, value }));
    }
    records.push(record);
  }
  for (const { listing, pro } of firstPartyRecipes(root)) {
    const record = deriveRecord({ listing, tooling, evidencePresent: true, source: "first-party" });
    record.pipelock_version = listing.evidence.pipelock_version;
    if (pro) {
      record.facts["Feature access"] = "Requires Pro";
      record.display_facts = [{ key: "Feature access", value: "Requires Pro" }];
    }
    records.push(record);
  }
  const officialInventory = readdirSync(path.join(root, "static/rules"), { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(path.join(root, "static/rules", entry.name, "bundle.yaml"))).map(entry => entry.name).sort();
  const officialRecords = records.filter(record => record.badge === "official").map(record => record.reader.name).sort();
  if (!records.length || JSON.stringify(officialInventory) !== JSON.stringify(officialRecords)) throw new Error("official served inventory differs from active catalog");
  const retainedDownloads = [];
  let checkedLifecycle;
  const restoredNames = new Set();
  if (lifecycle) {
    if (removed.length || baseline.length) throw new Error("lifecycle data has multiple producers");
    const listings = records.map(record => ({
      id: record.listing.type + "--" + record.listing.id,
      route: record.route,
      publisher: record.publisher_id ?? record.badge,
      badge: record.badge,
      ...(record.listing.type === "bundle" ? {
        bundle_name: record.listing.bundle_name,
        bundle_sha256: record.bundle_sha256,
        signature_sha256: record.signature_sha256,
      } : {}),
    }));
    const transitions = reconcileLifecycle(lifecycle.accepted, { listings, history: lifecycle.history });
    for (const { listing, event } of transitions) {
      if (event.downloads !== "retained") continue;
      if (listing.badge !== "community") throw new Error("retained downloads must be Hub-owned signed pairs");
      for (const [name, digest] of [["bundle.yaml", listing.bundle_sha256], ["bundle.yaml.sig", listing.signature_sha256]]) {
        const relative = listing.route.slice(1) + name;
        const bytes = readFileSync(resolveArtifact(root, "assets/" + relative));
        if (sha256(bytes) !== digest) throw new Error("retained signed pair differs from the accepted bytes");
        const route = "/" + relative;
        retainedDownloads.push({ route, sha256: digest });
        downloads?.push({ route, bytes });
      }
    }
    removed = transitions.map(({ listing, event, replacement }) => {
      const id = listing.id.slice(listing.id.indexOf("--") + 2);
      const bundleName = listing.id.startsWith("bundle--")
        ? listing.bundle_name ?? path.posix.basename(listing.route)
        : null;
      return {
        id,
        route: listing.route,
        publisher_id: listing.publisher,
        facts: {
          ...(bundleName ? { "bundle.name": bundleName } : {}),
          "Removed on": event.at,
          "Reason": event.public_reason,
          "Downloads": event.downloads === "retained" ? "Signed download still available." : "Withdrawn from the Hub.",
          ...(replacement ? { "Replacement": replacement.route } : {}),
        },
      };
    });
    checkedLifecycle = {
      listings: [...new Map([...lifecycle.accepted.listings, ...listings].map(listing => [listing.id, listing])).values()]
        .sort((a, b) => a.id.localeCompare(b.id)),
      history: [...lifecycle.history].sort((a, b) => a.id.localeCompare(b.id)),
    };
    baseline = lifecycle.accepted.routes;
    const acceptedById = new Map(lifecycle.accepted.listings.map(listing => [listing.id, listing]));
    const previousTombstones = new Set(lifecycle.accepted.history.map(log => log.id));
    for (const listing of listings) {
      // Only a currently active identity with accepted withdrawal history can
      // reclaim its reserved names. Reconciliation has already verified its
      // publisher, route and restoration record.
      if (!previousTombstones.has(listing.id) || !acceptedById.has(listing.id)) continue;
      restoredNames.add(listing.id.slice(listing.id.indexOf("--") + 2));
      if (listing.bundle_name) restoredNames.add(listing.bundle_name);
    }
  }
  const inventoryFile = path.join(root, "data/hub/generated/inventory.json");
  const inventory = existsSync(inventoryFile) ? JSON.parse(readFileSync(inventoryFile)) : { format: 1, removed: [], retained_names: [] };
  if (inventory.format !== 1 || !Array.isArray(inventory.removed) || inventory.retained_names !== undefined && !Array.isArray(inventory.retained_names)) throw new Error("invalid retained name inventory");
  const withdrawnNames = new Set(removed.flatMap(record => [record.id, record.facts?.["bundle.name"]].filter(Boolean)));
  const retainedNames = [...new Set([...inventory.removed, ...(inventory.retained_names || []), ...withdrawnNames])].sort();
  assertCatalogNames(records, retainedNames.filter(name => withdrawnNames.has(name) || !restoredNames.has(name)));
  records.sort((a, b) => a.listing.id.localeCompare(b.listing.id));
  if (mode === "routine" || pipelockBinary) core = filterRuleDisplay(records, core, pipelockBinary);
  const policyFile = path.join(root, "data/hub/policy-pages.json");
  const policyPages = existsSync(policyFile) ? JSON.parse(readFileSync(policyFile)) : {};
  const manifest = routeManifest({ records, publishers, core, removed, baseline, retainedDownloads, policies, policyPages, schemaBytes: readFileSync(path.join(root, "scripts/hub/schema/listing-v1.json")) });
  return {
    "listings.json": records, "routes.json": { format: manifest.format, entries: manifest.entries },
    "references.json": manifest.references, "sections.json": manifest.sections,
    "inventory.json": { format: 1, active: manifest.active, removed: manifest.removed, retained_names: retainedNames },
    ...(checkedLifecycle ? { "lifecycle.json": { ...checkedLifecycle, routes: manifest.entries } } : {}),
    ...(boundSource ? { "source.json": boundSource } : {}),
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
