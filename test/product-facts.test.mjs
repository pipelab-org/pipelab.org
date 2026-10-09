import test from "node:test";
import { parse, stringify } from "yaml";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditProductFacts } from "../scripts/product-facts-audit.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "product-facts-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(`${root}/data`);
  mkdirSync(`${root}/public/.well-known`, { recursive: true });
  writeFileSync(`${root}/hugo.toml`, '[params]\npipelock_version = "1.2.3"\n');
  writeFileSync(`${root}/data/stats.yaml`, 'product_source_repository: https://example.com/product\nproduct_source_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\nproduct_verified_date: "2026-09-01"\ndlp_patterns: 12\ndirect_deps: 3\n');
  const facts = {version: "1.2.3", source_repository: "https://example.com/product", source_commit: "a".repeat(40), verified_date: "2026-09-01", metrics: {dlp_patterns: 12, direct_dependencies: 3}};
  const path = `${root}/public/.well-known/product-facts.json`;
  writeFileSync(path, JSON.stringify(facts));
  return { root, facts, path };
}

test("product facts agree with the declared version and metrics snapshot", t => {
  const {root} = fixture(t);
  assert.deepEqual(auditProductFacts(root), []);
});

for (const field of ["version", "source_repository", "source_commit", "verified_date", "metrics"]) {
  test(`stale ${field} fails the facts audit`, t => {
    const {root, facts, path} = fixture(t);
    facts[field] = "stale";
    writeFileSync(path, JSON.stringify(facts));
    assert.ok(auditProductFacts(root).some(message => message.includes(field)));
  });
}

for (const state of ["missing", "malformed", "null"]) {
  test(`${state} generated facts cannot pass the audit`, t => {
    const {root, path} = fixture(t);
    if (state === "missing") rmSync(path);
    else writeFileSync(path, state === "null" ? "null" : "{");
    assert.ok(auditProductFacts(root).length > 0);
  });
}

test("a changed source snapshot requires rebuilding generated facts", t => {
  const {root} = fixture(t);
  const path = `${root}/data/stats.yaml`;
  writeFileSync(path, readFileSync(path, "utf8").replace("dlp_patterns: 12", "dlp_patterns: 13"));
  assert.ok(auditProductFacts(root).some(message => message.includes("metrics")));
});

test("invalid snapshot commit is rejected even when both copies agree", t => {
  const {root, facts, path} = fixture(t);
  facts.source_commit = "invalid";
  writeFileSync(path, JSON.stringify(facts));
  const stats = `${root}/data/stats.yaml`;
  writeFileSync(stats, readFileSync(stats, "utf8").replace("a".repeat(40), "invalid"));
  assert.ok(auditProductFacts(root).some(message => message.includes("source_commit must")));
});

for (const [field, sourceField, values] of [
  ["source_repository", "product_source_repository", [null, 17, "relative/path", "http://example.com/product", "https://user:password@example.com/product"]],
  ["verified_date", "product_verified_date", [null, 20260901, "yesterday", "2026-02-30", "2026-13-01", "2026-09-01T00:00:00Z"]],
  ["dlp_patterns", "dlp_patterns", [null, "12", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]],
  ["direct_dependencies", "direct_deps", [null, "3", -1, 1.5]],
]) {
  for (const value of values) {
    test(`matching invalid ${field}: ${JSON.stringify(value)} is rejected`, t => {
      const {root, facts, path} = fixture(t);
      const statsPath = `${root}/data/stats.yaml`;
      const stats = parse(readFileSync(statsPath, "utf8"));
      stats[sourceField] = value;
      if (Object.hasOwn(facts.metrics, field)) facts.metrics[field] = value;
      else facts[field] = value;
      writeFileSync(statsPath, stringify(stats));
      writeFileSync(path, JSON.stringify(facts));
      const findings = auditProductFacts(root);
      assert.ok(findings.some(message => message.includes(`source ${field === "dlp_patterns" || field === "direct_dependencies" ? "metrics." : ""}${field} must`)), findings.join("\n"));
    });
  }
}

test("valid leap day and zero metric values are accepted", t => {
  const {root, facts, path} = fixture(t);
  const statsPath = `${root}/data/stats.yaml`;
  const stats = parse(readFileSync(statsPath, "utf8"));
  stats.product_verified_date = facts.verified_date = "2024-02-29";
  stats.dlp_patterns = facts.metrics.dlp_patterns = 0;
  stats.direct_deps = facts.metrics.direct_dependencies = 0;
  writeFileSync(statsPath, stringify(stats));
  writeFileSync(path, JSON.stringify(facts));
  assert.deepEqual(auditProductFacts(root), []);
});
