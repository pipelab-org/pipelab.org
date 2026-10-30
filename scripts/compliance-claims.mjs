// The snapshot records Assess v3.7.1's published ControlMapping contract.
// These checks validate identifiers and coverage status, not prose semantics.
export function checkMappingRows(source, framework) {
  const rows = [];
  let headers = [];
  for (const line of source.split("\n")) {
    if (!line.startsWith("|")) { headers = []; continue; }
    const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
    if (cells.includes("Status")) { headers = ["ID", "Function"].includes(cells[0]) ? cells : []; continue; }
    if (!headers.length || cells.every(cell => /^[-:]+$/.test(cell))) continue;
    rows.push({ id: cells[0], status: cells[headers.indexOf("Status")] });
  }
  const expected = framework.controls.map(({ id, status }) => ({ id, status }));
  const errors = [];
  for (const row of rows) {
    const control = expected.find(control => control.id === row.id);
    if (!control) errors.push(`unsupported control ${row.id}`);
    else if (row.status !== control.status) errors.push(`${row.id}: expected ${control.status}, got ${row.status}`);
  }
  for (const control of expected) {
    if (rows.filter(row => row.id === control.id).length !== 1) errors.push(`${control.id}: expected one mapping row`);
  }
  return errors;
}

export function checkProofFrameworkLinks(html, routes) {
  const chips = [...html.matchAll(/<(a|span)\b([^>]*)class="proof-chip"([^>]*)>(.*?)<\/\1>/gs)];
  const errors = [];
  for (const route of routes) {
    const matches = chips.filter(([, tag, before, after]) => tag === "a" && new RegExp(`(?<![\\w-])href="${route}"`).test(before + after));
    if (matches.length !== 1) errors.push(`expected one framework chip link to ${route}`);
  }
  if (chips.some(([, tag]) => tag !== "a")) errors.push("framework chip is unlinked");
  for (const [, tag, before, after] of chips) {
    const href = (before + after).match(/(?<![\w-])href="([^"]*)"/)?.[1];
    if (tag === "a" && !routes.includes(href)) errors.push(`framework chip links outside the Assess catalog: ${href ?? "no href"}`);
  }
  return errors;
}

// Documentation ratings have a different source and scale from Assess statuses.
// The caller names the documents supporting its claims; this check enforces
// attribution and release-pinned links, not the meaning of coverage prose.
export function checkDocumentedMappingSources(source, documentPaths) {
  const errors = [];
  if (!/published documentation mappings?/i.test(source)) errors.push("missing published documentation mapping label");
  if (!/\bAssess\b/.test(source)) errors.push("missing separate Assess scope");
  const links = [...source.matchAll(/(?:\]\(|(?<![\w-])href=["'])(https:\/\/[^\s)"']+)/g)]
    .map(([, url]) => url.split("#")[0]);
  for (const documentPath of documentPaths) {
    const url = `https://github.com/pipelab-org/pipelock/blob/v3.7.1/${documentPath}`;
    if (!links.includes(url)) errors.push(`missing documentation source link: ${url}`);
  }
  return errors;
}
