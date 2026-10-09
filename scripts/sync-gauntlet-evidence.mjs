#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const sourceRoot = path.resolve(process.argv[2] || "");
const repoRoot = process.cwd();
const execFile = promisify(execFileCallback);

function fail(message) {
  throw new Error(`gauntlet evidence sync: ${message}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function rejectSymlinkComponents(absolutePath) {
  let current = repoRoot;
  for (const part of path.relative(repoRoot, absolutePath).split(path.sep)) {
    current = path.join(current, part);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) fail(`destination path contains a symlink: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

async function main() {
  if (!process.argv[2]) fail("pass the Agent Egress Bench worktree path");
  const inventorySource = path.join(sourceRoot, "migration", "pipelock-result-inventory-v1.json");
  const inventoryBytes = await readFile(inventorySource);
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  if (!/^[0-9a-f]{40}$/.test(inventory.source_commit)) fail("source_commit is invalid");
  if (!Array.isArray(inventory.entries) || inventory.entries.length === 0) {
    fail("source inventory has no entries");
  }
  const remote = (await execFile("git", ["-C", sourceRoot, "remote", "get-url", "origin"])).stdout.trim();
  if (![
    "git@github.com:luckyPipewrench/agent-egress-bench.git",
    "ssh://git@github.com/luckyPipewrench/agent-egress-bench.git",
    "https://github.com/luckyPipewrench/agent-egress-bench",
    "https://github.com/luckyPipewrench/agent-egress-bench.git",
  ].includes(remote)) {
    fail("source checkout origin is not the canonical benchmark repository");
  }
  try {
    await execFile("git", [
      "-C", sourceRoot, "merge-base", "--is-ancestor", inventory.source_commit, "origin/main",
    ]);
  } catch {
    fail("source_commit is not retained on origin/main");
  }
  for (const entry of inventory.entries) {
    if (typeof entry.source_path !== "string" || !entry.source_path.startsWith("gauntlet-site/")) {
      fail(`unsafe source path ${entry.source_path}`);
    }
    const sourcePath = path.resolve(sourceRoot, entry.source_path);
    if (!sourcePath.startsWith(`${sourceRoot}${path.sep}`)) fail(`unsafe source path ${entry.source_path}`);
    const retained = await execFile(
      "git",
      ["-C", sourceRoot, "show", `${inventory.source_commit}:${entry.source_path}`],
      { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
    );
    const bytes = Buffer.from(retained.stdout);
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) {
      fail(`source_commit bytes do not match inventory: ${entry.source_path}`);
    }
    const expectedDestination = `static/gauntlet/evidence/${entry.source_path.slice("gauntlet-site/".length)}`;
    if (!entry.planned_destination ||
        entry.planned_destination.repository !== "luckyPipewrench/pipelab.org" ||
        entry.planned_destination.path !== expectedDestination) {
      fail(`destination contract drifted for ${entry.source_path}`);
    }
    const destinationPath = path.resolve(repoRoot, expectedDestination);
    if (!destinationPath.startsWith(`${repoRoot}${path.sep}`)) {
      fail(`unsafe destination path ${expectedDestination}`);
    }
    await rejectSymlinkComponents(destinationPath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    // Publish the exact bytes verified above from source_commit. Reading the
    // worktree here would permit a post-verification edit to change the output.
    await writeFile(destinationPath, bytes);
  }
  const inventoryDestination = path.join(repoRoot, "static", "gauntlet", "evidence", "inventory.json");
  await rejectSymlinkComponents(inventoryDestination);
  await mkdir(path.dirname(inventoryDestination), { recursive: true });
  await writeFile(inventoryDestination, inventoryBytes);
  console.log(`gauntlet evidence sync: copied ${inventory.entries.length} files`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
