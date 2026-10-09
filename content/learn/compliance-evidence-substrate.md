---
title: "Compliance Evidence Substrate for AI Agents"
linkTitle: "Compliance Evidence Substrate"
related:
  - verifiable-egress-control
  - compliance-evidence
  - action-receipt-spec
subtitle: "Pipelock is not a compliance product. It is the evidence substrate procurement, audit, and legal teams use inside their existing programs."
description: "Pipelock as evidence substrate: EU AI Act Article 12 and NIST AI RMF mapped to signed action receipts, scanner verdicts, and audit packets."
date: 2026-05-06
learn_cat: compliance
level: ref
tags:
  - evidence
  - eu-ai-act
  - nist-ai-rmf
  - audit
faq:
  - q: "Is Pipelock a compliance product?"
    a: "No. Pipelock is an evidence substrate. It produces machine-verifiable records that procurement, audit, and legal teams can use inside their existing compliance programs. Pipelock does not replace an ISMS, certified audit, model risk management framework, or formal conformity assessment."
  - q: "What does 'evidence substrate' mean for procurement teams?"
    a: "It means Pipelock generates the underlying signed records (action receipts, scanner verdicts, audit packets, control point metadata) that compliance frameworks ask for, but the procurement team still owns retention policy, review cadence, risk acceptance, and formal sign-off. Pipelock supplies the records. The organization runs the program."
  - q: "Which EU AI Act articles does Pipelock evidence map to?"
    a: "Article 12 specifically: automatic event recording, traceability, operational monitoring, risk event detection, and control-point specificity. Pipelock does not address Article 9 risk management process, Article 10 training data governance, Article 14 human oversight at the workflow level, or Article 43 conformity assessment. Those need additional controls and process around the evidence."
  - q: "How does Pipelock map to NIST AI RMF?"
    a: "Pipelock generates evidence aligned with all four core functions: GOVERN (policy hash plus posture capsule), MAP (audit packet plus session metadata), MEASURE (scanner verdict plus benchmark and conformance results), and MANAGE (kill switch, fail-closed verdicts, and HITL approvals). Auditors and risk teams can pull this evidence directly into their NIST RMF documentation."
---

[Pipelock](/pipelock/) is not a compliance product. It is an evidence substrate for AI-agent operations: it records what an agent tried to do, which control point observed it, which policy applied, what verdict was reached, and whether the evidence can be verified later.

Procurement, audit, and legal teams use this evidence inside EU AI Act Article 12 logging programs, NIST AI RMF risk management documentation, ISO/IEC 42001 AI management systems, SOC 2 audits, and incident reviews. Pipelock does not replace any of those frameworks. It supplies the machine-verifiable records those programs ask for.

This page is for procurement teams writing AI-vendor questionnaires, auditors pulling evidence for an attestation engagement, and legal counsel building defensible records for AI agent operations. Engineers should read [the AI compliance evidence overview](/learn/compliance-evidence/) and the [action receipt spec](/learn/action-receipt-spec/) instead.

## What an evidence substrate is, and why the distinction matters

A compliance product makes a certification claim: "we are SOC 2 Type II audited" or "we are ISO 27001 certified." A compliance product carries auditor attestation as part of the deliverable.

An evidence substrate produces the underlying signed records that compliance programs need. The substrate does not certify your organization. Your ISMS, your auditor, your legal team, and your management own the certification claim.

Pipelock is the substrate. The records it emits are:

- **Signed action receipts** with a chain hash, policy hash, and Ed25519 signature from outside the agent trust boundary
- **Scanner verdicts** with a reason code, severity, and the specific scanner layer that produced the verdict
- **Audit packets** that bundle a run's receipt chain, verifier output, scanner config snapshot, and posture metadata into one inspectable artifact
- **Control point metadata** that names where the decision happened (HTTP proxy, MCP proxy, WebSocket, CI action, sidecar) and the trust boundary

These records carry weight because they were emitted by a mediator outside the agent process. The agent did not attest to itself. A mediator outside the agent process recorded the attempted action and verdict, and the record's signature can be verified later against a pinned key.

## Why this evidence holds up under audit

Three properties separate Pipelock evidence from vendor logs:

**Offline verification.** The verifier path is open source. Anyone can fetch the schema and a reference verifier, pin the expected key, and check the signature and packet integrity. The Audit Packet v0 JSON Schema is published at [pipelab.org/schemas/audit-packet-v0.schema.json](/schemas/audit-packet-v0.schema.json). Three separate codebases verify the format today (Go, TypeScript, and Rust), with a Python verifier for `0.1.x` ActionReceipt chains. The standalone `pipelock-verifier` binary cross-checks a packet's claimed totals, root hash, and final sequence against the actual chain on every invocation; post-emission edits are caught even when the schema and chain both validate.

**Cryptographic chain of custody.** Each receipt carries an Ed25519 signature, a chain hash linking it to the prior receipt, and a policy hash naming the active policy at the moment of decision. Tampering with any receipt in the chain invalidates every receipt that follows, and the verifier reports the exact `broken_at_seq`. The signing key lives outside the agent's trust boundary, so a compromised agent cannot forge or revise its own history.

The deploying operator holds the signing key, so a receipt proves what the boundary decided and that the keyholder signed it, not that the operator is honest. Operator-independent evidence requires external transparency-log anchoring with `pipelock anchor receipts --backend rekor` and pinned Rekor log keys; the local anchor backend is not operator-independent.

**Capability separation.** Pipelock is designed to sit between the agent and the systems it touches. In a capability-separated deployment, downstream credentials stay outside the agent process and Pipelock's enforcement decisions happen before the action reaches the target. The agent did not attest to itself; a mediator outside the agent trust boundary produced the record. This separation is what makes the evidence procurement-grade — not just operational telemetry.

## EU AI Act Article 12 mapping

Regulation (EU) 2024/1689 Article 12 requires high-risk AI systems to technically allow automatic recording of events over the system lifetime, support traceability appropriate to intended purpose, support monitoring of operation, help identify situations that may result in risk, and be appropriate to system design.

Pipelock generates evidence for each of those obligations. Pipelock does not satisfy the obligation by itself; the deployer still owns retention policy (Article 26 specifies a six-month minimum), review cadence, risk acceptance, and formal documentation.

| Article 12 requirement | Compliance need | Pipelock primitive | Evidence produced |
|---|---|---|---|
| Automatic event recording over system lifetime | Machine-action event logging | Action receipt + flight recorder | Timestamped action record with verdict, target, policy hash, scanner layer |
| Traceability appropriate to intended purpose | Traceability of agent operations | Hash-chained audit log + receipt hash | Ordered event chain, receipt hash, signature metadata |
| Support monitoring of operation | Operational monitoring | Scanner verdict + metrics + session manifest | Allow/block/warn counts, finding class, session posture |
| Help identify situations that may result in risk | Risk event detection | DLP, prompt-injection, SSRF, MCP tool-poison findings | Reason code, severity, scanner, normalized finding class |
| Appropriate to system design | Control-point specificity | control_point metadata | Whether decision came from HTTP proxy, MCP proxy, WebSocket, CI action, sidecar |

## NIST AI RMF mapping

NIST AI 100-1 (the AI Risk Management Framework) defines four core functions: GOVERN, MAP, MEASURE, MANAGE. Pipelock evidence supports each function. The framework itself is a process and governance structure that Pipelock evidence feeds into; Pipelock does not implement the framework.

| NIST AI RMF function | Compliance need | Pipelock primitive | Evidence produced |
|---|---|---|---|
| GOVERN | Policy, accountability, risk process evidence | Policy hash + posture capsule | Which policy was active; whether runtime posture matched expected policy |
| MAP | Context and use-case characterization | Audit Packet + session metadata | Agent identity, target service, transport, action class, deployment context |
| MEASURE | Risk analysis and tracking | Scanner verdict + benchmark/conformance results | Detection class, severity, false-positive notes, conformance case references |
| MANAGE | Risk response and control operation | Kill switch + fail-closed verdicts + HITL approvals | Block/allow/ask decision, override record, recovery/termination event |

## Other framework alignments

Pipelock evidence also feeds into:

- **ISO/IEC 42001** AI management system documentation (operational records and management review evidence)
- **SOC 2** Common Criteria around system operations, change management, and incident response (CC7-CC9)
- **DORA (Regulation (EU) 2022/2554)** for financial entities. Audit packets provide supporting evidence for ICT third-party risk management under Article 28 and for the digital operational resilience testing program and ICT-tool testing described in Articles 24-25 when AI agents touch financial systems.
- **HIPAA technical safeguards** (45 CFR §164.312) for AI agents that touch protected health information. Audit packets can support audit-control and integrity evidence for covered entities and business associates, alongside the policies and procedures HIPAA requires.
- **Colorado AI Act (SB 24-205)** for high-risk AI systems used in consequential decisions in Colorado. Audit packets can support the documentation, impact-assessment, and risk-management records expected of developers and deployers for obligations that apply on and after February 1, 2026.
- **OWASP Agentic Top 10** mappings — see the [agent egress security](/learn/agent-egress-security/) and [MCP security](/learn/mcp-security/) learn pages for control coverage.
- **MITRE ATLAS** adversarial ML threat techniques, particularly reconnaissance, discovery, and exfiltration coverage.

For the framework-mapped product surface (assess command, signed bundles, SARIF integration), see [AI compliance evidence](/learn/compliance-evidence/). For Article 26 deployer obligations and the six-month retention rule specifically, see [EU AI Act compliance](/learn/eu-ai-act-compliance/). For the framework-by-framework cross-reference (EU AI Act, DORA, NIS2, NIST AI RMF, ISO 42001, Colorado AI Act, SOC 2), see [AI agent regulatory controls hub](/learn/ai-agent-regulatory-controls/).

## What this is not

Pipelock is not:

- A SOC 2 substitute. SOC 2 requires an independent auditor's attestation; Pipelock supplies records the auditor evaluates.
- A certified audit. Pipelock evidence supports an audit but does not replace one.
- An ISMS. Pipelock does not establish information security policy, risk acceptance criteria, or governance structure.
- A model evaluation framework. Pipelock observes agent egress at the network and tool boundary; it does not evaluate model behavior, fairness, or bias.
- A content moderation product. Pipelock scans for secret leaks, prompt injection, SSRF, and tool poisoning, not for content acceptability.
- A legal opinion. Pipelock evidence supports legal review but does not constitute legal advice.

The records Pipelock produces are what your compliance program runs on. Retention, review, risk acceptance, formal documentation, and auditor sign-off remain your organization's work.

## How to use this evidence in your program

**Procurement teams writing AI-vendor questionnaires** can require vendors to produce Pipelock-compatible audit packets for any AI agent the vendor uses on procurement-team data. Sample questionnaire language:

> *"For each AI agent that processes our data, supply Audit Packet v0 evidence per the schema at `pipelab.org/schemas/audit-packet-v0.schema.json`. Packets must include a verifiable signature chain emitted by a mediator outside the agent process. We will verify against the published schema using the open-source reference verifier."*

Verification only requires an Ed25519 public key and a small reference verifier. The verifier path is open source in three independent codebases (Go, TypeScript, and Rust), plus a Python verifier. A procurement team is not dependent on a vendor's attestation engineers.

**Auditors pulling evidence for an attestation engagement** can request audit packets per agent-run, validate the signature chain with the open-source verifier, and treat the packet as the underlying record for an Article 12 logging assertion or an SOC 2 control test. The packet bundles its own verifier output, scanner config snapshot, and posture metadata, so an auditor can verify a packet in an isolated environment with no network access (`--offline` mode).

**Legal counsel building defensible records for AI agent operations** can rely on the chain-linked structure of action receipts to detect post-hoc tampering: any modification to an event in the chain breaks the hash linkage and the verifier reports it as invalid, naming the exact sequence number at which the chain breaks. Hash-chained records support integrity, audit-control, and tamper-evidence arguments under EU AI Act Article 12, DORA Article 28, and HIPAA §164.312 when paired with the organization's retention, access-control, and review procedures.

In each case, the procurement, audit, or legal team owns the program that wraps the evidence. Pipelock supplies the records.

## Sources

- EU AI Act Regulation (EU) 2024/1689, Article 12: <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689>
- EU AI Act implementation timeline: <https://ai-act-service-desk.ec.europa.eu/en/ai-act/eu-ai-act-implementation-timeline>
- DORA Regulation (EU) 2022/2554: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554>
- HIPAA Security Rule technical safeguards, 45 CFR §164.312: <https://ecfr.io/Title-45/Section-164.312>
- Colorado SB24-205, Consumer Protections for Artificial Intelligence: <https://leg.colorado.gov/bills/sb24-205>
- NIST AI Risk Management Framework: <https://www.nist.gov/itl/ai-risk-management-framework>
- ISO/IEC 42001: <https://www.iso.org/standard/42001>
- Pipelock action receipt spec: [/learn/action-receipt-spec/](/learn/action-receipt-spec/)
- Pipelock evidence-generation product surface: [/learn/compliance-evidence/](/learn/compliance-evidence/)

---

## Further reading

- [Action receipt spec](/learn/action-receipt-spec/): the technical artifact format.
- [What did my agent do?](/learn/what-did-my-agent-do/): single-decision walkthrough with real signed receipt and verifier output.
- [AI agent regulatory controls hub](/learn/ai-agent-regulatory-controls/): framework-by-framework cross-reference (EU AI Act, DORA, NIS2, NIST AI RMF, ISO 42001, Colorado AI Act, SOC 2, OWASP).
- [EU AI Act compliance](/learn/eu-ai-act-compliance/): deeper Article-by-Article mapping.
- [Compliance evidence overview](/learn/compliance-evidence/): the product surface.

[Back to Pipelock](/pipelock/) | [Verifiable egress control](/learn/verifiable-egress-control/) | [Agent action receipts](/learn/agent-action-receipts/) | [Action receipt spec](/learn/action-receipt-spec/) | [Verify a receipt](/learn/verify-a-receipt/) | [Regulatory controls hub](/learn/ai-agent-regulatory-controls/) | [What did my agent do?](/learn/what-did-my-agent-do/) | [Compliance evidence overview](/learn/compliance-evidence/)
