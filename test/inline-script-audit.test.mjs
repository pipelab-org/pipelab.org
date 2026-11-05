import test from "node:test";
import assert from "node:assert/strict";
import { inlineScriptFindings } from "../scripts/inline-script-audit.mjs";

for (const html of [
  '<script type="application/ld+json">{"@type":"WebPage"}</script>',
  "<script type=application/json id=pl-site-config>{}</script>",
  "<script TYPE='Application/LD+JSON'>{}</script>",
  '<script defer src="/js/site-base.abc.js" integrity="sha256-x"></script>',
  "<script src=/js/a.js defer></script>",
  // The HTML parser keeps the first of duplicate attributes, so this is a data block.
  '<script type="application/ld+json" type="text/javascript">{}</script>',
  '<script data-note="x>" src="/js/a.js"></script>',
  '<script data-note="x>" type="application/json">{}</script>',
  '<script type="application/json">{"example":"<script>"}</script>',
  '<!-- <script>alert(1)</script> -->',
  '<textarea><script>alert(1)</script></textarea>',
  '<svg><script href="/js/a.js"></script></svg>',
]) {
  test(`data blocks and external scripts pass: ${html.slice(0, 48)}`, () => {
    assert.deepEqual(inlineScriptFindings(html), []);
  });
}

for (const html of [
  "<script>alert(1)</script>",
  "<SCRIPT>alert(1)</SCRIPT>",
  '<script type="text/javascript">alert(1)</script>',
  "<script type=module>import('/x.js')</script>",
  '<script type="">alert(1)</script>',
  '<script data-src="/x.js">alert(1)</script>',
  '<script nonce="abc">alert(1)</script>',
  "<script\ntype=\"text/javascript\">alert(1)</script>",
  // HTML only recognizes ASCII whitespace between attributes. Chromium sees
  // these as attributes named NBSP+type/src, leaving an untyped inline script.
  '<script \u00a0type=application/json>alert(1)</script>',
  '<script \u00a0src=/js/a.js>alert(1)</script>',
  '<script type=text/javascript type=application/json>alert(1)</script>',
  '<svg><script src="/js/a.js">alert(1)</script></svg>',
  '<template><script>alert(1)</script></template>',
]) {
  test(`executable inline script is reported: ${JSON.stringify(html.slice(0, 48))}`, () => {
    assert.equal(inlineScriptFindings(html).length, 1);
  });
}

test("every inline script on a page is reported", () => {
  assert.equal(inlineScriptFindings("<script>a()</script><p></p><script>b()</script>").length, 2);
});
