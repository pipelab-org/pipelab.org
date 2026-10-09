import path from "node:path";

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

export function requireRepositoryPath(value, label) {
  const candidate = requireNonemptyString(value, label);
  if (
    candidate.startsWith("/")
    || candidate.includes("\\")
    || /[?#\u0000-\u001f\u007f]/u.test(candidate)
    || path.posix.normalize(candidate) !== candidate
    || candidate.split("/").some((segment) => segment === "." || segment === ".." || segment === "")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return candidate;
}

export function requireGoSourcePath(value, label) {
  const candidate = requireRepositoryPath(value, label);
  if (path.posix.extname(candidate) !== ".go") {
    throw new Error(`${label} must name a Go source file`);
  }
  return candidate;
}

export function stripGoCommentsAndLiterals(source) {
  if (typeof source !== "string") throw new Error("Go source must be text");
  let output = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        output += "  ";
        index += 1;
        state = "line-comment";
      } else if (char === "/" && next === "*") {
        output += "  ";
        index += 1;
        state = "block-comment";
      } else if (char === '"') {
        output += "0";
        state = "string";
      } else if (char === "'") {
        output += "0";
        state = "rune";
      } else if (char === "`") {
        output += "0";
        state = "raw-string";
      } else {
        output += char;
      }
      continue;
    }

    if (char === "\n") {
      output += "\n";
      if (state === "line-comment") state = "code";
      continue;
    }
    output += " ";

    if (state === "block-comment" && char === "*" && next === "/") {
      output += " ";
      index += 1;
      state = "code";
    } else if ((state === "string" || state === "rune") && char === "\\") {
      if (index + 1 < source.length) {
        output += source[index + 1] === "\n" ? "\n" : " ";
        index += 1;
      }
    } else if (state === "string" && char === '"') {
      state = "code";
    } else if (state === "rune" && char === "'") {
      state = "code";
    } else if (state === "raw-string" && char === "`") {
      state = "code";
    }
  }
  return output;
}

function isGoIdentifierStart(value) {
  return /^[_\p{L}]$/u.test(value);
}

function isGoIdentifierContinue(value) {
  return /^[_\p{L}\p{Nd}]$/u.test(value);
}

function tokenizeGo(source) {
  const code = stripGoCommentsAndLiterals(source);
  const tokens = [];
  for (let index = 0; index < code.length;) {
    const tokenIndex = index;
    const value = String.fromCodePoint(code.codePointAt(index));
    if (isGoIdentifierStart(value)) {
      let identifier = value;
      index += value.length;
      while (index < code.length) {
        const next = String.fromCodePoint(code.codePointAt(index));
        if (!isGoIdentifierContinue(next)) break;
        identifier += next;
        index += next.length;
      }
      tokens.push({ kind: "identifier", value: identifier, index: tokenIndex });
      continue;
    }
    if (/\p{Nd}/u.test(value)) {
      tokens.push({ kind: "literal", value, index: tokenIndex });
      index += value.length;
      continue;
    }
    if (!/\s/u.test(value)) tokens.push({ kind: "punctuation", value, index: tokenIndex });
    index += value.length;
  }
  return { code, tokens };
}

function isIdentifier(token) {
  return token?.kind === "identifier";
}

function findClosingToken(tokens, start, opening, closing) {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].value === opening) depth += 1;
    if (tokens[index].value === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function receiverType(tokens) {
  let index = 0;
  if (isIdentifier(tokens[index]) && (tokens[index + 1]?.value === "*" || isIdentifier(tokens[index + 1]))) {
    index += 1;
  }
  let pointer = false;
  if (tokens[index]?.value === "*") {
    pointer = true;
    index += 1;
  }
  return isIdentifier(tokens[index]) ? { name: tokens[index].value, pointer } : null;
}

function parseGoDeclarations(source) {
  const { code, tokens } = tokenizeGo(source);
  const declarations = {
    packageName: "",
    functions: new Set(),
    types: new Set(),
    methods: [],
  };
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let previousToken;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const between = previousToken ? code.slice(previousToken.index + previousToken.value.length, token.index) : code.slice(0, token.index);
    const followsStatementBoundary = !previousToken
      || previousToken.value === ";"
      || (/\n/u.test(between) && (
        isIdentifier(previousToken)
        || previousToken.kind === "literal"
        || [")", "]", "}"].includes(previousToken.value)
        || ["break", "continue", "fallthrough", "return"].includes(previousToken.value)
      ));

    if (token.value === "{") {
      braceDepth += 1;
      previousToken = token;
      continue;
    }
    if (token.value === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      previousToken = token;
      continue;
    }
    if (token.value === "(") {
      parenthesisDepth += 1;
      previousToken = token;
      continue;
    }
    if (token.value === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      previousToken = token;
      continue;
    }
    if (token.value === "[") {
      bracketDepth += 1;
      previousToken = token;
      continue;
    }
    if (token.value === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      previousToken = token;
      continue;
    }
    if (braceDepth !== 0 || parenthesisDepth !== 0 || bracketDepth !== 0 || !isIdentifier(token) || !followsStatementBoundary) {
      previousToken = token;
      continue;
    }

    if (token.value === "package" && isIdentifier(tokens[index + 1])) {
      declarations.packageName = tokens[index + 1].value;
      previousToken = token;
      continue;
    }
    if (token.value === "type" && isIdentifier(tokens[index + 1])) {
      declarations.types.add(tokens[index + 1].value);
      previousToken = token;
      continue;
    }
    if (token.value !== "func") {
      previousToken = token;
      continue;
    }

    if (tokens[index + 1]?.value === "(") {
      const receiverEnd = findClosingToken(tokens, index + 1, "(", ")");
      const receiver = receiverEnd > 0 ? receiverType(tokens.slice(index + 2, receiverEnd)) : null;
      const method = tokens[receiverEnd + 1];
      if (receiver && isIdentifier(method) && ["(", "["].includes(tokens[receiverEnd + 2]?.value)) {
        declarations.functions.add(method.value);
        declarations.methods.push({ ...receiver, method: method.value });
      }
      previousToken = token;
      continue;
    }

    const functionName = tokens[index + 1];
    if (isIdentifier(functionName) && ["(", "["].includes(tokens[index + 2]?.value)) {
      declarations.functions.add(functionName.value);
    }
    previousToken = token;
  }
  return declarations;
}

export function verifyGoSymbol(source, symbol, label = "source symbol") {
  const declared = requireNonemptyString(symbol, label);
  const declarations = parseGoDeclarations(source);
  if (!declarations.packageName) throw new Error(`${label} source has no Go package declaration`);
  const method = declared.match(/^\(\*([a-z][a-z0-9_]*)\.([A-Z][A-Za-z0-9_]*)\)\.([A-Z][A-Za-z0-9_]*)$/);
  if (method) {
    const [, packageName, typeName, methodName] = method;
    if (
      declarations.packageName === packageName
      && declarations.methods.some((entry) => entry.pointer && entry.name === typeName && entry.method === methodName)
    ) return;
    throw new Error(`${label} does not match the pinned Go source`);
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(declared)) {
    throw new Error(`${label} must identify a Go declaration`);
  }
  if (declarations.functions.has(declared) || declarations.types.has(declared)) return;
  throw new Error(`${label} does not match the pinned Go source`);
}

function sourceRecords(snapshot) {
  return snapshot.capabilities.flatMap((capability) => [
    [capability, "operator entry point", capability.operator_entry_point?.source],
    [capability, "implementation", capability.implementation],
  ]);
}

export function verifyCapabilitySourceRecords(snapshot, readPinnedSource) {
  if (typeof readPinnedSource !== "function") throw new Error("pinned source reader is required");
  for (const [capability, recordKind, record] of sourceRecords(snapshot)) {
    const capabilityId = capability.id;
    if (!record || typeof record !== "object") throw new Error(`${capabilityId} ${recordKind} source record is missing`);
    const file = requireGoSourcePath(record.file, `${capabilityId} ${recordKind} source file`);
    let source;
    try {
      source = readPinnedSource(file);
    } catch (error) {
      throw new Error(`${capabilityId} ${recordKind} source file is absent from the pinned commit: ${error.message}`);
    }
    const text = Buffer.isBuffer(source) ? source.toString("utf8") : source;
    verifyGoSymbol(text, record.symbol, `${capabilityId} ${recordKind} symbol`);
  }
}
