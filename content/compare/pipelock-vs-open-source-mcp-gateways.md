---
title: "Pipelock vs Open Source MCP Gateways"
linkTitle: "Pipelock vs Open Source MCP Gateways"
subtitle: "Routing gateways centralize auth and multi-server policy, and several now add guardrails. Pipelock adds payload inspection on routed traffic and optional signed receipts."
description: "Open source MCP gateway comparison: Docker MCP Gateway, agentgateway, Lasso, and Obot versus Pipelock's scanning proxy and agent firewall."
date: 2026-04-18
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "Open source MCP gateways"
  subject_job: "One entry point in front of many MCP servers: routing, authentication, tool-level access control, and increasingly a guardrail hook."
  subject_boundary: "MCP transport, between clients and a fleet of servers"
  subject_source: "Open source: Docker MCP Gateway (MIT), agentgateway (Apache-2.0), Obot (MIT), Lasso MCP Gateway (see its repository)"
  subject_pricing: "Free to run; some projects sell hosted or enterprise editions"
  subject_deploy: "Container, binary, or Python package depending on the project"
  pick_subject: "You front many MCP servers and need centralized auth, routing, and tool-level access policy before anything else."
  pick_pipelock: "You need to read the tool descriptions, arguments, and responses for poisoning, leaks, and injection, cover HTTP and WebSocket too, and keep a signed record."
  pick_both: "Put the gateway in front for identity and routing. Put Pipelock on the wire for inspection and receipts. Each layer stops a failure the other cannot see."
sources:
  - label: "docker/mcp-gateway README"
    url: "https://github.com/docker/mcp-gateway"
    checked: 2026-09-01
  - label: "agentgateway README"
    url: "https://github.com/agentgateway/agentgateway"
    checked: 2026-09-01
    note: "a Linux Foundation project; v1.5.0 released August 2026"
  - label: "agentgateway docs index (prompt guards, MCP guardrails, MCP authorization)"
    url: "https://agentgateway.dev/docs/standalone/latest/documentation/llms.txt"
    checked: 2026-10-22
  - label: "lasso-security/mcp-gateway README"
    url: "https://github.com/lasso-security/mcp-gateway"
    checked: 2026-09-01
  - label: "Obot documentation"
    url: "https://docs.obot.ai/"
    checked: 2026-09-01
  - label: "obot-platform/obot LICENSE"
    url: "https://github.com/obot-platform/obot/blob/main/LICENSE"
    checked: 2026-09-01
faq:
  - q: "What is the best open source MCP gateway?"
    a: "The right gateway depends on the job. Docker MCP Gateway provides container isolation and local Docker workflows. agentgateway provides routing, auth, CEL-based authorization, prompt guards, and an MCP guardrail hook. Lasso's gateway lists guardrail plugins and a server scanner. Obot bundles an MCP gateway into a governance platform with request and response filters. If you need payload inspection across MCP, HTTP, and WebSocket, route that traffic through Pipelock and configure signed receipts where you need them."
  - q: "Is Pipelock an open source MCP gateway?"
    a: "Not in the routing sense. Pipelock is an open-source agent firewall and MCP proxy. It wraps a server or an MCP HTTP upstream, scans mediated tool descriptions, arguments, and responses, covers routed HTTP and WebSocket egress, and can emit signed receipts when a signing key is configured. It complements gateways rather than replacing their routing and access-control role."
  - q: "Do I need an MCP gateway or an MCP proxy?"
    a: "If you need to route across many servers, centralize auth, or apply tool-level access rules, start with a gateway. If you need to inspect what is inside tool descriptions, arguments, and responses, add a scanning proxy. A deployment that cares about both access control and payload content needs both."
---

## The short version

Open source MCP gateways handle routing, access control, and multi-server policy. Pipelock inspects what flows through its mediated connection and can record its decision. So this is Pipelock next to gateways rather than Pipelock versus gateways.

The honest change since this page was first written: two of the gateways below now document content guardrails of their own. agentgateway ships prompt guards (regex and built-in PII detectors, plus OpenAI moderation, AWS Bedrock Guardrails, Azure AI Content Safety, and Google Model Armor integrations) and an external-policy MCP guardrail hook. Obot documents inspect, reject, and modify filters on MCP requests and responses. That narrows the gap on "content inspection: yes or no". It doesn't change the depth: none of them document tool-description fingerprinting, rug-pull drift detection, encoding-aware DLP across HTTP and WebSocket, or signed offline-verifiable receipts.

For the category definitions, see the [MCP gateway](/learn/mcp-gateway/) and [MCP proxy](/learn/mcp-proxy/) guides.

## Open source MCP gateway comparison

| Product | Primary job | Content inspection | Auth and access control | Suited for |
|---|---|---|---|---|
| **[Docker MCP Gateway](https://github.com/docker/mcp-gateway)** | Containerized MCP gateway with catalog and profiles | Secret blocking on by default; no injection or drift scanning documented | OAuth handling, gateway policy | Teams standardizing on Docker for MCP |
| **[agentgateway](https://github.com/agentgateway/agentgateway)** | Routing and policy for LLM, MCP, and A2A traffic; Linux Foundation project | Prompt guards (regex, PII, moderation services); MCP guardrails via an external policy server | JWT, API keys, OAuth; CEL-based RBAC and MCP authorization | Teams that want Envoy-style routing and telemetry |
| **[Lasso MCP Gateway](https://github.com/lasso-security/mcp-gateway)** | Security-first Python gateway | Guardrail plugins: PII masking, token masking, prompt injection, harmful content; server reputation and tool-description scanner | Simpler than infrastructure gateways | Teams focused on masking and injection with light setup |
| **[Obot](https://docs.obot.ai/)** | MCP and LLM gateways inside a governance platform | Inspect, reject, or modify MCP requests and responses with MCP or webhook filters | Identity-provider groups, scoped credentials, audit logs | Teams that want routing, auth, and a broader internal platform |
| **[Pipelock](/pipelock/)** | Scanning proxy and agent firewall | Encoding-aware DLP, injection normalization, tool fingerprinting and drift, A2A, across mediated MCP, HTTP, and WebSocket | Tool policy via config; not multi-server RBAC | Teams that need inspection plus signed evidence |

Four of these are gateways in the routing sense. Pipelock is the inspection layer that complements them.

## Where the gateways are stronger

**Multi-server routing.** One address, one policy surface, many backends. The gateway decides which server serves which tool call.

**Authentication and access control.** agentgateway centralizes JWT, API keys, and OAuth and applies CEL-based rules to which tools, prompts, and resources a client can reach. Obot scopes access by identity-provider group and issues scoped credentials.

**Catalog and platform workflows.** Docker and Obot both manage a fleet of servers as a platform problem, with catalogs and shared configuration.

**Shared control plane.** A central team can roll out auth, policy, rate limits, and observability across many agents and many servers at once.

If your main problem is "how do I manage many MCP servers safely", start with a gateway.

## Where Pipelock is stronger

**Tool description scanning and drift.** Pipelock reads descriptions, parameter descriptions, and schemas on its mediated MCP path, which is where [tool poisoning](/learn/mcp-tool-poisoning/) lives, and fingerprints them so a mid-session change is caught.

**Argument DLP with encoding awareness.** Mediated tool arguments are checked for credentials after base64, hex, and URL decoding, using the same engine that scans mediated HTTP bodies.

**Response inspection through normalization.** Mediated responses are scanned before they re-enter the agent's context, with normalization passes that catch obfuscated injection.

**HTTP and WebSocket coverage.** Pipelock also scans HTTP and WebSocket egress routed through it, in addition to MCP.

**Signed evidence.** With a signing key configured, the [flight recorder](/learn/flight-recorder/) can emit signed receipts for mediated decisions. The verifier checks them offline against a key the operator holds.

If your main problem is "how do I stop poisoned tools, leaked credentials, and injected responses in live traffic, and prove it", start with Pipelock.

## MCP gateway vs MCP proxy

| | MCP gateway | MCP proxy |
|---|---|---|
| Primary job | Routing, auth, access control | Content inspection |
| Scale model | One gateway in front of many servers | Usually one wrapper per server or upstream |
| What it reads | Server identity, policy metadata, and increasingly a guardrail verdict | JSON-RPC payload contents |
| Main failure it stops | Unauthorized or misrouted tool access | Poisoned descriptions, leaked credentials, injected responses |
| Examples | Docker MCP Gateway, agentgateway, Obot | Pipelock MCP proxy |

## Recommended deployment patterns

**One MCP server, high sensitivity.** Start with Pipelock. The risk is in what the server returns, not in routing.

**Many servers, shared identity and policy.** Start with a gateway. Centralized auth and routing come first.

**Production with sensitive data.** Run both. Gateway in front for routing and access control; Pipelock on the traffic path for inspection and receipts.

**Developer laptops on Docker Desktop.** Docker MCP Gateway provides a local Docker workflow for centralizing servers. Add Pipelock when you need inspection as well as isolation.

## When to use both

```text
Agent -> MCP gateway -> Pipelock MCP proxy -> MCP server
```

The gateway answers which agent this is, which server and tool it may reach, and what quota applies. Pipelock answers whether the tool description is safe to show the model, whether the arguments leak credentials, whether the response tries to inject instructions, and records the answer.

"Gateway versus proxy" is usually the wrong buying question. The better one is which layer you're missing today.

## Further reading

- [Pipelock vs Docker MCP Gateway](/compare/pipelock-vs-docker-mcp-gateway/): the closest gateway comparison in depth
- [MCP gateway](/learn/mcp-gateway/): the broader market view, including commercial gateways
- [MCP proxy](/learn/mcp-proxy/): how scanning proxies work at runtime
- [MCP security tools](/learn/mcp-security-tools/): scanners, proxies, and gateways in one taxonomy
- [Pipelock](/pipelock/): product overview and deployment modes
