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
    const matches = chips.filter(([, tag, before, after]) => tag === "a" && new RegExp(`\\bhref="${route}"`).test(before + after));
    if (matches.length !== 1) errors.push(`expected one framework chip link to ${route}`);
  }
  if (chips.some(([, tag]) => tag !== "a")) errors.push("framework chip is unlinked");
  return errors;
}
