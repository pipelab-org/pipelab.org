---
title: "Cloudflare AI Gateway: Pricing, Features, Limits & Alternatives (2026)"
linkTitle: "Cloudflare AI Gateway"
seoTitle: "Cloudflare AI Gateway: Free Tier, Pricing & Limits"
subtitle: "Edge-hosted observability, caching, and content scanning for LLM API traffic, with the boundary it does not cross."
description: "Cloudflare AI Gateway pricing: caching, rate limits, analytics, and DLP are free. Guardrails are billed; log limits and charges depend on the logging plan."
date: 2026-05-05
lastmod: 2026-10-21
faq:
  - q: "What is Cloudflare AI Gateway?"
    a: "Cloudflare AI Gateway is a hosted gateway that sits between an application and one or more LLM providers at Cloudflare's edge. The application points its SDK at the gateway endpoint instead of the provider's endpoint, and Cloudflare relays the request to the upstream model. The gateway adds caching, rate limiting, request retry, model fallback, analytics on tokens and cost, plus Guardrails for harmful-content moderation and DLP profile scanning on prompts and completions."
  - q: "Which model providers does Cloudflare AI Gateway support?"
    a: "OpenAI, Anthropic, Google Gemini, Workers AI (Cloudflare's own inference), Groq, xAI, AWS Bedrock, Azure OpenAI, and Replicate, plus a few others. The gateway exposes both a unified API that doubles as an OpenAI-SDK-compatible drop-in replacement and provider-specific endpoints for each backend. Newer providers are added over time; check Cloudflare's current docs for the live list."
  - q: "Does Cloudflare AI Gateway scan MCP traffic or arbitrary HTTP egress?"
    a: "Cloudflare AI Gateway is documented as a gateway for LLM API calls. The control surface is the prompts going into the model and the completions coming out. Model Context Protocol traffic, arbitrary outbound HTTP from agents to non-LLM services, and DNS-level egress are outside the documented surface. Anything that does not traverse the LLM API at the gateway endpoint is not inspected by the gateway."
  - q: "What does Cloudflare AI Gateway's Guardrails feature do?"
    a: "Guardrails is documented as harmful-content moderation on prompts and completions across supported providers. It applies content categories and configurable actions when matched. Prompt-injection-specific detection is not a documented Guardrails feature; harmful-content moderation and prompt injection are different problem classes."
  - q: "How does Cloudflare AI Gateway compare to Pipelock?"
    a: "Different boundaries. Cloudflare AI Gateway sits at Cloudflare's edge in front of LLM API calls. Pipelock is a self-hosted agent firewall that runs on the agent's network path and scans HTTP, MCP, and WebSocket egress. Both can run in the same deployment: AI Gateway for hosted LLM-API observability and DLP, Pipelock for agent-egress enforcement and offline-verifiable evidence."
learn_cat: concepts
level: deep
tags:
  - cloudflare
  - ai-gateway
  - llm-gateway
  - pipelock
---

[Pipelock](/pipelock/) is the open-source agent firewall written for the network-egress boundary. Pipelock emits mediator-signed action receipts from outside the agent trust boundary, scanning HTTP, MCP, and WebSocket egress for credential leaks, prompt injection, SSRF, and tool poisoning. Cloudflare AI Gateway is something else, sitting at a different boundary: hosted at Cloudflare's edge, in front of LLM API calls, with caching, rate limiting, and content scanning on the prompts and completions that traverse the LLM-API surface. Both can be useful. They do not overlap as much as the marketing labels suggest.

This page covers what Cloudflare AI Gateway is, what its documented capabilities are as of May 2026, what it does not cover, and where it fits relative to a self-hosted agent firewall.

## What Cloudflare AI Gateway is

Cloudflare AI Gateway is a hosted service. The gateway endpoint follows the pattern `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}/`. Configuration is one-line on the application side: change the SDK's base URL from the provider's endpoint to the gateway endpoint, and Cloudflare relays the request to the upstream model.

Two integration shapes ship in the docs:

- **Unified API.** A single endpoint that speaks the OpenAI Chat Completions wire format. Drop-in replacement for any client written against an OpenAI-compatible SDK. Good for applications that want one auth surface across providers.
- **Provider-specific endpoints.** Per-provider routes for OpenAI, Anthropic, Google AI Studio, Workers AI, AWS Bedrock, Azure OpenAI, and others. Useful when the application needs provider-specific features that the unified surface does not expose.

Authentication has three modes documented: Cloudflare Unified Billing (provider keys held by Cloudflare and billed centrally), BYOK (bring your own provider keys, set per-request), and request headers (forward the application's auth headers untouched). The choice depends on whether the operator wants Cloudflare to handle billing or just to observe traffic.

## Documented capabilities

The gateway is built around four broad capability groups, all visible in the public docs.

**Observability and analytics.** Token counts, request volumes, error rates, and per-provider cost analytics show up in the Cloudflare dashboard with no other application changes. The gateway logs each request and response payload (subject to log retention configuration) so operators can inspect what the model received and returned.

**Caching.** The gateway can cache responses and return cached content directly without hitting the upstream provider. For repeatable prompts (FAQ-style applications, deterministic generation), this cuts model spend significantly. Cache controls live at the gateway-config level and can also be set per-request via headers.

**Resilience patterns.** Configurable retry on transient errors and provider fallback when the first provider fails. The fallback story is one of the strongest reasons teams adopt the gateway: it lets the application code stay simple while the gateway handles the failover plumbing.

**Content scanning.** Two security features are documented:

- **Guardrails.** Harmful-content moderation on prompts and completions across all providers. Content categories are configurable (the docs cover the available types and the actions a category can trigger). Real-time, applied inline.
- **Data Loss Prevention (DLP).** Configured Cloudflare DLP profiles applied to prompts and completions. The actions are flag or block, with profile configuration on the Cloudflare side.

The combination puts AI Gateway in the same broad category as a [generative AI firewall](/learn/generative-ai-firewall/), with the specific shape of "edge-hosted, LLM-API-scoped."

## What it does not cover

Cloudflare AI Gateway has a clearly defined boundary in its docs. Three classes of traffic sit outside that boundary:

**Model Context Protocol traffic.** MCP (Model Context Protocol) is the agent-to-tool surface, distinct from the LLM API surface. Tool descriptions, tool arguments, and tool responses do not traverse the gateway because the gateway is not in the agent-to-MCP-server path. If your threat model includes [tool poisoning](/learn/mcp-tool-poisoning/) or [credential leaks in tool arguments](/blog/secrets-in-post-bodies/), AI Gateway does not address them.

**Arbitrary outbound HTTP.** An agent that calls third-party APIs (logging endpoints, webhooks, CRM integrations, paste services) does not route those calls through AI Gateway. The gateway is purpose-built for LLM-API traffic; non-LLM outbound is invisible to it.

**WebSocket egress, beyond the AI-provider surface.** Cloudflare ships a WebSockets API in AI Gateway for AI-provider streaming traffic that uses WebSockets natively. Arbitrary agent WebSocket egress (a coding agent connecting to a real-time database, a chat tool, or a custom protocol) is not within scope.

**DNS-based exfiltration.** A high-effort exfil pattern where the agent encodes secrets into DNS query labels and a controlled nameserver receives them. The gateway sits at the HTTP layer; DNS does not pass through it.

These gaps are not bugs. They are design choices: the gateway is scoped to LLM-API traffic and does its job well in that scope. Buyers should plan for the gaps explicitly rather than assume the gateway covers more than it does.

## Where Pipelock fits relative to AI Gateway

Pipelock is the agent firewall on the agent side. AI Gateway is the hosted gateway on the LLM-API side. They cover different boundaries:

| Boundary | What Cloudflare AI Gateway does | What Pipelock does |
|---------|---------------------------------|----------------------|
| LLM-API request shape | Caching, rate limiting, retries, fallback, observability | Not in scope (Pipelock is not in the LLM-API call path by design) |
| Prompt and completion content (LLM-API only) | Guardrails harmful-content moderation, DLP profile scanning | Body redaction at the agent egress layer (any HTTP body, not just LLM API) |
| MCP tool calls and responses | Not covered | Bidirectional scanning, tool poisoning detection, chain detection, session binding |
| Arbitrary outbound HTTP | Not covered | Full DLP, credential pattern matching, SSRF protection |
| WebSocket frames (non-AI-provider) | Not covered | Frame-level scanning, fragment reassembly |
| Per-decision evidence | Gateway log records, application-side | Mediator-signed action receipts, offline-verifiable, chained |
| Deployment shape | Hosted (Cloudflare's edge) | Self-hosted (single Go binary; Apache-2.0 core; Enterprise features under ELv2) |

The one-line summary: **AI Gateway is for the LLM-API call. Pipelock is for everything else the agent does on the network.** Most production agent stacks need both, with each tool doing what it is best at.

The detailed product page is at [/pipelock/](/pipelock/).

## When to pick Cloudflare AI Gateway

The fit is sharpest in three cases:

**You run a chatbot, RAG pipeline, or copilot built around LLM API calls.** The gateway's whole control plane is shaped for this use case. One line of SDK config gives you observability, caching, rate limiting, and content scanning on the model traffic.

**You already run on Cloudflare.** The dashboard integration, Workers AI inference, and Cloudflare-native auth and analytics make the gateway a natural extension of an existing Cloudflare-based stack.

**Your scaling story benefits from edge distribution.** Cloudflare's global POP footprint puts the gateway close to most users by default. Latency to the gateway is the operator's existing distance to a Cloudflare edge.

## When AI Gateway alone is not enough

Three signals say "you also need an agent firewall in front of the gateway":

**Your agents call MCP servers.** AI Gateway's documented surface does not extend into MCP. A poisoned tool description, a credential in a tool argument, or a chain-of-tools exfil pattern are caught at the agent firewall layer, not the LLM-API gateway layer.

**Your agents make non-LLM HTTP requests.** Logging to a third-party service, hitting a webhook, fetching a markdown file with embedded jailbreak instructions: none of these go through AI Gateway. They go through whatever proxy the agent process is configured to use, or directly to the destination.

**Your compliance story needs evidence from outside the actor.** AI Gateway logs sit on Cloudflare's side and the application's side. Pipelock's [mediator-signed action receipts](/learn/action-receipt-spec/) are produced by the deployment's signing key, separate from the agent process. The evidentiary class is different. For audit-bearing logs and incident-response workflows, the signer location matters.

A combined deployment is the most common shape for serious agent stacks: AI Gateway in front of the LLM API for cost and observability, Pipelock on the agent's network path for egress enforcement and signed evidence.

## Pricing and limits

Per Cloudflare's [AI Gateway pricing page](https://developers.cloudflare.com/ai-gateway/reference/pricing/) (checked 2026-10-21; Cloudflare notes prices are subject to change):

- **Core features are free on all plans.** Dashboard analytics, caching, and rate limiting need only a Cloudflare account.
- **DLP scanning is free on all plans.** Accounts without a Zero Trust subscription get two predefined DLP profiles (Financial Information, and Social / Insurance / National Identifier Numbers). A Zero Trust subscription that includes DLP unlocks the full profile set, custom profiles, datasets, and OCR.
- **Guardrails are billed as Workers AI inference.** Prompts and responses are evaluated with Llama Guard on Workers AI, so cost scales with the tokens evaluated.
- **Log storage depends on account age.** Accounts that created their first gateway on or after September 24, 2026 use Workers Logs pricing and retention. Older accounts on Legacy Logs get 100,000 logs total on Workers Free and 10,000,000 logs per gateway on Workers Paid.
- **Unified Billing adds a 5% fee on purchased credits.** Provider inference rates pass through without markup.
- **Logpush exports are billed** at Logpush rates by volume exported.

## Alternatives

AI Gateway is an LLM-API gateway, so the alternatives depend on which gap you are filling:

- **Another LLM-API gateway** if you want the same shape elsewhere. See [Pipelock vs Cloudflare AI Gateway](/compare/pipelock-vs-cloudflare-ai-gateway/) for how the hosted gateway compares to a self-hosted proxy.
- **An MCP gateway** if your agents call tools. See [MCP gateway: open source vs commercial](/learn/mcp-gateway/).
- **An open-source agent firewall** if you need egress inspection on HTTP, WebSocket, and MCP traffic outside the LLM API path. See [AI firewall vs LLM firewall vs agent firewall](/learn/open-source-ai-firewall/).

## Further reading

- [Pipelock](/pipelock/): the full product page
- [What is an agent firewall?](/agent-firewall/): the category Pipelock sits in
- [Generative AI firewall](/learn/generative-ai-firewall/): the broader class AI Gateway's content-scanning features fit into
- [MCP gateway: open source vs commercial](/learn/mcp-gateway/): the gateway class for the MCP surface
- [Action receipt spec](/learn/action-receipt-spec/): the wire format for Pipelock's mediator-signed action receipts
- [Cloudflare AI Gateway documentation](https://developers.cloudflare.com/ai-gateway/): the product docs
- [Cloudflare AI Gateway product page](https://www.cloudflare.com/products/ai-gateway/)
