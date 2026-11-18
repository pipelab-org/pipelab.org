import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAcquiredListings } from "./source-listings.mjs";
import { acquirePolicyBlobs } from "./policy-blobs.mjs";
import { parseListing } from "./validate.mjs";
import { readBundleFiles, verifyBundle } from "./verify-bundle.mjs";
import { acquireHubTree, assertHubOnly } from "./source-tree.mjs";

// Local eligibility check for a proposed Hub-only rules change (design 3.2.1
// step 3 and 3.2.2). It reads exact immutable commits as Git objects: nothing
// from the candidate is checked out, archived, imported or executed. A passing
// result is LOCAL-ELIGIBLE, never an admission verdict: see `remaining`.
const categories = [
  ["publisher", /^hub\/publishers\//],
  ["tombstone", /^hub\/tombstones\//],
  ["listing", /^hub\/listings\//],
  ["config", /^hub\/configs\//],
  ["community-bundle", /^hub\/community\/[^/]+\/[^/]+\/bundle\.yaml$/],
  ["community-signature", /^hub\/community\/[^/]+\/[^/]+\/bundle\.yaml\.sig$/],
  ["community-fixture", /^hub\/community\/[^/]+\/[^/]+\/fixtures\//],
  ["quality", /^hub\/quality\//],
  ["maintenance", /^hub\/README\.md$/],
];

// What this local check cannot decide, keyed by the change categories that
// make the dependency real. Each names the concrete missing input.
const dependencies = {
  always: [
    "Producer, pull request identity and end-of-run head recheck (3.2.1 steps 1, 2, 4) need the live site tip and the GitHub pull request record.",
    "Workflow and CODEOWNERS policy evaluation over the head revision (3.2.2, section 10) is a separate check.",
    "Final acceptance needs the P-B admission run on trusted tooling and a human merge.",
  ],
  publisher: "Publisher owner/key change: the Git objects carry no PR author or GitHub login evidence, so who may change a publisher record is undecided.",
  tombstone: "Withdrawal or restoration: validity needs reconcileLifecycle against the accepted baseline (data/hub/generated at the site base), which this check does not load.",
  "community-bundle": "Bundle admission needs signature parity, trust tier and rule loading from the hubcheck reader and pinned Pipelock engine.",
  "community-signature": "Signing evidence still needs parity with the native reader and publisher records authorized by the admission workflow.",
  config: "Config assessment needs the pinned engine and config vocabulary run (section 8).",
  listing: "Listing assertions over the acquired files still need native reader evidence for the derived catalog record.",
  quality: "Measured artifacts are not validated here; section 9 measurement approval applies.",
};

function git(repository, args) {
  return execFileSync("git", ["-C", repository, "--no-optional-locks", "--no-replace-objects", ...args], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" },
    stdio: ["ignore", "pipe", "ignore"],
  });
}

const oneLine = error => String(error?.message ?? error).split("\n", 1)[0].replace(/[^\x20-\x7e]/g, "?").slice(0, 200);

const defaultSite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rulesRepository = "pipelab-org/pipelock-rules";
const commitSHA = /^[a-f0-9]{40}$/;

function pullRequest(number) {
  return JSON.parse(execFileSync("gh", ["api", "--hostname", "github.com", `repos/${rulesRepository}/pulls/${number}`], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000,
  }));
}

function matchesPullRequest(pr, number, base, head) {
  return pr?.number === number && pr.state === "open" && pr.base?.repo?.full_name === rulesRepository &&
    pr.base.ref === "main" && pr.base.sha === base && pr.head?.sha === head;
}


export function preflightContribution({ repository, base, head, maintenance = false, site = defaultSite }) {
  const report = { mode: maintenance ? "maintenance" : "contribution", base, head, verdict: "REFUSED", steps: {}, changes: [], categories: [], remaining: [] };
  const run = (name, action) => {
    try {
      const evidence = action();
      report.steps[name] = { status: "pass", evidence };
      return true;
    } catch (error) {
      report.steps[name] = { status: "fail", evidence: oneLine(error) };
      return false;
    }
  };
  const directory = mkdtempSync(path.join(tmpdir(), "hub-preflight-"));
  try {
    let paths;
    if (!run("hub-only", () => {
      paths = assertHubOnly(repository, base, head, { maintenance });
      return paths.length;
    })) return report;

    if (!run("change-kinds", () => {
      const status = git(repository, ["diff", "--name-status", "-z", "--no-renames", base, head])
        .toString("utf8").split("\0");
      if (status.pop() !== "" || status.length !== 2 * paths.length) throw new Error("inconsistent Git change list");
      for (const [index, file] of paths.entries()) {
        const change = status[2 * index];
        if (status[2 * index + 1] !== file) throw new Error("inconsistent Git change list");
        if (!["A", "M", "D"].includes(change)) throw new Error("type change or unsupported change kind");
        report.changes.push({ status: change, path: file });
      }
      return report.changes.length;
    })) return report;

    report.categories = categories.filter(([, pattern]) => report.changes.some(change => pattern.test(change.path))).map(([name]) => name);

    // Exact blob reader: regular 100644 blobs only, size-checked, no checkout.
    const tree = path.join(directory, "tree");
    mkdirSync(tree);
    if (!run("object-read", () => acquireHubTree(repository, head, tree))) return report;

    // Data-only parse of listing, publisher and tombstone files.
    let loaded;
    if (!run("source-parse", () => {
      loaded = loadAcquiredListings(tree, path.resolve(site));
      return { publishers: loaded.publishers.length, listings: loaded.items.length, histories: loaded.history.length };
    })) return report;

    if (!run("bundle-signatures", () => loaded.items.filter(item => item.publisher).map(item => {
      const listing = parseListing(readFileSync(item.listing_file, "utf8"));
      const { bundle_sha256, signer_fingerprint, signature_sha256 } = verifyBundle({
        ...readBundleFiles(item.bundle_dir), official: [], publisher: item.publisher.keys.map(key => key.fingerprint),
      });
      if (bundle_sha256 !== listing.bundle_sha256 || signer_fingerprint !== listing.signer_fingerprint) {
        throw new Error("signed pair differs from the community listing");
      }
      return { id: listing.id, bundle_sha256, signer_fingerprint, signature_sha256 };
    }))) return report;

    report.remaining = [...dependencies.always, ...report.categories.filter(name => dependencies[name]).map(name => dependencies[name])];
    report.verdict = "LOCAL-ELIGIBLE";
    return report;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// This mode binds the local input check to a public PR. Producer and admission
// evidence are separate. The caller still verifies the authoritative Git refs.
export function preflightPullRequest({ number, ...options }, readPull = pullRequest) {
  const { base, head } = options;
  const binding = { repository: rulesRepository, number, base, head };
  const refused = evidence => ({
    mode: "contribution", base, head, verdict: "REFUSED", pull_request: binding,
    steps: { "pull-request": { status: "fail", evidence } }, changes: [], categories: [], remaining: [],
  });
  if (!Number.isSafeInteger(number) || number < 1 || typeof base !== "string" || typeof head !== "string" ||
      !commitSHA.test(base) || !commitSHA.test(head)) {
    return refused("an exact pull request number and full base and head SHAs are required");
  }
  const matches = () => {
    try {
      return matchesPullRequest(readPull(number), number, base, head);
    } catch {
      return false;
    }
  };
  if (!matches()) return refused("open pull request does not match the requested repository, base and head");
  try {
    for (const commit of [base, head]) {
      if (git(options.repository, ["cat-file", "-t", commit]).toString().trim() !== "commit") {
        return refused("pull request base and head must be exact commit objects");
      }
    }
  } catch {
    return refused("pull request commit objects cannot be verified");
  }
  // Admission evidence must check the submitted tree including current main.
  // A merge-base diff alone cannot prove the state that would be merged.
  try {
    git(options.repository, ["merge-base", "--is-ancestor", base, head]);
  } catch {
    return refused("pull request must include current rules main");
  }

  const report = preflightContribution({ ...options, maintenance: false });
  if (report.steps["object-read"]?.status === "pass") {
    binding.head_tree = report.steps["object-read"].evidence.tree;
  }
  report.pull_request = binding;
  try {
    const { commit, workflows, codeowners } = acquirePolicyBlobs(options.repository, head);
    const metadata = blobs => blobs.map(({ path, object, size }) => ({ path, object, size }));
    report.steps["policy-inputs"] = { status: "pass", evidence: {
      commit, workflows: metadata(workflows), codeowners: metadata(codeowners),
    } };
  } catch (error) {
    report.verdict = "REFUSED";
    report.remaining = [];
    report.steps["policy-inputs"] = { status: "fail", evidence: oneLine(error) };
  }
  if (report.verdict !== "LOCAL-ELIGIBLE") return report;
  if (!matches()) {
    report.verdict = "REFUSED";
    report.remaining = [];
    report.steps["pull-request"] = { status: "fail", evidence: "pull request moved, closed or became unavailable during the check" };
    return report;
  }
  report.steps["pull-request"] = { status: "pass", evidence: binding };
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const maintenance = args[0] === "--maintenance";
  const bound = args[0] === "--pr";
  if (maintenance || bound) args.shift();
  const prNumber = bound ? args.shift() : null;
  const number = Number(prNumber);
  const [repository, base, head, site] = args;
  if (args.length < 3 || args.length > 4 || args.some(arg => !arg || arg.startsWith("--")) ||
      (bound && (!/^[1-9][0-9]*$/.test(prNumber ?? "") || !Number.isSafeInteger(number)))) {
    console.error("usage: contribution-preflight.mjs [--maintenance | --pr NUMBER] GIT_OBJECT_STORE BASE_SHA HEAD_SHA [TRUSTED_SITE_DIR]");
    process.exit(2);
  }
  const options = { repository, base, head, maintenance, site };
  const report = bound ? preflightPullRequest({ ...options, number }) : preflightContribution(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== "LOCAL-ELIGIBLE") process.exitCode = 1;
}
