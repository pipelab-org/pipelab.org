import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindWorkload, measurementBindings, measurementArtifact, writeMeasurement, latencyVerdict, sha256, jsonBytes } from "./evidence.mjs";
import { runHubcheck } from "./generate.mjs";

// Report mode chooses no budget. The caller supplies a measured pair count;
// acceptance separately requires all three approved limits and fresh evidence.
export function benchmarkReport({ binary, request, reader, engine, workloadSpec, pairs, limits = {}, output, acceptance = false }) {
  const workload = bindWorkload({ rules: reader.declared, ...workloadSpec });
  const method = { pairs, interleave: ["baseline", "target"], gomaxprocs: 1, base_config_sha256: sha256(readFileSync(request.config)), measurement_policy: { min_confidence: "low", include_experimental: true } };
  const bindings = measurementBindings({ reader, workload, engine, method });
  const results = runHubcheck(binary, "bench", { ...request, pairs, workload: workload.harness, deadline_ns: limits.deadline_ns || 0 });
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
