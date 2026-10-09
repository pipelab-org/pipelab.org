// The published gauntlet surfaces must lead with full-corpus containment.
//
// Full corpus is the procurement view: a case the tool does not claim still
// counts against it. Applicable containment only covers cases matching the
// tool's declared capabilities, so a tool can raise it by declaring fewer
// capabilities without containing anything more. Leading with the applicable
// number therefore publishes a figure that rewards narrower claims.
//
// This shipped inverted on three surfaces at once (the verdict banner, the
// score cards, and the leaderboard) and nothing caught it, because the
// rendering functions touch the DOM and are not exported. These assertions run
// against the source text instead. That is coarse, but it pins the exact
// inversion that occurred and fails loudly if a future edit reintroduces it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONTINUOUS = new URL("../themes/pipelab/assets/js/gauntlet-continuous.js", import.meta.url);
const RESULTS = new URL("../themes/pipelab/layouts/gauntlet/results.html", import.meta.url);

test("the verified checkpoint names full-corpus containment before applicable", async () => {
  const source = await readFile(CONTINUOUS, "utf8");
  const full = source.indexOf("full-corpus containment");
  const applicable = source.indexOf("applicable containment (diagnostic)");

  assert.notEqual(full, -1, "verified summary must state a full-corpus containment figure");
  assert.notEqual(applicable, -1, "applicable containment must be labelled diagnostic");
  assert.ok(full < applicable, "full-corpus containment must be presented before the applicable figure");
});

test("the result hero reports a measurement rather than a benchmark-awarded mark", async () => {
  const source = await readFile(RESULTS, "utf8");

  assert.match(source, /id="gr-record-measured">MEASURED</,
    "result hero must describe the published score as a measurement");
  assert.match(source, /containment on the full corpus/,
    "result banner must state that its figure is full-corpus");
  assert.doesNotMatch(source, /badge\.textContent = suf \? 'Sufficient' : 'Insufficient'/,
    "history must not render the publisher threshold as a benchmark mark");
  assert.doesNotMatch(source, /scores\.applicable\.containment\) \+ ' containment on applicable cases'/,
    "verdict banner must not quote applicable containment beside a full-corpus verdict");
});

test("the result hero leads with full-corpus containment and demotes applicable containment", async () => {
  const source = await readFile(RESULTS, "utf8");
  const fullHero = source.indexOf("fullScore + ' containment on the full corpus.'");
  const applicableDiagnostic = source.indexOf("applicable containment (diagnostic)");

  assert.notEqual(fullHero, -1, "the hero must present full-corpus containment");
  assert.notEqual(applicableDiagnostic, -1, "the applicable score must be marked diagnostic");
  assert.ok(fullHero < applicableDiagnostic, "full-corpus containment must be presented before the diagnostic");
  assert.match(source, /app\.containment === full\.containment/,
    "equal full and applicable figures must collapse to one displayed score");
  assert.equal((source.match(/scoreCard\('Containment'/g) || []).length, 0,
    "supporting tiles must not repeat the hero containment score");

  // The leaderboard's headline percentage must come from the full-corpus field.
  // There is deliberately no fallback to the applicable value: showing that
  // number unlabelled is the inversion, so a missing full score renders as
  // unknown instead.
  assert.match(source, /parseFloat\(r\.full_containment\)/,
    "leaderboard must derive its headline percentage from full_containment");
  assert.match(source, /scoreWithFraction\(full\.containment/,
    "full-corpus hero must attach a reconstructing fraction to its reading");
  assert.match(source, /formatScoreFraction\(/,
    "listing must use a reconstructing fraction rather than pairing the percent with routed/total");
  // The per-category readout now uses the site's containment-bar grammar (the
  // same cards the listing hero uses) rather than a wide table. The underlying
  // invariant is unchanged: the routed count is shown as cases, separate from
  // and never the denominator of the containment figure.
  assert.match(source, /class="gl-category-cases">' \+ esc\(isFinite\(app\) \? app \+ ' cases'/,
    "per-category count must render as cases, separate from the containment figure, not as its denominator");
  assert.match(source, /gl-category-score">' \+ \(hasScore \? esc\(\(ratio \* 100\)/,
    "per-category containment must render from the record's own containment ratio, not from the routed count");
  assert.doesNotMatch(source, /routed \/ .* total/,
    "listing must not pair a containment percent with a non-reconstructing routed/total count");

  // Non-scoring v5 field-presence diagnostics are deliberately not rendered as a
  // category score (that would misread field presence as detection); they stay
  // in the raw record. A record whose categories mix the scoring and diagnostic
  // schemas, or carries no per-category data, hides the whole chapter rather
  // than showing a fabricated or half-populated grid.
  assert.doesNotMatch(source, /gl-category-score[\s\S]{0,200}(classification_present_rate|structured_evidence_present_rate)/,
    "field-presence diagnostics must not be presented as a category containment score");
  assert.match(source, /mixedCategorySchema/,
    "a record mixing scoring and diagnostic category schemas must be detected");
  assert.match(source, /categoryChapter\.hidden = true/,
    "missing, empty, mixed, or malformed per-category data must hide the category chapter, never show a fabricated grid");
  assert.match(source, /gr-raw'\)\.textContent = JSON\.stringify\(p, null, 2\)/,
    "the full record, including any non-scoring diagnostics, must remain available as raw JSON");
});

test("the verified checkpoint publishes a reconstructing fraction rather than a bare percent", async () => {
  const source = await readFile(CONTINUOUS, "utf8");

  assert.match(source, /verifiedScoreSummary\(record\)/,
    "verified card must render through the reconstruct-or-bare summary");
  assert.match(source, /CASE_EQUAL_WEIGHTING/,
    "verified card must disclose case-equal weighting");
  assert.doesNotMatch(
    source,
    /formatPercent\(record\.scores\.full\.containment\) \+ " full-corpus containment"/,
    "verified card must not print full-corpus containment as a bare percent",
  );
  assert.match(source, /raw-summary\.json/,
    "verified loader must hash-bind the raw summary already named by the record manifest");
});

test("the results page keeps the buyer name, explicit run actions, and maintainer boundary", async () => {
  const source = await readFile(RESULTS, "utf8");

  assert.match(source, /Agent Egress Bench Results/,
    "the listing must use the buyer-facing benchmark name");
  assert.match(source, /recordTool \+ ' against Agent Egress Bench'/,
    "the record hero must use the buyer-facing benchmark name");
  assert.match(source, /gl-result-hero-inspect/,
    "the featured result must expose an explicit detail action");
  assert.match(source, /inspectResult\.textContent = 'Inspect result'/,
    "each published run card must expose an explicit detail action");
  assert.match(source, /It is not part of the benchmark measurement and never changes the result above/,
    "maintainer commentary must stay separate from benchmark evidence");
  assert.doesNotMatch(source, /each links to the exact case/,
    "failure copy must not claim the complete JSONL file is a case-specific destination");
  assert.match(source, /id="gr-failure-source" hidden>Open complete result rows</,
    "the failure docket must expose one honestly labelled link to the complete result rows");
  assert.match(source, /caseId = document\.createElement\('span'\)/,
    "case IDs must remain identifiers instead of pretending to be deep links");

  const raw = source.indexOf('class="gr-raw-exhibit"');
  const close = source.indexOf('<section class="gr-final-band"', raw);
  assert.notEqual(raw, -1, "the raw record must render as an evidence exhibit");
  assert.ok(raw < close, "the raw record must appear before the closing action");
});
