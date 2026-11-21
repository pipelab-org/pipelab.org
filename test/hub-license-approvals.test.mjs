import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { preflightContribution } from "../scripts/hub/contribution-preflight.mjs";
import { sha256, toolingIdentity } from "../scripts/hub/evidence.mjs";
import { communityListingKey, findLicenseApproval, loadLicenseApprovals, osiApprovedLicenses, osiListFrom, parseLicenseApprovals } from "../scripts/hub/license-approvals.mjs";
import { defaultLicenses, readLicenseMaterial } from "../scripts/hub/license-delivery.mjs";
import { acquireHubTree, assertHubOnly } from "../scripts/hub/source-tree.mjs";
import { parseListing } from "../scripts/hub/validate.mjs";
import { droppedReferenced, referencedLicenses, serialize } from "../scripts/hub/update-osi-licenses.mjs";

const root = path.resolve(import.meta.dirname, "..");
const pullURL = "https://github.com/pipelab-org/pipelock-rules/pull/12";
const mplText = "Mozilla Public License Version 2.0\n\nFixture text for an OSI-approved license outside the default set.\n";
const entry = { listing: "acme/example-bundle", license: "MPL-2.0", license_sha256: sha256(mplText), approved_in: pullURL };
const approvalsFile = (...entries) => stringify({ schema_version: 1, approvals: entries });

test("the committed OSI list is generated from the SPDX list rules and stays well formed", () => {
  const spdx = { licenseListVersion: "9.9", releaseDate: "2026-01-01T00:00:00Z", licenses: [
    { licenseId: "MPL-2.0", isOsiApproved: true, isDeprecatedLicenseId: false },
    { licenseId: "GPL-3.0", isOsiApproved: true, isDeprecatedLicenseId: true },
    { licenseId: "GPL-3.0-only", isOsiApproved: true },
    { licenseId: "CC-BY-4.0", isOsiApproved: false, isDeprecatedLicenseId: false },
    { licenseId: "Zlib", isOsiApproved: true, isDeprecatedLicenseId: false },
  ] };
  assert.deepEqual(osiListFrom(spdx), {
    format: 1, source: "https://spdx.org/licenses/licenses.json",
    spdx_license_list_version: "9.9", spdx_release_date: "2026-01-01T00:00:00Z", ids: ["GPL-3.0-only", "MPL-2.0", "Zlib"],
  });
  assert.throws(() => osiListFrom({ licenses: [] }), /unexpected SPDX license list shape/);
  assert.throws(() => osiListFrom({ ...spdx, licenses: [{ licenseId: "X", isOsiApproved: "yes" }] }), /unexpected SPDX license entry/);

  const committed = readFileSync(path.join(root, "scripts/hub/data/osi-approved-licenses.json"), "utf8");
  const list = JSON.parse(committed);
  assert.equal(serialize(list), committed, "the file keeps the generator's byte format");
  assert.match(list.spdx_license_list_version, /^\d+\.\d+/);
  const ids = osiApprovedLicenses();
  for (const id of ["MPL-2.0", "GPL-3.0-only", "LGPL-2.1-only", "EPL-2.0", "Zlib", "Apache-2.0", "MIT"]) assert.ok(ids.has(id), id);
  // Deprecated spellings, non-OSI licenses and unknown names are not on the list.
  for (const id of ["GPL-3.0", "GPL-2.0", "CC0-1.0", "CC-BY-4.0", "Unknown-1.0", "mit"]) assert.ok(!ids.has(id), id);
});

test("license approval entries are strict and bound to one listing", () => {
  assert.deepEqual(parseLicenseApprovals(approvalsFile(entry)), [entry]);
  assert.deepEqual(parseLicenseApprovals(approvalsFile()), []);
  const bad = (text, error) => assert.throws(() => parseLicenseApprovals(text), error);
  bad("not: [valid", /invalid license approval file/);
  bad(stringify({ schema_version: 2, approvals: [] }), /invalid license approval file/);
  bad(stringify({ schema_version: 1, approvals: [], extra: true }), /invalid license approval file/);
  bad(stringify({ schema_version: 1, approvals: {} }), /invalid license approval file/);
  bad("schema_version: 1\nschema_version: 1\napprovals: []\n", /invalid license approval file/);
  bad(approvalsFile({ ...entry, extra: "x" }), /invalid license approval entry/);
  bad(approvalsFile({ ...entry, listing: "acme" }), /invalid license approval entry/);
  bad(approvalsFile({ ...entry, listing: "acme--example-bundle" }), /invalid license approval entry/);
  bad(approvalsFile({ ...entry, listing: "ACME/example-bundle" }), /invalid license approval entry/);
  bad(approvalsFile({ ...entry, license: "MPL 2.0" }), /invalid license approval entry/);
  bad(approvalsFile({ ...entry, license_sha256: entry.license_sha256.toUpperCase() }), /invalid license approval entry/);
  bad(approvalsFile({ ...entry, license_sha256: "abc" }), /invalid license approval entry/);
  for (const url of ["http://github.com/pipelab-org/pipelock-rules/pull/12", "https://github.com/other/pipelock-rules/pull/12",
    "https://github.com/pipelab-org/pipelock-rules/issues/12", "https://github.com/pipelab-org/pipelock-rules/pull/0",
    pullURL + "/files", pullURL + "?x=1", ""]) {
    bad(approvalsFile({ ...entry, approved_in: url }), /invalid license approval entry/);
  }
  // List membership is a use-time check: an approval whose identifier has left the
  // mutable OSI list still parses, so it cannot make the whole tree unloadable.
  for (const license of ["Unknown-1.0", "GPL-3.0"]) assert.deepEqual(parseLicenseApprovals(approvalsFile({ ...entry, license })), [{ ...entry, license }]);
  bad(approvalsFile(entry, { ...entry, license: "GPL-3.0-only" }), /duplicate license approval/);

  assert.equal(communityListingKey("acme", "example-bundle"), entry.listing);
  assert.equal(findLicenseApproval([entry], entry.listing, "MPL-2.0"), entry);
  assert.equal(findLicenseApproval([entry], "acme/other-bundle", "MPL-2.0"), null);
  assert.equal(findLicenseApproval([entry], entry.listing, "GPL-3.0-only"), null);
  assert.equal(findLicenseApproval(undefined, entry.listing, "MPL-2.0"), null);
});

test("a missing approval file means no approvals; a malformed one refuses the tree", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-approvals-"));
  try {
    assert.deepEqual(loadLicenseApprovals(dir), []);
    mkdirSync(path.join(dir, "hub"));
    writeFileSync(path.join(dir, "hub/license-approvals.yaml"), approvalsFile(entry));
    assert.deepEqual(loadLicenseApprovals(dir), [entry]);
    writeFileSync(path.join(dir, "hub/license-approvals.yaml"), "approvals: []\n");
    assert.throws(() => loadLicenseApprovals(dir), /invalid license approval file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bundleDirectory(t, files, bundleText = "format_version: 2\nname: example-bundle\n") {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-license-approval-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, "bundle.yaml"), bundleText);
  writeFileSync(path.join(dir, "bundle.yaml.sig"), "signature\n");
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  return { dir, signed: { bytes: readFileSync(path.join(dir, "bundle.yaml")), signature: readFileSync(path.join(dir, "bundle.yaml.sig")) } };
}

test("a non-default OSI license is delivered only under an approval of the exact text", t => {
  const { dir, signed } = bundleDirectory(t, { LICENSE: mplText, NOTICE: "Example notice\n" });
  const material = readLicenseMaterial(dir, "MPL-2.0", signed, { approval: entry });
  assert.equal(material.license.text, mplText);
  assert.equal(material.license.sha256, entry.license_sha256);
  assert.deepEqual(material.notices.map(file => file.name), ["NOTICE"]);
  // Delivery is unchanged: the same files beside an unchanged signed pair.
  assert.deepEqual(readFileSync(path.join(dir, "bundle.yaml")), signed.bytes);

  const refuse = (license, approval, error, files = { LICENSE: mplText }, bundleText) => {
    const bundle = bundleDirectory(t, files, bundleText);
    assert.throws(() => readLicenseMaterial(bundle.dir, license, bundle.signed, { approval }), error);
  };
  const unapproved = /license is not approved for this listing or its text changed/;
  refuse("MPL-2.0", undefined, unapproved);
  refuse("MPL-2.0", null, unapproved);
  refuse("MPL-2.0", { ...entry, license_sha256: sha256("other text\n") }, unapproved);
  refuse("MPL-2.0", { ...entry, license_sha256: undefined }, unapproved);
  refuse("MPL-2.0", { ...entry, license: "GPL-3.0-only" }, unapproved);
  // Any change to the delivered bytes after approval, including whitespace.
  refuse("MPL-2.0", entry, unapproved, { LICENSE: mplText + "\n" });
  refuse("MPL-2.0", entry, unapproved, { LICENSE: mplText.replace("Fixture", "Edited") });
  // An approval for another identifier does not cover this one, even for identical bytes.
  refuse("GPL-3.0-only", entry, unapproved);
  // Identifiers outside the list, deprecated spellings and non-OSI licenses never qualify.
  for (const id of ["Unknown-1.0", "GPL-3.0", "GPL-2.0", "CC-BY-4.0", "mpl-2.0", "", undefined, null, 7]) {
    refuse(id, { ...entry, license: id }, /unsupported listing license/);
  }
  // The text must still be present, UTF-8 and free of control characters.
  refuse("MPL-2.0", entry, /license text missing/, {});
  refuse("MPL-2.0", entry, /license text missing/, { LICENSE: " \n" });
  refuse("MPL-2.0", entry, /control characters/, { LICENSE: mplText + "\u0000" });
  refuse("MPL-2.0", entry, /unrecognized license or notice file/, { LICENSE: mplText, COPYING: mplText });
  // The signed bundle must not declare a different license.
  refuse("MPL-2.0", entry, /differs from the signed bundle/, { LICENSE: mplText }, "license: MIT\n");
  const changed = { ...signed, bytes: Buffer.from("other signed bytes\n") };
  assert.throws(() => readLicenseMaterial(dir, "MPL-2.0", changed, { approval: entry }), /would alter signed bytes/);
});

test("default licenses keep the complete-text check and ignore approvals", t => {
  const mit = "MIT License\n\nCopyright (c) 2026 Example Maintainer\n\n" + readFileSync(path.join(root, "scripts/hub/licenses/MIT.txt"), "utf8");
  assert.deepEqual([...defaultLicenses], ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "CC0-1.0"]);
  const complete = bundleDirectory(t, { LICENSE: mit });
  assert.equal(readLicenseMaterial(complete.dir, "MIT", complete.signed).license.text, mit);
  // An unrelated approval changes nothing for a complete default text.
  assert.equal(readLicenseMaterial(complete.dir, "MIT", complete.signed, { approval: { ...entry, license: "MIT", license_sha256: "0".repeat(64) } }).license.text, mit);
  // A default license cannot be approved around: partial or extended text stays refused.
  const partial = "MIT License\n\nCopyright (c) 2026 Example\n\nPermission is hereby granted, free of charge.\n";
  const short = bundleDirectory(t, { LICENSE: partial });
  const approval = { listing: entry.listing, license: "MIT", license_sha256: sha256(partial), approved_in: pullURL };
  assert.throws(() => readLicenseMaterial(short.dir, "MIT", short.signed, { approval }), /does not match the declared license/);
  // The copyright notice requirement for default MIT still applies.
  const unattributed = bundleDirectory(t, { LICENSE: mit.replace("Copyright (c) 2026 Example Maintainer\n", "") });
  assert.throws(() => readLicenseMaterial(unattributed.dir, "MIT", unattributed.signed, { approval }), /required copyright notice missing/);
});

test("the listing schema accepts SPDX identifiers structurally and leaves policy to generation", () => {
  const fixture = JSON.parse(readFileSync(path.join(root, "test/hub-fixtures/listing.json"), "utf8"));
  const bundle = { ...fixture, type: "bundle", bundle_name: "example-bundle", bundle_sha256: "a".repeat(64), signer_fingerprint: "b".repeat(64) };
  delete bundle.learn_page;
  const ok = license => parseListing(JSON.stringify({ ...bundle, license }));
  for (const license of ["MPL-2.0", "GPL-3.0-only", "Apache-2.0", "GPL-3.0"]) assert.equal(ok(license).license, license);
  for (const license of ["", "MPL 2.0", "-MPL", "MPL/2.0", "x".repeat(65), "MPL-2.0\n"]) assert.throws(() => ok(license), /does not match exactly one type schema/, JSON.stringify(license));
  assert.throws(() => parseListing(JSON.stringify({ ...bundle, license: 5 })), /does not match exactly one type schema/);
  // Only bundle licenses pass through generation's approval path; recipes, configs
  // and verifiers keep the seven default licenses in the schema.
  assert.equal(parseListing(JSON.stringify({ ...fixture, license: "MIT" })).license, "MIT");
  assert.throws(() => parseListing(JSON.stringify({ ...fixture, license: "MPL-2.0" })), /does not match exactly one type schema/);
  assert.deepEqual(readFileSync(path.join(root, "assets/hub/schema/listing-v1.json")), readFileSync(path.join(root, "scripts/hub/schema/listing-v1.json")));
});

// A signed community pack in a throwaway Rules repository.
const signingKey = generateKeyPairSync("ed25519");
const fingerprint = signingKey.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const bundle = "format_version: 2\n";
const signature = sign(null, Buffer.from(bundle), signingKey.privateKey).toString("base64") + "\n";
const packDirectory = "hub/community/acme/example-bundle/";
function pack(license, licenseText) {
  const fixture = JSON.parse(readFileSync(path.join(root, "test/hub-fixtures/listing.json"), "utf8"));
  delete fixture.learn_page;
  delete fixture.evidence.artifact;
  const listing = Object.assign(fixture, { type: "bundle", id: "example-bundle", bundle_name: "example-bundle", license, bundle_sha256: sha256(bundle), signer_fingerprint: fingerprint });
  return {
    "hub/publishers/acme.yaml": stringify({ id: "acme", name: "Acme", keys: [{ fingerprint, added: "2026-11-05" }] }),
    "hub/listings/community/acme--example-bundle.yaml": stringify(listing),
    [packDirectory + "bundle.yaml"]: bundle,
    [packDirectory + "bundle.yaml.sig"]: signature,
    ...(licenseText === undefined ? {} : { [packDirectory + "LICENSE"]: licenseText }),
  };
}

function rules(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hub-approvals-rules-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe", encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  const commit = changes => {
    for (const [file, contents] of Object.entries(changes)) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), contents);
      git("add", "--", file);
    }
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  return { directory, commit };
}
const failed = report => Object.entries(report.steps).find(([, step]) => step.status === "fail")?.[0];

test("approvals are maintenance-only files that the Rules acquisition admits", t => {
  const { directory, commit } = rules(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit({ "hub/license-approvals.yaml": approvalsFile(entry) });
  assert.throws(() => assertHubOnly(directory, base, head), /only Hub contribution files/);
  assert.deepEqual(assertHubOnly(directory, base, head, { maintenance: true }), ["hub/license-approvals.yaml"]);
  // A pack cannot carry its own approval in the same contribution.
  const both = commit({ ...pack("MPL-2.0", mplText), "hub/license-approvals.yaml": approvalsFile(entry, { ...entry, listing: "acme/other-bundle" }) });
  assert.throws(() => assertHubOnly(directory, head, both), /only Hub contribution files/);
  // The acquired tree carries the file so generation and preflight can read it.
  const output = path.join(directory, "output");
  mkdirSync(output);
  acquireHubTree(directory, head, output);
  assert.deepEqual(loadLicenseApprovals(output), [entry]);
});

test("preflight admits an approved non-default pack and refuses every mismatch", t => {
  const { directory, commit } = rules(t);
  const approved = commit({ "hub/license-approvals.yaml": approvalsFile(entry) });
  const head = commit(pack("MPL-2.0", mplText));
  const report = preflightContribution({ repository: directory, base: approved, head, site: root });
  assert.equal(report.verdict, "LOCAL-ELIGIBLE", JSON.stringify(report.steps));
  assert.deepEqual(report.steps["license-approvals"].evidence, [{ id: "example-bundle", license: "MPL-2.0", license_sha256: entry.license_sha256 }]);

  // Without an approval in the tree.
  const noApproval = rules(t);
  const noBase = noApproval.commit({ "hub/README.md": "Guide.\n" });
  const noHead = noApproval.commit(pack("MPL-2.0", mplText));
  const refused = preflightContribution({ repository: noApproval.directory, base: noBase, head: noHead, site: root });
  assert.equal(refused.verdict, "REFUSED");
  assert.equal(failed(refused), "license-approvals");
  assert.match(refused.steps["license-approvals"].evidence, /not approved/);

  // Changed text after approval, a different identifier and a different listing.
  const edited = rules(t);
  const editedBase = edited.commit({ "hub/license-approvals.yaml": approvalsFile(entry) });
  const editedHead = edited.commit(pack("MPL-2.0", mplText + "Added line.\n"));
  assert.match(preflightContribution({ repository: edited.directory, base: editedBase, head: editedHead, site: root }).steps["license-approvals"].evidence, /not approved/);
  for (const changed of [{ ...entry, listing: "acme/other-bundle" }, { ...entry, license: "GPL-3.0-only" }, { ...entry, license_sha256: sha256("x") }]) {
    const other = rules(t);
    const otherBase = other.commit({ "hub/license-approvals.yaml": approvalsFile(changed) });
    const otherHead = other.commit(pack("MPL-2.0", mplText));
    const result = preflightContribution({ repository: other.directory, base: otherBase, head: otherHead, site: root });
    assert.equal(failed(result), "license-approvals", JSON.stringify(changed));
  }

  // Unknown and deprecated identifiers are refused even with a matching entry.
  for (const license of ["Unknown-1.0", "GPL-3.0"]) {
    const other = rules(t);
    const otherBase = other.commit({ "hub/README.md": "Guide.\n" });
    const otherHead = other.commit(pack(license, mplText));
    const result = preflightContribution({ repository: other.directory, base: otherBase, head: otherHead, site: root });
    assert.equal(failed(result), "license-approvals", license);
    assert.match(result.steps["license-approvals"].evidence, /unsupported listing license/);
  }

  // A default license is not held to approvals in preflight.
  const defaults = rules(t);
  const defaultsBase = defaults.commit({ "hub/README.md": "Guide.\n" });
  const defaultsHead = defaults.commit(pack("MIT"));
  assert.equal(preflightContribution({ repository: defaults.directory, base: defaultsBase, head: defaultsHead, site: root }).verdict, "LOCAL-ELIGIBLE");
});

test("preflight reports approvals as a maintenance category and refuses malformed files", t => {
  const { directory, commit } = rules(t);
  const base = commit({ "hub/README.md": "Guide.\n" });
  const head = commit({ "hub/license-approvals.yaml": approvalsFile(entry) });
  assert.equal(failed(preflightContribution({ repository: directory, base, head, site: root })), "hub-only");
  const report = preflightContribution({ repository: directory, base, head, site: root, maintenance: true });
  assert.equal(report.verdict, "LOCAL-ELIGIBLE");
  assert.deepEqual(report.categories, ["license-approval"]);
  assert.match(report.remaining.join("\n"), /License approval: the Git objects carry no reviewer identity/);

  // A maintenance change that records an approval for an identifier outside the
  // OSI list is refused when the approval is admitted.
  const broken = commit({ "hub/license-approvals.yaml": approvalsFile({ ...entry, license: "Unknown-1.0" }) });
  const refused = preflightContribution({ repository: directory, base: head, head: broken, site: root, maintenance: true });
  assert.equal(refused.verdict, "REFUSED");
  assert.equal(failed(refused), "license-approval-list");
  assert.match(refused.steps["license-approval-list"].evidence, /outside the OSI-approved list/);

  const malformed = commit({ "hub/license-approvals.yaml": "approvals: []\n" });
  assert.equal(failed(preflightContribution({ repository: directory, base: broken, head: malformed, site: root, maintenance: true })), "source-parse");
});

test("license approvals cannot transfer between ambiguous publisher and bundle pairs", t => {
  const originalPublisher = "acme--tools", originalBundle = "example-bundle";
  const otherPublisher = "acme", otherBundle = "tools--example-bundle";
  const approvedKey = communityListingKey(originalPublisher, originalBundle);
  const approved = parseLicenseApprovals(approvalsFile({ ...entry, listing: approvedKey }));
  assert.equal(findLicenseApproval(approved, approvedKey, "MPL-2.0"), approved[0]);
  assert.equal(findLicenseApproval(approved, communityListingKey(otherPublisher, otherBundle), "MPL-2.0"), null);
  const { directory, commit } = rules(t);
  const base = commit({ "hub/license-approvals.yaml": approvalsFile({ ...entry, listing: approvedKey }) });
  const files = pack("MPL-2.0", mplText);
  const listingFile = "hub/listings/community/acme--example-bundle.yaml";
  const stagedListing = Object.assign(JSON.parse(readFileSync(path.join(root, "test/hub-fixtures/listing.json"), "utf8")), { type: "bundle", id: otherBundle, bundle_name: otherBundle, license: "MPL-2.0", bundle_sha256: sha256(bundle), signer_fingerprint: fingerprint });
  delete stagedListing.learn_page;
  delete stagedListing.evidence.artifact;
  files["hub/listings/community/" + otherPublisher + "--" + otherBundle + ".yaml"] = stringify(stagedListing);
  delete files[listingFile];
  for (const name of ["bundle.yaml", "bundle.yaml.sig", "LICENSE"]) {
    files["hub/community/" + otherPublisher + "/" + otherBundle + "/" + name] = files[packDirectory + name];
    delete files[packDirectory + name];
  }
  const head = commit(files);
  const report = preflightContribution({ repository: directory, base, head, site: root });
  assert.equal(report.verdict, "REFUSED", JSON.stringify(report));
  assert.equal(failed(report), "license-approvals");
  assert.notEqual(approvedKey, communityListingKey(otherPublisher, otherBundle));
});

test("a stale approval fails only its own listing and never the whole Rules tree", t => {
  const { directory, commit } = rules(t);
  const stale = { ...entry, listing: "acme/other-bundle", license: "Unknown-1.0" };
  const base = commit({ "hub/license-approvals.yaml": approvalsFile(stale) });
  const head = commit(pack("MIT"));
  // Loading and unrelated contributions are unaffected by an approval whose identifier left the list.
  const report = preflightContribution({ repository: directory, base, head, site: root });
  assert.equal(report.verdict, "LOCAL-ELIGIBLE", JSON.stringify(report.steps));
  // The listing that uses it fails when it is used.
  const { dir, signed } = bundleDirectory(t, { LICENSE: mplText });
  assert.throws(() => readLicenseMaterial(dir, "Unknown-1.0", signed, { approval: { ...stale, license_sha256: sha256(mplText) } }), /unsupported listing license/);
});

test("retained delivery trusts the accepted license and digest, not the current OSI list", t => {
  const { dir, signed } = bundleDirectory(t, { LICENSE: mplText, NOTICE: "Example notice\n" });
  // "GPL-3.0" stands for an identifier that has since left the list.
  const pinned = { license: "GPL-3.0", license_sha256: sha256(mplText) };
  assert.ok(!osiApprovedLicenses().has("GPL-3.0"));
  assert.equal(readLicenseMaterial(dir, "GPL-3.0", signed, { retained: true, approval: pinned }).license.sha256, pinned.license_sha256);
  // The pin still binds: changed text, no pin and another identifier are refused.
  const unapproved = /license is not approved for this listing or its text changed/;
  assert.throws(() => readLicenseMaterial(dir, "GPL-3.0", signed, { retained: true, approval: { ...pinned, license_sha256: sha256("x") } }), unapproved);
  assert.throws(() => readLicenseMaterial(dir, "GPL-3.0", signed, { retained: true }), unapproved);
  assert.throws(() => readLicenseMaterial(dir, "GPL-3.0", signed, { retained: true, approval: { ...pinned, license: "MPL-2.0" } }), unapproved);
  // An identifier that is not even SPDX-shaped is unusable whatever the record says.
  for (const id of ["", undefined, null, 7, "MPL 2.0"]) {
    assert.throws(() => readLicenseMaterial(dir, id, signed, { retained: true, approval: { ...pinned, license: id } }), /unsupported listing license/, String(id));
  }
  // Without the retained flag the current list still gates admission.
  assert.throws(() => readLicenseMaterial(dir, "GPL-3.0", signed, { approval: pinned }), /unsupported listing license/);
});

test("an OSI list refresh cannot drop an identifier that committed data still uses", t => {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-osi-refs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file, text) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), text); };
  write("data/hub/generated/listings.json", JSON.stringify([{ id: "a", license: "MPL-2.0", license_sha256: "0".repeat(64) }, { id: "b", license: "MIT" }]));
  write("data/hub/generated/inventory.json", JSON.stringify({ nested: { entries: [{ license: "EPL-2.0" }] } }));
  write("data/hub/first-party/example.yaml", "license: Zlib\n");
  const rulesDir = path.join(dir, "rules");
  write("rules/hub/license-approvals.yaml", approvalsFile({ ...entry, license: "GPL-3.0-only" }));
  write("rules/hub/listings/community/acme--example-bundle.yaml", "license: LGPL-2.1-only\n");
  write("rules/hub/listings/bundles/pipelock-community.yaml", "license: Apache-2.0\n");

  // Default licenses are never constrained by the list; everything else is collected.
  assert.deepEqual([...referencedLicenses({ root: dir })].sort(), ["EPL-2.0", "MPL-2.0", "Zlib"]);
  assert.deepEqual([...referencedLicenses({ root: dir, rules: rulesDir })].sort(), ["EPL-2.0", "GPL-3.0-only", "LGPL-2.1-only", "MPL-2.0", "Zlib"]);
  assert.deepEqual(droppedReferenced(new Set(["MPL-2.0", "Zlib"]), new Set(["MPL-2.0", "EPL-2.0", "GPL-3.0"])), ["EPL-2.0", "GPL-3.0"]);
  assert.deepEqual(droppedReferenced(new Set(["MPL-2.0"]), new Set(["MPL-2.0"])), []);

  // The command refuses to write, names the identifiers, and leaves the committed list alone.
  const spdx = { licenseListVersion: "9.9", releaseDate: "2026-01-01T00:00:00Z", licenses: [{ licenseId: "MPL-2.0", isOsiApproved: true, isDeprecatedLicenseId: false }] };
  write("spdx.json", JSON.stringify(spdx));
  const script = path.join(root, "scripts/hub/update-osi-licenses.mjs");
  const listFile = path.join(root, "scripts/hub/data/osi-approved-licenses.json");
  const before = readFileSync(listFile, "utf8");
  let failure;
  try {
    execFileSync("node", [script, "--root", dir, path.join(dir, "spdx.json")], { stdio: "pipe", encoding: "utf8" });
  } catch (error) { failure = error; }
  assert.ok(failure, "the refresh is refused");
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /would drop .*EPL-2\.0.*Zlib/);
  assert.match(failure.stderr, /no changes written/);
  assert.equal(readFileSync(listFile, "utf8"), before);
});

test("the OSI list is part of the tooling identity", t => {
  const copy = mkdtempSync(path.join(tmpdir(), "hub-tooling-"));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  mkdirSync(path.join(copy, "scripts"));
  cpSync(path.join(root, "scripts/hub"), path.join(copy, "scripts/hub"), { recursive: true });
  cpSync(path.join(root, "package-lock.json"), path.join(copy, "package-lock.json"));
  assert.ok(!existsSync(path.join(root, "data/hub/osi-approved-licenses.json")), "no list outside the hashed scripts tree");
  const file = path.join(copy, "scripts/hub/data/osi-approved-licenses.json");
  const engine = { fixture: true };
  const before = toolingIdentity(copy, engine);
  const list = JSON.parse(readFileSync(file, "utf8"));
  list.ids = list.ids.filter(id => id !== "Zlib");
  writeFileSync(file, serialize(list));
  const after = toolingIdentity(copy, engine);
  assert.notEqual(after.scripts_tree, before.scripts_tree);
});

test("preflight refuses a non-default license on an official bundle listing", t => {
  const official = license => {
    const fixture = JSON.parse(readFileSync(path.join(root, "test/hub-fixtures/listing.json"), "utf8"));
    delete fixture.learn_page;
    delete fixture.evidence.artifact;
    const listing = Object.assign(fixture, { type: "bundle", id: "pipelock-community", bundle_name: "pipelock-community", license, bundle_sha256: "a".repeat(64), signer_fingerprint: "b".repeat(64) });
    return { "hub/listings/bundles/pipelock-community.yaml": stringify(listing) };
  };
  const check = (license, ...approvals) => {
    const { directory, commit } = rules(t);
    const base = commit(approvals.length ? { "hub/license-approvals.yaml": approvalsFile(...approvals) } : { "hub/README.md": "Guide.\n" });
    return preflightContribution({ repository: directory, base, head: commit(official(license)), site: root });
  };
  // Approvals never apply to the official path, which generation serves without consulting them.
  for (const [license, approvals] of [["MPL-2.0", []], ["GPL-3.0", []], ["Unknown-1.0", []], ["MPL-2.0", [{ ...entry, listing: "acme/pipelock-community" }]]]) {
    const report = check(license, ...approvals);
    assert.equal(report.verdict, "REFUSED", license);
    assert.equal(failed(report), "source-parse", license);
    assert.match(report.steps["source-parse"].evidence, /official bundle listing .*default license/, license);
  }
  assert.equal(check("MIT").verdict, "LOCAL-ELIGIBLE");
});
