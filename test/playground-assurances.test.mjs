import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const sourceRoot = process.cwd();

function makeFixture(appraisal) {
  const root = mkdtempSync(path.join(os.tmpdir(), "site-assurance-test-"));
  const scenario = path.join(root, "static", "playground-replay", "signed-case");
  mkdirSync(scenario, { recursive: true });
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  cpSync(
    path.join(sourceRoot, "scripts", "verify-playground-assurances.mjs"),
    path.join(root, "scripts", "verify-playground-assurances.mjs"),
  );
  writeFileSync(
    path.join(root, "scripts", "pipelock-verifier-pin.env"),
    "PIPELAB_VERIFIER_VERSION=3.4.0\n",
  );
  writeFileSync(
    path.join(root, "static", "playground-replay", "gallery.json"),
    JSON.stringify({ scenarios: [{ id: "signed-case" }] }),
  );
  writeFileSync(
    path.join(root, "static", "playground-replay", "appraiser-trust.json"),
    `${JSON.stringify({
      trusted_keys: { "test-key": "00".repeat(32) },
      trust_entries: { "test-key": { mediator_id: "test-mediator", role: "mediator" } },
    })}\n`,
  );
  writeFileSync(path.join(scenario, "assurance.json"), "{}\n");
  writeFileSync(path.join(scenario, "appraisal.json"), `${JSON.stringify(appraisal)}\n`);

  const verifier = path.join(root, ".pipelock-verifier");
  writeFileSync(
    verifier,
    `#!/usr/bin/env node
import { readFileSync } from "node:fs";
if (process.argv.includes("--version")) {
  console.log("pipelock-verifier 3.4.0 (test fixture)");
} else {
  process.stdout.write(readFileSync(process.env.FAKE_VERIFIER_OUTPUT, "utf8"));
}
`,
  );
  chmodSync(verifier, 0o755);
  return { root, scenario, verifier };
}

function runFixture(fixture, output) {
  const outputPath = path.join(fixture.root, "verifier-output.json");
  writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
  return spawnSync(process.execPath, ["scripts/verify-playground-assurances.mjs"], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_VERIFIER_OUTPUT: outputPath,
    },
  });
}

const validAppraisal = {
  profile: "aarp/v0.1",
  assertion_signed: true,
  signatures: [{ alg: "ed25519", key_id: "test-key", signer_role: "mediator", status: "verified" }],
  verified_claims: ["mediator_key_pinned", "receipt_signature_valid"],
  axes: {
    identity: ["mediator_key_pinned"],
    integrity: ["receipt_signature_valid"],
  },
  assurance: { axes_with_verified_claims: ["identity", "integrity"] },
};

test("accepts a pinned signature appraisal that matches the committed bytes", () => {
  const fixture = makeFixture(validAppraisal);
  const result = runFixture(fixture, validAppraisal);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 signed appraisals verified/);
});

test("rejects an appraisal-matching exit-zero verifier output whose signature verdict is false", () => {
  const invalidAppraisal = {
    profile: "aarp/v0.1",
    assertion_signed: false,
    signatures: [{ alg: "ed25519", key_id: "test-key", signer_role: "mediator", status: "failed" }],
    verified_claims: [],
    axes: {},
    assurance: { axes_with_verified_claims: [] },
  };
  const fixture = makeFixture(invalidAppraisal);
  const result = runFixture(fixture, invalidAppraisal);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without validating the required signatures and trust binding/);
});

test("rejects a valid signature appraisal that differs from the committed projection", () => {
  const fixture = makeFixture({ ...validAppraisal, does_not_assert: ["action_safety"] });
  const result = runFixture(fixture, validAppraisal);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /differs from committed appraisal\.json/);
});

test("rejects required claims that are not bound to their AARP assurance axes", () => {
  const unboundAppraisal = {
    ...validAppraisal,
    axes: { identity: [], integrity: [] },
    assurance: { axes_with_verified_claims: [] },
  };
  const fixture = makeFixture(unboundAppraisal);
  const result = runFixture(fixture, unboundAppraisal);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without validating the required signatures and trust binding/);
});

test("rejects duplicate gallery ids that would verify one envelope twice", () => {
  const fixture = makeFixture(validAppraisal);
  writeFileSync(
    path.join(fixture.root, "static", "playground-replay", "gallery.json"),
    JSON.stringify({ scenarios: [{ id: "signed-case" }, { id: "signed-case" }] }),
  );
  const result = runFixture(fixture, validAppraisal);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate scenario id/);
});

test("rejects an on-disk signed envelope omitted from the gallery", () => {
  const fixture = makeFixture(validAppraisal);
  const omitted = path.join(fixture.root, "static", "playground-replay", "omitted-case");
  mkdirSync(omitted);
  writeFileSync(path.join(omitted, "assurance.json"), "{}\n");
  writeFileSync(path.join(omitted, "appraisal.json"), `${JSON.stringify(validAppraisal)}\n`);
  const result = runFixture(fixture, validAppraisal);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /omitted=omitted-case/);
});
