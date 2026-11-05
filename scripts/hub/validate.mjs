import { readFileSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
import { domainToUnicode } from "node:url";
import { parseDocument } from "yaml";

export const schema = JSON.parse(readFileSync(new URL("./schema/listing-v1.json", import.meta.url), "utf8"));

// Design §§2.3, 3.6: syntax only. Never fetch a contributor URL.
export function validateURL(value) {
  if (typeof value !== "string" || !/^https:\/\//.test(value) || /[\s\\\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error("URL must be canonical HTTPS");
  const authority = value.slice(8).split(/[/?#]/, 1)[0];
  const url = new URL(value);
  // DNS label/name bounds: RFC 1034 §3.1 (63 octets per label, 253 in text).
  if (url.protocol !== "https:" || url.username || url.password || url.port || authority !== url.hostname
      || isIP(url.hostname) || url.hostname.length > 253 || url.hostname.split(".").some(label => label.length > 63)
      || !url.hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error("URL requires a canonical DNS host, no credentials or explicit port");
  }
  return { url: value, host: url.hostname, decodedHost: domainToUnicode(url.hostname), punycode: url.hostname.split(".").some(label => label.startsWith("xn--")) };
}

// Design §3.6: normalized records carry both host spellings for display and
// the punycode flag for the admission report. No destination is contacted.
export function describeLinks(links) {
  return Object.fromEntries(Object.entries(links).map(([name, value]) => {
    const { host, decodedHost, punycode } = validateURL(value);
    return [name, { host, decoded_host: decodedHost, punycode }];
  }));
}

export function validateText(value, kind = "prose") {
  // Design §2.3: independent from generated descriptions and the template lint.
  if (value.includes("{{stat:")) throw new Error("site fact tokens are forbidden");
  if (kind === "command") {
    if (!/^[\x20-\x7e]+$/.test(value)) throw new Error("commands require single-line printable ASCII");
  } else {
    const shaped = kind === "prose" ? value.replace(/[\n\u200c\u200d]/gu, "") : value;
    if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\p{Default_Ignorable_Code_Point}]/u.test(shaped)) throw new Error("invisible or control characters are forbidden");
  }
  return value.normalize("NFC");
}

function check(value, rule, at) {
  if (rule.$ref) return check(value, schema.$defs[rule.$ref.split("/").at(-1)], at);
  if (rule.oneOf) {
    const matches = rule.oneOf.filter(option => { try { check(value, option, at); return true; } catch { return false; } });
    if (matches.length !== 1) throw new Error(`${at}: listing does not match exactly one type schema`);
    return;
  }
  if (rule.const !== undefined && value !== rule.const) throw new Error(`${at}: wrong constant`);
  if (rule.enum && !rule.enum.includes(value)) throw new Error(`${at}: unsupported value`);
  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at}: expected object`);
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) throw new Error(`${at}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(rule.properties, key)) throw new Error(`${at}: unknown field`);
      check(item, rule.properties[key], `${at}.${key}`);
    }
  } else if (rule.type === "array") {
    if (!Array.isArray(value) || value.length < (rule.minItems || 0) || value.length > (rule.maxItems ?? Infinity)) throw new Error(`${at}: invalid list length`);
    value.forEach((item, i) => check(item, rule.items, `${at}[${i}]`));
  } else if (rule.type === "string") {
    if (typeof value !== "string" || [...value].length < (rule.minLength || 0) || [...value].length > (rule.maxLength ?? Infinity)) throw new Error(`${at}: invalid text length`);
    validateText(value, rule["x-text"] || "label");
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) throw new Error(`${at}: invalid format`);
    if (rule.format === "uri") validateURL(value);
    if (rule.format === "artifact-path" && value.split("/").some(part => !part || part === "." || part === "..")) throw new Error(`${at}: invalid artifact path`);
    if (rule.format === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`${at}: invalid date`);
  } else if (rule.type && (typeof value !== rule.type || (rule.type === "number" && !Number.isFinite(value)))) throw new Error(`${at}: invalid type`);
}

function normalize(value) {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}

export function validateListing(input) {
  const normalized = normalize(input);
  check(normalized, schema, "listing");
  return normalized;
}

export function parseListing(source) {
  // Class 1 cap, design §17: bound YAML parsing to 64 KiB per metadata file.
  if (Buffer.byteLength(source) > 64 * 1024) throw new Error("listing exceeds 64 KiB");
  const doc = parseDocument(source, { uniqueKeys: true, schema: "core" });
  if (doc.errors.length) throw new Error("invalid listing YAML");
  return validateListing(doc.toJS({ maxAliasCount: 0 }));
}

// Design §3.6: referenced evidence is a local regular file, never a URL or symlink.
export function resolveArtifact(root, relative) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split("/").some(part => !part || part === "." || part === "..") || path.isAbsolute(relative)) throw new Error("invalid artifact path");
  const base = realpathSync(root);
  let cursor = base;
  for (const segment of relative.split("/")) {
    cursor = path.join(cursor, segment);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("artifact symlink refused");
  }
  if (!lstatSync(cursor).isFile()) throw new Error("artifact must be a regular file");
  return cursor;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const file of process.argv.slice(2)) parseListing(readFileSync(file, "utf8"));
    if (process.argv.length < 3) throw new Error("listing file required");
    console.log("hub listing validation: PASS");
  } catch {
    // Fixed output: no contributor text can create workflow commands in logs.
    console.error("hub listing validation: REFUSED");
    process.exitCode = 1;
  }
}
