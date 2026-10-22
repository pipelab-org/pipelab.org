---
title: "AI Agent Security: Three Layers You Actually Need"
linkTitle: "AI Agent Security"
seoTitle: "AI Agent Security: Three Layers You Actually Need"
subtitle: "Hooks, guardrails, and egress inspection. What each one stops and where the gaps are."
description: "AI agent security explained in three layers: agent-side hooks, inference guardrails, and egress inspection. What each layer catches and what it misses."
date: 2026-04-07
lastmod: 2026-04-23
faq:
  - q: "What are the three layers of AI agent security?"
    a: "AI agent security has three distinct layers: agent-side hooks (intercept tool calls before execution), inference guardrails (classify prompts and completions for safety), and egress inspection (scan actual network traffic between the agent and the internet). Each layer catches different attacks. No single layer covers everything."
  - q: "Why do AI agents need security beyond the model's built-in safety?"
    a: "AI agents have network access, file system access, and API credentials. A prompt injection can make the agent exfiltrate secrets via HTTP, leak credentials through MCP tool calls, or access internal services via SSRF. The model's built-in safety training helps but can be bypassed. Defense-in-depth requires security controls outside the model's trust boundary."
  - q: "What is egress inspection for AI agents?"
    a: "Egress inspection is a network proxy that sits between an AI agent and the internet, scanning the outbound and inbound traffic it mediates. It checks HTTP requests for leaked secrets, MCP tool calls for poisoned descriptions, responses for prompt injection, and URLs for SSRF attempts. Because it runs as a separate process, prompt injection cannot rewrite its rules. Enforcement still depends on isolation that keeps the agent from routing around the proxy."
learn_cat: concepts
level: intro
tags:
  - agent-security
  - layers
  - explainer
---
AI agent security is not one tool or one layer. Your agent has API keys, file system access, and an internet connection. When something goes wrong, secrets leave through HTTP requests, MCP tool calls, or DNS queries before anyone notices. The model's built-in safety training helps, but it's not a security boundary. It can be bypassed with the right prompt.

Real defense requires multiple layers, each catching different attacks at different points. Most teams either have zero layers or think one tool covers everything. Neither is true.

## The three security layers

There are three fundamentally different places to enforce security on AI agents. They're not interchangeable. Each one operates at a different level of the stack, sees different data, and stops different attacks.

### Layer 1: Agent-side hooks

**What it is:** Code that intercepts tool calls before the agent executes them. Hooks see the tool name and arguments, run checks, and return allow/deny.

**Examples:** [Sage](https://github.com/gendigitalinc/sage) (Gen Digital), AgentGuard (GoPlus), Claude Code's built-in permission system.

**What it catches:** Dangerous shell commands, suspicious file writes, known-bad URLs in tool arguments, package supply chain attacks.

**What it misses:** Anything that doesn't go through the hook system. HTTP requests made by tools after they execute. Secrets encoded in base64 or hex. Response content returning from tools (hooks run pre-execution, not post). MCP tool descriptions that poison the agent before any tool is called.

**The fundamental limit:** Hooks run inside the agent's process. A successful prompt injection can potentially disable or bypass them.

### Layer 2: Inference guardrails

**What it is:** A classifier (usually ML-based) that analyzes prompts and completions for safety. Either embedded in the application code or called as an API.

**Examples:** [LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) (Meta), [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) (NVIDIA), Guardrails AI.

**What it catches:** Direct jailbreak attempts, harmful content generation, some prompt injection patterns in the model's input and output.

**What it misses:** Secrets in HTTP traffic (guardrails don't see HTTP requests). MCP tool poisoning (guardrails don't parse MCP protocol). Encoded exfiltration (base64 secrets in URLs look like normal text to a classifier). DNS-based exfiltration. SSRF. Anything that happens at the network layer.

**The fundamental limit:** Guardrails analyze text for semantic safety. They don't see network traffic. An agent that passes a guardrail check can still exfiltrate your AWS keys through a perfectly benign-looking HTTP request.

### Layer 3: Egress inspection

**What it is:** A network proxy between the agent and the internet. Mediated traffic flows through it. It scans HTTP requests, MCP messages, and WebSocket frames for security violations. DLP runs before DNS resolution, blocking strict-mode secret exfiltration through DNS query strings and detecting it in balanced mode.

**Examples:** [Pipelock](/pipelock/) does content-inspecting egress proxy for AI agents (DLP, injection, SSRF, encoding evasion across HTTP, MCP, and WebSocket). GitHub's [agent workflow firewall](https://github.com/github/gh-aw-firewall) does domain-level allowlisting without content scanning. Most other tools in this space either scan MCP only or do allowlisting only.

**What it catches:** Secret exfiltration (API keys, tokens, credentials in URLs, headers, POST bodies, tool arguments), prompt injection in fetched content and tool responses, SSRF (private IPs, cloud metadata, DNS rebinding), MCP tool poisoning and rug-pulls, multi-tool exfiltration chains, encoded secrets (base64, hex, URL encoding, Unicode tricks).

**What it misses:** Attacks that don't touch the network (local file manipulation, in-memory reasoning corruption). Jailbreaks that change the agent's behavior without producing suspicious traffic. That's where hooks and guardrails complement it.

**The fundamental advantage:** Runs as a separate process with no shared memory. The agent can't disable it through prompt injection. If direct egress is blocked with container networking, NetworkPolicy, or kernel egress containment, even a fully compromised agent's network traffic still passes through the proxy.

## Why one layer isn't enough

| Attack | Hooks | Guardrails | Egress Inspection |
|--------|-------|------------|-------------------|
| Shell command injection | Catches | Misses | Misses (no shell visibility) |
| Secret in URL query param | Misses (no URL scanning) | Misses (not text safety) | **Catches** |
| Secret in POST body | Misses (no body visibility) | Misses | **Catches** |
| MCP tool poisoning | Misses (no MCP parsing) | Misses (no MCP parsing) | **Catches** |
| Prompt injection in web page | Misses (post-fetch) | Catches (maybe) | **Catches** |
| Base64-encoded secret in header | Misses | Misses | **Catches** (6-pass decode) |
| SSRF to cloud metadata | Misses | Misses | **Catches** |
| DNS exfiltration | Misses | Misses | **Catches** |
| Direct jailbreak prompt | Misses (pre-tool) | **Catches** | Misses (no prompt visibility) |
| Dangerous file write | **Catches** | Misses | Misses (local operation) |

No layer covers every row. An agent protected by all three has real defense-in-depth.

## Getting started

If you have zero layers today, start with egress inspection. It covers the widest attack surface with the least integration work. [Install Pipelock](/install/), set `HTTPS_PROXY` to route HTTP traffic through a scanning proxy, and wrap MCP servers through the proxy for tool call inspection. Before trusting any of it, read the [measured coverage and the documented gaps](/proof/).

```bash
# Install
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Set up Claude Code (hooks + MCP proxy)
pipelock claude setup

# Or just proxy HTTP traffic for any agent
export HTTPS_PROXY=http://127.0.0.1:8888
pipelock run
```

Then add hooks and guardrails as your threat model demands. The three layers are complementary, not competing.

<div class="hero-buttons" style="margin-top: 2rem;">
  <a href="https://github.com/pipelab-org/pipelock" class="btn btn-primary" data-event="github_click" data-event-placement="guide-body" target="_blank" rel="noopener noreferrer">GitHub</a>
  <a href="/install/" class="btn btn-ghost" data-event="install_click" data-event-placement="guide-body">Install Pipelock</a>
  <a href="/proof/" class="btn btn-ghost" data-event="proof_click" data-event-placement="guide-body">Inspect the proof</a>
</div>

## Further reading

- [LLM Security](/learn/llm-security/): the practitioner-level threat taxonomy and defense map
- [What is an Agent Firewall?](/agent-firewall/): the egress inspection architecture
- [Agent Egress Security](/learn/agent-egress-security/): preventing credential leaks
- [AI Agent Data Loss Prevention](/learn/ai-agent-data-loss-prevention/): the DLP layer specifically
- [MCP Vulnerabilities](/learn/mcp-vulnerabilities/): the full MCP attack surface
- [Prompt Injection Defense](/learn/prompt-injection-network-defense/): catching injection at the proxy layer
- [Agent Firewall vs Guardrails](/compare/agent-firewall-vs-guardrails/): detailed comparison
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
