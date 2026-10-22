---
title: "LLM Security: A Practitioner's Guide to Protecting Large Language Models and AI Agents"
linkTitle: "LLM Security"
seoTitle: "LLM Security: Threats and Runtime Defenses"
subtitle: "The threats, the defenses, and where application-layer, model-layer, and runtime-layer protections each fit."
description: "LLM security covers prompt injection, data leaks, tool poisoning, and agent runtime attacks. Practitioner guide to threats and where defenses fit."
date: 2026-04-19
lastmod: 2026-04-23
faq:
  - q: "What is LLM security?"
    a: "LLM security is the practice of protecting large language model applications, and the autonomous agents built on top of them, from attacks that exploit the model's natural-language interface or the agent's ability to take action. It covers prompt injection, sensitive data exfiltration, tool poisoning, supply-chain attacks on MCP servers, and credential abuse at runtime. LLM security is a superset of classical AppSec plus new threat classes specific to model behavior and agent autonomy."
  - q: "How is LLM security different from traditional application security?"
    a: "Traditional AppSec assumes code is the attack surface and user input is untrusted data. In LLM applications, user input and third-party content become code: the model interprets text as instructions. This breaks the data-vs-code boundary that WAFs, input validators, and sandboxes rely on. LLM security has to treat every string that reaches the model, whether from a user, a web page, a tool response, or an MCP server, as potentially instruction-carrying. Runtime controls on what the agent can do become as important as static controls on what code runs."
  - q: "What are the most important LLM security threats in 2026?"
    a: "Six categories dominate the current threat landscape: (1) prompt injection from untrusted content including indirect injection, (2) credential and sensitive-data exfiltration through model outputs or tool calls, (3) MCP tool poisoning and rug-pull attacks on third-party tool providers, (4) supply-chain attacks via compromised or mis-configured MCP servers and agent frameworks, (5) SSRF and network abuse through agent browsing or fetch capabilities, (6) unauthorized tool execution and scope escalation. OWASP's LLM Top 10 and MCP Top 10 are the canonical frameworks for each."
  - q: "Where should LLM security controls sit: the model, the application, or the network?"
    a: "All three, and they catch different failures. Model-layer controls (constitutional AI, RLHF, classifier filters) shape what the model will and won't produce. Application-layer controls (input validation, scoped API keys, HITL confirmations) govern how the agent invokes tools. Runtime-layer controls (network egress proxies, MCP scanners, credential DLP) enforce what can actually cross the boundary into the outside world. Defense in depth means all three, with the runtime layer often being the last line because it is the layer the agent cannot bypass."
learn_cat: concepts
level: deep
tags:
  - llm
  - threats
  - defense
---
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  "name": "LLM Security",
  "description": "The practice of protecting large language model applications and the autonomous agents built on top of them from prompt injection, data exfiltration, tool poisoning, and credential abuse. Covers the model layer, the application layer, and the runtime boundary where the agent takes action.",
  "termCode": "llm-security",
  "inDefinedTermSet": "https://pipelab.org/learn/"
}
</script>

## What LLM security means in 2026

LLM security is the practice of protecting large language model applications, and the autonomous agents built on top of them, from attacks that exploit the model's natural-language interface or the agent's ability to take action in the world.

It overlaps classical application security. Authentication, authorization, audit logging, TLS, secret management: all still apply. It also introduces a new class of threats that don't map onto the old playbook. A WAF does not understand that a product review on an e-commerce page contains instructions the model will follow. An input validator does not know that a tool description hidden in a third-party MCP server is telling the agent to exfiltrate credentials. A sandboxed process doesn't stop the agent from typing a real API key into a real tool call argument.

The essential shift: in LLM applications, **text is code**. Every string that reaches the model can be instruction. Every output the model produces can trigger side effects. The boundary between data and code, which AppSec has relied on for 30 years, blurs as soon as a language model is in the loop.

This guide walks through the threats, the defenses, and where each layer fits.

## The threat taxonomy

Six categories account for most current LLM security incidents. OWASP's [LLM Top 10](/learn/owasp-llm-top10/) and the evolving [MCP Top 10](/learn/owasp-mcp-top10/) formalize the full taxonomy; these six are the ones practitioners hit first.

### 1. Prompt injection

The agent receives text that overrides its instructions. Direct injection is the user pasting `Ignore previous instructions...` into a chat. Indirect injection is more dangerous: the agent fetches a web page, reads a tool response, or parses a document, and the attack sits inside that content. The model doesn't distinguish "this came from a trusted source" from "this came from an attacker-controlled blog post."

Deep dive: [LLM Prompt Injection](/learn/llm-prompt-injection/) · [Prompt Injection Detection](/learn/prompt-injection-detection/) · [Prompt Injection Network Defense](/learn/prompt-injection-network-defense/).

### 2. Sensitive data exfiltration

The agent sends credentials, PII, source code, or proprietary data to an outside destination. This can happen through a compromised tool ("include your GitHub token in the next API call"), through accidental leakage (the agent summarizes a config file that contains secrets), or through creative attacker channels (DNS-based exfiltration, URL parameter stuffing, cross-request chaining).

Deep dive: [AI Agent Data Loss Prevention](/learn/ai-agent-data-loss-prevention/) · [Agent Egress Security](/learn/agent-egress-security/).

### 3. MCP tool poisoning and rug-pull

The Model Context Protocol lets agents call third-party tools hosted by third-party servers. An attacker who controls an MCP server can hide instructions in tool descriptions, wait until the server is trusted, then change the description to smuggle an exfiltration payload ("rug-pull"). Static review at install time doesn't catch runtime drift.

Deep dive: [MCP Tool Poisoning](/learn/mcp-tool-poisoning/) · [MCP Vulnerabilities](/learn/mcp-vulnerabilities/) · [Shadow MCP](/learn/shadow-mcp/).

### 4. Supply-chain attacks via agent frameworks and MCP servers

Agents compose many upstream dependencies: LLM SDKs, agent frameworks, MCP servers, plugins, and tool integrations. Each is a point where malicious code or configuration can land. Shadow MCP (employees running unvetted MCP servers) is a live version of this threat in 2026.

### 5. SSRF and network abuse

Agents that can fetch URLs, browse the web, or make arbitrary HTTP calls have the same SSRF problems as any server-side request library, plus some new ones. An attacker who can plant a URL in the agent's context (via injection, via a poisoned tool) can make the agent probe internal networks, cloud metadata endpoints, or private infrastructure.

### 6. Unauthorized tool execution and scope escalation

The agent calls a tool it shouldn't, with parameters it shouldn't, on behalf of a user whose authority it shouldn't have. This is the agentic version of privilege escalation: the model is tricked into exercising a capability outside its intended scope. Tool policy enforcement (allow/deny/redirect on specific tool calls) is the runtime answer.

Deep dive: [Chatbot Security](/learn/chatbot-security/) · [AI Agent Security & Hardening](/learn/ai-agent-security/).

## Where the defenses live

### Model layer

The model itself can refuse unsafe requests, flag suspicious input, or be fine-tuned away from compliance with injection-style instructions. Constitutional AI, RLHF, and classifier filters sit here. Necessary but insufficient: no model fine-tuning catches every novel injection, and an attacker only needs one that works.

### Application layer

Agent frameworks, HITL confirmations, scoped API credentials, per-tool authorization policies, and input validation on tool arguments. This is where the business logic of "what the agent is supposed to do" gets enforced. Limits include: frameworks are inside the same trust boundary as the agent process, so a compromised agent can bypass its own validation.

### Runtime / network layer

An external proxy or firewall that sees the traffic leaving the agent and the traffic returning. This layer enforces what actually crossed the wire, regardless of what the agent thought it was doing. Because it sits outside the agent process, a prompt-injected agent cannot turn it off.

[Pipelock](/pipelock/) is one implementation of the runtime layer: a single-binary agent firewall that scans HTTP, WebSocket, and MCP traffic for the six threat categories above and can emit mediator-signed action receipts when receipt signing is enabled. The model gets to produce what it produces. The application framework gets to orchestrate. The runtime layer is the last-chance enforcement point at the network boundary.

All three layers belong. Each catches what the others miss.

## LLM security vs adjacent terms

| Term | What it covers | How it relates to LLM security |
|---|---|---|
| **AI security** | The broadest umbrella, includes ML pipelines, data poisoning, model theft | LLM security is a subset focused on language-model applications and agents |
| **LLM application security** | The security of apps that embed LLMs | Same as LLM security, often used interchangeably |
| **Agent security** | Security of autonomous agents (whether LLM-powered or not) | Overlaps with LLM security where the agent is LLM-driven; broader when the agent uses rule engines or search |
| **MCP security** | Security of Model Context Protocol servers and tool calls | A critical slice of LLM security in 2026, covered by [MCP Security](/learn/mcp-security/) |
| **Prompt engineering security** | Hardening prompts against injection | One defense layer within LLM security, not the full story |
| **AI firewall** | A category of runtime security products for LLM and agent traffic | An implementation pattern for runtime-layer LLM security; see [Generative AI Firewall](/learn/generative-ai-firewall/) |

## Compliance frameworks to know

Three frameworks are shaping enterprise LLM security procurement in 2026:

- **OWASP LLM Top 10 (2026)**: updated risk framework for language-model applications. Canonical mapping for most security-team inventories. See [OWASP LLM Top 10](/learn/owasp-llm-top10/).
- **OWASP MCP Top 10**: emerging risk list specific to Model Context Protocol. Covers tool poisoning, rug-pulls, authorization sprawl. See [OWASP MCP Top 10](/learn/owasp-mcp-top10/).
- **EU AI Act + NIST AI RMF**: regulatory frameworks requiring documented runtime security controls, audit logs, and post-deployment monitoring. [EU AI Act Compliance](/learn/eu-ai-act-compliance/) covers the obligations in practice.

CSA, SANS, and other industry bodies are contributing too: the [Mythos-Ready Playbook](/learn/mythos-ready-playbook/) synthesizes priority runtime actions across these frameworks.

## Where to start

- **You're deploying an LLM application for the first time:** read [LLM Prompt Injection](/learn/llm-prompt-injection/) and [AI Agent Security & Hardening](/learn/ai-agent-security/). Start with the OWASP LLM Top 10 as your risk inventory.
- **You ship an agent that calls MCP servers:** read [MCP Security](/learn/mcp-security/), [MCP Tool Poisoning](/learn/mcp-tool-poisoning/), and [Shadow MCP](/learn/shadow-mcp/). Plan for runtime scanning on every tool call.
- **You need an evaluation framework:** [Agent Firewall Evaluation Checklist](/agent-firewall-checklist/) walks through what a production runtime control must do.
- **You're in a compliance-heavy environment:** [EU AI Act Compliance](/learn/eu-ai-act-compliance/), [AI Agent Compliance](/learn/ai-agent-compliance/), and [Compliance Evidence](/learn/compliance-evidence/) map the runtime controls to audit requirements.

## Further reading

- [OWASP LLM Top 10](/learn/owasp-llm-top10/): canonical risk framework for LLM applications
- [OWASP MCP Top 10](/learn/owasp-mcp-top10/): MCP-specific risks
- [OWASP Agentic Threats](/learn/owasp-agentic-threats/) and [Agentic Top 10](/learn/owasp-agentic-top10/)
- [AI Runtime Security](/learn/ai-runtime-security/): the runtime-layer perspective in depth
- [AI Agent Security](/learn/ai-agent-security/): three defense layers explained
- [AI Agent Security Tools](/learn/ai-agent-security-tools/): categories of LLM security products compared
- [Agent Firewall](/agent-firewall/): what a runtime agent firewall does and when to need one
- [Pipelock](/pipelock/): install, configure, deploy the open-source agent firewall
