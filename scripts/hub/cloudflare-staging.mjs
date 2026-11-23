import { createPublicKey, verify } from "node:crypto";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonical, sha256 } from "./evidence.mjs";
import { curlRequest } from "./staging-http.mjs";
import { assertStagingTarget, STAGING_ACCOUNT_ID, STAGING_WORKER, STAGING_ORIGIN, WRANGLER_VERSION } from "./staging-target.mjs";

import { assertStagingConfig } from "./staging-config.mjs";
import { runPinnedWrangler } from "./staging-wrangler.mjs";
export { runPinnedWrangler } from "./staging-wrangler.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
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
  verifyLiveVersion, verifyLiveClosed, request = curlRequest,
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
  const accountAPI = async (resource, method = "GET", body, recovery = false) => {
    target();
    if (!token || /[\r\n\0]/.test(token)) throw new Error("staging deployment token unavailable");
    const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/${resource}`, {
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: recovery ? undefined : signal,
    });
    if (response.status !== 200 || response.headers.location) throw new Error("staging hosting API failed");
    let value; try { value = JSON.parse(response.body); } catch { throw new Error("invalid staging hosting API response"); }
    if (value.success !== true || value.result === undefined) throw new Error("staging hosting API did not confirm success");
    if (Array.isArray(value.result) && value.result_info && (value.result_info.total_pages > 1 || value.result_info.total_count !== undefined && value.result_info.total_count !== value.result.length)) throw new Error("staging hosting inventory incomplete");
    return value.result;
  };
  const api = (suffix, ...options) => accountAPI(`workers/scripts/${worker}${suffix}`, ...options);
  const deployable = async (version, recovery = false) => {
    target();
    if (!uuid.test(version ?? "")) throw new Error("known closed version required");
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
    const domains = await accountAPI("workers/domains", "GET", undefined, recovery);
    const routes = await accountAPI(`workers/services/${worker}/environments/production/routes?show_zonename=true`, "GET", undefined, recovery);
    if (!Array.isArray(domains) || !Array.isArray(routes)) throw new Error("staging ingress inventory unavailable");
    const bindings = domains.filter(domain => domain.service === worker);
    if (bindings.length !== 1 || bindings[0].hostname !== new URL(STAGING_ORIGIN).hostname || bindings[0].environment !== "production" || routes.length !== 0) throw new Error("staging custom domain or zone routes differ from target");
  };
  const activateVersion = async (version, recovery = false) => {
    target();
    if (version !== closedVersion) known(version);
    await assertIngress(recovery);
    await deployable(version, recovery);
    await api("/deployments", "POST", { strategy: "percentage", versions: [{ version_id: version, percentage: 100 }] }, recovery);
  };
  const emergencyClose = async () => {
    target();
    if (typeof verifyLiveClosed !== "function") throw new Error("live closure check required");
    await activateVersion(closedVersion, true);
    if (await readActiveVersion(true) !== closedVersion) throw new Error("closed staging activation unconfirmed");
    await verifyLiveClosed();
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
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|HOME|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|https?_proxy|all_proxy|no_proxy)$/.test(key)));
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
      await deployable(closedVersion);
      await deployable(version);
      const remote = await api("/versions/" + version);
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
