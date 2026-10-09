import path from "node:path";

import { requireCapabilityId } from "./capability-id.mjs";
import { requireGoSourcePath, requireRepositoryPath, verifyGoSymbol } from "./capability-source-records.mjs";

const REFERENCE_KINDS = new Set(["site", "source"]);
const SOURCE_CORRECTION_KEYS = [
  "label",
  "manifest_path",
  "manifest_symbol",
  "path",
  "symbol",
  "text",
];

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function requireSitePath(value, label) {
  const candidate = requireNonemptyString(value, label);
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    throw new Error(`${label} must be an absolute site path`);
  }
  const parsed = new URL(candidate, "https://pipelab.org");
  if (
    parsed.origin !== "https://pipelab.org"
    || parsed.search !== ""
    || parsed.hash !== ""
    || candidate !== parsed.pathname
    || path.posix.normalize(parsed.pathname) !== parsed.pathname
  ) {
    throw new Error(`${label} must stay within pipelab.org`);
  }
  return candidate;
}

function requirePlainObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

export function verifyCapabilityReferences(snapshot, referenceMap) {
  requirePlainObject(referenceMap, "capability reference map");
  if (referenceMap.schema_version !== 1) throw new Error("capability reference schema version is unsupported");

  const capabilities = requirePlainObject(referenceMap.capabilities, "capability references");
  // Corrections are exceptional; the pinned manifest supplies normal provenance for every capability.
  const sourceCorrections = requirePlainObject(referenceMap.source_corrections, "capability source corrections");
  const inventory = new Map(snapshot.capabilities.map((capability) => [requireCapabilityId(capability.id), capability]));
  const referenceIds = Object.keys(capabilities).map(requireCapabilityId);

  if (referenceIds.length !== inventory.size || referenceIds.some((id) => !inventory.has(id))) {
    throw new Error("capability references must cover the inventory exactly once");
  }

  for (const [capabilityId, references] of Object.entries(capabilities)) {
    if (!Array.isArray(references) || references.length === 0) {
      throw new Error(`capability ${capabilityId} must have at least one reference`);
    }
    for (const [index, reference] of references.entries()) {
      requirePlainObject(reference, `capability ${capabilityId} reference ${index}`);
      requireNonemptyString(reference.label, `capability ${capabilityId} reference ${index} label`);
      if (!REFERENCE_KINDS.has(reference.kind)) {
        throw new Error(`capability ${capabilityId} reference ${index} has an unsupported kind`);
      }
      if (reference.kind === "site") {
        requireSitePath(reference.path, `capability ${capabilityId} reference ${index} path`);
      } else {
        requireRepositoryPath(reference.path, `capability ${capabilityId} reference ${index} path`);
      }
    }
  }

  for (const [rawCapabilityId, correction] of Object.entries(sourceCorrections)) {
    const capabilityId = requireCapabilityId(rawCapabilityId);
    const capability = inventory.get(capabilityId);
    if (!capability) throw new Error(`source correction names unknown capability ${capabilityId}`);
    requirePlainObject(correction, `source correction ${capabilityId}`);
    if (Object.keys(correction).sort().join("\n") !== SOURCE_CORRECTION_KEYS.join("\n")) {
      throw new Error(`source correction ${capabilityId} has an invalid schema`);
    }
    requireNonemptyString(correction.label, `source correction ${capabilityId} label`);
    requireNonemptyString(correction.text, `source correction ${capabilityId} text`);
    requireNonemptyString(correction.symbol, `source correction ${capabilityId} symbol`);
    requireRepositoryPath(correction.path, `source correction ${capabilityId} path`);
    requireRepositoryPath(correction.manifest_path, `source correction ${capabilityId} manifest path`);
    requireNonemptyString(correction.manifest_symbol, `source correction ${capabilityId} manifest symbol`);
    if (
      capability.implementation.file !== correction.manifest_path
      || capability.implementation.symbol !== correction.manifest_symbol
    ) {
      throw new Error(`source correction ${capabilityId} no longer matches the pinned manifest record`);
    }
  }

  return sourceCorrections;
}

export function verifyCapabilitySourceCorrections(snapshot, referenceMap, readPinnedSource) {
  if (typeof readPinnedSource !== "function") throw new Error("pinned source reader is required");
  const sourceCorrections = verifyCapabilityReferences(snapshot, referenceMap);
  for (const [capabilityId, correction] of Object.entries(sourceCorrections)) {
    requireGoSourcePath(correction.path, `source correction ${capabilityId} path`);
    let source;
    try {
      source = readPinnedSource(correction.path);
    } catch (error) {
      throw new Error(`source correction ${capabilityId} path is absent from the pinned commit: ${error.message}`);
    }
    const text = Buffer.isBuffer(source) ? source.toString("utf8") : source;
    verifyGoSymbol(text, correction.symbol, `source correction ${capabilityId} symbol`);
  }
}

export function verifyCapabilitySourceReferences(snapshot, referenceMap, readPinnedSource) {
  if (typeof readPinnedSource !== "function") throw new Error("pinned source reader is required");
  verifyCapabilityReferences(snapshot, referenceMap);
  for (const [capabilityId, references] of Object.entries(referenceMap.capabilities)) {
    for (const [index, reference] of references.entries()) {
      if (reference.kind !== "source") continue;
      try {
        readPinnedSource(reference.path);
      } catch (error) {
        throw new Error(
          `capability ${capabilityId} reference ${index} is absent from the pinned commit: ${error.message}`,
        );
      }
    }
  }
}
