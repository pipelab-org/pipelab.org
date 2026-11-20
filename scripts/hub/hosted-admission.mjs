import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { admissionProducer } from "./admission-producer.mjs";
import { rehearseCandidate } from "./candidate-rehearsal.mjs";
import { checkRulesWorkflowPolicy } from "./rules-workflow-policy.mjs";

function officialListingPolicy({ repository, head, changes }) {
  // This workflow admits official pack listings at launch. Publisher ownership
  // and notice delivery must be verified before community admission is enabled.
  if (!changes.length || changes.some(({ path }) => !/^hub\/listings\/bundles\/[a-z0-9-]+\.yaml$/.test(path))) {
    throw new Error("hosted admission currently requires an official bundle listing change");
  }
  return checkRulesWorkflowPolicy(repository, head);
}

export function hostedAdmission(input, environment = process.env) {
  const { root, engine } = input.source;
  const identify = () => admissionProducer({ mode: "admission", environment, root, engine });
  const producer = identify();
  const report = rehearseCandidate({ ...input, siteBase: producer.sha, measure: true }, officialListingPolicy);
  identify();
  if (report.verdict !== "LOCAL-ELIGIBLE") return { ...report, producer, mode: "hosted-admission" };

  const candidate = report.steps.candidate?.evidence;
  const measured = candidate?.fresh_measurements;
  if (!candidate?.policy || !measured || measured.length !== report.changes.length ||
      measured.some(pack => pack.verdict.status !== "pass")) {
    throw new Error("required admission evidence is incomplete");
  }
  return { ...report, mode: "hosted-admission", verdict: "ADMIT", producer, remaining: [] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("usage: hosted-admission.mjs INPUT_JSON");
  try {
    const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const root = path.resolve(import.meta.dirname, "../..");
    const report = hostedAdmission({ ...input, source: { ...input.source, root } });
    console.log(JSON.stringify(report, null, 2));
    if (report.verdict === "UNAVAILABLE") process.exitCode = 3;
    else if (report.verdict !== "ADMIT") process.exitCode = 1;
  } catch {
    console.error("Required Hub admission evidence could not be verified.");
    process.exitCode = 1;
  }
}
