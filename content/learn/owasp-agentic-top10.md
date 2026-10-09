---
title: "OWASP Agentic Top 10: Pipelock Coverage"
linkTitle: "OWASP Agentic Top 10: Coverage"
subtitle: "How Pipelock addresses each threat in the OWASP Top 10 for Agentic Applications (2026)."
description: "Pipelock coverage for all 10 risks in the OWASP Top 10 for Agentic Applications 2026 (ASI01-ASI10), with per-threat assessment."
date: 2026-03-12
faq:
  - q: "What is the OWASP Top 10 for Agentic Applications?"
    a: "The OWASP Top 10 for Agentic Applications (2026) identifies the top security risks for AI agent systems: agent goal hijack (ASI01), tool misuse (ASI02), identity and privilege abuse (ASI03), supply chain vulnerabilities (ASI04), unexpected code execution (ASI05), memory and context poisoning (ASI06), insecure inter-agent communication (ASI07), cascading failures (ASI08), human-agent trust exploitation (ASI09), and rogue agents (ASI10)."
  - q: "How does Pipelock protect against agent goal hijacking?"
    a: "Pipelock scans all content entering the agent (fetched web pages, MCP tool results, and tool arguments) for prompt injection patterns that attempt to redirect the agent's objectives. Detection covers 'ignore previous instructions' patterns, system/role overrides, jailbreak templates, and multi-language variants. Actions include block, strip (redact matched text), warn, or ask (human approval)."
  - q: "How does Pipelock detect rogue AI agents?"
    a: "Pipelock enforces least privilege at the network layer through domain allowlisting, capability separation (the agent has secrets but no network, the proxy has network but no secrets), per-agent profiles with independent settings, domain blocklists, rate limiting, environment variable leak detection, and entropy analysis. If an agent tries to operate outside its boundaries, the proxy blocks or flags the activity."
learn_cat: compliance
level: ref
tags:
  - owasp
  - agentic
  - OWASP-AGENTIC
---
The [OWASP Agentic Top 10 (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) focuses specifically on AI agent threats: tool abuse, inter-agent attacks, rogue behavior. This is closer to Pipelock's core than the [LLM Top 10](/learn/owasp-llm-top10/), which includes model-level concerns.

Pipelock covers all 10. Three strong, three moderate, four partial.

## Coverage at a glance

| # | Threat | Coverage |
|---|--------|----------|
| ASI01 | Agent Goal Hijack | **Strong** |
| ASI02 | Tool Misuse | Partial |
| ASI03 | Identity & Privilege Abuse | **Strong** |
| ASI04 | Supply Chain Vulnerabilities | Partial |
| ASI05 | Unexpected Code Execution | Moderate |
| ASI06 | Memory & Context Poisoning | Moderate |
| ASI07 | Insecure Inter-Agent Communication | Partial |
| ASI08 | Cascading Failures | Moderate |
| ASI09 | Human-Agent Trust Exploitation | Partial |
| ASI10 | Rogue Agents | **Strong** |

---

## ASI01: Agent Goal Hijack (Strong)

Attackers redirect agent objectives through malicious text in external data: web pages, tool results, documents.

Pipelock scans every content entry point:

- **Response scanning** checks fetched web content for injection patterns before the agent reads it. Actions: `block`, `strip`, `warn`, or `ask`.
- **MCP response scanning** wraps MCP servers and scans JSON-RPC tool results. Text is concatenated across content blocks, catching injection split across multiple blocks.
- **MCP input scanning** checks tool arguments on the request path. Catches injection payloads being sent *to* tools.
- **Pattern matching** detects "ignore previous instructions," system/role overrides, jailbreak templates (DAN, developer mode), and multi-language variants.

**Gap:** Regex-based detection can miss novel patterns. Classifier-based detection is on the roadmap.

---

## ASI02: Tool Misuse (Partial)

Agents misuse legitimate tools due to prompt injection, misalignment, or unsafe delegation. Tools get called with destructive parameters or chained in unexpected ways.

Pipelock controls the network tool and scans MCP traffic:

- **Fetch proxy as controlled tool:** the agent's only network access is through the proxy, which runs every request through the full scanner pipeline.
- **MCP response scanning** catches injection payloads in tool results.
- **MCP input scanning** catches DLP leaks and injection in tool arguments.
- **MCP tool scanning** detects poisoned tool descriptions and rug-pull definition changes.

**Containment:** Pipelock controls the HTTP fetch tool and scans MCP traffic bidirectionally. `pipelock sandbox` adds Landlock, seccomp, and network namespace isolation on Linux, and sandbox-exec profiles on macOS (alpha). On Windows, pair with [agentsh](https://github.com/canyonroad/agentsh) or [Anthropic srt](https://github.com/anthropics/sandbox-runtime).

---

## ASI03: Identity & Privilege Abuse (Strong)

Attackers exploit inherited credentials, delegated permissions, or agent-to-agent trust to access resources beyond intended scope.

- **Capability separation:** the agent (holds secrets, no network) and the proxy (has network, no secrets) are separate processes. Deployment enforces the boundary.
- **Domain allowlisting:** agents only reach explicitly allowed endpoints.
- **SSRF protection:** blocks private IP ranges, cloud metadata, loopback, and link-local addresses. DNS rebinding prevention validates resolved IPs before connecting.
- **Docker Compose isolation:** `pipelock generate docker-compose` creates a network topology where the agent container has no direct internet access.

---

## ASI04: Supply Chain Vulnerabilities (Partial)

Malicious or tampered tools, skill packages, models, or agent personas compromise execution.

- **Workspace integrity monitoring:** SHA256 manifests detect file modifications, additions, or removals. A compromised skill that modifies config files is caught.
- **MCP response scanning** catches compromised MCP servers injecting payloads into tool results.
- **MCP tool scanning** detects poisoned tool descriptions and rug-pull changes mid-session.
- **Ed25519 signing** for tamper-evident file verification.

**Gap:** No dependency scanning or model identity verification. Use [Trivy](https://github.com/aquasecurity/trivy) or Dependabot.

---

## ASI05: Unexpected Code Execution (Moderate)

Agents generate or execute attacker-controlled code through manipulated tool outputs.

- **MCP proxy scanning** catches injection payloads in tool results before the agent processes them.
- **Content extraction** strips scripts, styles, and executable content from fetched HTML.
- **DLP scanning** detects API key formats in URLs and request bodies, catching code execution results that leak secrets.

**Containment:** Pipelock limits the blast radius by blocking strict-mode exfiltration and detecting it in balanced mode. `pipelock sandbox` also restricts code execution at the OS level (Linux: Landlock + seccomp + netns; macOS: sandbox-exec, alpha).

---

## ASI06: Memory & Context Poisoning (Moderate)

Attackers corrupt the data sources an agent relies on for knowledge and decisions.

- **Response scanning** checks fetched web content (the most common knowledge source for coding agents) for injection.
- **Content extraction** strips non-content elements from fetched pages.
- **Workspace integrity monitoring** detects unauthorized modifications to memory files, config files, and other workspace data the agent reads.

**Gap:** No semantic analysis of retrieved content. Pipelock detects pattern-based injection, not subtly misleading information.

---

## ASI07: Insecure Inter-Agent Communication (Partial)

Agents in a multi-agent system attack each other through shared resources, message passing, or lateral movement through workspace files.

- **Multi-agent identification:** each agent gets a named profile with independent mode, allowlist, DLP, rate limits, and budget. Identity resolution via listener binding (spoof-proof), `X-Pipelock-Agent` header, or `?agent=` query param.
- **File integrity monitoring** detects unauthorized workspace modifications. An agent that tampers with shared handoff files is caught.
- **Ed25519 signing** for cryptographic verification of shared data.
- **MCP confused deputy protection:** response ID validation prevents malicious MCP servers from injecting unsolicited JSON-RPC responses.

**Gap:** No runtime inter-agent communication policy yet.

---

## ASI08: Cascading Failures (Moderate)

Failures propagate through agent chains. One agent's error or compromise triggers failures downstream.

- **Per-domain rate limiting** prevents bulk requests from overwhelming external services.
- **Response size limits** (`max_response_mb`) prevent memory exhaustion.
- **Request timeouts** prevent hanging connections that block agent pipelines.
- **Structured logging** with zerolog enables rapid diagnosis of failure chains.

**Gap:** No circuit-breaker pattern or agent-level health checks yet.

---

## ASI09: Human-Agent Trust Exploitation (Partial)

Attackers exploit the trust humans place in agent outputs, using agents as intermediaries to deliver manipulated content or unauthorized actions.

- **HITL terminal approval:** `action: ask` prompts the human operator with a y/N/s dialog when suspicious content is detected.
- **Audit logging** gives humans a verifiable record of every agent request and scanner detection.
- **Prometheus metrics** surface block rates, scanner hits, and top domains for oversight dashboards.

**Gap:** No user-facing UI for non-terminal environments. HITL is terminal-only.

---

## ASI10: Rogue Agents (Strong)

Agents act outside their intended boundaries due to compromised objectives, misalignment, or adversarial manipulation.

This is where Pipelock's architecture pays off:

- **Principle of least privilege:** agents only reach allowed API domains.
- **Capability separation:** agents can't bypass the proxy to reach the internet directly.
- **Configurable enforcement modes:** strict (block on detection), balanced (warn on detection), audit (detect and log).
- **Domain blocklist:** known exfiltration targets blocked by default.
- **Rate limiting:** per-domain sliding window prevents bulk data transfer even to allowed domains.
- **Environment variable leak detection:** catches env var values in outbound traffic.
- **Entropy analysis:** flags high-entropy strings that look like encoded secrets.

---

## The three OWASP frameworks

1. **[Top 10 for LLM Applications (2025)](/learn/owasp-llm-top10/):** model and application risks. 7/10 covered.
2. **Top 10 for Agentic Applications (ASI01-ASI10):** this page. Agent-specific risks. 10/10 covered.
3. **[Agentic AI Threats and Mitigations (T1-T15)](/learn/owasp-agentic-threats/):** broadest framework, 15 threats. 12/15 covered.

## Further reading

- [OWASP Top 10 for LLMs: Pipelock Coverage](/learn/owasp-llm-top10/)
- [OWASP Agentic AI Threats: Pipelock Coverage](/learn/owasp-agentic-threats/)
- [Agent Egress Security](/learn/agent-egress-security/)
- [MCP Security](/learn/mcp-security/)
- [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/)
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
