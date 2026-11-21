import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HubCheckFailure, HubUnavailable } from "./check-failure.mjs";

export function withoutGitOverrides(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !/^GIT_/i.test(key)));
}

// Object reads stay in the selected repository and never download missing blobs.
export function readGit(repository, args, options = {}) {
  return execFileSync("git", [
    "-C", repository, "--no-optional-locks", "--no-replace-objects", "--literal-pathspecs", ...args,
  ], {
    ...options,
    env: { ...withoutGitOverrides(), GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" },
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
  });
}


export function httpsGitEnvironment(directory, environment = process.env) {
  return { ...withoutGitOverrides(environment),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "config"),
    LC_ALL: "C",
    GIT_CEILING_DIRECTORIES: path.dirname(directory), GIT_ALLOW_PROTOCOL: "https", GIT_TERMINAL_PROMPT: "0",
  };
}

// Git uses the same exit status for transport and object validation failures.
// Classify only recognizable HTTPS diagnostics. RPC errors report libcurl
// CURLcodes for proxy/host lookup, connect, incomplete transfer, timeout,
// empty reply and send/receive failures.
const rpcUnavailable = /^error: RPC failed; (?:HTTP (?:429|5[0-9]{2}) curl 22|curl (?:5|6|7|18|28|52|55|56))\b/m;
const accessFailure = /^fatal: unable to access '[^'\r\n]+': (.+)$/m;
const accessUnavailable = /^(?:Could not resolve (?:host|proxy):|Failed to connect to |Couldn't connect to server|(?:Recv|Send) failure:|Connection (?:timed out|reset by peer)|Operation timed out)/;
const httpUnavailable = /^The requested URL returned error: (?:429|5[0-9]{2})\b/;

export function isGitTransportUnavailable(cause) {
  if (cause.code === "ETIMEDOUT") return true;
  if (cause.signal || typeof cause.status !== "number") return false;
  const diagnostic = String(cause.stderr ?? "");
  const reason = diagnostic.match(accessFailure)?.[1] ?? "";
  return rpcUnavailable.test(diagnostic) || accessUnavailable.test(reason) || httpUnavailable.test(reason);
}

// Use an empty Git context so configuration cannot select a different
// remote. Keep the caller's HTTP(S) proxy environment.
export function readRemoteRefs(url, refs, invalidResult, {
  runGit = execFileSync, environment = process.env, unavailable = "GitHub refs unavailable",
} = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-remote-refs-"));
  try {
    let output;
    try {
      output = runGit("git", [
        "-c", "http.followRedirects=false", "ls-remote", "--exit-code", url, ...refs,
      ], {
        cwd: directory,
        env: httpsGitEnvironment(directory, environment),
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
      });
    } catch (cause) {
      if (isGitTransportUnavailable(cause)) throw new HubUnavailable(unavailable, { cause });
      throw new HubCheckFailure(invalidResult, { cause });
    }
    const tips = new Map();
    for (const line of output.replace(/\r?\n$/, "").split(/\r?\n/)) {
      const [sha, ref, ...unexpected] = line.split("\t");
      if (!/^[a-f0-9]{40}$/.test(sha) || !refs.includes(ref) || tips.has(ref) || unexpected.length) {
        throw new HubCheckFailure(invalidResult);
      }
      tips.set(ref, sha);
    }
    if (tips.size !== refs.length) throw new HubCheckFailure(invalidResult);
    return tips;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
