import assert from "node:assert/strict";
import test from "node:test";

import { isBlockedExternalLink } from "../scripts/external-link-policy.mjs";

test("blocks retired external paths", () => {
  const retiredUrls = [
    "https://github.com/proximity-mcp/proximity",
    "https://snyk.io/platform/agent-security/",
    "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/methodology.md",
    "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/schemas/receipt-scoring-profile.schema.json",
    // A tracking parameter or a deep-link fragment must not defeat the guard.
    // site-audit.mjs matches the raw href, so both still reach these patterns.
    "https://snyk.io/platform/agent-security/?utm_source=newsletter",
    "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/methodology.md#scoring",
  ];

  for (const url of retiredUrls) {
    assert.equal(isBlockedExternalLink(url), true, url);
  }
});

test("allows current Agent Egress Bench paths", () => {
  const currentUrls = [
    "https://github.com/proximity-mcp/proximity-server",
    "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/gauntlet.md",
    "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/schemas/receipt-scoring-profile-v4.schema.json",
  ];

  for (const url of currentUrls) {
    assert.equal(isBlockedExternalLink(url), false, url);
  }
});

test("retired benchmark paths stay blocked under both GitHub owners", () => {
  for (const owner of ["luckyPipewrench", "pipelab-org", "PiPeLaB-OrG"]) {
    for (const retired of ["docs/methodology.md", "schemas/receipt-scoring-profile.schema.json"]) {
      for (const suffix of ["", "#scoring", "?ref=docs"]) {
        assert.equal(isBlockedExternalLink(`https://github.com/${owner}/agent-egress-bench/blob/main/${retired}${suffix}`), true);
      }
    }
    assert.equal(isBlockedExternalLink(`https://github.com/${owner}/agent-egress-bench/blob/main/docs/gauntlet.md`), false);
  }
});
