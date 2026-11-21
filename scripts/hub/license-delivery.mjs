import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { sha256 } from "./evidence.mjs";

// License and notice files are separate sibling files of the signed pair.
// They are served and rendered next to the bundle; signed bytes never change.
export const licenseFile = "LICENSE";
export const noticeFile = "NOTICE";
// Served names stay lowercase like every other Hub route.
export const servedName = { [licenseFile]: "license.txt", [noticeFile]: "notice.txt" };
const maxBytes = 64 * 1024;
const candidateName = /^(?:licen[cs]e|notice|copying)(?:[._-].*)?$/i;

// Identifying text from each DR-415 license. A declared identifier must match
// the delivered text; an unrecognized or mismatched text is refused.
const markers = {
  "Apache-2.0": text => text.includes("apache license") && text.includes("version 2.0"),
  "MIT": text => text.includes("permission is hereby granted, free of charge"),
  "BSD-2-Clause": text => text.includes("redistribution and use in source and binary forms") && !text.includes("neither the name"),
  "BSD-3-Clause": text => text.includes("redistribution and use in source and binary forms") && text.includes("neither the name"),
  "ISC": text => text.includes("permission to use, copy, modify, and/or distribute this software for any purpose") && text.includes("provided that the above copyright notice"),
  "0BSD": text => text.includes("permission to use, copy, modify, and/or distribute this software for any purpose") && !text.includes("provided that the above copyright notice"),
  "CC0-1.0": text => text.includes("cc0 1.0 universal"),
};
// These license texts require the copyright notice to accompany copies.
// Apache-2.0 notices travel in NOTICE, which is delivered whenever present.
const copyrightRequired = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);

function readText(directory, name, required) {
  const file = path.join(directory, name);
  const entry = lstatSync(file, { throwIfNoEntry: false });
  if (!entry) {
    if (required) throw new Error("license text missing");
    return null;
  }
  if (!entry.isFile()) throw new Error("license or notice must be a regular file");
  if (entry.size > maxBytes) throw new Error("license or notice exceeds the byte limit");
  const bytes = readFileSync(file);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("license or notice must be UTF-8 text"); }
  if (text.startsWith("﻿") || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("license or notice contains control characters");
  if (!text.trim()) throw new Error(required ? "license text missing" : "notice text missing");
  return { name, bytes, text, sha256: sha256(bytes) };
}

// Reads delivery material for a bundle listing. `signed` is the signed pair
// already verified for the listing; delivery must leave those bytes unchanged.
export function readLicenseMaterial(directory, license, signed) {
  if (!Object.hasOwn(markers, license)) throw new Error("unsupported listing license");
  for (const name of readdirSync(directory)) {
    if (candidateName.test(name) && name !== licenseFile && name !== noticeFile) {
      throw new Error("unrecognized license or notice file: " + name);
    }
  }
  const before = signed && [sha256(signed.bytes), sha256(signed.signature)];
  const licenseText = readText(directory, licenseFile, true);
  const notice = readText(directory, noticeFile, false);
  const normalized = licenseText.text.toLowerCase().replace(/\s+/g, " ");
  if (!markers[license](normalized)) throw new Error("license text does not match the declared license");
  if (copyrightRequired.has(license) &&
      ![licenseText, notice].some(file => file && /copyright/i.test(file.text))) {
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
