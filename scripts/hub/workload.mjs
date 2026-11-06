import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bindWorkload, sha256 } from "./evidence.mjs";
import { runHubcheck } from "./generate.mjs";

const sources = JSON.parse(readFileSync(new URL("./bench-workload/official-sources.json", import.meta.url)));
const supplements = JSON.parse(readFileSync(new URL("./bench-workload/supplemental-negatives.json", import.meta.url)));
// R3-6: exact producer bytes at a revision with the SAME served bundle. Missing
// experimental negatives use versioned site inputs, never an empty scan.
export function officialOwnInputs({ repository, reader }) {
  const source = sources[reader.name];
  if (!source || source.bundle_sha256 !== reader.bundle_sha256) throw new Error("official fixture mapping is not current for served bytes");
  const show = file => execFileSync("git", ["-C", repository, "show", `${source.rules_commit}:${file}`], { stdio: ["ignore", "pipe", "ignore"] });
  if (sha256(show(`published/${reader.name}/bundle.yaml`)) !== reader.bundle_sha256) throw new Error("producer bundle differs from served bytes");
  const tree = new Set(execFileSync("git", ["-C", repository, "ls-tree", "-r", "--name-only", source.rules_commit, "fixtures"], { encoding: "utf8" }).trim().split("\n"));
  const result = [];
  for (const rule of reader.declared.filter(rule => rule.status !== "deprecated")) {
    const input = { rule_id: rule.id };
    for (const [group, suffix] of [["positive", "true"], ["negative", "false"]]) {
      const file = `fixtures/${reader.name}/${rule.type}/${rule.id}-${suffix}-positive.txt`;
      if (tree.has(file)) input[group] = [{ origin: `rules:${source.rules_commit}:${file}`, text: show(file).toString("utf8") }];
      else if (group === "negative" && rule.status === "experimental" && supplements.bundle_sha256 === reader.bundle_sha256 && supplements.rules[rule.id]) input[group] = [{ origin: `site:supplemental-negatives.json:${reader.bundle_sha256}:${rule.id}`, text: supplements.rules[rule.id] }];
      else throw new Error("missing official workload mapping");
    }
    result.push(input);
  }
  return result;
}
// ?9.1 uses Go regexp/syntax prefix discovery. Empty prefixes are an explicit
// held state until a reviewed near input exists; no unsourced fallback is used.
export function nearInput({ binary, regex, bytes }) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("source-backed workload cap required");
  const { prefix } = runHubcheck(binary, "prefix", { config: regex });
  const runes = [...prefix];
  if (runes.length < 2) throw new Error("near workload held: no usable required literal prefix");
  const unit = runes.slice(0, -1).join("") + " ";
  let buffer = Buffer.from(unit.repeat(Math.ceil(bytes / Buffer.byteLength(unit)))).subarray(0, bytes);
  let text;
  for (;;) { try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); break; } catch { buffer = buffer.subarray(0, buffer.length - 1); } }
  return { origin: "site:near-prefix-v1", text };
}
export function completeWorkload({ own, reader, clean, near, parameters, generator }) {
  const inputs = own.map(input => ({ ...input, clean, near: near[input.rule_id] || [] }));
  return bindWorkload({ rules: reader.declared, inputs, generator, parameters });
}
export function cleanInputs(directory, manifest) {
  return manifest.map(entry => {
    const file = path.join(directory, entry.file), text = readFileSync(file, "utf8");
    if (sha256(text) !== entry.sha256) throw new Error("clean snapshot digest differs");
    return { origin: entry.origin, text };
  });
}

export function prefixCoverage(binary, reader) {
  const covered = [], held = [];
  for (const rule of reader.declared.filter(rule => rule.status !== "deprecated")) {
    const result = runHubcheck(binary, "prefix", { config: rule.regex });
    ([...result.prefix].length >= 2 ? covered : held).push(rule.id);
  }
  return { covered, held, reason: "Go regexp/syntax Prog.Prefix returned fewer than two runes; removing the final rune leaves no nonempty repeated prefix." };
}

export function versionedCleanInputs() {
  const manifest = JSON.parse(readFileSync(new URL("./bench-workload/clean-manifest.json", import.meta.url)));
  return cleanInputs(new URL("./bench-workload/clean/", import.meta.url).pathname, manifest.files);
}
