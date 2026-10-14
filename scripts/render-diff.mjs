#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_PINNED_HUGO, locatePinnedHugo, probeHugoVersion, readPinnedVersion } from "./hugo-pin.mjs";

const repoRoot = process.cwd();
const SNIPPET = 90;
const REPORT_LIMIT = 20;

// Keep this deliberately narrow: the homepage catches the integration-orbit
// regression that motivated this guard, the MCP guide exercises a normal
// content render, and the stylesheet catches Sass/minifier changes. Comparing
// every generated artifact would make harmless encoder churn a CI outage.
export const CI_COMPARE_PATHS = [
  "index.html",
  "learn/mcp-security/index.html",
  "css/style.min.css",
];

export function logicalPath(rel) {
  const posix = rel.split(path.sep).join("/");
  return posix
    .replace(/style\.min\.[a-f0-9]+\.css/g, "style.min.css")
    .replace(/([A-Za-z0-9_-]+)\.min\.[a-f0-9]{16,}\.js/g, "$1.min.js")
    .replace(/([A-Za-z0-9_-]+)\.[a-f0-9]{16,}\.(js|css)/g, "$1.$2")
    .replace(/_hu_[a-f0-9]+/g, "_hu_HASH");
}

export function skipContentCompare(logical) {
  // Processed image encoder output and JS minifier output change across Hugo
  // versions even when the source is identical. Missing/extra files still fail.
  if (logical.includes("_hu_HASH")) {
    return true;
  }
  return /(^|\/)js\/[^/]+\.min\.js$/.test(logical);
}

// Matches only the tag Hugo itself injects: content "Hugo" or "Hugo X.Y.Z".
const HUGO_GENERATOR_TAG =
  /<meta\s+name=(?:"|')?generator(?:"|')?\s+content=(["'])Hugo(?: \d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)?\1\s*\/?>/gi;

export function stripHugoGeneratorTag(html) {
  // Leave script bodies untouched so a string that looks like the tag still
  // counts as a real difference.
  return html
    .split(/(<script\b[\s\S]*?<\/script>)/i)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(HUGO_GENERATOR_TAG, "")))
    .join("");
}

export function stripChromaColorSpans(html) {
  const normalizeCode = (source) => {
    let s = source.replace(/;-webkit-text-size-adjust:none/g, "");
    s = s.replace(/-webkit-text-size-adjust:none;?/g, "");
    s = s.replace(/<span\s+style=(?:"|')?color:#[0-9a-fA-F]{3,8}(?:"|')?\s*><\/span>/gi, "");
    const inner = /<span\s+style=(?:"|')?color:#[0-9a-fA-F]{3,8}(?:"|')?\s*>([\s\S]*?)<\/span>/i;
    for (let i = 0; i < 40; i += 1) {
      const next = s.replace(inner, "$1");
      if (next === s) {
        break;
      }
      s = next;
    }
    return s;
  };
  let normalized = html.replace(
    /<pre\b[^>]*>\s*<code\b[^>]*>[\s\S]*?<\/code>\s*<\/pre>/gi,
    normalizeCode,
  );
  normalized = normalized.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, normalizeCode);
  return normalized;
}

export function normalizeCss(source) {
  const compact = source.replace(/\s+/g, "");
  return compact.replace(/\d+(?:\.\d+)?e[+-]?\d+/gi, (token) => {
    const value = Number(token);
    return Number.isFinite(value) && Number.isInteger(value) ? String(value) : token;
  });
}

export function normalizeMarkdown(source) {
  return source
    .replace(/\t/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function normalizeDocument(source) {
  let s = source.replace(
    /<meta\s+name=(?:"|')?generator(?:"|')?\s+content=(?:"|')Hugo [^"']+(?:"|')/gi,
    '<meta name=generator content="Hugo"',
  );
  s = s.replace(/\s*integrity=(?:"|')sha[0-9]+-[A-Za-z0-9+/=]+(?:"|')/g, "");
  s = s.replace(/\/css\/style\.min\.[a-f0-9]+\.css/g, "/css/style.min.css");
  s = s.replace(/\/js\/([A-Za-z0-9_-]+)(?:\.min)?\.[a-f0-9]+\.js/g, "/js/$1.js");
  s = s.replace(/_hu_[a-f0-9]+/g, "_hu_HASH");
  s = s.replace(/<lastmod>[^<]+<\/lastmod>/g, "<lastmod>DATE</lastmod>");
  s = s.replace(/<lastBuildDate>[^<]+<\/lastBuildDate>/g, "<lastBuildDate>DATE</lastBuildDate>");
  s = s.replace(/<pubDate>[^<]+<\/pubDate>/g, "<pubDate>DATE</pubDate>");
  return s;
}

export function normalizeForCompare(logical, text) {
  const ext = path.posix.extname(logical).toLowerCase();
  if (ext === ".css") {
    return normalizeCss(text);
  }
  let s = normalizeDocument(text);
  if (ext === ".html" || ext === ".xml" || ext === ".svg" || ext === ".md") {
    s = stripChromaColorSpans(s);
    if (ext === ".html") {
      // Hugo 0.168.0 moved its injected generator tag to the end of <head>
      // (release note: "transform/metainject: Inject Hugo generator tag last
      // in <head>"). Same tag, different position.
      s = stripHugoGeneratorTag(s);
    }
    if (ext === ".xml") {
      // RSS descriptions do not run the page HTML render hook, so table
      // attributes such as data-fx differ across Hugo versions. Title
      // escaping of ">" vs "&gt;" is the same text.
      s = s.replace(/\s*data-fx=(?:"|')[^"']*(?:"|')/g, "");
      s = s.replace(/&gt;/g, ">");
    }
    s = s.replace(/>\s+</g, "><");
    s = s.replace(/\t/g, "");
    s = s.replace(/ !important/g, "!important");
  }
  if (ext === ".md") {
    s = normalizeMarkdown(s);
  }
  return s;
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

function isMostlyText(bytes) {
  if (bytes.includes(0)) {
    return false;
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 8000));
  let odd = 0;
  for (const b of sample) {
    if (b < 9 || (b > 13 && b < 32) || b === 127) {
      odd += 1;
    }
  }
  return odd / Math.max(sample.length, 1) < 0.05;
}

export function firstMismatchSnippet(pinned, local, ctx = SNIPPET) {
  const max = Math.min(pinned.length, local.length);
  let i = 0;
  while (i < max && pinned[i] === local[i]) {
    i += 1;
  }
  const start = Math.max(0, i - ctx);
  return {
    at: i,
    pinned: pinned.slice(start, i + ctx),
    local: local.slice(start, i + ctx),
  };
}

export function compareTrees(pinnedDir, localDir, paths) {
  const pinnedMap = new Map();
  const localMap = new Map();
  for (const full of walkFiles(pinnedDir)) {
    pinnedMap.set(logicalPath(path.relative(pinnedDir, full)), full);
  }
  for (const full of walkFiles(localDir)) {
    localMap.set(logicalPath(path.relative(localDir, full)), full);
  }

  const selected = paths ? [...paths].sort() : [...new Set([...pinnedMap.keys(), ...localMap.keys()])].sort();
  const diffs = [];
  for (const logical of selected) {
    const pinnedFull = pinnedMap.get(logical);
    const localFull = localMap.get(logical);
    if (!pinnedFull) {
      diffs.push({ path: logical, kind: "added" });
      continue;
    }
    if (!localFull) {
      diffs.push({ path: logical, kind: "removed" });
      continue;
    }
    if (skipContentCompare(logical)) {
      continue;
    }
    const pinnedBytes = readFileSync(pinnedFull);
    const localBytes = readFileSync(localFull);
    if (pinnedBytes.equals(localBytes)) {
      continue;
    }
    if (!isMostlyText(pinnedBytes) || !isMostlyText(localBytes)) {
      diffs.push({
        path: logical,
        kind: "changed",
        pinned: `binary ${pinnedBytes.length} bytes`,
        local: `binary ${localBytes.length} bytes`,
      });
      continue;
    }
    const pinnedText = normalizeForCompare(logical, pinnedBytes.toString("utf8"));
    const localText = normalizeForCompare(logical, localBytes.toString("utf8"));
    if (pinnedText === localText) {
      continue;
    }
    const snippet = firstMismatchSnippet(pinnedText, localText);
    diffs.push({
      path: logical,
      kind: "changed",
      pinned: snippet.pinned,
      local: snippet.local,
    });
  }
  return diffs;
}

export function formatReport(diffs, localVersion, pinnedVersion) {
  const noun = diffs.length === 1 ? "path differs" : "paths differ";
  const lines = [
    `render-diff failed: ${diffs.length} ${noun} (latest Hugo ${localVersion} vs pinned ${pinnedVersion})`,
    "",
  ];
  const shown = diffs.slice(0, REPORT_LIMIT);
  for (const diff of shown) {
    lines.push(diff.path);
    if (diff.kind === "added") {
      lines.push("  only in latest Hugo output");
    } else if (diff.kind === "removed") {
      lines.push("  only in pinned hugo output");
    } else {
      lines.push(`  pinned: ${singleLine(diff.pinned)}`);
      lines.push(`  latest: ${singleLine(diff.local)}`);
    }
    lines.push("");
  }
  if (diffs.length > REPORT_LIMIT) {
    lines.push(`… and ${diffs.length - REPORT_LIMIT} more paths`);
  }
  return lines.join("\n").trimEnd();
}

function singleLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function buildWith(bin, dest) {
  const cache = mkdtempSync(path.join(os.tmpdir(), "hugo-render-diff-cache-"));
  mkdirSync(dest, { recursive: true });
  const result = spawnSync(
    bin,
    ["--gc", "--minify", "--destination", dest, "--cacheDir", cache],
    { cwd: repoRoot, encoding: "utf8", timeout: 120000 },
  );
  return { result, cache };
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

export function runRenderDiff({
  localBin,
  pinnedBin = process.env.HUGO_PINNED || "",
  repo = repoRoot,
  githubActions = Boolean(process.env.GITHUB_ACTIONS),
} = {}) {
  const latestBin = localBin || process.env.HUGO_LOCAL || "hugo";
  const pinnedVersion = readPinnedVersion(repo);
  if (!pinnedVersion) {
    return { status: 1, message: "render-diff: .hugo-version is missing or empty" };
  }

  const localProbe = probeHugoVersion(latestBin);
  if (!localProbe.ok) {
    return { status: 1, message: `render-diff: could not run '${latestBin} version': ${localProbe.error}` };
  }

  const requireTwoBuild = Boolean(process.env.CI_RENDER_DIFF);
  if (githubActions && (!pinnedBin || !(localBin || process.env.HUGO_LOCAL))) {
    if (requireTwoBuild) {
      return {
        status: 1,
        message:
          "render-diff: CI needs distinct pinned and latest binaries in HUGO_PINNED and HUGO_LOCAL; refusing to claim a two-build comparison.",
      };
    }
    return {
      status: 0,
      message:
        "render-diff: GITHUB_ACTIONS without HUGO_PINNED and HUGO_LOCAL; skipping (the dedicated compare step owns the two-build).",
    };
  }

  if (githubActions && localProbe.version === pinnedVersion) {
    return {
      status: 0,
      message:
        `render-diff: vacuous skip: latest Hugo ${localProbe.version} equals pinned ${pinnedVersion}; no two-build comparison ran.`,
    };
  }

  if (!githubActions && localProbe.version === pinnedVersion) {
    return {
      status: 0,
      message: `render-diff: PATH hugo ${localProbe.version} matches .hugo-version; nothing to compare.`,
    };
  }

  const pinned = pinnedBin
    ? (() => {
        const probe = probeHugoVersion(pinnedBin);
        return probe.ok && probe.version === pinnedVersion ? { bin: pinnedBin, version: probe.version } : null;
      })()
    : locatePinnedHugo(pinnedVersion);
  if (!pinned) {
    const configured = pinnedBin ? `HUGO_PINNED '${pinnedBin}'` : "the pinned binary";
    return {
      status: 1,
      message:
        `render-diff: latest Hugo is ${localProbe.version} but .hugo-version pins ${pinnedVersion}, and ${configured} was not found as an extended ${pinnedVersion} build.\n` +
        `Place the extended ${pinnedVersion} binary at ${DEFAULT_PINNED_HUGO} or set HUGO_PINNED.`,
    };
  }

  const pinnedDir = mkdtempSync(path.join(os.tmpdir(), "hugo-render-diff-pin-"));
  const localDir = mkdtempSync(path.join(os.tmpdir(), "hugo-render-diff-local-"));
  const caches = [];
  try {
    const pinnedBuild = buildWith(pinned.bin, pinnedDir);
    caches.push(pinnedBuild.cache);
    if (pinnedBuild.result.status !== 0) {
      return {
        status: 1,
        message:
          `render-diff: pinned hugo ${pinned.version} (${pinned.bin}) failed to build.\n` +
          (pinnedBuild.result.stderr || pinnedBuild.result.stdout || `exit ${pinnedBuild.result.status}`),
      };
    }

    const localBuild = buildWith(latestBin, localDir);
    caches.push(localBuild.cache);
    if (localBuild.result.status !== 0) {
      return {
        status: 1,
        message:
          `render-diff: latest Hugo ${localProbe.version} (${latestBin}) failed to build.\n` +
          (localBuild.result.stderr || localBuild.result.stdout || `exit ${localBuild.result.status}`),
      };
    }

    const diffs = compareTrees(pinnedDir, localDir, CI_COMPARE_PATHS);
    if (diffs.length > 0) {
      return { status: 1, message: formatReport(diffs, localProbe.version, pinned.version) };
    }
    return {
      status: 0,
      message: `render-diff: latest Hugo ${localProbe.version} matches pinned ${pinned.version} across ${CI_COMPARE_PATHS.join(", ")} after normalization.`,
    };
  } finally {
    rmSync(pinnedDir, { recursive: true, force: true });
    rmSync(localDir, { recursive: true, force: true });
    for (const cache of caches) {
      rmSync(cache, { recursive: true, force: true });
    }
  }
}

function isMain() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  const outcome = runRenderDiff();
  if (outcome.status === 0) {
    console.log(outcome.message);
  } else {
    fail(outcome.message, outcome.status);
  }
}
