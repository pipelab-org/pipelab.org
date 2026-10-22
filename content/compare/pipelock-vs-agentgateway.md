---
title: "Pipelock vs agentgateway"
linkTitle: "Pipelock vs agentgateway"
seoTitle: "Pipelock vs agentgateway: Agent Proxy Comparison"
subtitle: "A Linux Foundation data plane for LLM, MCP, and A2A traffic next to an agent firewall that inspects payloads and signs receipts. Routing and authorization versus content and evidence."
description: "Compare Pipelock with agentgateway, the Linux Foundation proxy for LLM, MCP, and A2A traffic. Routing and CEL authorization versus inspection and receipts."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "agentgateway"
  subject_job: "Proxy and control point for agent traffic: routes LLM, MCP, A2A, and plain HTTP through one gateway with authentication, CEL-based authorization, tool filtering, prompt guards, and telemetry."
  subject_boundary: "Network path, between agents and the models, MCP servers, and services they call"
  subject_source: "Open source, Apache-2.0; a Linux Foundation project"
  subject_pricing: "Free"
  subject_deploy: "Standalone binary or Kubernetes; Rust data plane"
  pick_subject: "You front many MCP servers, models, and agents and need one place for auth, routing, tool-level access rules, and rate limits, with guardrail hooks you can wire to a moderation service."
  pick_pipelock: "You need routed payloads inspected: encoding-aware DLP, injection normalization, tool-description fingerprinting and drift, SSRF checks, and signed receipts configured where you need them, across HTTP and WebSocket too."
  pick_both: "agentgateway in front for identity, routing, and tool access. Pipelock on the wire for inspection and receipts. They are built for different halves of the problem."
sources:
  - label: "agentgateway README"
    url: "https://github.com/agentgateway/agentgateway"
    checked: 2026-09-01
    note: "Apache-2.0; states it is a Linux Foundation project; lists guardrails, auth, CEL RBAC, rate limiting, OpenTelemetry"
  - label: "agentgateway standalone docs"
    url: "https://agentgateway.dev/docs/standalone/latest/"
    checked: 2026-10-22
    note: "LLM gateway, MCP gateway, A2A gateway, non-agentic HTTP, security and observability"
  - label: "agentgateway docs index (prompt guards, MCP guardrails, MCP authorization)"
    url: "https://agentgateway.dev/docs/standalone/latest/documentation/llms.txt"
    checked: 2026-10-22
  - label: "agentgateway releases"
    url: "https://github.com/agentgateway/agentgateway/releases"
    checked: 2026-09-01
    note: "v1.5.0 from August 2026 was the newest release at the time of checking"
faq:
  - q: "What's the difference between Pipelock and agentgateway?"
    a: "agentgateway is a proxy for agent traffic that centralizes routing, authentication, CEL-based authorization, tool filtering, and guardrail hooks for LLM, MCP, and A2A calls. Pipelock is an agent firewall that inspects the content of HTTP, WebSocket, and MCP traffic routed through it for credential leaks, injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions. One governs access and routing. The other inspects payloads."
  - q: "Does agentgateway inspect content?"
    a: "Its docs describe prompt guards built from regex patterns and built-in PII detectors, integrations with OpenAI moderation, AWS Bedrock Guardrails, Azure AI Content Safety, and Google Model Armor, and an MCP guardrail hook that sends method calls to an external policy server. Encoding-aware DLP, injection normalization passes, tool-description fingerprinting, rug-pull drift detection, and signed receipts are not documented."
  - q: "Can I run Pipelock behind agentgateway?"
    a: "Yes. Put agentgateway in front as the identity and routing layer and wrap the MCP upstreams or the agent's egress with Pipelock for payload inspection and receipts."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It sits on the agent's routed network path and inspects HTTP, WebSocket, and MCP traffic for credential leaks, prompt injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions.

**[agentgateway](https://github.com/agentgateway/agentgateway)** is an open-source proxy for agent traffic, hosted by the Linux Foundation and licensed Apache-2.0. Its docs describe one data plane for LLM inference, MCP tool servers, A2A agent traffic, and ordinary HTTP, with JWT, API-key, and OAuth authentication, CEL-based authorization down to individual tools, prompts, and resources, rate limiting, and OpenTelemetry. On the content side it ships prompt guards (regex filters and built-in PII detectors, plus hooks to moderation services) and an MCP guardrail hook that hands method calls to an external policy server.

agentgateway answers who may reach what, and routes it. Pipelock answers what is inside the traffic, and proves the answer. The two overlap at the guardrail edge and diverge everywhere else.

## Feature comparison

| Feature | Pipelock | agentgateway |
|---------|----------|--------------|
| **Architecture** | Network proxy, single self-hosted Go binary | Rust proxy, standalone or on Kubernetes |
| **What it fronts** | HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP stdio and HTTP, A2A | LLM APIs, MCP servers, A2A agents, plain HTTP |
| **Authentication** | Not a gateway function | JWT, API keys, OAuth, OIDC browser flows |
| **Authorization** | Tool policy via config | CEL-based RBAC and MCP authorization per tool, prompt, and resource |
| **Multi-server routing** | One wrapper per server or upstream | Aggregates many MCP servers behind one endpoint |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware, environment leak detection | Regex filters and built-in PII detectors in prompt guards |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization on scanned responses | Moderation-service integrations and custom webhooks |
| **Tool poisoning and rug-pull drift** | Fingerprinting and drift detection | Not documented |
| **SSRF protection** | Private IP, metadata, and DNS rebinding checks | Not documented |
| **MCP guardrail hook** | Built in | External policy server via the MCP guardrails feature |
| **Rate limiting** | Per domain, and per agent on Pro | Yes |
| **Telemetry** | Prometheus metrics, syslog, webhook | OpenTelemetry metrics, logs, and traces |
| **Signed receipts** | Yes, Ed25519, verifiable offline | Not documented |
| **License** | Apache-2.0 core; Enterprise under ELv2 | Apache-2.0 |

## Where agentgateway is stronger

**One control point for many upstreams.** It fronts models, tool servers, and agents behind one endpoint with one auth and authorization model. Pipelock wraps one upstream at a time.

**Identity and fine-grained authorization.** JWT claims, scopes, and CEL expressions decide which tools, prompts, and resources a client may reach. Pipelock's tool policy is config, not identity-aware RBAC.

**Guardrail plumbing.** Prompt guards chain regex, PII detection, and moderation services, and the MCP guardrail hook lets an external policy server gate or mutate method calls. If you already run a moderation service, agentgateway wires it in.

**Kubernetes-native operation.** Gateway API integration, Helm, and OpenTelemetry fit an existing platform team.

## Where Pipelock is stronger

**Inspection depth.** Encoding-aware DLP across URLs, headers, bodies, and tool arguments; injection normalization passes on responses; tool-description fingerprinting and drift detection; SSRF checks before DNS resolution. agentgateway's documented content controls are regex, PII detectors, and calls to moderation services.

**Coverage beyond the gateway's upstreams.** Pipelock sees the agent's HTTP and WebSocket egress, not only the model, tool, and agent endpoints registered with the gateway.

**Evidence.** With a signing key configured, Pipelock can emit signed receipts for mediated decisions. The verifier checks them offline against the operator's key. agentgateway emits telemetry.

**Fail-closed mediation.** A timeout or parse failure on a Pipelock-mediated path blocks the request and the block is receipted.

## Architecture difference

```text
Agent -> agentgateway (auth, route, filter, guard hook) -> models, MCP servers, other agents
Agent -> Pipelock (inspect, decide, sign)              -> internet, MCP servers
```

Run them in series when both matter: agentgateway decides who reaches what; Pipelock reads what crosses its mediated path and can emit signed receipts when a signing key is configured.

## Further reading

- [Pipelock vs open source MCP gateways](/compare/pipelock-vs-open-source-mcp-gateways/): agentgateway alongside Docker, Lasso, and Obot
- [Pipelock vs Envoy AI Gateway](/compare/pipelock-vs-envoy-ai-gateway/): the Envoy-based gateway with the same shape
- [Agent firewall vs agent authorization gateway](/compare/agent-firewall-vs-agent-authorization-gateway/): the concept behind the authorization rows
- [MCP gateway](/learn/mcp-gateway/): the category
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
