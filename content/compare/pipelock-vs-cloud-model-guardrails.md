---
title: "Pipelock vs Cloud Model Guardrails"
linkTitle: "Pipelock vs Cloud Model Guardrails"
seoTitle: "Pipelock vs Cloud Model Guardrails Compared"
subtitle: "Amazon Bedrock Guardrails, Azure AI Content Safety, and Google Model Armor screen what goes into and comes out of a model. Pipelock inspects what the agent does with the answer."
description: "Compare Pipelock with Bedrock Guardrails, Azure AI Content Safety, and Google Model Armor. Model screening versus agent traffic inspection and receipts."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "inference"
compare:
  subject: "Cloud model guardrails"
  subject_job: "Provider-run filters on model inputs and outputs: harmful-content categories, prompt attacks, denied topics, sensitive-information masking, malicious URLs, and grounding checks."
  subject_boundary: "The model call on Bedrock; application-invoked moderation APIs on Azure; a sanitize API on Google Cloud, also attachable to Apigee, load balancers, and Google-hosted MCP servers"
  subject_source: "Closed; managed services from AWS, Microsoft, and Google"
  subject_pricing: "Usage pricing on the provider's platform"
  subject_deploy: "Bedrock: attached to inference calls by guardrail ID and version. Azure: APIs the application calls. Google: templates and floor settings applied by the application or by an integrated Google Cloud service."
  pick_subject: "Your application calls Bedrock, Azure, or Google models and the risk you care about is what users send to the model and what it says back."
  pick_pipelock: "Your agent takes actions after the model answers, calls tools and MCP servers, and you need traffic routed through Pipelock inspected on the wire, with signed receipts configured where you need them."
  pick_both: "Guardrails on the model call. Pipelock on the agent's actions. The model boundary and the network boundary are different places."
sources:
  - label: "Amazon Bedrock Guardrails user guide"
    url: "https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html"
    checked: 2026-09-01
    note: "content filters for hate, insults, sexual, violence, misconduct, and prompt attack; denied topics; word filters; sensitive information filters that block or mask PII; contextual grounding checks"
  - label: "Azure AI Content Safety overview"
    url: "https://learn.microsoft.com/en-us/azure/ai-services/content-safety/overview"
    checked: 2026-09-01
    note: "text and image moderation, Prompt Shields, protected material detection, groundedness detection in preview"
  - label: "Google Model Armor overview"
    url: "https://docs.cloud.google.com/model-armor/overview"
    checked: 2026-09-01
    note: "screens prompts and responses; responsible AI categories, prompt injection and jailbreak detection, Sensitive Data Protection, malicious URL detection on the first 256 URLs; inspect-only and inspect-and-block enforcement; templates and floor settings"
  - label: "Google Model Armor integrations"
    url: "https://docs.cloud.google.com/model-armor/integrations"
    checked: 2026-09-01
    note: "Agent Gateway, Apigee, Gemini Enterprise, Google-hosted MCP servers, Service Extensions on load balancers, Agent Platform, LangChain"
faq:
  - q: "What's the difference between Pipelock and a cloud model guardrail?"
    a: "Bedrock Guardrails and Azure AI Content Safety filter what goes into a model and what comes out: harmful-content categories, prompt attacks, denied topics, sensitive information, grounding. Pipelock is an agent firewall on the network path that inspects HTTP, WebSocket, and MCP traffic routed through it after the model answers. With a signing key configured, it can emit signed action receipts for mediated decisions. One guards the conversation. The other inspects routed actions."
  - q: "Do cloud guardrails see MCP tool calls or HTTP egress?"
    a: "The Bedrock and Azure documents read for this page describe model inputs and outputs on their own platforms. A tool call to an MCP server, a fetch of a web page, or a POST to a third-party API does not pass through those model APIs. Pipelock can inspect that traffic when the agent routes it through Pipelock."
  - q: "Does Google Model Armor cover agent egress?"
    a: "Its overview describes a sanitize step on prompts and responses, and its integrations page lists Apigee, Google Cloud load balancers through Service Extensions, and Google-hosted MCP servers as places that can call it. Traffic can be screened when the relevant integration is configured. A tool call, HTTP fetch, or WebSocket from an agent that is not sent through one of those integrations is not covered by that integration."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It inspects HTTP, WebSocket, and MCP traffic routed through it on the agent's network path for credential leaks, prompt injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions.

**[Amazon Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)** applies configurable filters to model inputs and responses on Bedrock. Its user guide lists content filters for hate, insults, sexual content, violence, misconduct, and prompt attack, denied topics, word filters, sensitive-information filters that block or mask PII, and contextual grounding checks.

**[Azure AI Content Safety](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/overview)** is Microsoft's moderation service. Its overview lists text and image moderation, Prompt Shields for prompt protection, protected-material detection, and groundedness detection in preview.

**[Google Model Armor](https://docs.cloud.google.com/model-armor/overview)** screens prompts and responses through templates of filters and confidence thresholds. Its overview lists responsible AI categories, prompt injection and jailbreak detection, Sensitive Data Protection, and malicious URL detection on the first 256 URLs, with an inspect-only mode and an inspect-and-block mode. Its [integrations page](https://docs.cloud.google.com/model-armor/integrations) lists Apigee, load balancers through Service Extensions, Gemini Enterprise, Google-hosted MCP servers, and the Agent Platform as callers.

Bedrock Guardrails sits at the model boundary on Bedrock, applied per inference call by guardrail ID and version. Azure AI Content Safety is a set of moderation APIs the application calls on text and images, including prompts. Model Armor is a sanitize API that the application, an Apigee proxy, or a Google Cloud load balancer calls. Pipelock mediates the agent traffic that the deployment routes through it.

## Feature comparison

| Feature | Pipelock | Bedrock Guardrails | Azure AI Content Safety | Google Model Armor |
|---------|----------|--------------------|-------------------------|--------------------|
| **Enforcement point** | Mediated agent egress: HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP, A2A | Bedrock model inputs and responses, per call | Moderation APIs the application calls on text and images | Sanitize API on prompts and responses; callable from Apigee, load balancers, and Google-hosted MCP servers |
| **Harmful-content categories** | Not the focus; response scanning targets injection | Hate, insults, sexual, violence, misconduct, prompt attack | Text and image moderation categories | Hate speech, harassment, sexually explicit, dangerous content, CSAM |
| **Prompt attack detection** | Deterministic patterns with multi-pass normalization on scanned responses and tool descriptions | Prompt attack filter | Prompt Shields | Prompt injection and jailbreak detection with confidence thresholds |
| **Sensitive information** | 65 credential patterns, encoding-aware, on routed outbound traffic | PII block or mask on inputs and responses | Not the focus of the overview page | Sensitive Data Protection infoTypes, basic and advanced |
| **Denied topics and word filters** | No | Yes | Custom categories | Not on the overview page read |
| **Malicious URL detection** | Destination checks on each mediated agent request: blocklist, SSRF, DNS rebinding | Not on the guide page read | Not on the overview page read | Yes, first 256 URLs in a prompt or response |
| **Grounding checks** | No | Contextual grounding | Groundedness detection (preview) | Not on the overview page read |
| **Observe-only mode** | Audit mode and per-scanner warn actions | Not on the guide page read | Not on the overview page read | Inspect-only, logged to Cloud Logging |
| **MCP tool descriptions, arguments, responses** | Mediated MCP traffic, both directions, with drift detection | Not applicable | Not applicable | Tool calls and responses to Google-hosted MCP servers, via floor settings |
| **SSRF and private-IP blocking** | Yes | Not applicable | Not applicable | Not applicable |
| **Evidence** | Signed receipts when configured, verifiable offline | Not documented in the guide page read | Not documented in the overview page read | Cloud Logging entries |
| **Runs outside the provider** | Runs beside the agent and mediates routed traffic | Bedrock only | Azure service | Google Cloud service; the overview says it can screen apps hosted elsewhere that call the API |
| **Source and pricing** | Apache-2.0 core, free | Closed, usage pricing | Closed, usage pricing | Closed, usage pricing |

## Where the cloud guardrails are stronger

**Content categories at the model.** Hate, violence, sexual content, insults, and misconduct filters, denied topics, and word lists are model-conversation controls. Pipelock doesn't do content moderation.

**Grounding.** Bedrock's contextual grounding and Azure's groundedness detection check whether a response is supported by its sources. A network firewall has no view of that.

**A choke point you already run.** Model Armor integrates with Apigee proxies and Google Cloud load balancers through Service Extensions. Once configured, that integration can screen traffic that already passes through it. It reaches agent traffic only where the agent's traffic goes through that Google-run path.

**Little integration on the provider's platform.** Bedrock applies a guardrail to an inference call when the caller passes its ID and version; Azure exposes its checks as APIs the application calls.

## Where Pipelock is stronger

**The actions after the answer.** A tool call, an MCP interaction, a fetched page, or a POST to an API does not traverse the Bedrock or Azure model API. Pipelock inspects that traffic when it is routed through Pipelock, decodes and scans it for credentials, checks destinations for SSRF, and fingerprints tool descriptions for drift. Model Armor's listed MCP integration covers Google-hosted MCP servers; its listed integrations do not cover an agent's other MCP connections or plain HTTP and WebSocket egress unless an application sends that traffic to Model Armor.

**Portability.** It can run next to any agent whose traffic is routed through it, calling any model, on any cloud or none.

**Evidence.** With a signing key and allow-path receipt enforcement configured, Pipelock refuses to forward an allowed mediated request whose signed receipt cannot be emitted. Its signed receipts verify offline against the operator's key.

## Two boundaries

```text
User -> [cloud guardrail] -> model -> [cloud guardrail] -> agent -> [Pipelock] -> tools, MCP servers, internet
```

The guardrail protects the conversation with the model. The firewall inspects the agent traffic routed through it after the model response. Neither substitutes for the other.

## Further reading

- [Agent firewall vs guardrails](/compare/agent-firewall-vs-guardrails/): the category-level version of this comparison
- [Pipelock vs Lakera Guard](/compare/pipelock-vs-lakera-guard/): a vendor classifier at the same boundary
- [Pipelock vs Cloudflare AI Gateway](/compare/pipelock-vs-cloudflare-ai-gateway/): a hosted gateway with guardrails at the model boundary
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
