import { createHash, createPublicKey, verify } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, sha256 } from "./evidence.mjs";
import { assertPublication, representationPaths } from "./parity.mjs";

const gitSHA = /^[a-f0-9]{40}$/;

export function publicationIdentity({ directory, manifest, records, siteSHA, rulesSHA, buildConfig, checkBuildFile = false }) {
  if (!gitSHA.test(siteSHA ?? "") || !gitSHA.test(rulesSHA ?? "") || !Buffer.isBuffer(buildConfig)) {
    throw new Error("candidate SHAs and exact build configuration are required");
  }
  const identities = new Map(records.map(record => [canonical(record.tooling_identity), record.tooling_identity]));
  if (identities.size !== 1 || !identities.values().next().value) throw new Error("records do not share one tooling identity");
  const tooling = identities.values().next().value;
  assertPublication({ directory, manifest, records, open: true, requireBuild: checkBuildFile });

  // Exclude the identity file itself to avoid a digest that depends on its own bytes.
  const files = manifest.entries.filter(entry => entry.kind !== "build").flatMap(representationPaths)
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(({ route }) => ({ route, sha256: sha256(readFileSync(path.join(directory, route.slice(1)))) }));
  const identity = {
    format: 1,
    candidate: { site_sha: siteSHA, rules_sha: rulesSHA, tooling_identity: tooling },
    build_config_sha256: sha256(buildConfig),
    manifest_sha256: sha256(canonical(manifest)),
    output_set_sha256: sha256(canonical(files)),
  };
  if (checkBuildFile) {
    const published = readFileSync(path.join(directory, "hub/build.json"));
    if (!published.equals(Buffer.from(canonical(identity) + "\n"))) {
      throw new Error("published build identity differs from verified outputs");
    }
  }
  return identity;
}

const sha256Hex = /^[a-f0-9]{64}$/;

export function publicationClearancePayload(artifactSHA256, ledgerRevision) {
  if (typeof artifactSHA256 !== "string" || !sha256Hex.test(artifactSHA256) ||
      typeof ledgerRevision !== "string" || !sha256Hex.test(ledgerRevision)) {
    throw new Error("exact deployment digest and authoritative ledger revision are required");
  }
  return Buffer.from(canonical({
    scope: "pipelab-hub-publication-clearance/v1",
    artifact_sha256: artifactSHA256,
    ledger_revision: ledgerRevision,
  }));
}

function assertClearance({ artifactSHA256, ledgerRevision, signature, publicKey }) {
  const payload = publicationClearancePayload(artifactSHA256, ledgerRevision);
  if (!Buffer.isBuffer(publicKey) || !Buffer.isBuffer(signature) || signature.length !== 64) {
    throw new Error("Ed25519 clearance signature and trusted public key required");
  }
  const key = createPublicKey({ key: publicKey, format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "ed25519" || !key.export({ format: "der", type: "spki" }).equals(publicKey)) {
    throw new Error("trusted Ed25519 public key required");
  }
  if (!verify(null, payload, key, signature)) {
    throw new Error("clearance does not match the deployment and current ledger revision");
  }
}

export async function verifyPublicationClearance({ artifact, ledgerRevision, signature, publicKey }) {
  if (typeof ledgerRevision !== "string" || !sha256Hex.test(ledgerRevision)) {
    throw new Error("authoritative ledger revision required");
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  const artifactSHA256 = hash.digest("hex");
  assertClearance({ artifactSHA256, ledgerRevision, signature, publicKey });
  return artifactSHA256;
}

// Run under the operator's publication lock. The hosting adapter must provide
// the full artifact digest of the specified immutable, privately staged version.
// The private ledger reader must consult the live authority on every call.
// Use the same function to activate an older version.
export async function publishClearedVersion({ version, signature, publicKey }, {
  readCurrentLedgerRevision, readVersionArtifact, activateVersion, readActiveVersion, closedVersion,
}) {
  if (typeof version !== "string" || !version || typeof closedVersion !== "string" || !closedVersion || version === closedVersion) {
    throw new Error("distinct immutable Hub and closed version identities required");
  }
  const artifactSHA256 = await readVersionArtifact(version);
  const ledgerRevision = await readCurrentLedgerRevision();
  assertClearance({ artifactSHA256, ledgerRevision, signature, publicKey });

  try {
    await activateVersion(version);
    if (await readActiveVersion() !== version) throw new Error("Hub version activation could not be confirmed");
    if (await readCurrentLedgerRevision() !== ledgerRevision) {
      throw new Error("private case record changed during publication");
    }
  } catch (failure) {
    // If activation failed ambiguously or a new hold arrived, the hosting
    // adapter restores the standing closed version. It needs no ledger access.
    try {
      await activateVersion(closedVersion);
      if (await readActiveVersion() !== closedVersion) throw new Error("closed version activation could not be confirmed");
    } catch (withdrawalFailure) {
      throw new AggregateError([failure, withdrawalFailure], "Hub withdrawal could not be confirmed");
    }
    throw failure;
  }
  return { version, artifact_sha256: artifactSHA256, ledger_revision: ledgerRevision };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "verify-clearance") {
    const [artifact, ledgerRevisionPath, signaturePath, keyPath] = process.argv.slice(3);
    if (process.argv.length !== 7) {
      throw new Error("usage: deployment-evidence.mjs verify-clearance ARTIFACT CURRENT_LEDGER_REVISION_FILE SIGNATURE PUBLIC_KEY_DER");
    }
    const identity = await verifyPublicationClearance({
      artifact,
      ledgerRevision: readFileSync(ledgerRevisionPath, "utf8").trim(),
      signature: readFileSync(signaturePath),
      publicKey: readFileSync(keyPath),
    });
    console.log(identity);
  } else {
    const [directory, catalog, siteSHA, rulesSHA, configPath] = process.argv.slice(2);
    if (process.argv.length !== 7 || !configPath) {
      throw new Error("usage: deployment-evidence.mjs BUILD_DIRECTORY CATALOG_DIRECTORY SITE_SHA RULES_SHA BUILD_CONFIG");
    }
    const manifest = JSON.parse(readFileSync(path.join(catalog, "routes.json")));
    const records = JSON.parse(readFileSync(path.join(catalog, "listings.json")));
    const result = publicationIdentity({ directory, manifest, records, siteSHA, rulesSHA, buildConfig: readFileSync(configPath) });
    console.log(canonical(result));
  }
}
