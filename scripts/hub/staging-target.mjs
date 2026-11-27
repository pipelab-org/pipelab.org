import { createHash } from "node:crypto";

export const WRANGLER_VERSION = "4.166.0";
export const WRANGLER_DIST_INTEGRITY = "sha512-qMz0sHGXqEC0Va8T6dAaG0ggp9tCcuHHYMUQzRKbtZg6+MPAPb6oBu1757IaeugNJHPAz+twHiA+zDyXWQLsLw==";
export const STAGING_DIRECT_BUILD_COMMAND = "node scripts/hub/staging-workflow.mjs refuse-direct-deploy";
// Reviewed on main. Empty fails closed.
export const STAGING_ACCOUNT_SHA256 = "";
export const STAGING_WORKER = "pipelab-org-hub-staging";
export const STAGING_ORIGIN = "https://hub-staging.pipelab.org";

export const stagingAccountCommitment = account => createHash("sha256").update("hub-staging-account/v1\0" + account).digest("hex");

export function matchesStagingAccount(account) {
  return typeof account === "string" && /^[a-f0-9]{32}$/.test(account) && stagingAccountCommitment(account) === STAGING_ACCOUNT_SHA256;
}

export function requireStagingAccountCommitment() {
  if (!/^[a-f0-9]{64}$/.test(STAGING_ACCOUNT_SHA256)) throw new Error("staging account id not configured");
  return STAGING_ACCOUNT_SHA256;
}

export function assertStagingTarget(account, worker = STAGING_WORKER) {
  requireStagingAccountCommitment();
  if (!matchesStagingAccount(account) || worker !== STAGING_WORKER) throw new Error("unexpected staging account or Worker");
  return { account, worker };
}

// Canonical host comparison for request hostnames and route host patterns.
export function normalizeHostname(hostname) {
  return typeof hostname === "string" ? hostname.trim().toLowerCase().replace(/\.+$/, "") : "";
}
