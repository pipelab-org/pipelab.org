import { stagingToolEnvironment } from "./staging-tool-environment.mjs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { appendFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { stagingFailureLabel } from "./staging-diagnostics.mjs";
import { curlRequest } from "./staging-http.mjs";

export function assertPreparedArtifact({ artifact, run }, { artifactID, runID, workflowSHA }) {
  if (!/^[1-9][0-9]*$/.test(artifactID ?? "") || !/^[1-9][0-9]*$/.test(runID ?? "") ||
      !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 ||
      artifact.id !== Number(artifactID) || artifact.name !== "hub-staging-package-" + run.run_attempt || artifact.expired !== false ||
      artifact.workflow_run?.id !== Number(runID) || artifact.workflow_run?.head_branch !== "main" || artifact.workflow_run?.head_sha !== workflowSHA ||
      run.id !== Number(runID) || run.repository?.full_name !== "pipelab-org/pipelab.org" || run.head_branch !== "main" || run.head_sha !== workflowSHA ||
      run.event !== "workflow_dispatch" || run.path !== ".github/workflows/hub-staging.yml" || run.status !== "completed" || run.conclusion !== "success" ||
      !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "")) throw new Error("untrusted prepared staging artifact");
  return artifactID;
}

export function assertArchiveDigest(bytes, digest) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "") || "sha256:" + createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("prepared staging archive digest differs");
}

export async function assertArchiveFileDigest(file, digest) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "") || "sha256:" + hash.digest("hex") !== digest) throw new Error("prepared staging archive digest differs");
}

export async function preparedArtifact({ environment = process.env, request = curlRequest } = {}) {
  const { PACKAGE_ARTIFACT_ID: artifactID, PACKAGE_RUN_ID: runID, GITHUB_SHA: workflowSHA, GITHUB_TOKEN: token } = environment;
  if (!/^[1-9][0-9]*$/.test(artifactID ?? "") || !/^[1-9][0-9]*$/.test(runID ?? "")) throw new Error("prepared staging artifact identity unavailable");
  const get = async suffix => {
    const response = await request("https://api.github.com/repos/pipelab-org/pipelab.org/actions/" + suffix, {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "pipelab-hub-staging", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (response.status !== 200 || response.headers.location) throw new Error("prepared staging artifact authority unavailable");
    return JSON.parse(response.body);
  };
  const artifact = await get("artifacts/" + artifactID), run = await get("runs/" + runID);
  assertPreparedArtifact({ artifact, run }, { artifactID, runID, workflowSHA });
  return artifact;
}

export async function downloadPreparedArtifact(destination, { environment = process.env, request = curlRequest } = {}) {
  const artifact = await preparedArtifact({ environment, request });
  if (existsSync(destination)) throw new Error("prepared staging artifact destination already exists");
  const parent = path.dirname(path.resolve(destination)); mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(path.join(parent, ".hub-artifact-")), archive = path.join(scratch, "package.zip");
  try {
    let response = await request(`https://api.github.com/repos/pipelab-org/pipelab.org/actions/artifacts/${artifact.id}/zip`, {
      headers: { Authorization: "Bearer " + environment.GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "pipelab-hub-staging" }, output: archive, maxBytes: artifact.size_in_bytes,
    });
    if (response.status === 302) {
      let signed;
      try { signed = new URL(response.headers.location); } catch { throw new Error("prepared staging archive redirect refused"); }
      if (signed.protocol !== "https:" || signed.username || signed.password || signed.hash ||
          ![".blob.core.windows.net", ".actions.githubusercontent.com"].some(suffix => signed.hostname.endsWith(suffix))) throw new Error("prepared staging archive redirect refused");
      response = await request(signed.href, { output: archive, maxBytes: artifact.size_in_bytes });
    }
    if (response.status !== 200 || response.headers.location) throw new Error("prepared staging archive download refused");
    await assertArchiveFileDigest(archive, artifact.digest);
    const extracted = path.join(scratch, "extracted"); mkdirSync(extracted);
    execFileSync("python3", [fileURLToPath(new URL("./extract-staging-archive.py", import.meta.url)), archive, extracted], { timeout: 120_000, stdio: "ignore", env: stagingToolEnvironment(process.env) });
    mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
    renameSync(extracted, destination);
    return artifact;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "download" && process.argv.length === 4) await downloadPreparedArtifact(path.resolve(process.argv[3]));
    else if (process.argv.length === 2) {
      const artifact = await preparedArtifact();
      appendFileSync(process.env.GITHUB_OUTPUT, "artifact_id=" + artifact.id + "\n");
    } else throw new Error();
  } catch (error) { console.error("Staging control refused: " + stagingFailureLabel(error, "artifact")); process.exitCode = 1; }
}
