import { execFileSync } from "node:child_process";

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
