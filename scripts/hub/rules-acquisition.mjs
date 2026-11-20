import { execFileSync } from "node:child_process";
import path from "node:path";
import { httpsGitEnvironment, readGit } from "./git-source.mjs";
import { maxPolicyBlobBytes, policyBlobEntries } from "./policy-blobs.mjs";
import { assertHubOnly, hubBlobEntries, maxSourceFileBytes } from "./source-tree.mjs";

export const rulesRepository = "pipelab-org/pipelock-rules";

function publishedTree(tree) {
  // GitHub's recursive Trees API caps a response at 7 MB and sets truncated.
  const result = JSON.parse(execFileSync("gh", ["api", "--hostname", "github.com",
    `repos/${rulesRepository}/git/trees/${tree}?recursive=1`], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, maxBuffer: 7 * 1024 * 1024,
  }));
  if (result?.sha !== tree || result.truncated !== false || !Array.isArray(result.tree)) {
    throw new Error("GitHub Rules tree evidence is incomplete");
  }
  return result.tree;
}

function boundedObjects(tree, files, policy) {
  const requested = new Map([...files, ...policy].map(entry => [entry.path, entry.object]));
  const policyPaths = new Set(policy.map(entry => entry.path));
  const matches = new Set();
  const objects = new Map();
  let policyBytes = 0;
  for (const entry of publishedTree(tree)) {
    if (!requested.has(entry?.path)) continue;
    if (matches.has(entry.path) || entry.sha !== requested.get(entry.path) ||
        entry.type !== "blob" || entry.mode !== "100644" || !Number.isSafeInteger(entry.size) ||
        entry.size < 0 || entry.size > maxSourceFileBytes) {
      throw new Error("GitHub Rules blob differs from the selected Git tree or exceeds the byte limit");
    }
    if (objects.has(entry.sha) && objects.get(entry.sha) !== entry.size) {
      throw new Error("GitHub Rules blob has conflicting sizes");
    }
    matches.add(entry.path);
    objects.set(entry.sha, entry.size);
    if (policyPaths.has(entry.path)) policyBytes += entry.size;
  }
  if (matches.size !== requested.size) throw new Error("GitHub Rules tree omitted selected blobs");
  if (policyBytes > maxPolicyBlobBytes) throw new Error("Rules policy blobs exceed the total byte limit");
  return objects;
}

// Fetch into a new bare repository. Every inspection uses readGit, which
// refuses missing objects without starting a Git transport.
export function acquireRulesObjects(directory, { number, base, head }) {
  const repository = path.join(directory, "rules.git");
  const git = (args, input) => execFileSync("git", ["-c", "http.followRedirects=false",
    "-c", "fetch.fsckObjects=true", "-C", directory, ...args], {
    env: httpsGitEnvironment(directory), input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"], timeout: 30_000,
  });
  const fetch = ["-C", repository, "fetch", "--quiet", "--no-tags", "--no-write-fetch-head",
    "--no-auto-maintenance", "--no-recurse-submodules", "--filter=blob:none", "origin"];
  try {
    git(["init", "--bare", "--quiet", "--template=", repository]);
    git(["-C", repository, "config", "remote.origin.url", `https://github.com/${rulesRepository}`]);
    git(["-C", repository, "config", "remote.origin.promisor", "true"]);
    git([...fetch, "+refs/heads/main:refs/heads/main", `+refs/pull/${number}/head:refs/hub/pull-head`]);
  } catch {
    throw new Error("could not fetch published Rules commits");
  }
  const refs = readGit(repository, ["rev-parse", "refs/heads/main", "refs/hub/pull-head"],
    { encoding: "ascii" }).trimEnd().split("\n");
  if (refs.length !== 2 || refs[0] !== base || refs[1] !== head) {
    throw new Error("published Rules refs moved during acquisition");
  }

  assertHubOnly(repository, base, head);
  const { tree, files } = hubBlobEntries(repository, head);
  const { workflows, codeowners } = policyBlobEntries(repository, head);
  const objects = boundedObjects(tree, files, [...workflows, ...codeowners]);
  const input = [...objects.keys()].join("\n") + "\n";
  try {
    git([...fetch, "--stdin"], input);
  } catch {
    throw new Error("could not fetch selected Rules blobs");
  }
  let acquired;
  try {
    acquired = readGit(repository, ["cat-file", "--batch-check"], { input, encoding: "ascii" });
  } catch {
    throw new Error("could not verify acquired Rules blob metadata");
  }
  const expected = [...objects].map(([oid, size]) => `${oid} blob ${size}
`).join("");
  if (acquired !== expected) throw new Error("acquired Rules blob metadata differs from the selected tree");
  return repository;
}
