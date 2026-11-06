import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { parse as parseHTML } from "parse5";
import * as commonmark from "commonmark";
import { canonical, sha256 } from "./evidence.mjs";
import { assertIndex } from "./records.mjs";

const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
function elements(node) { return [node, ...(node.childNodes || []).flatMap(elements)]; }
function attribute(node, key) { return node.attrs?.find(attr => attr.name === key)?.value; }
export function htmlFacts(source) {
  const facts = new Map();
  for (const node of elements(parseHTML(source))) {
    const key = attribute(node, "data-hub-fact");
    if (key !== undefined) { if (facts.has(key)) throw new Error("duplicate displayed fact"); facts.set(key, text(node)); }
  }
  return Object.fromEntries(facts);
}
export function markdownFacts(source) {
  const facts = new Map(), walker = new commonmark.Parser().parse(source).walker(); let event;
  while ((event = walker.next())) if (event.entering && event.node.type === "code_block") {
    let item; try { item = JSON.parse(event.node.literal); } catch { continue; }
    if (item?.hub_fact !== undefined) {
      if (typeof item.hub_fact !== "string" || typeof item.value !== "string" || facts.has(item.hub_fact)) throw new Error("invalid mirror fact");
      facts.set(item.hub_fact, item.value);
    }
  }
  return Object.fromEntries(facts);
}
export function representationPaths(entry) {
  return entry.representations.map(representation => ({ representation, route: representation === "html" ? `${entry.route}index.html` : representation === "mirror" ? `${entry.route}index.md` : entry.route }));
}
function files(directory, prefix = "") {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name), relative = prefix + entry.name;
    if (lstatSync(file).isSymbolicLink()) throw new Error("published symlink refused");
    return entry.isDirectory() ? files(file, relative + "/") : ["/" + relative];
  });
}
export function assertPublication({ directory, manifest, records, open, requireBuild = true }) {
  const all = files(directory), expected = new Set(), listingIds = [], mirrorIds = [];
  for (const entry of manifest.entries) {
    for (const { representation, route } of representationPaths(entry)) {
      const file = path.join(directory, route.slice(1));
      if (!open && entry.ownership === "hub") {
        if (existsSync(file)) throw new Error("closed hub output present");
        continue;
      }
      if (!requireBuild && entry.kind === "build") continue;
      expected.add(route);
      if (!existsSync(file)) throw new Error("manifest output missing");
      const bytes = readFileSync(file);
      if (entry.sha256 && sha256(bytes) !== entry.sha256) throw new Error("published artifact digest differs");
      if (["html", "mirror"].includes(representation)) {
        const actual = representation === "html" ? htmlFacts(bytes.toString()) : markdownFacts(bytes.toString());
        if (canonical(actual) !== canonical(entry.facts)) throw new Error(`displayed facts differ: ${entry.kind}/${representation} (${Object.keys(actual).length}/${Object.keys(entry.facts).length}; ${Object.keys(entry.facts).find(key => actual[key] !== entry.facts[key])})`);
        if (entry.kind === "listing") {
          if (representation === "html") {
            const ids = elements(parseHTML(bytes.toString())).map(node => attribute(node, "data-hub-id")).filter(id => id !== undefined);
            if (canonical(ids) !== canonical([entry.listing_id])) throw new Error("listing page identity differs");
            listingIds.push(...ids);
          } else {
            const ids = [...bytes.toString().matchAll(/^ID: ([a-z0-9-]+)$/gm)].map(match => match[1]);
            if (canonical(ids) !== canonical([entry.listing_id])) throw new Error("listing mirror identity differs");
            mirrorIds.push(...ids);
          }
        }
      }
      if (entry.kind === "index") assertIndex(JSON.parse(bytes), records);
    }
  }
  // Includes the schema outside /hub/ and raw downloads; no orphan files.
  for (const route of all.filter(route => route.startsWith("/hub/") || route.startsWith("/schemas/pipelab-hub/"))) if (!expected.has(route)) throw new Error(open ? "unmanifested hub output" : "closed hub output present");
  if (open) {
    const expectedIds = records.map(record => record.listing.id).sort();
    if (canonical(listingIds.sort()) !== canonical(expectedIds) || canonical(mirrorIds.sort()) !== canonical(expectedIds)) throw new Error("listing output bijection differs");
  }
}
