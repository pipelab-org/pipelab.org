#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { locatePinnedHugo, probeHugoVersion, readPinnedVersion } from "./hugo-pin.mjs";

// Share the hosted audit's pins and installer. Missing tools must fail before
// checks run; preflight never downloads prerequisites or silently skips audit.
function main() {
  const repoRoot = process.cwd();
  const pinned = readPinnedVersion(repoRoot);
  if (!pinned) throw new Error(".hugo-version is missing or empty");
  const hugoBin = process.env.HUGO_BIN || process.env.HUGO_PINNED || locatePinnedHugo(pinned)?.bin || "hugo";
  const hugo = probeHugoVersion(hugoBin);
  if (!hugo.ok || hugo.version !== pinned) {
    throw new Error(`Hugo ${pinned} extended is required by .hugo-version; ${hugo.error || `found ${hugo.version}`}. Install the pinned build and set HUGO_BIN to its executable.`);
  }

  const pin = readFileSync(path.join(repoRoot, "scripts/pipelock-verifier-pin.env"), "utf8");
  const version = pin.match(/^PIPELAB_VERIFIER_VERSION=(\S+)$/m)?.[1];
  if (!version) throw new Error("scripts/pipelock-verifier-pin.env does not define PIPELAB_VERIFIER_VERSION");
  const verifier = spawnSync(path.join(repoRoot, ".pipelock-verifier"), ["--version"], {
    encoding: "utf8", timeout: 10_000,
  });
  if (verifier.error || verifier.status !== 0 || !verifier.stdout.startsWith(`pipelock-verifier ${version} `)) {
    throw new Error(`Pipelock verifier ${version} is required; run scripts/install-pipelock-verifier.sh (${verifier.error?.message || verifier.stderr.trim() || verifier.stdout.trim() || `exit ${verifier.status}`}).`);
  }
  console.log(`preflight prerequisites: Hugo ${pinned} extended; Pipelock verifier ${version}`);

  const env = { ...process.env, HUGO_BIN: hugoBin };
  const steps = [
    ["make", "check-brand"],
    ["make", "check-rules-sync"],
    ["npm", "test"],
    [hugoBin, "--gc", "--minify"],
    ["npm", "run", "site:corpus-counts"],
    ["npm", "run", "site:version-claims"],
    ["npm", "run", "site:audit"],
    ["npm", "run", "site:render-diff"],
  ];
  for (const [command, ...args] of steps) {
    const result = spawnSync(command, args, { env, stdio: "inherit" });
    if (result.error) throw new Error(`${command}: ${result.error.message}`);
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

try {
  main();
} catch (error) {
  console.error(`preflight: ${error.message}`);
  process.exit(1);
}
