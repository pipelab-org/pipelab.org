import { parse } from "parse5";

// The site's CSP has no 'unsafe-inline' in script-src, so an inline script
// either breaks in the browser or means someone loosened the policy. Inline
// <script> elements are allowed only as data blocks: the HTML standard
// ("prepare the script element", https://html.spec.whatwg.org/multipage/scripting.html)
// never executes a script whose type is not a JavaScript MIME type, "module",
// "importmap" or "speculationrules". This audit is stricter and accepts only
// the two data types the templates emit.
const DATA_BLOCK_TYPES = new Set(["application/ld+json", "application/json"]);

export function inlineScriptFindings(html) {
  const findings = [];

  // Use the HTML tokenizer's attribute, comment and raw-text rules. In
  // particular, JavaScript's \s includes characters that aren't HTML space.
  // parse() uses scriptingEnabled=true, matching a browser with JS enabled.
  // https://html.spec.whatwg.org/multipage/parsing.html
  const pending = [parse(html)];
  while (pending.length) {
    const node = pending.pop();
    if (node.tagName === "script") {
      const attrs = new Map(node.attrs.filter(attr => !attr.namespace).map(attr => [attr.name, attr.value]));
      const type = (attrs.get("type") ?? "").trim().toLowerCase();
      const external = node.namespaceURI === "http://www.w3.org/1999/xhtml"
        ? attrs.has("src")
        : attrs.has("href") || node.attrs.some(attr => attr.namespace === "http://www.w3.org/1999/xlink" && attr.name === "href");
      if (!external && !DATA_BLOCK_TYPES.has(type)) {
        findings.push(`inline <script${type ? ` type="${type}"` : ""}> is not an allowed data block; move it to a fingerprinted file under themes/pipelab/assets/js`);
      }
    }
    // Check templates too: a consumer can later instantiate their contents.
    if (node.content) pending.push(node.content);
    if (node.childNodes) pending.push(...node.childNodes.slice().reverse());
  }
  return findings;
}
