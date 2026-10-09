import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// The local copy of the CI-pinned extended binary. Cloudflare and GitHub
// Actions install from .hugo-version (peaceiris/actions-hugo). This path is
// the existing developer convention; do not add a second download path.
export const DEFAULT_PINNED_HUGO = "/tmp/hugo147/hugo";

export function readPinnedVersion(repoRoot) {
  const pinFile = path.join(repoRoot, ".hugo-version");
  if (!existsSync(pinFile)) {
    return "";
  }
  return readFileSync(pinFile, "utf8").trim();
}

export function parseHugoVersion(stdout) {
  if (typeof stdout !== "string") {
    return "";
  }
  const found = stdout.match(/v(\d+\.\d+\.\d+)/);
  return found ? found[1] : "";
}

export function isExtendedHugo(stdout) {
  if (typeof stdout !== "string") {
    return false;
  }
  // `hugo version` prints one line: `hugo v<semver>[-<commit>][+<tag>...] <os>/<arch> ...`.
  // Only that line's own build tags count, so text anywhere else cannot pass a standard build.
  const found = stdout.trimStart().split("\n", 1)[0].match(/^hugo v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?((?:\+[a-z]+)*)(?:\s|$)/);
  return found ? found[1].split("+").includes("extended") : false;
}

export function probeHugoVersion(bin) {
  const probe = spawnSync(bin, ["version"], { encoding: "utf8" });
  if (probe.error) {
    return { ok: false, version: "", error: probe.error.message };
  }
  if (probe.status !== 0) {
    const detail = (probe.stderr || probe.stdout || `exit ${probe.status}`).trim();
    return { ok: false, version: "", error: detail };
  }
  const version = parseHugoVersion(probe.stdout);
  if (!version) {
    return { ok: false, version: "", error: `could not parse a version from '${bin} version'` };
  }
  if (!isExtendedHugo(probe.stdout)) {
    return { ok: false, version, error: `'${bin}' is not an extended Hugo build` };
  }
  return { ok: true, version, error: "" };
}

export function locatePinnedHugo(pinnedVersion) {
  const candidates = [];
  if (process.env.HUGO_PINNED) {
    candidates.push(process.env.HUGO_PINNED);
  }
  candidates.push(DEFAULT_PINNED_HUGO);
  if (process.env.HUGO_BIN) {
    candidates.push(process.env.HUGO_BIN);
  }

  const seen = new Set();
  for (const bin of candidates) {
    if (!bin || seen.has(bin) || !existsSync(bin)) {
      continue;
    }
    seen.add(bin);
    const probe = probeHugoVersion(bin);
    if (probe.ok && probe.version === pinnedVersion) {
      return { bin, version: probe.version };
    }
  }
  return null;
}
