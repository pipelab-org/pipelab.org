import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stagingToolEnvironment } from "./staging-tool-environment.mjs";
import { STAGING_ORIGIN } from "./staging-target.mjs";

export function accessHeaders(environment = process.env) {
  const id = environment.CF_ACCESS_CLIENT_ID, secret = environment.CF_ACCESS_CLIENT_SECRET;
  if (![id, secret].every(value => typeof value === "string" && value.length > 0 && !/[\r\n\0]/.test(value))) throw new Error("Access service credentials unavailable");
  return { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret };
}

// curl uses the configured HTTPS proxy. Configuration on stdin keeps credentials
// out of command arguments, diagnostics and temporary files. Redirects stay local.
export async function stagingRequest(route, { headers = {}, origin = STAGING_ORIGIN, signal } = {}) {
  if (origin !== STAGING_ORIGIN || !/^\/[a-z0-9/_.-]*$/i.test(route) || route.split("/").some(part => part === "." || part === "..")) throw new Error("unexpected staging request target");
  return curlRequest(origin + route, { headers, signal });
}

export async function curlRequest(url, { headers = {}, signal, method = "GET", body, output, maxBytes = 16777216 } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) throw new Error("HTTPS request required");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("invalid HTTPS download bound");
  const scratch = mkdtempSync(path.join(tmpdir(), "hub-http-"));
  try {
    const config = ["url = " + JSON.stringify(url), "request = " + JSON.stringify(method), ...(body === undefined ? [] : ["data = " + JSON.stringify(body)]), ...Object.entries(headers).map(([key, value]) => {
      if (!/^[a-z-]+$/i.test(key) || /[\r\n\0]/.test(value)) throw new Error("invalid request header");
      return "header = " + JSON.stringify(key + ": " + value);
    })].join("\n") + "\n";
    await new Promise((resolve, reject) => {
      const child = spawn("curl", ["-q", "--config", "-", "--silent", "--fail-with-body", "--proto", "=https", "--max-time", "30",
        "--max-filesize", String(maxBytes), "--dump-header", path.join(scratch, "headers"), "--output", output ?? path.join(scratch, "body")],
      { stdio: ["pipe", "ignore", "ignore"], env: stagingToolEnvironment(process.env), signal });
      child.on("error", () => reject(new Error("staging HTTPS request unavailable")));
      child.on("close", code => code === 0 || code === 22 ? resolve() : reject(new Error("staging HTTPS request failed")));
      child.stdin.on("error", () => {});
      child.stdin.end(config);
    });
    const block = readFileSync(path.join(scratch, "headers"), "utf8").trim().split(/\r?\n\r?\n/).at(-1).split(/\r?\n/);
    const match = /^HTTP\/\S+ (\d{3})(?:\s|$)/.exec(block.shift());
    if (!match) throw new Error("invalid staging HTTP response");
    const responseHeaders = Object.fromEntries(block.map(line => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    }));
    return { status: Number(match[1]), headers: responseHeaders, ...(output ? { file: output } : { body: readFileSync(path.join(scratch, "body")) }) };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
