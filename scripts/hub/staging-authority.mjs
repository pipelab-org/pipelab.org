import { createPublicKey } from "node:crypto";
import { sha256 } from "./evidence.mjs";
import { curlRequest } from "./staging-http.mjs";

export function clearanceKey(config) {
  const encoded = config.clearance_public_key_der_base64;
  if (!encoded) throw new Error("staging clearance key not configured");
  const bytes = Buffer.from(encoded, "base64");
  const key = createPublicKey({ key: bytes, type: "spki", format: "der" });
  if (key.asymmetricKeyType !== "ed25519" || !key.export({ type: "spki", format: "der" }).equals(bytes) || bytes.toString("base64") !== encoded) throw new Error("trusted Ed25519 clearance key required");
  return bytes;
}

export function createLedgerReader(config, { token = process.env.CASE_LEDGER_TOKEN, request = curlRequest } = {}) {
  return async () => {
    const { repository, path: file, ref } = config.ledger ?? {};
    if (!repository || !file || !ref) throw new Error("staging ledger source not configured");
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) || !/^[a-z0-9/_.-]+$/i.test(file) ||
        file.split("/").some(part => !part || part === "." || part === "..") || !/^[a-z0-9/_.-]+$/i.test(ref) || !token) throw new Error("staging ledger authority unavailable");
    try {
      const response = await request(`https://api.github.com/repos/${repository}/contents/${file}?ref=${encodeURIComponent(ref)}`, {
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", "Cache-Control": "no-cache", "User-Agent": "pipelab-hub-staging" },
      });
      if (response.status !== 200 || response.headers.location || !response.body.length ||
          !/^(?:application\/vnd\.github\.raw(?:\+json)?|text\/plain|application\/octet-stream)(?:;|$)/i.test(response.headers["content-type"] ?? "")) throw new Error();
      return sha256(response.body);
    } catch { throw new Error("staging ledger authority unavailable"); }
  };
}
