import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// v3.7.1 docs/rules.md: version-gate outcomes, additive merging, degraded state.
// The hosted bundle owns its rule count; the binary loader owns active counts.
test("community guide separates bundle totals from loaded rules and preserves the shipped load contract", () => {
  const guide = read("content/learn/community-rules.md");
  const bundle = parse(read("static/rules/pipelock-community/bundle.yaml"));
  assert.equal(Number(/bundle ships (\d+) rules/.exec(guide)[1]), bundle.rules.length);
  assert.ok(bundle.rules.some(rule => rule.status === "experimental"));
  assert.match(guide, /rules\.include_experimental: false/);
  assert.match(guide, /unprovable running build version warns and loads/);
  assert.match(guide, /rules\.allow_unversioned_bundle_load: false/);
  assert.match(guide, /cannot override or disable core or standard/);
  assert.match(guide, /strict mode[^.\n]*rules\.allow_degraded: true/);
  assert.doesNotMatch(guide, /You can override this|deduplicated by name|no longer load implicitly/);
});
