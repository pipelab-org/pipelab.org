import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { verifyBundle, officialKeys, compareReaderSignature, readBundleFiles } from "../scripts/hub/verify-bundle.mjs";
import { deriveRecord, indexProjection, assertIndex } from "../scripts/hub/records.mjs";
import { canonical, contentDigest, bindWorkload, measurementArtifact, writeMeasurement, acceptedMeasurement, latencyVerdict, assertRegeneration, treeIdentity, jsonBytes, sha256, goWorkloadSHA256, measurementBindings } from "../scripts/hub/evidence.mjs";
import { routeManifest } from "../scripts/hub/route-manifest.mjs";
import { assertPublication, htmlFacts, markdownFacts, representationPaths } from "../scripts/hub/parity.mjs";
import { officialOwnInputs, nearInput, prefixCoverage } from "../scripts/hub/workload.mjs";
import { runHubcheck, generateCatalog, writeCatalog, assertFirstPartyListing } from "../scripts/hub/generate.mjs";
import { benchmarkReport } from "../scripts/hub/benchmark-report.mjs";

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
function results(maximum = 12, workload_sha256 = "executed") { const measured = { baseline: timer([10, 10, 10]), target: timer([12, 12, maximum]), ratio: 0.2 }; return { rules: { "test-rule": structuredClone(measured) }, bundle: measured, deprecated: [], workload_sha256 }; }

// Numeric values in these synthetic unit cases are evidence fixtures, not policy.
test("measurement evidence binds full workload, supports immutable supersession, and recomputes deadlines", t => {
  const dir = temp(t), inputs = [{ rule_id: "test-rule", positive: [{ origin: "producer/positive", text: "match" }], negative: [{ origin: "site/supplement", text: "clean" }], clean: [{ origin: "site/snapshot", text: "guide" }], near: [{ origin: "generator/v1", text: "mat filler" }] }];
  const workload = bindWorkload({ rules: [{ id: "test-rule", status: "stable" }], inputs, generator: "v1", parameters: { bytes: 20 } });
  const changed = structuredClone(inputs); changed[0].negative[0].text = "different";
  assert.notEqual(workload.digest, bindWorkload({ rules: [{ id: "test-rule", status: "stable" }], inputs: changed, generator: "v1", parameters: { bytes: 20 } }).digest);
  assert.throws(() => bindWorkload({ rules: [{ id: "test-rule", status: "stable" }], inputs: [], generator: "v1", parameters: {} }), /mapping/);
  const executed = goWorkloadSHA256(workload.harness);
  const binding = { bundle_sha256: "bundle", workload_sha256: workload.digest, executed_workload_sha256: "executed", measured_rule_ids: ["test-rule"], engine: { source: "engine-a" }, method: { pairs: 3, gomaxprocs: 1, interleave: ["baseline", "target"], measurement_policy: { min_confidence: "low", include_experimental: true } } };
  assert.throws(() => measurementArtifact({ ...binding, executed_workload_sha256: "" }, results()), /missing/);
  assert.throws(() => measurementArtifact(binding, results(12, "other")), /executed workload/);
  assert.throws(() => measurementBindings({ reader: { bundle_sha256: "bundle", declared: [{ id: "test-rule", status: "stable" }] }, workload, engine: binding.engine, method: binding.method, executedWorkloadSHA256: "other" }), /executed workload/);
  assert.equal(measurementBindings({ reader: { bundle_sha256: "bundle", declared: [{ id: "test-rule", status: "stable" }] }, workload, engine: binding.engine, method: binding.method, executedWorkloadSHA256: executed }).executed_workload_sha256, executed);
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
  for (const mutate of [b => ({ ...b, unexpected: true }), b => { b.rules[0].status = "unknown"; return b; }, b => { delete b.key_id; return b; }]) {
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
  const measured = runHubcheck(binary, "bench", { ...fixture.request, pairs: 1, workload });
  assert.equal(measured.workload_sha256, goWorkloadSHA256(workload));
  assert.deepEqual(Object.keys(measured.rules).sort(), ["low-rule", "stable-rule", "stable-rule-long"]);
  assert.deepEqual(measured.deprecated, ["deprecated-rule"]); assert.equal(measured.bundle.target.completed, true);
  assert.equal(latencyVerdict(measured, {}).status, "unassessed");
  const timedOut = runHubcheck(binary, "bench", { ...fixture.request, pairs: 1, workload, deadline_ns: 1 });
  assert.equal(latencyVerdict(timedOut, {}).status, "fail");
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
});


test("real Hugo joins reader facts, rule/core routes, exact mirrors and digest guards", { skip: !native }, t => {
  const dir = temp(t);
  for (const name of ["data", "content/hub", "layouts", "assets/hub"]) cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
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
  const source = { root, items, binary, repository, config: path.join(engineDir, "configs/claude-code.yaml"), engine: JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json"))), policies: [], publishers: [publisher], mode: "report" };
  const catalog = generateCatalog(source), generated = path.join(dir, "data/hub/generated"); writeCatalog(generated, catalog); writeCatalog(generated, generateCatalog(source), { check: true });
  assert.equal(catalog["listings.json"].find(record => record.listing.id === "pipelock-community").badge, "official");
  const overlay = `themesDir = ${JSON.stringify(path.join(root, "themes"))}\ncontentDir = ${JSON.stringify(path.join(dir, "content"))}\nassetDir = ${JSON.stringify(path.join(dir, "assets"))}\ndataDir = ${JSON.stringify(path.join(dir, "data"))}\nstaticDir = ${JSON.stringify(path.join(dir, "distribution"))}\n`;
  writeFileSync(path.join(dir, "hugo.toml"), overlay + read("hugo.toml"));
  const build = open => { writeFileSync(path.join(dir, "data/hub/launch.toml"), `open = ${open}\n`); const result = spawnSync(process.env.HUGO_BIN || "hugo", ["--source", dir, "--config", path.join(dir, "hugo.toml"), "--destination", path.join(dir, "public"), "--cleanDestinationDir", "--clock", "2026-11-05T00:00:00Z"], { encoding: "utf8", timeout: 120000 }); return { ...result, output: result.stdout + result.stderr }; };
  const built = build(true); assert.equal(built.status, 0, built.output);
  const manifest = catalog["routes.json"], records = catalog["listings.json"];
  assertPublication({ directory: path.join(dir, "public"), manifest, records, open: true, requireBuild: false });
  if (process.env.HUBCHECK_CAPTURE_DIR) {
    const destination = process.env.HUBCHECK_CAPTURE_DIR; mkdirSync(destination, { recursive: true });
    for (const [input, name] of [["learn/mcp-security/index.md", "learn-mcp-security.md"]]) cpSync(path.join(dir, "public", input), path.join(destination, name));
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
  assert.ok(nearInput({ binary, regex: "literal-prefix", bytes: 32 }).text.length);
  assert.throws(() => nearInput({ binary, regex: ".*", bytes: 32 }), /held/);
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
