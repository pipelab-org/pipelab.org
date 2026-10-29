---
title: "OWASP AIVSS: Pipelock Agent Risk Coverage"
linkTitle: "OWASP AIVSS Coverage"
subtitle: "AIVSS scoring context and the boundary of Pipelock Assess framework mappings."
description: "OWASP AIVSS scoring context: risk amplification and mitigation factors. Pipelock Assess v3.7.1 does not ship an AIVSS mapping or score reduction."
date: 2026-03-19
faq:
  - q: "What is OWASP AIVSS?"
    a: "OWASP AIVSS (AI Vulnerability Scoring System) is a framework for scoring security vulnerabilities in agentic AI systems. It extends CVSS v4.0 with 10 agentic risk amplification factors that quantify how agent autonomy, tool use, and persistence multiply the blast radius of technical vulnerabilities. Version 0.8 was released March 2026."
learn_cat: compliance
level: ref
tags:
  - owasp
  - aivss
  - OWASP-AIVSS
---
[OWASP AIVSS](https://aivss.owasp.org/) (AI Vulnerability Scoring System) scores security vulnerabilities in agentic AI systems. It extends CVSS v4.0 with 10 factors that measure how agent autonomy, tool use, and persistence amplify the blast radius of technical vulnerabilities.

Version 0.8 was released March 19, 2026. The review board includes Jason Clinton (Deputy CISO, Anthropic), Rob Joyce (ex-NSA, advisor to OpenAI), and Martin Stanley (NIST AI RMF lead). RSAC 2026 presentation: March 23.

## The Mitigation Factor

AIVSS includes a **Mitigation Factor** in its scoring formula. Pipelock Assess v3.7.1 does not include an AIVSS mapping or calculate an AIVSS score reduction.

| Mitigation Strength | Factor | What It Means |
|---|---|---|
| No/Weak Mitigation | 1.00 | Mitigations absent or ineffective |
| Partial Mitigation | 0.83 | Some mitigations exist but incomplete or unvalidated |
| **Strong Mitigation** | **0.67** | **Effective mitigations in place, validated, consistently enforceable (fail-closed where applicable)** |

Use the [shipped OWASP MCP](/learn/owasp-mcp-top10/) and [Agentic Top 10](/learn/owasp-agentic-top10/) mappings for Pipelock control evidence. A deployment-specific AIVSS assessment requires separate validation.

## AIVSS Scoring Formula

The full AIVSS v0.8 formula:

```
Risk_Gap    = 10 - CVSS_Base
AARS        = Risk_Gap * (Factor_Sum / 10) * Threat_Multiplier
AIVSS       = (CVSS_Base + AARS) * Mitigation_Factor
```

Where AARS (Agentic AI Risk Score) is the uplift from agentic capabilities, Factor_Sum is the sum of all 10 amplification factors (0.0-10.0), and Threat_Multiplier defaults to 0.97.

## References

- [OWASP AIVSS v0.8 Specification (PDF)](https://aivss.owasp.org/assets/publications/AIVSS%20Scoring%20System%20For%20OWASP%20Agentic%20AI%20Core%20Security%20Risks%20v0.8.pdf)
- [OWASP AIVSS Calculator](https://aivss.owasp.org/)
- [AIVSS GitHub Repository](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system)
- [Pipelock Documentation](https://pipelab.org/learn/)

- [Assess v3.7.1 framework catalog](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/coverage.go): the shipped framework list.
