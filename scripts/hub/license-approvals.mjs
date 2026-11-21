import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { rulesRepository } from "./rules-acquisition.mjs";

// License policy beyond the seven default licenses (DR-415).
//
// A pack under a default license keeps the automatic path: the delivered
// LICENSE must be the complete canonical text (license-delivery.mjs). A pack
// under any other OSI-approved license is listed only when a maintainer has
// recorded an approval in the Rules repository at hub/license-approvals.yaml.
// The approval names the community listing, the SPDX identifier and the exact
// bytes of the delivered LICENSE. A listing may hold several approvals, one per
// identifier and text, so a revised text can be approved before the pack PR
// replaces LICENSE. Nothing here grants an approval; it only verifies the
// committed record against what would be served.

export const osiListSource = "https://spdx.org/licenses/licenses.json";
export const spdxId = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;
const digest = /^[a-f0-9]{64}$/;
const listingKey = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]\/[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const approvalURL = new RegExp("^https://github\\.com/" + rulesRepository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/pull/[1-9][0-9]{0,8}$");
export const approvalFile = "hub/license-approvals.yaml";
const maxApprovals = 1000;

// The committed list is generated from the official SPDX list by
// scripts/hub/update-osi-licenses.mjs. Reading fails closed on any deviation,
// so a hand edit that breaks the shape cannot widen the accepted set silently.
function parseOsiList(source) {
  const list = JSON.parse(source);
  const keys = ["format", "source", "spdx_license_list_version", "spdx_release_date", "ids"];
  if (!list || typeof list !== "object" || Array.isArray(list) ||
      Object.keys(list).length !== keys.length || !keys.every(key => Object.hasOwn(list, key)) ||
      list.format !== 1 || list.source !== osiListSource ||
      typeof list.spdx_license_list_version !== "string" || !list.spdx_license_list_version ||
      typeof list.spdx_release_date !== "string" || !list.spdx_release_date ||
      !Array.isArray(list.ids) || !list.ids.length ||
      !list.ids.every((value, index) => typeof value === "string" && spdxId.test(value) &&
        (index === 0 || list.ids[index - 1] < value))) {
    throw new Error("invalid OSI-approved license list");
  }
  return new Set(list.ids);
}

// Read on first use so the generator can bootstrap or repair the file. The list
// lives under scripts/hub so the tooling identity's scripts tree hash covers it:
// changing which licenses may be admitted changes the recorded tooling.
let osiCache;
export function osiApprovedLicenses() {
  osiCache ??= parseOsiList(readFileSync(new URL("./data/osi-approved-licenses.json", import.meta.url), "utf8"));
  return osiCache;
}

// Builds the committed list from the SPDX licenses.json document: OSI-approved
// and not deprecated. Pure so the selection rule is testable without a fetch.
export function osiListFrom(spdx) {
  if (!spdx || typeof spdx.licenseListVersion !== "string" || typeof spdx.releaseDate !== "string" || !Array.isArray(spdx.licenses)) {
    throw new Error("unexpected SPDX license list shape");
  }
  const ids = spdx.licenses.map(license => {
    if (!license || typeof license.licenseId !== "string" || typeof license.isOsiApproved !== "boolean" ||
        license.isDeprecatedLicenseId !== undefined && typeof license.isDeprecatedLicenseId !== "boolean") {
      throw new Error("unexpected SPDX license entry");
    }
    return license.isOsiApproved && license.isDeprecatedLicenseId !== true ? license.licenseId : null;
  }).filter(Boolean).sort();
  const list = {
    format: 1, source: osiListSource,
    spdx_license_list_version: spdx.licenseListVersion, spdx_release_date: spdx.releaseDate, ids,
  };
  parseOsiList(JSON.stringify(list));
  return list;
}

// hub/license-approvals.yaml:
//   schema_version: 1
//   approvals:
//     - listing: <publisher-id>/<bundle-name>
//       license: <SPDX identifier>
//       license_sha256: <SHA-256 of the delivered LICENSE bytes>
//       approved_in: https://github.com/pipelab-org/pipelock-rules/pull/<number>
export function parseLicenseApprovals(source) {
  const document = parseDocument(source, { maxAliasCount: 0, uniqueKeys: true });
  if (document.errors.length) throw new Error("invalid license approval file");
  const value = document.toJS();
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 2 || value.schema_version !== 1 ||
      !Array.isArray(value.approvals) || value.approvals.length > maxApprovals) {
    throw new Error("invalid license approval file");
  }
  const seen = new Set();
  return value.approvals.map(entry => {
    const keys = ["listing", "license", "license_sha256", "approved_in"];
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).length !== keys.length || !keys.every(key => typeof entry[key] === "string") ||
        !listingKey.test(entry.listing) || !spdxId.test(entry.license) || !digest.test(entry.license_sha256) ||
        !approvalURL.test(entry.approved_in)) {
      throw new Error("invalid license approval entry");
    }
    // A listing may carry several approvals so a license text change can be
    // approved before the pack PR updates LICENSE. Each entry authorizes only its
    // own identifier and digest; repeating one exactly adds nothing.
    const identity = [entry.listing, entry.license, entry.license_sha256].join(" ");
    if (seen.has(identity)) throw new Error("duplicate license approval for a listing, license and text");
    seen.add(identity);
    // List membership is deliberately not checked here. The list is mutable
    // (SPDX deprecations, OSI status), so one approval that has left it must not
    // make the whole Rules tree unloadable. readLicenseMaterial checks membership
    // when the listing is used, and preflight checks it when an approval is admitted.
    return { listing: entry.listing, license: entry.license, license_sha256: entry.license_sha256, approved_in: entry.approved_in };
  });
}

export function loadLicenseApprovals(directory) {
  let source;
  try { source = readFileSync(path.join(directory, approvalFile), "utf8"); } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return parseLicenseApprovals(source);
}

// Use the route path separator: hyphens (including "--") are valid inside
// both names, so concatenating them with "--" is not an exact identity.
export const communityListingKey = (publisherId, bundleName) => publisherId + "/" + bundleName;

// Every approval recorded for this listing under this license. Any one whose
// digest equals the delivered bytes authorizes delivery; matching the digest is
// the caller's check (license-delivery).
export function findLicenseApprovals(approvals, listing, license) {
  return (approvals ?? []).filter(entry => entry.listing === listing && entry.license === license);
}
