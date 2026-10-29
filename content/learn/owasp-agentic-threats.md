---
title: "OWASP Agentic AI Threats: Pipelock Coverage"
linkTitle: "OWASP Agentic AI Threats: Coverage"
subtitle: "The OWASP Agentic AI Threats taxonomy, with the boundary of Pipelock Assess mappings stated explicitly."
description: "OWASP Agentic AI Threats explained: the 15-threat taxonomy and its scope. Pipelock Assess v3.7.1 does not ship mappings for this framework."
date: 2026-03-12
faq:
  - q: "What is the OWASP Agentic AI Threats framework?"
    a: "The OWASP Agentic AI Threats and Mitigations framework identifies 15 security threats specific to AI agent systems. It is published by the OWASP Agentic Security Initiative and is broader than the OWASP Top 10 for Agentic Applications (10 threats). It covers memory poisoning, tool misuse, privilege compromise, resource overload, hallucination attacks, goal manipulation, deceptive behaviors, audit gaps, identity spoofing, HITL overload, RCE, communication poisoning, rogue agents, human attacks on multi-agent systems, and human manipulation."
learn_cat: compliance
level: ref
tags:
  - owasp
  - agentic
  - threats
---
The [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) framework is the broadest of OWASP's three AI security lists, covering 15 threats. It goes deeper than the [Agentic Top 10](/learn/owasp-agentic-top10/) (which focuses on the top risks) and the [LLM Top 10](/learn/owasp-llm-top10/) (which focuses on model-level risks).

Pipelock Assess v3.7.1 does not include an Agentic AI Threats control mapping. Its shipped OWASP mappings are [MCP Top 10](/learn/owasp-mcp-top10/) and [Agentic Top 10](/learn/owasp-agentic-top10/). Use those pages for product coverage and limits.

## Threat categories {#coverage-at-a-glance}

| #  |  Threat |
| --- | -------- |
| T1  |  Memory Poisoning |
| T2  |  Tool Misuse |
| T3  |  Privilege Compromise |
| T4  |  Resource Overload |
| T5  |  Cascading Hallucination Attacks |
| T6  |  Intent Breaking & Goal Manipulation |
| T7  |  Misaligned & Deceptive Behaviors |
| T8  |  Repudiation & Untraceability |
| T9  |  Identity Spoofing & Impersonation |
| T10  |  Overwhelming Human-in-the-Loop |
| T11  |  Unexpected RCE and Code Attacks |
| T12  |  Agent Communication Poisoning |
| T13  |  Rogue Agents in Multi-Agent Systems |
| T14  |  Human Attacks on Multi-Agent Systems |
| T15  |  Human Manipulation |

## T1: Memory Poisoning

Malicious data injected into agent memory corrupts future decisions. Poisoned workspace files, config, or context documents alter agent behavior long after the initial injection.

## T2: Tool Misuse

Agents misuse legitimate tools due to injection, misalignment, or unsafe delegation.

## T3: Privilege Compromise

Unauthorized escalation or misuse of permissions. Leaked credentials let agents operate beyond scope.

## T7: Misaligned & Deceptive Behaviors

Agents act deceptively due to misaligned objectives. A compromised agent may exfiltrate data while appearing to function normally.

## T8: Repudiation & Untraceability

Agent actions can't be reliably traced or accounted for. Insufficient logging makes incident reconstruction impossible.

## T12: Agent Communication Poisoning

False or malicious information injected into inter-agent communication channels.

## T13: Rogue Agents in Multi-Agent Systems

Compromised or misaligned agents disrupt coordinated operations through shared resources.

## T6: Intent Breaking & Goal Manipulation

Attackers alter or redirect agent goals toward unintended actions.

## T11: Unexpected RCE and Code Attacks

Unsafe code generation leads to remote code execution. Agents execute attacker-controlled code or exfiltrate results.

## T4: Resource Overload

Attackers exhaust resources to disrupt performance.

## T9: Identity Spoofing & Impersonation

Adversaries impersonate agents or users.

## T14: Human Attacks on Multi-Agent Systems

Humans exploit inter-agent trust to trigger cascading failures.

## T5: Cascading Hallucination Attacks

False information from one model spreads through interconnected systems.

## T10: Overwhelming Human-in-the-Loop

Attackers overload human overseers with excessive approval requests to reduce scrutiny.

## T15: Human Manipulation

Exploiting user trust in AI to deceive humans into unsafe actions.

## Further reading

- [OWASP Top 10 for LLMs: Pipelock Coverage](/learn/owasp-llm-top10/)
- [OWASP Top 10 for Agentic Applications: Pipelock Coverage](/learn/owasp-agentic-top10/)
- [Agent Egress Security](/learn/agent-egress-security/)
- [MCP Security](/learn/mcp-security/)
- [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/)
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)

- [Assess v3.7.1 framework catalog](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/coverage.go): the shipped framework list.
