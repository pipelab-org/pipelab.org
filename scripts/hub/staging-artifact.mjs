import { fileURLToPath } from "node:url";
import { appendFileSync } from "node:fs";
import { curlRequest } from "./staging-http.mjs";

export function assertPreparedArtifact({ artifact, run }, { artifactID, runID, workflowSHA }) {
  if (!/^[1-9][0-9]*$/.test(artifactID ?? "") || !/^[1-9][0-9]*$/.test(runID ?? "") ||
      artifact.id !== Number(artifactID) || artifact.name !== "hub-staging-package-" + run.run_attempt || artifact.expired !== false ||
      artifact.workflow_run?.id !== Number(runID) || artifact.workflow_run?.head_branch !== "main" || artifact.workflow_run?.head_sha !== workflowSHA ||
      run.id !== Number(runID) || run.repository?.full_name !== "pipelab-org/pipelab.org" || run.head_branch !== "main" || run.head_sha !== workflowSHA ||
      run.event !== "workflow_dispatch" || run.path !== ".github/workflows/hub-staging.yml" || run.status !== "completed" || run.conclusion !== "success" ||
      !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "")) throw new Error("untrusted prepared staging artifact");
  return artifactID;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { PACKAGE_ARTIFACT_ID: artifactID, PACKAGE_RUN_ID: runID, GITHUB_SHA: workflowSHA, GITHUB_TOKEN: token } = process.env;
  try {
    if (!/^[1-9][0-9]*$/.test(artifactID ?? "") || !/^[1-9][0-9]*$/.test(runID ?? "")) throw new Error();
    const get = async suffix => {
      const response = await curlRequest("https://api.github.com/repos/pipelab-org/pipelab.org/actions/" + suffix, {
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "pipelab-hub-staging", "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (response.status !== 200 || response.headers.location) throw new Error();
      return JSON.parse(response.body);
    };
    const artifact = await get("artifacts/" + artifactID), run = await get("runs/" + runID);
    assertPreparedArtifact({ artifact, run }, { artifactID, runID, workflowSHA });
    appendFileSync(process.env.GITHUB_OUTPUT, "artifact_id=" + artifactID + "\n");
  } catch { console.error("Prepared staging artifact provenance could not be verified."); process.exitCode = 1; }
}
