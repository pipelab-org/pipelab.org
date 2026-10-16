import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { auditInstallContract, auditInstallData, auditRawInstallSource, installationCorrection } from "../scripts/install-contract.mjs";

// Operator instructions from the release README, independently expressed here.
const clone = "git clone --branch v3.7.0 --depth 1 https://github.com/pipelab-org/pipelock.git";
const build = "make -C pipelock install";
const brew = "brew install luckyPipewrench/tap/pipelock";
const oldCommand = "go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest";
const raw = `## Installation\n### Source\n\`\`\`bash\n${clone}\n${build}\n\`\`\`\n### Homebrew\n\`\`\`bash\n${brew}\n\`\`\`\n`;
const data = () => ({ methods: [
  { id: "go", label: "Source (Go)", note: "Requires Go 1.26+, Git, and Make. Community build only.", command: `${clone.replace("3.7.0", "VERSION")}\n${build}` },
  { id: "docker", command: "docker pull ghcr.io/luckypipewrench/pipelock:VERSION" },
  { id: "homebrew", command: brew },
] });

test("the real shared install source follows the released source-build instructions", () => {
  assert.deepEqual(auditInstallData(readFileSync(new URL("../data/install.yaml", import.meta.url), "utf8")), []);
});

test("malformed, absent and incomplete method data are reported, not skipped", () => {
  for (const source of ["methods: [", "", "methods: {}", "methods: []", "methods: [null]"]) {
    assert.ok(auditInstallData(source).length, source);
  }
});

for (const [name, mutate] of [
  ["obsolete module install", value => { value.methods[0].command = oldCommand; }],
  ["unpinned clone", value => { value.methods[0].command = `git clone https://github.com/pipelab-org/pipelock.git\n${build}`; }],
  ["literal old tag", value => { value.methods[0].command = `${clone.replace("3.7.0", "3.6.0")}\n${build}`; }],
  ["wrong repository", value => { value.methods[0].command = value.methods[0].command.replace("pipelab-org", "another-owner"); }],
  ["missing build", value => { value.methods[0].command = value.methods[0].command.split("\n")[0]; }],
  ["flattened commands", value => { value.methods[0].command = value.methods[0].command.replace("\n", " "); }],
  ["duplicate method", value => { value.methods.push(value.methods[0]); }],
  ["Homebrew first", value => { value.methods.reverse(); }],
  ["missing build prerequisites", value => { delete value.methods[0].note; }],
  ["unpinned Docker", value => { value.methods[1].command = value.methods[1].command.replace("VERSION", "latest"); }],
]) {
  test(`shared source rejects ${name}`, () => {
    const value = data();
    assert.deepEqual(auditInstallData(stringify(value)), []);
    mutate(value);
    assert.ok(auditInstallData(stringify(value)).length);
  });
}

test("raw machine-readable instructions accept the exact current pin and reject drift", () => {
  assert.deepEqual(auditRawInstallSource(raw, "3.7.0"), []);
  for (const source of [
    raw.replace("3.7.0", "3.6.0"),
    raw.replace(clone, oldCommand),
    raw.replace(build, ""),
    raw.replace("\n" + build, " " + build),
    raw.replace(clone, clone.replace("pipelab-org", "luckyPipewrench")),
    raw + `\n${oldCommand.replace("luckyPipewrench", "pipelab-org")}\n`,
    raw + `\n## Another install section\n${brew}\n`,
    `## Earlier section\n${clone}\n${build}\n## Installation\n${brew}\n`,
    `## Installation\n${brew}\n${clone}\n${build}\n`,
  ]) assert.ok(auditRawInstallSource(source, "3.7.0").length, source);
  assert.ok(auditRawInstallSource(raw, undefined).length);
});

function fixture(t) {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "install-contract-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const write = (file, source) => {
    const full = path.join(repoRoot, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, source);
    return full;
  };
  write("data/install.yaml", stringify(data()));
  write("static/llms-full.txt", raw);
  const article = write("content/blog/historical.md", `---\ntitle: History\n---\n\n${installationCorrection}\n\nOriginal text.\n\`\`\`bash\n${oldCommand}\n\`\`\`\n`);
  const guide = write("content/learn/current.md", '---\ntitle: Current\n---\n{{< install-block >}}\n');
  const template = write("themes/pipelab/layouts/index.html", '{{ partial "install/methods.html" (dict) }}');
  const audit = () => auditInstallContract({ repoRoot, contentFiles: [article, guide], templateFiles: [template], version: "3.7.0" });
  return { repoRoot, article, guide, template, write, audit };
}

test("the production audit distinguishes corrected history from current guidance", t => {
  const f = fixture(t);
  assert.deepEqual(f.audit(), []);
  writeFileSync(f.article, readFileSync(f.article, "utf8").replace(installationCorrection, ""));
  assert.match(f.audit().join("\n"), /historical Go-module command needs/);
});

test("a correction after the broken command does not hide it", t => {
  const f = fixture(t);
  writeFileSync(f.article, `${oldCommand}\n${installationCorrection}\n`);
  assert.match(f.audit().join("\n"), /historical Go-module command needs/);
});

test("the production audit detects drift in current FAQ, body, template and raw text", t => {
  const f = fixture(t);
  assert.deepEqual(f.audit(), []);
  writeFileSync(f.guide, `---\nfaq: "${oldCommand}"\n---\n${clone}\n${build}\n`);
  writeFileSync(f.template, oldCommand);
  f.write("static/llms-full.txt", raw.replace("3.7.0", "3.6.0"));
  const issues = f.audit().join("\n");
  assert.match(issues, /frontmatter/);
  assert.match(issues, /hand-written source clone/);
  assert.match(issues, /command in a template/);
  assert.match(issues, /llms-full.txt/);
});

test("missing shared data is a production failure", t => {
  const f = fixture(t);
  rmSync(path.join(f.repoRoot, "data/install.yaml"));
  assert.match(f.audit().join("\n"), /missing shared install source/);
});

test("example and benchmark repository clones are not installation commands", t => {
  const f = fixture(t);
  writeFileSync(f.guide, "## Reproduce\n```bash\ngit clone https://github.com/luckyPipewrench/pipelock\ncd pipelock\nmake bench-egress\n```\n");
  assert.deepEqual(f.audit(), []);
});

test("deleting the raw install section does not evade its current-release requirement", t => {
  const f = fixture(t);
  f.write("static/llms-full.txt", "# Pipelock\n");
  assert.match(f.audit().join("\n"), /missing current pinned source-build/);
});
