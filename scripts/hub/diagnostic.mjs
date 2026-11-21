// Operator-facing failure evidence. Acceptance records one line per failed
// step; the import refusal repeats it. Text that reaches a workflow log or a
// public run page passes through diagnosticLine first.

const redactions = [
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, "$1[redacted]@"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g, "[redacted]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,})/g, "[redacted]"],
  // Every scheme carries credentials after its name, so withhold the rest of the line.
  [/\b(authorization|proxy-authorization)(["']?\s*[:=]\s*)[^\r\n]*/gi, "$1$2[redacted]"],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [/\b([A-Za-z0-9_-]*(?:token|secret|passw(?:or)?d|api[_-]?key|credential|private[_-]?key)[A-Za-z0-9_-]*)(["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+)/gi, "$1$2[redacted]"],
];

export function diagnosticLine(value, limit = 600) {
  if (typeof value !== "string") return "no evidence recorded";
  // Encoded text can hide keys and delimiters. Withhold it rather than
  // decoding untrusted quoting into a different structure before redaction.
  if (/%[0-9a-f]{2}|\\u[0-9a-f]{4}/i.test(value)) return "encoded diagnostic evidence withheld";
  // Invisible format and control characters can split a credential key so it
  // escapes the patterns below and then rejoins when they are stripped.
  // Withhold that too; only tab, line feed and carriage return stay readable.
  if (/[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
    return "hidden-character diagnostic evidence withheld";
  }
  let line = value;
  for (const [pattern, replacement] of redactions) line = line.replace(pattern, replacement);
  // Control and bidirectional characters can hide or rewrite log lines.
  line = line.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!line) return "no evidence recorded";
  // Whitespace can split a credential key so the patterns above miss it. If the
  // text with all whitespace removed still shows an unredacted credential key and
  // value, withhold the whole line rather than chase each separator.
  if (/(?:token|secret|passw(?:or)?d|api[_-]?key|credential|private[_-]?key|authorization)["']?[:=](?!\[redacted\])\S/i
    .test(line.replace(/\s+/g, ""))) {
    return "credential-like diagnostic evidence withheld";
  }
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
