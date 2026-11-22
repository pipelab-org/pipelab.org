import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as toml } from "smol-toml";
import { canonical, sha256 } from "./evidence.mjs";
import { readGit } from "./git-source.mjs";
import { STAGING_ORIGIN } from "./staging-target.mjs";

export const stagingFiles = ["data/hub/launch.toml", "hugo.toml", "static/_headers", "static/robots.txt"];
const fullSHA = /^[a-f0-9]{40}$/;

// The committed source, rather than a build flag, owns the open switch.
export function stagingOverlay(files) {
  if (toml(files["data/hub/launch.toml"]).open !== false) throw new Error("staging base must be closed");
  const hugo = files["hugo.toml"];
  if ((hugo.match(/^baseURL\s*=/gm) ?? []).length !== 1) throw new Error("one source baseURL required");
  return {
    "data/hub/launch.toml": files["data/hub/launch.toml"].replace(/^open\s*=\s*false\s*$/m, "open = true"),
    "hugo.toml": hugo.replace(/^baseURL\s*=.*$/m, `baseURL = '${STAGING_ORIGIN}/'`),
    "static/robots.txt": "User-agent: *\nDisallow: /\n",
    // Remove narrower cache and robot directives before setting the global rule.
    "static/_headers": files["static/_headers"].replace(/^\s+(?:!\s*)?(?:Cache-Control|X-Robots-Tag):?.*\n/gmi, "") +
      "\n/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: private, no-store\n",
  };
}

export function assertStagingSource({ root, baseSHA, productionBaseSHA, stagingSHA }) {
  if (![baseSHA, productionBaseSHA, stagingSHA].every(value => fullSHA.test(value ?? ""))) throw new Error("exact staging and base SHAs required");
  const git = (...args) => readGit(root, args).toString();
  if (git("rev-parse", "HEAD").trim() !== stagingSHA || git("status", "--porcelain=v1")) throw new Error("staging source must be exact and clean");
  for (const [base, head] of [[productionBaseSHA, baseSHA], [baseSHA, stagingSHA]]) git("merge-base", "--is-ancestor", base, head);
  const changed = git("diff", "--name-only", "--no-renames", baseSHA, stagingSHA).trim().split("\n").sort();
  if (canonical(changed) !== canonical(stagingFiles)) throw new Error("staging revision must contain only the reviewed staging delta");
  const before = Object.fromEntries(stagingFiles.map(name => [name, git("show", `${baseSHA}:${name}`)]));
  const expected = stagingOverlay(before);
  const delta = stagingFiles.map(name => {
    const after = readFileSync(path.join(root, name), "utf8");
    if (after !== expected[name]) throw new Error("staging delta differs: " + name);
    return { path: name, base_sha256: sha256(before[name]), staging_sha256: sha256(after) };
  });
  return { production_base_sha: productionBaseSHA, base_sha: baseSHA, staging_sha: stagingSHA, delta };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, baseSHA] = process.argv.slice(2);
  if (command !== "write-overlay" || !fullSHA.test(baseSHA ?? "") || process.argv.length !== 4) throw new Error("usage: staging-source.mjs write-overlay BASE_SHA");
  const root = process.cwd();
  if (readGit(root, ["rev-parse", "HEAD"]).toString().trim() !== baseSHA || readGit(root, ["status", "--porcelain=v1"]).length) throw new Error("overlay requires an exact clean base");
  const files = Object.fromEntries(stagingFiles.map(name => [name, readFileSync(path.join(root, name), "utf8")]));
  for (const [name, value] of Object.entries(stagingOverlay(files))) writeFileSync(path.join(root, name), value);
}
