#!/usr/bin/env node
// Recompute even orbit positions for the works-with integrations ring.
//
// The orbit used to carry hand-authored coordinates. Every new integration was
// wedged into whatever gap looked free, so the outer ring drifted: before this
// script its spacing ranged from 26.3 to 44.1 degrees while the inner ring,
// which nobody had added to, stayed exactly even. This computes both rings from
// the geometry the template already draws, so adding an integration rebalances
// the whole ring instead of squeezing into it.
//
// Run after editing the orbit list:  node scripts/orbit-layout.mjs
// test/orbit-spacing.test.mjs fails if the file and this layout disagree.

import { readFileSync, writeFileSync } from "node:fs";

// These mirror the ellipses and viewBox in
// themes/pipelab/layouts/partials/works-with.html. If that template changes its
// rings, change these with it; the test compares against these numbers, so a
// silent drift between the two shows up as a failure rather than a crooked ring.
export const VIEWBOX = { w: 1000, h: 520, cx: 500, cy: 260 };
export const RINGS = {
  // The template gives the first INNER_COUNT nodes the inner class.
  inner: { rx: 190, ry: 120, phaseDeg: 290 },
  outer: { rx: 400, ry: 215, phaseDeg: 194 },
};
export const INNER_COUNT = 6;
export const DELAY_STEP = 0.35;

const round1 = (n) => Math.round(n * 10) / 10;

// positionsFor returns the computed geometry for one ring of `count` nodes,
// evenly spaced from the ring's phase. Angles increase clockwise in screen
// space because SVG y grows downward.
export function positionsFor(ringName, count) {
  const ring = RINGS[ringName];
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => {
    const deg = ring.phaseDeg + step * i;
    const rad = (deg * Math.PI) / 180;
    const px = VIEWBOX.cx + ring.rx * Math.cos(rad);
    const py = VIEWBOX.cy + ring.ry * Math.sin(rad);
    return {
      x: round1((px / VIEWBOX.w) * 100),
      ypct: round1((py / VIEWBOX.h) * 100),
      px: round1(px),
      py: round1(py),
    };
  });
}

// layoutFor maps a node's overall index to its computed position. Ring
// membership follows the template's own inner/outer split so the coordinates
// and the CSS class can never disagree about which ellipse a node sits on.
export function layoutFor(total) {
  const innerCount = Math.min(INNER_COUNT, total);
  const outerCount = Math.max(0, total - innerCount);
  const inner = positionsFor("inner", innerCount);
  const outer = outerCount > 0 ? positionsFor("outer", outerCount) : [];
  return [...inner, ...outer].map((p, i) => ({ ...p, delay: round1(i * DELAY_STEP) }));
}

// The orbit list is the first `orbit:` block in the data file. Rewriting only
// the numeric coordinate lines keeps every other field, comment and ordering
// exactly as the author wrote it.
const COORD_KEYS = ["x", "ypct", "px", "py", "delay"];

export function rewrite(yaml, positions) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.trim() === "orbit:");
  if (start === -1) throw new Error("orbit-layout: no `orbit:` block in the data file");

  let node = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // A new top-level key ends the orbit block.
    if (/^[a-z_]+:/i.test(line)) break;
    if (/^\s*- name:/.test(line)) {
      node += 1;
      continue;
    }
    if (node < 0 || node >= positions.length) continue;
    const m = line.match(/^(\s*)([a-z]+):\s*[-\d.]+\s*$/);
    if (!m) continue;
    const [, indent, key] = m;
    if (!COORD_KEYS.includes(key)) continue;
    lines[i] = `${indent}${key}: ${positions[node][key]}`;
  }
  if (node + 1 !== positions.length) {
    throw new Error(`orbit-layout: rewrote ${node + 1} nodes but computed ${positions.length}`);
  }
  return lines.join("\n");
}

export function countNodes(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.trim() === "orbit:");
  if (start === -1) throw new Error("orbit-layout: no `orbit:` block in the data file");
  let n = 0;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[a-z_]+:/i.test(lines[i])) break;
    if (/^\s*- name:/.test(lines[i])) n += 1;
  }
  return n;
}

const DATA_FILE = "data/integrations.yaml";

if (import.meta.url === `file://${process.argv[1]}`) {
  const yaml = readFileSync(DATA_FILE, "utf8");
  const total = countNodes(yaml);
  const next = rewrite(yaml, layoutFor(total));
  if (next === yaml) {
    console.log(`orbit-layout: ${total} nodes already evenly spaced`);
  } else {
    writeFileSync(DATA_FILE, next);
    console.log(`orbit-layout: rebalanced ${total} nodes (${Math.min(INNER_COUNT, total)} inner, ${Math.max(0, total - INNER_COUNT)} outer)`);
  }
}
