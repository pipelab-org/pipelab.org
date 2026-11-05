import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/worker.js";

const origin = "https://pipelab.org";
const htmlType = "text/html; charset=utf-8";
const markdownType = "text/markdown; charset=utf-8";
const page = (body) => `<title>Probe</title><main>${body}</main>`;

function assetsFor(html, mirror = { status: 404 }, htmlOptions = {}) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(request);
      const isMirror = new URL(request.url).pathname.endsWith(".md");
      if (isMirror && mirror instanceof Error) throw mirror;
      const { body = "Not Found", ...options } = isMirror
        ? mirror
        : { body: html, headers: { "Content-Type": htmlType, "Cache-Control": "public, max-age=60" }, ...htmlOptions };
      return new Response(request.method === "HEAD" ? null : body, options);
    },
  };
}

function fetchMarkdown(assets, path = "/learn/probe/", options = {}) {
  return worker.fetch(new Request(`${origin}${path}`, {
    headers: { Accept: "text/markdown" }, ...options,
  }), { ASSETS: assets });
}

// The five content-loss shapes, exercised through the real static-asset route.
for (const [name, html, expected] of [
  ["fenced placeholder", "<pre><code>pipelock run --config &lt;file&gt;</code></pre>", "```\npipelock run --config <file>\n```"],
  ["prose placeholder", "<p>Use &lt;file&gt; here</p>", "Use <file> here"],
  ["literal entity", "<p>Literal &amp;lt;file&amp;gt; here</p>", "Literal &lt;file&gt; here"],
  ["literal script sample", "<pre><code>&lt;script&gt;demo&lt;/script&gt;</code></pre>", "```\n<script>demo</script>\n```"],
  ["code indentation", "<pre><code>if 1 &lt; 2:\n  keep()\n\n\n\tfinish()  \n</code></pre>", "```\nif 1 < 2:\n  keep()\n\n\n\tfinish()  \n```"],
]) {
  test(`fallback preserves ${name}`, async () => {
    const response = await fetchMarkdown(assetsFor(page(html)));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), markdownType);
    assert.ok((await response.text()).includes(expected), `missing ${JSON.stringify(expected)}`);
  });
}

test("fallback preserves nested inline text and decodes each entity once", async () => {
  const response = await fetchMarkdown(assetsFor(page(`
    <h1>Use &lt;file&gt;</h1>
    <p><strong><em>&amp;lt;file&amp;gt;</em></strong>
    <code><span>  &lt;file&gt;  &amp;lt;x&amp;gt;  </span></code></p>
    <blockquote><p>Quote &lt;file&gt;</p></blockquote>
    <p><a href="/next/?a=1&amp;b=2"><strong>&lt;next&gt;</strong></a>
    <img src="/sample.png" alt="&amp;lt;sample&amp;gt;"></p>
    <p>&#38;lt;file&#38;gt; &#x26;lt;file&#x26;gt; &#60;file&#62;</p>
  `)));
  const markdown = await response.text();
  for (const text of ["# Use <file>", "***&lt;file&gt;***", "`   <file>  &lt;x&gt;   `",
    "> Quote <file>", "[**<next>**](https://pipelab.org/next/?a=1&b=2)",
    "![&lt;sample&gt;](https://pipelab.org/sample.png)", "&lt;file&gt; &lt;file&gt; <file>"]) {
    assert.ok(markdown.includes(text), `missing ${text}`);
  }
});

test("fallback keeps highlighted code and embedded Markdown delimiters", async () => {
  const response = await fetchMarkdown(assetsFor(page(
    '<pre><code><span>  &lt;div&gt;</span>\n```\n</code></pre>' +
    '<p><code>&lt;code&gt;`value`&lt;/code&gt;</code></p>'
  )));
  const markdown = await response.text();
  assert.ok(markdown.includes("````\n  <div>\n```\n````"));
  assert.ok(markdown.includes("``<code>`value`</code>``"));
});

test("fallback keeps numeric placeholders without failing on invalid references", async () => {
  const response = await fetchMarkdown(assetsFor(page(
    '<p>&#60;file&#62; &#x3c;file&#x3e; &#0; &#x110000; &#55296;</p>'
  )));
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("<file> <file> \ufffd \ufffd \ufffd"));
});

test("fallback does not confuse literal text with saved code markers", async () => {
  const response = await fetchMarkdown(assetsFor(page(
    '<p>\ue0000\ue000 &#57344;1&#57344; &amp;amp;</p><pre><code>&amp;lt;file&amp;gt;</code></pre>'
  )));
  const markdown = await response.text();
  assert.ok(markdown.includes("\ue0000\ue000 \ue0001\ue000 &amp;"));
  assert.ok(markdown.includes("```\n&lt;file&gt;\n```"));
});

const mirrorBytes = new TextEncoder().encode("# Mirror\n\nCanonical URL: https://pipelab.org/learn/probe/\n\n  <file> &lt;file&gt; café\n");
const mirrorAsset = {
  body: mirrorBytes,
  headers: {
    "Content-Type": "text/markdown",
    "Cache-Control": "public, max-age=300",
    "ETag": '"mirror-v1"',
    "Vary": "Accept-Encoding",
    "X-Robots-Tag": "noindex",
    "Content-Length": String(mirrorBytes.byteLength),
  },
};

for (const [path, mirrorPath] of [
  ["/", "/index.md"],
  ["/learn/", "/learn/index.md"],
  ["/learn/probe/", "/learn/probe/index.md"],
  ["/learn/probe/index.html?x=1", "/learn/probe/index.md?x=1"],
  ["/pricing", "/pricing/index.md"],
  ["/sample.html", "/sample.md"],
]) {
  test(`serves exact mirror bytes for ${path}`, async () => {
    const assets = assetsFor(page("HTML fallback"), mirrorAsset);
    const response = await fetchMarkdown(assets, path);
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), mirrorBytes);
    assert.equal(assets.calls.length, 2);
    assert.equal(assets.calls[1].url, origin + mirrorPath);
    assert.equal(response.headers.get("Content-Type"), markdownType);
    assert.equal(response.headers.get("Vary"), "Accept-Encoding, Accept");
    for (const name of ["Cache-Control", "ETag", "X-Robots-Tag", "Content-Length"]) {
      assert.equal(response.headers.get(name), mirrorAsset.headers[name]);
    }
  });
}

test("mirror HEAD returns GET headers and no body", async () => {
  const assets = assetsFor(page("HTML fallback"), mirrorAsset);
  const get = await fetchMarkdown(assets);
  const head = await fetchMarkdown(assets, "/learn/probe/", { method: "HEAD" });
  assert.equal(head.status, get.status);
  assert.deepEqual([...head.headers], [...get.headers]);
  assert.equal(await head.text(), "");
  assert.equal(assets.calls.at(-1).method, "HEAD");
});

test("mirror lookup discards HTML range and conditional validators", async () => {
  const assets = assetsFor(page("HTML fallback"), mirrorAsset);
  const headers = { Accept: "text/markdown", Range: "bytes=0-3", "If-Range": '"html"',
    "If-None-Match": '"html"', "If-Match": '"html"',
    "If-Modified-Since": "Wed, 04 Nov 2026 00:00:00 GMT", "If-Unmodified-Since": "Wed, 04 Nov 2026 00:00:00 GMT" };
  const response = await fetchMarkdown(assets, "/learn/probe/", { headers });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), mirrorBytes);
  for (const name of Object.keys(headers).filter((key) => key !== "Accept")) {
    assert.equal(assets.calls[1].headers.get(name), null);
  }
});

for (const [name, mirror] of [
  ["missing", { status: 404 }],
  ["throws", new Error("No mirror")],
  ["HTML not-found rewrite", { body: "Wrong fallback", headers: { "Content-Type": htmlType } }],
  ["redirect", { status: 301, headers: { Location: "/elsewhere/" } }],
  ["unavailable", { status: 503 }],
]) {
  test(`uses converter when mirror ${name}`, async () => {
    const response = await fetchMarkdown(assetsFor(page("<p>Use &lt;file&gt; here</p>"), mirror));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
    assert.equal(response.headers.get("Vary"), "Accept");
    assert.ok((await response.text()).includes("Use <file> here"));
  });
}

test("fallback HEAD has Markdown headers and no body", async () => {
  const response = await fetchMarkdown(assetsFor(page("Fallback")), "/tags/probe/", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), markdownType);
  assert.equal(response.headers.get("Vary"), "Accept");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
  assert.equal(await response.text(), "");
});

test("fallback removes real scripts and JSON-LD while retaining visible text", async () => {
  const response = await fetchMarkdown(assetsFor(page(`
    <script type="application/ld+json">{"private":"JSON_LD_CANARY"}</script>
    <script>EXECUTABLE_CANARY()</script><style>STYLE_CANARY</style>
    <noscript>NOSCRIPT_CANARY</noscript><svg>SVG_CANARY</svg><canvas>CANVAS_CANARY</canvas>
    <!-- COMMENT_CANARY --><p>Visible text</p>
  `)));
  const markdown = await response.text();
  assert.ok(markdown.includes("Visible text"));
  assert.doesNotMatch(markdown, /CANARY|<script|application\/ld\+json/);
});

test("script strings cannot select a false main and spaced closing tags do not leak", async () => {
  const assets = assetsFor('<script type="application/ld+json">{"text":"<main>JSON_CANARY</main>"}</script >' +
    page('<p>Visible text</p><script>EXECUTABLE_CANARY()</script >'));
  const response = await fetchMarkdown(assets);
  const markdown = await response.text();
  assert.ok(markdown.includes("Visible text"));
  assert.doesNotMatch(markdown, /CANARY/);
});

test("an unclosed script does not expose its contents", async () => {
  const response = await fetchMarkdown(assetsFor(page('<p>Visible text</p><script>UNCLOSED_CANARY')));
  const markdown = await response.text();
  assert.ok(markdown.includes("Visible text"));
  assert.doesNotMatch(markdown, /CANARY/);
});

for (const [name, options] of [["HTML Accept", { headers: { Accept: "text/html" } }], ["no Accept", {}]]) {
  test(`${name} leaves HTML bytes, status and headers unchanged`, async () => {
    const html = page("<p>Keep &lt;file&gt;</p><script>keep()</script>");
    const headers = { "Content-Type": htmlType, "Cache-Control": "public, max-age=60", ETag: '"html"' };
    const assets = assetsFor(html, mirrorAsset, { headers });
    const response = await worker.fetch(new Request(`${origin}/learn/probe/`, options), { ASSETS: assets });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.deepEqual([...response.headers], [...new Headers(headers)]);
    assert.equal(assets.calls.length, 1);
  });
}

for (const status of [301, 302, 404, 500]) {
  test(`HTML asset status ${status} remains unchanged without a mirror lookup`, async () => {
    const assets = assetsFor("original body", mirrorAsset, {
      status, headers: { "Content-Type": htmlType, Location: "/target/" },
    });
    const response = await fetchMarkdown(assets);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Location"), "/target/");
    assert.equal(response.headers.get("Content-Type"), htmlType);
    assert.equal(await response.text(), "original body");
    assert.equal(assets.calls.length, 1);
  });
}

test("API requests do not consult Markdown assets", async () => {
  const response = await worker.fetch(new Request(`${origin}/api/results/not-a-uuid`, {
    headers: { Accept: "text/markdown" },
  }), { ASSETS: { fetch() { assert.fail("API request fetched a static asset"); } } });
  assert.equal(response.status, 400);
  assert.match(response.headers.get("Content-Type"), /application\/json/);
});

test("a thrown original asset lookup retains the existing 404", async (t) => {
  t.mock.method(console, "error", () => {});
  const response = await fetchMarkdown({ fetch() { throw new Error("No index asset"); } });
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not Found");
});

test("non-HTML assets bypass negotiation", async () => {
  const assets = assetsFor("# Already Markdown\n", mirrorAsset, {
    headers: { "Content-Type": markdownType, ETag: '"direct"' },
  });
  const response = await fetchMarkdown(assets, "/download");
  assert.equal(await response.text(), "# Already Markdown\n");
  assert.equal(response.headers.get("ETag"), '"direct"');
  assert.equal(response.headers.get("Vary"), null);
  assert.equal(assets.calls.length, 1);
});

test("converted output drops only HTML body validators and retains caching headers", async () => {
  const assets = assetsFor(page("<p>Retained</p>"), { status: 404 }, {
    headers: { "Content-Type": htmlType, "Content-Length": "100", "Content-Encoding": "gzip",
      ETag: '"html"', "Cache-Control": "public, max-age=60", Vary: "Accept-Encoding", "X-Content-Type-Options": "nosniff" },
  });
  const response = await fetchMarkdown(assets);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Vary"), "Accept-Encoding, Accept");
  for (const name of ["Content-Length", "Content-Encoding", "ETag"]) assert.equal(response.headers.get(name), null);
  assert.ok(Number(response.headers.get("X-Markdown-Tokens")) > 0);
  assert.ok((await response.text()).includes("Retained"));
});
