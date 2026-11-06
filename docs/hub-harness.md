# Hub verification harness

The harness checks signed bundle bytes with the pinned Pipelock production loader and scanners. A second Ed25519 verifier checks the signature in Node. Reader facts, routes, generated records and measurement references are bound to their source bytes. The Hub remains closed until its separate opening requirements are met.

## Build and native tests

The build reads local Git objects and cached Go modules. It does not download a toolchain or dependencies. `scripts/hub/engine.json` pins the Pipelock tag, commit and Go toolchain; a mismatch fails the build. The build adds only the harness file to a disposable source export.

From this site checkout, with local `../pipelock` and `../pipelock-rules` checkouts containing the pinned revisions:

```sh
capture_dir=$(mktemp -d)
node scripts/hub/build-harness.mjs ../pipelock "$capture_dir" > "$capture_dir/build.json"
HUBCHECK_BIN=$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).binary" "$capture_dir/build.json")
HUBCHECK_ENGINE_DIR=$(dirname "$HUBCHECK_BIN")
HUBCHECK_REPOSITORY=$(realpath ../pipelock)
HUBCHECK_RULES_REPOSITORY=$(realpath ../pipelock-rules)
export HUBCHECK_BIN HUBCHECK_ENGINE_DIR HUBCHECK_REPOSITORY HUBCHECK_RULES_REPOSITORY
node --test test/hub-harness.test.mjs
```

The native reader, scanner and rendered-site tests require these paths. Without them, those tests are skipped and provide no native coverage. The naming code also checks its Unicode and ICU versions against the committed tables.

## Workload and observed matches

The official workload binds the served bundle digest to a rules-repository revision containing the same signed bytes. Each nonblank producer line is an individual input with its original line number. Missing negatives for experimental rules may use the versioned site supplements; a missing stable-rule fixture fails. The clean-text snapshots have committed digests. Producer labels describe the fixture source; they do not establish scanner accuracy.

The `site:fixture-span-truncation-v1` generator walks positive fixture lines in order and takes the first match of Go's `(?i)` expression. It removes final runes until the span is nonempty and no longer matches, then repeats that seed with a trailing space. It checks both a doubled seed and the complete capped candidate for raw matches. A missing match, empty-matching pattern, empty seed or raw match created by repetition holds generation.

The byte ceilings come from the pinned source: the largest fetch-response cap among `claude-code`, `strict` and `hostile-model`, the `claude-code` preset's outbound request-body cap, and the native per-tool-definition text limit. Tool inputs must fit both the serialized `tools/list` envelope and the native text budget, including the fixed name or description and raw input-schema bytes. The builder checks the mirrored native limit against its pinned declaration.

Each candidate is also run through the isolated production scanner. Its `production_target_match` records the observed outcome. Normalization and validators can make that outcome differ from raw regex matching. The record therefore claims a repeated incomplete fixture sample and a raw nonmatch, with the production outcome stated separately. It does not establish a production-scanner negative or worst-case behavior. An incomplete production scan fails generation.

The derivation records the fixture origin and digest, match offsets, seed, removed-rune count, size ceilings, effective byte lengths and text digest. Node checks the seed against those fixture offsets and the removed-rune count, then reconstructs the candidate and checks its digest and transport sizes against the native helper. The enclosing workload has its own generator identity, parameters and digest. Earlier prefix-generator inputs are a different workload and cannot reuse these bindings.

## Measurements

`scripts/hub/benchmark-report.mjs` derives the reader from the executable and bundle it actually measures. With no explicit diagnostic workload, it constructs the official workload from the pinned repositories. It times each declared non-deprecated rule in isolation and the whole bundle, interleaving the same workload against the baseline. Loaded-rule identities must match exactly before timing.

Artifacts include all samples, maxima, actual pair count, executed workload digest, engine identity and method. Content-addressed artifacts can coexist when reruns produce different samples. Regeneration reuses only matching bindings and recomputes the verdict from the separate limits. A timeout or incomplete evidence cannot become a pass. Unset latency limits remain unassessed in report mode and fail acceptance; no default admission budget is supplied.
