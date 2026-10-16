import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const compareDir = path.join(repoRoot, "content", "compare");
const read = (relative) => readFileSync(path.join(repoRoot, relative), "utf8");

function frontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, "content file must start with YAML front matter");
  return { data: YAML.parse(match[1]), body: match[2] };
}

const pages = readdirSync(compareDir)
  .filter((file) => file.endsWith(".md") && file !== "_index.md")
  .map((file) => ({ file, ...frontMatter(readFileSync(path.join(compareDir, file), "utf8")) }));

const index = YAML.parse(read("data/compare_index.yaml"));
const categoryKeys = new Set(index.categories.map((category) => category.key));

// Links back to Pipelock's own surfaces need no third-party source. Only the
// Pipelock organization on GitHub counts as first party, not github.com at large.
const firstPartyHosts = new Set(["pipelab.org"]);
const firstPartyPrefixes = ["https://github.com/luckyPipewrench/", "https://github.com/pipelab-org/"];
function isFirstParty(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return firstPartyHosts.has(host) || firstPartyPrefixes.some((prefix) => url.startsWith(prefix));
}
// Every way a Markdown body can carry an external link: inline, reference
// definition, autolink, and raw HTML href.
function externalLinks(body) {
  const found = [];
  for (const match of body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) found.push(match[1]);
  for (const match of body.matchAll(/^\s*\[[^\]]+\]:\s*<?(https?:\/\/\S+?)>?\s*$/gm)) found.push(match[1]);
  for (const match of body.matchAll(/<(https?:\/\/[^>\s]+)>/g)) found.push(match[1]);
  for (const match of body.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) found.push(match[1]);
  return found;
}

function normalizedSourceURL(raw) {
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.href;
}

// A reviewed month is also provenance: it must be a real month and not later
// than the month the test runs in.
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function isReviewedMonthNotFuture(value) {
  const [name, year] = value.split(" ");
  const month = monthNames.indexOf(name);
  if (month < 0) return false;
  const now = new Date();
  return Number(year) < now.getUTCFullYear() || (Number(year) === now.getUTCFullYear() && month <= now.getUTCMonth());
}

// A checked date is provenance, so it must be a date that exists and has
// already happened. Date.parse accepts 2026-02-31 by rolling it forward, so
// round-trip the parts instead of trusting the parser.
function isRealPastDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return false;
  return parsed.getTime() <= Date.now();
}

// Bare "Gauntlet" reads as a product name the reader has not been introduced
// to. Compound or benchmark-anchored wording is fine; a lone capitalized word
// is not. Route paths are exempt because /gauntlet/ is the real URL.
const bareGauntlet = /(?<!Egress Bench )(?<!\/)\bGauntlet\b(?! (?:results?|score|scores|run|runs|benchmark|evidence|page|surface|record))/g;

// Comparative advertising is lawful when it is truthful, specific, and
// substantiated. Superlatives and unbounded quantifiers about our own product or
// about the field are the claims that cannot be substantiated from a dated
// source, so they do not belong on a comparison page. A quoted line from a
// vendor's own page is exempt only when it sits inside quotation marks.
const unsubstantiated = /\b(the only|only (?:product|tool|firewall|proxy|vendor|option|one)|best(?![- ](?:practices?|effort))|fastest|strongest|lightest|most (?:secure|complete|advanced|trusted|security-first)|no other (?:product|tool|vendor|firewall|proxy|gateway)|nobody else|industry[- ]leading|market[- ]leading|leader in|#1|number one|unbeatable|guaranteed?|bulletproof|unhackable|100% (?:secure|safe|coverage))\b/gi;
function outsideQuotes(body) {
  return body.replace(/"[^"\n]{0,400}"/g, '""').replace(/`[^`\n]*`/g, "``");
}

test("comparison pages make no unsubstantiated superlative claims", () => {
  for (const { file, body, data } of pages) {
    const prose = outsideQuotes(body + "\n" + JSON.stringify(data.compare ?? {}) + "\n" + JSON.stringify((data.faq ?? []).map((entry) => entry.a)));
    const hits = [...prose.matchAll(unsubstantiated)].map((m) => m[0]);
    assert.deepEqual(hits, [], `${file}: unsubstantiated wording ${JSON.stringify(hits)}`);
  }
});

// A page that names a product must say where that product is stronger. A
// one-sided comparison is the shape a court reads as disparagement and a
// reader reads as an advertisement.
test("every product comparison names where the other product is stronger", () => {
  for (const { file, body } of pages) {
    if (!file.startsWith("pipelock-vs-")) continue;
    assert.match(body, /^## (?:Where (?!Pipelock\b).+ (?:is|are) stronger|When to pick (?!Pipelock\b).+|What .+ (?:does|do) that Pipelock (?:doesn't|does not))/m, `${file}: needs a section on where the other product is stronger`);
  }
});

// The third-party naming and corrections notice must render on every
// comparison page in both output formats. The template include is the thing
// under test: if either template drops the partial, every page loses it.
test("the comparison disclaimer is wired into both page templates", () => {
  const partial = read("themes/pipelab/layouts/partials/compare-disclaimer.html");
  assert.match(partial, /not affiliated with, sponsored by, or endorsed by/, "disclaimer partial lost its affiliation sentence");
  assert.match(partial, /belong to their owners/, "disclaimer partial lost its trademark sentence");
  assert.match(partial, /href="\/contact\/"/, "disclaimer partial lost its corrections route");
  assert.match(partial, /reflect PipeLab's reading of them/, "disclaimer partial lost its scope qualifier");
  assert.match(read("themes/pipelab/layouts/compare/single.html"), /partial "compare-disclaimer\.html"/, "HTML compare template does not include the disclaimer");
  const mirror = read("themes/pipelab/layouts/_default/single.markdown.md");
  assert.match(mirror, /not affiliated with, sponsored by, or endorsed by/, "markdown mirror does not carry the disclaimer");
  assert.match(mirror, /reflect PipeLab's reading of them/, "markdown mirror lost the disclaimer scope qualifier");
});

test("every comparison page carries a ledger, dated sources, and a known category", () => {
  assert.ok(pages.length >= 10, "the comparison directory should not silently shrink");
  for (const page of pages) {
    const { file, data, body } = page;
    assert.ok(categoryKeys.has(data.compare_cat), `${file}: compare_cat ${data.compare_cat} is not in data/compare_index.yaml`);
    assert.match(String(data.reviewed ?? ""), /^[A-Z][a-z]+ 20\d\d$/, `${file}: reviewed must read like "September 2026"`);
    assert.ok(isReviewedMonthNotFuture(String(data.reviewed)), `${file}: reviewed month ${data.reviewed} is not a real month on or before the current month`);
    assert.ok(data.compare && typeof data.compare === "object", `${file}: missing compare ledger block`);
    for (const key of ["subject", "subject_job", "subject_boundary", "subject_source", "subject_pricing", "subject_deploy", "pick_subject", "pick_pipelock", "pick_both"]) {
      assert.ok(typeof data.compare[key] === "string" && data.compare[key].trim(), `${file}: compare.${key} is required`);
    }
    assert.ok(Array.isArray(data.sources) && data.sources.length > 0, `${file}: sources must list at least one checked source`);
    const sourceURLs = new Set();
    for (const source of data.sources) {
      assert.match(String(source.url ?? ""), /^https?:\/\//, `${file}: source ${source.label} needs an absolute URL`);
      assert.match(String(source.checked ?? ""), /^20\d\d-\d\d-\d\d$/, `${file}: source ${source.label} needs a checked date`);
      assert.ok(isRealPastDate(String(source.checked)), `${file}: source ${source.label} checked date ${source.checked} is not a real calendar date on or before today`);
      const host = new URL(source.url).hostname.replace(/^www\./, "");
      assert.ok(!/(^|\.)example\.(com|org|net)$/.test(host) && !/^(localhost|127\.0\.0\.1)$/.test(host), `${file}: source ${source.label} is a placeholder URL`);
      sourceURLs.add(normalizedSourceURL(source.url));
    }
    // Every third-party page the body links must be the precise page listed as
    // checked. A hostname match lets a claim cite an unrelated vendor page.
    for (const url of externalLinks(body)) {
      if (isFirstParty(url)) continue;
      assert.ok(sourceURLs.has(normalizedSourceURL(url)), `${file}: body links ${url} but that exact source was not listed as checked`);
    }
    assert.ok(Array.isArray(data.faq) && data.faq.length >= 2, `${file}: comparison pages carry an FAQ for the FAQPage schema`);
    assert.match(body, /^## /m, `${file}: body must start its sections at h2`);
    assert.doesNotMatch(body, /^# /m, `${file}: body must not contain an h1`);
    assert.doesNotMatch(body, /—/, `${file}: no em dashes in public copy`);
    const gauntletHits = `${body}\n${JSON.stringify(data)}`.match(bareGauntlet);
    assert.equal(gauntletHits, null, `${file}: bare "Gauntlet" must be compound or benchmark-anchored: ${gauntletHits}`);
  }
});

test("deployment-sensitive Pipelock claims carry their qualifier", () => {
  for (const { file, body, data } of pages) {
    const claimSurfaces = [body, ...Object.values(data.compare ?? {}), ...(data.faq ?? []).map((entry) => entry.a)];
    for (const surface of claimSurfaces) for (const sentence of surface.split(/(?<=[.!?])\s+|\n/)) {
      if (/HTTPS CONNECT/.test(sentence)) {
        assert.match(sentence, /HTTPS CONNECT \(payloads only with TLS interception on\)/, `${file}: CONNECT payload claim needs its TLS-interception qualifier`);
      }
      if (/whole (?:network )?path|all external communication|forced through|only route|cannot bypass/i.test(sentence)) {
        assert.match(sentence, /container|namespace|nftables|containment|network policy/i, `${file}: universal-route claim needs its enforcement mechanism in the same sentence`);
      }
      if (/Pipelock|mediated decision/i.test(sentence) && /(?:receipt|receipted|signs? (?:a )?receipt|emits? (?:a )?(?:signed )?receipts?|produces? (?:a )?(?:signed )?receipts?)\b/i.test(sentence) && /(?:every|each|per decision)/i.test(sentence)) {
        assert.match(sentence, /signing key|require_receipts|allow-path receipt/i, `${file}: receipt claim needs its configuration qualifier`);
      }
    }
  }
});

test("the compare index data names the category, the Pipelock column, and live routes", () => {
  for (const category of index.categories) {
    for (const key of ["key", "label", "summary", "adds"]) {
      assert.ok(category[key], `category ${category.key ?? "?"} is missing ${key}`);
    }
  }
  for (const key of ["job", "boundary", "source", "pricing", "deploy"]) {
    assert.ok(index.pipelock[key], `pipelock column is missing ${key}`);
  }
  // The shared Pipelock column is a public claim; tie it to the pinned v3.5.0
  // capability inventory so it cannot drift on its own.
  const inventory = JSON.parse(read("data/pipelock_capabilities.json"));
  const capabilityIds = new Set(inventory.capabilities.map((capability) => capability.id));
  for (const id of ["network-mediation", "mcp-proxy-scanning", "signed-action-receipts", "offline-receipt-verification"]) {
    assert.ok(capabilityIds.has(id), `pipelock column claims ${id}, which the capability inventory no longer lists`);
  }
  for (const term of ["HTTP", "WebSocket", "MCP", "receipt"]) {
    assert.match(index.pipelock.job, new RegExp(term), `pipelock column must state ${term}`);
  }
  assert.equal(inventory.source.status, "release", "the compare ledger must be pinned to a released inventory");
  // The column's remaining facts (boundary, licence, pricing shape, deployment)
  // come from the Pipelock README, not the inventory, so the column must cite the
  // README at the same tag the inventory is pinned to, and the facts it states
  // must match what that README and the site's own pricing page say.
  assert.equal(index.pipelock.source_url, `https://github.com/pipelab-org/pipelock/blob/${inventory.source.ref}/README.md`, "the Pipelock column must cite the README at the pinned inventory tag");
  assert.match(index.pipelock.boundary, /outside the agent process/, "boundary must state the mediator sits outside the agent process, as the README's capability separation section does");
  assert.match(index.pipelock.source, /Apache-2\.0/, "source must name the Apache-2.0 core licence");
  assert.match(index.pipelock.source, /ELv2/, "source must name the Enterprise licence");
  assert.match(index.pipelock.deploy, /binary/, "deployment must state the single binary");
  assert.ok(existsSync(path.join(repoRoot, "content", index.pipelock.pricing_url.replace(/^\//, "").replace(/\/$/, "") + ".md")), "pricing_url must point at a real content page");
  const pricingPage = read(path.join("content", index.pipelock.pricing_url.replace(/^\//, "").replace(/\/$/, "") + ".md"));
  assert.match(pricingPage, /Apache/, "the pricing page must still describe the free Apache core the column promises");
  const slugs = new Set(pages.map((page) => page.file.replace(/\.md$/, "")));
  for (const slug of index.featured) {
    assert.ok(slugs.has(slug), `featured slug ${slug} has no page`);
  }
  for (const route of index.routes) {
    const slug = route.href.replace(/^\/compare\//, "").replace(/\/$/, "");
    assert.ok(slugs.has(slug), `route ${route.label} points at a missing page ${route.href}`);
  }
  assert.match(read("content/compare/_index.md"), /agent firewall/, "the directory keeps the category term");
});

test("retired comparison pages redirect instead of vanishing", () => {
  const redirects = read("static/_redirects");
  for (const slug of ["pipelock-vs-agent-wall"]) {
    assert.equal(existsSync(path.join(compareDir, `${slug}.md`)), false, `${slug} was retired and must not return silently`);
    assert.match(redirects, new RegExp(`^/compare/${slug}/ /compare/[a-z-]+/ 301$`, "m"), `${slug} needs a 301 in static/_redirects`);
    assert.match(redirects, new RegExp(`^/compare/${slug}/index.md /compare/[a-z-]+/index.md 301$`, "m"), `${slug} markdown mirror needs a 301`);
  }
  const contentLinks = readdirSync(repoRoot, { recursive: true })
    .filter((file) => typeof file === "string" && file.startsWith("content/") && file.endsWith(".md"))
    .filter((file) => read(file).includes("/compare/pipelock-vs-agent-wall/"));
  assert.deepEqual(contentLinks, [], "no content page may still link the retired Agent Wall comparison");
});

test("compare templates render the ledger, the sources, and the chooser", () => {
  const single = read("themes/pipelab/layouts/compare/single.html");
  const list = read("themes/pipelab/layouts/compare/list.html");
  const mirror = read("themes/pipelab/layouts/_default/single.markdown.md");
  for (const marker of ["compare-ledger", "compare-picks", "compare-sources", "compare-toc", 'id="sources"']) {
    assert.match(single, new RegExp(marker), `compare/single.html must render ${marker}`);
  }
  assert.match(single, /errorf "compare page %q is missing its `compare` ledger block"/, "a page without a ledger must fail the build, not render blank");
  assert.match(single, /errorf "compare page %q lists no checked sources"/, "a page without sources must fail the build, not render blank");
  assert.match(list, /compare-chooser/, "the directory opens with the situation chooser");
  assert.match(list, /compare-group-adds/, "each category states what Pipelock adds");
  assert.match(list, /errorf "compare page %q has unknown compare_cat/, "an unknown category must fail the build");
  assert.match(mirror, /Sources checked/, "the markdown mirror carries the sources list for machine readers");
  assert.match(single, /partial "compare-disclaimer\.html"/, "every comparison page renders the third-party naming and corrections notice");
  assert.match(mirror, /not affiliated with, sponsored by, or endorsed by/, "the markdown mirror carries the same notice");
  const disclaimer = read("themes/pipelab/layouts/partials/compare-disclaimer.html");
  assert.match(disclaimer, /belong to their owners/);
  assert.match(disclaimer, /href="\/contact\/"/, "the notice must route corrections to the contact page");
});
