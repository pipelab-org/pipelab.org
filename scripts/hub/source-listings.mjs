import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { parseListing, resolveArtifact, validateText } from "./validate.mjs";

const id = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const key = /^[a-f0-9]{64}$/;
const yamlFiles = (root, folder) => {
  const directory = path.join(root, folder);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).map(entry => {
    if (!entry.isFile() || !/^[a-z0-9-]+\.yaml$/.test(entry.name)) throw new Error("unexpected Hub source entry");
    return { name: path.basename(entry.name, ".yaml"), relative: folder + "/" + entry.name };
  }).sort((a, b) => a.name.localeCompare(b.name));
};

function validPublisherKey(entry) {
  const { fingerprint, added } = entry ?? {};
  if (typeof fingerprint !== "string" || !key.test(fingerprint) ||
      typeof added !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(added)) {
    return false;
  }
  const date = new Date(added);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === added;
}

function publisherRecord(source, file) {
  const publisher = parse(source, { maxAliasCount: 0 });
  if (!publisher || publisher.id !== file.name || !id.test(publisher.id) ||
      typeof publisher.name !== "string" || !Array.isArray(publisher.keys) || !publisher.keys.length ||
      !publisher.keys.every(validPublisherKey) ||
      new Set(publisher.keys.map(entry => entry.fingerprint)).size !== publisher.keys.length) {
    throw new Error("invalid Hub publisher metadata");
  }
  return { ...publisher, name: validateText(publisher.name, "label") };
}

export function loadAcquiredListings(directory, site) {
  const filePath = file => resolveArtifact(directory, file.relative);
  const read = file => readFileSync(filePath(file), "utf8");
  const readListing = file => {
    const listing = parseListing(read(file));
    if (listing.evidence.artifact) throw new Error("evidence.artifact is unsupported for acquired Hub listings: " + file.relative);
    return listing;
  };
  const publishers = yamlFiles(directory, "hub/publishers").map(file => publisherRecord(read(file), file));
  const items = [];
  for (const file of yamlFiles(directory, "hub/listings/bundles")) {
    const listing = readListing(file);
    if (listing.type !== "bundle" || listing.bundle_name !== file.name) throw new Error("official listing identity differs");
    const bundle_dir = path.dirname(resolveArtifact(path.join(site, "static"), "rules/" + file.name + "/bundle.yaml"));
    items.push({ listing_file: filePath(file), bundle_dir });
  }
  for (const file of yamlFiles(directory, "hub/listings/community")) {
    const listing = readListing(file);
    const matches = publishers.filter(publisher => file.name === publisher.id + "--" + listing.bundle_name);
    if (listing.type !== "bundle" || matches.length !== 1) throw new Error("community listing must identify one publisher and bundle");
    const [publisher] = matches;
    const prefix = "hub/community/" + publisher.id + "/" + listing.bundle_name + "/";
    const bundle_dir = path.dirname(resolveArtifact(directory, prefix + "bundle.yaml"));
    resolveArtifact(directory, prefix + "bundle.yaml.sig");
    items.push({ listing_file: filePath(file), bundle_dir, publisher });
  }
  for (const file of yamlFiles(directory, "hub/configs")) {
    const listing = readListing(file);
    if (listing.type !== "config" || listing.id !== file.name) throw new Error("configuration listing identity differs");
    items.push({ listing_file: filePath(file) });
  }
  const history = yamlFiles(directory, "hub/tombstones").map(file => ({
    id: file.name, events: parse(read(file), { maxAliasCount: 0 }),
  }));
  return { publishers, items, history };
}
