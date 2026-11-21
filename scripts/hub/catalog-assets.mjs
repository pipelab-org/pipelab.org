import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "./evidence.mjs";

const id = "[a-z0-9][a-z0-9-]{1,62}[a-z0-9]";
const community = new RegExp("^/hub/community/" + id + "/" + id + "/bundle\\.yaml(\\.sig)?$");
const config = new RegExp("^/hub/configs/" + id + "/pipelock\\.yaml$");
const licenseRoute = new RegExp("^/hub/community/" + id + "/" + id + "/(?:license|notice)\\.txt$");
const kinds = new Set(["bundle-download", "retained-download", "config-download", "license-download", "notice-download"]);
const licenseKinds = new Set(["license-download", "notice-download"]);
// Active and retained signed pairs both carry their license material.
const pairKinds = new Set(["bundle-download", "retained-download"]);

function expectedDownloads(manifest) {
  const expected = new Map();
  for (const entry of manifest.entries) {
    if (entry.ownership !== "hub" || !kinds.has(entry.kind)) continue;
    const routePattern = entry.kind === "config-download" ? config : licenseKinds.has(entry.kind) ? licenseRoute : community;
    if (typeof entry.route !== "string" || !routePattern.test(entry.route) ||
        typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || expected.has(entry.route)) {
      throw new Error("invalid or duplicate catalog download route");
    }
    expected.set(entry.route, entry);
  }
  for (const { route, kind } of expected.values()) {
    const directory = route.slice(0, route.lastIndexOf("/") + 1);
    if (licenseKinds.has(kind)) {
      if (kind !== (route.endsWith("/license.txt") ? "license-download" : "notice-download") ||
          !pairKinds.has(expected.get(directory + "bundle.yaml")?.kind)) {
        throw new Error("license delivery must accompany a served bundle");
      }
      continue;
    }
    if (pairKinds.has(kind) && !route.endsWith(".sig") && expected.get(directory + "license.txt")?.kind !== "license-download") {
      throw new Error("served bundle requires license delivery");
    }
    if (kind === "config-download") continue;
    const counterpart = route.endsWith(".sig") ? route.slice(0, -4) : route + ".sig";
    if (expected.get(counterpart)?.kind !== kind) throw new Error("incomplete catalog bundle pair");
  }
  return expected;
}

// Scratch is a caller-owned directory outside the checkout. The returned
// directory contains only manifest-bound download files, relative to assets/.
// It is created exclusively for this call so retries cannot touch siblings.
export function stageCatalogAssets(scratchDirectory, manifest, downloads) {
  const expected = expectedDownloads(manifest);
  const entries = new Map();
  for (const { route, bytes } of downloads) {
    if (!expected.has(route) || entries.has(route)) throw new Error("unexpected or duplicate catalog download");
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== expected.get(route).sha256) {
      throw new Error("catalog download digest differs");
    }
    entries.set(route, bytes);
  }
  if (entries.size !== expected.size) throw new Error("catalog download missing");

  const scratch = path.resolve(scratchDirectory);
  if (realpathSync(scratch) !== scratch) throw new Error("catalog scratch must use its real path");
  const directory = mkdtempSync(path.join(scratch, "hub-catalog-assets-"));
  try {
    for (const route of [...entries.keys()].sort()) {
      const file = path.join(directory, route.slice(1));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, entries.get(route), { flag: "wx" });
    }
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function inventory(root, relative, files) {
  const file = path.join(root, relative);
  const entry = lstatSync(file, { throwIfNoEntry: false });
  if (!entry) return;
  if (entry.isDirectory()) {
    for (const name of readdirSync(file).sort()) inventory(root, path.join(relative, name), files);
  } else if (entry.isFile()) {
    files.set(relative, sha256(readFileSync(file)));
  } else {
    throw new Error("catalog download tree must contain regular files and directories");
  }
}

export function assertCatalogAssets(candidate, staged) {
  for (const root of [candidate, staged]) {
    if (!lstatSync(root).isDirectory()) throw new Error("catalog assets root must be a real directory");
    const hub = lstatSync(path.join(root, "hub"), { throwIfNoEntry: false });
    if (hub && !hub.isDirectory()) throw new Error("Hub assets root must be a real directory");
  }
  const expected = new Map(), actual = new Map();
  for (const folder of ["hub/community", "hub/configs"]) {
    inventory(staged, folder, expected);
    inventory(candidate, folder, actual);
  }
  if (expected.size !== actual.size || [...expected].some(([name, digest]) => actual.get(name) !== digest)) {
    throw new Error("candidate catalog asset set differs from staged catalog");
  }
}
