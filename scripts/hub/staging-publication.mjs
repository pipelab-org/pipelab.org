import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { canonical } from "./evidence.mjs";
import { assertPublication, representationPaths } from "./parity.mjs";
import { accessHeaders, stagingRequest } from "./staging-http.mjs";
import { waitForStaging } from "./staging-convergence.mjs";
import { STAGING_ORIGIN } from "./staging-target.mjs";
import { verifyStagingInstalls } from "./staging-forwarder.mjs";

export function assertStagingResponse(response, expected) {
  if (response.status !== 200 || response.headers.location || !response.body.equals(expected)) throw new Error("staging representation bytes or status differ");
  if (!/(?:^|[,\s])nofollow(?:[,\s]|$)/i.test(response.headers["x-robots-tag"] ?? "") ||
      !/(?:^|[,\s])noindex(?:[,\s]|$)/i.test(response.headers["x-robots-tag"] ?? "") ||
      !/\bprivate\b/i.test(response.headers["cache-control"] ?? "") || !/\bno-store\b/i.test(response.headers["cache-control"] ?? "") ||
      /\b(?:public|s-maxage|max-age)\b/i.test(response.headers["cache-control"] ?? "") ||
      response.headers["x-content-type-options"] !== "nosniff" || !response.headers["content-security-policy"] ||
      !response.headers["strict-transport-security"] || response.headers["x-frame-options"] !== "DENY") throw new Error("staging security or cache headers missing");
}

export function assertDenied(response, expected) {
  if (expected && response.body.equals(expected)) throw new Error("staging denial contains protected bytes");
  // Access may redirect to login. Redirects establish denial only, never publication.
  if (![401, 403, 302, 303, 307].includes(response.status)) throw new Error("staging Access denial not established");
  if (response.status >= 300 && response.status < 400) {
    let login;
    try { login = new URL(response.headers.location); } catch { throw new Error("staging Access denial not established"); }
    if (login.protocol !== "https:" || login.username || login.password || !login.hostname.endsWith(".cloudflareaccess.com")) throw new Error("staging Access denial not established");
  }
}

export function assertHTMLRedirect(response, canonicalRoute) {
  let target;
  try { target = new URL(response.headers.location, STAGING_ORIGIN); } catch { throw new Error("invalid staging HTML redirect"); }
  if (![301, 302, 307, 308].includes(response.status) || target.origin !== STAGING_ORIGIN || target.pathname !== canonicalRoute || target.search || target.hash || target.username || target.password) throw new Error("invalid staging HTML redirect");
}

export async function verifyStagingClosed({ manifest }, { request = stagingRequest, environment = process.env, converge = waitForStaging } = {}) {
  const schema = JSON.parse(readFileSync(new URL("./routes.json", import.meta.url))).schema;
  if (manifest?.format !== 1 || !Array.isArray(manifest.entries) || !manifest.entries.length ||
      ["/hub/", "/hub/index.json", "/hub/build.json", schema].some(route => !manifest.entries.some(entry => entry.route === route && entry.ownership === "hub")) ||
      manifest.entries.some(entry => !["hub", "official-registry"].includes(entry.ownership) || !Array.isArray(entry.representations) || !entry.representations.length)) throw new Error("complete closure manifest required");
  const headers = accessHeaders(environment);
  const routes = new Set(["/api/results", "/hub/", "/hub/index.md", "/hub/index.json", "/hub/build.json", schema,
    ...manifest.entries.filter(entry => entry.ownership === "hub").flatMap(entry => [entry.route, ...representationPaths(entry).map(item => item.route)])]);
  await converge(async signal => {
    for (const route of routes) {
      const response = await request(route, { headers, signal });
      if (response.status !== 404 || response.headers.location) throw new Error("live closed staging outputs unconfirmed; closed version must be the static-only staging Worker");
    }
  });
  const denialRoutes = new Set(["/", ...routes, ...manifest.entries.flatMap(entry => [entry.route, ...representationPaths(entry).map(item => item.route)])]);
  for (const route of denialRoutes) for (const credentials of [{}, { "CF-Access-Client-Id": "invalid", "CF-Access-Client-Secret": "invalid" }]) {
    assertDenied(await request(route, { headers: credentials }));
  }
  return { checked: routes.size, denied: denialRoutes.size * 2 };
}

export async function verifyStagingPublication({ directory, manifest, records, identity, binary }, {
  request = stagingRequest, environment = process.env, install = verifyStagingInstalls, converge = waitForStaging,
} = {}) {
  const headers = accessHeaders(environment);
  assertPublication({ directory, manifest, records, open: true });
  const representations = manifest.entries.flatMap(entry => representationPaths(entry).map(item => ({ ...item, entry })));
  if (!representations.length || !representations.some(item => item.entry.kind === "build")) throw new Error("complete live manifest required");
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-live-"));
  let checked = 0, denied = 0;
  try {
    const buildBytes = readFileSync(path.join(directory, "hub/build.json"));
    if (canonical(JSON.parse(buildBytes)) !== canonical(identity)) throw new Error("expected build identity differs");
    const build = async signal => assertStagingResponse(await request("/hub/build.json", { headers, signal }), buildBytes);
    await converge(build);
    const denial = async () => {
      for (const route of ["/", "/api/results"]) for (const credentials of [{}, { "CF-Access-Client-Id": "invalid", "CF-Access-Client-Secret": "invalid" }]) {
        assertDenied(await request(route, { headers: credentials })); denied++;
      }
      for (const { route, representation, entry } of representations) {
        const paths = representation === "html" ? [entry.route, route] : [route];
        for (const target of paths) for (const credentials of [{}, { "CF-Access-Client-Id": "invalid", "CF-Access-Client-Secret": "invalid" }]) {
          assertDenied(await request(target, { headers: credentials }), readFileSync(path.join(directory, route.slice(1)))); denied++;
        }
      }
    };
    await denial();
    for (const { route, representation, entry } of representations) {
      const expected = readFileSync(path.join(directory, route.slice(1)));
      let response;
      await converge(async signal => {
        response = await request(representation === "html" ? entry.route : route, { headers, signal });
        assertStagingResponse(response, expected);
      });
      if (representation === "html") {
        const explicit = await request(route, { headers });
        if (explicit.status === 200) assertStagingResponse(explicit, expected);
        else assertHTMLRedirect(explicit, entry.route);
      }
      const destination = path.join(scratch, route.slice(1)); mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, response.body); checked++;
    }
    assertPublication({ directory: scratch, manifest, records, open: true });
    const installed = await install({ binary, directory, manifest, records, request, headers });
    if (!installed || installed.checked !== records.filter(record => record.listing.type === "bundle").length || installed.checked < 1) throw new Error("live installation checks incomplete");
    await denial();
    await build();
    return { checked, denied, build_identity: identity };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
