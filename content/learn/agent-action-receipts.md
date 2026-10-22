---
title: "Agent Action Receipts: Signed Evidence for What an AI Agent Did"
linkTitle: "Agent Action Receipts"
related:
  - verifiable-egress-control
  - action-receipt-spec
  - what-did-my-agent-do
seoTitle: "Agent Action Receipts: Signed AI Audit Evidence"
subtitle: "Receipts or it didn't happen. A signed, hash-chained record of every adjudicated agent action that any third party can verify offline."
description: "Agent action receipts: Ed25519-signed records of AI agent network and tool actions, chained by hash, verifiable offline by any third party."
date: 2026-05-21
lastmod: 2026-09-29
learn_cat: evidence
level: intro
tags:
  - receipts
  - evidence
  - audit
  - ed25519
faq:
  - q: "What is an agent action receipt?"
    a: "An agent action receipt is a self-contained, Ed25519-signed record that the mediator recorded an attempted action, inspected it, and returned a specific verdict. The receipt includes the action type, target, principal, delegation chain, policy hash, verdict, transport, and method. It is signed from outside the agent trust boundary so verification does not depend on the agent's own logs. Receipts chain by hash so tampering with any one of them breaks every receipt that follows."
  - q: "Why receipts instead of logs?"
    a: "Logs are produced inside the trust boundary. A compromised agent can rewrite its own logs. A receipt is signed by a mediator outside the agent process and is verified against a pinned public key by a separate verifier binary. The verification step does not need to trust the agent, the logs, or the vendor dashboard. The verifier reads bytes, recomputes a hash, runs Ed25519, and emits accept or reject. That is the evidence property that logs do not have."
  - q: "How do I get an audit trail of what my AI agent did?"
    a: "Put Pipelock on the agent's network or MCP path, configure a flight recorder, and configure receipt signing with a mediator signing key. Pipelock records each mediated HTTP, MCP, or WebSocket decision as structured evidence. With receipt signing enabled, those records become Ed25519-signed, hash-chained receipts that a third party can verify offline."
  - q: "Who needs an agent action receipt?"
    a: "Auditors performing a SOC 2, HIPAA, or PCI engagement that includes AI agent operations. Procurement teams writing AI-vendor questionnaires. CISOs answering 'show me what the agent did.' Customers asking their vendor to prove agent actions stayed inside policy. Insurance underwriters pricing AI-agent operational risk. Internal counsel building defensible records for delegated machine action."
  - q: "How is this different from agent-audit tools like agent-audit-trail-mcp or AgentAudit?"
    a: "Other agent-audit tools record what the agent did from inside the agent runtime. They serve well as developer tooling. Receipts come from outside the agent runtime, are signed by an independent mediator, and verify offline against a pinned public key. The distinction is independent attestation versus self-attestation. Both have value; only the independent-attestation form produces evidence a third party can rely on without trusting the agent."
  - q: "Is the format proprietary to Pipelock?"
    a: "The Pipelock implementation is the current reference, but the format is published as a JSON Schema at pipelab.org/schemas/audit-packet-v0.schema.json, the conformance corpus is public at agent-egress-bench/receipts/v0/conformance/, and verifier implementations exist in Go, TypeScript, Rust, and Python. Receipts are open evidence, not vendor-locked logs. The longer arc is to lift the primitive into existing standards bodies (CoSAI, IETF, OASIS) rather than to keep it as a Pipelock-controlled format."
  - q: "What does a relying party do with the receipt?"
    a: "Fetch the receipt and the producer's public key out-of-band, then run a verifier with that key pinned. Check the exit contract for that verifier and version. In v3.7.0, the built-in verifier and the standalone Go verifier report exit 3 when chain signatures and linkage are valid but the end is unproven. TypeScript and Rust 0.6.5 do the same. Python 0.4.1 checks receipt signatures and chain linkage but has no end-proof or group verification, so exit 0 can still mean a truncated chain. Use the verify-a-receipt walkthrough for commands, exit codes and conformance fixtures."
---

Most agent security tools tell you what the agent did from inside the
agent. An action receipt tells you what the agent did from outside,
signs the record with a key the agent cannot reach, and lets any third
party verify the record without trusting a vendor dashboard.

That is the difference between a log and evidence.

## Verifiable AI agent actions

Verifiable AI agent actions need more than a timestamped log line. They need a record from outside the agent process and a verifier that rejects tampered evidence without calling the original vendor. The [what did my agent do](/learn/what-did-my-agent-do/) page walks a full audit trail end to end.

Pipelock produces verifiable actions when the agent is forced through the proxy, the flight recorder is enabled, and receipt signing is configured with a mediator signing key. Each decision is recorded, hash-linked to the prior decision, and signed for offline review.

| Audit property | Signed action receipt | Plain log |
| --- | --- | --- |
| Producer | Mediator outside the agent trust boundary | Usually the agent, host, app, or vendor service |
| Tamper evidence | Ed25519 signature plus hash-chain linkage | Depends on the log store |
| Offline verification | Yes, with a pinned public key and verifier | Usually no |
| Policy proof | Includes policy hash in the action record | Often implied or missing |
| Audit use | Third-party evidence for AI agent audit logs and compliance review | Operational debugging and monitoring |

## What a receipt is

A receipt is a JSON record with three parts:

- An **action_record** describing what happened: action type, target,
  principal, delegation chain, policy hash, verdict, transport, method,
  and a chain pointer to the prior receipt.
- An **Ed25519 signature** over `SHA-256(canonical-JSON(action_record))`.
- The **signer_key** as a 32-byte hex string.

The exact bytes are documented in the
[action receipt spec](/learn/action-receipt-spec/). Two important
properties of the format:

1. **Signed from outside the agent.** When receipt signing is configured,
   Pipelock signs receipts from the mediator process. The agent has no access to the signing key. A
   compromised agent cannot forge a receipt because the verifier checks
   the signature against the pinned mediator public key.
2. **Chained by hash.** Each receipt's `chain_prev_hash` is the SHA-256
   of the previous receipt's bytes. Removing or reordering any receipt
   in the chain breaks the linkage and the verifier rejects.

Each Pipelock process writes its own hash-chained run chain in the
flight recorder directory. A restart starts a new chain and is recorded as
a signed link naming the tail of the run it continues, so verification
follows the links across restarts. The Audit Packet v0 bundle wraps the
chain with policy metadata, totals, and a verifier output for delivery to
an auditor or procurement team.

## Receipts or it didn't happen

If a relying party cannot independently verify that the mediator recorded
an attempted action, inspected it, and adjudicated it, then telling them
it happened is a statement of trust, not evidence. The whole point of the
receipt is to replace agent self-attestation with mediator evidence.

Three independently relevant facts a passing verification proves:

| Property | What the verifier checks |
| --- | --- |
| **Authenticity** | The signature is a valid Ed25519 signature over the canonical hash of the action_record, produced by the holder of the pinned mediator private key. A foreign key fails this check. |
| **Integrity** | The verifier recomputes the canonical-JSON hash from the current bytes of action_record. If any byte changed after signing, the recomputed hash disagrees with the one the signature was produced over. A post-sign edit fails this check. |
| **Linkage** | When verifying a chain, each receipt's `chain_prev_hash` is checked against the SHA-256 of the previous receipt's bytes. Cutting a receipt out or splicing in a foreign one breaks the chain. |

Add the relying-party policy on top: pinned signer key, max receipt
age, replay window, schema version, strict JSON parsing. The
[conformance corpus README](https://github.com/pipelab-org/agent-egress-bench/tree/main/receipts/v0/conformance)
documents the exact policy assumptions the public verifiers use.

## How receipts get produced

With a configured flight recorder and receipt signing key, the Pipelock proxy emits a receipt for every mediated action. Sources:

- **Every HTTP request** the agent issues through the forward proxy or
  CONNECT tunnel.
- **Every MCP tool call** routed through the MCP proxy, whether stdio
  or streamable HTTP.
- **Every WebSocket frame** in both directions on the WebSocket proxy.
- **Tool list responses** scanned for poisoning, with the tool baseline
  pinned per session for rug-pull detection.

Receipts append to the process's hash-chained run chain in the flight recorder. When a receipt covers an HTTP-shaped response, the `X-Pipelock-Receipt` response header carries that receipt's `action_id`, set only after the receipt is recorded. It needs a configured receipt emitter, and whether allow responses carry it depends on `flight_recorder.require_receipts`. It's a handle for looking up the signed receipt, not proof on its own. The
[pipelock-agent-egress-action](https://github.com/pipelab-org/pipelock-agent-egress-action)
GitHub Action bundles the chain with policy metadata into a complete
Audit Packet on every CI run.

## How a third party verifies

Verifiers in Go, TypeScript, Rust, and Python check individual receipts and chain linkage. End-proof and group support differ by language and version:

```bash
# Single receipt with the main Pipelock binary
pipelock verify-receipt receipt.json --key signer.pub

# Single receipt with the standalone verifier
pipelock-verifier receipt receipt.json --key signer.pub

# A full chain
pipelock-verifier chain evidence.jsonl --key signer.pub

# A complete Audit Packet bundle
pipelock-verifier audit-packet ./audit-packet/ --key signer.pub
```

The standalone Go verifier v3.7.0 and TypeScript and Rust verifiers 0.6.5 use `0` valid, `1` invalid, `2` runtime error and `64` usage error. Chain verification also uses `3` for `VALID PREFIX, END UNPROVEN`. The built-in `pipelock verify-receipt` v3.7.0 uses `0` valid, `1` invalid, malformed or refused, `2` usage or configuration error, and `3` for an unproven chain end. Python 0.4.1 uses `0` for valid receipt signatures and linkage, `1` for verification failure and `2` for argument errors. It has no end-proof or group verification and can exit `0` when the chain's tail is missing. The [verify-a-receipt walkthrough](/learn/verify-a-receipt/) has commands, conformance fixtures and expected output for each verifier.

## What receipts replace

| Without receipts | With receipts |
| --- | --- |
| "The agent's logs say the request was blocked." | "The mediator signed evidence that the request was blocked, and the auditor verified the signature offline." |
| "Trust our dashboard." | "Verify the bundle locally with a binary you build from source." |
| "We retain audit logs for six months." | "We retain signed evidence for as long as the relying party's policy requires, and the relying party can re-verify any time." |
| "The vendor was hacked, we lost the logs." | "The signing key was rotated; pre-rotation receipts remain verifiable against the prior public key; the chain self-documents the rotation point." |

## Where receipts go next

The current shipped target is procurement evidence: receipts as the
artifact auditors, customers, and internal counsel can rely on without
trusting the vendor that produced them. The longer arc is portable
runtime proof for delegated software actions in general, which is why
the format is published as a JSON Schema and the verifier is open
source.

## Where to go next

- [Verify a Pipelock receipt](/learn/verify-a-receipt/): the copy-paste
  walkthrough that proves the verifier on the public corpus.
- [Action receipt format spec](/learn/action-receipt-spec/): exact bytes
  on the wire, canonical JSON rules, signature math.
- [AARP v0.1 spec](/learn/aarp-spec/): the assurance profile that appraises a
  signed receipt and separates verified claims from producer claims.
- [Verifiable egress control](/learn/verifiable-egress-control/): how
  receipts fit the broader category of binary-enforced egress with
  evidence.
- [Compliance evidence substrate](/learn/compliance-evidence-substrate/):
  what receipts buy you in a SOC 2, HIPAA, or PCI engagement.
- [Audit Packet v0 schema](/schemas/audit-packet-v0.schema.json): the
  bundle format wrapping the receipt chain.

Receipts or it didn't happen.
