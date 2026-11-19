import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "./evidence.mjs";

export const releasePin = JSON.parse(readFileSync(new URL("./retrieval-pin.json", import.meta.url)));
export const releasePresets = ["claude-code", "strict", "hostile-model"];
export const commandTimeout = 120_000; // Match the native Hub harness deadline.

export function pinnedRelease(binary) {
  if (!binary) throw new Error("a pinned Pipelock executable is required");
  binary = path.resolve(binary);
  if (sha256(readFileSync(binary)) !== releasePin.binary_sha256 ||
      execFileSync(binary, ["--version"], { encoding: "utf8", timeout: commandTimeout,
        env: {}, stdio: ["ignore", "pipe", "ignore"] }).trim() !== "pipelock version " + releasePin.version) {
    throw new Error("Pipelock executable does not match the Hub release pin");
  }
  return binary;
}
