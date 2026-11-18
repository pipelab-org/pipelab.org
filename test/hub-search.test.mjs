import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../themes/pipelab/assets/js/hub-search.js", import.meta.url), "utf8");
const pageURL = "https://example.com/preview/site/hub/";
const items = [
  { id: "test-guide", title: "Test guide", summary: "Verify a receipt.", type: "recipe", badge: "first-party", url: "/hub/recipes/test-guide/" },
  { id: "test-rules", title: "Test rules", summary: "Test bundle.", type: "bundle", badge: "official", url: "/hub/bundles/test-rules/" },
];

async function start(index) {
  const status = { textContent: "" };
  const input = { disabled: true, addEventListener: (_, handler) => { input.change = handler; } };
  const cards = items.map(item => ({
    dataset: { hubComponent: item.id }, hidden: false,
    querySelector: () => ({ href: new URL(item.url.slice(1), new URL("../", pageURL)).href }),
  }));
  const root = {
    dataset: { hubSearchIndex: "index.json" },
    querySelector: selector => selector.includes("input") ? input : status,
    querySelectorAll: () => cards,
  };
  runInNewContext(source, {
    document: { querySelector: () => root }, location: { href: pageURL }, URL,
    fetch: async (url, options) => {
      assert.equal(url.href, pageURL + "index.json");
      assert.equal(options.redirect, "error");
      return { ok: true, json: async () => index };
    },
  });
  await setImmediate();
  return { input, status, cards };
}

test("Hub search filters existing links with a path-prefixed index URL", async () => {
  const { input, status, cards } = await start({ format: 1, items });
  assert.equal(input.disabled, false);
  input.value = "RECEIPT";
  input.change();
  assert.deepEqual(cards.map(card => card.hidden), [false, true]);
  assert.equal(status.textContent, "1 matching component.");
  input.value = "";
  input.change();
  assert.deepEqual(cards.map(card => card.hidden), [false, false]);
});

test("a stale or cross-origin Hub index leaves the rendered catalog accessible", async () => {
  const changed = [{ ...items[0], url: "https://elsewhere.example/recipes/test-guide/" }, items[1]];
  const { input, status, cards } = await start({ format: 1, items: changed });
  assert.equal(input.disabled, true);
  assert.match(status.textContent, /Search is unavailable/);
  assert.deepEqual(cards.map(card => card.hidden), [false, false]);
});
