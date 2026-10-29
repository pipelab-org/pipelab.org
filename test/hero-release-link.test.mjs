import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repo = new URL("../", import.meta.url).pathname;

// Hugo reads `_` in HUGO_ variables as nesting; the `HUGOx...x` form names a
// different delimiter so `pipelock_version` stays one key.
function build(t, version) {
  const out = mkdtempSync(path.join(tmpdir(), "hero-release-link-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const result = spawnSync("hugo", ["--source", repo, "--destination", out], {
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, HUGOxPARAMSxPIPELOCK_VERSION: version },
  });
  return { ...result, html: result.status === 0 ? readFileSync(path.join(out, "index.html"), "utf8") : "" };
}

test("homepage hero links a patch release to its minor release post", (t) => {
  const result = build(t, "3.6.2");
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.html, /\/blog\/pipelock-v360-release\//);
});

test("homepage hero fails the build when the release post does not exist", (t) => {
  const result = build(t, "3.9.0");
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /hero-home: no release post at \/blog\/pipelock-v390-release/);
});
