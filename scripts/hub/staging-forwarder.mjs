import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:https";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { rootCertificates, getCACertificates } from "node:tls";
import { stringify } from "yaml";
import { representationPaths } from "./parity.mjs";
import { canonical, sha256 } from "./evidence.mjs";
import { pinnedRelease, commandTimeout } from "./release-binary.mjs";
import { accessHeaders, stagingRequest } from "./staging-http.mjs";

export async function withBundleForwarder({ manifest, request = stagingRequest, headers = accessHeaders(), timeout = commandTimeout }, action) {
  const allowed = new Set(manifest.entries.filter(entry => entry.kind === "bundle-download").flatMap(representationPaths).map(item => item.route));
  if (!allowed.size) throw new Error("manifest bundle paths required");
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-tls-"));
  let server, timer;
  const abort = new AbortController();
  const removeFiles = () => rmSync(scratch, { recursive: true, force: true });
  process.once("exit", removeFiles);
  const stop = () => { abort.abort(); server?.closeAllConnections(); server?.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const openssl = (...args) => execFileSync("openssl", args, { cwd: scratch, timeout: 10_000, stdio: "ignore" });
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Hub temporary install CA", "-addext", "basicConstraints=critical,CA:TRUE");
    openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=127.0.0.1");
    writeFileSync(path.join(scratch, "extensions"), "subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\n");
    openssl("x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.pem", "-days", "1", "-extfile", "extensions");
    server = createServer({ key: readFileSync(path.join(scratch, "server.key")), cert: readFileSync(path.join(scratch, "server.pem")) }, async (incoming, response) => {
      if (incoming.method !== "GET" || !allowed.has(incoming.url)) { response.writeHead(404).end(); return; }
      try {
        const result = await request(incoming.url, { headers, signal: abort.signal });
        if (result.status !== 200 || result.headers.location) throw new Error("upstream response refused");
        response.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" }).end(result.body);
      } catch { response.writeHead(502).end(); }
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    timer = setTimeout(stop, timeout);
    const result = await Promise.race([
      action({ origin: "https://127.0.0.1:" + server.address().port, ca: path.join(scratch, "ca.pem"), signal: abort.signal }),
      new Promise((_, reject) => abort.signal.addEventListener("abort", () => reject(new Error("bundle forwarder cancelled or timed out")), { once: true })),
    ]);
    if (abort.signal.aborted) throw new Error("bundle forwarder cancelled or timed out");
    return result;
  } finally {
    clearTimeout(timer); stop();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    process.removeListener("exit", removeFiles);
    removeFiles();
  }
}

function install(binary, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { ...options, timeout: commandTimeout, stdio: "ignore" });
    child.on("error", () => reject(new Error("pinned rules install unavailable")));
    child.on("close", code => code === 0 ? resolve() : reject(new Error("pinned rules install failed")));
  });
}

export function assertInstalledBundle({ rules, directory, bundle, signature, expectedName }) {
  const names = readdirSync(rules).filter(name => !name.startsWith("."));
  if (canonical(names.sort()) !== canonical([expectedName])) throw new Error("installed bundle names differ");
  const installed = path.join(rules, expectedName);
  for (const entry of [bundle, signature]) {
    const actual = readFileSync(path.join(installed, path.basename(entry.route)));
    const expected = readFileSync(path.join(directory, entry.route.slice(1)));
    // Exact bytes also bind the bundle's encoded name and version.
    if (!actual.equals(expected) || sha256(actual) !== entry.sha256) throw new Error("installed bundle bytes differ");
  }
}

export function installEnvironment({ home, ca, official = false, environment = process.env }) {
  const env = Object.fromEntries(Object.entries(environment).filter(([name]) => /^(?:PATH|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|https?_proxy|all_proxy|no_proxy|SSL_CERT_FILE|SSL_CERT_DIR)$/.test(name)));
  Object.assign(env, { HOME: home, XDG_CONFIG_HOME: home, PIPELOCK_HOME: home });
  if (ca && !official) {
    const trusted = new Set([...rootCertificates, ...getCACertificates("system")]);
    if (env.SSL_CERT_FILE) trusted.add(readFileSync(env.SSL_CERT_FILE, "utf8"));
    trusted.add(readFileSync(ca, "utf8"));
    const combined = path.join(home, "install-ca.pem");
    writeFileSync(combined, [...trusted].join("\n") + "\n", { mode: 0o600 });
    env.SSL_CERT_FILE = combined;
    delete env.SSL_CERT_DIR;
  }
  const noProxy = [env.NO_PROXY, env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  env.NO_PROXY = noProxy; env.no_proxy = noProxy;
  return env;
}

export async function verifyStagingInstalls({ binary, directory, manifest, records, request = stagingRequest, headers = accessHeaders() }) {
  binary = pinnedRelease(binary);
  const bundles = records.filter(record => record.listing.type === "bundle");
  if (!bundles.length) throw new Error("bundle installation checks are missing");
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-install-"));
  try {
    const run = async ({ origin, ca, signal }) => {
      for (const [index, record] of bundles.entries()) {
        const downloads = manifest.entries.filter(entry => entry.kind === "bundle-download" && entry.listing_id === record.listing.id);
        const bundle = downloads.find(entry => entry.route.endsWith("/bundle.yaml"));
        const signature = downloads.find(entry => entry.route === bundle?.route + ".sig");
        if (!bundle || !signature) throw new Error("complete manifest bundle pair required");
        const home = path.join(scratch, String(index)); mkdirSync(home);
        const rules = path.join(home, "rules"); mkdirSync(rules);
        const config = path.join(home, "config.yaml");
        const key = record.listing.signer_fingerprint;
        if (record.badge !== "official" && (typeof key !== "string" || !key)) throw new Error("community signing key unavailable");
        writeFileSync(config, stringify({ rules: { rules_dir: rules, trusted_keys: key ? [{ name: "staging-publisher", public_key: key }] : [] } }));
        const env = installEnvironment({ home, ca, official: record.badge === "official" });
        const source = record.badge === "official" ? [record.listing.bundle_name] : ["--source", origin + bundle.route];
        await install(binary, ["rules", "install", ...source, "--rules-dir", rules, "--config", config, "--home", home], { cwd: home, env, signal });
        assertInstalledBundle({ rules, directory, bundle, signature, expectedName: record.listing.bundle_name });
      }
    };
    await withBundleForwarder({ manifest, request, headers }, run);
    return { checked: bundles.length };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
