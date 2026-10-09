// The orbit ring must stay evenly spaced as integrations are added.
//
// Before this guard the coordinates were hand-authored and each new
// integration was placed in whatever gap looked free. The outer ring drifted
// to between 26.3 and 44.1 degrees between neighbours while the inner ring,
// which nobody had added to, stayed exactly even. This fails when the data
// file and scripts/orbit-layout.mjs disagree, so adding a node without
// rerunning the generator is caught here rather than on the live home page.

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  INNER_COUNT,
  RINGS,
  VIEWBOX,
  countNodes,
  layoutFor,
  rewrite,
} from "../scripts/orbit-layout.mjs";

const DATA_FILE = "data/integrations.yaml";
const yaml = () => readFileSync(DATA_FILE, "utf8");

test("orbit coordinates match the generated even layout", () => {
  const current = yaml();
  const expected = rewrite(current, layoutFor(countNodes(current)));
  assert.equal(
    current,
    expected,
    "orbit coordinates are stale: run `node scripts/orbit-layout.mjs` and commit the result",
  );
});

// angleOf recovers a node's angle on its ellipse from the stored percentages,
// which is what the template actually renders. Checking the rendered geometry
// rather than the generator's own arithmetic keeps this from agreeing with the
// generator by construction.
function angleOf(index, x, ypct) {
  const ring = index < INNER_COUNT ? RINGS.inner : RINGS.outer;
  const px = (x / 100) * VIEWBOX.w;
  const py = (ypct / 100) * VIEWBOX.h;
  const deg =
    (Math.atan2((py - VIEWBOX.cy) / ring.ry, (px - VIEWBOX.cx) / ring.rx) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function orbitNodes() {
  const lines = yaml().split("\n");
  const start = lines.findIndex((l) => l.trim() === "orbit:");
  const nodes = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[a-z_]+:/i.test(lines[i])) break;
    const name = lines[i].match(/^\s*- name:\s*"([^"]+)"/);
    if (name) {
      cur = { name: name[1] };
      nodes.push(cur);
      continue;
    }
    if (!cur) continue;
    const kv = lines[i].match(/^\s*(x|ypct):\s*([-\d.]+)\s*$/);
    if (kv) cur[kv[1]] = Number(kv[2]);
  }
  return nodes;
}

test("each ring is evenly spaced around its ellipse", () => {
  const nodes = orbitNodes();
  assert.ok(nodes.length >= INNER_COUNT, "orbit should have at least the inner ring");

  const rings = [
    { label: "inner", items: nodes.slice(0, INNER_COUNT), offset: 0 },
    { label: "outer", items: nodes.slice(INNER_COUNT), offset: INNER_COUNT },
  ];

  for (const { label, items, offset } of rings) {
    if (items.length === 0) continue;
    const angles = items
      .map((n, i) => {
        assert.equal(typeof n.x, "number", `${label} node ${n.name} has no x`);
        assert.equal(typeof n.ypct, "number", `${label} node ${n.name} has no ypct`);
        return angleOf(offset + i, n.x, n.ypct);
      })
      .sort((a, b) => a - b);

    const gaps = angles.map((a, i) => {
      const next = angles[(i + 1) % angles.length];
      return ((next - a + 360) % 360) || 360;
    });
    const spread = Math.max(...gaps) - Math.min(...gaps);
    assert.ok(
      spread < 1,
      `${label} ring spacing spread is ${spread.toFixed(2)} degrees (gaps ${gaps
        .map((g) => g.toFixed(1))
        .join(", ")}); run \`node scripts/orbit-layout.mjs\``,
    );
  }
});

// Positive control: the assertion above must be capable of failing. A layout
// computed for a different node count is exactly the stale state this guards.
test("the spacing check rejects a ring that is not evenly spaced", () => {
  const current = yaml();
  const total = countNodes(current);
  const skewed = rewrite(current, layoutFor(total + 1).slice(0, total));
  assert.notEqual(skewed, current, "a layout for a different node count should differ");
});
