import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { sha256, contentDigest, goString } from "./evidence.mjs";
import { runHubcheck } from "./generate.mjs";
import { enginePin, toolDefinitionLimit } from "./build-harness.mjs";

const sources = JSON.parse(readFileSync(new URL("./bench-workload/official-sources.json", import.meta.url)));
const supplements = JSON.parse(readFileSync(new URL("./bench-workload/supplemental-negatives.json", import.meta.url)));
// Producer CONTRIBUTING.md and scripts/test-fixtures.go: each nonblank line
// is one input; there is no comment syntax. Preserve original line numbers.
export function producerInputs(text, origin) {
  // Blank follows Unicode White_Space (Go strings.TrimSpace / unicode.IsSpace).
  // JavaScript whitespace and String trim also strip U+FEFF, which would drop a BOM-only line.
  const inputs = text.split("\n").map((line, i) => ({ origin: `${origin}:L${i + 1}`, text: line.replace(/\r$/, "") })).filter(input => !/^\p{White_Space}*$/u.test(input.text));
  if (!inputs.length) throw new Error("empty official workload fixture");
  return inputs;
}
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
      if (tree.has(file)) input[group] = producerInputs(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(show(file)), `rules:${source.rules_commit}:${file}`);
      else if (group === "negative" && rule.status === "experimental" && supplements.bundle_sha256 === reader.bundle_sha256 && supplements.rules[rule.id]) input[group] = [{ origin: `site:supplemental-negatives.json:${reader.bundle_sha256}:${rule.id}`, text: supplements.rules[rule.id] }];
      else throw new Error("missing official workload mapping");
    }
    result.push(input);
  }
  return result;
}
export const NEAR_GENERATOR = "site:fixture-span-truncation-v1";

// These are the blocking presets used by the readability contract. The response
// ceiling is their largest configured fetch body; outbound DLP uses the base
// claude-code preset's request-body cap. Record the exact source bytes as well.
export function workloadCaps(repository) {
  const presets = ["claude-code", "strict", "hostile-model"].map(name => {
    const file = `configs/${name}.yaml`;
    const bytes = execFileSync("git", ["-C", repository, "show", `${enginePin.source_commit}:${file}`]);
    const config = parse(bytes.toString("utf8"));
    const responseMB = config.fetch_proxy?.max_response_mb;
    if (!Number.isSafeInteger(responseMB) || responseMB <= 0) throw new Error("missing source response cap");
    return { name, file, sha256: sha256(bytes), response_mb: responseMB, request_bytes: config.request_body_scanning?.max_body_bytes };
  });
  const responseBytes = Math.max(...presets.map(preset => preset.response_mb)) * 1024 * 1024;
  const requestBytes = presets.find(preset => preset.name === "claude-code").request_bytes;
  if (!Number.isSafeInteger(responseBytes) || !Number.isSafeInteger(requestBytes) || requestBytes <= 0) throw new Error("missing source request cap");
  return { engine_commit: enginePin.source_commit, presets, tool_definition: toolDefinitionLimit(repository), dlp: requestBytes, injection: responseBytes, "tool-poison": responseBytes };
}

function toolEnvelope(rule, text) {
  const name = rule.scan_field === "name" ? text : "benchmark-tool";
  const description = rule.scan_field === "name" ? "benchmark" : text;
  // encoding/json orders string map keys; this is the same envelope as hubcheck.
  return `{"id":1,"jsonrpc":"2.0","result":{"tools":[{"description":${goString(description)},"inputSchema":{"type":"object"},"name":${goString(name)}}]}}`;
}

export function repeatNear(rule, seed, bytes, toolTextLimit) {
  if (!seed || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("invalid near seed or cap");
  const unit = seed + " ", tool = rule.type === "tool-poison";
  let remaining = bytes - (tool ? Buffer.byteLength(toolEnvelope(rule, "")) : 0);
  let textRemaining = bytes;
  const fixedToolText = Buffer.byteLength(rule.scan_field === "name" ? "benchmark" : "benchmark-tool") + Buffer.byteLength('{"type":"object"}');
  if (tool) {
    if (!Number.isSafeInteger(toolTextLimit) || toolTextLimit <= fixedToolText) throw new Error("native tool-definition limit required");
    textRemaining = toolTextLimit - fixedToolText;
  }
  if (remaining <= 0) throw new Error("near cap cannot contain the transport envelope");
  const cost = text => Buffer.byteLength(tool ? goString(text) : text) - (tool ? 2 : 0);
  const copies = Math.min(Math.floor(remaining / cost(unit)), Math.floor(textRemaining / Buffer.byteLength(unit)));
  remaining -= copies * cost(unit);
  textRemaining -= copies * Buffer.byteLength(unit);
  let tail = "";
  for (const rune of unit) {
    if (cost(rune) > remaining || Buffer.byteLength(rune) > textRemaining) break;
    tail += rune; remaining -= cost(rune); textRemaining -= Buffer.byteLength(rune);
  }
  const text = unit.repeat(copies) + tail;
  return { text, transportBytes: Buffer.byteLength(tool ? toolEnvelope(rule, text) : text), toolTextBytes: tool ? Buffer.byteLength(text) + fixedToolText : 0 };
}

// The native helper uses Go's (?i) expression and the production scanner. Only
// its small derivation record crosses stdout; reconstruct and hash-check the
// capped text here instead of multiplying JSON output size for escaped data.
export function nearInput({ binary, request, rule, positive, bytes, toolTextLimit }) {
  if (!rule?.id || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("source-backed workload cap required");
  const evidence = runHubcheck(binary, "near", { ...request, rule_id: rule.id, positive, cap_bytes: bytes });
  if (evidence.status !== "generated") throw new Error(`near workload held for ${rule.id}: ${evidence.reason || "incomplete native derivation"}`);
  if (evidence.generator !== NEAR_GENERATOR || evidence.rule_id !== rule.id || evidence.cap_bytes !== bytes || evidence.raw_negative !== true || typeof evidence.production_target_match !== "boolean") throw new Error("near workload derivation differs");
  const fixture = positive.find(input => input.origin === evidence.fixture_origin);
  if (!fixture || sha256(fixture.text) !== evidence.fixture_sha256) throw new Error("near producer binding differs");
  const fixtureBytes = Buffer.from(fixture.text);
  const { span_start: start, span_end: end, trimmed_runes: trimmed } = evidence;
  if (![start, end, trimmed].every(Number.isSafeInteger) || start < 0 || end <= start || end > fixtureBytes.length || trimmed <= 0) throw new Error("near producer span differs");
  const span = [...new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(fixtureBytes.subarray(start, end))];
  if (trimmed >= span.length || span.slice(0, -trimmed).join("") !== evidence.seed) throw new Error("near producer span differs");
  if (rule.type === "tool-poison" && evidence.tool_definition_cap_bytes !== toolTextLimit) throw new Error("native tool-definition limit differs");
  const { text, transportBytes, toolTextBytes } = repeatNear(rule, evidence.seed, bytes, toolTextLimit);
  if (!text || sha256(text) !== evidence.text_sha256 || Buffer.byteLength(text) !== evidence.text_bytes || transportBytes !== evidence.transport_bytes || transportBytes > bytes || toolTextBytes !== evidence.tool_definition_text_bytes) throw new Error("near transport bytes differ");
  return { origin: `${NEAR_GENERATOR}:${contentDigest(evidence)}`, text, evidence };
}

export function officialWorkload({ binary, request, reader, repository, rulesRepository }) {
  const own = officialOwnInputs({ repository: rulesRepository, reader });
  const caps = workloadCaps(repository), clean = versionedCleanInputs();
  caps.config_sha256 = reader.config_sha256;
  caps.effective_config = reader.workload_caps;
  for (const type of ["dlp", "injection", "tool-poison"]) {
    const effective = caps.effective_config?.[type];
    if (!Number.isSafeInteger(effective) || effective <= 0) throw new Error("effective workload cap required");
    caps[type] = Math.min(caps[type], effective);
  }
  const near = {}, derivations = {};
  for (const input of own) {
    const rule = reader.declared.find(rule => rule.id === input.rule_id);
    const generated = nearInput({ binary, request, rule, positive: input.positive, bytes: caps[rule.type], toolTextLimit: caps.tool_definition.bytes });
    near[rule.id] = [{ origin: generated.origin, text: generated.text }];
    derivations[rule.id] = generated.evidence;
  }
  return {
    generator: "site:fixture-span-workload-v1",
    parameters: { source: sources[reader.name], caps, derivations },
    inputs: own.map(input => ({ ...input, clean, near: near[input.rule_id] })),
  };
}
export function cleanInputs(directory, manifest) {
  return manifest.map(entry => {
    const file = path.join(directory, entry.file), text = readFileSync(file, "utf8");
    if (sha256(text) !== entry.sha256) throw new Error("clean snapshot digest differs");
    return { origin: entry.origin, text };
  });
}

export function versionedCleanInputs() {
  const manifest = JSON.parse(readFileSync(new URL("./bench-workload/clean-manifest.json", import.meta.url)));
  return cleanInputs(fileURLToPath(new URL("./bench-workload/clean/", import.meta.url)), manifest.files);
}
