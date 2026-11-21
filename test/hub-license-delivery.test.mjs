import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readLicenseMaterial, licenseRecord, licenseDownloads, officialRoute } from "../scripts/hub/license-delivery.mjs";
import { routeManifest } from "../scripts/hub/route-manifest.mjs";
import { stageCatalogAssets } from "../scripts/hub/catalog-assets.mjs";
import { sha256 } from "../scripts/hub/evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
const schemaBytes = readFileSync(path.join(root, "scripts/hub/schema/listing-v1.json"));
const mit = "MIT License\n\nCopyright (c) 2026 Example Maintainer\n\n" + readFileSync(path.join(root, "scripts/hub/licenses/MIT.txt"), "utf8");
// The synchronized Rules license is a real Apache-2.0 producer text.
const apache = readFileSync(path.join(root, "static/rules/pipelock-community/license.txt"), "utf8");
const route = "/hub/community/example/example-bundle/";

function bundle(t, files, bundleText = "format_version: 2\nname: example-bundle\nlicense: \"MIT\"\n") {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-license-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, "bundle.yaml"), bundleText);
  writeFileSync(path.join(dir, "bundle.yaml.sig"), "signature\n");
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  const signed = { bytes: readFileSync(path.join(dir, "bundle.yaml")), signature: readFileSync(path.join(dir, "bundle.yaml.sig")) };
  return { dir, signed };
}

test("license material is read beside the signed pair without changing it", t => {
  const { dir, signed } = bundle(t, { LICENSE: mit });
  const material = readLicenseMaterial(dir, "MIT", signed);
  assert.equal(material.license.text, mit);
  assert.deepEqual(material.notices, []);
  assert.deepEqual(readFileSync(path.join(dir, "bundle.yaml")), signed.bytes);
  const record = licenseRecord(route, material);
  assert.deepEqual(record.license, { name: "LICENSE", route: route + "license.txt", text: mit, sha256: sha256(Buffer.from(mit)) });
  assert.deepEqual(licenseDownloads(route, material).map(file => file.route), [route + "license.txt"]);

  const notice = "Example Rules\nCopyright 2026 Example Maintainer\n";
  const withNotice = bundle(t, { LICENSE: apache, NOTICE: notice }, "name: example-bundle\nlicense: Apache-2.0\n");
  const delivered = readLicenseMaterial(withNotice.dir, "Apache-2.0", withNotice.signed);
  assert.deepEqual(delivered.notices.map(file => [file.name, file.text]), [["NOTICE", notice]]);
  assert.deepEqual(licenseDownloads(route, delivered).map(file => file.route), [route + "license.txt", route + "notice.txt"]);
});

test("license delivery fails closed on missing, mismatched or ambiguous material", t => {
  const refuse = (files, license, error, bundleText) => {
    const { dir, signed } = bundle(t, files, bundleText);
    assert.throws(() => readLicenseMaterial(dir, license, signed), error);
  };
  refuse({}, "MIT", /license text missing/);
  refuse({ LICENSE: " \n\t\n" }, "MIT", /license text missing/);
  refuse({ LICENSE: apache }, "MIT", /does not match the declared license/);
  refuse({ LICENSE: mit }, "Apache-2.0", /does not match the declared license/, "license: Apache-2.0\n");
  refuse({ LICENSE: mit.replace("Copyright (c) 2026 Example Maintainer\n", "") }, "MIT", /required copyright notice missing/);
  refuse({ LICENSE: mit, NOTICE: "" }, "MIT", /notice text missing/);
  refuse({ LICENSE: mit, "LICENSE.md": mit }, "MIT", /unrecognized license or notice file/);
  refuse({ LICENSE: mit, "NOTICE.txt": "x" }, "MIT", /unrecognized license or notice file/);
  refuse({ LICENSE: mit, COPYING: mit }, "MIT", /unrecognized license or notice file/);
  refuse({ LICENSE: Buffer.from([0xff, 0xfe, 0x41]) }, "MIT", /UTF-8/);
  refuse({ LICENSE: mit + "\u0000" }, "MIT", /control characters/);
  refuse({ LICENSE: mit }, "MIT", /differs from the signed bundle/, "license: Apache-2.0\n");
  refuse({ LICENSE: mit }, "GPL-3.0-only", /unsupported listing license/);

  const { dir, signed } = bundle(t, { LICENSE: mit });
  const changed = { ...signed, bytes: Buffer.from("other signed bytes\n") };
  assert.throws(() => readLicenseMaterial(dir, "MIT", changed), /would alter signed bytes/);
});

test("served directories deliver license.txt and notice.txt and refuse missing material", t => {
  const notice = "Example Rules\nCopyright 2026 Example Maintainer\n";
  const { dir, signed } = bundle(t, { "license.txt": mit, "notice.txt": notice });
  const material = readLicenseMaterial(dir, "MIT", signed, { served: true });
  assert.deepEqual([material.license.name, material.license.text], ["LICENSE", mit]);
  assert.deepEqual(material.notices.map(file => file.text), [notice]);
  assert.throws(() => readLicenseMaterial(dir, "MIT", signed), /unrecognized license or notice file/);
  const official = officialRoute("example-bundle");
  assert.equal(licenseRecord(official, material).license.route, "/rules/example-bundle/license.txt");

  const missing = bundle(t, { "notice.txt": notice });
  assert.throws(() => readLicenseMaterial(missing.dir, "MIT", missing.signed, { served: true }), /license text missing/);
  const sourceNames = bundle(t, { LICENSE: mit });
  assert.throws(() => readLicenseMaterial(sourceNames.dir, "MIT", sourceNames.signed, { served: true }), /unrecognized license or notice file/);
});

test("official route manifests serve license files from the registry path", () => {
  const material = { license: { name: "LICENSE", bytes: Buffer.from(mit), text: mit, sha256: sha256(Buffer.from(mit)) }, notices: [] };
  const official = {
    ...communityRecord(), badge: "official", publisher_id: undefined,
    reader: { declared: [], policies: { stock: { loaded: [] } } },
  };
  assert.throws(() => routeManifest({ records: [official], policies: [], schemaBytes }), /license text missing/);
  const directory = officialRoute("example-bundle");
  assert.throws(() => routeManifest({ records: [{ ...official, license_material: licenseRecord(route, material) }], policies: [], schemaBytes }), /unexpected license delivery route/);
  const manifest = routeManifest({ records: [{ ...official, license_material: licenseRecord(directory, material) }], policies: [], schemaBytes });
  const entry = manifest.entries.find(item => item.route === directory + "license.txt");
  assert.deepEqual([entry.kind, entry.ownership, entry.sha256], ["license-download", "official-registry", sha256(Buffer.from(mit))]);
});

test("retained license downloads keep their kind in the route manifest", () => {
  const retainedDownloads = [
    { route: route + "bundle.yaml", sha256: "a".repeat(64) },
    { route: route + "license.txt", sha256: "b".repeat(64), kind: "license-download" },
  ];
  const manifest = routeManifest({ records: [], retainedDownloads, policies: [], schemaBytes });
  assert.deepEqual(manifest.entries.filter(entry => entry.route.startsWith(route)).map(entry => [entry.kind, entry.readability]),
    [["retained-download", "expected-block"], ["license-download", "readable"]]);
  assert.throws(() => routeManifest({ records: [], retainedDownloads: [{ ...retainedDownloads[1], kind: "listing" }], policies: [], schemaBytes }), /unexpected retained download kind/);
});

test("a linked license file is refused", t => {
  const { dir, signed } = bundle(t, {});
  const target = path.join(dir, "elsewhere.txt");
  writeFileSync(target, mit);
  try { symlinkSync(target, path.join(dir, "LICENSE")); } catch { t.skip("symbolic links unavailable"); return; }
  assert.throws(() => readLicenseMaterial(dir, "MIT", signed), /regular file/);
});

function communityRecord(material) {
  const bytes = Buffer.from("signed bundle\n"), signature = Buffer.from("signature\n");
  return {
    listing: { id: "example-bundle", type: "bundle", bundle_name: "example-bundle" },
    badge: "community", publisher_id: "example", facts: {},
    bundle_sha256: sha256(bytes), signature_sha256: sha256(signature),
    ...(material ? { license_material: material } : {}),
    pair: { bytes, signature },
  };
}

test("route manifest and staged assets deliver license files next to unchanged signed bytes", t => {
  assert.throws(() => routeManifest({ records: [communityRecord()], policies: [], schemaBytes }), /license text missing/);
  const notice = "Copyright 2026 Example Maintainer\n";
  const material = {
    license: { name: "LICENSE", bytes: Buffer.from(mit), text: mit, sha256: sha256(Buffer.from(mit)) },
    notices: [{ name: "NOTICE", bytes: Buffer.from(notice), text: notice, sha256: sha256(Buffer.from(notice)) }],
  };
  const record = communityRecord(licenseRecord(route, material));
  const manifest = routeManifest({ records: [record], policies: [], schemaBytes });
  const delivered = manifest.entries.filter(entry => entry.listing_id === "example-bundle" && entry.kind !== "listing");
  assert.deepEqual(delivered.map(entry => [entry.route, entry.kind]), [
    [route + "bundle.yaml", "bundle-download"],
    [route + "bundle.yaml.sig", "bundle-download"],
    [route + "license.txt", "license-download"],
    [route + "notice.txt", "notice-download"],
  ]);
  const moved = communityRecord({ ...licenseRecord(route, material), license: { ...licenseRecord(route, material).license, route: "/hub/elsewhere/LICENSE" } });
  assert.throws(() => routeManifest({ records: [moved], policies: [], schemaBytes }), /unexpected license delivery route/);

  const scratch = mkdtempSync(path.join(tmpdir(), "hub-license-assets-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const pairFiles = [{ route: route + "bundle.yaml", bytes: record.pair.bytes }, { route: route + "bundle.yaml.sig", bytes: record.pair.signature }];
  const downloads = [...pairFiles, ...licenseDownloads(route, material)];
  const staged = stageCatalogAssets(scratch, { entries: manifest.entries }, downloads);
  for (const { route: file, bytes } of downloads) assert.deepEqual(readFileSync(path.join(staged, file.slice(1))), bytes);
  assert.deepEqual(readdirSync(path.join(staged, route.slice(1))).sort(), ["bundle.yaml", "bundle.yaml.sig", "license.txt", "notice.txt"]);

  const withoutLicense = manifest.entries.filter(entry => !entry.route.endsWith("/license.txt"));
  assert.throws(() => stageCatalogAssets(scratch, { entries: withoutLicense }, downloads.filter(file => !file.route.endsWith("/license.txt"))), /requires license delivery/);
  const orphan = manifest.entries.filter(entry => entry.kind !== "bundle-download");
  assert.throws(() => stageCatalogAssets(scratch, { entries: orphan }, downloads), /must accompany a served bundle/);
  assert.throws(() => stageCatalogAssets(scratch, manifest, downloads.filter(file => !file.route.endsWith("/notice.txt"))), /download missing/);
  const swapped = manifest.entries.map(entry => entry.route.endsWith("/notice.txt") ? { ...entry, kind: "license-download" } : entry);
  assert.throws(() => stageCatalogAssets(scratch, { entries: swapped }, downloads), /must accompany a served bundle/);
});


test("complete upstream licenses cannot substitute terms mentioning copyright for attribution", t => {
  // Real producers: license files shipped by the locked dependencies.
  for (const [dependency, license] of [["pg", "MIT"], ["yaml", "ISC"]]) {
    const text = readFileSync(path.join(root, "node_modules", dependency, "LICENSE"), "utf8");
    assert.match(text, /^Copyright .+$/m);
    const { dir, signed } = bundle(t, { LICENSE: text }, "license: " + license + "\n");
    assert.doesNotThrow(() => readLicenseMaterial(dir, license, signed));
    writeFileSync(path.join(dir, "LICENSE"), text.replace(/^Copyright .+\r?\n/m, ""));
    assert.throws(() => readLicenseMaterial(dir, license, signed), /required copyright notice missing/);
  }
});


test("license and notice refuse C1 controls and oversized delivery text", t => {
  for (const name of ["LICENSE", "NOTICE"]) {
    const { dir, signed } = bundle(t, { LICENSE: mit, ...(name === "NOTICE" ? { NOTICE: "Attribution\n" } : {}) });
    for (let point = 0x80; point <= 0x9f; point++) {
      writeFileSync(path.join(dir, name), mit + String.fromCodePoint(point));
      assert.throws(() => readLicenseMaterial(dir, "MIT", signed), /control characters/, name + " U+" + point.toString(16));
    }
    writeFileSync(path.join(dir, name), mit + "x".repeat(64 * 1024));
    assert.throws(() => readLicenseMaterial(dir, "MIT", signed), /byte limit/);
  }
});

test("license text must be the complete body of the declared license", t => {
  const template = id => readFileSync(path.join(root, "scripts/hub/licenses", id + ".txt"), "utf8");
  const dependency = name => readFileSync(path.join(root, "node_modules", name, "LICENSE"), "utf8");
  const fill = (id, holder) => template(id).replaceAll("{{holder}}", holder).replaceAll("{{its}}", "its").replaceAll("{{and-or}}", "and/or");
  const accepted = [
    // Real producer texts: the synchronized Rules license and locked dependencies.
    ["Apache-2.0", apache],
    ["MIT", dependency("pg")],
    ["MIT", dependency("xtend")],
    ["ISC", dependency("yaml")],
    ["ISC", dependency("pg-int8")],
    ["BSD-3-Clause", dependency("smol-toml")],
    // Variable parts the SPDX templates mark as replaceable.
    ["Apache-2.0", apache.slice(0, apache.indexOf("END OF TERMS AND CONDITIONS") + 27) + "\n"],
    ["BSD-2-Clause", "BSD 2-Clause License\n\nCopyright (c) 2026, Example\nAll rights reserved.\n\n" + fill("BSD-2-Clause", "THE COPYRIGHT HOLDERS AND CONTRIBUTORS")],
    ["BSD-3-Clause", "Copyright (c) 2026 Example Org\n\n" + fill("BSD-3-Clause", "Example Org").replace(/^(\d)\. /gm, "* ")],
    ["ISC", "Copyright (c) 2026 Example\n\n" + template("ISC").replace("{{and-or}}", "and").replaceAll("{{holder}}", "THE AUTHOR")],
    ["0BSD", fill("0BSD", "THE AUTHOR")],
    ["0BSD", "Copyright (C) 2026 by Example\n\n" + fill("0BSD", "THE AUTHOR")],
    ["CC0-1.0", template("CC0-1.0")],
  ];
  for (const [license, text] of accepted) {
    const { dir, signed } = bundle(t, { LICENSE: text }, "license: " + license + "\n");
    assert.doesNotThrow(() => readLicenseMaterial(dir, license, signed), license);
  }

  const bodyWithout = (text, phrase) => { assert.ok(text.includes(phrase), phrase); return text.replace(phrase, ""); };
  const refused = [
    // Name-only stubs carry none of the terms.
    ["Apache-2.0", "Apache License\nVersion 2.0\n"],
    ["Apache-2.0", "                                 Apache License\n                           Version 2.0, January 2004\n"],
    ["MIT", "MIT License\n\nCopyright (c) 2026 Example\n\nPermission is hereby granted, free of charge.\n"],
    ["ISC", "ISC License\n\nCopyright (c) 2026 Example\n"],
    ["BSD-2-Clause", "Copyright (c) 2026 Example\n\nRedistribution and use in source and binary forms, with or without modification, are permitted.\n"],
    ["BSD-3-Clause", "Copyright (c) 2026 Example\n\nRedistribution and use in source and binary forms. Neither the name of Example.\n"],
    ["0BSD", "Permission to use, copy, modify, and/or distribute this software for any purpose\n"],
    ["CC0-1.0", "CC0 1.0 Universal\n"],
    // Removed, added or substituted terms.
    ["Apache-2.0", bodyWithout(apache, " shall terminate\n      as of the date such litigation is filed")],
    ["Apache-2.0", apache + "\nAdditional term: commercial use requires a separate license.\n"],
    ["MIT", bodyWithout(mit, " AND NONINFRINGEMENT")],
    ["MIT", mit + "\nThe Software shall be used for Good, not Evil.\n"],
    ["BSD-3-Clause", "Copyright (c) 2026 Example\n\n" + fill("BSD-2-Clause", "Example")],
    ["BSD-2-Clause", "Copyright (c) 2026 Example\n\n" + fill("BSD-3-Clause", "Example")],
    ["ISC", "Copyright (c) 2026 Example\n\n" + fill("0BSD", "THE AUTHOR")],
    ["0BSD", "Copyright (c) 2026 Example\n\n" + fill("ISC", "THE AUTHOR")],
    // Text before the body that is not a title or copyright line.
    ["MIT", "Example preamble that adds a restriction.\n\n" + mit],
    ["CC0-1.0", "Copyright (c) 2026 Example\n\n" + template("CC0-1.0")],
  ];
  for (const [license, text] of refused) {
    const { dir, signed } = bundle(t, { LICENSE: text }, "license: " + license + "\n");
    assert.throws(() => readLicenseMaterial(dir, license, signed), /does not match the declared license/, license + ": " + text.slice(0, 60));
  }
});
