---
title: "OWASP Agentic AI Threats: Pipelock Coverage"
linkTitle: "OWASP Agentic AI Threats: Coverage"
subtitle: "How Pipelock addresses the OWASP Agentic AI Threats framework (15 threats)."
description: "Pipelock covers 12 of 15 OWASP Agentic AI threats including memory poisoning, tool misuse, privilege compromise, and rogue agents. Full coverage mapping."
date: 2026-03-12
faq:
  - q: "What is the OWASP Agentic AI Threats framework?"
    a: "The OWASP Agentic AI Threats and Mitigations framework identifies 15 security threats specific to AI agent systems. It is published by the OWASP Agentic Security Initiative and is broader than the OWASP Top 10 for Agentic Applications (10 threats). It covers memory poisoning, tool misuse, privilege compromise, resource overload, hallucination attacks, goal manipulation, deceptive behaviors, audit gaps, identity spoofing, HITL overload, RCE, communication poisoning, rogue agents, human attacks on multi-agent systems, and human manipulation."
  - q: "How many OWASP Agentic AI threats does Pipelock cover?"
    a: "Pipelock covers 12 of 15 threats: 7 with strong coverage (memory poisoning, tool misuse, privilege compromise, deceptive behaviors, repudiation, communication poisoning, rogue agents), 2 moderate (goal manipulation, RCE), and 3 partial (resource overload, identity spoofing, human attacks on multi-agent systems). The 2 out-of-scope threats are cascading hallucination attacks and human manipulation, which require model-level or social engineering defenses."
learn_cat: compliance
level: ref
tags:
  - owasp
  - agentic
  - threats
---
The [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) framework is the broadest of OWASP's three AI security lists, covering 15 threats. It goes deeper than the [Agentic Top 10](/learn/owasp-agentic-top10/) (which focuses on the top risks) and the [LLM Top 10](/learn/owasp-llm-top10/) (which focuses on model-level risks).

Pipelock covers 12 of 15. Seven strong, two moderate, three partial.

## Coverage at a glance

| # | Threat | Coverage |
|---|--------|----------|
| T1 | Memory Poisoning | **Strong** |
| T2 | Tool Misuse | **Strong** |
| T3 | Privilege Compromise | **Strong** |
| T4 | Resource Overload | Partial |
| T5 | Cascading Hallucination Attacks | Out of scope |
| T6 | Intent Breaking & Goal Manipulation | Moderate |
| T7 | Misaligned & Deceptive Behaviors | **Strong** |
| T8 | Repudiation & Untraceability | **Strong** |
| T9 | Identity Spoofing & Impersonation | Partial |
| T10 | Overwhelming Human-in-the-Loop | Not yet addressed |
| T11 | Unexpected RCE and Code Attacks | Moderate |
| T12 | Agent Communication Poisoning | **Strong** |
| T13 | Rogue Agents in Multi-Agent Systems | **Strong** |
| T14 | Human Attacks on Multi-Agent Systems | Partial |
| T15 | Human Manipulation | Out of scope |

---

## Strong coverage (7 threats)

### T1: Memory Poisoning

Malicious data injected into agent memory corrupts future decisions. Poisoned workspace files, config, or context documents alter agent behavior long after the initial injection.

- **Workspace integrity monitoring:** `pipelock integrity init/check/update` tracks SHA256 hashes of all workspace files. Any modification, addition, or deletion is detected.
- **Ed25519 signing:** manifests and files can be cryptographically signed. Tampered content fails verification.
- **Response scanning:** fetched content (a common source of memory/context data) is scanned for prompt injection before the agent sees it.

### T2: Tool Misuse

Agents misuse legitimate tools due to injection, misalignment, or unsafe delegation.

- **Fetch proxy as controlled tool:** the agent's only network access is through the proxy. Every request goes through the fixed-order scanner pipeline.
- **MCP proxy scanning** on tool responses, tool arguments, and tool descriptions.
- **Tool description scanning** detects poisoned descriptions and rug-pull definition changes via SHA256 baselines.
- **HITL approvals** for suspicious requests.

### T3: Privilege Compromise

Unauthorized escalation or misuse of permissions. Leaked credentials let agents operate beyond scope.

- **Capability separation:** agent (secrets, no network) and proxy (network, no secrets) run separately.
- **Domain allowlisting** restricts which endpoints agents can reach.
- **SSRF protection** blocks private IPs, metadata endpoints, and DNS rebinding.
- **DLP scanning:** 65 patterns detect credentials, financial account numbers, cryptocurrency private keys, and seed phrases in outbound traffic.
- **Environment variable leak detection** catches env var values (raw + base64) in URLs.

### T7: Misaligned & Deceptive Behaviors

Agents act deceptively due to misaligned objectives. A compromised agent may exfiltrate data while appearing to function normally.

- **DLP scanning** catches credentials regardless of why the agent is sending them.
- **Entropy analysis** flags high-entropy URL segments.
- **Domain blocklist** blocks exfiltration targets.
- **Audit logging** creates a verifiable trail of all agent network activity.

### T8: Repudiation & Untraceability

Agent actions can't be reliably traced or accounted for. Insufficient logging makes incident reconstruction impossible.

- **Structured audit logging:** every proxy request logged as structured JSON with URL, domain, agent name, result, scanner reason, and timestamp.
- **Per-agent identification:** agents identify via listener binding (spoof-proof), `X-Pipelock-Agent` header, or `?agent=` query param.
- **Prometheus metrics:** `/metrics` endpoint exports request counts, scanner hits, and latency histograms.
- **Grafana dashboard:** `configs/grafana-dashboard.json` provides a ready-to-import security overview.

### T12: Agent Communication Poisoning

False or malicious information injected into inter-agent communication channels.

- **MCP response scanning** checks all JSON-RPC tool results for injection patterns. Text concatenated across content blocks.
- **MCP input scanning** checks tool arguments for injection and DLP leaks on the request path.
- **MCP tool scanning** detects poisoned descriptions and rug-pull changes.
- **Response scanning** catches injection in fetched web content.
- Actions: `block`, `strip`, `warn`, or `ask`.

### T13: Rogue Agents in Multi-Agent Systems

Compromised or misaligned agents disrupt coordinated operations through shared resources.

- **Workspace integrity monitoring** catches unauthorized file modifications.
- **Per-agent egress filtering** through separate proxy profiles.
- **Ed25519 signing** for cryptographic verification of shared data.
- **Audit logging** enables identifying anomalous agent behavior.

---

## Moderate coverage (2 threats)

### T6: Intent Breaking & Goal Manipulation

Attackers alter or redirect agent goals toward unintended actions.

Overlaps with T1 and T12. Response scanning catches explicit "ignore previous instructions" patterns. Does not detect subtle goal manipulation through carefully crafted context.

### T11: Unexpected RCE and Code Attacks

Unsafe code generation leads to remote code execution. Agents execute attacker-controlled code or exfiltrate results.

- **Egress blocking** limits the blast radius. Even if malicious code runs, outbound traffic is restricted to allowed domains.
- **MCP proxy scanning** catches injection payloads in tool results before the agent processes them.
- **Content extraction** strips scripts and executable content from fetched pages.

**Containment:** `pipelock sandbox` provides Landlock + seccomp + network namespace isolation on Linux, and sandbox-exec profiles on macOS (alpha). On Windows, see [Anthropic srt](https://github.com/anthropics/sandbox-runtime).

---

## Partial coverage (3 threats)

### T4: Resource Overload

Attackers exhaust resources to disrupt performance.

Per-domain rate limiting, response size limits, and request timeouts cover network-level resource consumption. Does not address CPU/memory exhaustion from agent compute.

### T9: Identity Spoofing & Impersonation

Adversaries impersonate agents or users.

Ed25519 signing provides agent identity verification for files. Per-agent profiles with listener binding provide spoof-proof identity for proxy traffic. No certificate-based agent authentication yet.

### T14: Human Attacks on Multi-Agent Systems

Humans exploit inter-agent trust to trigger cascading failures.

Integrity monitoring and signing create trust boundaries. Audit logging enables detection. No automated trust policy enforcement between agents yet.

---

## Not addressed

### T5: Cascading Hallucination Attacks

False information from one model spreads through interconnected systems.

Out of scope. Hallucination detection requires model-level semantic analysis, not network-layer scanning.

### T10: Overwhelming Human-in-the-Loop

Attackers overload human overseers with excessive approval requests to reduce scrutiny.

Pipelock's HITL feature (`action: ask`) prompts for approval but has no rate limiting or batching of approval requests. High-volume flooding could reduce human attention. Approval rate limiting and auto-escalation are on the roadmap.

### T15: Human Manipulation

Exploiting user trust in AI to deceive humans into unsafe actions.

Social engineering at the human-AI interaction layer. Pipelock operates at infrastructure, not the conversation layer.

---

## The three OWASP frameworks

1. **[Top 10 for LLM Applications (2025)](/learn/owasp-llm-top10/):** model and application risks. 7/10 covered.
2. **[Top 10 for Agentic Applications (ASI01-ASI10)](/learn/owasp-agentic-top10/):** agent-specific risks. 10/10 covered.
3. **Agentic AI Threats and Mitigations (T1-T15):** this page. Broadest framework. 12/15 covered.

## Further reading

- [OWASP Top 10 for LLMs: Pipelock Coverage](/learn/owasp-llm-top10/)
- [OWASP Top 10 for Agentic Applications: Pipelock Coverage](/learn/owasp-agentic-top10/)
- [Agent Egress Security](/learn/agent-egress-security/)
- [MCP Security](/learn/mcp-security/)
- [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/)
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
