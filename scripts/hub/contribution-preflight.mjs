import { readGit as git, readRemoteRefs } from "./git-source.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as commonmark from "commonmark";
import { HubUnavailable } from "./check-failure.mjs";
import { acquireRulesObjects, readRulesAPI, rulesRepository } from "./rules-acquisition.mjs";
import { loadAcquiredListings } from "./source-listings.mjs";
import { acquirePolicyBlobs } from "./policy-blobs.mjs";
import { parseListing } from "./validate.mjs";
import { readBundleFiles, verifyBundle } from "./verify-bundle.mjs";
import { defaultLicenses, readLicenseMaterial } from "./license-delivery.mjs";
import { approvalFile, communityListingKey, findLicenseApprovals, osiApprovedLicenses, parseLicenseApprovals } from "./license-approvals.mjs";
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
  ["community-license", /^hub\/community\/[^/]+\/[^/]+\/(?:LICENSE|NOTICE)$/],
  ["community-fixture", /^hub\/community\/[^/]+\/[^/]+\/fixtures\//],
  ["quality", /^hub\/quality\//],
  ["maintenance", /^hub\/README\.md$/],
  ["license-approval", /^hub\/license-approvals\.yaml$/],
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
  "community-license": "License text and notices are checked against the declared license during catalog generation: default licenses by complete canonical text, other OSI licenses by a recorded approval of the exact text.",
  "license-approval": "License approval: the Git objects carry no reviewer identity, so who approved is governed by CODEOWNERS on /hub/; approved_in is checked for form only, not that its Rules pull request merged.",
  "community-signature":"Signing evidence still needs parity with the native reader and publisher records authorized by the admission workflow.",
  config: "Config assessment needs the pinned engine and config vocabulary run (section 8).",
  listing: "Listing assertions over the acquired files still need native reader evidence for the derived catalog record.",
  quality: "Measured artifacts are not validated here; section 9 measurement approval applies.",
};

const oneLine = error => String(error?.message ?? error).split("\n", 1)[0].replace(/[^\x20-\x7e]/g, "?").slice(0, 200);

const defaultSite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commitSHA = /^[a-f0-9]{40}$/;

class RulesRefMismatch extends Error {}

function pullRequest(number) {
  const pr = readRulesAPI("pulls/" + number, { fresh: true });
  const baseRef = "refs/heads/main";
  const headRef = `refs/pull/${number}/head`;
  const tips = readRemoteRefs(`https://github.com/${rulesRepository}`, [baseRef, headRef], "invalid rules ref result", {
    unavailable: "Rules pull request refs unavailable from GitHub",
  });
  if (pr?.base?.sha !== tips.get(baseRef) || pr?.head?.sha !== tips.get(headRef)) {
    throw new RulesRefMismatch("pull request metadata differs from the published Rules refs");
  }
  return pr;
}

// Hub contributors may never visit pipelab.org, so admission requires their
// explicit agreement in the pull request itself. The line must match exactly
// and be checked; an unchecked or edited line is not agreement.
export const contributorTermsAcknowledgment = "I agree to the PipeLab Terms of Service (https://pipelab.org/terms/) and Hub policies (https://pipelab.org/hub/policies/). I have the rights to submit this material, and the pack files keep their declared license.";
export const contributorTermsMissing = "the contributor terms checkbox in the pull request description is not checked";

export function acknowledgesContributorTerms(body) {
  if (typeof body !== "string") return false;
  // Parse the description as CommonMark so code blocks, HTML blocks, comments
  // and indented code never count. Only a list item outside a block quote whose
  // first paragraph is plain text "[x] " followed by the exact line counts.
  const walker = new commonmark.Parser().parse(body).walker();
  for (let event = walker.next(); event; event = walker.next()) {
    const node = event.node;
    if (!event.entering || node.type !== "item") continue;
    let quoted = false;
    for (let parent = node.parent; parent; parent = parent.parent) quoted ||= parent.type === "block_quote";
    const paragraph = node.firstChild;
    if (quoted || paragraph?.type !== "paragraph") continue;
    let text = "", plain = true;
    for (let child = paragraph.firstChild; child; child = child.next) {
      if (child.type === "text") text += child.literal;
      else if (child.type === "softbreak") text += " ";
      else plain = false;
    }
    const match = /^\[[xX]\] (.*)$/s.exec(text);
    if (plain && match && match[1].trim() === contributorTermsAcknowledgment) return true;
  }
  return false;
}

function matchesPullRequest(pr, number, base, head) {
  return pr?.number === number && pr.state === "open" && pr.base?.repo?.full_name === rulesRepository &&
    pr.base.ref === "main" && pr.base.sha === base && pr.head?.sha === head;
}


const approvalIdentity = entry => [entry.listing, entry.license, entry.license_sha256].join(" ");

// Approvals already recorded at the base commit, keyed by listing, license and
// text digest. A missing or unreadable base file yields none, so every approval
// in the candidate is then treated as new and checked.
function baseApprovals(repository, base) {
  try {
    return new Set(parseLicenseApprovals(git(repository, ["show", base + ":" + approvalFile]).toString("utf8")).map(approvalIdentity));
  } catch {
    return new Set();
  }
}

export function preflightContribution({ repository, base, head, maintenance = false, site = defaultSite }, inspect) {
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
    const tree = path.join(realpathSync(directory), "tree");
    mkdirSync(tree);
    if (!run("object-read", () => acquireHubTree(repository, head, tree))) return report;

    // Data-only parse of listing, publisher and tombstone files.
    let loaded;
    if (!run("source-parse", () => {
      loaded = loadAcquiredListings(tree, path.resolve(site));
      return { publishers: loaded.publishers.length, listings: loaded.items.length, histories: loaded.history.length };
    })) return report;

    // List membership gates an approval only when it is admitted: entries added or
    // changed relative to the base. Loading and generation do not recheck it, and
    // an unchanged entry whose identifier later left the list fails only at use
    // time for its own listing, so it cannot block an unrelated approval.
    if (report.categories.includes("license-approval") && !run("license-approval-list", () => {
      const admitted = baseApprovals(repository, base);
      const added = loaded.approvals.filter(entry => !admitted.has(approvalIdentity(entry)));
      const outside = added.filter(entry => !osiApprovedLicenses().has(entry.license));
      if (outside.length) throw new Error("license approval names a license outside the OSI-approved list: " + outside.map(entry => entry.listing + " " + entry.license).join(", "));
      return added.length;
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

    // A non-default license is admitted only with a recorded approval of the
    // delivered text. Default licenses are checked during catalog generation.
    if (!run("license-approvals", () => loaded.items.filter(item => item.publisher).flatMap(item => {
      const listing = parseListing(readFileSync(item.listing_file, "utf8"));
      if (defaultLicenses.has(listing.license)) return [];
      const material = readLicenseMaterial(item.bundle_dir, listing.license, readBundleFiles(item.bundle_dir), {
        approval: findLicenseApprovals(loaded.approvals, communityListingKey(item.publisher.id, listing.bundle_name), listing.license),
      });
      return [{ id: listing.id, license: listing.license, license_sha256: material.license.sha256 }];
    }))) return report;

    if (inspect && !run("candidate", () => inspect({ tree, loaded, changes: report.changes }))) return report;

    report.remaining = [...dependencies.always, ...report.categories.filter(name => dependencies[name]).map(name => dependencies[name])];
    report.verdict = "LOCAL-ELIGIBLE";
    return report;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// This mode binds the local input check to a public PR. Producer and admission
// evidence are separate. The default reader verifies the API against live Git refs.
export function preflightPullRequest({ number, fetchRules = false, ...options }, readPull = pullRequest, inspect) {
  const { base, head } = options;
  const binding = { repository: rulesRepository, number, base, head };
  const refused = (error, step = "pull-request") => ({
    mode: "contribution", base, head, verdict: error instanceof HubUnavailable ? "UNAVAILABLE" : "REFUSED", pull_request: binding,
    steps: { [step]: { status: "fail", evidence: oneLine(error) } }, changes: [], categories: [], remaining: [],
  });
  if (!Number.isSafeInteger(number) || number < 1 || typeof base !== "string" || typeof head !== "string" ||
      !commitSHA.test(base) || !commitSHA.test(head)) {
    return refused("an exact pull request number and full base and head SHAs are required");
  }
  const mismatch = () => {
    try {
      const pr = readPull(number);
      if (!matchesPullRequest(pr, number, base, head)) return "open pull request does not match the requested repository, base and head";
      if (!acknowledgesContributorTerms(pr.body)) return contributorTermsMissing;
      mismatch.agreement = { acknowledged: true, body_sha256: createHash("sha256").update(pr.body).digest("hex") };
      return null;
    } catch (error) {
      if (error instanceof RulesRefMismatch || error instanceof HubUnavailable) return error;
      return "published Rules pull request could not be verified";
    }
  };
  const initial = mismatch();
  if (initial) return refused(initial);
  if (!fetchRules) return inspectPullRequest(options, binding, mismatch, refused, inspect);

  const directory = mkdtempSync(path.join(tmpdir(), "hub-rules-objects-"));
  try {
    let repository;
    try {
      repository = acquireRulesObjects(directory, binding);
    } catch (error) {
      return refused(error, "rules-acquisition");
    }
    return inspectPullRequest({ ...options, repository }, binding, mismatch, refused, inspect);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function inspectPullRequest(options, binding, mismatch, refused, inspect) {
  const { base, head } = options;
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

  const report = preflightContribution({ ...options, maintenance: false },
    inspect && (data => inspect({ ...data, repository: options.repository, base, head })));
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
    delete report.steps.candidate;
    report.steps["policy-inputs"] = { status: "fail", evidence: oneLine(error) };
  }
  if (report.verdict !== "LOCAL-ELIGIBLE") return report;
  const final = mismatch();
  if (final instanceof HubUnavailable) return refused(final);
  if (final) {
    report.verdict = "REFUSED";
    report.remaining = [];
    delete report.steps.candidate;
    report.steps["pull-request"] = { status: "fail", evidence: final === contributorTermsMissing ? final :
      "pull request moved, closed or became unavailable during the check" };
    return report;
  }
  report.steps["pull-request"] = { status: "pass", evidence: { ...binding, contributor_terms: mismatch.agreement } };
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const maintenance = args[0] === "--maintenance";
  const fetchRules = args[0] === "--fetch-pr";
  const bound = fetchRules || args[0] === "--pr";
  if (maintenance || bound) args.shift();
  const prNumber = bound ? args.shift() : null;
  const number = Number(prNumber);
  const minimumArgs = fetchRules ? 2 : 3;
  const [repository, base, head, site] = fetchRules ? [undefined, ...args] : args;
  if (args.length < minimumArgs || args.length > minimumArgs + 1 || args.some(arg => !arg || arg.startsWith("--")) ||
      (bound && (!/^[1-9][0-9]*$/.test(prNumber ?? "") || !Number.isSafeInteger(number)))) {
    console.error("usage: contribution-preflight.mjs [--maintenance | --pr NUMBER] GIT_OBJECT_STORE BASE_SHA HEAD_SHA [TRUSTED_SITE_DIR]");
    console.error("       contribution-preflight.mjs --fetch-pr NUMBER BASE_SHA HEAD_SHA [TRUSTED_SITE_DIR]");
    process.exit(2);
  }
  const options = { repository, base, head, maintenance, site };
  const report = bound ? preflightPullRequest({ ...options, number, fetchRules }) : preflightContribution(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict === "UNAVAILABLE") process.exitCode = 3;
  else if (report.verdict !== "LOCAL-ELIGIBLE") process.exitCode = 1;
}
