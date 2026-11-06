import { createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { enginePin } from "./build-harness.mjs";
import { sha256 } from "./evidence.mjs";

// Trust source is pinned production keyring bytes, never a listing assertion or
// the harness's claimed signer. No contributor-selected key URL is fetched.
export function officialKeys(repository) {
  const source = execFileSync("git", ["-C", repository, "show", `${enginePin.source_commit}:internal/rules/keyring.go`], { encoding: "utf8" });
  const match = source.match(/^var DefaultKeyringHex = "([a-f0-9,]+)"$/m);
  if (!match) throw new Error("unsupported official keyring declaration");
  return match[1].split(",");
}
function publicKey(hex) {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("invalid Ed25519 public key");
  // RFC 8410 Ed25519 SubjectPublicKeyInfo; raw key is exactly 32 bytes.
  return createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(hex, "hex")]), format: "der", type: "spki" });
}
export function verifyBundle({ bytes, signature, official, publisher = [] }) {
  const encoded = Buffer.from(signature).toString("utf8").trim();
  const sig = Buffer.from(encoded, "base64");
  if (sig.length !== 64 || sig.toString("base64") !== encoded) throw new Error("invalid detached signature encoding");
  for (const [trust_tier, keys] of [["official", official], ["third-party", publisher]]) {
    for (const key of keys) if (verify(null, bytes, publicKey(key), sig)) return { signer_fingerprint: key, trust_tier, bundle_sha256: sha256(bytes), signature_sha256: sha256(signature) };
  }
  throw new Error("untrusted bundle signature");
}
export function compareReaderSignature(reader, independent) {
  for (const key of ["signer_fingerprint", "trust_tier", "bundle_sha256"]) if (reader[key] !== independent[key]) throw new Error("independent signature verification disagrees");
}
export function readBundleFiles(directory) {
  return { bytes: readFileSync(`${directory}/bundle.yaml`), signature: readFileSync(`${directory}/bundle.yaml.sig`) };
}
