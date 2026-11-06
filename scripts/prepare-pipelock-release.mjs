#!/usr/bin/env node
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { parse as parseToml } from "smol-toml";
import { auditReleaseData } from "./release-data-audit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const REPO = "pipelab-org/pipelock";
const API = `https://api.github.com/repos/${REPO}`;
const DOWNLOAD = `https://github.com/${REPO}/releases/download`;
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
// Publisher limits: cmd/pipelock-release-manifest and internal/cli/selfupdate.
const METADATA_LIMIT = 8 << 20;
const ARCHIVE_LIMIT = 256 << 20;
export const PIN_PATHS = [
  "hugo.toml", ".github/workflows/sync-pipelock-rules.yml",
  "scripts/pipelock-verifier-pin.env", "content/capabilities.md",
  "data/pipelock_capabilities.json",
];
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const read = file => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

export function assertBinaryVersion(binary, version, output) {
  // v3.7.1 internal/cli/version.go uses a short line for the full binary;
  // the standalone verifier reports its build metadata (installer contract).
  const valid = binary === "pipelock"
    ? output === `pipelock version ${version}`
    : output.startsWith(`pipelock-verifier ${version} (`) && output.endsWith(")") && !output.includes("\n");
  requireThat(valid, "binary reported wrong version");
}

function json(bytes) {
  // JSON.parse checks JSON syntax; YAML's JSON-compatible flow parser catches
  // duplicate mapping keys, including escaped spellings, before JSON.parse wins.
  const doc = parseDocument(bytes.toString("utf8"), { uniqueKeys: true });
  requireThat(doc.errors.length === 0, "ambiguous JSON metadata");
  return JSON.parse(bytes.toString("utf8"));
}

export function verifyManifest(bytes, signature, keyring) {
  // Pipelock v3.7.1 internal/release/verify.go: domain + exact manifest bytes.
  const keys = keyring.trim().split(",").map(key => key.trim());
  requireThat(keys.length > 0 && keys.every(key => SHA.test(key)), "invalid trusted keyring");
  const sig = signature.toString("utf8").trim();
  requireThat(/^ed25519:[0-9a-fA-F]{128}$/.test(sig), "invalid manifest signature format");
  const preimage = Buffer.concat([Buffer.from("Pipelock release manifest signature v1\n"), bytes]);
  const signer = keys.find(key => verify(null, preimage, createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key, "hex")]),
    format: "der", type: "spki",
  }), Buffer.from(sig.slice(8), "hex")));
  requireThat(signer, "manifest signature rejected");
  const manifest = json(bytes);
  requireThat(manifest.schema === "pipelock-release-v1"
    && manifest.repo === "github.com/luckyPipewrench/pipelock"
    && manifest.signer_key_id?.toLowerCase() === signer
    && SHA.test(manifest.checksum_file_sha256)
    && COMMIT.test(manifest.commit)
    && typeof manifest.created_utc === "string"
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(manifest.created_utc)
    && Number.isFinite(Date.parse(manifest.created_utc)), "invalid release manifest");
  requireThat(Array.isArray(manifest.assets) && manifest.assets.length > 0, "missing manifest assets");
  const seen = new Set();
  for (const asset of manifest.assets) {
    requireThat(typeof asset.name === "string" && asset.name && !seen.has(asset.name)
      && SHA.test(asset.sha256) && [asset.goos, asset.goarch, asset.binary].every(value => typeof value === "string" && value),
    "invalid or duplicate manifest asset");
    seen.add(asset.name);
  }
  return manifest;
}

export function checksumEntries(bytes, manifest) {
  requireThat(sha256(bytes) === manifest.checksum_file_sha256, "signed checksum-file binding rejected");
  const entries = new Map();
  for (const line of bytes.toString("utf8").trimEnd().split("\n")) {
    const match = /^([0-9a-fA-F]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    requireThat(match && !entries.has(match[2]), "invalid or duplicate checksum entry");
    entries.set(match[2], match[1].toLowerCase());
  }
  for (const asset of manifest.assets) {
    requireThat(entries.get(asset.name) === asset.sha256.toLowerCase(), "manifest/checksum entry disagreement");
  }
  return entries;
}

function run(command, args, options = {}) {
  // Source git commands must not inherit the site's worktree override.
  const env = { ...process.env };
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_COMMON_DIR;
  return execFileSync(command, args, { encoding: "utf8", timeout: 60_000,
    maxBuffer: METADATA_LIMIT, env, ...options });
}

function download(url, limit) {
  // curl honors the configured proxy; Node 22 fetch does not do so by default.
  return execFileSync("curl", ["--proto", "=https", "--proto-redir", "=https", "--tlsv1.2",
    "--fail", "--location", "--silent", "--show-error", "--max-time", "60",
    "--max-filesize", String(limit), url], { timeout: 65_000, maxBuffer: limit });
}

function replaceOne(text, pattern, replacement) {
  requireThat([...text.matchAll(new RegExp(pattern.source, "gm"))].length === 1, "pin assignment missing or ambiguous");
  return text.replace(new RegExp(pattern.source, "m"), replacement);
}

export function validateTarget(tag, current) {
  requireThat(TAG.test(tag) && tag.length <= 129, "require an explicit stable vMAJOR.MINOR.PATCH tag");
  requireThat(TAG.test(`v${current}`), "invalid approved site version");
  const candidate = tag.slice(1).split(".").map(BigInt);
  const approved = current.split(".").map(BigInt);
  const changed = candidate.findIndex((n, i) => n !== approved[i]);
  requireThat(changed >= 0 && candidate[changed] > approved[changed], "release must be newer than approved pins");
}

function cosign(dir, tag) {
  const probe = spawnSync("cosign", ["version"], { timeout: 10_000, stdio: "ignore" });
  if (probe.error?.code === "ENOENT") return "absent (native signature required)";
  requireThat(probe.status === 0, "installed cosign is unavailable");
  for (const owner of ["luckyPipewrench", "pipelab-org"]) {
    const result = spawnSync("cosign", ["verify-blob", "--certificate", path.join(dir, "checksums.txt.pem"),
      "--signature", path.join(dir, "checksums.txt.sig"), "--certificate-oidc-issuer", "https://token.actions.githubusercontent.com",
      "--certificate-identity", `https://github.com/${owner}/pipelock/.github/workflows/release.yaml@refs/tags/${tag}`,
      path.join(dir, "checksums.txt")], { timeout: 60_000, stdio: "ignore" });
    if (result.status === 0) return `verified (${owner})`;
  }
  throw new Error("cosign rejected both exact publisher identities");
}

function sourceCheckout(dir, tag, commit) {
  run("git", ["init", "--quiet", dir]);
  run("git", ["-C", dir, "fetch", "--quiet", "--depth=1", `https://github.com/${REPO}.git`, `refs/tags/${tag}:refs/tags/${tag}`]);
  requireThat(run("git", ["-C", dir, "rev-parse", `${tag}^{commit}`]).trim() === commit, "source tag/commit mismatch");
  run("git", ["-C", dir, "checkout", "--quiet", "--detach", commit]);
}

function capabilitySnapshot(stage, source, tag) {
  run(process.execPath, [path.join(HERE, "sync-pipelock-capabilities.mjs"), "--source", source,
    "--ref", tag, "--version", tag.slice(1)], { cwd: stage });
  run(process.execPath, [path.join(HERE, "verify-capability-source.mjs"), "--source", source], { cwd: stage });
}

export async function prepareRelease({ root = ROOT, tag, bodyFile, io = {} }) {
  const load = io.download || download;
  const current = parseToml(read(path.join(root, "hugo.toml"))).params.pipelock_version;
  validateTarget(tag, current);
  const approved = auditReleaseData(root, current);
  requireThat(approved.length === 0, `approved release data is inconsistent: ${approved.join("; ")}`);
  requireThat(bodyFile && !existsSync(bodyFile), "proposal body destination must be new");
  const original = new Map(PIN_PATHS.map(file => [file, readFileSync(path.join(root, file))]));
  const temporary = mkdtempSync(path.join(root, ".release-bump-"));
  let applying = false;
  try {
    const loadBounded = (url, limit = METADATA_LIMIT) => {
      const bytes = load(url, limit);
      requireThat(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limit, "unavailable or oversized release metadata");
      return bytes;
    };
    const release = json(loadBounded(`${API}/releases/tags/${tag}`));
    requireThat(release.tag_name === tag && release.draft === false && release.prerelease === false,
      "release is missing, draft, prerelease, or names another tag");
    const names = ["release.json", "release.json.sig", "checksums.txt", "checksums.txt.sig", "checksums.txt.pem",
      `pipelock_${tag.slice(1)}_linux_amd64.tar.gz`, `pipelock-verifier_${tag.slice(1)}_linux_amd64.tar.gz`];
    requireThat(Array.isArray(release.assets), "release assets unavailable");
    for (const name of names) {
      const matches = release.assets.filter(asset => asset.name === name);
      requireThat(matches.length === 1 && matches[0].browser_download_url === `${DOWNLOAD}/${tag}/${name}`,
        `missing, duplicate, or unexpected release asset: ${name}`);
    }
    const metadata = new Map(names.slice(0, 5).map(name => [name, loadBounded(`${DOWNLOAD}/${tag}/${name}`)]));
    const manifest = verifyManifest(metadata.get("release.json"), metadata.get("release.json.sig"),
      read(path.join(root, "scripts/pipelock-release-keyring.txt")));
    requireThat(manifest.tag === tag, "signed manifest names another tag");
    let ref = json(loadBounded(`${API}/git/ref/tags/${tag}`)).object;
    for (let depth = 0; ref?.type === "tag" && depth < 4; depth++) {
      requireThat(COMMIT.test(ref.sha), "invalid annotated tag object");
      ref = json(loadBounded(`${API}/git/tags/${ref.sha}`)).object;
    }
    requireThat(ref?.type === "commit" && ref.sha === manifest.commit, "signed commit does not match release tag");
    const checksums = checksumEntries(metadata.get("checksums.txt"), manifest);
    const full = manifest.assets.find(asset => asset.name === names[5]);
    requireThat(full?.goos === "linux" && full?.goarch === "amd64" && full?.binary === "pipelock", "platform metadata mismatch");
    for (const name of names.slice(5)) requireThat(checksums.has(name), `missing checksum entry: ${name}`);
    for (const [name, bytes] of metadata) writeFileSync(path.join(temporary, name), bytes);
    const cosignResult = (io.cosign || cosign)(temporary, tag);
    for (const [index, name] of names.slice(5).entries()) {
      const archive = loadBounded(`${DOWNLOAD}/${tag}/${name}`, ARCHIVE_LIMIT);
      requireThat(sha256(archive) === checksums.get(name), "archive checksum mismatch");
      const archiveFile = path.join(temporary, name);
      writeFileSync(archiveFile, archive);
      const binary = index === 0 ? "pipelock" : "pipelock-verifier";
      const executable = path.join(temporary, binary);
      run("python3", [path.join(HERE, "release-archive.py"), archiveFile, binary, executable]);
      const output = run(executable, ["--version"]).trim();
      assertBinaryVersion(binary, tag.slice(1), output);
    }
    const source = path.join(temporary, "source");
    (io.sourceCheckout || sourceCheckout)(source, tag, manifest.commit);
    const stage = path.join(temporary, "site");
    for (const directory of ["data", "content", "scripts", "static", ".github"]) {
      cpSync(path.join(root, directory), path.join(stage, directory), { recursive: true });
    }
    writeFileSync(path.join(stage, "hugo.toml"), replaceOne(read(path.join(root, "hugo.toml")),
      /^([ \t]*pipelock_version[ \t]*=[ \t]*)"[^"]+"[ \t]*$/, `$1"${tag.slice(1)}"`));
    const workflow = read(path.join(root, PIN_PATHS[1]));
    writeFileSync(path.join(stage, PIN_PATHS[1]), replaceOne(replaceOne(workflow,
      /^([ \t]*PIPELOCK_VERSION: )[^\n]+$/, `$1${tag.slice(1)}`),
    /^([ \t]*PIPELOCK_SHA256: )[^\n]+$/, `$1${checksums.get(names[5])}`));
    writeFileSync(path.join(stage, PIN_PATHS[2]), `PIPELAB_VERIFIER_VERSION=${tag.slice(1)}\nPIPELAB_VERIFIER_LINUX_AMD64_SHA256=${checksums.get(names[6])}\n`);
    writeFileSync(path.join(stage, PIN_PATHS[3]), replaceOne(read(path.join(root, PIN_PATHS[3])),
      /^release_target: "[^"]+"$/, `release_target: "${tag.slice(1)}"`));
    (io.capabilitySnapshot || capabilitySnapshot)(stage, source, tag);
    const findings = auditReleaseData(stage, tag.slice(1));
    requireThat(findings.length === 0, `candidate release data rejected: ${findings.join("; ")}`);
    const body = `## What changed\n\nProposes Pipelock ${tag.slice(1)} for the site, both Linux amd64 archive pins, and the capability snapshot from the authenticated release commit. Verification failures stop preparation before approved pins change.\n\nRelease: https://github.com/${REPO}/releases/tag/${tag}\n\nSource commit: ${manifest.commit}\n\nSigned checksum file: ${manifest.checksum_file_sha256}\n\nArchive SHA-256: ${checksums.get(names[5])}\n\nVerifier SHA-256: ${checksums.get(names[6])}\n\nCosign: ${cosignResult}\n\nHuman review required before merge: release adoption; capability and tier changes; release summaries and machine-context wording; comparison and standards mappings; pricing and legal wording; dated measurements and unsigned collateral. Preparation does not establish those claims. Historical signed packets, demos, and Gauntlet measurements retain their recorded bytes and versions.\n`;
    // No approved file is touched until all verification/generation has succeeded.
    for (const [file, bytes] of original) requireThat(readFileSync(path.join(root, file)).equals(bytes), "approved pins changed during preparation");
    applying = true;
    for (const file of PIN_PATHS) writeFileSync(path.join(root, file), readFileSync(path.join(stage, file)));
    writeFileSync(bodyFile, body, { flag: "wx" });
    return { tag, commit: manifest.commit, checksums: manifest.checksum_file_sha256 };
  } catch (error) {
    if (applying) {
      for (const [file, bytes] of original) writeFileSync(path.join(root, file), bytes);
      rmSync(bodyFile, { force: true });
    }
    throw error;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const [tag, bodyFile, ...extra] = process.argv.slice(2);
  requireThat(tag && bodyFile && extra.length === 0, "usage: prepare-pipelock-release.mjs vX.Y.Z NEW_BODY_FILE");
  await prepareRelease({ tag, bodyFile: path.resolve(bodyFile) });
  console.log(`Prepared verified release proposal for ${tag}; human merge required.`);
}
