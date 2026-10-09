import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Learn, Compare, and Blog use one server-rendered editorial index", async () => {
  const [learn, compare, blog, learnCard, compareCard, blogCard, sharedCard, sharedScript, editorialStyle, style] = await Promise.all([
    read("themes/pipelab/layouts/learn/list.html"),
    read("themes/pipelab/layouts/compare/list.html"),
    read("themes/pipelab/layouts/blog/list.html"),
    read("themes/pipelab/layouts/partials/learn-index-card.html"),
    read("themes/pipelab/layouts/partials/compare-index-card.html"),
    read("themes/pipelab/layouts/partials/blog-index-card.html"),
    read("themes/pipelab/layouts/partials/editorial-index-card.html"),
    read("themes/pipelab/assets/js/editorial-index.js"),
    read("themes/pipelab/assets/scss/_editorial-index.scss"),
    read("themes/pipelab/assets/scss/style.scss"),
  ]);

  for (const [name, source] of [["Learn", learn], ["Compare", compare], ["Blog", blog]]) {
    assert.match(source, /data-editorial-index/, `${name} must use the shared controller root`);
    assert.match(source, /partial "editorial-index-script\.html"/, `${name} must load the shared controller`);
    assert.doesNotMatch(source, /<script>/, `${name} must not restore a page-local controller`);
    assert.doesNotMatch(source, /data-(learn|compare)-toolbar|data-card-grid/, `${name} must not restore the retired index API`);
  }

  assert.match(learn, /data-category-group/, "Learn must render grouped chapters without JavaScript");
  assert.match(compare, /data-category-group/, "Compare must render grouped chapters without JavaScript");

  assert.match(learn, /data-directory-default="Browse by subject"/);
  assert.match(compare, /data-directory-default="Browse by category"/);

  assert.match(learnCard, /partial "editorial-index-card\.html"/);
  assert.match(compareCard, /partial "editorial-index-card\.html"/);
  assert.match(blogCard, /partial "editorial-index-card\.html"/);
  assert.match(sharedCard, /data-directory-card/);
  assert.match(sharedScript, /root\.querySelectorAll\('\[data-directory-card\]'\)/);
  assert.match(sharedScript, /root\.dataset\.directoryDefault/);
  assert.equal(sharedScript.match(/document\.addEventListener\('keydown'/g)?.length, 1, "the global search shortcut must have one owner");
  assert.match(sharedScript, /\}\);\s+document\.addEventListener\('keydown'/, "the global shortcut must be registered outside the per-root loop");
  assert.match(sharedScript, /activeSearch && activeSearch\.isConnected \? activeSearch : searches\[0\]/, "the shortcut must target one active index");
  const featuredCardStyle = editorialStyle.slice(
    editorialStyle.indexOf(".editorial-index-card--featured"),
    editorialStyle.indexOf(".editorial-index-card-marker"),
  );
  assert.doesNotMatch(featuredCardStyle, /bottom:\s*1\.2rem/, "featured cards must not restore the decorative bottom rule");
  assert.doesNotMatch(featuredCardStyle, /\.editorial-index-card-meta[\s\S]*border-top:/, "featured cards must not turn metadata into another bottom rule");
  assert.doesNotMatch(featuredCardStyle, /\.editorial-index-card-meta\s*\{/, "featured cards must not wrap metadata in a second container");
  for (const source of [learn, compare, blog]) {
    assert.match(source, /editorial-index-search-field/, "search controls must share one vertically centered field wrapper");
  }
  assert.match(style, /@import 'editorial-index';/);
  assert.equal(existsSync(new URL("../themes/pipelab/assets/scss/_learn-index.scss", import.meta.url)), false);
  assert.equal(existsSync(new URL("../themes/pipelab/assets/scss/_blog-index.scss", import.meta.url)), false);
});

test("Blog articles load one fingerprinted behavior module", async () => {
  const [article, scriptPartial] = await Promise.all([
    read("themes/pipelab/layouts/blog/single.html"),
    read("themes/pipelab/layouts/partials/blog-article-script.html"),
  ]);

  assert.doesNotMatch(article, /<script>/, "Blog articles must not restore an inline behavior copy");
  assert.match(article, /partial "blog-article-script\.html"/);
  assert.match(scriptPartial, /resources\.Get "js\/blog-article\.js" \| minify \| fingerprint/);
});

test("Enterprise and Assess use the shared showpiece chapter contract", async () => {
  const [enterprise, assess, style] = await Promise.all([
    read("themes/pipelab/layouts/enterprise/single.html"),
    read("themes/pipelab/layouts/assess/single.html"),
    read("themes/pipelab/assets/scss/style.scss"),
  ]);

  for (const [name, source, chapters] of [["Enterprise", enterprise, 7], ["Assess", assess, 6]]) {
    assert.match(source, /showpiece-page/, `${name} must opt into shared page behavior`);
    assert.match(source, /showpiece-mini-nav/, `${name} must use the shared mini-nav treatment`);
    assert.equal(source.match(/class="[^"]*showpiece-chapter"/g)?.length, chapters, `${name} chapter count drifted`);
    assert.equal(source.match(/showpiece-chapter-kicker/g)?.length, chapters, `${name} chapter labels must stay standardized`);
    assert.match(source, /showpiece-final/, `${name} must use the shared final action treatment`);
  }

  assert.match(style, /@import 'showpiece-pages';/);
});

test("copyable command rows keep one shared padding contract", async () => {
  const [components, home, project, install] = await Promise.all([
    read("themes/pipelab/assets/scss/_components.scss"),
    read("themes/pipelab/assets/scss/_home.scss"),
    read("themes/pipelab/assets/scss/_project-pages.scss"),
    read("themes/pipelab/assets/scss/_install-page.scss"),
  ]);

  const commandRule = components.slice(
    components.indexOf("button[data-cmd-copy]"),
    components.indexOf("// Fenced shell commands"),
  );
  assert.match(commandRule, /padding:\s*var\(--cmd-row-padding, 0\.85rem 1rem\);/);
  assert.doesNotMatch(commandRule, /padding:\s*0;/, "standalone command rows must not return to a flush-left default");
  assert.match(home, /\.hp-term-body\s*\{\s*--cmd-row-padding:\s*0;/, "Home already owns its terminal inset");
  assert.match(project, /\.project-command\s*\{\s*--cmd-row-padding:\s*0;/, "project command cards already own their inset");
  assert.match(install, /\.inst-tabs\s*\{[\s\S]*?justify-content:\s*center;/, "Install methods must stay centered");
  assert.match(install, /\.inst-term-body\s*\{\s*--cmd-row-padding:\s*1\.3rem 1\.2rem;/, "Install command rows must keep their intended inset");
});

test("integration colors are validated before entering style attributes", async () => {
  const worksWith = await read("themes/pipelab/layouts/partials/works-with.html");

  assert.match(worksWith, /\$brandColorPattern := `\^#\[0-9A-Fa-f\]\{6\}\$`/);
  assert.match(worksWith, /has invalid brand color/);
  assert.equal(worksWith.match(/findRE \$brandColorPattern/g)?.length, 2);
});

test("Proof and Gauntlet share one artifact bar component", async () => {
  const [proof, gauntlet, results, partial, sharedStyle, proofStyle] = await Promise.all([
    read("themes/pipelab/layouts/proof/single.html"),
    read("themes/pipelab/layouts/gauntlet/list.html"),
    read("themes/pipelab/layouts/gauntlet/results.html"),
    read("themes/pipelab/layouts/partials/artifact-bar.html"),
    read("themes/pipelab/assets/scss/_fx-components.scss"),
    read("themes/pipelab/assets/scss/_proof.scss"),
  ]);

  assert.equal(proof.match(/partial "artifact-bar\.html"/g)?.length, 3);
  assert.equal(gauntlet.match(/partial "artifact-bar\.html"/g)?.length, 1);
  assert.equal(results.match(/partial "artifact-bar\.html"/g)?.length, 3);
  for (const source of [proof, gauntlet, results]) {
    assert.doesNotMatch(source, /class="proof-artifact-dots"/, "consumers must not copy the three-dot markup");
  }
  assert.match(partial, /class="proof-artifact-bar"/);
  assert.match(partial, /class="proof-artifact-dots"/);
  assert.match(partial, /with \.id/, "the live Gauntlet label ID must survive the shared partial");
  assert.match(sharedStyle, /\.proof-artifact-bar\s*\{/);
  assert.doesNotMatch(proofStyle, /\.proof-artifact-bar\s*\{/, "shared artifact chrome must not return to Proof-only styles");
});

test("evidence copy names offline verification without claiming operator independence", async () => {
  const [enterprise, assess] = await Promise.all([
    read("themes/pipelab/layouts/enterprise/single.html"),
    read("themes/pipelab/layouts/assess/single.html"),
  ]);

  const copy = `${enterprise}\n${assess}`;
  assert.doesNotMatch(copy, /external party can check independently/i);
  assert.doesNotMatch(copy, /proof stands on its own math/i);
  assert.match(enterprise, /doesn't prove the signer recorded every event/);
  assert.match(assess, /check offline against the published key/);
});
