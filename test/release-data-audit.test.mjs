import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { auditReleaseData } from "../scripts/release-data-audit.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "release-data-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "data/pipelock_capabilities.json": JSON.stringify({source: {status: "release", release_version: "3.6.0", ref: "v3.6.0"}}),
    "scripts/pipelock-verifier-pin.env": `PIPELAB_VERIFIER_VERSION=3.6.0\nPIPELAB_VERIFIER_LINUX_AMD64_SHA256=${"a".repeat(64)}\n`,
    "static/gauntlet/evidence/latest-verified.json": JSON.stringify({status: "verified", tool: "pipelock", tool_version: "3.6.0"}),
  };
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), {recursive: true});
    writeFileSync(join(root, file), source);
  }
  return {root, files};
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

for (const file of ["data/pipelock_capabilities.json", "scripts/pipelock-verifier-pin.env", "static/gauntlet/evidence/latest-verified.json"]) {
  for (const state of ["missing", "malformed", "stale"]) {
    test(`${file}: ${state} cannot pass`, t => {
      const {root, files} = fixture(t);
      if (state === "missing") rmSync(join(root, file));
      else writeFileSync(join(root, file), state === "malformed" ? "null" : files[file].replaceAll("3.6.0", "3.5.0"));
      assert.ok(auditReleaseData(root, "3.6.0").some(finding => finding.startsWith(file)));
    });
  }
}
