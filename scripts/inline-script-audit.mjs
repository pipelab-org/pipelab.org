// The site's CSP has no 'unsafe-inline' in script-src, so an inline script
// either breaks in the browser or means someone loosened the policy. Inline
// <script> elements are allowed only as data blocks: the HTML standard
// ("prepare the script element", https://html.spec.whatwg.org/multipage/scripting.html)
// never executes a script whose type is not a JavaScript MIME type, "module",
// "importmap" or "speculationrules". This audit is stricter and accepts only
// the two data types the templates emit.
const DATA_BLOCK_TYPES = new Set(["application/ld+json", "application/json"]);

const ATTRIBUTE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributes(source) {
  const result = new Map();
  for (const [, name, double, single, bare] of source.matchAll(ATTRIBUTE)) {
    const key = name.toLowerCase();
    if (!result.has(key)) result.set(key, double ?? single ?? bare ?? "");
  }
  return result;
}

export function inlineScriptFindings(html) {
  const findings = [];
  for (const [, source] of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = attributes(source);
    if (attrs.has("src")) continue;
    const type = (attrs.get("type") ?? "").trim().toLowerCase();
    if (!DATA_BLOCK_TYPES.has(type)) {
      findings.push(`inline <script${type ? ` type="${type}"` : ""}> would execute; move it to a fingerprinted file under themes/pipelab/assets/js`);
    }
  }
  return findings;
}
