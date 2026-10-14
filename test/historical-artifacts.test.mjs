import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  HISTORICAL_ARTIFACTS_FILE,
  auditDemoVersions,
  auditHistoricalArtifact,
  loadHistoricalArtifacts,
} from "../scripts/historical-artifacts.mjs";

const ARTIFACT = "static/assess/demo-assessment/index.html";
// Mirrors the production current-claim list, including unsigned static summaries.
const ELIGIBLE = new Set([ARTIFACT, "content/pipelock.md", "static/llms.txt", "static/llms-full.txt"]);
const BYTES = Buffer.from("<p>Pipelock v3.6.0</p>\n");
const SHA = createHash("sha256").update(BYTES).digest("hex");

function entry(overrides = {}) {
  return {
    path: ARTIFACT,
    pipelock_version: "3.6.0",
    sha256: SHA,
    reason: "Signed demo produced with 3.6.0",
    classified: "2026-10-14",
    approved_by: "Josh, 2026-10-14",
    ...overrides,
  };
}

function load(t, document) {
  const root = mkdtempSync(join(tmpdir(), "historical-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (document !== undefined) {
    const file = join(root, HISTORICAL_ARTIFACTS_FILE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof document === "string" ? document : JSON.stringify(document));
  }
  return loadHistoricalArtifacts(root, ELIGIBLE);
}

const claims = (...versions) => versions.map((version, index) => [index + 1, [version]]);

test("a missing classification file classifies nothing and reports nothing", t => {
  const { entries, findings } = load(t);
  assert.equal(entries.size, 0);
  assert.deepEqual(findings, []);
});

test("a valid entry loads and its unchanged artifact passes", t => {
  const { entries, findings } = load(t, { artifacts: [entry()] });
  assert.deepEqual(findings, []);
  assert.deepEqual(auditHistoricalArtifact(ARTIFACT, BYTES, claims("3.6.0"), entries.get(ARTIFACT), "3.7.0"), []);
});

test("changed artifact bytes fail even when the version text is unchanged", t => {
  const { entries } = load(t, { artifacts: [entry()] });
  const edited = Buffer.from("<p>Pipelock v3.6.0 </p>\n");
  const findings = auditHistoricalArtifact(ARTIFACT, edited, claims("3.6.0"), entries.get(ARTIFACT), "3.7.0");
  assert.equal(findings.length, 1);
  assert.match(findings[0], /bytes changed/);
});

for (const [recorded, declared] of [["3.7.0", "3.7.0"], ["3.8.0", "3.7.0"], ["3.7.1", "3.7.0"]]) {
  test(`a classification recording ${recorded} under declared ${declared} must be retired`, t => {
    const { entries } = load(t, { artifacts: [entry({ pipelock_version: recorded })] });
    const findings = auditHistoricalArtifact(ARTIFACT, BYTES, claims(recorded), entries.get(ARTIFACT), declared);
    assert.ok(findings.some(finding => /not older than declared/.test(finding)), findings.join("\n"));
  });
}

test("a version claim other than the recorded version still fails", t => {
  const { entries } = load(t, { artifacts: [entry()] });
  const findings = auditHistoricalArtifact(ARTIFACT, BYTES, claims("3.6.0", "3.5.0"), entries.get(ARTIFACT), "3.7.0");
  assert.equal(findings.length, 1);
  assert.match(findings[0], /3\.5\.0 disagrees with its historical classification 3\.6\.0/);
});

test("a classified artifact that never states its recorded version fails", t => {
  const { entries } = load(t, { artifacts: [entry()] });
  const findings = auditHistoricalArtifact(ARTIFACT, BYTES, [[1, []]], entries.get(ARTIFACT), "3.7.0");
  assert.equal(findings.length, 1);
  assert.match(findings[0], /never states its recorded version/);
});

for (const path of [
  "content/pipelock.md",
  "static/llms.txt",
  "static/llms-full.txt",
  "static/gauntlet/evidence/latest-verified.json",
  "static/assess/../../content/pipelock.md",
  "static/assess/not-on-the-list/index.html",
]) {
  test(`path ${path} cannot be classified`, t => {
    const { entries, findings } = load(t, { artifacts: [entry({ path })] });
    assert.equal(entries.size, 0);
    assert.equal(findings.length, 1);
    assert.match(findings[0], /not an eligible signed static artifact/);
  });
}

for (const [name, document] of [
  ["invalid JSON", "{"],
  ["an array root", []],
  ["an extra root key", { artifacts: [], exempt: true }],
  ["a non-array artifacts value", { artifacts: {} }],
  ["a non-object entry", { artifacts: ["static/assess/demo-assessment/index.html"] }],
  ["an unknown entry key", { artifacts: [{ ...entry(), allow_any_version: true }] }],
  ["a missing entry key", { artifacts: [(({ sha256, ...rest }) => rest)(entry())] }],
  ["a malformed sha256", { artifacts: [entry({ sha256: "abc" })] }],
  ["a two-part version", { artifacts: [entry({ pipelock_version: "3.6" })] }],
  ["an empty reason", { artifacts: [entry({ reason: " " })] }],
  ["a malformed date", { artifacts: [entry({ classified: "Oct 14" })] }],
  ["an empty approval", { artifacts: [entry({ approved_by: "" })] }],
]) {
  test(`${name} fails closed`, t => {
    const { entries, findings } = load(t, document);
    assert.equal(entries.size, 0);
    assert.equal(findings.length, 1, findings.join("\n"));
  });
}

test("a duplicate path is rejected rather than merged", t => {
  const { entries, findings } = load(t, { artifacts: [entry(), entry()] });
  assert.equal(entries.size, 1);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /duplicates/);
});

test("the repository classification pins the committed demo bytes", () => {
  const document = JSON.parse(readFileSync(HISTORICAL_ARTIFACTS_FILE, "utf8"));
  assert.equal(document.artifacts.length, 3);
  for (const artifact of document.artifacts) {
    assert.match(artifact.path, /^static\/assess\/demo-(assessment|egress-report|summary)\/index\.html$/);
    const actual = createHash("sha256").update(readFileSync(artifact.path)).digest("hex");
    assert.equal(actual, artifact.sha256, artifact.path);
    assert.equal(artifact.pipelock_version, "3.6.0");
  }
});

function demoRoot(t, { classify = true, bytes = BYTES } = {}) {
  const root = mkdtempSync(join(tmpdir(), "historical-demo-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(dirname(join(root, ARTIFACT)), { recursive: true });
  writeFileSync(join(root, ARTIFACT), bytes);
  if (classify) {
    mkdirSync(dirname(join(root, HISTORICAL_ARTIFACTS_FILE)), { recursive: true });
    writeFileSync(join(root, HISTORICAL_ARTIFACTS_FILE), JSON.stringify({ artifacts: [entry()] }));
  }
  return root;
}

test("site audit accepts an unchanged classified demo that states its recorded version", t => {
  assert.deepEqual(auditDemoVersions(demoRoot(t), "3.7.0", [ARTIFACT]), []);
});

test("site audit rejects a classified demo whose bytes changed", t => {
  const issues = auditDemoVersions(demoRoot(t, { bytes: Buffer.from("<p>Pipelock v3.6.0 </p>\n") }), "3.7.0", [ARTIFACT]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /classified historical demo bytes changed/);
});

test("site audit still requires the current release in an unclassified demo", t => {
  const issues = auditDemoVersions(demoRoot(t, { classify: false }), "3.7.0", [ARTIFACT]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /missing current release version v3\.7\.0/);
});

test("site audit rejects a classified demo that no longer states its recorded version", t => {
  const bytes = Buffer.from("<p>Pipelock sample</p>\n");
  const root = demoRoot(t, { bytes });
  writeFileSync(join(root, HISTORICAL_ARTIFACTS_FILE), JSON.stringify({ artifacts: [entry({ sha256: createHash("sha256").update(bytes).digest("hex") })] }));
  const issues = auditDemoVersions(root, "3.7.0", [ARTIFACT]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /does not state its recorded version v3\.6\.0/);
});
