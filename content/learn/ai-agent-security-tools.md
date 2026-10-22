---
title: "AI Agent Security Tools: Scanners, Firewalls, and Gateways"
linkTitle: "Agent Security Tools"
subtitle: "What each tool category catches and what still gets through."
description: "AI agent security tools range from static scanners to runtime firewalls. Compare what each layer catches and pick the right stack for your agents."
date: 2026-04-11
lastmod: 2026-10-14
faq:
  - q: "What types of AI agent security tools exist?"
    a: "AI agent security tools fall into five categories: static scanners (check MCP servers before deployment), runtime firewalls and proxies (inspect traffic during execution), gateways (route and control access to tools), inference guardrails (classify prompts and completions), and governance platforms (discover and manage agents at enterprise scale). Most production deployments need tools from at least two categories."
  - q: "What is the difference between an AI agent firewall and a gateway?"
    a: "An agent firewall inspects the content of traffic between agents and external services, scanning for credential leaks, prompt injection, and data exfiltration. A gateway focuses on routing, access control, and policy enforcement, deciding which agents can reach which tools. Some tools combine both functions. The key question is whether the tool inspects content or just controls access."
  - q: "Do I need a scanner if I already have a runtime firewall?"
    a: "Yes. Scanners and firewalls catch different things at different times. A scanner checks MCP server configurations before deployment and flags known-vulnerable packages or suspicious tool descriptions. A runtime firewall catches attacks that happen during execution: credential leaks in tool arguments, prompt injection in responses, and tool description changes mid-session. Pre-deploy and runtime are complementary, not interchangeable."
learn_cat: concepts
level: ref
tags:
  - tools
  - comparison
---
The AI agent security market has gone from nearly empty to crowded in under a year. Scanners, firewalls, proxies, gateways, guardrails, governance platforms. The names overlap. The categories blur. And most teams aren't sure which ones they actually need.

This page maps the tool landscape by category. Each section explains what the tools in that category inspect, what they miss, and where they fit in a defense stack. Named tools are included as examples, not endorsements. Evaluate them against your own threat model.

## Tool categories

AI agent security tools break into five groups based on when they run and what they inspect:

| Category | When it runs | What it inspects |
|----------|-------------|-----------------|
| **Scanners** | Pre-deploy | MCP server configs, tool descriptions, known vulnerabilities |
| **Runtime firewalls/proxies** | During execution | HTTP traffic, MCP messages, tool arguments, tool responses |
| **Gateways** | During execution | Routing, access control, tool discovery |
| **Inference guardrails** | During execution | Prompts and completions (text classification) |
| **Governance platforms** | Continuous | Agent inventory, policy enforcement, compliance reporting |

No single category covers the full attack surface. Scanners miss runtime attacks. Firewalls miss pre-deploy misconfigurations. Gateways miss content-level threats. A real defense stack combines at least two.

[Pipelock](/pipelock/) sits in the runtime firewall category as the open-source agent firewall. Pipelock emits mediator-signed action receipts from outside the agent trust boundary, scanning HTTP, MCP, and WebSocket egress for credential leaks, prompt injection, SSRF, and tool poisoning.

## Scanners

Scanners check MCP servers and agent configurations before deployment. They run once (or in CI) and report findings. They don't sit in the traffic path at runtime.

**What they check:** Tool descriptions for hidden instructions, known CVEs in MCP server packages, configuration mistakes (overly broad permissions, missing authentication), and supply chain risks in dependencies.

**What they miss:** Anything that happens at runtime. A tool description that's clean at scan time can change mid-session (rug-pull). Credential leaks in tool arguments only happen during execution. Prompt injection arrives in responses the scanner never sees.

**Examples:**

- **[mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner) (Cisco):** Scans MCP server configurations for tool poisoning, cross-origin escalation, and known vulnerability patterns. YARA rules plus LLM-based analysis.
- **[Snyk agent-scan](https://github.com/snyk/agent-scan) (Snyk, formerly Invariant):** Scans installed MCP servers for tool poisoning and rug-pull risks. Pins tool descriptions and alerts on changes. Integrates with Snyk workflows.
- **[Enkrypt AI](https://www.enkryptai.com/):** MCP security scanning as part of a broader agent security product. Checks tool descriptions against attack patterns with continuous monitoring.

Scanners are the cheapest first step. Run them in CI on every MCP configuration change. But don't confuse pre-deploy scanning with runtime protection. They solve different problems.

## Runtime firewalls and proxies

Runtime tools sit in the traffic path between the agent and external services. Every request and response passes through them. They inspect content, not just routing.

**What they inspect:** HTTP request bodies, headers, and URLs for credential patterns (DLP). HTTP responses for prompt injection. MCP tool arguments for secret leaks. MCP tool responses for injection payloads. Tool descriptions for poisoning. DNS queries for exfiltration patterns.

**What they miss:** Local file system operations (no network hop to intercept). In-memory reasoning corruption. Attacks that don't produce network traffic. These require agent-side hooks or sandboxing.

**Examples:**

- **[Pipelock](/pipelock/):** Open-source agent firewall. Content-inspecting egress proxy for HTTP and MCP traffic. Scans for credential leaks (DLP with multi-layer decode), prompt injection (6-pass normalization), SSRF, tool poisoning, and rug-pulls. Runs as a single binary. Supports domain allowlists, MCP wrapping via stdio or HTTP, hash-chained audit logging, and Claude Code hooks. [GitHub](https://github.com/pipelab-org/pipelock).
- **[iron-proxy](https://github.com/paradigmxyz/iron-proxy):** Open-source Go proxy for AI agent egress. Host allowlisting plus boundary credential proxying, where the proxy holds the real secrets and the sandbox gets placeholders. Its docs also describe an LLM judge transform that sends a serialized request envelope to a model, documented as an additional rejection layer that can only deny and cannot override the proxy's other controls, and MCP interception that enforces a default-deny tool allowlist and filters `tools/list` responses. Checked September 2026.
- **[Promptfoo](https://github.com/promptfoo/promptfoo):** Open-source LLM testing and red teaming framework. Includes an MCP proxy mode for intercepting tool calls. OpenAI announced plans to acquire Promptfoo in March 2026 (pending closing). Primary focus is evaluation and red teaming rather than inline blocking.

The core question for any runtime tool: does it inspect content or just control access? Domain allowlisting stops requests to unapproved servers but won't catch a credential leaked to an approved domain.

## Gateways

Gateways focus on routing, discovery, and access control for MCP servers. They decide which agents can reach which tools and manage the connection lifecycle.

**What they handle:** Tool discovery (agents find available servers through the gateway), access control (per-agent or per-team permissions), connection management (transport bridging between stdio and HTTP), and routing (multiple MCP servers behind one endpoint).

**What they miss:** Content-level threats, unless the gateway adds its own scanners. A gateway that only routes traffic to an MCP server doesn't inspect whether the tool arguments contain leaked credentials or whether the response contains injection. Access control says "this agent can use this tool." Content inspection says "this specific tool call is safe."

**Examples:**

- **[Docker MCP Gateway](https://github.com/docker/mcp-gateway):** Manages containerized MCP servers. Provides tool-level access control and transport bridging. Agents connect to the gateway, which routes to the appropriate container. Focuses on isolation and management rather than content scanning.
- **[Runlayer](https://www.runlayer.com/):** AI control plane with access control, a registry of MCP servers, and hosting for custom ones. Unlike a routing-only gateway, its [ToolGuard](https://docs.runlayer.com/runlayer-toolguard) scanners also check tool definitions, inputs, and outputs. Runs as a Runlayer-hosted deployment or [self-hosted](https://docs.runlayer.com/deployment/overview) on AWS ECS with Terraform or on Kubernetes (docs checked 2026-10-14).
- **[agentgateway](https://github.com/agentgateway/agentgateway) (Solo.io/Linux Foundation):** Open-source gateway for A2A (agent-to-agent) and MCP traffic. Focuses on routing, authentication, and observability across multiple agent protocols.

Gateways and firewalls are complementary. The gateway controls who can talk to what. The firewall controls what's allowed in the conversation. Large deployments often run both.

## Governance platforms

Governance platforms operate at the organizational level. They discover agents running across teams, enforce centralized policies, and produce compliance reports.

**What they handle:** Agent discovery (finding every agent and MCP server in the organization), policy enforcement (centralized rules for what agents can do), compliance reporting (mapping agent activity to frameworks like SOC 2, NIST, EU AI Act), and risk scoring.

**What they miss:** Packet-level inspection. Governance platforms set policy. Enforcement still requires runtime tools (firewalls, proxies, gateways) that actually sit in the traffic path. A policy that says "no credential exfiltration" needs a DLP scanner to enforce it.

**Examples:**

- **[Zenity](https://zenity.io/):** Agent security governance. Discovers agents, assesses risks, enforces policies. Backed by $38M Series B.

Governance matters when you have dozens of teams running hundreds of agents. If you have three agents, start with runtime controls. Add governance when the management problem outgrows spreadsheets.

## How to choose

| If you need... | Start with... | Examples |
|----------------|--------------|---------|
| Pre-deploy config checking | Scanner | mcp-scanner, mcp-scan |
| Credential leak prevention | Runtime firewall with DLP | Pipelock |
| Prompt injection blocking | Runtime firewall with injection scanning | Pipelock, inference guardrails |
| MCP tool access control | Gateway | Docker MCP Gateway, agentgateway |
| Domain-level egress control | Proxy with allowlists | Pipelock, iron-proxy |
| Multi-team agent management | Governance platform | Zenity, Noma |
| Compliance evidence | Firewall with audit logging + governance | Pipelock (flight recorder), Zenity |
| Red teaming and evaluation | Testing framework | Promptfoo |

For a single team running agents with network access: start with a runtime firewall (covers the widest attack surface with the least integration), add a scanner in CI, and add governance when the fleet grows.

For an enterprise with many teams: start with governance to get visibility, then deploy runtime firewalls per-team to enforce the policies.

## Further reading

- [Best AI Agent Security Tools 2026](/blog/best-ai-agent-security-tools-2026/): 25 options mapped by security boundary, with strengths, trade-offs, and a decision framework
- [AI Agent Security](/learn/ai-agent-security/): the three security layers explained
- [AI Runtime Security](/learn/ai-runtime-security/): model, agent, and infrastructure runtime controls by layer
- [Generative AI Firewall](/learn/generative-ai-firewall/): the adjacent vendor category for prompt, completion, and agent traffic inspection
- [MCP Security Tools](/learn/mcp-security-tools/): focused comparison of MCP-specific tools
- [MCP Proxy](/learn/mcp-proxy/): how Pipelock's MCP scanning proxy works
- [What is an Agent Firewall?](/agent-firewall/): the egress inspection architecture
- [Pipelock](/pipelock/): open-source agent firewall with DLP, injection scanning, and egress control
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
