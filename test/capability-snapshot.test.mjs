import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadCapabilityDetailContents,
  resolveCapabilitySource,
  verifyCapabilityDetailState,
} from "../scripts/resolve-capability-source.mjs";
import {
  verifyCapabilityReferences,
  verifyCapabilitySourceCorrections,
  verifyCapabilitySourceReferences,
} from "../scripts/capability-references.mjs";
import { parseCapabilityFamilyMap } from "../scripts/capability-families.mjs";
import {
  verifyCapabilitySourceRecords,
  verifyGoSymbol,
} from "../scripts/capability-source-records.mjs";
import { verifyRobotsPolicy } from "../scripts/html-robots.mjs";
import {
  buildDetailRoutes,
  buildSnapshot,
  loadCapabilityFamilyConfig,
} from "../scripts/sync-pipelock-capabilities.mjs";
import { verifyDevelopmentSnapshot, verifyReleaseSnapshot } from "../scripts/verify-capability-source.mjs";

const snapshot = JSON.parse(readFileSync(new URL("../data/pipelock_capabilities.json", import.meta.url), "utf8"));
const content = readFileSync(new URL("../content/capabilities.md", import.meta.url), "utf8");
const config = readFileSync(new URL("../hugo.toml", import.meta.url), "utf8");
// The page owns the release target and hugo.toml owns the site version. Derive
// both here so these tests construct their own mismatch: relying on the real
// files disagreeing made them pass only while the site lagged the page, and
// they went vacuous the moment a release bumped hugo.toml to match.
const pageReleaseTarget = /^release_target: "([^"]+)"$/m.exec(content)[1];
const mismatchedConfig = config.replace(/^pipelock_version = "[^"]+"$/m, 'pipelock_version = "0.0.1"');
const home = readFileSync(new URL("../themes/pipelab/layouts/index.html", import.meta.url), "utf8");
const auditWorkflow = readFileSync(new URL("../.github/workflows/site-audit.yml", import.meta.url), "utf8");
const capabilityResolver = readFileSync(new URL("../scripts/resolve-capability-source.mjs", import.meta.url), "utf8");
const capabilityVerifier = readFileSync(new URL("../scripts/verify-capability-source.mjs", import.meta.url), "utf8");
const capabilityTemplate = readFileSync(new URL("../themes/pipelab/layouts/capabilities/single.html", import.meta.url), "utf8");
const capabilityStyles = readFileSync(new URL("../themes/pipelab/assets/scss/_capabilities.scss", import.meta.url), "utf8");
const capabilityFilter = readFileSync(new URL("../themes/pipelab/assets/js/capabilities-filter.js", import.meta.url), "utf8");
const capabilityFamilies = parseCapabilityFamilyMap(
  readFileSync(new URL("../data/pipelock_capability_families.json", import.meta.url), "utf8"),
);
const capabilityDetailTemplate = readFileSync(
  new URL("../themes/pipelab/layouts/capability-detail/single.html", import.meta.url),
  "utf8",
);
const capabilityReferences = JSON.parse(
  readFileSync(new URL("../data/pipelock_capability_references.json", import.meta.url), "utf8"),
);
const publishContent = (value) => value
  .replace(/^draft: true\n/m, "")
  .replace(/^robots: "noindex, nofollow"\n/m, "");
const draftContent = (value) => /^draft: true$/m.test(value)
  ? value
  : value.replace(/^---\n/, '---\ndraft: true\nrobots: "noindex, nofollow"\n');

test("capability snapshot keeps complete provenance and one classification per row", () => {
  assert.equal(snapshot.schema_version, 1);
  assert.match(snapshot.source.commit, /^[0-9a-f]{40}$/);
  assert.match(snapshot.source.manifest_sha256, /^[0-9a-f]{64}$/);
  assert.equal(snapshot.capabilities.length, 26);

  const ids = new Set(snapshot.capabilities.map((capability) => capability.id));
  assert.equal(ids.size, snapshot.capabilities.length);
  assert.deepEqual(
    new Set(snapshot.capabilities.map((capability) => capability.group)),
    new Set(["boundary", "enforcement", "evidence", "coordination"]),
  );
  for (const capability of snapshot.capabilities) {
    assert.ok(capability.name);
    assert.ok(capability.summary);
    assert.ok(capability.tier);
    assert.ok(capability.operator_entry_point?.kind);
    assert.ok(capability.operator_entry_point?.value);
    assert.ok(capability.operator_entry_point?.source?.file);
    assert.ok(capability.operator_entry_point?.source?.symbol);
    assert.ok(capability.implementation?.file);
    assert.ok(capability.implementation?.symbol);
    assert.equal(capability.detail?.path, `/capabilities/${capability.id}/`);
  }
});

test("every capability has one stable documentation route", () => {
  const routes = buildDetailRoutes(capabilityFamilies.families);
  const inventoryIds = new Set(snapshot.capabilities.map((capability) => capability.id));

  assert.equal(routes.size, snapshot.capabilities.length);
  assert.deepEqual(new Set(routes.keys()), inventoryIds);
  assert.match(capabilityTemplate, /where site\.RegularPages "Params\.capability" \.id/);
  assert.match(capabilityTemplate, /if ne \(len \$detailPages\) 1/);
  assert.match(capabilityTemplate, /href="{{ \$detailPage\.RelPermalink }}"/);
  assert.match(capabilityDetailTemplate, /\$capability\.operator_entry_point\.value/);
  assert.match(capabilityDetailTemplate, /\$capability\.implementation\.file/);
  assert.match(capabilityDetailTemplate, /with \$capability\.availability/);
  assert.match(capabilityDetailTemplate, /capdoc-nav/);
  assert.match(capabilityDetailTemplate, /capdoc-reference-list/);

  for (const family of capabilityFamilies.families) {
    for (const capabilityId of family.capabilities) {
      const route = routes.get(capabilityId);
      const detailContent = readFileSync(
        new URL(`../content/capability-${capabilityId}.md`, import.meta.url),
        "utf8",
      );
      assert.equal(route.family, family.id);
      assert.equal(route.path, `/capabilities/${capabilityId}/`);
      assert.match(detailContent, new RegExp(`^capability: "${capabilityId}"$`, "m"));
      assert.match(detailContent, new RegExp(`^url: "/capabilities/${capabilityId}/"$`, "m"));
      assert.ok(capabilityReferences.capabilities[capabilityId]?.length > 0);
    }
  }
});

test("capability ids cannot escape documentation routes or content paths", () => {
  const maliciousFamilies = [{ id: "boundary", capabilities: ["../private"] }];

  assert.throws(() => buildDetailRoutes(maliciousFamilies), /lowercase URL-safe slug/);
  assert.throws(() => loadCapabilityDetailContents(maliciousFamilies), /lowercase URL-safe slug/);
  assert.throws(
    () => buildSnapshot(
      Buffer.from(JSON.stringify({
        schema_version: 1,
        capabilities: [{ ...snapshot.capabilities[0], id: "nested/path" }],
      })),
      { ref: "origin/main", commit: "a".repeat(40) },
      [{ id: "boundary", capabilities: ["network-mediation"] }],
    ),
    /lowercase URL-safe slug/,
  );
});

test("capability family map rejects unsupported and malformed roots", () => {
  assert.throws(
    () => loadCapabilityFamilyConfig({ ...capabilityFamilies, schema_version: 2 }),
    /schema version is unsupported/,
  );
  assert.throws(
    () => parseCapabilityFamilyMap({ schema_version: 1, families: "not-an-array" }),
    /must contain families/,
  );
  assert.throws(
    () => parseCapabilityFamilyMap({
      schema_version: 1,
      families: [{ ...capabilityFamilies.families[0], description: "" }],
    }),
    /description must be a non-empty trimmed string/,
  );

  const duplicateFamily = structuredClone(capabilityFamilies);
  duplicateFamily.families.push(structuredClone(duplicateFamily.families[0]));
  assert.throws(() => parseCapabilityFamilyMap(duplicateFamily), /duplicate capability family/);

  const duplicateCapability = structuredClone(capabilityFamilies);
  duplicateCapability.families[1].capabilities.push(duplicateCapability.families[0].capabilities[0]);
  assert.throws(() => parseCapabilityFamilyMap(duplicateCapability), /belongs to more than one family/);
});

test("pinned Go provenance ignores comments and literals", () => {
  const realSource = [
    "package receipt",
    "",
    "func (e *Emitter) Emit(opts EmitOpts) error { return nil }",
    "func Entry() {}",
    "type Config struct{}",
    "",
  ].join("\n");
  assert.doesNotThrow(() => verifyGoSymbol(realSource, "(*receipt.Emitter).Emit"));
  assert.doesNotThrow(() => verifyGoSymbol(realSource, "Entry"));
  assert.doesNotThrow(() => verifyGoSymbol(realSource, "Config"));

  const decoySource = [
    "package receipt",
    "/* func (e *Emitter) Emit(opts EmitOpts) error { return nil } */",
    "var raw = `func (e *Emitter) Emit(opts EmitOpts) error { return nil }`",
    "var quoted = \"func (e *Emitter) Emit(opts EmitOpts) error { return nil }\"",
    "",
  ].join("\n");
  assert.throws(() => verifyGoSymbol(decoySource, "(*receipt.Emitter).Emit"), /does not match/);
});

test("pinned Go provenance matches exact Unicode-safe and generic declarations", () => {
  const genericSource = [
    "package receipt",
    "type Config[T any] struct{}",
    "type Configé struct{}",
    "func Entry[T any](value T) {}",
    "func (e *Emitter[T]) Emit(value T) {}",
    "",
  ].join("\n");
  assert.doesNotThrow(() => verifyGoSymbol(genericSource, "Config"));
  assert.doesNotThrow(() => verifyGoSymbol(genericSource, "Entry"));
  assert.doesNotThrow(() => verifyGoSymbol(genericSource, "(*receipt.Emitter).Emit"));
  assert.throws(
    () => verifyGoSymbol("package receipt\ntype Configé struct{}\n", "Config"),
    /does not match/,
  );
  assert.throws(
    () => verifyGoSymbol("package receipt\nvar callback func(Emitter) Emit(int)\n", "(*receipt.Emitter).Emit"),
    /does not match/,
  );
  assert.throws(
    () => verifyGoSymbol("package receipt\nvar (\n\tcallback func(Emitter) Emit(int)\n)\n", "(*receipt.Emitter).Emit"),
    /does not match/,
  );
  assert.throws(
    () => verifyGoSymbol("package receipt\nvar callback =\n\tfunc(Emitter) Emit(int) { return 0 }\n", "(*receipt.Emitter).Emit"),
    /does not match/,
  );
});

test("rendered robots policy uses complete directives and semantic attributes", () => {
  assert.doesNotThrow(() => verifyRobotsPolicy(
    "<!-- <meta name='robots' content='index'> --><div data-x=\"<meta name='robots' content='index'>\"></div><META content='nofollow, NOINDEX' data-note='noindex' name='ROBOTS'>",
    true,
    "draft fixture",
  ));
  assert.throws(
    () => verifyRobotsPolicy('<meta name="robots" content="notnoindex, nofollow">', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<meta content="index, follow" name="robots">', false, "published fixture"),
    /must not render a robots override/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<meta name="rob&#111;ts" content="noindex, nofollow">', false, "published fixture"),
    /must not render a robots override/,
  );
  assert.doesNotThrow(() => verifyRobotsPolicy(
    '<head><meta name="rob&#111ts" content="no&#105;ndex, nofollow"></head>',
    true,
    "draft fixture",
  ));
  for (const element of ["iframe", "noembed", "noframes", "noscript", "script", "style", "textarea", "title", "xmp"]) {
    assert.throws(
      () => verifyRobotsPolicy(`<${element}><meta name="robots" content="noindex, nofollow"></${element}>`, true, "draft fixture"),
      /must include noindex and nofollow/,
    );
  }
  assert.throws(
    () => verifyRobotsPolicy('<plaintext><meta name="robots" content="noindex, nofollow">', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<template><meta name="robots" content="noindex, nofollow"></template>', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<head></head><body><meta name="robots" content="noindex, nofollow"></body>', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<head><div><meta name="robots" content="noindex, nofollow"></div></head>', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<head>body text<meta name="robots" content="noindex, nofollow"></head>', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
  assert.throws(
    () => verifyRobotsPolicy('<head><![CDATA[<meta name="robots" content="noindex,nofollow">]]></head>', true, "draft fixture"),
    /must include noindex and nofollow/,
  );
});

test("ordinary capability provenance must exist in the pinned tree", () => {
  const fixture = {
    capabilities: [{
      id: "fixture",
      operator_entry_point: {
        kind: "command",
        value: "pipelock entry",
        source: { file: "internal/entry.go", symbol: "Entry" },
      },
      implementation: { file: "internal/implementation.go", symbol: "Config" },
    }],
  };
  const sources = new Map([
    ["internal/entry.go", "package internal\nfunc Entry() {}\n"],
    ["internal/implementation.go", "package internal\ntype Config struct{}\n"],
  ]);
  assert.doesNotThrow(() => verifyCapabilitySourceRecords(fixture, (sourcePath) => sources.get(sourcePath)));

  assert.throws(
    () => verifyCapabilitySourceRecords(fixture, (sourcePath) => {
      if (sourcePath === "internal/entry.go") throw new Error("missing");
      return sources.get(sourcePath);
    }),
    /source file is absent from the pinned commit/,
  );

  const staleSymbol = structuredClone(fixture);
  staleSymbol.capabilities[0].implementation.symbol = "MissingType";
  assert.throws(
    () => verifyCapabilitySourceRecords(staleSymbol, (sourcePath) => sources.get(sourcePath)),
    /implementation symbol does not match/,
  );

  const nonGoRecord = structuredClone(fixture);
  nonGoRecord.capabilities[0].implementation.file = "internal/implementation.txt";
  assert.throws(
    () => verifyCapabilitySourceRecords(nonGoRecord, (sourcePath) => sources.get(sourcePath)),
    /must name a Go source file/,
  );

});

test("signed receipt docs distinguish the tagged manifest record from runtime signing", () => {
  const receiptCapability = snapshot.capabilities.find((capability) => capability.id === "signed-action-receipts");
  const sourceCorrection = capabilityReferences.source_corrections["signed-action-receipts"];

  assert.equal(receiptCapability.implementation.file, "internal/cli/signing/receipt.go");
  assert.equal(receiptCapability.implementation.symbol, "VerifyReceiptCmd");
  assert.equal(sourceCorrection.path, "internal/receipt/emitter.go");
  assert.equal(sourceCorrection.symbol, "(*receipt.Emitter).Emit");
  assert.equal(sourceCorrection.manifest_path, receiptCapability.implementation.file);
  assert.equal(sourceCorrection.manifest_symbol, receiptCapability.implementation.symbol);
  assert.match(sourceCorrection.text, /Runtime receipt creation and signing/);
  assert.doesNotMatch(sourceCorrection.text, /\bv?\d+\.\d+\.\d+\b/);
  assert.doesNotThrow(() => verifyCapabilityReferences(snapshot, capabilityReferences));
  const correctionSources = new Map([
    [sourceCorrection.path, "package receipt\n\nfunc (e *Emitter) Emit(opts EmitOpts) error { return nil }\n"],
    ["enterprise/cli/dashboard_exemption.go", "package cli\n\nfunc exemptionListCmd() {}\n"],
    ["enterprise/cli/dashboard_legal_hold.go", "package cli\n\nfunc legalHoldListCmd() {}\n"],
  ]);
  assert.doesNotThrow(() => verifyCapabilitySourceCorrections(snapshot, capabilityReferences, (sourcePath) => {
    assert.ok(correctionSources.has(sourcePath));
    return correctionSources.get(sourcePath);
  }));
  for (const [capabilityId, symbol] of [
    ["exemption-lifecycle-records", "exemptionListCmd"],
    ["legal-hold-metadata", "legalHoldListCmd"],
  ]) {
    const capability = snapshot.capabilities.find((entry) => entry.id === capabilityId);
    const correction = capabilityReferences.source_corrections[capabilityId];
    assert.equal(correction.manifest_path, capability.implementation.file);
    assert.equal(correction.manifest_symbol, capability.implementation.symbol);
    assert.equal(correction.symbol, symbol);
  }
  assert.match(capabilityDetailTemplate, /pipelock_capability_references\.source_corrections/);
  assert.match(capabilityDetailTemplate, /capdoc-source-note/);
});

test("capability reference records reject unsafe paths and stale source corrections", () => {
  const unsafeReferences = structuredClone(capabilityReferences);
  unsafeReferences.capabilities["network-mediation"][0].path = "//external.example/escape";
  assert.throws(() => verifyCapabilityReferences(snapshot, unsafeReferences), /absolute site path/);

  for (const suffix of ["?next=/escape", "#different-section"]) {
    const delimitedSiteReference = structuredClone(capabilityReferences);
    delimitedSiteReference.capabilities["network-mediation"][0].path = `/learn/secure-ai-agent-deployment/${suffix}`;
    assert.throws(() => verifyCapabilityReferences(snapshot, delimitedSiteReference), /stay within pipelab.org/);
  }

  for (const suffix of ["?plain=1", "#L20", "\u0000hidden"]) {
    const delimitedSourceReference = structuredClone(capabilityReferences);
    delimitedSourceReference.capabilities["network-mediation"][1].path = `docs/guides/transport-modes.md${suffix}`;
    assert.throws(() => verifyCapabilityReferences(snapshot, delimitedSourceReference), /normalized repository-relative path/);
  }

  const staleManifestNote = structuredClone(capabilityReferences);
  staleManifestNote.source_corrections["signed-action-receipts"].manifest_symbol = "DifferentSymbol";
  assert.throws(() => verifyCapabilityReferences(snapshot, staleManifestNote), /no longer matches/);

  const noCorrections = structuredClone(capabilityReferences);
  noCorrections.source_corrections = {};
  assert.doesNotThrow(() => verifyCapabilityReferences(snapshot, noCorrections));

  assert.throws(
    () => verifyCapabilitySourceCorrections(snapshot, capabilityReferences, () => {
      throw new Error("missing path");
    }),
    /absent from the pinned commit/,
  );

  const mismatchedSymbol = structuredClone(capabilityReferences);
  mismatchedSymbol.source_corrections["signed-action-receipts"].symbol = "(*receipt.Emitter).Other";
  assert.throws(
    () => verifyCapabilitySourceCorrections(
      snapshot,
      mismatchedSymbol,
      () => "package receipt\n\nfunc (e *Emitter) Emit(opts EmitOpts) error { return nil }\n",
    ),
    /symbol does not match/,
  );

  assert.throws(
    () => verifyCapabilitySourceCorrections(
      snapshot,
      capabilityReferences,
      () => "package receipt\n\n// func (e *Emitter) Emit( is not an implementation\n",
    ),
    /symbol does not match/,
  );

  const nonGoCorrection = structuredClone(capabilityReferences);
  nonGoCorrection.source_corrections["signed-action-receipts"].path = "internal/receipt/emitter.md";
  assert.throws(
    () => verifyCapabilitySourceCorrections(snapshot, nonGoCorrection, () => "package receipt\n"),
    /must name a Go source file/,
  );
});

test("ordinary source references must exist at the pinned commit", () => {
  const sourcePaths = [];
  assert.doesNotThrow(() => verifyCapabilitySourceReferences(
    snapshot,
    capabilityReferences,
    (sourcePath) => {
      sourcePaths.push(sourcePath);
      return Buffer.from("present");
    },
  ));
  assert.ok(sourcePaths.includes("docs/guides/transport-modes.md"));
  assert.ok(sourcePaths.every((sourcePath) => !sourcePath.startsWith("/")));

  assert.throws(
    () => verifyCapabilitySourceReferences(snapshot, capabilityReferences, (sourcePath) => {
      if (sourcePath === "docs/guides/transport-modes.md") throw new Error("missing");
      return Buffer.from("present");
    }),
    /network-mediation reference 1 is absent from the pinned commit/,
  );
});

test("capability export refuses a manifest item without a family destination", () => {
  const manifest = Buffer.from(JSON.stringify({
    schema_version: 1,
    capabilities: snapshot.capabilities,
  }));
  const familiesMissingOne = capabilityFamilies.families.map((family) => ({
    ...family,
    capabilities: family.capabilities.filter((id) => id !== "network-mediation"),
  }));

  assert.throws(
    () => buildSnapshot(
      manifest,
      { ref: "origin/main", commit: "a".repeat(40) },
      familiesMissingOne,
    ),
    /network-mediation has no detail route/,
  );
});

test("buyer tier filters include the capabilities inherited from lower tiers", () => {
  const visibleAt = (tier) => snapshot.capabilities.filter((capability) => capability.access_tiers.includes(tier));
  const free = new Set(visibleAt("free").map((capability) => capability.id));
  const pro = new Set(visibleAt("pro").map((capability) => capability.id));
  const enterprise = new Set(visibleAt("enterprise").map((capability) => capability.id));

  assert.equal(free.size, 15);
  assert.equal(pro.size, 22);
  assert.equal(enterprise.size, 25);
  assert.deepEqual(snapshot.tier_counts, { free: 15, pro: 22, enterprise: 25, assess: 1 });
  for (const id of free) assert.equal(pro.has(id), true, `${id} should remain available in Pro`);
  for (const id of pro) assert.equal(enterprise.has(id), true, `${id} should remain available in Enterprise`);
  assert.equal(visibleAt("assess").length, 1);
});

test("capability controls expose their counts and remain below the sticky site header", () => {
  assert.match(capabilityTemplate, /Availability/);
  assert.match(capabilityTemplate, /Community <span>{{ \$inventory\.tier_counts\.free }}<\/span>/);
  assert.match(capabilityTemplate, /Enterprise <span>{{ \$inventory\.tier_counts\.enterprise }}<\/span>/);
  assert.match(capabilityFilter, /Assess is separate/);
  assert.match(capabilityStyles, /\.capref-controls \{[\s\S]*?position: sticky;[\s\S]*?top: 65px;/);
});

test("capability page cannot publish a development snapshot as a release inventory", () => {
  assert.ok(auditWorkflow.indexOf("- run: npm ci") < auditWorkflow.indexOf("Resolve authoritative capability source"));
  assert.match(auditWorkflow, /repository: pipelab-org\/pipelock/);
  assert.match(auditWorkflow, /ref: \$\{\{ steps\.capability-source\.outputs\.checkout_ref \}\}/);
  assert.doesNotMatch(auditWorkflow, /ref: \$\{\{ steps\.capability-source\.outputs\.commit \}\}/);
  assert.match(auditWorkflow, /fetch-depth: 0/);
  assert.match(auditWorkflow, /verify-capability-source\.mjs --source \.capability-source/);
  assert.match(capabilityVerifier, /merge-base", "--is-ancestor"/);
  assert.match(capabilityVerifier, /release tag does not resolve to the recorded capability commit/);
  assert.match(capabilityResolver, /published capability release target must match the site Pipelock version/);
  assert.doesNotMatch(auditWorkflow, /if: steps\.capability-source\.outputs\.status == 'release'/);
  const declaredVersion = config.match(/^pipelock_version = "([^"]+)"$/m)?.[1];
  const releaseTarget = content.match(/^release_target: "([^"]+)"$/m)?.[1];
  assert.ok(declaredVersion);
  assert.match(releaseTarget, /^\d+\.\d+\.\d+$/);
  if (snapshot.source.status === "development") {
    assert.match(content, /^release_target: "3\.5\.0"$/m);
    assert.match(content, /^draft: true$/m);
    assert.match(content, /^robots: "noindex, nofollow"$/m);
    assert.equal(snapshot.source.release_version, null);
    assert.match(capabilityTemplate, /release target/);
    assert.match(capabilityTemplate, /source commit/);
    assert.doesNotMatch(home, /class="hp-cap-link" href="\/capabilities\/"/);
    return;
  }

  assert.equal(snapshot.source.status, "release");
  assert.equal(snapshot.source.release_version, declaredVersion);
  assert.equal(snapshot.source.release_version, releaseTarget);
  assert.equal(snapshot.source.ref, `v${declaredVersion}`);
  assert.doesNotMatch(content, /^draft: true$/m);
  assert.match(home, /class="hp-cap-link" href="\/capabilities\/"/);
});

test("capability documentation pages match the inventory publication state", () => {
  const detailContents = new Map(capabilityFamilies.families.flatMap((family) => family.capabilities.map((capabilityId) => [
    capabilityId,
    readFileSync(new URL(`../content/capability-${capabilityId}.md`, import.meta.url), "utf8"),
  ])));
  const inventoryDraft = /^draft: true$/m.test(content);

  assert.doesNotThrow(() => verifyCapabilityDetailState(capabilityFamilies.families, detailContents, inventoryDraft));
  const duplicateFamilies = structuredClone(capabilityFamilies.families);
  duplicateFamilies[1].capabilities.push(duplicateFamilies[0].capabilities[0]);
  assert.throws(
    () => verifyCapabilityDetailState(duplicateFamilies, detailContents, inventoryDraft),
    /belongs to more than one family/,
  );
  assert.throws(
    () => verifyCapabilityDetailState(capabilityFamilies.families, detailContents, !inventoryDraft),
    /draft state must match the capability inventory/,
  );

  const publishedContents = new Map([...detailContents].map(([id, detailContent]) => [
    id,
    publishContent(detailContent),
  ]));
  assert.doesNotThrow(() => verifyCapabilityDetailState(capabilityFamilies.families, publishedContents, false));

  const draftContents = new Map([...detailContents].map(([id, detailContent]) => [
    id,
    draftContent(detailContent),
  ]));
  assert.doesNotThrow(() => verifyCapabilityDetailState(capabilityFamilies.families, draftContents, true));

  const undiscoverableContents = new Map([...draftContents].map(([id, detailContent]) => [
    id,
    detailContent.replace(/^draft: true\n/m, ""),
  ]));
  assert.throws(
    () => verifyCapabilityDetailState(capabilityFamilies.families, undiscoverableContents, false),
    /must not override robots discovery/,
  );
});

test("capability export refuses an unclassified product surface", () => {
  const manifest = {
    schema_version: 1,
    capabilities: [
      {
        id: "new-unclassified-surface",
        name: "New surface",
        summary: "A product surface the site has not classified.",
        tier: "Free",
        operator_entry_point: { kind: "command", value: "pipelock new" },
      },
    ],
  };
  assert.throws(
    () => buildSnapshot(Buffer.from(JSON.stringify(manifest)), { ref: "origin/main", commit: "a".repeat(40) }),
    /has no site group/,
  );
});

test("capability export refuses an unknown operator entry point kind", () => {
  const manifest = {
    schema_version: 1,
    capabilities: snapshot.capabilities.map((capability, index) => ({
      ...capability,
      operator_entry_point: {
        ...capability.operator_entry_point,
        kind: index === 0 ? "endpoint" : capability.operator_entry_point.kind,
      },
    })),
  };
  assert.throws(
    () => buildSnapshot(Buffer.from(JSON.stringify(manifest)), { ref: "origin/main", commit: "a".repeat(40) }),
    /has unknown entry point kind endpoint/,
  );
});

test("draft capability verification selects Pipelock main independently of snapshot commit", () => {
  const developmentSnapshot = {
    ...snapshot,
    source: {
      ...snapshot.source,
      ref: "origin/main",
      release_version: null,
      status: "development",
    },
  };
  const source = resolveCapabilitySource(developmentSnapshot, draftContent(content), config);

  assert.equal(source.status, "development");
  assert.equal(source.checkoutRef, "main");
  assert.equal(source.recordedRef, "origin/main");
  assert.equal(source.recordedCommit, snapshot.source.commit);
  assert.notEqual(source.checkoutRef, source.recordedCommit);
});

test("release capability verification selects the page tag and binds it to the site version", () => {
  const releaseContent = publishContent(content);
  const releaseConfig = config.replace(/^pipelock_version = "[^"]+"$/m, `pipelock_version = "${pageReleaseTarget}"`);
  const releaseSnapshot = {
    ...snapshot,
    source: {
      ...snapshot.source,
      ref: `v${pageReleaseTarget}`,
      release_version: pageReleaseTarget,
      status: "release",
    },
  };
  assert.match(releaseContent, /^title: "Pipelock capabilities"$/m);
  assert.match(releaseContent, new RegExp(`^release_target: "${pageReleaseTarget.replaceAll(".", "\\.")}"$`, "m"));
  assert.doesNotMatch(releaseContent, /^draft:/m);
  assert.doesNotMatch(releaseContent, /^robots:/m);
  const source = resolveCapabilitySource(releaseSnapshot, releaseContent, releaseConfig);

  assert.equal(source.checkoutRef, `refs/tags/v${pageReleaseTarget}`);
  assert.equal(source.recordedRef, `v${pageReleaseTarget}`);
  assert.throws(
    () => resolveCapabilitySource(releaseSnapshot, releaseContent, mismatchedConfig),
    /release target must match the site Pipelock version/,
  );
  for (const robots of ["noindex, nofollow", "index, follow"]) {
    const blockedContent = releaseContent.replace(/^---\n/, `---\nrobots: "${robots}"\n`);
    assert.throws(
      () => resolveCapabilitySource(releaseSnapshot, blockedContent, releaseConfig),
      /published capability inventory must not override robots discovery/,
    );
  }
  assert.throws(
    () => resolveCapabilitySource(releaseSnapshot, draftContent(releaseContent), releaseConfig),
    /capability source status or ref is inconsistent with the page state/,
  );
});

test("capability authority cannot be redirected by metadata-looking body text", () => {
  const bodyMetadata = [
    "+++",
    'title = "Pipelock capabilities"',
    "draft = false",
    'release_target = "3.5.0"',
    "+++",
    "",
    "---",
    'release_target: "3.5.0"',
    "draft: true",
    "---",
  ].join("\n");

  assert.throws(
    () => resolveCapabilitySource(snapshot, bodyMetadata, config),
    /must begin with YAML front matter/,
  );
});

test("explicit null draft metadata cannot publish the capability inventory", () => {
  for (const nullValue of ["null", "~"]) {
    const invalidContent = draftContent(content).replace(/^draft: true$/m, `draft: ${nullValue}`);
    assert.throws(
      () => resolveCapabilitySource(snapshot, invalidContent, config),
      /capability draft state is invalid/,
      `draft: ${nullValue} must fail closed`,
    );
  }
});

test("site version comes from parsed TOML rather than a multiline string", () => {
  const releaseContent = publishContent(content);
  const releaseSnapshot = {
    ...snapshot,
    source: {
      ...snapshot.source,
      ref: `v${pageReleaseTarget}`,
      release_version: pageReleaseTarget,
      status: "release",
    },
  };
  // The real parameter says 0.0.1; the decoy inside a multiline string says the
  // page's target. A naive string scan finds the decoy and lets it through, so
  // only a real TOML parse rejects the mismatch.
  const misleadingConfig = mismatchedConfig.replace(
    "[params]\n",
    ['notice = """', `pipelock_version = "${pageReleaseTarget}"`, '"""', "", "[params]", ""].join("\n"),
  );

  assert.throws(
    () => resolveCapabilitySource(releaseSnapshot, releaseContent, misleadingConfig),
    /release target must match the site Pipelock version/,
  );
});

test("development verification tolerates unrelated main commits but rejects manifest drift", () => {
  const manifest = Buffer.from(JSON.stringify({
    schema_version: 1,
    capabilities: snapshot.capabilities,
  }));
  const developmentSnapshot = buildSnapshot(manifest, {
    ref: "origin/main",
    commit: "b".repeat(40),
  });

  assert.doesNotThrow(() => verifyDevelopmentSnapshot(developmentSnapshot, manifest, manifest, true));
  assert.throws(
    () => verifyDevelopmentSnapshot(developmentSnapshot, manifest, Buffer.concat([manifest, Buffer.from("\n")]), true),
    /current Pipelock main has a different capability manifest/,
  );
  assert.throws(
    () => verifyDevelopmentSnapshot(developmentSnapshot, manifest, manifest, false),
    /recorded development commit is not in current Pipelock main history/,
  );
});

test("release verification requires the immutable target tag to be checked out", () => {
  const manifest = Buffer.from(JSON.stringify({
    schema_version: 1,
    capabilities: snapshot.capabilities,
  }));
  const releaseSnapshot = buildSnapshot(manifest, {
    ref: "v3.5.0",
    commit: "c".repeat(40),
    releaseVersion: "3.5.0",
  });

  assert.doesNotThrow(() => verifyReleaseSnapshot(
    releaseSnapshot,
    manifest,
    "c".repeat(40),
    "c".repeat(40),
    "3.5.0",
  ));
  assert.throws(
    () => verifyReleaseSnapshot(releaseSnapshot, manifest, "c".repeat(40), "d".repeat(40), "3.5.0"),
    /release tag does not resolve to the recorded capability commit/,
  );
  assert.throws(
    () => verifyReleaseSnapshot(releaseSnapshot, manifest, "branch".padEnd(40, "0"), "c".repeat(40), "3.5.0"),
    /checked-out release source is not the immutable release tag/,
  );
});

test("release promotion keeps the manifest digest when the tagged bytes are unchanged", () => {
  const manifest = Buffer.from(JSON.stringify({
    schema_version: 1,
    capabilities: snapshot.capabilities,
  }));
  const commit = "c".repeat(40);
  const developmentSnapshot = buildSnapshot(manifest, { ref: "origin/main", commit });
  const releaseSnapshot = buildSnapshot(manifest, {
    ref: "v3.5.0",
    commit,
    releaseVersion: "3.5.0",
  });
  const changedCapabilities = structuredClone(snapshot.capabilities);
  changedCapabilities[0].summary = `${changedCapabilities[0].summary} changed`;
  const changedManifest = Buffer.from(JSON.stringify({
    schema_version: 1,
    capabilities: changedCapabilities,
  }));
  const changedReleaseSnapshot = buildSnapshot(changedManifest, {
    ref: "v3.5.0",
    commit,
    releaseVersion: "3.5.0",
  });

  assert.equal(releaseSnapshot.source.manifest_sha256, developmentSnapshot.source.manifest_sha256);
  assert.notEqual(changedReleaseSnapshot.source.manifest_sha256, releaseSnapshot.source.manifest_sha256);
  assert.doesNotThrow(() => verifyReleaseSnapshot(releaseSnapshot, manifest, commit, commit, "3.5.0"));
  assert.throws(
    () => verifyReleaseSnapshot(releaseSnapshot, changedManifest, commit, commit, "3.5.0"),
    /capability snapshot does not match the release tag/,
  );
});
