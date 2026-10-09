#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const destinationRepository = "luckyPipewrench/pipelab.org";
const recordV3RequiredFiles = [
  "continuous-gauntlet-pipelock.json",
  "destination-baseline.json",
  "destination-promotion-decision.json",
  "reviewed-baseline.json",
  "reviewed-promotion-decision.json",
  "source-baseline.json",
  "source-promotion-decision.json",
];
// Version 4 keeps every v3 file and adds the locator naming where the acceptance
// policy came from. A record that declares v4 without it would carry a decision
// with no way to check whose policy produced it, which is the gap v4 exists to close.
const recordV4RequiredFiles = [...recordV3RequiredFiles, "source-baseline-origin.json"];
const acceptedRecordSchemaVersions = [1, 3, 4];
const requiredFilesBySchemaVersion = new Map([
  [3, recordV3RequiredFiles],
  [4, recordV4RequiredFiles],
]);

function fail(message) {
  throw new Error(`gauntlet evidence: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateRecordManifestShape(manifest, candidate) {
  if (!isObject(manifest) || !acceptedRecordSchemaVersions.includes(manifest.schema_version) ||
      manifest.tool !== "pipelock" || manifest.candidate_sha256 !== candidate ||
      !isObject(manifest.files)) {
    fail(`invalid record manifest for ${candidate}`);
  }
  const required = requiredFilesBySchemaVersion.get(manifest.schema_version);
  if (required) {
    for (const name of required) {
      if (!Object.hasOwn(manifest.files, name)) {
        fail(`record manifest v${manifest.schema_version} is missing ${name} for ${candidate}`);
      }
    }
  }
}

function relativeDestination(sourcePath) {
  const prefix = "gauntlet-site/";
  if (typeof sourcePath !== "string" || !sourcePath.startsWith(prefix)) {
    fail(`unsafe source path ${JSON.stringify(sourcePath)}`);
  }
  const relative = sourcePath.slice(prefix.length);
  if (!relative || relative.split("/").includes("..")) {
    fail(`unsafe source path ${JSON.stringify(sourcePath)}`);
  }
  return `static/gauntlet/evidence/${relative}`;
}

async function filesUnder(root, repoRoot) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) fail(`symlink is not allowed: ${relative}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) found.push(relative);
      else fail(`non-file evidence entry is not allowed: ${relative}`);
    }
  }
  await walk(root);
  return found.sort();
}

async function readJSON(filePath) {
  return JSON.parse((await readFile(filePath)).toString("utf8"));
}

function safeRecordPath(pointerPath, expectedSuffix) {
  if (typeof pointerPath !== "string" || !pointerPath.startsWith("./results/pipelock/") ||
      !pointerPath.endsWith(expectedSuffix) || pointerPath.split("/").includes("..")) {
    fail(`unsafe record path ${JSON.stringify(pointerPath)}`);
  }
  return pointerPath.slice(2);
}

export function validateRecordOrigin(manifest, candidate) {
  const artifact = /^github-actions:luckyPipewrench\/(agent-egress-bench|pipelock):(\d+)(?::([1-9]\d*))?$/.exec(
    manifest.artifact_id || "",
  );
  const baseUrl = artifact &&
    `https://github.com/luckyPipewrench/${artifact[1]}/actions/runs/${artifact[2]}`;
  const validUrls = artifact?.[3] ? [baseUrl, `${baseUrl}/attempts/${artifact[3]}`] : [baseUrl];
  if (!artifact || !validUrls.includes(manifest.canonical_url)) {
    fail(`record origin is invalid for ${candidate}`);
  }
  return artifact[1];
}

function parseTimestamp(value, candidate) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(`invalid generated_at for ${candidate}`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) fail(`invalid generated_at for ${candidate}`);
  return timestamp;
}

export async function auditEvidence(repoRoot = process.cwd()) {
  const evidenceRoot = path.join(repoRoot, "static", "gauntlet", "evidence");
  const inventoryPath = path.join(evidenceRoot, "inventory.json");
  const inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  if (!isObject(inventory) || inventory.schema_version !== 1) fail("inventory schema is invalid");
  if (!/^[0-9a-f]{40}$/.test(inventory.source_commit)) fail("source_commit is invalid");
  if (!Array.isArray(inventory.entries) || inventory.entries.length === 0) {
    fail("inventory entries must be a non-empty array");
  }

  const expectedPaths = new Set(["static/gauntlet/evidence/inventory.json"]);
  let previousSource = "";
  for (const entry of inventory.entries) {
    if (!isObject(entry) || typeof entry.source_path !== "string") fail("inventory entry is invalid");
    if (entry.source_path <= previousSource) fail("inventory entries are duplicated or out of order");
    previousSource = entry.source_path;
    const expectedPath = relativeDestination(entry.source_path);
    const expectedUrl = `https://pipelab.org/${expectedPath.slice("static/".length)}`;
    if (!isObject(entry.planned_destination) ||
        entry.planned_destination.repository !== destinationRepository ||
        entry.planned_destination.path !== expectedPath ||
        entry.planned_destination.url !== expectedUrl) {
      fail(`destination contract drifted for ${entry.source_path}`);
    }
    const absolute = path.join(repoRoot, expectedPath);
    const metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`evidence is not a regular file: ${expectedPath}`);
    if (entry.source_path !== "gauntlet-site/latest-verified.json") {
      const bytes = await readFile(absolute);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (metadata.size !== entry.bytes || digest !== entry.sha256) {
        fail(`byte identity mismatch for ${expectedPath}`);
      }
    }
    expectedPaths.add(expectedPath);
  }

  const resultsRoot = path.join(evidenceRoot, "results", "pipelock");
  const recordDirectories = (await readdir(resultsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const records = [];
  for (const candidate of recordDirectories) {
    if (!/^[0-9a-f]{64}$/.test(candidate)) fail(`invalid result directory ${candidate}`);
    const recordRoot = path.join(resultsRoot, candidate);
    const manifestPath = path.join(recordRoot, "record-manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    validateRecordManifestShape(manifest, candidate);
    const originRepository = validateRecordOrigin(manifest, candidate);
    const declared = Object.keys(manifest.files).sort();
    if (declared.includes("record-manifest.json")) fail(`manifest includes itself for ${candidate}`);
    for (const name of declared) {
      if (name.includes("/") || name === "" || !/^[0-9a-f]{64}$/.test(manifest.files[name])) {
        fail(`invalid manifest file entry ${JSON.stringify(name)} for ${candidate}`);
      }
      const bytes = await readFile(path.join(recordRoot, name));
      if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[name]) {
        fail(`record digest mismatch for ${candidate}/${name}`);
      }
    }
    const actualRecordFiles = (await filesUnder(recordRoot, repoRoot))
      .map((file) => path.relative(
        path.relative(repoRoot, recordRoot),
        file,
      ).split(path.sep).join("/"))
      .sort();
    const expectedRecordFiles = [...declared, "record-manifest.json"].sort();
    if (JSON.stringify(actualRecordFiles) !== JSON.stringify(expectedRecordFiles)) {
      fail(`record file set differs for ${candidate}`);
    }
    for (const recordFile of await filesUnder(recordRoot, repoRoot)) expectedPaths.add(recordFile);
    records.push({
      candidate,
      generatedAt: manifest.generated_at,
      generatedTimestamp: parseTimestamp(manifest.generated_at, candidate),
      manifest,
      manifestDigest: createHash("sha256").update(manifestBytes).digest("hex"),
      originRepository,
    });
  }
  records.sort((a, b) => a.generatedTimestamp - b.generatedTimestamp);
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index];
    const previous = records[index - 1];
    if (previous && current.generatedTimestamp <= previous.generatedTimestamp) {
      fail("record timestamps are not strictly increasing");
    }
    if ((current.manifest.previous_candidate_sha256 ?? null) !== (previous?.candidate ?? null) ||
        (current.manifest.previous_record_manifest_sha256 ?? null) !== (previous?.manifestDigest ?? null)) {
      fail(`record predecessor mismatch for ${current.candidate}`);
    }
    if (previous && current.originRepository !== "pipelock") {
      fail(`successor record origin must be Pipelock for ${current.candidate}`);
    }
  }

  const pointer = await readJSON(path.join(evidenceRoot, "latest-verified.json"));
  const latest = records.at(-1);
  if (!latest || pointer.status !== "verified" || pointer.tool !== "pipelock" ||
      pointer.candidate_sha256 !== latest.candidate ||
      pointer.record_manifest_sha256 !== latest.manifestDigest ||
      safeRecordPath(pointer.record_manifest_path, "/record-manifest.json") !==
        `results/pipelock/${latest.candidate}/record-manifest.json` ||
      safeRecordPath(pointer.record_path, "/continuous-gauntlet-pipelock.json") !==
        `results/pipelock/${latest.candidate}/continuous-gauntlet-pipelock.json`) {
    fail("latest-verified pointer does not select the newest record");
  }
  for (const field of ["artifact_id", "canonical_url", "generated_at", "tool_version"]) {
    if (pointer[field] !== latest.manifest[field]) fail(`latest-verified ${field} differs from its record`);
  }
  const baselineBytes = await readFile(path.join(repoRoot, "benchmark", "gauntlet-baseline.json"));
  if (createHash("sha256").update(baselineBytes).digest("hex") !== latest.manifest.files["reviewed-baseline.json"]) {
    fail("site promotion baseline differs from the newest reviewed record");
  }

  const actualPaths = await filesUnder(evidenceRoot, repoRoot);
  const expectedPathList = [...expectedPaths].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPathList)) {
    const expected = new Set(expectedPathList);
    const actual = new Set(actualPaths);
    const missing = expectedPathList.filter((value) => !actual.has(value));
    const unknown = actualPaths.filter((value) => !expected.has(value));
    fail(`file set differs: missing=${JSON.stringify(missing)}, unknown=${JSON.stringify(unknown)}`);
  }
  console.log(`gauntlet evidence: OK (${records.length} append-only record(s))`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  auditEvidence().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
