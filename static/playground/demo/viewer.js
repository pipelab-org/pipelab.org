// Pipelock Playground demo viewer: vanilla beat engine + safe renderer.
// The viewer is driven by bundle.json. Content is
// rendered via createElement/textContent; only <code>...</code> spans are
// honored (renderRich), so attacker-controlled strings in the data (chat
// messages, URLs, canary tokens) can never inject markup.

const PACE = 1400;
let TOTAL = 10; // overridden from bundle.totalBeats

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

// low-alpha glow rgba from a #rrggbb hex (for active card halos)
function hexGlow(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "rgba(0,229,160,0.22)";
  const n = parseInt(m[1], 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (a == null ? 0.22 : a) + ")";
}

// Safe restricted renderer: splits on <code>..</code>, everything is textContent.
function renderRich(parent, str) {
  const re = /<code>([\s\S]*?)<\/code>/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parent.appendChild(document.createTextNode(str.slice(last, m.index)));
    parent.appendChild(el("code", null, m[1]));
    last = re.lastIndex;
  }
  if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
}

const state = { beat: 0, mode: "replay", playing: false, checks: 0, verified: false, expanded: false, ctaShown: false, ctaDismissed: false };
let DATA = null;
let playTimer = null, checkTimers = [];
const replayTrackedBlockBeats = new Set();
// First-visit autostart waits for the intro modal to be dismissed, so the run never
// plays behind the orientation card. Set in main(), consumed in closeIntro().
let autoplayPending = false;

function clearPlay() { if (playTimer) { clearTimeout(playTimer); playTimer = null; } }
function clearChecks() { checkTimers.forEach(clearTimeout); checkTimers = []; }
function pgTrackSafe(name, props) { if (typeof window.pgTrack === "function") window.pgTrack(name, props || {}); }

/* ---------------- build (once) ---------------- */
function buildChat() {
  const root = $("chatList"); root.replaceChildren();
  for (const t of DATA.chat) {
    // User messages stay a single calm colour (amber). The "danger" of the
    // turn belongs in the agent log and the mediator's BLOCKED card, not in the
    // chat - a red chat bubble pulls the eye away from where the action is.
    const turn = el("div", "chat-turn reveal"); turn.dataset.kind = t.role === "agent" ? "agent" : "user";
    turn.dataset.beat = t.beat;
    const isAgent = t.role === "agent";
    const row = el("div", "bubble-row" + (isAgent ? " agent" : ""));
    row.appendChild(el("div", "avatar " + (isAgent ? "agent" : "user"), isAgent ? "A" : "U"));
    const wrap = el("div", "bubble-wrap" + (isAgent ? " agent" : ""));
    const meta = el("div", "bubble-meta");
    // For user tags, never render the red "danger" variant - keep the cue text
    // ("the turn") but in the muted style so every user message reads the same.
    const userTagKind = t.tagKind === "danger" ? "muted" : t.tagKind;
    if (isAgent) {
      meta.appendChild(el("span", "bm-tag " + t.tagKind, t.tag));
      meta.appendChild(el("span", "bm-role agent", "agent"));
    } else {
      meta.appendChild(el("span", "bm-role user", "user"));
      meta.appendChild(el("span", "bm-tag " + userTagKind, t.tag));
    }
    wrap.appendChild(meta);
    const bubble = el("div", "bubble " + (isAgent ? "agent" : "user"));
    renderRich(bubble, t.html);
    wrap.appendChild(bubble);
    row.appendChild(wrap); turn.appendChild(row); root.appendChild(turn);
  }
}

function buildAgent() {
  const root = $("agentLog"); root.replaceChildren();
  DATA.agent.forEach((a, i) => {
    if (i > 0) root.appendChild(el("div", "act-sep"));
    const act = el("div", "act reveal"); act.dataset.kind = a.kind; act.dataset.beat = a.beat;
    const line = el("div", "act-line");
    line.appendChild(el("span", "act-ts", "[" + a.ts + "]"));
    line.appendChild(document.createTextNode(" "));
    line.appendChild(el("span", "act-tag", a.act));
    line.appendChild(document.createTextNode(" "));
    line.appendChild(el("span", "act-title" + (a.kind === "danger" ? " hot" : ""), a.title));
    act.appendChild(line);
    const req = el("div", "act-req");
    // highlight a canary=... token in a distinct color, safely
    const ci = a.line.indexOf("canary=");
    if (ci >= 0) { req.appendChild(document.createTextNode(a.line.slice(0, ci))); req.appendChild(el("span", "canary", a.line.slice(ci))); }
    else req.textContent = a.line;
    act.appendChild(req);
    if (a.note) act.appendChild(el("div", "act-note", a.note));
    root.appendChild(act);
  });
  root.appendChild((() => { const c = el("div", "caret"); c.appendChild(document.createTextNode("$ ")); c.appendChild(el("b", null, "▏")); return c; })());
}

function signSvg(color) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", "12"); s.setAttribute("height", "12"); s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", color); s.setAttribute("stroke-width", "1.7");
  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  r.setAttribute("x", "5"); r.setAttribute("y", "11"); r.setAttribute("width", "14"); r.setAttribute("height", "9"); r.setAttribute("rx", "2");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M8 11V8a4 4 0 0 1 8 0v3");
  s.appendChild(r); s.appendChild(p); return s;
}

function buildDecisions() {
  const root = $("decList"); root.replaceChildren();
  for (const d of DATA.decisions) {
    const dec = el("div", "dec"); dec.dataset.beat = d.beat;
    const node = el("div", "dec-node"); node.style.setProperty("--dc", d.color); node.style.setProperty("--dc-glow", hexGlow(d.color));
    dec.appendChild(node);
    const ring = el("div", "dec-ring reveal"); ring.style.setProperty("--dc", d.color); ring.style.setProperty("--dc-glow", hexGlow(d.color));
    if (d.pop) ring.dataset.pop = "1";
    const isBlock = d.verdict === "BLOCKED";
    const isAllow = d.verdict === "ALLOW";
    const card = el("div", "dc-card " + (isBlock ? "block" : isAllow ? "allow" : d.class));

    const top = el("div", "dc-top");
    top.appendChild(el("span", "chip cls-" + d.class, d.class));
    const si = el("span", "signed-inline"); si.style.color = d.color; si.appendChild(signSvg(d.color)); si.appendChild(el("span", null, "signed")); top.appendChild(si);
    card.appendChild(top);

    if (d.banner) card.appendChild(el("span", "block-banner", d.banner));

    if (d.verdict) {
      const row = el("div", "dc-row");
      const v = el("span", "dc-verdict", d.verdict); v.style.color = d.color; v.style.fontSize = isBlock ? "23px" : "21px";
      if (isBlock) v.style.textShadow = "0 0 16px rgba(239,68,68,0.4)";
      row.appendChild(v); row.appendChild(el("span", "dc-target", d.target)); card.appendChild(row);
      card.appendChild(el("div", "dc-line", d.meta));
    } else {
      const h = el("div", "dc-headline", d.headline); h.style.color = d.color; card.appendChild(h);
      card.appendChild(el("div", "dc-body", d.body));
      card.appendChild(el("div", "dc-line", d.meta));
    }

    // signed footer (+ expand for the block card)
    const foot = el("div", "sig-foot");
    const sleft = el("span", "signed-inline"); sleft.appendChild(signSvg(d.color));
    sleft.appendChild(document.createTextNode(" signed · ")); sleft.appendChild(el("span", null, d.signer));
    sleft.appendChild(document.createTextNode(" · ")); const k = el("span", null, d.key); k.style.color = "#475569"; sleft.appendChild(k);
    foot.appendChild(sleft);
    if (d.envelope) {
      const btn = el("button", "expand-btn", "view signed receipt"); btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => toggleEnvelope(btn, env));
      foot.appendChild(btn);
    }
    card.appendChild(foot);

    let env;
    if (d.envelope) {
      env = el("div", "envelope");
      const pre = el("pre", null, d.envelope.join("\n"));
      env.appendChild(pre);
      env.appendChild(el("div", "cap", "Receipt shape used by the audit bundle. Sample values here are redacted and abbreviated; chain_prev_hash links it into the hash chain and signature is what the verifier checks offline."));
      card.appendChild(env);
    }

    ring.appendChild(card); dec.appendChild(ring); root.appendChild(dec);
  }
}

function toggleEnvelope(btn, env) {
  state.expanded = !state.expanded;
  env.classList.toggle("open", state.expanded);
  btn.setAttribute("aria-expanded", String(state.expanded));
  btn.textContent = state.expanded ? "hide signed receipt" : "view signed receipt";
}

function buildChecks() {
  const root = $("checkList"); root.replaceChildren();
  $("checkCount").textContent = DATA.checks.length;
  DATA.checks.forEach((name) => {
    const c = el("div", "check");
    c.appendChild(el("span", "check-mark", "·"));
    c.appendChild(el("span", "check-name", name));
    root.appendChild(c);
  });
}

function buildTicks() {
  const track = $("phTrack");
  for (let i = 1; i <= TOTAL; i++) { const t = el("div", "tick"); t.dataset.i = i; track.appendChild(t); }
}

// Relative (not /playground/demo/kits/) so the kit URLs resolve on BOTH the
// broker, which serves this viewer at "/", and the site, which serves it at
// /playground/demo/. An absolute path 404s on the embedded broker host.
const KIT_BASE = "kits/";
const KITS = [
  { os: "Windows", file: "pipelock-verify-windows.zip" },
  { os: "macOS", file: "pipelock-verify-macos.zip" },
  { os: "Linux", file: "pipelock-verify-linux.zip" },
];
function analyticsKitOS(os) {
  const s = String(os || "").toLowerCase();
  if (s === "windows" || s === "win") return "windows";
  if (s === "macos" || s === "mac") return "macos";
  return "linux";
}
function trackKitDownload(os, mode) {
  pgTrackSafe("playground_verify_clicked", { surface: "kit", mode: mode });
  pgTrackSafe("playground_kit_downloaded", { os: analyticsKitOS(os) });
}
function uaString() { return (((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "") + " " + (navigator.userAgent || "")).toLowerCase(); }
function detectKitIndex() {
  const s = uaString();
  if (s.includes("win")) return 0;
  if (s.includes("mac") || s.includes("iphone") || s.includes("ipad")) return 1; // universal: Intel + Apple Silicon
  if (s.includes("linux") || s.includes("x11") || s.includes("android")) return 2;
  return -1;
}
// The replay bundle is a published-key-signed tar.gz verified with
// pipelock-verifier verify-bundle (not the old audit-packet path). The
// published key fingerprint comes from the Live module (window.pipelockPublishedKeyFP)
// and the full 64-hex key is embedded in the verifier binary, so the CLI
// command only needs the bundle path.
var REPLAY_BUNDLE_URL = "replay-bundle.tar.gz";
var REPLAY_PUBLISHED_KEY_FP = "99f16ec9…36221a2c";

function osCommand() {
  // The signed bundle is a tar.gz of a pipelock-session/ run directory; extract
  // it, then `verify-run` checks the full trust chain against the published key
  // (the default orchestrator key, so no --key flag). This is the real shipped
  // command: exit 0 = every signature and binding verified offline.
  //
  // --archive is REQUIRED and is not optional polish. A published replay carries
  // a root-signed archive authorization and its session delegation has aged out
  // by design, so strict mode fails on the expiry. The bundle's own VERIFY.txt
  // prints this same flag; if the two ever disagree, a visitor following the
  // page gets a failure the downloaded file says should not happen.
  var win = uaString().includes("win");
  return win
    ? "tar -xzf replay-bundle.tar.gz; .\\pipelock-verifier.exe verify-run pipelock-session --archive"
    : "tar xzf replay-bundle.tar.gz && ./pipelock-verifier verify-run pipelock-session --archive";
}

function buildVerifier() {
  // Kit-first: one big button for the detected OS, the rest as small links.
  const idx = detectKitIndex();
  const primary = idx >= 0 ? KITS[idx] : KITS[0];
  const kp = $("kitPrimary"), kpl = $("kitPrimaryLabel");
  if (kp) { kp.href = KIT_BASE + primary.file; kp.dataset.kitOs = primary.os; }
  if (kpl) kpl.textContent = idx >= 0 ? "Download verify kit · " + primary.os : "Download verify kit · Windows";
  const others = $("kitOthers");
  if (others) {
    others.replaceChildren();
    KITS.forEach((k, i) => {
      if (i === idx) return;
      const a = el("a", null, k.os); a.href = KIT_BASE + k.file; a.setAttribute("download", "");
      a.addEventListener("click", () => trackKitDownload(k.os, "replay"));
      others.appendChild(a);
    });
  }
  // Manual fallback: OS-correct command + published key.
  $("verifyCmd").textContent = osCommand();
  $("fp").textContent = "ed25519:" + REPLAY_PUBLISHED_KEY_FP;
  var ks = $("keyStatus"); if (ks) ks.textContent = "";
  var dl = $("btnDownload"); if (dl) dl.href = REPLAY_BUNDLE_URL;
  var vd = $("btnVerifier"); if (vd) vd.href = "https://github.com/luckyPipewrench/pipelock/releases/latest";
  fillWatermark(state.mode === "live" ? "SANDBOX DEMO · " : "REPLAY · ");
}

// Fill the diagonal background watermark. Mode-aware: replay reads "REPLAY",
// live reads "SANDBOX DEMO" so a live session is always visibly labelled as a
// sandbox - even if a visitor types something odd and screenshots it. The field
// is wide + tall (rotated -22°) to cover every corner of the viewport.
function fillWatermark(label) {
  const wm = $("wmRows"); if (!wm) return;
  wm.replaceChildren();
  const row = label.repeat(20).trim();
  for (let i = 0; i < 28; i++) wm.appendChild(el("div", null, row));
}

/* ---------------- beat application ---------------- */
// Column bars light on the beats their own items occupy - derived from the data
// so the script's causal ordering and the bar choreography can never desync.
let BARS = { chat: () => false, agent: () => false, pipe: () => false, proof: () => false };
function buildBars() {
  const chatBeats = new Set(DATA.chat.map((x) => x.beat));
  const agentBeats = new Set(DATA.agent.map((x) => x.beat));
  const pipeBeats = new Set(DATA.decisions.map((x) => x.beat));
  BARS = {
    chat: (b) => chatBeats.has(b),
    agent: (b) => agentBeats.has(b),
    pipe: (b) => pipeBeats.has(b),
    proof: (b) => b >= TOTAL,
  };
}

function applyBeat() {
  const b = state.beat;
  // reveal/active for chat, agent, decisions
  document.querySelectorAll(".chat-turn, .act, .dec").forEach((node) => {
    const at = Number(node.dataset.beat);
    node.classList.toggle("shown", b >= at);
    node.classList.toggle("active", b === at);
  });
  // mediator rings (inner): active when beat == card beat
  document.querySelectorAll(".dec").forEach((dec) => {
    const at = Number(dec.dataset.beat);
    const ring = dec.querySelector(".dec-ring");
    ring.classList.toggle("shown", b >= at);
    const active = b === at;
    ring.classList.toggle("active", active);
    ring.classList.toggle("pop", active && ring.dataset.pop === "1");
  });
  // column bars
  setBar("barChat", BARS.chat(b), "on-amber");
  setBar("barAgent", BARS.agent(b), "on-blue");
  setBar("barPipe", BARS.pipe(b), "on-accent");
  setBar("barProof", BARS.proof(b), "on-accent");
  // ticks + progress
  document.querySelectorAll(".tick").forEach((t) => { const i = Number(t.dataset.i); t.classList.toggle("done", b >= i); t.classList.toggle("active", b === i); });
  $("phProg").style.width = (b / TOTAL * 100) + "%";
  $("beatNum").textContent = b; $("beatTotal").textContent = TOTAL;
  $("beatDesc").textContent = DATA.beats[b] || "";
  // proof
  if (b === TOTAL) runChecks(); else { clearChecks(); state.checks = 0; renderChecks(); }
  $("proofProgress").textContent = state.verified ? (state.verifiedChecks + " checks · verified in your browser") : (state.checks + " / " + DATA.checks.length);
  updateChatInput();
  trackVisibleReplayBlocks(b);
  scrollActive();
}

function trackVisibleReplayBlocks(beat) {
  if (state.mode !== "replay" || !DATA || !Array.isArray(DATA.decisions)) return;
  DATA.decisions.forEach((d) => {
    if (d.verdict !== "BLOCKED" || Number(d.beat) > beat || replayTrackedBlockBeats.has(d.beat)) return;
    replayTrackedBlockBeats.add(d.beat);
    pgTrackSafe("playground_attack_blocked", {});
  });
}

/* ---------------- follow the action ----------------
   A column with more content than fits keeps its themed scrollbar; this nudges
   the active item into view (only when it's actually off-screen) so the user
   follows the run during autoplay instead of missing cards below the fold. */
function ensureVisible(body, target) {
  if (!body || !target) return;
  const b = body.getBoundingClientRect(), t = target.getBoundingClientRect();
  if (t.top >= b.top + 8 && t.bottom <= b.bottom - 8) return; // already fully visible
  const within = (t.top - b.top) + body.scrollTop;
  body.scrollTo({ top: Math.max(0, within - (body.clientHeight - t.height) / 2), behavior: "smooth" });
}
function scrollActive() {
  const cols = document.querySelectorAll(".col");
  const pipeBody = cols[2] && cols[2].querySelector(".col-body");
  const pa = pipeBody && pipeBody.querySelector(".dec-ring.active");
  if (pa) ensureVisible(pipeBody, pa.closest(".dec") || pa);
  const chatBody = cols[0] && cols[0].querySelector(".col-body");
  const ca = chatBody && chatBody.querySelector(".chat-turn.active");
  if (ca) ensureVisible(chatBody, ca);
  const agentBody = cols[1] && cols[1].querySelector(".col-body");
  const aa = agentBody && agentBody.querySelector(".act.active");
  if (aa) ensureVisible(agentBody, aa);
}

/* ---------------- chat composer ----------------
   Decorative-but-wired input: when the very next beat is a user message it
   appears pre-filled (armed) and Enter / the send button / → "sends" it by
   advancing one beat. Otherwise the box shows where we are in the run. The
   input is readonly - replay is scripted, so the text is never user-authored. */
function plainText(html) { const d = document.createElement("div"); renderRich(d, html); return d.textContent; }
function nextUserTurn(afterBeat) { return DATA.chat.find((t) => t.beat > afterBeat && t.role !== "agent"); }

function updateChatInput() {
  const box = $("chatBox"), compose = $("chatCompose"), send = $("chatSend");
  if (!box || !compose || !send) return;
  if (state.mode === "live") return; // live mode owns the composer
  const immediate = DATA.chat.find((t) => t.beat === state.beat + 1 && t.role !== "agent");
  if (immediate) {
    box.value = plainText(immediate.html);
    compose.dataset.armed = "1";
    box.placeholder = "";
    send.disabled = false;
  } else if (nextUserTurn(state.beat)) {
    box.value = "";
    compose.dataset.armed = "0";
    box.placeholder = state.beat >= TOTAL ? "Replay complete" : "The agent is acting, watch Pipelock decide";
    send.disabled = false;
  } else {
    box.value = "";
    compose.dataset.armed = "0";
    box.placeholder = state.beat >= TOTAL ? "Replay complete, press ↻ to replay" : "No more messages";
    send.disabled = state.beat >= TOTAL;
  }
}

function composeSend() { if (state.beat >= TOTAL) { restart(); } else { step(1); } }


function setBar(id, on, cls) { const e = $(id); e.classList.remove("on-amber", "on-blue", "on-accent"); if (on) e.classList.add(cls); }

function renderChecks() {
  const items = document.querySelectorAll(".check");
  items.forEach((c, i) => { const on = i < state.checks; c.classList.toggle("on", on); c.querySelector(".check-mark").textContent = on ? "✓" : "·"; });
  $("stamp").classList.toggle("on", state.verified);
  $("proofProgress").textContent = state.verified ? (state.verifiedChecks + " checks · verified in your browser") : (state.checks + " / " + DATA.checks.length);
}

function runChecks() {
  clearChecks(); state.checks = 0; renderChecks();
  let pt = 320;
  for (let c = 1; c <= DATA.checks.length; c++) { checkTimers.push(setTimeout(() => { state.checks = c; renderChecks(); }, pt)); pt += 150; }
}

/* ---------------- controls ---------------- */
function goTo(b) { state.beat = Math.max(0, Math.min(TOTAL, b)); applyBeat(); }
function loop() { clearPlay(); if (!state.playing) return; if (state.beat >= TOTAL) { setPlaying(false); maybeShowReplayCta(); return; } playTimer = setTimeout(() => { goTo(state.beat + 1); loop(); }, PACE); }
function setPlaying(p) { state.playing = p; const btn = $("btnPlay"); btn.dataset.playing = p ? "1" : "0"; btn.replaceChildren(); btn.appendChild(document.createTextNode(p ? "❚❚ Pause" : (state.beat >= TOTAL ? "↻ Replay" : "▶ Play"))); }
// Transport is a REPLAY concept (scripted beats). In live there are no beats, and
// scrubbing would hide live messages (which carry no beat index) and wipe the chat,
// so every transport entry point no-ops in live. The playhead is also hidden via CSS.
function play() { if (state.mode === "live") return; if (state.beat >= TOTAL) { restart(); return; } setPlaying(true); loop(); }
function pause() { clearPlay(); setPlaying(false); }
function togglePlay() { if (state.mode === "live") return; state.playing ? pause() : play(); }
function step(d) { if (state.mode === "live") return; pause(); goTo(state.beat + d); setPlaying(false); }
function restart() { if (state.mode === "live") return; resetReplayBrowserVerify(); clearPlay(); clearChecks(); state.beat = 0; state.expanded = false; goTo(0); setPlaying(true); loop(); }
// First-run autostart, deferred so the run never advances behind the intro modal.
// Live has no beats to play. Called either by the init timer (modal already seen) or
// by closeIntro() when the visitor dismisses a first-visit modal.
function beginAutoplay() { if (state.mode === "live") return; setPlaying(true); loop(); }

function setMode(m) {
  clearChecks();
  resetReplayBrowserVerify();
  state.mode = m; document.body.dataset.mode = m;
  try { localStorage.setItem("pl_mode", m); } catch (e) {}
  $("tabLive").setAttribute("aria-pressed", String(m === "live"));
  $("tabReplay").setAttribute("aria-pressed", String(m === "replay"));
  $("statusLabel").textContent = m === "live" ? "LIVE · streaming" : "REC · " + DATA.run_id;
  // Header sub-label must match the active tab. "Synced demo" is a replay concept;
  // on the live tab it is misleading.
  const headSub = $("headSub");
  if (headSub) headSub.textContent = m === "live" ? "Live chat" : "Synced demo";
  fillWatermark(m === "live" ? "SANDBOX DEMO · " : "REPLAY · ");
  if (m === "live") {
    pause();
    if (window.PipelockLive) window.PipelockLive.start();
  } else {
    if (window.PipelockLive) { window.PipelockLive.stop(); if (window.PipelockLive.resetCard) window.PipelockLive.resetCard(); }
    rebuildReplay();
    pause();
  }
  // First visit to this mode shows its orientation card (no-op if already seen).
  showIntro(m);
}

// Returning from a live session: the shared columns were cleared and filled with
// live content, so rebuild the scripted replay from the bundle and reset to the
// start. The build functions each replaceChildren(), so leftover live nodes go.
function rebuildReplay() {
  buildChat(); buildAgent(); buildDecisions(); buildChecks(); buildVerifier();
  const box = $("chatBox"); if (box) box.setAttribute("readonly", "");
  clearChecks(); state.checks = 0; state.verified = false;
  goTo(0);
}

// The live demo runs on a separate contained host. When that host answers but
// is unavailable (paused, daily capacity reached), PipelockLive.enabled stays
// false and the Live tab says why instead of opening a session that can never
// connect. Copies with no live backend at all link to the live host instead.
function liveOffline() {
  const label = $("statusLabel"); const prev = label.textContent;
  const reason = (window.PipelockLive && window.PipelockLive.reason) || "unavailable";
  label.textContent = "LIVE CHAT · " + reason;
  const tab = $("tabLive"); tab.classList.add("soon-flash");
  setTimeout(() => { label.textContent = prev; tab.classList.remove("soon-flash"); }, 1800);
}

function copyText(text, btnId, doneLabel) {
  let ok = false;
  // navigator.clipboard only exists in a secure context (https / localhost).
  // Served over plain http on a LAN/Tailscale IP it's undefined, so fall back
  // to a hidden textarea + execCommand, which works everywhere.
  try {
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text); ok = true; }
  } catch (e) {}
  if (!ok) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) {}
  }
  const btn = $(btnId), orig = btn.textContent;
  btn.textContent = ok ? doneLabel : "select all + copy";
  btn.classList.add("done");
  setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1600);
}
/* ---------------- intro / help modal ----------------
   First visit per mode shows an orientation card (tracked in localStorage); the
   header "?" reopens it any time. Copy is rendered through renderIntro (safe DOM,
   only <b>/<b class="..."> honored, everything else textContent) - never innerHTML -
   matching the renderRich "no markup injection" property used everywhere else. */
const INTRO = {
  replay: {
    title: "Pipelock Playground: Replay",
    sub: "A captured, signed run",
    body: [
      "You're watching a real run that was captured and signed. Read it left to right: <b class='mc-amber'>Chat</b> (untrusted input) → <b>Agent</b> (what it did) → <b class='mc-accent'>Pipelock</b> (the signed decision) → <b class='mc-accent'>Proof</b> (re-verify it yourself, offline).",
      "Use <b>▶ Play</b> or the playhead to step through the run. The <b class='mc-accent'>Proof</b> column is the payoff. Download the kit and check the signature on your own machine.",
      "Want a turn? Hit <b class='mc-accent'>Live chat</b> up top and try it yourself against a <b>real</b>, uninstructed agent guarding a <b class='mc-amber'>planted secret</b>. Same firewall, same signed receipts, except you're the attacker.",
    ],
    btn: "Watch the run",
  },
  live: {
    title: "Pipelock Playground: Live",
    sub: "You're the attacker",
    body: [
      "This is the <b>real</b> Pipelock firewall and a <b>real</b>, uninstructed AI agent. Try to make the agent <b class='mc-amber'>leak a planted secret</b>.",
      "Keep two things straight: the agent's chat is just <b class='mc-amber'>narration: believe nothing it says</b>; the only ground truth is the <b class='mc-accent'>signed Pipelock column</b>. The planted secrets, the targets, and prompts to try are in the <b class='mc-accent'>Proof column on the right</b>.",
    ],
    btn: "Start",
  },
};
// Safe restricted renderer: splits on <b ...>…</b>, everything is textContent.
// Mirrors renderRich; the optional class is taken only from a fixed set of literals.
function renderIntro(parent, str) {
  const re = /<b(?:\s+class=['"]([^'"]*)['"])?>([\s\S]*?)<\/b>/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parent.appendChild(document.createTextNode(str.slice(last, m.index)));
    parent.appendChild(el("b", m[1] || null, m[2]));
    last = re.lastIndex;
  }
  if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
}
function introSeenKey(mode) { return "pl_intro_" + mode + "_seen"; }
function fillIntro(mode) {
  const cfg = INTRO[mode] || INTRO.replay;
  $("introTitle").textContent = cfg.title;
  $("introSub").textContent = cfg.sub;
  const body = $("introBody"); body.replaceChildren();
  cfg.body.forEach((copy) => { const p = el("p"); renderIntro(p, copy); body.appendChild(p); });
  $("introClose").textContent = cfg.btn;
}
function showIntro(mode, force) {
  let seen = false;
  try { seen = !!localStorage.getItem(introSeenKey(mode)); } catch (e) {}
  if (seen && !force) return;
  fillIntro(mode);
  const m = $("introModal"); if (m) m.hidden = false;
}
function closeIntro() {
  const m = $("introModal"); if (!m || m.hidden) return;
  m.hidden = true;
  try { localStorage.setItem(introSeenKey(state.mode), "1"); } catch (e) {}
  // A first visit deferred the autostart until the modal was dismissed (here), so the
  // run starts only after the visitor clicks away the orientation card.
  if (autoplayPending) { autoplayPending = false; setTimeout(beginAutoplay, 200); }
}

/* ---------------- end-of-replay call to action ----------------
   When the scripted replay finishes playing, a first-time visitor has just
   watched Pipelock block a real attack. That is the strongest moment to invite
   them to attack a live agent themselves. This banner exists ONLY to convert a
   watcher into a live attacker, so it appears only when a live agent is actually
   reachable (window.PipelockLive.enabled: a live host up AND under its daily
   lease cap). When live is unavailable - the daily cap is hit, or the host is
   down - the banner simply does not show; the Proof column already offers the
   verify-it-yourself path, so there is no need to duplicate it here. Shows once
   per page load, is dismissable, never re-pops after a dismiss or a manual
   scrub back to the end. */
function liveIsAvailable() { return !!(window.PipelockLive && window.PipelockLive.enabled); }

function maybeShowReplayCta() {
  if (state.mode !== "replay") return;              // live owns its own surface
  if (state.ctaShown || state.ctaDismissed) return; // once per visit, respect dismiss
  if (!liveIsAvailable()) return;                   // no live agent, no invite
  state.ctaShown = true;
  // Let the proof column's verify animation land first, then invite.
  setTimeout(() => { if (state.mode === "replay" && !state.ctaDismissed && liveIsAvailable()) showReplayCta(); }, 1400);
}

function showReplayCta() {
  const bar = $("replayCta"); if (!bar) return;
  const text = $("rcText"), actions = $("rcActions");
  text.replaceChildren();
  actions.replaceChildren();
  // Conversion moment: watching -> attacking, one click into the live arena.
  text.appendChild(el("b", "rc-lead", "That's the replay. Now you break it."));
  text.appendChild(el("span", "rc-sub", " One uninstructed agent, one planted secret, the same firewall watching. This time you're the attacker."));
  const go = el("button", "rc-go", "⚡ Go live");
  go.type = "button";
  go.addEventListener("click", () => { hideReplayCta(); setMode("live"); });
  actions.appendChild(go);
  bar.hidden = false;
  requestAnimationFrame(() => bar.classList.add("shown")); // reflow, then slide up
}

function hideReplayCta() {
  const bar = $("replayCta"); if (!bar) return;
  bar.classList.remove("shown");
  setTimeout(() => { bar.hidden = true; }, 280);
}

/* ---------------- replay in-browser verify ----------------
   Uses the shared wasm loader from viewer-live.js to verify the static
   replay-bundle.tar.gz against the published key. createElement/textContent
   only, never innerHTML - mirrors renderVerifySuccess in the Live path. */
var replayVerifyInFlight = false;
var replayVerifyGeneration = 0;

function clearReplayVerificationIndicators() {
  state.verified = false;
  state.verifiedChecks = 0;
  // viewer-live.js provides the shared reset for both modes, even without a backend.
  if (typeof window.pipelockClearVerificationIndicators === "function") window.pipelockClearVerificationIndicators();
}

function resetReplayBrowserVerify() {
  replayVerifyGeneration++;
  replayVerifyInFlight = false;
  clearReplayVerificationIndicators();
}

function setReplayVerifyBtn(state, label) {
  var btn = $("replayBrowserVerify");
  var lbl = $("replayBrowserVerifyLabel");
  if (!btn) return;
  btn.classList.remove("verifying", "ok", "fail");
  if (state) btn.classList.add(state);
  btn.disabled = state === "verifying";
  if (lbl && label) lbl.textContent = label;
}

function setReplayVerifyResult(kind, text) {
  var res = $("replayBrowserVerifyResult");
  if (!res) return;
  res.hidden = false;
  res.className = "vs-verify-result" + (kind ? " " + kind : "");
  res.textContent = text;
}

function renderReplayVerifySuccess(out, n) {
  var res = $("replayBrowserVerifyResult");
  if (!res) return;
  res.hidden = false;
  res.className = "vs-verify-result ok verify-detail";
  res.replaceChildren();
  var head = el("div", "vd-head", "VALID · " + n + " checks passed in your browser");
  res.appendChild(head);
  var grid = el("div", "vd-checks");
  var checks = out.checks || [];
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    var name = (c && (c.name || c)) || "check";
    var pass = c && (c.pass !== false);
    var row = el("div", "vd-check" + (pass ? "" : " bad"));
    row.style.animationDelay = (i * 35) + "ms";
    row.appendChild(el("span", "vd-tick", pass ? "✓" : "✗"));
    row.appendChild(el("span", "vd-name", String(name)));
    grid.appendChild(row);
  }
  res.appendChild(grid);
  var foot = el("div", "vd-foot");
  foot.appendChild(el("span", null, "published key " + REPLAY_PUBLISHED_KEY_FP));
  if (out.runNonce) foot.appendChild(el("span", null, " · run nonce " + String(out.runNonce).slice(0, 12)));
  foot.appendChild(el("span", null, " · collector saw " + (out.observed || 0) + " copies of the secret"));
  res.appendChild(foot);
}

async function runReplayBrowserVerify() {
  if (replayVerifyInFlight || state.mode !== "replay") return;
  clearChecks();
  clearReplayVerificationIndicators();
  var generation = ++replayVerifyGeneration;
  var current = () => state.mode === "replay" && replayVerifyGeneration === generation;
  if (typeof window.pipelockVerifyStaticBundle !== "function") {
    setReplayVerifyBtn("fail", "Verify in your browser");
    setReplayVerifyResult("fail", "Verifier not available. Try reloading the page.");
    pgTrackSafe("playground_verify_result", { valid: false });
    return;
  }
  replayVerifyInFlight = true;
  setReplayVerifyBtn("verifying", "Verifying…");
  setReplayVerifyResult("", "Loading the verifier (WebAssembly) into your browser…");
  try {
    var out = await window.pipelockVerifyStaticBundle(REPLAY_BUNDLE_URL);
    if (!current()) return;
    if (out && out.valid) {
      var n = (out.checks || []).length;
      state.verified = true;
      // Keep the verifier's own count; the scripted check list is narration only.
      state.verifiedChecks = n;
      setReplayVerifyBtn("ok", "Verified ✓");
      renderReplayVerifySuccess(out, n);
      pgTrackSafe("playground_verify_result", { valid: true, checks: n });
      // Light the stamp and update the proof progress line.
      var stamp = $("stamp"); if (stamp) stamp.classList.add("on");
      var pp = $("proofProgress"); if (pp) pp.textContent = n + " checks · verified in your browser";
    } else {
      clearReplayVerificationIndicators();
      setReplayVerifyBtn("fail", "Verification failed");
      setReplayVerifyResult("fail", "Verification FAILED: " + ((out && out.error) || "bundle did not verify against the published key"));
      pgTrackSafe("playground_verify_result", { valid: false, checks: (out && out.checks && out.checks.length) || 0 });
    }
  } catch (e) {
    if (!current()) return;
    clearReplayVerificationIndicators();
    setReplayVerifyBtn("fail", "Verify in your browser");
    setReplayVerifyResult("fail", "Could not verify: " + (e && e.message ? e.message : "unknown error") + ". You can still download the bundle and verify offline.");
    pgTrackSafe("playground_verify_result", { valid: false });
  } finally {
    if (current()) replayVerifyInFlight = false;
  }
}

async function main() {
  DATA = await (await fetch("bundle.json", { cache: "no-store" })).json();
  TOTAL = DATA.totalBeats || TOTAL;
  buildBars();
  buildChat(); buildAgent(); buildDecisions(); buildChecks(); buildTicks(); buildVerifier();
  $("btnPrev").addEventListener("click", () => step(-1));
  $("btnNext").addEventListener("click", () => step(1));
  $("btnPlay").addEventListener("click", togglePlay);
  $("btnRestart").addEventListener("click", restart);
  $("tabLive").addEventListener("click", () => {
    pgTrackSafe("playground_mode_selected", { mode: "live" });
    const live = window.PipelockLive;
    if (live && live.enabled) setMode("live");
    else if (live && live.elsewhere) {
      pgTrackSafe("playground_popout_clicked", { placement: "replay-viewer-live-tab" });
      window.open(live.liveURL, "_blank", "noopener");
    } else liveOffline();
  });
  $("tabReplay").addEventListener("click", () => { pgTrackSafe("playground_mode_selected", { mode: "replay" }); setMode("replay"); });
  $("btnCopyCmd").addEventListener("click", () => copyText($("verifyCmd").textContent, "btnCopyCmd", "copied"));
  var kp = $("kitPrimary");
  if (kp) kp.addEventListener("click", function () { trackKitDownload(kp.dataset.kitOs, "replay"); });
  // Replay in-browser verify: wire the button in the proof column's verify-self block.
  var rvBtn = $("replayBrowserVerify");
  if (rvBtn) rvBtn.addEventListener("click", function () {
    pgTrackSafe("playground_verify_clicked", { surface: "browser", mode: "replay" });
    runReplayBrowserVerify();
  });
  // intro / help modal: "?" reopens for the current mode; close via button, backdrop, or Esc.
  $("btnHelp").addEventListener("click", () => showIntro(state.mode, true));
  $("introClose").addEventListener("click", closeIntro);
  $("introModal").addEventListener("click", (e) => { if (e.target === $("introModal")) closeIntro(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeIntro(); });
  $("rcDismiss").addEventListener("click", () => { state.ctaDismissed = true; hideReplayCta(); });
  $("chatCompose").addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.mode === "live" && window.PipelockLive) { window.PipelockLive.onSubmit($("chatBox").value); }
    else { composeSend(); }
  });
  // Keyboard transport: → next beat, ← previous beat. ONLY in replay, and NEVER
  // while an editable element is focused - so the arrows move the text caret in the
  // invite/chat box (live) instead of scrubbing the demo out from under the typist.
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "replay") return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });

  let saved = "replay"; try { saved = localStorage.getItem("pl_mode") || DATA.mode || "replay"; } catch (e) { saved = DATA.mode || "replay"; }
  if (saved !== "replay" && saved !== "live") saved = "replay";
  if (saved === "live") saved = "replay"; // Always start embedded visits in replay; Live requires an explicit click.
  setMode(saved);
  goTo(0);
  pgTrackSafe("playground_demo_viewed", { mode: state.mode });
  // Auto-start the run, but never behind the intro modal. On a first visit setMode()
  // opened the orientation card, so defer the start until closeIntro() runs. If the
  // modal was already seen (not shown), start after a short beat as before.
  if ($("introModal") && !$("introModal").hidden) { autoplayPending = true; }
  else { setTimeout(beginAutoplay, 650); }
  document.body.dataset.ready = "1";
}
main().catch((e) => { document.body.dataset.error = String(e); });
