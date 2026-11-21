import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { admissionProducer, readSiteMain } from "../scripts/hub/admission-producer.mjs";
import { HubCheckFailure, HubUnavailable } from "../scripts/hub/check-failure.mjs";

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

test("site main lookup uses an isolated Git context and keeps the proxy", t => {
  const { root, revision } = fixture(t);
  const proxy = "http://proxy.example.invalid:8080";
  let lookupDirectory;
  const tip = readSiteMain({
    environment: { GIT_DIR: path.join(root, ".git"), GIT_CONFIG_COUNT: "1", HTTPS_PROXY: proxy },
    runGit: (command, args, options) => {
      assert.equal(command, "git");
      assert.deepEqual(args, ["-c", "http.followRedirects=false", "ls-remote", "--exit-code",
        "https://github.com/pipelab-org/pipelab.org", "refs/heads/main"]);
      lookupDirectory = options.cwd;
      assert.notEqual(options.cwd, root);
      assert.equal(existsSync(path.join(options.cwd, ".git")), false);
      assert.equal(options.env.GIT_CONFIG_NOSYSTEM, "1");
      assert.equal(options.env.GIT_CONFIG_GLOBAL, path.join(options.cwd, "config"));
      assert.equal(options.env.GIT_ALLOW_PROTOCOL, "https");
      assert.equal(options.env.GIT_DIR, undefined);
      assert.equal(options.env.GIT_CONFIG_COUNT, undefined);
      assert.equal(options.env.HTTPS_PROXY, proxy);
      assert.equal(options.env.LC_ALL, "C");
      return revision + "\trefs/heads/main\n";
    },
  });
  assert.equal(tip, revision);
  assert.equal(existsSync(lookupDirectory), false);
});

test("remote ref lookup distinguishes transport failures from malformed evidence", () => {
  const read = runGit => readSiteMain({ runGit });
  const expectedRef = "a".repeat(40) + "\trefs/heads/main\n";
  for (const bad of [
    "malformed\n", expectedRef + expectedRef, expectedRef.replace("\n", "\t\n"),
    "b".repeat(40) + "\trefs/heads/other\n",
  ]) {
    assert.throws(() => read(() => bad), error =>
      error instanceof HubCheckFailure && !(error instanceof HubUnavailable) && /invalid site main result/.test(error.message));
  }
  for (const stderr of [
    "fatal: unable to access 'https://github.com/example/rules/': Could not resolve host: github.com",
    "fatal: unable to access 'https://github.com/example/rules/': Recv failure: Connection reset by peer",
    "fatal: unable to access 'https://github.com/example/rules/': The requested URL returned error: 503",
    "error: RPC failed; curl 56 Receive failure",
  ]) {
    assert.throws(() => read(() => { throw Object.assign(new Error("git failed"), { status: 128, stderr }); }), HubUnavailable);
  }
  for (const stderr of ["fatal: index-pack failed", "fatal: remote error: ref not found"]) {
    assert.throws(() => read(() => { throw Object.assign(new Error("git failed"), { status: 128, stderr }); }), error =>
      error instanceof HubCheckFailure && !(error instanceof HubUnavailable));
  }
});

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

test("hosted preflight has its own site main identity and uses no engine evidence", t => {
  const input = fixture(t);
  const workflow = ".github/workflows/hub-rules-preflight.yml";
  const environment = { ...input.environment, GITHUB_WORKFLOW_REF: "pipelab-org/pipelab.org/" + workflow + "@refs/heads/main" };
  const options = { ...input, mode: "preflight", environment, engine: undefined };
  const checked = JSON.parse(JSON.stringify(admissionProducer(options, () => input.revision)));
  assert.equal(checked.workflow, workflow);
  assert.equal(checked.sha, input.revision);
  assert.equal(Object.hasOwn(checked.tooling_identity, "engine"), false);
  assert.throws(() => admissionProducer({ ...options, mode: "admission" }, () => assert.fail("read remote")), /producer context/);
  assert.throws(() => admissionProducer(options, () => "0".repeat(40)), /current site main/);
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

test("admission and import report the failed check without printing raw input", t => {
  const { root, write, environment } = fixture(t);
  const input = path.join(root, "input.json");
  const cli = name => spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/hub/" + name, import.meta.url)), input,
  ], { env: { ...process.env, ...environment, GITHUB_REF: "refs/heads/feature" }, encoding: "utf8" });

  write("input.json", JSON.stringify({ source: {} }));
  const denied = cli("hosted-admission.mjs");
  assert.equal(denied.status, 1);
  assert.deepEqual(JSON.parse(denied.stdout), {
    mode: "hosted-admission", verdict: "REFUSED",
    reason: "producer context does not identify the expected site main workflow",
  });
  assert.equal(denied.stderr, "");

  const sync = cli("sync-import.mjs");
  assert.equal(sync.status, 1);
  assert.equal(sync.stdout, "");
  assert.match(sync.stderr, /^Hub import refused: producer context/);

  write("input.json", "{raw input marker}");
  const malformed = cli("hosted-admission.mjs");
  assert.equal(malformed.status, 1);
  assert.equal(JSON.parse(malformed.stdout).reason, "could not complete admission input");
  assert.equal(malformed.stderr, "");
  assert.doesNotMatch(malformed.stdout, /raw input marker/);
});

test("hosted admission and sync return retryable status when site main cannot be read", t => {
  const { root, write, environment } = fixture(t);
  const input = path.join(root, "input.json");
  write("input.json", JSON.stringify({ source: {} }));
  writeFileSync(path.join(root, "git"), [
    "#!/bin/sh",
    `printf '%s\\n' "fatal: unable to access 'https://github.com/pipelab-org/pipelab.org/': Could not resolve host: github.com" >&2`,
    "printf '%s\\n' 'private transport details' >&2",
    "exit 128",
    "",
  ].join("\n"), { mode: 0o755 });
  const cli = (name, variables) => spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/hub/" + name, import.meta.url)), input,
  ], {
    env: { ...process.env, ...variables, PATH: root + path.delimiter + process.env.PATH },
    encoding: "utf8",
  });

  const admission = cli("hosted-admission.mjs", environment);
  assert.equal(admission.status, 3);
  assert.deepEqual(JSON.parse(admission.stdout), {
    mode: "hosted-admission", verdict: "UNAVAILABLE", reason: "site main unavailable from GitHub",
  });
  assert.equal(admission.stderr, "");

  const sync = cli("sync-import.mjs", {
    ...environment,
    GITHUB_WORKFLOW_REF: environment.GITHUB_WORKFLOW_REF.replace("hub-admission.yml", "sync-pipelab-hub.yml"),
  });
  assert.equal(sync.status, 3);
  assert.equal(sync.stdout, "");
  assert.equal(sync.stderr.trim(), "Hub import unavailable: site main unavailable from GitHub. Retry the check.");
});
