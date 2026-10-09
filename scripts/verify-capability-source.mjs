#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadCapabilityDetailContents,
  resolveCapabilitySource,
  verifyCapabilityDetailState,
} from "./resolve-capability-source.mjs";
import { parseCapabilityFamilyMap } from "./capability-families.mjs";
import {
  verifyCapabilitySourceCorrections,
  verifyCapabilitySourceReferences,
} from "./capability-references.mjs";
import { verifyCapabilitySourceRecords } from "./capability-source-records.mjs";
import { buildSnapshot } from "./sync-pipelock-capabilities.mjs";

function sameSnapshot(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function verifyDevelopmentSnapshot(snapshot, recordedManifest, currentManifest, isAncestor) {
  if (!isAncestor) throw new Error("recorded development commit is not in current Pipelock main history");

  const recorded = buildSnapshot(recordedManifest, {
    ref: "origin/main",
    commit: snapshot.source.commit,
  });
  if (!sameSnapshot(snapshot, recorded)) {
    throw new Error("capability snapshot does not match its recorded development commit");
  }

  const currentDigest = createHash("sha256").update(currentManifest).digest("hex");
  if (currentDigest !== snapshot.source.manifest_sha256) {
    throw new Error("current Pipelock main has a different capability manifest");
  }
}

export function verifyReleaseSnapshot(snapshot, manifest, headCommit, tagCommit, version) {
  if (tagCommit !== snapshot.source.commit) {
    throw new Error("release tag does not resolve to the recorded capability commit");
  }
  if (headCommit !== tagCommit) {
    throw new Error("checked-out release source is not the immutable release tag");
  }
  const expected = buildSnapshot(manifest, {
    ref: `v${version}`,
    commit: tagCommit,
    releaseVersion: version,
  });
  if (!sameSnapshot(snapshot, expected)) {
    throw new Error("capability snapshot does not match the release tag");
  }
}

function git(source, args, options = {}) {
  return execFileSync("git", ["-C", source, ...args], options);
}

function main() {
  const sourceIndex = process.argv.indexOf("--source");
  const sourcePath = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : "";
  if (!sourcePath) throw new Error("--source PATH is required");

  const snapshot = JSON.parse(readFileSync("data/pipelock_capabilities.json", "utf8"));
  const families = parseCapabilityFamilyMap(
    readFileSync("data/pipelock_capability_families.json", "utf8"),
  ).families;
  const content = readFileSync("content/capabilities.md", "utf8");
  const config = readFileSync("hugo.toml", "utf8");
  const references = JSON.parse(readFileSync("data/pipelock_capability_references.json", "utf8"));
  const authority = resolveCapabilitySource(snapshot, content, config);
  verifyCapabilityDetailState(families, loadCapabilityDetailContents(families), authority.status === "development");
  const sourceCache = new Map();
  const readPinnedSource = (sourceFile) => {
    if (!sourceCache.has(sourceFile)) {
      sourceCache.set(sourceFile, git(sourcePath, ["show", `${authority.recordedCommit}:${sourceFile}`]));
    }
    return sourceCache.get(sourceFile);
  };
  verifyCapabilitySourceRecords(snapshot, readPinnedSource);
  verifyCapabilitySourceCorrections(snapshot, references, readPinnedSource);
  verifyCapabilitySourceReferences(snapshot, references, readPinnedSource);
  const resolvedCommit = git(sourcePath, ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  if (authority.status === "development") {
    const ancestry = spawnSync(
      "git",
      ["-C", sourcePath, "merge-base", "--is-ancestor", authority.recordedCommit, resolvedCommit],
    );
    const recordedManifest = git(sourcePath, ["show", `${authority.recordedCommit}:docs/security/capability-manifest.json`]);
    const currentManifest = git(sourcePath, ["show", "HEAD:docs/security/capability-manifest.json"]);
    verifyDevelopmentSnapshot(snapshot, recordedManifest, currentManifest, ancestry.status === 0);
    process.stdout.write(`verified development capability snapshot against current main at ${resolvedCommit}\n`);
    return;
  }

  const tagRef = `refs/tags/v${authority.version}^{commit}`;
  const tagCommit = git(sourcePath, ["rev-parse", "--verify", tagRef], { encoding: "utf8" }).trim();
  const manifest = git(sourcePath, ["show", `${tagCommit}:docs/security/capability-manifest.json`]);
  verifyReleaseSnapshot(snapshot, manifest, resolvedCommit, tagCommit, authority.version);
  process.stdout.write(`verified release capability snapshot against v${authority.version} at ${tagCommit}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
