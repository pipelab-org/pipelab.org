import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// Published contract: the v3.7.0 release README's source-build instructions.
// data/install.yaml substitutes VERSION; raw machine-readable files do not.
export const sourceBuildTemplate = "git clone --branch vVERSION --depth 1 https://github.com/pipelab-org/pipelock.git\nmake -C pipelock install";
export const brewInstallCommand = "brew install luckyPipewrench/tap/pipelock";
const dockerTemplate = "docker pull ghcr.io/luckypipewrench/pipelock:VERSION";
export const installationCorrection = "> Installation correction (2026-10-16): The `go install` command below doesn't install current Pipelock releases. Use the [current installation guide](/install/) for a release binary or a source build pinned to the release tag. The original post follows unchanged.";

const commandPatterns = [
  { label: "unsupported go install", pattern: /\bgo\s+install\s+(?:\\\s*)?github\.com\/(?:luckypipewrench|pipelab-org)\/pipelock(?:\/cmd\/pipelock)?(?:@[^\s`"'<)]+)?/gi },
  { label: "source clone", pattern: /\bgit\s+clone\b(?=[^\n`]*--branch\s+v)[^\n`]*github\.com\/(?:luckypipewrench|pipelab-org)\/pipelock(?:\.git)?/gi },
  { label: "source build", pattern: /\bmake\s+-C\s+pipelock\s+install\b/gi },
  { label: "Homebrew install", pattern: /\bbrew\s+install\s+(?:\\\s*)?luckypipewrench\/tap\/pipelock\b/gi },
];

function commandMatches(source) {
  return commandPatterns.flatMap(({ label, pattern }) => {
    pattern.lastIndex = 0;
    return [...source.matchAll(pattern)].map(match => ({ label, text: match[0], index: match.index }));
  }).sort((a, b) => a.index - b.index);
}

function frontMatter(source) {
  return source.match(/^---\n([\s\S]*?)\n---\n?/)?.[1] || "";
}

function body(source) {
  return source.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

// H3 method headings share the same Installation section. Ignore shell comments
// inside fences so an earlier unrelated source mention cannot mask a bad order.
function sections(source) {
  const result = [];
  let current = "";
  let fence = null;
  for (const line of body(source).split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
    }
    if (!fence && (/^#{1,2}\s+/.test(line) || /^\s*<h2\b/i.test(line))) {
      result.push(current);
      current = "";
    }
    current += `${line}\n`;
  }
  result.push(current);
  return result;
}

export function auditInstallData(source) {
  const issues = [];
  let methods;
  try {
    methods = parseYaml(source)?.methods;
  } catch (error) {
    return [`data/install.yaml: invalid YAML: ${error.message}`];
  }
  if (!Array.isArray(methods)) return ["data/install.yaml: methods must be an array"];
  const ids = methods.map(method => method?.id);
  if (new Set(ids).size !== ids.length) issues.push("data/install.yaml: duplicate method ids");
  for (const [id, command] of [["go", sourceBuildTemplate], ["docker", dockerTemplate], ["homebrew", brewInstallCommand]]) {
    const method = methods.find(entry => entry?.id === id);
    if (method?.command !== command) issues.push(`data/install.yaml: ${id} must use the supported shared command with its release placeholder`);
  }
  if (ids.indexOf("go") > ids.indexOf("homebrew")) issues.push("data/install.yaml: the pinned source build must precede Homebrew");
  const note = methods.find(method => method?.id === "go")?.note;
  if (typeof note !== "string" || !note.includes("Go 1.26+") || !note.includes("Git") || !note.includes("Make") || !note.includes("Community")) {
    issues.push("data/install.yaml: source prerequisites and Community build limit must be disclosed");
  }
  return issues;
}

export function auditRawInstallSource(source, version) {
  const issues = [];
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version || "")) return ["missing or invalid configured release version"];
  const expected = sourceBuildTemplate.replace("VERSION", version);
  if (commandMatches(source).some(match => match.label === "unsupported go install")) issues.push("unsupported Go-module installation command");
  for (const section of sections(source)) {
    const matches = commandMatches(section);
    const brewAt = section.indexOf(brewInstallCommand);
    const sourceAt = section.indexOf(expected);
    const hasSource = matches.some(match => match.label === "source clone" || match.label === "source build");
    if ((hasSource || brewAt !== -1) && sourceAt === -1) issues.push("install section must include the exact source build pinned to the configured release");
    if (brewAt !== -1 && sourceAt > brewAt) issues.push("Homebrew appears before the pinned source build in its install section");
    for (const match of matches.filter(match => match.label === "source clone")) {
      if (match.text !== expected.split("\n")[0]) issues.push("source clone does not match the configured release");
    }
  }
  return issues;
}

export function auditInstallContract({ repoRoot, contentFiles, templateFiles, version }) {
  const issues = [];
  const dataPath = path.join(repoRoot, "data", "install.yaml");
  if (!existsSync(dataPath)) issues.push("data/install.yaml: missing shared install source");
  else issues.push(...auditInstallData(readFileSync(dataPath, "utf8")));

  const blogDir = path.join(repoRoot, "content", "blog") + path.sep;
  for (const file of contentFiles) {
    const source = readFileSync(file, "utf8");
    const label = path.relative(repoRoot, file);
    if (file.startsWith(blogDir)) {
      const article = body(source);
      if (commandMatches(article).some(match => match.label === "unsupported go install") && !article.trimStart().startsWith(installationCorrection)) {
        issues.push(`${label}: historical Go-module command needs the installation correction before the unchanged original body`);
      }
      continue;
    }
    const match = commandMatches(body(source))[0];
    if (match) issues.push(`${label}: hand-written ${match.label} command; use the shared install shortcode`);
    for (const match of commandMatches(frontMatter(source))) {
      if (match.label !== "Homebrew install") issues.push(`${label}: frontmatter contains ${match.label}; link to /install/ for current source-build guidance`);
    }
  }

  for (const file of templateFiles) {
    if (file.includes(`${path.sep}partials${path.sep}install${path.sep}`) || file.includes(`${path.sep}shortcodes${path.sep}install-`)) continue;
    const match = commandMatches(readFileSync(file, "utf8"))[0];
    if (match) issues.push(`${path.relative(repoRoot, file)}: hand-written ${match.label} command in a template; use the shared install partial`);
  }

  for (const file of ["static/llms.txt", "static/llms-full.txt"]) {
    const fullPath = path.join(repoRoot, file);
    if (!existsSync(fullPath)) continue;
    const source = readFileSync(fullPath, "utf8");
    if (file.endsWith("llms-full.txt") && !source.includes(sourceBuildTemplate.replace("VERSION", version || ""))) {
      issues.push(`${file}: missing current pinned source-build instructions`);
    }
    for (const issue of auditRawInstallSource(source, version)) issues.push(`${file}: ${issue}`);
  }
  return issues;
}
