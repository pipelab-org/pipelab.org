const rawTextElements = new Set(["iframe", "noembed", "noframes", "noscript", "script", "style", "xmp"]);
const rcdataElements = new Set(["textarea", "title"]);
const headElements = new Set(["base", "basefont", "bgsound", "link", "meta", "noframes", "noscript", "script", "style", "template", "title"]);
const namedReferences = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["NewLine", "\n"],
  ["quot", '"'],
  ["Tab", "\t"],
]);

function decodeCodePoint(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return "\ufffd";
  }
  return String.fromCodePoint(value);
}

function decodeAttributeValue(value) {
  return value
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/giu, (_match, hex, decimal) => (
      decodeCodePoint(Number.parseInt(hex ?? decimal, hex === undefined ? 10 : 16))
    ))
    .replace(/&([A-Za-z]+);/gu, (match, name) => namedReferences.get(name) ?? match);
}

function parseAttributes(tag) {
  const attributes = new Map();
  const opening = tag.match(/^<\s*[^\s/>]+/u);
  const source = tag.slice(opening?.[0].length || 0, tag.lastIndexOf(">"));
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/giu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) {
      attributes.set(name, decodeAttributeValue(match[2] ?? match[3] ?? match[4] ?? ""));
    }
  }
  return attributes;
}

function findTagEnd(html, start) {
  let quote = "";
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  throw new Error("rendered HTML contains an unterminated tag");
}

function rawTextEnd(html, name, start) {
  const closing = new RegExp(`<\\/\\s*${name}(?=[\\s/>])`, "giu");
  closing.lastIndex = start;
  const match = closing.exec(html);
  return match ? findTagEnd(html, match.index + match[0].length) + 1 : html.length;
}

function* activeMetaTags(html) {
  const hasExplicitHead = /<\s*head(?=[\s/>])/iu.test(html);
  let headDepth = 0;
  let templateDepth = 0;

  for (let index = 0; index < html.length;) {
    const start = html.indexOf("<", index);
    if (start < 0) return;
    if (headDepth > 0 && templateDepth === 0 && /\S/u.test(html.slice(index, start))) headDepth = 0;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", start) || html.startsWith("<?", start)) {
      index = findTagEnd(html, start + 2) + 1;
      continue;
    }

    const closing = html.slice(start).match(/^<\s*\/\s*([A-Za-z][A-Za-z0-9:-]*)(?=[\s/>])/u);
    if (closing) {
      const end = findTagEnd(html, start + closing[0].length);
      const name = closing[1].toLowerCase();
      if (name === "template") templateDepth = Math.max(0, templateDepth - 1);
      if (name === "head") headDepth = Math.max(0, headDepth - 1);
      else if (headDepth > 0 && templateDepth === 0) headDepth = 0;
      index = end + 1;
      continue;
    }

    const opening = html.slice(start).match(/^<\s*([A-Za-z][A-Za-z0-9:-]*)(?=[\s/>])/u);
    if (!opening) {
      index = start + 1;
      continue;
    }
    const end = findTagEnd(html, start + opening[0].length);
    const tag = html.slice(start, end + 1);
    const name = opening[1].toLowerCase();
    if (name === "head") headDepth += 1;
    if (name === "body") headDepth = 0;
    if (hasExplicitHead && headDepth > 0 && templateDepth === 0 && name !== "head" && !headElements.has(name)) {
      headDepth = 0;
    }
    if (name === "template") templateDepth += 1;
    if (name === "plaintext") return;
    if (rawTextElements.has(name) || rcdataElements.has(name)) {
      index = rawTextEnd(html, name, end + 1);
      continue;
    }
    if (name === "meta" && templateDepth === 0 && (!hasExplicitHead || headDepth > 0)) yield tag;
    index = end + 1;
  }
}

export function readRobotsPolicy(html) {
  if (typeof html !== "string") throw new Error("rendered HTML must be text");
  const directives = new Set();
  let present = false;
  for (const tag of activeMetaTags(html)) {
    const attributes = parseAttributes(tag);
    if (attributes.get("name")?.toLowerCase() !== "robots") continue;
    present = true;
    for (const directive of (attributes.get("content") || "").toLowerCase().split(/[\s,]+/u)) {
      if (directive) directives.add(directive);
    }
  }
  return { present, directives };
}

export function verifyRobotsPolicy(html, expectNoIndex, label) {
  const { present, directives } = readRobotsPolicy(html);
  if (expectNoIndex) {
    if (!present || !directives.has("noindex") || !directives.has("nofollow")) {
      throw new Error(`${label} robots policy must include noindex and nofollow`);
    }
    return;
  }
  if (present) throw new Error(`${label} must not render a robots override`);
}
