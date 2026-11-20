import { parse } from "yaml";
import { HubCheckFailure } from "./check-failure.mjs";
import { acquirePolicyBlobs } from "./policy-blobs.mjs";

// The existing Rules review workflow and its caller check are independently
// governed. An update to either protected workflow needs an updated review of
// its scope before it can be used as evidence for Hub admission.
const reviewedWorkflows = new Map([
  [".github/workflows/agent-review.yaml", "91fd8f29f00e6c27c3b137337cfbe4522b0ab5c0"],
  [".github/workflows/review-caller-contract.yaml", "e2c34780f0ce2784212436e780362bc159cded40"],
]);
const privilegedEvents = new Set(["pull_request_target", "workflow_run", "issue_comment", "pull_request_review_comment"]);
const advisoryPath = ".github/workflows/hub-validate.yml";
const ownedPaths = new Set(["/hub/", "/.github/", "/.github/CODEOWNERS", "/scripts/", "/rules/", "/published/", "/compatibility/"]);
const owner = /^@[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9_-]+)?$/;
const decode = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

function checkCodeowners(files) {
  if (files.length !== 1 || files[0].path !== ".github/CODEOWNERS") {
    throw new HubCheckFailure("Rules admission requires .github/CODEOWNERS");
  }
  const seen = new Set();
  for (const line of decode(files[0].bytes).split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const [pattern, ...owners] = text.split(/\s+/);
    if (!ownedPaths.has(pattern) || seen.has(pattern) || !owners.length || owners.some(name => !owner.test(name))) {
      throw new HubCheckFailure("Rules CODEOWNERS must use single explicit entries for the governed paths");
    }
    seen.add(pattern);
  }
  if (seen.size !== ownedPaths.size) throw new HubCheckFailure("Rules CODEOWNERS does not cover all governed paths");
}

function eventsOf(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.length && value.every(event => typeof event === "string")) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) return Object.keys(value);
  throw new HubCheckFailure("Rules workflow trigger is missing or invalid");
}

function contentsRead(permissions) {
  return permissions && typeof permissions === "object" && !Array.isArray(permissions) &&
    Object.entries(permissions).length === 1 && permissions.contents === "read";
}

export function assertRulesWorkflowPolicy({ workflows, codeowners }) {
  checkCodeowners(codeowners);
  for (const { path, object, bytes } of workflows) {
    const source = decode(bytes);
    const workflow = parse(source, { maxAliasCount: 0 });
    const events = eventsOf(workflow?.on);
    if (events.some(event => privilegedEvents.has(event)) && reviewedWorkflows.get(path) !== object) {
      throw new HubCheckFailure("Rules workflow has an unreviewed privileged trigger");
    }
    if (path !== advisoryPath) continue;
    const trigger = workflow.on?.pull_request;
    if (events.length !== 1 || events[0] !== "pull_request" ||
        trigger?.branches?.length !== 1 || trigger.branches[0] !== "main" ||
        trigger?.paths?.length !== 1 || trigger.paths[0] !== "hub/**" ||
        !contentsRead(workflow.permissions) || !Object.keys(workflow.jobs ?? {}).length ||
        Object.values(workflow.jobs).some(job => job.uses || job.secrets || job.environment ||
          (job.permissions && !contentsRead(job.permissions))) ||
        /\b(?:secrets|auto-merge|automerge)\b/i.test(source)) {
      throw new HubCheckFailure("Rules Hub advisory workflow must be read-only and limited to Hub pull requests");
    }
  }
  if (!workflows.some(file => file.path === advisoryPath)) throw new HubCheckFailure("Rules Hub advisory workflow is missing");
}

export function checkRulesWorkflowPolicy(repository, commit) {
  const inputs = acquirePolicyBlobs(repository, commit);
  assertRulesWorkflowPolicy(inputs);
  return { commit, workflows: inputs.workflows.length, codeowners: inputs.codeowners[0].object };
}
