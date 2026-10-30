---
title: "Verifiable Egress Control: Binary-Enforced Mediation with Signed Evidence"
linkTitle: "Verifiable Egress Control"
related:
  - agent-action-receipts
  - action-receipt-spec
  - what-did-my-agent-do
seoTitle: "Verifiable Egress Control with Signed Receipts"
subtitle: "Open-source agent firewall for network-enforced AI egress with receipts you verify offline against a pinned key."
description: "Verifiable Egress Control combines network-enforced AI agent egress with signed action receipts auditors and procurement teams can verify offline."
date: 2026-05-21
lastmod: 2026-08-08
learn_cat: evidence
level: intro
tags:
  - vec
  - evidence
  - receipts
  - procurement
faq:
  - q: "What is verifiable egress control?"
    a: "Verifiable egress control is the combination of two properties that other agent-security categories handle separately. First, the boundary is enforced at the network layer by a binary outside the agent trust boundary, so a compromised agent cannot disable it. Second, the boundary emits signed action receipts for every adjudicated action, so a relying party can verify offline that the enforcement happened. Most logging tools have the second property without the first. Most sandboxes have the first property without the second. Verifiable egress control is both at once."
  - q: "How is this different from a regular egress firewall?"
    a: "Network egress firewalls block by destination. They cannot tell you the bytes inside an allowed request. Verifiable egress control inspects the bytes (DLP, prompt injection, tool poisoning, SSRF) and produces signed evidence of mediated decisions that verifies offline against a pinned key. A network firewall says 'request was allowed to api.example.com.' Verifiable egress control records the inspection result and the signed receipt."
  - q: "Why call it 'verifiable'?"
    a: "Because the evidence the system produces is verifiable offline by any third party with the corresponding public key. The word distinguishes this category from observability stacks that produce logs you must trust the vendor to retain and redact. Verifiable means a relying party can fetch a receipt, run an open-source verifier with a pinned key, and read accept or reject from the exit code."
  - q: "What is the procurement use case?"
    a: "A buyer evaluating an AI vendor asks 'show me what the agent did.' A vendor that emits verifiable egress control receipts can hand the buyer a signed evidence bundle the buyer's auditor can verify on a laptop. A vendor that only retains logs is asking the buyer to trust the vendor's retention, redaction, and presentation. Procurement and compliance teams treat signed evidence and trusted logs as different artifacts because they answer different questions."
  - q: "Does verifiable egress control replace SOC 2, HIPAA, or PCI compliance?"
    a: "No. It is a primitive that maps cleanly to specific evidence requirements in those frameworks (log retention, integrity, independent attestation) but it does not certify a control environment. A compliance program still does what a compliance program does. The receipt is the artifact the auditor wants for the evidence row that asks 'how do you know the agent did what your policy says it did.'"
  - q: "Is Pipelock the only verifiable egress control implementation?"
    a: "Pipelock is the current reference implementation. The format is published as a JSON Schema, the conformance corpus is public, and verifier surfaces exist across Go, TypeScript, Rust, Python, and wasm. Other vendors are welcome to emit and consume the same format. The strategic intent is to lift the primitive into existing standards bodies (CoSAI, IETF, OASIS) so verifiable egress control becomes a category other vendors implement, not a Pipelock-controlled product line."
---

Verifiable egress control is a security property: every network action an AI agent takes is mediated by a process outside the agent's trust boundary, and each decision produces a signed receipt any third party can verify offline. The short version is "receipts or it didn't happen." Pipelock is the reference implementation. The full definition is the property pair below.

## The property pair

A control qualifies as verifiable egress control when both hold:

1. **Binary-enforced mediation at the network boundary.** The
   enforcement runs in a process outside the agent trust boundary. The
   agent has no access to the enforcement code, no access to the
   signing key, and no path to bypass the enforcement that does not
   require breaking out of the deployment-level containment. A
   compromised agent cannot turn the control off.
2. **Signed action receipts for every adjudicated action.** Each
   decision (allow, block, warn, ask, strip, forward, redirect)
   produces an Ed25519-signed record. Records chain by hash into a
   tamper-evident log. A relying party verifies the chain offline with
   a binary built from open-source verifier code; the verification step
   trusts a pinned public key, not the vendor.

A control that has property 1 without property 2 is a sandbox or
firewall. A control that has property 2 without property 1 is a
logging tool.

## Why both properties matter

The first property answers "what is preventing the agent from doing the
wrong thing." The second property answers "what evidence does anyone
have that the prevention happened."

Take three failure modes:

| Failure | Enforcement-only control | Logging-only control | Verifiable egress control |
| --- | --- | --- | --- |
| Agent leaks API key in URL query | Blocks the request | Logs the attempt; the agent might have edited the log | Blocks the request and emits a signed receipt of the block, verified offline |
| MCP tool returns prompt injection | Scanner catches it (if it has one) | Logs the response (might) | Scanner catches it; signed receipt names the layer, pattern, severity, and verdict |
| Auditor asks "what did the agent do last quarter" | "Trust our logs" | "Trust our logs" | "Verify the bundle locally, here is the public key" |

The third row is the procurement-evidence shift. Auditors and buyers
treat signed receipts they can verify themselves as different evidence
from logs they have to trust. The deploying operator still holds the
signing key, so a base receipt proves what the boundary decided and that
the keyholder signed it, not that the operator is honest. Operator-independent
evidence requires external transparency-log anchoring with
`pipelock anchor receipts --backend rekor` and pinned Rekor log keys; the
local anchor backend is not operator-independent.

## What this category is not

- **Not a new internet PKI.** This category is procurement evidence
  first. Receipts land as audit-trail and governance artifacts before
  they land as anything browser-equivalent. The longer arc is to lift
  the primitive into existing standards (CoSAI, IETF, OASIS), not to
  ship a Pipelock-controlled certificate format.
- **Not a replacement for sandboxing or identity governance.** Layer 4
  in the [control-layer map](/learn/agent-security-control-layers/) is
  one of four lanes. Each lane covers a different threat class.
- **Not a replacement for compliance certification.** Verifiable egress
  control supplies evidence for the [published SOC 2](/learn/soc2-trust-services-criteria/)
  and [HIPAA mappings](/learn/hipaa-security-rule/). It does not certify a control environment. A
  vendor with this control still needs a compliance program.
- **Not vendor-locked.** Format, schema, conformance corpus, and five
  verifier surfaces are public. Other vendors can emit and
  consume the same artifacts.

## The Pipelock implementation

Pipelock implements the property pair with:

- **Single Go binary** (Apache-2.0 core; Enterprise features under ELv2) with receipt emission,
  hash-chained evidence, and offline verification.
- **Ordered scanner pipeline** covering DLP, prompt injection, SSRF,
  tool poisoning, MCP rug-pull detection, policy-bound tool routing,
  and WebSocket frame scanning.
- **Ed25519 signing** from outside the agent trust boundary. Receipts
  chain by hash in an `evidence.jsonl` flight recorder file.
- **Five verifier surfaces** across Go, TypeScript, Rust, Python, and wasm,
  with the public corpus available for cross-language conformance checks.
- **Audit Packet v0** bundle format with a published JSON Schema
  ([pipelab.org/schemas/audit-packet-v0.schema.json](/schemas/audit-packet-v0.schema.json))
  and a GitHub Action that emits complete bundles in CI.
- **Public conformance corpus** at
  [agent-egress-bench/receipts/v0/conformance/](https://github.com/pipelab-org/agent-egress-bench/tree/main/receipts/v0/conformance)
  with golden, malicious, and edge cases.

Current product framing:

> Pipelock is an open-source agent firewall that controls AI agent
> egress and produces verifiable audit evidence for every allowed or
> blocked action.

Buyer comparison framing:

> Open-source agent firewall for network-enforced, independently
> verifiable AI egress.

Both reflect the property pair: binary-enforced mediation plus signed
evidence.

## When to ask a vendor about verifiable egress control

If you are evaluating an AI agent platform, an MCP gateway, or an
agent-security tool, the question is short:

> Does your control emit signed action receipts I can verify offline
> against a pinned public key, with the verifier shipped as open source?

If the answer is no, the vendor has a logging or enforcement product,
not a verifiable egress control product. Both are legitimate; only the
latter produces procurement evidence auditors and buyers can verify
without trusting a vendor dashboard.

## Where to go next

- [Agent action receipts](/learn/agent-action-receipts/): the primitive
  in detail.
- [Verify a Pipelock receipt](/learn/verify-a-receipt/): hands-on
  walkthrough against the public conformance corpus.
- [Agent security control layers](/learn/agent-security-control-layers/):
  where verifiable egress control sits in the four-lane map.
- [Compliance evidence substrate](/learn/compliance-evidence-substrate/):
  what receipts buy in a procurement or audit engagement.
- [Agent egress control launch post](/blog/agent-egress-control-launch/):
  the v2.4 announcement that introduced the framing.

Receipts or it didn't happen. The proxy enforces. The receipt proves
the enforcement happened.
- [The Pipelock Operator Console](/learn/operator-console/) shows this evidence in a read-only operator view, with the four-part Authentic / Untampered / Anchored / Completeness scorecard.
