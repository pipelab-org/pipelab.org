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
import { bundleWorkload, officialOwnInputs, producerInputs, nearInput, repeatNear, workloadCaps, NEAR_GENERATOR } from "../scripts/hub/workload.mjs";
import { runHubcheck, generateCatalog, prepareBoundCatalog, writeCatalog, assertFirstPartyListing } from "../scripts/hub/generate.mjs";
import { benchmarkReport } from "../scripts/hub/benchmark-report.mjs";
import { buildHarness, toolDefinitionLimit } from "../scripts/hub/build-harness.mjs";
import { assertExtractedPage, verifyRetrieval, withTestDestination } from "../scripts/hub/retrieval.mjs";
import { applyConfigChanges } from "../scripts/hub/config-changes.mjs";
import { assessConfig } from "../scripts/hub/config-assessment.mjs";
import { firstPartyRecipes, verifierEvidence } from "../scripts/hub/first-party.mjs";
import { reconcileLifecycle } from "../scripts/hub/lifecycle.mjs";
import { assertClosedDiscovery } from "../scripts/hub/acceptance.mjs";
import { publicationClearancePayload, publicationIdentity } from "../scripts/hub/deployment-evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
// A committed count binds every measurement to the same number of pairs.
const measurementPairs = JSON.parse(readFileSync(path.join(root, "data/hub/benchmark-method.json"))).pairs ?? 1;
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
  writeFileSync(path.join(dir, "bundle.yaml"), bytes); writeFileSync(path.join(dir, "bundle.yaml.sig"), signature); writeFileSync(path.join(dir, "LICENSE"), fixtureLicense);
  return { dir, key, bundle, bytes, signature, request: { bundle_dir: dir, config: path.join(engineDir || "", "configs/claude-code.yaml"), trusted_keys: [{ name: "example", public_key: key.hex }] } };
}
const fixtureLicense = read("static/rules/pipelock-community/license.txt");
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
  assert.throws(() => benchmarkReport({ binary, request: fixture.request, engine, workloadSpec: { inputs, generator: "test:oversized", parameters: {} }, pairs: measurementPairs, output, root }), /REFUSED/);
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

test("closed discovery and file checks cover bare Hub and schema routes", t => {
  const dir = temp(t);
  const manifest = { entries: [] };
  const closed = () => assertPublication({ directory: dir, manifest, records: [], open: false });
  for (const relative of ["sitemap.xml", "_redirects", "index.xml", "llms.txt", "llms-full.txt",
      ".well-known/product-facts.json", "index.md"]) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), "");
  }

  const redirects = path.join(dir, "_redirects");
  writeFileSync(redirects, "/hubspot /partners/ 302\n");
  assert.doesNotThrow(() => assertClosedDiscovery(dir));
  for (const route of ["/hub", "/schemas/pipelab-hub"]) {
    const file = path.join(dir, route.slice(1));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "unmanifested");
    assert.throws(closed, /closed hub output present/);
    rmSync(file);
    writeFileSync(redirects, "/alias " + route + " 302\n");
    assert.throws(() => assertClosedDiscovery(dir), /closed site exposes a Hub route in _redirects/);
  }
  assert.doesNotThrow(closed);
});

test("recorded rule routes become removal pages with their parent listing", () => {
  const schemaBytes = read("scripts/hub/schema/listing-v1.json");
  const id = "official-fixture";
  const parent = { listing: { id, type: "bundle", bundle_name: id }, badge: "official",
    route: "/hub/bundles/" + id + "/", bundle_sha256: "a".repeat(64), signature_sha256: "b".repeat(64),
    facts: {}, reader: { declared: [{ id: "example-rule", name: "Example rule" }], policies: { stock: { loaded: [] } } },
    license_material: { license: { name: "LICENSE", route: "/rules/" + id + "/license.txt", text: fixtureLicense, sha256: sha256(fixtureLicense) }, notices: [] } };
  const active = routeManifest({ records: [parent], policies: [], schemaBytes });
  const rule = active.entries.find(entry => entry.kind === "rule");
  const removed = { id, route: parent.route, publisher_id: "official", facts: { Reason: "Withdrawn." } };

  const withdrawn = routeManifest({ records: [], removed: [removed], baseline: active.entries, policies: [], schemaBytes });
  const removal = withdrawn.entries.find(entry => entry.route === rule.route);
  assert.equal(removal?.kind, "removal");
  assert.equal(removal.indexable, false);
  assert.deepEqual(removal.representations, ["html", "mirror"]);
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
  mkdirSync(path.join(dir, "content/blog"), { recursive: true }); writeFileSync(path.join(dir, "content/blog/pipelock-v380-release.md"), '---\ntitle: Release control\ndate: 2026-11-05\n---\n');
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
  cpSync(path.join(community.dir, "LICENSE"), path.join(communityAssets, "license.txt"));
  cpSync(path.join(root, "package-lock.json"), path.join(dir, "package-lock.json"));
  mkdirSync(path.join(dir, "data/hub/first-party"), { recursive: true });
  const recipe = structuredClone(base); delete recipe.evidence.artifact;
  const recipeFile = path.join(dir, "data/hub/first-party/recipe.yaml");
  writeFileSync(recipeFile, stringify(recipe)); items.push({ listing_file: recipeFile });
  const source = { root: dir, items, binary, repository, config: path.join(engineDir, "configs/claude-code.yaml"), engine: JSON.parse(readFileSync(path.join(engineDir, "engine-identity.json"))), policies: [], publishers: [publisher], mode: "report" };
  return { dir, source };
}

test("generation lists a non-default OSI license only under an approval of the delivered text", { skip: !native }, t => {
  const { dir, source } = catalogSource(t);
  const item = source.items.find(entry => entry.publisher);
  const listing = parse(readFileSync(item.listing_file, "utf8"));
  const text = "Mozilla Public License Version 2.0\n\nFixture text for an OSI-approved license outside the default set.\n";
  const delivered = path.join(item.bundle_dir, "LICENSE");
  const retainedCopy = path.join(dir, "assets/hub/community/example/example-bundle/license.txt");
  const original = readFileSync(delivered, "utf8");
  const declare = license => writeFileSync(item.listing_file, stringify({ ...listing, license }));
  const approval = { listing: "example/" + listing.bundle_name, license: "MPL-2.0", license_sha256: sha256(text),
    approved_in: "https://github.com/pipelab-org/pipelock-rules/pull/12" };
  const community = (approvals, items = source.items) => generateCatalog({ ...source, items, approvals })["listings.json"].find(record => record.badge === "community");

  // Default unchanged: complete Apache-2.0 text, and an unrelated approval is ignored.
  assert.equal(community([]).license_material.license.text, original);
  assert.equal(community([{ ...approval, license: "Apache-2.0", license_sha256: "0".repeat(64) }]).listing.license, "Apache-2.0");
  declare("MPL-2.0");
  writeFileSync(delivered, text);
  writeFileSync(retainedCopy, text);
  const unapproved = /license is not approved for this listing or its text changed/;
  assert.throws(() => community([]), unapproved);
  assert.throws(() => community([{ ...approval, license_sha256: sha256(text + "x") }]), unapproved);
  assert.throws(() => community([{ ...approval, listing: "example/other-bundle" }]), unapproved);
  assert.throws(() => community([{ ...approval, license: "GPL-3.0-only" }]), unapproved);
  const record = community([approval]);
  assert.equal(record.listing.license, "MPL-2.0");
  assert.equal(record.license_material.license.text, text);
  assert.equal(record.license_material.license.sha256, approval.license_sha256);
  // Text changed after approval.
  writeFileSync(delivered, text + "Edited.\n");
  assert.throws(() => community([approval]), unapproved);
  writeFileSync(delivered, text);
  for (const license of ["Unknown-1.0", "GPL-3.0"]) {
    declare(license);
    assert.throws(() => community([{ ...approval, license }]), /unsupported listing license/, license);
  }
  // A default license cannot borrow an approval for partial text.
  declare("MIT");
  assert.throws(() => community([{ ...approval, license: "MIT" }]), /does not match the declared license/);

  // A retained pair carries its accepted license digest; no approval is needed again.
  declare("MPL-2.0");
  const accepted = community([approval]);
  const pinned = { id: "bundle--" + accepted.listing.id, route: accepted.route, publisher: accepted.publisher_id, badge: "community",
    bundle_sha256: accepted.bundle_sha256, signature_sha256: accepted.signature_sha256, license: "MPL-2.0", license_sha256: approval.license_sha256 };
  const retired = { type: "removed", at: "2026-11-17", reason_id: "1".repeat(32), reason_class: "retired",
    public_reason: "Retired.", bundle_sha256: pinned.bundle_sha256, downloads: "retained" };
  const retain = listing => generateCatalog({ ...source, items: source.items.filter(entry => !entry.publisher), approvals: [],
    lifecycle: { accepted: { listings: [listing], history: [], routes: [] }, history: [{ id: pinned.id, events: [retired] }] } });
  const retained = retain(pinned)["routes.json"].entries.filter(entry => entry.route === pinned.route + "license.txt");
  assert.deepEqual(retained.map(entry => [entry.kind, entry.sha256]), [["license-download", approval.license_sha256]]);
  assert.throws(() => retain({ ...pinned, license_sha256: "0".repeat(64) }), unapproved);
  writeFileSync(retainedCopy, text + "Edited.\n");
  assert.throws(() => retain(pinned), unapproved);
  writeFileSync(retainedCopy, text);
  // The accepted record outranks the current OSI list: an identifier that has since
  // left the list still delivers the pinned, digest-checked text.
  const afterListChange = retain({ ...pinned, license: "GPL-3.0" })["routes.json"].entries.filter(entry => entry.route === pinned.route + "license.txt");
  assert.deepEqual(afterListChange.map(entry => [entry.kind, entry.sha256]), [["license-download", approval.license_sha256]]);
  assert.throws(() => retain({ ...pinned, license: "GPL-3.0", license_sha256: "0".repeat(64) }), unapproved);
});

test("retrieval keeps exact commands and checks the end of a listing", () => {
  const listing = {
    title: "Example recipe",
    setup: [{ text: "Verify the recording.", command: "pipelock  verify-receipt" }],
    limitations: ["Coverage depends on the transport."],
    not_claimed: ["This evidence applies to the supplied recording."],
  };
  const entry = { facts: { "bundle.signer_fingerprint": "ab".repeat(32) } };
  const clean = {
    title: listing.title,
    content: [listing.setup[0].text, listing.setup[0].command, entry.facts["bundle.signer_fingerprint"],
      ...listing.limitations, ...listing.not_claimed].join("\n"),
  };
  assert.doesNotThrow(() => assertExtractedPage(clean, entry, listing));
  assert.throws(() => assertExtractedPage({ ...clean, content: clean.content.replace("pipelock  ", "pipelock ") }, entry, listing), /exact command/);
  assert.throws(() => assertExtractedPage({ ...clean, content: clean.content.split("\n").slice(0, -1).join("\n") }, entry, listing), /not_claimed/);
});

test("retrieval changes only the exact destination in a real preset", () => {
  const original = "mode: strict\nresponse_scanning: {enabled: true, action: block}\ndestination_grants: []\n";
  assert.deepEqual(parse(withTestDestination(original, 1314)), {
    ...parse(original), destination_grants: [{ protocol: "tcp", host: "127.0.0.1", port: 1314 }],
  });
  assert.throws(() => withTestDestination(original.replace("[]", "[{host: example.com}]"), 1314), /unexpected base preset/);
});

test("config change classification uses the net edit and refuses unsupported transitions", () => {
  const yaml = "response_scanning:\n  enabled: true\n  action: block\n";
  const edit = (op, path, value) => ({ op, path: "response_scanning." + path, value });
  const added = edit("append", "exempt_domains", "example.com");
  const removed = edit("remove", "exempt_domains", "example.com");
  const warn = edit("set", "action", "warn"), block = edit("set", "action", "block");
  const result = applyConfigChanges(yaml, [added, warn, block], "claude-code");
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].effect, "weakens");
  assert.throws(() => applyConfigChanges(yaml, [added, removed], "claude-code"), /identical/);
  assert.throws(() => applyConfigChanges(yaml, [edit("set", "action", "ask")], "claude-code"), /unclassified/);
  assert.throws(() => applyConfigChanges(yaml, [added, added], "claude-code"), /invalid list operation/);
  const sameHost = edit("append", "exempt_domains", "EXAMPLE.COM.");
  assert.throws(() => applyConfigChanges(yaml, [added, sameHost], "claude-code"), /invalid list operation/);
  assert.throws(() => applyConfigChanges(yaml, [added, { ...sameHost, op: "remove" }], "claude-code"), /identical/);
  const distinct = applyConfigChanges(yaml, [sameHost, edit("append", "exempt_domains", "API.EXAMPLE.COM")], "claude-code");
  assert.deepEqual(parse(distinct.yaml).response_scanning.exempt_domains, ["example.com", "api.example.com"]);
});

test("config list changes read existing YAML sequences", () => {
  const yaml = "response_scanning:\n  enabled: true\n  action: block\n";
  const path = "response_scanning.exempt_domains";
  const added = applyConfigChanges(yaml + "  exempt_domains: []\n", [
    { op: "append", path, value: "example.com" },
  ], "claude-code");
  assert.deepEqual(parse(added.yaml).response_scanning.exempt_domains, ["example.com"]);
  assert.deepEqual(added.changes.map(change => change.transition), ["added"]);

  const removed = applyConfigChanges(yaml + "  exempt_domains: [Example.COM, api.example.com]\n", [
    { op: "remove", path, value: "example.com" },
  ], "claude-code");
  assert.deepEqual(parse(removed.yaml).response_scanning.exempt_domains, ["api.example.com"]);
  assert.deepEqual(removed.changes.map(change => change.transition), ["removed"]);
});

test("config audit keeps weaknesses whose score does not move", { skip: !process.env.HUB_RELEASE_BIN }, () => {
  const listing = structuredClone(base);
  delete listing.learn_page;
  Object.assign(listing, { type: "config", base_preset: "claude-code", changes: [
    { op: "append", path: "response_scanning.exempt_domains", value: "example.com" },
  ] });
  const result = assessConfig(listing, process.env.HUB_RELEASE_BIN);
  assert.equal(result.sha256, sha256(result.bytes));
  assert.equal(result.assessment.grade, result.assessment.base_grade);
  assert.equal(result.assessment.categories.find(category => category.name === "Response Scanning").delta, 0);
  assert.equal(result.assessment.changes[0].effect, "weakens");
  const disabled = assessConfig({ ...listing, base_preset: "strict", changes: [
    { op: "set", path: "response_scanning.enabled", value: false },
  ] }, process.env.HUB_RELEASE_BIN);
  assert.match(disabled.assessment.findings.find(finding => finding.category === "Response Scanning").message, /Core response patterns still apply/);
});

test("first-party recipes retain their guide links and documented limitations", () => {
  const recipes = firstPartyRecipes(root);
  assert.ok(recipes.length >= 4);
  for (const { listing } of recipes) {
    assert.ok(listing.limitations.length);
    assert.ok(listing.not_claimed.length);
    assert.equal(listing.links.homepage, "https://pipelab.org" + listing.learn_page);
  }
});

test("verifier case evidence cannot count the same receipt twice", t => {
  const directory = temp(t);
  const relative = "verifiers/pipelock-verifier/conformance.json";
  const artifact = path.join(directory, relative);
  const listing = { id: "pipelock-verifier", release: "3.8.0", conformance_artifact: relative,
    evidence: { artifact: relative, pipelock_version: "3.8.0" } };
  const report = JSON.parse(read("assets/hub/" + relative));
  mkdirSync(path.dirname(artifact), { recursive: true });
  writeFileSync(artifact, JSON.stringify(report));
  assert.equal(verifierEvidence(directory, listing).cases, 2);
  for (const field of ["path", "sha256"]) {
    const duplicate = structuredClone(report);
    duplicate.cases[1][field] = duplicate.cases[0][field];
    writeFileSync(artifact, JSON.stringify(duplicate));
    assert.throws(() => verifierEvidence(directory, listing), /consistent release evidence/);
  }
  for (const field of ["binary_sha256", "corpus_commit", "sha256"]) {
    const invalid = structuredClone(report);
    const target = field === "sha256" ? invalid.cases[0] : invalid;
    target[field] = [target[field]];
    writeFileSync(artifact, JSON.stringify(invalid));
    assert.throws(() => verifierEvidence(directory, listing), /consistent release evidence/);
  }
});

test("publication clearance binds the exact artifact, current ledger revision and trusted key", t => {
  const directory = temp(t);
  const artifact = path.join(directory, "candidate.bin"), revision = path.join(directory, "record-revision");
  const signature = path.join(directory, "approval.sig"), trustedKey = path.join(directory, "approval.der");
  const original = Buffer.from("staged Hub build");
  const authority = "a".repeat(64);
  const signer = generateKeyPairSync("ed25519");
  const other = generateKeyPairSync("ed25519");
  const keyBytes = signer.publicKey.export({ format: "der", type: "spki" });
  writeFileSync(artifact, original);
  writeFileSync(revision, authority + "\n");
  writeFileSync(signature, sign(null, publicationClearancePayload(sha256(original), authority), signer.privateKey));
  writeFileSync(trustedKey, keyBytes);
  const check = () => spawnSync(process.execPath, [
    path.join(root, "scripts/hub/deployment-evidence.mjs"), "verify-clearance", artifact, revision, signature, trustedKey,
  ], { encoding: "utf8", timeout: 5000 });
  const good = check();
  assert.equal(good.status, 0, good.stderr);
  assert.equal(good.stdout.trim(), sha256(original));

  const denied = () => {
    const result = check();
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
  };
  writeFileSync(revision, "b".repeat(64));
  denied();
  writeFileSync(revision, authority);
  writeFileSync(artifact, "different deployment");
  denied();
  writeFileSync(artifact, original);
  writeFileSync(trustedKey, other.publicKey.export({ format: "der", type: "spki" }));
  denied();
  writeFileSync(trustedKey, signer.privateKey.export({ format: "der", type: "pkcs8" }));
  denied();
  writeFileSync(trustedKey, keyBytes);
  writeFileSync(revision, "");
  denied();
});

test("removal history binds old listings, retained bytes and restoration", () => {
  const listing = { id: "bundle--example", publisher: "maintainer", bundle_sha256: "a".repeat(64), signature_sha256: "c".repeat(64) };
  const removed = { type: "removed", at: "2026-11-17", reason_id: "1".repeat(32), reason_class: "security",
    public_reason: "This rule set has been withdrawn.", bundle_sha256: listing.bundle_sha256 };
  const cleared = { type: "reason-cleared", at: "2026-11-18", reason_id: removed.reason_id };
  const restored = { type: "restored", at: "2026-11-18", public_note: "Listing restored." };
  const accepted = { listings: [listing], history: [] };
  assert.throws(() => reconcileLifecycle(accepted, { listings: [], history: [] }), /removal without record/);
  const history = [{ id: listing.id, events: [removed] }];
  const baseline = { ...accepted, history };
  assert.equal(reconcileLifecycle(accepted, { listings: [], history }).length, 1);
  assert.throws(() => reconcileLifecycle(baseline, { listings: [], history: [] }), /history was deleted/);
  const restore = [{ id: listing.id, events: [removed, cleared, restored] }];
  assert.deepEqual(reconcileLifecycle(baseline, { listings: [listing], history: restore }), []);
  for (const key of ["bundle_sha256", "signature_sha256"]) {
    assert.throws(() => reconcileLifecycle(baseline, {
      listings: [{ ...listing, [key]: "b".repeat(64) }], history: restore,
    }), /changed bytes requires verified admission/);
  }
  assert.throws(() => reconcileLifecycle(baseline, {
    listings: [{ ...listing, publisher: "different-publisher" }], history: restore,
  }), /different publisher/);
  assert.throws(() => reconcileLifecycle(accepted, {
    listings: [], history: [{ id: listing.id, events: [{ ...removed, downloads: "retained" }] }],
    retained: { [listing.id]: listing.bundle_sha256 },
  }), /retention is not permitted/);
  const { reason_id, ...legacy } = removed;
  const legacyHistory = [{ id: listing.id, events: [legacy] }];
  const legacyBaseline = { ...accepted, history: legacyHistory };
  assert.equal(reconcileLifecycle(legacyBaseline, { listings: [], history: legacyHistory }).length, 1);
  const legacyRestore = [{ id: listing.id, events: [legacy, restored] }];
  assert.deepEqual(reconcileLifecycle({ ...accepted, history: legacyRestore }, { listings: [listing], history: legacyRestore }), []);
  assert.throws(() => reconcileLifecycle(legacyBaseline, { listings: [listing], history: legacyRestore }), /clearing every removal reason/);
  assert.deepEqual(reconcileLifecycle(legacyBaseline, {
    listings: [listing], history: [{ id: listing.id, events: [legacy, { ...cleared, reason_id: "legacy" }, restored] }],
  }), []);
});

test("independent removal reasons block restoration and end retained downloads", () => {
  const listing = { id: "bundle--example", publisher: "maintainer", bundle_sha256: "a".repeat(64) };
  const removed = { type: "removed", at: "2026-11-17", bundle_sha256: listing.bundle_sha256 };
  const retired = { ...removed, reason_id: "1".repeat(32), reason_class: "retired", public_reason: "Retired.", downloads: "retained" };
  const copyright = { ...removed, reason_id: "2".repeat(32), reason_class: "copyright", public_reason: "Copyright notice." };
  const security = { ...removed, reason_id: "3".repeat(32), reason_class: "security", public_reason: "Security review." };
  const clear = reason => ({ type: "reason-cleared", at: "2026-11-18", reason_id: reason.reason_id });
  const restored = { type: "restored", at: "2026-11-18", public_note: "Listing restored." };
  const history = (...events) => [{ id: listing.id, events }];
  const accepted = events => ({ listings: [listing], history: events });
  const retiredBaseline = accepted(history(retired));
  const retained = { [listing.id]: listing.bundle_sha256 };
  assert.equal(reconcileLifecycle(retiredBaseline, { listings: [], history: history(retired), retained })[0].event.downloads, "retained");
  assert.throws(() => reconcileLifecycle(retiredBaseline, {
    listings: [], history: history(retired), retained: {},
  }), /retained download digest differs/);
  const escalated = history(retired, security);
  assert.equal(reconcileLifecycle(retiredBaseline, { listings: [], history: escalated, retained: {} })[0].event.downloads, "removed");
  assert.throws(() => reconcileLifecycle(retiredBaseline, { listings: [], history: escalated, retained }), /unowned retained download/);
  assert.equal(reconcileLifecycle(accepted(escalated), {
    listings: [], history: history(retired, security, clear(security)), retained: {},
  })[0].event.downloads, "removed");

  const baseline = accepted(history(copyright, security));
  const unresolved = history(copyright, security, clear(copyright));
  const [notice] = reconcileLifecycle(baseline, { listings: [], history: unresolved });
  assert.equal(notice.event.public_reason, "Security review.");
  assert.equal(notice.event.downloads, "removed");
  assert.throws(() => reconcileLifecycle(baseline, { listings: [listing], history: history(...unresolved[0].events, restored) }), /clearing every removal reason/);
  assert.throws(() => reconcileLifecycle(baseline, { listings: [], history: history(...unresolved[0].events, clear(copyright)) }), /reason is not open/);
  const closed = history(...unresolved[0].events, clear(security));
  assert.equal(reconcileLifecycle(baseline, { listings: [], history: closed })[0].event.downloads, "removed");
  assert.deepEqual(reconcileLifecycle(baseline, { listings: [listing], history: history(...closed[0].events, restored) }), []);
});

test("real Hugo joins reader facts, rule/core routes, exact mirrors and digest guards", { skip: !native }, async t => {
  const { dir, source } = catalogSource(t);
  const removed = { id: "retired-listing", publisher_id: "former", route: "/hub/community/former/older-bundle/", facts: { "removal.reason": '<gone> & "retained"' } };
  const baseline = [removed.route + "old-rule/", "/hub/bundles/older-bundle/"].map(route => ({ listing_id: removed.id, route, representations: ["html", "mirror"] }));
  source.publishers.push({ ...source.publishers[0], id: "former", name: "Former maintainer" });
  Object.assign(source, { removed: [removed], baseline });
  if (process.env.HUB_VERIFY_RETRIEVAL === "1") source.pipelockBinary = process.env.HUB_RELEASE_BIN;
  const catalog = generateCatalog(source), generated = path.join(dir, "data/hub/generated"); writeCatalog(generated, catalog); writeCatalog(generated, generateCatalog(source), { check: true });
  assert.equal(catalog["listings.json"].find(record => record.listing.id === "pipelock-community").badge, "official");
  const overlay = `themesDir = ${JSON.stringify(path.join(root, "themes"))}\ncontentDir = ${JSON.stringify(path.join(dir, "content"))}\nassetDir = ${JSON.stringify(path.join(dir, "assets"))}\ndataDir = ${JSON.stringify(path.join(dir, "data"))}\nstaticDir = ${JSON.stringify(path.join(dir, "distribution"))}\n`;
  writeFileSync(path.join(dir, "hugo.toml"), overlay + read("hugo.toml"));
  const build = open => { writeFileSync(path.join(dir, "data/hub/launch.toml"), `open = ${open}\n`); const result = spawnSync(process.env.HUGO_BIN || "hugo", ["--source", dir, "--config", path.join(dir, "hugo.toml"), "--destination", path.join(dir, "public"), "--cleanDestinationDir", "--clock", "2026-11-05T00:00:00Z"], { encoding: "utf8", timeout: 120000 }); assert.ifError(result.error); return { ...result, output: result.stdout + result.stderr }; };
  const built = build(true); assert.equal(built.status, 0, built.output);
  const manifest = catalog["routes.json"], records = catalog["listings.json"];
  assertPublication({ directory: path.join(dir, "public"), manifest, records, open: true, requireBuild: false });
  const rules = manifest.entries.filter(entry => entry.kind === "rule");
  assert.ok(rules.length, "the fixture must contain rule pages");
  for (const bundle of records.filter(record => record.badge === "official")) {
    const html = readFileSync(path.join(dir, "public", bundle.route, "index.html"), "utf8");
    const mirror = readFileSync(path.join(dir, "public", bundle.route, "index.md"), "utf8");
    for (const rule of rules) {
      const belongs = rule.listing_id === bundle.listing.id;
      assert.equal(html.includes('href="' + rule.route + '"'), belongs, "HTML rule link for " + rule.route);
      assert.equal(mirror.includes(rule.route + "index.md)"), belongs, "Markdown rule link for " + rule.route);
    }
  }
  const buildInputs = { directory: path.join(dir, "public"), manifest, records,
    siteSHA: "a".repeat(40), rulesSHA: "b".repeat(40), buildConfig: Buffer.from(overlay) };
  const identity = publicationIdentity(buildInputs);
  assert.match(identity.output_set_sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(publicationIdentity({ ...buildInputs, buildConfig: Buffer.from(overlay + "# fixture") }).build_config_sha256,
    identity.build_config_sha256);
  assert.throws(() => publicationIdentity({ ...buildInputs, siteSHA: "main" }), /candidate SHAs/);

  if (process.env.HUB_VERIFY_RETRIEVAL === "1") {
    const result = await verifyRetrieval({
      directory: path.join(dir, "public"), manifest, records, binary: process.env.HUB_RELEASE_BIN,
      requireBuild: false,
    });
    assert.deepEqual(result.deferred, ["/hub/build.json"]);
    assert.equal(result.checks.length, manifest.entries.filter(entry => entry.kind !== "build")
      .reduce((count, entry) => count + entry.representations.length, 0) * 3);
  }

  const removalRoutes = manifest.entries.filter(entry => entry.kind === "removal");
  assert.equal(removalRoutes.length, 3);
  for (const entry of removalRoutes) {
    const html = readFileSync(path.join(dir, "public", entry.route, "index.html"), "utf8");
    assert.match(html, /<meta name="robots" content="noindex, follow"/);
    assert.ok(!readFileSync(path.join(dir, "public/sitemap.xml"), "utf8").includes(entry.route));
  }
  assert.ok(!readFileSync(path.join(dir, "public/hub/index.json"), "utf8").includes(removed.id));
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
  const withoutCommunity = generateCatalog({ ...source, items: source.items.filter(item => !item.publisher) }); writeCatalog(generated, withoutCommunity);
  rmSync(path.join(dir, "assets/hub/community"), { recursive: true });
  const removalBuild = build(true); assert.equal(removalBuild.status, 0, removalBuild.output);
  assertPublication({ directory: path.join(dir, "public"), manifest: withoutCommunity["routes.json"], records: withoutCommunity["listings.json"], open: true, requireBuild: false });
  const removedClosed = build(false); assert.equal(removedClosed.status, 0, removedClosed.output);
  assertPublication({ directory: path.join(dir, "public"), manifest: withoutCommunity["routes.json"], records: withoutCommunity["listings.json"], open: false });
});

test("official workloads bind exact served producer bytes and supply every missing experimental negative", { skip: !native || !process.env.HUBCHECK_RULES_REPOSITORY }, () => {
  let count = 0;
  const supplemented = [];
  for (const name of ["pipelock-community", "healthcare-phi-pii"]) {
    const reader = runHubcheck(binary, "reader", { bundle_dir: path.join(root, "static/rules", name), config: path.join(engineDir, "configs/claude-code.yaml") });
    const own = officialOwnInputs({ repository: process.env.HUBCHECK_RULES_REPOSITORY, reader });
    assert.deepEqual(own.map(input => input.rule_id), reader.declared.filter(rule => rule.status !== "deprecated").map(rule => rule.id));
    for (const input of own) { assert.ok(input.positive[0].text); assert.ok(input.negative[0].text); if (input.negative[0].origin.startsWith("site:")) supplemented.push(input.rule_id); }
    count += own.length;
    assert.throws(() => officialOwnInputs({ repository: process.env.HUBCHECK_RULES_REPOSITORY, reader: { ...reader, bundle_sha256: "changed" } }), /not current/);
    if (name === "pipelock-community") {
      const flipped = structuredClone(reader);
      flipped.declared.find(rule => rule.id === "dlp-doppler-service-token").status = "stable";
      assert.throws(() => officialOwnInputs({ repository: process.env.HUBCHECK_RULES_REPOSITORY, reader: flipped }), /missing official/);
    }
  }
  assert.equal(count, 56);
  // Exactly the committed supplements are used: a rule whose Rules fixture gained a negative drops out
  // of this set, and a supplement left behind for it is stale and must be removed.
  const committed = JSON.parse(readFileSync(path.join(root, "scripts/hub/bench-workload/supplemental-negatives.json"), "utf8"));
  assert.deepEqual(supplemented.sort(), Object.keys(committed.rules).sort());
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
  const report = benchmarkReport({ binary, request: fixture.request, engine, workloadSpec: spec, pairs: measurementPairs, output: temp(t), root });
  assert.equal(report.verdict.status, "unassessed");
  assert.equal(report.results.workload_sha256, report.bindings.executed_workload_sha256);
  assert.equal(report.bindings.bundle_sha256, sha256(fixture.bytes));
  assert.throws(() => benchmarkReport({ binary, request: fixture.request, reader: { bundle_sha256: "f".repeat(64), declared: [] }, engine, workloadSpec: spec, pairs: measurementPairs, output: temp(t), root }), /derived/);
  assert.throws(() => benchmarkReport({ binary, request: fixture.request, engine: { ...engine, binary_sha256: "0".repeat(64) }, workloadSpec: spec, pairs: measurementPairs, output: temp(t), root }), /engine executable/);
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

test("bound generation stages the exact signed contribution from committed rules objects", { skip: !native }, t => {
  const { dir, source } = catalogSource(t);
  const rulesRepo = temp(t);
  const scratch = temp(t);
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd,
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args],
  { encoding: "utf8", stdio: "pipe" }).trim();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "commit", "-qm", "accepted empty fixture", "--allow-empty");
  const siteBase = git(dir, "rev-parse", "HEAD");
  git(rulesRepo, "init", "-q", "-b", "main");

  const writeListing = (relative, bytes) => {
    const file = path.join(rulesRepo, "hub", relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  };
  const { items, publishers, ...trusted } = source;
  const [publisher] = publishers;
  writeListing("publishers/" + publisher.id + ".yaml", stringify(publisher));
  const signed = items.find(item => item.publisher);
  for (const item of items.filter(item => item.bundle_dir)) {
    const listing = parse(readFileSync(item.listing_file, "utf8"));
    const name = listing.bundle_name;
    const relative = item.publisher ? "community/" + publisher.id + "--" + name : "bundles/" + name;
    writeListing("listings/" + relative + ".yaml", readFileSync(item.listing_file));
    if (item.publisher) {
      for (const file of ["bundle.yaml", "bundle.yaml.sig", "LICENSE"]) {
        writeListing("community/" + publisher.id + "/" + name + "/" + file, readFileSync(path.join(item.bundle_dir, file)));
      }
    }
  }
  git(rulesRepo, "add", "--", "hub");
  git(rulesRepo, "commit", "-qm", "producer fixture");
  const rulesSHA = git(rulesRepo, "rev-parse", "HEAD");
  git(rulesRepo, "update-ref", "refs/remotes/origin/main", rulesSHA);
  const options = { ...trusted, sourceBinding: { siteBase, rulesSHA, rulesMain: rulesSHA, rulesRepository: rulesRepo } };
  const { catalog, assetRoot } = prepareBoundCatalog(options, scratch);
  const admitted = catalog["listings.json"].find(record => record.badge === "community");
  assert.ok(admitted);
  for (const [file, source = file] of [["bundle.yaml"], ["bundle.yaml.sig"], ["license.txt", "LICENSE"]]) {
    assert.deepEqual(readFileSync(path.join(assetRoot, admitted.route, file)), readFileSync(path.join(signed.bundle_dir, source)));
  }
  assert.ok(!existsSync(path.join(assetRoot, "rules")));
  assert.throws(() => prepareBoundCatalog({ ...options, mode: "routine" }, scratch), /current accepted measurement required/);
});

test("bound generation checks the committed latency selection against the acquired workload",
  { skip: !native || !process.env.HUB_RELEASE_BIN }, t => {
  const { dir, source } = catalogSource(t);
  rmSync(path.join(dir, "static"));
  mkdirSync(path.join(dir, "static/rules"), { recursive: true });
  const rules = temp(t);
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd,
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args],
  { encoding: "utf8", stdio: "pipe" }).trim();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "commit", "-qm", "accepted empty fixture", "--allow-empty");
  const siteBase = git(dir, "rev-parse", "HEAD");
  git(rules, "init", "-q", "-b", "main");

  const staged = stage(t, bundle => ({ ...bundle, rules: bundle.rules.filter(rule => rule.type === "dlp") }));
  const reader = runHubcheck(binary, "reader", staged.request);
  const publisher = { id: "example", name: "Example maintainer", keys: [
    { fingerprint: staged.key.hex, added: "2026-11-05" },
  ] };
  const bundleDir = path.join(rules, "hub/community/example", reader.name);
  const write = (file, contents) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  };
  write(path.join(rules, "hub/publishers/example.yaml"), stringify(publisher));
  write(path.join(rules, "hub/listings/community", "example--" + reader.name + ".yaml"), stringify(listingFor(reader)));
  write(path.join(bundleDir, "bundle.yaml"), staged.bytes);
  write(path.join(bundleDir, "bundle.yaml.sig"), staged.signature);
  write(path.join(bundleDir, "LICENSE"), fixtureLicense);
  const negative = path.join(bundleDir, "fixtures/dlp/stable-rule-long-false-positive.txt");
  write(path.join(bundleDir, "fixtures/dlp/stable-rule-long-true-positive.txt"), "fixture-secret\n");
  write(negative, "fixture-public\n");
  const commitRules = () => {
    git(rules, "add", "--", "hub");
    git(rules, "commit", "-qm", "producer fixture");
    const revision = git(rules, "rev-parse", "HEAD");
    git(rules, "update-ref", "refs/remotes/origin/main", revision);
    return revision;
  };
  const rulesSHA = commitRules();
  const { items, publishers, ...trusted } = source;
  const generate = (revision, mode = "routine") => generateCatalog({
    ...trusted, mode, pipelockBinary: mode === "routine" ? process.env.HUB_RELEASE_BIN : undefined,
    sourceBinding: { siteBase, rulesSHA: revision, rulesMain: revision, rulesRepository: rules },
  });

  const methodFile = path.join(dir, "data/hub/benchmark-method.json");
  const methodInput = JSON.parse(readFileSync(methodFile));
  methodInput.pairs = null;
  const pairs = 3;
  write(methodFile, jsonBytes(methodInput));
  const limits = path.join(dir, "data/hub/latency-limits.json");
  write(limits, jsonBytes({ rule_ratio: null, bundle_ratio: null, deadline_ns: null }));
  const method = measurementMethod(dir, source.config, pairs);
  const request = { ...staged.request, bundle_dir: bundleDir };
  const spec = bundleWorkload({ binary, request, reader, repository, rulesRepository: rules, publisherId: publisher.id });
  const workload = bindWorkload({ rules: reader.declared, ...spec });
  const executed = goWorkloadSHA256(workload.harness);
  const bindings = measurementBindings({ reader, workload, engine: source.engine, method, executedWorkloadSHA256: executed });
  const measured = { ...results(12, executed), bundle_sha256: reader.bundle_sha256, config_sha256: method.base_config_sha256 };
  measured.rules = Object.fromEntries(bindings.measured_rule_ids.map(id => [id, measured.bundle]));
  const artifacts = path.join(dir, "data/hub/measurements");
  const reference = writeMeasurement(artifacts, measurementArtifact(bindings, measured, { synthetic: true }));
  write(path.join(artifacts, "index.json"), jsonBytes({ [reader.bundle_sha256]: reference }));

  assert.throws(() => generate(rulesSHA), /current accepted measurement required/);
  git(dir, "add", "--", "data/hub/measurements", "data/hub/benchmark-method.json", "data/hub/latency-limits.json");
  git(dir, "commit", "-qm", "diagnostic measurement fixture");
  const reported = generate(rulesSHA, "report")["listings.json"].find(record => record.badge === "community");
  assert.equal(reported.measurement.verdict.status, "unassessed");
  assert.deepEqual(reported.measurement.reference, reference);
  assert.throws(() => generate(rulesSHA), /benchmark pair count must be committed/);

  write(methodFile, jsonBytes({ ...methodInput, pairs: pairs + 1 }));
  git(dir, "add", "--", "data/hub/benchmark-method.json");
  git(dir, "commit", "-qm", "different pair count fixture");
  assert.throws(() => generate(rulesSHA, "report"), /pair count differs from the committed method/);
  assert.throws(() => generate(rulesSHA), /pair count differs from the committed method/);

  write(methodFile, jsonBytes({ ...methodInput, pairs }));
  write(limits, jsonBytes({ rule_ratio: 1, bundle_ratio: 1, deadline_ns: 15 }));
  git(dir, "add", "--", "data/hub/benchmark-method.json", "data/hub/latency-limits.json");
  git(dir, "commit", "-qm", "accepted benchmark method and limits fixture");
  write(limits, jsonBytes({ rule_ratio: 1, bundle_ratio: 1, deadline_ns: 11 }));
  const accepted = generate(rulesSHA)["listings.json"].find(record => record.badge === "community");
  assert.equal(accepted.measurement.verdict.status, "pass");
  assert.deepEqual(accepted.measurement.reference, reference);

  write(negative, "a different fixture input\n");
  assert.throws(() => generate(commitRules()), /measurement stale/);
  git(rules, "update-ref", "refs/remotes/origin/main", rulesSHA);
  git(dir, "add", "--", "data/hub/latency-limits.json");
  git(dir, "commit", "-qm", "changed limits fixture");
  assert.throws(() => generate(rulesSHA), /passing latency measurement required/);
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

  const community = generateCatalog(source)["listings.json"].find(record => record.badge === "community");
  const listing = { id: "bundle--" + community.listing.id, route: community.route,
    publisher: community.publisher_id, badge: community.badge, bundle_sha256: community.bundle_sha256,
    signature_sha256: community.signature_sha256, license: community.listing.license,
    license_sha256: community.license_material.license.sha256 };
  const retired ={ type: "removed", at: "2026-11-17", reason_id: "1".repeat(32), reason_class: "retired",
    public_reason: "Retired.", bundle_sha256: listing.bundle_sha256, downloads: "retained" };
  const security = { ...retired, reason_id: "2".repeat(32), reason_class: "security",
    public_reason: "Security review.", downloads: "removed" };
  const history = (...events) => [{ id: listing.id, events }];
  const items = source.items.filter(item => !item.publisher);
  const retainedCatalog = generateCatalog({ ...source, items,
    lifecycle: { accepted: { listings: [listing], history: [], routes: [] }, history: history(retired) } });
  const retained = retainedCatalog["routes.json"].entries.filter(entry => entry.kind === "retained-download");
  assert.deepEqual(retained.map(entry => entry.route), [listing.route + "bundle.yaml", listing.route + "bundle.yaml.sig"]);
  // License text stays available beside the retained pair; without it, retention is refused.
  const retainedLicense = retainedCatalog["routes.json"].entries.filter(entry => entry.route === listing.route + "license.txt");
  assert.deepEqual(retainedLicense.map(entry => [entry.kind, entry.sha256]), [["license-download", listing.license_sha256]]);
  const retainLifecycle = accepted => ({ accepted: { listings: [accepted], history: [], routes: [] }, history: history(retired) });
  const { license: _license, ...unlicensed } = listing;
  assert.throws(() => generateCatalog({ ...source, items, lifecycle: retainLifecycle(unlicensed) }), /requires its accepted license material/);
  assert.throws(() => generateCatalog({ ...source, items, lifecycle: retainLifecycle({ ...listing, license_sha256: "0".repeat(64) }) }), /retained license material differs/);
  const retainedText = path.join(dir, "assets", listing.route.slice(1), "license.txt");
  const savedText = readFileSync(retainedText);
  rmSync(retainedText);
  assert.throws(() => generateCatalog({ ...source, items, lifecycle: retainLifecycle(listing) }), /license text missing/);
  writeFileSync(retainedText, savedText);
  assert.ok(retainedCatalog["inventory.json"].retained_names.includes(community.listing.bundle_name));
  assert.equal(retainedCatalog["routes.json"].entries.find(entry => entry.route === listing.route).facts["bundle.name"], community.listing.bundle_name);
  const withdrawn = generateCatalog({ ...source, items,
    lifecycle: { accepted: retainedCatalog["lifecycle.json"], history: history(retired, security) } });
  assert.ok(!withdrawn["routes.json"].entries.some(entry => retained.some(download => entry.route === download.route)));
  assert.equal(withdrawn["routes.json"].entries.find(entry => entry.route === listing.route).facts.Downloads, "Withdrawn from the Hub.");
  writeCatalog(generated, withdrawn);
  const restoredHistory = history(retired, security,
    { type: "reason-cleared", at: "2026-11-18", reason_id: retired.reason_id },
    { type: "reason-cleared", at: "2026-11-18", reason_id: security.reason_id },
    { type: "restored", at: "2026-11-18", public_note: "Restored." });
  const restored = generateCatalog({ ...source, lifecycle: { accepted: withdrawn["lifecycle.json"], history: restoredHistory } });
  assert.ok(restored["inventory.json"].retained_names.includes(community.listing.bundle_name));
  assert.equal(restored["routes.json"].entries.find(entry => entry.route === listing.route).kind, "listing");
  const renamed = { ...listing, route: "/hub/community/example/new-bundle/", bundle_name: "new-bundle" };
  assert.throws(() => reconcileLifecycle({ listings: [listing], history: [] }, { listings: [renamed], history: [] }), /accepted listing route cannot change/);
});

test("official listings deliver the synchronized Rules license and refuse missing material", { skip: !native }, t => {
  const { source } = catalogSource(t);
  const catalog = generateCatalog(source);
  for (const name of ["pipelock-community", "healthcare-phi-pii"]) {
    const record = catalog["listings.json"].find(entry => entry.badge === "official" && entry.listing.bundle_name === name);
    const directory = "/rules/" + name + "/";
    assert.equal(record.license_material.license.route, directory + "license.txt");
    assert.equal(record.license_material.license.text, read("static/rules/" + name + "/license.txt"));
    assert.deepEqual(record.license_material.notices.map(notice => [notice.route, notice.text]), [[directory + "notice.txt", read("static/rules/" + name + "/notice.txt")]]);
    const entries = catalog["routes.json"].entries.filter(entry => entry.route.startsWith(directory) && entry.route.endsWith(".txt"));
    assert.deepEqual(entries.map(entry => [entry.route, entry.kind, entry.ownership]), [
      [directory + "license.txt", "license-download", "official-registry"],
      [directory + "notice.txt", "notice-download", "official-registry"],
    ]);
  }
  const official = source.items.find(item => item.bundle_dir?.endsWith("/static/rules/pipelock-community"));
  const copy = temp(t);
  for (const file of ["bundle.yaml", "bundle.yaml.sig"]) cpSync(path.join(official.bundle_dir, file), path.join(copy, file));
  const items = source.items.map(item => item === official ? { ...item, bundle_dir: copy } : item);
  assert.throws(() => generateCatalog({ ...source, items }), /license text missing/);
  writeFileSync(path.join(copy, "license.txt"), "MIT License\n\nCopyright (c) 2026 Example\n\n" + read("scripts/hub/licenses/MIT.txt"));
  assert.throws(() => generateCatalog({ ...source, items }), /does not match the declared license/);
  writeFileSync(path.join(copy, "license.txt"), "Apache License\nVersion 2.0, January 2004\n");
  assert.throws(() => generateCatalog({ ...source, items }), /does not match the declared license/);
  writeFileSync(path.join(copy, "license.txt"), read("static/rules/pipelock-community/license.txt"));
  writeFileSync(path.join(copy, "LICENSE"), read("static/rules/pipelock-community/license.txt"));
  assert.throws(() => generateCatalog({ ...source, items }), /unrecognized license or notice file/);
});

test("policy facts have unique normalized labels", () => {
  const options = { records: [], policies: ["policies"], schemaBytes: "{}" };
  const page = facts => ({ policies: { title: "Hub policies", facts } });
  const facts = { "Café": "First fact", "Topic": "Second fact" };
  const valid = routeManifest({ ...options, policyPages: page(facts) });
  assert.deepEqual(valid.entries.find(entry => entry.kind === "policy").facts, facts);
  const duplicate = { ...facts, ["Cafe\u0301"]: "Repeated fact" };
  assert.throws(() => routeManifest({ ...options, policyPages: page(duplicate) }), /duplicate normalized policy fact key/);
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
  if (process.env.HUB_RELEASE_BIN) {
    const admitted = generateCatalog({ ...source, mode: "routine", pipelockBinary: process.env.HUB_RELEASE_BIN });
    assert.ok(admitted["listings.json"].length);
  } else {
    assert.throws(() => generateCatalog({ ...source, mode: "routine" }), /pinned Pipelock executable is required/);
  }
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
    assert.throws(() => benchmarkReport({ binary: wrapper, request: fixture.request, engine, workloadSpec: { inputs, generator: "test:replacement", parameters: {} }, pairs: measurementPairs, output, root }), new RegExp(`executed ${replacementKind} digest differs`));
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
  const report = benchmarkReport({ binary, request, engine, repository, rulesRepository: process.env.HUBCHECK_RULES_REPOSITORY, pairs: measurementPairs, output: path.join(dir, "report"), root });
  assert.equal(report.verdict.status, "unassessed");
  assert.equal(report.bindings.workload_parameters.caps.dlp, 512);
  assert.equal(report.bindings.workload_parameters.caps.injection, 1024 * 1024);
  assert.equal(report.results.bundle_sha256, report.bindings.bundle_sha256);
});
