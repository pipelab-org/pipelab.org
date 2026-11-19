import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { routineAcceptance } from "../scripts/hub/acceptance.mjs";
import { loadAcquiredListings } from "../scripts/hub/source-listings.mjs";
import { acceptedSource, acquireHubTree, assertHubOnly, assertSourceProgress, materializeGitTree } from "../scripts/hub/source-tree.mjs";

function repository(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-tree-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe", encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = (file, contents) => {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), contents);
    git("add", "--", file);
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  return { directory, git, commit };
}

test("Hub acquisition reads exact committed bytes and rejects unexpected source files", t => {
  const { directory, commit } = repository(t);
  const base = commit("hub/README.md", "Contributor guide.\n");
  const file = "hub/listings/bundles/example.yaml";
  const contents = "description: Example fixture.\n";
  const head = commit(file, contents);
  assert.deepEqual(assertHubOnly(directory, base, head), [file]);
  const output = path.join(directory, "output");
  mkdirSync(output);
  const evidence = acquireHubTree(directory, head, output);
  assert.equal(evidence.commit, head);
  assert.equal(readFileSync(path.join(output, file), "utf8"), contents);
  const unexpected = commit("hub/.unrecognized", "Unexpected input.\n");
  assert.throws(() => assertHubOnly(directory, base, unexpected), /only Hub contribution files/);
  const rejected = path.join(directory, "rejected");
  mkdirSync(rejected);
  assert.throws(() => acquireHubTree(directory, unexpected, rejected), /outside the source contract/);
});

test("accepted Hub state comes from the base object and requires forward source progress", t => {
  const { directory, commit } = repository(t);
  const base = commit("README.md", "A fixture.\n");
  assert.equal(acceptedSource(directory, base).rules_sha, null);
  const binding = JSON.stringify({ rules_sha: base, tooling_identity: {} });
  const half = commit("data/hub/generated/source.json", binding);
  assert.throws(() => acceptedSource(directory, half), /inventory is missing/);
  const head = commit("data/hub/generated/lifecycle.json", JSON.stringify({ listings: [], history: [], routes: [] }));
  assert.equal(acceptedSource(directory, head).rules_sha, base);
  assert.doesNotThrow(() => assertSourceProgress(directory, base, half, head));
  assert.throws(() => assertSourceProgress(directory, half, base, head), /ancestry/);
  assert.throws(() => assertHubOnly(directory, head, half), /ancestry/);
});

test("site materialization copies committed bytes independently of export attributes", t => {
  const { directory, commit } = repository(t);
  commit(".gitattributes", "version.txt export-subst\nextra.txt export-ignore\n");
  const contents = "Version $Format:%H$\n";
  commit("version.txt", contents);
  const candidate = commit("extra.txt", "Tracked source.\n");
  writeFileSync(path.join(directory, "version.txt"), "Working copy only.\n");

  const destination = path.join(directory, "output");
  mkdirSync(destination);
  materializeGitTree(directory, candidate, destination);
  assert.equal(readFileSync(path.join(destination, "version.txt"), "utf8"), contents);
  assert.equal(readFileSync(path.join(destination, "extra.txt"), "utf8"), "Tracked source.\n");

  const subset = path.join(directory, "subset");
  mkdirSync(subset);
  materializeGitTree(directory, candidate, subset, ["version.txt"]);
  assert.deepEqual(readdirSync(subset), ["version.txt"]);
});

test("routine acceptance refuses a site baseline older than current main", async t => {
  const { directory, git, commit } = repository(t);
  const root = path.resolve(import.meta.dirname, "..");
  cpSync(path.join(root, "scripts/hub"), path.join(directory, "scripts/hub"), { recursive: true });
  symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  mkdirSync(path.join(directory, ".git/info"), { recursive: true });
  writeFileSync(path.join(directory, ".git/info/exclude"), "/node_modules\n");
  git("add", "--", "scripts/hub");
  const old = commit("data/hub/launch.toml", "open = false\n");
  const main = commit("data/hub/generated/lifecycle.json", JSON.stringify({
    listings: [], history: [{ id: "fixture-hold" }], routes: [],
  }));
  const candidate = commit("input.txt", "A fixture.\n");
  git("update-ref", "refs/remotes/origin/main", main);
  assert.doesNotThrow(() => assertSourceProgress(directory, null, old, candidate));

  const { routineAcceptance: runCandidate } = await import(pathToFileURL(path.join(directory, "scripts/hub/acceptance.mjs")));
  const run = (siteBase, verify = runCandidate) => verify({
    source: {
      root: directory,
      sourceBinding: { siteBase, rulesSHA: old, rulesRepository: directory, rulesMain: old },
    },
    siteSHA: candidate,
    rulesSHA: old,
  }, { readMain: () => main });
  const foreign = await run(main, routineAcceptance);
  assert.equal(foreign.steps[1].evidence, "run Hub acceptance from the candidate checkout");
  const stale = await run(old);
  assert.equal(stale.steps[1].evidence, "site baseline differs from current site main");
  const current = await run(main);
  assert.equal(current.steps[2].status, "fail");
  assert.match(current.steps[2].evidence, /rules source does not bind the fetched main tip/);
});

test("Hub source loader requires scalar publisher key fingerprints and calendar dates", async t => {
  const { directory, commit } = repository(t);
  const fingerprint = "b".repeat(64);
  const added = "2024-02-29";
  const acquirePublisher = (outputName, keyValue, dateValue) => {
    const head = commit("hub/publishers/acme.yaml", `id: acme
name: Acme
keys:
  - fingerprint: ${keyValue}
    added: ${dateValue}
`);
    const output = path.join(directory, outputName);
    mkdirSync(output);
    acquireHubTree(directory, head, output);
    return output;
  };

  const valid = acquirePublisher("valid", fingerprint, added);
  assert.deepEqual(loadAcquiredListings(valid, directory).publishers, [
    { id: "acme", name: "Acme", keys: [{ fingerprint, added }] },
  ]);

  const invalidKeys = [
    ["sequence fingerprint", `[${fingerprint}]`, added],
    ["sequence date", fingerprint, `[${added}]`],
    ["impossible date", fingerprint, "2026-02-29"],
  ];
  for (const [name, keyValue, dateValue] of invalidKeys) {
    await t.test(name, () => {
      const output = acquirePublisher(name, keyValue, dateValue);
      assert.throws(() => loadAcquiredListings(output, directory), /invalid Hub publisher metadata/);
    });
  }
});
