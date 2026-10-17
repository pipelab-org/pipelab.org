import assert from "node:assert/strict";
import test from "node:test";
import { versionsInCurrentClaim } from "../scripts/historical-artifacts.mjs";

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
