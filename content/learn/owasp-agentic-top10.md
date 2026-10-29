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
    a: "The shipped ASI01 mapping names response-injection scanning, simulation, and canary tokens. Detection is limited to traffic mediated by Pipelock and known injection patterns."
  - q: "How does Pipelock detect rogue AI agents?"
    a: "Assess v3.7.1 marks ASI10 as not covered. Discovery surfaces unprotected local MCP servers; external runtimes and shadow deployments require organizational control."
learn_cat: compliance
level: ref
tags:
  - owasp
  - agentic
  - OWASP-AGENTIC
---
The [OWASP Agentic Top 10 (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) focuses specifically on AI agent threats: tool abuse, inter-agent attacks, rogue behavior. This is closer to Pipelock's core than the [LLM Top 10](/learn/owasp-llm-top10/), which includes model-level concerns.

Assess v3.7.1 maps all ten categories: four covered, five partial, and one not covered. These statuses describe the listed product controls, not complete prevention of each risk.

## Coverage at a glance

| ID | Threat | Status | Pipelock mapping | Limit |
|---|---|---|---|---|
| ASI01 | Agent Goal Hijack | Covered | Response injection scanning with 6-pass normalization catches goal-hijack attempts. |  |
| ASI02 | Tool Misuse and Exploitation | Covered | Tool policy rules block dangerous calls, sandbox contains execution, HITL requires approval. |  |
| ASI03 | Identity and Privilege Abuse | Partial | Per-agent profiles enforce least-privilege policy, session binding pins tool inventories. | Identity lifecycle and credential revocation remain deployment concerns. |
| ASI04 | Agentic Supply Chain Vulnerabilities | Covered | Binary integrity verifies subprocess hashes, tool provenance checks Ed25519 signatures. |  |
| ASI05 | Unexpected Code Execution (RCE) | Covered | Landlock sandbox contains processes, with seccomp syscall filtering on linux/amd64; tool policy blocks shell execution patterns. |  |
| ASI06 | Memory & Context Poisoning | Partial | Response scanning detects injection payloads and the flight recorder preserves forensic evidence. Session taint propagates across the agent boundaries pipelock proxies: when a contaminated session emits an A2A request body or an MCP tool call, a cross_agent taint source is recorded on the session and hostile-level propagation raises adaptive-enforcement risk. | Propagation is scoped to a single proxied session. Correlating distinct sessions to one logical agent (the multi-agent layer) and contamination over agent-to-agent paths that never transit the proxy remain deployment concerns, not binary-enforced. |
| ASI07 | Insecure Inter-Agent Communication | Partial | Bidirectional MCP scanning covers content flowing between agents through the proxy, and A2A scanning inspects request and response bodies, service-parameter headers, Agent Cards, and SSE streams for injection, DLP, and SSRF. | Direct agent-to-agent traffic that never transits the proxy is outside binary enforcement; end-to-end message authentication between agents remains a deployment concern. |
| ASI08 | Cascading Failures | Partial | Simulation tests detection, adaptive enforcement escalates on threat accumulation. | Fleet-wide containment and failover policies are deployment concerns. |
| ASI09 | Human-Agent Trust Exploitation | Partial | HITL approval and kill switch provide operator override points. | Human review behavior is outside binary enforcement. |
| ASI10 | Rogue Agents | Not covered | Discovery surfaces unprotected MCP servers on the local system. | External runtimes and shadow deployments require org-level control. |

---

## ASI01: Agent Goal Hijack (Covered) {#asi01-agent-goal-hijack-strong}

Attackers redirect agent objectives through malicious text in external data: web pages, tool results, documents.

Response injection scanning with 6-pass normalization catches goal-hijack attempts.

## ASI02: Tool Misuse and Exploitation (Covered) {#asi02-tool-misuse-partial}

Agents misuse legitimate tools due to prompt injection, misalignment, or unsafe delegation. Tools get called with destructive parameters or chained in unexpected ways.

Tool policy rules block dangerous calls, sandbox contains execution, HITL requires approval.

## ASI03: Identity and Privilege Abuse (Partial) {#asi03-identity-privilege-abuse-strong}

Attackers exploit inherited credentials, delegated permissions, or agent-to-agent trust to access resources beyond intended scope.

Per-agent profiles enforce least-privilege policy, session binding pins tool inventories. Identity lifecycle and credential revocation remain deployment concerns.

## ASI04: Agentic Supply Chain Vulnerabilities (Covered) {#asi04-supply-chain-vulnerabilities-partial}

Malicious or tampered tools, skill packages, models, or agent personas compromise execution.

Binary integrity verifies subprocess hashes, tool provenance checks Ed25519 signatures.

## ASI05: Unexpected Code Execution (RCE) (Covered) {#asi05-unexpected-code-execution-moderate}

Agents generate or execute attacker-controlled code through manipulated tool outputs.

Landlock sandbox contains processes, with seccomp syscall filtering on linux/amd64; tool policy blocks shell execution patterns.

## ASI06: Memory & Context Poisoning (Partial) {#asi06-memory-context-poisoning-moderate}

Attackers corrupt the data sources an agent relies on for knowledge and decisions.

Response scanning detects injection payloads and the flight recorder preserves forensic evidence. Session taint propagates across the agent boundaries pipelock proxies: when a contaminated session emits an A2A request body or an MCP tool call, a cross_agent taint source is recorded on the session and hostile-level propagation raises adaptive-enforcement risk. Propagation is scoped to a single proxied session. Correlating distinct sessions to one logical agent (the multi-agent layer) and contamination over agent-to-agent paths that never transit the proxy remain deployment concerns, not binary-enforced.

## ASI07: Insecure Inter-Agent Communication (Partial) {#asi07-insecure-inter-agent-communication-partial}

Agents in a multi-agent system attack each other through shared resources, message passing, or lateral movement through workspace files.

Bidirectional MCP scanning covers content flowing between agents through the proxy, and A2A scanning inspects request and response bodies, service-parameter headers, Agent Cards, and SSE streams for injection, DLP, and SSRF. Direct agent-to-agent traffic that never transits the proxy is outside binary enforcement; end-to-end message authentication between agents remains a deployment concern.

## ASI08: Cascading Failures (Partial) {#asi08-cascading-failures-moderate}

Failures propagate through agent chains. One agent's error or compromise triggers failures downstream.

Simulation tests detection, adaptive enforcement escalates on threat accumulation. Fleet-wide containment and failover policies are deployment concerns.

## ASI09: Human-Agent Trust Exploitation (Partial) {#asi09-human-agent-trust-exploitation-partial}

Attackers exploit the trust humans place in agent outputs, using agents as intermediaries to deliver manipulated content or unauthorized actions.

HITL approval and kill switch provide operator override points. Human review behavior is outside binary enforcement.

## ASI10: Rogue Agents (Not covered) {#asi10-rogue-agents-strong}

Agents act outside their intended boundaries due to compromised objectives, misalignment, or adversarial manipulation.

Discovery surfaces unprotected MCP servers on the local system. External runtimes and shadow deployments require org-level control.

## The three OWASP frameworks

1. **[Top 10 for LLM Applications (2025)](/learn/owasp-llm-top10/):** model and application risks. Not included in the Assess v3.7.1 catalog.
2. **Top 10 for Agentic Applications (ASI01-ASI10):** this page. Agent-specific risks. Four covered, five partial, one not covered in Assess v3.7.1.
3. **[Agentic AI Threats and Mitigations (T1-T15)](/learn/owasp-agentic-threats/):** 15-threat taxonomy. Not included in the Assess v3.7.1 catalog.

## Further reading

- [OWASP Top 10 for LLMs: Pipelock Coverage](/learn/owasp-llm-top10/)
- [OWASP Agentic AI Threats: Pipelock Coverage](/learn/owasp-agentic-threats/)
- [Agent Egress Security](/learn/agent-egress-security/)
- [MCP Security](/learn/mcp-security/)
- [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/)
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
- [Shipped mapping (Pipelock v3.7.1)](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/owasp_agentic.go): control IDs, status, evidence, and limitations.
