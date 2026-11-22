export const WRANGLER_VERSION = "4.166.0";
// Filled by the staging operator after account verification. Empty fails closed.
export const STAGING_ACCOUNT_ID = "";
export const STAGING_WORKER = "pipelab-org-hub-staging";
export const STAGING_ORIGIN = "https://hub-staging.pipelab.org";

export function assertStagingTarget(account, worker = STAGING_WORKER) {
  if (!/^[a-f0-9]{32}$/.test(STAGING_ACCOUNT_ID)) throw new Error("staging account id not configured");
  if (account !== STAGING_ACCOUNT_ID || worker !== STAGING_WORKER) throw new Error("unexpected staging account or Worker");
  return { account, worker };
}
