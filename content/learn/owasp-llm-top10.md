---
title: "OWASP LLM Top 10: Pipelock Coverage"
linkTitle: "OWASP LLM Top 10: Coverage"
subtitle: "Mapping Pipelock's detection layers against the OWASP Top 10 for Large Language Model Applications (2025)."
description: "Pipelock covers 7 of 10 OWASP LLM Top 10 threats at the network layer: prompt injection, sensitive info disclosure, excessive agency, and supply chain."
date: 2026-03-12
faq:
  - q: "How does Pipelock address OWASP LLM01 Prompt Injection?"
    a: "Pipelock scans all content entering the agent for prompt injection patterns. Response scanning checks fetched web pages, MCP response scanning checks tool results, and MCP input scanning checks tool arguments. Detection covers 'ignore previous instructions' patterns, system/role overrides, jailbreak templates, and multi-language variants across all transports: fetch proxy, forward proxy, WebSocket, MCP stdio, MCP Streamable HTTP, and MCP WebSocket."
  - q: "Does Pipelock prevent sensitive information disclosure from AI agents?"
    a: "Yes. Pipelock scans outbound traffic with 65 DLP patterns covering AWS, GCP, Azure, GitHub, Stripe, OpenAI, Anthropic, and 38 other providers. It also detects environment variable values in outbound traffic, flags high-entropy strings that look like encoded secrets, blocks known exfiltration domains, tracks secret fragments across multiple requests (cross-request exfiltration detection), and enforces per-domain data budgets."
  - q: "Which OWASP LLM Top 10 threats does Pipelock not cover?"
    a: "Pipelock does not cover LLM04 (Data and Model Poisoning), LLM08 (Vector and Embedding Weaknesses), or LLM09 (Misinformation). These threats are about model training data integrity, RAG pipeline internals, and output truthfulness. Pipelock operates at the network transport layer between agents and external systems, not at the model or application layer."
learn_cat: compliance
level: ref
tags:
  - owasp
  - llm
  - OWASP-LLM
---
The [OWASP LLM Top 10 (2025)](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) is the most widely referenced framework for LLM security risks. It covers everything from prompt injection to misinformation, spanning model-level and application-level threats.

Pipelock is a network-layer tool. It sits between AI agents and the internet, scanning HTTP, WebSocket, and MCP traffic. Some of these threats fall squarely in that layer. Others are about model internals, and those are out of scope by design.

## Coverage at a glance

| # | Threat | Coverage |
|---|--------|----------|
| LLM01 | Prompt Injection | **Strong** |
| LLM02 | Sensitive Information Disclosure | **Strong** |
| LLM03 | Supply Chain Vulnerabilities | Partial |
| LLM04 | Data and Model Poisoning | Out of scope |
| LLM05 | Improper Output Handling | Moderate |
| LLM06 | Excessive Agency | **Strong** |
| LLM07 | System Prompt Leakage | Moderate |
| LLM08 | Vector and Embedding Weaknesses | Out of scope |
| LLM09 | Misinformation | Out of scope |
| LLM10 | Unbounded Consumption | Partial |

**7 of 10 covered.** 3 strong, 2 moderate, 2 partial. The 3 out-of-scope threats are about model training and output truthfulness, not network security.

---

## LLM01: Prompt Injection (Strong)

Attackers craft inputs that override the model's instructions. Direct injection comes through user input. Indirect injection comes through fetched content, tool results, or documents the model reads. This is the #1 risk for a reason.

Pipelock catches indirect injection at every entry point:

- **Response scanning** checks fetched web content before it reaches the agent. Detects "ignore previous instructions," system/role overrides, jailbreak templates (DAN, developer mode), and multi-language variants.
- **MCP response scanning** wraps MCP servers via `pipelock mcp proxy` and scans JSON-RPC tool results through the same detector. Text is concatenated across content blocks, so injection split across multiple blocks gets caught.
- **MCP input scanning** checks tool arguments on the request path. If injection payloads are being sent *to* tools (not just returned *from* them), they're flagged.
- **Content extraction** strips scripts, styles, and hidden elements from HTML via go-readability before the agent sees the content.

Actions: `block` (reject), `strip` (redact matched text), `warn` (log and pass through), or `ask` (human approval in the terminal).

**Gap:** Regex-based detection. Novel injection patterns that don't match known templates can slip through. Classifier-based detection is on the roadmap.

---

## LLM02: Sensitive Information Disclosure (Strong)

The model leaks API keys, credentials, PII, or proprietary information through network requests. This happens when an agent gets tricked (via injection) into exfiltrating secrets, or when the model includes credential material in tool calls unprompted.

Pipelock has six detection layers for this:

1. **DLP pattern matching:** 65 built-in credential patterns covering AWS, GCP, Azure, GitHub, Stripe, OpenAI, Anthropic, and dozens of other providers.
2. **Environment variable leak detection:** scans for the proxy's own env var values in outbound traffic, both raw and base64 encoded.
3. **Entropy analysis:** flags high-entropy URL segments and subdomains that look like encoded secrets, even without a pattern match.
4. **Domain blocklist:** pastebin, transfer.sh, requestbin, ngrok, and other exfiltration targets blocked by default.
5. **Cross-request exfiltration detection (CEE):** tracks secret fragments across multiple requests. An agent that splits a key across 5 URLs is still caught.
6. **Data budget:** per-domain and global byte budgets cap how much data an agent can send anywhere.

Bypassing one layer isn't enough when there are six.

---

## LLM03: Supply Chain Vulnerabilities (Partial)

Malicious or tampered tools, packages, or plugins compromise the application through its dependencies. In the MCP world, this means poisoned tool servers.

Pipelock covers the MCP side:

- **MCP tool scanning** checks `tools/list` responses for poisoned descriptions (hidden instructions, file exfiltration directives, cross-tool manipulation). SHA256 baseline per session detects rug-pull changes mid-session.
- **Workspace integrity monitoring** tracks SHA256 hashes of workspace files. A compromised plugin that modifies config files is detected.
- **Ed25519 signing** for tamper-evident file verification.

**Not covered:** dependency scanning, model provenance, package integrity. Use [Trivy](https://github.com/aquasecurity/trivy) or Dependabot for that.

---

## LLM04: Data and Model Poisoning (Out of Scope)

Training data gets manipulated to embed backdoors or biases into the model itself.

Pipelock operates at runtime, not during model development. Training data integrity is a model-level concern. Nothing a network proxy can do about it.

---

## LLM05: Improper Output Handling (Moderate)

LLM outputs get passed to downstream systems without validation. The model generates a URL, the application fetches it. The model generates SQL, the application runs it. If that output contains XSS, SSRF payloads, or command injection, the downstream system is compromised.

Pipelock catches some of this:

- **MCP response scanning** flags injection payloads in tool results before the agent acts on them.
- **Content extraction** strips scripts, iframes, and executable content from fetched HTML.
- **SSRF protection** blocks requests to private IP ranges, cloud metadata endpoints, and link-local addresses if the agent tries to fetch an LLM-generated URL targeting internal services.

**Limitation:** Pipelock scans content entering the agent and blocks dangerous outbound requests. It doesn't control what the agent does with clean content after scanning. That's the application's job.

---

## LLM06: Excessive Agency (Strong)

The model has more permissions, autonomy, or tool access than the task requires. Combined with prompt injection, excessive agency turns a content-reading agent into one that can delete databases, send emails, or transfer money.

This is Pipelock's second core strength after injection detection:

- **Capability separation:** the agent process (holds secrets) and the proxy (has network access) run separately. Neither has both.
- **Domain allowlisting:** agents can only reach explicitly allowed API endpoints. Everything else is denied.
- **MCP tool policy:** pre-execution allow/deny rules with regex argument matching. Shell obfuscation detection catches base64/hex-encoded commands.
- **Tool chain detection:** subsequence matching on tool call sequences catches multi-step attacks (list files, read contents, exfiltrate).
- **HITL terminal approval:** `action: ask` prompts the human operator before proceeding.
- **Per-agent profiles:** each agent gets independent mode, allowlist, DLP rules, rate limits, and data budget.

---

## LLM07: System Prompt Leakage (Moderate)

The system prompt gets exposed through crafted queries, revealing internal instructions, API keys, or business logic embedded in the prompt.

Pipelock catches system prompt exfiltration through network traffic:

- **DLP scanning** detects credentials contained in a leaked prompt.
- **Egress filtering** limits where leaked prompt data can go. Exfiltration targets are blocked.
- **Cross-request exfiltration detection** catches prompt fragments split across multiple requests.

**Limitation:** Pipelock catches prompts being sent over the network. It can't prevent the model from revealing prompt content in its conversational output. That requires model-level controls or application-level output filtering.

---

## LLM08: Vector and Embedding Weaknesses (Out of Scope)

Attackers manipulate vector embeddings in RAG pipelines, injecting malicious content through similarity search or poisoning the knowledge base.

This is application-layer. Pipelock operates at network transport. Vector database internals, embedding generation, and retrieval ranking are between the application and its data store, not between the agent and the internet.

---

## LLM09: Misinformation (Out of Scope)

The model generates false or fabricated information.

Evaluating truthfulness requires semantic analysis at the model or application layer. A network proxy scans for security threats (injection, exfiltration, SSRF), not factual accuracy.

---

## LLM10: Unbounded Consumption (Partial)

The application allows uncontrolled resource consumption: excessive API calls, token usage, or data transfer that enable denial-of-service.

Pipelock covers the network side:

- **Per-domain rate limiting** with sliding windows prevents bulk requests.
- **Response size limits** (`max_response_mb`) cap fetched content size.
- **Request timeouts** prevent hanging connections.
- **Data budgets** limit total data transfer per domain and globally.
- **URL length limits** flag unusually long URLs.

**Not covered:** token usage, compute time, or memory consumption at the model or application layer.

---

## The three OWASP frameworks

There are three separate OWASP frameworks for AI security. Pipelock has coverage mappings for all of them:

1. **Top 10 for LLM Applications (2025):** this page. Model and application risks. 7/10 covered.
2. **[Top 10 for Agentic Applications (ASI01-ASI10)](/learn/owasp-agentic-top10/):** agent-specific risks like tool misuse, rogue agents, and inter-agent attacks. 10/10 covered (3 strong, 3 moderate, 4 partial).
3. **[Agentic AI Threats and Mitigations (T1-T15)](/learn/owasp-agentic-threats/):** the broadest framework, 15 threats. 12/15 covered (7 strong, 2 moderate, 3 partial).

Pipelock maps strongest against the agentic frameworks because it's an infrastructure tool built for agent security. The LLM Top 10 includes model-level concerns (training data, embeddings, hallucination) that sit at a different layer.

## Further reading

- [OWASP Top 10 for Agentic Applications: Pipelock Coverage](/learn/owasp-agentic-top10/)
- [OWASP Agentic AI Threats: Pipelock Coverage](/learn/owasp-agentic-threats/)
- [Agent Egress Security](/learn/agent-egress-security/)
- [MCP Security](/learn/mcp-security/)
- [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/)
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
