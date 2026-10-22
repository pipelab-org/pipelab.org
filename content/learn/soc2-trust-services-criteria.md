---
title: "SOC 2 Trust Services Criteria: Pipelock Mapping"
linkTitle: "SOC 2 Criteria Mapping"
subtitle: "Pipelock maps runtime controls and evidence to five SOC 2 Trust Services Criteria without making an audit or attestation claim."
description: "SOC 2 Trust Services Criteria coverage from Pipelock: security, availability, processing integrity, confidentiality, privacy, and stated runtime limits."
date: 2026-08-24
learn_cat: compliance
level: ref
tags:
  - soc-2
  - compliance
  - agent-security
faq:
  - q: "Is Pipelock SOC 2 certified or audited?"
    a: "No. Mapping Pipelock findings to SOC 2 Trust Services Criteria does not make PipeLab or Pipelock SOC 2 audited, attested, or certified. Pipelock supplies runtime evidence that an auditor can evaluate inside an organization's program."
  - q: "Which SOC 2 criteria does Pipelock map?"
    a: "Pipelock maps Security, Availability, Processing Integrity, Confidentiality, and Privacy. Security, Processing Integrity, and Confidentiality are marked covered. Availability and Privacy are marked partial."
  - q: "What does Pipelock not cover for SOC 2?"
    a: "Capacity planning, service-level agreements, data-subject workflows, and retention policy remain outside the proxy. Those limits appear on the Availability and Privacy rows."
---

Pipelock maps runtime controls and evidence to five SOC 2 Trust Services Criteria. The mapping does not claim that PipeLab or Pipelock is SOC 2 audited, attested, or certified.

Pipelock supplies product evidence for controls that operate at its boundary. An organization and its auditor decide whether that evidence supports a control test.

## Criteria mapping

| ID | Criterion | Status | Pipelock mapping | Limit |
|----|-----------|--------|------------------|-------|
| SEC | Security | Covered | Proxy enforcement, MCP scanning, DLP, and structured audit logs support security controls. | |
| AVA | Availability | Partial | Metrics and health endpoints aid availability monitoring. | Capacity planning and service-level agreements remain deployment-specific. |
| PI | Processing Integrity | Covered | Recorded evidence and verification flows preserve processing integrity. | |
| CONF | Confidentiality | Covered | DLP and redaction controls protect confidential information in transit and at rest. | |
| PRIV | Privacy | Partial | Policy testing helps identify privacy gaps. | Data-subject workflows and retention policy remain outside the proxy. |

## What the mapping means

A covered row identifies the Pipelock controls and evidence that map to that criterion. A partial row identifies the same contribution and its stated limit. The mapping is not an audit result, an attestation, or a certification claim.

Pipelock does not own deployment capacity planning, service-level agreements, data-subject workflows, or retention policy. Those controls belong to the organization operating the deployment.

## Use the mapping as evidence

Pipelock's compliance catalog feeds the assessment output and framework summaries. The SOC 2 mapping gives a reviewer specific product evidence to evaluate. It does not replace the independent auditor who performs an attestation engagement.

Read [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/) for the boundary between product evidence and audit status.

## Further reading

- [SOC 2 Trust Services Criteria](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022): the framework source.
- [AI compliance evidence](/learn/compliance-evidence/): Pipelock assessment and evidence bundles.
- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): scope and evidence limits.
