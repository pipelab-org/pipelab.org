---
title: "OWASP LLM Top 10: Pipelock Coverage"
linkTitle: "OWASP LLM Top 10: Coverage"
subtitle: "The OWASP Top 10 for LLM Applications (2025), with the boundary of Pipelock Assess mappings stated explicitly."
description: "OWASP LLM Top 10 risks explained, from prompt injection to misinformation. Pipelock Assess v3.7.1 does not ship mappings for this framework."
date: 2026-03-12
learn_cat: compliance
level: ref
tags:
  - owasp
  - llm
  - OWASP-LLM
---
The [OWASP LLM Top 10 (2025)](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) is the most widely referenced framework for LLM security risks. It covers everything from prompt injection to misinformation, spanning model-level and application-level threats.

Pipelock Assess v3.7.1 does not include an LLM Top 10 control mapping. Its shipped OWASP mappings are [MCP Top 10](/learn/owasp-mcp-top10/) and [Agentic Top 10](/learn/owasp-agentic-top10/). Use those pages for product coverage and limits.

## Threat categories {#coverage-at-a-glance}

| #  |  Threat |
| --- | -------- |
| LLM01  |  Prompt Injection |
| LLM02  |  Sensitive Information Disclosure |
| LLM03  |  Supply Chain Vulnerabilities |
| LLM04  |  Data and Model Poisoning |
| LLM05  |  Improper Output Handling |
| LLM06  |  Excessive Agency |
| LLM07  |  System Prompt Leakage |
| LLM08  |  Vector and Embedding Weaknesses |
| LLM09  |  Misinformation |
| LLM10  |  Unbounded Consumption |

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
