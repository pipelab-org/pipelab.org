# Product versions and historical evidence

Current capability data, verifier pins and product summaries must match `params.pipelock_version` in `hugo.toml`. An unclassified Gauntlet pointer must also match. `npm run site:version-claims` rejects missing, malformed or mismatched data.

The Gauntlet promotion contract in `benchmark/gauntlet-baseline.json` preserves published records and moves `latest-verified.json` only with a reviewed promotion. Its measurement version identifies the binary that ran, independently of the site's current product version. A site release doesn't produce a new benchmark result.

`data/historical_artifacts.json` can explicitly classify the three signed Assess demo pages and the exact latest-reviewed Gauntlet pointer. Each entry pins the complete file's SHA-256 and recorded Pipelock version, which must be older than the current site release. Changed bytes, a different stated version, an ineligible path or malformed metadata fail the audit. The result listing labels the classified measurement version and says it doesn't measure the current release.

Historical classification doesn't validate a measurement or authorize promotion. `npm run site:audit` separately checks the pointer, record digests, promotion baseline and append-only record history. Keep that audit intact. A new reviewed promotion must retire or update the old classification; it can't inherit the old pointer's hash.
