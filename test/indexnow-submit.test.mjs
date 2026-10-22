import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const key = 'bd2aa46ad5df4155a5f847081c21637f';
const source = readFileSync(new URL('../scripts/indexnow-submit.mjs', import.meta.url));
function fixture(t, sitemap) {
  const root = mkdtempSync(path.join(tmpdir(), 'indexnow-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'static', 'public']) mkdirSync(path.join(root, dir));
  writeFileSync(path.join(root, 'scripts/indexnow-submit.mjs'), source);
  writeFileSync(path.join(root, `static/${key}.txt`), key);
  writeFileSync(path.join(root, 'public/sitemap.xml'), sitemap);
  // No test can send an actual submission, including a mistaken default call.
  writeFileSync(path.join(root, 'network.mjs'), `globalThis.fetch = async () => { throw new Error('NETWORK CALLED'); };`);
  const run = (args = [], input = '') => spawnSync(process.execPath, ['--import', path.join(root, 'network.mjs'), path.join(root, 'scripts/indexnow-submit.mjs'), ...args], { encoding: 'utf8', input, timeout: 5000 });
  run.root = root;
  return run;
}
const sitemap = '<urlset><url><loc>https://pipelab.org/old/</loc><lastmod>2026-10-01T00:00:00Z</lastmod></url><url><loc>https://pipelab.org/new/</loc><lastmod>2026-10-21T00:00:00Z</lastmod></url><url><loc>https://pipelab.org/undated/</loc></url></urlset>';

test('IndexNow previews changed and undated sitemap URLs without network access', t => {
  const run = fixture(t, sitemap);
  const result = run(['--since', '2026-10-20T00:00:00Z']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry run, 2 URL/);
  assert.match(result.stdout, /https:\/\/pipelab.org\/new\//);
  assert.match(result.stdout, /https:\/\/pipelab.org\/undated\//);
  assert.doesNotMatch(result.stdout, /https:\/\/pipelab.org\/old\//);
});

test('IndexNow requires an explicit submit flag', t => {
  const run = fixture(t, sitemap);
  assert.equal(run().status, 0);
  const submitted = run(['--submit']);
  assert.notEqual(submitted.status, 0);
  assert.match(submitted.stderr, /NETWORK CALLED/);
});

test('IndexNow refuses malformed inputs before reaching the network', t => {
  const run = fixture(t, sitemap);
  for (const args of [['--since'], ['--since', 'nonsense'], ['--since', '2026-99-99T00:00:00Z'], ['--unknown'], ['--submit', '--submit']]) {
    const result = run(args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.doesNotMatch(result.stderr, /NETWORK CALLED/);
  }
  for (const url of ['https://example.com/', 'http://pipelab.org/new/', 'https://pipelab.org:8443/new/', 'https://user@pipelab.org/new/', 'https://pipelab.org/new/#fragment', 'https://pipelab.org/not-in-sitemap/']) {
    const result = run(['-', '--submit'], url);
    assert.notEqual(result.status, 0, url);
    assert.doesNotMatch(result.stderr, /NETWORK CALLED/);
  }
});

test('IndexNow rejects a malformed sitemap rather than reporting an empty success', t => {
  const run = fixture(t, '<html>not a sitemap</html>');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected a built sitemap/);
});


test('IndexNow selects committed content changes and conservatively includes shared changes', t => {
  const run = fixture(t, sitemap);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: run.root, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  mkdirSync(path.join(run.root, 'content'));
  writeFileSync(path.join(run.root, 'content/new.md'), '---\ntitle: New\n---\nOld body\n');
  git('add', 'content/new.md');
  git('commit', '-m', 'fixture');
  const base = git('rev-parse', 'HEAD');
  assert.match(run(['--changed-since', base]).stdout, /no changed URLs/);
  writeFileSync(path.join(run.root, 'content/new.md'), '---\ntitle: New\n---\nChanged body\n');
  const content = run(['--changed-since', base]);
  assert.equal(content.status, 0, content.stderr);
  assert.match(content.stdout, /dry run, 1 URL/);
  assert.match(content.stdout, /https:\/\/pipelab.org\/new\//);
  assert.doesNotMatch(content.stdout, /https:\/\/pipelab.org\/old\//);
  mkdirSync(path.join(run.root, 'themes'));
  writeFileSync(path.join(run.root, 'themes/shared.html'), 'changed');
  git('add', 'themes/shared.html');
  const shared = run(['--changed-since', base]);
  assert.equal(shared.status, 0, shared.stderr);
  assert.match(shared.stdout, /dry run, 3 URL/);
  const invalid = run(['--changed-since', 'no-such-ref', '--submit']);
  assert.notEqual(invalid.status, 0);
  assert.doesNotMatch(invalid.stderr, /NETWORK CALLED/);
});
