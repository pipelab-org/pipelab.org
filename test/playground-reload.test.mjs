import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../themes/pipelab/assets/js/site-base.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../themes/pipelab/layouts/playground/list.html", import.meta.url), "utf8");
const buttonTag = template.match(/<button\b[^>]*\bdata-demo-reload\b[^>]*>/)?.[0];
const attributes = new Map(Array.from((buttonTag || "").matchAll(/([\w-]+)="([^"]*)"/g), (match) => [match[1], match[2]]));
const iframeTag = template.match(/<iframe\b[^>]*>/)?.[0] || "";
const iframeClasses = (iframeTag.match(/\bclass="([^"]*)"/)?.[1] || "").split(/\s+/);
const templateHasDemoFrame = iframeClasses.includes("playground-demo-frame") && /\bsrc="[^"]+"/.test(iframeTag);

function setup({ hasFrame = true } = {}) {
  const listeners = [];
  const assignments = [];
  const events = [];
  const frameURL = "https://demo.vendor.example/?v=fixture";
  const frame = {
    getAttribute: (name) => name === "src" ? frameURL : null,
    set src(value) { assignments.push(value); },
  };
  const button = { getAttribute: (name) => attributes.get(name) || null };
  button.closest = (selector) => ["[data-demo-reload]", "[data-event]"].includes(selector) ? button : null;
  const window = { location: { pathname: "/playground/" }, addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(source, {
    window,
    document: {
      getElementById: () => null,
      querySelector: (selector) => selector === ".playground-demo-frame" && hasFrame && templateHasDemoFrame ? frame : null,
      addEventListener: (name, callback, capture) => {
        if (name === "click") listeners.push({ callback, capture: capture === true });
      },
    },
    setTimeout() {},
  });
  window.gtag = (...args) => events.push(["ga4", ...args]);
  window.posthogReady = (callback) => callback({ capture: (...args) => events.push(["posthog", ...args]) });
  return {
    assignments, events, button, frameURL,
    click(target = button) {
      for (const capture of [true, false]) {
        for (const listener of listeners.filter((item) => item.capture === capture)) listener.callback({ target });
      }
    },
  };
}

test("fallback is a reload button without an outbound link or inline handler", () => {
  assert.ok(buttonTag);
  assert.equal(attributes.get("type"), "button");
  assert.equal(attributes.get("data-event"), "playground_demo_reload_clicked");
  assert.equal(attributes.get("data-event-placement"), "embedded-demo");
  assert.doesNotMatch(buttonTag, /\b(?:href|target|onclick)=/i);
  assert.doesNotMatch(template, /<a\b[^>]*href=["']https:\/\/playground\.pipelab\.org/i);
});

test("the template iframe carries the class the reload handler queries, with a src to reload", () => {
  assert.ok(templateHasDemoFrame, `expected an iframe with class "playground-demo-frame" and a src, got: ${iframeTag}`);
});

test("each activation reassigns the original iframe URL, including its query", () => {
  const page = setup();
  page.click();
  page.click();
  assert.deepEqual(page.assignments, [page.frameURL, page.frameURL]);
});

test("clicks on button descendants reach the reload control", () => {
  const page = setup();
  page.click({ closest: (selector) => page.button.closest(selector) });
  assert.deepEqual(page.assignments, [page.frameURL]);
});

test("unrelated clicks and non-element targets do not reload the iframe", () => {
  const page = setup();
  page.click({ closest: () => null });
  page.click({});
  page.click(null);
  assert.deepEqual(page.assignments, []);
  assert.deepEqual(page.events, []);
});

test("pages without the demo frame tolerate activation", () => {
  const page = setup({ hasFrame: false });
  assert.doesNotThrow(() => page.click());
  assert.deepEqual(page.assignments, []);
});

test("reload activation still reaches both analytics dispatchers once", () => {
  const page = setup();
  page.click();
  assert.equal(page.events.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(page.events)), [
    ["posthog", "playground_demo_reload_clicked", { source_path: "/playground/", placement: "embedded-demo" }],
    ["ga4", "event", "playground_demo_reload_clicked", { source_path: "/playground/", placement: "embedded-demo" }],
  ]);
});
