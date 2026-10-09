---
title: "MCP Security Tools: Scanners, Proxies, and Gateways"
linkTitle: "MCP Security Tools"
subtitle: "The tools that protect MCP connections, compared."
description: "MCP security tools help you scan servers, inspect traffic, block tool poisoning, and control access. Compare the main options and their trade-offs."
date: 2026-04-11
lastmod: 2026-08-08
faq:
  - q: "What are the main categories of MCP security tools?"
    a: "MCP security tools fall into three categories: pre-deploy scanners (check MCP servers before you connect them), runtime proxies (inspect tool calls and responses while the agent runs), and MCP gateways (route and control access across multiple MCP servers). Scanners find problems before launch. Proxies catch problems at runtime. Gateways manage routing and access policy."
  - q: "Do I need both an MCP scanner and a runtime proxy?"
    a: "Yes. Scanners check tool descriptions for known injection patterns before you deploy. But they run once, at a point in time. A rug-pull attack sends clean descriptions to the scanner and poisoned descriptions later during the session. A runtime proxy catches changes that happen after the scan. Scanners reduce the attack surface. Proxies enforce security continuously."
  - q: "What should I look for when choosing an MCP security tool?"
    a: "Check for bidirectional scanning (both tool arguments and responses), encoding evasion handling (base64, hex, URL encoding), session awareness (detecting mid-session tool description changes), and protocol coverage beyond just MCP (HTTP, WebSocket). A tool that only scans one direction or only handles plaintext leaves gaps that attackers will find."
learn_cat: mcp
level: ref
tags:
  - mcp
  - tools
  - comparison
---
MCP (Model Context Protocol) gives AI agents access to external tools. Each connection is a trust boundary. For the full [MCP security](/learn/mcp-security/) threat model and best-practices baseline, start with the pillar guide. A compromised or malicious MCP server can poison tool descriptions, steal credentials through tool arguments, or inject prompts in responses.

The ecosystem has responded with MCP security tools. They vary widely in what they actually check. This guide breaks down the categories, names the major tools, and helps you evaluate what you need.

## Tool categories

MCP security tools solve different problems at different stages:

**Pre-deploy scanners** check MCP servers before you connect them to an agent. They analyze tool descriptions for hidden instructions, flag suspicious patterns, and give you a risk assessment. They run once (or periodically), not continuously.

**Runtime proxies** sit between the agent and MCP servers during operation. They inspect every tool call and every response in real time. If a tool description changes mid-session or a credential appears in a tool argument, the proxy catches it live. [Pipelock](/pipelock/) is the open-source runtime proxy in this category. Pipelock emits mediator-signed action receipts from outside the agent trust boundary so each decision carries offline-verifiable evidence.

**MCP gateways** manage routing, access control, and policy enforcement across multiple MCP servers. Some gateways include content inspection. Others focus on authentication, authorization, and connection management.

The boundaries between these categories blur. Some tools span multiple categories. What matters is which checks actually run on your traffic.

## Pre-deploy scanners

These tools analyze MCP server tool descriptions before you connect them to an agent. They look for injection patterns, suspicious instructions, and known attack signatures.

### mcp-scanner (Cisco)

[mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner) connects to an MCP server, pulls tool descriptions, and runs them through YARA rules and an LLM-based classifier to detect hidden instructions. It flags descriptions that tell the agent to read files, exfiltrate data, or change behavior. Good for catching obvious tool poisoning before deployment. Relies on LLM judgment, so novel attacks may pass.

### Snyk agent-scan

Snyk's [agent-scan](https://snyk.io/) (formerly Invariant Labs' MCP-Scan, acquired in 2025) integrates with their vulnerability database. It analyzes MCP server packages and tool descriptions for injection patterns. Fits into existing Snyk workflows if your team already uses Snyk for dependency scanning.

### mcpscan.ai (Invariant Labs)

[mcpscan.ai](https://mcpscan.ai/) is a web-based scanner. Paste an MCP server config and it analyzes tool descriptions, checks for cross-origin escalation patterns, and generates a risk report. Low friction for quick assessments. Useful for evaluating third-party servers before adding them to your stack.

### Enkrypt AI

[Enkrypt](https://www.enkryptai.com/) offers MCP security scanning as part of a broader AI security platform. Their scanner checks tool descriptions against known attack patterns and provides continuous monitoring for description changes. Enterprise-focused with dashboard and alerting.

## Runtime proxies

Runtime proxies intercept MCP traffic while the agent runs. They scan tool calls and responses in real time, catching attacks that pre-deploy scanners miss.

### Pipelock

[Pipelock](/pipelock/) wraps MCP server commands and routes all JSON-RPC traffic through a scanning pipeline. It inspects tool descriptions for poisoning (34 injection patterns plus 9 tool-specific checks), tool arguments for credential leaks (65 DLP patterns), and tool responses for prompt injection. Fingerprints descriptions with SHA-256 to detect rug-pull attacks. Also proxies HTTP and WebSocket traffic in the same binary, so you get MCP scanning and egress inspection in one tool. Open source, single Go binary, self-hosted.

### Promptfoo

[Promptfoo](https://github.com/promptfoo/promptfoo) includes an MCP proxy that intercepts tool calls between the agent and MCP servers. It focuses on red-teaming and evaluation: injecting adversarial inputs to test how your agent handles poisoned tool responses. More of a testing and evaluation tool than a production runtime scanner, but useful for identifying weaknesses before deployment.

## MCP gateways

Gateways manage routing, access control, and policy for MCP connections. Some include security scanning. Others focus on infrastructure.

### Docker MCP Gateway

[Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/) runs MCP servers in isolated Docker containers with restricted networking. Each server gets its own container with limited filesystem and network access. Includes call tracing, logging, and a `--block-secrets` flag for basic secret filtering. The primary security model is container isolation, with some content-level controls.

### Runlayer

[Runlayer](https://www.runlayer.com/) is a cloud-hosted MCP gateway with threat detection, fine-grained permissions, and usage analytics. It sits between agents and MCP servers in the cloud, applying access policies and scanning for threats. SaaS model, not self-hosted.

### agentgateway (Linux Foundation)

[agentgateway](https://agentgateway.dev/) is a Rust-based gateway contributed by Solo.io to the Linux Foundation. It supports MCP and A2A protocols, JWT authentication, tool-level RBAC, and OpenTelemetry tracing. Infrastructure-focused: routing, auth, and observability rather than content-level security scanning.

### Obot (Acorn Labs)

[Obot](https://github.com/obot-platform/obot) is an open-source agent platform that includes MCP gateway functionality. It manages tool access, credentials, and permissions for agents. Broader scope than just MCP security: it's a full agent orchestration platform with MCP support built in.

## Scanner vs proxy: which do you need?

Both. They catch different things at different times.

| | Pre-deploy scanner | Runtime proxy |
|---|---|---|
| **When it runs** | Before connection, on demand | Continuously during operation |
| **What it checks** | Tool descriptions at scan time | All traffic: descriptions, arguments, responses |
| **Catches rug-pulls** | No (only sees the initial description) | Yes (fingerprints and tracks changes) |
| **Catches credential leaks** | No (doesn't see runtime traffic) | Yes (DLP on tool arguments) |
| **Catches injection in responses** | No (doesn't see responses) | Yes (scans inbound content) |
| **Integration effort** | Low (run once, review report) | Medium (wrap servers or configure proxy) |

A scanner tells you "this MCP server looks safe right now." A proxy enforces "this MCP server stays safe for the entire session." Run the scanner before you deploy. Run the proxy while you operate.

## Evaluation checklist

When choosing an MCP security tool, check these capabilities:

**Bidirectional scanning.** Does it inspect both outbound traffic (tool arguments) and inbound traffic (tool responses, tool descriptions)? Many tools only scan one direction. Credential leaks happen outbound. Injection happens inbound. You need both.

**Encoding evasion handling.** Does it decode base64, hex, URL encoding, and Unicode before scanning? Attackers encode payloads to bypass pattern matching. A tool that only scans plaintext misses encoded secrets and obfuscated injection.

**Session awareness.** Does it track tool descriptions across the session lifetime? A rug-pull attack sends clean descriptions first and poisoned descriptions later. Session-aware tools detect the change.

**Protocol coverage.** Does it cover only MCP, or also HTTP and WebSocket? AI agents don't just use MCP. They fetch web pages, call REST APIs, and open WebSocket connections. If your MCP security tool ignores HTTP traffic, you have a gap.

**Deployment model.** Self-hosted or SaaS? Open source or proprietary? Single binary or distributed system? These aren't security features, but they determine whether the tool fits your environment.

## Further reading

- [MCP Security](/learn/mcp-security/): the full MCP security threat model, best-practices baseline, and runtime defense map
- [MCP Proxy](/learn/mcp-proxy/): how Pipelock's MCP proxy scans bidirectionally
- [MCP gateway](/learn/mcp-gateway/): gateway vs proxy, market landscape
- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/): the attack that hides in tool descriptions
- [Pipelock](/pipelock/): all features, one page
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
