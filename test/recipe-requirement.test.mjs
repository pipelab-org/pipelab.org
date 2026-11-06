import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repo = new URL("../", import.meta.url);

test("Learn pages label only a true Pro requirement and keep reading free", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "recipe-requirement-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ["content/learn", "layouts/learn", "layouts/_default", "layouts/partials"]) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
  writeFileSync(path.join(root, "hugo.toml"), 'baseURL = "https://example.com/preview/"\n');
  writeFileSync(path.join(root, "layouts/_default/baseof.html"), '<html><body>{{ block "main" . }}{{ end }}</body></html>');
  cpSync(new URL("themes/pipelab/layouts/learn/single.html", repo), path.join(root, "layouts/learn/single.html"));
  cpSync(new URL("themes/pipelab/layouts/partials/recipe-requirement.html", repo), path.join(root, "layouts/partials/recipe-requirement.html"));
  for (const name of ["integration-guide-mark", "page-formats", "article-cta", "faq", "learn-related", "site-fx"]) {
    writeFileSync(path.join(root, `layouts/partials/${name}.html`), "");
  }
  for (const [name, field] of [["paid", "requires_pro: true\n"], ["free", "requires_pro: false\n"], ["unset", ""]]) {
    writeFileSync(path.join(root, `content/learn/${name}.md`), `---\ntitle: ${name}\nrecipe: true\n${field}---\n## Steps\n\nRead the recipe.\n`);
  }
  const result = spawnSync("hugo", ["--source", root, "--disableKinds", "taxonomy,term,RSS,sitemap"], { encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const html = (name) => readFileSync(path.join(root, `public/learn/${name}/index.html`), "utf8");
  assert.match(html("paid"), /href="\/preview\/pricing\/">Requires Pro<\/a>/);
  assert.match(html("paid"), /This recipe is free to read\./);
  assert.ok(html("paid").indexOf("Requires Pro") < html("paid").indexOf('class="learn-article-meta"'));
  for (const name of ["free", "unset"]) {
    assert.doesNotMatch(html(name), /Requires Pro|learn-recipe-requirement|This recipe is free to read/);
  }
});
