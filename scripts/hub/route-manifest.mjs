import { readFileSync } from "node:fs";
import { listingRoute } from "./records.mjs";
import { sha256, canonical } from "./evidence.mjs";
const rules = JSON.parse(readFileSync(new URL("./routes.json", import.meta.url)));

// Expected outputs come from source records, not a walk of generated pages.
// Official registry files are independently published and remain public closed.
export function routeManifest({ records, publishers = [], core = [], removed = [], baseline = [], policies = rules.policies, schemaBytes }) {
  const entries = [], refs = [];
  const active = new Set(records.map(record => record.listing.id));
  if (active.size !== records.length) throw new Error("duplicate active listing");
  const tombstones = new Set(removed.map(record => record.id));
  if (removed.some(record => active.has(record.id))) throw new Error("active tombstone");
  const add = entry => entries.push({ indexable: true, facts: {}, ...entry });
  const page = (route, kind, facts = {}, extra = {}) => add({ route, kind, ownership: "hub", representations: ["html", "mirror"], facts, ...extra });
  const reference = (route, kind, title, facts) => {
    page(route, kind, facts);
    refs.push({ path: route.slice("/hub/".length), title, description: `Pipelock ${kind} reference. Read the exact rule identifiers, published evidence, setup details, and documented limits for this hub reference.`, facts, display_facts: Object.entries(facts).map(([key, value]) => ({ key, value })), reference_kind: kind });
  };
  for (const record of records) {
    const listing = record.listing, route = listingRoute(record);
    page(route, "listing", record.facts, { listing_id: listing.id });
    if (listing.type === "bundle") {
      const base = record.badge === "official" ? `/rules/${listing.bundle_name}/` : route;
      for (const [suffix, digest] of [["bundle.yaml", record.bundle_sha256], ["bundle.yaml.sig", record.signature_sha256]]) {
        if (!digest) throw new Error("served pair digest required");
        add({ route: base + suffix, kind: "bundle-download", ownership: record.badge === "official" ? "official-registry" : "hub", representations: ["raw"], readability: "expected-block", sha256: digest, listing_id: listing.id });
      }
      if (record.badge === "official") for (const rule of record.reader.declared) {
        const facts = Object.fromEntries(Object.entries(record.facts).filter(([key]) => key.startsWith(`rule.${rule.id}.`)));
        facts[`rule.${rule.id}.stock_loaded`] = String(record.reader.policies.stock.loaded.includes(rule.id));
        reference(`${route}${rule.id}/`, "rule", rule.name, facts);
      }
    }
    if (listing.type === "config") {
      if (!record.config_sha256 || record.config_sha256 !== record.assessed_config_sha256) throw new Error("config download differs from assessed bytes");
      add({ route: route + rules.config_filename, kind: "config-download", ownership: "hub", representations: ["raw"], readability: "readable", sha256: record.config_sha256, listing_id: listing.id });
    }
  }
  const coreFacts = {};
  for (const rule of core) for (const key of ["name", "type", "regex"]) coreFacts[`core.${rule.type}.${rule.id}.${key}`] = rule[key];
  reference("/hub/core-rules/", "core-rule", "Core rules", coreFacts);
  for (const publisher of publishers) {
    const ids = records.filter(record => record.publisher_id === publisher.id).map(record => record.listing.id).sort();
    const removedIds = removed.filter(record => record.publisher_id === publisher.id).map(record => record.id).sort();
    if (!ids.length && !removedIds.length) continue;
    const facts = { "publisher.name": publisher.name, "publisher.active": canonical(ids), "publisher.removed": canonical(removedIds) };
    for (const key of publisher.keys) { if (typeof key !== "object" || !key.fingerprint || !key.added) throw new Error("publisher key history required"); facts[`publisher.key.${key.fingerprint}.added`] = key.added; }
    reference(`/hub/publishers/${publisher.id}/`, "publisher", publisher.name, facts);
  }
  const sectionPaths = new Set(rules.sections);
  // Hugo emits ancestors for nested community and publisher pages. Include
  // those source-derived routes rather than accepting unmanifested output.
  if (records.some(record => record.badge === "community")) sectionPaths.add("community");
  for (const record of records.filter(record => record.badge === "community")) sectionPaths.add(`community/${record.publisher_id}`);
  if (refs.some(record => record.reference_kind === "publisher")) sectionPaths.add("publishers");
  for (const section of sectionPaths) page(`/hub/${section ? section + "/" : ""}`, "section", { children: canonical(records.filter(record => !section || listingRoute(record).startsWith(`/hub/${section}/`)).map(record => record.listing.id).sort()) });
  for (const policy of policies) page(`/hub/${policy}/`, "policy");
  for (const record of removed) {
    for (const route of new Set([record.route, ...baseline.filter(entry => entry.listing_id === record.id && entry.representations.includes("html")).map(entry => entry.route)])) page(route, "removal", record.facts, { indexable: false, listing_id: record.id });
  }
  add({ route: "/hub/index.json", kind: "index", ownership: "hub", representations: ["json"] });
  add({ route: "/hub/build.json", kind: "build", ownership: "hub", representations: ["json"] });
  if (!schemaBytes) throw new Error("trusted schema bytes required");
  add({ route: rules.schema, kind: "schema", ownership: "hub", representations: ["raw"], readability: "readable", sha256: sha256(schemaBytes) });
  entries.sort((a, b) => a.route.localeCompare(b.route));
  if (new Set(entries.map(entry => entry.route)).size !== entries.length) throw new Error("duplicate manifest route");
  return { format: 1, entries, sections: Object.fromEntries(entries.filter(entry => entry.kind === "section").map(entry => [entry.route, entry.facts])), references: refs.sort((a, b) => a.path.localeCompare(b.path)), active: [...active].sort(), removed: [...tombstones].sort() };
}
