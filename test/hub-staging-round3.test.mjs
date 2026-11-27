import assert from "node:assert/strict";
import test from "node:test";
import { assertVersionConfig, routeTargetsStaging } from "../scripts/hub/cloudflare-staging.mjs";
import { hugoBuildEnvironment } from "../scripts/hub/acceptance.mjs";
import { stagingBuildEnvironment } from "../scripts/hub/staging-workflow.mjs";
import { stagingFailureLabel } from "../scripts/hub/staging-diagnostics.mjs";
import { wranglerEnvironment, wranglerUploadEnvironment } from "../scripts/hub/staging-wrangler.mjs";
import { normalizeHostname, STAGING_ORIGIN } from "../scripts/hub/staging-target.mjs";
import worker from "../src/worker.js";

const config = { compatibility_date: "2026-02-10", compatibility_flags: ["one", "two"] };
const resources = () => ({ bindings: [], script_runtime: { ...config, compatibility_flags: ["two", "one"] } });
test("version metadata accepts only equivalent documented shapes", () => {
  for (const bindings of [[], {}]) for (const date of ["2026-02-10", "2026-02-10T00:00:00Z"]) {
    assert.doesNotThrow(() => assertVersionConfig({ bindings, script_runtime: { compatibility_date: date, compatibility_flags: ["two", "one"] } }, config));
  }
  assert.doesNotThrow(() => assertVersionConfig({ bindings: [], script_runtime: { compatibility_date: config.compatibility_date } }, { compatibility_date: config.compatibility_date }));
});
test("guard:version-date-shape", () => {
  assert.throws(() => assertVersionConfig({ bindings: [], script_runtime: { compatibility_flags: config.compatibility_flags } }, { compatibility_flags: config.compatibility_flags }), /version configuration differs/);
  for (const date of ["2026-02-10T01:00:00Z", "2026-02-10T00:00:00.000Z", "2026-02-10T00:00:00+00:00", "2026-02-11", "2026-02-10suffix"]) {
    const actual = resources(); actual.script_runtime.compatibility_date = date;
    assert.throws(() => assertVersionConfig(actual, config), /version configuration differs/);
  }
});
test("guard:version-binding-empty", () => {
  for (const bindings of [[{ type: "secret_text", name: "unexpected" }], { unexpected: {} }, undefined, null]) {
    assert.throws(() => assertVersionConfig({ ...resources(), bindings }, config), /version configuration differs/);
  }
});
test("guard:version-flag-set", () => {
  assert.throws(() => assertVersionConfig({ bindings: [], script_runtime: { compatibility_date: config.compatibility_date, compatibility_flags: "x" } }, { compatibility_date: config.compatibility_date, compatibility_flags: ["x"] }), /version configuration differs/);
  for (const flags of [undefined, null, [], ["one"], ["one", "two", "extra"], "one", [null]]) {
    const actual = resources(); actual.script_runtime.compatibility_flags = flags;
    assert.throws(() => assertVersionConfig(actual, config), /version configuration differs/);
  }
});
test("guard:zone-host-overrides", () => {
  for (const route of [
    { pattern: "hub-staging.pipelab.org/any-path", script: "other" },
    { pattern: "hub-staging.pipelab.org/*" },
    { pattern: "*.pipelab.org/*", script: "other" },
    { pattern: "https://*pipelab.org/specific", script: null },
    { pattern: "www.pipelab.org/*", script: "PIPELAB-ORG-HUB-STAGING" },
    { pattern: "unknown:shape", script: "other" },
  ]) assert.equal(routeTargetsStaging(route), true, JSON.stringify(route));
  assert.equal(routeTargetsStaging({ pattern: "www.pipelab.org/*", script: "other" }), false);
});
test("guard:staging-static-only", async () => {
  let reads = 0; const env = new Proxy({}, { get() { reads++; throw new Error("API handler reached"); } });
  for (const [method, route] of [["POST", "/api/gh-advisory"], ["GET", "/api/results"], ["OPTIONS", "/api/contact"], ["GET", "/"]]) {
    const response = await worker.fetch(new Request("https://hub-staging.pipelab.org" + route, { method }), env);
    assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(reads, 0);
  assert.equal((await worker.fetch(new Request("https://pipelab.org/api/contact", { method: "OPTIONS" }), env)).status, 204);
});
test("guard:additional-secret-names", () => {
  const environment = { PATH: "/usr/bin", api_key_lower: "synthetic", lower_password: "synthetic",
    ...Object.fromEntries(["KEY_ID", "ACCESS_KEY", "PRIVATE_KEY", "CREDENTIAL", "CREDENTIALS", "PASSWD", "APIKEY", "NODE_OPTIONS"].map(name => [name.toLowerCase(), "synthetic"])) };
  for (const clean of [hugoBuildEnvironment, stagingBuildEnvironment, wranglerEnvironment]) assert.deepEqual(clean(environment), { PATH: "/usr/bin" });
});
test("only the Wrangler upload receives its specific deployment settings", () => {
  const clean = { PATH: "/usr/bin", HtTpS_PrOxY: "http://fixture.invalid" };
  const upload = { CLOUDFLARE_ACCOUNT_ID: "synthetic", CLOUDFLARE_API_TOKEN: "synthetic", WRANGLER_OUTPUT_FILE_PATH: "/fixture" };
  const protectedSet = { ...clean, ...upload, HUB_STAGING_CLOSED_VERSION: "synthetic", HUB_STAGING_LEDGER_REPOSITORY: "synthetic",
    HUB_STAGING_LEDGER_NONCE: "synthetic", CASE_LEDGER_TOKEN: "synthetic", NODE_PATH: "/fixture" };
  assert.deepEqual(stagingBuildEnvironment(protectedSet), clean);
  assert.deepEqual(wranglerEnvironment(protectedSet), clean);
  assert.deepEqual(wranglerUploadEnvironment(protectedSet), { ...clean, ...upload });
});
test("guard:evidence-diagnostics", () => {
  assert.equal(stagingFailureLabel(Object.assign(new Error("sensitive path"), { code: "ENOENT" })), "missing_evidence");
  const missing = Object.assign(new Error("sensitive path"), { code: "ENOENT" });
  assert.equal(stagingFailureLabel(new AggregateError([missing], "closed staging post-activation checks failed")), "closure_postchecks:missing_evidence");
  assert.equal(stagingFailureLabel(new Error("non-finite or undefined evidence")), "evidence_format");
  assert.equal(stagingFailureLabel(new Error("staging version configuration differs")), "version_configuration");
});

test("guard:staging-host-normalization", async () => {
  const hostname = new URL(STAGING_ORIGIN).hostname;
  assert.equal(normalizeHostname(hostname.toUpperCase() + ".."), hostname);
  const env = new Proxy({}, { get() { assert.fail("staging must never enter an API handler"); } });
  for (const suffix of [".", "%2e", "..", "%2e%2e"]) {
    for (const method of ["POST", "OPTIONS"]) {
      const response = await worker.fetch(new Request("https://" + hostname.toUpperCase() + suffix + "/api/gh-advisory", { method }), env);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(routeTargetsStaging({ pattern: "https://" + hostname + suffix + "/*", script: "other" }), true);
  }
  assert.equal((await worker.fetch(new Request("https://pipelab.org./api/contact", { method: "OPTIONS" }), env)).status, 204);
  assert.equal(routeTargetsStaging({ pattern: "www.pipelab.org../*", script: "other" }), false);
});
