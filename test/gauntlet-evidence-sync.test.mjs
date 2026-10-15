import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const SCRIPT = fileURLToPath(new URL("../scripts/sync-gauntlet-evidence.mjs", import.meta.url));

async function fixture(remote = "https://github.com/luckyPipewrench/agent-egress-bench.git") {
  const root = await mkdtemp(path.join(os.tmpdir(), "gauntlet-evidence-sync-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  const sourcePath = "gauntlet-site/latest-verified.json";
  const bytes = Buffer.from('{"status":"verified"}\n');
  await mkdir(path.join(source, "gauntlet-site"), { recursive: true });
  await mkdir(path.join(source, "migration"), { recursive: true });
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(source, sourcePath), bytes);
  await execFile("git", ["init", "-q", source]);
  await execFile("git", ["-C", source, "config", "user.name", "Test"]);
  await execFile("git", ["-C", source, "config", "user.email", "test@example.invalid"]);
  await execFile("git", ["-C", source, "add", sourcePath]);
  await execFile("git", ["-C", source, "commit", "-qm", "fixture"]);
  const sourceCommit = (await execFile("git", ["-C", source, "rev-parse", "HEAD"])).stdout.trim();
  await execFile("git", [
    "-C", source, "remote", "add", "origin", remote,
  ]);
  await execFile("git", ["-C", source, "update-ref", "refs/remotes/origin/main", sourceCommit]);
  const inventory = {
    schema_version: 1,
    source_commit: sourceCommit,
    entries: [{
      bytes: bytes.length,
      planned_destination: {
        repository: "luckyPipewrench/pipelab.org",
        path: "static/gauntlet/evidence/latest-verified.json",
      },
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source_path: sourcePath,
    }],
  };
  await writeFile(
    path.join(source, "migration", "pipelock-result-inventory-v1.json"),
    JSON.stringify(inventory) + "\n",
  );
  return { root, source, destination, inventory, bytes };
}

async function runSync(current) {
  return execFile("node", [SCRIPT, current.source], { cwd: current.destination });
}

test("copies only commit-bound evidence from the canonical source", async () => {
  const current = await fixture();
  try {
    await runSync(current);
    const copied = await readFile(path.join(
      current.destination,
      "static/gauntlet/evidence/latest-verified.json",
    ));
    assert.deepEqual(copied, current.bytes);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test("copies retained commit bytes when the source worktree has drifted", async () => {
  const current = await fixture();
  try {
    await writeFile(
      path.join(current.source, "gauntlet-site/latest-verified.json"),
      '{"status":"tampered-after-commit"}\n',
    );
    await runSync(current);
    const copied = await readFile(path.join(
      current.destination,
      "static/gauntlet/evidence/latest-verified.json",
    ));
    assert.deepEqual(copied, current.bytes);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test("rejects an inventory destination outside the evidence tree", async () => {
  const current = await fixture();
  try {
    current.inventory.entries[0].planned_destination.path = "package.json";
    await writeFile(
      path.join(current.source, "migration", "pipelock-result-inventory-v1.json"),
      JSON.stringify(current.inventory) + "\n",
    );
    await assert.rejects(runSync(current), /destination contract drifted/);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

test("rejects a symlink in the destination path", async () => {
  const current = await fixture();
  try {
    const outside = path.join(current.root, "outside");
    await mkdir(path.join(current.destination, "static", "gauntlet"), { recursive: true });
    await mkdir(outside);
    await symlink(outside, path.join(current.destination, "static", "gauntlet", "evidence"));
    await assert.rejects(runSync(current), /destination path contains a symlink/);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
});

for (const remote of [
  "https://github.com/pipelab-org/agent-egress-bench.git",
  "git@github.com:pipelab-org/agent-egress-bench.git",
]) {
  test(`accepts the moved benchmark origin ${remote}`, async () => {
    const current = await fixture(remote);
    try {
      await runSync(current);
      const copied = await readFile(path.join(
        current.destination,
        "static/gauntlet/evidence/latest-verified.json",
      ));
      assert.deepEqual(copied, current.bytes);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });
}

for (const remote of [
  "https://github.com/someone-else/agent-egress-bench.git",
  "https://github.com/pipelab-org-evil/agent-egress-bench.git",
  "https://gitlab.com/pipelab-org/agent-egress-bench.git",
]) {
  test(`rejects a benchmark origin outside the two owners: ${remote}`, async () => {
    const current = await fixture(remote);
    try {
      await assert.rejects(runSync(current), /not the canonical benchmark repository/);
    } finally {
      await rm(current.root, { recursive: true, force: true });
    }
  });
}
