import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

// Current count claims use stats.response_patterns. Published articles and the
// explicitly versioned upgrade guide retain their historical release figures.
// These signatures cover the count phrasings used by the site's current copy,
// including the compact "34 injection" and "injection (34 patterns)" forms.
const countClaim = /\b\d+\s+(?:(?:built[- ]in|default)\s+)?(?:prompt[- ]injection|response[- ]scanning|response\s+scanning|injection|response)(?:\s+detection|\s+and\s+response)?\s+patterns?\b|\b\d+\s+injection\s*(?:\+|[|,)])|\b(?:prompt[- ]injection|response[- ]scanning|response\s+scanning|injection|response)\s*[:(]\s*\d+\s+patterns?\b|\b(?:prompt[- ]injection|response[- ]scanning|response\s+scanning|injection|response)\s+patterns[ \t]*:?[ \t]*\d+\b/gi;
// Markdown table rows carry the label in the first cell and the bare count in
// a later one ("| Prompt injection detection | ... | Yes (34 patterns) |").
const tableCountClaim = /^\|[^|\n]*(?:prompt[- ]injection|response[- ]scanning|response\s+scanning|injection|response)[^|\n]*\|[^\n]*?\b\d+\s+(?:(?:built[- ]in|default)\s+)?patterns?\b/gim;

export function responsePatternClaims(file, source) {
  if (file.startsWith("content/blog/") || file === "content/learn/pipelock-v250-upgrade.md") return [];
  // Preserve newlines for diagnostics while reading across inline markup,
  // wrapped paragraphs, and separate number/label elements in stat cards.
  const prose = source.replace(/<[^>]*>/g, (tag) => tag.replace(/[^\n]/g, " ")).replace(/\*\*|__/g, "");
  const lineOf = (match) => prose.slice(0, match.index).split("\n").length;
  const lines = [...prose.matchAll(countClaim)].map(lineOf);
  const proseLines = new Set(lines);
  for (const match of prose.matchAll(tableCountClaim)) {
    if (!proseLines.has(lineOf(match))) lines.push(lineOf(match));
  }
  return lines.map((line) =>
    `${file}:${line}: literal response/injection count; render stats.response_patterns (or omit the count in frontmatter/static copy)`);
}

export function auditResponsePatternCounts(root) {
  const findings = [];
  const stats = parse(readFileSync(path.join(root, "data/stats.yaml"), "utf8"));
  if (!Number.isSafeInteger(stats.response_patterns) || stats.response_patterns <= 0 ||
      !/^v\d+\.\d+\.\d+$/.test(stats.response_patterns_source_tag ?? "") ||
      !/^[a-f0-9]{40}$/.test(stats.response_patterns_source_commit ?? "") ||
      stats.response_patterns_source_path !== "internal/config/defaults.go") {
    findings.push("data/stats.yaml: response-pattern count requires a positive integer and tagged source provenance");
  }
  function visit(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.(md|html|json|yaml|yml|txt)$/.test(file) && file !== "data/stats.yaml") {
        findings.push(...responsePatternClaims(file, readFileSync(path.join(root, file), "utf8")));
      }
    }
  }
  for (const directory of ["content", "data", "themes/pipelab/layouts"]) visit(directory);
  for (const file of ["static/llms.txt", "static/llms-full.txt"]) {
    findings.push(...responsePatternClaims(file, readFileSync(path.join(root, file), "utf8")));
  }
  return findings;
}
