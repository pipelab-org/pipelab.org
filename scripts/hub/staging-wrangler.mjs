import { execFile } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { curlRequest } from "./staging-http.mjs";
import { WRANGLER_VERSION, WRANGLER_DIST_INTEGRITY } from "./staging-target.mjs";
import { commandTimeout } from "./release-binary.mjs";

export function verifyWranglerArchive(bytes) {
  const expected = Buffer.from(WRANGLER_DIST_INTEGRITY.slice("sha512-".length), "base64");
  const actual = createHash("sha512").update(bytes).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Wrangler distribution integrity differs");
}

const execute = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, { ...options, timeout: commandTimeout, maxBuffer: 1024 * 1024, encoding: "utf8" }, (failure, stdout) => {
    if (failure) reject(new Error("verified Wrangler operation failed")); else resolve(stdout);
  });
});

export async function withPinnedWrangler(version, action, { request = curlRequest, environment = process.env, signal } = {}) {
  if (version !== WRANGLER_VERSION) throw new Error("unexpected Wrangler version");
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-wrangler-"));
  try {
    const response = await request(`https://registry.npmjs.org/wrangler/-/wrangler-${WRANGLER_VERSION}.tgz`, { signal });
    if (response.status !== 200 || response.headers.location) throw new Error("Wrangler distribution unavailable");
    verifyWranglerArchive(response.body);
    const archive = path.join(scratch, "wrangler.tgz"); writeFileSync(archive, response.body);
    const unpacked = path.join(scratch, "unpacked"); mkdirSync(unpacked);
    const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !/TOKEN|SECRET|CLIENT_ID|^NODE_OPTIONS$|^NODE_PATH$/i.test(key)));
    await execute("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", unpacked], { env, signal });
    const pkg = path.join(unpacked, "package"), metadata = JSON.parse(readFileSync(path.join(pkg, "package.json")));
    if (metadata.name !== "wrangler" || metadata.version !== WRANGLER_VERSION) throw new Error("Wrangler distribution identity differs");
    writeFileSync(path.join(unpacked, "package.json"), JSON.stringify({ private: true, dependencies: metadata.dependencies, optionalDependencies: metadata.optionalDependencies }));
    await execute("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], { cwd: unpacked, env, signal });
    return await action(path.join(pkg, "bin/wrangler.js"));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function runPinnedWrangler(version, args, { cwd, env = process.env, signal } = {}) {
  if (version !== WRANGLER_VERSION) throw new Error("unexpected Wrangler version");
  return withPinnedWrangler(version, cli => execute(process.execPath, [cli, ...args], { cwd, env, signal }), { environment: env, signal });
}
