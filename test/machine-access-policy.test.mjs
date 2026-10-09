// The machine-access policy is stated in more than one public file, and nothing
// failed when they disagreed. On 2026-09-02 robots.txt was opened to every
// crawler while llms-full.txt and AGENTS.md still told machines that GPTBot and
// ClaudeBot were blocked. Both surfaces are public and a crawler may read
// either one, so a split between them publishes two contradictory policies.
//
// These checks compare the files against each other rather than against a
// hardcoded expected policy, so they keep holding if the policy reverses.
//
// static/_headers is the fourth surface AGENTS.md names, but it carries no
// training directive today: its only crawler-facing rule is an X-Robots-Tag
// noindex on markdown alternates, which is an indexing choice rather than a
// training-policy claim. If a Content-Signal header is ever added there, add it
// to POLICY_PROSE_FILES below so it cannot drift either.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(repoRoot, relative), "utf8");

// Every published surface that states the crawler policy in prose.
const POLICY_PROSE_FILES = ["static/llms.txt", "static/llms-full.txt", "AGENTS.md"];

const robots = read("static/robots.txt");
const prose = POLICY_PROSE_FILES.map((file) => [file, read(file)]);

const KNOWN_CRAWLERS =
  "GPTBot|ClaudeBot|anthropic-ai|Google-Extended|Applebot-Extended|DeepseekBot|Meta-ExternalAgent|OAI-SearchBot|Claude-SearchBot|Claude-User|Amazonbot|Bytespider|CCBot|PerplexityBot";

// RFC 9309: a group is one or more consecutive user-agent lines followed by
// that group's rules. Every user-agent in the group receives every rule, and a
// user-agent line that follows a rule line starts a NEW group. Tracking only
// the most recent name would let a two-name group report as blocking one name,
// which is exactly the undisclosed block this file exists to catch.
function disallowedUserAgents(source) {
  const blocked = new Set();
  let group = [];
  let groupHasRules = false;

  for (const raw of source.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;

    const ua = line.match(/^User-agent:\s*(.+)$/i);
    if (ua) {
      if (groupHasRules) {
        group = [];
        groupHasRules = false;
      }
      group.push(ua[1].trim());
      continue;
    }

    if (/^(Disallow|Allow|Crawl-delay|Sitemap):/i.test(line)) {
      groupHasRules = true;
      const disallow = line.match(/^Disallow:\s*(.*)$/i);
      // "Disallow:" with an empty value blocks nothing; it is an allow.
      if (disallow && disallow[1].trim() !== "") {
        for (const name of group) blocked.add(name);
      }
    }
  }
  return [...blocked];
}

const disallowedAgents = disallowedUserAgents(robots);

function crawlersDescribedAsBlocked(source) {
  const named = new Set();
  const pattern = new RegExp(`\\b(?:block(?:s|ed|ing)?)\\b[^.\\n]*?\\b(${KNOWN_CRAWLERS})\\b`, "gi");
  for (const match of source.matchAll(pattern)) {
    // "do not reintroduce a block", "the previous policy blocked X" and similar
    // past or negated statements are history, not current policy. The qualifier
    // usually sits BEFORE the verb, so read back to the start of the sentence
    // rather than only inspecting the matched span.
    const sentenceStart = source.lastIndexOf(".", match.index) + 1;
    const sentence = source.slice(sentenceStart, match.index + match[0].length).toLowerCase();
    if (/previous|reintroduce|former|used to|no longer|ever reverses|rather than/.test(sentence)) {
      continue;
    }
    named.add(match[1]);
  }
  return named;
}

test("every crawler a prose surface calls blocked is disallowed in robots.txt", () => {
  for (const [file, source] of prose) {
    for (const name of crawlersDescribedAsBlocked(source)) {
      assert.ok(
        disallowedAgents.some((ua) => ua.toLowerCase() === name.toLowerCase()),
        `${file} says ${name} is blocked, but static/robots.txt does not disallow it`,
      );
    }
  }
});

test("every crawler robots.txt disallows is named by a prose surface", () => {
  const namedAnywhere = new Set();
  for (const [, source] of prose) {
    for (const name of crawlersDescribedAsBlocked(source)) namedAnywhere.add(name.toLowerCase());
  }

  for (const ua of disallowedAgents) {
    if (ua === "*") continue;
    assert.ok(
      namedAnywhere.has(ua.toLowerCase()),
      `static/robots.txt disallows ${ua}, but no prose surface says so`,
    );
  }
});

test("no prose surface describes a current block while robots.txt is fully open", () => {
  if (disallowedAgents.length > 0) return; // a real block list is checked above

  const contradictions = prose
    .filter(([, source]) => /current (?:robots )?(?:policy|public posture)[^.\n]*\bblocks?\b/i.test(source))
    .map(([file]) => file);

  assert.deepEqual(
    contradictions,
    [],
    "robots.txt allows every crawler, so no surface may describe a current block",
  );
});

test("the robots parser applies a group's rules to every user-agent in it", () => {
  // Negative test for the multi-user-agent group. RFC 9309 allows consecutive
  // user-agent lines to share one rule block, and reading only the last name
  // would report this group as blocking ClaudeBot alone.
  const sample = [
    "User-agent: GPTBot",
    "User-agent: ClaudeBot",
    "Disallow: /",
    "",
    "User-agent: *",
    "Allow: /",
  ].join("\n");

  assert.deepEqual(disallowedUserAgents(sample).sort(), ["ClaudeBot", "GPTBot"]);

  // A user-agent line AFTER a rule line starts a new group and must not inherit
  // the previous group's Disallow.
  const sequential = ["User-agent: GPTBot", "Disallow: /", "User-agent: Amazonbot", "Allow: /"].join("\n");
  assert.deepEqual(disallowedUserAgents(sequential), ["GPTBot"]);

  // An empty Disallow value is an allow, not a block.
  assert.deepEqual(disallowedUserAgents(["User-agent: CCBot", "Disallow:"].join("\n")), []);
});
