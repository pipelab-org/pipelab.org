import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { PIN_PATHS, prepareRelease, sha256, verifyManifest, checksumEntries, assertBinaryVersion } from "../scripts/prepare-pipelock-release.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TAG = "v3.8.1";
const COMMIT = "a".repeat(40);
const PUB = "https://github.com/pipelab-org/pipelock/releases/download";
// Private keys exist in memory for this process only, never in fixture files.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const domain = Buffer.from("Pipelock release manifest signature v1\n");

function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(ROOT, ".release-bump-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(path.join(ROOT, "data"), path.join(root, "data"), { recursive: true });
  // Immutable evidence stays shared; the five writable pins are separate files.
  symlinkSync(path.join(ROOT, "static"), path.join(root, "static"), "dir");
  for (const file of PIN_PATHS.slice(1)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(root, file));
  }
  cpSync(path.join(ROOT, "hugo.toml"), path.join(root, "hugo.toml"));
  writeFileSync(path.join(root, "scripts/pipelock-release-keyring.txt"), key);
  const archives = new Map();
  for (const binary of ["pipelock", "pipelock-verifier"]) {
    const prefix = binary === "pipelock" ? "pipelock version" : binary;
    const output = options.wrongVersion && binary === "pipelock-verifier" ? "0.0.0" : TAG.slice(1);
    const script = `#!/bin/sh\nprintf '%s\\n' '${prefix} ${output}${binary === "pipelock" ? "" : " (fixture)"}'\n`;
    const archive = execFileSync("python3", ["-c", `
import io,sys,tarfile
with tarfile.open(fileobj=sys.stdout.buffer, mode="w|gz") as out:
    data=sys.argv[2].encode()
    entry=tarfile.TarInfo(sys.argv[1]); entry.size=len(data); entry.mode=0o755
    out.addfile(entry,io.BytesIO(data))
    if len(sys.argv)>3:
        bad=tarfile.TarInfo(sys.argv[3]); bad.size=1
        if sys.argv[3] == "symlink": bad.type=tarfile.SYMTYPE; bad.linkname="/etc/passwd"; bad.size=0
        out.addfile(bad,io.BytesIO(b"x"))
`, binary, script, ...(options.entry ? [options.entry] : [])]);
    archives.set(`${binary}_${TAG.slice(1)}_linux_amd64.tar.gz`, archive);
  }
  const full = [...archives.keys()][0];
  const verifier = [...archives.keys()][1];
  let checksums = [...archives].map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join("");
  if (options.duplicate) checksums += checksums.split("\n")[0] + "\n";
  if (options.missingChecksum) checksums = checksums.split("\n")[0] + "\n";
  const manifest = {
    schema: "pipelock-release-v1", repo: "github.com/luckyPipewrench/pipelock",
    tag: TAG, commit: COMMIT, created_utc: "2026-11-05T12:00:00Z", signer_key_id: key,
    checksum_file_sha256: sha256(Buffer.from(checksums)),
    // Product manifests list the full archive; standalone verifier uses the
    // authenticated checksum-file binding rather than an invented asset record.
    assets: [{ name: full, sha256: sha256(archives.get(full)), goos: "linux", goarch: "amd64", binary: "pipelock" }],
  };
  options.manifest?.(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  const signature = Buffer.from(`ed25519:${sign(null, Buffer.concat([domain, bytes]), privateKey).toString("hex")}`);
  const assets = new Map(archives);
  assets.set("release.json", bytes);
  assets.set("release.json.sig", signature);
  assets.set("checksums.txt", Buffer.from(checksums));
  assets.set("checksums.txt.sig", Buffer.from("fixture cosign signature"));
  assets.set("checksums.txt.pem", Buffer.from("fixture certificate"));
  options.assets?.(assets);
  const release = { tag_name: TAG, draft: false, prerelease: false, assets: [...assets.keys()].map(name => ({
    name, browser_download_url: `${PUB}/${TAG}/${name}`,
  })) };
  options.release?.(release);
  const bodyFile = path.join(root, "proposal.md");
  const original = new Map(PIN_PATHS.map(file => [file, readFileSync(path.join(root, file))]));
  const io = {
    download(url) {
      if (options.apiFailure) throw new Error("API unavailable (fixture)");
      if (url.includes("/releases/tags/")) return Buffer.from(JSON.stringify(release));
      if (url.includes("/git/ref/tags/")) return Buffer.from(JSON.stringify({ object: { type: "commit", sha: options.commit || COMMIT } }));
      const bytes = assets.get(url.split("/").at(-1));
      if (!bytes) throw new Error("metadata unavailable (fixture)");
      return bytes;
    },
    cosign: () => {
      if (options.cosignFailure) throw new Error("cosign rejected both exact publisher identities");
      return "absent (fixture; native required)";
    },
    sourceCheckout() { if (options.sourceFailure) throw new Error("source unavailable (fixture)"); },
    // Test preparation transaction independently of the existing generator's
    // source-reference tests. The workflow always uses the real generator.
    capabilitySnapshot(stage) {
      if (options.capabilityFailure) throw new Error("unknown capability mapping (fixture)");
      const destination = path.join(stage, "data/pipelock_capabilities.json");
      const snapshot = JSON.parse(readFileSync(destination));
      Object.assign(snapshot.source, { ref: TAG, commit: COMMIT, release_version: TAG.slice(1) });
      writeFileSync(destination, JSON.stringify(snapshot));
    },
  };
  return { root, tag: options.tag || TAG, bodyFile, io, original, assets, manifest, bytes, signature, full, verifier };
}

test("verified fixture updates exactly five pins and produces a review body", async t => {
  const f = fixture(t);
  const anchor = readFileSync(path.join(f.root, "scripts/pipelock-release-keyring.txt"));
  assert.equal((await prepareRelease(f)).commit, COMMIT);
  for (const [file, bytes] of f.original) assert.notDeepEqual(readFileSync(path.join(f.root, file)), bytes, file);
  assert.deepEqual(readFileSync(path.join(f.root, "scripts/pipelock-release-keyring.txt")), anchor);
  assert.match(readFileSync(f.bodyFile, "utf8"), /Human review required before merge/);
});

const negatives = [
  ["missing signature", { assets: a => a.delete("release.json.sig") }, /missing.*asset/],
  ["invalid signature", { assets: a => a.set("release.json.sig", Buffer.from(`ed25519:${"0".repeat(128)}`)) }, /signature rejected/],
  ["malformed signature", { assets: a => a.set("release.json.sig", Buffer.from("bad")) }, /signature format/],
  ["wrong-key signature", { assets: a => {
    const other = generateKeyPairSync("ed25519").privateKey;
    a.set("release.json.sig", Buffer.from(`ed25519:${sign(null, Buffer.concat([domain, a.get("release.json")]), other).toString("hex")}`));
  } }, /signature rejected/],
  ["wrong signed tag", { manifest: m => { m.tag = "v3.8.2"; } }, /another tag/],
  ["wrong signed commit", { commit: "b".repeat(40) }, /commit.*tag/],
  ["unbound checksum file", { assets: a => a.set("checksums.txt", Buffer.concat([a.get("checksums.txt"), Buffer.from("\n")])) }, /checksum-file binding/],
  ["duplicate checksum entry", { duplicate: true }, /duplicate checksum/],
  ["missing verifier checksum", { missingChecksum: true }, /missing checksum/],
  ["platform mismatch", { manifest: m => { m.assets[0].goarch = "arm64"; } }, /platform/],
  ["corrupt archive", { assets: a => a.set([...a.keys()][0], Buffer.from("corrupt")) }, /archive checksum/],
  ["wrong reported version", { wrongVersion: true }, /wrong version/],
  ["unavailable metadata", { assets: a => a.set("release.json", Buffer.alloc(0)) }, /unavailable/],
  ["API failure", { apiFailure: true }, /API unavailable/],
  ["prerelease", { release: r => { r.prerelease = true; } }, /prerelease/],
  ["draft", { release: r => { r.draft = true; } }, /draft/],
  ["downgrade", { tag: "v3.7.0" }, /newer/],
  ["same release", { tag: "v3.8.0" }, /newer/],
  ["prerelease tag", { tag: "v3.8.1-beta.1" }, /stable/],
  ["malicious tag", { tag: "v3.8.1;echo nope" }, /stable/],
  ["traversal archive", { entry: "../escape" }, /unsafe/],
  ["absolute archive path", { entry: "/escape" }, /unsafe/],
  ["symlink archive", { entry: "symlink" }, /unsafe/],
  ["duplicate binary", { entry: "pipelock" }, /unsafe/],
  ["source API failure", { sourceFailure: true }, /source unavailable/],
  ["installed cosign rejection", { cosignFailure: true }, /cosign rejected/],
  ["unknown capability grouping", { capabilityFailure: true }, /unknown capability/],
  ["unfamiliar manifest schema", { manifest: m => { m.schema = "future"; } }, /invalid release manifest/],
  ["signer identity mismatch", { manifest: m => { m.signer_key_id = "f".repeat(64); } }, /invalid release manifest/],
  ["manifest checksum disagreement", { manifest: m => { m.assets[0].sha256 = "e".repeat(64); } }, /entry disagreement/],
  ["duplicate manifest asset", { manifest: m => { m.assets.push(m.assets[0]); } }, /duplicate manifest/],
  ["duplicate API asset", { release: r => { r.assets.push(r.assets[0]); } }, /duplicate.*asset/],
  ["foreign API asset URL", { release: r => { r.assets[0].browser_download_url = "https://example.com/release.json"; } }, /unexpected.*asset/],
];
for (const [name, options, message] of negatives) {
  test(`${name} fails closed without a proposal or pin change`, async t => {
    const f = fixture(t, options);
    await assert.rejects(prepareRelease(f), message);
    assert.equal(existsSync(f.bodyFile), false);
    for (const [file, bytes] of f.original) assert.deepEqual(readFileSync(path.join(f.root, file)), bytes, file);
  });
}

test("signature bytes and duplicate JSON keys are authenticated and unambiguous", t => {
  const f = fixture(t);
  assert.equal(verifyManifest(f.bytes, f.signature, key).tag, TAG);
  const duplicate = Buffer.from(f.bytes.toString().replace('"schema":', '"tag":"v9.9.9","schema":'));
  const sig = Buffer.from(`ed25519:${sign(null, Buffer.concat([domain, duplicate]), privateKey).toString("hex")}`);
  assert.throws(() => verifyManifest(duplicate, sig, key), /ambiguous/);
  assert.throws(() => verifyManifest(Buffer.concat([f.bytes, Buffer.from(" ")]), f.signature, key), /signature rejected/);
  assert.throws(() => verifyManifest(f.bytes, f.signature, ""), /keyring/);
  assert.throws(() => checksumEntries(Buffer.from("invalid"), { checksum_file_sha256: sha256(Buffer.from("invalid")), assets: [] }), /checksum entry/);
});

test("binary version reports match each shipped CLI format exactly", () => {
  assertBinaryVersion("pipelock", "3.7.1", "pipelock version 3.7.1");
  assertBinaryVersion("pipelock-verifier", "3.7.1", "pipelock-verifier 3.7.1 (commit d6bb0003)");
  for (const wrong of ["pipelock version 3.7.10", "pipelock version 3.7.1 (wrong format)", "pipelock version 3.7.1\nextra"]) {
    assert.throws(() => assertBinaryVersion("pipelock", "3.7.1", wrong), /wrong version/);
  }
  assert.throws(() => assertBinaryVersion("pipelock-verifier", "3.7.1", "pipelock-verifier 3.7.10 (commit x)"), /wrong version/);
});

test("workflow dispatch remains scoped, serialized and proposal-only", () => {
  const source = readFileSync(path.join(ROOT, ".github/workflows/propose-pipelock-release.yml"), "utf8");
  const workflow = parseYaml(source);
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const steps = workflow.jobs.propose.steps;
  const proposal = steps.at(-1);
  assert.match(proposal.uses, /^peter-evans\/create-pull-request@[0-9a-f]{40}$/);
  assert.equal(proposal.with.draft, true);
  assert.equal(proposal.with.branch, "automation/pipelock-release");
  assert.deepEqual(proposal.with["add-paths"].trim().split("\n"), PIN_PATHS);
  assert.doesNotMatch(source, /continue-on-error|pull_request_target|--insecure|automerge|--auto/);
});
