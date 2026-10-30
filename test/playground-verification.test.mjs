import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createServer } from 'node:http';
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
  focus() {}
  closest() { return null; }
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
    window: {}, navigator: { platform: 'Linux', userAgent: 'Linux' }, localStorage: { setItem() {}, getItem() { return null; } },
    setTimeout: (fn) => { timers.set(++timerID, fn); return timerID; }, clearTimeout: (id) => timers.delete(id),
    fetch: async () => ({ ok: true, headers: { get() { return ''; } }, arrayBuffer: async () => new ArrayBuffer(1) }),
    Uint8Array, TextEncoder, URL, console,
  });
  // Keep the production handlers intact; skip page boot and expose closure state.
  let live = source('viewer-live.js');
  live = live.replace(/\}\)\(\);\s*$/, `window.liveTest = { run: runBrowserVerify, load: loadPipelockVerifier, script: loadScriptWithGuards, handle, create: createSession, blocks(value) { blockCount = value; }, reset: resetBrowserVerifyState, session(value) { token = value; }, ready(value) { verifierReady = value; } }; })();`);
  vm.runInContext(live, context);
  const replay = source('viewer.js').replace(/main\(\)\.catch\([^\n]+\);\s*$/, '');
  vm.runInContext(replay, context);
  const buildVerifier = vm.runInContext('buildVerifier', context);
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
  const verifyStaticBundle = context.window.pipelockVerifyStaticBundle;
  setResult(valid);
  const run = () => mode === 'live' ? context.window.liveTest.run() : vm.runInContext('runReplayBrowserVerify()', context);
  return { node, context, run, buildVerifier, setResult, valid, verifyStaticBundle, timers, flushTimers() { for (const [id, fn] of timers) { timers.delete(id); fn(); } } };
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
    let downloads = 0;
    h.context.fetch = async () => { downloads++; return { ok: true, headers: { get() { return ''; } }, arrayBuffer: async () => new ArrayBuffer(1) }; };
    h.context.window.liveTest.ready(new Promise((yes, no) => { resolve = yes; reject = no; }));
    const pending = h.run(); h.context.window.liveTest.reset(); h.context.window.liveTest.session('session-two');
    if (outcome === 'success') resolve(); else reject(new Error('stale error'));
    await pending;
    assert.equal(downloads, 0, 'retired loading must stop before downloading a bundle');
    noSuccess(h);
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

test('probe: a missing live API on a replay-only copy points Live at the Playground page', async () => {
  const { live, soon } = await settleProbe(jsonResponse(404, null));
  assert.equal(live.enabled, false);
  assert.equal(live.elsewhere, true);
  assert.equal(live.liveURL, '/playground/');
  assert.equal(soon.hidden, true);
  assert.equal(soon.textContent, '');
});

for (const [name, respond, opts] of [
  ['a 5xx', jsonResponse(503, null), {}],
  ['a network error', async () => { throw new Error('offline'); }, {}],
  ['a timeout', () => new Promise(() => {}), { timeout: true }],
  ['a 200 with a null body', jsonResponse(200, null), {}],
  ['a 200 with a false body', jsonResponse(200, false), {}],
  ['a 200 with a zero body', jsonResponse(200, 0), {}],
  ['a 200 whose ok field is the string "false"', jsonResponse(200, { ok: 'false' }), {}],
  ['a 200 whose ok field is the string "true"', jsonResponse(200, { ok: 'true' }), {}],
  ['a 200 whose body imitates the missing-API marker', jsonResponse(200, { probeStatus: 'missing' }), {}],
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

// The public manual verification command owns the full signing key. Compare
// actual viewer text and downloadable launchers with that value, not JS constants.
test('displayed fingerprints and all kit launchers match the published signing key', async () => {
  const template = readFileSync('themes/pipelab/layouts/playground/list.html', 'utf8');
  const keys = [...template.matchAll(/--key ([0-9a-f]{64})(?=\s|<)/g)];
  assert.equal(keys.length, 1, 'one public signing-key source in the manual command');
  const key = keys[0][1];
  const fingerprint = key.slice(0, 8) + '…' + key.slice(-8);
  const displayed = template.match(/published key <b>([^<]+)<\/b>/);
  assert.ok(displayed, 'template must display its signing-key fingerprint');
  assert.equal(displayed[1].replace('...', '…'), 'ed25519:' + fingerprint);

  const replay = harness('replay');
  replay.buildVerifier();
  assert.equal(replay.node('fp').textContent, 'ed25519:' + fingerprint);
  const foot = (node) => node.children.find(child => child.className === 'vd-foot')?.children[0]?.textContent;
  await replay.run();
  assert.equal(foot(replay.node('replayBrowserVerifyResult')), 'published key ' + fingerprint);

  const live = harness('live');
  let checkingText;
  live.context.window.pipelockVerifyBundle = () => {
    checkingText = live.node('browserVerifyResult').textContent;
    return live.valid;
  };
  await live.run();
  assert.equal(checkingText, 'Checking signatures against the published key ' + fingerprint + '…');
  assert.equal(foot(live.node('browserVerifyResult')), 'published key ' + fingerprint);

  // Python's ZIP reader checks the shipped archives without executing any kit
  // binary or introducing a second ZIP parser into the site test suite.
  for (const [os, launcher] of [['linux', 'verify.sh'], ['macos', 'Verify.command'], ['windows', 'Verify.bat']]) {
    const archive = `static/playground/demo/kits/pipelock-verify-${os}.zip`;
    const prefix = `pipelock-live-verify-${os}/`;
    const files = JSON.parse(execFileSync('python3', ['-c',
      'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n print(json.dumps([z.read(p).decode("utf-8") for p in sys.argv[2:]]))',
      archive, prefix + launcher, prefix + 'app/run/verifier.txt',
    ], { encoding: 'utf8', timeout: 10_000 }));
    for (const [index, text] of files.entries()) {
      const embedded = [...text.matchAll(/(?:--orchestrator-key|trust_root:) ([^\s]+)/g)];
      assert.ok(embedded.length > 0, `${os} ${index === 0 ? launcher : 'verifier.txt'} must embed the published key`);
      for (const match of embedded) assert.equal(match[1], key, `${os} ${launcher} published key`);
    }
  }
});

test('live: broker session text cannot claim browser verification', async () => {
  const h = harness('live');
  for (const state of ['verified in your browser', 'verified', 'LIVE · verified in your browser']) {
    h.context.window.liveTest.handle({ type: 'status', state });
    noSuccess(h);
    assert.equal(h.node('statusLabel').textContent, 'LIVE · streaming');
    assert.doesNotMatch(h.node('statusLabel').textContent, /verified/);
  }
  h.context.window.liveTest.handle({ type: 'status', state: 'contained' });
  assert.equal(h.node('statusLabel').textContent, 'LIVE · contained');
  assert.equal(h.node('lsContain').textContent, 'contained sandbox');
  h.context.window.liveTest.handle({ type: 'status', state: 'dev' });
  assert.equal(h.node('statusLabel').textContent, 'LIVE · dev');
  h.context.EventSource = function EventSource() { this.close = function () {}; this.addEventListener = function () {}; };
  h.context.fetch = async () => ({ ok: true, json: async () => ({ token: 'session-token', state: 'verified in your browser' }) });
  await h.context.window.liveTest.create('invite');
  noSuccess(h);
  assert.equal(h.node('statusLabel').textContent, 'LIVE · streaming');
  h.context.fetch = async () => ({ ok: true, json: async () => ({ token: 'session-token', state: 'contained' }) });
  await h.context.window.liveTest.create('invite');
  assert.equal(h.node('statusLabel').textContent, 'LIVE · contained');
});

test('live: a stream status during a browser check cannot restore verified', async () => {
  const h = harness('live'); await h.run();
  let finish;
  h.context.window.liveTest.ready(new Promise((resolve) => { finish = resolve; }));
  const pending = h.run();
  h.context.window.liveTest.handle({ type: 'status', state: 'verified in your browser' });
  noSuccess(h);
  assert.equal(h.node('statusLabel').textContent, 'LIVE · streaming');
  finish(); await pending;
  assert.match(h.node('statusLabel').textContent, /verified in your browser/);
});

test('probe: a healthy broker that cannot reach its provider stays unavailable', async () => {
  const { live, soon } = await settleProbe(jsonResponse(200, { ok: true, provider_ok: false, code_required: true }));
  assert.equal(live.enabled, false);
  assert.equal(live.elsewhere, false);
  assert.equal(soon.textContent, 'temporarily unavailable');
});

test('live: a pending re-check clears the earlier success status', async () => {
  const h = harness('live'); await h.run();
  assert.match(h.node('statusLabel').textContent, /verified/);
  let finish;
  h.context.window.liveTest.ready(new Promise((resolve) => { finish = resolve; }));
  const pending = h.run();
  noSuccess(h);
  assert.doesNotMatch(h.node('statusLabel').textContent, /verified/);
  finish(); await pending;
  assert.match(h.node('statusLabel').textContent, /verified in your browser/);
});

test('live: a re-check with no session clears the earlier success status', async () => {
  const h = harness('live'); await h.run();
  h.context.window.liveTest.session(null); await h.run();
  noSuccess(h);
  assert.doesNotMatch(h.node('statusLabel').textContent, /verified/);
  assert.match(h.node('browserVerifyResult').textContent, /No signed bundle/);
});

for (const blocks of [0, 1]) {
  test(`live: broker sealing during a browser check never restores a verified status (${blocks} blocks)`, async () => {
    const h = harness('live'); await h.run();
    let finish;
    h.context.window.liveTest.ready(new Promise((resolve) => { finish = resolve; }));
    const pending = h.run();
    h.context.window.liveTest.blocks(blocks);
    h.context.window.liveTest.handle({ type: 'verified', checks: ['signature', 'binding'] });
    noSuccess(h);
    assert.doesNotMatch(h.node('statusLabel').textContent, /verified/);
    assert.match(h.node('statusLabel').textContent, /bundle sealed/);
    finish(); await pending;
    assert.match(h.node('statusLabel').textContent, /verified in your browser/);
  });
}

// A status change retires the earlier verdict on every shared surface.
for (const event of [{ type: 'status', state: 'contained' }, { type: 'status', state: 'unknown' }, { type: 'verified', checks: ['signature'] }, { type: 'done' }]) {
  test(`live: ${event.type}/${event.state || ''} after success retires every success indicator`, async () => {
    const h = harness('live'); await h.run();
    h.context.window.liveTest.handle(event);
    noSuccess(h);
    assert.doesNotMatch(h.node('statusLabel').textContent, /verified in your browser/);
  });
}
test('the dormant stamp is hidden from the accessibility tree', () => {
  assert.match(source('style.css'), /\.stamp\s*\{[^}]*visibility:\s*hidden/);
  assert.match(source('style.css'), /\.stamp\.on\s*\{[^}]*visibility:\s*visible/);
});
test('probe: a redirect cannot borrow another origin health', async () => {
  const { live, soon } = await settleProbe(async (_url, options) => {
    if (options && options.redirect === 'error') throw new TypeError('redirect refused');
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  assert.equal(live.enabled, false);
  assert.equal(live.elsewhere, false);
  assert.equal(soon.textContent, 'unavailable');
});

for (const mode of ['live', 'replay']) {
  test(`${mode}: the reported count comes only from browser checks`, async () => {
    // Three browser checks against one server-sealed name, so the two counts differ.
    const h = harness(mode); h.setResult({ valid: true, checks: [{ name: 'a', pass: true }, { name: 'b', pass: true }, { name: 'c', pass: true }] });
    if (mode === 'live') h.context.window.liveTest.handle({ type: 'verified', checks: ['server-only'] });
    await h.run();
    assert.match(h.node('proofProgress').textContent, /^3 checks/);
  });
}
test('live: new evidence retires an earlier browser result', async () => {
  const h = harness('live'); await h.run();
  // Stop before unrelated decision rendering, but retain its real event handler.
  h.context.navigator = { platform: 'Linux', userAgent: '' };
  h.context.window.liveTest.handle({ type: 'decision', verdict: 'UNKNOWN', envelope: {} });
  noSuccess(h);
  assert.doesNotMatch(h.node('statusLabel').textContent, /verified in your browser/);
});

test('live: a decision discards a pending result for older evidence', async () => {
  const h = harness('live'); let finish;
  h.context.navigator = { platform: 'Linux', userAgent: '' };
  h.context.window.liveTest.ready(new Promise((resolve) => { finish = resolve; }));
  const pending = h.run();
  h.context.window.liveTest.handle({ type: 'decision', verdict: 'UNKNOWN', envelope: {} });
  finish(); await pending; noSuccess(h);
  assert.doesNotMatch(h.node('statusLabel').textContent, /verified in your browser/);
  h.context.window.liveTest.ready(Promise.resolve()); await h.run();
  assert.equal(h.node('stamp').classList.contains('on'), true);
});
for (const reset of ['reset', 'stop', 'resetCard']) {
  test(`live: ${reset} retires the success status as well as its indicators`, async () => {
    const h = harness('live'); await h.run();
    if (reset === 'reset') h.context.window.liveTest.reset(); else h.context.window.PipelockLive[reset]();
    noSuccess(h); assert.doesNotMatch(h.node('statusLabel').textContent, /verified in your browser/);
  });
}

test('live: an unavailable-tab timer cannot restore a retired verified status', async () => {
  const h = harness('live'); await h.run();
  vm.runInContext('liveOffline()', h.context);
  h.setResult({ valid: false, error: 'INVALID' }); await h.run();
  h.flushTimers(); noSuccess(h);
  assert.match(h.node('statusLabel').textContent, /browser check failed/);
});
test('live: an unavailable-tab notice retires every prior success surface', async () => {
  const h = harness('live'); await h.run();
  vm.runInContext('liveOffline()', h.context); noSuccess(h);
  h.context.window.liveTest.reset(); h.flushTimers(); noSuccess(h);
  assert.doesNotMatch(h.node('statusLabel').textContent, /verified in your browser/);
});
for (const mode of ['live', 'replay']) {
  // The Go verifier never reports valid with no checks: finalize sets OK=false
  // for an empty check list (internal/playground/verify.go).
  for (const out of [null, { valid: 'false', checks: [] }, { valid: 1, checks: [] }, { valid: true }, { valid: true, checks: [] }, { valid: true, checks: [{ name: 'signature' }] }, { valid: true, checks: [{ name: 'signature', pass: false }] }]) {
    test(`${mode}: malformed or contradictory verifier result cannot report success (${JSON.stringify(out)})`, async () => {
      const h = harness(mode); h.setResult(out); await h.run(); noSuccess(h);
    });
  }
}

// A replay-only copy has no live backend; Live runs embedded on the Playground
// page, so the tab must go there in the same tab and never open the backend host.
test('replay-only copy: the Live tab opens the Playground page in the same tab', () => {
  const h = harness('replay');
  const opened = [];
  h.context.window.open = (...args) => { opened.push(args); };
  Object.assign(h.context.window.PipelockLive, { enabled: false, elsewhere: true, liveURL: '/playground/' });
  vm.runInContext('openLiveTab()', h.context);
  assert.deepEqual(opened, [['/playground/', '_top']]);
  assert.equal(h.context.document.body.dataset.mode, 'replay');
});


function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const newer of [false, true]) {
  test(`replay: late VALID after restart cannot replace ${newer ? 'a pending attempt' : 'the reset view'}`, { timeout: 2000 }, async () => {
    const h = harness('replay');
    const old = deferred(); const next = deferred();
    let calls = 0;
    h.context.window.pipelockVerifyStaticBundle = () => (++calls === 1 ? old.promise : next.promise);
    const pending = h.run();
    vm.runInContext('restart()', h.context);
    const current = newer ? h.run() : null;
    const before = h.node('replayBrowserVerifyResult').textContent;
    old.resolve(h.valid); await pending;
    noSuccess(h);
    assert.equal(h.node('replayBrowserVerifyResult').textContent, before);
    if (newer) {
      assert.equal(h.node('replayBrowserVerify').disabled, true);
      const duplicate = h.run();
      assert.equal(calls, 2, 'old completion must not unlock the newer attempt');
      await duplicate;
      next.resolve({ valid: true, checks: [{ name: 'new-session-check', pass: true }] });
      await current;
      assert.equal(h.node('stamp').classList.contains('on'), true);
      assert.match(h.node('replayBrowserVerifyResult').textContent, /new-session-check/);
    } else {
      h.setResult(h.valid); await h.run();
      assert.equal(h.node('stamp').classList.contains('on'), true, 'a fresh attempt can still succeed');
    }
  });
}

for (const stage of ['response', 'body']) {
  for (const newer of [false, true]) {
    test(`live: late VALID bytes at ${stage} after reset cannot replace ${newer ? 'a pending attempt' : 'the reset view'}`, { timeout: 2000 }, async () => {
      const h = harness('live');
      const entered = deferred(); const old = deferred(); const next = deferred(); const nextEntered = deferred();
      let downloads = 0; let verified = 0;
      h.context.window.pipelockVerifyBundle = () => { verified++; return h.valid; };
      const response = (body) => ({ ok: true, headers: { get() { return ''; } }, arrayBuffer: () => body });
      h.context.fetch = () => {
        downloads++;
        if (downloads > 1) return { ...response(next.promise), arrayBuffer() { nextEntered.resolve(); return next.promise; } };
        if (stage === 'response') { entered.resolve(); return old.promise; }
        return { ...response(old.promise), arrayBuffer() { entered.resolve(); return old.promise; } };
      };
      const pending = h.run(); await entered.promise;
      h.context.window.liveTest.reset();
      // Keep the token in one case to isolate the generation guard; change it
      // in the other to exercise replacement-session behavior as well.
      if (newer) h.context.window.liveTest.session('session-two');
      const current = newer ? h.run() : null;
      if (newer) await nextEntered.promise;
      const before = h.node('browserVerifyResult').textContent;
      old.resolve(stage === 'response' ? response(Promise.resolve(new ArrayBuffer(1))) : new ArrayBuffer(1));
      await pending;
      noSuccess(h); assert.equal(verified, 0, 'retired bytes must never reach the verifier');
      assert.equal(h.node('browserVerifyResult').textContent, before);
      if (newer) {
        assert.equal(h.node('browserVerify').disabled, true);
        const duplicate = h.run();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(downloads, 2, 'old completion must not unlock the newer attempt');
        await duplicate;
        next.resolve(new ArrayBuffer(1)); await current;
      } else {
        h.context.fetch = async () => response(Promise.resolve(new ArrayBuffer(1)));
        await h.run();
      }
      assert.equal(verified, 1);
      assert.equal(h.node('stamp').classList.contains('on'), true);
    });
  }
}

for (const path of ['runtime', 'wasm', 'live bundle', 'replay bundle']) {
  for (const redirected of [false, true]) {
    test(`${path}: real Fetch ${redirected ? 'refuses a local 302' : 'accepts direct bytes'}`, { timeout: 5000 }, async (t) => {
      let initialRequests = 0; let redirectedRequests = 0;
      const server = createServer((req, res) => {
        if (req.url === '/redirected-bytes') redirectedRequests++; else initialRequests++;
        if (redirected && req.url !== '/redirected-bytes') {
          res.writeHead(302, { Location: '/redirected-bytes' }); res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(Buffer.from([1]));
        }
      });
      t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const h = harness('live');
      const requested = []; const executed = [];
      h.context.document.querySelector = () => null;
      h.context.document.head = { appendChild(script) { executed.push('script'); script.onload(); } };
      h.context.Blob = Blob;
      // Keep URL stubs inside this VM rather than modifying the host URL class.
      h.context.URL = { createObjectURL() { return 'blob:runtime'; }, revokeObjectURL() {} };
      h.context.WebAssembly = { async instantiate(bytes) { assert.deepEqual([...new Uint8Array(bytes)], [1]); executed.push('wasm'); return { instance: {} }; } };
      h.context.window.Go = function () {
        this.importObject = {};
        this.run = () => { executed.push('go'); h.context.window.pipelockVerifyBundle = () => h.valid; };
      };
      h.context.fetch = async (url, options) => {
        requested.push({ url, options });
        // Resolve document-relative production URLs as a browser would. Pass
        // its options unchanged to real Fetch; the local server owns the 302.
        return fetch(new URL(url, origin), options);
      };
      let run;
      if (path === 'runtime') run = () => h.context.window.liveTest.script('wasm_exec.js', '');
      if (path === 'wasm') {
        h.context.window.liveTest.ready(null);
        h.context.window.pipelockVerifyBundle = undefined;
        run = () => h.context.window.liveTest.load();
      }
      if (path === 'live bundle') {
        h.context.window.pipelockVerifyBundle = (bytes) => { assert.deepEqual([...bytes], [1]); executed.push('verify'); return h.valid; };
        run = () => h.run();
      }
      if (path === 'replay bundle') {
        h.context.window.pipelockVerifyBundle = (bytes) => { assert.deepEqual([...bytes], [1]); executed.push('verify'); return h.valid; };
        run = () => h.verifyStaticBundle('bundle.bin');
      }
      if (redirected && path !== 'live bundle') await assert.rejects(run(), TypeError);
      else {
        const result = await run();
        if (!redirected && path === 'replay bundle') assert.equal(result.valid, true);
      }
      assert.equal(requested.length, 1, 'the target production fetch must run exactly once');
      assert.equal(initialRequests, 1, 'the real server must receive the production request');
      assert.equal(redirectedRequests, 0, 'Fetch must not follow the redirect');
      const expectedURL = { runtime: 'wasm_exec.js', wasm: 'pipelock-verifier.wasm', 'replay bundle': 'bundle.bin' }[path];
      if (expectedURL) assert.equal(requested[0].url, expectedURL);
      else assert.match(requested[0].url, /bundle\?token=session-one&format=raw$/);
      if (redirected) {
        assert.deepEqual(executed, []);
        noSuccess(h);
        if (path === 'live bundle') assert.match(h.node('browserVerifyResult').textContent, /Could not verify:/);
      } else {
        assert.ok(executed.length > 0, 'the nonredirect control must reach execution or verification');
        if (path === 'live bundle') assert.equal(h.node('stamp').classList.contains('on'), true);
      }
      assert.equal(requested[0].options.redirect, 'error');
    });
  }
}


for (const mode of ['replay', 'live']) {
  test(`${mode}: late rejection cannot overwrite or unlock a newer pending attempt`, { timeout: 2000 }, async () => {
    const h = harness(mode);
    const old = deferred(); const next = deferred(); const entered = deferred(); const nextEntered = deferred();
    let calls = 0;
    if (mode === 'replay') {
      h.context.window.pipelockVerifyStaticBundle = () => {
        calls++;
        if (calls === 1) { entered.resolve(); return old.promise; }
        nextEntered.resolve(); return next.promise;
      };
    } else {
      h.context.fetch = async () => ({ ok: true, headers: { get() { return ''; } }, arrayBuffer() {
        calls++;
        if (calls === 1) { entered.resolve(); return old.promise; }
        nextEntered.resolve(); return next.promise;
      } });
    }
    const pending = h.run(); await entered.promise;
    if (mode === 'replay') vm.runInContext('restart()', h.context);
    else { h.context.window.liveTest.reset(); h.context.window.liveTest.session('session-two'); }
    const current = h.run(); await nextEntered.promise;
    const prefix = mode === 'replay' ? 'replayBrowserVerify' : 'browserVerify';
    const snapshot = () => [h.node(prefix + 'Result').textContent, h.node(prefix + 'Result').className,
      h.node(prefix).className, h.node(prefix).disabled, h.node('statusLabel').textContent];
    const before = snapshot();
    old.reject(new Error('retired download failed')); await pending;
    noSuccess(h); assert.deepEqual(snapshot(), before, 'stale failure must leave the newer UI alone');
    const duplicate = h.run(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2, 'stale rejection must not unlock the newer attempt'); await duplicate;
    next.resolve(mode === 'replay' ? h.valid : new ArrayBuffer(1)); await current;
    assert.equal(h.node('stamp').classList.contains('on'), true);
    assert.equal(h.node(prefix).classList.contains('ok'), true);
  });
}
