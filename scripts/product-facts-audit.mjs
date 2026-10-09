import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";

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
