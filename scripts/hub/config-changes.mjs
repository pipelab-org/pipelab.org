import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { parseDocument } from "yaml";

const vocabulary = JSON.parse(readFileSync(new URL("./config-vocabulary.json", import.meta.url)));
const isEntry = value => typeof value === "string" && value.length > 0;
const isList = value => Array.isArray(value) && value.every(isEntry) && new Set(value).size === value.length;

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
  if (!isList(current)) throw new Error("invalid base list for " + path);
  if (op === "set" && isList(value)) return value;
  if (isEntry(value)) {
    if (op === "append" && !current.includes(value)) return [...current, value];
    if (op === "remove" && current.includes(value)) return current.filter(entry => entry !== value);
  }
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
    return describeChange(spec, path, readValue(original, spec, parts), readValue(generated, spec, parts));
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
