import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// Published contract: the v3.7.0 release README's source-build instructions.
// data/install.yaml substitutes VERSION; raw machine-readable files do not.
export const sourceBuildTemplate = "git clone --branch vVERSION --depth 1 https://github.com/pipelab-org/pipelock.git\nmake -C pipelock install";
export const brewInstallCommand = "brew install luckyPipewrench/tap/pipelock";
const dockerTemplate = "docker pull ghcr.io/luckypipewrench/pipelock:VERSION";
export const installationCorrection = "> Installation correction (2026-10-16): The `go install` command below doesn't install current Pipelock releases. Use the [current installation guide](/install/) for a release binary or a source build pinned to the release tag. The original post follows unchanged.";

// Install-bearing articles published at 0e166a9c keep their frozen bodies.
// Eight receive the additive correction; the others retain Homebrew commands.
// New posts use shared installation data; this body exception is exact.
const historicalInstallPosts = new Set([
  "claude-mythos-agent-security.md", "cross-request-exfiltration.md",
  "dns-exfil-ai-agent.md", "every-protocol-your-agent-speaks-scanned.md",
  "first-ai-agent-espionage-campaign.md", "openclaw-cve-2026-25253.md",
  "secrets-in-post-bodies.md", "tool-poisoning-mcp-attack-surface.md",
  "what-happens-when-your-agent-makes-http-request.md",
  "why-ai-guardrails-arent-enough.md", "your-agent-just-leaked-your-aws-keys.md",
  "leaky-clawhub-skills.md", "pipelock-v260-release.md",
  "pipelock-v300-release.md", "pipelock-v310-release.md",
  "pipelock-v330-release.md", "pipelock-v340-release.md",
  "securing-claude-code-with-pipelock.md", "what-is-an-agent-firewall.md",
]);

// The Go-module command is covered by the correction check in the audit below.
const historicalBodyCommands = new Set(["unsupported go install", "Homebrew install"]);

// CommonMark 0.31.2 section 2.1 permits LF, CRLF and CR line endings.
const normalizeLineEndings = source => source.replace(/\r\n?/g, "\n");
const readSource = file => normalizeLineEndings(readFileSync(file, "utf8"));

const commandPatterns = [
  { label: "unsupported go install", pattern: /\bgo\s+install\s+(?:\\\s*)?github\.com\/(?:luckypipewrench|pipelab-org)\/pipelock(?:\/cmd\/pipelock)?(?:@[^\s`"'<)]+)?/gi },
  { label: "source clone", pattern: /\bgit\s+clone\b[^\n`]*?github\.com\/(?:luckypipewrench|pipelab-org)\/pipelock[^\s`"\'<>);&|]*/gi },
  { label: "source build", pattern: /\bmake\s+(?:-C\s+pipelock\s+)?install\b/gi },
  { label: "Homebrew install", pattern: /\bbrew\s+install\s+(?:\\\s*)?luckypipewrench\/tap\/pipelock\b/gi },
];

function commandMatches(source, markdown = false) {
  // Markdown pairs commands within one fenced block or plain paragraph, not an
  // article. Front matter and templates are not Markdown, so they pair as a whole.
  return (markdown ? sections(source, true) : [source]).flatMap(example => {
    const matches = commandPatterns.flatMap(({ label, pattern }) => {
      pattern.lastIndex = 0;
      return [...example.matchAll(pattern)].map(match => {
        const line = example.slice(match.index).match(/^[^\n`]*/)[0].trimEnd();
        return { label, text: label === "source clone" ? line : match[0], index: match.index, line };
      });
    });
    const hasClone = matches.some(match => match.label === "source clone");
    const hasInstall = matches.some(match => match.label === "source build");
    return matches.filter(match => {
      // A pinned tag may follow the URL, so inspect the complete command line.
      if (match.label === "source clone") return /--branch\s+v/.test(match.line) || hasInstall;
      if (match.label === "source build") return hasClone || /-C\s+pipelock\b/.test(match.text);
      return true;
    }).sort((a, b) => a.index - b.index);
  });
}

// CommonMark 0.31.2 section 4.6, types 6 and 7: block names from the condition-6
// list, or any other complete tag alone on its line. Both end at a blank line.
const htmlBlockNames = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
const rawTextTags = "(?!(?:script|style|pre|textarea)(?![A-Za-z0-9-]))";
const tagName = "[A-Za-z][A-Za-z0-9-]*";
const tagAttribute = "[ \\t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \\t]*=[ \\t]*(?:[^ \\t\"'=<>`]+|'[^']*'|\"[^\"]*\"))?";
const htmlBlockSix = new RegExp(`^ {0,3}</?(?:${htmlBlockNames})(?:[ \\t]|/?>|$)`, "i");
const htmlBlockSeven = new RegExp(`^ {0,3}(?:<${rawTextTags}${tagName}(?:${tagAttribute})*[ \\t]*/?>|</${rawTextTags}${tagName}[ \\t]*>)[ \\t]*$`, "i");
// Type 1 opens before a space, tab, ">" or the end of the line; "/>" is the one
// extra form Hugo's renderer accepts everywhere. A bare "/" does not open a block.
const htmlBlockOne = /^ {0,3}<(?:script|pre|style|textarea)(?:[ \t>]|\/>|$)/i;
// Hugo renders content with goldmark, which opens raw HTML blocks on a few shapes
// the specification does not: a form feed after a type 1 name, "meta" and spaces
// after "</" for type 6, and a closing tag ending "/>" or naming textarea for type 7.
// Only example pairing follows it: there a missed block splits a real install, while
// the outer raw pass has no renderer and keeps the specification so a heading stays a heading.
const rendererBlockOne = /^ {0,3}<(?:script|pre|style|textarea)\f/i;
const rendererBlockSix = new RegExp(`^ {0,3}<(?:/ *)?(?:${htmlBlockNames}|meta)(?: |/?>|$)`, "i");
// Spaces after "</" also make goldmark treat the closing tag as an opening tag with attributes.
const notRenderedRaw = "(?!(?:script|style|pre)(?![A-Za-z0-9-]))";
const rendererBlockSeven = new RegExp(`^ {0,3}(?:</ *${notRenderedRaw}${tagName} */?>|</ +${notRenderedRaw}${tagName}(?:${tagAttribute})+ */?>)[ \\t]*$`, "i");
// Section 4.1: three or more matching -, * or _ characters, spaces and tabs allowed between.
const thematicBreak = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;

function frontMatter(source) {
  return source.match(/^---\n([\s\S]*?)\n---\n?/)?.[1] || "";
}

function body(source) {
  return source.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

// H3 method headings share the same Installation section. Ignore shell comments
// inside fences so an earlier unrelated source mention cannot mask a bad order.
function sections(source, examples = false) {
  const result = [];
  let current = "";
  let fence = null;
  let htmlEnd = null;
  // Callers pass text whose front matter is already removed. Stripping again
  // would drop a leading thematic-break pair and every command between them.
  const lines = source.split("\n");
  // Section 2.2: a tab advances to the next multiple of four, so up to three
  // spaces before a tab are still four columns of indentation.
  const indented = line => /^(?: {4}| {0,3}\t)/.test(line);
  // Section 2.1: only spaces and tabs make a line blank; other Unicode
  // whitespace (NBSP, form feed, U+3000) is ordinary paragraph text.
  const blank = line => /^[ \t]*$/.test(line);
  let htmlBlock = false;
  let previous = "";
  let closed = true;
  for (const [index, line] of lines.entries()) {
    // A blank line, heading, thematic break, closing fence or HTML block end cannot
    // leave a paragraph open, and neither can an indented code line that began no
    // paragraph. A "=" run after a closed block is paragraph text, not an underline,
    // and so is "--"; a single "-" is an empty list item.
    const followsBlock = closed;
    closed = blank(line) || /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line) || thematicBreak.test(line)
      || (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) && (!followsBlock || /^ {0,3}-[ \t]*$/.test(line)))
      || (followsBlock && indented(line));
    // Section 4.6 types 1-5 end at a marker, not a blank line. Types 6 and 7
    // end at a blank line, and inside them headings and fences are raw text.
    if (htmlBlock && blank(line)) htmlBlock = false;
    if (!fence && !htmlEnd && !htmlBlock) {
      htmlEnd = htmlBlockOne.test(line) || (examples && rendererBlockOne.test(line)) ? /<\/(?:script|pre|style|textarea)>/i
        : /^ {0,3}<!--/.test(line) ? /-->/
          : /^ {0,3}<\?/.test(line) ? /\?>/
            : /^ {0,3}<![A-Za-z]/.test(line) ? />/
              : /^ {0,3}<!\[CDATA\[/.test(line) ? /\]\]>/ : null;
      // Type 7 cannot interrupt a paragraph, so it only starts where none can be open.
      htmlBlock = !htmlEnd && (htmlBlockSix.test(line) || (followsBlock && htmlBlockSeven.test(line))
        || (examples && (rendererBlockSix.test(line) || (followsBlock && rendererBlockSeven.test(line)))));
      if ((htmlEnd || htmlBlock) && examples) { result.push(current); current = ""; }
    }
    if (htmlEnd) {
      current += `${line}\n`;
      if (htmlEnd.test(line)) {
        htmlEnd = null;
        closed = true;
        if (examples) { result.push(current); current = ""; }
      }
      continue;
    }
    if (htmlBlock) {
      // A rendered h1 or h2 still opens a new section whatever its indentation.
      if (/^\s*<h[12]\b/i.test(line)) { result.push(current); current = ""; }
      current += `${line}\n`;
      previous = line;
      continue;
    }
    // CommonMark 0.31.2 section 4.5 (fenced code blocks).
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
        if (examples) { result.push(current); current = ""; }
        fence = { character: marker[1][0], length: marker[1].length };
      } else if (fence && marker[1][0] === fence.character
        && marker[1].length >= fence.length && blank(marker[2])) {
        fence = null;
        closed = true;
        if (examples) { result.push(current); current = ""; continue; }
      }
    }
    if (examples && !fence && thematicBreak.test(line)) {
      // Section 4.1: a thematic break separates rendered article examples.
      result.push(current);
      current = "";
    } else if (examples && !fence && blank(line)) {
      // Section 4.4: an indented code chunk continues across blank lines.
      const next = lines.slice(index + 1).find(candidate => /\S/.test(candidate));
      if (!(indented(previous) && next !== undefined && indented(next))) {
        result.push(current);
        current = "";
      }
    } else if (/\S/.test(line)) {
      previous = line;
    }
    // Section 4.2: the # sequence may be followed by the end of the line.
    if (!fence && /^ {0,3}#{1,2}(?:[ \t]|$)/.test(line)) {
      result.push(current);
      current = "";
    }
    current += `${line}\n`;
    // Section 4.3: an underline ends the heading it belongs to. Keeping it in that
    // section stops the next one from starting at an orphan "=" run, which the
    // inner pass would read as paragraph text and so lose the closed block.
    if (!fence && !followsBlock && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) {
      result.push(current);
      current = "";
    }
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
  source = normalizeLineEndings(source);
  const issues = [];
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version || "")) return ["missing or invalid configured release version"];
  const expected = sourceBuildTemplate.replace("VERSION", version);
  if (commandMatches(source).some(match => match.label === "unsupported go install")) issues.push("unsupported Go-module installation command");
  for (const section of sections(source)) {
    const matches = commandMatches(section, true);
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
  else issues.push(...auditInstallData(readSource(dataPath)));

  const blogDir = path.join(repoRoot, "content", "blog") + path.sep;
  for (const file of contentFiles) {
    const source = readSource(file);
    const label = path.relative(repoRoot, file);
    const historicalBody = file.startsWith(blogDir) && historicalInstallPosts.has(path.relative(blogDir, file));
    if (historicalBody) {
      const article = body(source);
      if (commandMatches(article).some(match => match.label === "unsupported go install") && !article.trimStart().startsWith(installationCorrection)) {
        issues.push(`${label}: historical Go-module command needs the installation correction before the unchanged original body`);
      }
    }
    // A frozen body may keep only the commands it was published with.
    const match = commandMatches(body(source), true).find(match => !historicalBody || !historicalBodyCommands.has(match.label));
    if (match) issues.push(`${label}: hand-written ${match.label} command; use the shared install shortcode`);
    for (const match of commandMatches(frontMatter(source))) {
      if (match.label !== "Homebrew install") issues.push(`${label}: frontmatter contains ${match.label}; link to /install/ for current source-build guidance`);
    }
  }

  for (const file of templateFiles) {
    if (file.includes(`${path.sep}partials${path.sep}install${path.sep}`) || file.includes(`${path.sep}shortcodes${path.sep}install-`)) continue;
    const match = commandMatches(readSource(file))[0];
    if (match) issues.push(`${path.relative(repoRoot, file)}: hand-written ${match.label} command in a template; use the shared install partial`);
  }

  for (const file of ["static/llms.txt", "static/llms-full.txt"]) {
    const fullPath = path.join(repoRoot, file);
    if (!existsSync(fullPath)) continue;
    const source = readSource(fullPath);
    if (file.endsWith("llms-full.txt") && !source.includes(sourceBuildTemplate.replace("VERSION", version || ""))) {
      issues.push(`${file}: missing current pinned source-build instructions`);
    }
    for (const issue of auditRawInstallSource(source, version)) issues.push(`${file}: ${issue}`);
  }
  return issues;
}
