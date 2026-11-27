import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import { canonical } from "./evidence.mjs";

// JWE Compact Serialization (RFC 7516) with RSA-OAEP-256 and A256GCM (RFC 7518).
const header = Buffer.from('{"alg":"RSA-OAEP-256","enc":"A256GCM"}').toString("base64url");

export function receiptEncryptionKey(config) {
  const encoded = config.receipt_encryption_public_key_der_base64;
  if (typeof encoded !== "string" || !encoded) throw new Error("staging receipt encryption key not configured");
  try {
    const der = Buffer.from(encoded, "base64");
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 2048 ||
        der.toString("base64") !== encoded || !key.export({ format: "der", type: "spki" }).equals(der)) throw new Error();
    return key;
  } catch {
    throw new Error("staging receipt encryption requires a canonical RSA public key of at least 2048 bits");
  }
}

export function encryptStagingReceipt(receipt, key) {
  const secret = randomBytes(32), iv = randomBytes(12);
  try {
    const wrapped = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, secret);
    const cipher = createCipheriv("aes-256-gcm", secret, iv);
    cipher.setAAD(Buffer.from(header, "ascii"));
    const ciphertext = Buffer.concat([cipher.update(canonical(receipt) + "\n", "utf8"), cipher.final()]);
    return [header, ...[wrapped, iv, ciphertext, cipher.getAuthTag()].map(bytes => bytes.toString("base64url"))].join(".");
  } finally {
    secret.fill(0);
  }
}
