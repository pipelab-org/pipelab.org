---
title: "Pipelock vs Envoy AI Gateway"
linkTitle: "Pipelock vs Envoy AI Gateway"
seoTitle: "Pipelock vs Envoy AI Gateway: MCP and LLM Gateway"
subtitle: "An Envoy Gateway extension that fronts LLM APIs and multiplexes MCP servers, next to an agent firewall that inspects payloads and signs receipts."
description: "Compare Pipelock with Envoy AI Gateway, the Envoy extension for LLM routing and MCP multiplexing with OAuth and CEL rules. Routing versus inspection."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "Envoy AI Gateway"
  subject_job: "Envoy Gateway extension that routes LLM API traffic and aggregates MCP servers behind one endpoint, with OAuth, JWT and CEL access control, tool filtering, and upstream API key injection."
  subject_boundary: "Kubernetes ingress and egress path, on Envoy"
  subject_source: "Open source, Apache-2.0; now Agent Router, an Agentic AI Foundation project"
  subject_pricing: "Free"
  subject_deploy: "Kubernetes with Envoy Gateway, Helm, or the standalone CLI"
  pick_subject: "You run Envoy Gateway already and want LLM routing and an MCP gateway with OAuth, tool filtering, and CEL rules inside that data plane."
  pick_pipelock: "You need what crosses the wire inspected and signed: encoding-aware DLP, injection normalization, tool-description drift, SSRF, and offline-verifiable receipts, on every connection the deployment routes through it."
  pick_both: "Envoy AI Gateway for platform-level routing and access. Pipelock next to the agent for payload inspection and evidence."
sources:
  - label: "Agent Router README (formerly Envoy AI Gateway)"
    url: "https://github.com/theagentrouter/agent-router"
    checked: 2026-10-22
    note: "README confirms the rename from Envoy AI Gateway to Agent Router, with the same code, maintainers, and Apache-2.0 license"
  - label: "Agent Router docs: MCP gateway capabilities"
    url: "https://theagentrouter.ai/docs/capabilities/mcp/"
    checked: 2026-10-22
    note: "server multiplexing, tool filtering, OAuth authentication, JWT claims, scopes, and CEL authorization, upstream API key injection"
  - label: "Agent Router releases"
    url: "https://github.com/theagentrouter/agent-router/releases"
    checked: 2026-10-22
    note: "v1.2.0, published October 7, 2026, was the newest release at the time of checking"
faq:
  - q: "What's the difference between Pipelock and Envoy AI Gateway?"
    a: "Envoy AI Gateway is an extension to Envoy Gateway that routes LLM API calls and aggregates MCP servers behind one endpoint with OAuth, JWT, and CEL access control. Pipelock is an agent firewall that inspects the content of HTTP, WebSocket, and MCP traffic routed through it and can emit signed receipts when a signing key is configured. One is platform routing and access control. The other is payload inspection and evidence."
  - q: "Does Envoy AI Gateway scan tool descriptions or responses?"
    a: "Its MCP docs describe aggregating servers, filtering which tools are exposed, authenticating clients, and applying CEL rules. Content scanning of tool descriptions, arguments, or responses, drift detection, and signed receipts are not documented."
  - q: "Can I use both?"
    a: "Yes. Envoy AI Gateway can front the MCP servers and models at the platform edge while Pipelock wraps the agent's egress or the MCP upstreams for inspection and receipts."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It inspects HTTP, WebSocket, and MCP traffic routed through it on the agent's network path for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured.

**[Envoy AI Gateway, now Agent Router](https://github.com/theagentrouter/agent-router)** is an Apache-2.0 extension to Envoy Gateway. Its README confirms the rename with the same code and maintainers, under the Agentic AI Foundation. Its docs describe an LLM gateway and an MCP gateway. The MCP side aggregates multiple servers into one endpoint, filters which tools are exposed, authenticates clients with OAuth, and applies access rules from JWT claims, scopes, and CEL expressions. Upstream API keys are injected at the gateway so clients never hold them.

Envoy AI Gateway is platform routing and access control on Envoy. Pipelock is payload inspection and evidence next to the agent.

## Feature comparison

| Feature | Pipelock | Envoy AI Gateway |
|---------|----------|------------------|
| **Architecture** | Network proxy, single self-hosted Go binary | Envoy Gateway extension on Kubernetes, or a standalone CLI |
| **What it fronts** | HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP stdio and HTTP, A2A | LLM provider APIs and MCP servers over HTTP |
| **Multi-server aggregation** | One wrapper per server or upstream | Yes, with per-server tool filtering |
| **Authentication** | Not a gateway function | OAuth flows, JWT |
| **Authorization** | Tool policy via config | JWT claims, scopes, and CEL expressions |
| **Upstream credential injection** | No | Yes, API keys injected at the gateway |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware | Not documented |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization | Not documented |
| **Tool poisoning and rug-pull drift** | Fingerprinting and drift detection | Not documented |
| **SSRF protection** | Private IP, metadata, and DNS rebinding checks | Not documented |
| **Telemetry** | Prometheus, syslog, webhook | Envoy observability |
| **Signed receipts** | Yes, Ed25519, verifiable offline | Not documented |
| **License** | Apache-2.0 core; Enterprise under ELv2 | Apache-2.0 |

## Where Envoy AI Gateway is stronger

**It is Envoy.** If your platform already runs Envoy Gateway, LLM routing and an MCP gateway arrive as configuration in the data plane you operate, with Envoy's load balancing and observability.

**Aggregation and tool filtering.** Many MCP servers become one endpoint, and the tools each exposes can be included or excluded by name or pattern.

**Access control from identity.** OAuth authentication plus CEL rules over JWT claims and scopes decide who may call which tools.

**Keys stay at the gateway.** Upstream API keys are injected by the gateway, so the calling client never holds them.

## Where Pipelock is stronger

**Content inspection.** Encoding-aware DLP on bodies and tool arguments, injection normalization on responses, tool-description fingerprinting and drift detection, SSRF checks before DNS. Envoy AI Gateway's MCP docs cover routing and access, not payload scanning.

**The agent's whole path.** A container or namespace with Pipelock as its only route, or [host containment rules](/capabilities/agent-containment/) that drop direct sockets, lets Pipelock see plain HTTP and WebSocket egress from the agent, not only the model and MCP endpoints the gateway fronts. A proxy environment variable alone leaves direct connections, DNS, and alternate proxies uninspected.

**Evidence.** A signed, offline-verifiable receipt per decision.

**No Kubernetes required.** One binary on a laptop or a CI runner.

## Architecture difference

```text
Clients -> Envoy AI Gateway (auth, CEL rules, tool filter, key inject) -> LLM providers, MCP servers
Agent   -> Pipelock (inspect, decide, sign)                           -> internet, MCP servers
```

The gateway lives at the platform edge. The firewall lives next to the agent. A serious deployment can have both.

## Further reading

- [Pipelock vs agentgateway](/compare/pipelock-vs-agentgateway/): the other Apache-2.0 agent proxy with the same shape
- [Pipelock vs open source MCP gateways](/compare/pipelock-vs-open-source-mcp-gateways/): the wider gateway roundup
- [MCP gateway](/learn/mcp-gateway/): the category
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
