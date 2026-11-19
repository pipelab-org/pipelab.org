import { readGit as git } from "./git-source.mjs";
import { lstatSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha = /^[0-9a-f]{40}$/;
const id = "[a-z0-9][a-z0-9-]{1,62}[a-z0-9]";
const rule = "[a-z0-9][a-z0-9-]*";
const fixture = `(?:dlp|injection|tool-poison)/${rule}-(?:true|false)-positive\\.txt`;
const contribution = new RegExp(`^(?:
  hub/(?:publishers|configs)/${id}\\.yaml|
  hub/tombstones/(?:bundle|config|recipe|verifier)--${id}\\.yaml|
  hub/listings/(?:bundles/${id}|community/${id}--${id})\\.yaml|
  hub/community/${id}/${id}/(?:bundle\\.yaml(?:\\.sig)?|fixtures/${fixture})|
  hub/quality/${id}/${id}\\.json
)$`.replace(/\s+/g, ""));
const official = new RegExp(`^(?:published/${id}/bundle\\.yaml(?:\\.sig)?|fixtures/${id}/${fixture})$`);
// Published Pipelock bundle file limit: v3.8.0 internal/rules/bundle.go.
const maxFileBytes = 1024 * 1024;
// GitHub's "List pull request files" contract caps a submission at 3,000 files.
// The cap also bounds work on a catalog snapshot before reading object bodies.
const maxFiles = 3000;

function checkSHA(value) {
  if (typeof value !== "string" || !sha.test(value)) throw new Error("a full Git commit SHA is required");
}

function requireAncestor(repository, base, head) {
  checkSHA(base);
  checkSHA(head);
  try {
    for (const commit of [base, head]) {
      if (git(repository, ["cat-file", "-t", commit], { encoding: "utf8" }).trim() !== "commit") {
        throw new Error("expected an exact commit object");
      }
    }
    git(repository, ["merge-base", "--is-ancestor", base, head]);
  } catch {
    throw new Error("base ancestry is missing or cannot be verified");
  }
}

export function assertHubOnly(repository, base, head, { maintenance = false } = {}) {
  requireAncestor(repository, base, head);
  const changes = git(repository, ["diff", "--name-only", "--no-renames", "-z", base, head])
    .toString("utf8").split("\0").filter(Boolean);
  if (!changes.length || changes.length > maxFiles || changes.some(file => !contribution.test(file) && !(maintenance === true && file === "hub/README.md"))) {
    throw new Error("submission must change only Hub contribution files");
  }
  return changes;
}

export function acceptedSource(site, base) {
  checkSHA(base);
  const entries = git(site, ["ls-tree", "-r", "-z", "--name-only", base, "--", "data/hub/generated"])
    .toString("utf8").split("\0").filter(Boolean);
  if (!entries.length) return { rules_sha: null, lifecycle: { listings: [], history: [], routes: [] } };
  const read = file => {
    const relative = "data/hub/generated/" + file;
    if (!entries.includes(relative)) throw new Error("accepted Hub source or inventory is missing");
    return JSON.parse(git(site, ["show", base + ":" + relative]));
  };
  const source = read("source.json");
  checkSHA(source.rules_sha);
  return { ...source, lifecycle: read("lifecycle.json") };
}

export function assertSourceProgress(repository, previous, candidate, main) {
  requireAncestor(repository, candidate, main);
  if (previous !== null) requireAncestor(repository, previous, candidate);
}

// The site and pinned engine are trusted source trees. Read regular Git
// blobs without archive or checkout filters.
export function materializeGitTree(repository, commit, destination, paths = []) {
  checkSHA(commit);
  if (!lstatSync(destination).isDirectory() || readdirSync(destination).length) {
    throw new Error("source destination must be empty and regular");
  }
  if (git(repository, ["cat-file", "-t", commit], { encoding: "utf8" }).trim() !== "commit") {
    throw new Error("expected an exact commit object");
  }
  const listing = git(repository, ["ls-tree", "-r", "-l", "-z", "--full-tree", commit, "--", ...paths]);
  const entries = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(listing).split("\0");
  entries.pop();
  const files = entries.map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40}) +(\d+)\t([^\x00-\x1f\\:]+)$/.exec(entry);
    if (!match) throw new Error("source tree entry must be a regular Git blob");
    const [, mode, object, length, file] = match;
    const size = Number(length);
    const parts = file.split("/");
    if (parts.some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git") ||
        !Number.isSafeInteger(size)) {
      throw new Error("unsupported source tree path or blob size");
    }
    return { mode, object, size, target: path.join(destination, ...parts) };
  });
  for (const { mode, object, size, target } of files) {
    const bytes = git(repository, ["cat-file", "blob", object], { maxBuffer: Math.max(1, size) });
    if (bytes.length !== size) throw new Error("source file differs from its Git blob size");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
  }
}

export function acquireHubTree(repository, commit, destination) {
  checkSHA(commit);
  if (!lstatSync(destination).isDirectory() || readdirSync(destination).length) {
    throw new Error("Hub acquisition directory must be empty and regular");
  }
  if (git(repository, ["cat-file", "-t", commit], { encoding: "utf8" }).trim() !== "commit") {
    throw new Error("expected an exact commit object");
  }
  const tree = git(repository, ["rev-parse", "--verify", commit + "^{tree}"], { encoding: "utf8" }).trim();
  const entries = git(repository, ["ls-tree", "-r", "-l", "-z", "--full-tree", tree, "--", "hub", "published", "fixtures"])
    .toString("utf8").split("\0").filter(Boolean);
  if (!entries.length || entries.length > maxFiles) throw new Error("Hub input file count is outside the acquisition bounds");

  const files = entries.map(entry => {
    const match = /^100644 blob ([a-f0-9]{40}) +([0-9]+)\t([\x20-\x7e]+)$/.exec(entry);
    if (!match) throw new Error("Hub input must be a regular, non-executable Git blob");
    const [, object, size, file] = match;
    if (!(file === "hub/README.md" || contribution.test(file) || official.test(file))) {
      throw new Error("Hub input path is outside the source contract");
    }
    if (Number(size) > maxFileBytes) throw new Error("Hub input exceeds the per-file byte limit");
    return { object, size: Number(size), file };
  });
  for (const item of files) {
    const bytes = git(repository, ["cat-file", "blob", item.object], { maxBuffer: maxFileBytes });
    if (bytes.length !== item.size) throw new Error("Hub input differs from its Git blob size");
    const target = path.join(destination, item.file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  }
  return { commit, tree, files: files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [repository, commit, output, base] = process.argv.slice(2);
  if (process.argv.length > 6 || !output) {
    throw new Error("usage: source-tree.mjs GIT_OBJECT_STORE COMMIT_SHA EMPTY_DIRECTORY [BASE_SHA]");
  }
  if (base) assertHubOnly(repository, base, commit);
  console.log(JSON.stringify(acquireHubTree(repository, commit, output)));
}
