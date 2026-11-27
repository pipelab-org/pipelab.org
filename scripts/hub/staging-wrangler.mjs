import { execFile } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stagingToolEnvironment as wranglerEnvironment } from "./staging-tool-environment.mjs";
export { stagingToolEnvironment as wranglerEnvironment } from "./staging-tool-environment.mjs";
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

const DEPENDENCY_LOCK = new URL("./wrangler-dependencies.lock.json", import.meta.url);
const sortedEntries = group => JSON.stringify(Object.entries(group ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

// The committed lockfile binds every transitive dependency of the verified
// distribution to an exact registry tarball and SHA-512 integrity. npm ci
// checks the resolved dependency graph against this lock before installation.
// https://docs.npmjs.com/cli/v11/commands/npm-ci
// https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json
export function assertWranglerDependencyLock(lock, metadata) {
  const root = lock?.packages?.[""];
  if (lock?.lockfileVersion !== 3 || !root || sortedEntries(root.dependencies) !== sortedEntries(metadata.dependencies) ||
      sortedEntries(root.optionalDependencies) !== sortedEntries(metadata.optionalDependencies)) throw new Error("Wrangler dependency lock does not match the verified distribution");
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === "") continue;
    if (!key.startsWith("node_modules/") || entry.link || typeof entry.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{85}[AQgw]==$/.test(entry.integrity) ||
        typeof entry.resolved !== "string" || !entry.resolved.startsWith("https://registry.npmjs.org/")) throw new Error("Wrangler dependency lock entry is not a pinned registry tarball");
  }
}

function assertWranglerNativeDependencies(directory, metadata, packages) {
  // npm can exit successfully after an optional tarball fails verification.
  // esbuild and workerd publish their host binaries as optional dependencies.
  for (const name of ["esbuild", "workerd"]) {
    if (!Object.hasOwn(metadata.dependencies, name)) continue;
    const parent = `node_modules/${name}`;
    const candidates = Object.keys(packages[parent]?.optionalDependencies ?? {}).map(dependency => {
      const nested = `${parent}/node_modules/${dependency}`;
      return Object.hasOwn(packages, nested) ? nested : `node_modules/${dependency}`;
    });
    const native = candidates.find(key => packages[key]?.os?.includes(process.platform) && packages[key]?.cpu?.includes(process.arch));
    if (!native || !existsSync(path.join(directory, native, "package.json"))) throw new Error("Wrangler locked native dependency unavailable");
  }
}

// The verified distribution owns these direct dependencies; ranges must not
// silently turn an exact release into a different direct dependency version.
// https://docs.npmjs.com/cli/v11/configuring-npm/package-json#dependencies
export async function installWranglerDependencies(directory, metadata, { env, signal, run = execute, lockText = readFileSync(DEPENDENCY_LOCK, "utf8") } = {}) {
  const groups = [metadata.dependencies, metadata.optionalDependencies ?? {}];
  if (groups.some(group => !group || typeof group !== "object" || Array.isArray(group) ||
      Object.values(group).some(version => typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)))) throw new Error("Wrangler direct dependencies must use exact versions");
  const lock = JSON.parse(lockText);
  assertWranglerDependencyLock(lock, metadata);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: lock.name, private: true, dependencies: metadata.dependencies, optionalDependencies: metadata.optionalDependencies }));
  writeFileSync(path.join(directory, "package-lock.json"), lockText);
  await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--include=optional", "--replace-registry-host=never"], { cwd: directory, env, signal });
  assertWranglerNativeDependencies(directory, metadata, lock.packages);
}

export function wranglerUploadEnvironment(environment) {
  return { ...wranglerEnvironment(environment),
    ...Object.fromEntries(Object.entries(environment).filter(([key]) =>
      ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "WRANGLER_OUTPUT_FILE_PATH", "WRANGLER_SEND_METRICS", "CI"].includes(key))) };
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
  const uploads = args[0] === "versions" && args[1] === "upload" && !args.includes("--dry-run");
  const commandEnv = uploads ? wranglerUploadEnvironment(env) : wranglerEnvironment(env);
  return withPinnedWrangler(version, cli => execute(process.execPath, [cli, ...args], { cwd, env: commandEnv, signal }), { environment: env, signal });
}
