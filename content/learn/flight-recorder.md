---
title: "Flight Recorder: AI Agent Audit Log"
linkTitle: "Flight Recorder"
related:
  - verifiable-egress-control
  - action-receipt-spec
  - agent-evidence-detection-integration
subtitle: "Hash-chained audit trail with cryptographic proof of ordering."
description: "AI agent audit log with hash-chained, tamper-evident entries. Pipelock's flight recorder writes DLP-redacted JSONL with Ed25519 signed checkpoints."
date: 2026-03-29
learn_cat: operator
level: ref
tags:
  - audit
  - hash-chain
  - ed25519
---

The flight recorder is Pipelock's AI agent audit log. It writes every scan decision, policy action, and session event to a tamper-evident JSONL log. Each entry includes the SHA-256 hash of the previous entry, forming a chain that proves no records were inserted, deleted, or reordered after the fact.

## Parallel chains and end proofs in v3.7

`flight_recorder.receipt_chains` accepts 1 through 32 and defaults to 1. Each request stays on one chain; signed group lifecycle records bind the shards together. Changing the count requires restart, and a shard verdict doesn't establish group completeness. Use the [parallel receipt guide](/learn/parallel-receipt-chains/) before enabling it.

An intact prefix without an end proof reports `VALID PREFIX, END UNPROVEN` and exits 3. For recorder directories, `pipelock verify-receipt --chain ./recorder --whole-recorder --key trusted-signing.pub` checks the transcript seal. `--allow-prefix` accepts an intentional open prefix while retaining that label. Signed recovery seals attest discontinuity without making a damaged predecessor valid.

Required receipts wait for every configured family's durable record before the covered effect. With required receipts and multiple chains, a disk sync failure stops the group and process. Native evidence streams have a 256 MiB verifier ceiling that the writer doesn't cap. Receipt-content fragment reassembly also has documented search limits. Read the [v3.7 upgrade actions](/learn/pipelock-v370-upgrade/) before changing automation or sustained-load recording.

## Hash Chain

Every evidence entry contains these fields:

| Field | Description |
|-------|-------------|
| `seq` | Monotonic sequence number starting at 0 |
| `ts` | RFC 3339 timestamp (UTC) |
| `session_id` | Session that produced the entry |
| `type` | Entry type (request, decision, checkpoint) |
| `transport` | Which proxy surface (fetch, forward, websocket, mcp) |
| `summary` | Human-readable description |
| `detail` | Structured event payload |
| `prev_hash` | SHA-256 hash of the previous entry |
| `hash` | SHA-256 hash of this entry (computed over all fields except `hash` itself) |

The first entry in any chain uses the sentinel value `"genesis"` as its `prev_hash`. The hash is computed over all fields concatenated with null-byte separators to prevent field-boundary ambiguity.

To verify a chain, walk from the first entry and confirm each `prev_hash` matches the `hash` of the preceding record. Any gap, insertion, or modification breaks the chain.

## Signed Checkpoints

At configurable intervals (default: every 1,000 entries), the recorder writes a checkpoint entry. When `sign_checkpoints` is enabled and a signing key is available, the checkpoint includes an Ed25519 signature over the current chain state. This provides periodic cryptographic proof that the chain was intact at the time of signing.

## Redaction

When `redact` is enabled, the recorder runs DLP scanning on each entry's `detail` field before writing it. If any patterns match, the detail is replaced with a redaction wrapper that lists which patterns were detected, along with the original payload size. The actual content is not written to the evidence file.

For incident response, enable `raw_escrow` alongside redaction. This encrypts the original unredacted detail with X25519 (NaCl box) using an escrow public key you provide. The encrypted sidecar files can only be decrypted with the corresponding private key, which you hold offline.

## Configuration

```yaml
flight_recorder:
  enabled: true
  dir: /var/lib/pipelock/evidence
  checkpoint_interval: 1000
  retention_days: 90
  redact: true
  sign_checkpoints: true
  max_entries_per_file: 10000
  raw_escrow: false
  escrow_public_key: ""
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `false` | Turn on the flight recorder |
| `dir` | (required) | Directory for evidence JSONL files |
| `checkpoint_interval` | `1000` | Entries between signed checkpoints |
| `retention_days` | `0` (forever) | Auto-expire files older than N days |
| `redact` | `true` | DLP-scan entries before writing |
| `sign_checkpoints` | `true` | Ed25519 sign checkpoint entries |
| `max_entries_per_file` | `10000` | Rotate to a new file after N entries |
| `raw_escrow` | `false` | Write encrypted raw detail sidecars |
| `escrow_public_key` | (empty) | X25519 public key hex for escrow encryption |

## File Layout

Evidence files are named `evidence-<session_id>-<start_seq>.jsonl`. When `raw_escrow` is enabled, encrypted sidecars are written as `evidence-<session_id>-<seq>.raw.enc` alongside the JSONL files. Files are rotated after `max_entries_per_file` entries.

All files are written with `0600` permissions. The evidence directory is created with `0750` permissions.

## Verification

To verify a file externally, compute SHA-256 over the file contents and compare. Pipelock provides `ComputeFileHash` for programmatic verification. For chain integrity, parse each JSONL line, recompute the hash, and confirm it matches the recorded `hash` and that `prev_hash` links to the previous entry.

---

[Back to Pipelock](/pipelock/) | [Proof](/proof/) | [Signed assessment reports](/assess/)
