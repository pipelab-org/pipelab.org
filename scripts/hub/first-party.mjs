import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { parseListing, resolveArtifact, validateListing } from "./validate.mjs";
import { sha256 } from "./evidence.mjs";

const site = "https://pipelab.org";

export function firstPartyRecipes(root) {
  const content = path.join(root, "content/learn");
  const entries = readdirSync(content, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && /^[a-z0-9][a-z0-9-]*\.md$/.test(entry.name)).flatMap(entry => {
    const text = readFileSync(path.join(content, entry.name), "utf8");
    const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const guide = header ? parse(header[1]) : null;
    if (guide?.recipe !== true) return [];
    const id = path.basename(entry.name, ".md");
    const route = "/learn/" + id + "/";
    if (guide.draft || guide.url || guide.slug || typeof guide.requires_pro !== "boolean") {
      throw new Error("invalid first-party recipe front matter: " + id);
    }
    const listing = validateListing({
      schema_version: 1,
      type: "recipe",
      id,
      title: guide.title,
      summary: guide.description,
      maintainer: { name: "PipeLab", github: "pipelab-org" },
      license: "Apache-2.0",
      evidence: {
        date: guide.evidence_date,
        pipelock_version: guide.tested_pipelock,
        method: "The linked recipe documents the test setup and expected results.",
      },
      setup: [{ text: "Run the commands in the linked recipe." }],
      limitations: guide.limitations,
      not_claimed: guide.not_claimed,
      links: { homepage: site + route },
      disclosures: { ai_assisted: true, conflict_of_interest: "Maintained by PipeLab." },
      learn_page: route,
    });
    return [{ listing, pro: guide.requires_pro }];
  });
}

export function firstPartyVerifierItems(root) {
  const directory = path.join(root, "data/hub/first-party");
  if (!existsSync(directory)) return [];
  const files = readdirSync(directory, { withFileTypes: true });
  return files.filter(entry => entry.isFile() && /^[a-z0-9-]+\.yaml$/.test(entry.name)).flatMap(entry => {
    const listing_file = path.join(directory, entry.name);
    const listing = parseListing(readFileSync(listing_file, "utf8"));
    return listing.type === "verifier" ? [{ listing_file, artifact_root: path.join(root, "assets/hub") }] : [];
  });
}

export function verifierEvidence(root, listing) {
  const relative = "verifiers/" + listing.id + "/conformance.json";
  if (listing.conformance_artifact !== relative || listing.evidence.artifact !== relative ||
      listing.release !== listing.evidence.pipelock_version) {
    throw new Error("verifier conformance evidence does not match the listing");
  }
  const bytes = readFileSync(resolveArtifact(root, relative));
  const report = JSON.parse(bytes);
  const hex = /^[a-f0-9]{64}$/;
  const isDigest = value => typeof value === "string" && hex.test(value);
  if (report.format !== 1 || report.tool !== listing.id || report.release !== listing.release ||
      !isDigest(report.binary_sha256) || typeof report.corpus_commit !== "string" || !/^[a-f0-9]{40}$/.test(report.corpus_commit) ||
      !Array.isArray(report.cases) || !report.cases.some(test => test?.valid === true) ||
      !report.cases.some(test => test?.valid === false) ||
      report.cases.some(test => typeof test?.valid !== "boolean" || !isDigest(test.sha256) ||
        typeof test.path !== "string" || !test.path.startsWith("sdk/conformance/testdata/corpus/") ||
        test.path.split("/").some(segment => !segment || segment === "." || segment === "..") ||
        test.exit !== (test.valid ? 0 : 1)) ||
      new Set(report.cases.map(test => test.path)).size !== report.cases.length ||
      new Set(report.cases.map(test => test.sha256)).size !== report.cases.length) {
    throw new Error("verifier conformance artifact lacks consistent release evidence");
  }
  return { relative, sha256: sha256(bytes), cases: report.cases.length };
}
