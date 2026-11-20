import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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


// Use an empty Git context so configuration cannot select a different
// remote. Keep the caller's HTTP(S) proxy environment.
export function readRemoteRefs(url, refs, invalidResult, { runGit = execFileSync, environment = process.env } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-remote-refs-"));
  try {
    const output = runGit("git", [
      "-c", "http.followRedirects=false", "ls-remote", "--exit-code", url, ...refs,
    ], {
      cwd: directory,
      env: { ...withoutGitOverrides(environment),
        GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "config"),
        GIT_CEILING_DIRECTORIES: path.dirname(directory), GIT_ALLOW_PROTOCOL: "https", GIT_TERMINAL_PROMPT: "0",
      },
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000,
    });
    const tips = new Map();
    for (const line of output.trimEnd().split(/\r?\n/)) {
      const [sha, ref, ...unexpected] = line.split("\t");
      if (!/^[a-f0-9]{40}$/.test(sha) || !refs.includes(ref) || tips.has(ref) || unexpected.length) {
        throw new Error(invalidResult);
      }
      tips.set(ref, sha);
    }
    if (tips.size !== refs.length) throw new Error(invalidResult);
    return tips;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
