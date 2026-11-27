import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { stagingAccountCommitment } from "../scripts/hub/staging-target.mjs";

export let dependencies = path.dirname(createRequire(import.meta.url).resolve("parse5"));
while (path.basename(dependencies) !== "node_modules") {
  const parent = path.dirname(dependencies);
  if (parent === dependencies) throw new Error("installed test dependencies unavailable");
  dependencies = parent;
}
export function isolatedTarget(value) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-adapter-test-"));
  mkdirSync(path.join(directory, "scripts"));
  cpSync(new URL("../scripts/hub", import.meta.url), path.join(directory, "scripts/hub"), { recursive: true });
  cpSync(new URL("../wrangler.jsonc", import.meta.url), path.join(directory, "wrangler.jsonc"));
  symlinkSync(dependencies, path.join(directory, "node_modules"), "dir");
  const targetFile = path.join(directory, "scripts/hub/staging-target.mjs");
  writeFileSync(targetFile, readFileSync(targetFile, "utf8").replace(/STAGING_ACCOUNT_SHA256 = "[^"]*"/, "STAGING_ACCOUNT_SHA256 = " + JSON.stringify(value ? stagingAccountCommitment(value) : "")));
  process.once("exit", () => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
