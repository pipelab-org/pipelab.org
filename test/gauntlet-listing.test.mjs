import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../themes/pipelab/assets/js/gauntlet-results.js", import.meta.url), "utf8");
function element() {
  return { style: {}, hidden: true, textContent: "", innerHTML: "", children: [], attrs: {},
    appendChild(child) { this.children.push(child); if (child.textContent) this.innerHTML += child.textContent.replaceAll("&", "&amp;").replaceAll("<", "&lt;"); },
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector() { return this.paragraph ||= element(); } };
}
async function listing({ community = { results: [] }, verified = true, summary = { per_category: { injection: { applicable: 2, containment: 0.5 } } }, payload = {} } = {}) {
  const nodes = new Map();
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element, createTextNode: textContent => ({ textContent }) };
  const row = { id: "fixture", tool: "Pipelock", tool_version: "1", applicable: 2, total: 4, full_containment: 0.5, created_at: "2026-01-01", verified_record: true };
  const fetch = async url => {
    if (url !== "/api/results") return { ok: true, json: async () => ({ payload }) };
    if (community instanceof Error) throw community;
    if (community === "http-error") return { ok: false, json: async () => ({ results: [] }) };
    if (community === "bad-json") return { ok: true, json: async () => { throw new SyntaxError("json"); } };
    return { ok: true, json: async () => community };
  };
  const window = { location: { pathname: "/gauntlet/results/", search: "" }, fetch,
    GauntletContinuous: { loadLatestVerified: async () => verified ? { record: payload, summary } : null,
      verifiedListingRow: () => ({ ...row }), groupLatestByTool: rows => rows.map(latest => ({ latest, history: [] })), formatScoreFraction: () => "" } };
  vm.runInNewContext(source, { window, document, fetch, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  return document.getElementById;
}

test("verified listing renders the verified summary when the record has no categories", async () => {
  const get = await listing();
  assert.equal(get("gl-categories").hidden, false);
  assert.match(get("gl-category-grid").innerHTML, /injection/);
  assert.match(get("gl-category-grid").innerHTML, /50%/);
  assert.equal(get("gl-result-hero-meter").attrs["aria-label"], "2 of 4 cases routed to the tool");
});
for (const community of [new Error("offline"), "http-error", "bad-json", null, { results: {} }]) {
  test(`verified listing survives community failure: ${String(community)}`, async () => {
    const get = await listing({ community });
    assert.equal(get("gl-count").textContent, 1);
    assert.equal(get("gl-categories").hidden, false);
    assert.equal(get("results-list").children.length, 1);
  });
}
test("both unavailable sources show a failure rather than an empty successful catalog", async () => {
  const get = await listing({ community: new Error("offline"), verified: false });
  assert.equal(get("results-list-empty").querySelector("p").textContent, "Failed to load results.");
});
test("community records retain their payload categories and ignore unverified summaries", async () => {
  const get = await listing({ verified: false, community: { results: [{ id: "community", full_containment: 1 }] }, payload: { per_category: { community_category: { applicable: 1, containment: 1 } } } });
  assert.match(get("gl-category-grid").innerHTML, /community category/);
});
test("absent category data leaves the section hidden", async () => {
  const get = await listing({ summary: null });
  assert.equal(get("gl-categories").hidden, true);
});
test("a rejected verified summary does not fall back to record categories", async () => {
  const payload = { per_category: { community_copy: { applicable: 9, containment: 1 } } };
  const get = await listing({ summary: null, payload });
  assert.equal(get("gl-result-hero-claim").textContent, "DIGEST CHECKED");
  assert.equal(get("gl-categories").hidden, true);
  assert.equal(get("gl-category-grid").innerHTML, "");
});
test("verified summary categories replace a different record category block", async () => {
  const get = await listing({
    summary: { per_category: { injection: { applicable: 2, containment: 0.5 } } },
    payload: { per_category: { community_copy: { applicable: 9, containment: 1 } } },
  });
  assert.match(get("gl-category-grid").innerHTML, /injection/);
  assert.doesNotMatch(get("gl-category-grid").innerHTML, /community copy/);
});

function richElement() {
  const el = element();
  el.classList = { add() {} };
  el.addEventListener = () => {};
  el.replaceChildren = () => { el.children = []; };
  return el;
}
async function verifiedDetail({ summary, payload }) {
  const nodes = new Map();
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, richElement()); return nodes.get(id); },
    createElement: richElement,
    createTextNode: textContent => ({ textContent }),
    querySelector() { return richElement(); },
  };
  const id = "b".repeat(64);
  const fetch = async () => { throw new Error("detail must not use the community API"); };
  const window = {
    location: { pathname: "/gauntlet/results/", search: `?record=${id}`, href: `https://example.test/gauntlet/results/?record=${id}` },
    fetch, crypto: {},
    GauntletContinuous: {
      loadLatestVerified: async () => ({ pointer: { candidate_sha256: id }, record: payload, summary, failures: null, recordUrl: "/evidence" }),
      metricCounts: () => null,
      formatScoreWithFraction: score => String(score),
      formatScoreFraction: () => "",
      CASE_EQUAL_WEIGHTING: "case-equal",
    },
  };
  vm.runInNewContext(source, { window, document, fetch, URLSearchParams, navigator: { clipboard: { writeText: async () => {} } } });
  await new Promise(resolve => setImmediate(resolve));
  return document.getElementById;
}
const recordWithForeignCategories = {
  tool: "Pipelock", tool_version: "1", case_count: { total: 4 }, canonical_url: "https://example.test/run",
  scores: { full: { containment: 0.5, false_positive_rate: 0 }, applicable: { containment: 0.5 } },
  per_category: { community_copy: { applicable: 9, containment: 1 } },
};
test("verified detail hides categories when the summary is missing", async () => {
  const get = await verifiedDetail({ summary: null, payload: recordWithForeignCategories });
  assert.equal(get("gr-record-claim").textContent, "DIGEST CHECKED");
  assert.equal(get("gr-categories-chapter").hidden, true);
  assert.equal(get("gr-categories").innerHTML, "");
});
test("verified detail renders the summary rather than the record category block", async () => {
  const get = await verifiedDetail({
    summary: { per_category: { injection: { applicable: 2, containment: 0.5 } } },
    payload: recordWithForeignCategories,
  });
  assert.match(get("gr-categories").innerHTML, /injection/);
  assert.doesNotMatch(get("gr-categories").innerHTML, /community copy/);
  assert.equal(get("gr-categories-chapter").hidden, false);
});

test("the published verified record renders every category from its published summary", async () => {
  const evidence = new URL("../static/gauntlet/evidence/", import.meta.url);
  const pointer = JSON.parse(await readFile(new URL("latest-verified.json", evidence), "utf8"));
  const candidate = new URL(`results/pipelock/${pointer.candidate_sha256}/`, evidence);
  const payload = JSON.parse(await readFile(new URL("continuous-gauntlet-pipelock.json", candidate), "utf8"));
  const summary = JSON.parse(await readFile(new URL("raw-summary.json", candidate), "utf8"));
  const get = await listing({ payload, summary });
  assert.equal(get("gl-categories").hidden, false);
  const cards = get("gl-category-grid").innerHTML.match(/class="gl-category-name"/g) || [];
  assert.equal(cards.length, Object.keys(summary.per_category).length);
  assert.ok(cards.length > 0);
});
