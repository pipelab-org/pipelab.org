#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { auditEvidence } from "./gauntlet-evidence-audit.mjs";

const execFile = promisify(execFileCallback);
const canonicalRemote = new Set([
  "git@github.com:luckyPipewrench/pipelab.org.git",
  "ssh://git@github.com/luckyPipewrench/pipelab.org.git",
  "https://github.com/luckyPipewrench/pipelab.org",
  "https://github.com/luckyPipewrench/pipelab.org.git",
]);
const exactContract = {
  artifact_name_prefix: "pipelock-gauntlet-candidate-attempt-",
  artifact_prefix: "github-actions:luckyPipewrench/pipelock:",
  benchmark_repository: "luckyPipewrench/agent-egress-bench",
  schema_version: 1,
  source_branch: "main",
  source_repository: "luckyPipewrench/pipelock",
  source_acceptance_baseline: "benchmark/gauntlet-baseline.json",
  source_workflow: ".github/workflows/continuous-gauntlet.yaml",
  url_prefix: "https://github.com/luckyPipewrench/pipelock/actions/runs/",
};

function fail(message) {
  throw new Error(`gauntlet promotion: ${message}`);
}

async function run(command, args, options = {}) {
  try {
    return await execFile(command, args, { maxBuffer: 16 * 1024 * 1024, ...options });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || "").trim();
    throw new Error(detail || `${command} failed`, { cause: error });
  }
}

async function git(repoRoot, ...args) {
  return (await run("git", ["-C", repoRoot, ...args])).stdout.trimEnd();
}

export function porcelainPaths(output) {
  return String(output).split("\0").filter(Boolean).map((entry) => {
    if (entry.length < 4 || entry[2] !== " " || /[RC]/.test(entry.slice(0, 2))) {
      fail("promotion produced an unsupported git status entry");
    }
    return entry.slice(3);
  });
}

export function validateContract(contract) {
  const keys = Object.keys(exactContract).sort();
  if (JSON.stringify(Object.keys(contract).sort()) !== JSON.stringify(keys) ||
      keys.some((key) => contract[key] !== exactContract[key])) fail("promotion contract drifted");
  return contract;
}

export function validateCandidateMethod(metadata, contract, benchmarkCommit) {
  if (metadata?.corpus_repository !== contract.benchmark_repository ||
      metadata?.corpus_git_sha !== benchmarkCommit) {
    fail("candidate method identity does not match the pinned benchmark contract");
  }
}

export function workflowBenchmarkPin(workflow) {
  const source = String(workflow);
  const matches = [...source.matchAll(/^\s*AEB_REF:\s*([0-9a-f]{40})\s*(?:#.*)?$/gm)];
  const consumers = [...source.matchAll(/^\s*ref:\s*\$\{\{\s*env\.AEB_REF\s*\}\}\s*(?:#.*)?$/gm)];
  if (matches.length !== 1 || consumers.length !== 1) {
    fail("source workflow must define and consume exactly one immutable AEB_REF");
  }
  return matches[0][1];
}

export function validateSourceRun(runRecord, contract, runId) {
  const workflowPath = String(runRecord.path || "").split("@")[0];
  if (String(runRecord.id) !== String(runId) || runRecord.repository?.full_name !== contract.source_repository ||
      workflowPath !== contract.source_workflow || runRecord.head_branch !== contract.source_branch ||
      runRecord.status !== "completed" || runRecord.conclusion !== "success" ||
      !["schedule", "workflow_dispatch"].includes(runRecord.event) ||
      !/^[0-9a-f]{40}$/.test(runRecord.head_sha || "") ||
      !Number.isInteger(runRecord.run_attempt) || runRecord.run_attempt < 1) {
    fail("source run is not a successful canonical main-branch candidate");
  }
  return {
    artifactName: `${contract.artifact_name_prefix}${runRecord.run_attempt}`,
    runAttempt: runRecord.run_attempt,
    sourceSha: runRecord.head_sha,
  };
}

export function validateComparison(comparison, sourceSha) {
  if (!["ahead", "identical"].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== sourceSha) {
    fail("source run commit is not retained on current Pipelock main");
  }
}

async function verifySiteWorktree(repoRoot) {
  if (!canonicalRemote.has(await git(repoRoot, "remote", "get-url", "origin"))) {
    fail("site checkout origin is not canonical");
  }
  await run("git", ["-C", repoRoot, "fetch", "origin", "main"]);
  if (await git(repoRoot, "branch", "--show-current") === "main") fail("use a fresh feature branch");
  if (await git(repoRoot, "status", "--porcelain")) fail("site worktree must start clean");
  if (await git(repoRoot, "rev-parse", "HEAD") !== await git(repoRoot, "rev-parse", "origin/main")) {
    fail("feature branch must start at current origin/main");
  }
}

async function ghJSON(endpoint) {
  return JSON.parse((await run("gh", ["api", endpoint])).stdout);
}

async function verifySource(runId, contract) {
  const runRecord = await ghJSON(`repos/${contract.source_repository}/actions/runs/${runId}`);
  const { artifactName, runAttempt, sourceSha } = validateSourceRun(runRecord, contract, runId);
  const comparison = await ghJSON(
    `repos/${contract.source_repository}/compare/${sourceSha}...${contract.source_branch}`,
  );
  validateComparison(comparison, sourceSha);
  const workflowRecord = await ghJSON(
    `repos/${contract.source_repository}/contents/${contract.source_workflow}?ref=${sourceSha}`,
  );
  if (workflowRecord.type !== "file" || workflowRecord.encoding !== "base64" ||
      typeof workflowRecord.content !== "string") {
    fail("source workflow bytes are unavailable");
  }
  const benchmarkCommit = workflowBenchmarkPin(
    Buffer.from(workflowRecord.content.replace(/\s/g, ""), "base64").toString("utf8"),
  );
  // Pipelock owns its acceptance policy, so the source baseline must come from
  // the exact commit the run executed, never from the neutral benchmark repo.
  const baselineRecord = await ghJSON(
    `repos/${contract.source_repository}/contents/${contract.source_acceptance_baseline}?ref=${sourceSha}`,
  );
  if (baselineRecord.type !== "file" || baselineRecord.encoding !== "base64" ||
      typeof baselineRecord.content !== "string") {
    fail("source acceptance baseline bytes are unavailable");
  }
  const sourceBaseline = Buffer.from(
    baselineRecord.content.replace(/\s/g, ""), "base64",
  ).toString("utf8");
  const artifacts = await ghJSON(`repos/${contract.source_repository}/actions/runs/${runId}/artifacts`);
  const matches = (artifacts.artifacts || []).filter(
    (artifact) => artifact.name === artifactName && !artifact.expired,
  );
  if (matches.length !== 1) fail("source run must contain one unexpired candidate artifact");
  return { artifactName, benchmarkCommit, runAttempt, sourceBaseline, sourceSha };
}

async function verifyChangedPaths(repoRoot, candidateBefore) {
  const status = (await run("git", ["-C", repoRoot, "status", "--porcelain=v1", "-z"])).stdout;
  const changedPaths = porcelainPaths(status);
  const allowed = new Set([
    "benchmark/gauntlet-baseline.json",
    "static/gauntlet/evidence/latest-verified.json",
  ]);
  for (const changed of changedPaths) {
    if (!allowed.has(changed) && !changed.startsWith("static/gauntlet/evidence/results/pipelock/")) {
      fail(`promotion changed an unexpected path: ${changed}`);
    }
  }
  const pointer = JSON.parse(await readFile(
    path.join(repoRoot, "static", "gauntlet", "evidence", "latest-verified.json"), "utf8",
  ));
  if (pointer.candidate_sha256 === candidateBefore) fail("promotion did not create a new candidate record");
}

export async function preparePromotion({ repoRoot, runId, acceptPolicyChange = false }) {
  if (!/^\d+$/.test(String(runId))) fail("run ID must be numeric");
  await verifySiteWorktree(repoRoot);
  const contract = validateContract(JSON.parse(await readFile(
    path.join(repoRoot, "benchmark", "gauntlet-promotion.json"), "utf8",
  )));
  const { artifactName, benchmarkCommit, runAttempt, sourceBaseline, sourceSha } =
    await verifySource(runId, contract);
  const previous = JSON.parse(await readFile(
    path.join(repoRoot, "static", "gauntlet", "evidence", "latest-verified.json"), "utf8",
  )).candidate_sha256;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pipelab-gauntlet-promotion-"));
  try {
    const artifact = path.join(temporary, "artifact");
    const benchmark = path.join(temporary, "benchmark");
    const sourceBaselinePath = path.join(temporary, "source-baseline.json");
    await writeFile(sourceBaselinePath, sourceBaseline);
    // The record retains the acceptance policy but nothing saying where it came
    // from, so a substituted policy with a recomputed decision would satisfy
    // every other check. This states the owner, and the digest ties the claim to
    // the bytes actually used.
    const sourceBaselineOriginPath = path.join(temporary, "source-baseline-origin.json");
    await writeFile(sourceBaselineOriginPath, JSON.stringify({
      schema_version: 1,
      repository: contract.source_repository,
      commit: sourceSha,
      path: contract.source_acceptance_baseline,
      sha256: createHash("sha256").update(sourceBaseline, "utf8").digest("hex"),
    }, null, 2) + "\n");
    await run("gh", ["run", "download", String(runId), "--repo", contract.source_repository,
      "--name", artifactName, "--dir", artifact]);
    validateCandidateMethod(JSON.parse(await readFile(
      path.join(artifact, "run-metadata.json"), "utf8",
    )), contract, benchmarkCommit);
    await run("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout",
      `https://github.com/${contract.benchmark_repository}.git`, benchmark]);
    await run("git", ["-C", benchmark, "fetch", "--quiet", "origin", benchmarkCommit]);
    await run("git", ["-C", benchmark, "checkout", "--quiet", "--detach", benchmarkCommit]);
    const promoteArgs = [
      path.join(benchmark, "scripts", "promote_gauntlet_candidate.py"),
      "--artifact-dir", artifact,
      "--baseline", path.join(repoRoot, "benchmark", "gauntlet-baseline.json"),
      "--source-baseline", sourceBaselinePath,
      "--source-baseline-origin", sourceBaselineOriginPath,
      "--store-root", path.join(repoRoot, "static", "gauntlet", "evidence", "results"),
      "--latest", path.join(repoRoot, "static", "gauntlet", "evidence", "latest-verified.json"),
      "--artifact-prefix", contract.artifact_prefix,
      "--url-prefix", contract.url_prefix,
      "--expected-run-id", String(runId),
      "--expected-run-attempt", String(runAttempt),
    ];
    if (acceptPolicyChange) promoteArgs.push("--accept-policy-change");
    await run("python3", promoteArgs, { cwd: benchmark });
    await run("python3", [
      path.join(benchmark, "scripts", "validate_gauntlet_records.py"),
      "--site-root", path.join(repoRoot, "static", "gauntlet", "evidence"),
      "--baseline", path.join(repoRoot, "benchmark", "gauntlet-baseline.json"),
      "--repo-root", benchmark,
      "--artifact-prefix", contract.artifact_prefix,
      "--url-prefix", contract.url_prefix,
    ]);
    await auditEvidence(repoRoot);
    await verifyChangedPaths(repoRoot, previous);
    console.log(`gauntlet promotion: prepared run ${runId} for review`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const runId = process.argv[2];
  const acceptPolicyChange = process.argv.slice(3).includes("--accept-policy-change");
  preparePromotion({ repoRoot: process.cwd(), runId, acceptPolicyChange }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
