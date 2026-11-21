// Operator-facing failure evidence. Acceptance records one line per failed
// step; the import refusal repeats it. Text that reaches a workflow log or a
// public run page passes through diagnosticLine first.

// Credential-shaped text anywhere in the evidence withholds the whole line.
// Partial redaction proved unsafe: a split key, a supplied marker or a value
// longer than its recognized prefix each left part of a secret readable. This
// list is a backstop, not a guarantee: the public refusal repeats evidence only
// in the allowlisted fixture-summary form (see acceptanceRefusal).
const credentialShapes = [
  /[a-z][a-z0-9+.-]*:\/\/[^\s/@]*@/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{8,}|github_pat_|xox[abprs]-|A[KS]IA[0-9A-Z]{8,}|glpat-|npm_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\./,
  /(?:proxy-)?authorization["']?\s*[:=]/i,
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /(?:token|secret|passw(?:or)?d|api[_-]?key|credential|private[_-]?key|(?:set-)?cookie|signature)["']?\s*[:=]/i,
];

// The sk- and sk_ prefixes appear inside ordinary names such as
// risk-scoring-rules, so they need a boundary and are checked only as given.
const boundedShapes = [/(?<![A-Za-z0-9])sk[-_][A-Za-z0-9_-]{8,}/];

export function diagnosticLine(value, limit = 600) {
  if (typeof value !== "string") return "no evidence recorded";
  // Encoded text can hide keys and delimiters.
  if (/%[0-9a-f]{2}|\\u[0-9a-f]{4}/i.test(value)) return "encoded diagnostic evidence withheld";
  // Invisible format, private-use and control characters can disguise text;
  // only tab, line feed and carriage return stay readable.
  if (/[\p{Cf}\p{Co}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
    return "hidden-character diagnostic evidence withheld";
  }
  const compact = value.replace(/\s+/g, "");
  if (credentialShapes.some(shape => shape.test(value) || shape.test(compact)) || boundedShapes.some(shape => shape.test(value))) {
    return "credential-like diagnostic evidence withheld";
  }
  // Line separators can rewrite log lines; collapse to one line.
  const line = value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!line) return "no evidence recorded";
  return line.length > limit ? line.slice(0, limit - 1) + "…" : line;
}

export const notExecuted = "Not executed.";

// The failed step's one-line evidence from an acceptance report on stdout.
// Returns undefined when the report is absent or names no failed step.
export function failedAcceptanceStep(stdout) {
  let steps;
  try {
    ({ steps } = JSON.parse(stdout));
  } catch {
    return undefined;
  }
  if (!steps || typeof steps !== "object") return undefined;
  // Acceptance marks steps it never reached as failed with a placeholder; report
  // the step that actually failed, falling back to the first failed step.
  const failed = Object.keys(steps).filter(key => /^(?:[1-9]|10)$/.test(key) && steps[key]?.status === "fail");
  const step = failed.find(key => steps[key].evidence !== notExecuted) ?? failed[0];
  return step ? { step, evidence: diagnosticLine(steps[step].evidence) } : undefined;
}

// Names the failed top-level tests from a node:test TAP report so a refusal
// says which fixture failed instead of echoing the whole command line.
export function fixtureFailureEvidence(error, { names = 6, nameLimit = 80 } = {}) {
  const text = value => (value == null ? "" : Buffer.isBuffer(value) ? value.toString("utf8") : String(value));
  const stdout = text(error?.stdout);
  const failed = [...stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1].replace(/\s+#\s+(?:SKIP|TODO).*$/i, ""));
  if (failed.length) {
    const total = /^# tests (\d+)$/m.exec(stdout)?.[1];
    const shown = failed.slice(0, names).map(name => diagnosticLine(name, nameLimit));
    const more = failed.length > shown.length ? "; +" + (failed.length - shown.length) + " more" : "";
    return failed.length + (total ? " of " + total : "") + " Hub fixture tests failed: " + shown.join("; ") + more;
  }
  const first = value => text(value).split("\n").find(line => line.trim()) ?? "";
  return "Hub fixture run failed without a test report: " + (first(error?.stderr) || first(error?.message) || "no output");
}
