export const WRANGLER_VERSION = "4.166.0";
export const WRANGLER_DIST_INTEGRITY = "sha512-qMz0sHGXqEC0Va8T6dAaG0ggp9tCcuHHYMUQzRKbtZg6+MPAPb6oBu1757IaeugNJHPAz+twHiA+zDyXWQLsLw==";
export const STAGING_DIRECT_BUILD_COMMAND = "node scripts/hub/staging-workflow.mjs refuse-direct-deploy";
export const STAGING_WORKER = "pipelab-org-hub-staging";
export const STAGING_ORIGIN = "https://hub-staging.pipelab.org";

// Canonical host comparison for request hostnames and route host patterns.
export function normalizeHostname(hostname) {
  return typeof hostname === "string" ? hostname.trim().toLowerCase().replace(/\.+$/, "") : "";
}
