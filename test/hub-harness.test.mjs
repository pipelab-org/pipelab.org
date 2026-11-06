import { assertNamingRuntime, nameSkeleton, assertCommunityNames, assertCatalogNames } from "../scripts/hub/names.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, symlinkSync, chmodSync, readdirSync } from "node:fs";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { verifyBundle, officialKeys, compareReaderSignature, readBundleFiles } from "../scripts/hub/verify-bundle.mjs";
import { deriveRecord, indexProjection, assertIndex } from "../scripts/hub/records.mjs";
import { canonical, contentDigest, bindWorkload, measurementArtifact, writeMeasurement, acceptedMeasurement, latencyVerdict, assertRegeneration, treeIdentity, jsonBytes, sha256, goWorkloadSHA256, measurementBindings, measurementMethod } from "../scripts/hub/evidence.mjs";
import { routeManifest } from "../scripts/hub/route-manifest.mjs";
import { assertPublication, htmlFacts, markdownFacts, representationPaths } from "../scripts/hub/parity.mjs";
import { officialOwnInputs, producerInputs, nearInput, repeatNear, workloadCaps, NEAR_GENERATOR } from "../scripts/hub/workload.mjs";
import { runHubcheck, generateCatalog, writeCatalog, assertFirstPartyListing } from "../scripts/hub/generate.mjs";
import { benchmarkReport } from "../scripts/hub/benchmark-report.mjs";
import { buildHarness, toolDefinitionLimit } from "../scripts/hub/build-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8");
const base = JSON.parse(read("test/hub-fixtures/listing.json"));
const binary = process.env.HUBCHECK_BIN;
const engineDir = process.env.HUBCHECK_ENGINE_DIR;
const repository = process.env.HUBCHECK_REPOSITORY;
const native = binary && engineDir && repository;
function temp(t) { const dir = mkdtempSync(path.join(tmpdir(), "hub-harness-")); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function keypair() { const pair = generateKeyPairSync("ed25519"); return { ...pair, hex: pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex") }; }
function synthetic() {
  return { format_version: 2, name: "example-bundle", version: "2026.11.0", author: "Example maintainer", description: "Synthetic reader fixture", tier: "community", monotonic_version: 1, published_at: "2026-11-01T00:00:00Z", expires_at: "2099-11-01T00:00:00Z", rules: [
    { id: "stable-rule", type: "injection", status: "stable", name: "Stable rule", description: "Synthetic literal", severity: "high", confidence: "high", pattern: { regex: "fixture-literal" } },
    { id: "stable-rule-long", type: "dlp", status: "experimental", name: "Experimental rule", description: "Synthetic DLP", severity: "high", confidence: "high", pattern: { regex: "fixture-secret" } },
    { id: "low-rule", type: "tool-poison", status: "stable", name: "Low rule", description: "Synthetic tool description", severity: "high", confidence: "low", pattern: { regex: "fixture-poison", scan_field: "description" } },
    { id: "deprecated-rule", type: "injection", status: "deprecated", name: "Deprecated rule", description: "Never loaded", severity: "high", confidence: "high", pattern: { regex: "deprecated-literal" } },
  ] };
}
function stage(t, mutate = value => value) {
  const dir = temp(t), key = keypair(), bundle = mutate({ ...synthetic(), key_id: key.hex });
  const bytes = Buffer.from(stringify(bundle)), signature = Buffer.from(sign(null, bytes, key.privateKey).toString("base64") + "\n");
  writeFileSync(path.join(dir, "bundle.yaml"), bytes); writeFileSync(path.join(dir, "bundle.yaml.sig"), signature);
  return { dir, key, bundle, bytes, signature, request: { bundle_dir: dir, config: path.join(engineDir || "", "configs/claude-code.yaml"), trusted_keys: [{ name: "example", public_key: key.hex }] } };
}
function listingFor(reader) { const listing = structuredClone(base); delete listing.learn_page; delete listing.evidence.artifact; Object.assign(listing, { type: "bundle", id: reader.name, bundle_name: reader.name, bundle_sha256: reader.bundle_sha256, signer_fingerprint: reader.signer_fingerprint }); return listing; }
function timer(samples) { return { samples_ns: samples, maximum_ns: Math.max(...samples), completed: true, timeout: false }; }
function results(maximum = 12, workload_sha256 = "executed") { const measured = { baseline: timer([10, 10, 10]), target: timer([12, 12, maximum]), ratio: 0.2 }; return { rules: { "test-rule": structuredClone(measured) }, bundle: measured, deprecated: [], workload_sha256, bundle_sha256: "bundle", config_sha256: "config" }; }

test("streamed evidence digests preserve the canonical byte contract", () => {
  for (const value of [null, false, 0, "\u2028<&>\uD800", [], { b: [1, "quoted\\text", null], a: { z: true } }]) {
    assert.equal(contentDigest(value), sha256(canonical(value)));
  }
  assert.throws(() => contentDigest({ value: undefined }), /undefined evidence/);
  assert.throws(() => contentDigest({ value: Infinity }), /non-finite/);
});

// Numeric values in these synthetic unit cases are evidence fixtures, not policy.
test("measurement evidence binds full workload, supports immutable supersession, and recomputes deadlines", t => {
  const dir = temp(t), inputs = [{ rule_id: "test-rule", positive: [{ origin: "producer/positive", text: "match" }], negative: [{ origin: "site/supplement", text: "clean" }], clean: [{ origin: "site/snapshot", text: "guide" }], near: [{ origin: "generator/v1", text: "mat filler" }] }];
  const workload = bindWorkload({ rules: [{ id: "test-rule", status: "stable" }], inputs, generator: "v1", parameters: { bytes: 20 } });
  const changed = structuredClone(inputs); changed[0].negative[0].text = "different";
  assert.notEqual(workload.digest, bindWorkload({ rules: [{ id: "test-rule", status: "stable" }], inputs: changed, generator: "v1", parameters: { bytes: 20 } }).digest);
  assert.throws(() => bindWorkload({ rules: [{ id: "test-rule", status: "stable" }], inputs: [], generator: "v1", parameters: {} }), /mapping/);
  const executed = goWorkloadSHA256(workload.harness);
  const binding = { bundle_sha256: "bundle", workload_sha256: workload.digest, executed_workload_sha256: "executed", measured_rule_ids: ["test-rule"], engine: { source: "engine-a" }, method: { base_config_sha256: "config", pairs: 3, gomaxprocs: 1, interleave: ["baseline", "target"], measurement_policy: { min_confidence: "low", include_experimental: true } } };
  assert.throws(() => measurementArtifact({ ...binding, executed_workload_sha256: "" }, results()), /missing/);
  assert.throws(() => measurementArtifact(binding, results(12, "other")), /executed workload/);
  assert.throws(() => measurementBindings({ reader: { bundle_sha256: "bundle", declared: [{ id: "test-rule", status: "stable" }] }, workload, engine: binding.engine, method: binding.method, executedWorkloadSHA256: "other" }), /executed workload/);
  assert.equal(measurementBindings({ reader: { bundle_sha256: "bundle", declared: [{ id: "test-rule", status: "stable" }] }, workload, engine: binding.engine, method: binding.method, executedWorkloadSHA256: executed }).executed_workload_sha256, executed);
  assert.throws(() => measurementArtifact(binding, { ...results(), bundle_sha256: "other" }), /executed bundle digest/);
  assert.throws(() => measurementArtifact(binding, { ...results(), config_sha256: "other" }), /executed config digest/);
  const old = measurementArtifact(binding, results(), { run: "first" }), reference = writeMeasurement(dir, old);
  const newerBinding = { ...binding, engine: { source: "engine-b" } };
  const newer = measurementArtifact(newerBinding, results(), { run: "second" }); writeMeasurement(dir, newer);
  assert.notEqual(old.id, newer.id); assert.ok(existsSync(path.join(dir, `${old.id}.json`)));
  assert.throws(() => acceptedMeasurement(dir, reference, newerBinding, {}), /stale/);
  assert.throws(() => acceptedMeasurement(dir, reference, { ...binding, workload_sha256: "changed-fixture" }, {}), /stale/);
  assert.equal(acceptedMeasurement(dir, reference, binding, {}).verdict.status, "unassessed");
  assert.throws(() => latencyVerdict(results(), {}, { acceptance: true }), /unset/);
  assert.equal(latencyVerdict(results(), { rule_ratio: 1, bundle_ratio: 1, deadline_ns: 15 }).status, "pass");
  assert.equal(latencyVerdict(results(20), { rule_ratio: 1, bundle_ratio: 1, deadline_ns: 15 }).status, "fail");
  const timeout = results(); timeout.bundle.baseline.timeout = true;
  assert.equal(latencyVerdict(timeout, {}).status, "fail");
  const incomplete = results(); incomplete.bundle.target.samples_ns = [];
  assert.throws(() => latencyVerdict(incomplete, {}), /incomplete/);
  assert.equal(acceptedMeasurement(dir, reference, binding, { rule_ratio: 0.1, bundle_ratio: 0.1, deadline_ns: 15 }).verdict.status, "fail");
  assertRegeneration(jsonBytes({ reference }), jsonBytes({ reference }));
  assert.throws(() => assertRegeneration("old", "changed"), /differ/);
  const sameBindingsNewSamples = measurementArtifact(binding, results(14), { run: "fresh" }); writeMeasurement(dir, sameBindingsNewSamples);
  assert.notEqual(old.id, sameBindingsNewSamples.id);
  assert.equal(acceptedMeasurement(dir, reference, binding, {}).artifact.results.bundle.target.maximum_ns, 12);
});

test("tooling identity hashes content independently of a regeneration commit", t => {
  const dir = temp(t); mkdirSync(path.join(dir, "nested")); writeFileSync(path.join(dir, "nested/file"), "a");
  const before = treeIdentity(dir); writeFileSync(path.join(dir, "nested/file"), "b"); assert.notEqual(treeIdentity(dir), before);
  writeFileSync(path.join(dir, "nested/file"), "a"); assert.equal(treeIdentity(dir), before);
});

test("independent Node verifier rejects encoding, bytes, keys, and claimed fingerprints", t => {
  const fixture = stage(t), verified = verifyBundle({ bytes: fixture.bytes, signature: fixture.signature, official: [], publisher: [fixture.key.hex] });
  assert.equal(verified.trust_tier, "third-party");
  assert.throws(() => verifyBundle({ bytes: Buffer.concat([fixture.bytes, Buffer.from("x")]), signature: fixture.signature, official: [], publisher: [fixture.key.hex] }), /untrusted/);
  assert.throws(() => verifyBundle({ bytes: fixture.bytes, signature: Buffer.from("AA=="), official: [], publisher: [fixture.key.hex] }), /encoding/);
  assert.throws(() => verifyBundle({ bytes: fixture.bytes, signature: fixture.signature, official: [], publisher: [keypair().hex] }), /untrusted/);
  assert.throws(() => compareReaderSignature({ ...verified, signer_fingerprint: "copied-official" }, verified), /disagrees/);
});

test("native reader verifies real official bytes and both identity policies", { skip: !native && "set HUBCHECK_BIN, HUBCHECK_ENGINE_DIR, HUBCHECK_REPOSITORY" }, () => {
  const keys = officialKeys(repository);
  for (const [name, stockCount] of [["pipelock-community", 18], ["healthcare-phi-pii", 26]]) {
    const dir = path.join(root, "static/rules", name), reader = runHubcheck(binary, "reader", { bundle_dir: dir, config: path.join(engineDir, "configs/claude-code.yaml") });
    const independent = verifyBundle({ ...readBundleFiles(dir), official: keys }); compareReaderSignature(reader, independent);
    assert.equal(reader.declared.length, 28); assert.equal(reader.policies.stock.loaded.length, stockCount); assert.equal(reader.policies.full.loaded.length, 28);
    assert.deepEqual(reader.policies.stock.loaded, reader.policies.stock.eligible); assert.deepEqual(reader.policies.full.loaded, reader.policies.full.eligible);
    assert.equal(new Set(reader.policies.full.loaded).size, 28);
  }
});

test("native reader refuses signed reader-invalid data and checks exact identity sets", { skip: !native }, t => {
  const fixture = stage(t), reader = runHubcheck(binary, "reader", fixture.request);
  assert.deepEqual(reader.policies.stock.loaded, ["stable-rule"]); assert.deepEqual(reader.policies.full.loaded, ["low-rule", "stable-rule", "stable-rule-long"]);
  assert.ok(!reader.policies.full.loaded.includes("deprecated-rule"));
  for (const mutate of [b => ({ ...b, name: "../escape" }), b => ({ ...b, unexpected: true }), b => { b.rules[0].status = "unknown"; return b; }, b => { delete b.key_id; return b; }]) {
    const invalid = stage(t, mutate);
    assert.throws(() => runHubcheck(binary, "reader", invalid.request));
  }
  assert.throws(() => runHubcheck(binary, "reader", { ...fixture.request, expected: { full: ["stable-rule"] } }));
  const experimental = stage(t, b => ({ ...b, rules: [b.rules[1]] }));
  const expReader = runHubcheck(binary, "reader", experimental.request);
  assert.deepEqual(expReader.policies.stock.loaded, []); assert.deepEqual(expReader.policies.full.loaded, ["stable-rule-long"]);
  writeFileSync(path.join(fixture.dir, "bundle.yaml"), Buffer.concat([fixture.bytes, Buffer.from("# mutation\n")]));
  assert.throws(() => runHubcheck(binary, "reader", fixture.request));
});

test("native benchmark requires complete inputs then isolates stable, experimental and low-confidence identities", { skip: !native }, t => {
  const fixture = stage(t);
  assert.throws(() => runHubcheck(binary, "bench", { ...fixture.request, pairs: 1, workload: [] }));
  const workload = fixture.bundle.rules.filter(rule => rule.status !== "deprecated").map(rule => ({ rule_id: rule.id, positive: [rule.pattern.regex], negative: ["A normal description of project files."], clean: ["Read the setup & <instructions>."], near: ["fixture filler"] }));
  workload[0].clean.push("JSON line separators \u2028\u2029 and an unpaired surrogate \uD800");
  const measured = runHubcheck(binary, "bench", { ...fixture.request, pairs: 1, workload });
  assert.equal(measured.workload_sha256, goWorkloadSHA256(workload));
  assert.deepEqual(Object.keys(measured.rules).sort(), ["low-rule", "stable-rule", "stable-rule-long"]);
  assert.deepEqual(measured.deprecated, ["deprecated-rule"]); assert.equal(measured.bundle.target.completed, true);
  assert.equal(latencyVerdict(measured, {}).status, "unassessed");
  const timedOut = runHubcheck(binary, "bench", { ...fixture.request, pairs: 1, workload, deadline_ns: 1 });
  assert.equal(latencyVerdict(timedOut, {}).status, "fail");
  const oversized = structuredClone(workload);
  oversized.find(input => input.rule_id === "low-rule").near = ["x".repeat(toolDefinitionLimit(repository).bytes)];
  assert.throws(() => runHubcheck(binary, "bench", { ...fixture.request, pairs: 1, workload: oversized }), /REFUSED/);
  const inputs = oversized.map(input => ({ rule_id: input.rule_id, ...Object.fromEntries(["positive", "negative", "clean", "near"].map(group => [group, input[group].map(text => ({ origin: "test:oversized", text }))])) }));
  const output = path.join(temp(t), "refused-report"), engine = JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json")));
  assert.throws(() => benchmarkReport({ binary, request: fixture.request, engine, workloadSpec: { inputs, generator: "test:oversized", parameters: {} }, pairs: 1, output, root }), /REFUSED/);
  assert.equal(existsSync(output), false);
});

function emitManifest(dir, manifest, records) {
  for (const entry of manifest.entries) for (const { route, representation } of representationPaths(entry)) {
    const file = path.join(dir, route.slice(1)); mkdirSync(path.dirname(file), { recursive: true });
    let body;
    if (representation === "html") body = `<article${entry.kind === "listing" ? ` data-hub-id="${entry.listing_id}"` : ""}>` + Object.entries(entry.facts).map(([key, value]) => `<code data-hub-fact="${key}">${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</code>`).join("") + "</article>";
    else if (representation === "mirror") body = `${entry.kind === "listing" ? `ID: ${entry.listing_id}\n` : ""}` + Object.entries(entry.facts).map(([hub_fact, value]) => "```\n" + JSON.stringify({ hub_fact, value }) + "\n```\n").join("\n");
    else if (entry.kind === "index") body = JSON.stringify(indexProjection(records));
    else if (entry.kind === "schema") body = read("scripts/hub/schema/listing-v1.json");
    else if (entry.kind === "build") body = "{}";
    else body = "config: checked\n";
    writeFileSync(file, body);
  }
}
test("manifest owns schema/config files, rejects absent or stale output, and scopes closure to hub", t => {
  const dir = temp(t), record = deriveRecord({ listing: base, tooling: {}, source: "first-party" });
  assert.equal(record.badge, "first-party");
  assert.throws(() => deriveRecord({ listing: base, tooling: {} }), /not admitted/);
  const party = temp(t); mkdirSync(path.join(party, "data/hub/first-party/nested"), { recursive: true });
  const inside = path.join(party, "data/hub/first-party/nested/recipe.yaml"); writeFileSync(inside, "name: inside\n");
  assert.equal(assertFirstPartyListing(party, inside), undefined);
  const outside = path.join(party, "recipe.yaml"); writeFileSync(outside, "name: outside\n");
  assert.throws(() => assertFirstPartyListing(party, outside), /data\/hub\/first-party/);
  symlinkSync(outside, path.join(party, "data/hub/first-party/escape.yaml"));
  assert.throws(() => assertFirstPartyListing(party, path.join(party, "data/hub/first-party/escape.yaml")), /data\/hub\/first-party/);
  const manifest = routeManifest({ records: [record], policies: [], schemaBytes: read("scripts/hub/schema/listing-v1.json") });
  emitManifest(dir, manifest, [record]); assertPublication({ directory: dir, manifest, records: [record], open: true });
  const schemaFile = path.join(dir, "schemas/pipelab-hub/listing-v1.json"), schemaBytes = readFileSync(schemaFile);
  writeFileSync(schemaFile, "{}"); assert.throws(() => assertPublication({ directory: dir, manifest, records: [record], open: true }), /digest/);
  rmSync(schemaFile); assert.throws(() => assertPublication({ directory: dir, manifest, records: [record], open: true }), /missing/); writeFileSync(schemaFile, schemaBytes);
  assert.throws(() => assertPublication({ directory: dir, manifest, records: [record], open: false }), /closed/);
  const mirror = path.join(dir, "hub/core-rules/index.md"); rmSync(mirror); assert.throws(() => assertPublication({ directory: dir, manifest, records: [record], open: true }), /missing/);
  const index = indexProjection([record]); delete index.items[0].badge; assert.throws(() => assertIndex(index, [record]), /projection/);
  const extra = indexProjection([record]); extra.items[0].fingerprint = "extra"; assert.throws(() => assertIndex(extra, [record]), /projection/);
  const config = { ...record, listing: { ...record.listing, type: "config", id: "example-config" }, badge: "none", config_sha256: sha256("config: checked\n"), assessed_config_sha256: sha256("config: checked\n") };
  const configs = routeManifest({ records: [config], policies: [], schemaBytes: read("scripts/hub/schema/listing-v1.json") }); const configDir = temp(t); emitManifest(configDir, configs, [config]);
  assertPublication({ directory: configDir, manifest: configs, records: [config], open: true });
  const download = path.join(configDir, "hub/configs/example-config/pipelock.yaml"); writeFileSync(download, "config: changed\n"); assert.throws(() => assertPublication({ directory: configDir, manifest: configs, records: [config], open: true }), /digest/);
  rmSync(download); assert.throws(() => assertPublication({ directory: configDir, manifest: configs, records: [config], open: true }), /missing/);
  assert.throws(() => routeManifest({ records: [{ ...config, assessed_config_sha256: "other" }], schemaBytes: "{}" }), /assessed/);
  const closedDir = temp(t), officialBytes = "signed official registry control\n", officialRoute = "/rules/existing/bundle.yaml";
  const closedManifest = { ...manifest, entries: [...manifest.entries, { route: officialRoute, kind: "bundle-download", ownership: "official-registry", representations: ["raw"], sha256: sha256(officialBytes) }] };
  mkdirSync(path.join(closedDir, "rules/existing"), { recursive: true }); writeFileSync(path.join(closedDir, officialRoute.slice(1)), officialBytes);
  assertPublication({ directory: closedDir, manifest: closedManifest, records: [record], open: false });
});

test("displayed-fact parsers preserve literal syntax and reject duplicate facts", () => {
  assert.deepEqual(htmlFacts('<code data-hub-fact="regex">&lt;x&gt; &amp; &quot;y&quot;</code>'), { regex: '<x> & "y"' });
  assert.deepEqual(markdownFacts('```\n{"hub_fact":"regex","value":"<x> & \\\"y\\\""}\n```'), { regex: '<x> & \\"y\\"'.replaceAll('\\"', '"') });
  assert.throws(() => htmlFacts('<i data-hub-fact="x">a</i><i data-hub-fact="x">b</i>'), /duplicate/);
  const html = '<code data-hub-fact="__proto__">extra</code>';
  const mirror = '```\n{"hub_fact":"__proto__","value":"extra"}\n```\n';
  assert.equal(Object.hasOwn(htmlFacts(html), "__proto__"), true);
  assert.equal(Object.hasOwn(markdownFacts(mirror), "__proto__"), true);
  assert.throws(() => htmlFacts(html + html), /duplicate/);
  assert.throws(() => markdownFacts(mirror + mirror), /invalid mirror fact/);
});


function catalogSource(t) {
  const dir = temp(t);
  for (const name of ["data", "content/hub", "layouts", "assets/hub", "scripts/hub"]) cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
  mkdirSync(path.join(dir, "content/learn"), { recursive: true });
  cpSync(path.join(root, "content/learn/mcp-security.md"), path.join(dir, "content/learn/mcp-security.md"));
  mkdirSync(path.join(dir, "content/blog"), { recursive: true }); writeFileSync(path.join(dir, "content/blog/pipelock-v370-release.md"), '---\ntitle: Release control\ndate: 2026-11-05\n---\n');
  symlinkSync(path.join(root, "static"), path.join(dir, "static"), "dir");
  mkdirSync(path.join(dir, "distribution"));
  for (const file of ["rules", "_headers", "robots.txt"]) cpSync(path.join(root, "static", file), path.join(dir, "distribution", file), { recursive: true });
  const items = [];
  for (const name of ["pipelock-community", "healthcare-phi-pii"]) {
    const bundleDir = path.join(root, "static/rules", name), reader = runHubcheck(binary, "reader", { bundle_dir: bundleDir, config: path.join(engineDir, "configs/claude-code.yaml") });
    const listing = listingFor(reader), file = path.join(dir, `${name}.yaml`); writeFileSync(file, stringify(listing)); items.push({ listing_file: file, bundle_dir: bundleDir });
  }
  const community = stage(t, bundle => { bundle.rules[0].description = '</code><script>alert("fixture")</script> ` fenced'; return bundle; });
  const communityReader = runHubcheck(binary, "reader", community.request);
  const communityListing = listingFor(communityReader), communityFile = path.join(dir, "community.yaml"); writeFileSync(communityFile, stringify(communityListing));
  const publisher = { id: "example", name: "Example maintainer", keys: [{ fingerprint: community.key.hex, added: "2026-11-05" }] };
  items.push({ listing_file: communityFile, bundle_dir: community.dir, publisher });
  const communityAssets = path.join(dir, "assets/hub/community/example/example-bundle"); mkdirSync(communityAssets, { recursive: true });
  cpSync(path.join(community.dir, "bundle.yaml"), path.join(communityAssets, "bundle.yaml")); cpSync(path.join(community.dir, "bundle.yaml.sig"), path.join(communityAssets, "bundle.yaml.sig"));
  cpSync(path.join(root, "package-lock.json"), path.join(dir, "package-lock.json"));
  mkdirSync(path.join(dir, "data/hub/first-party"), { recursive: true });
  const recipe = structuredClone(base); delete recipe.evidence.artifact;
  const recipeFile = path.join(dir, "data/hub/first-party/recipe.yaml");
  writeFileSync(recipeFile, stringify(recipe)); items.push({ listing_file: recipeFile });
  const source = { root: dir, items, binary, repository, config: path.join(engineDir, "configs/claude-code.yaml"), engine: JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json"))), policies: [], publishers: [publisher], mode: "report" };
  return { dir, source };
}

test("real Hugo joins reader facts, rule/core routes, exact mirrors and digest guards", { skip: !native }, t => {
  const { dir, source } = catalogSource(t);
  const catalog = generateCatalog(source), generated = path.join(dir, "data/hub/generated"); writeCatalog(generated, catalog); writeCatalog(generated, generateCatalog(source), { check: true });
  assert.equal(catalog["listings.json"].find(record => record.listing.id === "pipelock-community").badge, "official");
  const overlay = `themesDir = ${JSON.stringify(path.join(root, "themes"))}\ncontentDir = ${JSON.stringify(path.join(dir, "content"))}\nassetDir = ${JSON.stringify(path.join(dir, "assets"))}\ndataDir = ${JSON.stringify(path.join(dir, "data"))}\nstaticDir = ${JSON.stringify(path.join(dir, "distribution"))}\n`;
  writeFileSync(path.join(dir, "hugo.toml"), overlay + read("hugo.toml"));
  const build = open => { writeFileSync(path.join(dir, "data/hub/launch.toml"), `open = ${open}\n`); const result = spawnSync(process.env.HUGO_BIN || "hugo", ["--source", dir, "--config", path.join(dir, "hugo.toml"), "--destination", path.join(dir, "public"), "--cleanDestinationDir", "--clock", "2026-11-05T00:00:00Z"], { encoding: "utf8", timeout: 120000 }); assert.ifError(result.error); return { ...result, output: result.stdout + result.stderr }; };
  const built = build(true); assert.equal(built.status, 0, built.output);
  const manifest = catalog["routes.json"], records = catalog["listings.json"];
  assertPublication({ directory: path.join(dir, "public"), manifest, records, open: true, requireBuild: false });
  if (process.env.HUBCHECK_PREVIEW_DIR) cpSync(path.join(dir, "public"), process.env.HUBCHECK_PREVIEW_DIR, { recursive: true });
  if (process.env.HUBCHECK_CAPTURE_DIR) {
    const destination = process.env.HUBCHECK_CAPTURE_DIR; mkdirSync(destination, { recursive: true });
    for (const [input, name] of [["learn/mcp-security/index.md", "learn-mcp-security.md"], ["hub/recipes/example-recipe/index.md", "hub-example-recipe.md"]]) cpSync(path.join(dir, "public", input), path.join(destination, name));
  }
  const original = readFileSync(path.join(generated, "listings.json"));
  const corrupt = structuredClone(records); const corruptRecord = corrupt.find(record => record.badge === "official"); corruptRecord.bundle_sha256 = "0".repeat(64); corruptRecord.listing.bundle_sha256 = "0".repeat(64); writeFileSync(path.join(generated, "listings.json"), JSON.stringify(corrupt));
  const refused = build(true); assert.notEqual(refused.status, 0); assert.match(refused.output, /hub served bundle digest differs/);
  writeFileSync(path.join(generated, "listings.json"), original);
  const closed = build(false); assert.equal(closed.status, 0, closed.output);
  assertPublication({ directory: path.join(dir, "public"), manifest, records, open: false });
});

test("official workloads bind exact served producer bytes and supply every missing experimental negative", { skip: !native || !process.env.HUBCHECK_RULES_REPOSITORY }, () => {
  let count = 0, supplementary = 0;
  for (const name of ["pipelock-community", "healthcare-phi-pii"]) {
    const reader = runHubcheck(binary, "reader", { bundle_dir: path.join(root, "static/rules", name), config: path.join(engineDir, "configs/claude-code.yaml") });
    const own = officialOwnInputs({ repository: process.env.HUBCHECK_RULES_REPOSITORY, reader });
    assert.deepEqual(own.map(input => input.rule_id), reader.declared.filter(rule => rule.status !== "deprecated").map(rule => rule.id));
    for (const input of own) { assert.ok(input.positive[0].text); assert.ok(input.negative[0].text); supplementary += Number(input.negative[0].origin.startsWith("site:")); }
    count += own.length;
    assert.throws(() => officialOwnInputs({ repository: process.env.HUBCHECK_RULES_REPOSITORY, reader: { ...reader, bundle_sha256: "changed" } }), /not current/);
    if (name === "pipelock-community") {
      const flipped = structuredClone(reader);
      flipped.declared.find(rule => rule.id === "dlp-doppler-service-token").status = "stable";
      assert.throws(() => officialOwnInputs({ repository: process.env.HUBCHECK_RULES_REPOSITORY, reader: flipped }), /missing official/);
    }
  }
  assert.equal(count, 56); assert.equal(supplementary, 10);
  const caps = workloadCaps(repository);
  assert.equal(caps.engine_commit, "d6bb0003c1dac00d3b2df8dd1eb1a51ed8cecd6a");
  assert.equal(caps.dlp, caps.presets.find(preset => preset.name === "claude-code").request_bytes);
  assert.equal(caps.injection, Math.max(...caps.presets.map(preset => preset.response_mb)) * 1024 * 1024);
  assert.equal(caps["tool-poison"], caps.injection);
});

test("fixture-derived near inputs bind the first matching producer line and the actual transport", { skip: !native }, t => {
  const fixture = stage(t);
  const toolTextLimit = workloadCaps(repository).tool_definition.bytes;
  for (const rule of fixture.bundle.rules.filter(rule => rule.status !== "deprecated")) {
    const positive = [{ origin: "fixture:L1", text: "An unrelated input." }, { origin: "fixture:L2", text: rule.pattern.regex }];
    const bytes = 256; // Diagnostic fixture cap, not an admission limit.
    const near = nearInput({ binary, request: fixture.request, rule: { ...rule, scan_field: rule.pattern.scan_field }, positive, bytes, toolTextLimit });
    assert.equal(near.evidence.generator, NEAR_GENERATOR);
    assert.equal(near.evidence.fixture_origin, "fixture:L2");
    assert.equal(near.evidence.fixture_sha256, sha256(positive[1].text));
    assert.equal(near.evidence.text_sha256, sha256(near.text));
    assert.equal(near.evidence.production_target_match, false);
    assert.ok(near.evidence.trimmed_runes > 0);
    assert.ok(near.evidence.transport_bytes <= bytes);
    assert.ok(Buffer.byteLength(near.text) <= bytes);
    assert.throws(() => nearInput({ binary, request: fixture.request, rule, positive: positive.slice(0, 1), bytes }), /no producer line/);
  }
  for (const scan_field of ["name", "description"]) {
    const escaped = stage(t, bundle => {
      const rule = bundle.rules.find(rule => rule.type === "tool-poison");
      rule.pattern = { regex: '🚧"<>&ending', scan_field };
      return bundle;
    });
    const rule = { ...escaped.bundle.rules.find(rule => rule.type === "tool-poison"), scan_field };
    const positive = [{ origin: "fixture:unicode", text: rule.pattern.regex }];
    const near = nearInput({ binary, request: escaped.request, rule, positive, bytes: 256, toolTextLimit });
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(near.text)), near.text);
    const repeated = repeatNear(rule, near.evidence.seed, 256, toolTextLimit);
    assert.equal(repeated.text, near.text);
    assert.equal(repeated.transportBytes, near.evidence.transport_bytes);
    const full = nearInput({ binary, request: escaped.request, rule, positive, bytes: workloadCaps(repository)["tool-poison"], toolTextLimit });
    assert.ok(full.evidence.tool_definition_text_bytes <= toolTextLimit);
    assert.ok(full.evidence.transport_bytes > toolTextLimit);
  }
});

test("near generation holds unusable inputs and records production normalization rather than claiming a negative", { skip: !native }, t => {
  for (const [regex, text, reason] of [
    ["X", "X", /empty seed/],
    [".*", "anything", /empty-matching pattern/],
    ["abcX|abc abc", "abcX", /repetition creates a match/],
  ]) {
    const fixture = stage(t, bundle => { bundle.rules[0].pattern.regex = regex; return bundle; });
    const rule = fixture.bundle.rules[0];
    assert.throws(() => nearInput({ binary, request: fixture.request, rule, positive: [{ origin: "fixture:L1", text }], bytes: 256 }), reason);
  }
  const fixture = stage(t, bundle => { bundle.rules[1].pattern.regex = "X{20}"; return bundle; });
  const rule = fixture.bundle.rules[1], positive = [{ origin: "fixture:L1", text: "X".repeat(20) }];
  const near = nearInput({ binary, request: fixture.request, rule, positive, bytes: 256 });
  assert.equal(near.evidence.raw_negative, true);
  assert.equal(/X{20}/.test(near.text), false);
  assert.equal(near.evidence.production_target_match, true);
  assert.throws(() => nearInput({ binary, request: fixture.request, rule, positive, bytes: 0 }), /cap required/);
  const tooLarge = workloadCaps(repository).dlp + 1;
  assert.throws(() => nearInput({ binary, request: fixture.request, rule, positive, bytes: tooLarge }), /outside the pinned preset/);
});

// Rewrites only the native near-derivation record. Each case changes one field
// that Node independently reconstructs or binds, so a disabled cross-check fails.
function tamperedNative(t, mutation) {
  const file = path.join(temp(t), "hubcheck");
  writeFileSync(file, `#!/bin/sh\n"${binary}" "$@" | "${process.execPath}" -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));if(o.status==="generated"){${mutation}}process.stdout.write(JSON.stringify(o))'\n`);
  chmodSync(file, 0o755);
  return file;
}

test("Node refuses a native near derivation that differs from its own reconstruction", { skip: !native }, t => {
  const fixture = stage(t), toolTextLimit = workloadCaps(repository).tool_definition.bytes;
  const injection = fixture.bundle.rules[0], tool = { ...fixture.bundle.rules[2], scan_field: fixture.bundle.rules[2].pattern.scan_field };
  const run = (mutation, rule) => nearInput({ binary: tamperedNative(t, mutation), request: fixture.request, rule, positive: [{ origin: "fixture:L1", text: rule.pattern.regex }], bytes: 256, toolTextLimit });
  assert.ok(run("", injection).text && run("", tool).text);
  for (const [mutation, reason, rule] of [
    ['o.text_sha256="0".repeat(64)', /transport bytes differ/, injection],
    ["o.transport_bytes+=1", /transport bytes differ/, injection],
    ["o.tool_definition_text_bytes+=1", /transport bytes differ/, tool],
    ['o.fixture_sha256="0".repeat(64)', /producer binding differs/, injection],
    ['o.fixture_origin="fixture:other"', /producer binding differs/, injection],
    ["o.span_start+=1", /producer span differs/, injection],
    ["o.span_end+=1", /producer span differs/, injection],
    ["o.trimmed_runes+=1", /producer span differs/, injection],
    ["o.raw_negative=false", /derivation differs/, injection],
    ["o.cap_bytes+=1", /derivation differs/, injection],
    ['o.generator="other"', /derivation differs/, injection],
    ["o.tool_definition_cap_bytes+=1", /tool-definition limit differs/, tool],
  ]) assert.throws(() => run(mutation, rule), reason, mutation);
});

test("the harness tool-definition limit mirrors the pinned declaration and a pair count is required", { skip: !native }, t => {
  const declared = read("scripts/hub/pipelock-harness/main.go").match(/^const toolDefinitionTextBytes = (\d+)$/m);
  assert.equal(Number(declared?.[1]), toolDefinitionLimit(repository).bytes);
  const fixture = stage(t), engine = JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json")));
  for (const pairs of [0, undefined, 1.5]) assert.throws(() => benchmarkReport({ binary, request: fixture.request, engine, workloadSpec: { inputs: [], generator: "hub-harness-test", parameters: {} }, pairs, output: temp(t), root }), /positive measurement pair count/);
});

test("benchmark report refuses a caller reader and a different executable", { skip: !native }, t => {
  const fixture = stage(t);
  const engine = JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json")));
  const inputs = fixture.bundle.rules.filter(rule => rule.status !== "deprecated").map(rule => ({ rule_id: rule.id, positive: [{ origin: "fixture", text: rule.pattern.regex }], negative: [{ origin: "fixture", text: "A normal description of project files." }], clean: [{ origin: "fixture", text: "Read the setup & <instructions>." }], near: [{ origin: "fixture", text: "fixture filler" }] }));
  const spec = { inputs, generator: "hub-harness-test", parameters: { pairs: 1 } };
  const report = benchmarkReport({ binary, request: fixture.request, engine, workloadSpec: spec, pairs: 1, output: temp(t), root });
  assert.equal(report.verdict.status, "unassessed");
  assert.equal(report.results.workload_sha256, report.bindings.executed_workload_sha256);
  assert.equal(report.bindings.bundle_sha256, sha256(fixture.bytes));
  assert.throws(() => benchmarkReport({ binary, request: fixture.request, reader: { bundle_sha256: "f".repeat(64), declared: [] }, engine, workloadSpec: spec, pairs: 1, output: temp(t), root }), /derived/);
  assert.throws(() => benchmarkReport({ binary, request: fixture.request, engine: { ...engine, binary_sha256: "0".repeat(64) }, workloadSpec: spec, pairs: 1, output: temp(t), root }), /engine executable/);
});


test("Unicode naming refuses brand lookalikes and active or retained collisions", () => {
  const listing = { ...base, id: "acme-dlp", bundle_name: "acme-dlp", title: "Acme rules" };
  const publisher = { id: "acme", name: "Acme maintainer" };
  assertCommunityNames(listing, publisher);
  for (const name of ["pipe1ock-community", "pipelockcommunity", "communlty-pipelock", "pipelab-rules", "pipel0ck"]) {
    assert.throws(() => assertCommunityNames({ ...listing, bundle_name: name }, publisher), /reserved brand/);
  }
  assert.throws(() => assertCommunityNames({ ...listing, maintainer: { ...listing.maintainer, name: "PipeLab Team" } }, publisher), /reserved brand/);
  assert.throws(() => assertCommunityNames({ ...listing, title: "pipeIock" }, publisher), /reserved brand/);
  assert.throws(() => assertCommunityNames(listing, { ...publisher, name: "\u202eAcme" }), /invisible or control/);
  assert.equal(nameSkeleton("\u0440\u0456pelock"), nameSkeleton("pipelock"));
  assert.equal(nameSkeleton("Stra\u00dfe"), nameSkeleton("STRASSE"));
  assert.equal(nameSkeleton("\uff30\uff49\uff50\uff45\uff2c\uff41\uff42"), nameSkeleton("PipeLab"));
  assert.throws(() => assertNamingRuntime({ unicode: "other", icu: process.versions.icu }), /pinned/);
  const record = { listing };
  assertCatalogNames([record]);
  assert.throws(() => assertCatalogNames([record, { listing: { id: "acme-d1p" } }]), /collides/);
  assert.throws(() => assertCatalogNames([record], ["acme-d1p"]), /retained/);
  assert.throws(() => assertCatalogNames([{ listing: { id: "acme-dop", bundle_name: "acme-dop" } }, { listing: { id: "acme-d0p", bundle_name: "acme-d0p" } }]), /collides/);
  assert.equal(nameSkeleton("pipel0ck"), nameSkeleton("pipelock"));
});


test("signed third-party lookalike names never acquire a community record", { skip: !native }, t => {
  for (const name of ["acme-dlp", "pipe1ock-community", "pipelockcommunity"]) {
    const fixture = stage(t, b => ({ ...b, name }));
    const reader = runHubcheck(binary, "reader", fixture.request);
    const independent = verifyBundle({ bytes: fixture.bytes, signature: fixture.signature, official: [], publisher: [fixture.key.hex] });
    const args = { listing: listingFor(reader), reader, independent, publisher: { id: "acme", name: "Acme", keys: [fixture.key.hex] }, tooling: {} };
    if (name === "acme-dlp") assert.equal(deriveRecord(args).badge, "community");
    else assert.throws(() => deriveRecord(args), /reserved brand/);
  }
});


test("official fixtures preserve each producer input rather than joining lines", () => {
  assert.deepEqual(producerInputs("first\r\n\n  \n\uFEFF\n# literal input\nlast", "rules:revision:fixture"), [
    { origin: "rules:revision:fixture:L1", text: "first" },
    { origin: "rules:revision:fixture:L4", text: "\uFEFF" },
    { origin: "rules:revision:fixture:L5", text: "# literal input" },
    { origin: "rules:revision:fixture:L6", text: "last" },
  ]);
  assert.throws(() => producerInputs("\n \n", "empty"), /empty/);
});


test("catalog verification uses exactly one registered publisher", { skip: !native }, t => {
  const { source } = catalogSource(t);
  assert.throws(() => generateCatalog({ ...source, publishers: [] }), /registered publisher/);
  assert.throws(() => generateCatalog({ ...source, publishers: [...source.publishers, ...source.publishers] }), /registered publisher/);
  const items = source.items.map(item => item.publisher ? { ...item, publisher: { id: item.publisher.id, name: "PipeLab spoof", keys: [] } } : item);
  const catalog = generateCatalog({ ...source, items });
  assert.equal(catalog["listings.json"].find(record => record.badge === "community").publisher_id, source.publishers[0].id);
  assert.equal(catalog["references.json"].find(record => record.reference_kind === "publisher").facts["publisher.name"], source.publishers[0].name);
});

test("catalog generation joins lifecycle removals and retains their names", { skip: !native }, t => {
  const { dir, source } = catalogSource(t);
  const removed = { id: "retired-listing", publisher_id: "example", route: "/hub/community/example/older-bundle/", facts: { "bundle.name": "example-bund1e" } };
  assert.throws(() => generateCatalog({ ...source, removed: [removed] }), /retained name/);
  const generated = path.join(dir, "data/hub/generated");
  mkdirSync(generated, { recursive: true });
  writeFileSync(path.join(generated, "inventory.json"), jsonBytes({ format: 1, active: [], removed: [removed.id], retained_names: [removed.facts["bundle.name"]] }));
  assert.throws(() => generateCatalog(source), /retained name/);
  writeFileSync(path.join(generated, "inventory.json"), jsonBytes({ format: 1, active: [], removed: [], retained_names: [] }));
  removed.facts["bundle.name"] = "older-bundle";
  const catalog = generateCatalog({ ...source, removed: [removed], baseline: [{ listing_id: removed.id, route: removed.route + "old-rule/", representations: ["html", "mirror"] }] });
  assert.deepEqual(catalog["inventory.json"].removed, [removed.id]);
  assert.deepEqual(catalog["inventory.json"].retained_names, ["older-bundle", removed.id]);
  assert.ok(catalog["routes.json"].entries.some(entry => entry.route === removed.route + "old-rule/" && entry.kind === "removal"));
});

test("routine catalogs refuse failed or unassessed bound measurements", { skip: !native }, t => {
  const { dir, source } = catalogSource(t), pairs = 3;
  const methodFile = path.join(dir, "data/hub/benchmark-method.json"), limitsFile = path.join(dir, "data/hub/latency-limits.json");
  const method = JSON.parse(readFileSync(methodFile)); method.pairs = pairs; writeFileSync(methodFile, jsonBytes(method));
  for (const item of source.items.filter(item => item.bundle_dir)) {
    const reader = runHubcheck(binary, "reader", { bundle_dir: item.bundle_dir, config: source.config, trusted_keys: item.publisher?.keys.map(key => ({ name: "fixture", public_key: key.fingerprint })) });
    item.workload_spec = { generator: "test:catalog-admission", parameters: {}, inputs: reader.declared.filter(rule => rule.status !== "deprecated").map(rule => ({ rule_id: rule.id, ...Object.fromEntries(["positive", "negative", "clean", "near"].map(group => [group, [{ origin: "test:synthetic-evidence", text: "fixture" }]])) })) };
    const workload = bindWorkload({ rules: reader.declared, ...item.workload_spec }), executed = goWorkloadSHA256(workload.harness);
    const bindings = measurementBindings({ reader, workload, engine: source.engine, method: measurementMethod(dir, source.config, pairs), executedWorkloadSHA256: executed });
    const measured = { ...results(12, executed), bundle_sha256: reader.bundle_sha256, config_sha256: bindings.method.base_config_sha256 };
    measured.rules = Object.fromEntries(bindings.measured_rule_ids.map(id => [id, structuredClone(measured.bundle)]));
    item.measurement_reference = writeMeasurement(path.join(dir, "data/hub/measurements"), measurementArtifact(bindings, measured, { synthetic: true }));
  }
  // Synthetic limits exercise admission; they are never site policy.
  writeFileSync(limitsFile, jsonBytes({ rule_ratio: 1, bundle_ratio: 1, deadline_ns: 15 }));
  assert.ok(generateCatalog({ ...source, mode: "routine" })["listings.json"].length);
  for (const [limits, status] of [[{ rule_ratio: 0.1, bundle_ratio: 0.1, deadline_ns: 15 }, "fail"], [{}, "unassessed"]]) {
    writeFileSync(limitsFile, jsonBytes(limits));
    assert.throws(() => generateCatalog({ ...source, mode: "routine" }), /passing latency measurement required/);
    assert.equal(generateCatalog(source)["listings.json"].find(record => record.badge === "official").measurement.verdict.status, status);
  }
});

test("benchmark refuses signed bundle or config replacement between reader and bench", { skip: !native }, t => {
  for (const replacementKind of ["bundle", "config"]) {
    const fixture = stage(t), dir = temp(t), wrapper = path.join(dir, "hubcheck");
    const config = parse(readFileSync(fixture.request.config, "utf8"));
    fixture.request.config = path.join(fixture.dir, "base.yaml"); writeFileSync(fixture.request.config, stringify(config));
    config.request_body_scanning.max_body_bytes = 1024; writeFileSync(path.join(dir, "config.yaml"), stringify(config));
    const replacement = Buffer.from(stringify({ ...fixture.bundle, version: "2026.11.1" }));
    writeFileSync(path.join(dir, "bundle.yaml"), replacement);
    writeFileSync(path.join(dir, "bundle.yaml.sig"), sign(null, replacement, fixture.key.privateKey).toString("base64") + "\n");
    writeFileSync(wrapper, `#!${process.execPath}
  const fs=require("node:fs"),cp=require("node:child_process"),p=require("node:path"),input=fs.readFileSync(0),r=JSON.parse(input);if(process.argv[2]==="bench"){if(${JSON.stringify(replacementKind)}==="config")fs.copyFileSync(p.join(${JSON.stringify(dir)},"config.yaml"),r.config);else for(const f of ["bundle.yaml","bundle.yaml.sig"])fs.copyFileSync(p.join(${JSON.stringify(dir)},f),p.join(r.bundle_dir,f));}process.stdout.write(cp.execFileSync(${JSON.stringify(binary)},process.argv.slice(2),{input}));
  `);
    chmodSync(wrapper, 0o755);
    const engine = { ...JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json"))), binary_sha256: sha256(readFileSync(wrapper)) };
    const inputs = fixture.bundle.rules.filter(rule => rule.status !== "deprecated").map(rule => ({ rule_id: rule.id, ...Object.fromEntries(["positive", "negative", "clean", "near"].map(group => [group, [{ origin: "test:replacement", text: "fixture filler" }]])) }));
    const output = path.join(dir, "report");
    assert.throws(() => benchmarkReport({ binary: wrapper, request: fixture.request, engine, workloadSpec: { inputs, generator: "test:replacement", parameters: {} }, pairs: 1, output, root }), new RegExp(`executed ${replacementKind} digest differs`));
    assert.equal(existsSync(output), false);
  }
});

test("failed native staging removes partial temporary files", { skip: !native || process.platform !== "linux" }, t => {
  const fixture = stage(t), staging = temp(t);
  const result = spawnSync("prlimit", ["--fsize=0:0", "--", binary, "reader"], { input: JSON.stringify(fixture.request), encoding: "utf8", env: { ...process.env, TMPDIR: staging } });
  assert.ifError(result.error); assert.notEqual(result.status, 0); assert.match(result.stderr, /REFUSED/);
  assert.deepEqual(readdirSync(staging), []);
});

test("harness builds into a relative capture path", { skip: !native }, t => {
  const outputRoot = path.relative(process.cwd(), path.join(temp(t), "capture with space"));
  const built = buildHarness({ repository, outputRoot });
  assert.equal(path.isAbsolute(built.destination), true);
  assert.equal(existsSync(built.binary), true);
});

test("clean snapshots load from a checkout path containing spaces and a hash", async t => {
  const dir = path.join(temp(t), "site #1");
  cpSync(path.join(root, "scripts/hub"), path.join(dir, "scripts/hub"), { recursive: true });
  symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "dir");
  const module = await import(pathToFileURL(path.join(dir, "scripts/hub/workload.mjs")).href);
  assert.equal(module.versionedCleanInputs().length, 2);
});

test("default official benchmark honors smaller effective configuration caps", { skip: !native || !process.env.HUBCHECK_RULES_REPOSITORY }, t => {
  const dir = temp(t), config = parse(readFileSync(path.join(engineDir, "configs/strict.yaml"), "utf8"));
  config.fetch_proxy.max_response_mb = 1;
  config.request_body_scanning.max_body_bytes = 512;
  const file = path.join(dir, "strict-small.yaml"); writeFileSync(file, stringify(config));
  const request = { bundle_dir: path.join(root, "static/rules/healthcare-phi-pii"), config: file };
  const engine = JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json")));
  const report = benchmarkReport({ binary, request, engine, repository, rulesRepository: process.env.HUBCHECK_RULES_REPOSITORY, pairs: 1, output: path.join(dir, "report"), root });
  assert.equal(report.verdict.status, "unassessed");
  assert.equal(report.bindings.workload_parameters.caps.dlp, 512);
  assert.equal(report.bindings.workload_parameters.caps.injection, 1024 * 1024);
  assert.equal(report.results.bundle_sha256, report.bindings.bundle_sha256);
});
