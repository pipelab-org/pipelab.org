import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicationClearancePayload, publicationIdentity, publishClearedVersion } from "../scripts/hub/deployment-evidence.mjs";
import { canonical, sha256 } from "../scripts/hub/evidence.mjs";

test("publication checks actual registry bytes and the published build identity", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (route, contents) => {
    const file = path.join(directory, route.slice(1));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  };
  const registry = "/rules/fixture/bundle.yaml";
  const build = "/hub/build.json";
  const bundle = "fixture: baseline\n";
  const inputs = {
    directory,
    siteSHA: "a".repeat(40),
    rulesSHA: "b".repeat(40),
    buildConfig: Buffer.from("fixture configuration"),
    records: [{ listing: { id: "fixture" }, tooling_identity: { format: 1 } }],
    manifest: { entries: [
      { route: "/hub/fixture/", kind: "listing", ownership: "hub",
        representations: ["html", "mirror"], listing_id: "fixture", facts: {} },
      { route: build, kind: "build", ownership: "hub", representations: ["json"] },
      { route: registry, kind: "bundle-download", ownership: "official-registry",
        representations: ["raw"], sha256: sha256(bundle) },
    ] },
  };
  write("/hub/fixture/index.html", '<main data-hub-id="fixture"></main>');
  write("/hub/fixture/index.md", "ID: fixture\n");
  write(registry, bundle);
  const identity = publicationIdentity(inputs);
  const checked = { ...inputs, checkBuildFile: true };
  assert.throws(() => publicationIdentity(checked), /manifest output missing/);
  write(build, canonical(identity) + "\n");
  assert.deepEqual(publicationIdentity(checked), identity);
  write(registry, "fixture: changed copy\n");
  assert.throws(() => publicationIdentity(checked), /published artifact digest differs/);
  write(registry, bundle);
  write(build, canonical({ ...identity, output_set_sha256: "0".repeat(64) }) + "\n");
  assert.throws(() => publicationIdentity(checked), /published build identity differs/);

  const catalog = path.join(directory, "..", path.basename(directory) + "-inputs");
  mkdirSync(catalog);
  t.after(() => rmSync(catalog, { recursive: true, force: true }));
  writeFileSync(path.join(catalog, "routes.json"), JSON.stringify(inputs.manifest));
  writeFileSync(path.join(catalog, "listings.json"), JSON.stringify(inputs.records));
  const config = path.join(catalog, "build-config");
  writeFileSync(config, inputs.buildConfig);
  const script = fileURLToPath(new URL("../scripts/hub/deployment-evidence.mjs", import.meta.url));
  const run = (...flags) => spawnSync(process.execPath, [
    script, ...flags, directory, catalog, inputs.siteSHA, inputs.rulesSHA, config,
  ], { encoding: "utf8" });
  const refused = run();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /published build identity differs/);
  const derived = run("--derive-build");
  assert.equal(derived.status, 0, derived.stderr);
  assert.deepEqual(JSON.parse(derived.stdout), identity);
  write(build, canonical(identity) + "\n");
  assert.equal(run().status, 0);
});

function fixture() {
  const key = generateKeyPairSync("ed25519");
  const publicKey = key.publicKey.export({ format: "der", type: "spki" });
  const artifact = sha256("exact uploaded version");
  const revision = sha256("case ledger at review");
  const approval = { version: "fixture-version", publicKey,
    signature: sign(null, publicationClearancePayload(artifact, revision), key.privateKey) };
  const calls = [];
  let active = "closed";
  const adapter = {
    closedVersion: "closed",
    readActiveVersion: async () => {
      calls.push("active");
      return active;
    },
    readVersionArtifact: async version => {
      assert.equal(version, approval.version);
      calls.push("inspect");
      return artifact;
    },
    readCurrentLedgerRevision: async () => {
      calls.push("ledger");
      return revision;
    },
    activateVersion: async version => {
      assert.ok([approval.version, "closed"].includes(version));
      active = version;
      calls.push(version === "closed" ? "withdraw" : "activate");
    },
  };
  return { approval, adapter, artifact, revision, calls };
}

test("activation uses signed exact bytes and rechecks the live revision", async () => {
  const { approval, adapter, artifact, revision, calls } = fixture();
  const result = await publishClearedVersion(approval, adapter);
  assert.deepEqual(calls, ["inspect", "ledger", "activate", "active", "ledger"]);
  assert.deepEqual(result, { version: approval.version, artifact_sha256: artifact, ledger_revision: revision });
});

test("activation of any version, including rollback, requires current clearance", async t => {
  const cases = [
    ["a stale revision", { readCurrentLedgerRevision: async () => sha256("new hold") }, /does not match/],
    ["changed bytes", { readVersionArtifact: async () => sha256("different file") }, /does not match/],
    ["an unavailable ledger", { readCurrentLedgerRevision: async () => { throw new Error("ledger unavailable"); } }, /ledger unavailable/],
  ];
  for (const [name, override, expected] of cases) {
    await t.test(name, async () => {
      const { approval, adapter, calls } = fixture();
      await assert.rejects(publishClearedVersion(approval, { ...adapter, ...override }), expected);
      assert.ok(!calls.includes("activate"));
      assert.ok(!calls.includes("withdraw"));
    });
  }
});

test("a hold arriving during activation triggers withdrawal", async () => {
  const { approval, adapter, calls } = fixture();
  const read = adapter.readCurrentLedgerRevision;
  adapter.readCurrentLedgerRevision = async () => calls.includes("activate") ? sha256("new hold") : read();
  await assert.rejects(publishClearedVersion(approval, adapter), /changed during publication/);
  assert.deepEqual(calls, ["inspect", "ledger", "activate", "active", "withdraw", "active"]);
});

test("an ambiguous activation failure triggers withdrawal", async () => {
  const { approval, adapter, calls } = fixture();
  const activate = adapter.activateVersion;
  adapter.activateVersion = async version => {
    if (version !== adapter.closedVersion) throw new Error("activation timed out");
    await activate(version);
  };
  await assert.rejects(publishClearedVersion(approval, adapter), /activation timed out/);
  assert.deepEqual(calls, ["inspect", "ledger", "withdraw", "active"]);
});

test("a withdrawal failure remains visible alongside the triggering error", async () => {
  const { approval, adapter } = fixture();
  const activateFailure = new Error("activation timed out");
  const closeFailure = new Error("closed version unavailable");
  adapter.activateVersion = async version => {
    throw version === adapter.closedVersion ? closeFailure : activateFailure;
  };
  await assert.rejects(publishClearedVersion(approval, adapter), error => {
    assert.match(error.message, /withdrawal could not be confirmed/);
    assert.deepEqual(error.errors, [activateFailure, closeFailure]);
    return true;
  });
});

test("a hosting response that leaves another version active refuses publication", async () => {
  const { approval, adapter, calls } = fixture();
  const activate = adapter.activateVersion;
  adapter.activateVersion = async version => {
    if (version === adapter.closedVersion) await activate(version);
  };
  await assert.rejects(publishClearedVersion(approval, adapter), /activation could not be confirmed/);
  assert.deepEqual(calls, ["inspect", "ledger", "active", "withdraw", "active"]);
});
