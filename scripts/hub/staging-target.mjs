export const WRANGLER_VERSION = "4.166.0";
export const WRANGLER_DIST_INTEGRITY = "sha512-qMz0sHGXqEC0Va8T6dAaG0ggp9tCcuHHYMUQzRKbtZg6+MPAPb6oBu1757IaeugNJHPAz+twHiA+zDyXWQLsLw==";
export const STAGING_DIRECT_BUILD_COMMAND = "node scripts/hub/staging-workflow.mjs refuse-direct-deploy";
// Filled by the staging operator after account verification. Empty fails closed.
export const STAGING_ACCOUNT_ID = "";
export const STAGING_WORKER = "pipelab-org-hub-staging";
export const STAGING_ORIGIN = "https://hub-staging.pipelab.org";

export function assertStagingTarget(account, worker = STAGING_WORKER) {
  if (!/^[a-f0-9]{32}$/.test(STAGING_ACCOUNT_ID)) throw new Error("staging account id not configured");
  if (account !== STAGING_ACCOUNT_ID || worker !== STAGING_WORKER) throw new Error("unexpected staging account or Worker");
  return { account, worker };
}

// Canonical host comparison for request hostnames and route host patterns.
export function normalizeHostname(hostname) {
  return typeof hostname === "string" ? hostname.trim().toLowerCase().replace(/\.+$/, "") : "";
}
