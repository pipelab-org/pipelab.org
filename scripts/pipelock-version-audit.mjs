#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { auditProductFacts } from "./product-facts-audit.mjs";
import { auditReleaseData } from "./release-data-audit.mjs";
import { auditHistoricalArtifact, HISTORICAL_GAUNTLET_POINTER, loadHistoricalArtifacts, versionsInCurrentClaim } from "./historical-artifacts.mjs";

// This is intentionally a current-claim guard, not a release-history rewrite.
// It checks the tracked source surfaces that publish the current Pipelock
// version. Published blog posts under content/blog/ are frozen historical
// evidence and are never treated as current-version claims.
const currentClaimPaths = new Set([
  "content/pipelock.md",
  "data/blog_index.yaml",
  "data/learn_index.yaml",
  "static/llms.txt",
  "static/llms-full.txt",
  "static/assess/demo-assessment/index.html",
  "static/assess/demo-egress-report/index.html",
  "static/assess/demo-summary/index.html",
  HISTORICAL_GAUNTLET_POINTER,
]);
const textSource = /\.(?:html|md|toml|txt|ya?ml)$/i;

const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "buffer" });
if (tracked.status !== 0) {
  console.error("Pipelock version audit: unable to enumerate tracked files with git ls-files; refusing to skip the guard");
  process.exit(1);
}

const files = tracked.stdout.toString("utf8").split("\0").filter(Boolean);
let config;
try {
  config = readFileSync("hugo.toml", "utf8");
} catch (error) {
  console.error(`Pipelock version audit: unable to read hugo.toml (${error.message}); refusing to guess the declared version`);
  process.exit(1);
}

const declared = config.match(/^\s*pipelock_version\s*=\s*"([0-9]+\.[0-9]+(?:\.[0-9]+)?)"\s*$/m)?.[1];
if (!declared) {
  console.error("Pipelock version audit: hugo.toml has no valid params.pipelock_version declaration; refusing to guess the current version");
  process.exit(1);
}

const historical = loadHistoricalArtifacts(".", currentClaimPaths);
const findings = [...auditProductFacts(), ...auditReleaseData(".", declared, historical)];
for (const path of historical.entries.keys()) {
  if (!files.includes(path)) {
    findings.push(`${path}: classified historical artifact is not tracked; remove its classification`);
  }
}
for (const file of files) {
  if (!isCurrentClaimFile(file) || !textSource.test(file)) {
    continue;
  }

  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    findings.push(`${file}: unable to read tracked current-version source (${error.message}); refusing to skip version checks`);
    continue;
  }
  const source = bytes.toString("utf8");

  const entry = historical.entries.get(file);
  if (entry) {
    const claimsByLine = source.split("\n").map((line, index) => [index + 1, versionsInCurrentClaim(file, line)]);
    findings.push(...auditHistoricalArtifact(file, bytes, claimsByLine, entry, declared));
    continue;
  }

  for (const [index, line] of source.split("\n").entries()) {
    for (const claimed of versionsInCurrentClaim(file, line)) {
      // A two-part claim ("Version 3.3") is a legitimate way to name the
      // release, so it matches when it equals the declared major.minor. A
      // three-part claim must match exactly. Requiring three parts is what
      // made this audit unable to see the stale "Version 3.1" it was written
      // to catch.
      const declaredPrefix = declared.split(".").slice(0, 2).join(".");
      const parts = claimed.split(".");
      const ok = parts.length === 1
        ? claimed === declared.split(".")[0]
        : parts.length === 2
          ? claimed === declaredPrefix
          : claimed === declared;
      if (!ok) {
        findings.push(`${file}:${index + 1}: Pipelock version ${claimed} disagrees with hugo.toml params.pipelock_version ${declared}; update the current claim or deliberately move the declaration first`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Pipelock version audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Pipelock version audit passed: tracked current-version claims match hugo.toml (${declared})`);

function isCurrentClaimFile(file) {
  return currentClaimPaths.has(file)
    || (!file.startsWith("content/blog/") && /(?:^|\/)(?:current|latest|release)[^/]*\.(?:html|md|txt|ya?ml)$/i.test(file));
}
