---
title: "OWASP LLM Top 10: Pipelock Coverage"
linkTitle: "OWASP LLM Top 10: Coverage"
subtitle: "Published Pipelock documentation ratings for the OWASP Top 10 for LLM Applications (2025), separate from Assess report mappings."
description: "OWASP LLM Top 10 coverage from Pipelock's published v3.7.1 documentation mapping, with ratings, out-of-scope risks, and Assess report limits."
date: 2026-03-12
learn_cat: compliance
level: ref
tags:
  - owasp
  - llm
  - OWASP-LLM
---
The [OWASP LLM Top 10 (2025)](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) is the most widely referenced framework for LLM security risks. It covers everything from prompt injection to misinformation, spanning model-level and application-level threats.

Pipelock's [published documentation mapping at v3.7.1](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/owasp-llm-top10-mapping.md) rates LLM Top 10 threats as shown below. These documentation ratings describe product capabilities and limits; they aren't guarantees of prevention or compliance certification. Pipelock Assess v3.7.1 does not include this framework in its report catalog. Its shipped OWASP report mappings are [MCP Top 10](/learn/owasp-mcp-top10/) and [Agentic Top 10](/learn/owasp-agentic-top10/).

## Published documentation mapping {#coverage-at-a-glance}

The documentation rates seven of ten categories Strong, Moderate, or Partial; three are out of scope.

| ID | Threat | Documentation rating | Documentation status |
|---|---|---|---|
| LLM01 | Prompt Injection | Strong | Shipped |
| LLM02 | Sensitive Information Disclosure | Strong | Shipped |
| LLM03 | Supply Chain Vulnerabilities | Partial | Shipped |
| LLM04 | Data and Model Poisoning | N/A | Out of scope |
| LLM05 | Improper Output Handling | Moderate | Shipped |
| LLM06 | Excessive Agency | Strong | Shipped |
| LLM07 | System Prompt Leakage | Moderate | Shipped |
| LLM08 | Vector and Embedding Weaknesses | N/A | Out of scope |
| LLM09 | Misinformation | N/A | Out of scope |
| LLM10 | Unbounded Consumption | Partial | Shipped |

## LLM01: Prompt Injection {#llm01-prompt-injection-strong}

Attackers craft inputs that override the model's instructions. Direct injection comes through user input. Indirect injection comes through fetched content, tool results, or documents the model reads. This is the #1 risk for a reason.

## LLM02: Sensitive Information Disclosure {#llm02-sensitive-information-disclosure-strong}

The model leaks API keys, credentials, PII, or proprietary information through network requests. This happens when an agent gets tricked (via injection) into exfiltrating secrets, or when the model includes credential material in tool calls unprompted.

## LLM03: Supply Chain Vulnerabilities {#llm03-supply-chain-vulnerabilities-partial}

Malicious or tampered tools, packages, or plugins compromise the application through its dependencies. In the MCP world, this means poisoned tool servers.

## LLM04: Data and Model Poisoning {#llm04-data-and-model-poisoning-out-of-scope}

Training data gets manipulated to embed backdoors or biases into the model itself.

## LLM05: Improper Output Handling {#llm05-improper-output-handling-moderate}

LLM outputs get passed to downstream systems without validation. The model generates a URL, the application fetches it. The model generates SQL, the application runs it. If that output contains XSS, SSRF payloads, or command injection, the downstream system is compromised.

## LLM06: Excessive Agency {#llm06-excessive-agency-strong}

The model has more permissions, autonomy, or tool access than the task requires. Combined with prompt injection, excessive agency turns a content-reading agent into one that can delete databases, send emails, or transfer money.

## LLM07: System Prompt Leakage {#llm07-system-prompt-leakage-moderate}

The system prompt gets exposed through crafted queries, revealing internal instructions, API keys, or business logic embedded in the prompt.

## LLM08: Vector and Embedding Weaknesses {#llm08-vector-and-embedding-weaknesses-out-of-scope}

Attackers manipulate vector embeddings in RAG pipelines, injecting malicious content through similarity search or poisoning the knowledge base.

## LLM09: Misinformation {#llm09-misinformation-out-of-scope}

The model generates false or fabricated information.

## LLM10: Unbounded Consumption {#llm10-unbounded-consumption-partial}

The application allows uncontrolled resource consumption: excessive API calls, token usage, or data transfer that enable denial-of-service.

## Further reading

- [OWASP Top 10 for Agentic Applications: Pipelock Coverage](/learn/owasp-agentic-top10/)
- [OWASP Agentic AI Threats: Pipelock Coverage](/learn/owasp-agentic-threats/)
- [Agent Egress Security](/learn/agent-egress-security/)
- [MCP Security](/learn/mcp-security/)
- [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/)
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)

- [Assess v3.7.1 framework catalog](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/coverage.go): the shipped framework list.
