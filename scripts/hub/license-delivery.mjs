import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { sha256 } from "./evidence.mjs";
import { osiApprovedLicenses, spdxId } from "./license-approvals.mjs";

// License and notice files are separate sibling files of the signed pair.
// They are served and rendered next to the bundle; signed bytes never change.
export const licenseFile = "LICENSE";
export const noticeFile = "NOTICE";
// Served names stay lowercase like every other Hub route.
export const servedName = { [licenseFile]: "license.txt", [noticeFile]: "notice.txt" };
// Official packs are served by the registry path that holds their signed pair.
export const officialRoute = name => "/rules/" + name + "/";
const maxBytes = 64 * 1024;
const candidateName = /^(?:licen[cs]e|notice|copying)(?:[._-].*)?$/i;

// Complete license bodies for each DR-415 license live in ./licenses/, taken
// from the published SPDX and license-steward texts. A delivered LICENSE must
// be the whole body after normalization; only the variable parts SPDX marks
// as replaceable may differ: copyright and title lines before the body, the
// holder named in disclaimers and BSD clause 3, and the optional Apache
// appendix. A partial, extended or mismatched text is refused.
const licenseDirectory = new URL("./licenses/", import.meta.url);
const holes = {
  holder: ".{1,160}?",
  "and-or": "(?:and/or|and)",
  the: "(?:the )?",
  "any-those": "(?:any|those)",
  its: "(?:its|the|their)",
};
// Leading lines a license file may carry before its body.
const titleLine = /^[\t ]*\(?(?:the )?(?:mit|isc|bsd[ -](?:2|3|zero)[ -]clause|zero[ -]clause bsd|bsd)(?: license)?(?: \(mit\))?\)?[\t ]*$/i;
const copyrightLine = /^[\t ]*(?:copyright\b|\(c\)|©)[^\r\n]*$/i;
const reservedLine = /^[\t ]*all rights reserved\.?[\t ]*$/i;
const bulleted = new Set(["BSD-2-Clause", "BSD-3-Clause"]);
const noticePrefix = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD"]);

function normalizeLicense(text, bullets) {
  let value = text.toLowerCase()
    .replace(/[“”„‟″]|''|``/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/©/g, "(c)")
    .replace(/[‐-―]/g, "-")
    .replace(/https:\/\//g, "http://")
    .replace(/\s+/g, " ").trim();
  // SPDX matching ignores list markers; BSD clauses appear numbered, bulleted or bare.
  if (bullets) value = value.replace(/(^| )(?:[*•-]|\d{1,2}\.)(?= )/g, "$1").replace(/ {2,}/g, " ").trim();
  return value;
}

function compileTemplate(file, bullets) {
  const text = normalizeLicense(readFileSync(new URL(file, licenseDirectory), "utf8"), bullets);
  return text.split(/(\{\{[a-z-]+\}\})/).map(part => {
    const hole = /^\{\{([a-z-]+)\}\}$/.exec(part);
    if (hole) {
      if (!Object.hasOwn(holes, hole[1])) throw new Error("unknown license template field");
      return holes[hole[1]];
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
}

// The default licenses keep the automatic path: complete canonical text only.
export const defaultLicenses = new Set(["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "CC0-1.0"]);
const templates = new Map([...defaultLicenses].map(id => {
  const bullets = bulleted.has(id);
  let body = compileTemplate(id + ".txt", bullets);
  if (id === "Apache-2.0") {
    // The appendix is optional; when present, its notice may be filled in.
    const appendix = compileTemplate("Apache-2.0-appendix.txt", false);
    const boilerplate = compileTemplate("Apache-2.0-boilerplate.txt", false);
    body += `(?: (?:${appendix} )?(?:(?:copyright|\\(c\\)) .{1,300}? )*${boilerplate})?`;
  }
  return [id, { bullets, pattern: new RegExp("^" + body + "$") }];
}));

export function completeLicense(license, text) {
  const template = templates.get(license);
  if (!template) return false;
  const lines = text.split(/\r\n|\r|\n/);
  let start = 0;
  // Only blank lines precede Apache and CC0 bodies; notice-style licenses may
  // open with a title, copyright lines and a reservation of rights.
  while (start < lines.length && (!lines[start].trim() || noticePrefix.has(license) &&
    [titleLine, copyrightLine, reservedLine].some(line => line.test(lines[start])))) start++;
  return template.pattern.test(normalizeLicense(lines.slice(start).join("\n"), template.bullets));
}
// These license texts require the copyright notice to accompany copies.
// Apache-2.0 notices travel in NOTICE, which is delivered whenever present.
const copyrightRequired = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);

function readText(directory, name, required, fileName = name) {
  const file = path.join(directory, fileName);
  const entry = lstatSync(file, { throwIfNoEntry: false });
  if (!entry) {
    if (required) throw new Error("license text missing");
    return null;
  }
  if (!entry.isFile()) throw new Error("license or notice must be a regular file");
  if (entry.size > maxBytes) throw new Error("license or notice exceeds the byte limit");
  const bytes = readFileSync(file);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new Error("license or notice must be UTF-8 text"); }
  if (text.startsWith("﻿") || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) throw new Error("license or notice contains control characters");
  if (!text.trim()) throw new Error(required ? "license text missing" : "notice text missing");
  return { name, bytes, text, sha256: sha256(bytes) };
}

// Reads delivery material for a bundle listing. `signed` is the signed pair
// already verified for the listing; delivery must leave those bytes unchanged.
// `served` reads a directory that already holds the served names: official
// packs under static/rules and retained Hub downloads under assets/.
//
// A default license needs the complete canonical text and ignores `approval`.
// Any other OSI-approved SPDX identifier is delivered only under a maintainer
// approval ({ license, license_sha256 }, see license-approvals.mjs) naming the
// same identifier and the SHA-256 of the delivered LICENSE bytes. No approval,
// an unknown or deprecated identifier, or changed text is refused.
//
// `retained` serves a withdrawn listing whose accepted lifecycle record pins the
// license and digest. That record was admitted under the list of its day, so
// the current, mutable list is not consulted: the identifier must still be
// SPDX-shaped, and the pin (approval) must still match the delivered bytes.
export function readLicenseMaterial(directory, license, signed, { served = false, approval = null, retained = false } = {}) {
  const automatic = defaultLicenses.has(license);
  const usable = typeof license === "string" && (retained ? spdxId.test(license) : osiApprovedLicenses().has(license));
  if (!automatic && !usable) throw new Error("unsupported listing license");
  const fileName = name => served ? servedName[name] : name;
  for (const name of readdirSync(directory)) {
    if (candidateName.test(name) && name !== fileName(licenseFile) && name !== fileName(noticeFile)) {
      throw new Error("unrecognized license or notice file: " + name);
    }
  }
  const before = signed && [sha256(signed.bytes), sha256(signed.signature)];
  const licenseText = readText(directory, licenseFile, true, fileName(licenseFile));
  const notice = readText(directory, noticeFile, false, fileName(noticeFile));
  if (automatic) {
    if (!completeLicense(license, licenseText.text)) throw new Error("license text does not match the declared license");
  } else if (!(approval && approval.license === license && approval.license_sha256 === licenseText.sha256)) {
    throw new Error("license is not approved for this listing or its text changed");
  }
  if (copyrightRequired.has(license) &&
      ![licenseText, notice].some(file => file && /^[\t ]*(?:copyright(?:[\t ]*\(c\))?|©|\(c\))[\t ]+(?!(?:holders?|notice)\b)\S[^\r\n]*$/im.test(file.text))) {
    throw new Error("required copyright notice missing");
  }
  if (signed) {
    const declared = parse(signed.bytes.toString("utf8"), { maxAliasCount: 0 })?.license;
    if (declared !== undefined && declared !== license) throw new Error("listing license differs from the signed bundle");
    const after = [sha256(readFileSync(path.join(directory, "bundle.yaml"))), sha256(readFileSync(path.join(directory, "bundle.yaml.sig")))];
    if (before.some((digest, index) => digest !== after[index])) throw new Error("license delivery would alter signed bytes");
  }
  return { license: licenseText, notices: notice ? [notice] : [] };
}

// Record projection: text for HTML and Markdown, digests for downloads.
export function licenseRecord(route, material) {
  const file = ({ name, text, sha256: digest }) => ({ name, route: route + servedName[name], text, sha256: digest });
  return { license: file(material.license), notices: material.notices.map(file) };
}

export function licenseDownloads(route, material) {
  return [material.license, ...material.notices].map(({ name, bytes }) => ({ route: route + servedName[name], bytes }));
}
