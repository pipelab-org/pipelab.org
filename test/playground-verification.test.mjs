import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

function source(file) {
  const path = `static/playground/demo/${file}`;
  return process.env.PLAYGROUND_TEST_REF
    ? execFileSync('git', ['show', `${process.env.PLAYGROUND_TEST_REF}:${path}`], { encoding: 'utf8' })
    : readFileSync(path, 'utf8');
}

class Element {
  constructor() {
    this.className = ''; this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false;
    this.style = { setProperty() {} }; this._text = '';
    this.classList = {
      contains: (s) => this.className.split(/\s+/).includes(s),
      add: (...ss) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...ss])].join(' '); },
      remove: (...ss) => { this.className = this.className.split(/\s+/).filter((s) => !ss.includes(s)).join(' '); },
      toggle: (s, on) => { if (on ?? !this.classList.contains(s)) this.classList.add(s); else this.classList.remove(s); },
    };
  }
  set textContent(s) { this._text = String(s); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...cs) { this._text = ''; this.children = cs; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  querySelectorAll() { return []; }
}

function harness(mode = 'replay') {
  const nodes = new Map(); const timers = new Map(); let timerID = 0;
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({
    document: { readyState: 'loading', getElementById: node, createElement: () => new Element(), createTextNode: (s) => Object.assign(new Element(), { textContent: s }), querySelectorAll: () => [], addEventListener() {}, body: new Element() },
    window: {}, localStorage: { setItem() {}, getItem() { return null; } },
    setTimeout: (fn) => { timers.set(++timerID, fn); return timerID; }, clearTimeout: (id) => timers.delete(id),
    fetch: async () => ({ ok: true, headers: { get() { return ''; } }, arrayBuffer: async () => new ArrayBuffer(1) }),
    Uint8Array, TextEncoder, URL, console,
  });
  // Keep the production handlers intact; skip page boot and expose closure state.
  let live = source('viewer-live.js');
  live = live.replace(/\}\)\(\);\s*$/, `window.liveTest = { run: runBrowserVerify, reset: resetBrowserVerifyState, session(value) { token = value; }, ready(value) { verifierReady = value; } }; })();`);
  vm.runInContext(live, context);
  const replay = source('viewer.js').replace(/main\(\)\.catch\([^\n]+\);\s*$/, '');
  vm.runInContext(replay, context);
  // Mode switching is real; unrelated chat construction has no bearing on verification.
  vm.runInContext(`DATA = { checks: ['signature', 'binding'], run_id: 'replay' }; ['fillWatermark', 'showIntro', 'buildChat', 'buildAgent', 'buildDecisions', 'buildChecks', 'buildVerifier', 'goTo'].forEach(name => { globalThis[name] = () => {}; });`, context);
  context.window.PipelockLive.start = () => context.window.liveTest.reset();
  vm.runInContext(`state.mode = ${JSON.stringify(mode)}; document.body.dataset.mode = state.mode;`, context);
  context.window.liveTest.session('session-one');
  context.window.liveTest.ready(Promise.resolve());
  const valid = { valid: true, checks: [{ name: 'signature', pass: true }, { name: 'binding', pass: true }] };
  const setResult = (out) => {
    context.window.pipelockVerifyStaticBundle = async () => out;
    context.window.pipelockVerifyBundle = () => out;
  };
  setResult(valid);
  const run = () => mode === 'live' ? context.window.liveTest.run() : vm.runInContext('runReplayBrowserVerify()', context);
  return { node, context, run, setResult, valid, timers, flushTimers() { for (const [id, fn] of timers) { timers.delete(id); fn(); } } };
}

function noSuccess(h) {
  assert.equal(h.node('stamp').classList.contains('on'), false, 'stamp must be off');
  assert.doesNotMatch(h.node('proofProgress').textContent, /verified/i);
  assert.doesNotMatch(h.node('lsVerified').textContent, /VERIFY OK/);
  assert.equal(h.node('lsVerified').classList.contains('ok'), false);
  for (const id of ['browserVerify', 'replayBrowserVerify', 'browserVerifyResult', 'replayBrowserVerifyResult']) {
    assert.equal(h.node(id).classList.contains('ok'), false, `${id} must not show success`);
  }
}

test('animation alone never reports verification', () => {
  const h = harness(); vm.runInContext('runChecks()', h.context); h.flushTimers(); noSuccess(h);
});

for (const mode of ['replay', 'live']) {
  for (const failure of ['INVALID', 'download error', 'missing wasm']) {
    test(`${mode}: success clears before ${failure}, and retry succeeds`, async () => {
      const h = harness(mode); await h.run();
      assert.equal(h.node('stamp').classList.contains('on'), true);
      if (failure === 'INVALID') h.setResult({ valid: false, error: 'INVALID' });
      if (failure === 'download error') {
        h.context.window.pipelockVerifyStaticBundle = async () => { throw new Error('download failed'); };
        h.context.fetch = async () => { throw new Error('download failed'); };
      }
      if (failure === 'missing wasm') {
        h.context.window.pipelockVerifyStaticBundle = undefined;
        h.context.window.pipelockVerifyBundle = undefined;
      }
      const pending = h.run(); noSuccess(h); await pending; noSuccess(h);
      h.setResult(h.valid);
      h.context.fetch = async () => ({ ok: true, headers: { get() { return ''; } }, arrayBuffer: async () => new ArrayBuffer(1) });
      await h.run(); assert.equal(h.node('stamp').classList.contains('on'), true);
    });
  }
}

for (const outcome of ['success', 'error']) {
  test(`Replay to Live discards stale ${outcome}`, async () => {
    const h = harness(); let resolve, reject;
    h.context.window.pipelockVerifyStaticBundle = () => new Promise((yes, no) => { resolve = yes; reject = no; });
    const pending = h.run(); vm.runInContext('setMode("live")', h.context);
    const before = h.node('replayBrowserVerifyResult').textContent;
    if (outcome === 'success') resolve(h.valid); else reject(new Error('stale error'));
    await pending; noSuccess(h);
    assert.equal(h.node('replayBrowserVerifyResult').textContent, before);
  });
  test(`Live session reset discards stale ${outcome}`, async () => {
    const h = harness('live'); let resolve, reject;
    h.context.window.liveTest.ready(new Promise((yes, no) => { resolve = yes; reject = no; }));
    const pending = h.run(); h.context.window.liveTest.reset(); h.context.window.liveTest.session('session-two');
    if (outcome === 'success') resolve(); else reject(new Error('stale error'));
    await pending; noSuccess(h);
    assert.equal(h.node('browserVerifyResult').hidden, true);
  });
}

for (const outcome of ['success', 'error']) {
  test(`Replay restart discards stale ${outcome} without ending a newer attempt`, async () => {
    const h = harness(); let resolve, reject;
    h.context.window.pipelockVerifyStaticBundle = () => new Promise((yes, no) => { resolve = yes; reject = no; });
    const pending = h.run(); vm.runInContext('restart()', h.context);
    h.setResult(h.valid); await h.run();
    if (outcome === 'success') resolve({ valid: false }); else reject(new Error('old download failure'));
    await pending;
    assert.equal(h.node('stamp').classList.contains('on'), true);
    assert.equal(h.node('replayBrowserVerify').classList.contains('ok'), true);
  });
}

test('replay: animation after a real pass keeps the verifier count', async () => {
  const h = harness('replay');
  // Three verifier checks against a two-item scripted list, so the two counts differ.
  h.setResult({ valid: true, checks: [{ name: 'a', pass: true }, { name: 'b', pass: true }, { name: 'c', pass: true }] });
  await h.run();
  vm.runInContext('runChecks()', h.context); h.flushTimers();
  assert.equal(h.node('proofProgress').textContent, '3 checks · verified in your browser');
});

test('live: a pass after a failed re-check clears the failure status', async () => {
  const h = harness('live');
  h.setResult({ valid: false, error: 'INVALID' }); await h.run();
  assert.match(h.node('statusLabel').textContent, /browser check failed/);
  h.setResult(h.valid); await h.run();
  assert.doesNotMatch(h.node('statusLabel').textContent, /failed/);
});

for (const failure of ['INVALID', 'download error']) {
  test(`live: ${failure} after success removes "verified" from the status line`, async () => {
    const h = harness('live'); h.node('statusLabel').textContent = 'LIVE · verified';
    await h.run();
    if (failure === 'INVALID') h.setResult({ valid: false, error: 'INVALID' });
    else h.context.fetch = async () => { throw new Error('download failed'); };
    await h.run();
    assert.doesNotMatch(h.node('statusLabel').textContent, /verified/);
  });
}

// The Live tab probe decides between "this copy is replay-only, live runs on its
// own host" and "the live backend here is down". Only a missing API (404) means
// replay-only; an error, timeout or 5xx is an outage and must say so.
function probeHarness(respond) {
  const nodes = new Map(); const timers = [];
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({
    document: { readyState: 'loading', getElementById: node, createElement: () => new Element(), querySelectorAll: () => [], addEventListener() {}, body: new Element() },
    window: {}, localStorage: { setItem() {}, getItem() { return null; } }, location: { origin: 'https://pipelab.org' },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: (id) => { timers[id - 1] = null; },
    fetch: respond, Uint8Array, TextEncoder, URL, console,
  });
  let live = source('viewer-live.js');
  live = live.replace(/\}\)\(\);\s*$/, 'window.liveTest = { probe: probeLive }; })();');
  vm.runInContext(live, context);
  return { node, context, timers };
}

async function settleProbe(respond, { timeout = false } = {}) {
  const h = probeHarness(respond);
  h.context.window.liveTest.probe();
  if (timeout) { for (const fn of h.timers) if (fn) fn(); }
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return { live: h.context.window.PipelockLive, soon: h.node('tabSoon') };
}

const jsonResponse = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('probe: a missing live API on a replay-only copy links to the live host', async () => {
  const { live, soon } = await settleProbe(jsonResponse(404, null));
  assert.equal(live.enabled, false);
  assert.equal(live.elsewhere, true);
  assert.equal(soon.textContent, '↗');
});

for (const [name, respond, opts] of [
  ['a 5xx', jsonResponse(503, null), {}],
  ['a network error', async () => { throw new Error('offline'); }, {}],
  ['a timeout', () => new Promise(() => {}), { timeout: true }],
]) {
  test(`probe: ${name} reads as unavailable, never as live elsewhere`, async () => {
    const { live, soon } = await settleProbe(respond, opts);
    assert.equal(live.enabled, false);
    assert.equal(live.elsewhere, false);
    assert.equal(soon.textContent, 'unavailable');
  });
}

test('probe: a healthy live API enables the Live tab', async () => {
  const { live, soon } = await settleProbe(jsonResponse(200, { ok: true, code_required: true, turnstile_sitekey: '' }));
  assert.equal(live.enabled, true);
  assert.equal(soon.hidden, true);
});
