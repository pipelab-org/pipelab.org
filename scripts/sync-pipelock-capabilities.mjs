import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCapabilityFamilyMap } from "./capability-families.mjs";
import { requireCapabilityId } from "./capability-id.mjs";
import { requireRepositoryPath } from "./capability-source-records.mjs";

export function loadCapabilityFamilyConfig(input) {
  return parseCapabilityFamilyMap(input);
}

const FAMILY_CONFIG = loadCapabilityFamilyConfig(
  readFileSync(new URL("../data/pipelock_capability_families.json", import.meta.url), "utf8"),
);

const GROUPS = new Map(Object.entries({
  "network-mediation": "boundary",
  "mcp-proxy-scanning": "boundary",
  "tls-interception": "boundary",
  "a2a-scanning": "boundary",
  "browser-shield": "boundary",
  "rule-bundles": "boundary",
  "agent-containment": "enforcement",
  "single-agent-sandbox": "enforcement",
  "emergency-kill-switch": "enforcement",
  "adaptive-enforcement": "enforcement",
  "global-canary-tokens": "enforcement",
  "signed-action-receipts": "evidence",
  "offline-receipt-verification": "evidence",
  "verdict-explanations": "evidence",
  "deployment-diagnostics": "evidence",
  "operator-dashboard": "evidence",
  "coverage-certificates": "evidence",
  "exemption-lifecycle-records": "evidence",
  "legal-hold-metadata": "evidence",
  "named-agent-profiles": "coordination",
  "per-agent-sandbox-overrides": "coordination",
  "per-agent-address-allowlists": "coordination",
  "assessment-artifacts": "coordination",
  "conductor-fleet-coordination": "coordination",
  "fleet-audit-sink": "coordination",
  "fleet-receipt-reports": "coordination",
}));

const VALID_TIERS = new Set(["Free", "Pro", "Pro or Enterprise", "Assess", "Enterprise"]);
const VALID_ENTRY_POINT_KINDS = new Set(["command", "config"]);
const ACCESS_TIERS = new Map(Object.entries({
  Free: ["free", "pro", "enterprise"],
  Pro: ["pro", "enterprise"],
  "Pro or Enterprise": ["pro", "enterprise"],
  Enterprise: ["enterprise"],
  Assess: ["assess"],
}));

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function sourceRecord(value, label) {
  if (!value || typeof value !== "object") throw new Error(`${label} is required`);
  return {
    file: requireRepositoryPath(requiredString(value.file, `${label} file`), `${label} file`),
    symbol: requiredString(value.symbol, `${label} symbol`),
  };
}

export function buildDetailRoutes(families = FAMILY_CONFIG.families) {
  if (!Array.isArray(families) || families.length === 0) {
    throw new Error("capability family map must contain families");
  }

  const familyIds = new Set();
  const routes = new Map();
  for (const family of families) {
    const familyId = requiredString(family.id, "capability family id");
    if (familyIds.has(familyId)) throw new Error(`duplicate capability family ${familyId}`);
    if (!Array.isArray(family.capabilities) || family.capabilities.length === 0) {
      throw new Error(`${familyId} must name at least one capability`);
    }
    familyIds.add(familyId);
    for (const rawId of family.capabilities) {
      const id = requireCapabilityId(requiredString(rawId, `${familyId} capability id`), `${familyId} capability id`);
      if (routes.has(id)) throw new Error(`capability ${id} has more than one detail route`);
      routes.set(id, {
        family: familyId,
        path: `/capabilities/${id}/`,
      });
    }
  }
  return routes;
}

export function buildSnapshot(manifestBytes, source, families = FAMILY_CONFIG.families) {
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    throw new Error("capability manifest must use schema 1 and contain capabilities");
  }

  const detailRoutes = buildDetailRoutes(families);
  const seen = new Set();
  const capabilities = manifest.capabilities.map((capability) => {
    const id = requireCapabilityId(requiredString(capability.id, "capability id"));
    if (seen.has(id)) throw new Error(`duplicate capability id ${id}`);
    seen.add(id);
    const group = GROUPS.get(id);
    if (!group) throw new Error(`capability ${id} has no site group; classify it before publishing`);
    const detail = detailRoutes.get(id);
    if (!detail) throw new Error(`capability ${id} has no detail route; map it before publishing`);
    const tier = requiredString(capability.tier, `${id} tier`);
    if (!VALID_TIERS.has(tier)) throw new Error(`capability ${id} has unknown tier ${tier}`);
    if (!capability.operator_entry_point) throw new Error(`capability ${id} has no operator entry point`);
    const entryPointKind = requiredString(capability.operator_entry_point.kind, `${id} entry point kind`);
    if (!VALID_ENTRY_POINT_KINDS.has(entryPointKind)) {
      throw new Error(`capability ${id} has unknown entry point kind ${entryPointKind}`);
    }

    return {
      id,
      group,
      name: requiredString(capability.name, `${id} name`),
      summary: requiredString(capability.summary, `${id} summary`),
      tier,
      access_tiers: ACCESS_TIERS.get(tier),
      operator_entry_point: {
        kind: entryPointKind,
        value: requiredString(capability.operator_entry_point.value, `${id} entry point`),
        source: sourceRecord(capability.operator_entry_point.source, `${id} entry point source`),
      },
      implementation: sourceRecord(capability.implementation, `${id} implementation`),
      detail,
      availability: capability.availability
        ? {
            scope: requiredString(capability.availability.scope, `${id} availability scope`),
            qualifier: requiredString(capability.availability.qualifier, `${id} availability qualifier`),
          }
        : null,
    };
  });

  if (seen.size !== GROUPS.size) {
    const missing = [...GROUPS.keys()].filter((id) => !seen.has(id));
    throw new Error(`site grouping names capabilities missing from the manifest: ${missing.join(", ")}`);
  }

  const unrouted = [...detailRoutes.keys()].filter((id) => !seen.has(id));
  if (unrouted.length > 0) {
    throw new Error(`detail routes name capabilities missing from the manifest: ${unrouted.join(", ")}`);
  }

  return {
    schema_version: 1,
    source: {
      repository: "https://github.com/luckyPipewrench/pipelock",
      ref: requiredString(source.ref, "source ref"),
      commit: requiredString(source.commit, "source commit"),
      manifest_sha256: createHash("sha256").update(manifestBytes).digest("hex"),
      release_version: source.releaseVersion || null,
      status: source.releaseVersion ? "release" : "development",
    },
    tier_counts: Object.fromEntries(
      ["free", "pro", "enterprise", "assess"].map((tier) => [
        tier,
        capabilities.filter((capability) => capability.access_tiers.includes(tier)).length,
      ]),
    ),
    capabilities,
  };
}

function parseArgs(argv) {
  const args = {
    source: "",
    ref: "",
    recordedRef: "",
    version: "",
    output: "data/pipelock_capabilities.json",
    development: false,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--development") args.development = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--source" || arg === "--ref" || arg === "--recorded-ref" || arg === "--version" || arg === "--output") {
      const key = arg === "--recorded-ref" ? "recordedRef" : arg.slice(2);
      args[key] = argv[index + 1] || "";
      index += 1;
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.source) throw new Error("--source PATH is required");
  if (args.development === Boolean(args.version)) {
    throw new Error("choose exactly one of --development or --version X.Y.Z");
  }
  if (args.version && !/^\d+\.\d+\.\d+$/.test(args.version)) throw new Error("--version must be X.Y.Z");
  if (!args.ref) args.ref = args.development ? "origin/main" : `v${args.version}`;
  if (!args.recordedRef) args.recordedRef = args.ref;
  if (args.development && args.recordedRef !== "origin/main") {
    throw new Error("development snapshots must record origin/main");
  }
  if (args.version && args.recordedRef !== `v${args.version}`) {
    throw new Error("release snapshots must record the matching immutable tag");
  }
  return args;
}

function git(source, args) {
  return execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const commit = git(args.source, ["rev-parse", `${args.ref}^{commit}`]);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`could not resolve ${args.ref} to a commit`);
  const manifestBytes = execFileSync(
    "git",
    ["-C", args.source, "show", `${args.ref}:docs/security/capability-manifest.json`],
  );
  const snapshot = buildSnapshot(manifestBytes, {
    ref: args.recordedRef,
    commit,
    releaseVersion: args.version,
  });
  const destination = path.resolve(args.output);
  const rendered = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (args.check) {
    const current = readFileSync(destination, "utf8");
    if (current !== rendered) {
      throw new Error(`${args.output} does not match ${args.ref}; run the sync command without --check`);
    }
    process.stdout.write(`verified ${snapshot.capabilities.length} capabilities against ${args.ref} at ${commit}\n`);
    return;
  }
  writeFileSync(destination, rendered);
  process.stdout.write(`wrote ${snapshot.capabilities.length} capabilities from ${args.ref} at ${commit}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) main();
