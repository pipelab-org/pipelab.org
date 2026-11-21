import { readFileSync } from "node:fs";
import path from "node:path";
import { benchmarkReport } from "./benchmark-report.mjs";
import { measurementMethod } from "./evidence.mjs";
import { parseListing } from "./validate.mjs";

// GitHub-hosted jobs have a six-hour execution limit. The native harness also
// enforces the committed per-sample deadline independently of this bound.
const hostedJobTimeout = 6 * 60 * 60 * 1000;

export function changedCandidatePacks({ tree, loaded, changes }) {
  const changed = changes.map(change => change.path);
  return loaded.items.filter(({ listing_file, bundle_dir, publisher }) => {
    if (!bundle_dir) return false;
    const listing = path.relative(tree, listing_file);
    if (changed.includes(listing)) return true;
    if (!publisher) return false;
    const files = path.relative(tree, bundle_dir) + "/";
    const keys = "hub/publishers/" + publisher.id + ".yaml";
    return changed.some(file => file === keys || file.startsWith(files));
  });
}

export function measureCandidatePacks({ candidate, source, rulesFixtureRepository, output }) {
  const method = JSON.parse(readFileSync(path.join(source.root, "data/hub/benchmark-method.json"), "utf8"));
  const limits = JSON.parse(readFileSync(path.join(source.root, "data/hub/latency-limits.json"), "utf8"));
  measurementMethod(source.root, source.config, method.pairs, { requireCommittedPairs: true });
  return changedCandidatePacks(candidate).map(item => {
    const listing = parseListing(readFileSync(item.listing_file, "utf8"));
    const trusted_keys = (item.publisher?.keys ?? []).map(({ fingerprint }, index) => ({
      name: item.publisher.id + "-" + index, public_key: fingerprint,
    }));
    const result = benchmarkReport({
      binary: source.binary, engine: source.engine, root: source.root,
      repository: source.repository, rulesRepository: rulesFixtureRepository,
      publisherId: item.publisher?.id,
      request: { bundle_dir: item.bundle_dir, config: source.config, trusted_keys },
      pairs: method.pairs, limits, acceptance: true, executionTimeout: hostedJobTimeout,
      output: path.join(output, listing.id),
    });
    if (result.verdict.status !== "pass" ||
        result.bindings.bundle_sha256 !== listing.bundle_sha256) {
      throw new Error("changed bundle did not produce passing latency evidence");
    }
    return { id: listing.id, ...result };
  });
}
