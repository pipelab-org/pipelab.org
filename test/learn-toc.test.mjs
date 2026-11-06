import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../themes/pipelab/assets/js/learn-toc.js", import.meta.url), "utf8");
test("responsive disclosure changes do not replace the reader's mobile preference", () => {
  let toggle, change;
  const disclosure = { open: false, dataset: {}, addEventListener(_, fn) { toggle = fn; }, setAttribute() { this.open = true; }, removeAttribute() { this.open = false; } };
  const mql = { matches: true, addEventListener(_, fn) { change = fn; } };
  vm.runInNewContext(source, { document: { querySelector: selector => selector === ".learn-toc-disclosure" ? disclosure : null, querySelectorAll: () => [] }, window: { matchMedia: () => mql } });
  toggle();
  function resize(desktop) { mql.matches = desktop; change(); toggle(); }
  resize(false);
  assert.equal(disclosure.open, false);
  resize(true); resize(false);
  assert.equal(disclosure.open, false);
  disclosure.open = true; toggle();
  resize(true); resize(false);
  assert.equal(disclosure.open, true);
  disclosure.open = false; toggle();
  resize(true); resize(false);
  assert.equal(disclosure.open, false);
});
