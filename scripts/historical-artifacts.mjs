import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// A historical artifact is a signed, generated file that keeps the Pipelock
// version it was produced with. Classifying one is an exact, reviewed
// exception, not a path exemption: the entry pins the file's bytes, the version
// it states must be older than the declared release, and every version claim
// inside it must still match that recorded version. Any edit, regeneration or
// newer claim fails the audit until the entry is retired or updated.

export const HISTORICAL_ARTIFACTS_FILE = "data/historical_artifacts.json";

// Only signed, generated Assess samples can carry a historical classification.
// Unsigned current summaries such as static/llms.txt stay current claims even
// though they also live under static/.
export const HISTORICAL_ELIGIBLE_PATHS = new Set([
  "static/assess/demo-assessment/index.html",
  "static/assess/demo-egress-report/index.html",
  "static/assess/demo-summary/index.html",
]);

const ENTRY_KEYS = new Set(["path", "pipelock_version", "sha256", "reason", "classified", "approved_by"]);
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function loadHistoricalArtifacts(root, eligiblePaths) {
  const findings = [];
  const entries = new Map();
  let source;
  try {
    source = readFileSync(`${root}/${HISTORICAL_ARTIFACTS_FILE}`, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { entries, findings };
    findings.push(`${HISTORICAL_ARTIFACTS_FILE}: unable to read (${error.message}); refusing to skip version checks`);
    return { entries, findings };
  }

  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    findings.push(`${HISTORICAL_ARTIFACTS_FILE}: invalid JSON (${error.message})`);
    return { entries, findings };
  }

  if (!document || typeof document !== "object" || Array.isArray(document)
    || Object.keys(document).some(key => key !== "artifacts") || !Array.isArray(document.artifacts)) {
    findings.push(`${HISTORICAL_ARTIFACTS_FILE}: expected exactly {"artifacts": [...]}`);
    return { entries, findings };
  }

  for (const [index, entry] of document.artifacts.entries()) {
    const where = `${HISTORICAL_ARTIFACTS_FILE}: artifacts[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      findings.push(`${where} must be an object`);
      continue;
    }
    const keys = Object.keys(entry);
    const unknown = keys.filter(key => !ENTRY_KEYS.has(key));
    const missing = [...ENTRY_KEYS].filter(key => !keys.includes(key));
    if (unknown.length > 0 || missing.length > 0) {
      findings.push(`${where} has unknown keys [${unknown.join(", ")}] or missing keys [${missing.join(", ")}]`);
      continue;
    }
    const { path, pipelock_version: version, sha256, reason, classified, approved_by: approvedBy } = entry;
    if (typeof path !== "string" || !eligiblePaths.has(path) || !HISTORICAL_ELIGIBLE_PATHS.has(path)) {
      findings.push(`${where} path ${JSON.stringify(path)} is not an eligible signed static artifact on the current-claim list`);
      continue;
    }
    if (entries.has(path)) {
      findings.push(`${where} duplicates ${path}`);
      continue;
    }
    if (typeof version !== "string" || !SEMVER.test(version)
      || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)
      || typeof reason !== "string" || reason.trim() === ""
      || typeof classified !== "string" || !DATE.test(classified)
      || typeof approvedBy !== "string" || approvedBy.trim() === "") {
      findings.push(`${where} for ${path} has a malformed version, sha256, reason, date or approval`);
      continue;
    }
    entries.set(path, { version, sha256 });
  }
  return { entries, findings };
}

// The site audit's demo check: a classified demo must keep its pinned bytes and
// state its recorded version; every other demo must state the current release.
export function auditDemoVersions(root, currentVersion, demoFiles) {
  const historical = loadHistoricalArtifacts(root, HISTORICAL_ELIGIBLE_PATHS);
  const issues = [...historical.findings];
  for (const relativePath of demoFiles) {
    const bytes = readFileSync(`${root}/${relativePath}`);
    const source = bytes.toString("utf8");
    const entry = historical.entries.get(relativePath);
    if (entry) {
      if (sha256Hex(bytes) !== entry.sha256) {
        issues.push(`${relativePath}: classified historical demo bytes changed; regenerate it for v${currentVersion} or update its reviewed classification`);
      }
      if (!source.includes(`v${entry.version}`)) {
        issues.push(`${relativePath}: classified historical demo does not state its recorded version v${entry.version}`);
      }
    } else if (!source.includes(`v${currentVersion}`)) {
      issues.push(`${relativePath}: missing current release version v${currentVersion}`);
    }
  }
  return issues;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function auditHistoricalArtifact(file, bytes, claimsByLine, entry, declared) {
  const findings = [];
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) {
    findings.push(`${file}: classified historical artifact bytes changed (sha256 ${actual}, recorded ${entry.sha256}); regenerate it for ${declared} or update its reviewed classification`);
  }
  if (compareVersions(entry.version, declared) >= 0) {
    findings.push(`${file}: historical classification records ${entry.version}, which is not older than declared Pipelock ${declared}; retire the classification`);
  }
  let stated = false;
  for (const [line, claims] of claimsByLine) {
    for (const claimed of claims) {
      if (claimed === entry.version) {
        stated = true;
      } else {
        findings.push(`${file}:${line}: Pipelock version ${claimed} disagrees with its historical classification ${entry.version}`);
      }
    }
  }
  if (!stated) {
    findings.push(`${file}: classified historical artifact never states its recorded version ${entry.version}`);
  }
  return findings;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
