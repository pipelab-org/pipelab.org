import { setTimeout as delay } from "node:timers/promises";
import { curlRequest } from "./staging-http.mjs";

export function assertEnvironmentPolicy(environment, policies) {
  const reviewers = environment.protection_rules?.find(rule => rule.type === "required_reviewers")?.reviewers;
  if (environment.name !== "hub-staging" || !Array.isArray(reviewers) || !reviewers.length || !reviewers.every(item => ["User", "Team"].includes(item.type) && Number.isSafeInteger(item.reviewer?.id) && item.reviewer.id > 0) ||
      environment.deployment_branch_policy?.protected_branches !== false || environment.deployment_branch_policy?.custom_branch_policies !== true ||
      policies.total_count !== 1 || policies.branch_policies?.length !== 1 || policies.branch_policies[0].name !== "main" || policies.branch_policies[0].type !== "branch") throw new Error("staging environment protection differs");
}

export async function verifyProtectedEnvironment({ environment = process.env, request = curlRequest, pause = delay } = {}) {
  if (environment.GITHUB_REPOSITORY !== "pipelab-org/pipelab.org" || environment.GITHUB_REF !== "refs/heads/main" || !environment.GITHUB_TOKEN) throw new Error("staging environment authority unavailable");
  const get = async suffix => {
    const url = "https://api.github.com/repos/pipelab-org/pipelab.org/environments/hub-staging" + suffix;
    const options = {
      headers: { Authorization: "Bearer " + environment.GITHUB_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "pipelab-hub-staging", "Cache-Control": "no-cache" },
    };
    // Retry the read, while still requiring fresh positive proof before any write.
    for (const backoff of [1000, 2000, 0]) {
      const response = await request(url, options).catch(error => {
        if (error.message !== "staging HTTPS request failed") throw error;
        return null;
      });
      if (response?.headers.location) break;
      if (response?.status === 200) {
        try { return JSON.parse(response.body); } catch { break; }
      }
      const retryAfter = response?.headers["retry-after"];
      const retryable = !response || [408, 429, 500, 502, 503, 504].includes(response.status) ||
        (response.status === 403 && retryAfter !== undefined);
      if (!backoff || !retryable) break;
      // A throttling window longer than the retry budget requires another run.
      if (retryAfter !== undefined && (!/^\d+$/.test(retryAfter) || Number(retryAfter) * 1000 > backoff)) break;
      await pause(backoff);
    }
    throw new Error("staging environment authority unavailable");
  };
  assertEnvironmentPolicy(await get(""), await get("/deployment-branch-policies?per_page=100"));
}
