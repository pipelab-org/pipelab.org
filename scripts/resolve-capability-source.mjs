#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";

import { parseCapabilityFamilyMap } from "./capability-families.mjs";
import { capabilityContentPath, requireCapabilityId } from "./capability-id.mjs";
import { verifyCapabilityReferences } from "./capability-references.mjs";

const SEMVER = /^\d+\.\d+\.\d+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const PIPELOCK_REPOSITORY = "https://github.com/pipelab-org/pipelock";
const CONTENT_DIRECTORY = fileURLToPath(new URL("../content", import.meta.url));

function parseCapabilityFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("capability page must begin with YAML front matter");

  const document = parseDocument(match[1], { strict: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`capability front matter is invalid: ${document.errors[0].message}`);
  }
  const metadata = document.toJS({ maxAliasCount: 0 });
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new Error("capability front matter must be a mapping");
  }
  return metadata;
}

function parseSiteVersion(config) {
  let parsed;
  try {
    parsed = parseToml(config);
  } catch (error) {
    throw new Error(`site configuration is invalid TOML: ${error.message}`);
  }
  return parsed?.params?.pipelock_version;
}

export function resolveCapabilitySource(snapshot, content, config) {
  const metadata = parseCapabilityFrontMatter(content);
  const releaseTarget = metadata.release_target;
  const draftValue = Object.hasOwn(metadata, "draft") ? metadata.draft : false;
  const robots = metadata.robots;
  const siteVersion = parseSiteVersion(config);
  const source = snapshot.source || {};

  if (typeof releaseTarget !== "string" || !SEMVER.test(releaseTarget)) {
    throw new Error("capability release target is invalid");
  }
  if (typeof siteVersion !== "string" || !SEMVER.test(siteVersion)) throw new Error("site Pipelock version is invalid");
  if (typeof draftValue !== "boolean") throw new Error("capability draft state is invalid");
  if (draftValue && robots !== "noindex, nofollow") {
    throw new Error("draft capability inventory must be noindex and nofollow");
  }
  if (!draftValue && robots !== undefined) {
    throw new Error("published capability inventory must not override robots discovery");
  }
  if (source.repository !== PIPELOCK_REPOSITORY) throw new Error("capability source repository is invalid");
  if (!COMMIT.test(source.commit || "")) throw new Error("capability source commit is invalid");

  const draft = draftValue;
  const expected = draft
    ? { status: "development", recordedRef: "origin/main", checkoutRef: "main", version: "" }
    : {
        status: "release",
        recordedRef: `v${releaseTarget}`,
        checkoutRef: `refs/tags/v${releaseTarget}`,
        version: releaseTarget,
      };
  if (!draft && releaseTarget !== siteVersion) {
    throw new Error("published capability release target must match the site Pipelock version");
  }
  if (source.status !== expected.status || source.ref !== expected.recordedRef) {
    throw new Error("capability source status or ref is inconsistent with the page state");
  }
  if (draft) {
    if (source.release_version !== null) throw new Error("development capability provenance names a release");
  } else if (source.release_version !== releaseTarget) {
    throw new Error("release capability provenance names the wrong version");
  }

  return {
    ...expected,
    recordedCommit: source.commit,
  };
}

export function verifyCapabilityDetailState(families, detailContents, draft) {
  if (!Array.isArray(families) || families.length === 0) {
    throw new Error("capability family map must contain families");
  }
  if (!(detailContents instanceof Map)) throw new Error("capability detail content map is required");

  const capabilityIds = new Set();
  for (const family of families) {
    if (!family || !Array.isArray(family.capabilities) || family.capabilities.length === 0) {
      throw new Error("capability family must name capabilities");
    }
    for (const capabilityId of family.capabilities) {
      const id = requireCapabilityId(capabilityId);
      if (capabilityIds.has(id)) throw new Error(`capability detail ${id} belongs to more than one family`);
      capabilityIds.add(id);
      const content = detailContents.get(id);
      if (typeof content !== "string") throw new Error(`capability detail ${id} content is missing`);
      const metadata = parseCapabilityFrontMatter(content);
      const pageDraft = Object.hasOwn(metadata, "draft") ? metadata.draft : false;
      if (typeof pageDraft !== "boolean") throw new Error(`capability detail ${id} draft state is invalid`);
      if (pageDraft !== draft) {
        throw new Error(`capability detail ${id} draft state must match the capability inventory`);
      }
      if (draft && metadata.robots !== "noindex, nofollow") {
        throw new Error(`draft capability detail ${id} must be noindex and nofollow`);
      }
      if (!draft && metadata.robots !== undefined) {
        throw new Error(`published capability detail ${id} must not override robots discovery`);
      }
      if (metadata.capability !== id) {
        throw new Error(`capability detail ${id} front matter names the wrong capability`);
      }
      if (metadata.url !== `/capabilities/${id}/`) {
        throw new Error(`capability detail ${id} front matter names the wrong route`);
      }
    }
  }
}

export function loadCapabilityDetailContents(families, contentDirectory = CONTENT_DIRECTORY) {
  return new Map(families.flatMap((family) => family.capabilities.map((capabilityId) => [
    requireCapabilityId(capabilityId),
    readFileSync(capabilityContentPath(contentDirectory, capabilityId), "utf8"),
  ])));
}

function main() {
  const snapshot = JSON.parse(readFileSync("data/pipelock_capabilities.json", "utf8"));
  const families = parseCapabilityFamilyMap(
    readFileSync("data/pipelock_capability_families.json", "utf8"),
  ).families;
  const content = readFileSync("content/capabilities.md", "utf8");
  const config = readFileSync("hugo.toml", "utf8");
  const references = JSON.parse(readFileSync("data/pipelock_capability_references.json", "utf8"));
  const source = resolveCapabilitySource(snapshot, content, config);
  verifyCapabilityReferences(snapshot, references);
  verifyCapabilityDetailState(families, loadCapabilityDetailContents(families), source.status === "development");
  process.stdout.write([
    `status=${source.status}`,
    `recorded_ref=${source.recordedRef}`,
    `checkout_ref=${source.checkoutRef}`,
    `version=${source.version}`,
    `commit=${source.recordedCommit}`,
    "",
  ].join("\n"));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
