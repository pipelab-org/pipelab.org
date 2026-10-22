---
title: "Secure AI Agent Deployment: Pre-Launch to Production"
linkTitle: "Secure Agent Deployment"
subtitle: "Lock it down before you turn it on."
description: "Secure AI agent deployment starts before launch. Isolate credentials, restrict network access, inspect tool traffic, and log every decision."
date: 2026-04-11
faq:
  - q: "What is the first step in secure AI agent deployment?"
    a: "Start with a threat model. List everything the agent can access: credentials, APIs, file system paths, network endpoints, and MCP servers. Map each access path to a potential abuse scenario. This determines which controls you need before the agent goes live."
  - q: "How do you prevent AI agents from leaking secrets in production?"
    a: "Use three controls together. First, isolate secrets so the agent process cannot read them directly. Second, route all outbound traffic through a scanning proxy that checks for credential patterns in URLs, headers, bodies, and MCP tool arguments. Third, restrict network access to an allowlist of approved domains. Encoding-aware DLP catches base64, hex, and URL-encoded secrets that plain text scanning misses."
  - q: "What runtime controls should an AI agent have in production?"
    a: "Production AI agents need an egress proxy (scanning outbound HTTP, MCP, and WebSocket traffic), DLP scanning for credential patterns, prompt injection detection on inbound content, domain allowlists to limit where the agent can connect, SSRF protection against private IP access, and a tamper-evident audit log. A kill switch that stops all agent traffic immediately is also critical for incident response."
learn_cat: concepts
level: deep
tags:
  - deployment
  - threat-modeling
  - kill-switch
---
Most teams deploy AI agents the way they deploy a new npm package: install it, give it credentials, and hope for the best. That works until the agent reads your `.env` file and sends it somewhere it shouldn't.

Secure AI agent deployment is not a single checklist item. It starts before you turn the agent on and continues through every production request. This guide covers the controls that matter, in the order you should apply them.

## Threat model first

Before writing a single config file, answer four questions:

**What can the agent access?** List every credential, API key, token, and secret the agent process can reach. Include environment variables, config files, credential stores, and anything mounted into the agent's filesystem.

**What network endpoints can it reach?** By default, most agents can hit any public IP. That includes attacker-controlled servers, cloud metadata endpoints, and internal services on your network.

**What MCP servers does it connect to?** Each MCP server is a trust boundary. A malicious or compromised server can poison tool descriptions, inject prompts in responses, or change behavior mid-session.

**What's the blast radius?** If the agent is fully compromised through prompt injection, what's the worst outcome? Leaked cloud credentials? Deleted production data? Lateral movement into internal services?

Your threat model determines which controls are mandatory vs nice-to-have. An agent with read-only access to public docs needs less protection than one with AWS admin keys and shell access.

## Pre-deploy controls

These run once, before the agent goes live.

### Secret isolation

The agent process should not have direct access to production secrets. Use short-lived tokens, scoped API keys, and credential vending machines instead of long-lived keys in environment variables.

If the agent must have credentials (most do), limit the scope. A GitHub token with `read:repo` only is less dangerous than one with `admin:org`. An AWS key scoped to a single S3 bucket is less dangerous than one with `AdministratorAccess`.

### MCP server vetting

Every MCP server you connect to your agent is code running with access to your agent's context. Before adding one:

- Read the source. Check tool descriptions for hidden instructions.
- Pin versions. Don't pull `latest` in production.
- Run a scanner. Tools like [mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner) check tool descriptions for injection patterns before you deploy.

### Tool allowlisting

Define exactly which tools the agent can call. If your agent only needs `read_file` and `search`, don't give it `execute_command` and `write_file`. Deny by default, allow explicitly.

## Runtime controls

These run continuously while the agent is active.

### Egress proxy

Route all outbound traffic through a scanning proxy. The proxy inspects HTTP requests, MCP tool calls, and WebSocket frames before they leave the network.

What the proxy checks:

- **DLP patterns:** API keys, tokens, private keys, JWTs, and other credential formats in URLs, headers, POST bodies, and MCP tool arguments.
- **Encoding evasion:** Base64, hex, URL encoding, and Unicode tricks. Attackers encode secrets to bypass plaintext scanning. A good proxy decodes before it scans.
- **Prompt injection:** Inbound content (web pages, API responses, tool results) can contain instructions that hijack the agent. The proxy scans responses before they reach the agent's context.
- **SSRF:** Blocks requests to private IPs, cloud metadata endpoints (169.254.169.254), and link-local addresses. Includes DNS rebinding protection.

### Domain allowlists

Restrict where the agent can connect. If it only needs `api.github.com` and `registry.npmjs.org`, block everything else. This limits the blast radius of any compromise: even if an attacker injects an exfiltration URL, the proxy rejects the domain.

### MCP tool description monitoring

A rug-pull attack sends clean tool descriptions initially, then swaps in poisoned versions mid-session. Runtime monitoring fingerprints every tool description and alerts if one changes after initial discovery.

## Logging and rollback

### Flight recorder

Log every agent action in a tamper-evident audit trail. A flight recorder captures:

- Every HTTP request and response (with scan results)
- Every MCP tool call and response
- Every block decision and the rule that triggered it
- Timestamps, session IDs, and request hashes

Hash-chain each entry so tampering is detectable. Use signed checkpoints at intervals so an auditor can verify the log hasn't been modified.

### Signed checkpoints

Periodically sign the current state of the audit log with Ed25519 keys. This gives you a cryptographic proof of what the agent did at a specific point in time. Useful for compliance, incident response, and post-mortem analysis.

### Kill switch

Build a way to stop all agent traffic immediately. Not "gracefully shut down over 30 seconds." Stop. Now. When you detect an active exfiltration or a compromised agent session, you need the ability to cut the connection within seconds.

A proxy-based kill switch is straightforward: the proxy stops forwarding. The agent can't bypass it because the agent doesn't have direct network access.

## Reference architecture

```
                ┌──────────────┐
                │   AI Agent   │
                │  (no direct  │
                │   network)   │
                └──────┬───────┘
                       │
              ┌────────▼────────┐
              │    Pipelock     │
              │  Egress Proxy   │
              │                 │
              │  DLP ▸ Injection│
              │  SSRF ▸ Domain  │
              │  Allowlist ▸ Log│
              └───┬─────────┬───┘
                  │         │
         ┌────────▼──┐  ┌──▼────────┐
         │  Internet  │  │MCP Servers│
         │  (HTTP/S)  │  │ (wrapped) │
         └────────────┘  └───────────┘
```

The agent process has credentials but no network access. The proxy has network access but no credentials. MCP servers are wrapped through the proxy, so tool calls and responses pass through the same scanning pipeline as HTTP traffic.

This is capability separation. Neither component alone can exfiltrate data. Both must be compromised simultaneously for secrets to leave the network.

## Getting started

Install Pipelock and set up your agent in under a minute:

```bash
# Install
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Set up Claude Code (hooks + MCP proxy in one command)
pipelock claude setup

# Or set up Cursor
pipelock cursor install
```

For any agent that makes HTTP requests:

```bash
# Start the proxy
pipelock run

# Route traffic through it
export HTTPS_PROXY=http://127.0.0.1:8888
```

Combine with network isolation (iptables, container networking, or Kubernetes NetworkPolicy) for enforcement that prompt injection can't bypass.

For the Kubernetes path added in `v2.2.0`, start with [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/) and treat [Pipelock session recovery](/learn/pipelock-session-recovery/) as part of the production runbook, not an afterthought.

## Further reading

- [AI Agent Security](/learn/ai-agent-security/): three security layers and what each one catches
- [AI Runtime Security](/learn/ai-runtime-security/): the runtime threat model across model, agent, and infrastructure layers
- [Generative AI Firewall](/learn/generative-ai-firewall/): the vendor category for inline AI traffic inspection
- [What is an Agent Firewall?](/agent-firewall/): the egress inspection architecture
- [AI Agent Security Best Practices](/learn/ai-agent-security-best-practices/): operational checklists
- [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/): enforced K8s rollout pattern in `v2.2.0`
- [Pipelock session recovery](/learn/pipelock-session-recovery/): inspect, explain, release, and terminate airlocked sessions
- [Pipelock](/pipelock/): all features, one page
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
