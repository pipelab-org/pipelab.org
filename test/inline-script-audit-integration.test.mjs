import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "parse5";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("site audit checks original HTML without stripping comment-like JSON text", (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "inline-script-audit-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if ([".git", "public", "resources"].includes(entry.name)) continue;
    const source = path.join(root, entry.name);
    const target = path.join(fixture, entry.name);
    if (entry.isDirectory()) symlinkSync(source, target, "junction");
    else if (entry.isFile()) cpSync(source, target);
  }
  const build = spawnSync(process.env.HUGO_BIN || "hugo", ["--minify", "--destination", path.join(fixture, "public"), "--quiet"], {
    cwd: root, encoding: "utf8", timeout: 30000,
  });
  assert.ifError(build.error);
  assert.equal(build.status, 0, build.stdout + build.stderr);

  for (const [route, asset] of [["gauntlet/results", "gauntlet-results"], ["install", "install"]]) {
    const html = readFileSync(path.join(fixture, "public", route, "index.html"), "utf8");
    const scripts = [];
    function walk(node) {
      if (node.tagName === "script") scripts.push(Object.fromEntries(node.attrs.map(({ name, value }) => [name, value])));
      for (const child of node.childNodes || []) walk(child);
    }
    walk(parse(html));
    const controller = scripts.find(script => script.src?.startsWith(`/js/${asset}.min.`));
    assert.ok(controller, `${route} must load its controller`);
    assert.match(controller.integrity, /^sha(256|384|512)-[A-Za-z0-9+/]+=*$/);
    assert.ok(readFileSync(path.join(fixture, "public", controller.src)).length > 0);
  }

  const page = path.join(fixture, "public/pricing/index.html");
  const original = readFileSync(page, "utf8");
  function audit(extra) {
    writeFileSync(page, original + extra);
    return spawnSync(process.execPath, [path.join(root, "scripts/site-audit.mjs"), "--skip-build"], {
      cwd: fixture, encoding: "utf8", timeout: 30000,
    });
  }
  const inert = audit('<script type="application/json">{"example":"<!-- <script>"}</script><!-- harmless -->');
  assert.ifError(inert.error);
  assert.equal(inert.status, 0, inert.stdout + inert.stderr);

  const injected = audit('<script type="application/json">{"example":"<!--"}</script><script>globalThis.inlineAuditRegression = true</script><!-- -->');
  assert.ifError(injected.error);
  assert.equal(injected.status, 1, injected.stdout + injected.stderr);
  assert.match(injected.stderr, /\/pricing\/: inline <script> is not an allowed data block/);
});
