import { createPublicKey } from "node:crypto";
import { canonical, sha256 } from "./evidence.mjs";
import { curlRequest } from "./staging-http.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;

export const closedVersionCommitment = value => sha256("hub-staging-closed-version/v1\0" + value);
export const ledgerRepositoryCommitment = (repository, nonce) => sha256(canonical(["hub-staging-ledger-repository/v1", repository, nonce]));

export function protectedClosedVersion(config, environment) {
  const value = environment.HUB_STAGING_CLOSED_VERSION;
  if (typeof value !== "string" || !uuid.test(value) || closedVersionCommitment(value) !== config.closed_version_sha256) {
    throw new Error("staging closed version does not match reviewed configuration");
  }
  return value;
}

export function protectedLedgerConfig(config, environment) {
  const repository = environment.HUB_STAGING_LEDGER_REPOSITORY, nonce = environment.HUB_STAGING_LEDGER_NONCE;
  if (typeof repository !== "string" || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) || typeof nonce !== "string" ||
      !digest.test(nonce) || ledgerRepositoryCommitment(repository, nonce) !== config.ledger?.repository_sha256) {
    throw new Error("staging ledger source does not match reviewed configuration");
  }
  return { ...config, ledger: { ...config.ledger, repository } };
}

export function clearanceKey(config) {
  const encoded = config.clearance_public_key_der_base64;
  if (!encoded) throw new Error("staging clearance key not configured");
  const bytes = Buffer.from(encoded, "base64");
  const key = createPublicKey({ key: bytes, type: "spki", format: "der" });
  if (key.asymmetricKeyType !== "ed25519" || !key.export({ type: "spki", format: "der" }).equals(bytes) || bytes.toString("base64") !== encoded) throw new Error("trusted Ed25519 clearance key required");
  return bytes;
}

async function readCaseFile(config, file, { token = process.env.CASE_LEDGER_TOKEN, request = curlRequest } = {}) {
  const { repository, ref } = config.ledger ?? {};
  if (!repository || !file || !ref) throw new Error("staging ledger source not configured");
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) || !/^[a-z0-9/_.-]+$/i.test(file) ||
      file.split("/").some(part => !part || part === "." || part === "..") || !/^[a-z0-9/_.-]+$/i.test(ref) || !token) throw new Error("staging ledger authority unavailable");
  try {
    const response = await request(`https://api.github.com/repos/${repository}/contents/${file}?ref=${encodeURIComponent(ref)}`, {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", "Cache-Control": "no-cache", "User-Agent": "pipelab-hub-staging" },
    });
    if (response.status !== 200 || response.headers.location || !response.body.length ||
        !/^(?:application\/vnd\.github\.raw(?:\+json)?|text\/plain|application\/octet-stream)(?:;|$)/i.test(response.headers["content-type"] ?? "")) throw new Error();
    return response.body;
  } catch { throw new Error("staging ledger authority unavailable"); }
}

export function createLedgerReader(config, options) {
  return async () => sha256(await readCaseFile(config, config.ledger?.path, options));
}

export function createClearanceReader(config, options) {
  return async packageSHA256 => {
    if (!/^[a-f0-9]{64}$/.test(packageSHA256 ?? "") || !config.clearance_directory) throw new Error("staging private clearance source not configured");
    const bytes = await readCaseFile(config, config.clearance_directory + "/" + packageSHA256 + ".json", options);
    let record;
    try { record = JSON.parse(bytes); } catch { throw new Error("staging private clearance malformed"); }
    if (record.format !== 1 || record.package_sha256 !== packageSHA256 || !/^[a-f0-9]{64}$/.test(record.ledger_revision ?? "")) throw new Error("staging private clearance binding differs");
    const signature = Buffer.from(record.clearance_signature_base64 ?? "", "base64");
    if (signature.length !== 64 || signature.toString("base64") !== record.clearance_signature_base64) throw new Error("staging private clearance signature malformed");
    return { signature, ledgerRevision: record.ledger_revision, receipt: record.upload_receipt,
      receiptSignature: Buffer.from(record.receipt_signature_base64 ?? "", "base64") };
  };
}

export function assertClearanceLedger(material, currentRevision) {
  if (material.ledgerRevision !== currentRevision) throw new Error("staging private clearance ledger differs");
}
