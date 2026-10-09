---
title: "AI Agent Regulatory Controls and Evidence Hub"
linkTitle: "AI Agent Regulatory Controls"
seoTitle: "AI Agent Regulatory Controls and Evidence Hub"
subtitle: "How Pipelock evidence supports AI agent obligations under the EU AI Act, DORA, NIS2, NIST AI RMF, ISO/IEC 42001, the Colorado AI Act, SOC 2, and OWASP frameworks."
description: "How Pipelock evidence maps to AI agent regulatory programs: EU AI Act, DORA, NIS2, Colorado AI Act, NIST AI RMF, ISO 42001, SOC 2, OWASP."
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
    a: "June 30, 2026. The original Colorado AI Act (SB24-205) set an effective date of February 1, 2026. SB25B-004 amended that date to June 30, 2026, giving deployers and developers additional implementation time. The substantive obligations, including the risk-management program requirement, consumer notice rules, and the algorithmic discrimination impact assessment, apply from the amended date."
  - q: "What is the difference between in force and applies from?"
    a: "Many EU regulations enter into force long before their substantive obligations apply to organizations. DORA entered into force on January 16, 2023 but applied to financial entities only from January 17, 2025. Regulation (EU) 2026/1744 entered into force on 27 July 2026 but defers stand-alone Annex III high-risk obligations to 2 December 2027 and embedded-in-product safety-component obligations to 2 August 2028. Always check the applies-from date for the specific scope you operate under, not just the entry-into-force date."
  - q: "Does Pipelock satisfy DORA?"
    a: "No vendor can satisfy DORA on its own. DORA is a regulatory regime addressed to financial entities, not to ICT providers. Pipelock supplies runtime control evidence, action receipts, scanner verdicts, incident-evidence trails, that financial entities can fold into a DORA-aligned ICT risk management framework under Article 6 and the incident-management requirements under Article 17. The financial entity, not Pipelock, owns the risk program, the resolution and recovery planning, the Threat-Led Penetration Testing program, and the regulator reporting workflow."
  - q: "Which OWASP frameworks does Pipelock map to?"
    a: "Five: the OWASP Top 10 for LLM Applications, the OWASP Top 10 for MCP, the OWASP Agentic Top 10, the OWASP Agentic Threats and Mitigations taxonomy, and the OWASP AIVSS scoring framework. Each has its own dedicated mapping page on this site, see the OWASP section below for the cross-links. OWASP frameworks are community-driven and not regulatory, but they are widely cited inside enterprise risk programs."
---

Most AI agent compliance writing collapses into one of two shapes: a vendor that claims to "solve" a framework, or a legal-summary blog post with no product story. Both are useless to the buyer who actually has to ship.

This page is built for the buyer doing the work. It maps Pipelock evidence to the obligations of each major framework with honest scope: what the framework asks, what Pipelock supplies, and what it does not cover. Use it as a starting point for procurement and audit conversations. Every assertion below has a public source link.

Pipelock's job is to record what an agent attempted, which control point observed it, which policy applied, what verdict was reached, and whether the evidence can be verified later. That output, the [signed action receipt](/learn/action-receipt-spec/), the [hash-chained flight recorder](/learn/flight-recorder/), and the bundled [Audit Packet](/learn/agent-egress-control/), is what your existing compliance program needs to demonstrate AI agent operations independent of the agent's own self-attestation. The [compliance evidence substrate](/learn/compliance-evidence-substrate/) page is the authoritative public scope.

## Cross-framework evidence map

| Pipelock evidence artifact | EU AI Act | NIST AI RMF | ISO/IEC 42001 | DORA | NIS2 | Colorado AI Act | SOC 2 |
|---|---|---|---|---|---|---|---|
| Action receipts (Ed25519-signed, hash-chained) | Art 12, 26(5), 26(6) | MEASURE, MANAGE | runtime control evidence (defer to licensed text for clause mapping) | Art 17 incident-management evidence | Art 23 incident reporting | risk-mgmt program evidence | CC7, CC8 |
| Audit packet bundles (verifier-checkable) | Art 12, 26(6) | MAP, MEASURE | runtime control evidence | Art 17 | Art 23 | risk-mgmt evidence | CC7, CC8 |
| Posture capsule + policy hash | Art 9-adjacent, Art 26(1) | GOVERN | AIMS policy evidence | Art 6 ICT risk management framework | Art 21 cybersecurity measures | risk-mgmt program | CC6, CC8 |
| Scanner verdicts + flight recorder | Art 15(4) fail-safe, Art 15(5) cybersecurity | MEASURE, MANAGE | runtime evidence | Art 6, Art 17 | Art 21, 23 | decision evidence | CC7 |
| Kill switch + HITL approvals | Art 14 human oversight | MANAGE | AIMS operational control | Art 6 | Art 21 | human-oversight evidence | CC6 |
| Capability separation architecture (agent has secrets; proxy has network) | Art 15(5) cybersecurity | GOVERN, MANAGE | AIMS technical safeguard | Art 6 | Art 21 | technical safeguard | CC6 |
| Cosign-signed releases + SLSA L3 provenance | Art 15(5) | MAP, GOVERN | AIMS supply chain | Art 28-30 third-party ICT risk | Art 21 supply-chain measures | supply-chain integrity | CC8 |

Treat each row as a conversation starter with the auditor or procurement reviewer, not a checkmark. The reviewer will ask follow-ups; the receipt artifact answers them.

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

**What Pipelock evidence supports:**

- **Article 12**, automatic recording of events (logs) over the system lifecycle. Pipelock's structured JSON receipts and flight recorder provide evidence toward the technical capability. The capability is the provider obligation under Article 12; the runtime emission is what makes the capability usable in a deployer's program.
- **Article 15(4)**, fail-safe behavior. Pipelock's fail-closed defaults (scan errors, HITL timeouts, parse failures, DNS errors all return block) provide auditable fail-safe behavior.
- **Article 15(5)**, cybersecurity and resilience. DLP scanning, SSRF protection, capability separation, and the OR-composed kill switch supply control evidence.
- **Article 14**, human oversight. HITL terminal approval flow and the six-source kill switch supply human-oversight artifacts the deployer can demonstrate.
- **Article 26(1)**, use the system per the provider's instructions for use. Posture verify CI gate + policy-hash receipts let the deployer demonstrate runtime conformity with the documented deployment profile.
- **Article 26(5)**, monitor operation and inform provider/authority of risks and serious incidents. Pipelock's `/metrics`, `/health`, `/ready` endpoints + webhook/syslog audit sinks supply the monitoring substrate.
- **Article 26(6)**, keep logs for at least six months. Pipelock emits structured logs to any retention-controlled store (S3 Object Lock, Loki, SIEM lifecycle); the deployer chooses the store and the retention period.

**What Pipelock does NOT cover under the EU AI Act:**

- Article 9 risk management process (organizational program)
- Article 10 training data governance
- Article 11 system-level technical documentation
- Article 13 transparency to deployers (provider obligation)
- Article 27 fundamental rights impact assessment
- Article 43 conformity assessment

The deeper Article-by-Article mapping lives on the [EU AI Act compliance page](/learn/eu-ai-act-compliance/).

### NIST AI Risk Management Framework 1.0

**Source:** [nist.gov/itl/ai-risk-management-framework](https://www.nist.gov/itl/ai-risk-management-framework)

**Status:** Voluntary U.S. federal framework, widely adopted by enterprise risk programs. The Generative AI Profile (NIST AI 600-1, published 2024-07-26) extends the RMF for generative AI specifically.

**What Pipelock evidence supports, across the four core functions:**

- **GOVERN**, capability separation, fail-closed defaults, per-instance isolation, signed policy hash, posture capsule for runtime governance evidence.
- **MAP**, audit packet + session metadata + chain-linked receipt history for "what was the system doing in this context."
- **MEASURE**, scanner verdicts, [Agent Egress Bench](https://github.com/luckyPipewrench/agent-egress-bench) corpus results, signed conformance bundles for "how is the system performing against measurable controls."
- **MANAGE**, kill switch, fail-closed verdicts, HITL approvals, adaptive enforcement levels for "how do we respond when something goes wrong."

**What Pipelock does NOT cover under NIST AI RMF:**

- Organizational governance design (RACI, board oversight, AI ethics committee)
- Model-level evaluations (Pipelock evaluates traffic and tool decisions, not model behavior in isolation)
- RMF Profile-specific obligations beyond runtime (Generative AI Profile has data-governance and content-provenance requirements outside Pipelock's scope)

### ISO/IEC 42001:2023, AI Management Systems

**Source:** [iso.org/standard/42001](https://www.iso.org/standard/42001) (overview; full text is paywalled)

**Status:** International voluntary standard published December 2023, certifiable. Specifies requirements for an AI management system (AIMS) within organizations, with a risk-based approach. Annexes provide reference controls and implementation guidance.

**What Pipelock evidence supports:**

Pipelock supplies runtime-control evidence that an AIMS can reference for monitoring, measurement, evaluation, and operational control. Specific clause-by-clause mapping is intentionally deferred on this public page, ISO 42001 clause text is paywalled and we do not paraphrase licensed standard language without the licensed text in hand. Talk to procurement; their licensed copy is the right reference. The artifact types Pipelock produces (receipts, audit packets, posture capsules) are compatible with the AIMS control-evidence model.

**What Pipelock does NOT cover:**

- AIMS scope definition, leadership commitment, internal audit program
- Management review cycle, certification audit preparation
- Annex A control selection or risk-treatment plan design

### EU Digital Operational Resilience Act (DORA), Regulation (EU) 2022/2554

**Source:** [eba.europa.eu/single-rule-book-qa](https://www.eba.europa.eu/single-rule-book-qa)

**Timeline:**

- Entered into force: January 16, 2023
- Applies from: **January 17, 2025** (already in force)

**Scope:** EU financial entities and their ICT third-party providers ("TPPs", the path that brings AI agent vendors into the DORA conversation).

**What Pipelock evidence supports:**

- **Article 6**, sound, comprehensive, well-documented ICT risk management framework. Capability separation architecture + posture capsule + policy hash provide auditable technical evidence.
- **Article 17**, ICT-related incident management process. Hash-chained receipt history + flight recorder provide the incident-evidence trail. When the financial entity has to reconstruct an AI-agent incident, the receipt chain is the artifact.
- **Article 19**, reporting of major ICT-related incidents. Receipts are exportable, verifier-checkable bundles that fit inside the reporting templates the financial entity owes its competent authority.
- **Article 45**, information-sharing arrangements on cyber threat information and intelligence. Receipts are designed for cross-organization sharing without revealing internal infrastructure detail.
- **Articles 28-30**, third-party ICT risk for vendors embedding agents in financial workflows. Pipelock's supply-chain artifacts (cosign-signed releases + SLSA L3 provenance) supply the technical evidence procurement needs from the TPP.

**What Pipelock does NOT cover under DORA:**

- Article 21 centralisation of major ICT-related incident reporting (the EBA central hub mechanism)
- Articles 24-27 Threat-Led Penetration Testing program design
- Financial-entity ICT risk management governance
- Resolution and recovery planning
- Regulator reporting submissions
- Designation of ICT third-party providers as critical ICT providers

**Framing rule:** Pipelock supplies runtime evidence that supports DORA-aligned ICT risk programs in financial entities deploying AI agents. The financial entity, not Pipelock, owns the risk program.

### EU NIS2 Directive, Directive (EU) 2022/2555

**Source:** [eur-lex.europa.eu/eli/dir/2022/2555/oj](https://eur-lex.europa.eu/eli/dir/2022/2555/oj)

**Timeline:**

- Entered into force: January 16, 2023
- Transposition deadline: October 17, 2024 (national implementations vary; expect continued variance through 2026)

**Scope:** "Essential entities" and "important entities" across eighteen sectors. Includes ICT and digital infrastructure where AI agents are commonly deployed.

**What Pipelock evidence supports:**

- **Article 21**, cybersecurity risk-management measures. Runtime control evidence at the agent egress boundary supports the "technical, operational, and organizational measures" requirement.
- **Article 23**, incident reporting. The receipt chain is incident-evidence readiness; the verifier output is auditor-checkable proof.

**What Pipelock does NOT cover under NIS2:**

- Entity-level ICT risk management governance
- Supply-chain security policy at the organizational level
- Cryptography policy at the infrastructure level
- Business-continuity planning
- National-authority reporting workflows

**Framing rule:** Pipelock supplies runtime evidence that supports NIS2-aligned cybersecurity risk-management measures under Article 21. The covered entity owns the program.

### Colorado AI Act, SB24-205 (amended by SB25B-004)

**Sources:** [leg.colorado.gov/bills/sb24-205](https://leg.colorado.gov/bills/sb24-205) (original); [leg.colorado.gov/bills/sb25b-004](https://leg.colorado.gov/bills/sb25b-004) (delay amendment)

**Timeline:**

- Original effective date (per SB24-205): February 1, 2026
- **Amended effective date (per SB25B-004): June 30, 2026**, the operative date for substantive obligations.

**Scope:** High-risk AI systems deployed in Colorado that influence consequential decisions in employment, education, financial services, healthcare, housing, insurance, legal services, or government. Both developer and deployer obligations.

**What Pipelock evidence supports:**

- Deployer risk management program, runtime evidence of decision logic, control points, and verdict history.
- Consumer notice readiness, decision evidence chains the deployer can reference when explaining a decision to an affected consumer.
- Algorithmic discrimination impact assessment, supporting evidence at the runtime layer (Pipelock does not produce the statistical bias analysis itself).

**What Pipelock does NOT cover:**

- Risk management program design and documentation
- Consumer notification workflows
- Attorney general reporting
- Employment-discrimination policy review (a Colorado-specific obligation cluster)

### SOC 2 Trust Services Criteria

**Source:** [AICPA Trust Services Criteria](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)

**Status:** Not regulatory; voluntary attestation. Widely required for enterprise procurement and for SaaS deployments handling customer data.

**What Pipelock evidence supports:**

- **CC6 Logical Access**, kill switch, HITL approvals, capability separation evidence.
- **CC7 System Operations**, security event detection and monitoring receipts, scanner verdicts, flight recorder.
- **CC8 Change Management**, policy hash + audit packet evidence at the agent-decision level. Posture-verify CI gate provides change-control artifacts.
- **Processing Integrity (PI)**, when AI workflow outputs are part of the service, scanner-verdict and decision-receipt evidence supports PI claims.

**What Pipelock does NOT cover:**

- Type-1 or Type-2 audit process itself
- Control design, organizational policy
- Vendor management program

### OWASP frameworks

Five OWASP frameworks already have dedicated mapping pages on this site:

- [OWASP Top 10 for LLM Applications](/learn/owasp-llm-top10/)
- [OWASP Top 10 for MCP](/learn/owasp-mcp-top10/)
- [OWASP Agentic Top 10](/learn/owasp-agentic-top10/)
- [OWASP Agentic Threats taxonomy](/learn/owasp-agentic-threats/)
- [OWASP AIVSS coverage](/learn/owasp-aivss-coverage/)

OWASP frameworks are community-driven, not regulatory. They are widely cited inside enterprise risk programs and increasingly referenced in procurement questionnaires. The dedicated pages above map specific OWASP items to Pipelock detections; this hub is the cross-link entry point.

### Frameworks NOT in detailed scope on this page

- **prEN 18282** (European Norm draft on AI cybersecurity), draft state, not yet published. Light reference only in [EU AI Act runtime security](/blog/eu-ai-act-runtime-security/). Pipelock will publish a detailed mapping when CEN finalizes the standard.
- **NYC Local Law 144** (Automated Employment Decision Tools), Pipelock supplies runtime egress and tool-call evidence; LL144 requires statistical bias audits that are outside this evidence scope.
- **State-level U.S. AI laws** (California, Texas, others), many are early-stage. Coverage will expand as obligations clarify.

## How to use this map

1. **Identify your jurisdiction and applicable framework.** Procurement, legal, and compliance will know; this page is not a substitute for that work.
2. **Map your obligations to the artifact rows in the table above.** For each artifact, the table identifies which framework's items it supports.
3. **Generate the bundle.** Run [`pipelock assess`](/assess/) to produce a signed evidence bundle covering the configuration hash (a SHA-256 of the active config) and the run's scanner verdicts. Cite the bundle as evidence for the specific framework obligations you map to it; the bundle itself is framework-neutral. Provide the bundle and the public key to the auditor. They verify offline with the [Python verifier](https://github.com/luckyPipewrench/pipelock-verify-python).
4. **Walk through a single decision end-to-end.** The [What did my agent do?](/learn/what-did-my-agent-do/) demo page shows the full chain, request, verdict, signed receipt, verifier output, so the reviewer can see exactly what one row of the bundle looks like in operation.

## Further reading

- [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/): the authoritative public scope statement.
- [Action Receipt Spec](/learn/action-receipt-spec/): full schema for the receipt artifact.
- [What did my agent do?](/learn/what-did-my-agent-do/): single-decision walkthrough with real receipt and verifier output.
- [EU AI Act Compliance](/learn/eu-ai-act-compliance/): deeper Article-by-Article mapping.
- [AI Agent Compliance](/learn/ai-agent-compliance/): the broader compliance landscape.
- [Agent Egress Control](/learn/agent-egress-control/): kernel-enforced containment with Audit Packet.
- [Pipelock Assess](/assess/): signed bundle generation for procurement and audit.
