import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditEvidence,
  validateRecordManifestShape,
  validateRecordOrigin,
} from "../scripts/gauntlet-evidence-audit.mjs";
import {
  validateComparison,
  validateCandidateMethod,
  validateContract,
  validateSourceRun,
  porcelainPaths,
  workflowBenchmarkPin,
} from "../scripts/prepare-gauntlet-promotion.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const contractPath = path.join(repoRoot, "benchmark", "gauntlet-promotion.json");
const scriptPath = path.join(repoRoot, "scripts", "prepare-gauntlet-promotion.mjs");

async function contract() {
  return JSON.parse(await readFile(contractPath, "utf8"));
}

function sourceRun(current, overrides = {}) {
  return {
    id: 42,
    repository: { full_name: current.source_repository },
    path: `${current.source_workflow}@refs/heads/main`,
    head_branch: current.source_branch,
    head_sha: "a".repeat(40),
    status: "completed",
    conclusion: "success",
    event: "schedule",
    run_attempt: 1,
    ...overrides,
  };
}

async function evidenceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pipelab-gauntlet-audit-"));
  await cp(path.join(repoRoot, "static"), path.join(root, "static"), { recursive: true });
  await cp(path.join(repoRoot, "benchmark"), path.join(root, "benchmark"), { recursive: true });
  return root;
}

test("promotion contract pins the exact cross-repository trust boundary", async () => {
  const current = await contract();
  assert.equal(validateContract(current), current);
  assert.doesNotThrow(() => validateContract(Object.fromEntries(Object.entries(current).reverse())));
  for (const [field, replacement] of [
    ["benchmark_commit", "b".repeat(40)],
    ["source_repository", "someone/else"],
    ["artifact_prefix", "github-actions:someone/else:"],
  ]) {
    assert.throws(() => validateContract({ ...current, [field]: replacement }), /contract drifted/);
  }
});

test("candidate method identity must equal the pinned benchmark", async () => {
  const current = await contract();
  const benchmarkCommit = "c".repeat(40);
  const metadata = {
    corpus_repository: current.benchmark_repository,
    corpus_git_sha: benchmarkCommit,
  };
  assert.doesNotThrow(() => validateCandidateMethod(metadata, current, benchmarkCommit));
  assert.throws(() => validateCandidateMethod({ ...metadata, corpus_git_sha: "b".repeat(40) }, current, benchmarkCommit), /method identity/);
  assert.throws(() => validateCandidateMethod({ ...metadata, corpus_repository: "someone/else" }, current, benchmarkCommit), /method identity/);
});

test("benchmark pin is derived from the exact source workflow", () => {
  const commit = "d".repeat(40);
  const consumer = "    ref: ${{ env.AEB_REF }}";
  assert.equal(workflowBenchmarkPin(`env:\n  AEB_REF: ${commit}\n${consumer}\n`), commit);
  assert.equal(workflowBenchmarkPin(`env:\r\n  AEB_REF: ${commit} # immutable\r\n${consumer}\r\n`), commit);
  for (const workflow of [
    `env:\n  AEB_REF: main\n${consumer}\n`,
    `env:\n  AEB_REF: ${commit}\n`,
    `env:\n  AEB_REF: ${commit}\n${consumer}\n${consumer}\n`,
    `env:\n  AEB_REF: ${commit}\n  AEB_REF: ${"e".repeat(40)}\n${consumer}\n`,
    "env:\n",
  ]) {
    assert.throws(() => workflowBenchmarkPin(workflow), /define and consume exactly one immutable/);
  }
});

test("source run must be the successful canonical main candidate", async () => {
  const current = await contract();
  assert.deepEqual(validateSourceRun(sourceRun(current), current, 42), {
    artifactName: "pipelock-gauntlet-candidate-attempt-1",
    runAttempt: 1,
    sourceSha: "a".repeat(40),
  });
  assert.deepEqual(validateSourceRun(sourceRun(current, { run_attempt: 2 }), current, 42), {
    artifactName: "pipelock-gauntlet-candidate-attempt-2",
    runAttempt: 2,
    sourceSha: "a".repeat(40),
  });
  for (const overrides of [
    { conclusion: "failure" },
    { status: "in_progress" },
    { head_branch: "feature" },
    { event: "pull_request" },
    { repository: { full_name: "someone/else" } },
    { path: ".github/workflows/other.yaml@refs/heads/main" },
    { run_attempt: 0 },
  ]) {
    assert.throws(() => validateSourceRun(sourceRun(current, overrides), current, 42), /not a successful/);
  }
});

test("source commit must remain in current Pipelock main ancestry", () => {
  const sourceSha = "a".repeat(40);
  assert.doesNotThrow(() => validateComparison({
    status: "ahead", merge_base_commit: { sha: sourceSha },
  }, sourceSha));
  assert.throws(() => validateComparison({
    status: "diverged", merge_base_commit: { sha: sourceSha },
  }, sourceSha), /not retained/);
  assert.throws(() => validateComparison({
    status: "ahead", merge_base_commit: { sha: "b".repeat(40) },
  }, sourceSha), /not retained/);
});

test("promotion status parsing preserves the first path and rejects renames", () => {
  assert.deepEqual(porcelainPaths(
    " M benchmark/gauntlet-baseline.json\0?? static/gauntlet/evidence/results/pipelock/new/\0",
  ), [
    "benchmark/gauntlet-baseline.json",
    "static/gauntlet/evidence/results/pipelock/new/",
  ]);
  assert.throws(
    () => porcelainPaths("R  old.json\0new.json\0"),
    /unsupported git status entry/,
  );
});

test("site-owned evidence passes the append-only audit", async () => {
  await auditEvidence(repoRoot);
});

test("audit rejects mutation of immutable historical evidence", async () => {
  const root = await evidenceFixture();
  try {
    const target = path.join(root, "static", "gauntlet", "evidence", "gauntlet-results.json");
    await writeFile(target, `${await readFile(target, "utf8")}\n`);
    await assert.rejects(auditEvidence(root), /byte identity mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audit rejects a latest pointer that does not bind its record", async () => {
  const root = await evidenceFixture();
  try {
    const target = path.join(root, "static", "gauntlet", "evidence", "latest-verified.json");
    const pointer = JSON.parse(await readFile(target, "utf8"));
    pointer.record_manifest_sha256 = "0".repeat(64);
    await writeFile(target, `${JSON.stringify(pointer, null, 2)}\n`);
    await assert.rejects(auditEvidence(root), /does not select the newest record/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audit rejects a successor record that breaks the append-only chain", async () => {
  const root = await evidenceFixture();
  try {
    const candidate = "b".repeat(64);
    const recordRoot = path.join(
      root, "static", "gauntlet", "evidence", "results", "pipelock", candidate,
    );
    await mkdir(recordRoot, { recursive: true });
    const body = `${JSON.stringify({ tool: "pipelock" })}\n`;
    await writeFile(path.join(recordRoot, "continuous-gauntlet-pipelock.json"), body);
    const manifest = {
      artifact_id: "github-actions:luckyPipewrench/pipelock:99999",
      candidate_sha256: candidate,
      canonical_url: "https://github.com/luckyPipewrench/pipelock/actions/runs/99999",
      files: {
        "continuous-gauntlet-pipelock.json": createHash("sha256").update(body).digest("hex"),
      },
      // Later than the genesis record so it sorts as the successor, but it does
      // not bind the genesis it follows. A neutralized chain guard would instead
      // fail later with "does not select the newest record", so this regex is
      // non-vacuous: it passes only while the predecessor binding is enforced.
      generated_at: "2026-08-06T00:00:00Z",
      previous_candidate_sha256: null,
      previous_record_manifest_sha256: null,
      schema_version: 1,
      tool: "pipelock",
      tool_version: "3.3.0",
    };
    await writeFile(
      path.join(recordRoot, "record-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await assert.rejects(auditEvidence(root), /record predecessor mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audit rejects a successor record from the retired benchmark publisher", async () => {
  const root = await evidenceFixture();
  try {
    const pointer = JSON.parse(await readFile(
      path.join(root, "static", "gauntlet", "evidence", "latest-verified.json"),
      "utf8",
    ));
    const candidate = "c".repeat(64);
    const recordRoot = path.join(
      root, "static", "gauntlet", "evidence", "results", "pipelock", candidate,
    );
    await mkdir(recordRoot, { recursive: true });
    const body = `${JSON.stringify({ tool: "pipelock" })}\n`;
    await writeFile(path.join(recordRoot, "continuous-gauntlet-pipelock.json"), body);
    const manifest = {
      artifact_id: "github-actions:luckyPipewrench/agent-egress-bench:99999",
      candidate_sha256: candidate,
      canonical_url: "https://github.com/luckyPipewrench/agent-egress-bench/actions/runs/99999",
      files: {
        "continuous-gauntlet-pipelock.json": createHash("sha256").update(body).digest("hex"),
      },
      generated_at: new Date(Date.parse(pointer.generated_at) + 1000).toISOString(),
      previous_candidate_sha256: pointer.candidate_sha256,
      previous_record_manifest_sha256: pointer.record_manifest_sha256,
      schema_version: 1,
      tool: "pipelock",
      tool_version: "3.3.0",
    };
    await writeFile(
      path.join(recordRoot, "record-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await assert.rejects(auditEvidence(root), /successor record origin must be Pipelock/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audit rejects a record whose artifact and run URL name different origins", () => {
  assert.throws(() => validateRecordOrigin({
    artifact_id: "github-actions:luckyPipewrench/agent-egress-bench:30997880917",
    canonical_url: "https://github.com/luckyPipewrench/pipelock/actions/runs/30997880917",
  }, "candidate"), /record origin is invalid/);
});

test("record origin binds an optional workflow attempt to the run URL", () => {
  assert.equal(validateRecordOrigin({
    artifact_id: "github-actions:luckyPipewrench/pipelock:32542624346:1",
    canonical_url: "https://github.com/luckyPipewrench/pipelock/actions/runs/32542624346/attempts/1",
  }, "candidate"), "pipelock");
  assert.equal(validateRecordOrigin({
    artifact_id: "github-actions:luckyPipewrench/pipelock:32542624346:1",
    canonical_url: "https://github.com/luckyPipewrench/pipelock/actions/runs/32542624346",
  }, "candidate"), "pipelock");
  for (const value of [
    {
      artifact_id: "github-actions:luckyPipewrench/pipelock:32542624346:1",
      canonical_url: "https://github.com/luckyPipewrench/pipelock/actions/runs/32542624346/attempts/2",
    },
    {
      artifact_id: "github-actions:luckyPipewrench/pipelock:32542624346",
      canonical_url: "https://github.com/luckyPipewrench/pipelock/actions/runs/32542624346/attempts/1",
    },
  ]) {
    assert.throws(() => validateRecordOrigin(value, "candidate"), /record origin is invalid/);
  }
});

test("record audit accepts legacy v1 and requires the full v3 provenance set", () => {
  const candidate = "a".repeat(64);
  const base = { tool: "pipelock", candidate_sha256: candidate, files: {} };
  assert.doesNotThrow(() => validateRecordManifestShape({ ...base, schema_version: 1 }, candidate));
  assert.throws(
    () => validateRecordManifestShape({ ...base, schema_version: 2 }, candidate),
    /invalid record manifest/,
  );
  assert.throws(
    () => validateRecordManifestShape({ ...base, schema_version: 3 }, candidate),
    /missing continuous-gauntlet-pipelock\.json/,
  );
  const required = [
    "continuous-gauntlet-pipelock.json",
    "destination-baseline.json",
    "destination-promotion-decision.json",
    "reviewed-baseline.json",
    "reviewed-promotion-decision.json",
    "source-baseline.json",
    "source-promotion-decision.json",
  ];
  const files = Object.fromEntries(required.map((name) => [name, "b".repeat(64)]));
  assert.doesNotThrow(() => validateRecordManifestShape({ ...base, schema_version: 3, files }, candidate));
});

test("promotion command prepares files but cannot publish them", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /"--source-baseline", sourceBaselinePath/);
  // The record must state whose acceptance policy judged it. Without this the
  // retained policy proves only that its own decision recomputes, so a
  // substituted policy with a recomputed decision passes every other check.
  assert.match(source, /"--source-baseline-origin", sourceBaselineOriginPath/);
  assert.match(source, /repository: contract\.source_repository/);
  assert.match(source, /commit: sourceSha/);
  assert.match(source, /path: contract\.source_acceptance_baseline/);
  assert.match(source, /createHash\("sha256"\)\.update\(sourceBaseline, "utf8"\)/);
  // The source baseline is Pipelock policy read at the run commit, so it must
  // never be read back out of the neutral benchmark checkout again.
  assert.doesNotMatch(source, /path\.join\(benchmark, "ci", "gauntlet-baseline\.json"\)/);
  assert.match(source, /contents\/\$\{contract\.source_acceptance_baseline\}\?ref=\$\{sourceSha\}/);
  assert.equal(source.match(/"--artifact-prefix", contract\.artifact_prefix/g)?.length, 2);
  assert.equal(source.match(/"--url-prefix", contract\.url_prefix/g)?.length, 2);
  assert.doesNotMatch(source, /\bgh\s+(pr create|pr merge|api.+--method)\b/);
  assert.doesNotMatch(source, /\bgit\s+(commit|push)\b/);
  // The script never shells out; it drives git/gh through execFile arrays, so
  // the shell-string guards above cannot see a publish introduced in that idiom.
  // Reject the write verbs as quoted arguments too.
  assert.doesNotMatch(source, /"(commit|push)"/);
  assert.doesNotMatch(source, /"pr"\s*,\s*"(create|merge|comment|edit|review)"|"release"\s*,\s*"create"|"--method"/);
});
