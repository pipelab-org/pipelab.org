#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";

const repoRoot = process.cwd();
const replayRoot = path.join(repoRoot, "static", "playground-replay");
const verifierBin = path.join(repoRoot, ".pipelock-verifier");

function readPin() {
  const pinPath = path.join(repoRoot, "scripts", "pipelock-verifier-pin.env");
  const entries = readFileSync(pinPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) throw new Error(`invalid verifier pin line: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1)];
    });
  return Object.fromEntries(entries);
}

function requirePinnedVerifier(version) {
  const result = spawnSync(verifierBin, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (result.error) throw new Error(`cannot run pinned verifier ${verifierBin}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`verifier version probe exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  const expectedPrefix = `pipelock-verifier ${version} `;
  if (!result.stdout.startsWith(expectedPrefix)) {
    throw new Error(`verifier version mismatch: expected ${version}, got ${result.stdout.trim()}`);
  }
}

function scenarioDirectory(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid gallery scenario id: ${id}`);
  const candidate = path.join(replayRoot, id);
  if (!existsSync(candidate) || !lstatSync(candidate).isDirectory()) {
    throw new Error(`gallery scenario directory is missing: ${id}`);
  }
  const resolvedRoot = realpathSync(replayRoot);
  const resolvedCandidate = realpathSync(candidate);
  if (!resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`gallery scenario resolves outside replay root: ${id}`);
  }
  return resolvedCandidate;
}

function verifyScenario(id, trust) {
  const directory = scenarioDirectory(id);
  const assurancePath = path.join(directory, "assurance.json");
  const appraisalPath = path.join(directory, "appraisal.json");
  if (!existsSync(assurancePath) || !lstatSync(assurancePath).isFile()) {
    throw new Error(`${id}: assurance.json is missing or not a regular file`);
  }
  if (!existsSync(appraisalPath) || !lstatSync(appraisalPath).isFile()) {
    throw new Error(`${id}: appraisal.json is missing or not a regular file`);
  }

  const result = spawnSync(
    verifierBin,
    ["aarp", "assurance.json", "--trust", "../appraiser-trust.json", "--json"],
    { cwd: directory, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  if (result.error) throw new Error(`${id}: verifier failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${id}: verifier exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }

  let actual;
  try {
    actual = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${id}: verifier did not emit one JSON appraisal: ${error.message}`);
  }

  const verifiedClaims = new Set(actual.verified_claims || []);
  const identityClaims = new Set(actual.axes?.identity || []);
  const integrityClaims = new Set(actual.axes?.integrity || []);
  const verifiedAxes = new Set(actual.assurance?.axes_with_verified_claims || []);
  const signatureVerified = (actual.signatures || []).some(
    (signature) =>
      signature.status === "verified" &&
      signature.alg === "ed25519" &&
      signature.signer_role === "mediator" &&
      typeof trust.trusted_keys?.[signature.key_id] === "string" &&
      trust.trust_entries?.[signature.key_id]?.role === "mediator",
  );
  if (
    actual.profile !== "aarp/v0.1" ||
    actual.assertion_signed !== true ||
    !signatureVerified ||
    !verifiedClaims.has("mediator_key_pinned") ||
    !verifiedClaims.has("receipt_signature_valid") ||
    !identityClaims.has("mediator_key_pinned") ||
    !integrityClaims.has("receipt_signature_valid") ||
    !verifiedAxes.has("identity") ||
    !verifiedAxes.has("integrity")
  ) {
    throw new Error(`${id}: verifier exited successfully without validating the required signatures and trust binding`);
  }

  const expected = JSON.parse(readFileSync(appraisalPath, "utf8"));
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${id}: verifier appraisal differs from committed appraisal.json`);
  }
}

function main() {
  const pin = readPin();
  const version = pin.PIPELAB_VERIFIER_VERSION;
  if (!version) throw new Error("verifier pin does not define PIPELAB_VERIFIER_VERSION");
  requirePinnedVerifier(version);

  const trustPath = path.join(replayRoot, "appraiser-trust.json");
  if (!existsSync(trustPath) || !lstatSync(trustPath).isFile()) {
    throw new Error("playground appraiser trust file is missing or not a regular file");
  }
  const trust = JSON.parse(readFileSync(trustPath, "utf8"));
  if (!trust.trusted_keys || !trust.trust_entries) {
    throw new Error("playground appraiser trust file does not define trusted keys and trust entries");
  }
  const gallery = JSON.parse(readFileSync(path.join(replayRoot, "gallery.json"), "utf8"));
  const scenarios = gallery.scenarios || [];
  if (scenarios.length === 0) throw new Error("playground gallery contains no scenarios");
  const scenarioIds = scenarios.map((scenario) => scenario.id);
  if (new Set(scenarioIds).size !== scenarioIds.length) {
    throw new Error("playground gallery contains a duplicate scenario id");
  }
  const artifactIds = readdirSync(replayRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const directory = path.join(replayRoot, entry.name);
      return existsSync(path.join(directory, "assurance.json")) || existsSync(path.join(directory, "appraisal.json"));
    })
    .map((entry) => entry.name);
  const listed = new Set(scenarioIds);
  const stored = new Set(artifactIds);
  const omitted = artifactIds.filter((id) => !listed.has(id));
  const missing = scenarioIds.filter((id) => !stored.has(id));
  if (omitted.length > 0 || missing.length > 0) {
    throw new Error(
      `playground gallery and signed artifact directories differ: omitted=${omitted.join(",") || "none"} missing=${missing.join(",") || "none"}`,
    );
  }
  for (const scenario of scenarios) verifyScenario(scenario.id, trust);
  console.log(`playground assurances: ${scenarios.length} signed appraisals verified with pipelock-verifier ${version}`);
}

try {
  main();
} catch (error) {
  console.error(`playground assurances: ${error.message}`);
  process.exit(1);
}
