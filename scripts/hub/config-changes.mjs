import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { parseDocument } from "yaml";

const vocabulary = JSON.parse(readFileSync(new URL("./config-vocabulary.json", import.meta.url)));
// Match the pinned runtime's host identity. The released config checker
// still validates host spelling and wildcard breadth before scoring.
function domainIdentity(value) {
  if (typeof value !== "string" || !/^[\x00-\x7f]+$/.test(value)) return null;
  return value.trim().toLowerCase().replace(/\.+$/, "") || null;
}

function normalizedDomains(values) {
  if (!Array.isArray(values)) return null;
  const domains = values.map(domainIdentity);
  return domains.includes(null) || new Set(domains).size !== domains.length ? null : domains;
}

function readValue(document, spec, parts) {
  const value = document.getIn(parts);
  return value === undefined ? spec.default : value;
}

function updateValue(current, spec, { op, value, path }) {
  if (spec.kind !== "list") {
    const valid = spec.kind === "boolean" ? typeof value === "boolean" : spec.values.includes(value);
    if (op !== "set" || !valid) throw new Error("invalid operation for " + path);
    return value;
  }
  current = normalizedDomains(current);
  if (!current) throw new Error("invalid base list for " + path);
  if (op === "set") {
    const domains = normalizedDomains(value);
    if (domains) return domains;
  }
  const domain = domainIdentity(value);
  if (domain && op === "append" && !current.includes(domain)) return [...current, domain];
  if (domain && op === "remove" && current.includes(domain)) return current.filter(entry => entry !== domain);
  throw new Error("invalid list operation for " + path);
}

function describeChange(spec, path, before, after) {
  if (isDeepStrictEqual(before, after)) return [];
  const describe = (transition, value) => {
    const entry = spec.transitions[transition];
    if (!entry?.source) throw new Error("unclassified change: " + path + " " + transition);
    return { path, transition, effect: entry.effect, text: entry.text.replace("{value}", () => value), source: entry.source };
  };
  if (spec.kind !== "list") return [describe(String(before) + ":" + String(after))];
  const added = after.filter(value => !before.includes(value)).map(value => describe("added", value));
  const removed = before.filter(value => !after.includes(value)).map(value => describe("removed", value));
  return [...added, ...removed];
}

// Inputs use the existing Hub listing schema. The generated preset is trusted
// source. Every edit is limited to a named vocabulary path before it is applied.
export function applyConfigChanges(source, changes, preset) {
  const original = parseDocument(source);
  const generated = original.clone();
  if (original.errors.length) throw new Error("invalid generated preset");
  const originalValue = original.toJS();
  if (!originalValue || typeof originalValue !== "object" || Array.isArray(originalValue)) {
    throw new Error("invalid generated preset");
  }
  const affected = new Set();
  for (const change of changes) {
    if (!Object.hasOwn(vocabulary, change.path)) throw new Error("unclassified change: " + change.path);
    const spec = vocabulary[change.path];
    const parts = change.path.split(".");
    const current = readValue(generated, spec, parts);
    generated.setIn(parts, updateValue(current, spec, change));
    affected.add(change.path);
  }
  const transitions = [...affected].flatMap(path => {
    const spec = vocabulary[path], parts = path.split(".");
    const before = readValue(original, spec, parts), after = readValue(generated, spec, parts);
    return spec.kind === "list"
      ? describeChange(spec, path, normalizedDomains(before), normalizedDomains(after))
      : describeChange(spec, path, before, after);
  });
  if (!transitions.length) throw new Error("identical to the " + preset + " preset");
  const before = original.get("response_scanning", true);
  const after = generated.get("response_scanning", true);
  const toggled = transitions.some(change => change.path === "response_scanning.enabled");
  const otherChanges = transitions.some(change => change.path !== "response_scanning.enabled");
  if ((toggled && (before.get("action") !== "block" || after.get("action") !== "block")) ||
      (otherChanges && (before.get("enabled") !== true || after.get("enabled") !== true))) {
    throw new Error("unclassified change: combined response scanning settings");
  }
  const effective = original.clone();
  for (const changed of new Set(transitions.map(entry => entry.path))) {
    const parts = changed.split(".");
    effective.setIn(parts, generated.getIn(parts));
  }
  return {
    yaml: effective.toString(),
    changes: [...transitions.filter(entry => entry.effect === "weakens"), ...transitions.filter(entry => entry.effect !== "weakens")],
  };
}
