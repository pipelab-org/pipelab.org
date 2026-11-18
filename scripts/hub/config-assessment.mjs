import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonical, sha256 } from "./evidence.mjs";
import { validateListing } from "./validate.mjs";
import { applyConfigChanges } from "./config-changes.mjs";
import { commandTimeout, pinnedRelease, releasePin } from "./release-binary.mjs";

function readScore(output) {
  const report = JSON.parse(output);
  const findings = report?.findings ?? [];
  if (typeof report?.grade !== "string" || !Number.isSafeInteger(report.total_score) ||
      !Number.isSafeInteger(report.max_score) || report.max_score < report.total_score ||
      !Array.isArray(report.categories) || !Array.isArray(findings)) {
    throw new Error("pinned Pipelock returned an invalid config score");
  }
  const categories = new Map();
  for (const { name, score, max_score } of report.categories) {
    if (categories.has(name) || typeof name !== "string" || !Number.isSafeInteger(score) ||
        !Number.isSafeInteger(max_score) || score < 0 || score > max_score) {
      throw new Error("pinned Pipelock returned an invalid score category");
    }
    categories.set(name, { score, max_score });
  }
  for (const finding of findings) {
    if (![finding.category, finding.message, finding.severity].every(value => typeof value === "string")) {
      throw new Error("pinned Pipelock returned an invalid score finding");
    }
  }
  return { grade: report.grade, total_score: report.total_score, max_score: report.max_score, categories, findings };
}

export function assessConfig(listing, binary) {
  listing = validateListing(listing);
  if (listing.type !== "config") throw new Error("config listing required");
  binary = pinnedRelease(binary);
  const cwd = mkdtempSync(path.join(tmpdir(), "hub-config-"));
  const base = path.join(cwd, "base.yaml");
  const candidate = path.join(cwd, "pipelock.yaml");
  const run = (...args) => execFileSync(binary, ["--home", cwd, ...args], {
    cwd, env: { HOME: cwd, PATH: process.env.PATH ?? "" }, timeout: commandTimeout,
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    run("generate", "config", "--preset", listing.base_preset, "--output", base);
    const generated = applyConfigChanges(readFileSync(base, "utf8"), listing.changes, listing.base_preset);
    writeFileSync(candidate, generated.yaml, { mode: 0o600 });
    try {
      run("check", "--config", candidate);
    } catch {
      throw new Error("pinned Pipelock refused the generated config");
    }
    const read = file => readScore(run("audit", "score", "--config", file, "--json"));
    const previous = read(base), current = read(candidate);
    if (previous.max_score !== current.max_score || previous.categories.size !== current.categories.size) {
      throw new Error("inconsistent scoring contract");
    }
    const categories = [...current.categories].map(([name, category]) => {
      const old = previous.categories.get(name);
      if (!old || old.max_score !== category.max_score) throw new Error("inconsistent score category");
      return { name, ...category, delta: category.score - old.score };
    });
    const knownFindings = new Set(previous.findings.map(canonical));
    const configurableScanningDisabled = generated.changes.some(change =>
      change.path === "response_scanning.enabled" && change.transition === "true:false");
    const findings = current.findings.filter(finding => !knownFindings.has(canonical(finding))).map(finding =>
      configurableScanningDisabled && finding.category === "Response Scanning" &&
        finding.message === "Response scanning is disabled \u2014 prompt injection in tool results won't be detected"
        ? { ...finding, message: "Configurable response scanning is disabled. Core response patterns still apply, and MCP proxy and scan modes enforce response scanning." }
        : finding);
    return {
      bytes: Buffer.from(generated.yaml),
      sha256: sha256(generated.yaml),
      assessment: {
        version: releasePin.version,
        edition: "free",
        base_preset: listing.base_preset,
        base_grade: previous.grade,
        grade: current.grade,
        total_score: current.total_score,
        max_score: current.max_score,
        categories,
        findings,
        changes: generated.changes,
      },
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
