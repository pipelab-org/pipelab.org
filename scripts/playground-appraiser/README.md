# Playground appraiser-view artifacts

This documents how the AARP appraisal artifacts under
`static/playground-replay/` were produced, so the panel on each playground
scenario page is verifiable provenance, not a hand-edited mock.

## What ships in the site

Per scenario (`static/playground-replay/<id>/`):

- `assurance.json` - an AARP v0.1 assurance envelope that wraps the scenario's
  decisive lab receipt by digest, signed by a fixed lab `mediator` key.
- `appraisal.json` - the comparable appraisal the AARP verifier emits for that
  envelope under `appraiser-trust.json`.

Shared:

- `appraiser-trust.json` - the pinned trust file (the lab mediator key +
  authority binding) used to appraise every gallery envelope.

Hostile contrast (`static/playground-replay/_killsuite/`): a verbatim copy of
the `k02-untrusted-issuer-overclaim` fixture from the public Evidence Theater
kill suite (`agent-egress-bench`), plus its `killsuite-trust.json`.

## Reproducing the appraisals (public, no internal code)

Anyone can regenerate every `appraisal.json` from the committed inputs with the
AARP verifier. This is the honesty claim the panel makes:

```sh
cd static/playground-replay/<id>
pipelock-verifier aarp assurance.json --trust ../appraiser-trust.json --json
```

The hostile example:

```sh
cd static/playground-replay/_killsuite
pipelock-verifier aarp k02-untrusted-issuer-overclaim.aarp.json \
  --trust killsuite-trust.json --json
```

## Regenerating the envelopes (provenance only)

The envelopes themselves are *signed*, so minting them needs pipelock's
`internal/aarp` + `internal/receipt` packages. There is no public emit CLI.
`generate-assurance.go.txt` is the exact program used. It writes both the
signed envelope and the comparable appraisal. To re-run it, drop it
into a pipelock checkout as `cmd/zz-appraiser-gen/main.go` and run:

```sh
go run ./cmd/zz-appraiser-gen <path-to>/static/playground-replay
```

It reads each scenario's `evidence.jsonl`, takes the decisive receipt, computes
the receipt digests with Pipelock's own `receipt` package (so the Subject
digests are genuinely canonical: they match the rig's `verifier.root_hash` for
single-receipt packets), builds the assertion (claiming `mediated` and
`complete-mediation`), and signs with a fixed lab seed. **The lab key is test
material, never a production key.** It is not a runtime AARP producer: pipelock
does not emit AARP assertions in production yet (v0.1 is spec + verifier +
signing primitives). These envelopes are lab demonstrations over real receipts.
