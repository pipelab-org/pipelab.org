#!/usr/bin/env node
// Regenerates data/schema-org-properties.json from the published schema.org
// vocabulary.
//
// The table is DERIVED, never hand-written. A hand-written list of "properties
// that look right on this type" is a guess, and the bug this check exists to
// catch was exactly that: codeRepository shipped on SoftwareApplication for
// months because it reads like a software property. schema.org scopes it to
// SoftwareSourceCode, and only the vocabulary says so.
//
// Network is required, so this runs on demand rather than in CI. CI reads the
// committed table.
//
//   node scripts/generate-schema-property-table.mjs
//
// Add a type to EMITTED_TYPES when a template starts emitting it; the audit
// reports any emitted type missing from the table rather than skipping it.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const VOCAB_URL = "https://schema.org/version/latest/schemaorg-current-https.jsonld";
const OUT = path.join(process.cwd(), "data", "schema-org-properties.json");

const EMITTED_TYPES = [
  "AboutPage", "Answer", "BlogPosting", "BreadcrumbList", "ContactPage",
  "ContactPoint", "DefinedTerm", "DefinedTermSet", "FAQPage", "HowTo",
  "HowToStep", "ImageObject", "ListItem", "Offer", "Organization", "Person",
  "Question", "SoftwareApplication", "TechArticle", "WebSite",
];

const response = await fetch(VOCAB_URL);
if (!response.ok) {
  console.error(`schema.org vocabulary fetch failed: ${response.status}`);
  process.exit(1);
}
const body = await response.text();
const digest = createHash("sha256").update(body).digest("hex");
const graph = JSON.parse(body)["@graph"];

const localName = (value) => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((entry) => (typeof entry === "string" ? entry : entry?.["@id"]))
    .filter((id) => typeof id === "string")
    .map((id) => id.split(":").pop());
};

const supertypes = new Map();
const ownProperties = new Map();

for (const node of graph) {
  const nodeTypes = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  const name = (node["@id"] ?? "").split(":").pop();

  if (nodeTypes.includes("rdfs:Class")) {
    // A class name appears in the graph more than once, and only some of those
    // entries carry rdfs:subClassOf. Overwriting on each occurrence lets a later
    // entry with no parent erase a real one: that silently dropped every
    // Thing-level property from Offer, because Offer resolves through Intangible
    // and its last occurrence had no subClassOf. Merge across occurrences.
    if (!supertypes.has(name)) supertypes.set(name, new Set());
    for (const parent of localName(node["rdfs:subClassOf"])) {
      supertypes.get(name).add(parent);
    }
  }
  if (nodeTypes.includes("rdf:Property")) {
    for (const domain of localName(node["schema:domainIncludes"])) {
      if (!ownProperties.has(domain)) ownProperties.set(domain, new Set());
      ownProperties.get(domain).add(name);
    }
  }
}

// A type may use its own properties and every property of its supertypes.
function resolve(type, seen = new Set()) {
  if (seen.has(type)) return new Set();
  seen.add(type);
  const out = new Set(ownProperties.get(type) ?? []);
  for (const parent of supertypes.get(type) ?? []) {
    for (const prop of resolve(parent, seen)) out.add(prop);
  }
  return out;
}

// Record only the properties the site actually emits, intersected with what
// schema.org permits for the type. The full permitted set runs to thousands of
// vocabulary terms the site will never use, including Person relationship
// properties, and vendoring all of them puts a pile of unrelated words in a
// public repository for no benefit.
//
// This still fails closed. The audit reports any emitted property missing from
// the table, so a newly-emitted property is flagged as unverified rather than
// silently accepted; the fix is to rerun this generator, which re-derives
// validity from the vocabulary.
const emitted = emittedPropertiesFromBuild();

const types = {};
const rejected = [];
for (const type of EMITTED_TYPES) {
  const permitted = resolve(type);
  if (permitted.size === 0) {
    console.error(`no properties resolved for ${type}; is the name spelled as schema.org spells it?`);
    process.exit(1);
  }
  const used = emitted.get(type) ?? new Set();
  for (const property of used) {
    if (!permitted.has(property)) rejected.push(`${type}.${property}`);
  }
  types[type] = [...used].filter((property) => permitted.has(property)).sort();
}

if (rejected.length > 0) {
  console.error("the built site emits properties schema.org does not define for their type:");
  for (const entry of rejected) console.error(`  ${entry}`);
  console.error("fix the template, rebuild, and rerun. The table records valid properties only.");
  process.exit(1);
}

// Read what the current build emits, so the table describes this site rather
// than the whole vocabulary.
function emittedPropertiesFromBuild() {
  const publicDir = path.join(process.cwd(), "public");
  if (!existsSync(publicDir)) {
    console.error("public/ does not exist. Run `hugo --gc --minify` first.");
    process.exit(1);
  }
  const found = new Map();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const type = node["@type"];
    if (typeof type === "string") {
      if (!found.has(type)) found.set(type, new Set());
      for (const key of Object.keys(node)) {
        if (!key.startsWith("@")) found.get(type).add(key);
      }
    }
    for (const value of Object.values(node)) visit(value);
  };
  for (const file of walkHtml(publicDir)) {
    const html = readFileSync(file, "utf8");
    for (const [, block] of html.matchAll(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      try {
        visit(JSON.parse(block));
      } catch {
        // The audit reports unparseable JSON-LD; ignore it here.
      }
    }
  }
  return found;
}

function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _source: VOCAB_URL,
      _source_sha256: digest,
      _retrieved: new Date().toISOString().slice(0, 10),
      _generated_by: "scripts/generate-schema-property-table.mjs",
      _note:
        "Properties this site emits, each confirmed against the published schema.org vocabulary as valid for its type. Do not edit by hand; rebuild the site and rerun the generator.",
      types,
    },
    null,
    2,
  )}\n`,
);

console.log(`wrote ${OUT}`);
console.log(`  source sha256 ${digest.slice(0, 16)}`);
for (const type of EMITTED_TYPES) {
  console.log(`  ${type}: ${types[type].length} properties`);
}
