import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("sitemap preserves editorial dates across link edits and depth-two clones", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "sitemap-freshness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  mkdirSync(path.join(source, "content"), { recursive: true });
  mkdirSync(path.join(source, "layouts/_default"), { recursive: true });
  cpSync(new URL("../layouts/_default/sitemap.xml", import.meta.url), path.join(source, "layouts/_default/sitemap.xml"));
  // Enable GitInfo to prove the template ignores both real and grafted dates.
  writeFileSync(path.join(source, "hugo.toml"), 'baseURL = "https://example.org/"\nenableGitInfo = true\n[frontmatter]\nlastmod = ["lastmod", "modified", "date", "publishDate"]\n[params]\nsitemap_git_since = "2026-10-09T23:59:59Z"\n');
  writeFileSync(path.join(source, "layouts/_default/single.html"), "{{ .Content }}");
  const editorial = '---\ntitle: Editorial\ndate: 2026-08-01\nlastmod: 2026-09-01\n---\n';
  writeFileSync(path.join(source, "content/editorial.md"), editorial + "[Source](https://example.org/old/)\n");
  writeFileSync(path.join(source, "content/dated.md"), '---\ntitle: Dated\ndate: 2026-08-02\n---\n');
  writeFileSync(path.join(source, "content/undated.md"), '---\ntitle: Undated\n---\n');
  writeFileSync(path.join(source, "content/hidden.md"), '---\ntitle: Hidden\nrobots: "noindex, follow"\n---\n');
  function run(cwd, command, args, env = {}) {
    const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim();
  }
  run(source, "git", ["init", "-q"]);
  run(source, "git", ["config", "user.name", "Fixture"]);
  run(source, "git", ["config", "user.email", "fixture@example.org"]);
  function commit(date) {
    run(source, "git", ["add", "content", "layouts", "hugo.toml"]);
    run(source, "git", ["commit", "-qm", "Update fixture"], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  }
  commit("2026-10-15T12:00:00Z");
  writeFileSync(path.join(source, "content/editorial.md"), editorial + "[Source](https://example.org/final/)\n");
  commit("2026-10-16T12:00:00Z");
  writeFileSync(path.join(source, "content/other.md"), '---\ntitle: Other\ndate: 2026-10-17\n---\n');
  commit("2026-10-17T12:00:00Z");
  function sitemap(cwd) {
    run(cwd, "hugo", ["--quiet"]);
    return readFileSync(path.join(cwd, "public/sitemap.xml"), "utf8");
  }
  const full = sitemap(source);
  const shallow = path.join(root, "shallow");
  run(root, "git", ["clone", "-q", "--depth", "2", `file://${source}`, shallow]);
  assert.equal(run(shallow, "git", ["rev-parse", "--is-shallow-repository"]), "true");
  assert.equal(sitemap(shallow), full);
  assert.match(full, /<loc>https:\/\/example.org\/editorial\/<\/loc>\s*<lastmod>2026-09-01T/);
  assert.match(full, /<loc>https:\/\/example.org\/dated\/<\/loc>\s*<lastmod>2026-08-02T/);
  assert.match(full, /<loc>https:\/\/example.org\/undated\/<\/loc>\s*<\/url>/);
  assert.doesNotMatch(full, /https:\/\/example.org\/hidden\//);
});
