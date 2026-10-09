---
title: "Pipelock vs AWS AgentCore Gateway"
linkTitle: "Pipelock vs AWS AgentCore Gateway"
seoTitle: "Pipelock vs Amazon Bedrock AgentCore Gateway"
subtitle: "A managed AWS gateway that turns APIs, Lambda functions, and services into MCP tools with ingress and egress auth, next to a self-hosted agent firewall that inspects payloads and signs receipts."
description: "Compare Pipelock with Amazon Bedrock AgentCore Gateway, the managed endpoint that fronts MCP tools and agents with OAuth. Managed routing vs inspection."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "AgentCore Gateway"
  subject_job: "Managed AWS endpoint for agentic traffic: converts APIs, Lambda functions, and services into MCP-compatible tools, fronts other agents and HTTP services, routes model requests, and manages OAuth on the way in and the way out."
  subject_boundary: "AWS-managed endpoint between agents and the tools, agents, and models behind it"
  subject_source: "Closed source; AWS managed service"
  subject_pricing: "AWS usage pricing"
  subject_deploy: "Provisioned in an AWS account; no binary to run"
  pick_subject: "Your agents and tools live in AWS, you want APIs and Lambda functions exposed as MCP tools without writing servers, and OAuth on both sides handled for you."
  pick_pipelock: "You need payload inspection on the agent's routed path, including outside AWS, and signed records where receipt signing is configured."
  pick_both: "AgentCore Gateway fronts the AWS tools and agents. Pipelock can sit next to the agent and inspect traffic routed to it, including traffic sent to that gateway."
sources:
  - label: "Amazon Bedrock AgentCore developer guide: Gateway"
    url: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html"
    checked: 2026-09-01
    note: "routes and secures agentic traffic through one endpoint; converts APIs, Lambda, and services to MCP tools; passthrough targets including A2A; model routing; OpenAPI, Smithy, and Lambda inputs; ingress and egress authentication"
  - label: "Amazon Bedrock AgentCore developer guide: Gateway with Policy"
    url: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/use-gateway-with-policy.html"
    checked: 2026-09-01
    note: "policy evaluation on gateway tool calls, including policy session IDs for temporal policies"
faq:
  - q: "What's the difference between Pipelock and AgentCore Gateway?"
    a: "AgentCore Gateway is a managed AWS endpoint. It converts APIs, Lambda functions, and existing services into MCP tools, fronts other agents and HTTP services, routes model requests, and handles OAuth authorization on the way in and out, with a policy feature that evaluates tool calls. Pipelock is a self-hosted agent firewall that inspects the content of HTTP, WebSocket, and MCP traffic routed through it. With a signing key configured, it can emit signed action receipts for mediated decisions. One is managed plumbing and authorization in AWS. The other is inspection and evidence next to the agent."
  - q: "Does AgentCore Gateway inspect tool arguments or responses for injection and leaks?"
    a: "Its developer guide describes translation, composition, authorization, model routing, and policy evaluation. Content scanning of tool arguments or responses, tool-description drift detection, and signed offline-verifiable receipts are not described in the pages read for this comparison."
  - q: "Can I use both?"
    a: "Yes. AgentCore Gateway fronts the tools and agents inside AWS; Pipelock can run next to the agent and inspect traffic the agent routes through Pipelock, including traffic sent to that gateway."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It inspects HTTP, WebSocket, and MCP traffic routed through it on the agent's network path for credential leaks, prompt injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions. It can run beside the agent wherever the deployment routes traffic through it.

**[AgentCore Gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)** is part of Amazon Bedrock AgentCore. Its developer guide describes one endpoint that routes and secures agentic traffic. It converts APIs, Lambda functions, and existing services into MCP-compatible tools from OpenAPI, Smithy, or Lambda definitions, and fronts other agents and HTTP services as passthrough targets, including A2A. It also routes model requests across providers and manages OAuth authorization for who may call it and how it calls upstream. A policy feature evaluates tool calls at the gateway.

AgentCore Gateway is managed plumbing and authorization inside AWS. Pipelock is inspection and evidence next to the agent.

## Feature comparison

| Feature | Pipelock | AgentCore Gateway |
|---------|----------|-------------------|
| **Architecture** | Self-hosted single binary on the agent's path | Managed AWS endpoint |
| **What it fronts** | Traffic routed through it: HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP, A2A | MCP tools built from APIs, Lambda, and services; other agents and HTTP services; model providers |
| **Tool creation** | No; it inspects tools that exist | Yes, from OpenAPI, Smithy, and Lambda |
| **Authorization** | Tool policy via config | OAuth ingress and egress; policy evaluation on tool calls |
| **Model routing** | No | Yes |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware, on mediated traffic | Not described in the pages read |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization on mediated traffic | Not described in the pages read |
| **Tool poisoning and rug-pull drift** | Fingerprinting and drift detection on mediated MCP traffic | Not described in the pages read |
| **SSRF protection** | Mediated private-IP, metadata, and DNS rebinding checks | Not described in the pages read |
| **Evidence** | Signed receipts when configured, verifiable offline with the operator's key | AWS logging |
| **Runs outside AWS** | Yes | No |
| **Source and pricing** | Apache-2.0 core, free | Closed; AWS usage pricing |

## Where AgentCore Gateway is stronger

**Tool creation from what you already have.** An OpenAPI spec or a Lambda function becomes an MCP tool without writing a server.

**Managed auth on both sides.** OAuth for callers and for upstreams, run by AWS.

**One endpoint for tools, agents, and models.** Composition and model routing in the same place, with policy evaluation on the calls.

**Nothing to operate.** It is a service in your account.

## Where Pipelock is stronger

**Content inspection.** Pipelock applies encoding-aware DLP to mediated bodies and arguments, injection normalization to mediated responses, tool-description fingerprinting and drift detection to mediated MCP traffic, and SSRF checks before DNS. The AgentCore pages read describe authorization and translation, not payload scanning.

**Portability.** Pipelock runs on a laptop, a CI runner, or any cloud, and inspects the agent's whole path, not only calls to one gateway, when the deployment routes all egress through it ([containment](/capabilities/agent-containment/) or a container with the proxy as its only route).

**Evidence you hold.** With a signing key and allow-path receipt enforcement configured, Pipelock refuses to forward an allowed mediated request whose signed receipt cannot be emitted. Its verifier checks signed receipts offline against your key.

## Architecture difference

```text
Agent -> AgentCore Gateway (OAuth in, translate, policy, OAuth out) -> APIs, Lambda, agents, models
Agent -> Pipelock (inspect, decide, sign)                           -> AgentCore Gateway and everything else
```

Put the gateway in front of the AWS estate and the firewall next to the agent.

## Further reading

- [Pipelock vs agentgateway](/compare/pipelock-vs-agentgateway/): the open-source proxy with a similar shape
- [Pipelock vs Cloudflare AI Gateway](/compare/pipelock-vs-cloudflare-ai-gateway/): another hosted gateway, at the model boundary
- [Agent firewall vs agent authorization gateway](/compare/agent-firewall-vs-agent-authorization-gateway/): the concept behind the authorization rows
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
