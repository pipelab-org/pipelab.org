---
title: "Mediator Receipts: The Question to Ask About Agent Attestation"
linkTitle: "Mediator Receipts: The Attestation Question"
seoTitle: "Mediator Receipts: The Attestation Architecture"
subtitle: "If your AI agent signs its own decision receipts, the agent is its own witness."
description: "Signed receipts are real. Who holds the key is what decides whether they're evidence or self-report. Architecture question for any AI agent posture."
date: 2026-05-13
lastmod: 2026-05-13
author: "Josh Waldrep"
summary: "Signed receipts from your AI agent are real. Who held the pen is what decides whether they're evidence or self-report."
tags: ["ai-security", "attestation", "receipts", "compliance", "open-source"]
blog_cat: "technical"
---

If your AI agent signs its own decision receipts, the agent is its own witness. That matters when an auditor, regulator, or customer security team asks "who signed this." The cryptography is fine. The chain holds. The question is who held the pen.

I'm not picking on any vendor. As more agent runtimes ship signed-receipt formats, the architecture question lives in the same place every time: where does the signing key sit, and what's its trust relationship to the agent process?

## The two shapes

A signed receipt has three parts: payload, signature, signer. Payload says what happened. Signature proves the payload wasn't altered after signing. Signer is the entity holding the key.

Most formats pin down payload and signature up front. The thing that varies across formats is the signer.

**Shape one: signer is the actor.** The agent runtime holds the key. The agent decides, generates a receipt, signs with its own key, ships to the log. Chain of custody is one entity wide.

**Shape two: signer is not the actor.** A separate process holds the key. The agent makes a request, the request flows through that separate process, the separate process makes the policy decision and signs the receipt. The agent never sees the key. Chain of custody crosses a trust boundary.

Both shapes produce signed receipts. Only one of them survives a question about the signer.

## What "outside the trust boundary" buys you

Trust boundary is the line around a set of components that share fate. If A is compromised, everything inside A's boundary is potentially compromised. A signature proves bytes came from the key holder. A signature doesn't prove the key holder is trustworthy.

If the agent holds the key, the boundary around the signature is the same boundary around the agent. A prompt injection that gets the agent to send a bad request is in the same position to influence what gets signed. The signature proves the receipt came from the agent. It says nothing about whether the receipt is honest.

Move the signer outside that boundary and the math changes. A separate process with its own key in its own memory writes the signature based on what it observed of the agent's traffic. The agent can't forge or rewrite mediator-signed receipts for traffic that passes through the mediator, because the agent never holds the signing key. A successful prompt injection still produces a bad request. The receipt records the mediator's verdict on that request, because the recorder is somebody else.

The same separation that lets a proxy enforce policy on a compromised agent lets the proxy attest to actions on a compromised agent. The attestation is honest about a dishonest action. That's the property an auditor wants.

That's why receipt architecture sits next to enforcement architecture in the [three-UID containment pattern](/blog/three-uid-agent-containment-linux/). Once the agent becomes the signer, the receipt is self-attestation. Move the signer behind the same boundary as the proxy and the receipt class flips.

## This isn't a feature comparison

A vendor whose receipts are signed in-process isn't lying. The cryptography is sound. The chain is verifiable. The thing those receipts can't do is survive a question about who signed them.

An auditor asks: "How do you prove the agent didn't produce a fraudulent receipt that says 'access denied' while the actual access was granted?" In-process answer: "We trust the agent runtime." Out-of-process answer: "The receipt is signed by a process the agent has no key to. The agent couldn't have signed that fraudulent receipt with the mediator key."

The first answer is a statement of trust. The second is a structural property. For internal use, the first is plenty. For regulated industries, audit-bearing logs, or any case where the agent itself might be under scrutiny, the second one holds up.

Same distinction shows up in financial audit (self-prepared statements vs auditor-signed reports) and in legal evidence (defendant's own records vs witness testimony). Records can be true either way. Evidentiary weight differs because chain of custody differs.

## Two pictures

**In-process signer:**

```
Agent process
├── Decision logic
├── Signing key
└── Signature output → Receipt log
```

Agent decides, holds the key, signs. Compromise of the agent process compromises the signing path.

**Out-of-process signer:**

```
Agent process              Mediator process
├── Decision logic     →    ├── Observes traffic
└── Action initiation       ├── Applies policy
                            ├── Signing key
                            └── Signature output → Receipt log
```

Agent initiates. Mediator observes, decides, signs. Compromise of the agent doesn't by itself compromise the signing path because the key sits in a different process.

Out-of-process is harder to deploy. Traffic has to flow through the mediator (which is what an agent firewall does). The mediator has to live in a different trust boundary from the agent (Linux UID separation, separate Kubernetes pod, separate VM). The mediator needs its own threat model, key management, and operational story.

The cost is real. The evidentiary weight is also real. Whether it's worth it depends on what you need the receipts for. Internal debugging log, in-process is fine. Audit evidence, capability separation is what makes the receipt worth more than its bytes.

## The question to ask any vendor

Evaluating an agent security or governance product that ships signed receipts boils down to one short question:

**Where is the signing key held, and what's the trust relationship between that location and the agent process?**

Three possible answers map to three shapes:

- "The agent process holds the key." In-process signer. Class: self-attestation. Useful for internal logs, debugging, observability.
- "The runtime environment holds the key, separate from the agent process but inside the same operator's trust boundary." Operator-signer. Class: deployment-internal attestation. Stronger than self-attestation, weaker than independent.
- "An entity outside the operator's deployment, with its own threat model and key management, holds the key." Independent attestor. Class: third-party witness. Strongest weight, hardest to deploy.

Pipelock implements the second shape today when deployed correctly. The binary is a separate process from the agent and signs receipts with its own key. The deployment puts that process behind a capability boundary the agent can't cross: Linux UID separation, a separate Kubernetes pod with NetworkPolicy, or equivalent isolation. The boundary is deployment-enforced, not binary-enforced. A deployment that runs Pipelock as the same UID as the agent collapses shape two back into shape one. Independent third-party attestation (a hosted verifier outside the operator's deployment) is on my roadmap, not shipped, and there are open questions about who the third party is and what trust relationship the operator has with them.

Pipelock doesn't require in-agent signing. It earns the second class when deployed behind a capability boundary the agent can't cross. The signing key lives in a process the agent has no access to. That's the property the architecture protects, and it depends on how you deploy.

## What this means for posture

Three decisions follow if signed receipts are part of your AI agent posture:

**Trust scope.** Only the team running the agent? In-process is plenty. Auditors, customers, or regulators in the picture? Receipts have to survive the "who signed" question.

**Threat model.** A compromised agent (prompt injection, tool poisoning, jailbreak) producing fraudulent self-signed receipts is something in-process can't address. Out-of-process can, because the agent never holds the key.

**Capability separation budget.** Out-of-process signing means the signer lives in a different trust boundary from the agent. Linux: separate UID. Kubernetes: separate pod. Managed runtime: maybe a different service entirely. Each adds operational footprint. That footprint is the cost of the evidentiary property.

Decisions cascade. Internal use only gets you in-process. Audit-bearing evidence needs out-of-process. Third-party verifiable needs an attestor outside your deployment.

## What I've shipped

The reason this question is worth asking right now is that the open-source pieces for verifying mediator-signed receipts exist today. Anyone can pull them and check.

- **Audit Packet v0 JSON Schema** lives at [pipelab.org/schemas/audit-packet-v0.schema.json](/schemas/audit-packet-v0.schema.json). It pins the shape of a procurement-grade evidence bundle: receipt chain, verifier output, scanner config snapshot, posture metadata, plus tamper-detection cross-checks (claimed totals vs actual chain totals, claimed root hash vs actual, claimed final sequence vs actual).
- **Three verifier codebases in the Pipelock repo, none dependent on the others.** [Go](https://github.com/pipelab-org/pipelock/tree/main/internal/receipt) is the reference implementation. Both the built-in `pipelock verify-receipt` subcommand and the standalone [`pipelock-verifier`](https://github.com/pipelab-org/pipelock/tree/main/cmd/pipelock-verifier) binary share it. [TypeScript](https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/ts) uses `@noble/ed25519` and `ajv`. [Rust](https://github.com/pipelab-org/pipelock/tree/main/sdk/verifiers/rust) carries its own canonical JSON, schema validation, Ed25519, chain replay, and packet cross-checks. All three cross-validate against the same fixtures at [sdk/conformance/testdata/](https://github.com/pipelab-org/pipelock/tree/main/sdk/conformance/testdata).
- **Python verifier** ships in a separate repo: [pipelock-verify-python](https://github.com/pipelab-org/pipelock-verify-python). 0.1.x on PyPI covers ActionReceipt v1. 0.2.0 covering EvidenceReceipt v2 plus RFC 8785 JCS and an RFC 9421 well-known signing-key directory is prepared in the repo, PyPI publish pending.
- **Standalone `pipelock-verifier`** is self-contained. No network surface, no proxy, no scanner. CI runners and auditors can drop it into an isolated environment with `--offline` and verify a packet against the public schema, zero vendor dependency.

That's the point of putting all of it on the public surface. An attestation that depends on the agent's trustworthiness is a different thing from an attestation that survives a question about the agent. The verifier path is open source so anyone, including people who have no trust relationship with me at all, can check whether a receipt is honest.

## The honest summary

Signed receipts are a real defensive property. The signing architecture decides what class of evidence the receipts are.

In-process signers produce self-attestations. Receipts are signed, the chain holds, the cryptography is sound. The trust model is "the agent is honest about its own decisions."

Out-of-process signers produce attestations from a different actor. The trust model is "the proxy is honest about what the agent did." A proxy can be honest about a dishonest agent, which is what makes the receipts evidence and not self-report.

Both classes have a role. Knowing which class your vendor ships is the input to your posture decision. The architectural question is upstream of features, performance, and price. It decides what the receipts are for. Worth asking before signing anything, including the contract.

If you're evaluating Pipelock or anything else against this rubric, the conversation starts at "where is the signing key held." The answer should be one sentence, and it should be the same sentence regardless of who you ask on the vendor's team.

## Further reading

- [Action Receipt Spec](/learn/action-receipt-spec/): the exact wire format Pipelock binaries emit today.
- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): how the architectural property maps to EU AI Act, NIST AI RMF, ISO 42001, DORA, HIPAA, and Colorado SB24-205.
- [Three-UID Agent Containment on Linux](/blog/three-uid-agent-containment-linux/): the deployment pattern that backs the architectural property in this post.
- [What did my agent do?](/learn/what-did-my-agent-do/): end-to-end demo of one decision, the signed receipt, and verifier output.
