#!/usr/bin/env node
// indexnow-submit.mjs
//
// Submit URLs to the IndexNow API (Bing, Yandex, Seznam, Naver, Yep).
// Cloudflare also auto-submits via its IndexNow integration when enabled,
// but this script gives us an ad-hoc path for: (a) audits that flag a list
// of pages needing re-crawl, (b) manual submission after a content push,
// (c) one-off submission of pages the search engines have not yet picked
// up.
//
// IndexNow spec: https://www.indexnow.org/documentation
//
// Usage:
//   node scripts/indexnow-submit.mjs                 # submit all sitemap URLs
//   node scripts/indexnow-submit.mjs urls.txt        # submit URLs from file (one per line)
//   echo "https://..." | node scripts/indexnow-submit.mjs -  # submit URLs from stdin
//
// The host key is read from `static/bd2aa46ad5df4155a5f847081c21637f.txt`
// in the repo so the script and the served key file cannot drift.

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const HOST = "pipelab.org";
const KEY = "bd2aa46ad5df4155a5f847081c21637f";
const KEY_PATH = path.join(repoRoot, "static", `${KEY}.txt`);
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const SITEMAP = `https://${HOST}/sitemap.xml`;
const BATCH_SIZE = 1000; // IndexNow caps each request at 10000 URLs; we batch smaller.

function fail(msg, code = 1) {
  console.error(`indexnow-submit: ${msg}`);
  process.exit(code);
}

if (!existsSync(KEY_PATH)) {
  fail(`host key file not found at ${KEY_PATH}`);
}

const keyFromFile = readFileSync(KEY_PATH, "utf8").trim();
if (keyFromFile !== KEY) {
  fail(
    `host key mismatch: file ${KEY_PATH} has "${keyFromFile}" but script expects "${KEY}"`,
  );
}

async function fetchSitemapUrls() {
  const res = await fetch(SITEMAP);
  if (!res.ok) fail(`sitemap fetch returned HTTP ${res.status}`);
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((m) => m[1]);
}

async function readUrlsFromFile(file) {
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function readUrlsFromStdin() {
  let buf = "";
  for await (const chunk of process.stdin) buf += chunk;
  return buf
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function getUrls() {
  const arg = process.argv[2];
  if (!arg) {
    console.log(`indexnow-submit: no URL list provided, reading sitemap ${SITEMAP}`);
    return fetchSitemapUrls();
  }
  if (arg === "-") return readUrlsFromStdin();
  return readUrlsFromFile(arg);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function validateUrls(urls) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const offHost = [];

  for (const raw of urls) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      invalid.push(raw);
      continue;
    }

    if (parsed.protocol !== "https:" || parsed.hostname !== HOST) {
      offHost.push(raw);
      continue;
    }

    if (!seen.has(raw)) {
      seen.add(raw);
      valid.push(raw);
    }
  }

  if (invalid.length > 0) {
    fail(`refusing to submit invalid URLs:\n  ${invalid.slice(0, 5).join("\n  ")}`);
  }

  if (offHost.length > 0) {
    fail(
      `refusing to submit URLs on a different host:\n  ${offHost.slice(0, 5).join("\n  ")}`,
    );
  }

  const duplicateCount = urls.length - valid.length;
  if (duplicateCount > 0) {
    console.log(`indexnow-submit: skipped ${duplicateCount} duplicate URL(s)`);
  }

  return valid;
}

async function submitBatch(urls) {
  const body = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  // IndexNow returns 200 (accepted) or 202 (accepted, scheduled).
  // 422 means at least one URL is rejected. 400 = bad request. 403 = key mismatch.
  // 429 = throttled. 500 = upstream error. Per spec, the response body is empty on 200/202.
  return { status: res.status, text: await res.text() };
}

async function main() {
  const urls = validateUrls(await getUrls());
  if (urls.length === 0) fail("no URLs to submit");

  console.log(`indexnow-submit: submitting ${urls.length} URL(s) for ${HOST}`);

  const batches = chunk(urls, BATCH_SIZE);
  let ok = 0;
  let fail_count = 0;
  for (const [i, batch] of batches.entries()) {
    const { status, text } = await submitBatch(batch);
    const acceptable = status === 200 || status === 202;
    if (acceptable) {
      ok += batch.length;
      console.log(`  batch ${i + 1}/${batches.length}: ${status} OK (${batch.length} URLs)`);
    } else {
      fail_count += batch.length;
      console.log(
        `  batch ${i + 1}/${batches.length}: ${status} FAIL${text ? ` (${text.slice(0, 200)})` : ""}`,
      );
    }
  }
  console.log(
    `indexnow-submit: ${ok} accepted, ${fail_count} failed, ${urls.length} total`,
  );
  process.exit(fail_count > 0 ? 1 : 0);
}

main().catch((err) => fail(`unexpected error: ${err.message}`, 2));
