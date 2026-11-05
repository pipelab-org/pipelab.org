import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function auditHubTemplates(root = ".") {
  const issues = [];
  const roots = [];
  const walk = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file); else roots.push(file);
    }
  };
  for (const dir of ["layouts/hub", "themes/pipelab/layouts/hub"]) walk(path.join(root, dir));
  roots.push(path.join(root, "content/hub/_content.gotmpl"));
  // Also inspect the JSON serializer reached from baseof, not a hub body.
  roots.push(path.join(root, "themes/pipelab/layouts/partials/hub-jsonld.html"));
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!existsSync(file)) { issues.push("hub template: missing dependency"); return; }
    const source = readFileSync(file, "utf8").replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (/\b(?:markdownify|Markdownify|htmlUnescape|HTMLUnescape)\b|\.(?:RenderString|RenderShortcodes|Content|RawContent|Plain|Summary|TableOfContents)\b|\b(?:safeHTML|safeHTMLAttr|safeJSStr|safeCSS|safeURL)\b|\bsafe\./.test(source)) issues.push(`hub template: forbidden renderer or trust cast in ${relative}`);
    if (/\bsafeJS\b/.test(source) && (relative !== "themes/pipelab/layouts/partials/hub-jsonld.html" || (source.match(/\bsafeJS\b/g) || []).length !== 1 || !/dict[^{}]+\| jsonify \| safeJS/.test(source))) issues.push(`hub template: forbidden script trust cast in ${relative}`);
    if (/fact-(?:text|value)\.html|\{\{[<%]\s*stat\b|<script(?!\s+type="application\/ld\+json")|\s(?:on[a-z]+)\s*=/i.test(source)) issues.push(`hub template: forbidden fact processor or executable markup in ${relative}`);
    const calls = [...source.matchAll(/\bpartial(?:Cached)?\s+(?:"([^"]+)"|`([^`]+)`)/g)];
    if ((source.match(/\bpartial(?:Cached)?\s+/g) || []).length !== calls.length) issues.push(`hub template: dynamic partial cannot be audited in ${relative}`);
    for (const call of calls) {
      const name = call[1] || call[2];
      const candidates = ["layouts/partials", "themes/pipelab/layouts/partials"].map(dir => path.join(root, dir, name));
      visit(candidates.find(existsSync) || candidates[0]);
    }
  };
  for (const file of roots) visit(file);
  return issues;
}
