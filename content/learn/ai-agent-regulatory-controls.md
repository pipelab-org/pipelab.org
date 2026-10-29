---
title: "AI Agent Regulatory Controls and Evidence Hub"
linkTitle: "AI Agent Regulatory Controls"
seoTitle: "AI Agent Regulatory Controls and Evidence Hub"
subtitle: "Which AI agent frameworks have shipped Pipelock Assess mappings (EU AI Act, NIST AI RMF, SOC 2, OWASP) and which are regulatory background (DORA, NIS2, ISO/IEC 42001, Colorado)."
description: "AI agent regulatory controls: shipped Pipelock Assess mappings for EU AI Act, NIST AI RMF, SOC 2 and OWASP, plus DORA, NIS2, ISO 42001 and Colorado notes."
date: 2026-05-11
lastmod: 2026-08-24
learn_cat: compliance
level: ref
tags:
  - evidence
  - regulatory
  - eu-ai-act
  - dora
  - nis2
  - nist-ai-rmf
  - iso-42001
  - colorado-ai-act
  - soc-2
  - owasp
faq:
  - q: "Does Pipelock make my AI agents compliant with the EU AI Act?"
    a: "No. Pipelock is an evidence substrate, not a compliance product. It supplies runtime evidence, action receipts, scanner verdicts, audit packets, posture metadata, that procurement, audit, and legal teams use inside their existing compliance programs. The organization still owns the risk management process (Article 9), training data governance (Article 10), technical documentation (Article 11), fundamental rights impact assessment (Article 27), and the conformity assessment itself (Article 43). Pipelock evidence most directly supports Article 12 (automatic event recording) and Article 26 (deployer obligations including the six-month log retention floor in Article 26(6))."
  - q: "When do EU AI Act high-risk obligations apply?"
    a: "Regulation (EU) 2026/1744, the Digital Omnibus on AI, defers stand-alone Annex III high-risk obligations to 2 December 2027 and Annex I embedded-in-product safety-component obligations to 2 August 2028. The European Parliament endorsed it on 16 June 2026, the Council gave final approval on 29 June 2026, and it entered into force on 27 July 2026 after publication in the Official Journal on 24 July 2026."
  - q: "When does the Colorado AI Act apply?"
    a: "The original Colorado AI Act (SB24-205) set an effective date of February 1, 2026, and SB25B-004 moved it to June 30, 2026. SB26-189, signed May 14, 2026, then repealed and reenacted those provisions around automated decision-making technology (ADMT) used in consequential decisions. Its developer documentation duties and the attorney general's rulemaking deadline fall on January 1, 2027."
  - q: "What is the difference between in force and applies from?"
    a: "Many EU regulations enter into force long before their substantive obligations apply to organizations. DORA entered into force on January 16, 2023 but applied to financial entities only from January 17, 2025. Regulation (EU) 2026/1744 entered into force on 27 July 2026 but defers stand-alone Annex III high-risk obligations to 2 December 2027 and embedded-in-product safety-component obligations to 2 August 2028. Always check the applies-from date for the specific scope you operate under, not just the entry-into-force date."
  - q: "Does Pipelock satisfy DORA?"
    a: "No. Assess v3.7.1 has no DORA control mapping. The financial entity owns its ICT risk management, incident reporting, testing, and recovery program."
  - q: "Which OWASP frameworks does Pipelock map to?"
    a: "Assess v3.7.1 includes OWASP MCP Top 10 and OWASP Agentic Top 10. Separate published documentation mappings cover LLM Top 10 and OWASP Agentic AI Threats and Mitigations. AIVSS provides scoring context. None of these three is an Assess report mapping."
---

Most AI agent compliance writing collapses into one of two shapes: a vendor that claims to "solve" a framework, or a legal-summary blog post with no product story. Both are useless to the buyer who actually has to ship.

This page is built for the buyer doing the work. It distinguishes shipped Assess mappings from regulatory background: what the framework asks, what the catalog includes, and what the operator owns. Use it as a starting point for procurement and audit conversations. Every assertion below has a public source link.

Pipelock's job is to record what an agent attempted, which control point observed it, which policy applied, what verdict was reached, and whether the evidence can be verified later. That output, the [signed action receipt](/learn/action-receipt-spec/), the [hash-chained flight recorder](/learn/flight-recorder/), and the bundled [Audit Packet](/learn/agent-egress-control/), is what your existing compliance program needs to demonstrate AI agent operations independent of the agent's own self-attestation. The [compliance evidence substrate](/learn/compliance-evidence-substrate/) page is the authoritative public scope.

## Cross-framework evidence map

Assess v3.7.1 includes seven frameworks. The catalog's control IDs are product mapping identifiers; partial and not-covered entries remain visible.

| Framework | Shipped mapping entries |
|---|---|
| [EU AI Act](/learn/eu-ai-act-compliance/) | A12, A13 (partial), A14, A26 |
| [NIST AI RMF](/learn/nist-ai-rmf/) | GOVERN, MAP, MEASURE, MANAGE, plus four Generative AI entries |
| [SOC 2](/learn/soc2-trust-services-criteria/) | SEC, AVA, PI, CONF, PRIV; no CC6-CC9 control-level mapping |
| [MITRE ATLAS](/learn/mitre-atlas/) | ATLAS01-ATLAS14 |
| [HIPAA Security Rule](/learn/hipaa-security-rule/) | Selected technical and administrative safeguards |
| [OWASP MCP Top 10](/learn/owasp-mcp-top10/) | MCP01-MCP10 |
| [OWASP Agentic Top 10](/learn/owasp-agentic-top10/) | ASI01-ASI10; ASI10 is not covered |

ISO/IEC 42001, DORA, NIS2, and Colorado law are regulatory background below, not shipped Assess mappings. An auditor decides whether the records support an organization's separately designed controls.

## Frameworks in scope

### EU AI Act, Regulation (EU) 2024/1689

**Source:** [eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689)

**Timeline:**

- Entered into force: August 1, 2024
- Article 5 prohibited practices: applied from February 2, 2025
- Article 51-55 general-purpose AI model obligations: applied from August 2, 2025
- Regulation (EU) 2026/1744, the Digital Omnibus on AI, was published in the Official Journal on July 24, 2026 and entered into force on July 27, 2026
- Stand-alone Annex III high-risk AI system obligations: apply from **December 2, 2027**
- Annex I embedded-in-product safety-component obligations: apply from **August 2, 2028**

**Shipped Assess mappings:** Article 12 (flight recorder and attestation), Article 13 (assessment reports, partial), Article 14 (HITL and simulation), and Article 26 (assessment, flight recorder, and audit emission). See the [EU AI Act mapping](/learn/eu-ai-act-compliance/) for the evidence and limitations. Articles 9 and 15 are not in this catalog.

**What Pipelock does NOT cover under the EU AI Act:**

- Article 9 risk management process (organizational program)
- Article 10 training data governance
- Article 11 system-level technical documentation
- Full Article 13 provider instructions (the shipped mapping is partial)
- Article 27 fundamental rights impact assessment
- Article 43 conformity assessment

The deeper Article-by-Article mapping lives on the [EU AI Act compliance page](/learn/eu-ai-act-compliance/).

### NIST AI Risk Management Framework 1.0

**Source:** [nist.gov/itl/ai-risk-management-framework](https://www.nist.gov/itl/ai-risk-management-framework)

**Status:** Voluntary U.S. federal framework, widely adopted by enterprise risk programs. The Generative AI Profile (NIST AI 600-1, published 2024-07-26) extends the RMF for generative AI specifically.

**Shipped Assess mappings:** GOVERN and MAP are partial; MEASURE and MANAGE are covered. GOVERN uses audit emission, flight-recorder evidence, and attestation. MAP uses discovery, audit, and assessment. MEASURE uses simulation, assessment, metrics, and the flight recorder. MANAGE uses proxy and MCP policy, kill switch, adaptive enforcement, and live-lock contracts. See [NIST AI RMF coverage](/learn/nist-ai-rmf/) for the Generative AI entries and operator-owned gaps.

**What Pipelock does NOT cover under NIST AI RMF:**

- Organizational governance design (RACI, board oversight, AI ethics committee)
- Model-level evaluations (Pipelock evaluates traffic and tool decisions, not model behavior in isolation)
- RMF Profile-specific obligations beyond runtime (Generative AI Profile has data-governance and content-provenance requirements outside Pipelock's scope)

### ISO/IEC 42001:2023, AI Management Systems

**Source:** [iso.org/standard/42001](https://www.iso.org/standard/42001) (overview; full text is paywalled)

**Status:** International voluntary standard published December 2023, certifiable. Specifies requirements for an AI management system (AIMS) within organizations, with a risk-based approach. Annexes provide reference controls and implementation guidance.

Assess v3.7.1 does not include an ISO/IEC 42001 control mapping. The organization owns its program, control design, and evaluation of runtime records.

### EU Digital Operational Resilience Act (DORA), Regulation (EU) 2022/2554

**Source:** [European Commission: Digital Operational Resilience Act](https://finance.ec.europa.eu/digital-finance/cyber-resilience_en#legislation)

**Timeline:**

- Entered into force: January 16, 2023
- Applies from: **January 17, 2025** (already in force)

**Scope:** EU financial entities and their ICT third-party providers ("TPPs", the path that brings AI agent vendors into the DORA conversation).

Assess v3.7.1 does not include a DORA control mapping. The organization owns its program, control design, and evaluation of runtime records.

### EU NIS2 Directive, Directive (EU) 2022/2555

**Source:** [eur-lex.europa.eu/eli/dir/2022/2555/oj](https://eur-lex.europa.eu/eli/dir/2022/2555/oj)

**Timeline:**

- Entered into force: January 16, 2023
- Transposition deadline: October 17, 2024 (national implementations vary; expect continued variance through 2026)

**Scope:** "Essential entities" and "important entities" across eighteen sectors. Includes ICT and digital infrastructure where AI agents are commonly deployed.

Assess v3.7.1 does not include a NIS2 control mapping. The organization owns its program, control design, and evaluation of runtime records.

### Colorado AI Act, SB24-205 (repealed and reenacted by SB26-189) {#colorado-ai-act-sb24-205-amended-by-sb25b-004}

**Sources:** [leg.colorado.gov/bills/sb24-205](https://leg.colorado.gov/bills/sb24-205) (original); [leg.colorado.gov/bills/sb25b-004](https://leg.colorado.gov/bills/sb25b-004) (delay amendment); [leg.colorado.gov/bills/sb26-189](https://leg.colorado.gov/bills/sb26-189) (repeal and reenactment)

**Timeline:**

- Original effective date (per SB24-205): February 1, 2026
- SB25B-004 moved that date to June 30, 2026.
- **SB26-189, signed May 14, 2026, repealed and reenacted those provisions** around automated decision-making technology (ADMT) used in consequential decisions. Developer documentation duties and the attorney general's rulemaking deadline fall on January 1, 2027.

**Scope:** Covered ADMT used in consequential decisions about consumers. Both developer and deployer obligations, including point-of-interaction notice, adverse-outcome explanations, and three-year recordkeeping.

Assess v3.7.1 does not include a Colorado control mapping. The organization owns its program, control design, and evaluation of runtime records.

### SOC 2 Trust Services Criteria

**Source:** [AICPA Trust Services Criteria](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)

**Status:** Not regulatory; voluntary attestation. Widely required for enterprise procurement and for SaaS deployments handling customer data.

**Shipped Assess mappings:** SEC (Security), AVA (Availability, partial), PI (Processing Integrity), CONF (Confidentiality), and PRIV (Privacy, partial). The catalog does not map CC6, CC7, or CC8 individually. See [SOC 2 criteria mapping](/learn/soc2-trust-services-criteria/) for product evidence and limits.

**What Pipelock does NOT cover:**

- Type-1 or Type-2 audit process itself
- Control design, organizational policy
- Vendor management program

### OWASP frameworks

Two OWASP frameworks have shipped Assess mappings: [MCP Top 10](/learn/owasp-mcp-top10/) and [Agentic Top 10](/learn/owasp-agentic-top10/). Separate published documentation mappings cover [LLM Top 10](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/owasp-llm-top10-mapping.md) and [OWASP Agentic AI Threats and Mitigations](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/owasp-agentic-top15-mapping.md). AIVSS provides scoring context. The guides below keep those sources and scopes separate:

- [OWASP Top 10 for LLM Applications](/learn/owasp-llm-top10/)
- [OWASP Top 10 for MCP](/learn/owasp-mcp-top10/)
- [OWASP Agentic Top 10](/learn/owasp-agentic-top10/)
- [OWASP Agentic Threats taxonomy](/learn/owasp-agentic-threats/)
- [OWASP AIVSS scoring context](/learn/owasp-aivss-coverage/)

OWASP frameworks are community-driven, not regulatory. They are widely cited inside enterprise risk programs and increasingly referenced in procurement questionnaires. Only MCP and Agentic Top 10 have shipped Assess mappings; LLM Top 10 and Agentic AI Threats and Mitigations have separate documentation ratings. This hub links to each guide's evidence and limits.

### Frameworks NOT in detailed scope on this page

- **prEN 18282** (European Norm draft on AI cybersecurity), draft state, not yet published. Light reference only in [EU AI Act runtime security](/blog/eu-ai-act-runtime-security/). Pipelock will publish a detailed mapping when CEN finalizes the standard.
- **NYC Local Law 144** (Automated Employment Decision Tools), Pipelock supplies runtime egress and tool-call evidence; LL144 requires statistical bias audits that are outside this evidence scope.
- **State-level U.S. AI laws** (California, Texas, others), many are early-stage. Coverage will expand as obligations clarify.

## How to use this map

1. **Identify your jurisdiction and applicable framework.** Procurement, legal, and compliance will know; this page is not a substitute for that work.
2. **Review the shipped mapping entries above.** For frameworks outside that catalog, design and validate any control mapping within your own program.
3. **Generate the bundle.** Run [`pipelock assess`](/assess/) to produce a signed evidence bundle covering the configuration hash (a SHA-256 of the active config) and the run's scanner verdicts. Cite the bundle as evidence for the specific framework obligations you map to it; the bundle itself is framework-neutral. Provide the bundle and the public key to the auditor. They verify offline with the [Python verifier](https://github.com/pipelab-org/pipelock-verify-python).
4. **Walk through a single decision end-to-end.** The [What did my agent do?](/learn/what-did-my-agent-do/) demo page shows the full chain, request, verdict, signed receipt, verifier output, so the reviewer can see exactly what one row of the bundle looks like in operation.

## Further reading

- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): the authoritative public scope statement.
- [Action Receipt Spec](/learn/action-receipt-spec/): full schema for the receipt artifact.
- [What did my agent do?](/learn/what-did-my-agent-do/): single-decision walkthrough with real receipt and verifier output.
- [EU AI Act Compliance](/learn/eu-ai-act-compliance/): deeper Article-by-Article mapping.
- [AI Agent Compliance](/learn/ai-agent-compliance/): the broader compliance landscape.
- [Agent Egress Control](/learn/agent-egress-control/): kernel-enforced containment with Audit Packet.
- [Pipelock Assess](/assess/): signed bundle generation for procurement and audit.

- [Assess v3.7.1 framework catalog](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/coverage.go): the shipped framework list.
