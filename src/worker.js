import pg from "pg";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

function wantsMarkdown(request) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return false;
  }
  const accept = request.headers.get("Accept") || "";
  return /\btext\/markdown\b/i.test(accept);
}

function isHtmlResponse(response) {
  const contentType = response.headers.get("Content-Type") || "";
  return response.ok && contentType.includes("text/html");
}

function withVary(headers, value) {
  const parts = (headers.get("Vary") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(value)) {
    parts.push(value);
  }
  headers.set("Vary", parts.join(", "));
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(text) {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " "));
}

function absolutizeUrl(candidate, baseUrl) {
  if (!candidate) {
    return "";
  }
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate;
  }
}

function convertInlineHtml(html, baseUrl) {
  let output = html;
  output = output.replace(/<br\s*\/?>/gi, "\n");
  output = output.replace(
    /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi,
    (_, src, alt) => `![${decodeHtmlEntities(alt)}](${absolutizeUrl(src, baseUrl)})`
  );
  output = output.replace(
    /<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/gi,
    (_, alt, src) => `![${decodeHtmlEntities(alt)}](${absolutizeUrl(src, baseUrl)})`
  );
  output = output.replace(
    /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => {
      const label = convertInlineHtml(text, baseUrl).trim() || absolutizeUrl(href, baseUrl);
      return `[${label}](${absolutizeUrl(href, baseUrl)})`;
    }
  );
  output = output.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    (_, text) => `\`${stripTags(text).trim()}\``
  );
  output = output.replace(
    /<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_, _tag, text) => `**${convertInlineHtml(text, baseUrl).trim()}**`
  );
  output = output.replace(
    /<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_, _tag, text) => `*${convertInlineHtml(text, baseUrl).trim()}*`
  );
  output = output.replace(/\s+/g, " ");
  return stripTags(output).replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
}

function htmlToMarkdown(html, requestUrl) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim() : "";
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = mainMatch ? mainMatch[1] : bodyMatch ? bodyMatch[1] : html;
  const hasH1 = /<h1[\s\S]*?<\/h1>/i.test(content);

  content = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, "");

  content = content.replace(
    /<pre[^>]*>\s*(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi,
    (_, code) => `\n\n\`\`\`\n${decodeHtmlEntities(code).trim()}\n\`\`\`\n\n`
  );
  content = content.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_, text) => {
      const lines = convertInlineHtml(text, requestUrl)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join("\n");
      return `\n\n${lines}\n\n`;
    }
  );
  content = content.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, level, text) => `\n\n${"#".repeat(parseInt(level, 10))} ${convertInlineHtml(text, requestUrl)}\n\n`
  );
  content = content.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_, text) => `\n- ${convertInlineHtml(text, requestUrl)}`
  );
  content = content.replace(
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    (_, text) => `\n\n${convertInlineHtml(text, requestUrl)}\n\n`
  );
  content = content.replace(
    /<(div|section|article|header|footer|main)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_, _tag, text) => `\n\n${text}\n\n`
  );

  let markdown = decodeHtmlEntities(content)
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (!hasH1 && title && !new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(markdown)) {
    markdown = `# ${title}\n\n${markdown}`;
  }

  return `Source: ${requestUrl}\n\n${markdown}`.trim() + "\n";
}

function estimateMarkdownTokens(markdown) {
  return Math.max(1, Math.ceil(markdown.length / 4));
}

async function maybeServeMarkdown(request, response) {
  const headers = new Headers(response.headers);

  if (!wantsMarkdown(request) || !isHtmlResponse(response)) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  withVary(headers, "Accept");
  headers.set("Content-Type", MARKDOWN_CONTENT_TYPE);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("ETag");

  if (request.method === "HEAD") {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const html = await response.text();
  const markdown = htmlToMarkdown(html, request.url);
  headers.set("X-Markdown-Tokens", String(estimateMarkdownTokens(markdown)));

  return new Response(markdown, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const CONTACT_REASONS = new Set([
  "general",
  "trial",
  "sales",
  "support",
  "security",
  "press",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_ALLOWED_HOSTNAMES = new Set([
  "pipelab.org",
  "www.pipelab.org",
  "pipelab.pages.dev",
]);
const TURNSTILE_PAGES_PREVIEW_SUFFIX = ".pipelab.pages.dev";
const CONTACT_MAX_BYTES = 32_768;
const RESULTS_MAX_BYTES = 262_144;
const MAX_RESULT_TOTAL_CASES = 10_000;
// This board publishes first-party Pipelock run history and nothing else. The
// benchmark's results-use policy commits the maintainer to no ranking and no
// cross-tool comparison table, so hosting another vendor's score here would
// contradict it no matter how the page is worded. Everyone else publishes and
// owns their own result.
const RESULTS_FIRST_PARTY_TOOLS = new Set(["pipelock"]);

function jsonError(status, message) {
  return Response.json({ error: message }, { status, headers: CORS_HEADERS });
}

function contactRedirect(fragment) {
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: `/contact/#${fragment}`,
    },
  });
}

function contactError(isForm, status, message) {
  return isForm
    ? contactRedirect("message-error")
    : jsonError(status, message);
}

function contactSuccess(isForm) {
  return isForm
    ? contactRedirect("message-sent")
    : Response.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
}

function normalizeHostname(hostname) {
  return typeof hostname === "string"
    ? hostname.trim().toLowerCase().replace(/\.$/, "")
    : "";
}

function isAllowedTurnstileHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (TURNSTILE_ALLOWED_HOSTNAMES.has(normalized)) {
    return true;
  }

  if (!normalized.endsWith(TURNSTILE_PAGES_PREVIEW_SUFFIX)) {
    return false;
  }

  const previewLabel = normalized.slice(0, -TURNSTILE_PAGES_PREVIEW_SUFFIX.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(previewLabel);
}

async function verifyTurnstile(token, secret, remoteIp) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return Boolean(
    data &&
      data.success === true &&
      isAllowedTurnstileHostname(data.hostname)
  );
}

async function sendContactEmail(env, fields, meta) {
  // Default TO: luckypipe@pipelab.org. pipelab.org's MX is ProtonMail and we
  // don't want to take it over with Cloudflare Email Routing. Override via
  // CONTACT_TO_EMAIL secret if you ever set up an alias like contact@.
  // Default FROM: contact@mail.pipelab.org. Resend verifies the mail.
  // subdomain, not the apex (apex MX belongs to Proton). FROM must be on a
  // verified domain or Resend rejects.
  const to = env.CONTACT_TO_EMAIL || "luckypipe@pipelab.org";
  const from = env.CONTACT_FROM_EMAIL || "PipeLab Contact <contact@mail.pipelab.org>";
  const subject = `[${fields.reason}] ${fields.name}`;
  const text = [
    `Reason: ${fields.reason}`,
    `Name:   ${fields.name}`,
    `Email:  ${fields.email}`,
    "",
    fields.message,
    "",
    "--",
    `Submitted: ${meta.submittedAt}`,
    `IP:        ${meta.ip || "unknown"}`,
    `UA:        ${meta.userAgent || "unknown"}`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: fields.email,
      subject,
      text,
    }),
  });
  return res.ok;
}

async function handleContactPost(request, env) {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  const mediaType = contentType.split(";", 1)[0].trim();
  const isJson = mediaType === "application/json";
  const isForm = mediaType === "application/x-www-form-urlencoded";
  if (!isJson && !isForm) {
    return jsonError(415, "Content-Type must be application/json or application/x-www-form-urlencoded");
  }
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
    return contactError(isForm, 503, "Contact form not configured");
  }

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > CONTACT_MAX_BYTES) {
    return contactError(isForm, 413, "Payload too large");
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > CONTACT_MAX_BYTES) {
      return contactError(isForm, 413, "Payload too large");
    }
    body = isJson ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return contactError(
      isForm,
      400,
      isJson ? "Invalid JSON" : "Invalid form body"
    );
  }

  // Honeypot: bots fill any visible-named field, real users never touch
  // a hidden one. Return the normal success shape so the bot gets no signal.
  if (body && typeof body.website === "string" && body.website.trim() !== "") {
    return contactSuccess(isForm);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const turnstileToken =
    typeof body["cf-turnstile-response"] === "string"
      ? body["cf-turnstile-response"]
      : "";

  if (!name || name.length > 200) {
    return contactError(isForm, 422, "Name is required (max 200 chars)");
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return contactError(isForm, 422, "A valid email is required");
  }
  if (!CONTACT_REASONS.has(reason)) {
    return contactError(isForm, 422, "Invalid reason");
  }
  if (!message || message.length > 4000) {
    return contactError(isForm, 422, "Message is required (max 4000 chars)");
  }
  if (!turnstileToken) {
    return contactError(isForm, 422, "Captcha token missing");
  }

  const remoteIp = request.headers.get("cf-connecting-ip") || "";
  const turnstileOk = await verifyTurnstile(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
    remoteIp
  );
  if (!turnstileOk) {
    return contactError(isForm, 403, "Captcha verification failed");
  }

  const sent = await sendContactEmail(
    env,
    { name, email, reason, message },
    {
      submittedAt: new Date().toISOString(),
      ip: remoteIp,
      userAgent: request.headers.get("User-Agent") || "",
    }
  );
  if (!sent) {
    return contactError(isForm, 502, "Could not send message. Try email instead.");
  }

  return contactSuccess(isForm);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function boundedString(value, maxLength, pattern) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return null;
  }
  if (pattern && !pattern.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function boundedInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function scoreValue(value) {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1)
  )
    ? value
    : undefined;
}

function sanitizeScoreSet(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const sanitized = {};
  for (const field of ["containment", "false_positive_rate", "detection", "evidence"]) {
    const score = scoreValue(value[field]);
    if (score === undefined) {
      return null;
    }
    sanitized[field] = score;
  }
  return sanitized;
}

function sanitizeStringArray(value, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    return null;
  }
  const sanitized = [];
  for (const item of value) {
    const text = boundedString(item, 64, /^[a-z0-9_-]+$/);
    if (text === null) {
      return null;
    }
    sanitized.push(text);
  }
  return sanitized;
}

function sanitizeGauntletPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const gauntletVersion = boundedString(payload.gauntlet_version, 32, /^[0-9A-Za-z._-]+$/);
  const scoringVersion = boundedString(payload.scoring_version, 32, /^[0-9A-Za-z._-]+$/);
  const runnerVersion = boundedString(payload.runner_version, 32, /^[0-9A-Za-z._-]+$/);
  const tool = boundedString(payload.tool, 80, /^[0-9A-Za-z][0-9A-Za-z ._+/-]*$/);
  const toolVersion = boundedString(payload.tool_version, 80);
  const corpusVersion = boundedString(payload.corpus_version, 80);
  const corpusSHA256 = boundedString(payload.corpus_sha256, 64, /^[0-9a-f]{64}$/i);
  const toolProfileSHA256 = boundedString(
    payload.tool_profile_sha256,
    64,
    /^[0-9a-f]{64}$/i
  );
  const date = boundedString(payload.date, 40);
  const parsedDate = date ? Date.parse(date) : NaN;
  if (
    !gauntletVersion ||
    !scoringVersion ||
    !runnerVersion ||
    !tool ||
    !toolVersion ||
    !corpusVersion ||
    !corpusSHA256 ||
    !toolProfileSHA256 ||
    !date ||
    !Number.isFinite(parsedDate)
  ) {
    return null;
  }

  const caseCount = payload.case_count;
  if (!isPlainObject(caseCount)) {
    return null;
  }
  const total = boundedInteger(caseCount.total, 1, MAX_RESULT_TOTAL_CASES);
  const applicable = boundedInteger(caseCount.applicable, 0, total ?? 0);
  const notApplicable = boundedInteger(caseCount.not_applicable, 0, total ?? 0);
  const errors = boundedInteger(caseCount.errors, 0, total ?? 0);
  if (
    total === null ||
    applicable === null ||
    notApplicable === null ||
    errors === null ||
    applicable + notApplicable > total
  ) {
    return null;
  }

  const reasons = caseCount.not_applicable_reasons;
  if (!isPlainObject(reasons)) {
    return null;
  }
  const reasonEntries = Object.entries(reasons);
  if (reasonEntries.length > 32) {
    return null;
  }
  const sanitizedReasons = {};
  for (const [key, value] of reasonEntries) {
    if (!/^[a-z0-9_-]{1,64}$/.test(key)) {
      return null;
    }
    const count = boundedInteger(value, 0, total);
    if (count === null) {
      return null;
    }
    sanitizedReasons[key] = count;
  }

  const toolSupport = payload.tool_support;
  if (!isPlainObject(toolSupport)) {
    return null;
  }
  const claims = sanitizeStringArray(toolSupport.claims, 64);
  const unsupportedTransports = sanitizeStringArray(
    toolSupport.unsupported_transports,
    32
  );
  const unsupportedRequires = sanitizeStringArray(toolSupport.unsupported_requires, 64);
  if (!claims || !unsupportedTransports || !unsupportedRequires) {
    return null;
  }

  const scores = payload.scores;
  if (!isPlainObject(scores)) {
    return null;
  }
  const fullScores = sanitizeScoreSet(scores.full);
  const applicableScores = sanitizeScoreSet(scores.applicable);
  if (!fullScores || !applicableScores) {
    return null;
  }

  const categories = payload.per_category;
  if (!isPlainObject(categories)) {
    return null;
  }
  const categoryEntries = Object.entries(categories);
  if (categoryEntries.length === 0 || categoryEntries.length > 64) {
    return null;
  }
  const sanitizedCategories = {};
  for (const [key, value] of categoryEntries) {
    if (!/^[a-z0-9_-]{1,64}$/.test(key) || !isPlainObject(value)) {
      return null;
    }
    const categoryApplicable = boundedInteger(value.applicable, 0, total);
    const containment = scoreValue(value.containment);
    const falsePositiveRate = scoreValue(value.false_positive_rate);
    const detection = scoreValue(value.detection);
    const evidence = scoreValue(value.evidence);
    if (
      categoryApplicable === null ||
      containment === undefined ||
      falsePositiveRate === undefined ||
      detection === undefined ||
      evidence === undefined
    ) {
      return null;
    }
    sanitizedCategories[key] = {
      applicable: categoryApplicable,
      containment,
      false_positive_rate: falsePositiveRate,
      detection,
      evidence,
    };
  }

  if (typeof payload.sufficient !== "boolean") {
    return null;
  }

  return {
    gauntlet_version: gauntletVersion,
    scoring_version: scoringVersion,
    runner_version: runnerVersion,
    tool,
    tool_version: toolVersion,
    corpus_version: corpusVersion,
    corpus_sha256: corpusSHA256.toLowerCase(),
    tool_profile_sha256: toolProfileSHA256.toLowerCase(),
    date: new Date(parsedDate).toISOString(),
    case_count: {
      total,
      applicable,
      not_applicable: notApplicable,
      not_applicable_reasons: sanitizedReasons,
      errors,
    },
    tool_support: {
      claims,
      unsupported_transports: unsupportedTransports,
      unsupported_requires: unsupportedRequires,
    },
    scores: {
      full: fullScores,
      applicable: applicableScores,
    },
    sufficient: payload.sufficient,
    per_category: sanitizedCategories,
  };
}

async function getClient(env) {
  const client = new pg.Client({
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT || "5432", 10),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: false,
  });
  await client.connect();
  return client;
}

async function handleListResults(env) {
  let client;
  try {
    client = await getClient(env);
    const result = await client.query(
      `SELECT id, payload->>'tool' AS tool, payload->>'tool_version' AS tool_version,
              payload->'scores'->'applicable'->>'containment' AS containment,
              payload->'scores'->'full'->>'containment' AS full_containment,
              payload->>'sufficient' AS sufficient,
              payload->'case_count'->>'applicable' AS applicable,
              payload->'case_count'->>'total' AS total,
              created_at
       FROM test_results
       WHERE public = true
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return Response.json(
      { results: result.rows },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("DB list error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  } finally {
    if (client) await client.end();
  }
}

async function handlePostResults(request, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return jsonError(503, "Results submission not configured");
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(415, "Content-Type must be application/json");
  }

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > RESULTS_MAX_BYTES) {
    return jsonError(413, "Payload too large");
  }

  let payload;
  let isPublic;
  let turnstileToken;
  try {
    const body = await request.text();
    if (body.length > RESULTS_MAX_BYTES) {
      return jsonError(413, "Payload too large");
    }
    const parsed = JSON.parse(body);
    if (!isPlainObject(parsed)) {
      return jsonError(400, "Invalid JSON");
    }
    payload = parsed.payload !== undefined ? parsed.payload : parsed;
    if (parsed.public !== undefined && typeof parsed.public !== "boolean") {
      return jsonError(422, "Invalid public flag");
    }
    isPublic = parsed.public !== undefined ? parsed.public : true;
    turnstileToken =
      typeof parsed["cf-turnstile-response"] === "string"
        ? parsed["cf-turnstile-response"]
        : "";
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  if (!turnstileToken) {
    return jsonError(422, "Captcha token missing");
  }

  const remoteIp = request.headers.get("cf-connecting-ip") || "";
  const turnstileOk = await verifyTurnstile(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
    remoteIp
  );
  if (!turnstileOk) {
    return jsonError(403, "Captcha verification failed");
  }

  const sanitizedPayload = sanitizeGauntletPayload(payload);
  if (!sanitizedPayload) {
    return jsonError(
      422,
      "Invalid payload: must match the Agent Egress Bench gauntlet summary schema"
    );
  }

  const submittedTool =
    typeof sanitizedPayload.tool === "string"
      ? sanitizedPayload.tool.trim().toLowerCase()
      : "";
  if (!RESULTS_FIRST_PARTY_TOOLS.has(submittedTool)) {
    return jsonError(
      422,
      "This page publishes Pipelock first-party run history only, and does not host results for other tools. Run the Agent Egress Bench corpus against your own tool and publish the result yourself. See https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/RESULTS-USE.md"
    );
  }

  let client;
  try {
    client = await getClient(env);
    const result = await client.query(
      "INSERT INTO test_results (payload, public) VALUES ($1::jsonb, $2) RETURNING id",
      [JSON.stringify(sanitizedPayload), isPublic]
    );
    const id = result.rows[0].id;
    return Response.json(
      { id, url: `/gauntlet/results/${id}` },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("DB insert error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  } finally {
    if (client) await client.end();
  }
}

async function handleGetResult(id, env) {
  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: "Invalid result ID" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let client;
  try {
    client = await getClient(env);
    const result = await client.query(
      "SELECT payload, created_at FROM test_results WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return Response.json(
        { error: "Result not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return Response.json(
      {
        id,
        payload: result.rows[0].payload,
        created_at: result.rows[0].created_at,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err) {
    console.error("DB query error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  } finally {
    if (client) await client.end();
  }
}

// Maximum webhook body we will read. GitHub advisory payloads are a few KB;
// anything far larger is not one, and refusing it costs us nothing.
const ADVISORY_WEBHOOK_MAX_BYTES = 131_072;

// Telegram rejects messages over 4096 characters. Each field is truncated well
// below that so a long reporter-written summary cannot cause a silent delivery
// failure, which would defeat the point of the alert.
const TELEGRAM_MAX_FIELD = 400;

// Constant-time comparison of two hex signature strings. A plain === leaks,
// through timing, how many leading bytes matched, which lets an attacker
// recover a valid signature byte by byte. Lengths are compared first because
// they are not secret and unequal lengths make the XOR loop meaningless.
function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Hex-encode an ArrayBuffer, matching GitHub's sha256= signature format.
function toHexSignature(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Verify GitHub's X-Hub-Signature-256 header over the raw request body. This is
// the only thing standing between a public URL and anyone posting arbitrary
// text into a private group, so it fails closed on a missing secret, a missing
// header, a malformed header, or any mismatch.
//
// bodyBytes must be the EXACT bytes received. GitHub signs the octets on the
// wire, so decoding the body to a string and re-encoding it is not equivalent:
// invalid or noncanonical UTF-8 is replaced during the decode, the re-encoded
// bytes then differ from the signed ones, and a legitimately signed delivery
// fails verification. That direction is safe rather than exploitable, but it
// silently drops real alerts, which is the failure this endpoint exists to
// prevent, so the raw bytes are carried through instead.
async function verifyGitHubSignature(bodyBytes, signatureHeader, secret) {
  if (!secret || !signatureHeader) {
    return false;
  }
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, bodyBytes);
  return timingSafeEqualHex(`sha256=${toHexSignature(mac)}`, signatureHeader);
}

// Flatten untrusted text for Telegram. The advisory summary is written by
// whoever filed the report, so it is attacker-controlled. The message is sent
// with no parse_mode, which means Telegram renders it literally and there is no
// markup to inject; collapsing whitespace additionally stops a crafted summary
// forging extra lines that look like fields of the alert.
function flattenForTelegram(value, max) {
  const limit = max || TELEGRAM_MAX_FIELD;
  if (typeof value !== "string" || value === "") {
    return "(none)";
  }
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) {
    return flat;
  }
  return `${flat.slice(0, limit - 1)}...`;
}

// POST /api/gh-advisory
//
// GitHub does not notify a maintainer when someone privately reports a
// vulnerability unless specific watch settings are enabled, and two real
// reports went unnoticed for months as a result. This receives the
// repository_advisory webhook and pushes it straight into the team group, so a
// report cannot sit unseen in a queue nobody opens.
//
// Returns 2xx once the signature verifies, including for events it does not act
// on. GitHub disables an endpoint that keeps erroring, and losing the delivery
// channel is the exact failure this exists to prevent.
async function handleGitHubAdvisoryWebhook(request, env) {
  const signature = request.headers.get("X-Hub-Signature-256");
  const event = request.headers.get("X-GitHub-Event");

  // Content-Length is attacker-supplied, so it is parsed strictly rather than
  // with Number(): Number("abc") is NaN, and NaN > limit is false, which would
  // let a malformed header skip this check entirely. A header that is present
  // and not a plain non-negative integer is itself a reason to refuse.
  const lengthHeader = request.headers.get("Content-Length");
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader.trim())) {
      return new Response("bad content-length", { status: 400 });
    }
    if (Number(lengthHeader.trim()) > ADVISORY_WEBHOOK_MAX_BYTES) {
      return new Response("payload too large", { status: 413 });
    }
  }

  // Read the exact octets. byteLength is a BYTE count, where a string's .length
  // counts UTF-16 code units, so a multibyte body could previously exceed the
  // intended byte budget by roughly three times while passing the check.
  const bodyBuffer = await request.arrayBuffer();
  if (bodyBuffer.byteLength > ADVISORY_WEBHOOK_MAX_BYTES) {
    return new Response("payload too large", { status: 413 });
  }
  const bodyBytes = new Uint8Array(bodyBuffer);

  const verified = await verifyGitHubSignature(
    bodyBytes,
    signature,
    env.GITHUB_ADVISORY_WEBHOOK_SECRET
  );
  if (!verified) {
    // Deliberately vague: a precise reason tells a prober whether the secret is
    // configured and how close their signature shape was.
    return new Response("forbidden", { status: 403 });
  }

  // GitHub sends this once when the webhook is created. Acknowledge it so setup
  // shows green, but do not alert anyone.
  if (event === "ping") {
    return Response.json({ ok: true, pong: true });
  }

  if (event !== "repository_advisory") {
    return Response.json({ ok: true, ignored: event || "unknown" });
  }

  // Decode only after the signature has been verified over the raw bytes, so a
  // decode that alters the input cannot affect the verification result.
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return Response.json({ ok: true, ignored: "unparseable" });
  }

  const action = payload && payload.action;
  const advisory = (payload && payload.repository_advisory) || {};
  const repoName =
    (payload && payload.repository && payload.repository.full_name) ||
    "unknown repository";

  // "reported" is the one that matters: a human just filed something and the
  // clock on answering them starts now.
  const heading =
    action === "reported"
      ? "NEW SECURITY REPORT (private)"
      : `Security advisory ${flattenForTelegram(action, 40)}`;

  const lines = [
    heading,
    `Repo:     ${flattenForTelegram(repoName, 80)}`,
    `ID:       ${flattenForTelegram(advisory.ghsa_id, 40)}`,
    `Severity: ${flattenForTelegram(advisory.severity, 20)}`,
    `Summary:  ${flattenForTelegram(advisory.summary)}`,
    `Link:     ${flattenForTelegram(advisory.html_url, 200)}`,
  ];
  if (action === "reported") {
    lines.push("", "No email goes out for this. This alert is the only notice.");
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_ADVISORY_CHAT_ID;
  if (!token || !chatId) {
    console.error("advisory webhook: telegram credentials not configured");
    // Still 2xx: the delivery failure is ours, and making GitHub retry or
    // disable the hook does not fix a missing secret.
    return Response.json({ ok: true, delivered: false });
  }

  try {
    const telegram = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join("\n"),
          disable_web_page_preview: true,
        }),
      }
    );
    if (!telegram.ok) {
      console.error("advisory webhook: telegram rejected", telegram.status);
      return Response.json({ ok: true, delivered: false });
    }
  } catch (err) {
    console.error("advisory webhook: telegram send threw:", err);
    return Response.json({ ok: true, delivered: false });
  }

  return Response.json({ ok: true, delivered: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS" && path.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // POST /api/gh-advisory
    // Intentionally not part of the CORS preflight surface above: GitHub posts
    // server-side, and no browser has any business calling this.
    if (path === "/api/gh-advisory" && request.method === "POST") {
      return handleGitHubAdvisoryWebhook(request, env);
    }

    // POST /api/contact
    if (path === "/api/contact" && request.method === "POST") {
      return handleContactPost(request, env);
    }

    // POST /api/results
    if (path === "/api/results" && request.method === "POST") {
      return handlePostResults(request, env);
    }

    // GET /api/results
    if (path === "/api/results" && request.method === "GET") {
      return handleListResults(env);
    }

    // GET /api/results/:id
    const idMatch = path.match(/^\/api\/results\/([^/]+)$/);
    if (idMatch && request.method === "GET") {
      return handleGetResult(idMatch[1], env);
    }

    // Everything else falls through to static assets. Wrap in try/catch
    // because env.ASSETS.fetch throws on directory-index paths where no
    // index.html exists, which surfaces as a Cloudflare 1101 "Worker threw
    // exception" instead of a clean 404. Catching locally turns those into
    // proper not-found responses.
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      return await maybeServeMarkdown(request, assetResponse);
    } catch (err) {
      console.error("ASSETS fetch threw:", err, "path:", path);
      return new Response("Not Found", { status: 404 });
    }
  },
};
