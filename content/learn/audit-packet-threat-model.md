---
title: "Audit Packet Threat Model: What Verified Receipts Prove"
linkTitle: "Audit Packet Threat Model"
seoTitle: "Audit Packet Threat Model: What Receipts Prove"
subtitle: "What a verified Pipelock Audit Packet proves, what it does not prove, and the trust assumptions a relying party should pin."
description: "Threat model for the Pipelock Audit Packet. Receipt provenance, self-consistent verdicts, signer-key pinning, what verified evidence does not prove."
date: 2026-05-17
lastmod: 2026-05-17
learn_cat: operator
level: ref
tags:
  - audit-packet
  - threat-model
  - receipts
  - ed25519
---

[Pipelock](/pipelock/) writes an Audit Packet after every mediated agent run. The packet pairs a verifier verdict over a chain of Ed25519-signed action receipts with the enforcement posture that produced them. The first producer is the [Pipelock Agent Egress Control](/learn/agent-egress-control/) GitHub Action; producers on other CI surfaces follow the same schema.

This page is the threat model for the packet. It describes what a verified packet does and does not prove about the run, and the trust assumptions a relying party (CISO, auditor, downstream platform, procurement reviewer) should pin before treating a `valid` verdict as provenance.

The canonical text lives in the Pipelock repository at [`docs/security/audit-packet-threat-model.md`](https://github.com/luckyPipewrench/pipelock/blob/main/docs/security/audit-packet-threat-model.md). This page is the public-web restatement. When the two drift, the in-repo file wins.

## What a verified packet proves

A packet whose chain hashes correctly and whose receipts verify against a pinned Pipelock signer key proves the following about traffic that crossed the Pipelock control point:

- Receipts in the chain were signed by the holder of the pinned signer key at the time written.
- The hash chain is intact. No receipt was modified, removed, or reordered after emission without breaking every receipt that follows.
- Each emitted receipt records the policy hash and posture metadata in force at signing time, so a reviewer can confirm the run executed under the declared configuration.
- Decision counts in the summary reconcile with the chain. The standalone `pipelock-verifier` cross-checks the packet's claimed totals, root hash, and final sequence against the actual chain on every invocation.

Receipts are signed by Pipelock at the network boundary, not by the agent process. Verification of the slice the receipts cover does not depend on the agent transcript. It still depends on the signer, binary, wrapper, workflow, and runner-boundary assumptions below.

## What a verified packet does not prove

Five categories sit outside the packet's evidentiary scope. Each is real, and each is a category where a hostile reader will press.

### 1. Traffic that did not cross the Pipelock control point

The chain records what Pipelock observed. It is silent about traffic that bypassed Pipelock entirely. In the egress-action's v0 boundary, that includes sibling workflow steps, DNS / raw TCP / UDP outside the namespace, workflow artifact uploads, step outputs, log writes, service containers and Docker daemons reachable by paths Pipelock does not see, SSH git pushes in v0, and egress from macOS and Windows runners. HTTPS git pushes traverse the control point when routed through the action boundary, but unintercepted CONNECT exposes connection metadata, not git pack contents.

A missing receipt is not a proof of absence. The packet does not enumerate traffic Pipelock should have seen but did not. Complement with runner-level network telemetry if the threat model needs negative-space evidence.

The current set of paths the Pipelock binary itself does not intercept is documented at [`docs/security/current-unsupported-paths.md`](https://github.com/luckyPipewrench/pipelock/blob/main/docs/security/current-unsupported-paths.md). The egress-action's v0 boundary is documented at [Agent Egress Control](/learn/agent-egress-control/).

### 2. Compromised runner environment

A verified packet does not prove the runner was honest. If the kernel, the runner image, the workflow harness, the action wrapper, or any earlier privileged step is compromised before Pipelock initialises, the packet inherits that compromise in three ways:

- Pipelock binary integrity. A compromised runner can swap the pinned `pipelock` binary for one that signs receipts of the attacker's choosing if it can also use the configured signing key, or if the relying party accepts a runner-supplied key. Pin the binary checksum, pin the signer public key from a source outside the runner, and verify both before treating the packet as provenance.
- Signing-key exfiltration. A process with code execution as the Pipelock service account, with capabilities to read its memory, or with iptables override rights can extract the signing key. Receipts signed thereafter are indistinguishable from honest receipts at verify time. Rotate the signer key per run from a key custody system outside the runner, or use an ephemeral signer that the relying party knows to treat as `self_consistent_only`.
- Pre-Pipelock exfiltration. Any byte that leaves the runner before Pipelock's iptables rules are in force is invisible to the chain. Minimise the secret surface available to earlier workflow steps; treat the wrapped agent script as the sole secret-bearing step in the job.

### 3. Sibling-step and out-of-band channels

The egress-action v0 boundary covers the script executed inside the action. It does not contain other actions in the caller workflow. A relying party reading the packet learns nothing about other actions in the same job that received secrets via the workflow `env:` mapping, steps that ran before the Pipelock action and emitted data via the workflow `outputs:` channel for later consumption, or job-level and workflow-level artifact uploads.

Structure the workflow so the wrapped agent script is the only step that holds the secret material.

### 4. Self-consistent-only verdicts

The verifier returns `self_consistent_only` when the chain hashes correctly but no signer key was pinned. This verdict proves internal consistency, not Pipelock provenance. A `self_consistent_only` packet is consistent with an honest Pipelock run whose operator declined to pin a key, a run that synthesised receipts after the fact and hashed them into a consistent chain, or a run whose signing key was generated by an attacker and discarded after.

Consumers must distinguish `self_consistent_only` from `valid` and refuse to treat the former as provenance. The schema requires the verifier-verdict enum to include `self_consistent_only` so consumers cannot conflate the two. Conformance fixtures include both verdict cases; consumers that test against the fixtures catch conflation at integration time.

### 5. Future tampering of artefacts at rest

The chain detects tampering of receipts already in the chain. It does not detect substitution of the entire packet by a different packet, or removal of the packet entirely. A relying party who receives the packet from an untrusted channel must validate the receipt of the packet itself (artefact hash, sender authentication, ingestion timestamp) using the surrounding evidence pipeline. The Audit Packet does not include those properties because they belong to the transport, not to the run.

## Trust assumptions

A verified packet's evidentiary value depends on eight assumptions. If any fails, the verdict says less than it appears to.

1. The pinned signer key was obtained from a source outside the run environment. A key fetched from inside the same potentially compromised environment is not pinned in the sense this threat model uses.
2. The verifier runs outside the run environment. The Go, Rust, TypeScript, and Python verifiers all run offline and need no network surface.
3. The Pipelock binary matches the expected artifact. A valid chain from an unpinned or swapped binary proves only that some binary holding the signing key emitted those receipts.
4. The wrapper that creates the boundary matches the expected action revision. Pin the GitHub Action by full-length commit SHA. Signed tags help identify publisher intent, but tag names can be repointed.
5. The workflow boundary is scoped correctly. The wrapped script should be the only secret-bearing step in the job. Sibling steps, earlier steps, artifact uploads, and workflow outputs are outside the packet's evidence boundary.
6. The receipt schema was not silently changed. The `v0` schema is frozen in `sdk/audit-packet/v0.json`. A producer that emits a packet claiming `schema_version: v0` but with a divergent shape fails schema validation in the verifier.
7. The relying party reads the verifier verdict and posture, not just the summary. The summary file is human-friendly Markdown; posture fields and the verifier verdict are the contract.
8. The cryptographic primitive is not yet broken. Ed25519 is the current signing algorithm. The schema version is the rotation point for primitive changes.

## Operational requirements for a usable packet

A relying party who wants the packet to carry weight in their evidence pipeline should require the producer to satisfy these:

- Signer key pinned from a source outside the run environment.
- Pipelock binary pinned by checksum.
- Pipelock action pinned by full-length commit SHA. Tags are mutable; short SHAs are prefix identifiers, not immutable release anchors.
- Verifier run outside the run environment.
- Workflow scoped so the wrapped step is the sole secret-bearing step in the job.
- Packet transport authenticated. Artefact hash captured, sender authenticated, ingestion timestamp recorded.
- Verifier verdict consumed structurally (`valid` vs `self_consistent_only` vs others), not from the Markdown summary.

Producers that meet all seven make a `valid` verdict useful as provenance: Pipelock signed these receipts, under a pinned producer and a bounded workflow. Producers that skip signer-key pinning should expect `self_consistent_only`; producers that skip other requirements may still get `valid`, but the verdict carries weaker evidentiary weight.

## See also

- [Agent Egress Control](/learn/agent-egress-control/) for the action setup guide and the v0 enforcement boundary.
- [Pipelock Action Receipt Format](/learn/action-receipt-spec/) for the on-wire receipt structure and verifier implementations.
- [AARP: Proves / Does Not](/learn/aarp-what-it-proves/) for the assurance profile's narrower receipt-level trust boundary.
- [`docs/security/audit-packet-threat-model.md`](https://github.com/luckyPipewrench/pipelock/blob/main/docs/security/audit-packet-threat-model.md) for the canonical in-repo text.
- [`docs/security/current-unsupported-paths.md`](https://github.com/luckyPipewrench/pipelock/blob/main/docs/security/current-unsupported-paths.md) for the binary-level egress paths Pipelock does not currently intercept.
