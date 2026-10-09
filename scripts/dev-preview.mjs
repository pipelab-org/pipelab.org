// Local preview with the results API answered from a snapshot.
//
// Why this exists: the Gauntlet results table is drawn client-side from
// /api/results, which in production is a Cloudflare Worker backed by Postgres.
// `hugo server` serves files only, so that fetch 404s and the page shows
// "Failed to load results" locally. The centre of the page could not be
// designed or reviewed without this.
//
// This proxies everything to a running `hugo server` and answers /api/results
// and /api/results/:id from a snapshot captured from production. It is a
// DEVELOPMENT tool: it never runs in CI and ships nothing into the build, so a
// snapshot can never be mistaken for live data by a reader.
//
//   node scripts/dev-preview.mjs --hugo 1316 --port 1318 \
//     --snapshot ~/.cache/pipelab-api-snapshot
//
// Refresh the snapshot with:
//   curl --proxy http://127.0.0.1:8888 https://pipelab.org/api/results \
//     -o <snapshot>/results.json

import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const HUGO_PORT = Number(arg('hugo', 1316));
const PORT = Number(arg('port', 1318));
const SNAPSHOT = arg('snapshot', path.join(os.homedir(), '.cache/pipelab-api-snapshot'));
// Loopback by default. Pass --host 0.0.0.0 to reach it from another machine,
// which is the normal case when the browser is not on the machine serving it.
const HOST = arg('host', '127.0.0.1');

const sendJson = (res, body, status = 200) => {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    // Marks every snapshot response, so a screenshot or a network log can
    // never be mistaken for production data.
    'x-pipelab-preview': 'snapshot',
  });
  res.end(payload);
};

const TLS_CERT = arg('cert', '');
const TLS_KEY = arg('key', '');
if (Boolean(TLS_CERT) !== Boolean(TLS_KEY)) {
  throw new Error('--cert and --key must be provided together');
}
const TLS_ENABLED = Boolean(TLS_CERT && TLS_KEY);
const handler = (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // A snapshot file can be missing, a directory, or unreadable. Reading it
  // inside the handler without catching would take the preview down mid-session.
  const serveSnapshot = (file, missingStatus) => {
    try {
      return sendJson(res, readFileSync(file, 'utf8'));
    } catch (err) {
      const status = err.code === 'ENOENT' ? missingStatus : 503;
      return sendJson(res, { error: 'snapshot unreadable', code: err.code || 'EUNKNOWN' }, status);
    }
  };

  if (url.pathname === '/api/results' && req.method === 'GET') {
    return serveSnapshot(path.join(SNAPSHOT, 'results.json'), 503);
  }

  const detail = url.pathname.match(/^\/api\/results\/([^/]+)$/);
  if (detail && req.method === 'GET') {
    // The id lands in a filesystem path, so keep it to the shape the API issues.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(detail[1])) return sendJson(res, { error: 'bad id' }, 400);
    return serveSnapshot(path.join(SNAPSHOT, 'results', detail[1] + '.json'), 404);
  }

  // Everything else, including the immutable evidence tree checked into
  // static/gauntlet/evidence, comes from this branch's Hugo server. A preview
  // must never mix local templates with different production evidence bytes.
  const proxy = http.request(
    { host: '127.0.0.1', port: HUGO_PORT, path: req.url, method: req.method, headers: req.headers },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    }
  );
  proxy.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('hugo server unreachable on ' + HUGO_PORT + ': ' + err.message);
  });
  req.pipe(proxy);


};

// crypto.subtle needs a secure context. Direct TLS remains available for a
// self-contained preview; an existing TLS front door may instead proxy to the
// HTTP fallback.
const server = TLS_ENABLED
  ? https.createServer({ cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) }, handler)
  : http.createServer(handler);

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  console.log('preview  ' + (TLS_ENABLED ? 'https' : 'http') + '://' + HOST + ':' + PORT + '  -> hugo ' + HUGO_PORT + ', api from ' + SNAPSHOT + (TLS_ENABLED ? '' : '  (plain HTTP: terminate TLS in a preview front door or pass --cert/--key for Web Crypto)'));
});
