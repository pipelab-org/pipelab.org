---
title: "HIPAA Security Rule Coverage: Pipelock Mapping"
linkTitle: "HIPAA Security Rule"
subtitle: "Pipelock maps selected HIPAA technical safeguards and evidence controls, with the operator-owned gaps stated in each row."
description: "HIPAA Security Rule coverage from Pipelock: selected technical safeguards, runtime evidence, PHI disclosure limits, and the controls outside the proxy."
date: 2026-08-24
learn_cat: compliance
level: ref
tags:
  - hipaa
  - compliance
  - agent-security
faq:
  - q: "Does Pipelock make an organization HIPAA compliant?"
    a: "No. Pipelock maps selected HIPAA Security Rule safeguards that a network proxy can mediate or support with evidence. It does not perform the organizational, contractual, physical, or workflow controls HIPAA also requires."
  - q: "Can Pipelock prevent every PHI disclosure?"
    a: "No. Pipelock detects SSN-shaped identifiers and operator-configured custom PHI patterns, detects identifiers assembled across multiple requests, and redacts configured classes in provider bodies. Out-of-the-box patterns do not include MRN, ICD codes, or other PHI-specific identifiers. Operators must add patterns for the PHI shapes their workload handles."
  - q: "Does Pipelock enforce encrypted outbound traffic for HIPAA?"
    a: "No. Pipelock mediates outbound HTTP(S) and can scan request bodies with optional TLS interception when configured. It does not enforce HTTPS-only outbound traffic by default. That requires deployment policy."
---

Pipelock maps selected HIPAA Security Rule controls that a network proxy can enforce or support with evidence. The scope is the technical safeguards in 45 CFR Part 164, Subpart C that the proxy mediates, plus selected administrative safeguards it touches through evidence emission.

Physical safeguards are outside this mapping. Physical security for the host running Pipelock remains the operator's responsibility. The same applies to business agreements, workforce procedures, and other organizational controls.

The [published documentation mapping at v3.7.1](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/compliance/assess-mapping.md#hipaa-security-rule-added-2026-05) lists Transmission Security and ePHI Disclosure Prevention as **Covered**. The [Assess source mapping](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/hipaa.go) marks both **Partial**. This page follows the source. Encrypted-destination policy and workload-specific PHI patterns remain deployment responsibilities.

## Safeguard mapping

| ID | Safeguard | Status | Pipelock mapping | Limit |
|----|-----------|--------|------------------|-------|
| AC | Access Control (164.312(a)) | Covered | Forward proxy and MCP tool policy enforce per-agent allowlists. Per-agent license profiles restrict which destinations an agent can reach. | |
| AUDIT | Audit Controls (164.312(b)) | Covered | Pipelock emits structured audit events for every allow, block, and redact decision. The flight recorder writes tamper-evident checkpoints that can be signed with Ed25519. | |
| INTEGRITY | Integrity (164.312(c)) | Covered | MCP binary-integrity manifests bind tool execution to a known hash. Ed25519 signing on attestation and flight-recorder checkpoints detects alteration of ePHI handling evidence. | |
| AUTH | Person or Entity Authentication (164.312(d)) | Partial | The mediation envelope produces signed receipts for downstream verification. Per-agent license tokens identify the calling agent in audit emissions. | End-user authentication remains the agent platform's responsibility. Pipelock authenticates agents to upstream destinations, not humans to agents. |
| TRANS_SEC | Transmission Security (164.312(e)) | Partial | Forward proxy mediates outbound HTTP(S). Optional TLS interception can scan request bodies for unauthorized PHI disclosure. Class-preserving redaction strips configured PHI fields from provider payloads before they leave the boundary. | Pipelock does not enforce HTTPS-only outbound traffic by default. Encryption-in-transit enforcement needs deployment policy. |
| EPHI_DLP | ePHI Disclosure Prevention | Partial | DLP detects SSN-shaped identifiers and operator-configured custom PHI patterns. Cross-request detection catches identifiers assembled across requests. Redaction class-preserves the personal class in provider bodies. | Out-of-the-box patterns do not include MRN, ICD codes, or other PHI-specific identifiers. Operators must add `dlp.patterns` entries for their workload. |
| BAA | Business Associate Agreement | Not covered | | BAAs are contractual instruments. A deployed Pipelock binary is not a party to BAA execution. |
| WORKFORCE | Workforce Security (164.308(a)(3)) | Not covered | | Workforce authorization, supervision, and termination procedures are organizational controls outside the proxy boundary. |
| CONTINGENCY | Contingency Plan (164.308(a)(7)) | Partial | The kill switch and health probes support emergency-mode operating procedures. The flight recorder provides an audit trail for post-incident review. | Disaster recovery, data backup, and testing schedules remain operator-owned. |

## What the mapping does not claim

Pipelock does not certify an organization, execute a BAA, run workforce security procedures, enforce host physical security, or own disaster recovery. The mapping names what the proxy mediates and the evidence it can generate. Your organization owns the controls that surround the proxy.

The transmission-security and ePHI rows also have deployment limits. Configure the policy that enforces encrypted destinations, and add patterns for the PHI shapes your workload handles.

## Use the mapping as evidence

Pipelock's compliance catalog feeds the assessment output and framework summaries. The HIPAA mapping keeps its technical contribution and its limit in the same record.

Read [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/) before using Pipelock evidence in an audit or procurement process. It explains the difference between product evidence and an auditor's attestation.

## Further reading

- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/): the framework source.
- [AI compliance evidence](/learn/compliance-evidence/): Pipelock assessment and evidence bundles.
- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): scope and evidence limits.
- [Shipped mapping (Pipelock v3.7.1)](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/hipaa.go): control IDs, status, evidence, and limitations.
