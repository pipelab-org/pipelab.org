import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../themes/pipelab/assets/js/integration-orbit.js", import.meta.url), "utf8");

function fakeClassList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    toggle: (value, enabled) => enabled ? values.add(value) : values.delete(value),
  };
}

test("hidden orbit resumes with finite thread coordinates when it becomes visible", () => {
  let box = { width: 0, height: 0, top: 0 };
  let resizeCallback;
  let intersectionCallback;
  let animationCallback;
  const threads = Array.from({ length: 2 }, () => {
    const attributes = new Map();
    return {
      attributes,
      classList: fakeClassList(),
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name),
    };
  });
  const listeners = Array.from({ length: 2 }, () => new Map());
  const nodes = [
    { x: "56.5%", y: "28.3%", classList: fakeClassList(["hp-orbit-node-inner"]), style: {}, addEventListener: (name, callback) => listeners[0].set(name, callback) },
    { x: "86.3%", y: "67.4%", classList: fakeClassList(), style: {}, addEventListener: (name, callback) => listeners[1].set(name, callback) },
  ];
  const orbit = {
    classList: fakeClassList(),
    style: { setProperty() {} },
    querySelectorAll(selector) {
      if (selector === ".hp-orbit-node") return nodes;
      if (selector === ".hp-orbit-thread") return threads;
      return [];
    },
    getBoundingClientRect: () => ({ ...box }),
  };
  const reduceMotion = { matches: false, addEventListener() {} };
  const desktop = { matches: true, addEventListener() {} };
  const context = {
    document: { querySelectorAll: (selector) => selector === ".hp-orbit" ? [orbit] : [] },
    window: {
      matchMedia: (query) => query.includes("prefers-reduced-motion") ? reduceMotion : desktop,
      scrollY: 0,
      addEventListener() {},
      removeEventListener() {},
    },
    getComputedStyle: (node) => ({
      getPropertyValue: (property) => property === "--x" ? node.x : node.y,
    }),
    performance: { now: () => 100 },
    requestAnimationFrame(callback) {
      animationCallback = callback;
      return 1;
    },
    cancelAnimationFrame() {
      animationCallback = undefined;
    },
    ResizeObserver: class {
      constructor(callback) { resizeCallback = callback; }
      observe() {}
    },
    IntersectionObserver: class {
      constructor(callback) { intersectionCallback = callback; }
      observe() {}
    },
  };
  context.window.ResizeObserver = context.ResizeObserver;
  context.window.IntersectionObserver = context.IntersectionObserver;

  vm.runInNewContext(source, context);
  assert.ok(resizeCallback);
  assert.ok(intersectionCallback);
  assert.equal(threads[0].getAttribute("x2"), undefined);

  box = { width: 1000, height: 520, top: 100 };
  intersectionCallback([{ isIntersecting: true }]);
  assert.ok(animationCallback);
  animationCallback(200);
  for (const thread of threads) {
    assert.equal(Number.isFinite(Number(thread.getAttribute("x2"))), true);
    assert.equal(Number.isFinite(Number(thread.getAttribute("y2"))), true);
  }

  listeners[0].get("pointerenter")();
  assert.equal(orbit.classList.contains("has-active-node"), true);
  assert.equal(nodes[0].classList.contains("is-active"), true);
  assert.equal(threads[0].classList.contains("is-active"), true);
  assert.equal(typeof animationCallback, "function", "pointer tracing must not pause orbital motion");
  listeners[0].get("pointerleave")();
  assert.equal(orbit.classList.contains("has-active-node"), false);

  box = { width: 0, height: 0, top: 0 };
  resizeCallback();
  box = { width: 1000, height: 520, top: 100 };
  intersectionCallback([{ isIntersecting: true }]);
  for (const thread of threads) {
    assert.equal(Number.isFinite(Number(thread.getAttribute("x2"))), true);
    assert.equal(Number.isFinite(Number(thread.getAttribute("y2"))), true);
  }
});
