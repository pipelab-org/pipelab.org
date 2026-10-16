---
title: "Verify a Pipelock Receipt: Copy-Paste Demo"
linkTitle: "Verify a Receipt"
seoTitle: "Verify a Pipelock Receipt: Signed Evidence Demo"
subtitle: "Receipts or it didn't happen. Pull a signed receipt from the public conformance corpus, run the verifier, watch it pass. Tamper one byte, watch it fail."
description: "Verify Pipelock Ed25519 action receipts with Go, TypeScript, Rust, or Python verifier CLIs against the public conformance corpus."
date: 2026-05-21
lastmod: 2026-10-14
learn_cat: operator
level: intro
tags:
  - receipts
  - ed25519
  - audit-packet
  - conformance
faq:
  - q: "What does verifying a receipt actually prove?"
    a: "A passing receipt verification proves three things at once. First, the receipt's body was produced by the holder of a specific Ed25519 private key (signature math). Second, the body has not changed since signing (canonical-JSON hash recomputed from the current bytes). Third, when checked against a chain, the receipt sits where it claims in a tamper-evident sequence (each receipt's `chain_prev_hash` matches the SHA-256 of the prior one). A correctly written verifier does all three offline, with no network and no vendor dashboard."
  - q: "What's the difference between `pipelock verify-receipt` and `pipelock-verifier`?"
    a: "`pipelock verify-receipt` is built into the main Pipelock binary; an operator who already runs Pipelock has it without installing anything else. `pipelock-verifier` is a separate binary with no network surface, no proxy, no scanner, and no config reload. It exists so a CI runner, an auditor's laptop, or a third party can drop in just the verifier without provisioning the full firewall stack. Same verification logic. The standalone verifier adds three subcommands for receipt, chain, and audit-packet, and matches exit codes with the TypeScript and Rust ports."
  - q: "Why are there four verifiers in four languages?"
    a: "Defense in depth for the verification step itself. If a relying party only trusts implementations written in their own ecosystem's language, the receipt format has to support that. The Go, TypeScript, Rust, and Python implementations expose the same receipt and chain verification surface, so a CI pipeline in Node, a Rust-based auditor tool, a Python compliance script, or the canonical Go binary can check the same public fixtures against the same expected verdicts."
  - q: "Where do receipts come from in production?"
    a: "With a configured emitter, Pipelock records signed receipts for covered mediated actions. Allow coverage depends on required-receipt configuration, while denied actions retain best-effort emission. Processes can use one chain or a signed group of parallel chains in the flight recorder directory, and the pipelock-agent-egress-action GitHub Action bundles the chain with policy metadata into an Audit Packet v0 directory containing packet.json, summary.md, evidence.jsonl, and verifier.txt. The Audit Packet is the procurement-evidence artifact; the receipt chain is the underlying signed input."
  - q: "Can a malicious actor with the test key forge receipts that the verifier accepts?"
    a: "The conformance corpus is signed with a test key whose private half is committed in `_generator/test-key.json` for reproducibility. That key is for conformance testing only. Production verifiers pin a different public key per deployment; the corpus is structured so a verifier configured to pin the test key will accept the golden fixtures and reject the malicious ones. If a production verifier is misconfigured to trust the test key, that is a deployment mistake, not a property of the format."
  - q: "What happens if the corpus changes upstream?"
    a: "Each fixture has a stable `fixture_id` and an `.expect.json` that pins the exact verdict and `reject_reason`. Adding new fixtures does not change the verdict on existing ones. The corpus is versioned at `receipts/v0/`; if the receipt envelope itself ever changes in a way that breaks v0 verifiers, the new corpus will live at `receipts/v1/` next to v0, not on top of it."
---

Pipelock writes a signed receipt every time it adjudicates an outbound agent
action. Receipts compose into a hash-chained file an auditor or CI runner can
read without trusting any vendor dashboard. This page is the shortest path
from zero to "I ran the verifier, it passed, I tampered one byte, it failed."

The fixtures here come from the public conformance corpus that verifier
authors and Audit Packet producers can test against. There is no vendor-only
verification path: every command below runs on public fixtures with a public
test key.

## v3.7 completeness checks

An intact chain without an end proof reports `VALID PREFIX, END UNPROVEN`. For recorder directories, use `pipelock verify-receipt --chain ./recorder --whole-recorder` to check the transcript seal. Receipt-chain mode can exit 3 even after a clean shutdown if EvidenceReceipt v2 receipts have no chain end marker. Other verifiers support independently retained expected heads or sequences where documented.

For [parallel receipt chains](/learn/parallel-receipt-chains/), keep the complete directory and use a group-capable verifier. The published TypeScript and Rust packages at 0.6.5 check whole groups; Python `pipelock-verify` 0.4.1 checks individual shards and chains, including their signed group binding, but doesn't verify the group. Signed recovery seals attest a discontinuity and preserve the damaged history's failure. Read the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/).

## The verifier commands

The Pipelock verifier is available as the built-in CLI, a standalone Go
binary, and TypeScript, Rust, and Python ports. They expose the same receipt
and chain verification surface. The standalone verifiers use `0` valid, `1` invalid, `2` runtime error and `64` usage error. In v3.7 chain mode, an intact prefix without an end proof exits 3. `--allow-prefix` accepts an intentional open prefix with exit 0 while retaining its incomplete-end label. The built-in `pipelock verify-receipt` uses `0` valid, `1` invalid, malformed or refused, and `2` usage or configuration error.

| Binary | Source | What it covers |
| --- | --- | --- |
| `pipelock verify-receipt` | Built into the main Pipelock binary | Single receipt JSON, a flight recorder JSONL file, or a recorder session directory via `--chain`; `--whole-recorder` widens the check to the whole recorder |
| `pipelock-verifier` (Go) | [`cmd/pipelock-verifier`](https://github.com/pipelab-org/pipelock/tree/main/cmd/pipelock-verifier), shipped as its own GoReleaser archive | Subcommands `receipt`, `chain`, `audit-packet`. No proxy, no scanner, no network surface. |
| `pipelock-verifier-ts` | [`sdk/verifiers/ts`](https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/ts) | Node/Bun port via `@noble/ed25519` and `ajv` |
| `pipelock-verifier-rs` | [`sdk/verifiers/rust`](https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/rust) | Rust port with embedded schema |
| `pipelock-verify` | [`pipelock-verify-python`](https://github.com/luckyPipewrench/pipelock-verify-python) | Python port for receipt chains and Python audit scripts |

Core Go invocations:

```bash
# Verify a single receipt with the main Pipelock binary
pipelock verify-receipt receipt.json --key signer.pub

# Verify a single receipt with the standalone Go verifier
pipelock-verifier receipt receipt.json --key signer.pub

# Verify a full receipt chain (one jsonl file or a session directory)
pipelock-verifier chain evidence.jsonl --key signer.pub

# Verify a complete Audit Packet bundle, pinning the signer key
pipelock-verifier audit-packet ./audit-packet/ --key signer.pub
```

To check more than the receipts, pass `--whole-recorder` to `pipelock verify-receipt`. It verifies every recorder entry present, its taxonomy, and the `transcript_root` seal written at clean shutdown, and the output says `Mode: whole-recorder` so you can tell which check ran. Add `--require-seal` to fail when any run lacks that seal. It works on a recorder JSONL file or a `--chain` directory, and it can't be combined with `--clean-report` or `--fleet-report`.

A single-chain Pipelock process writes a receipt chain named `<base>.run.<id>`. Parallel mode uses signed group lifecycle records to bind multiple chains. A restart isn't a gap: it's recorded as a signed link file that names the tail of the run it continues. `pipelock verify-receipt --chain ./recorder` verifies every run chain of the base, then checks that each link names the exact tail of the run it continues. `pipelock evidence doctor` follows the same links. Runs that no link continues are listed as unlinked. That's normal for a first run or concurrent runs, and it's also what a deleted link file looks like, so a passing result doesn't prove no run's evidence is missing.

The receipt and chain commands accept `--key HEX_OR_FILE` to pin a signer key
for trusted verification. The Go, TypeScript, and Rust CLIs also accept
`--json` for machine-readable output. The standalone Go verifier additionally
accepts `--offline`, `--allow-self-consistent-only`, `--no-trust-required`,
and `--expect-sha256` on `audit-packet` for stricter or more permissive
policies depending on the relying party.

`audit-packet --offline` no longer reports a packet as trusted. Since v3.6.0 the Go, Rust, and TypeScript verifiers return `verdict: schema_checked_trust_unverified` with `trusted` and `valid` both false and exit non-zero, because offline mode checks only the packet schema and never re-reads the receipt chain. Clean reports also carry a `verification_mode` of `pinned_provenance` or `unpinned_structural`. A CI job that read the old success must run a full chain check instead.

You can also check a chain without installing anything. The [browser verifier](/verify/) runs locally, uploads nothing, and lets you pin the operator public key you trust.

## Walk the seven-case quick path

The full
[public conformance corpus](https://github.com/luckyPipewrench/agent-egress-bench/tree/main/receipts/v0/conformance)
ships 28 fixtures (8 golden, 8 edge, 12 malicious) covering every
`reject_reason` in the closed enum. A verifier author runs the whole corpus.
A first-time reader can grasp the format in seven hand-picked cases:

| # | Fixture | Category | What it shows |
| --- | --- | --- | --- |
| 1 | [`golden/01-allow-clean-get`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/golden/01-allow-clean-get.json) | golden | A clean allowed GET request. The basic happy-path signed receipt. |
| 2 | [`golden/03-block-dlp-aws-key`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/golden/03-block-dlp-aws-key.json) | golden | A blocked DLP hit still produces a signed receipt. Blocked is not silent. |
| 3 | [`malicious/m01-forged-signature-wrong-key`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/malicious/m01-forged-signature-wrong-key.json) | malicious | Reject reason: `signature_invalid`. Attacker rewrote `signer_key` to claim the pinned key; the foreign signature fails. |
| 4 | [`malicious/m03-expired-timestamp`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/malicious/m03-expired-timestamp.json) | malicious | Reject reason: `expired`. Receipt is past the verifier's `max_age` window. |
| 5 | [`malicious/m08-tampered-chain-prev-hash`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/malicious/m08-tampered-chain-prev-hash.jsonl) | malicious | Reject reason: `chain_break`. A receipt's `chain_prev_hash` does not match the SHA-256 of the prior receipt. |
| 6 | [`malicious/m11-body-tampered-after-sign`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/malicious/m11-body-tampered-after-sign.json) | malicious | Reject reason: `body_tampered`. Signature was valid for the original body; `action_record.target` was rewritten post-signing. |
| 7 | [`edge/e04-edge-of-freshness-window`](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/receipts/v0/conformance/edge/e04-edge-of-freshness-window.json) | edge | A receipt right at the freshness boundary. A correct verifier still accepts; off-by-one verifiers do not. |

Each `.json` fixture has a sibling `.expect.json` describing the verdict any
correct verifier MUST emit, the `reject_reason` enum value, the expected
signer key, and notes for verifier authors. Drop your verifier in, run it
across the corpus, compare line by line.

## Try it locally

Clone the bench, pin the test key, run the verifier on a golden receipt:

```bash
git clone https://github.com/luckyPipewrench/agent-egress-bench.git
cd agent-egress-bench/receipts/v0/conformance

# Public test key (committed for reproducibility; production deployments pin their own)
TEST_KEY=$(jq -r .public_key_hex _generator/test-key.json)

# Golden case: accept
pipelock-verifier receipt golden/01-allow-clean-get.json --key "$TEST_KEY"
echo "exit: $?"     # 0 (valid)

# Malicious case: reject with signature_invalid
pipelock-verifier receipt malicious/m01-forged-signature-wrong-key.json --key "$TEST_KEY"
echo "exit: $?"     # 1 (invalid)

# Chain case: reject with chain_break
pipelock-verifier chain malicious/m08-tampered-chain-prev-hash.jsonl --key "$TEST_KEY"
echo "exit: $?"     # 1 (invalid)
```

A correct verifier emits the reject reason on stderr or in the `--json`
output. The exit code is the relying party's contract: CI runners gate on
`0`; auditors investigate any `1`; `2` and `64` indicate the verifier itself
is misconfigured.

## Same corpus, three other languages

Each language port exposes the same receipt and chain verification surface.
Use the public corpus to confirm whether a verifier agrees with the expected
verdicts before trusting it on production receipts.

```bash
# TypeScript
cd sdk/verifiers/ts && npm install && npm run build
node dist/src/cli.js receipt path/to/golden/01-allow-clean-get.json --key "$TEST_KEY"

# Rust
cd sdk/verifiers/rust && cargo build --release
./target/release/pipelock-verifier-rs receipt path/to/golden/01-allow-clean-get.json --key "$TEST_KEY"

# Python (separate repo)
pip install pipelock-verify
pipelock-verify path/to/golden/01-allow-clean-get.json
```

If a verifier disagrees with the others on any fixture, the disagreement
itself is the bug report. The corpus is the contract.

## What a passing verification actually proves

Three things, in order, every time:

1. **Signature math.** The signature is a well-formed Ed25519 signature over
   `SHA-256(canonical-JSON(action_record))`, and it verifies against the
   embedded `signer_key`. A wrong-key forgery fails here.
2. **Body integrity.** The verifier recomputes the canonical-JSON hash from
   the current bytes of `action_record`. If a single byte changed after
   signing, the recomputed hash disagrees with the one the signature was
   produced over. A post-sign edit fails here.
3. **Chain linkage.** When verifying a chain, each receipt's
   `chain_prev_hash` is checked against the SHA-256 of the previous
   receipt's bytes. Cutting one receipt out, reordering, or splicing in a
   foreign receipt breaks the chain.

Add the verifier-side policy checks on top: pinned signer key, max age,
replay window, schema version, strict JSON parsing. The
[conformance README](https://github.com/luckyPipewrench/agent-egress-bench/tree/main/receipts/v0/conformance)
documents the exact policy assumptions every conformance run uses.

## Where to go next

* [Why this evidence matters](/proof/): the public corpus, signed rules, and
  assessment evidence behind Pipelock's claims.
* [Agent action receipts](/learn/agent-action-receipts/): the primitive
  these commands verify, framed for procurement and audit.
* [Verifiable egress control](/learn/verifiable-egress-control/): the
  umbrella category combining binary-enforced mediation with signed
  evidence.
* [Agent security control layers](/learn/agent-security-control-layers/):
  where signed receipts fit in the four-lane agent-security map.
* [Pipelock action receipt format spec](/learn/action-receipt-spec/): the
  exact bytes on the wire.
* [AARP v0.1 spec](/learn/aarp-spec/): the assurance profile layered over a
  frozen receipt.
* [Audit Packet v0 schema](/schemas/audit-packet-v0.schema.json): the
  JSON Schema the bundle producers and verifiers both honor.
* [pipelock-agent-egress-action](https://github.com/luckyPipewrench/pipelock-agent-egress-action):
  the GitHub Action that produces complete Audit Packets in CI.
* [Conformance corpus README](https://github.com/luckyPipewrench/agent-egress-bench/tree/main/receipts/v0/conformance):
  the closed reject-reason enum, policy assumptions, and the generator
  that produces the fixtures.

Receipts or it didn't happen. The corpus is public, the verifiers are
public, the test key is public. A trustworthy run still depends on the
boundary, binary, workflow, key custody, and the public key the relying
party chose to pin.
