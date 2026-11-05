import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";

// Brand contract (.brand/SKILL.md): product counts come from data/stats.yaml.
// Community guide contract: the served bundle owns its total, not active rules.
// Preserve published articles and the v2.5/v3.6 upgrade guides' dated figures.
export function derivedCountClaims(file, source) {
  if (file.startsWith("content/blog/") || ["content/learn/pipelock-v250-upgrade.md", "content/learn/pipelock-v360-upgrade.md"].includes(file)) return [];
  const prose = source.replace(/\{\{[\s\S]*?\}\}/g, token => token.replace(/[^\n]/g, " "))
    .replace(/<[^>]*>/g, tag => tag.replace(/[^\n]/g, " ")).replace(/\*\*|__/g, "");
  const findings = [];
  const lines = prose.split("\n");
  for (const [index, line] of lines.entries()) {
    const nearby = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
    let key;
    if (/\b\d+\s+(?:built[- ]in\s+)?(?:DLP(?:\s+credential)?|credential|secret)\s+patterns?\b|\b\d+\s+DLP\s*\+|\bDLP(?:\s+credential\s+detection)?\s*\(\s*\d+\s+patterns?\b|\bDLP\s+across\s+\d+\s+secret\s+patterns?\b/i.test(line)
        || (/^\|[^|]*(?:DLP|credential scanning)[^|]*\|/i.test(line) && /\b\d+\s+patterns?\b/.test(line))
        || (/\b\d+\s+built[- ]in\s+patterns?\b/.test(line) && /DLP/.test(nearby))) key = "dlp_patterns";
    else if (/\b\d+\s+direct\s+(?:build\s+)?dependencies\b/i.test(line)) key = "direct_deps";
    else if (/\b\d+\s+presets\b/i.test(line)) key = "presets";
    else if (/\b\d+\s+(?:signed\s+|community\s+)?rules\b/i.test(line) && /community|pipelock-community/i.test(nearby)) key = "community_rules";
    else if (/\b\d+\s+categories\b/i.test(line) && /assess|report-verdict/i.test(source.split("\n").slice(Math.max(0, index - 2), index + 3).join(" "))) key = "assess_config_categories";
    if (key) findings.push(`${file}:${index + 1}: literal ${key} count; use the stat shortcode or {{stat:${key}}} in frontmatter`);
  }
  return findings;
}

export function auditDerivedCountSources(root = ".") {
  const findings = [];
  function visit(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.(md|html|xml|json|yaml|yml|txt)$/.test(file) && file !== "data/stats.yaml") {
        findings.push(...derivedCountClaims(file, readFileSync(path.join(root, file), "utf8")));
      }
    }
  }
  for (const directory of ["content", "data", "themes/pipelab/layouts"]) visit(directory);
  return findings;
}

export function auditProductFacts(root = ".") {
  try {
    const stats = parseYaml(readFileSync(`${root}/data/stats.yaml`, "utf8"));
    const config = parseToml(readFileSync(`${root}/hugo.toml`, "utf8"));
    const facts = JSON.parse(readFileSync(`${root}/public/.well-known/product-facts.json`, "utf8"));
    const expected = {
      version: config.params.pipelock_version,
      source_repository: stats.product_source_repository,
      source_commit: stats.product_source_commit,
      verified_date: stats.product_verified_date,
      metrics: { dlp_patterns: stats.dlp_patterns, direct_dependencies: stats.direct_deps },
    };
    const findings = validateSnapshot(expected, "source");
    findings.push(...validateSnapshot(facts, "generated"));
    for (const [key, value] of Object.entries(expected)) {
      if (value === undefined || !isDeepStrictEqual(facts[key], value)) {
        findings.push(`product-facts.json: ${key} disagrees with its source; rebuild the site`);
      }
    }
    return findings;
  } catch (error) {
    return [`product-facts.json: unable to validate generated facts (${error.message}); build the site before checking version claims`];
  }
}

function validateSnapshot(snapshot, origin) {
  const findings = [];
  const require = (valid, field, requirement) => {
    if (!valid) findings.push(`product-facts.json: ${origin} ${field} must ${requirement}`);
  };
  require(typeof snapshot.version === "string" && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(snapshot.version), "version", "be a release version (major.minor.patch)");
  require(isHTTPSURL(snapshot.source_repository), "source_repository", "be an absolute HTTPS URL without credentials");
  require(typeof snapshot.source_commit === "string" && /^[0-9a-f]{40}$/.test(snapshot.source_commit), "source_commit", "identify the product metrics snapshot");
  const date = snapshot.verified_date;
  require(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date,
  "verified_date", "be a valid calendar date (YYYY-MM-DD)");
  for (const key of ["dlp_patterns", "direct_dependencies"]) {
    const value = snapshot.metrics?.[key];
    require(Number.isSafeInteger(value) && value >= 0, `metrics.${key}`, "be a nonnegative safe integer");
  }
  return findings;
}

function isHTTPSURL(value) {
  if (typeof value !== "string" || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return value.startsWith("https://") && url.protocol === "https:" && Boolean(url.hostname)
      && !url.username && !url.password;
  } catch {
    return false;
  }
}
