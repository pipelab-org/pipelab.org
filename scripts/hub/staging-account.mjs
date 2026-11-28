import { createHash } from "node:crypto";
import { STAGING_WORKER } from "./staging-target.mjs";

// Reviewed on main. Empty fails closed.
export const STAGING_ACCOUNT_SHA256 = "";

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
