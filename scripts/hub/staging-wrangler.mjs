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

// The verified distribution owns these direct dependencies; ranges must not
// silently turn an exact release into a different direct dependency version.
// https://docs.npmjs.com/cli/v11/configuring-npm/package-json#dependencies
export async function installWranglerDependencies(directory, metadata, { env, signal, run = execute } = {}) {
  const groups = [metadata.dependencies, metadata.optionalDependencies ?? {}];
  if (groups.some(group => !group || typeof group !== "object" || Array.isArray(group) ||
      Object.values(group).some(version => typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)))) throw new Error("Wrangler direct dependencies must use exact versions");
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ private: true, dependencies: metadata.dependencies, optionalDependencies: metadata.optionalDependencies }));
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], { cwd: directory, env, signal });
}

export function wranglerEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !/TOKEN|SECRET|CLIENT_ID|API_KEY|PASSWORD|^NODE_OPTIONS$|^NODE_PATH$/i.test(key)));
}

export async function withPinnedWrangler(version, action, { request = curlRequest, environment = process.env, signal } = {}) {
  if (version !== WRANGLER_VERSION) throw new Error("unexpected Wrangler version");
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-wrangler-"));
  try {
    const response = await request(`https://registry.npmjs.org/wrangler/-/wrangler-${WRANGLER_VERSION}.tgz`, { signal });
    if (response.status !== 200 || response.headers.location) throw new Error("Wrangler distribution unavailable");
    verifyWranglerArchive(response.body);
    const archive = path.join(scratch, "wrangler.tgz"); writeFileSync(archive, response.body);
    const unpacked = path.join(scratch, "unpacked"); mkdirSync(unpacked);
    const env = wranglerEnvironment(environment);
    await execute("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", unpacked], { env, signal });
    const pkg = path.join(unpacked, "package"), metadata = JSON.parse(readFileSync(path.join(pkg, "package.json")));
    if (metadata.name !== "wrangler" || metadata.version !== WRANGLER_VERSION) throw new Error("Wrangler distribution identity differs");
    await installWranglerDependencies(unpacked, metadata, { env, signal });
    return await action(path.join(pkg, "bin/wrangler.js"));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function runPinnedWrangler(version, args, { cwd, env = process.env, signal } = {}) {
  if (version !== WRANGLER_VERSION) throw new Error("unexpected Wrangler version");
  return withPinnedWrangler(version, cli => execute(process.execPath, [cli, ...args], { cwd, env, signal }), { environment: env, signal });
}
