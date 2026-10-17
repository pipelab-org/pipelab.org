import { readFileSync } from "node:fs";
import { auditHistoricalArtifact, HISTORICAL_ELIGIBLE_PATHS, HISTORICAL_GAUNTLET_POINTER, loadHistoricalArtifacts } from "./historical-artifacts.mjs";

export function auditReleaseData(root, version, historical = loadHistoricalArtifacts(root, HISTORICAL_ELIGIBLE_PATHS)) {
  const findings = [...historical.findings];
  const check = (file, read) => {
    try {
      const bytes = readFileSync(`${root}/${file}`);
      for (const [label, actual] of read(bytes.toString("utf8"), bytes)) {
        if (actual !== version) findings.push(`${file}: ${label} ${JSON.stringify(actual)} disagrees with declared Pipelock ${version}`);
      }
    } catch (error) {
      findings.push(`${file}: cannot validate release data (${error.message})`);
    }
  };
  check("data/pipelock_capabilities.json", source => {
    const snapshot = JSON.parse(source);
    if (snapshot.source?.status !== "release") throw new Error("current capability snapshot must identify a release");
    return [["release_version", snapshot.source.release_version], ["ref", snapshot.source.ref?.replace(/^v/, "")]];
  });
  check("scripts/pipelock-verifier-pin.env", source => {
    const pins = new Map();
    const schema = new Map([
      ["PIPELAB_VERIFIER_VERSION", /^[0-9]+\.[0-9]+\.[0-9]+$/],
      ["PIPELAB_VERIFIER_LINUX_AMD64_SHA256", /^[0-9a-f]{64}$/],
    ]);
    for (const line of source.split(/\r?\n/)) {
      if (line === "" || line.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (!match || !schema.has(match[1])) throw new Error("unknown or malformed verifier pin assignment");
      const [, key, value] = match;
      if (pins.has(key) || !schema.get(key).test(value)) throw new Error(`duplicate or malformed ${key}`);
      pins.set(key, value);
    }
    if (pins.size !== schema.size) throw new Error("require one version and SHA-256 archive pin");
    return [["verifier version", pins.get("PIPELAB_VERIFIER_VERSION")]];
  });
  check(HISTORICAL_GAUNTLET_POINTER, (source, bytes) => {
    const pointer = JSON.parse(source);
    if (pointer.status !== "verified" || pointer.tool !== "pipelock") throw new Error("require verified Pipelock evidence");
    const entry = historical.entries.get(HISTORICAL_GAUNTLET_POINTER);
    if (entry) {
      findings.push(...auditHistoricalArtifact(HISTORICAL_GAUNTLET_POINTER, bytes, [[1, [pointer.tool_version]]], entry, version));
      return [];
    }
    return [["tool_version", pointer.tool_version]];
  });
  return findings;
}
