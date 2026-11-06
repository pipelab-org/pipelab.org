import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindWorkload, measurementBindings, measurementArtifact, writeMeasurement, latencyVerdict, measurementMethod, goWorkloadSHA256, sha256, jsonBytes } from "./evidence.mjs";
import { runHubcheck, assertEngineIdentity } from "./generate.mjs";
import { officialWorkload } from "./workload.mjs";

// Report mode chooses no budget. The pair count is the count actually run.
// The reader and workload digest come from that same binary and bundle.
export function benchmarkReport({ binary, request, reader, engine, workloadSpec, repository, rulesRepository, pairs, executionTimeout, limits = {}, output, acceptance = false, root }) {
  if (reader !== undefined) throw new Error("reader is derived from the executed binary");
  if (!Number.isSafeInteger(pairs) || pairs <= 0) throw new Error("positive measurement pair count required");
  assertEngineIdentity({ root, engine, binary });
  const derived = runHubcheck(binary, "reader", { bundle_dir: request.bundle_dir, config: request.config, trusted_keys: request.trusted_keys });
  if (sha256(readFileSync(path.join(request.bundle_dir, "bundle.yaml"))) !== derived.bundle_sha256) throw new Error("executed bundle digest differs");
  const spec = workloadSpec ?? officialWorkload({ binary, request, reader: derived, repository, rulesRepository });
  const workload = bindWorkload({ rules: derived.declared, ...spec });
  const method = measurementMethod(root, request.config, pairs);
  const executedWorkloadSHA256 = goWorkloadSHA256(workload.harness);
  const bindings = measurementBindings({ reader: derived, workload, engine, method, executedWorkloadSHA256 });
  const results = runHubcheck(binary, "bench", { ...request, pairs, workload: workload.harness, deadline_ns: limits.deadline_ns || 0 }, { timeout: executionTimeout });
  if (results.workload_sha256 !== executedWorkloadSHA256) throw new Error("executed workload differs");
  const measured = measurementArtifact(bindings, results, { measured_at: new Date().toISOString() });
  const reference = writeMeasurement(path.join(output, "measurements"), measured);
  const report = { format: 1, reference, bindings, results, verdict: latencyVerdict(results, limits, { acceptance }) };
  mkdirSync(output, { recursive: true }); writeFileSync(path.join(output, "benchmark-report.json"), jsonBytes(report));
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("usage: benchmark-report.mjs INPUT_JSON");
  const report = benchmarkReport(JSON.parse(readFileSync(process.argv[2])));
  console.log(JSON.stringify({ status: report.verdict.status, reference: report.reference }));
  if (report.verdict.status === "fail") process.exitCode = 1;
}
