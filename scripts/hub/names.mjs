import { readFileSync } from "node:fs";

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
// Unicode UAX #15 toNFKC_Casefold, then UTS #39 skeleton: NFD, map, NFD.
// Removing hyphens is Hub naming policy, not a Unicode equivalence claim.
export function nameSkeleton(value) {
  assertNamingRuntime();
  if (typeof value !== "string" || !value || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error("invalid Hub name");
  const folded = [...value].map(foldedRune).join("").normalize("NFC");
  return [...folded.normalize("NFD")].map(rune => data.confusables[rune] ?? rune).join("").normalize("NFD").replaceAll("-", "");
}
export function assertCommunityNames(listing, publisher) {
  const reserved = ["pipelock", "pipelab"].map(nameSkeleton);
  for (const name of [listing.id, listing.bundle_name, listing.title, listing.maintainer.name, publisher.id, publisher.name]) {
    if (reserved.some(brand => nameSkeleton(name).includes(brand))) throw new Error("community name resembles a reserved brand");
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
