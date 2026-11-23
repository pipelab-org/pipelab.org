import { readFileSync } from "node:fs";
import { canonical } from "./evidence.mjs";
import { STAGING_WORKER, STAGING_ORIGIN, STAGING_DIRECT_BUILD_COMMAND } from "./staging-target.mjs";

export function assertStagingConfig(source = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")) {
  const config = JSON.parse(source.split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n"));
  const expected = { name: STAGING_WORKER, workers_dev: false, preview_urls: false, vars: {},
    routes: [{ pattern: new URL(STAGING_ORIGIN).hostname, custom_domain: true }], build: { command: STAGING_DIRECT_BUILD_COMMAND } };
  if (canonical(config.env?.staging) !== canonical(expected)) throw new Error("staging source configuration differs from target");
  return config;
}
