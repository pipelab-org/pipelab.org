import assert from "node:assert/strict";
import test from "node:test";
import { fixtureTestEnvironment, goModuleCache } from "../scripts/hub/acceptance.mjs";
import { diagnosticLine, failedAcceptanceStep, fixtureFailureEvidence } from "../scripts/hub/diagnostic.mjs";
import { acceptanceRefusal } from "../scripts/hub/sync-import.mjs";

const source = {
  binary: "/scratch/hub-engine/hubcheck", config: "/scratch/hub-engine/configs/claude-code.yaml",
  repository: "/scratch/engine.git", rulesFixtureRepository: "/scratch/fixtures.git", pipelockBinary: "/scratch/bin/pipelock",
};

test("fixture tests keep the Go module cache outside their private HOME", () => {
  const goEnv = [];
  const environment = { PATH: "/usr/bin", HOME: "/home/runner", GITHUB_TOKEN: "not-for-children", GOPROXY: "direct" };
  const run = (command, args, options) => { goEnv.push({ command, args, options }); return "/home/runner/go/pkg/mod\n"; };
  const child = fixtureTestEnvironment(source, "/tmp/acceptance", environment, run);
  assert.equal(child.HOME, "/tmp/acceptance");
  assert.equal(child.GOMODCACHE, "/home/runner/go/pkg/mod");
  assert.equal(child.HUBCHECK_ENGINE_DIR, "/scratch/hub-engine");
  assert.equal(child.HUBCHECK_RULES_REPOSITORY, "/scratch/fixtures.git");
  assert.equal(child.HUB_VERIFY_RETRIEVAL, "0");
  assert.deepEqual(Object.keys(child).sort(), ["GOMODCACHE", "HOME", "HUBCHECK_BIN", "HUBCHECK_ENGINE_DIR", "HUBCHECK_REPOSITORY",
    "HUBCHECK_RULES_REPOSITORY", "HUB_RELEASE_BIN", "HUB_VERIFY_RETRIEVAL", "PATH"]);
  assert.equal(goEnv.length, 1);
  assert.deepEqual(goEnv[0].args, ["env", "GOMODCACHE"]);
  assert.equal(goEnv[0].options.env.GOTOOLCHAIN, "local");
});

test("an explicit Go module cache is used and an unresolved one fails closed", () => {
  const unexpected = () => assert.fail("go env must not run when GOMODCACHE is set");
  assert.equal(goModuleCache({ GOMODCACHE: "/cache/mod" }, unexpected), "/cache/mod");
  assert.throws(() => goModuleCache({}, () => { throw new Error("go: not found"); }), /Go module cache could not be resolved/);
  assert.throws(() => goModuleCache({}, () => "\n"), /Go module cache could not be resolved/);
  assert.throws(() => goModuleCache({}, () => "relative/mod"), /Go module cache could not be resolved/);
  assert.throws(() => fixtureTestEnvironment(source, "/tmp/acceptance", {}, () => { throw new Error("go: not found"); }), /Go module cache/);
});

test("a failed fixture run names the failed tests", () => {
  const stdout = [
    "TAP version 13",
    "# Subtest: passes", "ok 1 - passes",
    "# Subtest: first failure", "    not ok 1 - nested detail", "not ok 2 - first failure",
    "# Subtest: native reader", "not ok 3 - native reader",
    "# tests 3", "# pass 1", "# fail 2", "# skipped 0",
  ].join("\n");
  assert.equal(fixtureFailureEvidence({ stdout: Buffer.from(stdout), message: "Command failed: node --test" }),
    "2 of 3 Hub fixture tests failed: first failure; native reader");
  const many = Array.from({ length: 9 }, (_, i) => `not ok ${i + 1} - failure ${i + 1} ${"x".repeat(120)}`).join("\n") + "\n# tests 40\n";
  const summary = fixtureFailureEvidence({ stdout: many });
  assert.match(summary, /^9 of 40 Hub fixture tests failed: failure 1 x+…; failure 2/);
  assert.match(summary, /; \+3 more$/);
  assert.equal(summary.split("\n").length, 1);
});

test("a fixture run that fails without a report says so", () => {
  assert.equal(fixtureFailureEvidence({ stdout: "", stderr: "\nSyntaxError: Unexpected token\n at file", message: "Command failed: node --test a b" }),
    "Hub fixture run failed without a test report: SyntaxError: Unexpected token");
  assert.equal(fixtureFailureEvidence(new Error("Command failed: node --test a b\nstderr text")),
    "Hub fixture run failed without a test report: Command failed: node --test a b");
  assert.equal(fixtureFailureEvidence({}), "Hub fixture run failed without a test report: no output");
});

test("diagnostic lines are one bounded line without credentials", () => {
  const github = "ghp_" + "a1B2c3D4".repeat(5);
  const cases = [
    ["fatal: unable to access 'https://x-access-token:" + github + "@github.com/pipelab-org/pipelock-rules/'", /\[redacted\]@github\.com/],
    ["request failed with Authorization: Bearer abcdefghijklmnop", /Authorization: \[redacted\]/],
    ["using bearer abcdefghijklmnopqrstuvwxyz", /bearer \[redacted\]/],
    ["PIPELAB_HUB_SYNC_TOKEN=s3cr3t-value leaked", /PIPELAB_HUB_SYNC_TOKEN=\[redacted\] leaked/],
    ["env password: hunter2 failed", /password: \[redacted\] failed/],
    ["github_pat_" + "A1".repeat(20), /^\[redacted\]$/],
    ["key AKIAABCDEFGHIJKLMNOP end", /key \[redacted\] end/],
    ["-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----", /^\[redacted\]$/],
  ];
  for (const [input, expected] of cases) {
    const line = diagnosticLine(input);
    assert.match(line, expected);
    assert.doesNotMatch(line, /ghp_|s3cr3t|hunter2|AKIA|MIIEvQ|abcdefghijklmnop|x-access-token:/);
  }
  const noisy = diagnosticLine("first‮line\u0000with\ttabs\r\nand more");
  assert.equal(noisy, "first line with tabs and more");
  assert.ok(diagnosticLine("y".repeat(5000)).length <= 600);
  assert.equal(diagnosticLine("y".repeat(5000)).slice(-1), "…");
  for (const missing of [undefined, null, 5, {}, "", " \n "]) assert.equal(diagnosticLine(missing), "no evidence recorded");
  // Commit and bundle digests and ordinary paths stay readable.
  const digest = "bb0d98b9ff7abff68e29675f6dabe16ed93350f2";
  assert.equal(diagnosticLine("site " + digest + " at /tmp/hub-acceptance-x/site"), "site " + digest + " at /tmp/hub-acceptance-x/site");
});

test("the import refusal repeats the failed step evidence", () => {
  const steps = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { status: "pass", evidence: "ok" }]));
  steps["9"] = { status: "not-in-mode", evidence: null };
  steps["5"] = { status: "fail", evidence: "6 of 115 Hub fixture tests failed: official workloads bind exact served producer bytes" };
  const report = JSON.stringify({ mode: "routine", steps });
  assert.equal(acceptanceRefusal(report),
    "routine Hub acceptance failed at step 5: 6 of 115 Hub fixture tests failed: official workloads bind exact served producer bytes");
  assert.deepEqual(failedAcceptanceStep(report), { step: "5", evidence: steps["5"].evidence });

  steps["5"].evidence = "Command failed: git clone https://user:hunter2@example.invalid/repo.git\nstack line";
  const refused = acceptanceRefusal(JSON.stringify({ steps }));
  assert.equal(refused, "routine Hub acceptance failed at step 5: Command failed: git clone https://[redacted]@example.invalid/repo.git stack line");
  assert.doesNotMatch(refused, /hunter2/);
  assert.equal(refused.split("\n").length, 1);

  steps["5"].evidence = { nested: "not a line" };
  assert.equal(acceptanceRefusal(JSON.stringify({ steps })), "routine Hub acceptance failed at step 5: no evidence recorded");
});

test("an unreadable or step-less acceptance report gives no evidence to repeat", () => {
  for (const stdout of [undefined, "", "not json", "null", "{}", JSON.stringify({ steps: null }),
    JSON.stringify({ steps: { 5: { status: "pass" }, 11: { status: "fail", evidence: "late" }, x: { status: "fail" } } })]) {
    assert.equal(acceptanceRefusal(stdout), "routine Hub acceptance did not pass");
  }
});

test("structured and encoded credentials do not reach public refusal evidence", () => {
  for (const evidence of [
    '{"token":"synthetic-secret-value"}',
    'token="synthetic secret with spaces"',
    '{"Authorization":"Bearer synthetic-secret-value"}',
    'https://example.invalid/?token%3Dsynthetic-secret-value',
    'https://user:synthetic-secret-value%40example.invalid/repo',
    '{"\\u0074oken":"synthetic-secret-value"}',
    'token%253Dsynthetic-secret-value',
    '{"\\u0074oken":"first\\u0022 synthetic-secret-value"}',
    '{"token":"first%22 synthetic-secret-value"}',
  ]) {
    const report = JSON.stringify({ steps: { 5: { status: "fail", evidence } } });
    assert.doesNotMatch(acceptanceRefusal(report), /synthetic|secret-value|with spaces/);
  }
});

test("fixture names are redacted before shortening can hide a credential signature", () => {
  const token = "ghp_" + "a".repeat(36);
  const stdout = "not ok 1 - " + "x".repeat(70) + " " + token + "\n# tests 1";
  assert.doesNotMatch(diagnosticLine(fixtureFailureEvidence({ stdout })), /ghp_|aaaa/);
});

test("explicit module cache paths obey the same absolute-path contract", () => {
  assert.throws(() => goModuleCache({ GOMODCACHE: "relative/cache" }), /Go module cache could not be resolved/);
});
