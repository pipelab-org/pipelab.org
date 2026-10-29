import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

const repo = new URL("../", import.meta.url);
const integrations = YAML.parse(readFileSync(new URL("data/integrations.yaml", repo), "utf8"));

function render(t, entry, surface = "guide", { frontMatter = "", data } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "guide-mark-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ["content/learn", "data", "layouts/_default", "layouts/partials", "static/images/brands"]) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
  cpSync(new URL("themes/pipelab/layouts/partials/integration-guide-mark.html", repo), path.join(root, "layouts/partials/integration-guide-mark.html"));
  cpSync(new URL("themes/pipelab/layouts/partials/integration-mark.html", repo), path.join(root, "layouts/partials/integration-mark.html"));
  cpSync(new URL("themes/pipelab/layouts/partials/brands", repo), path.join(root, "layouts/partials/brands"), { recursive: true });
  cpSync(new URL("static/images/brands", repo), path.join(root, "static/images/brands"), { recursive: true });
  writeFileSync(path.join(root, "hugo.toml"), 'baseURL = "https://site.example/preview/"\n');
  writeFileSync(path.join(root, "layouts/_default/single.html"), surface === "guide" ? '<main>{{ partial "integration-guide-mark.html" . }}</main>' : "");
  cpSync(new URL("themes/pipelab/layouts/partials/works-with.html", repo), path.join(root, "layouts/partials/works-with.html"));
  writeFileSync(path.join(root, "layouts/index.html"), surface === "guide" ? "" : '{{ partial "works-with.html" . }}');
  writeFileSync(path.join(root, "content/learn/fixture.md"), `---\ntitle: Fixture\n${frontMatter}---\n`);
  writeFileSync(path.join(root, "data/integrations.json"), JSON.stringify(data ?? (surface === "rows" ? { orbit: [], rows: [{ label: "Fixture", items: [entry] }] } : { orbit: [{ x: 20, ypct: 30, ...entry, href: "/learn/fixture/" }], rows: [] })));
  const result = spawnSync("hugo", ["--source", root, "--disableKinds", "taxonomy,term,RSS,sitemap"], { encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  return { ...result, html: result.status === 0 ? readFileSync(path.join(root, surface === "guide" ? "public/learn/fixture/index.html" : "public/index.html"), "utf8") : "" };
}

test("guide renderer accepts every shipped integration mark under a subpath", async (t) => {
  for (const entry of integrations.orbit.filter((item) => item.kind !== "protocol")) {
    await t.test(entry.name, (t) => {
      const result = render(t, entry);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.html, /data-integration-mark=/);
      assert.match(result.html, /<(?:svg|img)\b/);
      if (entry.img) assert.ok(result.html.includes(`src="/preview${entry.img}"`), `expected ${entry.img} to render under the subpath`);
    });
  }
});

test("guide renderer rejects malformed mark identifiers before resolving assets", async (t) => {
  const base = { name: "Fixture", color: "#123abc" };
  const cases = [
    [{ ...base, img: "/images/brands/hermes.png", img_small: "/missing.png" }, /image asset.*missing/],
    [{ ...base, img: "/images/brands/hermes.png", img_small: "/../outside.png" }, /invalid image path/],
    ...["./claude", "brands/claude", "claude.svg", "claude\\mark", "claude mark"].map((brand) => [{ ...base, brand }, /invalid brand slug/]),
    ...["images/brands/hermes.png", "/images/./brands/hermes.png", "/images//brands/hermes.png", "/images\\brands\\hermes.png", "/images/brands/hermes.png?size=88"].map((img) => [{ ...base, img }, /invalid image path/]),
    [{ ...base, img: "/images/brands/missing.png" }, /image asset .* is missing/],
    [{ ...base, brand: "claude", color: "red" }, /invalid brand color/],
    [base, /official mark is missing/],
  ];
  for (const [entry, expected] of cases) {
    await t.test(JSON.stringify(entry), (t) => {
      const result = render(t, entry);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, expected);
    });
  }
});

test("homepage rejects configured missing images instead of rendering initials", async (t) => {
  for (const surface of ["orbit", "rows"]) {
    await t.test(surface, (t) => {
      const result = render(t, { name: "Fixture", color: "#123abc", img: "/images/brands/missing.png" }, surface);
      assert.notEqual(result.status, 0, result.html);
      assert.match(result.stdout + result.stderr, /image asset .* is missing/);
    });
  }
});

test("homepage preserves shipped marks and intentional placeholders", async (t) => {
  const entries = [...integrations.orbit, ...integrations.rows.flatMap((row) => row.items)];
  for (const surface of ["orbit", "rows"]) {
    for (const entry of [...entries, { name: "Fixture", color: "#123abc" }, { name: "Fixture", color: "#123abc", brand: "claude", img: "/missing.png" }]) {
      await t.test(`${surface}: ${entry.name}`, (t) => {
        const result = render(t, entry, surface);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const marks = [...result.html.matchAll(/<span class="hp-(?:orbit|works)-mark" aria-hidden="true">([\s\S]*?)<\/span>/g)].map((match) => match[1]);
        assert.equal(marks.length, surface === "orbit" ? 2 : 1);
        if (surface === "orbit") assert.equal(marks[0], marks[1], "desktop and mobile marks must match");
        for (const mark of marks) {
          if (entry.brand) assert.match(mark, /<svg\b/);
          else if (entry.img) assert.ok(mark.includes(`<img src="/preview${entry.img_small || entry.img}" alt="${entry.name} logo" width="28" height="28" loading="lazy" decoding="async">`));
          else assert.equal(mark, entry.name.slice(0, 2).toUpperCase());
        }
      });
    }
  }
});

test("homepage rejects malformed selected marks on orbit and rows", async (t) => {
  const cases = [
    ...["./claude", "brands/claude", "claude.svg", "claude\\mark", "claude mark"].map((brand) => [{ brand }, /invalid brand slug/]),
    ...["images/brands/hermes.png", "/images/./brands/hermes.png", "/images//brands/hermes.png", "/images\\brands\\hermes.png", "/images/brands/hermes.png?size=88", true, 42].map((img) => [{ img }, /invalid image path/]),
    [{ brand: "missing-brand" }, /partial .* not found/],
    ...[true, 42].map((brand) => [{ brand }, /invalid brand slug|partial .* not found/]),
  ];
  for (const surface of ["orbit", "rows"]) {
    for (const [mark, expected] of cases) {
      await t.test(`${surface}: ${JSON.stringify(mark)}`, (t) => {
        const result = render(t, { name: "Fixture", color: "#123abc", ...mark }, surface);
        assert.notEqual(result.status, 0);
        assert.match(result.stdout + result.stderr, expected);
      });
    }
  }
});

test("title_brand names an integration entry for pages no orbit node links to", async (t) => {
  const rowsOnly = { orbit: [], rows: [{ label: "Fixture", items: [
    { name: "Row Brand", color: "#123abc", brand: "claude", href: "/elsewhere/" },
    { name: "Row Image", color: "#abc123", img: "/images/brands/sure.svg", href: "/elsewhere/" },
  ] }] };
  const cases = [
    ['title_brand: "Row Brand"\n', /data-integration-mark="Row Brand"[^>]*style="color: #123abc;"><svg\b/],
    ['title_brand: "Row Image"\n', /data-integration-mark="Row Image"[^>]*><img src="\/preview\/images\/brands\/sure.svg"/],
    ['title_brand: "Pipelock"\n', /data-integration-mark="Pipelock"[^>]*style="color: #00e5a0;"><svg\b/],
  ];
  for (const [frontMatter, expected] of cases) {
    await t.test(frontMatter.trim(), (t) => {
      const result = render(t, {}, "guide", { frontMatter, data: rowsOnly });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.html, expected);
    });
  }
  await t.test("unknown name fails the build", (t) => {
    const result = render(t, {}, "guide", { frontMatter: 'title_brand: "Nobody"\n', data: rowsOnly });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /title_brand "Nobody" names no integration/);
  });
  await t.test("no title_brand and no orbit link renders no mark", (t) => {
    const result = render(t, {}, "guide", { data: rowsOnly });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.html, /data-integration-mark=/);
  });
});
