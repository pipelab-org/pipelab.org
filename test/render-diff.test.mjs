import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { isExtendedHugo, parseHugoVersion } from "../scripts/hugo-pin.mjs";
import {
  compareTrees,
  formatReport,
  logicalPath,
  normalizeCss,
  normalizeForCompare,
  runRenderDiff,
  skipContentCompare,
  stripChromaColorSpans,
} from "../scripts/render-diff.mjs";

const pinnedVersion = readFileSync(new URL("../.hugo-version", import.meta.url), "utf8").trim();

function writeFakeExtendedHugo(version, homepage = "<main>orbit intact</main>") {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "render-diff-fake-hugo-"));
  const bin = path.join(binDir, "hugo");
  const script = [
    "#!/bin/sh",
    'if [ "$1" = version ]; then',
    `  printf '%s\\n' 'hugo v${version}+extended linux/amd64'`,
    "  exit 0",
    "fi",
    "dest=''",
    'while [ "$#" -gt 0 ]; do',
    '  if [ "$1" = --destination ]; then',
    '    dest="$2"',
    "    shift 2",
    "  else",
    "    shift",
    "  fi",
    "done",
    'mkdir -p "$dest/learn/mcp-security" "$dest/css"',
    `printf '%s\\n' '${homepage}' > "$dest/index.html"`,
    `printf '%s\\n' '<main>MCP guide</main>' > "$dest/learn/mcp-security/index.html"`,
    `printf '%s\\n' '.orbit{height:1000px}' > "$dest/css/style.min.aaaaaaaaaaaaaaaa.css"`,
    "",
  ].join("\n");
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return bin;
}

test("parseHugoVersion reads the vX.Y.Z token from hugo version output", () => {
  assert.equal(
    parseHugoVersion("hugo v0.147.7-189453612e4bedc4f27495a7b1145321c8d89807+extended linux/amd64\n"),
    "0.147.7",
  );
  assert.equal(
    parseHugoVersion("hugo v0.162.1+extended linux/amd64 BuildDate=2026-06-07T00:00:00+00:00 VendorInfo=Fedora:0.162.1-1.fc43\n"),
    "0.162.1",
  );
});

test("isExtendedHugo rejects a matching standard build", () => {
  assert.equal(isExtendedHugo("hugo v0.147.7+extended linux/amd64\n"), true);
  assert.equal(isExtendedHugo("hugo v0.147.7 linux/amd64\n"), false);
});

test("isExtendedHugo accepts the extended build that also carries deploy", () => {
  assert.equal(isExtendedHugo("hugo v0.165.0+extended+withdeploy linux/amd64 BuildDate=unknown\n"), true);
  assert.equal(isExtendedHugo("hugo v0.165.0+withdeploy linux/amd64\n"), false);
  assert.equal(isExtendedHugo("hugo v0.165.0+extendedx linux/amd64\n"), false);
});

test("isExtendedHugo reads the build tags on the version token only", () => {
  assert.equal(isExtendedHugo("hugo v0.147.7-189453612e4bedc4f27495a7b1145321c8d89807+extended linux/amd64\n"), true);
  assert.equal(isExtendedHugo("hugo v0.165.0 linux/amd64 BuildDate=unknown VendorInfo=rebuild-+extended\n"), false);
  assert.equal(isExtendedHugo("warning: hugo v1.2.3+extended requested\nhugo v0.165.0 linux/amd64\n"), false);
  assert.equal(isExtendedHugo("hugo v0.148.0-DEV+extended linux/amd64\n"), true);
});

test("render diff refuses an equal-version Hugo without extended support", () => {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "render-diff-standard-hugo-"));
  const bin = path.join(binDir, "hugo");
  writeFileSync(bin, "#!/bin/sh\nprintf '%s\\n' 'hugo v0.147.7 linux/amd64'\n");
  chmodSync(bin, 0o755);

  const result = runRenderDiff({ localBin: bin });
  assert.equal(result.status, 1);
  assert.match(result.message, /not an extended Hugo build/);
});

test("logicalPath strips fingerprint hashes and image processing suffixes", () => {
  assert.equal(
    logicalPath("css/style.min.2a5a31fb0670fcd4d8577b733cd79cd8be5b05cc3bcebffe89447e036014d80d.css"),
    "css/style.min.css",
  );
  assert.equal(
    logicalPath("js/receipt-constellation.min.c0c1b3321d0c77d5d358c49d9fd42b5dfd9b353632382fdffb07364249c90949.js"),
    "js/receipt-constellation.min.js",
  );
  assert.equal(
    logicalPath("images/dashboard-overview_hu_c2342b23973a5388.webp"),
    "images/dashboard-overview_hu_HASH.webp",
  );
});

test("skipContentCompare ignores processed images and minified JS bytes", () => {
  assert.equal(skipContentCompare("images/dashboard-overview_hu_HASH.webp"), true);
  assert.equal(skipContentCompare("js/receipt-constellation.min.js"), true);
  assert.equal(skipContentCompare("index.html"), false);
  assert.equal(skipContentCompare("css/style.min.css"), false);
});

test("normalizeCss treats 1e3px and 1000px as the same minify", () => {
  assert.equal(
    normalizeCss(".pg-demo-frame{height:clamp(640px,86vh,1000px)}"),
    normalizeCss(".pg-demo-frame{height:clamp(640px, 86vh, 1e3px)}"),
  );
});

test("whitespace-only and known-benign normalized HTML differences do not fail", () => {
  const pinned = `<!doctype html><html><head><meta name=generator content="Hugo 0.147.7"><link rel=stylesheet href=/css/style.min.aaaa.css integrity="sha256-abc="></head><body><a style="--x: 56.5%; --y:28.3%;"></a></body></html>`;
  const local = `<!doctype html><html><head><meta name=generator content="Hugo 0.162.1"><link rel=stylesheet href=/css/style.min.bbbb.css integrity="sha256-def="></head><body><a style="--x: 56.5%; --y:28.3%;"></a></body></html>`;
  assert.equal(normalizeForCompare("index.html", pinned), normalizeForCompare("index.html", local));
});

test("reader-visible timestamps remain render differences", () => {
  const pinned = `<p>Captured at 2026-08-25T12:00:00Z</p>`;
  const local = `<p>Captured at 2026-08-26T12:00:00Z</p>`;
  assert.notEqual(normalizeForCompare("index.html", pinned), normalizeForCompare("index.html", local));
});

test("RSS build metadata remains normalized by its enclosing tag", () => {
  const pinned = `<lastBuildDate>Tue, 25 Aug 2026 13:03:18 -0400</lastBuildDate>`;
  const local = `<lastBuildDate>Wed, 26 Aug 2026 10:11:12 +0000</lastBuildDate>`;
  assert.equal(normalizeForCompare("index.xml", pinned), normalizeForCompare("index.xml", local));
});

test("stripChromaColorSpans keeps code text and drops highlighter spans", () => {
  const pinned = `<code><span style=color:#75715e></span>set -euo pipefail</code>`;
  const local = `<code>set -euo pipefail</code>`;
  assert.equal(stripChromaColorSpans(pinned), stripChromaColorSpans(local));
});

test("chroma normalization preserves color changes outside code", () => {
  const pinned = `<p><span style="color:#00ff00">Verified</span></p>`;
  const local = `<p><span style="color:#ff0000">Verified</span></p>`;
  assert.notEqual(normalizeForCompare("index.html", pinned), normalizeForCompare("index.html", local));
});

test("compareTrees reports the orbit --y collapse and is path-first", () => {
  const pinned = mkdtempSync(path.join(os.tmpdir(), "render-diff-pin-"));
  const local = mkdtempSync(path.join(os.tmpdir(), "render-diff-local-"));
  writeFileSync(
    path.join(pinned, "index.html"),
    `<a class=hp-orbit-node style="--x: 56.5%; --y:%; --brand: #D97757;"></a>\n`,
  );
  writeFileSync(
    path.join(local, "index.html"),
    `<a class=hp-orbit-node style="--x: 56.5%; --y:28.3%; --brand: #D97757;"></a>\n`,
  );

  const diffs = compareTrees(pinned, local);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].path, "index.html");
  assert.equal(diffs[0].kind, "changed");
  assert.match(diffs[0].pinned, /--y:%/);
  assert.match(diffs[0].local, /--y:28\.3%/);

  const report = formatReport(diffs, "0.162.1", "0.147.7");
  assert.match(report, /^render-diff failed: 1 path differs/);
  assert.match(report, /^index\.html$/m);
  assert.ok(report.indexOf("index.html") < report.indexOf("pinned:"));
});

test("CI refuses to claim a two-build comparison with only one binary", () => {
  const onlyBin = writeFakeExtendedHugo(pinnedVersion);
  const previous = process.env.CI_RENDER_DIFF;
  process.env.CI_RENDER_DIFF = "1";
  try {
    const result = runRenderDiff({ localBin: onlyBin, pinnedBin: "", githubActions: true });
    assert.equal(result.status, 1);
    assert.match(result.message, /needs distinct pinned and latest binaries/);
  } finally {
    if (previous === undefined) {
      delete process.env.CI_RENDER_DIFF;
    } else {
      process.env.CI_RENDER_DIFF = previous;
    }
  }
});

test("CI preflight skips the two-build when the dedicated env is absent", () => {
  const onlyBin = writeFakeExtendedHugo(pinnedVersion);
  const previous = process.env.CI_RENDER_DIFF;
  delete process.env.CI_RENDER_DIFF;
  try {
    const result = runRenderDiff({ localBin: onlyBin, pinnedBin: "", githubActions: true });
    assert.equal(result.status, 0);
    assert.match(result.message, /dedicated compare step owns the two-build/);
  } finally {
    if (previous === undefined) {
      delete process.env.CI_RENDER_DIFF;
    } else {
      process.env.CI_RENDER_DIFF = previous;
    }
  }
});

test("CI skips explicitly when latest Hugo equals the pin", () => {
  const pinnedBin = writeFakeExtendedHugo(pinnedVersion);
  const latestBin = writeFakeExtendedHugo(pinnedVersion);
  const result = runRenderDiff({
    localBin: latestBin,
    pinnedBin,
    githubActions: true,
  });
  assert.equal(result.status, 0);
  assert.match(result.message, /vacuous skip/);
  assert.match(result.message, /no two-build comparison ran/);
});

test("CI compares explicit pinned and latest binaries", () => {
  const pinnedBin = writeFakeExtendedHugo(pinnedVersion);
  const latestBin = writeFakeExtendedHugo("0.162.1");
  const result = runRenderDiff({
    localBin: latestBin,
    pinnedBin,
    githubActions: true,
  });
  assert.equal(result.status, 0);
  assert.match(result.message, /latest Hugo 0\.162\.1 matches pinned/);
});

test("a real homepage orbit HTML change fails the two-build comparison", () => {
  const pinnedBin = writeFakeExtendedHugo(pinnedVersion, '<a class=hp-orbit-node style="--y:28.3%"></a>');
  const latestBin = writeFakeExtendedHugo("0.162.1", '<a class=hp-orbit-node style="--y:%"></a>');
  const result = runRenderDiff({
    localBin: latestBin,
    pinnedBin,
    githubActions: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.message, /^render-diff failed: 1 path differs/m);
  assert.match(result.message, /^index\.html$/m);
  assert.match(result.message, /--y:28\.3%/);
  assert.match(result.message, /--y:%/);
});

test("markdown mirrors drop chroma vendor CSS the same way HTML does", () => {
  const pinned = `<pre style="color:#f8f8f2;background-color:#272822;-moz-tab-size:4;-o-tab-size:4;tab-size:4;"><code>echo ok</code></pre>`;
  const local = `<pre style="color:#f8f8f2;background-color:#272822;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-text-size-adjust:none;"><code>echo ok</code></pre>`;
  assert.equal(
    normalizeForCompare("learn/continue/index.md", pinned),
    normalizeForCompare("learn/continue/index.md", local),
  );
});

test("markdown attribute wrapping whitespace does not count as a diff", () => {
  const pinned = `<figure><img src="/img/dashboard/overview.png"\n alt="Operator console Overview"></figure>`;
  const local = `<figure><img src="/img/dashboard/overview.png"\nalt="Operator console Overview"></figure>`;
  assert.equal(
    normalizeForCompare("learn/operator-console/index.md", pinned),
    normalizeForCompare("learn/operator-console/index.md", local),
  );
});

test("RSS title escaping of > vs &gt; does not count as a diff", () => {
  const pinned = `<item><title>What &lt;private_address>, &lt;pl:...>, and [REDACTED] Mean</title></item>`;
  const local = `<item><title>What &lt;private_address&gt;, &lt;pl:...&gt;, and [REDACTED] Mean</title></item>`;
  assert.equal(
    normalizeForCompare("tags/dlp/index.xml", pinned),
    normalizeForCompare("tags/dlp/index.xml", local),
  );
});

test("compareTrees ignores CSS minify that is the same after canonicalization", () => {
  const pinned = mkdtempSync(path.join(os.tmpdir(), "render-diff-css-pin-"));
  const local = mkdtempSync(path.join(os.tmpdir(), "render-diff-css-local-"));
  mkdirSync(path.join(pinned, "css"));
  mkdirSync(path.join(local, "css"));
  writeFileSync(
    path.join(pinned, "css", "style.min.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.css"),
    ".box{max-width:100% !important;height:1000px}",
  );
  writeFileSync(
    path.join(local, "css", "style.min.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.css"),
    ".box{max-width:100%!important;height:1e3px}",
  );
  assert.deepEqual(compareTrees(pinned, local), []);
});

test("normalizeForCompare ignores the position of Hugo's injected generator tag", () => {
  const pinned = `<!doctype html><html lang="en"><head><meta name=generator content="Hugo 0.147.7"><meta charset="utf-8"><title>PipeLab</title></head><body>x</body></html>`;
  const latest = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PipeLab</title><meta name=generator content="Hugo 0.168.0"></head><body>x</body></html>`;
  assert.equal(normalizeForCompare("index.html", pinned), normalizeForCompare("index.html", latest));
  const changed = latest.replace("<title>PipeLab</title>", "<title>Other</title>");
  assert.notEqual(normalizeForCompare("index.html", pinned), normalizeForCompare("index.html", changed));
  const author = `<meta name=generator content="SiteBuilder">`;
  assert.ok(normalizeForCompare("index.html", author).includes("SiteBuilder"));
});
