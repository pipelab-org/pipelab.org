import { readFileSync } from "node:fs";
import { validateText } from "./validate.mjs";

const data = JSON.parse(readFileSync(new URL("./unicode/data.json", import.meta.url), "utf8"));
export const namingIdentity = { unicode: data.unicode, icu: data.icu, sources: data.sources };
export function assertNamingRuntime(versions = process.versions) {
  if (versions.unicode !== data.unicode || versions.icu !== data.icu) throw new Error("Hub naming requires the pinned Unicode and ICU versions");
}
function foldedRune(rune) {
  const cp = rune.codePointAt(0);
  let low = 0, high = data.nfkc_cf.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, [start, end, replacement] = data.nfkc_cf[middle];
    if (cp < start) high = middle - 1;
    else if (cp > end) low = middle + 1;
    else return replacement;
  }
  return rune;
}
function assertName(value) {
  assertNamingRuntime();
  if (typeof value !== "string" || !value || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error("invalid Hub name");
}
function casefold(value) {
  return [...value].map(foldedRune).join("").normalize("NFC");
}
function confusable(value) {
  return [...value.normalize("NFD")].map(rune => data.confusables[rune] ?? rune).join("");
}
// UTS #39 MA prototypes are not NFKC_CF-closed: U+0030 maps to U+004F and
// U+0049 maps to U+006C. Casefold, map, casefold joins 0 with o. Mapping
// before casefold keeps I mapped to l. Those orders do not commute, so brand
// refusal checks both. Hyphen removal is Hub naming policy.
export function nameSkeleton(value) {
  assertName(value);
  return casefold(confusable(casefold(value))).normalize("NFD").replaceAll("-", "");
}
function brandSkeletons(value) {
  assertName(value);
  return [nameSkeleton(value), casefold(confusable(value)).normalize("NFD").replaceAll("-", "")];
}
export function assertCommunityNames(listing, publisher) {
  validateText(publisher.name, "label");
  const reserved = ["pipelock", "pipelab"].map(nameSkeleton);
  for (const name of [listing.id, listing.bundle_name, listing.title, listing.maintainer.name, publisher.id, publisher.name]) {
    if (brandSkeletons(name).some(skeleton => reserved.some(brand => skeleton.includes(brand)))) throw new Error("community name resembles a reserved brand");
  }
}
// The lifecycle pipeline supplies its retained names as reservedNames. Current
// active records always share this comparison, regardless of signing tier.
export function assertCatalogNames(records, reservedNames = []) {
  const names = new Map(reservedNames.map(name => [nameSkeleton(name), "retained"]));
  for (const record of records) {
    for (const name of new Set([record.listing.id, record.listing.bundle_name].filter(Boolean))) {
      const skeleton = nameSkeleton(name), owner = names.get(skeleton);
      if (owner && owner !== record) throw new Error("Hub name collides with an existing or retained name");
      names.set(skeleton, record);
    }
  }
}
