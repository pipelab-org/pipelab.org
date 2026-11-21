import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { osiListFrom, osiListSource } from "./license-approvals.mjs";
import { defaultLicenses } from "./license-delivery.mjs";

// Regenerates scripts/hub/data/osi-approved-licenses.json from the official SPDX
// license list (isOsiApproved, excluding isDeprecatedLicenseId). The list sits
// under scripts/hub so the tooling identity's scripts tree hash covers it.
//
//   NODE_USE_ENV_PROXY=1 node scripts/hub/update-osi-licenses.mjs [--check] [--root DIR] [--rules DIR] [LOCAL_LICENSES_JSON]
//
// With no file argument the list is fetched from the SPDX source URL; route it
// through the configured proxy. A local copy of licenses.json can be given
// instead. --check compares the committed file with a fresh result and writes
// nothing, so it also notices a newer SPDX release.
//
// A refresh is refused, with nothing written, when it would drop a non-default
// license that committed data still names: active listing records under
// data/hub/generated (lifecycle records of withdrawn listings keep a pinned
// license for retained downloads and are not counted, since delivery never
// consults the list for them) and first-party listings under data/hub/first-party in
// --root (default: this repository), and, with --rules, a Rules checkout's
// hub/license-approvals.yaml and hub/listings. Rules content is not part of
// this repository, so approvals can only be checked against a checkout the
// operator supplies. Resolve a dropped identifier first (re-approve under a
// current identifier, or retire the listing), then refresh.
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const output = path.join(scriptDirectory, "data/osi-approved-licenses.json");

export const serialize = list => JSON.stringify(list, null, 2) + "\n";

function files(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort();
}

function collectLicenses(value, found) {
  if (Array.isArray(value)) value.forEach(item => collectLicenses(item, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "license" && typeof item === "string") found.add(item);
      else collectLicenses(item, found);
    }
  }
}

// Listing identities whose removal history ends withdrawn. Replays only the
// state transitions: a removal opens the withdrawal, a restoration ends it, and
// reason-cleared events never reinstate a listing on their own.
function withdrawnListings(history) {
  const withdrawn = new Set();
  for (const log of Array.isArray(history) ? history : []) {
    const last = Array.isArray(log?.events) ? log.events.findLast(event => event?.type === "removed" || event?.type === "restored") : undefined;
    if (typeof log?.id === "string" && last?.type === "removed") withdrawn.add(log.id);
  }
  return withdrawn;
}

// A withdrawn listing's accepted record keeps its pinned license for retained
// downloads. Retained delivery trusts that pin and never consults the list, so
// the record is not a refresh blocker. Active and restored listings still are.
function collectLifecycleLicenses(lifecycle, found) {
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return collectLicenses(lifecycle, found);
  const withdrawn = withdrawnListings(lifecycle.history);
  const { listings, ...rest } = lifecycle;
  collectLicenses(rest, found);
  collectLicenses(Array.isArray(listings) ? listings.filter(record => !withdrawn.has(record?.id)) : listings, found);
}

// Non-default license identifiers named by committed data. Default licenses use
// the automatic path and never depend on the list.
export function referencedLicenses({ root = repositoryRoot, rules } = {}) {
  const found = new Set();
  for (const file of files(path.join(root, "data/hub/generated"), ".json")) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (path.basename(file) === "lifecycle.json") collectLifecycleLicenses(value, found); else collectLicenses(value, found);
  }
  for (const file of files(path.join(root, "data/hub/first-party"), ".yaml")) collectLicenses(parse(readFileSync(file, "utf8"), { maxAliasCount: 0 }), found);
  if (rules) {
    const approvals = path.join(rules, "hub/license-approvals.yaml");
    if (existsSync(approvals)) collectLicenses(parse(readFileSync(approvals, "utf8"), { maxAliasCount: 0 }), found);
    for (const file of files(path.join(rules, "hub/listings"), ".yaml")) collectLicenses(parse(readFileSync(file, "utf8"), { maxAliasCount: 0 }), found);
  }
  return new Set([...found].filter(id => !defaultLicenses.has(id)));
}

// Referenced identifiers that the refreshed list no longer contains.
export const droppedReferenced = (ids, referenced) => [...referenced].filter(id => !ids.has(id)).sort();

async function readSPDX(file) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const response = await fetch(osiListSource, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("SPDX license list unavailable: HTTP " + response.status);
  return await response.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const usage = () => {
    console.error("usage: update-osi-licenses.mjs [--check] [--root DIR] [--rules DIR] [LOCAL_LICENSES_JSON]");
    process.exit(2);
  };
  let check = false, root = repositoryRoot, rules;
  while (args[0]?.startsWith("--")) {
    const flag = args.shift();
    if (flag === "--check") check = true;
    else if ((flag === "--root" || flag === "--rules") && args.length) {
      const value = path.resolve(args.shift());
      if (flag === "--root") root = value; else rules = value;
    } else usage();
  }
  if (args.length > 1) usage();
  const list = osiListFrom(await readSPDX(args[0]));
  const dropped = droppedReferenced(new Set(list.ids), referencedLicenses({ root, rules }));
  if (dropped.length) {
    console.error("refresh would drop licenses that committed data still uses: " + dropped.join(", "));
    console.error("resolve them first (re-approve under a current identifier or retire the listing); no changes written");
    process.exit(1);
  }
  const bytes = serialize(list);
  if (check) {
    if (readFileSync(output, "utf8") !== bytes) {
      console.error("scripts/hub/data/osi-approved-licenses.json differs from the SPDX license list");
      process.exit(1);
    }
    console.log("OSI-approved license list is current");
  } else {
    writeFileSync(output, bytes);
    console.log("wrote " + path.relative(process.cwd(), output));
  }
}
