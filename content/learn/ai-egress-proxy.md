---
title: "AI Egress Proxy: Control What Your Agents Send"
linkTitle: "AI Egress Proxy"
seoTitle: "AI Egress Proxy: Control What Your Agents Send"
subtitle: "One enforcement point between your agents and the internet."
description: "An AI egress proxy routes all agent traffic through one control point. Inspect HTTP and MCP requests, block data leaks, and enforce network policy."
date: 2026-04-11
lastmod: 2026-04-23
faq:
  - q: "What is an AI egress proxy?"
    a: "An AI egress proxy is a forward proxy that sits between AI agents and the internet. All outbound HTTP, MCP, and WebSocket traffic from the agent passes through the proxy, which inspects requests for credential leaks, prompt injection, SSRF, and policy violations before forwarding them."
  - q: "Why do AI agents need egress control?"
    a: "AI agents have API keys, shell access, and the ability to make arbitrary network requests. A prompt injection or malicious MCP tool can instruct the agent to exfiltrate credentials via HTTP, DNS, or tool arguments. Without egress control, there is no enforcement point to block this traffic before it leaves your network."
  - q: "How is an AI egress proxy different from a traditional proxy?"
    a: "A traditional forward proxy routes and caches HTTP traffic. An AI egress proxy adds content inspection tuned for agent threats: DLP scanning for API keys and tokens (with base64/hex/URL decoding), prompt injection detection in responses, SSRF blocking, MCP protocol awareness, and per-domain rate limiting. It understands what agents do and what attackers try to extract through them."
learn_cat: concepts
level: intro
tags:
  - proxy
  - egress
  - explainer
---
## What is an AI egress proxy?

An AI egress proxy is a forward proxy purpose-built for AI agent traffic. It sits between your agent and every external service the agent contacts. Every outbound HTTP request, MCP tool call, and WebSocket frame passes through it.

The proxy inspects traffic in both directions. Outbound, it scans for leaked credentials, SSRF attempts, and policy violations. Inbound, it scans responses for prompt injection payloads that could compromise the agent on the next turn.

The key difference from allowlisting or blocklisting: an AI egress proxy performs deep content inspection. It doesn't just check whether a domain is permitted. It checks whether the request body contains your AWS keys encoded in base64.

```
Agent Process  ──>  AI Egress Proxy  ──>  Internet
     (has secrets,       (inspects traffic,     (untrusted)
      no direct route)    enforces policy)
```

The agent has credentials but no direct network path. The proxy has the network path but enforces scanning on every byte that crosses it.

[Pipelock](/pipelock/) is the open-source agent firewall that runs as an AI egress proxy on the network path between an agent and the internet, scanning HTTP, MCP, and WebSocket egress for credential leaks, prompt injection, SSRF, and tool poisoning. Those scanner claims are testable rather than asserted: the corpus, the [public methodology, and the known gaps](/proof/) are all published.

## Why agents need egress control

Traditional software makes predictable network calls. You can define its behavior at build time. AI agents are different.

**Agents hold credentials.** They read `.env` files, access cloud tokens, and use API keys to do their work. The agent process has everything an attacker wants.

**Agents make arbitrary HTTP calls.** A coding agent fetches documentation, calls APIs, downloads packages, and posts results. The set of outbound requests is not fixed at build time. It changes with every prompt.

**Agents call tools.** MCP tool calls carry arguments that can contain any data, including secrets an injection told the agent to include. Tool responses carry content that can contain injection payloads.

**Agents follow instructions from untrusted input.** A prompt injection in a fetched web page, a poisoned MCP tool description, or a malicious repository file can redirect the agent's behavior. The agent doesn't know the instruction is hostile.

Without an egress control point, a compromised agent can send your credentials to any endpoint on the internet. No log, no alert, no block. The secret is gone before you know it happened.

## Proxy vs gateway vs firewall

These terms overlap. Here is how they map in the AI agent context.

**Egress proxy.** A forward proxy that handles outbound traffic from agents. Traffic flows through it because the agent is configured (or network-forced) to use it. The proxy inspects content and enforces policy.

**Gateway.** Usually implies a centralized entry point for inbound traffic (API gateway) or a routing layer for a specific protocol (MCP gateway). Some vendors use "gateway" for outbound filtering too. The distinction is fuzzy.

**Agent firewall.** The broadest term. An [agent firewall](/agent-firewall/) combines egress proxy capabilities (HTTP scanning, DLP, SSRF) with protocol-specific inspection (MCP tool calls, WebSocket frames) and network enforcement. It's the full security boundary around agent traffic.

In practice, if you are scanning outbound agent HTTP and MCP traffic for secrets and injection, you are running an AI egress proxy. If that proxy also handles network policy, audit logging, and protocol-aware inspection, most people call it an agent firewall.

## What to inspect

An AI egress proxy needs to inspect more than URLs and headers. Agent threats hide in places traditional proxies ignore.

### Credentials in requests

Scan URLs, query parameters, headers, and POST bodies for credential patterns: AWS keys, GitHub tokens, JWTs, private keys, Stripe keys, and dozens more. Attackers encode secrets to evade detection, so decode base64, hex, and URL encoding before pattern matching.

### Injection in responses

HTTP responses and MCP tool responses can contain prompt injection. The proxy scans inbound content for injection patterns before the agent processes it. This catches attacks at the network layer, outside the agent's trust boundary.

### SSRF attempts

Block requests to private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata endpoints (`169.254.169.254`), and link-local addresses. Include DNS rebinding protection: resolve the hostname, verify the IP, then connect. Don't resolve twice. The [preventing SSRF in AI agents](/learn/preventing-ssrf-in-ai-agents/) reference covers the full attack surface.

### DNS exfiltration

Secrets encoded as subdomains (`AKIAIOSFODNN7EXAMPLE.leak.attacker.com`) leak data through DNS resolution before the HTTP request even completes. The proxy resolves DNS itself and scans the hostname for credential patterns.

### MCP tool calls

MCP tool arguments can carry exfiltrated data. MCP tool descriptions can contain poisoned instructions. An AI egress proxy that also handles MCP traffic scans both directions of every tool call. This requires protocol-level awareness, not just byte inspection.

## Deployment patterns

There are three common ways to route agent traffic through an AI egress proxy.

### Environment variable

Set `HTTPS_PROXY` so the agent's HTTP client routes through the proxy. Simple to deploy. The limitation: a prompt injection that gains shell access can unset the variable. Use this as a starting point, not as your only enforcement.

```bash
export HTTPS_PROXY=http://127.0.0.1:8888
```

### Companion proxy or sidecar

Run the proxy next to the agent workload and use network controls (Kubernetes NetworkPolicy, iptables, or container networking) to block the agent's direct internet access. The stronger pattern is a separate companion proxy that the agent can reach but the internet cannot bypass. A same-pod sidecar is still useful for quick rollout, but it relies on the agent honoring proxy settings.

```
┌─────────────────────────┐
│  Pod / VM               │
│  ┌───────┐  ┌────────┐  │
│  │ Agent │──│ Proxy  │──── Internet
│  └───────┘  └────────┘  │
│  (no direct egress)     │
└─────────────────────────┘
```

For Pipelock `v2.2.0`, `pipelock init sidecar --inject-spec` generates the enforced companion-proxy form of this pattern for Kubernetes workloads. It emits the proxy Deployment, Service, NetworkPolicies, and bound workload identity in one pass. See [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/).

### Hook-based

Some agent frameworks support hooks that intercept tool calls before execution. The hook sends the request through the proxy for scanning. This works for MCP traffic and agent-specific actions (file writes, shell commands) that never touch the network directly.

```bash
# Claude Code: one-command setup
pipelock claude setup
```

## How Pipelock works as an AI egress proxy

[Pipelock](/pipelock/) is an open-source AI egress proxy and agent firewall. It handles HTTP, MCP, and WebSocket traffic in a single binary.

**DLP scanning.** 65 credential patterns with checksum validators. Decodes base64, hex, and URL encoding before matching. Scans environment variable values with Shannon entropy filtering.

**Injection detection.** Multi-pass normalization pipeline scans HTTP responses and MCP tool responses for prompt injection patterns.

**SSRF protection.** Blocks private IPs, metadata endpoints, and DNS rebinding.

**MCP proxy.** Wraps MCP server commands. Scans tool descriptions for poisoning, arguments for credential leaks, and responses for injection.

**Audit logging.** Structured JSON logs for every scan decision. Ship to your SIEM for incident response.

[Install Pipelock](/install/), then run it in front of the agent:

```bash
# Install
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Run as HTTP proxy
pipelock run --config pipelock.yaml

# Route agent traffic through it
export HTTPS_PROXY=http://127.0.0.1:8888

# Or set up Claude Code with hooks + MCP proxy
pipelock claude setup
```

## Other egress proxy approaches

Not every egress proxy does the same thing. [iron-proxy](/compare/pipelock-vs-iron-proxy/) focuses on domain allowlisting and boundary secret rewriting, where the proxy holds real credentials and the agent only sees placeholder tokens. That is a different design from content inspection. [Cloudflare Sandboxes](/learn/cloudflare-sandboxes-pipelock/) ships native domain filtering, credential injection, and programmable outbound handlers at the infrastructure layer for agents running on Cloudflare. That covers where traffic goes and how credentials flow. Cloudflare's public docs do not describe built-in content-layer scanning for credentials, injection, or tool poisoning.

## Further reading

- [What is an Agent Firewall?](/agent-firewall/): the full architecture around agent traffic
- [Cloudflare Sandboxes + Pipelock](/learn/cloudflare-sandboxes-pipelock/): two-layer egress for agents on Cloudflare
- [Pipelock vs iron-proxy](/compare/pipelock-vs-iron-proxy/): content scanning vs boundary secret rewriting
- [Pipelock](/pipelock/): features, install, and configuration
- [MCP Proxy](/learn/mcp-proxy/): how Pipelock scans MCP tool calls and responses
- [MCP Gateway](/learn/mcp-gateway/): routing and access control vs content inspection for MCP
- [MCP Security](/learn/mcp-security/): the MCP attack surface and how to scan it
- [AI Agent Security](/learn/ai-agent-security/): hooks, guardrails, and egress inspection compared
- [Agent Egress Security](/learn/agent-egress-security/): credential leak vectors and defenses
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
