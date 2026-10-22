---
title: "Pipelock vs Cloudflare AI Gateway"
linkTitle: "Pipelock vs Cloudflare AI Gateway"
seoTitle: "Cloudflare AI Gateway vs Pipelock Comparison"
subtitle: "A self-hosted agent firewall on the agent's network path, next to a hosted gateway in front of the LLM API. Different boundaries, different evidence."
description: "Pipelock is an open-source agent firewall. Cloudflare AI Gateway is a hosted caching, analytics, and guardrail layer for LLM calls. Compare both."
date: 2026-05-04
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "Cloudflare AI Gateway"
  subject_job: "Hosted gateway in front of LLM providers. Caching, rate limiting, retries and fallback, cost analytics, and guardrails on prompts and completions."
  subject_boundary: "Cloudflare's edge, between the application and the model API"
  subject_source: "Closed source, hosted service"
  subject_pricing: "Available on all Cloudflare plans; limits vary by plan and feature"
  subject_deploy: "Hosted only; the application points its SDK at the gateway URL"
  pick_subject: "Your application is a chatbot, RAG pipeline, or copilot and the control point that matters is what goes into and comes out of the model API."
  pick_pipelock: "Your agent calls tools, MCP servers, webhooks, or arbitrary HTTP, and you need inspection and a signed record for traffic routed through Pipelock, which never passes through the model API."
  pick_both: "Cloudflare watches the model conversation and your token bill. Pipelock inspects the agent traffic routed through it, including the model call."
sources:
  - label: "Cloudflare AI Gateway documentation"
    url: "https://developers.cloudflare.com/ai-gateway/"
    checked: 2026-09-01
  - label: "Cloudflare AI Gateway: Guardrails"
    url: "https://developers.cloudflare.com/ai-gateway/features/guardrails/"
    checked: 2026-09-01
    note: "Guardrails and Data Loss Prevention are labelled beta in the docs navigation"
faq:
  - q: "What's the difference between Pipelock and Cloudflare AI Gateway?"
    a: "Pipelock runs on the agent's side and scans HTTP, WebSocket, and MCP egress routed through it for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed receipts when a signing key is configured. Cloudflare AI Gateway sits at Cloudflare's edge between an application and the LLM provider and adds caching, rate limiting, retries, cost analytics, and guardrails on prompts and completions. One covers the routed agent traffic. The other covers the model API conversation."
  - q: "Does Cloudflare AI Gateway scan MCP traffic or arbitrary HTTP egress?"
    a: "Its documented surface is the model-provider path: requests to supported LLM providers routed through the gateway URL. MCP tool calls, webhooks, and HTTP requests to non-model services don't traverse it. Pipelock scans those paths when they are routed through it."
  - q: "Can I run Pipelock and Cloudflare AI Gateway together?"
    a: "Yes. Point the agent's model SDK at the gateway for caching, analytics, and guardrails, and route the agent's network traffic through Pipelock for inspection and receipts. They enforce at different boundaries."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It scans HTTP, WebSocket, and MCP traffic routed through it for credential leaks, prompt injection, SSRF, and tool poisoning and can emit signed action receipts for mediated decisions when a signing key is configured. Single Go binary, self-hosted.

**[Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)** is a hosted gateway between an application and its LLM providers. The integration is a base URL change: the application calls the gateway endpoint instead of the provider directly, and Cloudflare relays the request upstream. The gateway adds caching, rate limiting, retries and provider fallback, analytics on token usage and cost, and two beta features, Guardrails and Data Loss Prevention, that inspect prompts and completions. It supports Workers AI, Anthropic, Google Gemini, OpenAI, Replicate, and other providers, and is available on all Cloudflare plans.

Pipelock inspects what the agent process sends and receives over the network when that traffic is routed through it. Cloudflare AI Gateway inspects what the application sends to and receives from the model API.

## Feature comparison

| Feature | Pipelock | Cloudflare AI Gateway |
|---------|----------|------------------------|
| **Architecture** | Network proxy, single self-hosted binary | Hosted gateway at Cloudflare's edge |
| **Enforcement point** | Agent egress: HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP stdio, MCP HTTP | Model API boundary: prompts in, completions out |
| **Non-LLM HTTP egress scanning** | Yes | No |
| **WebSocket frame scanning** | Yes, both directions | Not documented for arbitrary endpoints |
| **MCP awareness** | Tool descriptions, arguments, and responses, both directions | Not documented |
| **Credential scanning (DLP)** | 65 built-in patterns with encoding normalization | DLP profiles on prompts and completions (beta) |
| **Prompt injection and harmful content** | Deterministic patterns on scanned responses, tool descriptions, and MCP responses | Guardrails flag or block harmful-content categories on prompts and responses (beta) |
| **Tool poisoning and rug-pull detection** | Yes | Not applicable, no MCP surface |
| **SSRF and private-IP blocking** | Yes, before DNS resolution | Not applicable |
| **Response caching** | No | Yes |
| **Retries and provider fallback** | No | Yes, configurable |
| **Cost analytics on token usage** | No | Yes, per provider |
| **Per-decision evidence** | Signed receipts plus a hash-chained flight recorder, verifiable offline | Gateway logs in the customer's Cloudflare account |
| **Source availability** | Apache-2.0 core; Enterprise features under ELv2 | Closed source |
| **Self-hosted** | Yes | No |

## When to pick Pipelock

**Your threat model extends past the model call.** An agent that calls MCP servers, fetches pages, opens WebSockets, or POSTs to third-party APIs is doing things a model-API gateway never sees. A leaked cloud key in a request to a logging service doesn't traverse the LLM API. Neither does a poisoned tool description. Pipelock scans the traffic the agent actually emits.

**You need MCP content awareness.** Pipelock parses MCP framing, flags poisoned tool descriptions, detects drift when a trusted tool changes mid-session, and scans arguments and responses. Cloudflare AI Gateway's documented surface doesn't extend into MCP.

**You want evidence you can verify without the vendor.** Pipelock's receipts are signed by the deployment's own key, outside the agent process, and the shipped verifier checks them offline. That's a different trust model from reading gateway logs through a vendor's dashboard. It's still the operator's key, so it proves what the mediator decided, not that the operator is honest.

**You want to run the whole stack yourself.** No hosted service, no API key to a third party, no telemetry leaving the host.

## When to pick Cloudflare AI Gateway

**Your application is a chatbot, RAG pipeline, or copilot.** The control point that matters is what enters and leaves the model. The gateway sits exactly there.

**You want one line of code to add observability.** Switch the base URL and token counts, request volumes, error rates, and per-provider cost show up in the dashboard.

**You want resilience patterns you'd otherwise build by hand.** Retries on transient errors, fallback from one provider to another, response caching, and gateway-side rate limits.

**You want a hosted, edge-distributed service.** Nothing to run; latency is your existing distance to a Cloudflare POP.

## Architecture differences

**Cloudflare AI Gateway asks:** is this model request well-formed, cacheable, within the rate limit, and free of content the guardrail policy flags? Anything outside the model-API path, meaning MCP traffic, HTTP to non-model services, arbitrary WebSocket egress, is outside the control surface.

**Pipelock asks:** what is moving across the mediated agent network boundary, and is any of it unsafe? Routed request bodies are checked for leaked credentials. Routed tool descriptions are checked for poisoning and drift. Scanned responses are checked for injection. SSRF checks run before DNS resolution. With a signing key configured, Pipelock can emit signed action receipts for mediated decisions.

Run both when you want edge-scale observability for the model bill and self-hosted enforcement for the agent's actions.

## A note on evidence

Cloudflare AI Gateway records gateway logs in the customer's account: payloads, token counts, costs, and the decisions Guardrails and DLP took. You read them through Cloudflare's dashboard and APIs.

With a signing key configured, Pipelock can emit signed action receipts for mediated decisions, containing the action, the policy hash, the decision, and a hash link to the previous receipt. The shipped verifier checks a receipt chain against the deployment's public key offline, without contacting the Pipelock service, the agent, or any application code. The [action receipt format](/learn/action-receipt-spec/) is public.

The difference is where the evidentiary anchor sits, not which product is better. For incident response and compliance work that needs records produced outside the process that acted, the signer's location matters.

## Further reading

- [Pipelock](/pipelock/): the product page
- [What is an agent firewall?](/agent-firewall/): category definition and evaluation checklist
- [Agent egress security](/learn/agent-egress-security/): why egress is the control point for agents
- [Open source AI firewall](/learn/open-source-ai-firewall/): the category Pipelock sits in
- [Action receipt spec](/learn/action-receipt-spec/): the wire format for Pipelock's signed receipts
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
