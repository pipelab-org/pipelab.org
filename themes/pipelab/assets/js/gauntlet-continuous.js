(function(root) {
  "use strict";

  var SHA256_RE = /^[0-9a-f]{64}$/;
  var RAW_BASE = "/gauntlet/evidence";
  var RUNS_URL = "https://api.github.com/repos/pipelab-org/pipelock/actions/workflows/continuous-gauntlet.yaml/runs?branch=main&per_page=1";
  var RECORD_BASE = "/gauntlet/evidence/results/pipelock/";
  var MAX_RUN_AGE_MS = 48 * 60 * 60 * 1000;
  var MAX_RESULTS_BYTES = 2 * 1024 * 1024;
  var MAX_CASE_INDEX_BYTES = 512 * 1024;
  var MAX_RESULT_ROWS = 10000;
  var MAX_FAILURE_ROWS = 2000;
  var MAX_RESULT_LINE_CHARS = 16 * 1024;
  var RECORD_V3_REQUIRED_FILES = [
    "continuous-gauntlet-pipelock.json",
    "destination-baseline.json",
    "destination-promotion-decision.json",
    "reviewed-baseline.json",
    "reviewed-promotion-decision.json",
    "source-baseline.json",
    "source-promotion-decision.json",
  ];
  // Version 4 keeps every v3 file and adds the locator naming where the acceptance
  // policy came from. The accepted set is declared once here so the version check
  // and the provenance check cannot drift apart.
  var RECORD_V4_REQUIRED_FILES = RECORD_V3_REQUIRED_FILES.concat([
    "source-baseline-origin.json",
  ]);
  var RECORD_REQUIRED_FILES_BY_VERSION = {
    3: RECORD_V3_REQUIRED_FILES,
    4: RECORD_V4_REQUIRED_FILES,
  };
  var ACCEPTED_RECORD_SCHEMA_VERSIONS = [1, 3, 4];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function checkpointError(kind, message) {
    var error = new Error(message);
    error.checkpointKind = kind;
    return error;
  }

  function nonEmptyString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(label + " must be a non-empty string");
    }
    return value;
  }

  function runUrlParts(value) {
    if (typeof value !== "string") return null;
    var parts = /^https:\/\/github\.com\/([^/]+)\/(agent-egress-bench|pipelock)\/actions\/runs\/([1-9][0-9]*)(?:\/attempts\/([1-9][0-9]*))?$/.exec(value);
    return parts && ["luckypipewrench", "pipelab-org"].includes(parts[1].toLowerCase()) ? parts : null;
  }

  function validRunUrl(value) {
    return Boolean(runUrlParts(value));
  }

  function validRecordOrigin(record) {
    var artifact = /^github-actions:([^/:]+)\/(agent-egress-bench|pipelock):([1-9][0-9]*)(?::([1-9][0-9]*))?$/.exec(record.artifact_id || "");
    var runUrl = runUrlParts(record.canonical_url);
    return Boolean(artifact && runUrl &&
      artifact[1].toLowerCase() === runUrl[1].toLowerCase() &&
      artifact[2] === runUrl[2] && artifact[3] === runUrl[3] &&
      (runUrl[4] === undefined || artifact[4] === runUrl[4]));
  }

  function validatePointer(pointer) {
    if (!isObject(pointer) || pointer.schema_version !== 1) {
      throw new Error("latest verified pointer is invalid");
    }
    if (pointer.status !== "verified") {
      throw checkpointError("no_record", "no verified checkpoint is currently published");
    }
    var candidateDigest = nonEmptyString(pointer.candidate_sha256, "candidate_sha256");
    var manifestDigest = nonEmptyString(pointer.record_manifest_sha256, "record_manifest_sha256");
    if (!SHA256_RE.test(candidateDigest) || !SHA256_RE.test(manifestDigest)) {
      throw new Error("latest verified pointer contains an invalid SHA-256 digest");
    }
    var recordPath = "./results/pipelock/" + candidateDigest + "/continuous-gauntlet-pipelock.json";
    var manifestPath = "./results/pipelock/" + candidateDigest + "/record-manifest.json";
    if (pointer.record_path !== recordPath || pointer.record_manifest_path !== manifestPath) {
      throw new Error("latest verified pointer paths are not canonical");
    }
    ["artifact_id", "canonical_url", "tool", "tool_version", "generated_at"].forEach(function(field) {
      nonEmptyString(pointer[field], field);
    });
    if (!validRunUrl(pointer.canonical_url)) {
      throw new Error("latest verified pointer canonical_url is invalid");
    }
    return pointer;
  }

  function decodeUtf8(bytes, label) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (_error) {
      throw new Error(label + " is not valid UTF-8");
    }
  }

  async function responseBytes(response, label, maxBytes) {
    if (!response || !response.ok) {
      throw checkpointError("transport", label + " returned HTTP " + (response ? response.status : "unknown"));
    }
    var contentType = response.headers && response.headers.get("content-type");
    if (contentType && contentType.toLowerCase().includes("text/html")) {
      throw checkpointError("transport", label + " returned HTML instead of record bytes");
    }
    var declaredLength = response.headers && Number(response.headers.get("content-length"));
    if (maxBytes && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(label + " exceeds the size limit");
    }
    try {
      if (maxBytes && response.body && typeof response.body.getReader === "function") {
        var reader = response.body.getReader();
        var chunks = [];
        var totalBytes = 0;
        while (true) {
          var part = await reader.read();
          if (part.done) break;
          totalBytes += part.value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new Error(label + " exceeds the size limit");
          }
          chunks.push(part.value);
        }
        var joined = new Uint8Array(totalBytes);
        var offset = 0;
        chunks.forEach(function(chunk) {
          joined.set(chunk, offset);
          offset += chunk.byteLength;
        });
        return joined;
      }
      var bytes = new Uint8Array(await response.arrayBuffer());
      if (maxBytes && bytes.byteLength > maxBytes) {
        throw new Error(label + " exceeds the size limit");
      }
      return bytes;
    } catch (error) {
      if (error && /exceeds the size limit/.test(error.message || "")) throw error;
      throw checkpointError("transport", label + " response body could not be read");
    }
  }

  async function checkpointFetch(fetchImpl, url, label) {
    try {
      return await fetchImpl(url);
    } catch (_error) {
      throw checkpointError("transport", label + " request failed");
    }
  }

  async function sha256Hex(bytes, cryptoImpl) {
    if (!cryptoImpl || !cryptoImpl.subtle) {
      throw checkpointError("environment", "Web Crypto is unavailable");
    }
    var digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function(value) {
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  function parseJson(bytes, label) {
    try {
      return JSON.parse(decodeUtf8(bytes, label));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(label + " is not valid JSON");
      }
      throw error;
    }
  }

  function parseCaseIndex(bytes) {
    var index = parseJson(bytes, "verified case index");
    if (!isObject(index) || !Number.isInteger(index.schema_version) || !isObject(index.cases)) {
      throw new Error("verified case index is invalid");
    }
    return index.cases;
  }

  function parseFailureRows(bytes, record, caseIndex) {
    var text = decodeUtf8(bytes, "verified result rows");
    var lines = text.split(/\r?\n/).filter(function(line) { return line.trim(); });
    if (lines.length > MAX_RESULT_ROWS || record.case_count.total > MAX_RESULT_ROWS) {
      throw new Error("verified result rows exceed the row limit");
    }
    if (lines.length !== record.case_count.total) {
      throw new Error("verified result row count disagrees with the record");
    }
    var failures = [];
    var seen = new Set();
    var missedAttacks = 0;
    var falsePositives = 0;
    lines.forEach(function(line) {
      if (line.length > MAX_RESULT_LINE_CHARS) {
        throw new Error("verified result row exceeds the line limit");
      }
      var row;
      try {
        row = JSON.parse(line);
      } catch (_error) {
        throw new Error("verified result rows are not valid JSONL");
      }
      if (!isObject(row) || typeof row.case_id !== "string" || !row.case_id ||
          !["allow", "block", "warn"].includes(row.expected_verdict) ||
          !["allow", "block", "warn", "error", "not_applicable"].includes(row.actual_verdict) ||
          !["pass", "fail", "error", "not_applicable"].includes(row.score)) {
        throw new Error("verified result row is invalid");
      }
      if (seen.has(row.case_id)) {
        throw new Error("verified result rows contain a duplicate case ID");
      }
      seen.add(row.case_id);
      if (!Object.prototype.hasOwnProperty.call(caseIndex, row.case_id) ||
          !isObject(caseIndex[row.case_id]) ||
          caseIndex[row.case_id].expected_verdict !== row.expected_verdict) {
        throw new Error("verified result row disagrees with the case index");
      }
      var expectedScore = row.actual_verdict === "error"
        ? "error"
        : row.actual_verdict === "not_applicable"
          ? "not_applicable"
          : row.actual_verdict === row.expected_verdict ? "pass" : "fail";
      if (row.score !== expectedScore) {
        throw new Error("verified result row score disagrees with its verdicts");
      }
      if (row.score === "fail") {
        if (failures.length >= MAX_FAILURE_ROWS) {
          throw new Error("verified failure rows exceed the display limit");
        }
        if (row.expected_verdict === "allow") falsePositives += 1;
        else missedAttacks += 1;
        failures.push({
          case_id: row.case_id,
          expected_verdict: row.expected_verdict,
          actual_verdict: row.actual_verdict,
        });
      }
    });
    var containmentCounts = metricCounts(record, "full", "containment");
    var falsePositiveCounts = metricCounts(record, "full", "false_positive_rate");
    if (containmentCounts && falsePositiveCounts) {
      if (missedAttacks !== containmentCounts.denominator - containmentCounts.numerator ||
          falsePositives !== falsePositiveCounts.numerator) {
        throw new Error("verified failure rows disagree with the published scores");
      }
    }
    return failures;
  }

  function fraction(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(label + " must be between zero and one");
    }
    return value;
  }

  function count(value, label) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(label + " must be a non-negative integer");
    }
    return value;
  }

  function validateRecord(record) {
    if (!isObject(record) || ![2, 6].includes(record.schema_version)) {
      throw checkpointError("unsupported_schema", "published record schema is not supported by this verifier");
    }
    if (record.schema_version === 2 && record.sufficient !== true) {
      throw checkpointError("publication", "published verified pointer selected an ineligible candidate");
    }
    if (record.schema_version === 6 && record.measurement_status !== "measured") {
      throw checkpointError("publication", "published record is not a complete measurement");
    }
    ["tool", "tool_version", "generated_at", "corpus_version", "corpus_git_sha", "canonical_url"].forEach(function(field) {
      nonEmptyString(record[field], field);
    });
    if (!validRunUrl(record.canonical_url)) {
      throw new Error("verified checkpoint canonical_url is invalid");
    }
    var caseCount = record.case_count;
    if (!isObject(caseCount)) throw new Error("verified checkpoint case_count is invalid");
    var total = count(caseCount.total, "case_count.total");
    var applicable = count(caseCount.applicable, "case_count.applicable");
    var unreachable = record.schema_version === 6
      ? count(caseCount.unreachable, "case_count.unreachable")
      : 0;
    var notApplicable = count(caseCount.not_applicable, "case_count.not_applicable");
    var errors = count(caseCount.errors, "case_count.errors");
    if (total === 0 || applicable === 0 || applicable + unreachable + notApplicable !== total) {
      throw new Error("verified checkpoint case denominator is inconsistent");
    }
    if (errors !== 0) {
      throw new Error("verified checkpoint contains runner errors");
    }
    if (!isObject(caseCount.not_applicable_reasons)) {
      throw new Error("verified checkpoint N/A reasons are invalid");
    }
    var reasonTotal = Object.values(caseCount.not_applicable_reasons).reduce(function(totalCount, reasonCount) {
      return totalCount + count(reasonCount, "case_count.not_applicable_reasons value");
    }, 0);
    if (reasonTotal !== notApplicable) {
      throw new Error("verified checkpoint N/A reasons do not match the N/A count");
    }
    if (!isObject(record.scores) || !isObject(record.scores.applicable) || !isObject(record.scores.full)) {
      throw new Error("verified checkpoint scores are invalid");
    }
    fraction(record.scores.applicable.containment, "applicable containment");
    fraction(record.scores.applicable.false_positive_rate, "applicable false-positive rate");
    fraction(record.scores.full.containment, "full containment");
    return record;
  }

  async function loadLatestVerified(fetchImpl, cryptoImpl, rawBase, options) {
    var base = (rawBase || RAW_BASE).replace(/\/$/, "");
    var pointerBytes = await responseBytes(
      await checkpointFetch(fetchImpl, base + "/latest-verified.json", "latest verified pointer"),
      "latest verified pointer"
    );
    var pointer = validatePointer(parseJson(pointerBytes, "latest verified pointer"));
    var digest = pointer.candidate_sha256;
    var recordRoot = base + "/results/pipelock/" + digest;
    var manifestBytes = await responseBytes(
      await checkpointFetch(fetchImpl, recordRoot + "/record-manifest.json", "verified record manifest"),
      "verified record manifest"
    );
    if (await sha256Hex(manifestBytes, cryptoImpl) !== pointer.record_manifest_sha256) {
      throw new Error("verified record manifest digest does not match the pointer");
    }
    var manifest = parseJson(manifestBytes, "verified record manifest");
    if (!isObject(manifest) || ACCEPTED_RECORD_SCHEMA_VERSIONS.indexOf(manifest.schema_version) === -1 ||
        manifest.candidate_sha256 !== digest || !isObject(manifest.files) ||
        manifest.files["continuous-gauntlet-pipelock.json"] !== digest) {
      throw new Error("verified record manifest does not bind the selected checkpoint");
    }
    var requiredFiles = RECORD_REQUIRED_FILES_BY_VERSION[manifest.schema_version];
    if (requiredFiles && requiredFiles.some(function(name) {
      return typeof manifest.files[name] !== "string" || !SHA256_RE.test(manifest.files[name]);
    })) {
      throw new Error(
        "verified record manifest v" + manifest.schema_version + " provenance is incomplete"
      );
    }
    var recordBytes = await responseBytes(
      await checkpointFetch(fetchImpl, recordRoot + "/continuous-gauntlet-pipelock.json", "verified checkpoint"),
      "verified checkpoint"
    );
    if (await sha256Hex(recordBytes, cryptoImpl) !== digest) {
      throw new Error("verified checkpoint digest does not match the pointer");
    }
    var record = validateRecord(parseJson(recordBytes, "verified checkpoint"));
    ["artifact_id", "canonical_url", "tool", "tool_version", "generated_at"].forEach(function(field) {
      if (record[field] !== pointer[field] || record[field] !== manifest[field]) {
        throw new Error("verified checkpoint disagrees on " + field);
      }
    });
    if (!validRecordOrigin(record)) {
      throw new Error("verified checkpoint record origin is invalid");
    }
    // The provenance candidate omits per_category. The manifest already binds
    // raw-summary.json, so the browser can hash-check that file and use it for
    // the category table without a schema bump. A missing, torn, or disagreeing
    // companion drops the table and keeps the digest-checked headline.
    var summary = null;
    var summaryDigest = manifest.files["raw-summary.json"];
    if (typeof summaryDigest === "string" && SHA256_RE.test(summaryDigest)) {
      try {
        var summaryBytes = await responseBytes(
          await checkpointFetch(fetchImpl, recordRoot + "/raw-summary.json", "verified raw summary"),
          "verified raw summary"
        );
        if (await sha256Hex(summaryBytes, cryptoImpl) !== summaryDigest) {
          throw new Error("verified raw summary digest does not match the manifest");
        }
        var loadedSummary = parseJson(summaryBytes, "verified raw summary");
        if (summaryAgreesWithRecord(record, loadedSummary)) summary = loadedSummary;
      } catch (_error) {
        summary = null;
      }
    }
    var failures = null;
    var resultsDigest = manifest.files["results.jsonl"];
    var caseIndexDigest = manifest.files["case-index.json"];
    if (options && options.includeFailures &&
        typeof resultsDigest === "string" && SHA256_RE.test(resultsDigest) &&
        typeof caseIndexDigest === "string" && SHA256_RE.test(caseIndexDigest)) {
      try {
        var caseIndexBytes = await responseBytes(
          await checkpointFetch(fetchImpl, recordRoot + "/case-index.json", "verified case index"),
          "verified case index",
          MAX_CASE_INDEX_BYTES
        );
        if (await sha256Hex(caseIndexBytes, cryptoImpl) !== caseIndexDigest) {
          throw new Error("verified case index digest does not match the manifest");
        }
        var caseIndex = parseCaseIndex(caseIndexBytes);
        var resultsBytes = await responseBytes(
          await checkpointFetch(fetchImpl, recordRoot + "/results.jsonl", "verified result rows"),
          "verified result rows",
          MAX_RESULTS_BYTES
        );
        if (await sha256Hex(resultsBytes, cryptoImpl) !== resultsDigest) {
          throw new Error("verified result rows digest does not match the manifest");
        }
        failures = parseFailureRows(resultsBytes, record, caseIndex);
      } catch (_error) {
        failures = null;
      }
    }
    return {
      pointer: pointer,
      record: record,
      summary: summary,
      failures: failures,
      resultsUrl: RECORD_BASE + digest + "/results.jsonl",
      recordUrl: RECORD_BASE + digest + "/record-manifest.json",
    };
  }

  function optionalRate(value) {
    return value === null || value === undefined ||
      (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
  }

  function validCategoryRow(row) {
    if (!isObject(row)) return false;
    if (!Number.isInteger(row.applicable) || row.applicable < 0) return false;
    if (!optionalRate(row.containment) || !optionalRate(row.false_positive_rate)) return false;
    if (row.diagnostics !== undefined) {
      if (!isObject(row.diagnostics)) return false;
      if (!optionalRate(row.diagnostics.classification_present_rate) ||
          !optionalRate(row.diagnostics.structured_evidence_present_rate)) {
        return false;
      }
    }
    return true;
  }

  function summaryAgreesWithRecord(record, summary) {
    if (!isObject(summary) || !isObject(record)) return false;
    // raw-summary.json is the runner summary (currently v5). The published
    // checkpoint is the v6 provenance wrapper. Identity and scores must agree;
    // the envelope version may differ, but unknown future summary schemas
    // are not interpreted.
    if (summary.schema_version !== 5 && summary.schema_version !== 6) return false;
    if (summary.tool !== record.tool || summary.tool_version !== record.tool_version) return false;
    if (!isObject(summary.scores) || !isObject(summary.scores.full) || !isObject(summary.scores.applicable)) {
      return false;
    }
    if (!isObject(summary.case_count) || !isObject(summary.per_category)) return false;
    if (summary.case_count.total !== record.case_count.total) return false;
    if (summary.case_count.applicable !== record.case_count.applicable) return false;
    var countFields = ["errors", "not_applicable", "unreachable"];
    for (var c = 0; c < countFields.length; c++) {
      var field = countFields[c];
      if (Object.prototype.hasOwnProperty.call(summary.case_count, field) &&
          Object.prototype.hasOwnProperty.call(record.case_count, field) &&
          summary.case_count[field] !== record.case_count[field]) {
        return false;
      }
    }
    if (summary.scores.full.containment !== record.scores.full.containment) return false;
    if (summary.scores.full.false_positive_rate !== record.scores.full.false_positive_rate) return false;
    if (summary.scores.applicable.containment !== record.scores.applicable.containment) return false;
    if (summary.scores.applicable.false_positive_rate !== record.scores.applicable.false_positive_rate) {
      return false;
    }
    var categories = summary.per_category;
    var names = Object.keys(categories);
    if (names.length === 0) return false;
    var sawDiagnostics = false;
    var sawLegacy = false;
    for (var i = 0; i < names.length; i++) {
      var row = categories[names[i]];
      if (!names[i] || !validCategoryRow(row)) return false;
      if (isObject(row.diagnostics)) sawDiagnostics = true;
      else sawLegacy = true;
    }
    if (sawDiagnostics && sawLegacy) return false;
    return true;
  }

  function classifyRun(run, nowMs) {
    if (!isObject(run) || !validRunUrl(run.html_url)) {
      return { state: "unavailable", label: "UNAVAILABLE", message: "Latest check could not be verified." };
    }
    var currentTime = typeof nowMs === "number" ? nowMs : Date.now();
    var observedAt = Date.parse(run.updated_at || run.created_at);
    var isStale = Number.isFinite(observedAt) && currentTime - observedAt > MAX_RUN_AGE_MS;
    if (["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status)) {
      if (isStale) {
        return { state: "stale", label: "STALE", message: "The latest workflow has not advanced in 48 hours. Inspect the workflow schedule." };
      }
      return { state: "running", label: "RUNNING", message: "The latest self-operated check is still running." };
    }
    if (run.status === "completed" && run.conclusion === "success") {
      if (!Number.isFinite(observedAt)) {
        return { state: "unavailable", label: "UNAVAILABLE", message: "Latest check time could not be verified." };
      }
      if (isStale) {
        return { state: "stale", label: "STALE", message: "No successful check has completed in the last 48 hours. Inspect the workflow schedule." };
      }
      return { state: "pass", label: "PASS", message: "No action required. The latest check passed the reviewed policy." };
    }
    var outcome = run.conclusion || run.status;
    if (["failure", "timed_out", "startup_failure", "action_required"].includes(outcome)) {
      var failureMessage = "Open the run summary to see whether review is required or the check was blocked. The verified checkpoint did not move.";
      if (isStale) failureMessage = "The latest action-required run is more than 48 hours old. " + failureMessage;
      return { state: "blocked", label: "ACTION REQUIRED", message: failureMessage };
    }
    if (["cancelled", "skipped", "stale", "neutral"].includes(outcome)) {
      if (isStale) {
        return { state: "stale", label: "STALE", message: "No benchmark verdict has completed in the last 48 hours. Inspect the workflow schedule." };
      }
      return { state: "neutral", label: "NO VERDICT", message: "The latest workflow ended without a benchmark verdict. The verified checkpoint did not move." };
    }
    return { state: "unavailable", label: "UNAVAILABLE", message: "Latest check returned an unrecognized state. The verified checkpoint did not move." };
  }

  async function loadLatestRun(fetchImpl, runsUrl) {
    var response = await fetchImpl(runsUrl || RUNS_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error("latest workflow check returned HTTP " + response.status);
    var payload = await response.json();
    if (!payload || !Array.isArray(payload.workflow_runs) || payload.workflow_runs.length === 0) {
      throw new Error("latest workflow check is missing");
    }
    return payload.workflow_runs[0];
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  // A fraction is published only when it reconstructs the score beside it.
  // A plausible denominator next to a different rate is a false claim, so
  // missing, malformed, zero, and mismatched counts keep the percent useful
  // but bare. 1e-12 matches the buyer-report reconstruct check.
  var SCORE_FRACTION_EPSILON = 1e-12;
  var CASE_EQUAL_WEIGHTING = "Each rate is case-equal. Corpus composition sets the mix.";

  function metricCounts(record, scope, metric) {
    if (!isObject(record) || !isObject(record.metric_counts)) return null;
    var scoped = record.metric_counts[scope];
    if (!isObject(scoped)) return null;
    var counts = scoped[metric];
    if (!isObject(counts)) return null;
    var numerator = counts.numerator;
    var denominator = counts.denominator;
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) return null;
    if (numerator < 0 || denominator <= 0 || numerator > denominator) return null;
    return { numerator: numerator, denominator: denominator };
  }

  function scoreFractionReconstructs(score, counts) {
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
      return false;
    }
    if (!counts) return false;
    return Math.abs(score - (counts.numerator / counts.denominator)) <= SCORE_FRACTION_EPSILON;
  }

  function formatScoreFraction(score, counts, caseKind) {
    if (!scoreFractionReconstructs(score, counts)) return "";
    var kind = typeof caseKind === "string" && caseKind.trim() ? caseKind.trim() : "cases";
    return counts.numerator + "/" + counts.denominator + " " + kind;
  }

  function formatScoreWithFraction(score, counts, caseKind) {
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
      return "—";
    }
    var percent = formatPercent(score);
    var fraction = formatScoreFraction(score, counts, caseKind);
    return fraction ? percent + " (" + fraction + ")" : percent;
  }

  function verifiedScoreSummary(record) {
    return formatScoreWithFraction(
      record.scores.full.containment,
      metricCounts(record, "full", "containment"),
      "malicious cases"
    ) + " full-corpus containment · " +
      formatScoreWithFraction(
        record.scores.applicable.containment,
        metricCounts(record, "applicable", "containment"),
        "malicious cases"
      ) + " applicable containment (diagnostic) · " +
      formatScoreWithFraction(
        record.scores.applicable.false_positive_rate,
        metricCounts(record, "applicable", "false_positive_rate"),
        "benign cases"
      ) + " false-positive rate (applicable)";
  }

  function formatDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown time" : date.toLocaleString();
  }

  function appendText(element, tag, text, className) {
    var child = document.createElement(tag);
    if (className) child.className = className;
    child.textContent = text;
    element.appendChild(child);
    return child;
  }

  function updateCard(element, label, state, message) {
    var stateElement = element.querySelector(".gc-state");
    var messageElement = element.querySelector(".gc-message");
    var oldMeta = element.querySelector(".gc-meta");
    stateElement.className = "gc-state gc-state-" + state;
    stateElement.textContent = label;
    messageElement.textContent = message;
    if (oldMeta) oldMeta.remove();
  }

  function appendLink(element, text, href) {
    var link = document.createElement("a");
    link.textContent = text;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    element.appendChild(link);
    return link;
  }

  function renderLatestRun(element, run) {
    var result = classifyRun(run);
    updateCard(element, result.label, result.state, result.message);
    var meta = appendText(element, "p", "", "gc-meta");
    meta.appendChild(document.createTextNode(formatDate(run && (run.updated_at || run.created_at))));
    if (result.state !== "unavailable") {
      meta.appendChild(document.createTextNode(" · "));
      var eventLabel = run.event === "schedule" ? "scheduled run" : run.event === "workflow_dispatch" ? "manual confirmation" : "workflow run";
      appendLink(meta, eventLabel, run.html_url);
    }
  }

  function renderLatestRunError(element) {
    updateCard(element, "UNAVAILABLE", "unavailable", "GitHub status is temporarily unavailable. The published record remains unchanged.");
    appendLink(appendText(element, "p", "", "gc-meta"), "Open workflow history", "https://github.com/pipelab-org/pipelock/actions/workflows/continuous-gauntlet.yaml");
  }

  function renderVerified(element, loaded) {
    var record = loaded.record;
    var caseCount = record.case_count;
    updateCard(
      element,
      "DIGESTS MATCH",
      "neutral",
      // Full corpus first: it is the published procurement view, and declaring
      // fewer capabilities cannot improve it. The applicable figure follows,
      // named as diagnostic. The false-positive rate keeps its applicable basis
      // and now says so, because a benign control that is skipped rather than
      // executed does not belong in a rate presented as measured.
      verifiedScoreSummary(record)
    );
    var meta = appendText(element, "p", "", "gc-meta");
    meta.appendChild(document.createTextNode(
      "First-party Pipelock run · Pipelock " + record.tool_version + " · " + caseCount.total + " cases at " +
      record.corpus_git_sha.slice(0, 12) + " · " + CASE_EQUAL_WEIGHTING + " · " +
      formatDate(record.generated_at) + " · "
    ));
    appendLink(meta, "publisher-digested record", loaded.recordUrl);
    meta.appendChild(document.createTextNode(" · "));
    appendLink(meta, "source run", record.canonical_url);
  }

  function classifyVerifiedError(error) {
    var kind = error && error.checkpointKind;
    var transportFailure = kind === "transport";
    var environmentFailure = kind === "environment";
    var fetchUnavailable = kind === "fetch_unavailable";
    var noRecord = kind === "no_record";
    var publicationFailure = kind === "publication";
    var unsupportedSchema = kind === "unsupported_schema";
    var label = transportFailure || environmentFailure || fetchUnavailable ? "UNAVAILABLE" : noRecord ? "NO VERIFIED RECORD" : unsupportedSchema ? "UNSUPPORTED RECORD" : publicationFailure ? "INVALID PUBLICATION" : "NOT VERIFIED";
    var state = transportFailure || environmentFailure || fetchUnavailable || noRecord ? "unavailable" : "blocked";
    var message = transportFailure
      ? "The published checkpoint is temporarily unavailable. No score is displayed."
      : environmentFailure
        ? "This browser could not perform the required digest verification. No score is displayed."
        : fetchUnavailable
          ? "This browser could not retrieve the published checkpoint. No score is displayed."
        : noRecord
          ? "No verified checkpoint is currently published. No score is displayed."
          : unsupportedSchema
            ? "The published record is newer than this browser verifier. No score is displayed."
          : publicationFailure
            ? "The published pointer selected a record that violates the verified-checkpoint policy. No score is displayed."
          : "The published checkpoint did not satisfy its digest and structure checks, so no score is displayed.";
    return { label: label, state: state, message: message };
  }

  function renderVerifiedError(element, error) {
    var result = classifyVerifiedError(error);
    updateCard(element, result.label, result.state, result.message);
    appendLink(appendText(element, "p", "", "gc-meta"), "Inspect the public record", "/gauntlet/evidence/latest-verified.json");
  }

  function groupLatestByTool(rows) {
    var groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function(row) {
      if (!row || typeof row.tool !== "string" || !row.tool.trim()) return;
      var key = row.tool.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.values()).map(function(group) {
      group.sort(function(left, right) {
        var rightTime = Date.parse(right.created_at);
        var leftTime = Date.parse(left.created_at);
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      });
      return { latest: group[0], history: group.slice(1) };
    });
  }

  function communityHistoryLabel(row) {
    var date = new Date(row && row.created_at);
    var tool = row && typeof row.tool === "string" && row.tool ? row.tool : "Unknown tool";
    var version = row && row.tool_version ? row.tool_version : "?";
    return tool + " v" + version + " · " +
      (Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString());
  }

  function verifiedListingRow(loaded) {
    var record = loaded.record;
    var row = {
      id: loaded.pointer.candidate_sha256,
      tool: record.tool,
      tool_version: record.tool_version,
      created_at: record.generated_at,
      full_containment: record.scores.full.containment,
      applicable: record.case_count.applicable,
      total: record.case_count.total,
      verified_record: true,
    };
    var counts = metricCounts(record, "full", "containment");
    if (scoreFractionReconstructs(record.scores.full.containment, counts)) {
      row.full_containment_numerator = counts.numerator;
      row.full_containment_denominator = counts.denominator;
    }
    return row;
  }

  function init() {
    if (root.location && root.location.pathname.replace(/\/$/, "") !== "/gauntlet/results") return;
    var runElement = document.getElementById("gauntlet-latest-run");
    var verifiedElement = document.getElementById("gauntlet-latest-verified");
    if (!runElement || !verifiedElement) return;
    if (typeof root.fetch !== "function") {
      renderLatestRunError(runElement);
      renderVerifiedError(verifiedElement, checkpointError("fetch_unavailable", "Fetch is unavailable"));
      return;
    }
    var fetchImpl = root.fetch.bind(root);
    loadLatestRun(fetchImpl).then(function(run) {
      renderLatestRun(runElement, run);
    }).catch(function() {
      renderLatestRunError(runElement);
    });
    loadLatestVerified(fetchImpl, root.crypto).then(function(loaded) {
      renderVerified(verifiedElement, loaded);
    }).catch(function(error) {
      renderVerifiedError(verifiedElement, error);
    });
  }

  root.GauntletContinuous = {
    CASE_EQUAL_WEIGHTING: CASE_EQUAL_WEIGHTING,
    classifyRun: classifyRun,
    classifyVerifiedError: classifyVerifiedError,
    communityHistoryLabel: communityHistoryLabel,
    formatScoreFraction: formatScoreFraction,
    formatScoreWithFraction: formatScoreWithFraction,
    groupLatestByTool: groupLatestByTool,
    loadLatestRun: loadLatestRun,
    loadLatestVerified: loadLatestVerified,
    metricCounts: metricCounts,
    scoreFractionReconstructs: scoreFractionReconstructs,
    summaryAgreesWithRecord: summaryAgreesWithRecord,
    validatePointer: validatePointer,
    validateRecord: validateRecord,
    verifiedListingRow: verifiedListingRow,
    verifiedScoreSummary: verifiedScoreSummary,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
