import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Exercise the scanner without the generated product-facts and release-data audits.
const source = await readFile(new URL("../scripts/pipelock-version-audit.mjs", import.meta.url), "utf8");
const scanner = source.slice(source.indexOf("function versionsInCurrentClaim("));
const versionsInCurrentClaim = vm.runInNewContext(`${scanner}; versionsInCurrentClaim`);

test("version claims include Actions references under both GitHub owners", () => {
  for (const owner of ["luckyPipewrench", "pipelab-org", "PiPeLaB-OrG"]) {
    for (const version of ["3", "3.6", "3.6.0", "2.0.0"]) {
      assert.deepEqual(Array.from(versionsInCurrentClaim("content/pipelock.md", `uses: ${owner}/pipelock@v${version}`)), [version]);
    }
  }
  for (const reference of ["other/pipelock@v2.0.0", "pipelab-org/other@v2.0.0"]) {
    assert.equal(versionsInCurrentClaim("content/pipelock.md", reference).length, 0);
  }
});
