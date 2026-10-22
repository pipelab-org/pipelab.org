---
title: "Parallel Signed Receipt Chains in Pipelock"
linkTitle: "Parallel Signed Receipt Chains"
description: "Configure parallel signed receipt chains in Pipelock, verify the complete group, handle restart and recovery seals, and retain honest end proofs."
date: 2026-10-13
learn_cat: evidence
level: intermediate
---

Parallel receipt chains let a Pipelock process record concurrent work without putting all requests on one receipt sequence. Each request stays on one chain for its decisions, outcomes and evidence. Signed group openings, closes and successor transitions bind those chains together. These controls are free.

## Configure and restart

Set the chain count under the existing flight recorder configuration:

```yaml
flight_recorder:
  receipt_chains: 8
```

The default is 1; the accepted range is 1 through 32. Apply a count change by restarting Pipelock. Reload keeps the old count with a warning. Preserve the entire recorder directory, signing-key history and any independently retained opening digest. This setting doesn't promise a specific throughput.

Required receipts still need `flight_recorder.require_receipts: true`. Covered effects wait for the durable records of every configured receipt family. A disk sync failure with required receipts and multiple chains stops the whole group and process. Fix storage before restarting. Denied actions retain best-effort receipts; this isn't a promise of one receipt for every byte or clean streaming frame.

## Verify the group

A valid shard doesn't prove a complete group. Group verification distinguishes `GROUP_VALID`, `GROUP_INCOMPLETE` and `GROUP_INVALID` and checks the signed lifecycle binding. Keep all shards together.

The published TypeScript and Rust verifier packages at 0.6.5 support whole-group checks. Their command shapes are `chain --dir --group ID` and `group --group-id ID`. Python `pipelock-verify` 0.4.1 accepts the signed group binding on individual shards but doesn't verify the group. Confirm the installed artifact's command support before relying on it. The browser verifier keeps its 8 MiB compressed and 32 MiB uncompressed bundle limits.

An intact open prefix now reports `VALID PREFIX, END UNPROVEN` and exits 3. Use a signed group close, a recorder transcript seal with `--whole-recorder`, or an independently retained expected head where supported to establish the end. `--allow-prefix` accepts an open prefix but keeps that label. Read [why a valid receipt chain can still be cut short](/blog/a-valid-receipt-chain-can-still-be-cut-short/) before treating integrity as proof of a completed run.

## Restart, recover and inspect

Multi-chain automatic anchoring isn't supported. A signing-key change closes the group and requires supervised restart. Normal restarts verify the retained predecessor before linking it; restart time grows with history. Startup progress extends systemd's wait only while verification progresses, and readiness follows verification and listener binding.

Signed recovery seals attest the exact torn predecessor bytes and the new opening. They report an attested discontinuity while retaining the damaged history's failure. A seal can't make damaged evidence a clean chain. Keep the predecessor and use compatible verifiers.

Native AEL streams have a 256 MiB verifier ceiling, and the writer doesn't cap them. An over-ceiling run can't close with a valid verification result. Multi-chain restart over it refuses; single-chain restart leaves it unverifiable. Measure your traffic and restart before any stream reaches that ceiling. `/stats` exposes per-chain health and anchor coverage, but display readers don't substitute for whole-group verification.

Read the [source verification guide](https://github.com/pipelab-org/pipelock/blob/main/docs/guides/receipt-verification.md#receipt-groups-with-multiple-chains), [flight recorder guide](/learn/flight-recorder/), and [v3.7 upgrade actions](/learn/pipelock-v370-upgrade/). Review the bounded receipt-content search before using the throughput changes as a security claim.

A chain that verifies is tamper-evident, which is not the same as evidence. [What a hash chain can't prove](/blog/what-a-hash-chain-cant-prove/) covers the two questions that decide that, who holds the key and where the recorder sits, and [a valid receipt chain can still be cut short](/blog/a-valid-receipt-chain-can-still-be-cut-short/) covers the end-proof case.
