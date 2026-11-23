import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse as yaml } from "yaml";
import { verifyStagingClosed } from "../scripts/hub/staging-publication.mjs";
import { stagingFailureLabel } from "../scripts/hub/staging-diagnostics.mjs";
import { stagingBuildEnvironment } from "../scripts/hub/staging-workflow.mjs";
import { installWranglerDependencies } from "../scripts/hub/staging-wrangler.mjs";

const manifest = () => ({ format: 1, entries: [
  { route: "/hub/", ownership: "hub", representations: ["html", "mirror"] },
  ...["/hub/index.json", "/hub/build.json", "/schemas/pipelab-hub/listing-v1.json"].map(route => ({ route, ownership: "hub", representations: ["json"] })),
  { route: "/hub/otherwise-unlisted/", ownership: "hub", representations: ["html", "mirror"] },
  { route: "/hub/otherwise-unlisted/bundle.yaml", ownership: "hub", representations: ["raw"] },
] });
const environment = { CF_ACCESS_CLIENT_ID: "synthetic", CF_ACCESS_CLIENT_SECRET: "synthetic" };
const closedOptions = (calls, exposed) => ({
  environment, converge: check => check(),
  request: async (route, options) => {
    calls.push(route);
    const authenticated = options.headers?.["CF-Access-Client-Id"] === "synthetic";
    return { status: !authenticated ? 403 : route === exposed ? 200 : 404, headers: {}, body: Buffer.alloc(0) };
  },
});

test("guard:close-manifest-required", async () => {
  for (const value of [undefined, {}, { format: 1, entries: [] }, { ...manifest(), format: 2 }]) {
    const calls = [];
    await assert.rejects(verifyStagingClosed({ manifest: value }, closedOptions(calls)), /complete closure manifest required/);
    assert.deepEqual(calls, []);
  }
  const incomplete = manifest(); incomplete.entries = incomplete.entries.filter(entry => entry.route !== "/hub/build.json");
  await assert.rejects(verifyStagingClosed({ manifest: incomplete }, closedOptions([])), /complete closure manifest required/);
});
test("guard:close-full-manifest", async () => {
  const routes = ["/hub/otherwise-unlisted/", "/hub/otherwise-unlisted/index.html", "/hub/otherwise-unlisted/index.md", "/hub/otherwise-unlisted/bundle.yaml"];
  for (const route of routes) {
    const calls = [];
    await assert.rejects(verifyStagingClosed({ manifest: manifest() }, closedOptions(calls, route)), error => {
      assert.match(error.message, /closed version must be the static-only staging Worker/);
      assert.match(stagingFailureLabel(error), /closed version must be the static-only staging Worker/); return true;
    });
    assert.ok(calls.includes(route));
  }
  const calls = [], result = await verifyStagingClosed({ manifest: manifest() }, closedOptions(calls));
  assert.equal(result.checked, 11);
  for (const route of routes) assert.equal(calls.filter(value => value === route).length, 3);
});
test("guard:close-workflow-manifest-download", () => {
  const workflow = yaml(readFileSync(new URL("../.github/workflows/hub-staging.yml", import.meta.url), "utf8"));
  const step = workflow.jobs.deploy.steps.find(item => item.run?.includes("staging-artifact.mjs download"));
  assert.equal(step.if, undefined);
  assert.equal(step["continue-on-error"], "${{ inputs.operation == 'close' }}");
  assert.match(step.env.PACKAGE_ARTIFACT_ID, /inputs.package_artifact_id/);
  const recovery = workflow.jobs.deploy.steps.find(item => item.name?.startsWith("Recover closed"));
  assert.match(recovery.if, /always\(\)/);
});
test("guard:dry-run-secret-environment", () => {
  assert.deepEqual(stagingBuildEnvironment({ PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example", lower_token: "synthetic", lower_secret: "synthetic", cf_access_client_id: "synthetic" }),
    { PATH: "/usr/bin", HTTPS_PROXY: "http://proxy.example" });
});
test("guard:wrangler-exact-direct-dependencies", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-dependency-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const metadata = { dependencies: { fixture: "1.2.3" }, optionalDependencies: { optional: "2.0.0-beta.1" } };
  let calls = 0;
  const run = async (command, args, options) => {
    calls++;
    assert.equal(command, "npm"); assert.deepEqual(args, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"]);
    assert.equal(options.cwd, directory);
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, "package.json"))), { private: true, ...metadata });
  };
  await installWranglerDependencies(directory, metadata, { run }); assert.equal(calls, 1);
  for (const dependency of ["^1.2.3", "latest"]) {
    await assert.rejects(installWranglerDependencies(directory, { ...metadata, dependencies: { fixture: dependency } }, { run: async () => { calls++; } }), /direct dependencies must use exact versions/);
    assert.equal(calls, 1);
  }
});

test("guard:close-diagnostic-redaction", () => {
  const error = new AggregateError([new Error("staging alternate ingress is enabled or unverified"), new Error("synthetic-sensitive-diagnostic")], "closed staging post-activation checks failed");
  assert.equal(stagingFailureLabel(error), "closure_postchecks:ingress,closure");
  assert.doesNotMatch(stagingFailureLabel(error), /synthetic-sensitive/);
});

test("guard:closure-host-denial", async () => {
  for (const exposed of ["/", "/api/results"]) {
    const options = closedOptions([]), original = options.request;
    options.request = async (route, options) => route === exposed && options.headers?.["CF-Access-Client-Id"] !== "synthetic" ?
      { status: 200, headers: {}, body: Buffer.from("exposed host") } : original(route, options);
    await assert.rejects(verifyStagingClosed({ manifest: manifest() }, options), /Access denial not established/);
  }
});
