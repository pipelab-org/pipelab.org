// Signer for Hub staging clearance records. The signature binds the exact
// staging package to the current case record as a service record.
// Deployment approval remains in the protected GitHub environment.
//
// Two key sources: --key-credential NAME reads an unencrypted PKCS#8 key that
// systemd delivers in CREDENTIALS_DIRECTORY (LoadCredentialEncrypted), and
// --key FILE reads a passphrase-encrypted key and prompts in a terminal. It
// needs only Node.js and this checkout: no npm install, network or repository
// credentials. The output is one file for the private ledger's
// clearance directory. Staging CI verifies it against the public key in
// staging-authority.json and the ledger's current revision.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { STAGING_WORKER } from "./staging-target.mjs";
import { matchesStagingAccount, requireStagingAccountCommitment } from "./staging-account.mjs";

// These must stay byte-identical to deployment-evidence.mjs and
// cloudflare-staging.mjs. The clearance tests pin both.
export const CLEARANCE_SCOPE = "pipelab-hub-publication-clearance/v1";
export const RECEIPT_SCOPE = "pipelab-hub-staging-upload/v1";
const RECEIPT_FIELDS = ["account", "package_sha256", "scope", "version", "version_script_etag", "worker", "worker_sha256"];
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  if (typeof value === "number" && !Number.isFinite(value) || value === undefined) throw new Error("non-finite or undefined evidence");
  return JSON.stringify(value);
}

export function trustedPublicKey(config) {
  const encoded = config?.clearance_public_key_der_base64;
  if (!encoded) throw new Error("staging clearance key not configured");
  const bytes = Buffer.from(encoded, "base64");
  const key = createPublicKey({ key: bytes, type: "spki", format: "der" });
  if (key.asymmetricKeyType !== "ed25519" || !key.export({ type: "spki", format: "der" }).equals(bytes) || bytes.toString("base64") !== encoded) {
    throw new Error("trusted Ed25519 clearance key required");
  }
  return bytes;
}

// CI hashes the ledger file's raw bytes. A checkout that rewrote line endings
// would sign a revision CI never sees, so refuse it here with a clear reason.
export function ledgerRevision(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error("ledger file required");
  if (bytes.includes(0x0d)) throw new Error("ledger file has carriage returns; check it out without line-ending conversion");
  let ledger;
  try { ledger = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("ledger file is not JSON"); }
  if (ledger?.format !== 1 || !Array.isArray(ledger.cases)) throw new Error("ledger file is not a format 1 case ledger");
  return { revision: sha256(bytes), cases: ledger.cases.length };
}

export function assertReceipt(receipt, packageSHA256) {
  requireStagingAccountCommitment();
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || canonical(Object.keys(receipt).sort()) !== canonical(RECEIPT_FIELDS)) {
    throw new Error("upload receipt fields differ");
  }
  if (receipt.scope !== RECEIPT_SCOPE || !matchesStagingAccount(receipt.account) || receipt.worker !== STAGING_WORKER ||
      typeof receipt.version !== "string" || !uuid.test(receipt.version) ||
      typeof receipt.package_sha256 !== "string" || !digest.test(receipt.package_sha256) ||
      typeof receipt.worker_sha256 !== "string" || !digest.test(receipt.worker_sha256) ||
      typeof receipt.version_script_etag !== "string" || !receipt.version_script_etag) throw new Error("upload receipt is not a staging receipt");
  if (receipt.package_sha256 !== packageSHA256) throw new Error("upload receipt is for a different package");
}

export function clearancePayload(packageSHA256, revision) {
  if (typeof packageSHA256 !== "string" || !digest.test(packageSHA256) || typeof revision !== "string" || !digest.test(revision)) throw new Error("package digest and ledger revision required");
  return Buffer.from(canonical({ scope: CLEARANCE_SCOPE, artifact_sha256: packageSHA256, ledger_revision: revision }));
}

// A --key file must be passphrase-encrypted PKCS#8, so a stray copy cannot sign.
export function assertEncryptedKey(pem) {
  const text = Buffer.isBuffer(pem) ? pem.toString("utf8") : String(pem ?? "");
  const blocks = text.match(/-----BEGIN [A-Z0-9 ]+-----/g) ?? [];
  if (blocks.length !== 1 || blocks[0] !== "-----BEGIN ENCRYPTED PRIVATE KEY-----") throw new Error("passphrase-encrypted PKCS#8 private key required");
  return text;
}

export function loadPrivateKey(pem, passphrase) {
  const text = assertEncryptedKey(pem);
  if (!Buffer.isBuffer(passphrase) || !passphrase.length) throw new Error("passphrase required");
  try { return createPrivateKey({ key: text, format: "pem", passphrase }); } catch { throw new Error("wrong passphrase or unreadable private key"); }
}

// Reads the credential delivered to the unit. The caller must arrange the
// systemd credential; the directory environment variable is not proof of it.
export function loadCredentialKey(name, environment = process.env) {
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(name)) throw new Error("credential name must be a plain systemd credential name");
  const directory = environment.CREDENTIALS_DIRECTORY;
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new Error("credential directory unavailable; run under systemd with LoadCredentialEncrypted");
  let text;
  try { text = readFileSync(path.join(directory, name), "utf8"); } catch { throw new Error(`credential ${name} unavailable`); }
  const blocks = text.match(/-----BEGIN [A-Z0-9 ]+-----/g) ?? [];
  if (blocks.length !== 1 || blocks[0] !== "-----BEGIN PRIVATE KEY-----") throw new Error(`credential ${name} is not a single PKCS#8 private key`);
  try { return createPrivateKey({ key: text, format: "pem" }); } catch { throw new Error(`credential ${name} is not a readable private key`); }
}

// Reads one line from the terminal without echo. Refuses pipes, files and
// scripts: the passphrase never comes from arguments, environment or stdin data.
export function promptPassphrase({ input = process.stdin, output = process.stderr, prompt = "Clearance key passphrase: " } = {}) {
  if (!input?.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("passphrase needs an interactive terminal; run the signer directly in a terminal"));
  }
  return new Promise((resolve, reject) => {
    const bytes = [], wasRaw = Boolean(input.isRaw);
    const finish = error => {
      input.removeListener("data", onData);
      input.setRawMode(wasRaw); input.pause(); output.write("\n");
      const value = Buffer.from(bytes); bytes.fill(0); bytes.length = 0;
      if (error) { value.fill(0); reject(error); } else resolve(value);
    };
    const onData = chunk => {
      for (const byte of Buffer.from(chunk)) {
        if (byte === 0x0d || byte === 0x0a) return finish();
        if (byte === 0x03 || byte === 0x04 || byte === 0x1b) return finish(new Error("passphrase entry cancelled"));
        if (byte === 0x7f || byte === 0x08) {
          while (bytes.length && (bytes[bytes.length - 1] & 0xc0) === 0x80) bytes.pop();
          bytes.pop();
          continue;
        }
        bytes.push(byte);
      }
    };
    output.write(prompt);
    input.setRawMode(true); input.resume(); input.on("data", onData);
  });
}

export function signClearance({ privateKey, publicKey, packageSHA256, ledgerBytes, receipt }) {
  if (privateKey?.type !== "private") throw new Error("Ed25519 clearance private key required");
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 clearance private key required");
  if (!createPublicKey(privateKey).export({ type: "spki", format: "der" }).equals(publicKey)) {
    throw new Error("private key does not match the configured staging clearance key");
  }
  const { revision, cases } = ledgerRevision(ledgerBytes);
  const payload = clearancePayload(packageSHA256, revision);
  const signature = sign(null, payload, privateKey);
  const trusted = createPublicKey({ key: publicKey, type: "spki", format: "der" });
  if (!verify(null, payload, trusted, signature)) throw new Error("clearance self-check failed");
  const record = { format: 1, package_sha256: packageSHA256, ledger_revision: revision, clearance_signature_base64: signature.toString("base64") };
  if (receipt !== undefined) {
    assertReceipt(receipt, packageSHA256);
    const receiptSignature = sign(null, Buffer.from(canonical(receipt)), privateKey);
    if (!verify(null, Buffer.from(canonical(receipt)), trusted, receiptSignature)) throw new Error("receipt self-check failed");
    Object.assign(record, { upload_receipt: receipt, receipt_signature_base64: receiptSignature.toString("base64") });
  }
  return { record, cases };
}

// The signer never replaces, moves or deletes any file. It creates the record
// only where nothing exists yet (Node's "wx" exclusive create, verified on a
// local Linux filesystem), so a record written by anyone else is not lost.
// An interrupted write can leave an incomplete file; the next run refuses it
// until the operator inspects and removes it.
export function writeRecord(file, bytes) {
  try { writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); } catch (error) {
    if (error.code === "EEXIST") throw new Error("a clearance record appeared while signing; it was left unchanged; inspect and preserve it before re-signing");
    throw error;
  }
}

const usage = "usage: node scripts/hub/staging-clearance.mjs (--key-credential NAME | --key ENCRYPTED_PRIVATE_KEY.pem) --package-sha256 DIGEST --ledger CASES_JSON --out CLEARANCE_DIRECTORY [--receipt UPLOAD_RECEIPT_JSON]";

export async function main(argv, { authority, log = console.log, readPassphrase = promptPassphrase, environment = process.env } = {}) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      key: { type: "string" }, "key-credential": { type: "string" }, "package-sha256": { type: "string" }, ledger: { type: "string" }, out: { type: "string" }, receipt: { type: "string" },
    } }));
  } catch { throw new Error(usage); }
  const { key, "key-credential": credential, "package-sha256": packageSHA256, ledger, out, receipt: receiptFile } = values;
  const oneKeySource = (key === undefined) !== (credential === undefined);
  if (!oneKeySource || ![key ?? credential, packageSHA256, ledger, out].every(value => value?.trim()) ||
      (receiptFile !== undefined && !receiptFile.trim())) throw new Error(usage);
  if (!digest.test(packageSHA256)) throw new Error("package digest must be 64 lowercase hex characters");
  const publicKey = trustedPublicKey(authority);
  let receipt;
  if (receiptFile !== undefined) {
    try { receipt = JSON.parse(readFileSync(receiptFile, "utf8")); } catch { throw new Error("upload receipt is not JSON"); }
  }
  const file = path.join(out, packageSHA256 + ".json");
  if (existsSync(file)) {
    throw new Error("a clearance record already exists and is never replaced; to re-sign, first preserve the existing record and its rollback receipt, then remove it and pass --receipt if needed");
  }
  const keyText = key === undefined ? null : assertEncryptedKey(readFileSync(key)), ledgerBytes = readFileSync(ledger);
  ledgerRevision(ledgerBytes);
  if (receipt !== undefined) assertReceipt(receipt, packageSHA256);
  let privateKey;
  if (keyText === null) privateKey = loadCredentialKey(credential, environment);
  else {
    const passphrase = await readPassphrase();
    try { privateKey = loadPrivateKey(keyText, passphrase); } finally { if (Buffer.isBuffer(passphrase)) passphrase.fill(0); }
  }
  const { record } = signClearance({ privateKey, publicKey, packageSHA256, ledgerBytes, receipt });
  mkdirSync(out, { recursive: true, mode: 0o700 });
  writeRecord(file, Buffer.from(JSON.stringify(record, null, 2) + "\n"));
  log(receipt ? "wrote staging clearance with rollback receipt" : "wrote staging clearance");
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2), { authority: JSON.parse(readFileSync(new URL("./staging-authority.json", import.meta.url))) });
  } catch (error) {
    console.error("clearance not written: " + (error.code ? "unable to read input or write clearance" : error.message));
    process.exitCode = 1;
  }
}
