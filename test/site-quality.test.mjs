import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { auditResponsePatternCounts, responsePatternClaims } from "../scripts/response-pattern-audit.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("current response-pattern claims use the shared datum", () => {
  assert.deepEqual(auditResponsePatternCounts(root), []);
  const count = parse(read("data/stats.yaml")).response_patterns;
  for (const value of [count, count - 1, count + 1]) {
    for (const claim of [
      `${value} response-scanning patterns`, `${value} response scanning patterns`,
      `${value} injection detection patterns`, `${value} injection patterns`,
      `${value} injection and response patterns`, `injection (${value} patterns)`,
      `65 DLP + ${value} injection + tool-specific checks`,
      `<span>${value}</span> response patterns`,
      `${value}\nresponse-scanning patterns`,
      `<span>Response patterns</span><strong>${value}</strong>`,
    ]) {
      for (const file of ["content/learn/example.md", "data/example.yaml", "themes/pipelab/layouts/index.html", "static/llms-full.txt"]) {
        assert.equal(responsePatternClaims(file, claim).length, 1, `${file}: ${claim}`);
      }
    }
  }
  assert.deepEqual(responsePatternClaims("content/blog/historical.md", "25 injection patterns"), []);
  assert.deepEqual(responsePatternClaims("content/learn/pipelock-v250-upgrade.md", "25 injection patterns"), []);
  for (const claim of ['{{< stat key="response_patterns" >}} injection patterns', "65 DLP patterns", "6 response-scanning passes", "34% of implementations", "3. Scan inbound traffic for prompt injection patterns\n4. Block unsafe destinations"]) {
    assert.deepEqual(responsePatternClaims("content/learn/example.md", claim), [], claim);
  }
});

test("pricing selector check rejects an injected descendant and distinguishes siblings", () => {
  function check(html) {
    return spawnSync("python3", ["scripts/pricing-counter-audit.py", "--stdin"], {
      cwd: root, input: html, encoding: "utf8",
    });
  }
  const absent = check('<div class="pricing-card"><br><img src="x"></div><article class="pricing-tier">Plan</article><div class="pricing-card pricing-tier">Same node</div><script>"<div class=pricing-card><p class=pricing-tier>"</script>');
  assert.equal(absent.status, 0, absent.stderr);
  assert.match(absent.stdout, /0 matching elements/);
  const injected = check('<article class="pricing-card featured"><div><br><span class="pricing-tier extra">Injected</span></div></article>');
  assert.equal(injected.status, 1, injected.stderr);
  assert.match(injected.stdout, /1 matching elements/);
  assert.match(injected.stderr, /1 match\(es\) for \.pricing-card \.pricing-tier/);
});

test("Hugo renders the shared pattern datum and follows the published result pointer", (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "site-quality-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const dir of ["content", "data", "layouts/_default", "layouts/shortcodes", "layouts/partials", "static/gauntlet/evidence"]) {
    mkdirSync(path.join(fixture, dir), { recursive: true });
  }
  writeFileSync(path.join(fixture, "hugo.toml"), 'baseURL = "https://example.org/"\n[params]\npipelock_version = "3.7.1"\n[markup.goldmark.renderer]\nunsafe = true\n');
  writeFileSync(path.join(fixture, "layouts/_default/single.html"), "{{ .Content }}");
  writeFileSync(path.join(fixture, "content/result.md"), '---\ntitle: Result\n---\n{{< stat key="response_patterns" >}} response-scanning patterns\n\n{{< bench-published-result >}}\n');
  for (const file of ["shortcodes/stat.html", "shortcodes/bench-published-result.html", "partials/bench-published-result.html"]) {
    cpSync(path.join(root, "themes/pipelab/layouts", file), path.join(fixture, "layouts", file));
  }
  const pointer = JSON.parse(read("static/gauntlet/evidence/latest-verified.json"));
  const record = JSON.parse(read(`static/gauntlet/evidence/${pointer.record_path.slice(2)}`));
  function render(selectedPointer, selectedRecord, stats) {
    writeFileSync(path.join(fixture, "data/stats.yaml"), `response_patterns: ${stats}\n`);
    writeFileSync(path.join(fixture, "static/gauntlet/evidence/latest-verified.json"), JSON.stringify(selectedPointer));
    const recordPath = path.join(fixture, "static/gauntlet/evidence", selectedPointer.record_path.slice(2));
    mkdirSync(path.dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, JSON.stringify(selectedRecord));
    const build = spawnSync(process.env.HUGO_BIN || "hugo", ["--source", fixture, "--quiet"], { encoding: "utf8" });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    return readFileSync(path.join(fixture, "public/result/index.html"), "utf8");
  }
  const stats = parse(read("data/stats.yaml")).response_patterns;
  const html = render(pointer, record, stats);
  assert.match(html, new RegExp(`${stats} response-scanning patterns`));
  for (const [metric, label] of [["containment", "containment"], ["false_positive_rate", "false-positive rate"]]) {
    assert.ok(html.includes(`${(record.scores.full[metric] * 100).toFixed(2)}% ${label}`));
  }
  assert.ok(html.includes(`Pipelock v${record.tool_version}`));
  assert.ok(html.includes(`?record=${pointer.candidate_sha256}`));
  assert.match(html, /Historical measurement/);
  // A new pointer selects a different immutable record, not the old score or
  // the current product version. This fixture is local and never published.
  const nextPointer = { ...pointer, candidate_sha256: "a".repeat(64), tool_version: "3.7.1" };
  nextPointer.record_path = `./results/pipelock/${nextPointer.candidate_sha256}/continuous-gauntlet-pipelock.json`;
  const nextRecord = structuredClone(record);
  nextRecord.tool_version = "3.7.1";
  nextRecord.scores.full = { containment: 0.75, false_positive_rate: 0.125 };
  nextRecord.metric_counts.full = { containment: { numerator: 3, denominator: 4 }, false_positive_rate: { numerator: 1, denominator: 8 } };
  const next = render(nextPointer, nextRecord, stats + 1);
  assert.match(next, /75.00% containment/);
  assert.match(next, /12.50% false-positive rate/);
  assert.ok(next.includes(`${stats + 1} response-scanning patterns`));
  assert.ok(next.includes(`?record=${nextPointer.candidate_sha256}`));
  assert.doesNotMatch(next, /Historical measurement/);
});
