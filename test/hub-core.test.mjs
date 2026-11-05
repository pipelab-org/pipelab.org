import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse as parseHTML } from "parse5";
import * as commonmark from "commonmark";
import { stringify } from "yaml";
import { parseListing, resolveArtifact, schema, validateListing, validateURL } from "../scripts/hub/validate.mjs";
import { auditHubTemplates } from "../scripts/hub/template-lint.mjs";
import worker from "../src/worker.js";
import { createServer } from "node:http";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n");
const base = JSON.parse(read("test/hub-fixtures/listing.json"));
const clone = value => structuredClone(value);
function temp(t) {
  const parent = path.join(root, "node_modules/.cache/hub-tests");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(path.join(parent, "run-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("hub validator refuses schema, fact-token, Unicode, YAML and URL bypasses", t => {
  assert.deepEqual(validateListing(base), base);
  assert.deepEqual(parseListing(stringify(base)), base);
  const bad = change => { const value = clone(base); change(value); assert.throws(() => validateListing(value)); };
  for (const token of ["{{stat:community_rules}}", "{{stat:nope}}"]) {
    for (const field of ["title", "summary"]) bad(x => { x[field] = token; });
    bad(x => { x.setup[0].command = token; });
    bad(x => { x.disclosures.ai_text = token; });
    bad(x => { x.evidence.method = token; });
    bad(x => { x.limitations = [token]; });
  }
  for (const key of ["aliases", "url", "outputs", "layout", "build", "robots", "capability", "sitemap", "redirect", "sponsored"]) bad(x => { x[key] = "/pricing/"; });
  bad(x => { x.links.extra = "https://example.com/"; });
  bad(x => { x.maintainer.capability = "injected"; });
  bad(x => { x.disclosures.sponsored = true; });
  bad(x => { x.id = "bad\nslug 301"; });
  bad(x => { x.limitations = []; });
  bad(x => { x.evidence.date = "2026-02-30"; });
  for (const char of ["\u202e", "\u2066", "\u200b", "\u00ad", "\u0085", "\u0000"]) {
    bad(x => { x.title += char; });
    bad(x => { x.summary += char; });
  }
  bad(x => { x.title += "\u200d"; });
  bad(x => { x.title += "\n"; });
  for (const command of ["echo\nexit", "echo \u001b[31m", "echo café"]) bad(x => { x.setup[0].command = command; });
  const shaped = clone(base); shaped.summary = "Persian\u200c and emoji\u200d\ntext";
  assert.equal(validateListing(shaped).summary, shaped.summary);
  const nfc = clone(base); nfc.title = "Cafe\u0301";
  assert.equal(validateListing(nfc).title, "Café");
  nfc.title = "e\u0301".repeat(50);
  assert.equal(validateListing(nfc).title, "é".repeat(50));
  for (const value of ["http://example.com/", "javascript:alert(1)", "https://user@example.com/", "https://example.com:443/", "https://EXAMPLE.com/", "https://%65xample.com/", "https://127.0.0.1/", "https://2130706433/", "https://[::1]/", "https://example.com\\@evil.com/", "https://example.com./", "https://example.com\n/", "//example.com/"]) bad(x => { x.links.source = value; });
  assert.equal(validateURL("https://xn--bcher-kva.example/path").decodedHost, "bücher.example");
  assert.equal(validateURL("https://short.example/x").host, "short.example");
  const bundle = { ...base, type: "bundle", bundle_name: "example-bundle", bundle_sha256: "a".repeat(64), signer_fingerprint: "b".repeat(64) };
  delete bundle.learn_page;
  assert.doesNotThrow(() => validateListing(bundle));
  assert.throws(() => validateListing({ ...bundle, requires_pro: false }));
  assert.throws(() => parseListing(stringify(base) + "id: duplicate\n"));
  assert.throws(() => parseListing("id: &id [*id]\n"));
  const dir = temp(t); writeFileSync(path.join(dir, "evidence.json"), "{}");
  assert.equal(resolveArtifact(dir, "evidence.json"), path.join(dir, "evidence.json"));
  for (const file of ["../evidence.json", "/etc/passwd", "https://example.com/evidence", "a/../evidence.json"]) assert.throws(() => resolveArtifact(dir, file));
  assert.deepEqual(JSON.parse(read("assets/hub/schema/listing-v1.json")), schema);
  assert.equal(read("assets/hub/schema/listing-v1.json"), read("scripts/hub/schema/listing-v1.json"));
});

test("hub lint follows partials transitively and refuses fact processors and trust casts", t => {
  assert.deepEqual(auditHubTemplates(root), []);
  const dir = temp(t);
  cpSync(path.join(root, "themes/pipelab/layouts"), path.join(dir, "themes/pipelab/layouts"), { recursive: true });
  mkdirSync(path.join(dir, "content/hub"), { recursive: true });
  cpSync(path.join(root, "content/hub/_content.gotmpl"), path.join(dir, "content/hub/_content.gotmpl"));
  for (const call of ['{{ partial "fact-text.html" . }}', '{{ partialCached "fact-value.html" . . }}', "{{ . | markdownify }}", "{{ .Content }}", "{{ . | safeHTML }}", "{{ . | safe.JS }}", '{{ partial $name . }}']) {
    writeFileSync(path.join(dir, "themes/pipelab/layouts/partials/hub-md-label.html"), call);
    assert.ok(auditHubTemplates(dir).length, call);
  }
});

function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walkFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
function elements(node) {
  return [ ...(node.tagName ? [node] : []), ...(node.childNodes || []).flatMap(elements) ];
}
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const textContent = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(textContent).join("");
const shape = html => elements(parseHTML(html)).map(node => [node.tagName, node.attrs.map(a => a.name)]);
const scripts = html => elements(parseHTML(html)).filter(node => node.tagName === "script");
const executable = html => scripts(html).filter(node => !["application/ld+json", "application/json"].includes(attr(node, "type"))).map(node => [node.attrs, textContent(node)]);

function buildFixture(t) {
  const dir = temp(t);
  cpSync(path.join(root, "data"), path.join(dir, "data"), { recursive: true });
  mkdirSync(path.join(dir, "data/hub/generated"), { recursive: true });
  mkdirSync(path.join(dir, "content/learn"), { recursive: true });
  cpSync(path.join(root, "content/hub"), path.join(dir, "content/hub"), { recursive: true });
  cpSync(path.join(root, "content/learn/mcp-security.md"), path.join(dir, "content/learn/mcp-security.md"));
  mkdirSync(path.join(dir, "content/blog"));
  writeFileSync(path.join(dir, "content/blog/pipelock-v370-release.md"), '---\ntitle: Release control\ndate: 2026-11-05\n---\n');
  cpSync(path.join(root, "assets/hub"), path.join(dir, "assets/hub"), { recursive: true });
  mkdirSync(path.join(dir, "assets/hub/community/example/example-bundle"), { recursive: true });
  writeFileSync(path.join(dir, "assets/hub/community/example/example-bundle/bundle.yaml"), "fixture: exact-byte-download\n");
  writeFileSync(path.join(dir, "assets/hub/community/example/example-bundle/bundle.yaml.sig"), "fixture-signature\n");
  // Use the real site templates and source content; trim copied static files
  // only to keep repeated builds cheap. readFile still sees the real source.
  mkdirSync(path.join(dir, "static"));
  for (const file of ["rules", "_headers", "robots.txt"]) cpSync(path.join(root, "static", file), path.join(dir, "static", file), { recursive: true });
  const config = read("hugo.toml").replace(/\[params.hub\]\n\s*open = false\n/, "");
  const build = (value, listing = base) => {
    writeFileSync(path.join(dir, "data/hub/generated/listings.json"), JSON.stringify([{ listing, evidence_present: true }]));
    const overlay = `\ncontentDir = ${JSON.stringify(path.join(dir, "content"))}\nassetDir = ${JSON.stringify(path.join(dir, "assets"))}\ndataDir = ${JSON.stringify(path.join(dir, "data"))}\nstaticDir = ${JSON.stringify(path.join(dir, "static"))}\n`;
    // Top-level keys must precede the first TOML table.
    const selected = value === undefined ? "" : `\n[params.hub]\nopen = ${value}\n`;
    writeFileSync(path.join(dir, "hugo.toml"), overlay + config + selected);
    const result = spawnSync(process.env.HUGO_BIN || "hugo", ["--source", root, "--config", path.join(dir, "hugo.toml"), "--destination", path.join(dir, "public"), "--gc", "--cleanDestinationDir"], { encoding: "utf8", timeout: 180_000 });
    return { ...result, output: result.stdout + result.stderr };
  };
  const built = file => readFileSync(path.join(dir, "public", file), "utf8");
  return { dir, build, built };
}

async function staticServing(t, directory) {
  // Cloudflare's configured asset-first shape, not a negotiation emulation.
  // This fixture models delivery; it makes no claim about a deployed response.
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://example.com").pathname;
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = path.resolve(directory, `.${relative}`);
    if (file.startsWith(directory + path.sep) && existsSync(file)) {
      const bytes = readFileSync(file);
      res.setHeader("Content-Type", file.endsWith(".md") ? "text/markdown; charset=utf-8" : file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream");
      res.end(req.method === "HEAD" ? undefined : bytes);
    } else {
      const response = await worker.fetch(new Request(`https://example.com${pathname}`, { method: req.method, headers: req.headers }), {});
      res.writeHead(response.status); res.end(req.method === "HEAD" ? undefined : await response.text());
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("real Hugo builds enforce omitted/false closed, true open, and invalid switch errors", async t => {
  const f = buildFixture(t);
  const origin = await staticServing(t, path.join(f.dir, "public"));
  const hubURL = /\/hub\//;
  const checkClosed = async () => {
    assert.equal(existsSync(path.join(f.dir, "public/hub")), false);
    assert.equal(existsSync(path.join(f.dir, "public/schemas/pipelab-hub")), false);
    for (const file of walkFiles(path.join(f.dir, "public"))) assert.doesNotMatch(readFileSync(file, "utf8"), hubURL, path.relative(f.dir, file));
    for (const file of walkFiles(path.join(root, "static/rules"))) {
      const relative = path.relative(path.join(root, "static"), file);
      assert.deepEqual(readFileSync(path.join(f.dir, "public", relative)), readFileSync(file), relative);
    }
    assert.ok(f.built("llms.txt").includes("v3.7 upgrade actions"));
    assert.ok(f.built("learn/mcp-security/index.md").includes("MCP"));
    for (const route of ["/hub/", "/hub/index.md", "/hub/index.json", "/hub/community/example/example-bundle/bundle.yaml", "/schemas/pipelab-hub/listing-v1.json"]) {
      assert.equal((await fetch(origin + route, { headers: { Accept: "text/markdown" } })).status, 404, route);
    }
    const official = await fetch(`${origin}/rules/pipelock-community/bundle.yaml`);
    assert.equal(official.status, 200);
    assert.deepEqual(Buffer.from(await official.arrayBuffer()), readFileSync(path.join(root, "static/rules/pipelock-community/bundle.yaml")));
  };
  for (const value of [undefined, "false"]) {
    const result = f.build(value); assert.equal(result.status, 0, result.output); await checkClosed();
  }
  const open = f.build("true"); assert.equal(open.status, 0, open.output);
  assert.ok(f.built("hub/index.html").includes("Example recipe"));
  assert.equal(existsSync(path.join(f.dir, "public/hub/index.xml")), false);
  assert.equal(existsSync(path.join(f.dir, "public/hub/_index")), false);
  assert.equal(existsSync(path.join(f.dir, "public/hub/recipes/index.xml")), false);
  assert.ok(f.built("hub/recipes/example-recipe/index.md").includes("pipelock run --config <file>"));
  assert.ok(f.built("llms.txt").includes("[PipeLab Hub](https://pipelab.org/hub/)"));
  assert.ok(f.built("hub/index.html").includes('href="/hub/"'));
  assert.equal(f.built("schemas/pipelab-hub/listing-v1.json"), read("scripts/hub/schema/listing-v1.json"));
  assert.equal(f.built("hub/community/example/example-bundle/bundle.yaml"), "fixture: exact-byte-download\n");
  assert.equal(f.built("hub/community/example/example-bundle/bundle.yaml.sig"), "fixture-signature\n");
  for (const route of ["/hub/recipes/example-recipe/", "/learn/mcp-security/"]) {
    const html = await fetch(origin + route, { headers: { Accept: "text/markdown" } });
    assert.equal(html.status, 200); assert.match(html.headers.get("Content-Type"), /^text\/html/);
    const mirror = `${route}index.md`;
    const response = await fetch(origin + mirror);
    assert.equal(response.status, 200); assert.match(response.headers.get("Content-Type"), /^text\/markdown/);
    assert.equal(await response.text(), f.built(mirror.slice(1)));
    const head = await fetch(origin + mirror, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
  }
  const mirror = path.join(f.dir, "public/hub/recipes/example-recipe/index.md");
  const saved = readFileSync(mirror); rmSync(mirror);
  const missing = await fetch(`${origin}/hub/recipes/example-recipe/index.md`);
  assert.equal(missing.status, 404); assert.doesNotMatch(await missing.text(), /Example recipe/);
  writeFileSync(mirror, saved);
  const reclosed = f.build("false"); assert.equal(reclosed.status, 0, reclosed.output); await checkClosed();
  for (const value of ['"true"', '"yes"', "1", "0", "[]", "{}", '"false"']) {
    const result = f.build(value);
    assert.notEqual(result.status, 0, value);
    assert.match(result.output, /params.hub.open must be a boolean/, value);
  }
});

test("hub malicious twin retains literal text in HTML, JSON, metadata and CommonMark", t => {
  const f = buildFixture(t);
  const malicious = clone(base);
  const payload = 'CANARY **b** [l](https://e.example) `c` </script><script>x=1</script> "><img src=x onerror=x> ]]> {{ .Site }} ::error::x';
  malicious.title = 'CANARY "</script><script>x=1</script>\\';
  for (const key of ["summary"]) malicious[key] = payload;
  malicious.maintainer.name = 'CANARY **b** [l](https://e.example)';
  malicious.setup = [{ text: payload + "\n# heading\n  indented", command: "echo ````` <file> > output && pipelock --help" }];
  malicious.limitations = [payload]; malicious.not_claimed = [payload];
  malicious.evidence.method = payload;
  malicious.disclosures.ai_text = payload; malicious.disclosures.conflict_of_interest = payload;
  const valid = validateListing(malicious);
  const benign = clone(valid);
  const replaceText = value => typeof value === "string" && value.includes("CANARY") ? "Ordinary fixture text" : Array.isArray(value) ? value.map(replaceText) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,replaceText(v)])) : value;
  Object.assign(benign, replaceText(benign));
  const first = f.build("true", benign); assert.equal(first.status, 0, first.output);
  const route = "hub/recipes/example-recipe/index.html";
  const twin = f.built(route);
  const second = f.build("true", valid); assert.equal(second.status, 0, second.output);
  const html = f.built(route);
  assert.deepEqual(shape(html), shape(twin));
  assert.deepEqual(executable(html), executable(twin));
  for (const node of scripts(html)) {
    if (["application/ld+json", "application/json"].includes(attr(node, "type"))) assert.doesNotThrow(() => JSON.parse(textContent(node)));
    else { assert.ok(attr(node, "src")); assert.equal(textContent(node).trim(), ""); }
  }
  const dom = elements(parseHTML(html));
  for (const node of dom.filter(node => attr(node, "data-hub-field"))) {
    const key = attr(node, "data-hub-field");
    const expected = key.split(".").reduce((value, part) => value[part], valid);
    assert.equal(textContent(node), String(expected), key);
  }
  for (const node of dom) for (const attribute of node.attrs) {
    assert.doesNotMatch(attribute.name, /^on/);
    if (["href", "src"].includes(attribute.name)) { assert.ok(!attribute.value.includes("#ZgotmplZ")); assert.ok(!/^[a-z]+:/i.test(attribute.value) || attribute.value.startsWith("https:")); }
  }
  const dataBlocks = scripts(html).filter(node => attr(node, "type") === "application/ld+json").map(node => JSON.parse(textContent(node)));
  assert.equal(dataBlocks.find(block => block["@type"] === "BreadcrumbList").itemListElement.at(-1).name, valid.title);
  const description = dom.find(node => node.tagName === "meta" && attr(node, "name") === "description");
  assert.match(attr(description, "content"), /^Pipelock recipe listing example-recipe\./);
  assert.ok(attr(description, "content").length >= 120 && attr(description, "content").length <= 155);
  const md = f.built("hub/recipes/example-recipe/index.md");
  const ast = new commonmark.Parser().parse(md); const iterator = ast.walker(); const literals = []; let event;
  while ((event = iterator.next())) {
    if (!event.entering) continue;
    assert.ok(!["html_inline", "html_block", "image", "link"].includes(event.node.type), event.node.type);
    if (["text", "code_block"].includes(event.node.type)) literals.push(event.node.literal);
    if (["softbreak", "linebreak"].includes(event.node.type)) literals.push("\n");
  }
  const serialized = literals.join("");
  for (const text of [valid.title, payload, valid.setup[0].command]) assert.ok(serialized.includes(text), text);
  assert.match(md, /^Source: https:\/\/pipelab.org\/hub\/recipes\/example-recipe\//);
  assert.deepEqual(JSON.parse(f.built("hub/index.json")), { format: 1, items: [{ id: valid.id, type: valid.type, title: valid.title, summary: valid.summary, badge: "none", url: "/hub/recipes/example-recipe/" }] });
  assert.doesNotMatch(f.built("index.xml"), /\/hub\/|CANARY/);
  assert.doesNotMatch(f.built("index.md"), /CANARY/);
  for (const file of walkFiles(path.join(f.dir, "public"))) {
    if (readFileSync(file, "utf8").includes("CANARY")) assert.ok(path.relative(path.join(f.dir, "public"), file).replaceAll(path.sep, "/").startsWith("hub/"), file);
  }
  for (const line of f.built("_redirects").split("\n").filter(line => line.startsWith("/hub"))) assert.match(line, /^\/hub(?:\/[a-z0-9-]+)* \/hub(?:\/[a-z0-9-]+)*\/ 301$/);
  assert.doesNotMatch(read("static/_redirects"), /^\/hub\//m);
  const headers = f.built("_headers");
  const csp = headers.split("/hub/*\n")[1] || headers.split("\n\n")[0];
  assert.ok(csp); assert.match(csp, /script-src-attr 'none'/); assert.doesNotMatch(csp.match(/script-src [^;]+/)[0], /unsafe-inline/);
});

test("hub descriptions and serializers keep fact tokens literal behind the validator", t => {
  // Deliberately supply normalized fixture data directly to Hugo: this exercises
  // the structural defense independently of the production validator refusal.
  const f = buildFixture(t); const listing = clone(base);
  listing.title = "{{stat:community_rules}}";
  listing.summary = "{{stat:nope}}";
  const result = f.build("true", listing); assert.equal(result.status, 0, result.output);
  const html = f.built("hub/recipes/example-recipe/index.html");
  const fields = elements(parseHTML(html)).filter(node => attr(node, "data-hub-field"));
  assert.equal(textContent(fields.find(node => attr(node, "data-hub-field") === "title")), listing.title);
  assert.equal(textContent(fields.find(node => attr(node, "data-hub-field") === "summary")), listing.summary);
  const md = f.built("hub/recipes/example-recipe/index.md");
  assert.ok(new commonmark.HtmlRenderer().render(new commonmark.Parser().parse(md)).includes("{{stat:nope}}"));
  const index = JSON.parse(f.built("hub/index.json")); assert.equal(index.items[0].title, listing.title);
  assert.equal(index.items[0].summary, listing.summary);
});

test("Worker remains API-only and preserves API routing without an ASSETS binding", async () => {
  let touched = false;
  const env = { ASSETS: { fetch() { touched = true; throw new Error("must not execute"); } } };
  for (const route of ["/hub/", "/hub/index.md", "/learn/mcp-security/", "/unknown"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await worker.fetch(new Request(`https://example.com${route}`, { method, headers: { Accept: "text/markdown" } }), env);
      assert.equal(response.status, 404); assert.equal(response.headers.get("Vary"), null);
    }
  }
  assert.equal(touched, false);
  assert.equal((await worker.fetch(new Request("https://example.com/api/results", { method: "OPTIONS" }), {})).status, 204);
  assert.equal((await worker.fetch(new Request("https://example.com/api/results/not-a-uuid"), {})).status, 400);
  assert.equal((await worker.fetch(new Request("https://example.com/api/contact", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }), {})).status, 415);
  assert.equal((await worker.fetch(new Request("https://example.com/api/gh-advisory", { method: "POST", body: "{}" }), {})).status, 403);
});
