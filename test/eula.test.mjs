import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(path.join(repoRoot, file), "utf8");
const manifest = JSON.parse(read("data/eula-licenses.json"));
const page = read("content/eula.md");
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function verifyTexts(texts) {
  assert.equal(texts.length, manifest.licenses.length, "both full license texts must be present");
  for (const [index, license] of manifest.licenses.entries()) {
    assert.equal(sha256(texts[index]), license.sha256,
      `${manifest.tag}:${license.source_path} must remain byte-faithful`);
  }
}

function markdownTexts(source) {
  return [...source.matchAll(/^```text\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
}

test("EULA reproduces the pinned source files without license text drift", () => {
  verifyTexts(markdownTexts(page));
  for (const license of manifest.licenses) {
    assert.ok(page.includes(`${manifest.repository}/blob/${manifest.tag}/${license.source_path}`));
  }
});

test("license checksums reject changed whitespace, wording, truncation, and missing texts", () => {
  const texts = markdownTexts(page);
  for (const index of texts.keys()) {
    for (const change of [(text) => ` ${text}`, (text) => text.replace("License", "Licence"), (text) => text.slice(0, -1)]) {
      const changed = [...texts];
      changed[index] = change(changed[index]);
      assert.throws(() => verifyTexts(changed), /must remain byte-faithful/);
    }
  }
  assert.throws(() => verifyTexts(texts.slice(1)), /both full license texts/);
});

test("built EULA preserves both texts, legal navigation, indexing, and license precedence", (t) => {
  const destination = mkdtempSync(path.join(tmpdir(), "pipelab-eula-"));
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  const build = spawnSync(process.env.HUGO_BIN || "hugo", ["--gc", "--minify", "--destination", destination], {
    cwd: repoRoot, encoding: "utf8", timeout: 30000,
  });
  assert.ifError(build.error);
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const html = readFileSync(path.join(destination, "eula/index.html"), "utf8");
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)));
    return entities[entity];
  });
  const texts = [...html.matchAll(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/g)]
    .map((match) => decode(match[1].replace(/<[^>]*>/g, "")));
  verifyTexts(texts);
  assert.ok(/<meta name="?robots"? content="index, follow">/.test(html), "EULA is indexable");
  assert.doesNotMatch(html, /class="?article-cta\b/);
  assert.match(readFileSync(path.join(destination, "sitemap.xml"), "utf8"), /<loc>https:\/\/pipelab\.org\/eula\/<\/loc>/);
  assert.ok(/href=["']?\/eula\//.test(readFileSync(path.join(destination, "terms/index.html"), "utf8")), "Terms links to the EULA");
  assert.match(read("themes/pipelab/layouts/partials/footer.html"), /href="\/eula\/">EULA<\/a>/);
  assert.ok(read("content/terms.md").includes("Where these Terms and a code license conflict, the code license governs code rights. These Terms govern everything else: the commercial relationship, subscriptions, tokens, billing, support, website use, and the warranty and liability framework for all users (paid and free)."));
});
