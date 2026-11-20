import { readGit } from "./git-source.mjs";
import { maxSourceFileBytes } from "./source-tree.mjs";

const sha = /^[0-9a-f]{40}$/;
const codeownersPaths = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
// Match the Hub source file limit and GitHub's 3,000-file PR cap.
const maxFiles = 3000;
// The collector retains raw bytes in memory and bounds tree listings separately.
export const maxPolicyBlobBytes = 16 * maxSourceFileBytes;
const maxMetadataBytes = maxSourceFileBytes;

function git(repository, args, { input, maxBuffer = maxMetadataBytes } = {}) {
  try {
    return readGit(repository, args, { input, maxBuffer, timeout: 15_000 });
  } catch {
    throw new Error("Git policy object lookup failed or exceeded the output limit (" + args[0] + ")");
  }
}

function listTree(repository, tree, paths = []) {
  const bytes = git(repository, ["ls-tree", "-z", "--full-tree", tree, "--", ...paths]);
  const records = new TextDecoder("utf-8", { fatal: true }).decode(bytes).split("\0");
  records.pop();
  return records.map(record => {
    const match = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40})\t([^/]+)$/.exec(record);
    if (!match) throw new Error("invalid Git policy tree entry");
    const [, mode, type, object, name] = match;
    return { mode, type, object, name };
  });
}

function listDirectory(repository, entry, paths) {
  if (!entry) return [];
  if (entry.mode !== "040000" || entry.type !== "tree") {
    throw new Error("policy directory must be a Git tree");
  }
  return listTree(repository, entry.object, paths);
}

export function policyBlobEntries(repository, commit) {
  if (typeof commit !== "string" || commit.length !== 40 || !sha.test(commit)) {
    throw new Error("a full Git commit SHA is required");
  }
  if (git(repository, ["cat-file", "-t", commit]).toString("ascii").trim() !== "commit") {
    throw new Error("expected an exact Git commit object");
  }
  const root = listTree(repository, commit, [".github", "CODEOWNERS", "docs"]);
  const github = listDirectory(repository, root.find(entry => entry.name === ".github"), ["CODEOWNERS", "workflows"]);
  const docs = listDirectory(repository, root.find(entry => entry.name === "docs"), ["CODEOWNERS"]);
  const workflows = listDirectory(repository, github.find(entry => entry.name === "workflows"))
    .filter(entry => entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
    .map(entry => ({ ...entry, path: ".github/workflows/" + entry.name }));
  const codeowners = [github, root, docs].flatMap((entries, index) => {
    const entry = entries.find(item => item.name === "CODEOWNERS");
    return entry ? [{ ...entry, path: codeownersPaths[index] }] : [];
  });
  const entries = [...workflows, ...codeowners];
  if (entries.length > maxFiles) throw new Error("policy input exceeds the file count limit");
  for (const { mode, type, path } of entries) {
    if (/[^\x20-\x7e]|\\/.test(path)) {
      throw new Error("policy path is outside the acquisition bounds");
    }
    if (mode !== "100644" || type !== "blob") {
      throw new Error("policy input must be a regular, non-executable Git blob");
    }
  }
  return { workflows, codeowners };
}

function sizedBlobs(repository, entries) {
  if (!entries.length) return [];
  const input = entries.map(({ object }) => object).join("\n") + "\n";
  const metadata = git(repository, ["cat-file", "--batch-check"], { input }).toString("ascii").trimEnd().split("\n");
  if (metadata.length !== entries.length) throw new Error("Git policy blob metadata is incomplete");

  let totalBytes = 0;
  return entries.map(({ object, path }, index) => {
    const match = /^([0-9a-f]{40}) blob ([0-9]+)$/.exec(metadata[index]);
    if (!match || match[1] !== object) throw new Error("Git policy blob metadata is invalid");
    const size = Number(match[2]);
    if (size > maxSourceFileBytes) throw new Error("policy input exceeds the per-file byte limit");
    totalBytes += size;
    if (totalBytes > maxPolicyBlobBytes) throw new Error("policy input exceeds the total byte limit");
    return { path, object, size };
  });
}

// Empty arrays describe missing inputs. Only the caller can make a policy decision.
export function acquirePolicyBlobs(repository, commit) {
  const { workflows, codeowners } = policyBlobEntries(repository, commit);
  const blobs = sizedBlobs(repository, [...workflows, ...codeowners]).map(item => {
    const bytes = git(repository, ["cat-file", "blob", item.object], { maxBuffer: item.size || 1 });
    if (bytes.length !== item.size) throw new Error("policy input differs from its Git blob size");
    return { ...item, bytes };
  });
  return {
    commit,
    workflows: blobs.slice(0, workflows.length),
    codeowners: blobs.slice(workflows.length),
  };
}
