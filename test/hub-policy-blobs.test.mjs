import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { acquirePolicyBlobs } from "../scripts/hub/policy-blobs.mjs";
import { assertRulesWorkflowPolicy } from "../scripts/hub/rules-workflow-policy.mjs";
import { rehearseCandidate } from "../scripts/hub/candidate-rehearsal.mjs";

function repository(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-policy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const git = (args, input) => execFileSync("git", [
    "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args,
  ], {
    cwd: directory,
    input,
    encoding: "utf8",
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  }).trim();

  git(["init", "-q", "-b", "main", "--object-format=sha1"]);
  const write = (file, bytes) => {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return target;
  };
  const commit = () => {
    git(["commit", "-qm", "fixture"]);
    return git(["rev-parse", "HEAD"]);
  };
  return { directory, git, write, commit };
}

test("policy acquisition uses the exact commit and returns raw bytes and object identities", t => {
  const { directory, git, write, commit } = repository(t);
  const workflowBytes = Buffer.from([0x23, 0x20, 0xff, 0, 0x0d, 0x0a]);
  const files = new Map([
    [".github/workflows/check.yaml", workflowBytes],
    [".github/workflows/verify.yml", Buffer.alloc(0)],
    [".github/CODEOWNERS", Buffer.from("/hub/ @github-owner\n")],
    ["CODEOWNERS", Buffer.from("/hub/ @root-owner\n")],
    ["docs/CODEOWNERS", Buffer.from("/hub/ @docs-owner\n")],
  ]);
  for (const [file, bytes] of files) write(file, bytes);
  write(".github/workflows/readme.txt", "outside the workflow set");
  write(".github/workflows/nested/check.yml", "outside the workflow set");
  write("docs/unrelated.yml", "outside the workflow set");
  git(["add", "--", ".github", "CODEOWNERS", "docs"]);
  const head = commit();

  write(".github/workflows/check.yaml", "newer commit\n");
  git(["add", "--", ".github/workflows/check.yaml"]);
  const newer = commit();
  git(["replace", head, newer]);
  write(".github/workflows/check.yaml", "staged bytes\n");
  git(["add", "--", ".github/workflows/check.yaml"]);
  write(".github/workflows/check.yaml", "working-copy bytes\n");
  write(".github/workflows/untracked.yaml", "untracked bytes\n");

  const evidence = acquirePolicyBlobs(directory, head);
  assert.equal(evidence.commit, head);
  assert.deepEqual(acquirePolicyBlobs(path.join(directory, ".git"), head), evidence);
  assert.deepEqual(evidence.workflows.map(item => item.path), [".github/workflows/check.yaml", ".github/workflows/verify.yml"]);
  assert.deepEqual(evidence.codeowners.map(item => item.path), [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]);
  for (const item of [...evidence.workflows, ...evidence.codeowners]) {
    assert.deepEqual(item.bytes, files.get(item.path));
    assert.equal(item.size, item.bytes.length);
    assert.equal(item.object, git(["hash-object", "--stdin"], item.bytes));
  }
});

test("missing governance is represented by empty arrays and refs or non-commits are rejected", t => {
  const { directory, git, write, commit } = repository(t);
  write("README.md", "fixture");
  git(["add", "--", "README.md"]);
  const head = commit();
  assert.deepEqual(acquirePolicyBlobs(directory, head), { commit: head, workflows: [], codeowners: [] });
  for (const invalid of ["HEAD", head.slice(0, 12), head + "\n"]) {
    assert.throws(() => acquirePolicyBlobs(directory, invalid), /full Git commit SHA/);
  }
  const missing = "a".repeat(40);
  git(["update-ref", "refs/heads/" + missing, head]);
  assert.throws(() => acquirePolicyBlobs(directory, missing), /Git policy object lookup failed/);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  assert.throws(() => acquirePolicyBlobs(directory, tree), /exact Git commit object/);
});

test("policy acquisition refuses symlinks, executable blobs and a symlinked workflow directory", t => {
  const { directory, git, write, commit } = repository(t);
  write("fixture.txt", "fixture");
  mkdirSync(path.join(directory, ".github/workflows"), { recursive: true });
  symlinkSync("../../fixture.txt", path.join(directory, ".github/workflows/link.yml"));
  git(["add", "--", "fixture.txt", ".github/workflows/link.yml"]);
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /regular, non-executable Git blob/);

  git(["rm", "-q", "--", ".github/workflows/link.yml"]);
  write("docs/CODEOWNERS", "fixture");
  git(["add", "--chmod=+x", "--", "docs/CODEOWNERS"]);
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /regular, non-executable Git blob/);

  git(["rm", "-q", "--cached", "--", "docs/CODEOWNERS"]);
  mkdirSync(path.join(directory, ".github"), { recursive: true });
  symlinkSync("../fixture.txt", path.join(directory, ".github/workflows"));
  git(["add", "--", ".github/workflows"]);
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /policy directory must be a Git tree/);
});

test("policy acquisition accepts the per-file boundary and rejects an oversized blob", t => {
  const { directory, git, write, commit } = repository(t);
  const file = ".github/workflows/large.yml";
  const limit = 1024 * 1024;
  write(file, Buffer.alloc(limit, 0x78));
  git(["add", "--", file]);
  assert.equal(acquirePolicyBlobs(directory, commit()).workflows[0].bytes.length, limit);

  write(file, Buffer.alloc(limit + 1, 0x78));
  git(["add", "--", file]);
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /per-file byte limit/);
});

test("policy acquisition bounds the file count and total bytes using Git metadata", t => {
  const { directory, git, commit } = repository(t);
  const addBlobs = (count, object, prefix) => {
    const entries = Array.from({ length: count }, (_, index) => {
      return "100644 " + object + "\t.github/workflows/" + prefix + index + ".yml\n";
    });
    git(["update-index", "--index-info"], entries.join(""));
  };
  const large = git(["hash-object", "-w", "--stdin"], Buffer.alloc(1024 * 1024, 0x78));
  addBlobs(17, large, "large");
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /total byte limit/);

  const empty = git(["hash-object", "-w", "--stdin"], "");
  addBlobs(2984, empty, "small");
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /file count limit/);
});

test("policy acquisition rejects control characters in workflow paths", t => {
  const { directory, git, write, commit } = repository(t);
  const file = ".github/workflows/check\nextra.yml";
  write(file, "fixture");
  git(["add", "--", file]);
  assert.throws(() => acquirePolicyBlobs(directory, commit()), /policy path is outside the acquisition bounds/);
});

test("Hub workflow policy requires ownership and confines the advisory workflow to read-only Hub PRs", () => {
  const policy = `on:
  pull_request:
    branches: [main]
    paths: ['hub/**']
permissions: {contents: read}
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: 'true'
`;
  const file = (path, value) => ({ path, object: "a".repeat(40), bytes: Buffer.from(value) });
  const codeowners = [file(".github/CODEOWNERS", [
    "/hub/", "/.github/", "/.github/CODEOWNERS", "/scripts/", "/rules/", "/published/", "/compatibility/",
  ].map(pattern => pattern + " @example-maintainers").join("\n"))];
  const check = (advisory, extra = [], owners = codeowners) => assertRulesWorkflowPolicy({
    codeowners: owners,
    workflows: [file(".github/workflows/hub-validate.yml", advisory), ...extra],
  });

  assert.doesNotThrow(() => check(policy));
  assert.throws(() => check(policy, [], []), /requires .github\/CODEOWNERS/);
  assert.throws(() => check(policy.replace("contents: read", "contents: write")), /must be read-only/);
  assert.throws(() => check(policy.replace("hub/**", "**")), /must be read-only/);
  assert.throws(() => check(policy, [file(".github/workflows/other.yml", "on: pull_request_target")]), /unreviewed privileged trigger/);
});

test("candidate rehearsal refuses untracked catalog data and hidden tooling changes before acquisition", t => {
  const { directory, git, write, commit } = repository(t);
  write("package-lock.json", "{}");
  write("scripts/hub/trusted.mjs", "export const trusted = true;\n");
  git(["add", "--", "."]);
  const siteBase = commit();
  const candidate = { siteBase, source: { root: directory } };
  const inventory = write("data/hub/generated/inventory.json", "{}");
  assert.throws(() => rehearseCandidate(candidate), /requires the exact clean site checkout/);
  rmSync(inventory);
  git(["update-index", "--skip-worktree", "scripts/hub/trusted.mjs"]);
  write("scripts/hub/trusted.mjs", "export const trusted = false;\n");
  assert.equal(git(["status", "--porcelain=v1"]), "");
  assert.throws(() => rehearseCandidate(candidate), /tooling differs from the site commit/);
});
