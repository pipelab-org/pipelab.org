import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { auditReleaseData } from "../scripts/release-data-audit.mjs";
import { HISTORICAL_ARTIFACTS_FILE, HISTORICAL_GAUNTLET_POINTER } from "../scripts/historical-artifacts.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "release-data-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "data/pipelock_capabilities.json": JSON.stringify({source: {status: "release", release_version: "3.6.0", ref: "v3.6.0"}}),
    "scripts/pipelock-verifier-pin.env": `PIPELAB_VERIFIER_VERSION=3.6.0\nPIPELAB_VERIFIER_LINUX_AMD64_SHA256=${"a".repeat(64)}\n`,
    "static/gauntlet/evidence/latest-verified.json": JSON.stringify({status: "verified", tool: "pipelock", tool_version: "3.6.0"}),
    ".github/workflows/sync-pipelock-rules.yml": `jobs:\n  sync:\n    env:\n      PIPELOCK_VERSION: 3.6.0\n      PIPELOCK_SHA256: ${"c".repeat(64)}\n`,
  };
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), {recursive: true});
    writeFileSync(join(root, file), source);
  }
  return {root, files};
}

function historicalFixture(t, overrides = {}) {
  const current = fixture(t);
  for (const file of ["data/pipelock_capabilities.json", "scripts/pipelock-verifier-pin.env", ".github/workflows/sync-pipelock-rules.yml"]) {
    writeFileSync(join(current.root, file), current.files[file].replaceAll("3.6.0", "3.7.0"));
  }
  const entry = {
    path: HISTORICAL_GAUNTLET_POINTER,
    pipelock_version: "3.6.0",
    sha256: createHash("sha256").update(current.files[HISTORICAL_GAUNTLET_POINTER]).digest("hex"),
    reason: "Preserved reviewed measurement",
    classified: "2026-10-16",
    approved_by: "Repository review",
    ...overrides,
  };
  const writeClassification = value => writeFileSync(join(current.root, HISTORICAL_ARTIFACTS_FILE), typeof value === "string" ? value : JSON.stringify(value));
  writeClassification({ artifacts: [entry] });
  return { ...current, entry, writeClassification };
}

test("an unchanged classified older measurement passes alongside current release data", t => {
  assert.deepEqual(auditReleaseData(historicalFixture(t).root, "3.7.0"), []);
});

test("removing classification restores strict current-version checking", t => {
  const current = historicalFixture(t);
  rmSync(join(current.root, HISTORICAL_ARTIFACTS_FILE));
  assert.match(auditReleaseData(current.root, "3.7.0").join("\n"), /tool_version "3.6.0" disagrees/);
});

for (const document of ["{", "null", '{"artifacts": {}}']) {
  test(`malformed historical metadata fails closed: ${document}`, t => {
    const current = historicalFixture(t);
    current.writeClassification(document);
    assert.ok(auditReleaseData(current.root, "3.7.0").length > 0);
  });
}

for (const [name, edit] of [
  ["changed pointer bytes", current => writeFileSync(join(current.root, HISTORICAL_GAUNTLET_POINTER), current.files[HISTORICAL_GAUNTLET_POINTER] + "\n")],
  ["a mismatched recorded version", current => current.writeClassification({ artifacts: [{ ...current.entry, pipelock_version: "3.5.0" }] })],
  ["a classification at the current version", current => current.writeClassification({ artifacts: [{ ...current.entry, pipelock_version: "3.7.0" }] })],
  ["a classification newer than the current version", current => current.writeClassification({ artifacts: [{ ...current.entry, pipelock_version: "3.8.0" }] })],
  ["a missing classified pointer", current => rmSync(join(current.root, HISTORICAL_GAUNTLET_POINTER))],
  ["a current product snapshot classified as history", current => current.writeClassification({ artifacts: [{ ...current.entry, path: "data/pipelock_capabilities.json" }] })],
]) {
  test(`${name} cannot pass historical release-data checking`, t => {
    const current = historicalFixture(t);
    edit(current);
    assert.ok(auditReleaseData(current.root, "3.7.0").length > 0);
  });
}

for (const field of ["status", "tool"]) {
  test(`a hash-matched historical pointer with invalid ${field} still fails`, t => {
    const current = historicalFixture(t);
    const pointer = JSON.parse(current.files[HISTORICAL_GAUNTLET_POINTER]);
    pointer[field] = "invalid";
    const bytes = JSON.stringify(pointer);
    writeFileSync(join(current.root, HISTORICAL_GAUNTLET_POINTER), bytes);
    current.writeClassification({ artifacts: [{ ...current.entry, sha256: createHash("sha256").update(bytes).digest("hex") }] });
    assert.match(auditReleaseData(current.root, "3.7.0").join("\n"), /require verified Pipelock evidence/);
  });
}

test("matching release data passes", t => {
  assert.deepEqual(auditReleaseData(fixture(t).root, "3.6.0"), []);
});

for (const extra of [
  "PIPELAB_VERIFIER_LINUX_AMD64_SHA256=bad",
  `PIPELAB_VERIFIER_LINUX_AMD64_SHA256=${"b".repeat(64)}`,
  "PIPELAB_VERIFIER_VERSION=3.6.0",
  "UNKNOWN_PIN=value",
  "export PIPELAB_VERIFIER_VERSION=3.6.0",
]) {
  test(`additional pin assignment cannot pass: ${extra}`, t => {
    const {root, files} = fixture(t);
    const file = "scripts/pipelock-verifier-pin.env";
    writeFileSync(join(root, file), files[file] + extra + "\n");
    assert.ok(auditReleaseData(root, "3.6.0").some(finding => finding.startsWith(file)));
  });
}

for (const extra of [
  "      PIPELOCK_VERSION: 3.6.0",
  `      PIPELOCK_SHA256: ${"d".repeat(64)}`,
]) {
  test(`a second rules sync pin cannot pass: ${extra.trim()}`, t => {
    const {root, files} = fixture(t);
    const file = ".github/workflows/sync-pipelock-rules.yml";
    writeFileSync(join(root, file), files[file] + extra + "\n");
    assert.ok(auditReleaseData(root, "3.6.0").some(finding => finding.startsWith(file)));
  });
}

test("a malformed rules sync archive digest cannot pass", t => {
  const {root, files} = fixture(t);
  const file = ".github/workflows/sync-pipelock-rules.yml";
  writeFileSync(join(root, file), files[file].replace("c".repeat(64), "not-a-digest"));
  assert.match(auditReleaseData(root, "3.6.0").join("\n"), /malformed PIPELOCK_SHA256/);
});

for (const [name, edit] of [
  ["pins in a different job", source => source.replace("  sync:", "  diagnostics:")],
  ["pin text in a block scalar", source => source.replace("    env:", "    run: |")],
  ["commented-out pins", source => source.replaceAll("      PIPELOCK_", "      # PIPELOCK_")],
  ["a malformed YAML document", source => source + "invalid: [\n"],
  ["stale flow-style execution pins with current decoys", source => source.replace("  sync:", `  sync:\n    env: {PIPELOCK_VERSION: 3.5.0, PIPELOCK_SHA256: ${"b".repeat(64)}}\n  diagnostics:`)],
  ["step-level pin overrides", source => source + `    steps:\n      - run: pipelock --version\n        env: {PIPELOCK_VERSION: 3.5.0, PIPELOCK_SHA256: ${"b".repeat(64)}}\n`],
]) {
  test(`rules sync workflow rejects ${name}`, t => {
    const {root, files} = fixture(t);
    const file = ".github/workflows/sync-pipelock-rules.yml";
    writeFileSync(join(root, file), edit(files[file]));
    assert.ok(auditReleaseData(root, "3.6.0").some(finding => finding.startsWith(file)));
  });
}

for (const [name, source] of [
  ["quoted values and inline comments", `jobs:\n  sync:\n    env:\n      PIPELOCK_VERSION: "3.6.0" # release\n      PIPELOCK_SHA256: '${"c".repeat(64)}' # archive\n`],
  ["flow-style environment", `jobs:\n  sync:\n    env: {PIPELOCK_VERSION: 3.6.0, PIPELOCK_SHA256: ${"c".repeat(64)}}\n`],
]) {
  test(`rules sync workflow accepts ${name}`, t => {
    const {root} = fixture(t);
    writeFileSync(join(root, ".github/workflows/sync-pipelock-rules.yml"), source);
    assert.deepEqual(auditReleaseData(root, "3.6.0"), []);
  });
}

for (const file of ["data/pipelock_capabilities.json", "scripts/pipelock-verifier-pin.env", "static/gauntlet/evidence/latest-verified.json", ".github/workflows/sync-pipelock-rules.yml"]) {
  for (const state of ["missing", "malformed", "stale"]) {
    test(`${file}: ${state} cannot pass`, t => {
      const {root, files} = fixture(t);
      if (state === "missing") rmSync(join(root, file));
      else writeFileSync(join(root, file), state === "malformed" ? "null" : files[file].replaceAll("3.6.0", "3.5.0"));
      assert.ok(auditReleaseData(root, "3.6.0").some(finding => finding.startsWith(file)));
    });
  }
}
