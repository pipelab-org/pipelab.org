import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Input files are the published Unicode data named in data.json. No code is
// imported from upstream. Keep LICENSE.txt with the derived data.
const [confusablesPath, normalizationPath, output] = process.argv.slice(2);
if (!confusablesPath || !normalizationPath || !output) throw new Error("usage: generate.mjs CONFUSABLES NORMALIZATION OUTPUT");
const pinned = JSON.parse(readFileSync(new URL("./data.json", import.meta.url)));
const inputs = [confusablesPath, normalizationPath].map((file, i) => {
  const bytes = readFileSync(file);
  if (createHash("sha256").update(bytes).digest("hex") !== pinned.sources[i].sha256) throw new Error("Unicode source digest differs from pin");
  return bytes.toString("utf8");
});
const string = hex => hex.trim().split(/\s+/).filter(Boolean).map(cp => String.fromCodePoint(parseInt(cp, 16))).join("");
const fields = text => text.split("\n").map(line => line.split("#")[0].split(";").map(x => x.trim()));
const confusables = {};
for (const [from, to, type] of fields(inputs[0])) {
  if (!type) continue;
  if (type !== "MA" || from.includes(" ")) throw new Error("unsupported confusables mapping");
  confusables[string(from)] = string(to);
}
const nfkc_cf = [];
for (const [range, property, replacement] of fields(inputs[1])) {
  if (property !== "NFKC_CF") continue;
  const bounds = range.split("..").map(cp => parseInt(cp, 16));
  nfkc_cf.push([bounds[0], bounds.at(-1), string(replacement)]);
}
nfkc_cf.sort((a, b) => a[0] - b[0]);
for (let i = 1; i < nfkc_cf.length; i++) if (nfkc_cf[i - 1][1] >= nfkc_cf[i][0]) throw new Error("overlapping casefold ranges");
writeFileSync(output, JSON.stringify({ unicode: pinned.unicode, icu: pinned.icu, sources: pinned.sources, confusables, nfkc_cf }) + "\n");
