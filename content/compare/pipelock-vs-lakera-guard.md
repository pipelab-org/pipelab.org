---
title: "Pipelock vs Lakera Guard"
linkTitle: "Pipelock vs Lakera Guard"
subtitle: "Inspection of routed network traffic next to a classifier API at the model boundary, now sold by Check Point as AI Guardrails."
description: "Pipelock is an open-source agent firewall. Lakera Guard, now Check Point AI Guardrails, classifies prompts at the model boundary. Compare both."
date: 2026-04-22
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "inference"
compare:
  subject: "Lakera Guard"
  subject_job: "Classifier API at the model boundary. Screens prompts and completions for injection, jailbreaks, data leakage, unsafe tool use, and harmful content."
  subject_boundary: "Between the application and the model; the application calls the guard API per interaction"
  subject_source: "Closed source (Check Point)"
  subject_pricing: "Free tier and demo on the site; self-hosting needs an Enterprise license"
  subject_deploy: "SaaS by default; self-hosted via Helm, Docker, or air-gapped containers with an Enterprise license"
  pick_subject: "Your application is a chatbot, RAG pipeline, or copilot and the risk you care about is what goes into and comes out of the model."
  pick_pipelock: "Your agent takes actions after the model answers, and you need traffic routed through Pipelock inspected on the network path and recorded in a form an auditor can verify."
  pick_both: "Lakera screens submitted model interactions. Pipelock inspects the agent traffic routed through it after the model response."
sources:
  - label: "Lakera Guard product page"
    url: "https://www.lakera.ai/ai-agent-security"
    checked: 2026-09-01
    note: "now branded as Check Point AI Agent Security; states sub-50 ms runtime latency"
  - label: "Lakera docs: self-hosting AI Guardrails"
    url: "https://docs.lakera.ai/docs/selfhosting"
    checked: 2026-09-01
    note: "Helm, Docker, and air-gapped options; requires an AI Guardrails Enterprise license"
  - label: "Lakera docs: guard API endpoint"
    url: "https://docs.lakera.ai/docs/api/guard"
    checked: 2026-09-01
    note: "POST /v2/guard on api.lakera.ai; flagged boolean; Enforce and Detect project modes; optional breakdown and payload fields; guard/results endpoint for historical analysis; page is branded Check Point AI Guardrails"
faq:
  - q: "What's the difference between Pipelock and Lakera Guard?"
    a: "Pipelock is an open-source agent firewall that scans HTTP, WebSocket, and MCP traffic routed through it for credential leaks, injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions. Lakera Guard is a classifier API, now part of Check Point, that screens submitted model interactions. Different enforcement points, different evidence."
  - q: "Does Lakera Guard scan MCP or HTTP egress traffic?"
    a: "Its Guard API screens LLM interactions that the application submits. Its documentation recommends calling it on every interaction and tool call, and says tool definitions are screened separately. It is not an HTTP egress proxy, so a request, WebSocket, or MCP exchange reaches Lakera only when the application sends that content to its API. Pipelock can inspect those transports when they are routed through Pipelock."
  - q: "Can I use Pipelock and Lakera Guard together?"
    a: "Yes. Lakera protects the model conversation. Pipelock protects the agent's actions downstream of the model. A deployment that cares about both layers runs both."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It scans HTTP, MCP, and WebSocket traffic routed through it for credential leaks, prompt injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions. Single Go binary, self-hosted.

**[Lakera Guard](https://www.lakera.ai/ai-agent-security)** is a runtime classifier for LLM applications. Check Point acquired Lakera, and the product page now carries the AI Agent Security and AI Guardrails names. The integration shape is a call to the guard API on each model interaction: the application sends the input, optionally the model's response, and gets back verdicts for prompt injection, jailbreaks, data leakage, unsafe tool use, harmful content, and multilingual or multimodal attacks. SaaS is the default; the docs describe self-hosting via Helm, Docker, or air-gapped containers under an Enterprise license.

Pipelock inspects traffic the agent routes through it. Lakera classifies content the application sends to its API.

## Feature comparison

| Feature | Pipelock | Lakera Guard |
|---------|----------|--------------|
| **Architecture** | Network proxy, single self-hosted binary | Classifier API; SaaS with an enterprise self-hosted option |
| **Enforcement point** | Mediated agent egress: HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP | Submitted LLM interactions and tool calls |
| **HTTP egress scanning** | Mediated HTTP | Not a proxy; screens content the application submits |
| **WebSocket frame scanning** | Mediated WebSocket frames | Not a proxy; screens content the application submits |
| **MCP awareness** | Mediated tool descriptions, arguments, and responses | Screens submitted tool calls and separately submitted tool definitions; drift detection not documented |
| **Credential scanning (DLP)** | 65 built-in patterns with encoding normalization on routed traffic | Data-leakage classification on submitted content |
| **Response scanning** | {{< stat key="response_patterns" >}} built-in response-scanning patterns with multi-pass normalization on mediated responses | Model-based classifier for submitted content |
| **Tool poisoning and rug-pull detection** | Mediated tool-description scanning and drift detection | Tool-definition screening is documented; drift detection is not documented |
| **SSRF and private-IP blocking** | Mediated destination checks before DNS resolution | Not documented |
| **Latency claim** | Scan latency around a millisecond on the mediated path | "Delivering sub-50 ms runtime latency", per the product page |
| **Integration call** | None; the agent's proxy setting or host containment routes traffic through it | One POST to `/v2/guard` per interaction, returning a `flagged` boolean and an optional per-guardrail breakdown |
| **Observe-only mode** | Audit mode and per-scanner warn actions | Detect mode per project, which forces `flagged` to false while logging |
| **Per-decision evidence** | Signed receipts when configured, plus a hash-chained flight recorder; verifiable offline | Verdict in the API response; the application logs it; a results endpoint for historical analysis |
| **Compliance mappings** | Assess report: [OWASP MCP Top 10](/learn/owasp-mcp-top10/), [OWASP Agentic Top 10](/learn/owasp-agentic-top10/), [MITRE ATLAS](/learn/mitre-atlas/), [EU AI Act](/learn/eu-ai-act-compliance/), [NIST AI RMF](/learn/nist-ai-rmf/), [HIPAA Security Rule](/learn/hipaa-security-rule/), [SOC 2](/learn/soc2-trust-services-criteria/); published documentation mappings: [OWASP Agentic AI Threats and Mitigations](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/owasp-agentic-top15-mapping.md), [OWASP LLM Top 10](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/owasp-llm-top10-mapping.md), [NIST 800-53](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/compliance/nist-800-53.md) | Framework coverage page in the docs |
| **Process sandbox** | Landlock, seccomp, and network namespaces on Linux | No |
| **Source availability** | Apache-2.0 core; Enterprise under ELv2 | Closed source |
| **Self-hosted** | Yes, standard deployment | Enterprise license required |

## When to pick Pipelock

**Your threat model extends past the model call.** Agents that fetch pages, open WebSockets, or POST to APIs take actions that a classifier API sees only if the application submits those contents. A leaked cloud key in a request body does not automatically traverse that API. Pipelock scans that traffic when the agent routes it through Pipelock.

**You need MCP transport mediation.** Pipelock scans and fingerprints tool descriptions on its MCP path, then inspects arguments and responses. Lakera can screen submitted tool calls and tool definitions, but its docs do not describe MCP transport mediation or drift detection.

**You want deterministic, reproducible enforcement and offline-verifiable evidence.** Pipelock's patterns are open source, so a match is reproducible from the same input. With a signing key and allow-path receipt enforcement configured, it blocks an allowed mediated request rather than forward one whose signed receipt cannot be emitted. The shipped verifier checks signed receipts offline.

**You want to self-host the Apache-2.0 core.** Pipelock runs as a self-hosted Go binary.

## When to pick Lakera Guard

**Your application is a chatbot, RAG pipeline, or copilot.** The control point that matters is the model boundary, and one API call per interaction is a clean integration.

**You want a classifier API at the model boundary.** The Guard API supports Detect and Enforce project modes, so the application can monitor its policy before choosing a blocking response.

**You already run Check Point.** Vendor consolidation is a real consideration for a security team on that platform.

**You need sub-50 ms classification.** That's the figure on the product page for Lakera Guard.

## Architecture differences

**Lakera Guard asks:** does the submitted LLM interaction violate policy? The application can POST an interaction to `/v2/guard` before or after a model call, then choose how to handle its `flagged` verdict. In Detect mode the verdict is always false and the result is logged. The docs also tell integrators to pass system instructions as separate system-role messages so they are not flagged as prompt attacks. Content reaches the guard only when the application submits it.

**Pipelock asks:** what is moving across its mediated agent boundary, and is any of it unsafe? Routed bodies are checked for leaked credentials, mediated tool descriptions for poisoning and drift, scanned responses for injection, and SSRF is checked before DNS resolution. With a signing key configured, it can emit signed action receipts for those mediated decisions.

Lakera screens submitted model interactions. Pipelock inspects traffic routed through it after the model response. Run both when both layers matter.

## A note on evidence

Lakera returns a verdict in the API response. The application decides whether to log it and holds the record.

With a signing key configured, Pipelock can emit signed receipts for mediated decisions. Each carries the action, policy hash, decision, and a hash link to the previous receipt. With `require_receipts` enabled, a failed allow-path receipt emission blocks forwarding. The shipped verifier checks a chain offline against the deployment's public key without contacting a Pipelock service, the agent, or the application. The [action receipt format](/learn/action-receipt-spec/) is public. It's the operator's key, so it proves what the mediator decided; it doesn't make the operator independent.

## Further reading

- [Pipelock](/pipelock/): the product page
- [What is an agent firewall?](/agent-firewall/): category definition and evaluation checklist
- [Agent firewall vs guardrails](/compare/agent-firewall-vs-guardrails/): the category-level version of this comparison
- [Pipelock vs LlamaFirewall](/compare/pipelock-vs-llamafirewall/): an open-source guardrail at the same boundary
- [Pipelock vs cloud model guardrails](/compare/pipelock-vs-cloud-model-guardrails/): the provider-run filters at the same boundary
- [Action receipt spec](/learn/action-receipt-spec/): the wire format for Pipelock's signed receipts
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
