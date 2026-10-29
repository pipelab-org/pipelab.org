---
title: "MITRE ATLAS Coverage: Pipelock Technique Mapping"
linkTitle: "MITRE ATLAS Coverage"
subtitle: "Fourteen MITRE ATLAS techniques mapped to Pipelock controls, with the limits stated beside each partial mapping."
description: "MITRE ATLAS coverage from Pipelock: fourteen mapped techniques, the runtime controls behind each mapping, and the limits the proxy cannot own."
date: 2026-08-24
learn_cat: compliance
level: ref
tags:
  - mitre-atlas
  - compliance
  - agent-security
faq:
  - q: "Does Pipelock cover all of MITRE ATLAS?"
    a: "No. Pipelock maps fourteen MITRE ATLAS techniques. Nine are marked covered and five are marked partial. The partial mappings name the control Pipelock provides and the part that remains outside its control plane."
  - q: "What does a covered MITRE ATLAS mapping mean?"
    a: "It means the Pipelock mapping identifies specific product features and evidence for that technique. It does not claim that Pipelock prevents every instance of the technique in every deployment."
  - q: "What does Pipelock not cover in its ATLAS mapping?"
    a: "Pipelock does not own external corpus curation, consumer-side trust interpretation, citation correctness, corpus write paths, or long-lived agent state and scheduler control. Those limits appear on the affected technique rows."
---

Pipelock maps fourteen MITRE ATLAS techniques. The mapping is specific to runtime controls and the evidence the product produces. It is not a claim of ATLAS-wide coverage.

Each row below comes from Pipelock's built-in compliance mapping. ATLAS01-ATLAS14 are Pipelock mapping IDs, not MITRE AML technique identifiers. "Covered" names a direct product mapping. "Partial" names a product contribution and the remaining gap.

## Technique mapping

| ID | Technique | Status | Pipelock mapping |
|----|-----------|--------|------------------|
| ATLAS01 | Gather RAG-Indexed Targets | Covered | Discovery and normalized-text scanning expose RAG target harvesting. |
| ATLAS02 | Discover LLM System Information | Covered | Replayed assessments and simulation traces expose leaked system details. |
| ATLAS03 | Special Character Sets | Covered | Canonicalized scans catch delimiter and control-character probing. |
| ATLAS04 | System Instruction Keywords | Covered | Prompt scanning and tool policy inspection surface instruction-keyword discovery. |
| ATLAS05 | LLM Prompt Crafting | Covered | Red-team chains exercise prompt-crafting bypasses. |
| ATLAS06 | Retrieval Content Crafting | Covered | Content scanning catches crafted retrieval payloads. |
| ATLAS07 | RAG Poisoning | Partial | Response scanning, simulation, and attestation help detect the condition. External corpus ownership remains outside Pipelock's control plane. |
| ATLAS08 | LLM Prompt Obfuscation | Covered | Normalized scanning detects hidden or obfuscated instruction payloads. |
| ATLAS09 | LLM Trusted Output Components Manipulation | Partial | Attestation and assessment reduce trust abuse. Final user trust decisions remain outside the binary. |
| ATLAS10 | Citation Manipulation | Partial | Attested evidence and assessment can surface manipulated citations. Citation correctness depends on upstream retrieval sources. |
| ATLAS11 | False RAG Entry Injection | Partial | Response scanning, discovery, and simulation surface injected entries. The proxy does not own corpus write paths. |
| ATLAS12 | Data-Structure Injection | Covered | Structured input validation and policy enforcement catch schema exploitation. |
| ATLAS13 | Structured Self-Modeling | Covered | Dry-run and simulation make structured prompt manipulation easier to validate. |
| ATLAS14 | Agent Backdoor Persistence | Partial | The flight recorder, attestation, and human review help surface persistence. Persistent agent state and scheduler control remain external. |

## What the partial mappings leave outside Pipelock

Pipelock can inspect, simulate, record, and attest to activity at its control points. It does not curate an external corpus, decide whether a reader should trust an output, validate the correctness of citations from an upstream retrieval source, or govern the write path for a corpus. It also does not fully govern long-lived agent state or scheduler control.

Those are deployment and system-ownership concerns. Treat the mapping as evidence for the controls Pipelock contributes, then add the controls that own the remaining surface.

## Use the mapping as evidence

Pipelock's compliance catalog feeds the assessment output and its framework summaries. The mapping names the technique IDs and the feature evidence behind them, so a reviewer can see which claim belongs to which control.

For the product's broader evidence model, read [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/). For the other framework mappings in the catalog, see [AI Agent Regulatory Controls](/learn/ai-agent-regulatory-controls/).

## Further reading

- [MITRE ATLAS](https://atlas.mitre.org/): the framework source.
- [AI compliance evidence](/learn/compliance-evidence/): Pipelock assessment and evidence bundles.
- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): what Pipelock evidence proves and does not prove.
- [Shipped mapping (Pipelock v3.7.1)](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/atlas.go): control IDs, status, evidence, and limitations.
