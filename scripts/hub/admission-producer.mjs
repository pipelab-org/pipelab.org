import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HubCheckFailure, HubUnavailable } from "./check-failure.mjs";
import { sha256, toolingIdentity } from "./evidence.mjs";
import { readGit, readRemoteRefs } from "./git-source.mjs";

const repository = "pipelab-org/pipelab.org";
const server = "https://github.com";
const main = "refs/heads/main";
const sha = /^[a-f0-9]{40}$/;
const workflows = {
  preflight: { path: ".github/workflows/hub-rules-preflight.yml", events: ["workflow_dispatch"] },
  admission: { path: ".github/workflows/hub-admission.yml", events: ["workflow_dispatch"] },
  sync: { path: ".github/workflows/sync-pipelab-hub.yml", events: ["schedule", "workflow_dispatch"] },
};

export function readSiteMain(options) {
  return readRemoteRefs(server + "/" + repository, [main], "invalid site main result", options).get(main);
}

// Design 3.2.1. Call from the trusted site checkout before reading any
// contribution objects. This establishes producer identity only.
export function admissionProducer({ mode, environment, root, engine }, readMain = readSiteMain) {
  const workflow = Object.hasOwn(workflows, mode) && workflows[mode];
  const { GITHUB_SERVER_URL: origin, GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: event,
    GITHUB_REF: ref, GITHUB_SHA: revision, GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_WORKFLOW_SHA: workflowSHA, GITHUB_RUN_ID: runId } = environment;
  if (!workflow || origin !== server || repo !== repository || !workflow.events.includes(event) ||
      ref !== main || !sha.test(revision ?? "") || workflowSHA !== revision ||
      workflowRef !== repository + "/" + workflow.path + "@" + main ||
      typeof runId !== "string" || !/^[1-9][0-9]*$/.test(runId)) {
    throw new HubCheckFailure("producer context does not identify the expected site main workflow");
  }

  let published;
  try {
    published = readMain();
  } catch (cause) {
    throw new HubUnavailable("site main unavailable from GitHub", { cause });
  }
  if (published !== revision) throw new HubCheckFailure("producer revision differs from current site main");
  const tooling = assertSiteCheckoutIdentity(root, revision, engine);
  return { ref, sha: revision, workflow: workflow.path, run_id: runId, tooling_identity: tooling };
}

export function assertSiteCheckoutIdentity(root, revision, engine) {
  if (!sha.test(revision ?? "")) throw new HubCheckFailure("site checkout requires a full commit SHA");
  const git = (...args) => readGit(root, args, { timeout: 15_000 });
  if (git("rev-parse", "HEAD").toString().trim() !== revision ||
      git("status", "--porcelain=v1", "--untracked-files=normal").length) {
    throw new HubCheckFailure("producer requires the exact clean site checkout");
  }

  const tooling = toolingIdentity(root, engine);
  if (tooling.scripts_tree !== git("rev-parse", revision + ":scripts/hub").toString().trim() ||
      tooling.package_lock_sha256 !== sha256(git("show", revision + ":package-lock.json"))) {
    throw new HubCheckFailure("producer tooling differs from the site commit");
  }
  return tooling;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, enginePath] = process.argv.slice(2);
  const preflight = mode === "preflight";
  if (process.argv.length !== (preflight ? 3 : 4) || !Object.hasOwn(workflows, mode)) {
    console.error("usage: admission-producer.mjs preflight | (admission|sync) ENGINE_IDENTITY_JSON");
    process.exit(2);
  }
  try {
    const root = path.resolve(import.meta.dirname, "../..");
    const engine = preflight ? undefined : JSON.parse(readFileSync(enginePath, "utf8"));
    const producer = admissionProducer({ mode, environment: process.env, root, engine });
    console.log(JSON.stringify({ producer }));
  } catch (error) {
    const reason = error instanceof HubCheckFailure ? error.message : "could not read producer inputs or checkout evidence";
    const unavailable = error instanceof HubUnavailable;
    console.error(unavailable ? "UNAVAILABLE: " + reason + ". Retry the check." : "NOT EVIDENCE: " + reason);
    process.exitCode = unavailable ? 3 : 1;
  }
}
