import { createPublicKey, verify } from "node:crypto";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonical, sha256 } from "./evidence.mjs";
import { curlRequest } from "./staging-http.mjs";
import { normalizeHostname, assertStagingTarget, STAGING_ACCOUNT_ID, STAGING_WORKER, STAGING_ORIGIN, WRANGLER_VERSION } from "./staging-target.mjs";

import { assertStagingConfig } from "./staging-config.mjs";
import { runPinnedWrangler } from "./staging-wrangler.mjs";
export { runPinnedWrangler } from "./staging-wrangler.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/
export function assertVersionConfig(resources, config) {
  const bindings = resources?.bindings, runtime = resources?.script_runtime;
  const flags = (value = []) => {
    if (!Array.isArray(value) || value.some(flag => typeof flag !== "string")) throw new Error("staging version configuration differs");
    return [...new Set(value)].sort();
  };
  const expectedBindings = [];
  const actualBindings = bindings && !Array.isArray(bindings) && typeof bindings === "object" && !Object.keys(bindings).length ? [] : bindings;
  if (!Array.isArray(actualBindings) || canonical(actualBindings) !== canonical(expectedBindings) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date ?? "") ||
      ![config.compatibility_date, config.compatibility_date + "T00:00:00Z"].includes(runtime?.compatibility_date) ||
      canonical(flags(runtime?.compatibility_flags)) !== canonical(flags(config.compatibility_flags))) throw new Error("staging version configuration differs");
}

// Route paths do not narrow this host-wide staging policy.
// https://developers.cloudflare.com/workers/configuration/routing/routes/#matching-behavior
export function routeTargetsStaging(route, worker = STAGING_WORKER) {
  if (!route || typeof route.pattern !== "string" || route.script?.toLowerCase?.() === worker.toLowerCase()) return true;
  const host = normalizeHostname(route.pattern.replace(/^https?:\/\//i, "").split("/")[0]);
  if (!/^[a-z0-9.*-]+$/.test(host)) return true;
  const pattern = host.split("*").map(part => part.replace(/\./g, "\\.")).join(".*");
  return new RegExp("^" + pattern + "$").test(normalizeHostname(new URL(STAGING_ORIGIN).hostname));
}

const receiptScope = "pipelab-hub-staging-upload/v1";

export function packageDigest(directory) {
  const files = [];
  const visit = (folder, prefix = "") => {
    for (const name of readdirSync(folder).sort()) {
      const file = path.join(folder, name), relative = prefix + name, stat = lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) throw new Error("package must contain only regular files");
      if (stat.isDirectory()) visit(file, relative + "/");
      else files.push({ path: relative, sha256: sha256(readFileSync(file)) });
    }
  };
  if (readdirSync(directory).some(name => !["assets", "worker", "deployment.json"].includes(name))) throw new Error("unexpected staging package root file");
  visit(directory);
  if (!files.some(file => file.path === "worker/worker.js") || !files.some(file => file.path.startsWith("assets/")) ||
      !files.some(file => file.path === "deployment.json")) throw new Error("full Worker, assets and deployment configuration required");
  return sha256(canonical({ scope: "pipelab-hub-staging-package/v1", files }));
}

export function assertDeployConfig(config, account) {
  assertStagingTarget(account, config.name);
  const expected = { name: STAGING_WORKER, account_id: STAGING_ACCOUNT_ID, main: "worker/worker.js", assets: { directory: "assets" },
    routes: [{ pattern: "hub-staging.pipelab.org", custom_domain: true }], vars: {},
    compatibility_date: "2026-02-10", compatibility_flags: ["nodejs_compat"], workers_dev: false, preview_urls: false };
  if (canonical(config) !== canonical(expected)) throw new Error("unexpected staging deployment configuration");
}

export function assertUploadCopy(directory, expectedDigest, account) {
  assertDeployConfig(JSON.parse(readFileSync(path.join(directory, "deployment.json"))), account);
  if (packageDigest(directory) !== expectedDigest) throw new Error("upload version or package changed");
}

// Receipts originate in this trusted upload process. They cannot be imported as
// unsigned candidate JSON. An operator may persist and sign one for a later run.
export function createStagingAdapter({ account, worker = STAGING_WORKER, closedVersion, token,
  verifyLiveVersion, verifyLiveClosed, packageDirectory, request = curlRequest,
  wranglerVersion = WRANGLER_VERSION, run = (args, options) => runPinnedWrangler(WRANGLER_VERSION, args, options), signal }) {
  const target = () => {
    assertStagingTarget(account, worker);
    if (wranglerVersion !== WRANGLER_VERSION) throw new Error("unexpected Wrangler version");
    assertStagingConfig();
  };
  const receipts = new Map();
  const known = version => {
    target();
    if (!uuid.test(version ?? "") || !receipts.has(version)) throw new Error("unknown staging version or upload receipt");
    return receipts.get(version);
  };
  const hostingAPI = async (resource, method = "GET", body, recovery = false) => {
    target();
    if (!token || /[\r\n\0]/.test(token)) throw new Error("staging deployment token unavailable");
    const response = await request(`https://api.cloudflare.com/client/v4/${resource}`, {
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: recovery ? undefined : signal,
    });
    if (response.status !== 200 || response.headers.location) throw new Error("staging hosting API failed");
    let value; try { value = JSON.parse(response.body); } catch { throw new Error("invalid staging hosting API response"); }
    if (value.success !== true || value.result === undefined) throw new Error("staging hosting API did not confirm success");
    return value;
  };
  const accountAPI = async (resource, ...options) => (await hostingAPI(`accounts/${account}/${resource}`, ...options)).result;
  // https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/list/
  // Domains use page metadata. Zone routes are documented as an unpaginated
  // array; if metadata is returned, require and follow a complete page set.
  const inventory = async (resource, recovery, paginated = false) => {
    const items = [], seen = new Set();
    let page = 1, expected;
    for (;;) {
      const value = await hostingAPI(resource + (page === 1 ? "" : `${resource.includes("?") ? "&" : "?"}page=${page}`), "GET", undefined, recovery);
      if (!Array.isArray(value.result)) throw new Error("staging ingress inventory unavailable");
      const info = value.result_info;
      if (!info && !paginated && page === 1) return value.result;
      if (!info || info.page !== page || info.count !== value.result.length ||
          !Number.isSafeInteger(info.per_page) || info.per_page < 1 || info.count > info.per_page ||
          !Number.isSafeInteger(info.total_pages) || info.total_pages < 1 ||
          !Number.isSafeInteger(info.total_count) || info.total_count < 0 ||
          (expected && (info.total_pages !== expected.total_pages || info.total_count !== expected.total_count))) throw new Error("staging hosting inventory incomplete");
      expected = info;
      for (const item of value.result) {
        const identity = canonical(item);
        if (seen.has(identity)) throw new Error("staging hosting inventory incomplete");
        seen.add(identity); items.push(item);
      }
      if (page === info.total_pages) {
        if (items.length !== info.total_count) throw new Error("staging hosting inventory incomplete");
        return items;
      }
      if (!info.count || items.length >= info.total_count) throw new Error("staging hosting inventory incomplete");
      page++;
    }
  };
  const api = (suffix, ...options) => accountAPI(`workers/scripts/${worker}${suffix}`, ...options);
  const deployable = async (version, recovery = false) => {
    target();
    if (!uuid.test(version ?? "")) throw new Error("known closed version required");
    // https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/list/
    // The deployable filter is authoritative and ignores pagination.
    const result = await api("/versions?deployable=true", "GET", undefined, recovery);
    if (!Array.isArray(result.items) || !result.items.some(item => item.id === version)) throw new Error("staging version outside deployable window");
  };
  const readActiveVersion = async (recovery = false) => {
    const result = await api("/deployments", "GET", undefined, recovery);
    const active = result.deployments?.[0];
    if (!active || active.strategy !== "percentage" || active.versions?.length !== 1 || active.versions[0].percentage !== 100 || !uuid.test(active.versions[0].version_id ?? "")) throw new Error("ambiguous staging activation");
    return active.versions[0].version_id;
  };
  const assertIngress = async (recovery = false) => {
    const ingress = await api("/subdomain", "GET", undefined, recovery);
    if (ingress.enabled !== false || ingress.previews_enabled !== false) throw new Error("staging alternate ingress is enabled or unverified");
    const domains = await inventory(`accounts/${account}/workers/domains`, recovery, true);
    const routes = await inventory(`accounts/${account}/workers/services/${worker}/environments/production/routes?show_zonename=true`, recovery, true);
    const bindings = domains.filter(domain => domain.service === worker);
    if (bindings.length !== 1 || bindings[0].hostname !== new URL(STAGING_ORIGIN).hostname || (bindings[0].environment !== undefined && bindings[0].environment !== "production") ||
        bindings[0].enabled !== true || bindings[0].previews_enabled !== false || routes.length !== 0) throw new Error("staging custom domain or zone routes differ from target");
    if (!/^[a-f0-9]{32}$/.test(bindings[0].zone_id ?? "")) throw new Error("staging domain zone unavailable");
    const zoneRoutes = await inventory(`zones/${bindings[0].zone_id}/workers/routes`, recovery);
    if (zoneRoutes.some(route => routeTargetsStaging(route, worker))) throw new Error("staging custom domain or zone routes differ from target");
  };
  const activateVersion = async (version, recovery = false) => {
    target();
    if (version !== closedVersion) known(version);
    if (!recovery || version !== closedVersion) await assertIngress(recovery);
    await deployable(version, recovery);
    await api("/deployments", "POST", { strategy: "percentage", versions: [{ version_id: version, percentage: 100 }] }, recovery);
  };
  const emergencyClose = async () => {
    target();
    await activateVersion(closedVersion, true);
    if (await readActiveVersion(true) !== closedVersion) throw new Error("closed staging activation unconfirmed");
    const failures = [];
    try { await assertIngress(true); } catch (error) { failures.push(error); }
    try {
      if (typeof verifyLiveClosed !== "function") throw new Error("live closure check required");
      await verifyLiveClosed();
    } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "closed staging post-activation checks failed");
  };
  return Object.freeze({
    closedVersion, readActiveVersion, activateVersion, emergencyClose,
    assertClosedDeployable: () => deployable(closedVersion),
    assertIngress,
    async upload(directory) {
      target();
      assertDeployConfig(JSON.parse(readFileSync(path.join(directory, "deployment.json"))), account);
      const before = packageDigest(directory);
      await assertIngress();
      await deployable(closedVersion);
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|HOME|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
      Object.assign(env, { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, WRANGLER_SEND_METRICS: "false", CI: "true" });
      const work = mkdtempSync(path.join(tmpdir(), "hub-upload-"));
      const scratch = path.join(work, "package"), outputFile = path.join(work, "upload.ndjson");
      env.WRANGLER_OUTPUT_FILE_PATH = outputFile;
      let upload, workerSHA256;
      try {
        cpSync(directory, scratch, { recursive: true });
        assertUploadCopy(scratch, before, account);
        workerSHA256 = sha256(readFileSync(path.join(scratch, "worker/worker.js")));
        await run(["versions", "upload", "--config", "deployment.json", "--name", worker, "--no-bundle", "--strict"], { cwd: scratch, env, signal });
        const records = readFileSync(outputFile, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(record => record.type === "version-upload");
        if (records.length !== 1 || records[0].version !== 1 || records[0].worker_name !== worker || !uuid.test(records[0].version_id ?? "") || records[0].preview_url || records[0].preview_alias_url) throw new Error("untrusted Wrangler upload result");
        upload = records[0];
        // Wrangler's local state is not a deployment input. It never enters the
        // immutable package or the receipt digest.
        rmSync(path.join(scratch, ".wrangler"), { recursive: true, force: true });
        if (packageDigest(scratch) !== before) throw new Error("upload version or package changed");
      } finally { rmSync(work, { recursive: true, force: true }); }
      if (packageDigest(directory) !== before) throw new Error("upload version or package changed");
      const version = await api("/versions/" + upload.version_id);
      assertVersionConfig(version.resources, JSON.parse(readFileSync(path.join(directory, "deployment.json"))));
      if (version.id !== upload.version_id || typeof version.resources?.script?.etag !== "string" || !version.resources.script.etag) throw new Error("upload identity not confirmed");
      const receipt = Object.freeze({ scope: receiptScope, account, worker, version: upload.version_id, package_sha256: before,
        worker_sha256: workerSHA256, version_script_etag: version.resources.script.etag });
      if (receipts.has(receipt.version) && canonical(receipts.get(receipt.version)) !== canonical(receipt)) throw new Error("immutable upload receipt conflict");
      receipts.set(receipt.version, receipt);
      return receipt;
    },
    importSignedReceipt(receipt, signature, trustedPublicKey) {
      target();
      const key = createPublicKey({ key: trustedPublicKey, format: "der", type: "spki" });
      if (receipt.scope !== receiptScope || receipt.account !== account || receipt.worker !== worker || !uuid.test(receipt.version ?? "") || !digest.test(receipt.package_sha256 ?? "") || !digest.test(receipt.worker_sha256 ?? "") || typeof receipt.version_script_etag !== "string" || !receipt.version_script_etag ||
          key.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(canonical(receipt)), key, signature)) throw new Error("untrusted upload receipt");
      if (receipts.has(receipt.version) && canonical(receipts.get(receipt.version)) !== canonical(receipt)) throw new Error("immutable upload receipt conflict");
      receipts.set(receipt.version, Object.freeze({ ...receipt }));
    },
    async readVersionArtifact(version) {
      const receipt = known(version);
      if (!packageDirectory) throw new Error("staging deployment evidence unavailable");
      const config = JSON.parse(readFileSync(path.join(packageDirectory, "deployment.json")));
      assertDeployConfig(config, account);
      if (packageDigest(packageDirectory) !== receipt.package_sha256) throw new Error("upload version or package changed");
      await deployable(closedVersion);
      await deployable(version);
      const remote = await api("/versions/" + version);
      assertVersionConfig(remote.resources, config);
      if (remote.id !== version || remote.resources?.script?.etag !== receipt.version_script_etag) throw new Error("staging version identity differs");
      return receipt.package_sha256;
    },
    async verifyLiveVersion(version) {
      known(version);
      if (typeof verifyLiveVersion !== "function") throw new Error("live publication check required");
      await verifyLiveVersion(version);
    },
  });
}
