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
    a: "Assess v3.7.1 maps Articles 12, 13, 14, and 26. Article 13 is partial; provider-facing instructions remain deployment-specific. These mappings support evidence review and do not replace a compliance program."
  - q: "How does Pipelock map to NIST AI RMF?"
    a: "The shipped mapping marks GOVERN and MAP as partial, MEASURE and MANAGE as covered. Audit emission and signed bundles support GOVERN; discovery, audit, and assessment support MAP; simulation, assessment, metrics, and the flight recorder support MEASURE; proxy policy, kill switch, adaptive enforcement, and live-lock contracts support MANAGE."
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

The shipped A12 mapping names the flight recorder and attestation: replayable records and signed manifests support record-keeping. Assess does not separately map each Article 12 sub-requirement. See the [EU AI Act mapping](/learn/eu-ai-act-compliance/) for all four shipped article entries.

## NIST AI RMF mapping

NIST AI 100-1 (the AI Risk Management Framework) defines four core functions: GOVERN, MAP, MEASURE, MANAGE. Pipelock evidence supports each function. The framework itself is a process and governance structure that Pipelock evidence feeds into; Pipelock does not implement the framework.

| Function | Status | Pipelock mapping | Limit |
|---|---|---|---|
| GOVERN | Partial | Audit emission, tamper-evident flight recorder, and signed attestation bundles supply the artifacts a governance program records against AI RMF Govern outcomes. | Governance roles, RACI, and policy approval workflows live with the operator. |
| MAP | Partial | Discover enumerates MCP servers and their protection state; audit and assess produce a per-deployment posture map of what is reachable, what is contained, and what is unprotected. | Stakeholder identification and impact classification remain process steps. |
| MEASURE | Covered | Simulate scenarios produce repeatable detection-coverage measurements; assess scores per-deployment posture across 4 weighted sections; Prometheus metrics and the flight recorder provide ongoing operational measurement. |  |
| MANAGE | Covered | Forward proxy and MCP tool policy enforce per-agent action limits; kill switch and adaptive enforcement contain in-progress incidents; live-lock contracts gate drift from a promoted baseline. |  |

## Other framework alignments

The shipped catalog also includes [SOC 2's five category-level entries](/learn/soc2-trust-services-criteria/), [selected HIPAA Security Rule safeguards](/learn/hipaa-security-rule/), [MITRE ATLAS](/learn/mitre-atlas/), [OWASP MCP Top 10](/learn/owasp-mcp-top10/), and [OWASP Agentic Top 10](/learn/owasp-agentic-top10/). It does not include SOC 2 CC6-CC9 control-level mappings or mappings for ISO/IEC 42001, DORA, or Colorado law.

Colorado's SB25B-004 amended the SB24-205 developer and deployer obligation dates from February 1, 2026 to June 30, 2026. See the [signed amendment, sections 1-2](https://leg.colorado.gov/sites/default/files/2025b_004_signed.pdf) and the [regulatory controls hub](/learn/ai-agent-regulatory-controls/).

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

**Legal counsel building defensible records for AI agent operations** can rely on the chain-linked structure of action receipts to detect post-hoc tampering: any modification to an event in the chain breaks the hash linkage and the verifier reports it as invalid, naming the exact sequence number at which the chain breaks. The shipped catalog maps record-keeping to EU AI Act Article 12 and audit-control and integrity evidence to selected HIPAA §164.312 safeguards. Retention, access control, and review procedures remain with the organization.

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

- [Assess v3.7.1 framework catalog](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/coverage.go): the shipped framework list.
