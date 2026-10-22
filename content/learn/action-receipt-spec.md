---
title: "Pipelock Action Receipt Format (Implementation Spec)"
linkTitle: "Action Receipt Spec"
related:
  - verifiable-egress-control
  - agent-action-receipts
  - aarp-spec
  - flight-recorder
seoTitle: "Pipelock Action Receipt Format: Signed Evidence"
subtitle: "The exact wire format for signed, chain-linked action receipts."
description: "Pipelock signed receipt formats: Ed25519 ActionReceipt v1 for proxy decisions, plus EvidenceReceipt v2 for v2.4 contract lifecycle and shadow evidence."
date: 2026-04-09
lastmod: 2026-05-17
learn_cat: operator
level: ref
tags:
  - receipts
  - ed25519
  - spec
---

[Pipelock](/pipelock/) emits mediator-signed action receipts from outside the
agent trust boundary. The action receipt is the primitive that backs that
claim: a self-contained, Ed25519-signed record that the Pipelock mediator recorded
an attempted action and adjudicated it, signed from outside the agent trust
boundary. Each receipt records what happened, who authorized it, which policy
governed it, and what decision the mediator made. Receipts are chained by
hash, so tampering with any one of them breaks every receipt that follows.

That trust-boundary separation matters. Pipelock signs receipts in the
mediator, outside the agent process and outside its credentials, so
verification of the mediated slice does not depend on the agent transcript.
The Audit Packet threat model covers the signer, binary, wrapper, workflow,
and runner assumptions around that slice.

This page is an **implementation spec**, not a design document. It describes
the exact bytes the Pipelock binary writes today. Four verifier codebases now
cover this format: three in the Pipelock repo, plus a Python verifier in a
separate repo:

* **Go** (in the Pipelock repo): [`internal/receipt`](https://github.com/pipelab-org/pipelock/tree/main/internal/receipt) is the reference implementation. Two binaries share that code: `pipelock verify-receipt` (built into the main binary) and the standalone [`pipelock-verifier`](https://github.com/pipelab-org/pipelock/tree/main/cmd/pipelock-verifier) (self-contained, no network surface, no proxy, no scanner, drop-in for CI runners and auditors; subcommands `audit-packet`, `chain`, `receipt`).
* **TypeScript** (in the Pipelock repo): [`sdk/verifiers/ts`](https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/ts), independent implementation using `@noble/ed25519` and `ajv` for JSON Schema validation; for Node/Bun consumers in JavaScript pipelines.
* **Rust** (in the Pipelock repo): [`sdk/verifiers/rust`](https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/rust), independent implementation with `audit-packet`, `chain`, and `receipt` commands matching the Go and TypeScript verifier behavior. Includes Go-compatible canonical JSON, schema validation, strict Ed25519 receipt verification, chain replay, packet cross-checks, and tests against the shared conformance fixtures.
* **Python** (separate repo): [`pipelock-verify-python`](https://github.com/pipelab-org/pipelock-verify-python) `0.1.x` (`pip install pipelock-verify`) verifies ActionReceipt v1 chains. A `0.2.0` update for EvidenceReceipt v2 plus RFC 8785 JCS and an RFC 9421 directory fetcher is prepared in the repo, not yet published on PyPI.

The in-repo Go, TypeScript, and Rust codebases test against shared SDK conformance fixtures at
[sdk/conformance/testdata/](https://github.com/pipelab-org/pipelock/tree/main/sdk/conformance/testdata).
The receipt envelope and surrounding **Audit Packet v0** bundle are pinned by JSON Schema at [`pipelab.org/schemas/audit-packet-v0.schema.json`](/schemas/audit-packet-v0.schema.json). The [schema mirror catalog](/schemas/) lists the pinned Agent Egress Bench and Pipelock Rules schemas with source commits and SHA-256 digests. The standalone `pipelock-verifier` cross-checks the packet's claimed totals, root hash, and final
sequence against the actual chain on every invocation, so post-emission edits
to the summary or verifier block are caught even when the schema and chain
both validate.

## Why implementation, not draft

A receipt format is only interoperable if there is a working producer. Pipelock
is that producer; this page documents what it actually writes. When the format
evolves, the spec and the code move together. Earlier drafts proposed a JCS-
canonicalized, nested envelope; that shape is preserved at the end of this
page under [Evolution](#evolution) as a non-normative target for a future
version. It is not what any current Pipelock binary emits.

## Envelope

```json
{
  "version": 1,
  "action_record": { ... },
  "signature": "ed25519:<128 hex chars>",
  "signer_key": "<64 hex chars>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | integer | Receipt envelope version. MUST be `1`. Readers MUST reject unknown versions. |
| `action_record` | object | The signed payload. See [Action record](#action-record). |
| `signature` | string | Ed25519 signature, hex-encoded, prefixed with `ed25519:`. 64 signature bytes → 128 hex characters. |
| `signer_key` | string | Raw Ed25519 public key, hex-encoded. 32 key bytes → 64 hex characters. |

Field order in the canonical form is **`version`, `action_record`, `signature`,
`signer_key`**, matching the declaration order of Go's `receipt.Receipt` struct. Any
verifier that re-serializes the envelope (for chain linkage) MUST use this
order.

## Action record

All fields below are part of `action_record`. They come out of the Pipelock
`internal/receipt/action.go` struct in declaration order.

### Required fields

The shipped verifier (`receipt.Validate` in `internal/receipt/action.go`) enforces these seven:

| Field | Type | Description |
|-------|------|-------------|
| `version` | integer | Action record schema version. MUST be `1`. |
| `action_id` | string | Per-action identifier. UUIDv7 in production (time-ordered, generated by `receipt.NewActionID()`). |
| `action_type` | string | Classification of the operation. MUST be one of the values in [Action types](#action-types). |
| `timestamp` | string | RFC 3339 timestamp, always UTC. Format matches Go `time.RFC3339Nano`: trailing zero nanoseconds trimmed, `Z` for UTC. |
| `target` | string | Target resource URI. |
| `verdict` | string | Pipelock decision. See [Verdicts](#verdicts). |
| `transport` | string | Proxy surface that saw the action. See [Transports](#transports). |

### Always-present fields (not enforced by Validate, but always serialized)

These appear in every receipt the binary writes today, but the shipped `Validate` does not reject when they are empty. Independent verifiers MAY add stricter checks for their own use cases.

| Field | Type | Description |
|-------|------|-------------|
| `principal` | string | Human or org that ultimately authorized the action. Convention: `type:identifier`, e.g. `org:acme`. |
| `actor` | string | Runtime identity performing the action. Convention: `type:identifier`, e.g. `agent:claude-code-session-abc123`. |
| `delegation_chain` | array of string or `null` | Ordered list of authority grants from principal to actor. The v2.1.x through v2.3.x emitters set this to `nil`, which Go serializes as `null`; populated arrays appear once delegation tracking ships. Verifiers MUST accept both shapes and MUST re-canonicalize `null` as the literal token `null`, not as `[]`. |
| `side_effect_class` | string | See [Side effect classes](#side-effect-classes). |
| `reversibility` | string | See [Reversibility](#reversibility). |
| `policy_hash` | string | SHA-256 hash of the policy bundle that was evaluated. May be empty. |
| `chain_prev_hash` | string | Hex SHA-256 of the previous receipt's canonical envelope, or the literal string `"genesis"` for the first receipt in a session. |
| `chain_seq` | integer | Monotonic sequence number within the session, starting at `0`. |

### Optional fields (omitempty)

These fields are omitted from the canonical form when their value is empty.
"Empty" follows Go's `omitempty` rule: `""` for strings, empty array for
slices. Verifiers MUST accept receipts with any subset of these fields
present.

| Field | Type | Description |
|-------|------|-------------|
| `intent` | string | Normalized semantic purpose of the action. Free-form. |
| `data_classes_in` | array of string | Data classification labels detected in the request. |
| `data_classes_out` | array of string | Data classification labels detected in the response. |
| `method` | string | HTTP method or MCP method name for this action. |
| `layer` | string | Scanner layer that produced the verdict (e.g. `dlp`, `ssrf`). |
| `pattern` | string | Specific pattern that triggered (DLP rule name, blocklist entry, etc.). |
| `severity` | string | Severity classification of the trigger. Free-form. |
| `request_id` | string | Internal correlation ID. |
| `session_taint_level` | string | Adaptive enforcement taint level for the session. Populated when session profiling is active. |
| `session_contaminated` | boolean | Whether the session is currently flagged contaminated. |
| `recent_taint_sources` | array of object | References to the recent inputs that contributed taint to the session. |
| `session_task_id` | string | Current task ID for the session, if task tracking is on. |
| `session_task_label` | string | Human-readable task label. |
| `authority_kind` | string | Authority classification for the actor at the time of decision. |
| `taint_decision` | string | Decision the taint engine reached for this action. |
| `taint_decision_reason` | string | Free-form explanation of the taint decision. |
| `task_override_applied` | boolean | Whether a task-scoped trust override applied to this decision. |
| `venue` | string | Jurisdiction: target domain or service where the action takes effect. Reserved for the jurisdiction engine. |
| `jurisdiction` | string | Jurisdiction: governing policy identifier. Reserved. |
| `rulebook_id` | string | Jurisdiction: hash of the rulebook. Reserved. |
| `remedy_class` | string | Jurisdiction: `revert`, `compensate`, `escalate`, `none`. Reserved. |
| `contestation_window` | string | Jurisdiction: ISO 8601 duration. Reserved. |
| `precedent_refs` | array of string | Jurisdiction: receipt IDs of prior actions that informed this decision. Reserved. |

Jurisdiction fields are present in the schema for forward compatibility;
Pipelock 2.2.x does not populate them. Taint and severity fields are
populated when session profiling, adaptive enforcement, or scanner-layer
severity classification is active.

### Action types

One of: `read`, `derive`, `write`, `delegate`, `authorize`, `spend`, `commit`,
`actuate`, `unclassified`. Verifiers MUST accept all nine. Pipelock maps HTTP
methods and MCP tool calls to these via `internal/receipt/classify.go`.
Unclassified actions should be treated as high-risk.

### Side effect classes

One of: `none`, `external_read`, `external_write`, `financial`, `physical`.

### Reversibility

One of: `full`, `compensatable`, `irreversible`, `unknown`.

### Verdicts

One of: `allow`, `block`, `warn`, `ask`, `strip`, `forward`, `redirect`.
Pipelock's `NormalizeVerdict` function maps internal `config.Action*` strings
to these. Verifiers MUST NOT reject receipts on verdict value: new verdicts
may appear in future versions.

### Transports

Free-form string identifying the Pipelock surface that saw the action.
Current values emitted by the binary: `fetch`, `forward`, `intercept`,
`websocket`, `mcp_stdio`, `mcp_http`, `mcp_http_upstream`, `mcp_http_listener`,
`mcp_ws`. The MCP-side values distinguish where in the stack the action was
seen: `mcp_stdio` wraps a child process on stdio, `mcp_http` is the default HTTP
transport, `mcp_http_upstream` is the upstream-HTTP path, `mcp_http_listener` is
listener mode, and `mcp_ws` is WebSocket. The conformance corpus also uses
`https` as a representative value. Verifiers
MUST NOT reject on transport value, since the set evolves with each release.
The full table of transport-to-event mappings lives in
[`docs/guides/receipt-transports.md`](https://github.com/pipelab-org/pipelock/blob/main/docs/guides/receipt-transports.md)
in the Pipelock repo.

## Canonicalization

The signing input is the SHA-256 of the **canonical JSON** of the
`action_record` object. "Canonical" here is defined operationally as "what Go's
`json.Marshal(ar)` produces for the Pipelock `receipt.ActionRecord` struct."
The rules are:

1. **Struct-declaration field order.** Fields appear in the order they are
   declared in `internal/receipt/action.go`. This is not alphabetical.
2. **Omitempty drops zero values.** Fields tagged `omitempty` are excluded
   when the value is `""`, an empty array, `0`, `false`, or `nil`.
3. **Compact output.** No whitespace between tokens.
4. **HTML-safe escaping.** The characters `<`, `>`, `&`, U+2028, and U+2029
   are encoded as `\u003c`, `\u003e`, `\u0026`, `\u2028`, `\u2029` inside
   string values, matching Go's default `encoding/json` behavior.
5. **Unknown fields dropped.** Fields not in the v1 schema are ignored on
   re-serialization (matches Go's struct-driven marshalling).

These rules are mechanical and testable. The Python verifier reproduces them
in `pipelock_verify/_canonical.py`; any divergence breaks the conformance
suite immediately.

Example canonical action record (with whitespace added for readability):

```json
{
  "version": 1,
  "action_id": "conformance-00000",
  "action_type": "write",
  "timestamp": "2026-04-15T12:00:00Z",
  "principal": "org:conformance-test",
  "actor": "agent:conformance-runner",
  "delegation_chain": ["test-policy-v1", "test-grant"],
  "target": "https://api.example.com/conformance",
  "side_effect_class": "external_write",
  "reversibility": "compensatable",
  "policy_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "verdict": "allow",
  "transport": "https",
  "method": "POST",
  "chain_prev_hash": "genesis",
  "chain_seq": 0
}
```

## Signing

```text
signing_input  = canonicalize_action_record(receipt.action_record)
signing_hash   = SHA-256(signing_input)
signature_raw  = Ed25519_Sign(private_key, signing_hash)
receipt.signature = "ed25519:" + hex(signature_raw)
receipt.signer_key = hex(public_key)
```

Pipelock signs the SHA-256 *digest*, not the raw canonical bytes. This matches
the Go reference in `internal/receipt/receipt.go`. Verifiers MUST hash the
canonical bytes before calling `Ed25519_Verify`.

## Verification

Given an envelope and an optional trust anchor:

1. Reject if `version != 1`.
2. Reject if `action_record.version != 1`.
3. Reject if any of the seven [required fields](#required-fields) is missing
   or empty: `version`, `action_id`, `action_type`, `timestamp`, `target`,
   `verdict`, `transport`. The shipped `receipt.Validate()` enforces exactly
   this set.
4. Reject if `action_type` is not one of the recognized values in
   [Action types](#action-types).
5. Reject if `signature` does not start with `ed25519:`.
6. Hex-decode the signature. Reject if the decoded length is not 64 bytes.
7. Hex-decode `signer_key`. Reject if not 32 bytes.
8. If a trust anchor was supplied, reject if `signer_key` does not match.
9. Canonicalize `action_record`, SHA-256 it, and call `Ed25519_Verify` with
   the decoded signature and public key.

Failure at any step means the receipt is invalid. There is no partial
success.

**Note:** the Go reference verifier does not currently reject receipts
solely because optional or always-present fields (such as `principal`,
`actor`, `policy_hash`, `chain_prev_hash`, or `chain_seq`) are empty.
Independent verifiers MAY add their own stricter checks, but to remain
interoperable with `pipelock verify-receipt` they MUST NOT reject receipts
that pass the seven-field check above.

## Chain linkage

Receipts within a session form a hash chain:

* `chain_seq` starts at `0` and increments by exactly `1` per receipt.
* `chain_prev_hash` of the first receipt is the literal string `"genesis"`.
* `chain_prev_hash` of every subsequent receipt is the hex SHA-256 of the
  **canonical receipt envelope** of the previous receipt, not just its
  action record. The envelope hash includes the signature and the
  `signer_key`, which binds the chain to a specific signer.
* Verifiers MUST also enforce signer consistency: every receipt in a chain
  must share the same `signer_key` (or match the trust anchor, if one was
  supplied). Splicing in receipts from another signer is an attack, not a
  rotation event.

To verify a chain, walk it in seq order. Any mismatch in seq, `prev_hash`, or
signer identifies the first break. See `receipt.VerifyChain` in the Go
reference.

## Transport wrapping

Pipelock does not usually write bare receipts. The flight recorder wraps
each receipt in an `Entry` object alongside its own hash chain:

```json
{
  "v": 1,
  "seq": 42,
  "ts": "2026-04-15T12:00:03.456Z",
  "session_id": "pipelock-proxy",
  "type": "action_receipt",
  "transport": "https",
  "summary": "receipt: allow write https",
  "detail": { /* the Receipt envelope */ },
  "prev_hash": "<prev entry hash>",
  "hash": "<this entry hash>"
}
```

There are now **two chains** to think about:

1. The **entry chain** on `prev_hash` / `hash` at the flight-recorder level.
   Covers every entry type (receipts, checkpoints, other events). Proves
   nothing was inserted, deleted, or reordered in the log itself.
2. The **receipt chain** on `action_record.chain_prev_hash` /
   `action_record.chain_seq` inside the `detail` field. Covers only the
   receipts within a session. Proves agent actions were not forged or
   dropped.

Both chains are independently verifiable. `pipelock verify-receipt` and
`pipelock_verify.verify_chain()` both verify the receipt chain. The entry
chain is verified by `recorder.VerifyChain` inside Pipelock.

A single-receipt JSON file (the bare envelope with no flight-recorder
wrapping) is what `pipelock verify-receipt receipt.json` consumes when the
target path does not end in `.jsonl`. Pipelock 2.1.x does not ship a
dedicated CLI subcommand for producing these standalone files; the usual
way to obtain one is to extract an entry's `detail` field from the
flight-recorder JSONL, or to consume a receipt from an out-of-band channel
such as an HTTP response header or a webhook payload.

## Conformance

The corpus at
[`sdk/conformance/testdata/`](https://github.com/pipelab-org/pipelock/tree/main/sdk/conformance/testdata)
is the authoritative contract. Five files generated by deterministic Go code
from a fixed seed, regenerable with:

```bash
go test ./sdk/conformance/ -run TestGenerateGoldenFiles -update
```

| File | Purpose |
|------|---------|
| `test-key.json` | Deterministic Ed25519 keypair. Seed is `sha256("pipelock-conformance-test-key-v1")`. Test key only; never use in production. |
| `valid-single.json` | One valid receipt at seq 0, `prev_hash = "genesis"`. |
| `valid-chain.jsonl` | Five-receipt chain wrapped in flight-recorder entries. |
| `invalid-signature.json` | Otherwise-valid receipt with one byte flipped in the signature. Verification MUST fail with "signature verification failed". |
| `broken-chain.jsonl` | Five flight-recorder entries with an intentional `chain_prev_hash` break at seq 3. Individual signatures all valid; chain verification MUST report `broken_at_seq = 3`. |

Any implementation that claims to verify Pipelock receipts MUST produce the
same pass/fail verdict as Go, TypeScript, Rust, and Python on every file in this corpus.

## Security properties

A receipt proves the mediator recorded a specific attempted action and reached a
specific decision. It does NOT prove:

* That the action's effects were as described (the target service could have
  failed; use countersignatures for dispositive evidence).
* That no other actions occurred outside the mediation boundary (that
  requires process containment in the agent runtime).
* That the mediator was not compromised (a compromised mediator can forge
  receipts; rely on independent attestation for defense in depth).
* That the deploying operator is honest. The operator holds the signing key,
  so a keyholder can fabricate a clean chain. Operator-independent evidence
  requires external transparency-log anchoring with `pipelock anchor receipts --backend rekor`
  and pinned Rekor log keys; the local anchor backend is not operator-independent.

The evidentiary value of a receipt depends on **capability separation**: the
agent must not have access to the mediator's signing key. Pipelock's
architecture enforces this (the agent has no network access, the proxy has
no agent secrets), but the deployment has to preserve that boundary.

## EvidenceReceipt v2 (v2.4)

`v2.4.0` introduces a second receipt envelope, **EvidenceReceipt v2**, alongside
the ActionReceipt v1 format documented above. Both envelopes ship in the same
release. v1 keeps emitting unchanged; v2 covers contract lifecycle and shadow
evidence for the new learn-and-lock pipeline.

The two envelopes are distinguished by a top-level `record_type` field rather
than by reusing the `version` integer. v1 verifiers reject v2 with the explicit
error `unsupported version 2 (expected 1)`, so the existing audit pipeline
keeps working unchanged for non-contract-aware deployments.

### Payload kinds

EvidenceReceipt v2 carries one of thirteen typed payloads:

| Payload kind | Emitted when |
|---|---|
| `proxy_decision` | Built by `runtime.BuildProxyDecisionReceipt` and emitted from the live-lock arc in v2.4 for contract-aware proxy decisions. The v1-to-v2 cutover for non-contract decisions is sequenced as a follow-up sweep so the existing audit pipeline keeps working unchanged for non-contract-aware deployments. |
| `contract_ratified` | An operator ratified one or more rules of a candidate contract. |
| `contract_promote_intent` | Phase-one of the two-phase commit that swaps the active manifest. |
| `contract_promote_committed` | Phase-two: the active manifest swap succeeded. |
| `contract_rollback_authorized` | A signed rollback authorisation was recorded. |
| `contract_rollback_committed` | The rollback completed and the active manifest reverted. |
| `contract_demoted` | A rule moved out of `enforce` (operator-driven in v2.4). |
| `contract_expired` | A rule reached its lifecycle expiry. |
| `contract_drift` | An observed action diverged from the active contract; carries `drift_kind`. |
| `shadow_delta` | A shadow-replay verdict differed from the live decision. |
| `opportunity_missing` | A rule's parent opportunity dropped (auto-demotion is BLOCKED in this case). |
| `key_rotation` | A signing key was rotated. |
| `contract_redaction_request` | `pipelock learn forget` removed a rule and emitted a tombstone. |

### Canonicalization, key purposes, and the verifier

EvidenceReceipt v2 canonicalizes via RFC 8785 JCS over typed structures (not raw YAML or JSON bytes), enforces strict unknown-field rejection recursively in every signed object, and binds the active manifest hash, contract hash, selector ID, and contract generation under signature so replayed evidence cannot impersonate a different policy generation.

Pipelock distinguishes four product key purposes; verifiers reject signatures from the wrong purpose:

- `receipt-signing` (hot, ~90-day rotation): every individual receipt.
- `contract-compile-signing` (warm, ~yearly): candidate contracts and compile manifests.
- `contract-activation-signing` (cold operator key): the active manifest. Production deployments require two distinct operator signatures (dual control).
- `rules-official-signing` (release key): official rules bundles.

Two deployment-level keys back the purpose keys:

- `roster-root` signs the deployment's key roster (which keys the deployment trusts for which purpose).
- `recovery-root` is separate and pinned for break-glass recovery if the roster-root is compromised.

### `pipelock-verify-python` 0.2.0

A `pipelock-verify-python` 0.2.0 update is prepared alongside Pipelock v2.4.0. It adds:

- EvidenceReceipt v2 verification for all 13 payload kinds.
- RFC 8785 JCS canonicalization.
- An RFC 9421 well-known directory fetch helper so verifiers no longer pin a SHA out of band.
- A key-purpose authority matrix that rejects valid signatures from the wrong purpose or wrong root.

Until 0.2.0 is published on PyPI, use the Go reference verifier for EvidenceReceipt v2. ActionReceipt v1 verification is unchanged in 0.1.x. Auditors verifying v1 chains see no behaviour change.

The prepared 0.2.0 API surface looks like this:

```python
# Available once pipelock-verify-python 0.2.0 lands on PyPI.
from pipelock_verify import fetch_directory, verify

directory = fetch_directory("https://pipelock.example.com")
result = verify(receipt, trusted_directory=directory)
if not result.valid:
    raise SystemExit(f"verification failed: {result.error}")
```

See the [federation guide](/learn/mediation-envelope-signing/#well-known-directory) and the [learn-and-lock guide](/learn/learn-and-lock/) for how the receipt stream pairs with the activation lifecycle.

## Evolution

Pipelock now emits two envelopes side by side:

- ActionReceipt v1, documented on this page, for proxy action evidence.
- EvidenceReceipt v2, documented above, for contract-lifecycle and shadow evidence.

A future migration that consolidates v1 traffic into the v2 envelope would:

1. Land additive on the v2 schema (no re-pin of v1 fixtures).
2. Ship dual-emit mode so existing relying parties keep verifying while migrating.
3. Update the conformance corpus with paired v1 and v2 fixtures.

Until that migration lands, v1 remains the canonical format for proxy action receipts and v2 covers contract evidence.

## Reference

* **Go reference implementation**: <https://github.com/pipelab-org/pipelock/tree/main/internal/receipt>
* **`pipelock verify-receipt` CLI**: ships with every Pipelock release.
* **Standalone `pipelock-verifier` binary**: <https://github.com/pipelab-org/pipelock/tree/main/cmd/pipelock-verifier>. Self-contained, drop-in for CI / auditor / third-party use. Shares the Go reference implementation in `internal/receipt`. Subcommands: `audit-packet`, `chain`, `receipt`. Distributed as a separate GoReleaser archive across linux/darwin/windows × amd64/arm64.
* **TypeScript verifier** (independent codebase): <https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/ts>
* **Rust verifier** (independent codebase): <https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/rust>. `audit-packet`, `chain`, `receipt` subcommands. Go-compatible canonical JSON, schema validation, strict Ed25519, chain replay, packet cross-checks, tested against the shared conformance fixtures.
* **Python verifier** (independent codebase): <https://github.com/pipelab-org/pipelock-verify-python>. `pip install pipelock-verify` ships `0.1.x` for ActionReceipt v1; `0.2.0` (EvidenceReceipt v2) prepared in repo, PyPI publish pending.
* **Audit Packet v0 JSON Schema**: [pipelab.org/schemas/audit-packet-v0.schema.json](/schemas/audit-packet-v0.schema.json) (sources at <https://github.com/pipelab-org/pipelock/tree/main/sdk/audit-packet>)
* **Conformance corpus**: <https://github.com/pipelab-org/pipelock/tree/main/sdk/conformance/testdata>
* **Flight recorder format**: [Flight Recorder: AI Agent Audit Log](/learn/flight-recorder/)
* **CI integration that emits these receipts**: [Agent Egress Control (GitHub Action)](/learn/agent-egress-control/)
* **Trust model for verified packets**: [Audit Packet Threat Model](/learn/audit-packet-threat-model/), the canonical statement of what a verified Audit Packet proves, what it does not prove, and the trust assumptions a relying party should pin.
* **AARP v0.1 assurance profile**: [/learn/aarp-spec/](/learn/aarp-spec/), the profile that appraises a signed receipt and separates verified claims from producer claims.
* **Agent action receipts primer**: [/learn/agent-action-receipts/](/learn/agent-action-receipts/), the procurement-and-audit framing for the format.
* **Verifiable egress control umbrella**: [/learn/verifiable-egress-control/](/learn/verifiable-egress-control/), the category that combines binary-enforced mediation with signed evidence.
* **End-to-end demo**: [What did my agent do?](/learn/what-did-my-agent-do/), request, bad response, verdict, signed receipt, verifier output.
* **Procurement rubric**: [Agent Security Tool Profiles](/learn/agent-security-tool-profiles/), the five-dimension receipt-scoring rubric and the procurement question a published profile answers.
* **How other evidence tools compare**: [Pipelock vs agent evidence tools](/compare/pipelock-vs-agent-evidence-tools/) and [Pipelock vs Attested Intelligence](/compare/pipelock-vs-attested-intelligence/), receipt format, verifier, key custody, and recorder position side by side.
* **Regulatory mapping**: [AI Agent Regulatory Controls Hub](/learn/ai-agent-regulatory-controls/), receipts mapped to EU AI Act, DORA, NIS2, NIST AI RMF, ISO 42001, Colorado AI Act, SOC 2.

Report spec bugs or clarification requests at
<https://github.com/pipelab-org/pipelock/issues>.
