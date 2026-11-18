import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commandTimeout, pinnedRelease, releasePresets } from "./release-binary.mjs";
import { rawVerdict } from "./retrieval.mjs";

const withheld = "Available in the signed rule file.";
const ruleText = /^rule\..+\.(?:name|description|regex)$/;

export function filterRuleDisplay(records, core, candidate) {
  const binary = pinnedRelease(candidate);
  const cwd = mkdtempSync(path.join(tmpdir(), "hub-rule-display-"));
  const args = ["--home", cwd];
  const configs = [];
  const decisions = new Map();
  try {
    for (const preset of releasePresets) {
      const config = path.join(cwd, preset + ".yaml");
      execFileSync(binary, [...args, "generate", "config", "--preset", preset, "--output", config],
        { cwd, timeout: commandTimeout, stdio: "pipe" });
      configs.push(config);
    }
    const permitted = value => {
      if (!decisions.has(value)) {
        const bytes = Buffer.from(value);
        decisions.set(value, configs.every(config => rawVerdict(binary, args, config, bytes, cwd)));
      }
      return decisions.get(value);
    };

    for (const record of records.filter(record => record.listing.type === "bundle")) {
      const hidden = [];
      for (const [key, value] of Object.entries(record.facts)) {
        if (!ruleText.test(key) || permitted(value)) continue;
        record.facts[key] = withheld;
        hidden.push(key);
      }
      record.display_facts = Object.entries(record.facts).map(([key, value]) => ({ key, value }));
      record.withheld_fields = hidden;
    }
    return core.map(rule => {
      const copy = { ...rule };
      for (const field of ["name", "regex"]) {
        if (!permitted(copy[field])) copy[field] = "See the Pipelock source.";
      }
      return copy;
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
