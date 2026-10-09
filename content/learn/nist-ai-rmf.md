---
title: "NIST AI RMF Coverage: Pipelock Control Mapping"
linkTitle: "NIST AI RMF Coverage"
subtitle: "Pipelock's NIST AI RMF mapping names the runtime controls it contributes and the governance work it cannot perform."
description: "NIST AI RMF coverage from Pipelock: GOVERN, MAP, MEASURE, MANAGE, and Generative AI mappings with the runtime limits stated plainly."
date: 2026-08-24
learn_cat: compliance
level: ref
tags:
  - nist-ai-rmf
  - compliance
  - agent-security
faq:
  - q: "Does Pipelock implement the NIST AI RMF?"
    a: "No. Pipelock maps runtime controls and evidence to NIST AI RMF outcomes. Governance roles, policy approval workflows, stakeholder identification, impact classification, and model-level work remain with the operator."
  - q: "Which NIST AI RMF functions does Pipelock map?"
    a: "Pipelock maps GOVERN and MAP as partial, MEASURE and MANAGE as covered, and adds Generative AI mappings for data privacy, information integrity, provenance, and harmful bias."
  - q: "Does Pipelock assess harmful bias?"
    a: "No. The mapping marks Generative AI harmful bias as not covered. Bias evaluation belongs to model selection and red-team programs upstream of network mediation."
---

Pipelock's NIST AI RMF mapping focuses on what a runtime proxy can mediate and the evidence it can produce. It does not turn a binary into a risk-management program.

The mapping includes the four core functions and four Generative AI rows. Covered rows name the product controls. Partial rows state the operator-owned work that remains.

## Core function mapping

| Function | Status | Pipelock mapping | Limit |
|----------|--------|------------------|-------|
| GOVERN | Partial | Audit emission, the flight recorder, and signed attestation bundles supply artifacts for governance records. | Governance roles, RACI, and policy approval workflows remain with the operator. |
| MAP | Partial | Discover enumerates MCP servers and their protection state. Audit and assess produce a per-deployment posture map of what is reachable, contained, and unprotected. | Stakeholder identification and impact classification remain process steps. |
| MEASURE | Covered | Simulation scenarios produce repeatable detection-coverage measurements. Assess scores per-deployment posture across four weighted sections. Prometheus metrics and the flight recorder provide ongoing operational measurement. | |
| MANAGE | Covered | Forward proxy and MCP tool policy enforce per-agent action limits. The kill switch and adaptive enforcement contain in-progress incidents. Live-lock contracts gate drift from a promoted baseline. | |

## Generative AI mapping

| Area | Status | Pipelock mapping | Limit |
|------|--------|------------------|-------|
| Data privacy | Covered | Class-preserving redaction protects PII and PHI in provider payloads. DLP, request-body scanning, and address and seed-phrase detectors prevent inadvertent disclosure to upstream models. | |
| Information integrity | Covered | Response scanning catches prompt injection in tool results. MCP tool scanning and session binding detect poisoned descriptions and rug-pull drift. Browser Shield strips DOM traps from fetched pages. | |
| Provenance | Partial | The mediation envelope signs outbound mediated requests. The flight recorder produces tamper-evident decision evidence. The MCP binary-integrity manifest binds tool execution to a known binary. | Pipelock attests its own mediation, not an upstream model's training-data lineage. |
| Harmful bias | Not covered | | Bias evaluation belongs to model selection and red-team programs upstream of network mediation. |

## What the mapping does not claim

Pipelock supports deployment evidence and runtime mediation. The operator owns governance roles, policy approval, stakeholder work, impact classification, and bias evaluation. The provenance mapping covers Pipelock's mediation and known tool binary. It does not establish model provenance.

That boundary matters when you use this mapping in a risk program. A covered row shows the runtime control Pipelock contributes. It does not replace the program work around it.

## Use the mapping as evidence

Pipelock's compliance catalog feeds the assessment output and framework summaries. The mapping keeps the control and its limit together so a reviewer can distinguish product evidence from operator-owned work.

Read [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/) for the distinction between evidence and certification. See [AI Agent Regulatory Controls](/learn/ai-agent-regulatory-controls/) for the catalog's other mappings.

## Further reading

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework): the framework source.
- [AI compliance evidence](/learn/compliance-evidence/): Pipelock assessment and evidence bundles.
- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): scope and evidence limits.
