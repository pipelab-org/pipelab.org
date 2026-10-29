import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import test from "node:test";
import { checkMappingRows, checkProofFrameworkLinks, checkDocumentedMappingSources } from "../scripts/compliance-claims.mjs";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/assess-compliance-v3.7.1.json", import.meta.url)));
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const routes = snapshot.frameworks.map(({ page }) => page.replace(/^content/, "").replace(/\.md$/, "/"));

for (const framework of snapshot.frameworks) {
  test(`${framework.page} uses shipped control IDs and statuses`, () => {
    assert.match(framework.source_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(checkMappingRows(source(framework.page), framework), []);
    assert.ok(source(framework.page).includes(`/blob/${snapshot.source_ref}/${framework.source_path}`));
  });
}

test("mapping checks reject invented IDs, overstated status, omitted and duplicated rows", () => {
  const framework = { controls: [{ id: "ASI10", status: "Not covered" }] };
  const table = "| ID | Status |\n|---|---|\n| ASI10 | Not covered |";
  assert.deepEqual(checkMappingRows(table, framework), []);
  for (const invalid of [table.replaceAll("ASI10", "ASI11"), table.replace("Not covered", "Covered"), table.split("\n").slice(0, 2).join("\n"), `${table}\n| ASI10 | Not covered |`]) {
    assert.ok(checkMappingRows(invalid, framework).length > 0, invalid);
  }
});

test("proof chips link to each existing shipped framework guide", () => {
  const proof = source("themes/pipelab/layouts/proof/single.html");
  assert.deepEqual(checkProofFrameworkLinks(proof, routes), []);
  for (const { page } of snapshot.frameworks) assert.ok(existsSync(new URL(`../${page}`, import.meta.url)), page);
});

test("proof chip checks reject missing links and wrong destinations", () => {
  const chip = '<a class="proof-chip" role="listitem" href="/learn/mitre-atlas/">MITRE ATLAS</a>';
  assert.deepEqual(checkProofFrameworkLinks(chip, ["/learn/mitre-atlas/"]), []);
  for (const invalid of [chip.replace('href="/learn/mitre-atlas/"', 'href="/learn/missing/"'), '<span class="proof-chip" role="listitem">MITRE ATLAS</span>']) {
    assert.ok(checkProofFrameworkLinks(invalid, ["/learn/mitre-atlas/"]).length > 0);
  }
});

// Sources: v3.7.1 docs/owasp-llm-top10-mapping.md (LLM01-10),
// docs/owasp-agentic-top15-mapping.md (T1-T15), and
// docs/compliance/nist-800-53.md. These are documentation mappings,
// not additional entries in the Assess fixture's framework catalog.
const llmDoc = "docs/owasp-llm-top10-mapping.md";
const threatsDoc = "docs/owasp-agentic-top15-mapping.md";
const nistDoc = "docs/compliance/nist-800-53.md";
const documentationClaims = [
  ["content/learn/owasp-llm-top10.md", [llmDoc]],
  ["content/learn/owasp-agentic-threats.md", [threatsDoc]],
  ["content/learn/owasp-aivss-coverage.md", ["docs/owasp-mapping.md", threatsDoc]],
  ["content/learn/owasp-agentic-top10.md", ["docs/owasp-mapping.md"]],
  ["content/learn/hipaa-security-rule.md", ["docs/compliance/assess-mapping.md"]],
  ["content/learn/ai-agent-compliance.md", [llmDoc, threatsDoc, nistDoc]],
  ["content/learn/compliance-evidence.md", [nistDoc]],
  ["content/learn/ai-agent-regulatory-controls.md", [llmDoc, threatsDoc]],
  ...["pipelock-vs-runlayer", "pipelock-vs-prisma-airs", "pipelock-vs-microsoft-agent-governance-toolkit", "pipelock-vs-lakera-guard", "agent-firewall-vs-ai-security-platform"]
    .map(page => [`content/compare/${page}.md`, [llmDoc, threatsDoc, nistDoc]]),
  ["static/llms-full.txt", [llmDoc, threatsDoc, nistDoc]],
  ["themes/pipelab/layouts/enterprise/single.html", [llmDoc, threatsDoc, nistDoc]],
];

for (const [page, documents] of documentationClaims) {
  test(`${page} separates documentation mappings from Assess and links release sources`, () => {
    assert.deepEqual(checkDocumentedMappingSources(source(page), documents), []);
    assert.doesNotMatch(source(page), /OWASP Agentic Top 15/);
  });
}

test("documentation tables retain the published ratings, shipped status and gaps", () => {
  // Values transcribed from the v3.7.1 source tables named above.
  const tables = [
    ["owasp-llm-top10", "LLM", [
      ["Strong", "Shipped"], ["Strong", "Shipped"], ["Partial", "Shipped"], ["N/A", "Out of scope"],
      ["Moderate", "Shipped"], ["Strong", "Shipped"], ["Moderate", "Shipped"], ["N/A", "Out of scope"],
      ["N/A", "Out of scope"], ["Partial", "Shipped"],
    ]],
    ["owasp-agentic-threats", "T", [
      ["Strong", "Shipped"], ["Strong", "Shipped"], ["Strong", "Shipped"], ["Partial", "Shipped"],
      ["Out of scope", "Out of scope"], ["Moderate", "Shipped"], ["Strong", "Shipped"], ["Strong", "Shipped"],
      ["Partial", "Shipped"], ["Recognized gap", "Roadmap"], ["Moderate", "Shipped"], ["Strong", "Shipped"],
      ["Strong", "Shipped"], ["Partial", "Shipped"], ["Out of scope", "Out of scope"],
    ]],
  ];
  for (const [page, prefix, ratings] of tables) {
    const rows = source(`content/learn/${page}.md`).split("\n")
      .filter(line => new RegExp(`^\\| ${prefix}\\d+ \\|`).test(line))
      .map(line => line.split("|").map(cell => cell.trim()))
      .map(cells => [cells[1], cells[3], cells[4]]);
    const expected = ratings.map(([rating, status], i) => [
      `${prefix}${prefix === "LLM" ? String(i + 1).padStart(2, "0") : i + 1}`, rating, status,
    ]);
    assert.deepEqual(rows, expected, page);
  }
});

test("documentation source checks reject missing labels, unlinked sources and wrong document or release", () => {
  const url = `https://github.com/pipelab-org/pipelock/blob/v3.7.1/${llmDoc}`;
  const claim = `Published documentation mapping: [LLM Top 10](${url}). Separate from Assess.`;
  assert.deepEqual(checkDocumentedMappingSources(claim, [llmDoc]), []);
  assert.deepEqual(checkDocumentedMappingSources(claim.replace(`[LLM Top 10](${url})`, `<a href="${url}#summary">LLM Top 10</a>`), [llmDoc]), []);
  for (const invalid of [
    claim.replace("Published documentation mapping", "Framework coverage"),
    claim.replace("Assess", "reports"),
    claim.replace(`[LLM Top 10](${url})`, url),
    claim.replace("v3.7.1", "main"),
    claim.replace(llmDoc, "docs/owasp-mapping.md"),
  ]) assert.ok(checkDocumentedMappingSources(invalid, [llmDoc]).length > 0, invalid);
});

// Framework names from the v3.7.1 Assess catalog (internal/report/compliance/coverage.go
// and each framework's Name field). Every copy of the "Assess report" list must name all
// of them, or a comparison row reads as a capability gap the product does not have.
const assessCatalog = ["OWASP MCP Top 10", "OWASP Agentic Top 10", "MITRE ATLAS", "EU AI Act", "NIST AI RMF", "HIPAA Security Rule", "SOC 2"];
const compareTables = ["pipelock-vs-runlayer", "pipelock-vs-prisma-airs", "pipelock-vs-microsoft-agent-governance-toolkit", "pipelock-vs-lakera-guard"];

test("every copy of the Assess report list names the whole shipped catalog", () => {
  const copies = compareTables.map(page => {
    const text = source(`content/compare/${page}.md`);
    const cell = text.match(/Assess report: (.*?); published documentation mappings/);
    assert.ok(cell, `${page}: Assess report cell not found`);
    return [page, cell[1]];
  });
  const llms = source("static/llms-full.txt").match(/Pipelock Assess v3\.7\.1 report mappings cover ([^.]*)\./);
  assert.ok(llms, "llms-full.txt: Assess report sentence not found");
  copies.push(["llms-full.txt", llms[1]]);
  const pills = source("themes/pipelab/layouts/enterprise/single.html").match(/Assess report mappings \(v3\.7\.1\)([\s\S]*?)Published documentation mappings/);
  assert.ok(pills, "enterprise: Assess pill block not found");
  copies.push(["enterprise", pills[1]]);
  for (const [where, list] of copies) {
    for (const name of assessCatalog) assert.ok(list.includes(name), `${where}: Assess list omits ${name}`);
  }
});

test("Runlayer's advertised badges stay under a Compliance row, not a mappings row", () => {
  // Its cited sources describe SOC 2, HIPAA and GDPR badges, which are attestations.
  const row = source("content/compare/pipelock-vs-runlayer.md").split("\n").find(line => line.includes("SOC 2, HIPAA, GDPR advertised"));
  assert.ok(row, "Runlayer compliance row not found");
  assert.match(row, /^\| \*\*Compliance\*\* \|/);
});

test("links to the AIVSS guide do not call it coverage", () => {
  const files = readdirSync(new URL("../content/", import.meta.url), { recursive: true }).filter(file => file.endsWith(".md"));
  for (const file of files) {
    for (const [, text] of source(`content/${file}`).matchAll(/\[([^\]]+)\]\(\/learn\/owasp-aivss-coverage\/\)/g)) {
      assert.doesNotMatch(text, /coverage/i, `content/${file}: AIVSS link text "${text}"`);
    }
  }
});
