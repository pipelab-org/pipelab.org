#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

import { auditInstallContract } from "./install-contract.mjs";
import { isBlockedExternalLink } from "./external-link-policy.mjs";
import { auditDemoVersions } from "./historical-artifacts.mjs";
import { probeHugoVersion, readPinnedVersion } from "./hugo-pin.mjs";
import { auditResponsePatternCounts } from "./response-pattern-audit.mjs";

const repoRoot = process.cwd();
const publicDir = path.join(repoRoot, "public");

// Structured-data property validation.
//
// Every property we emit has to be one schema.org permits on that type. The bug
// this catches shipped for months: codeRepository on SoftwareApplication reads
// like a software property, but schema.org scopes it to SoftwareSourceCode, and
// validators reject it. Only the vocabulary settles that, so the table is
// generated from it by scripts/generate-schema-property-table.mjs rather than
// written from what looks right.
const schemaPropertyTable = JSON.parse(
  readFileSync(path.join(repoRoot, "data", "schema-org-properties.json"), "utf8"),
);

function checkSchemaProperties(node, route, blockIndex, issues, seen = new Set()) {
  if (Array.isArray(node)) {
    for (const entry of node) checkSchemaProperties(entry, route, blockIndex, issues, seen);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  const type = node["@type"];
  // Only single-typed nodes are checked. A multi-typed node may legitimately
  // draw properties from any of its types, and reporting one as invalid because
  // it belongs to the sibling type would be a false positive.
  if (typeof type === "string") {
    const allowed = schemaPropertyTable.types[type];
    if (!allowed) {
      issues.push(
        `${route}: JSON-LD block ${blockIndex + 1} emits @type ${type}, which is absent from data/schema-org-properties.json (add it to EMITTED_TYPES and regenerate)`,
      );
    } else {
      for (const key of Object.keys(node)) {
        // @-keywords are JSON-LD syntax, not schema.org properties.
        if (key.startsWith("@")) continue;
        if (!allowed.includes(key)) {
          issues.push(
            `${route}: JSON-LD block ${blockIndex + 1} uses "${key}" on ${type}, which is not in the validated property table. Either schema.org does not define it for that type, or it is newly emitted: rebuild and run scripts/generate-schema-property-table.mjs, which refuses to record a property the vocabulary rejects.`,
          );
        }
      }
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      checkSchemaProperties(value, route, blockIndex, issues, seen);
    }
  }
}
const skipBuild = process.argv.includes("--skip-build");
const buildFuture = process.argv.includes("--build-future");
const reportSeoNotices = process.argv.includes("--seo-notices");
const issues = [];
const notices = [];

// CI installs the version pinned in .hugo-version, so a bare `hugo` there is
// already the pinned binary. Locally it is whatever is on PATH, and the two can
// disagree in ways that change rendered output rather than failing loudly: a
// newer Hugo has accepted template math and a YAML-reserved `y` key that the
// pinned build silently resolves to nothing. Both shipped a broken homepage that
// looked correct in local preview. Set HUGO_BIN=/path/to/pinned/hugo to audit
// with the exact CI binary. This warns rather than fails, because refusing to
// run without the pinned binary would make the audit easy to stop using.
const hugoBin = process.env.HUGO_BIN || "hugo";

function warnOnHugoVersionDrift() {
  const pinned = readPinnedVersion(repoRoot);
  if (!pinned) return;

  const probe = probeHugoVersion(hugoBin);
  if (!probe.ok) {
    console.warn(`[hugo-version] could not run '${hugoBin} version'; cannot confirm parity with pinned ${pinned}.`);
    return;
  }
  if (probe.version !== pinned) {
    console.warn(
      `[hugo-version] WARNING: building with Hugo ${probe.version} but .hugo-version pins ${pinned}.\n` +
      `[hugo-version] CI and production build with ${pinned}. Rendered output can differ without any build error,\n` +
      `[hugo-version] so a green audit here does not prove a green build there.\n` +
      `[hugo-version] Re-run with: HUGO_BIN=/path/to/hugo-${pinned}/hugo node scripts/site-audit.mjs`
    );
  }
}

if (!skipBuild) {
  warnOnHugoVersionDrift();
  rmSync(publicDir, { recursive: true, force: true });
  // --minify matches production and CI. Without it the audit reads bytes no
  // visitor or crawler ever receives, and the checks that care about attribute
  // shape (alt text, in particular) pass on markup the minifier then rewrites.
  const hugoArgs = ["--gc", "--minify"];
  if (buildFuture) {
    hugoArgs.push("--buildFuture");
  }
  const build = spawnSync(hugoBin, hugoArgs, { cwd: repoRoot, stdio: "inherit" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

if (!existsSync(publicDir)) {
  console.error("public/ does not exist. Run `hugo --gc` first.");
  process.exit(1);
}

issues.push(...auditResponsePatternCounts(repoRoot));
const pricingCounter = spawnSync("python3", ["scripts/pricing-counter-audit.py", publicDir], {
  cwd: repoRoot, encoding: "utf8",
});
if (pricingCounter.status !== 0) {
  issues.push(`pricing counter: ${pricingCounter.error?.message || pricingCounter.stderr || pricingCounter.stdout}`);
}

const analyticsSource = readFileSync(path.join(repoRoot, "static/playground/demo/analytics.js"), "utf8");
const viewerSources = ["viewer.js", "viewer-live.js"]
  .map((name) => readFileSync(path.join(repoRoot, "static/playground/demo", name), "utf8"))
  .join("\n");
const declaredPlaygroundEvents = new Set(
  [...analyticsSource.matchAll(/"(playground_[a-z0-9_]+)"/g)].map((match) => match[1]),
);
const emittedPlaygroundEvents = new Set(
  [...viewerSources.matchAll(/pgTrackSafe\("(playground_[a-z0-9_]+)"/g)].map((match) => match[1]),
);
for (const event of emittedPlaygroundEvents) {
  if (!declaredPlaygroundEvents.has(event)) {
    issues.push(`playground analytics: emitted event ${event} is missing from the transport allowlist`);
  }
}
for (const event of declaredPlaygroundEvents) {
  if (!emittedPlaygroundEvents.has(event)) {
    issues.push(`playground analytics: transport event ${event} has no viewer emitter`);
  }
}

// The homepage particle field links to the Playground replay gallery.
// Reconcile the public data here so either surface cannot silently drift.
const replayRoot = path.join(repoRoot, "static/playground-replay");
const replaySignerKey = readFileSync(path.join(replayRoot, "signing-key.pub"), "utf8").trim();
const replayGallery = JSON.parse(readFileSync(path.join(replayRoot, "gallery.json"), "utf8"));
const replayScenarioIds = (replayGallery.scenarios || []).map((scenario) => scenario.id).filter(Boolean);
let replayReceiptTotal = 0;
for (const scenario of replayGallery.scenarios || []) {
  const manifestPath = path.resolve(replayRoot, scenario.manifest_path || "");
  if (!manifestPath.startsWith(`${replayRoot}${path.sep}`) || !existsSync(manifestPath)) {
    issues.push(`playground replay: missing or invalid manifest path for ${scenario.id || "unknown scenario"}`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // These checks bind a manifest to the gallery it ships with. They are not
  // signature verification: the signer_key compare catches a manifest that
  // names a different signer, and the digest compare catches a packet swapped
  // under its recorded hash. Verifying the Ed25519 signature in assurance.json
  // needs the pipelock verifier in CI and is tracked separately.
  if (manifest.signer_key !== replaySignerKey) {
    issues.push(`playground replay: ${scenario.id} claims signer ${manifest.signer_key} rather than the pinned gallery signer`);
  }
  const packetName = manifest.packet && manifest.packet.path;
  const packetSha = manifest.packet && manifest.packet.sha256;
  if (!packetName || !packetSha) {
    issues.push(`playground replay: ${scenario.id} manifest does not name a packet with a sha256`);
  } else {
    const packetPath = path.resolve(path.dirname(manifestPath), packetName);
    // A lexical containment check alone is bypassable: readFileSync follows
    // symlinks, so a link inside the gallery could hash a file outside it.
    // Resolve the real path and require a regular file.
    const realPacketPath = existsSync(packetPath) ? realpathSync(packetPath) : "";
    const isRegularFile = realPacketPath ? lstatSync(realPacketPath).isFile() : false;
    if (
      !packetPath.startsWith(`${replayRoot}${path.sep}`) ||
      !realPacketPath ||
      !realPacketPath.startsWith(`${realpathSync(replayRoot)}${path.sep}`) ||
      !isRegularFile
    ) {
      issues.push(`playground replay: ${scenario.id} names a packet outside the gallery, missing, or not a regular file`);
    } else {
      const actual = createHash("sha256").update(readFileSync(realPacketPath)).digest("hex");
      if (actual !== packetSha) {
        issues.push(`playground replay: ${scenario.id} packet digest ${actual} does not match the manifest value ${packetSha}`);
      }
    }
  }
  const manifestCount = Array.isArray(manifest.receipts) ? manifest.receipts.length : -1;
  if (manifestCount !== scenario.receipt_count) {
    issues.push(`playground replay: ${scenario.id} gallery count ${scenario.receipt_count} does not match manifest count ${manifestCount}`);
  }
  replayReceiptTotal += manifestCount > 0 ? manifestCount : 0;
}
if (replayReceiptTotal > 90) {
  issues.push(`playground replay: ${replayReceiptTotal} records exceed the homepage particle limit of 90`);
}

const htmlFiles = walk(publicDir).filter((file) => file.endsWith(".html"));
const pageByRoute = new Map();
const titleOwners = new Map();
const descriptionOwners = new Map();

const homeHtml = readFileSync(path.join(publicDir, "index.html"), "utf8");
// The homepage ships only its own complete styles inline. Keep other pages on
// the shared stylesheet until their page-specific coverage has been checked.
if (/<link\b[^>]*rel="stylesheet"[^>]*href="[^"]*style\.min/.test(homeHtml) || !/<style>[^<]*\.home-product/.test(homeHtml)) {
  issues.push("homepage: inline page styles must replace the full site stylesheet");
}
const baseTag = homeHtml.match(/<script\b[^>]*src="[^"]*site-base\.min[^"]*"[^>]*>/)?.[0];
if (!baseTag || !/\bdefer(?:[\s=>])/.test(baseTag)) issues.push("homepage: base behavior must be deferred");
for (const button of homeHtml.matchAll(/<button\b[^>]*class="hp-term-row"[^>]*>/g)) {
  if (/aria-label=/.test(button[0])) issues.push("homepage: command rows must keep their visible accessible name");
}

for (const requiredTag of [
  '<link rel="manifest" href="/site.webmanifest">',
  '<link rel="mask-icon" href="/images/brand/pipelab-mark-mono-dark.svg" color="#00e5a0">',
  '<link rel="apple-touch-icon" type="image/png" sizes="180x180" href="/apple-touch-icon.png">',
]) {
  if (!homeHtml.includes(requiredTag)) {
    issues.push(`brand metadata: homepage is missing ${requiredTag}`);
  }
}
const manifestPath = path.join(publicDir, "site.webmanifest");
if (!existsSync(manifestPath)) {
  issues.push("brand metadata: site.webmanifest is missing");
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    issues.push("brand metadata: site.webmanifest contains invalid JSON");
  }
  if (manifest) {
    const manifestIcons = new Set((manifest.icons || []).map((icon) => icon.src));
    for (const icon of ["/favicon-192x192.png", "/favicon-512x512.png"]) {
      if (!manifestIcons.has(icon) || !existsSync(path.join(publicDir, icon.slice(1)))) {
        issues.push(`brand metadata: manifest icon ${icon} is missing or undeclared`);
      }
    }
  }
}

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const scrubbedHtml = html.replace(/<!--[\s\S]*?-->/g, "");
  const route = routeFromFile(file);
  const title = match(scrubbedHtml, /<title>([^<]+)<\/title>/i);
  const description = match(scrubbedHtml, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const robots = (match(scrubbedHtml, /<meta\s+name="robots"\s+content="([^"]*)"/i) || "").toLowerCase();
  const ids = new Set([...scrubbedHtml.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id));
  const visibleText = visibleTextFromHtml(scrubbedHtml);
  const indexable = !robots.includes("noindex") && route !== "/404.html";

  pageByRoute.set(route, { file, route, html: scrubbedHtml, ids, visibleText, title, description, robots, indexable });

  if (!title) {
    issues.push(`${route}: missing <title>`);
  }

  if (indexable && title && title.length > 60) {
    issues.push(`${route}: <title> length ${title.length} exceeds 60`);
  }

  if (indexable) {
    const h1Count = (scrubbedHtml.match(/<h1\b/gi) || []).length;
    if (h1Count !== 1) {
      issues.push(`${route}: expected exactly one h1, found ${h1Count}`);
    }
  }

  if (reportSeoNotices && indexable && title && title.length < 50) {
    notices.push(`${route}: <title> length ${title.length} is below 50`);
  }

  if (!description && indexable) {
    issues.push(`${route}: missing meta description`);
  }

  if (indexable) {
    if (description && (description.length < 120 || description.length > 155)) {
      issues.push(`${route}: meta description length ${description.length} is outside 120-155`);
    }

    if (title) {
      addDuplicate(titleOwners, title, route);
    }

    if (/"date(Published|Modified)":\s*"0001-01-01"/.test(scrubbedHtml)) {
      issues.push(`${route}: zero-value date in structured data (frontmatter needs date/lastmod)`);
    }

    for (const [index, match] of [...scrubbedHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].entries()) {
      let data;
      try {
        data = JSON.parse(match[1]);
      } catch {
        issues.push(`${route}: invalid JSON-LD block ${index + 1}`);
        continue;
      }

      checkSchemaProperties(data, route, index, issues);

      if (data?.["@type"] !== "FAQPage" || !Array.isArray(data.mainEntity)) {
        continue;
      }
      for (const q of data.mainEntity) {
        const name = normalizeText(q?.name || "");
        if (name && !visibleText.includes(name)) {
          issues.push(`${route}: FAQPage schema question "${name.slice(0, 60)}..." missing from visible page content`);
        }

        const answerText = normalizeText(q?.acceptedAnswer?.text || "");
        if (answerText && !visibleText.includes(answerText)) {
          issues.push(`${route}: FAQPage schema answer for "${name.slice(0, 60)}..." missing from visible page content`);
        }
      }
    }

    if (description) {
      addDuplicate(descriptionOwners, description, route);
    }

    if (
      route !== "/" &&
      !/<link[^>]+rel="alternate"[^>]+type="application\/rss\+xml"[^>]+href="https:\/\/pipelab\.org\/index\.xml"/i.test(scrubbedHtml)
    ) {
      issues.push(`${route}: missing site-wide RSS autodiscovery link`);
    }
  }

  if (/\s(?:on)[a-z]+\s*=/i.test(scrubbedHtml)) {
    issues.push(`${route}: inline event handler attribute present; blocked by CSP script-src-attr 'none'`);
  }

  const labelFors = new Set([...scrubbedHtml.matchAll(/<label\b[^>]*\sfor="([^"]+)"/gi)].map(([, id]) => id));

  for (const match of scrubbedHtml.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt=("[^"]*"|'[^']*')/i.test(match[0])) {
      issues.push(`${route}: image missing alt text`);
    }
  }

  for (const match of scrubbedHtml.matchAll(/<iframe\b[^>]*>/gi)) {
    if (!/\stitle=("[^"]+"|'[^']+')/i.test(match[0])) {
      issues.push(`${route}: iframe missing title`);
    }
  }

  for (const match of scrubbedHtml.matchAll(/<(textarea|select|input)\b[^>]*>/gi)) {
    const tagName = match[1].toLowerCase();
    const tag = match[0];
    if (tagName === "input") {
      const type = (attr(tag, "type") || "text").toLowerCase();
      if (["button", "checkbox", "hidden", "image", "radio", "reset", "submit"].includes(type)) {
        continue;
      }
    }

    if (attr(tag, "aria-label") || attr(tag, "aria-labelledby")) {
      continue;
    }

    const id = attr(tag, "id");
    if (id && labelFors.has(id)) {
      continue;
    }

    const controlLabel = id ? `${tagName}#${id}` : tagName;
    issues.push(`${route}: ${controlLabel} missing accessible label`);
  }
}

for (const page of pageByRoute.values()) {
  const hrefs = [...page.html.matchAll(/\shref="([^"]+)"/g)].map(([, href]) => href);

  for (const href of hrefs) {
    if (isBlockedExternalLink(href)) {
      issues.push(`${page.route}: blocked stale external link ${href}`);
      continue;
    }

    if (shouldSkipHref(href)) {
      continue;
    }

    const resolved = new URL(href, `https://pipelab.org${page.route}`);
    if (resolved.origin !== "https://pipelab.org") {
      continue;
    }

    if (shouldSkipPath(resolved.pathname)) {
      continue;
    }

    const targetRoute = normalizeRoute(resolved.pathname);
    const target = pageByRoute.get(targetRoute);
    const targetFile = target ? target.file : fileForRoute(resolved.pathname);

    if (!target && !existsSync(targetFile)) {
      issues.push(`${page.route}: broken internal link ${href}`);
      continue;
    }

    if (resolved.hash) {
      const targetPage = target || pageByRoute.get(normalizeRoute(resolved.pathname));
      if (!targetPage) {
        continue;
      }

      const fragment = decodeURIComponent(resolved.hash.slice(1));
      if (!targetPage.ids.has(fragment)) {
        issues.push(`${page.route}: missing anchor ${resolved.hash} in ${normalizeRoute(resolved.pathname)}`);
      }
    }
  }
}

// The /proof/ sequence is generated from signed replay manifests. Its source
// template deliberately excludes incomplete records; check the rendered deck
// too, so a future template edit cannot turn that exclusion into a plausible
// one-scene proof surface.
const proofPage = pageByRoute.get("/proof/");
if (!proofPage) {
  issues.push("/proof/: recorded-decision page did not render");
} else {
  const deckMatch = proofPage.html.match(/<script\s+type="application\/json"\s+data-pseq-scenes>([\s\S]*?)<\/script>/i);
  if (!deckMatch) {
    issues.push("/proof/: recorded-decision deck data is missing");
  } else {
    try {
      const scenes = JSON.parse(deckMatch[1]);
      if (!Array.isArray(scenes) || scenes.length < 4) {
        issues.push("/proof/: recorded-decision deck has fewer than four complete scenes");
      } else if (scenes[0]?.id !== "secret-exfil-url-blocked") {
        issues.push("/proof/: recorded-decision deck lost its secret-exfil-url-blocked anchor scene");
      } else {
        const fields = ["id", "title", "without", "with", "shape", "verdict", "layer", "action_id", "target", "replay_url", "manifest_url", "verifier_command"];
        for (const [index, scene] of scenes.entries()) {
          if (!scene || scene.verdict !== "block" || fields.some((field) => typeof scene[field] !== "string" || !scene[field])) {
            issues.push(`/proof/: recorded-decision scene ${index + 1} is incomplete or not a block decision`);
            break;
          }
        }
      }
    } catch {
      issues.push("/proof/: recorded-decision deck data is not valid JSON");
    }
  }
}

// AEL is a standards surface maintained by PipeLab, not a Pipelock sales page
// or a grade PipeLab can award. Keep that trust boundary mechanical because the
// generic Learn template otherwise adds product calls to action automatically.
const aelSourcePath = path.join(repoRoot, "content", "learn", "agent-evidence-levels.md");
const aelSource = readFileSync(aelSourcePath, "utf8");
const aelPage = pageByRoute.get("/learn/agent-evidence-levels/");
if (!/^disable_cta:\s*true$/m.test(aelSource)) {
  issues.push("content/learn/agent-evidence-levels.md: AEL must disable the generic Pipelock article CTA");
}
if (!/^disable_title_fx:\s*true$/m.test(aelSource)) {
  issues.push("content/learn/agent-evidence-levels.md: AEL must keep its standards-page title stable");
}
if (!/^disable_related:\s*true$/m.test(aelSource)) {
  issues.push("content/learn/agent-evidence-levels.md: AEL must not inherit product-related guide cards");
}
if (!aelPage) {
  issues.push("/learn/agent-evidence-levels/: standards page did not render");
} else {
  if (/class="[^"]*\barticle-cta\b/i.test(aelPage.html)) {
    issues.push("/learn/agent-evidence-levels/: contains a product call-to-action block");
  }
  if (/class="[^"]*\blearn-related\b/i.test(aelPage.html)) {
    issues.push("/learn/agent-evidence-levels/: contains product-related guide cards");
  }
  const aelHtmlLower = aelPage.html.toLowerCase();
  for (const required of ["evaluated", "verification-record", "pipelock receives no special treatment", "/images/brand/ael-logo.svg"]) {
    if (!aelHtmlLower.includes(required)) {
      issues.push(`/learn/agent-evidence-levels/: missing trust-boundary content ${JSON.stringify(required)}`);
    }
  }
  if (!/governance (?:is not|isn(?:'|&rsquo;)t) independent yet/i.test(aelPage.html)) {
    issues.push('/learn/agent-evidence-levels/: missing trust-boundary content "governance is not independent yet"');
  }
  if (/<h1\b[^>]*data-fx="decrypt"/i.test(aelPage.html)) {
    issues.push("/learn/agent-evidence-levels/: standards-page title still uses the decrypt effect");
  }
}

const aelSocialSvg = path.join(repoRoot, "static", "images", "og", "og-agent-evidence-levels.svg");
const aelSocialPng = path.join(repoRoot, "static", "images", "og", "og-agent-evidence-levels.png");
const aelSocialSource = `${aelSocialPng}.source`;
for (const file of [aelSocialSvg, aelSocialPng, aelSocialSource, path.join(repoRoot, "static", "images", "brand", "ael-logo.svg")]) {
  if (!existsSync(file)) {
    issues.push(`${path.relative(repoRoot, file)}: missing AEL site identity asset`);
  }
}
if (existsSync(aelSocialSvg) && existsSync(aelSocialPng) && existsSync(aelSocialSource)) {
  const recorded = Object.fromEntries(
    readFileSync(aelSocialSource, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => line.split("=", 2)),
  );
  const sourceDigest = createHash("sha256").update(readFileSync(aelSocialSvg)).digest("hex");
  const rasterDigest = createHash("sha256").update(readFileSync(aelSocialPng)).digest("hex");
  if (recorded.source_sha256 !== sourceDigest || recorded.raster_sha256 !== rasterDigest) {
    issues.push("static/images/og/og-agent-evidence-levels.png: source or raster provenance is stale");
  }
}

// Project homes share one visual and machine-readable contract. A new project
// must not silently fall back to an article template or publish different copy
// to people and markdown consumers.
for (const [route, sourcePath] of [
  ["/agent-egress-bench/", path.join(repoRoot, "content", "agent-egress-bench.md")],
  ["/pipelock-rules/", path.join(repoRoot, "content", "pipelock-rules.md")],
  ["/learn/agent-evidence-levels/", aelSourcePath],
]) {
  const page = pageByRoute.get(route);
  const source = readFileSync(sourcePath, "utf8");
  if (!/^type:\s*project$/m.test(source) || !/^project_sections:$/m.test(source)) {
    issues.push(`${path.relative(repoRoot, sourcePath)}: project page must use the shared project type and section data`);
  }
  if (!page) continue;
  const hasProjectHero = [...page.html.matchAll(/\bclass="([^"]*)"/g)]
    .some(([, classes]) => classes.split(/\s+/).includes("project-hero"));
  if (!hasProjectHero || (page.html.match(/<h1\b/g) || []).length !== 1) {
    issues.push(`${route}: shared project hero or single h1 is missing`);
  }
  if (!/class="project-facts"[\s\S]*?license/i.test(page.html)) {
    issues.push(`${route}: project facts must disclose the license`);
  }
  const mirrorPath = markdownFileForRoute(route);
  const firstSectionTitle = source.match(/^\s+title:\s+"([^"]+)"$/m)?.[1];
  if (!existsSync(mirrorPath) || (firstSectionTitle && !readFileSync(mirrorPath, "utf8").includes(`## ${firstSectionTitle}`))) {
    issues.push(`${route}: markdown mirror does not carry the shared project section copy`);
  }
}
const benchProjectPage = pageByRoute.get("/agent-egress-bench/");
if (benchProjectPage && (!benchProjectPage.html.includes('class="bench-provenance"') || !benchProjectPage.html.includes("bench_source_commit"))) {
  // The rendered link carries the commit itself; the source token check keeps
  // this guard from accepting a hand-written floating date.
  const templateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "project", "single.html"), "utf8");
  if (!templateSource.includes('{{ partial "bench-provenance.html" . }}')) {
    issues.push("/agent-egress-bench/: pinned corpus counts need immutable commit provenance");
  }
}

// Commands share one clipboard contract. Project commands opt in directly;
// fenced shell blocks are upgraded by the common site script.
const projectTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "project", "single.html"), "utf8");
const siteBaseScriptSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "js", "site-base.js"), "utf8");
const projectStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_project-pages.scss"), "utf8");
const benchMarkSource = readFileSync(path.join(repoRoot, "static", "images", "brand", "agent-egress-bench-logo.svg"), "utf8");
if (!projectTemplateSource.includes("data-cmd-copy")) {
  issues.push("project pages: displayed commands must use the shared click-to-copy control");
}
if (projectTemplateSource.includes("project-command-copy") || />copy<\/span>/.test(projectTemplateSource)) {
  issues.push("project pages: command controls must not show a persistent copy label");
}
for (const language of ["language-bash", "language-sh", "language-shell"]) {
  if (!siteBaseScriptSource.includes(language)) {
    issues.push(`site commands: fenced ${language.replace("language-", "")} blocks are not upgraded with copy controls`);
  }
}
if (!siteBaseScriptSource.includes("data-code-copy") || !siteBaseScriptSource.includes("commandTextFrom(button.parentElement, code)")) {
  issues.push("site commands: the fenced-command clipboard handler is missing");
}
if (!siteBaseScriptSource.includes("data-command-lines") || !siteBaseScriptSource.includes("getAttribute('data-command-text')")) {
  issues.push("site commands: mixed terminal transcripts must copy explicit trusted command text");
}
if (siteBaseScriptSource.includes("line.match(/^\\s*\\$")) {
  issues.push("site commands: terminal output must never be classified as a command by its prompt-like text");
}
if (/\.project-detail-card::after[\s\S]{0,500}?(?:border-radius:\s*50%|box-shadow:\s*0\s+0\s+0)/.test(projectStyleSource)) {
  issues.push("project cards: one-off concentric-circle decoration returned; use the canonical PipeLab particle field");
}
if (!projectStyleSource.includes("pipelab-particle-field.svg")) {
  issues.push("project cards: canonical PipeLab particle field is missing");
}
if (/<rect\b[^>]*\bwidth=["']64["'][^>]*\bheight=["']64["']/.test(benchMarkSource)) {
  issues.push("benchmark project mark: the bare mark must not be boxed inside a background tile");
}

// Every h1-bearing template declares one hero contract. This keeps visual
// treatment intentional across product, editorial, and utility surfaces.
const brandStandardsSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_brand-standards.scss"), "utf8");
const pricingStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_pricing.scss"), "utf8");
const aboutStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_about.scss"), "utf8");
const contactStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_contact.scss"), "utf8");
const navTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "partials", "nav.html"), "utf8");
const aboutTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "about", "single.html"), "utf8");
const contactTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "contact", "single.html"), "utf8");
const contactScriptSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "js", "contact-form.js"), "utf8");
const heroContracts = [
  ["partials/hero-home.html", "home", false],
  ["project/single.html", "brand-standard", true],
  ["proof/single.html", "brand-standard", true],
  ["pricing/single.html", "brand-standard", true],
  ["gauntlet/list.html", "brand-standard", true],
  ["gauntlet/results.html", "brand-standard", true],
  ["about/single.html", "brand-standard", true],
  ["make-it-leak/list.html", "brand-standard", true],
  ["playground-replay/list.html", "brand-standard", true],
  ["pipelock/single.html", "brand-standard", true],
  ["playground/list.html", "brand-rich", false],
  ["assess/single.html", "brand-standard", true],
  ["enterprise/single.html", "brand-standard", true],
  ["_default/agent-firewall.html", "brand-rich", false],
  ["_default/install.html", "brand-rich", false],
  ["blog/list.html", "editorial-index", false],
  ["learn/list.html", "editorial-index", false],
  ["compare/list.html", "editorial-index", false],
  ["_default/list.html", "editorial-index", false],
  ["blog/single.html", "editorial-article", false],
  ["learn/single.html", "editorial-article", false],
  ["compare/single.html", "editorial-article", false],
  ["make-it-leak/single.html", "editorial-article", false],
  ["_default/single.html", "editorial-article", false],
  ["contact/single.html", "utility", false],
  ["gauntlet/submit.html", "utility", false],
  ["playground/single.html", "utility", false],
  ["receipt/list.html", "utility", false],
  ["receipt/single.html", "utility", false],
  ["404.html", "utility", false],
];
for (const [template, contract, standardHeight] of heroContracts) {
  const source = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", ...template.split("/")), "utf8");
  if (!source.includes(`data-hero="${contract}"`)) {
    issues.push(`${template}: expected data-hero="${contract}"`);
  }
  if (contract.startsWith("brand-") && !source.includes("brand-field-hero")) {
    issues.push(`${template}: branded hero must use the shared static constellation field`);
  }
  if (contract.startsWith("brand-") && !source.includes("site-hero")) {
    issues.push(`${template}: branded hero must use the shared site-hero structure`);
  }
  if (source.includes("brand-field-hero-standard") !== standardHeight) {
    issues.push(standardHeight
      ? `${template}: standard branded hero must use the shared responsive boundary`
      : `${template}: hero must not inherit the standard landing-page boundary`);
  }
  if (["editorial-index", "editorial-article", "utility"].includes(contract) && source.includes('data-fx="sky')) {
    issues.push(`${template}: quiet hero contracts must not use a generated sky`);
  }
}
for (const template of heroContracts.map(([template]) => template)) {
  const source = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", ...template.split("/")), "utf8");
  if (/<article\b[^>]*data-hero=/.test(source)) {
    issues.push(`${template}: data-hero belongs on the actual hero boundary, not the page article`);
  }
}
for (const template of ["blog/list.html", "learn/list.html", "compare/list.html"]) {
  const source = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", ...template.split("/")), "utf8");
  for (const sharedClass of ["editorial-index-inner", "editorial-index-eyebrow", "editorial-index-lead"]) {
    if (!source.includes(sharedClass)) {
      issues.push(`${template}: editorial index must use shared ${sharedClass} geometry`);
    }
  }
}
const pipelockTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "pipelock", "single.html"), "utf8");
if (/<header class="pipelock-hero[\s\S]*?pipelock-hero-architecture[\s\S]*?<\/header>/.test(pipelockTemplateSource)) {
  issues.push("pipelock/single.html: architecture must stay outside the responsive hero boundary");
}
const assessTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "assess", "single.html"), "utf8");
if (/<header class="assess-hero[\s\S]*?assess-twoq[\s\S]*?<\/header>/.test(assessTemplateSource)) {
  issues.push("assess/single.html: product explainer must stay outside the responsive hero boundary");
}
const enterpriseTemplateSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "enterprise", "single.html"), "utf8");
if (/<header class="enterprise-hero[\s\S]*?enterprise-hero-stats[\s\S]*?<\/header>/.test(enterpriseTemplateSource)) {
  issues.push("enterprise/single.html: evidence stats must stay outside the responsive hero boundary");
}
if (!/\.brand-field-hero-standard\s*\{[^}]*\bmin-height:\s*clamp\(32rem,\s*58svh,\s*37\.5rem\);/.test(brandStandardsSource)) {
  issues.push("brand standards: landing heroes must share the responsive desktop boundary");
}
if (!/\.brand-field-hero\s*\{[^}]*--brand-field-opacity:\s*\.72;[^}]*background:\s*var\(--bg\);/.test(brandStandardsSource)) {
  issues.push("brand standards: static constellation heroes must share one field opacity and base");
}
for (const sharedClass of ["editorial-index-inner", "editorial-index-eyebrow", "editorial-index-lead"]) {
  if (!brandStandardsSource.includes(`.${sharedClass}`)) {
    issues.push(`brand standards: missing shared ${sharedClass} contract`);
  }
}
const pipelockStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_pipelock-product.scss"), "utf8");
const pipelockContentSource = readFileSync(path.join(repoRoot, "content", "pipelock.md"), "utf8");
const sharedButtonStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_buttons.scss"), "utf8");
const sharedFxStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_fx.scss"), "utf8");
if (/\sstyle\s*=\s*["']/i.test(pipelockContentSource)) {
  issues.push("content/pipelock.md: inline styles bypass the shared Pipelock page treatment");
}
if (/\.pipelock-chapter\s*\{[\s\S]{0,320}?(?:width:\s*100vw|calc\(50%\s*-\s*50vw\))/.test(pipelockStyleSource)) {
  issues.push("pipelock page: chapters must stay on the responsive content rail");
}
if (!/\.btn\s*\{[\s\S]{0,260}?display:\s*inline-flex;[\s\S]{0,260}?align-items:\s*center;[\s\S]{0,260}?justify-content:\s*center;/.test(sharedButtonStyleSource)) {
  issues.push("shared buttons: .btn must center labels on both axes");
}
if (/--m[xy]\s*:|pointermove/.test(pipelockStyleSource)) {
  issues.push("pipelock page: cursor effects must use the shared data-fx spotlight implementation");
}
if (!/class="pipelock-evidence-visual"\s+data-fx="spotlight"/.test(pipelockContentSource)) {
  issues.push("pipelock page: the bounded evidence visual must use the shared spotlight effect");
}
if (!/class="pipelock-pro-band"[^>]*data-fx="[^"]*\bspotlight\b/.test(pipelockContentSource)) {
  issues.push("pipelock page: the Pro card must use the shared spotlight effect");
}
const spotlightExploreCards = pipelockContentSource.match(/class="pipelock-explore-card"\s+data-fx="spotlight"/g) || [];
if (spotlightExploreCards.length !== 3) {
  issues.push(`pipelock page: expected 3 spotlight explore cards, found ${spotlightExploreCards.length}`);
}
if (!/Named checks\. Fixed sequence\./.test(pipelockContentSource)) {
  issues.push("pipelock page: scanner section must describe named checks in a fixed sequence without a numeric layer claim");
}
// Derive the tag from hugo.toml rather than hardcoding it. A pinned literal
// here fails on every release bump, which makes the check read as a content
// error when the page is correct and the checker is the stale one.
// Parse the TOML rather than scanning it: a bare regex also matches a
// pipelock_version line sitting inside a multiline string or a comment, which
// is the same naive-scan mistake the capability checks already forbid.
let scannerDocVersion;
try {
  scannerDocVersion = parseToml(readFileSync(path.join(repoRoot, "hugo.toml"), "utf8"))?.params?.pipelock_version;
} catch (error) {
  issues.push(`pipelock page: hugo.toml is not valid TOML: ${error.message}`);
}
if (typeof scannerDocVersion !== "string" || !scannerDocVersion) {
  issues.push("pipelock page: cannot resolve pipelock_version to check the scanner order source link");
} else {
  const scannerDocHref = `href="https://github.com/pipelab-org/pipelock/blob/v${scannerDocVersion}/docs/security-assurance.md#ordered-url-scanner-pipeline"`;
  if (!pipelockContentSource.includes(scannerDocHref)) {
    issues.push("pipelock page: scanner order claim must link to its tagged source document");
  }
}
if (!/MCP<\/dt><dd>Separate message, tool, policy, and session controls<\/dd>/.test(pipelockContentSource)) {
  issues.push("pipelock page: transport rail must distinguish MCP controls from the ordered URL scanner");
}
for (const selector of ['[data-fx~="sky"]', '[data-fx~="scan"]']) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const occurrences = (sharedFxStyleSource.match(new RegExp(`${escapedSelector}\\s*\\{`, "g")) || []).length;
  if (occurrences !== 1) {
    issues.push(`shared effects: ${selector} must have one canonical definition, found ${occurrences}`);
  }
}
const fixedScannerCountPattern = /(?:\b(?:9|11|15|18)(?:-|\s+)(?:scanner\s+)?layers?\b|\beleven(?:-|\s+)layers?\b|\b(?:9|11|15|18) decision gates\b|\bscanner_layers\b|\bSSRF layer \(layer \d+\)|\bscanner pipeline layers? \d)/i;
const scannerClaimRoots = [
  path.join(repoRoot, "content"),
  path.join(repoRoot, "data"),
  path.join(repoRoot, ".brand"),
  path.join(repoRoot, "themes", "pipelab", "layouts"),
];
const historicalScannerCountExemptions = new Set([
  "content/blog/pipelock-v02-roadmap.md",
]);
for (const sourceRoot of scannerClaimRoots) {
  for (const file of walk(sourceRoot)) {
    if (historicalScannerCountExemptions.has(path.relative(repoRoot, file))) continue;
    if (!fixedScannerCountPattern.test(readFileSync(file, "utf8"))) continue;
    issues.push(`${path.relative(repoRoot, file)}: fixed scanner layer counts are stale; describe the ordered checks or DLP-before-DNS boundary`);
  }
}
const brandRendererSource = readFileSync(path.join(repoRoot, "scripts", "render_pipelab_brand.py"), "utf8");
if (fixedScannerCountPattern.test(brandRendererSource)) {
  issues.push("scripts/render_pipelab_brand.py: generated brand assets must not publish a fixed scanner layer count");
}
const siteFxSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "js", "site-fx.js"), "utf8");
if (!/pair\.el\.getBoundingClientRect\(\)\.top\s*\+\s*window\.scrollY/.test(siteFxSource)) {
  issues.push("pipelock page: mini-nav must compare section positions in document coordinates");
}
const approvedFxTokens = new Set(["count", "decrypt", "live", "mininav", "reveal", "scan", "sky", "spotlight", "tilt", "type"]);
for (const sourceRoot of [path.join(repoRoot, "content"), path.join(repoRoot, "themes", "pipelab", "layouts")]) {
  for (const file of walk(sourceRoot)) {
    if (![".html", ".md"].includes(path.extname(file))) continue;
    const source = readFileSync(file, "utf8");
    if (/data-fx=["'][^"']*\bpipe\b/.test(source)) {
      issues.push(`${path.relative(repoRoot, file)}: retired pipe effect must not return`);
    }
    if (/<[^>]*(?:class=["'][^"']*\bbtn\b[^"']*["'][^>]*data-fx=["'][^"']*\bspotlight\b|data-fx=["'][^"']*\bspotlight\b[^"']*["'][^>]*class=["'][^"']*\bbtn\b)[^>]*>/.test(source)) {
      issues.push(`${path.relative(repoRoot, file)}: shared spotlight belongs on card surfaces, not ordinary buttons`);
    }
    for (const match of source.matchAll(/data-fx=["']([^"']*)["']/g)) {
      if (match[1].includes("{{")) {
        issues.push(`${path.relative(repoRoot, file)}: data-fx tokens must be static and auditable`);
        continue;
      }
      for (const token of match[1].split(/\s+/).filter(Boolean)) {
        if (!approvedFxTokens.has(token)) {
          issues.push(`${path.relative(repoRoot, file)}: unknown data-fx token ${JSON.stringify(token)}`);
        }
      }
    }
  }
}
for (const staleModifier of ["brand-field-hero-soft", "brand-field-hero-proof"]) {
  if (brandStandardsSource.includes(staleModifier)) {
    issues.push(`brand standards: ${staleModifier} must not create a one-off field treatment`);
  }
}
if (!navTemplateSource.includes('data-current-section="true"') || !navTemplateSource.includes('aria-current="page"')) {
  issues.push("site navigation: grouped sections and exact destinations must expose the current route");
}
for (const menuMatch of navTemplateSource.matchAll(/<div class="nav-menu[^"]*" id="nav-menu-([^"]+)">([\s\S]*?)\n\s*<\/li>/g)) {
  const [, section, menuSource] = menuMatch;
  const destinations = [...menuSource.matchAll(/class="nav-menu-row" href="([^"]+)"/g)].map((match) => match[1]);
  for (const destination of destinations) {
    const page = pageByRoute.get(destination);
    if (!page) {
      issues.push(`site navigation: ${destination} has no rendered destination`);
      continue;
    }
    if (!page.html.includes(`class="nav-menu-row" href="${destination}" aria-current="page"`)) {
      issues.push(`site navigation: ${destination} must mark its exact menu row current`);
    }
    if (!page.html.includes(`aria-controls="nav-menu-${section}" data-current-section="true"`)) {
      issues.push(`site navigation: ${destination} must activate its ${section} section`);
    }
  }
}
for (const [template, source] of [["about/single.html", aboutTemplateSource], ["contact/single.html", contactTemplateSource]]) {
  const classNames = new Set([...source.matchAll(/class=["']([^"']*)["']/g)].flatMap((match) => match[1].split(/\s+/)));
  for (const sharedClass of ["site-link-endcap", "site-link-pill", "site-further-links"]) {
    if (!classNames.has(sharedClass)) {
      issues.push(`${template}: page close must use shared ${sharedClass} treatment`);
    }
  }
}
if (!contactTemplateSource.includes('resources.Get "js/contact-form.js"') || /<script>\s*\(function\s*\(\)/.test(contactTemplateSource)) {
  issues.push("contact/single.html: form behavior must stay in the fingerprinted contact-form asset");
}
if (!/<form[^>]+action="\/api\/contact"[^>]+method="post"/.test(contactTemplateSource)) {
  issues.push("contact/single.html: the form must retain a native POST fallback before deferred JavaScript loads");
}
const contactResetIndex = contactScriptSource.indexOf("resetTurnstile();");
const contactErrorParseIndex = contactScriptSource.indexOf("await response.json()");
if (contactResetIndex < 0 || contactErrorParseIndex < 0 || contactResetIndex > contactErrorParseIndex || !contactScriptSource.includes("typeof responseBody.error === 'string'")) {
  issues.push("contact form: every non-OK response must reset Turnstile before parsing an untrusted error body");
}
if (/\.about-intro\s*\{[\s\S]{0,700}?(?:radial-gradient|&::before)/.test(aboutStyleSource)) {
  issues.push("about page: the shared branded hero must not regain a page-specific glow layer");
}
if (/\.contact-hero\s*\{[\s\S]{0,500}?&::before/.test(contactStyleSource)) {
  issues.push("contact page: the utility hero must stay free of page-specific glow layers");
}
if (!/\.pricing-matrix-table-wrap\s*\{[\s\S]{0,320}?border:\s*0;[\s\S]{0,320}?box-shadow:\s*none;/.test(pricingStyleSource)) {
  issues.push("pricing matrix: the comparison ledger must not regain outer card chrome");
}
const pricingContentSource = readFileSync(path.join(repoRoot, "content", "pricing.md"), "utf8");
const proBridgeIndex = pricingContentSource.indexOf('class="pricing-tier-bridge">Keep the full free engine');
const foundingMeterIndex = pricingContentSource.indexOf("{{< founding-seats >}}");
if (proBridgeIndex < 0 || foundingMeterIndex < 0 || proBridgeIndex > foundingMeterIndex) {
  issues.push("pricing plans: Pro summary must align with Community before the founding meter");
}
for (const staleBackground of ["afw-hero-bg", "inst-hero-bg"]) {
  if (readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", `_${staleBackground.replace("-hero-bg", "").replace("afw", "agent-firewall").replace("inst", "install-page")}.scss`), "utf8").includes(`.${staleBackground}`)) {
    issues.push(`brand standards: ${staleBackground} must not restore a page-specific hero background`);
  }
}
if (/\.pricing-tier::before\s*\{/m.test(pricingStyleSource)) {
  issues.push("pricing cards: retired tier-name counter styles must not return");
}
if (/\.pricing-promise\s*\{[\s\S]{0,800}?content:\s*['"]◆['"]/.test(pricingStyleSource)) {
  issues.push("pricing page: retired center-connector diamond must not return");
}

// The homepage orbit keeps moving under a pointer. Keyboard focus still pauses
// it so a moving link does not fight keyboard activation.
const orbitScriptSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "js", "integration-orbit.js"), "utf8");
const homeStyleSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "scss", "_home.scss"), "utf8");
const worksWithSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "partials", "works-with.html"), "utf8");
const autoGenMarkSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "partials", "brands", "autogen.svg"), "utf8");
if (/\bhovered\b|addEventListener\(['"]mouse(?:enter|leave)/.test(orbitScriptSource) || /\.hp-orbit:hover[\s,]/.test(homeStyleSource)) {
  issues.push("homepage orbit: pointer hover must not pause orbital motion");
}
if (!orbitScriptSource.includes("focusedNodes.size > 0")) {
  issues.push("homepage orbit: keyboard focus must retain a stable activation target");
}
if (!orbitScriptSource.includes("pointerenter") || !orbitScriptSource.includes("syncHighlight") ||
    !worksWithSource.includes('class="hp-orbit-thread" style="--brand: {{ .color }};"')) {
  issues.push("homepage orbit: integration focus must trace one brand-colored path");
}
if (!worksWithSource.includes('$brandColorPattern := `^#[0-9A-Fa-f]{6}$`') ||
    !worksWithSource.includes('has invalid brand color')) {
  issues.push("homepage orbit: integration colors must be validated before entering style attributes");
}
const orbitRectIndex = orbitScriptSource.indexOf("rect = orbit.getBoundingClientRect()");
const orbitHiddenGuardIndex = orbitScriptSource.indexOf("if (!rect.width || !rect.height)");
const orbitPhaseIndex = orbitScriptSource.indexOf("phase: Math.atan2");
if (orbitRectIndex < 0 || orbitHiddenGuardIndex < orbitRectIndex || orbitPhaseIndex < orbitHiddenGuardIndex) {
  issues.push("homepage orbit: hidden mobile layout must stop before zero-sized orbital math");
}
if (!orbitScriptSource.includes("'ResizeObserver' in window") || !orbitScriptSource.includes("if (visible && !rect)")) {
  issues.push("homepage orbit: zero-sized layout must remeasure before motion resumes");
}
if (!worksWithSource.includes('data-brand="{{ . }}"') || !/<svg\b[\s\S]*<path\b/.test(autoGenMarkSource)) {
  issues.push("homepage orbit: AutoGen must render its official mark with the shared brand hook");
}

// Every rendered runnable command must opt into the shared clipboard control.
// Lines beginning `pipelock:` are program output, not commands.
for (const page of pageByRoute.values()) {
  for (const match of page.html.matchAll(/<pre([^>]*)>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g)) {
    const text = decodeHtml(match[3].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    const isCommand = /^(?:\$\s|pipelock(?:-verifier|-verify)?(?=\s|$)(?!\s*:)|curl\b|git clone\b|\.\/aeb-gauntlet\b)/.test(text);
    const commandLines = /\bdata-command-lines\b/.test(match[1]);
    const hasCopyContract = /\bdata-command(?:-lines)?\b/.test(match[1]) || /\blanguage-(?:bash|sh|shell)\b/.test(match[2]);
    if (commandLines && !/\bdata-command-text=["'][^"']+["']/.test(match[1])) {
      issues.push(`${page.route}: mixed terminal block is missing explicit trusted command text`);
    }
    if (isCommand && !hasCopyContract) {
      issues.push(`${page.route}: runnable command block is missing the shared copy contract: ${text.slice(0, 72)}`);
    }
  }
}

for (const [value, owners] of titleOwners.entries()) {
  if (owners.length > 1) {
    issues.push(`duplicate <title>: ${owners.join(", ")} -> ${value}`);
  }
}

for (const [value, owners] of descriptionOwners.entries()) {
  if (owners.length > 1) {
    issues.push(`duplicate meta description: ${owners.join(", ")} -> ${value}`);
  }
}

const compareFiles = walk(path.join(repoRoot, "content", "compare"))
  .filter((file) => isAuditedContentFile(file) && !file.endsWith("_index.md"));
for (const file of compareFiles) {
  const source = readFileSync(file, "utf8");
  if (!/^reviewed:\s*".+"/m.test(source)) {
    issues.push(`${path.relative(repoRoot, file)}: missing reviewed frontmatter`);
  }
}

const contentFiles = walk(path.join(repoRoot, "content"))
  .filter((file) => isAuditedContentFile(file));
for (const file of contentFiles) {
  const source = readFileSync(file, "utf8");
  if (/style="[^"]*grid-template-columns\s*:/i.test(source)) {
    issues.push(`${path.relative(repoRoot, file)}: inline grid-template-columns style; use shared grid classes`);
  }
}

// Shared source-build instructions follow the released README. Historical posts
// retain their original bodies behind an explicit installation correction.
issues.push(...auditInstallContract({
  repoRoot,
  contentFiles,
  templateFiles: walk(path.join(repoRoot, "themes", "pipelab", "layouts")).filter(file => /\.(html|xml|md)$/.test(file)),
  version: parseToml(readFileSync(path.join(repoRoot, "hugo.toml"), "utf8"))?.params?.pipelock_version,
}));

const contentPageByRoute = new Map();
const inboundContentLinks = new Map();

for (const file of contentFiles) {
  const route = contentRouteFromFile(file);
  if (!route) {
    continue;
  }

  contentPageByRoute.set(route, file);
  inboundContentLinks.set(route, new Set());
}

for (const file of contentFiles) {
  const sourceRoute = contentRouteFromFile(file);
  if (!sourceRoute) {
    continue;
  }

  const source = stripFrontMatter(readFileSync(file, "utf8"));
  const hrefs = extractContentLinks(source);
  const recordedTargets = new Set();

  for (const href of hrefs) {
    if (href.startsWith("#") || shouldSkipHref(href)) {
      continue;
    }

    const resolved = new URL(href, `https://pipelab.org${sourceRoute}`);
    if (resolved.origin !== "https://pipelab.org" || shouldSkipPath(resolved.pathname)) {
      continue;
    }

    const targetRoute = normalizeContentRoute(resolved.pathname);
    if (!contentPageByRoute.has(targetRoute) || targetRoute === sourceRoute || recordedTargets.has(targetRoute)) {
      continue;
    }

    inboundContentLinks.get(targetRoute)?.add(sourceRoute);
    recordedTargets.add(targetRoute);
  }
}

for (const section of ["learn", "compare"]) {
  const sectionFiles = walk(path.join(repoRoot, "content", section))
    .filter((file) => isAuditedContentFile(file) && !file.endsWith("_index.md"));

  for (const file of sectionFiles) {
    const route = contentRouteFromFile(file);
    const sources = [...(inboundContentLinks.get(route) || new Set())].sort();
    if (sources.length < 2) {
      const sourceList = sources.length > 0 ? sources.join(", ") : "none";
      issues.push(`${path.relative(repoRoot, file)}: only ${sources.length} inbound content link(s); found ${sourceList}`);
    }
  }
}

for (const [route, file] of contentPageByRoute.entries()) {
  const sourceFile = readFileSync(file, "utf8");
  if (matchFrontMatter(sourceFile, "draft") === "true") {
    continue;
  }
  const mirrorFile = markdownFileForRoute(route);
  if (!existsSync(mirrorFile)) {
    issues.push(`${path.relative(repoRoot, file)}: missing markdown mirror at ${path.relative(repoRoot, mirrorFile)}`);
    continue;
  }

  const sourceBody = stripFrontMatter(sourceFile).trim();
  if (!sourceBody) {
    continue;
  }

  const mirror = readFileSync(mirrorFile, "utf8");

  // Mirrors render shortcodes rather than copying the body verbatim, because a
  // mirror is what an AI agent reads and `{{< install-cmd go >}}` tells it nothing.
  // The guarantee is still that no content was dropped or reordered: every stretch
  // of body text between shortcode calls must appear in the mirror, in order. A
  // page with no shortcodes reduces to the original whole-body comparison.
  const shortcodeCall = /\{\{[<%][\s\S]*?[>%]\}\}/g;
  const segments = sourceBody
    .split(shortcodeCall)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let cursor = 0;
  let missingSegment = null;
  for (const segment of segments) {
    const at = mirror.indexOf(segment, cursor);
    if (at === -1) {
      missingSegment = segment;
      break;
    }
    cursor = at + segment.length;
  }

  // A mirror that still carries shortcode syntax is worse than useless to the
  // machine readers it exists for, so it fails outright.
  if (/\{\{[<%]/.test(mirror)) {
    issues.push(`${path.relative(repoRoot, file)}: markdown mirror contains unrendered shortcode syntax; the mirror template must use .RenderShortcodes`);
  }

  if (missingSegment) {
    issues.push(`${path.relative(repoRoot, file)}: markdown mirror does not preserve the page body (missing text near "${missingSegment.slice(0, 60).replace(/\s+/g, " ")}")`);
  }
}

const privacy = readFileSync(path.join(repoRoot, "content", "privacy.md"), "utf8");
const hugoConfig = readFileSync(path.join(repoRoot, "hugo.toml"), "utf8");
const baseTemplate = readFileSync(path.join(repoRoot, "themes", "pipelab", "layouts", "_default", "baseof.html"), "utf8");
const siteBaseSource = readFileSync(path.join(repoRoot, "themes", "pipelab", "assets", "js", "site-base.js"), "utf8");
const pipelockPage = readFileSync(path.join(repoRoot, "content", "pipelock.md"), "utf8");
if (/<div class="pipelock-ci-grid">[\s\S]*?<\/section>\s*---\s*<!--[\s\S]*?AGENT EGRESS CONTROL/.test(pipelockPage)) {
  issues.push("content/pipelock.md: Markdown dividers must not become extra CI grid items");
}
if (!pipelockTemplateSource.includes('<span class="pipelock-category">Open-source agent firewall</span>')) {
  issues.push("pipelock hero: visible category line must identify Pipelock as an open-source agent firewall");
}
if (/^subtitle:\s*"The open-source agent firewall/m.test(pipelockPage)) {
  issues.push("content/pipelock.md: hero lead must not repeat the visible product category line");
}
const securityTxt = readFileSync(path.join(repoRoot, "static", ".well-known", "security.txt"), "utf8");
const enabledTrackers = [];
// Same rule as the scanner-order check above: parse the TOML. This value drives
// every current-version claim in the audit, so a decoy pipelock_version inside a
// multiline string or comment would make all of them assert the wrong version.
const currentVersion = parseToml(hugoConfig)?.params?.pipelock_version;

if (/google_analytics\s*=/.test(hugoConfig) && /Google Analytics/.test(privacy) === false) {
  enabledTrackers.push("Google Analytics");
}
if (/posthog\s*=/.test(hugoConfig) && /PostHog/.test(privacy) === false) {
  enabledTrackers.push("PostHog");
}
if (/analytics\.ahrefs\.com/.test(baseTemplate + siteBaseSource) && /Ahrefs/.test(privacy) === false) {
  enabledTrackers.push("Ahrefs Web Analytics");
}

if (enabledTrackers.length > 0) {
  issues.push(`content/privacy.md: missing tracker disclosure for ${enabledTrackers.join(", ")}`);
}

const expiresRaw = match(securityTxt, /^Expires:\s*(.+)$/m);
if (!expiresRaw) {
  issues.push(`static/.well-known/security.txt: missing Expires field`);
} else {
  const expiresAt = Date.parse(expiresRaw);
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(expiresAt)) {
    issues.push(`static/.well-known/security.txt: invalid Expires timestamp`);
  } else if (expiresAt <= Date.now()) {
    issues.push(`static/.well-known/security.txt: Expires timestamp is in the past`);
  } else if ((expiresAt - Date.now()) >= oneYearMs) {
    issues.push(`static/.well-known/security.txt: Expires must be less than one year out`);
  }
}

if (currentVersion) {
  const versionNeedle = `v${currentVersion}`;
  const demoFiles = [
    "static/assess/demo-summary/index.html",
    "static/assess/demo-egress-report/index.html",
    "static/assess/demo-assessment/index.html",
  ];

  issues.push(...auditDemoVersions(repoRoot, currentVersion, demoFiles));

  if (!pipelockPage.includes(`pipelab-org/pipelock@${versionNeedle}`)) {
    issues.push(`content/pipelock.md: missing GitHub Action version ${versionNeedle}`);
  }

  // Checked against the RENDERED page rather than the source, because the install
  // commands are no longer hand-written into content/pipelock.md. They render from
  // data/install.yaml with the release version substituted in, so the source
  // legitimately has no version literal while the published page must still carry
  // the right one. Reading the rendered output also verifies the substitution
  // actually happened rather than trusting that it would.
  const renderedPipelockPage = pageByRoute.get("/pipelock/");
  if (!renderedPipelockPage) {
    issues.push("content/pipelock.md: product page did not render, cannot verify the Docker image version");
  } else if (!renderedPipelockPage.html.includes(`ghcr.io/luckypipewrench/pipelock:${currentVersion}`)) {
    issues.push(`/pipelock: rendered page missing Docker image version ${currentVersion}`);
  }
}

const playgroundDemoIndex = path.join(repoRoot, "static/playground/demo/index.html");
if (existsSync(playgroundDemoIndex)) {
  const demoHtml = readFileSync(playgroundDemoIndex, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  for (const match of demoHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    const type = (attr(`<script${attributes}>`, "type") || "").toLowerCase();
    const isDataBlock = type === "application/json" || type === "application/ld+json";
    if (!/\ssrc=("[^"]+"|'[^']+')/i.test(attributes) && !isDataBlock) {
      issues.push("static/playground/demo/index.html: executable inline script is blocked by the demo CSP");
    }
  }
}

// BuildHop frames /buildhop/, which in turn frames the replay. CSP evaluates
// every ancestor, so both framed routes must allow the same narrow BuildHop
// origins. The launch page must also load the replay instead of swapping it for
// a fallback merely because it is framed.
const buildHopPage = pageByRoute.get("/buildhop/");
if (!buildHopPage) {
  issues.push("/buildhop/: launch page did not render");
} else if (!/<iframe\b[^>]*\ssrc="\/playground\/demo\/"/i.test(buildHopPage.html)) {
  issues.push("/buildhop/: interactive replay iframe is not loaded in the launch viewer");
} else if (
  !buildHopPage.html.includes('href="https://verifieddr.com/website/pipelab-org"') ||
  !buildHopPage.html.includes('src="https://verifieddr.com/badge/pipelab-org-dark.svg?style=minimal&amp;metric=truedr"')
) {
  issues.push("/buildhop/: VerifiedDR badge is missing or uses the wrong verification URL");
}

for (const page of pageByRoute.values()) {
  if (
    page.html.includes("data-receipt-constellation") &&
    !/<script\b[^>]*\bsrc="\/js\/receipt-constellation\.[^"]+\.js"/i.test(page.html)
  ) {
    issues.push(`${page.route}: receipt constellation markup rendered without its script`);
  }
}

const integrationData = parseYaml(readFileSync(path.join(repoRoot, "data", "integrations.yaml"), "utf8"));
for (const entry of integrationData.orbit.filter((item) => item.kind !== "protocol" && item.href.startsWith("/learn/"))) {
  const route = entry.href;
  const html = pageByRoute.get(route)?.html || "";
  const header = html.match(/<header\b[^>]*class="learn-article-header"[^>]*>([\s\S]*?)<\/header>/)?.[1] || "";
  if ((header.match(/data-integration-mark=/g) || []).length !== 1 || !/<(?:svg|img)\b/.test(header)) {
    issues.push(`${route}: integration guide header must render one official mark`);
  }
}
// Every learn header that renders an integration mark sets it beside the title.
for (const [route, page] of pageByRoute) {
  if (!route.startsWith("/learn/")) continue;
  const header = page.html.match(/<header\b[^>]*class="learn-article-header"[^>]*>([\s\S]*?)<\/header>/)?.[1] || "";
  if (header.includes("data-integration-mark=") && !header.includes("learn-article-header-inner--mark-inline")) {
    issues.push(`${route}: learn header renders an integration mark without the beside-title layout`);
  }
  if (header.includes("learn-article-header-inner--mark-inline") && !header.includes("learn-project-mark")) {
    issues.push(`${route}: learn header uses the beside-title layout without a mark`);
  }
}

const homePage = pageByRoute.get("/");
if (!homePage) {
  issues.push("/: homepage did not render, cannot verify receipt-star total");
} else if (!homePage.html.includes(`<span data-constellation-receipts>${replayReceiptTotal}</span>`)) {
  issues.push(`/: rendered receipt-star total does not match ${replayReceiptTotal} replay manifest records`);
}
for (const marker of ['class="hp-stats-section"', 'class="hp-cncf"', 'class="hp-section"', 'class="hp-cta-row"']) {
  if (homePage && !homePage.html.includes(marker)) {
    issues.push(`/: original homepage content is missing ${marker}`);
  }
}
if (homePage && !/<section\b[^>]*class="hp-hero receipt-constellation-ambient"[^>]*data-hero="home"[^>]*data-receipt-constellation/.test(homePage.html)) {
  issues.push('/: receipt visualization must remain the homepage hero particle field');
}
for (const marker of ['data-constellation-status-text', 'data-constellation-browser', 'data-detail-previous', 'data-detail-next', 'data-detail-position']) {
  if (homePage && !homePage.html.includes(marker)) {
    issues.push(`/: receipt HUD is missing ${marker}`);
  }
}
if (homePage && !/data-constellation-detail[^>]*class="[^"]*ph-no-capture|class="[^"]*ph-no-capture[^"]*"[^>]*data-constellation-detail/.test(homePage.html)) {
  issues.push("/: receipt details must stay blocked from session replay capture");
}
if (homePage && !/data-constellation-browser[^>]*class="[^"]*ph-no-capture|class="[^"]*ph-no-capture[^"]*"[^>]*data-constellation-browser/.test(homePage.html)) {
  issues.push("/: receipt browser must stay blocked from session replay capture");
}
if (homePage && !/data-constellation-status[^>]*class="[^"]*ph-no-capture|class="[^"]*ph-no-capture[^"]*"[^>]*data-constellation-status/.test(homePage.html)) {
  issues.push("/: receipt status must stay blocked from session replay capture");
}
for (const marker of ["data-detail-replay", "data-detail-manifest"]) {
  const privateControl = new RegExp(`${marker}[^>]*data-analytics-private|data-analytics-private[^>]*${marker}`);
  if (homePage && !privateControl.test(homePage.html)) {
    issues.push(`/: ${marker} must opt out of generic path and link-text analytics`);
  }
}

const playgroundPage = pageByRoute.get("/playground/");
if (!playgroundPage) {
  issues.push("/playground/: page did not render, cannot verify receipt visualization placement");
} else if (playgroundPage.html.includes("data-receipt-constellation")) {
  issues.push("/playground/: receipt visualization must stay in the homepage particle field, not a second boxed constellation");
}
if (playgroundPage && !playgroundPage.html.includes('href="/playground/replay/"')) {
  issues.push("/playground/: live demo must link to the durable replay archive");
}

const replayArchivePage = pageByRoute.get("/playground/replay/");
if (!replayArchivePage) {
  issues.push("/playground/replay/: durable replay archive did not render");
}
const renderedPipelockPage = pageByRoute.get("/pipelock/");
if (!renderedPipelockPage || !renderedPipelockPage.html.includes('href="/playground/replay/"')) {
  issues.push("/pipelock/: signed replay archive CTA is missing or points to the live Playground");
}
if (renderedPipelockPage) {
  const miniNavSource = pipelockTemplateSource.match(/<nav class="pipelock-mini-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const miniNavTargets = [...miniNavSource.matchAll(/href="#([a-z0-9-]+)"/g)].map((match) => match[1]);
  if (miniNavTargets.length === 0) {
    issues.push("pipelock/single.html: mini-nav has no auditable fragment targets");
  }
  for (const target of miniNavTargets) {
    const targetCount = [...renderedPipelockPage.html.matchAll(new RegExp(`\\bid=["']${target}["']`, "g"))].length;
    if (targetCount !== 1) {
      issues.push(`/pipelock/: mini-nav target #${target} must resolve exactly once, found ${targetCount}`);
    }
  }

  const copyButtons = [...renderedPipelockPage.html.matchAll(/<button\b([^>]*)\bdata-cmd-copy\b([^>]*)>([\s\S]*?)<\/button>/g)];
  if (copyButtons.length === 0) {
    issues.push("/pipelock/: rendered page has no copyable command controls");
  }
  for (const [, beforeCopyAttr, afterCopyAttr, body] of copyButtons) {
    const attributes = `${beforeCopyAttr} ${afterCopyAttr}`;
    if (!/\baria-label=["'][^"']+["']/.test(attributes)) {
      issues.push("/pipelock/: copyable command control is missing an accessible label");
    }
    const commandMatch = body.match(/<span\b[^>]*class=["'][^"']*\bcmd-text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/);
    const commandText = commandMatch ? decodeHtml(commandMatch[1].replace(/<[^>]*>/g, " ")).trim() : "";
    if (!commandText) {
      issues.push("/pipelock/: copyable command control is missing non-empty .cmd-text");
    }
  }
}
const redirectsSource = readFileSync(path.join(repoRoot, "static/_redirects"), "utf8");
for (const scenarioId of replayScenarioIds) {
  const oldRoute = `/playground/${scenarioId}/`;
  const newRoute = `/playground/replay/${scenarioId}/`;
  if (pageByRoute.has(oldRoute)) {
    issues.push(`${oldRoute}: stale scenario page rendered instead of redirecting to the replay archive`);
  }
  const replayPage = pageByRoute.get(newRoute);
  if (!replayPage) {
    issues.push(`${newRoute}: replay archive scenario did not render`);
  } else {
    if (!replayPage.html.includes(`<link rel="canonical" href="https://pipelab.org${newRoute}">`)) {
      issues.push(`${newRoute}: canonical URL does not use the replay archive route`);
    }
    if (!replayPage.html.includes(`data-manifest="/playground-replay/${scenarioId}/manifest.json"`)) {
      issues.push(`${newRoute}: signed packet asset paths changed or disappeared`);
    }
  }
  for (const [oldSuffix, newSuffix] of [
    ["", "/"],
    ["/", "/"],
    ["/index.html", "/"],
    ["/index.md", "/index.md"],
  ]) {
    const redirect = `/playground/${scenarioId}${oldSuffix} /playground/replay/${scenarioId}${newSuffix} 301`;
    if (!redirectsSource.includes(redirect)) {
      issues.push(`static/_redirects: missing permanent replay move ${redirect}`);
    }
  }
}

const constellationSource = readFileSync(path.join(repoRoot, "themes/pipelab/assets/js/receipt-constellation.js"), "utf8");
const constellationStyle = readFileSync(path.join(repoRoot, "themes/pipelab/assets/scss/_receipt-constellation.scss"), "utf8");
const variablesStyle = readFileSync(path.join(repoRoot, "themes/pipelab/assets/scss/_variables.scss"), "utf8");
const styleManifest = readFileSync(path.join(repoRoot, "themes/pipelab/assets/scss/style.scss"), "utf8");
const baseTemplateSource = readFileSync(path.join(repoRoot, "themes/pipelab/layouts/_default/baseof.html"), "utf8");
const commercialAnalyticsSource = [
  "content/pricing.md",
  "content/pipelock.md",
  "themes/pipelab/layouts/assess/single.html",
].map((file) => readFileSync(path.join(repoRoot, file), "utf8")).join("\n");
const gauntletResultsSource = readFileSync(path.join(repoRoot, "themes/pipelab/layouts/gauntlet/results.html"), "utf8");
const gauntletResultsStyle = readFileSync(path.join(repoRoot, "themes/pipelab/assets/scss/_gauntlet.scss"), "utf8");
const sourceSection = (start, end) => {
  const startAt = constellationSource.indexOf(start);
  const endAt = constellationSource.indexOf(end, startAt + start.length);
  return startAt >= 0 && endAt > startAt ? constellationSource.slice(startAt, endAt) : "";
};
const particleFactorySource = sourceSection("const newParticle", "const syncDust");
const densitySource = sourceSection("const syncDust", "const particles");
const motionSource = sourceSection("const updateParticle", "const drawMesh");
const meshSource = sourceSection("const drawMesh", "const drawPointer");
const receiptDrawSource = sourceSection("const drawReceipt", "function draw");
const fieldDrawSource = sourceSection("function draw", "const animate");
const receiptAnalyticsSource = sourceSection("const receiptAnalyticsEvents", "const field");
const detailSource = sourceSection("const showDetail", "const closeDetail");
for (const [label, source, pattern] of [
  ["adaptive 30–90 density", densitySource, /Math\.max\(\s*30\s*,\s*Math\.min\(\s*90\s*,\s*Math\.round\(\s*\(\s*width\s*\*\s*height\s*\)\s*\/\s*24000\s*\)\s*\)\s*\)/],
  ["0.7–3.7px circular particles", particleFactorySource, /Math\.random\(\)\s*\*\s*3\s*\+\s*0\.7/],
  ["150px proximity mesh", meshSource, /distance\s*>=\s*150/],
  ["mesh opacity", meshSource, /\(1\s*-\s*distance\s*\/\s*150\)\s*\*\s*0\.22/],
  ["time-normalized pointer pull", motionSource, /\(1\s*-\s*distance\s*\/\s*190\)\s*\*\s*0\.004\s*\*\s*step/],
  ["time-normalized velocity damping", motionSource, /Math\.pow\(0\.985,\s*step\)[\s\S]*particle\.vx\s*\*=\s*damping[\s\S]*particle\.vy\s*\*=\s*damping/],
  ["minimum drift threshold", motionSource, /speed\s*<\s*0\.08/],
  ["time-normalized drift jitter", motionSource, /0\.04\s*\*\s*Math\.sqrt\(step\)/],
  ["speed ceiling", motionSource, /speed\s*>\s*0\.75[\s\S]*\*\s*0\.75/],
  ["time-normalized position update", motionSource, /particle\.x\s*\+=\s*particle\.vx\s*\*\s*step[\s\S]*particle\.y\s*\+=\s*particle\.vy\s*\*\s*step/],
  ["circular receipt draw", receiptDrawSource, /context\.arc\(\s*particle\.x\s*,\s*particle\.y\s*,\s*radius/],
  ["receipt radius", receiptDrawSource, /const\s+radius\s*=\s*touchRadius\s*\+\s*\(verdict\s*===\s*'block'\s*\?\s*0\.8\s*:\s*0\)/],
  ["warning palette", constellationSource, /warn:\s*'#f59e0b'/],
  ["block palette", constellationSource, /block:\s*'#ff4d4d'/],
  ["session-anchor palette", receiptDrawSource, /rgba\(255,\s*213,\s*74,/],
  ["dashboard particle brightness", fieldDrawSource, /rgba\(0,\s*229,\s*160,\s*0\.5\)/],
]) {
  if (!pattern.test(source)) {
    issues.push(`receipt constellation: ${label} is missing from its rendering stage`);
  }
}
if (/context\.(?:rect|fillRect|shadowBlur|createRadialGradient)|\b(?:receiptOrbit|orbitAngle|homeX|homeY|spring)\b/.test(constellationSource)) {
  issues.push("receipt constellation: fixed glyph, glow, orbit, or spring behavior returned");
}
if (/\b(?:home|target|anchor)[XY]\s*:/i.test(particleFactorySource) || /particle\.(?:home|target|anchor)[XY]/i.test(constellationSource)) {
  issues.push("receipt constellation: particles must free-drift without fixed home, target, or anchor coordinates");
}
if (/context\.(?:moveTo|lineTo|rect|fillRect)|shadowBlur|createRadialGradient/.test(receiptDrawSource)) {
  issues.push("receipt constellation: receipt particles must remain tiny circles");
}
if (!/if\s*\(browser\)\s*browser\.open\s*=\s*false/.test(constellationSource) || !/if\s*\(browser\.open\)\s*closeDetail\(\)/.test(constellationSource)) {
  issues.push("receipt constellation: the star detail and receipt browser must remain mutually exclusive");
}
if (!/\.hp-receipt-status[\s\S]*?&\[hidden\]\s*\{\s*display:\s*none;/.test(constellationStyle)) {
  issues.push("receipt constellation: the receipt HUD must honor its hidden loading/failure state");
}
if (!/@media\s*\(max-width:\s*\$bp-mobile\)[\s\S]*?&\.hp-hero\s*\{\s*padding-bottom:\s*6rem;/.test(constellationStyle)) {
  issues.push("receipt constellation: mobile controls must use the shared site breakpoint and reserve hero space");
}
if (!/\.hp-receipt-detail\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?max-height:\s*72dvh;/.test(constellationStyle)) {
  issues.push("receipt constellation: mobile receipt detail must remain a viewport-fixed, dynamically sized sheet");
}
if (!/--bp-mobile:\s*#\{\$bp-mobile\};/.test(variablesStyle)) {
  issues.push("theme variables: the shared mobile breakpoint must be exported to browser scripts");
}
if (!/getPropertyValue\('--bp-mobile'\)/.test(constellationSource) || !/getPropertyValue\('--bp-mobile'\)/.test(siteBaseSource)) {
  issues.push("mobile interactions: constellation and navigation must consume the shared CSS breakpoint");
}
if (!/link\.hasAttribute\('data-analytics-private'\)[\s\S]*?return;/.test(siteBaseSource)) {
  issues.push("site analytics: private evidence links must bypass generic path and link-text capture");
}
if (!/link\.hasAttribute\('data-event'\)[\s\S]*?return;/.test(siteBaseSource)) {
  issues.push("site analytics: explicitly named events must not also emit generic click events");
}
const directPosthogCaptures = [...siteBaseSource.matchAll(/window\.posthog\.capture\(/g)];
if (directPosthogCaptures.length || !/var captureEvent[\s\S]*?window\.posthogReady\(function \(posthog\)/.test(siteBaseSource)) {
  issues.push("site analytics: click events must use posthogReady so the first lazy-load interaction is queued");
}
if (/event\.preventDefault\(\)[\s\S]*?event_callback[\s\S]*?window\.location\.assign/.test(siteBaseSource)) {
  issues.push("site analytics: measurement must not delay or replace native link navigation");
}
for (const tag of ["<title>{{ $displayTitle }}</title>", 'property="og:title" content="{{ $displayTitle }}"', 'name="twitter:title" content="{{ $displayTitle }}"']) {
  if (!baseTemplateSource.includes(tag)) {
    issues.push("site metadata: search, Open Graph, and Twitter titles must share the seoTitle-aware display title");
    break;
  }
}
for (const checkout of commercialAnalyticsSource.matchAll(/<a\b[^>]*href="(?:\{\{ \$polarUrl \}\}|https:\/\/buy\.polar\.sh\/)[^>]*>/g)) {
  if (!/data-event="checkout_started"/.test(checkout[0]) || !/data-event-value="[a-z0-9_]+"/.test(checkout[0])) {
    issues.push("commercial analytics: every Polar checkout link must use checkout_started with a stable offer value");
  }
}
const homeImportAt = styleManifest.indexOf("@import 'home';");
const constellationImportAt = styleManifest.indexOf("@import 'receipt-constellation';");
if (homeImportAt < 0 || constellationImportAt < homeImportAt) {
  issues.push("theme styles: receipt constellation must load after home so mobile control spacing wins equal specificity");
}
if (!/\[reducedMotionQuery,\s*mobileFieldQuery\][\s\S]*?addEventListener\('change',\s*syncMotionMode\)/.test(constellationSource)) {
  issues.push("receipt constellation: motion mode must react to rotation and reduced-motion changes");
}
if (!/event\.pointerType\s*===\s*'touch'/.test(constellationSource)) {
  issues.push("receipt constellation: touch scrolling must not apply pointer gravity");
}
if (/touch-action:\s*pan-y/.test(constellationStyle)) {
  issues.push("receipt constellation: the star field must not disable pinch zoom");
}
if (!/addEventListener\('pointerleave',\s*clearPointer\)[\s\S]*addEventListener\('pointercancel',[\s\S]*?clearPointer\(\)/.test(constellationSource)) {
  issues.push("receipt constellation: pointer leave and cancellation must clear the same hover state");
}
if (!/addEventListener\('pointerdown',[\s\S]*?pointerType:\s*event\.pointerType[\s\S]*?addEventListener\('pointerup',[\s\S]*?distance\s*>\s*12\s*\|\|\s*elapsed\s*>\s*750[\s\S]*?pointerType\s*===\s*'touch'\s*\?\s*36[\s\S]*?pointerType\s*===\s*'pen'\s*\?\s*24\s*:\s*18/.test(constellationSource)) {
  issues.push("receipt constellation: mouse, pen, and touch selection must share tap-vs-drag handling");
}
if (!/const\s+step\s*=\s*lastAnimatedAt[\s\S]*?timestamp\s*-\s*lastAnimatedAt[\s\S]*?1000\s*\/\s*60/.test(constellationSource)) {
  issues.push("receipt constellation: particle motion must remain normalized across display refresh rates");
}
if (!/Math\.max\(particle\.radius,\s*2\.7\)/.test(receiptDrawSource) || !/selected\s*===\s*particle\s*\?\s*11\s*:\s*9/.test(receiptDrawSource)) {
  issues.push("receipt constellation: mobile receipt stars must keep visible cores and a selected-state ring");
}
if (!/previousReceipt\?\.addEventListener\('click',[\s\S]*?browseDetail\(-1\)[\s\S]*?nextReceipt\?\.addEventListener\('click',[\s\S]*?browseDetail\(1\)/.test(constellationSource)) {
  issues.push("receipt constellation: detail sheet must keep previous and next receipt navigation");
}
for (const eventName of [
  "receipt_constellation_receipt_selected",
  "receipt_constellation_replay_opened",
  "receipt_constellation_raw_manifest_opened",
]) {
  if (!new RegExp(`['\"]${eventName}['\"]`).test(receiptAnalyticsSource)) {
    issues.push(`receipt constellation analytics: ${eventName} must remain a fixed, privacy-safe event name`);
  }
}
const receiptAnalyticsCaptures = [...receiptAnalyticsSource.matchAll(/posthog\.capture\(([^)]*)\)/g)];
if (
  !/typeof window\.posthogReady !== 'function'[\s\S]*?window\.posthogReady\(/.test(receiptAnalyticsSource) ||
  receiptAnalyticsCaptures.length !== 1 ||
  receiptAnalyticsCaptures[0][1].trim() !== "eventName"
) {
  issues.push("receipt constellation analytics: PostHog must be optional and capture only the fixed event name");
}
if (/\b(?:receipt|target|action|signature|chain|scenario|manifest)\b\s*[:.]/i.test(receiptAnalyticsSource) || /\b(?:fetch|JSON\.stringify)\b/.test(receiptAnalyticsSource)) {
  issues.push("receipt constellation analytics: evidence data must never be sent or serialized");
}
if (!/trackReceiptConstellation\('receipt_constellation_receipt_selected'\)/.test(detailSource)) {
  issues.push("receipt constellation analytics: selecting a receipt must emit the selected event");
}
if (!/replay\.href\s*=\s*`\/playground\/replay\/\$\{particle\.scenario\.id\}\/`/.test(detailSource)) {
  issues.push("receipt constellation: selected receipts must open the durable replay archive route");
}
if (!/\[data-detail-replay\][\s\S]*?trackReceiptConstellation\('receipt_constellation_replay_opened'\)/.test(constellationSource)) {
  issues.push("receipt constellation analytics: opening a replay must emit the replay event");
}
if (!/\[data-detail-manifest\][\s\S]*?trackReceiptConstellation\('receipt_constellation_raw_manifest_opened'\)/.test(constellationSource)) {
  issues.push("receipt constellation analytics: opening a raw manifest must emit the manifest event");
}
if (!/\.receipt-constellation-buttons[\s\S]*?a\s*\{[\s\S]*?min-height:\s*2\.75rem;/.test(constellationStyle)) {
  issues.push("receipt constellation: mobile fallback receipt links must keep 44px touch targets");
}
if (!/\.gl-list-header[\s\S]*?\.btn\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?min-height:\s*44px;/.test(gauntletResultsStyle)) {
  issues.push("gauntlet results: stacked mobile actions must remain centered 44px touch targets");
}

const headersSource = readFileSync(path.join(repoRoot, "static/_headers"), "utf8");
const buildHopHeaders = headersSource.match(/\/buildhop\/\*[\s\S]*?(?=\n\/|$)/)?.[0] || "";
if (!buildHopHeaders.includes("img-src 'self' data: https://verifieddr.com")) {
  issues.push("static/_headers: /buildhop/* img-src does not allow the VerifiedDR badge");
}
const demoHeaders = headersSource.match(/\/playground\/demo\/\*[\s\S]*?(?=\n\/|$)/)?.[0] || "";
for (const origin of ["https://buildhop.io", "https://www.buildhop.io"]) {
  if (!demoHeaders.includes(origin)) {
    issues.push(`static/_headers: /playground/demo/* frame-ancestors is missing ${origin}`);
  }
}
if (/^\s*X-Frame-Options:/m.test(demoHeaders)) {
  issues.push("static/_headers: /playground/demo/* X-Frame-Options conflicts with the BuildHop frame-ancestors allowlist");
}

if (issues.length > 0) {
  if (notices.length > 0) {
    console.error("site audit SEO notices:");
    for (const notice of notices) {
      console.error(`- ${notice}`);
    }
  }

  console.error("site audit found issues:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

if (notices.length > 0) {
  console.log("site audit SEO notices:");
  for (const notice of notices) {
    console.log(`- ${notice}`);
  }
}

console.log(`site audit passed for ${htmlFiles.length} HTML files`);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isAuditedContentFile(file) {
  if (!file.endsWith(".md") || file.endsWith(".devto.md")) {
    return false;
  }

  return buildFuture || !isFutureDatedContent(file);
}

function isFutureDatedContent(file) {
  const source = readFileSync(file, "utf8");
  const rawDate = matchFrontMatter(source, "date");
  if (!rawDate) {
    return false;
  }

  const dateOnly = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return false;
  }

  return dateOnly > todayISODate();
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function matchFrontMatter(source, key) {
  const result = source.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, "m"));
  return result ? result[1].trim() : "";
}

function routeFromFile(file) {
  const relative = path.relative(publicDir, file).replaceAll(path.sep, "/");

  if (relative === "index.html") {
    return "/";
  }

  if (relative.endsWith("/index.html")) {
    return `/${relative.slice(0, -"index.html".length)}`;
  }

  return `/${relative}`;
}

function fileForRoute(routePath) {
  const normalizedPath = routePath.startsWith("/") ? routePath.slice(1) : routePath;
  const directPath = path.join(publicDir, normalizedPath);

  if (routePath.endsWith("/")) {
    return path.join(publicDir, normalizedPath, "index.html");
  }

  if (path.extname(routePath)) {
    return directPath;
  }

  const prettyPath = path.join(publicDir, normalizedPath, "index.html");
  if (existsSync(prettyPath)) {
    return prettyPath;
  }

  return directPath;
}

function markdownFileForRoute(routePath) {
  if (routePath === "/") {
    return path.join(publicDir, "index.md");
  }

  const normalizedPath = routePath.startsWith("/") ? routePath.slice(1) : routePath;
  return path.join(publicDir, normalizedPath, "index.md");
}

function normalizeRoute(routePath) {
  if (!routePath || routePath === "/") {
    return "/";
  }

  if (routePath.endsWith("/")) {
    return routePath;
  }

  if (path.extname(routePath)) {
    return routePath;
  }

  return `${routePath}/`;
}

function normalizeContentRoute(routePath) {
  if (!routePath || routePath === "/") {
    return "/";
  }

  if (routePath.endsWith("/index.md")) {
    return normalizeRoute(routePath.slice(0, -"index.md".length));
  }

  if (routePath.endsWith(".md")) {
    return normalizeRoute(routePath.slice(0, -".md".length));
  }

  return normalizeRoute(routePath);
}

function match(source, pattern) {
  const result = source.match(pattern);
  return result ? decodeHtml(result[1].trim()) : "";
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#34;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function normalizeText(value) {
  return decodeHtml(value)
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleTextFromHtml(html) {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function shouldSkipHref(href) {
  return href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:") ||
    href.startsWith("data:") ||
    href.startsWith("https://www.youtube.com") ||
    href.startsWith("https://youtube.com");
}

function shouldSkipPath(routePath) {
  return routePath.startsWith("/api/") ||
    routePath.startsWith("/gauntlet/api/") ||
    routePath.startsWith("/cdn-cgi/");
}

function addDuplicate(map, value, owner) {
  const current = map.get(value) || [];
  current.push(owner);
  map.set(value, current);
}

function attr(tag, name) {
  const pattern = new RegExp(`\\s${name}="([^"]*)"`, "i");
  const result = tag.match(pattern);
  return result ? decodeHtml(result[1].trim()) : "";
}

function stripFrontMatter(source) {
  return source.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function getFrontMatter(source) {
  const result = source.match(/^---\n([\s\S]*?)\n---\n?/);
  return result ? result[1] : "";
}

function extractContentLinks(source) {
  const body = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ");
  const hrefs = [];

  for (const match of body.matchAll(/(!?)\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (match[1] !== "!") {
      hrefs.push(match[2]);
    }
  }

  for (const match of body.matchAll(/<a\b[^>]*\shref="([^"]+)"/gi)) {
    hrefs.push(match[1]);
  }

  return hrefs;
}

function contentRouteFromFile(file) {
  const relative = path.relative(path.join(repoRoot, "content"), file).replaceAll(path.sep, "/");
  if (!relative.endsWith(".md")) {
    return "";
  }

  const explicitRoute = matchFrontMatter(readFileSync(file, "utf8"), "url");
  if (explicitRoute) {
    return normalizeContentRoute(explicitRoute);
  }

  if (relative === "_index.md") {
    return "/";
  }

  if (relative.endsWith("/_index.md")) {
    return `/${relative.slice(0, -"/_index.md".length)}/`;
  }

  const withoutExt = relative.slice(0, -".md".length);
  return `/${withoutExt}/`;
}
