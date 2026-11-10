import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import { auditDerivedCountSources, derivedCountClaims } from "../scripts/product-facts-audit.mjs";
import { corpusCountClaims } from "../scripts/corpus-count-audit.mjs";
import { auditMachineContext } from "../scripts/machine-context-audit.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8");

test("current product count sources reject literals, including the correct current count", () => {
  assert.deepEqual(auditDerivedCountSources(root), []);
  for (const source of [
    "65 DLP patterns", "64 built-in DLP patterns", "66 credential patterns",
    "| Credential scanning (DLP) | 65 patterns, encoding-aware | No |",
    "DLP (65 patterns)", "DLP across 65 secret patterns", "DLP credential detection (65 patterns with encoding-aware matching)",
    "26 direct build dependencies", "all 7 presets",
    "pipelock-community bundle ships 28 rules", "28 community rules",
    'description: "Community collection. 28 signed rules"',
    '<p class="assess-report-verdict">PASS &middot; 23 categories</p>',
  ]) {
    assert.equal(derivedCountClaims("content/learn/example.md", source).length, 1, source);
  }
  for (const source of [
    '{{< stat key="dlp_patterns" >}} DLP patterns', '{{stat:dlp_patterns}} DLP patterns',
    "28.65 million exposed secrets", "65 ms", "30-day trial", "4 checksum validators",
  ]) assert.deepEqual(derivedCountClaims("content/learn/example.md", source), [], source);
  for (const file of ["content/blog/release.md", "content/learn/pipelock-v250-upgrade.md", "content/learn/pipelock-v360-upgrade.md"]) {
    assert.deepEqual(derivedCountClaims(file, "25 DLP patterns and 7 presets"), []);
  }
});

test("corpus guard covers plain-text Hugo output sources without rejecting shared values", () => {
  const file = "themes/pipelab/layouts/index.llmsfull.txt";
  assert.equal(corpusCountClaims(file, "Agent Egress Bench corpus: 268 cases").length, 1);
  assert.equal(corpusCountClaims(file, "Agent Egress Bench corpus: 267 cases").length, 1);
  assert.deepEqual(corpusCountClaims(file, '{{ site.Data.stats.bench_cases }} cases in the public corpus'), []);
  assert.deepEqual(corpusCountClaims("content/blog/historical.md", "Agent Egress Bench corpus: 100 cases"), []);
});

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "derived-site-facts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  const copy = (file, destination = file) => {
    mkdirSync(path.dirname(path.join(dir, destination)), { recursive: true });
    cpSync(path.join(root, file), path.join(dir, destination), { recursive: true });
  };
  for (const file of ["hugo.toml", "data", "static/_headers", "static/rules/pipelock-community/bundle.yaml"]) copy(file);
  for (const file of ["index.llms.txt", "index.llmsfull.txt", "partials/machine", "partials/hub-open.html", "partials/fact-value.html", "partials/fact-text.html", "partials/faq.html", "shortcodes/stat.html"]) {
    copy(`themes/pipelab/layouts/${file}`, `layouts/${file}`);
  }
  // Audits inspect the tracked templates, not a second editable summary copy.
  for (const file of ["index.llms.txt", "index.llmsfull.txt"]) copy(`themes/pipelab/layouts/${file}`);
  write("hugo.toml", read("hugo.toml").replace('theme = "pipelab"', "").replace(', "redirects"', ""));
  write("layouts/index.html", "Home");
  write("layouts/_default/single.html", '{{ partial "fact-text.html" .Description }}\n{{ .Content }}\n{{ partial "faq.html" . }}\n{{ range .Params.faq }}{{ .a | partial "fact-text.html" | markdownify | plainify | jsonify }}{{ end }}');
  for (const route of ["pipelock", "proof", "pricing", "enterprise", "about", "compare", "gauntlet"]) {
    write(`content/${route}.md`, `---\ntitle: "${route} title"\n---\n`);
  }
  write("content/facts.md", `---
title: Facts
description: "Community {{stat:community_rules}} rules"
faq:
  - q: "DLP coverage?"
    a: "There are {{stat:dlp_patterns}} DLP patterns."
---
{{< stat key="dlp_patterns" >}} DLP patterns

{{< stat key="direct_deps" >}} direct dependencies

{{< stat key="presets" >}} presets

{{< stat key="assess_config_categories" >}} categories

{{< stat key="community_rules" >}} community rules
`);
  const build = () => spawnSync(process.env.HUGO_BIN || "hugo", ["--source", dir], { encoding: "utf8" });
  const built = file => readFileSync(path.join(dir, "public", file), "utf8");
  return { dir, write, build, built };
}

test("machine guide rendering and audit use the hub visibility switch together", t => {
  const f = fixture(t);
  let result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(f.built("llms.txt"), /\/hub\//);
  assert.deepEqual(auditMachineContext(f.dir), []);
  f.write("data/hub/launch.toml", "open = true\n");
  result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(f.built("llms.txt"), /\[PipeLab Hub\]\(https:\/\/pipelab.org\/hub\/\)/);
  assert.deepEqual(auditMachineContext(f.dir), []);
  for (const file of ["llms.txt", "llms-full.txt"]) {
    f.write(`public/${file}`, f.built(file).replace(/^- \[PipeLab Hub\].*\n/m, ""));
  }
  assert.equal(auditMachineContext(f.dir).filter(issue => issue.includes("missing approved guide PipeLab Hub")).length, 2);
});

test("Hugo derives counts, FAQ text, page metadata, release copy and install commands without static copies", t => {
  const f = fixture(t);
  const stats = parse(read("data/stats.yaml"));
  const bundle = parse(read("static/rules/pipelock-community/bundle.yaml"));
  let result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(auditMachineContext(f.dir), []);
  for (const [key, label] of [["dlp_patterns", "DLP patterns"], ["direct_deps", "direct dependencies"], ["presets", "presets"], ["assess_config_categories", "categories"]]) {
    assert.ok(f.built("facts/index.html").includes(`${stats[key]} ${label}`));
  }
  assert.ok(f.built("facts/index.html").includes(`Community ${bundle.rules.length} rules`));
  assert.ok(f.built("facts/index.html").includes(`"There are ${stats.dlp_patterns} DLP patterns."`));
  assert.ok(f.built("llms-full.txt").includes("- Title: pipelock title"));

  // Change authorities, not expected render values. Both FAQ consumers and
  // body counts must follow; signed production bytes are never edited here.
  stats.dlp_patterns += 1;
  stats.direct_deps += 1;
  stats.presets += 1;
  stats.assess_config_categories += 1;
  f.write("data/stats.yaml", stringify(stats));
  bundle.rules.push({ name: "Synthetic fixture rule" });
  f.write("static/rules/pipelock-community/bundle.yaml", stringify(bundle));
  f.write("hugo.toml", readFileSync(path.join(f.dir, "hugo.toml"), "utf8").replace('pipelock_version = "3.8.0"', 'pipelock_version = "3.8.9"'));
  result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const [key, label] of [["dlp_patterns", "DLP patterns"], ["direct_deps", "direct dependencies"], ["presets", "presets"], ["assess_config_categories", "categories"]]) {
    assert.ok(f.built("facts/index.html").includes(`${stats[key]} ${label}`));
  }
  assert.ok(f.built("facts/index.html").includes(`Community ${bundle.rules.length} rules`));
  assert.ok(f.built("facts/index.html").includes(`"There are ${stats.dlp_patterns} DLP patterns."`));
  for (const file of ["llms.txt", "llms-full.txt"]) assert.ok(f.built(file).includes("current release 3.8.9"));
  assert.ok(f.built("llms-full.txt").includes("git clone --branch v3.8.9"));
  assert.ok(f.built("llms-full.txt").includes("--version 3.8.9"));
  assert.ok(f.built("llms-full.txt").includes("/blob/v3.7.1/docs/"), "checked citations retain their revision");
  assert.deepEqual(auditMachineContext(f.dir), []);

  f.write("public/llms-full.txt", f.built("llms-full.txt").replace("--version 3.8.9", "--version 3.0.0") + "\n{{stat:missing}}\n");
  assert.match(auditMachineContext(f.dir).join("\n"), /unresolved template/);
  assert.match(auditMachineContext(f.dir).join("\n"), /missing shared helm|Helm OCI install/);
  f.write("static/llms.txt", "conflicting copy");
  assert.match(auditMachineContext(f.dir).join("\n"), /conflicts with the generated/);
});

test("missing facts, unknown tokens, invalid bundles and unreviewed minor copy fail Hugo", t => {
  const f = fixture(t);
  let result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const stats = parse(read("data/stats.yaml"));
  delete stats.dlp_patterns;
  f.write("data/stats.yaml", stringify(stats));
  result = f.build();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /no value for.*dlp_patterns/);
  f.write("data/stats.yaml", read("data/stats.yaml"));
  f.write("content/invalid.md", '---\ntitle: Invalid\ndescription: "{{stat:missing}}"\n---\n');
  result = f.build();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /no value for.*missing/);
  f.write("content/invalid.md", '---\ntitle: Invalid\ndescription: "{{stat:bad-key}}"\n---\n');
  result = f.build();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /invalid site fact token/);
  f.write("content/invalid.md", '---\ntitle: Invalid\n---\n');
  f.write("static/rules/pipelock-community/bundle.yaml", "name: wrong\nrules: []\n");
  result = f.build();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /requires the served/);
  f.write("static/rules/pipelock-community/bundle.yaml", read("static/rules/pipelock-community/bundle.yaml"));
  f.write("data/machine_context.yaml", read("data/machine_context.yaml").replace('minor: "3.8"', 'minor: "3.7"'));
  result = f.build();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /must match the approved release summary/);
});


test("slashless, query and absolute Hub guides stay hidden until launch", t => {
  const f = fixture(t);
  const editorial = parse(read("data/machine_context.yaml"));
  const variants = ["/hub", "/hub/", "/hub?view=all", "/hub/#listing", "https://pipelab.org/hub", "/hub/recipes/example/", "hub/", "hub/recipes/example/"];
  editorial.guides = variants.map((url, i) => ({ label: `Gated guide ${i}`, url }));
  f.write("data/machine_context.yaml", stringify(editorial));
  let result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of ["llms.txt", "llms-full.txt"]) assert.doesNotMatch(f.built(file), /Gated guide/);
  assert.deepEqual(auditMachineContext(f.dir), []);
  f.write("data/hub/launch.toml", "open = true\n");
  result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of ["llms.txt", "llms-full.txt"]) for (const guide of editorial.guides) assert.ok(f.built(file).includes(guide.label));
  assert.deepEqual(auditMachineContext(f.dir), []);
});

test("path-prefixed base URLs hide hub guides until launch and keep ordinary guides", t => {
  const f = fixture(t);
  const config = readFileSync(path.join(f.dir, "hugo.toml"), "utf8").replace('baseURL = "https://pipelab.org/"', 'baseURL = "https://example.com/preview/"');
  f.write("hugo.toml", config);
  const editorial = parse(read("data/machine_context.yaml"));
  editorial.guides = [
    { label: "Relative hub", url: "hub/" },
    { label: "Absolute hub", url: "https://example.com/preview/hub/recipes/example/" },
    { label: "Host hub", url: "/hub/" },
    { label: "Learn guide", url: "learn/foo/" },
  ];
  f.write("data/machine_context.yaml", stringify(editorial));
  let result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of ["llms.txt", "llms-full.txt"]) {
    const body = f.built(file);
    assert.doesNotMatch(body, /Relative hub|Absolute hub|Host hub/);
    assert.match(body, /\[Learn guide\]\(https:\/\/example.com\/preview\/learn\/foo\/\)/);
  }
  assert.deepEqual(auditMachineContext(f.dir), []);
  f.write("data/hub/launch.toml", "open = true\n");
  result = f.build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of ["llms.txt", "llms-full.txt"]) {
    const body = f.built(file);
    assert.match(body, /\[Relative hub\]\(https:\/\/example.com\/preview\/hub\/\)/);
    assert.match(body, /\[Absolute hub\]\(https:\/\/example.com\/preview\/hub\/recipes\/example\/\)/);
    assert.match(body, /\[Host hub\]\(https:\/\/example.com\/hub\/\)/);
    assert.match(body, /\[Learn guide\]\(https:\/\/example.com\/preview\/learn\/foo\/\)/);
  }
  assert.deepEqual(auditMachineContext(f.dir), []);
});
