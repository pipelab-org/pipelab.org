import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { HubUnavailable } from "./check-failure.mjs";
import { httpsGitEnvironment, readGit, readRemoteRefs } from "./git-source.mjs";
import { maxPolicyBlobBytes, policyBlobEntries } from "./policy-blobs.mjs";
import { assertHubOnly, hubBlobEntries, maxSourceFileBytes } from "./source-tree.mjs";

export const rulesRepository = "pipelab-org/pipelock-rules";
const rulesURL = "https://github.com/" + rulesRepository;
const rulesMainRef = "refs/heads/main";

export function readRulesMain() {
  try {
    return readRemoteRefs(rulesURL, [rulesMainRef], "invalid Rules main ref result").get(rulesMainRef);
  } catch (cause) {
    throw new HubUnavailable("Rules main unavailable from GitHub", { cause });
  }
}
// Bound the initial Git metadata pack to the same size as GitHub's recursive
// Trees API response. The selected blob fetch adds its declared payload size.
const maxMetadataBytes = 7 * 1024 * 1024;

export function readRulesAPI(resource, { maxBuffer = 1024 * 1024, fresh = false } = {}) {
  const endpoint = "repos/" + rulesRepository + "/" + resource;
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, maxBuffer };
  if (process.env.HUB_RULES_PUBLIC_API !== "1") {
    return JSON.parse(execFileSync("gh", ["api", "--hostname", "github.com", endpoint], options));
  }

  const url = new URL("https://api.github.com/" + endpoint);
  // PR state is mutable even when the advertised commit refs have not moved.
  if (fresh) url.searchParams.set("hub_preflight_nonce", randomUUID());
  try {
    const output = execFileSync("curl", ["-q", "--silent", "--show-error", "--fail", "--proto", "=https",
      "--max-time", "15", "--max-filesize", String(maxBuffer), "--header", "Accept: application/vnd.github+json",
      "--header", "Cache-Control: no-cache", "--write-out", "\n%{http_code}", "--url", url.href],
    { ...options, maxBuffer: maxBuffer + 4 });
    if (!output.endsWith("\n200")) throw new Error("unexpected public Rules HTTP status");
    return JSON.parse(output.slice(0, -4));
  } catch (cause) {
    throw new HubUnavailable("Could not read the public Rules API. Retry the check.", { cause });
  }
}

function publishedTree(tree) {
  // GitHub's recursive Trees API caps a response at 7 MB and sets truncated.
  const result = readRulesAPI("git/trees/" + tree + "?recursive=1", { maxBuffer: maxMetadataBytes });
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
  const pullRequest = number !== undefined;
  if (!pullRequest && base !== head) throw new Error("Rules import must use the exact main tip");
  const repository = path.join(directory, "rules.git");
  const baseRef = pullRequest ? rulesMainRef : "refs/remotes/origin/main";
  const headRef = "refs/hub/pull-head";
  const refspecs = ["+" + rulesMainRef + ":" + baseRef];
  if (pullRequest) refspecs.push("+refs/pull/" + number + "/head:" + headRef);
  const gitOptions = { env: httpsGitEnvironment(directory), timeout: 30_000 };
  const isolatedGit = ["-c", "http.followRedirects=false", "-C", directory];
  const git = args => execFileSync("git", [...isolatedGit, ...args], {
    ...gitOptions, stdio: ["ignore", "pipe", "ignore"],
  });
  const fetch = (args, maxBytes, failure, input) => {
    // Keep the transfer packed even for small fetches, and cap each file
    // before Git can write it. The indexer inherits the same limit.
    try {
      execFileSync("bash", ["-pc", 'set +o posix; ulimit -f "$1" || exit; shift; exec git "$@"',
        "rules-fetch", String(Math.ceil(maxBytes / 1024)), ...isolatedGit,
        "-c", "fetch.fsckObjects=true", "-c", "fetch.unpackLimit=1",
        "-C", repository, "fetch", "--quiet", "--no-tags", "--no-write-fetch-head",
        "--no-auto-maintenance", "--no-recurse-submodules", "--filter=blob:none", "origin", ...args], {
        ...gitOptions, input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
      });
    } catch (cause) {
      if (cause.code === "ETIMEDOUT") throw new HubUnavailable("Rules object fetch timed out", { cause });
      throw new Error(failure, { cause });
    }
  };
  git(["init", "--bare", "--quiet", "--template=", repository]);
  git(["-C", repository, "config", "remote.origin.url", rulesURL]);
  git(["-C", repository, "config", "remote.origin.promisor", "true"]);
  fetch(refspecs, maxMetadataBytes, "could not fetch published Rules commits within the metadata limit");
  const requested = pullRequest ? [baseRef, headRef] : [baseRef];
  const refs = readGit(repository, ["rev-parse", ...requested],
    { encoding: "ascii" }).trimEnd().split("\n");
  if (refs.length !== requested.length || refs[0] !== base || (pullRequest && refs[1] !== head)) {
    throw new Error("published Rules refs moved during acquisition");
  }

  if (pullRequest) assertHubOnly(repository, base, head);
  const { tree, files } = hubBlobEntries(repository, head);
  const { workflows, codeowners } = policyBlobEntries(repository, head);
  const objects = boundedObjects(tree, files, [...workflows, ...codeowners]);
  const input = [...objects.keys()].join("\n") + "\n";
  const selectedBytes = [...objects.values()].reduce((total, size) => total + size, 0);
  fetch(["--stdin"], maxMetadataBytes + selectedBytes, "could not fetch selected Rules blobs within the object limit", input);
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
