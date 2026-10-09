import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const SCRIPT_PATH = new URL("../themes/pipelab/assets/js/gauntlet-continuous.js", import.meta.url);
const RAW_BASE = "https://evidence.example/gauntlet-site";

async function loadApi() {
  const source = await readFile(SCRIPT_PATH, "utf8");
  const context = {
    Array,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    Response,
    String,
    SyntaxError,
    TextDecoder,
    Uint8Array,
    URL,
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: SCRIPT_PATH.pathname });
  return context.GauntletContinuous;
}

async function sha256(text) {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Buffer.from(digest).toString("hex");
}

async function fixture(overrides = {}) {
  const record = {
    schema_version: 6,
    artifact_id: "github-actions:luckyPipewrench/agent-egress-bench:31001310243",
    canonical_url: "https://github.com/luckyPipewrench/agent-egress-bench/actions/runs/31001310243",
    tool: "pipelock",
    tool_version: "3.3.0",
    generated_at: "2026-08-05T11:24:21Z",
    corpus_version: "v2.3.0",
    corpus_git_sha: "fb75dbf6e3812c716340933cfc4dcc8e95061b0e",
    measurement_status: "measured",
    case_count: {
      total: 214,
      applicable: 210,
      unreachable: 0,
      not_applicable: 4,
      not_applicable_reasons: { missing_requires: 4 },
      errors: 0,
    },
    scores: {
      applicable: { containment: 1, false_positive_rate: 0, detection: 1, evidence: 1 },
      full: { containment: 0.9811320754716981, false_positive_rate: 0, detection: 1, evidence: 1 },
    },
    ...overrides.record,
  };
  const recordText = JSON.stringify(record, null, 2) + "\n";
  const candidateDigest = await sha256(recordText);
  const manifest = {
    schema_version: 1,
    artifact_id: record.artifact_id,
    candidate_sha256: candidateDigest,
    canonical_url: record.canonical_url,
    files: {
      "continuous-gauntlet-pipelock.json": candidateDigest,
      ...overrides.manifestFiles,
    },
    generated_at: record.generated_at,
    tool: record.tool,
    tool_version: record.tool_version,
    ...overrides.manifest,
  };
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestDigest = await sha256(manifestText);
  const pointer = {
    schema_version: 1,
    status: "verified",
    artifact_id: record.artifact_id,
    candidate_sha256: candidateDigest,
    canonical_url: record.canonical_url,
    generated_at: record.generated_at,
    record_manifest_path: `./results/pipelock/${candidateDigest}/record-manifest.json`,
    record_manifest_sha256: manifestDigest,
    record_path: `./results/pipelock/${candidateDigest}/continuous-gauntlet-pipelock.json`,
    tool: record.tool,
    tool_version: record.tool_version,
    ...overrides.pointer,
  };
  const pointerText = overrides.pointerText ?? JSON.stringify(pointer, null, 2) + "\n";
  const recordRoot = `${RAW_BASE}/results/pipelock/${candidateDigest}`;
  const responses = new Map([
    [`${RAW_BASE}/latest-verified.json`, pointerText],
    [`${recordRoot}/record-manifest.json`, overrides.manifestText ?? manifestText],
    [`${recordRoot}/continuous-gauntlet-pipelock.json`, overrides.recordText ?? recordText],
  ]);
  if (overrides.responses) {
    Object.entries(overrides.responses).forEach(([url, body]) => {
      responses.set(url, body);
    });
  }
  const fetchImpl = async (url) => responses.has(url)
    ? new Response(responses.get(url), { status: 200 })
    : new Response("missing", { status: 404 });
  return { candidateDigest, fetchImpl, recordRoot, record };
}

async function failureFixture(rows, options = {}) {
  const caseIndex = {
    schema_version: 3,
    cases: options.caseIndexCases ?? Object.fromEntries(rows.map((row) => [
      row.case_id,
      { category: "test", expected_verdict: row.expected_verdict, transport: "fetch_proxy", capability_tags: [] },
    ])),
  };
  const resultsText = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const caseIndexText = JSON.stringify(caseIndex) + "\n";
  const malicious = rows.filter((row) => row.expected_verdict !== "allow").length;
  const contained = rows.filter((row) => row.expected_verdict !== "allow" && row.actual_verdict === row.expected_verdict).length;
  const benign = rows.filter((row) => row.expected_verdict === "allow").length;
  const falsePositives = rows.filter((row) => row.expected_verdict === "allow" && row.actual_verdict !== "allow").length;
  const current = await fixture({
    record: {
      case_count: {
        total: rows.length,
        applicable: rows.length,
        unreachable: 0,
        not_applicable: 0,
        not_applicable_reasons: {},
        errors: 0,
      },
      scores: {
        applicable: {
          containment: malicious ? contained / malicious : 0,
          false_positive_rate: benign ? falsePositives / benign : 0,
        },
        full: {
          containment: malicious ? contained / malicious : 0,
          false_positive_rate: benign ? falsePositives / benign : 0,
        },
      },
      metric_counts: {
        applicable: {
          containment: { numerator: contained, denominator: malicious },
          false_positive_rate: { numerator: falsePositives, denominator: benign },
        },
        full: {
          containment: { numerator: contained, denominator: malicious },
          false_positive_rate: { numerator: falsePositives, denominator: benign },
        },
      },
      ...options.record,
    },
    manifestFiles: {
      "case-index.json": await sha256(caseIndexText),
      "results.jsonl": await sha256(resultsText),
    },
  });
  const fetchImpl = async (url) => {
    if (url.endsWith("/case-index.json")) return new Response(caseIndexText, { status: 200 });
    if (url.endsWith("/results.jsonl")) {
      return options.resultsResponse ? options.resultsResponse() : new Response(resultsText, { status: 200 });
    }
    return current.fetchImpl(url);
  };
  return { ...current, fetchImpl };
}

test("loads a hash-bound verified checkpoint", async () => {
  const api = await loadApi();
  const current = await fixture();
  const loaded = await api.loadLatestVerified(current.fetchImpl, webcrypto, RAW_BASE);

  assert.equal(loaded.record.case_count.total, 214);
  assert.equal(loaded.record.scores.applicable.containment, 1);
  assert.match(loaded.recordUrl, new RegExp(`${current.candidateDigest}/record-manifest\\.json$`));
});

test("maps a verified checkpoint into the published history", async () => {
  const api = await loadApi();
  const current = await fixture({ record: { tool_version: "3.4.0" } });
  const loaded = await api.loadLatestVerified(current.fetchImpl, webcrypto, RAW_BASE);
  const row = api.verifiedListingRow(loaded);

  assert.equal(row.id, current.candidateDigest);
  assert.equal(row.tool_version, "3.4.0");
  assert.equal(row.full_containment, loaded.record.scores.full.containment);
  assert.equal(row.verified_record, true);
});

test("accepts new Pipelock-owned run provenance", async () => {
  const api = await loadApi();
  const runUrl = "https://github.com/luckyPipewrench/pipelock/actions/runs/31723633342";
  const current = await fixture({
    record: {
      artifact_id: "github-actions:luckyPipewrench/pipelock:31723633342",
      canonical_url: runUrl,
    },
    pointer: {
      artifact_id: "github-actions:luckyPipewrench/pipelock:31723633342",
      canonical_url: runUrl,
    },
  });

  const loaded = await api.loadLatestVerified(current.fetchImpl, webcrypto, RAW_BASE);
  assert.equal(loaded.record.canonical_url, runUrl);
  assert.match(loaded.recordUrl, /\/record-manifest\.json$/);
});

test("accepts attempt-qualified Pipelock provenance with a complete v3 manifest", async () => {
  const api = await loadApi();
  const runUrl = "https://github.com/luckyPipewrench/pipelock/actions/runs/32542624346/attempts/1";
  const digest = "a".repeat(64);
  const current = await fixture({
    record: {
      artifact_id: "github-actions:luckyPipewrench/pipelock:32542624346:1",
      canonical_url: runUrl,
    },
    pointer: {
      artifact_id: "github-actions:luckyPipewrench/pipelock:32542624346:1",
      canonical_url: runUrl,
    },
    manifest: { schema_version: 3 },
    manifestFiles: {
      "destination-baseline.json": digest,
      "destination-promotion-decision.json": digest,
      "reviewed-baseline.json": digest,
      "reviewed-promotion-decision.json": digest,
      "source-baseline.json": digest,
      "source-promotion-decision.json": digest,
    },
  });

  const loaded = await api.loadLatestVerified(current.fetchImpl, webcrypto, RAW_BASE);
  assert.equal(loaded.record.canonical_url, runUrl);
});

test("rejects an incomplete v3 manifest and malformed run attempts", async () => {
  const api = await loadApi();
  const incomplete = await fixture({ manifest: { schema_version: 3 } });
  await assert.rejects(
    api.loadLatestVerified(incomplete.fetchImpl, webcrypto, RAW_BASE),
    /manifest v3 provenance is incomplete/,
  );
  for (const canonical_url of [
    "https://github.com/luckyPipewrench/pipelock/actions/runs/1/attempts/0",
    "https://github.com/luckyPipewrench/pipelock/actions/runs/1/attempts/01",
  ]) {
    const invalid = await fixture({ pointer: { canonical_url } });
    await assert.rejects(
      api.loadLatestVerified(invalid.fetchImpl, webcrypto, RAW_BASE),
      /canonical_url is invalid/,
    );
  }
});

test("fails closed when the manifest bytes change", async () => {
  const api = await loadApi();
  const current = await fixture({ manifestText: "{}\n" });

  await assert.rejects(
    api.loadLatestVerified(current.fetchImpl, webcrypto, RAW_BASE),
    /manifest digest does not match/
  );
});

test("fails closed when the record bytes change", async () => {
  const api = await loadApi();
  const current = await fixture({ recordText: "{}\n" });

  await assert.rejects(
    api.loadLatestVerified(current.fetchImpl, webcrypto, RAW_BASE),
    /checkpoint digest does not match/
  );
});

test("rejects malformed and non-HTTPS canonical run links", async () => {
  const api = await loadApi();
  const malformed = await fixture({ pointerText: "not-json" });
  await assert.rejects(
    api.loadLatestVerified(malformed.fetchImpl, webcrypto, RAW_BASE),
    /not valid JSON/
  );

  const unsafe = await fixture({ pointer: { canonical_url: "javascript:alert(1)" } });
  await assert.rejects(
    api.loadLatestVerified(unsafe.fetchImpl, webcrypto, RAW_BASE),
    /canonical_url is invalid/
  );

  const unsafeRecord = await fixture({
    record: { canonical_url: "http://github.com/luckyPipewrench/agent-egress-bench/actions/runs/31001310243" },
    pointer: { canonical_url: "https://github.com/luckyPipewrench/agent-egress-bench/actions/runs/31001310243" },
  });
  await assert.rejects(
    api.loadLatestVerified(unsafeRecord.fetchImpl, webcrypto, RAW_BASE),
    /checkpoint canonical_url is invalid/
  );
});

test("rejects a checkpoint with errors or inconsistent N/A reasons", async () => {
  const api = await loadApi();
  const withErrors = await fixture({
    record: {
      case_count: {
        total: 214,
        applicable: 210,
        unreachable: 0,
        not_applicable: 4,
        not_applicable_reasons: { missing_requires: 4 },
        errors: 1,
      },
    },
  });
  await assert.rejects(
    api.loadLatestVerified(withErrors.fetchImpl, webcrypto, RAW_BASE),
    /contains runner errors/
  );

  const inconsistentReasons = await fixture({
    record: {
      case_count: {
        total: 214,
        applicable: 210,
        unreachable: 0,
        not_applicable: 4,
        not_applicable_reasons: { missing_requires: 3 },
        errors: 0,
      },
    },
  });
  await assert.rejects(
    api.loadLatestVerified(inconsistentReasons.fetchImpl, webcrypto, RAW_BASE),
    /N\/A reasons do not match/
  );

  const emptyApplicable = await fixture({
    record: {
      case_count: {
        total: 214,
        applicable: 0,
        unreachable: 0,
        not_applicable: 214,
        not_applicable_reasons: { missing_requires: 214 },
        errors: 0,
      },
    },
  });
  await assert.rejects(
    api.loadLatestVerified(emptyApplicable.fetchImpl, webcrypto, RAW_BASE),
    /denominator is inconsistent/
  );
});

test("classifies checkpoint transport, environment, and policy failures", async () => {
  const api = await loadApi();
  const current = await fixture();
  await assert.rejects(
    api.loadLatestVerified(current.fetchImpl, null, RAW_BASE),
    (error) => error.checkpointKind === "environment"
  );

  const unpublished = await fixture({ pointer: { status: "candidate" } });
  await assert.rejects(
    api.loadLatestVerified(unpublished.fetchImpl, webcrypto, RAW_BASE),
    (error) => error.checkpointKind === "no_record"
  );

  const incomplete = await fixture({ record: { measurement_status: "incomplete" } });
  await assert.rejects(
    api.loadLatestVerified(incomplete.fetchImpl, webcrypto, RAW_BASE),
    (error) => error.checkpointKind === "publication"
  );

  const htmlFetch = async () => new Response("<html></html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(
    api.loadLatestVerified(htmlFetch, webcrypto, RAW_BASE),
    (error) => error.checkpointKind === "transport"
  );

  const rejectedFetch = async () => { throw new TypeError("Load failed"); };
  await assert.rejects(
    api.loadLatestVerified(rejectedFetch, webcrypto, RAW_BASE),
    (error) => error.checkpointKind === "transport"
  );

  for (const failedPath of [
    "/latest-verified.json",
    "/record-manifest.json",
    "/continuous-gauntlet-pipelock.json",
  ]) {
    const current = await fixture();
    const selectiveFailure = async (url) => {
      if (url.endsWith(failedPath)) throw new TypeError("Load failed");
      return current.fetchImpl(url);
    };
    await assert.rejects(
      api.loadLatestVerified(selectiveFailure, webcrypto, RAW_BASE),
      (error) => error.checkpointKind === "transport"
    );
  }

  const unreadableBody = async () => new Response(new ReadableStream({
    start(controller) {
      controller.error(new TypeError("Load failed"));
    },
  }));
  await assert.rejects(
    api.loadLatestVerified(unreadableBody, webcrypto, RAW_BASE),
    (error) => error.checkpointKind === "transport"
  );

  const inconsistentScope = await fixture({ record: { case_count: {
    total: 214,
    applicable: 209,
    unreachable: 2,
    not_applicable: 4,
    not_applicable_reasons: { missing_requires: 4 },
    errors: 0,
  } } });
  await assert.rejects(
    api.loadLatestVerified(inconsistentScope.fetchImpl, webcrypto, RAW_BASE),
    /case denominator is inconsistent/
  );

  const futureSchema = await fixture({ record: { schema_version: 7 } });
  await assert.rejects(
    api.loadLatestVerified(futureSchema.fetchImpl, webcrypto, RAW_BASE),
    (error) => error.checkpointKind === "unsupported_schema"
  );
  assert.equal(api.classifyVerifiedError({ checkpointKind: "unsupported_schema" }).label, "UNSUPPORTED RECORD");

  const fetchUnavailable = api.classifyVerifiedError({ checkpointKind: "fetch_unavailable" });
  assert.equal(fetchUnavailable.state, "unavailable");
  assert.match(fetchUnavailable.message, /could not retrieve/);
  assert.doesNotMatch(fetchUnavailable.message, /digest verification/);
});

test("rejects well-hashed manifests that do not bind or agree with the record", async () => {
  const api = await loadApi();
  const wrongBinding = await fixture({ manifest: { candidate_sha256: "0".repeat(64) } });
  await assert.rejects(
    api.loadLatestVerified(wrongBinding.fetchImpl, webcrypto, RAW_BASE),
    /does not bind the selected checkpoint/
  );

  const disagreement = await fixture({ manifest: { artifact_id: "github-actions:luckyPipewrench/agent-egress-bench:999" } });
  await assert.rejects(
    api.loadLatestVerified(disagreement.fetchImpl, webcrypto, RAW_BASE),
    /disagrees on artifact_id/
  );
});

test("classifies green, running, failed, and malformed workflow states", async () => {
  const api = await loadApi();
  const url = "https://github.com/luckyPipewrench/agent-egress-bench/actions/runs/31001310243";
  const now = Date.parse("2026-08-05T12:00:00Z");
  const recent = "2026-08-05T11:00:00Z";

  assert.equal(api.classifyRun({ status: "completed", conclusion: "success", html_url: url, updated_at: recent }, now).state, "pass");
  assert.equal(api.classifyRun({ status: "in_progress", conclusion: null, html_url: url }).state, "running");
  assert.equal(api.classifyRun({ status: "pending", conclusion: null, html_url: url }).state, "running");
  assert.equal(
    api.classifyRun({ status: "pending", conclusion: null, html_url: url, updated_at: "2026-08-01T00:00:00Z" }, now).state,
    "stale"
  );
  const actionRequired = api.classifyRun({ status: "completed", conclusion: "failure", html_url: url });
  assert.equal(actionRequired.state, "blocked");
  assert.equal(actionRequired.label, "ACTION REQUIRED");
  assert.equal(api.classifyRun({ status: "completed", conclusion: "cancelled", html_url: url }).state, "neutral");
  assert.equal(api.classifyRun({ status: "failure", conclusion: null, html_url: url }).state, "blocked");
  assert.equal(api.classifyRun({ status: "completed", conclusion: null, html_url: url }).state, "unavailable");
  assert.equal(
    api.classifyRun({ status: "completed", conclusion: "success", html_url: url, updated_at: "2026-08-01T00:00:00Z" }, now).state,
    "stale"
  );
  assert.equal(api.classifyRun({ status: "completed", conclusion: "success", html_url: "javascript:alert(1)" }).state, "unavailable");
  assert.equal(api.classifyRun(null).state, "unavailable");
});

test("groups community submissions by tool and retains newest first", async () => {
  const api = await loadApi();
  const grouped = api.groupLatestByTool([
    { id: "old", tool: "Pipelock", created_at: "2026-07-01T00:00:00Z" },
    { id: "other", tool: "Other Tool", created_at: "2026-08-01T00:00:00Z" },
    { id: "new", tool: "pipelock", created_at: "2026-08-05T00:00:00Z" },
  ]);

  assert.equal(grouped.length, 2);
  const pipelock = grouped.find((group) => group.latest.id === "new");
  assert.equal(pipelock.history.length, 1);
  assert.equal(pipelock.history[0].id, "old");
  assert.match(api.communityHistoryLabel(pipelock.history[0]), /^Pipelock v/);
  assert.match(api.communityHistoryLabel({ tool: "Other", tool_version: "1", created_at: "bad" }), /date unavailable$/);
});

const HISTORICAL_COUNTS = {
  applicable: {
    containment: { numerator: 156, denominator: 156 },
    false_positive_rate: { numerator: 0, denominator: 54 },
  },
  full: {
    containment: { numerator: 156, denominator: 159 },
    false_positive_rate: { numerator: 0, denominator: 55 },
  },
};

test("a fraction is published only when it reconstructs the displayed score", async () => {
  const api = await loadApi();
  const historical = {
    scores: {
      applicable: { containment: 1, false_positive_rate: 0 },
      full: { containment: 0.9811320754716981, false_positive_rate: 0 },
    },
    metric_counts: HISTORICAL_COUNTS,
  };

  assert.equal(
    api.verifiedScoreSummary(historical),
    "98.1% (156/159 malicious cases) full-corpus containment · " +
      "100.0% (156/156 malicious cases) applicable containment (diagnostic) · " +
      "0.0% (0/54 benign cases) false-positive rate (applicable)",
  );

  const mismatched = structuredClone(historical);
  mismatched.metric_counts.full.containment = { numerator: 1, denominator: 2 };
  const mismatchedSummary = api.verifiedScoreSummary(mismatched);
  assert.match(mismatchedSummary, /^98\.1% full-corpus containment/);
  assert.doesNotMatch(mismatchedSummary, /1\/2/);
  assert.match(mismatchedSummary, /100\.0% \(156\/156 malicious cases\) applicable containment/);

  const missing = {
    scores: historical.scores,
  };
  assert.equal(
    api.verifiedScoreSummary(missing),
    "98.1% full-corpus containment · 100.0% applicable containment (diagnostic) · 0.0% false-positive rate (applicable)",
  );

  assert.equal(api.formatScoreWithFraction(null, HISTORICAL_COUNTS.full.containment, "malicious cases"), "—");
  assert.equal(api.formatScoreFraction(0.5, { numerator: 1, denominator: 1 }, "cases"), "");
  assert.equal(api.formatScoreFraction(1, { numerator: 1, denominator: 0 }, "cases"), "");
  assert.equal(api.CASE_EQUAL_WEIGHTING, "Each rate is case-equal. Corpus composition sets the mix.");
});

test("the published Pipelock record reconstructs its live fractions", async () => {
  const api = await loadApi();
  const record = JSON.parse(await readFile(new URL(
    "../static/gauntlet/evidence/results/pipelock/a4a6d7c832b32a0987088cd7034c6eb21160301bee389a5480a01feb75cf916d/continuous-gauntlet-pipelock.json",
    import.meta.url,
  )));

  assert.equal(
    api.verifiedScoreSummary(record),
    "98.9% (174/176 malicious cases) full-corpus containment · " +
      "98.9% (174/176 malicious cases) applicable containment (diagnostic) · " +
      "0.0% (0/66 benign cases) false-positive rate (applicable)",
  );
});

test("hash-binds the published raw summary for per-category scores", async () => {
  const api = await loadApi();
  const evidence = new URL("../static/gauntlet/evidence/", import.meta.url);
  const fetchImpl = async (url) => {
    const relative = url.replace("https://evidence.example/gauntlet-site/", "");
    try {
      const bytes = await readFile(new URL(relative, evidence));
      return new Response(bytes, { status: 200 });
    } catch (_error) {
      return new Response("missing", { status: 404 });
    }
  };
  const loaded = await api.loadLatestVerified(
    fetchImpl,
    webcrypto,
    "https://evidence.example/gauntlet-site",
    { includeFailures: true },
  );
  assert.equal(loaded.record.tool_version, "3.6.0");
  assert.ok(loaded.summary);
  assert.ok(Array.isArray(loaded.failures));
  assert.equal(loaded.failures.length, 5);
  assert.deepEqual(
    Array.from(loaded.failures, (failure) => failure.case_id),
    [
      "fp-quoted-injection-docs-002",
      "mcp-chain-dow-budget-exceeded-010",
      "mcp-chain-dow-interleaved-budget-exceeded-012",
      "mcp-initialize-instructions-exfil-024",
      "response-benign-security-article-002",
    ],
  );
  assert.equal(Object.keys(loaded.summary.per_category).length, 18);
  assert.equal(loaded.summary.scores.full.containment, loaded.record.scores.full.containment);
});

test("tampered result rows cannot supply the failure-first display", async () => {
  const api = await loadApi();
  const evidence = new URL("../static/gauntlet/evidence/", import.meta.url);
  const fetchImpl = async (url) => {
    const relative = url.replace("https://evidence.example/gauntlet-site/", "");
    try {
      const bytes = await readFile(new URL(relative, evidence));
      if (url.endsWith("/results.jsonl")) {
        return new Response(Buffer.concat([bytes, Buffer.from(" ")]));
      }
      return new Response(bytes, { status: 200 });
    } catch (_error) {
      return new Response("missing", { status: 404 });
    }
  };

  const loaded = await api.loadLatestVerified(
    fetchImpl,
    webcrypto,
    "https://evidence.example/gauntlet-site",
    { includeFailures: true },
  );
  assert.equal(loaded.record.tool_version, "3.6.0");
  assert.equal(loaded.failures, null);
  assert.match(loaded.resultsUrl, /\/results\.jsonl$/);
});

test("failure-first rows must agree with the hash-bound case index and scoring semantics", async () => {
  const api = await loadApi();
  const validRows = [
    { case_id: "blocked-001", expected_verdict: "block", actual_verdict: "allow", score: "fail" },
    { case_id: "benign-001", expected_verdict: "allow", actual_verdict: "block", score: "fail" },
  ];
  const valid = await failureFixture(validRows);
  const loaded = await api.loadLatestVerified(valid.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true });
  assert.deepEqual(Array.from(loaded.failures, (row) => row.case_id), ["blocked-001", "benign-001"]);

  const invalidSets = [
    [validRows[0], { ...validRows[1], case_id: "blocked-001" }],
    [validRows[0], { ...validRows[1], case_id: "not-in-index" }],
    [validRows[0], { ...validRows[1], score: "pass" }],
  ];
  for (const rows of invalidSets) {
    const candidate = await failureFixture(rows, {
      caseIndexCases: {
        "blocked-001": { category: "test", expected_verdict: "block", transport: "fetch_proxy", capability_tags: [] },
        "benign-001": { category: "test", expected_verdict: "allow", transport: "fetch_proxy", capability_tags: [] },
      },
    });
    const rejected = await api.loadLatestVerified(candidate.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true });
    assert.equal(rejected.failures, null);
  }

  const mismatchedIndex = await failureFixture(validRows, {
    caseIndexCases: {
      "blocked-001": { category: "test", expected_verdict: "allow", transport: "fetch_proxy", capability_tags: [] },
      "benign-001": { category: "test", expected_verdict: "allow", transport: "fetch_proxy", capability_tags: [] },
    },
  });
  const rejectedIndex = await api.loadLatestVerified(mismatchedIndex.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true });
  assert.equal(rejectedIndex.failures, null);

  const wrongFailureMix = await failureFixture([
    { case_id: "benign-001", expected_verdict: "allow", actual_verdict: "block", score: "fail" },
    { case_id: "benign-002", expected_verdict: "allow", actual_verdict: "block", score: "fail" },
  ], {
    record: {
      scores: {
        applicable: { containment: 0, false_positive_rate: 1 },
        full: { containment: 0, false_positive_rate: 1 },
      },
      metric_counts: {
        applicable: {
          containment: { numerator: 0, denominator: 1 },
          false_positive_rate: { numerator: 1, denominator: 1 },
        },
        full: {
          containment: { numerator: 0, denominator: 1 },
          false_positive_rate: { numerator: 1, denominator: 1 },
        },
      },
    },
  });
  const rejectedMix = await api.loadLatestVerified(wrongFailureMix.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true });
  assert.equal(rejectedMix.failures, null, "equal total failures cannot hide a false-positive/missed-attack mix mismatch");
});

test("failure-first parsing refuses oversized bodies, lines, row sets, and failure sets", async () => {
  const api = await loadApi();
  const baseRows = [
    { case_id: "blocked-001", expected_verdict: "block", actual_verdict: "allow", score: "fail" },
    { case_id: "benign-001", expected_verdict: "allow", actual_verdict: "block", score: "fail" },
  ];

  let buffered = false;
  const declaredOversize = await failureFixture(baseRows, {
    resultsResponse: () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === "content-length" ? String(2 * 1024 * 1024 + 1) : null },
      body: null,
      arrayBuffer: async () => { buffered = true; return new ArrayBuffer(0); },
    }),
  });
  const oversized = await api.loadLatestVerified(declaredOversize.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true });
  assert.equal(oversized.failures, null);
  assert.equal(buffered, false, "a declared oversized body must be rejected before buffering");

  const longLine = await failureFixture([
    { ...baseRows[0], notes: "x".repeat(17 * 1024) },
    baseRows[1],
  ]);
  assert.equal(
    (await api.loadLatestVerified(longLine.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true })).failures,
    null,
  );

  const tooManyRows = await failureFixture(baseRows, {
    record: {
      case_count: {
        total: 10001,
        applicable: 10001,
        unreachable: 0,
        not_applicable: 0,
        not_applicable_reasons: {},
        errors: 0,
      },
    },
  });
  assert.equal(
    (await api.loadLatestVerified(tooManyRows.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true })).failures,
    null,
  );

  const excessiveFailures = Array.from({ length: 2001 }, (_, index) => ({
    case_id: `blocked-${String(index).padStart(4, "0")}`,
    expected_verdict: "block",
    actual_verdict: "allow",
    score: "fail",
  }));
  const tooManyFailures = await failureFixture(excessiveFailures);
  assert.equal(
    (await api.loadLatestVerified(tooManyFailures.fetchImpl, webcrypto, RAW_BASE, { includeFailures: true })).failures,
    null,
  );
});

test("a torn or disagreeing raw summary does not blank the digest-checked headline", async () => {
  const api = await loadApi();
  const current = await fixture();
  const summary = {
    schema_version: current.record.schema_version,
    tool: current.record.tool,
    tool_version: current.record.tool_version,
    case_count: current.record.case_count,
    scores: current.record.scores,
    per_category: { url: { applicable: 20, containment: 1, false_positive_rate: 0 } },
  };
  const summaryText = JSON.stringify(summary, null, 2) + "\n";
  const summaryDigest = await sha256(summaryText);

  async function loadWithSummary(body, digest) {
    const built = await fixture({ manifestFiles: { "raw-summary.json": digest } });
    const fetchImpl = async (url) => {
      if (url.endsWith("/raw-summary.json")) return new Response(body, { status: 200 });
      return built.fetchImpl(url);
    };
    return api.loadLatestVerified(fetchImpl, webcrypto, RAW_BASE);
  }

  const honest = await loadWithSummary(summaryText, summaryDigest);
  assert.deepEqual(honest.summary.per_category.url, summary.per_category.url);

  const tampered = await loadWithSummary(summaryText.replace("pipelock", "other"), summaryDigest);
  assert.equal(tampered.record.scores.full.containment, current.record.scores.full.containment);
  assert.equal(tampered.summary, null);

  const lying = {
    ...summary,
    scores: { ...summary.scores, full: { ...summary.scores.full, containment: 1 } },
  };
  const lyingText = JSON.stringify(lying, null, 2) + "\n";
  const disagreed = await loadWithSummary(lyingText, await sha256(lyingText));
  assert.equal(disagreed.summary, null);
  assert.equal(disagreed.record.scores.full.containment, 0.9811320754716981);

  const malformed = {
    ...summary,
    per_category: { mcp_chain: null },
  };
  const malformedText = JSON.stringify(malformed, null, 2) + "\n";
  const malformedLoaded = await loadWithSummary(malformedText, await sha256(malformedText));
  assert.equal(malformedLoaded.summary, null);
  assert.equal(malformedLoaded.record.scores.full.containment, 0.9811320754716981);

  const mixed = {
    ...summary,
    per_category: {
      url: { applicable: 20, containment: 1, false_positive_rate: 0 },
      mcp_chain: {
        applicable: 17,
        containment: 0.8461538461538461,
        false_positive_rate: 0,
        diagnostics: { classification_present_rate: 1, structured_evidence_present_rate: 1 },
      },
    },
  };
  const mixedText = JSON.stringify(mixed, null, 2) + "\n";
  const mixedLoaded = await loadWithSummary(mixedText, await sha256(mixedText));
  assert.equal(mixedLoaded.summary, null);
  assert.equal(mixedLoaded.record.scores.full.containment, 0.9811320754716981);
});

test("verified listing rows carry a reconstructing full-corpus fraction and omit a mismatched one", async () => {
  const api = await loadApi();
  const withCounts = await fixture({
    record: { metric_counts: HISTORICAL_COUNTS },
  });
  const loaded = await api.loadLatestVerified(withCounts.fetchImpl, webcrypto, RAW_BASE);
  const row = api.verifiedListingRow(loaded);
  assert.equal(row.full_containment_numerator, 156);
  assert.equal(row.full_containment_denominator, 159);

  const mismatched = await fixture({
    record: {
      metric_counts: {
        ...HISTORICAL_COUNTS,
        full: {
          ...HISTORICAL_COUNTS.full,
          containment: { numerator: 1, denominator: 2 },
        },
      },
    },
  });
  const mismatchedRow = api.verifiedListingRow(
    await api.loadLatestVerified(mismatched.fetchImpl, webcrypto, RAW_BASE),
  );
  assert.equal(mismatchedRow.full_containment_numerator, undefined);
  assert.equal(mismatchedRow.full_containment_denominator, undefined);
});
