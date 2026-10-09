#!/usr/bin/env node

import { lookup } from "node:dns";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";

import { isBlockedExternalLink } from "./external-link-policy.mjs";

const repoRoot = process.cwd();
const publicDir = path.join(repoRoot, "public");
const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const failOnBlocked = args.has("--fail-on-blocked");
const checkLiveness = args.has("--check-liveness");

// A browser user-agent, because a plain fetch default gets bot-blocked by enough
// documentation hosts to bury the real findings in false ones.
const LIVENESS_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

if (!existsSync(publicDir)) {
  fail("public/ does not exist. Run `hugo --gc` or `npm run site:audit` first.");
}

const htmlFiles = walk(publicDir).filter((file) => file.endsWith(".html"));
const byUrl = new Map();
const byHost = new Map();
const blocked = [];

for (const file of htmlFiles) {
  const route = routeFromFile(file);
  let html;
  try {
    html = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      continue;
    }
    throw error;
  }
  for (const match of html.matchAll(/\shref="([^"]+)"/g)) {
    const href = decodeHtml(match[1]);
    if (shouldSkipHref(href)) {
      continue;
    }

    let url;
    try {
      url = new URL(href, `https://pipelab.org${route}`);
    } catch {
      continue;
    }

    if (!["http:", "https:"].includes(url.protocol) || url.hostname === "pipelab.org") {
      continue;
    }

    const normalized = normalizeUrl(url);
    const record = byUrl.get(normalized) || {
      url: normalized,
      host: url.hostname,
      sources: new Set(),
    };
    record.sources.add(route);
    byUrl.set(normalized, record);
    byHost.set(url.hostname, (byHost.get(url.hostname) || 0) + 1);

    if (isBlockedExternalLink(normalized)) {
      blocked.push({ url: normalized, source: route });
    }
  }
}

const links = [...byUrl.values()]
  .map((record) => ({
    url: record.url,
    host: record.host,
    sources: [...record.sources].sort(),
  }))
  .sort((a, b) => a.host.localeCompare(b.host) || a.url.localeCompare(b.url));

const summary = {
  htmlFiles: htmlFiles.length,
  uniqueExternalLinks: links.length,
  externalLinkReferences: [...byHost.values()].reduce((sum, count) => sum + count, 0),
  topHosts: [...byHost.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([host, count]) => ({ host, count })),
  blocked,
};

if (asJson) {
  console.log(JSON.stringify({ summary, links }, null, 2));
} else {
  console.log(`external link audit: ${summary.uniqueExternalLinks} unique external URL(s) across ${summary.htmlFiles} HTML file(s)`);
  console.log(`external link audit: ${summary.externalLinkReferences} total external href reference(s)`);
  console.log("external link audit: top hosts");
  for (const { host, count } of summary.topHosts) {
    console.log(`- ${host}: ${count}`);
  }
  if (blocked.length > 0) {
    console.log("external link audit: blocked stale URL pattern(s)");
    for (const item of blocked) {
      console.log(`- ${item.source}: ${item.url}`);
    }
  }
}

// Liveness is opt-in and deliberately NOT part of the pull-request gate.
//
// Checking these URLs means depending on a few hundred third-party servers, and
// they rate-limit, bot-block, and go down for reasons that have nothing to do
// with the change under review. A gate that fails on someone else's 503 is the
// kind an operator learns to bypass, which costs more than the rot it catches.
// So this reports and never fails the build; the scheduled workflow surfaces it.
//
// Two things it cannot tell apart on its own, both observed on 2026-09-02:
// a bot-protection 403 aimed at automated readers, and a 403 issued by a local
// egress proxy scanning the response. Anything reported here is a lead to
// confirm in a browser, not a verdict.
if (checkLiveness) {
  const results = [];
  const queue = [...links];
  const workers = Array.from({ length: 8 }, async () => {
    for (let next = queue.pop(); next; next = queue.pop()) {
      results.push(await probe(next));
    }
  });
  await Promise.all(workers);

  const allRedirects = results.filter((r) => r.status >= 300 && r.status < 400);
  const redirects = allRedirects.filter((r) => !redirectsByDesign(r));
  const exemptRedirects = allRedirects.filter((r) => redirectsByDesign(r));
  // 429 means we asked too fast, not that the link is broken. Reporting it as
  // unreachable would send someone to "fix" a URL that works, and would bury the
  // real failures under whichever host we happened to hammer.
  const throttled = results.filter((r) => r.status === 429);
  const errors = results.filter(
    (r) => (r.status >= 400 && r.status !== 429) || r.status === 0,
  );

  console.log(`external link liveness: probed ${results.length} URL(s)`);
  if (redirects.length > 0) {
    console.log("external link liveness: redirecting URL(s) — update the href to the destination");
    for (const r of redirects.sort((a, b) => a.url.localeCompare(b.url))) {
      console.log(`- ${r.status} ${r.url} -> ${r.location || "(no Location header)"}`);
      for (const source of r.sources) console.log(`    on ${source}`);
    }
  }
  if (errors.length > 0) {
    console.log("external link liveness: unreachable URL(s) — confirm in a browser before editing");
    for (const r of errors.sort((a, b) => a.url.localeCompare(b.url))) {
      console.log(`- ${r.status || "ERR"} ${r.url}${r.note ? ` (${r.note})` : ""}`);
      for (const source of r.sources) console.log(`    on ${source}`);
    }
  }
  // Listed rather than dropped: an exemption says the hop is expected, not that
  // the destination is healthy, and a silent exemption is how a dead checkout or
  // share link would pass unnoticed.
  if (exemptRedirects.length > 0) {
    console.log(
      `external link liveness: ${exemptRedirects.length} redirect(s) exempt as by-design (not followed, so the destination is unverified)`,
    );
    for (const r of exemptRedirects.sort((a, b) => a.url.localeCompare(b.url))) {
      console.log(`- ${r.status} ${r.url}`);
    }
  }
  if (throttled.length > 0) {
    const hosts = [...new Set(throttled.map((r) => new URL(r.url).hostname))].sort();
    console.log(
      `external link liveness: ${throttled.length} URL(s) rate-limited (429) on ${hosts.join(", ")} — inconclusive, not reported as broken`,
    );
  }
  if (redirects.length === 0 && errors.length === 0) {
    console.log("external link liveness: no redirecting or unreachable URL(s)");
  }
}

// Some URLs redirect because that is what they are for. Reporting them trains
// the reader to skim past the report, which costs more than the handful of real
// findings it hides. Each entry names why it is expected, so a future reader can
// tell a deliberate exemption from an accumulated one.
function redirectsByDesign(result) {
  const { url, location } = result;
  // Checkout links mint a per-session URL on every click.
  if (/^https:\/\/buy\.polar\.sh\//.test(url)) return true;
  // "latest" is defined as a redirect to the current tag.
  if (/^https:\/\/github\.com\/.+\/releases\/latest$/.test(url)) return true;
  // Authenticated GitHub surfaces bounce anonymous readers to a login.
  if (location && /^https:\/\/github\.com\/login\?/.test(location)) return true;
  // Social share intents bounce a signed-out caller to a login by design; the
  // link works for the reader who is signed in, which is every reader who
  // clicks it.
  if (/\/(sharing\/share-offsite|intent\/tweet|share)\b/.test(url)) return true;
  if (location && /linkedin\.com\/uas\/login/.test(location)) return true;
  // Locale negotiation: same document, a language suffix added for the caller.
  if (location && /[?&]hl=[a-z-]+$/i.test(location)) return true;
  return false;
}

// Refuse to probe anything that does not resolve to a public address.
//
// The probe takes its targets from site content and runs on a CI runner, so a
// link pointing at localhost, a private range, or link-local metadata would make
// this tool the request forgery it is meant to help prevent.
function isPublicAddress(address, family) {
  if (family === 6) {
    const v6 = address.toLowerCase();
    if (v6 === "::1" || v6 === "::") return false;
    if (/^f[cd]/.test(v6)) return false; // unique local
    if (/^fe[89ab]/.test(v6)) return false; // link local
    if (/^ff/.test(v6)) return false; // multicast, ff00::/8
    if (/^2001:db8/.test(v6)) return false; // documentation
    if (/^100:/.test(v6)) return false; // discard-only
    // IPv4-mapped: judge the embedded v4 address instead.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1], 4);
    return true;
  }
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false; // link local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier grade NAT
  if (a >= 224) return false; // multicast and reserved
  return true;
}

// Validate the address at CONNECT time, not before it.
//
// Resolving separately and then handing the hostname to a fetch that resolves it
// again leaves a window: the name can answer publicly for the check and
// privately for the request. A custom lookup closes the window because the
// address the socket is about to use is the address being judged.
//
// This is why the probe uses node:http and node:https rather than fetch, which
// exposes no hook at that point.
function guardedLookup(hostname, options, callback) {
  lookup(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    const safe = list.filter(({ address, family }) => isPublicAddress(address, family));
    if (safe.length === 0) {
      return callback(new Error("refused: resolves to a non-public address"));
    }
    if (options && options.all) return callback(null, safe);
    return callback(null, safe[0].address, safe[0].family);
  });
}

function probe(link) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(link.url);
    } catch {
      return resolve({ url: link.url, sources: link.sources, status: 0, note: "unparseable URL" });
    }
    const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
    const done = (result) => resolve({ url: link.url, sources: link.sources, ...result });

    // A literal address never reaches the lookup hook, because there is nothing
    // to resolve: Node connects straight to it. Verified by driving the guard
    // against 127.0.0.1, which connected while the hostname form was refused.
    // So a literal host is judged here, before any request is made.
    const literal = target.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = /^\d+\.\d+\.\d+\.\d+$/.test(literal) ? 4 : literal.includes(":") ? 6 : 0;
    if (literalFamily !== 0 && !isPublicAddress(literal, literalFamily)) {
      return done({ status: 0, note: "refused: literal non-public address" });
    }

    // GET rather than HEAD, because a meaningful number of hosts answer HEAD
    // with 405 or 404. Redirects are never followed: the hop itself is the
    // finding, and following one would step outside the validated address.
    const request = transport(
      target,
      { method: "GET", lookup: guardedLookup, headers: { "user-agent": LIVENESS_USER_AGENT } },
      (response) => {
        // Only the status line and headers matter. Discard the body so a large
        // or slow response cannot tie up the runner.
        response.resume();
        done({ status: response.statusCode ?? 0, location: response.headers.location ?? null });
      },
    );
    request.setTimeout(20000, () => request.destroy(new Error("timeout")));
    request.on("error", (error) => done({ status: 0, note: String(error.message || error).slice(0, 80) }));
    request.end();
  });
}

if (blocked.length > 0 && failOnBlocked) {
  fail(`${blocked.length} blocked stale URL reference(s) found`);
}

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

function shouldSkipHref(href) {
  return (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:")
  );
}

function normalizeUrl(url) {
  url.hash = "";
  return url.toString();
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function fail(message) {
  console.error(`external-link-audit: ${message}`);
  process.exit(1);
}
