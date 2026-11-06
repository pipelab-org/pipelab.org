import { validateListing, describeLinks } from "./validate.mjs";
import { compareReaderSignature } from "./verify-bundle.mjs";
import { canonical, sha256 } from "./evidence.mjs";

export function listingRoute(record) {
  const listing = record.listing;
  if (listing.type === "bundle") return record.badge === "official" ? `/hub/bundles/${listing.bundle_name}/` : `/hub/community/${record.publisher_id}/${listing.bundle_name}/`;
  return `/hub/${{ config: "configs", recipe: "recipes", verifier: "verifiers" }[listing.type]}/${listing.id}/`;
}
export function indexProjection(records) {
  return { format: 1, items: [...records].sort((a, b) => a.listing.id.localeCompare(b.listing.id)).map(record => ({ id: record.listing.id, type: record.listing.type, title: record.listing.title, summary: record.listing.summary, badge: record.badge, url: listingRoute(record) })) };
}
export function assertIndex(actual, records) {
  if (canonical(actual) !== canonical(indexProjection(records))) throw new Error("hub index projection differs");
}
// Contributions and declarations never choose the badge or install command.
export function deriveRecord({ listing: input, reader, independent, publisher, tooling, evidencePresent = false, measurement = null }) {
  const listing = validateListing(input);
  const record = { listing, evidence_present: evidencePresent, link_hosts: describeLinks(listing.links), schema_version: 1, tooling_identity: tooling, pipelock_version: "3.7.1", facts: {} };
  if (listing.type !== "bundle") {
    record.badge = ["recipe", "verifier"].includes(listing.type) ? "first-party" : "none";
    record.route = listingRoute(record);
    return record;
  }
  if (!reader || !independent) throw new Error("bundle reader evidence required");
  compareReaderSignature(reader, independent);
  if (listing.bundle_name !== reader.name || listing.bundle_sha256 !== reader.bundle_sha256 || listing.signer_fingerprint !== reader.signer_fingerprint) throw new Error("bundle metadata assertion differs");
  record.badge = reader.trust_tier === "official" ? "official" : "community";
  if (record.badge === "community") {
    if (!publisher || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(publisher.id) || !publisher.keys.map(key => typeof key === "string" ? key : key.fingerprint).includes(reader.signer_fingerprint)) throw new Error("publisher signer differs");
    if (reader.format_version !== 2 || reader.declared_tier !== "community" || reader.name.startsWith("pipelock-")) throw new Error("community bundle policy refused");
    if (listing.links.homepage && (() => { const host = new URL(listing.links.homepage).hostname; return host === "pipelab.org" || host.endsWith(".pipelab.org"); })()) throw new Error("community listing claims PipeLab host");
    if (!reader.policies.full.loaded.length) throw new Error("no loadable rules");
    record.publisher_id = publisher.id;
  }
  record.bundle_sha256 = reader.bundle_sha256;
  record.signature_sha256 = independent.signature_sha256;
  record.route = listingRoute(record);
  record.served_source = record.badge === "official" ? `static/rules/${reader.name}/bundle.yaml` : `assets${record.route}bundle.yaml`;
  record.reader = reader;
  record.measurement = measurement;
  record.install_command = record.badge === "official" ? `pipelock rules install ${reader.name}` : `pipelock rules install --source https://pipelab.org${listingRoute(record)}bundle.yaml`;
  const facts = record.facts;
  for (const [key, value] of Object.entries({ name: reader.name, version: reader.version, format_version: String(reader.format_version), declared_tier: reader.declared_tier, signer_fingerprint: reader.signer_fingerprint, badge: record.badge, install_command: record.install_command, bundle_sha256: reader.bundle_sha256 })) facts[`bundle.${key}`] = value;
  for (const [name, policy] of Object.entries(reader.policies)) {
    facts[`policy.${name}.eligible`] = canonical(policy.eligible);
    facts[`policy.${name}.loaded`] = canonical(policy.loaded);
  }
  for (const rule of reader.declared) for (const key of ["id", "type", "name", "description", "regex", "severity", "confidence", "status"]) facts[`rule.${rule.id}.${key}`] = rule[key];
  record.display_facts = Object.entries(record.facts).map(([key, value]) => ({ key, value }));
  return record;
}
export function assertServedDigest(record, bytes) {
  if (sha256(bytes) !== record.bundle_sha256) throw new Error("served bundle record digest differs");
}
