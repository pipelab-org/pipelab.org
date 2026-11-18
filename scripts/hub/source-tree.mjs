import { execFileSync } from "node:child_process";
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

function git(repository, args, options = {}) {
  return execFileSync("git", ["-C", repository, "--no-optional-locks", "--no-replace-objects", ...args], {
    ...options,
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" },
    stdio: ["ignore", "pipe", "ignore"],
  });
}

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
