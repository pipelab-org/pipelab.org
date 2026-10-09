#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// This is intentionally a source guard, not a freshness checker. The committed
// snapshot in data/stats.yaml is the one sanctioned place for live corpus
// figures; it is pinned to an upstream commit and updated deliberately in PRs.
// Published blog posts and a versioned worker fixture are historical evidence,
// so their original figures are sanctioned too.
const sanctionedPaths = new Set([
  "data/stats.yaml",
  "test/worker-results.test.mjs",
  "scripts/corpus-count-audit.mjs",
]);
const sanctionedPrefixes = ["content/blog/"];
const countLiteral = /\b\d+(?:\.\d+)?\s+(?:(?:logical\s+)?(?:test\s+)?)?cases?\b|\b\d+\s+(?:block-expected|allow-expected|warn-class)\b|\b\d+\s+categories\b/i;
const corpusContext = /agent[- ]egress[- ]bench|bench(?:mark)?\s+corpus|public\s+corpus|corpus/i;

const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "buffer" });
if (tracked.status !== 0) {
  console.error("corpus count audit: unable to enumerate tracked files with git ls-files; refusing to skip the guard");
  process.exit(1);
}

const findings = [];
for (const file of tracked.stdout.toString("utf8").split("\0").filter(Boolean)) {
  if (isSanctioned(file) || !isTextSource(file)) {
    continue;
  }

  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (error) {
    findings.push(`${file}: unable to read tracked source (${error.message}); refusing to skip corpus-count checks`);
    continue;
  }

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!countLiteral.test(lines[index])) {
      continue;
    }

    const nearby = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join(" ");
    if (!corpusContext.test(nearby)) {
      continue;
    }

    findings.push(
      `${file}:${index + 1}: direct Agent Egress Bench count literal "${lines[index].trim()}"; remove the literal or render data/stats.yaml through a Hugo template/shortcode. Historical benchmark evidence belongs only in content/blog/.`,
    );
  }
}

if (findings.length > 0) {
  console.error("corpus count audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("corpus count audit passed: no unsanctioned direct Agent Egress Bench count literals in tracked text sources");

function isSanctioned(file) {
  return sanctionedPaths.has(file) || sanctionedPrefixes.some((prefix) => file.startsWith(prefix));
}

function isTextSource(file) {
  return /\.(?:html|js|json|md|scss|toml|txt|xml|yaml|yml)$/i.test(file) || file === ".brand/SKILL.md";
}
