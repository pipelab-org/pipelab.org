import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { admissionProducer } from "../scripts/hub/admission-producer.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "hub-producer-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe", encoding: "utf8" }).trim();
  const write = (file, bytes) => writeFileSync(path.join(root, file), bytes);
  git("init", "-q", "-b", "main");
  mkdirSync(path.join(root, "scripts/hub"), { recursive: true });
  write("scripts/hub/example.mjs", "export const value = 1;\n");
  write("package-lock.json", "{}\n");
  write(".gitignore", "ignored.mjs\n");
  git("add", "--", "scripts/hub/example.mjs", "package-lock.json", ".gitignore");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "site fixture");
  const revision = git("rev-parse", "HEAD");
  const workflow = ".github/workflows/hub-admission.yml";
  const environment = {
    GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "pipelab-org/pipelab.org",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: revision,
    GITHUB_WORKFLOW_SHA: revision, GITHUB_WORKFLOW_REF: "pipelab-org/pipelab.org/" + workflow + "@refs/heads/main",
    GITHUB_RUN_ID: "42",
  };
  return { root, revision, workflow, git, write, environment, mode: "admission", engine: { version: "fixture" } };
}

test("admission producer binds the current main workflow, exact checkout and tooling", t => {
  const input = fixture(t);
  const report = admissionProducer(input, () => input.revision);
  assert.equal(report.sha, input.revision);
  assert.equal(report.workflow, input.workflow);
  assert.equal(report.run_id, "42");
  assert.equal(report.tooling_identity.scripts_tree, input.git("rev-parse", "HEAD:scripts/hub"));
});

test("a feature workflow, wrong workflow version or scheduled admission cannot claim main", t => {
  const input = fixture(t);
  const denied = [
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_WORKFLOW_REF: input.environment.GITHUB_WORKFLOW_REF.replace("/main", "/feature") },
    { GITHUB_WORKFLOW_SHA: "0".repeat(40) },
    { GITHUB_EVENT_NAME: "schedule" },
    { GITHUB_REPOSITORY: "someone/pipelab.org" },
  ];
  for (const changed of denied) {
    const environment = { ...input.environment, ...changed };
    assert.throws(() => admissionProducer({ ...input, environment }, () => assert.fail("read remote")), /producer context/);
  }
});

test("scheduled sync requires its own workflow identity", t => {
  const input = fixture(t);
  input.environment.GITHUB_EVENT_NAME = "schedule";
  input.environment.GITHUB_WORKFLOW_REF = input.environment.GITHUB_WORKFLOW_REF.replace("hub-admission.yml", "sync-pipelab-hub.yml");
  const report = admissionProducer({ ...input, mode: "sync" }, () => input.revision);
  assert.equal(report.workflow, ".github/workflows/sync-pipelab-hub.yml");
});

test("unavailable or advanced main refuses to produce evidence", t => {
  const input = fixture(t);
  assert.throws(() => admissionProducer(input, () => { throw new Error("main unavailable"); }), /main unavailable/);
  assert.throws(() => admissionProducer(input, () => "0".repeat(40)), /current site main/);
});

test("a dirty checkout or ignored Hub tooling cannot produce evidence", t => {
  const input = fixture(t);
  input.write("package-lock.json", "{\"extra\":true}\n");
  const run = () => admissionProducer(input, () => input.revision);
  assert.throws(run, /clean site checkout/);
  input.write("package-lock.json", "{}\n");
  input.write("scripts/hub/ignored.mjs", "export const value = 2;\n");
  assert.throws(run, /tooling differs/);
});
