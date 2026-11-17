import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const validator = path.resolve("scripts/check_agent_review_workflow.py");
const checkingWorkflow = readFileSync(".github/workflows/review-caller-contract.yaml", "utf8").replace(/\r\n/g, "\n");
const previousSource = "e0e5662a0612d24f041130a455f8c8898d6239fc";
const retiredSources = [
  previousSource,
  "250991344a567c7c0832869ecce9279c8b0084c5",
  "ca0e322521d6d0f8b651546a7d935a93026d71f7",
];
const approvedSource = "1aa9741927ec5546036506a0ec764e1b41b1a241";
const caller = pins => pins.map((sha, index) =>
  `  job${index}:\n    uses: pipelab-org/agent-review/.github/workflows/agent-review-reusable.yaml@${sha} # main\n`
).join("");

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "review-caller-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workflows = path.join(root, ".github/workflows");
  mkdirSync(workflows, { recursive: true });
  const output = path.join(root, "output");
  return (pins, contract = checkingWorkflow) => {
    writeFileSync(path.join(workflows, "agent-review.yaml"), caller(pins));
    writeFileSync(path.join(workflows, "review-caller-contract.yaml"), contract);
    return spawnSync("python3", ["-I", validator, "--root", root, "--output", output], {
      encoding: "utf8", timeout: 10_000,
    });
  };
}

// The production validator uses Linux no-follow file APIs on the Actions runner.
test("trusted source approval accepts one or several uses of the same approved engine", {
  skip: process.platform !== "linux",
}, t => {
  const validate = fixture(t);
  for (const pins of [[approvedSource], [approvedSource, approvedSource, approvedSource]]) {
    const result = validate(pins);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("trusted source approval refuses missing, mixed and unapproved pins or a changed checking workflow", {
  skip: process.platform !== "linux",
}, t => {
  const validate = fixture(t);
  for (const pins of [[], ["0".repeat(40)],
    ...retiredSources.map((source) => [source, source, source]),
    [previousSource],
    [previousSource, approvedSource, approvedSource],
    [approvedSource, previousSource, approvedSource],
    [approvedSource, approvedSource, previousSource]]) {
    const result = validate(pins);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
  }
  const changed = validate([approvedSource, approvedSource, approvedSource], `${checkingWorkflow}\n# changed\n`);
  assert.equal(changed.error, undefined);
  assert.equal(changed.status, 1, changed.stderr);
});
