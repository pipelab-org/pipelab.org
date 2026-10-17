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
  const article = write("content/blog/pipelock-v340-release.md", `---\ntitle: History\n---\n\n${installationCorrection}\n\nOriginal text.\n\`\`\`bash\n${oldCommand}\n\`\`\`\n`);
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
  writeFileSync(f.guide, "Build another tool with `make install`.\n");
  assert.deepEqual(f.audit(), []);
});

test("deleting the raw install section does not evade its current-release requirement", t => {
  const f = fixture(t);
  f.write("static/llms-full.txt", "# Pipelock\n");
  assert.match(f.audit().join("\n"), /missing current pinned source-build/);
});

test("raw source clones cannot hide a changed URL behind a valid command", () => {
  for (const suffix of [".attacker", "/other", "?ref=main", "#main"]) {
    assert.ok(auditRawInstallSource(`${raw}\n${clone}${suffix}\n${build}\n`, "3.7.0").length, suffix);
  }
});

test("unpinned source installs are audited in current guides and raw instructions", t => {
  const f = fixture(t);
  for (const owner of ["pipelab-org", "luckyPipewrench"]) {
    for (const command of ["cd pipelock\nmake install", "make -C pipelock install"]) {
      const source = `git clone https://github.com/${owner}/pipelock.git\n${command}\n`;
      writeFileSync(f.guide, source);
      assert.match(f.audit().join("\n"), /hand-written source/);
      assert.ok(auditRawInstallSource(source, "3.7.0").length);
    }
  }
});

// CommonMark 0.31.2 section 4.5: closing fences match character, minimum
// opening length, and trailing whitespace only.
test("shorter and annotated markers do not close a fenced install section", () => {
  for (const [open, inner, close] of [["````bash", "```", "````"], ["```bash", "```text", "```"], ["~~~~bash", "~~~", "~~~~"], ["```bash", "~~~", "```"]]) {
    const source = `## Installation\n${open}\n${clone}\n${build}\n${inner}\n## example shell comment\n${brew}\n${close}\n`;
    assert.deepEqual(auditRawInstallSource(source, "3.7.0"), [], inner);
  }
  assert.ok(auditRawInstallSource(`## Source\n\`\`\`bash\n${clone}\n${build}\n\`\`\`\`\n## Homebrew\n${brew}\n`, "3.7.0").length);
});

test("new blog posts cannot inherit the published installation correction exemption", t => {
  const f = fixture(t);
  const current = f.write("content/blog/current-release.md", `${installationCorrection}\n${oldCommand}\n`);
  for (const source of [readFileSync(current, "utf8"), `${clone.replace("3.7.0", "3.6.0")}\n${build}\n`]) {
    writeFileSync(current, source);
    const issues = auditInstallContract({ repoRoot: f.repoRoot, contentFiles: [current], templateFiles: [], version: "3.7.0" });
    assert.match(issues.join("\n"), /hand-written/);
  }
});

// Coverage that predates the stricter URL match and must survive it: the tag may
// follow the URL, the host may be spelled differently, and an extra unpinned
// clone beside the exact pinned build is still a drifted instruction.
test("tag position, host spelling and extra unpinned clones cannot evade the source audit", t => {
  for (const stale of [
    "git clone --depth 1 https://github.com/pipelab-org/pipelock.git --branch v3.6.0",
    "git clone --branch v3.6.0 http://github.com/pipelab-org/pipelock.git",
    "git clone --branch v3.6.0 https://www.github.com/pipelab-org/pipelock.git",
  ]) {
    assert.ok(auditRawInstallSource(`${raw}\n${stale}\n`, "3.7.0").length, stale);
    const f = fixture(t);
    writeFileSync(f.guide, `${stale}\n`);
    assert.match(f.audit().join("\n"), /hand-written source clone/, stale);
  }
  const extra = raw.replace(`${build}\n`, `${build}\ngit clone https://github.com/pipelab-org/pipelock.git\n`);
  assert.match(auditRawInstallSource(extra, "3.7.0").join("\n"), /source clone does not match/);
});

test("a frozen historical body keeps only the commands it was published with", t => {
  const f = fixture(t);
  const published = `${installationCorrection}\n\nOriginal text.\n${brew}\n${oldCommand}\n`;
  writeFileSync(f.article, published);
  assert.deepEqual(f.audit(), []);
  for (const added of [`${clone.replace("3.7.0", "3.6.0")}\n${build}\n`, "git clone https://github.com/pipelab-org/pipelock.git\nmake install\n"]) {
    writeFileSync(f.article, published + added);
    assert.match(f.audit().join("\n"), /hand-written source/, added);
  }
});


test("raw source clone comparison includes arguments after the repository URL", () => {
  assert.deepEqual(auditRawInstallSource(raw, "3.7.0"), []);
  for (const suffix of [" other-checkout", " --depth 2", " --branch v3.6.0"]) {
    assert.match(auditRawInstallSource(`${raw}\n${clone}${suffix}\n${build}\n`, "3.7.0").join("\n"), /source clone does not match/, suffix);
  }
});

test("benchmark clones do not pair with an installation in another Markdown example", t => {
  const f = fixture(t);
  const benchmark = "git clone https://github.com/luckyPipewrench/pipelock\ncd pipelock\nmake bench-egress";
  for (const source of [
    `## Reproduce\n\x60\x60\x60bash\n${benchmark}\n\x60\x60\x60\n\nBuild another tool with \x60make install\x60.\n`,
    `## Reproduce\n\x60\x60\x60bash\n${benchmark}\n\x60\x60\x60\n\x60\x60\x60bash\nmake install\n\x60\x60\x60\n`,
    `${benchmark}\n\nBuild another tool with \x60make install\x60.\n`,
  ]) {
    writeFileSync(f.guide, source);
    assert.deepEqual(f.audit(), [], source);
  }
  // A blank line inside a shell block does not break a real install sequence.
  writeFileSync(f.guide, `\x60\x60\x60bash\ngit clone https://github.com/pipelab-org/pipelock.git\n\ncd pipelock\nmake install\n\x60\x60\x60\n`);
  assert.match(f.audit().join("\n"), /hand-written source/);
});

test("a leading thematic-break pair does not hide commands from the audit", t => {
  const f = fixture(t);
  for (const body of [
    "---\ngit clone https://github.com/pipelab-org/pipelock.git\nmake install\n---\n",
    `---\n\nIntro\n\n${oldCommand.replace("luckyPipewrench", "pipelab-org")}\n\n---\n`,
  ]) {
    writeFileSync(f.guide, `---\ntitle: Current\n---\n${body}`);
    assert.match(f.audit().join("\n"), /hand-written/, body);
    assert.ok(auditRawInstallSource(body, "3.7.0").length, body);
  }
});

// CommonMark 0.31.2 section 4.4: blank lines stay inside an indented code chunk,
// which also covers a fence nested deeper than the top level.
test("blank lines inside an indented chunk or nested fence do not separate a real install", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const body of [
    `    ${unpinned}\n\n    cd pipelock\n    make install\n`,
    ...["     ", "        ", "            ", "\t", "\t\t", "\t    ", " \t", "  \t", "   \t"].map(indent =>
      `${indent}${unpinned}\n\n${indent}cd pipelock\n${indent}make install\n`),
    `1. Install:\n\n    \x60\x60\x60bash\n    ${unpinned}\n\n    make install\n    \x60\x60\x60\n`,
  ]) {
    writeFileSync(f.guide, body);
    assert.match(f.audit().join("\n"), /hand-written source/, body);
    assert.ok(auditRawInstallSource(`${raw}\n${body}`, "3.7.0").length, body);
  }
});

test("front matter and templates are not Markdown and keep whole-text pairing", t => {
  const f = fixture(t);
  const source = "git clone https://github.com/pipelab-org/pipelock.git\n\ncd pipelock\n\nmake install";
  writeFileSync(f.template, `<pre><code>${source}</code></pre>`);
  assert.match(f.audit().join("\n"), /command in a template/);
  writeFileSync(f.template, "<p>ok</p>");
  writeFileSync(f.guide, `---\nfaq: |\n  ${source.replaceAll("\n", "\n  ")}\n---\nBody.\n`);
  assert.match(f.audit().join("\n"), /frontmatter contains source/);
});

test("indented ATX headings keep raw installation sections independent", () => {
  for (const indent of ["", " ", "  ", "   "]) {
    const source = `## Earlier\n${clone}\n${build}\n${indent}## Installation\n${brew}\n`;
    assert.match(auditRawInstallSource(source, "3.7.0").join("\n"), /install section must include/, JSON.stringify(indent));
  }
  assert.deepEqual(auditRawInstallSource(`## Earlier\n${clone}\n${build}\n    ## Code comment\n${brew}\n`, "3.7.0"), []);
});

// CommonMark 0.31.2 section 4.2: the opening # sequence may be followed by the
// end of the line, so a bare "#" or "##" is an empty heading that ends a section.
test("empty ATX headings keep raw installation sections independent", () => {
  for (const heading of ["#", "##", " #", "  ##", "   ##"]) {
    const source = `## Earlier\n${clone}\n${build}\n${heading}\n${brew}\n`;
    assert.match(auditRawInstallSource(source, "3.7.0").join("\n"), /install section must include/, JSON.stringify(heading));
  }
});

// Section 2.1: only spaces and tabs make a line blank. A line holding any other
// whitespace character is paragraph text, so it cannot separate a real install,
// and a fence closer followed by one (section 4.5) does not close the fence.
test("non-blank whitespace lines do not separate a real install", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const character of [" ", "\f", "\v", " ", "　"]) {
    for (const body of [
      `${unpinned}\n${character}\nmake install\n`,
      `${unpinned}\n#${character}\nmake install\n`,
      `${unpinned}\n##${character}\nmake install\n`,
      `    ${unpinned}\n${character}\n    make install\n`,
      `\x60\x60\x60\nexample\n\x60\x60\x60${character}\n${unpinned}\n\nmake install\n`,
    ]) {
      writeFileSync(f.guide, body);
      assert.match(f.audit().join("\n"), /hand-written source/, JSON.stringify(body));
      assert.ok(auditRawInstallSource(`${raw}\n## Later\n${body}`, "3.7.0").length, JSON.stringify(body));
    }
  }
  for (const blank of ["", " ", "\t", "  \t "]) {
    writeFileSync(f.guide, `${unpinned}\n${blank}\nmake install\n`);
    assert.deepEqual(f.audit(), [], JSON.stringify(blank));
  }
});

test("CommonMark line endings preserve fences, front matter and exact install pins", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const ending of ["\r\n", "\r"]) {
    const convert = source => source.replaceAll("\n", ending);
    assert.deepEqual(auditRawInstallSource(convert(raw), "3.7.0"), []);
    f.write("static/llms-full.txt", convert(raw));
    f.write("data/install.yaml", convert(stringify(data())));
    writeFileSync(f.guide, convert('---\ntitle: Current\n---\n{{< install-block >}}\n'));
    writeFileSync(f.article, convert(`${installationCorrection}\n${oldCommand}\n`));
    assert.deepEqual(f.audit(), []);
    const fenced = `\x60\x60\x60bash\n${unpinned}\n\ncd pipelock\nmake install\n\x60\x60\x60\n`;
    writeFileSync(f.guide, convert(fenced));
    assert.match(f.audit().join("\n"), /hand-written source/);
    assert.ok(auditRawInstallSource(convert(fenced), "3.7.0").length);
    writeFileSync(f.guide, convert(`---\nfaq: "${oldCommand}"\n---\nBody.\n`));
    assert.match(f.audit().join("\n"), /frontmatter contains unsupported go install/);
  }
});

// CommonMark 0.31.2 sections 4.3 and 4.6: setext headings delimit sections,
// while HTML block types 1-5 retain blank lines until their closing marker.
test("thematic breaks and orphan underlines preserve one install section", () => {
  for (const marker of ["---", "- - -", "===", "=", "--", "-"]) {
    for (const gap of ["", "\n"]) {
      const source = raw.replace("### Homebrew", `${gap}${marker}\n### Homebrew`);
      assert.deepEqual(auditRawInstallSource(source, "3.7.0"), [], JSON.stringify({ marker, gap }));
    }
  }
});

test("setext headings cannot borrow the pin from an earlier install section", () => {
  for (const underline of ["=", "====", "-", "-----", "   ===  ", "  ---\t"]) {
    const source = `## Earlier\n${clone}\n${build}\n\nLater\n${underline}\n${brew}\n`;
    assert.match(auditRawInstallSource(source, "3.7.0").join("\n"), /install section must include/, underline);
  }
  assert.deepEqual(auditRawInstallSource(`${raw}\n\x60\x60\x60text\nLater\n-----\n\x60\x60\x60\n`, "3.7.0"), []);
});

test("HTML blocks keep install commands together until their own terminator", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const [open, close] of [["<pre>", "</pre>"], ["<pre/>", "</pre>"], ["<PRE class='shell'>", "</PRE>"], ["<script>", "</script>"], ["<script/>", "</script>"], ["<style>", "</style>"], ["<style/>", "</style>"], ["<textarea>", "</textarea>"], ["<textarea/>", "</textarea>"], ["<!--", "-->"], ["<?instruction", "?>"], ["<!DOCTYPE", ">"], ["<!doctype", ">"], ["<![CDATA[", "]]>"]]) {
    const body = `${open}\n${unpinned}\n\n## shell comment\n\nmake install\n${close}\n`;
    writeFileSync(f.guide, body);
    assert.match(f.audit().join("\n"), /hand-written source/, open);
    assert.ok(auditRawInstallSource(`${raw}\n## Later\n${body}`, "3.7.0").length, open);
    // The terminator ends the example even without a following blank line.
    writeFileSync(f.guide, `${open}\n${unpinned}\n${close}\nmake install\n`);
    assert.deepEqual(f.audit(), [], open);
    // A separate example after a closed block must not pair with its clone.
    writeFileSync(f.guide, `${open}\n${unpinned}\n${close}\n\nBuild another tool with \x60make install\x60.\n`);
    assert.deepEqual(f.audit(), [], open);
    // The fence marker is raw text inside the block, so it cannot swallow the
    // heading that follows and let an unpinned section borrow the earlier pin.
    assert.match(auditRawInstallSource(`${raw}\n${open}\n\x60\x60\x60\n${close}\n\n## Later\n${brew}\n`, "3.7.0").join("\n"), /install section must include/, open);
  }
});

// Section 4.6 types 6 and 7 end at a blank line. Until then heading, setext and
// fence markers are raw text, so they cannot split a real install or hide a
// later heading. Type 7 cannot interrupt a paragraph; type 6 can.
test("HTML block types 6 and 7 keep marker lines inside the block until a blank line", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const open of ["<div>", "</div>", "<DIV class=\"shell\">", "<p>", "<section>", "<h3>", "<custom-tag>", "<custom-tag data-x='y'>", "</custom-tag>", "<br/>"]) {
    for (const marker of ["---", "===", "# step", "## step", "\x60\x60\x60", "~~~"]) {
      writeFileSync(f.guide, `${open}\n${unpinned}\n${marker}\nmake install\n`);
      assert.match(f.audit().join("\n"), /hand-written source/, `${open} ${marker}`);
      assert.ok(auditRawInstallSource(`${raw}\n## Later\n${open}\n${unpinned}\n${marker}\nmake install\n`, "3.7.0").length, `${open} ${marker}`);
    }
    // A blank line ends the block, so the heading after it separates sections again.
    assert.match(auditRawInstallSource(`${raw}\n${open}\n\x60\x60\x60\n\n## Later\n${brew}\n`, "3.7.0").join("\n"), /install section must include/, open);
  }
  writeFileSync(f.guide, `${unpinned}\n<custom-tag>\n---\nmake install\n`);
  assert.deepEqual(f.audit(), [], "type 7 does not interrupt a paragraph");
  writeFileSync(f.guide, `${unpinned}\n<div>\n---\nmake install\n`);
  assert.deepEqual(f.audit(), [], "type 6 interrupts a paragraph");
  // With a paragraph open the tag line is paragraph text, so the heading below it is real.
  assert.match(auditRawInstallSource(`${raw}\nintro\n<custom-tag>\n## Later\n${brew}\n`, "3.7.0").join("\n"), /install section must include/);
  // A heading, closed fence or finished HTML block leaves no paragraph open, so type 7 starts.
  for (const before of ["### Steps", "\x60\x60\x60\nexample\n\x60\x60\x60", "<!-- note -->"]) {
    const hidden = `${raw}\n${before}\n<custom-tag>\n\x60\x60\x60\n\n## Later\n${brew}\n`;
    assert.match(auditRawInstallSource(hidden, "3.7.0").join("\n"), /install section must include/, before);
  }
});

// Section 4.6: <h1> and <h2> inside raw HTML still start a section, at any
// depth within an HTML block; elsewhere four spaces of indentation (code) or a
// non-space lead character (paragraph text) make the line an ordinary line.
test("rendered headings delimit raw sections and indented text does not split an install", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const heading of ["<h1>Later</h1>", "<H2>Later</H2>", "  <h2 id=\"later\">Later</h2>", "<div>\n    <h2>Later</h2>"]) {
    const source = `## Earlier\n${clone}\n${build}\n\n${heading}\n${brew}\n`;
    assert.match(auditRawInstallSource(source, "3.7.0").join("\n"), /install section must include/, heading);
  }
  for (const body of ["    ", "\t", "  \t"].map(indent => `${indent}${unpinned}\n${indent}<h2>x\n${indent}make install\n`)
    .concat(["    ", "\t", " "].map(indent => `${unpinned}\n${indent}<h2>x\nmake install\n`))) {
    writeFileSync(f.guide, body);
    assert.match(f.audit().join("\n"), /hand-written source/, JSON.stringify(body));
  }
});

// Section 4.6 type 1 opens before a space, tab, ">" or the end of the line, and
// the renderer adds "/>". A bare slash opens nothing, so it cannot swallow the
// heading below it and let an unpinned section borrow the earlier pin.
test("a bare slash after a raw-text tag name does not open an HTML block", () => {
  for (const open of ["<pre/x", "<pre/", "<script/y", "<style/", "<textarea/", "<PRE/z", "   <pre/x"]) {
    const source = `${raw}\n${open}\n\n## Later\n${brew}\n`;
    assert.match(auditRawInstallSource(source, "3.7.0").join("\n"), /install section must include/, open);
  }
});

// Hugo's goldmark opens raw HTML blocks on shapes the specification does not.
// Examples follow the renderer, so a clone and build it keeps in one block pair
// across marker lines. The outer raw pass keeps the specification, so the heading
// below the same opener still starts its own section.
test("renderer-only HTML block openers keep a real install together", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const open of ["</ div", "</  address>", "<meta", "<META", "<pre\f>", "<script\f", "</textarea>", "</x/>", "</ x />", "</ custom-tag a=b>", "   </ span >"]) {
    for (const marker of ["---", "===", "## step", "\x60\x60\x60", "~~~"]) {
      const body = `${open}\n${unpinned}\n${marker}\nmake install\n`;
      writeFileSync(f.guide, body);
      writeFileSync(f.guide, `---\ntitle: Current\n---\n${body}`);
      assert.match(f.audit().join("\n"), /hand-written source/, JSON.stringify(body));
    }
    assert.match(auditRawInstallSource(`${raw}\n${open}\n## Later\n${brew}\n`, "3.7.0").join("\n"), /install section must include/, open);
  }
  // goldmark requires spaces, not a tab, after a type 6 name and a closing tag without attributes.
  writeFileSync(f.guide, `---\ntitle: Current\n---\n</x a=b>\n${unpinned}\n---\nmake install\n`);
  assert.deepEqual(f.audit(), [], "a closing tag with attributes is paragraph text");
});

// Section 4.6: type 7 cannot interrupt a paragraph, but it can follow any block
// that leaves none open: a thematic break (4.1), indented code (4.4), a setext
// heading (4.3) or a finished HTML block. A "=" run after a closed block is
// paragraph text, as is "--", while a single "-" is an empty list item.
test("an HTML block of type 7 may follow any block that leaves no paragraph open", t => {
  const f = fixture(t);
  const unpinned = "git clone https://github.com/pipelab-org/pipelock.git";
  for (const before of ["---", "***", "- - -", "_ _ _", "   ----", "    code", "\tcode", "# h", "text\n---", "text\n===", "-", "text\n-", "text\n--", "<!-- c -->", "\x60\x60\x60\nx\n\x60\x60\x60"]) {
    for (const marker of ["---", "## step", "\x60\x60\x60", "==="]) {
      const body = `${before}\n<custom-tag>\n${unpinned}\n${marker}\nmake install\n`;
      writeFileSync(f.guide, `---\ntitle: Current\n---\n${body}`);
      assert.match(f.audit().join("\n"), /hand-written source/, JSON.stringify(body));
      assert.ok(auditRawInstallSource(`${raw}\n## Later\n${body}`, "3.7.0").length, JSON.stringify(body));
    }
    const hidden = `${raw}\n${before}\n<custom-tag>\n\x60\x60\x60\n\n## Later\n${brew}\n`;
    assert.match(auditRawInstallSource(hidden, "3.7.0").join("\n"), /install section must include/, JSON.stringify(before));
  }
  for (const before of ["text", "\n===", "\n=", "\n--", "text\n    indented"]) {
    writeFileSync(f.guide, `---\ntitle: Current\n---\n${before}\n<custom-tag>\n${unpinned}\n---\nmake install\n`);
    assert.deepEqual(f.audit(), [], JSON.stringify(before));
  }
});
