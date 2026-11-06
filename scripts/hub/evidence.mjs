import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  if (typeof value === "number" && !Number.isFinite(value) || value === undefined) throw new Error("non-finite or undefined evidence");
  return JSON.stringify(value);
}
export const contentDigest = value => sha256(canonical(value));
export const jsonBytes = value => canonical(value) + "\n";

// Git tree object identity from current bytes, including uncommitted new files.
// Git's tree encoding is mode SP name NUL raw-object-id, sorted by name.
export function treeIdentity(directory) {
  const gitHash = (kind, bytes) => createHash("sha1").update(`${kind} ${bytes.length}\0`).update(bytes).digest();
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.isDirectory() ? "/" : "")), Buffer.from(b.name + (b.isDirectory() ? "/" : ""))));
  const parts = entries.map(entry => {
    const file = path.join(directory, entry.name), stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) throw new Error("non-regular tooling input");
    const mode = entry.isDirectory() ? "40000" : stat.mode & 0o111 ? "100755" : "100644";
    const hash = entry.isDirectory() ? Buffer.from(treeIdentity(file), "hex") : gitHash("blob", readFileSync(file));
    return Buffer.concat([Buffer.from(`${mode} ${entry.name}\0`), hash]);
  });
  return gitHash("tree", Buffer.concat(parts)).toString("hex");
}
export function toolingIdentity(root, engine) {
  return { scripts_tree: treeIdentity(path.join(root, "scripts/hub")), package_lock_sha256: sha256(readFileSync(path.join(root, "package-lock.json"))), engine };
}

// R3-5: origins and exact effective bytes are part of the workload binding.
export function bindWorkload({ rules, inputs, generator, parameters }) {
  const expected = rules.filter(rule => rule.status !== "deprecated").map(rule => rule.id).sort();
  if (!generator || !parameters) throw new Error("workload generator identity required");
  const actual = inputs.map(input => input.rule_id).sort();
  if (canonical(actual) !== canonical(expected) || new Set(actual).size !== actual.length) throw new Error("workload identity mapping differs");
  const bound = [...inputs].sort((a, b) => a.rule_id.localeCompare(b.rule_id)).map(input => {
    const out = { rule_id: input.rule_id };
    for (const group of ["positive", "negative", "clean", "near"]) {
      if (!Array.isArray(input[group]) || !input[group].length) throw new Error("missing complete rule workload");
      out[group] = input[group].map(item => {
        if (!item || typeof item.origin !== "string" || !item.origin || typeof item.text !== "string" || !item.text) throw new Error("missing workload bytes or origin");
        return { origin: item.origin, text: item.text, sha256: sha256(item.text) };
      });
    }
    return out;
  });
  const binding = { generator, parameters, inputs: bound };
  return { digest: contentDigest(binding), binding, harness: bound.map(input => Object.fromEntries(Object.entries(input).map(([key, value]) => [key, key === "rule_id" ? value : value.map(item => item.text)]))) };
}

function timingVerdict(timing, deadline) {
  if (!timing || typeof timing.completed !== "boolean" || typeof timing.timeout !== "boolean" || !Array.isArray(timing.samples_ns) || !timing.samples_ns.length) throw new Error("incomplete timing evidence");
  if (timing.samples_ns.some(n => !Number.isSafeInteger(n) || n <= 0) || timing.maximum_ns !== Math.max(...timing.samples_ns)) throw new Error("invalid timing maximum");
  return timing.completed && !timing.timeout && (deadline === null || timing.maximum_ns <= deadline);
}
export function latencyVerdict(results, limits, { acceptance = false } = {}) {
  const values = [limits?.rule_ratio, limits?.bundle_ratio, limits?.deadline_ns];
  const unset = values.some(value => value === null || value === undefined);
  if (values.some((value, index) => value !== null && value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || index === 2 && !Number.isSafeInteger(value)))) throw new Error("invalid latency limit");
  if (acceptance && unset) throw new Error("latency limits unset");
  if (!results || !results.rules || !Object.keys(results.rules).length || !results.bundle) throw new Error("missing timing results");
  const checks = {};
  for (const [id, measured] of [...Object.entries(results.rules), ["$bundle", results.bundle]]) {
    if (!Number.isFinite(measured.ratio)) throw new Error("invalid measured ratio");
    const median = samples => { const sorted = [...samples].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
    // Validate both classes before reading their medians; absence is never zero.
    timingVerdict(measured.baseline, null); timingVerdict(measured.target, null);
    if (measured.baseline.samples_ns.length !== measured.target.samples_ns.length || measured.ratio !== (median(measured.target.samples_ns) - median(measured.baseline.samples_ns)) / median(measured.baseline.samples_ns)) throw new Error("timing ratio differs from samples");
    const limit = id === "$bundle" ? limits?.bundle_ratio : limits?.rule_ratio;
    const pass = timingVerdict(measured.baseline, limits?.deadline_ns ?? null) && timingVerdict(measured.target, limits?.deadline_ns ?? null) && (limit == null || measured.ratio <= limit);
    checks[id] = pass;
  }
  return { status: Object.values(checks).some(pass => !pass) ? "fail" : unset ? "unassessed" : "pass", checks };
}
export function measurementArtifact(bindings, results, provenance = {}) {
  for (const key of ["bundle_sha256", "workload_sha256", "engine", "method"]) if (!bindings[key]) throw new Error("missing measurement binding");
  latencyVerdict(results, {});
  if (bindings.measured_rule_ids && canonical(Object.keys(results.rules).sort()) !== canonical(bindings.measured_rule_ids)) throw new Error("measurement rule identities differ");
  if (bindings.method?.pairs && [...Object.values(results.rules), results.bundle].some(measured => measured.target.samples_ns.length !== bindings.method.pairs || measured.baseline.samples_ns.length !== bindings.method.pairs)) throw new Error("measurement pair count differs");
  const artifact = { format: 1, bindings, results, provenance };
  // Evidence identity includes results: fresh runs sharing bindings can coexist.
  return { id: contentDigest(artifact), artifact };
}
export function writeMeasurement(directory, measured) {
  if (measured.id !== contentDigest(measured.artifact)) throw new Error("measurement identity mismatch");
  const file = path.join(directory, `${measured.id}.json`), bytes = jsonBytes(measured.artifact);
  mkdirSync(directory, { recursive: true });
  if (existsSync(file)) { if (readFileSync(file, "utf8") !== bytes) throw new Error("immutable measurement differs"); }
  else writeFileSync(file, bytes, { flag: "wx" });
  return { artifact_id: measured.id, artifact_sha256: sha256(bytes), bindings_sha256: contentDigest(measured.artifact.bindings) };
}
export function acceptedMeasurement(directory, reference, bindings, limits, options) {
  if (!/^[a-f0-9]{64}$/.test(reference?.artifact_id || "")) throw new Error("missing accepted measurement reference");
  const bytes = readFileSync(path.join(directory, `${reference.artifact_id}.json`));
  const artifact = JSON.parse(bytes);
  if (contentDigest(artifact) !== reference.artifact_id || sha256(bytes) !== reference.artifact_sha256) throw new Error("measurement content mismatch");
  if (canonical(artifact.bindings) !== canonical(bindings) || contentDigest(bindings) !== reference.bindings_sha256) throw new Error("measurement stale");
  measurementArtifact(artifact.bindings, artifact.results, artifact.provenance);
  return { artifact, verdict: latencyVerdict(artifact.results, limits, options) };
}
export function assertRegeneration(committed, regenerated) {
  if (!Buffer.from(committed).equals(Buffer.from(regenerated))) throw new Error("generated hub records differ");
}

export function measurementBindings({ reader, workload, engine, method }) {
  if (!Number.isSafeInteger(method?.pairs) || method.pairs <= 0 || method.gomaxprocs !== 1 || JSON.stringify(method.interleave) !== '["baseline","target"]' || method.measurement_policy?.min_confidence !== "low" || method.measurement_policy?.include_experimental !== true) throw new Error("measurement method is not configured");
  return { bundle_sha256: reader.bundle_sha256, measured_rule_ids: reader.declared.filter(rule => rule.status !== "deprecated").map(rule => rule.id).sort(), workload_sha256: workload.digest, engine, method };
}
