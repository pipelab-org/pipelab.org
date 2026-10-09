---
title: "OWASP AIVSS: Pipelock Agent Risk Coverage"
linkTitle: "OWASP AIVSS Coverage"
subtitle: "Mapping Pipelock's controls to scenarios within all 10 OWASP Agentic AI Core Security Risks."
description: "Pipelock maps controls to all 10 OWASP AIVSS agentic AI risk categories, supporting assessments that reduce vulnerability scores by up to 33%."
date: 2026-03-19
faq:
  - q: "What is OWASP AIVSS?"
    a: "OWASP AIVSS (AI Vulnerability Scoring System) is a framework for scoring security vulnerabilities in agentic AI systems. It extends CVSS v4.0 with 10 agentic risk amplification factors that quantify how agent autonomy, tool use, and persistence multiply the blast radius of technical vulnerabilities. Version 0.8 was released March 2026."
  - q: "How does Pipelock affect AIVSS scores?"
    a: "When deployed and validated in context, pipelock can support a strong-mitigation assessment under AIVSS, potentially reducing the Mitigation Factor from 1.0 to 0.67 (up to 33% score reduction). Pipelock's fail-closed defaults, DLP scanning, kill switch, and MCP tool scanning directly address the controls AIVSS evaluates."
  - q: "Which OWASP AIVSS risks does Pipelock cover?"
    a: "Pipelock maps controls to scenarios within all 10 OWASP Agentic AI Core Security Risks: Tool Misuse (DLP, tool policy, session binding), Access Control Violation (capability separation), Cascading Failures (fail-closed, kill switch), Orchestration Exploitation (chain detection, input scanning), Identity Impersonation (session binding), Memory and Context Manipulation (response scanning), Critical Systems Interaction (SSRF protection), Supply Chain Risk (tool drift detection), Untraceability (metrics and event emission), and Goal Manipulation (injection detection, adaptive enforcement)."
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

AIVSS includes a **Mitigation Factor** in its scoring formula. This is where pipelock fits.

| Mitigation Strength | Factor | What It Means |
|---|---|---|
| No/Weak Mitigation | 1.00 | Mitigations absent or ineffective |
| Partial Mitigation | 0.83 | Some mitigations exist but incomplete or unvalidated |
| **Strong Mitigation** | **0.67** | **Effective mitigations in place, validated, consistently enforceable (fail-closed where applicable)** |

Pipelock can support a strong-mitigation assessment when deployed and validated in your environment. The 0.67 value is provisional in v0.8 and subject to calibration. Here's how pipelock aligns with the criteria:

- **Fail-closed by design.** Timeouts, parse errors, and context cancellation all default to block.
- **Validated against real attacks.** Hundreds of black-box pen test cases, red team testing, community rule bundles.
- **Consistently enforceable.** Network proxy enforcement (separate process from the agent, not bypassable via prompt injection).
- **Independent of agent cooperation.** Kill switch with 6 independent activation sources.

Deploying pipelock can reduce an agent's AIVSS vulnerability score by up to 33%.

## Coverage Mapping: 10 OWASP Agentic AI Core Security Risks

AIVSS defines 10 broad risk categories. These are system-level vulnerability classes, not individual controls. Pipelock mitigates specific scenarios within each category at the network layer. Some sub-risks (like deepfake identity abuse or compromised open-source libraries) fall outside pipelock's scope and require other defenses.

Note: AIVSS distinguishes between "10 Core Security Risks" (the vulnerability taxonomy) and "10 Risk Amplification Factors" (the scoring dimensions). This page maps to the risks. The amplification factors are used in the scoring formula below.

### Risk 1: Agentic AI Tool Misuse

The AIVSS spec explicitly calls out two controls as missing risks under Tool Misuse:

> "Lack of Data Inspection: Absence of robust Data Loss Prevention (DLP) and inspection mechanisms creates significant risk of sensitive data exfiltration."

> "Absence or Inadequacy of Emergency Termination Controls (Kill Switch Mechanism): Without network-isolated or infrastructure-level kill switches, compromised agents cannot be reliably stopped."

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Tool squatting / poisoned descriptions | MCP tool scanning detects hidden instructions in tool metadata |
| Insecure tool invocation | MCP tool policy with shell normalization (blocks command injection) |
| Compromised tool usage | MCP input scanning catches DLP violations in tool arguments |
| Emergent capability triggering | Tool drift detection flags schema changes (rug-pull detection) |
| Lack of authoritative inventory | Session binding pins tool inventory per session (max 10,000 tools) |
| Lack of DLP inspection | 65 DLP patterns + entropy analysis + env variable leak detection |
| Absent kill switch | OR-composed kill switch: config, API, SIGUSR1, sentinel file |
| Malicious MCP server | Tool scanning on first connect + drift detection on subsequent calls |

### Risk 2: Agent Access Control Violation

The spec describes a "Rogue Proxy Hijacking (AgentSmith)" attack where a misconfigured proxy intercepts agent traffic.

**Pipelock's response:** Pipelock IS the proxy, by design. Capability separation architecture ensures the agent (which has secrets) cannot access the network directly. All traffic routes through pipelock (which has no agent secrets but has network access). This is the opposite of a rogue proxy: it's an intentional, configured security boundary.

| Sub-risk | Pipelock Feature |
|---|---|
| Credential/token mismanagement | DLP scans all outbound traffic for leaked credentials |
| Memory-based data leakage | Response scanning detects injection payloads in tool results |
| Cross-context privilege bleed | Per-agent identity and isolated configs (Pro tier) |

### Risk 3: Agent Cascading Failures

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Cross-system exploitation | Domain blocklist + SSRF protection limit lateral movement |
| Impact amplification | Rate limiting per destination + data budget per domain |
| SaaS-to-SaaS pivoting | All outbound requests scanned regardless of destination |
| Hallucination propagation | Response scanning catches injected content in tool results |

Kill switch provides immediate shutdown across all traffic. Fail-closed defaults prevent partial failure states.

### Risk 4: Agent Orchestration and Multi-Agent Exploitation

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Inter-agent communication exploitation | MCP input scanning on all tool calls |
| Shared knowledge poisoning | Response scanning detects injected instructions |
| Session fixation / replay | MCP session binding pins tool inventory per session |
| Capability drift / schema mismatch | Tool drift detection flags changed tool definitions |
| Coordination protocol manipulation | Tool chain detection catches suspicious call sequences |

### Risk 5: Agent Identity Impersonation

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Agent impersonation | Session binding creates per-session tool fingerprints |
| Shared identity pools | Per-agent identity with isolated configs, budgets, CIDR matching |
| Agent-in-the-middle | Proxy architecture places pipelock at the network boundary |

### Risk 6: Agent Memory and Context Manipulation

The spec describes "Invisible Context Injection" using Unicode characters and "RAG Data Poisoning" via prompt injections in retrieved content.

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Context manipulation | Response scanning with Unicode normalization (6 passes) |
| Invisible context injection | Text normalizer strips zero-width characters, homoglyphs |
| RAG data poisoning | Response scanning detects injection in fetched/retrieved content |
| Cross-session data leakage | DLP scanning runs on every request regardless of session state |

### Risk 7: Insecure Agent Critical Systems Interaction

The spec includes a detailed SSRF attack scenario where an agent's `fetch_internal_doc(url)` tool is tricked into accessing `http://10.0.1.20/status` (internal admin dashboard), then used as a proxy to scan the internal network.

**Pipelock's response:** This is exactly what pipelock's SSRF layer prevents.

| Sub-risk | Pipelock Feature |
|---|---|
| SSRF into internal systems | Hostname and literal-IP checks: private IP blocking, metadata endpoint blocking, DNS rebinding protection |
| CI/CD pipeline tampering | Domain blocklist + tool policy rules for destructive operations |
| Multi-system simultaneous manipulation | Rate limiting + data budget constrain blast radius |
| Feedback loop exploitation | Rate limiting prevents resource exhaustion loops |

DLP runs before DNS resolution, blocking strict-mode secret exfiltration via DNS queries and detecting it in balanced mode.

### Risk 8: Agent Supply Chain and Dependency Risk

The spec describes "Malicious MCP Honeypots" that offer free tools while secretly scraping data and injecting instructions.

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Malicious MCP server dependency | Tool scanning detects hidden instructions in tool metadata |
| Tool metadata manipulation | Rug-pull drift detection flags schema changes after initial connect |
| Package hallucinations | Tool policy blocks unauthorized package installation commands |
| Capability creep | Session binding detects new tools appearing mid-session |
| Signed rule bundles | Community detection patterns with Ed25519 signature verification |

### Risk 9: Agent Untraceability

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Log tampering or absence | Prometheus metrics + webhook/syslog event emission |
| Loss of chain-of-action | Per-request logging with agent identity, destination, action, bytes |
| Deceptive MCP tool invocation | Tool scanning flags tools with suspicious descriptions |
| Cross-domain attribution failure | Per-agent identity tags every request with the originating agent |

Event emission is fire-and-forget (async buffered channel for webhook, synchronous UDP for syslog). Neither blocks the proxy.

### Risk 10: Agent Goal and Instruction Manipulation

This is the prompt injection risk. The spec covers direct injection, indirect injection via RAG, and gradual goal steering.

**Pipelock's response:**

| Sub-risk | Pipelock Feature |
|---|---|
| Direct instruction injection | Response scanning with keyword-gated regex on all 6 normalization passes |
| Indirect instruction injection (RAG) | Fetched content scanned before delivery to agent |
| Resource exhaustion via goal looping | Rate limiting + data budget prevent DoS |
| Dynamic goal steering | Adaptive enforcement escalates restrictions based on behavior score |

## What AIVSS Measures vs. What Pipelock Does

AIVSS scores vulnerabilities. Pipelock prevents exploitation. The two are complementary:

- AIVSS tells you **how bad** a vulnerability is in your agentic system
- Pipelock provides the network-layer mitigations that support a lower Mitigation Factor
- When validated in your deployment context, pipelock can support the 0.67 (strong mitigation) assessment

## AIVSS Scoring Formula

The full AIVSS v0.8 formula:

```
Risk_Gap    = 10 - CVSS_Base
AARS        = Risk_Gap * (Factor_Sum / 10) * Threat_Multiplier
AIVSS       = (CVSS_Base + AARS) * Mitigation_Factor
```

Where AARS (Agentic AI Risk Score) is the uplift from agentic capabilities, Factor_Sum is the sum of all 10 amplification factors (0.0-10.0), and Threat_Multiplier defaults to 0.97.

**Hypothetical example** (using the spec's Tool Misuse scenario):

Without pipelock (Mitigation_Factor = 1.0):
CVSS 9.4 + AARS 0.5 = **9.9** (Critical).

With pipelock (Mitigation_Factor = 0.67, if validated as strong mitigation):
(9.4 + 0.5) * 0.67 = **6.6** (Medium).

Same vulnerability, same agentic context. The difference is whether validated mitigations are in place.

## References

- [OWASP AIVSS v0.8 Specification (PDF)](https://aivss.owasp.org/assets/publications/AIVSS%20Scoring%20System%20For%20OWASP%20Agentic%20AI%20Core%20Security%20Risks%20v0.8.pdf)
- [OWASP AIVSS Calculator](https://aivss.owasp.org/)
- [AIVSS GitHub Repository](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system)
- [Pipelock Documentation](https://pipelab.org/learn/)
