---
title: "OWASP Agentic AI Threats: Pipelock Coverage"
linkTitle: "OWASP Agentic AI Threats: Coverage"
subtitle: "Published Pipelock documentation ratings for OWASP Agentic AI Threats and Mitigations, separate from Assess report mappings."
description: "OWASP Agentic AI Threats coverage from Pipelock's published v3.7.1 documentation mapping: T1-T15 ratings, recognized gaps, and Assess limits."
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

Pipelock's [published documentation mapping at v3.7.1](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/owasp-agentic-top15-mapping.md) rates the OWASP Agentic AI Threats and Mitigations categories as shown below. These documentation ratings describe product capabilities and limits; they aren't guarantees of prevention or compliance certification. Pipelock Assess v3.7.1 does not include this framework in its report catalog. Its shipped OWASP report mappings are [MCP Top 10](/learn/owasp-mcp-top10/) and [Agentic Top 10](/learn/owasp-agentic-top10/).

## Published documentation mapping {#coverage-at-a-glance}

The documentation marks T10 as a recognized gap on the roadmap, and T5 and T15 as out of scope. These entries do not describe shipped coverage.

| ID | Threat | Documentation rating | Documentation status |
|---|---|---|---|
| T1 | Memory Poisoning | Strong | Shipped |
| T2 | Tool Misuse | Strong | Shipped |
| T3 | Privilege Compromise | Strong | Shipped |
| T4 | Resource Overload | Partial | Shipped |
| T5 | Cascading Hallucination Attacks | Out of scope | Out of scope |
| T6 | Intent Breaking & Goal Manipulation | Moderate | Shipped |
| T7 | Misaligned & Deceptive Behaviors | Strong | Shipped |
| T8 | Repudiation & Untraceability | Strong | Shipped |
| T9 | Identity Spoofing & Impersonation | Partial | Shipped |
| T10 | Overwhelming Human-in-the-Loop | Recognized gap | Roadmap |
| T11 | Unexpected RCE and Code Attacks | Moderate | Shipped |
| T12 | Agent Communication Poisoning | Strong | Shipped |
| T13 | Rogue Agents in Multi-Agent Systems | Strong | Shipped |
| T14 | Human Attacks on Multi-Agent Systems | Partial | Shipped |
| T15 | Human Manipulation | Out of scope | Out of scope |

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
