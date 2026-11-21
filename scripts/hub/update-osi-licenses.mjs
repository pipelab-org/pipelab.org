import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { osiListFrom, osiListSource } from "./license-approvals.mjs";

// Regenerates data/hub/osi-approved-licenses.json from the official SPDX
// license list (isOsiApproved, excluding isDeprecatedLicenseId).
//
//   NODE_USE_ENV_PROXY=1 node scripts/hub/update-osi-licenses.mjs [--check] [LOCAL_LICENSES_JSON]
//
// With no file argument the list is fetched from the SPDX source URL; route it
// through the configured proxy. A local copy of licenses.json can be given
// instead. --check compares the committed file with a fresh result and writes
// nothing, so it also notices a newer SPDX release.
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/hub/osi-approved-licenses.json");

export const serialize = list => JSON.stringify(list, null, 2) + "\n";

async function readSPDX(file) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const response = await fetch(osiListSource, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("SPDX license list unavailable: HTTP " + response.status);
  return await response.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args[0] === "--check";
  if (check) args.shift();
  if (args.length > 1 || args.some(arg => arg.startsWith("--"))) {
    console.error("usage: update-osi-licenses.mjs [--check] [LOCAL_LICENSES_JSON]");
    process.exit(2);
  }
  const bytes = serialize(osiListFrom(await readSPDX(args[0])));
  if (check) {
    if (readFileSync(output, "utf8") !== bytes) {
      console.error("data/hub/osi-approved-licenses.json differs from the SPDX license list");
      process.exit(1);
    }
    console.log("OSI-approved license list is current");
  } else {
    writeFileSync(output, bytes);
    console.log("wrote " + path.relative(process.cwd(), output));
  }
}
