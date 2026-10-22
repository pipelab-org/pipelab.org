---
title: "Agent Firewall vs Guardrails"
linkTitle: "Agent Firewall vs Guardrails"
subtitle: "Different layers, different failures, complementary coverage. Guardrails check what the model intends. An agent firewall checks what the agent does."
description: "Agent firewalls and guardrails protect AI agents at different layers. Here's why guardrails alone aren't enough, where each fails, and how to use both."
date: 2026-02-24
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "concept"
compare:
  subject: "Guardrails"
  subject_job: "Check the model's inputs, outputs, and sometimes its reasoning before the agent acts. NeMo Guardrails, Guardrails AI, and LlamaFirewall are the common open-source examples."
  subject_boundary: "Inside the inference pipeline, in the same process or service as the model call"
  subject_source: "Open source: NeMo Guardrails (Apache-2.0), Guardrails AI (Apache-2.0), LlamaFirewall (MIT)"
  subject_pricing: "Free libraries; some vendors sell hosted classifiers"
  subject_deploy: "Python libraries imported into an agent you control"
  pick_subject: "You control the model pipeline and your risk is unsafe reasoning, off-topic behavior, or unsafe generated code."
  pick_pipelock: "You run agents you can't modify, or your risk is what leaves the machine: leaked credentials, poisoned tools, SSRF, injected responses."
  pick_both: "Guardrails catch bad intent before the agent acts. The firewall catches bad traffic after. Two independent chances at every attack."
sources:
  - label: "NeMo Guardrails repository (NVIDIA)"
    url: "https://github.com/NVIDIA-NeMo/Guardrails"
    checked: 2026-09-01
  - label: "Guardrails AI repository"
    url: "https://github.com/guardrails-ai/guardrails"
    checked: 2026-09-01
  - label: "LlamaFirewall in PurpleLlama (Meta)"
    url: "https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall"
    checked: 2026-09-01
  - label: "NeMo Guardrails LICENSE"
    url: "https://github.com/NVIDIA-NeMo/Guardrails/blob/develop/LICENSE.md"
    checked: 2026-09-01
    note: "Apache-2.0; the repository's GitHub licence metadata reads Other"
faq:
  - q: "What's the difference between an agent firewall and guardrails?"
    a: "Guardrails operate inside the model pipeline, checking the model's inputs, outputs, and sometimes its reasoning before it acts. An agent firewall operates at the network layer, scanning HTTP requests, WebSocket frames, and MCP tool calls after the model acts. Guardrails catch bad decisions. Agent firewalls catch bad traffic. They fail in different ways, which is why you want both."
  - q: "Can a prompt injection bypass guardrails?"
    a: "Yes. Guardrails run in the same trust boundary as the model, often using similar text processing or a similar model to detect attacks. An injection crafted to fool the model has a fair chance of fooling the guardrail too. An agent firewall sits outside that boundary and matches patterns on the wire, so an injection that fools the model still has to get its resulting request past the firewall."
  - q: "Do I need guardrails if I have an agent firewall?"
    a: "Yes, if you can deploy them. Guardrails catch unsafe intent before the agent acts. A firewall catches unsafe traffic after. Neither alone covers everything."
---

## The short version

**Guardrails** check the model's intent before it acts. They run inside the inference pipeline.

An **[agent firewall](/agent-firewall/)** checks what goes over the wire after the model acts. It runs at the network layer, outside the agent process.

Guardrails catch bad reasoning. Agent firewalls catch bad traffic. They fail in different ways. Use both.

## The trust boundary problem

Guardrails and the model share a trust boundary.

NeMo Guardrails, Guardrails AI, and LlamaFirewall are libraries you import into the application that calls the model, so they sit inside the same trust domain as that call. Where a guardrail uses a classifier model to judge input, it is processing the same text with the same kind of technique the primary model uses. A prompt injection good enough to fool the model therefore has a head start on fooling that guardrail.

An agent firewall operates outside that boundary. It sees raw HTTP requests and MCP messages. A DLP pattern doesn't care what the model was thinking. It checks whether the outbound request contains a credential. An injection pattern doesn't need to understand context. It checks whether the response is trying to override instructions.

Different layers, different techniques, different failure modes. That's defense in depth.

## How guardrails work

Guardrails intercept model interactions before they reach external systems:

```text
User input -> guardrail (check input) -> model -> guardrail (check output) -> action
```

[NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) from NVIDIA lets you define conversation rails in a custom language; the model's outputs are checked against allowed flows before they're used. [Guardrails AI](https://github.com/guardrails-ai/guardrails) validates model outputs against schemas and validators and can correct them. [LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) from Meta runs three scanners: PromptGuard classifies inputs, AlignmentCheck audits the chain of thought, and CodeShield scans generated code.

All three are Python libraries. They hook into a model pipeline you control.

## How an agent firewall works

An agent firewall intercepts network traffic after the model has decided to act:

```text
Model decides -> agent sends request -> agent firewall (scan request and response) -> external system
```

It doesn't know or care what the model was thinking. It scans mediated outbound HTTP for credential patterns, mediated inbound responses for prompt injection, MCP tool arguments for leaked secrets, tool descriptions for poisoned instructions and mid-session changes, and mediated destinations for SSRF. With a signing key configured, Pipelock can emit signed action receipts for mediated decisions.

## What guardrails catch that firewalls don't

**Unsafe reasoning.** If the model is planning to read a key file and send it somewhere, a reasoning audit can catch the intent before any request exists. A firewall only sees the result.

**Bad code generation.** CodeShield-style scanners flag generated code with known-bad patterns before it runs.

**Off-topic behavior.** Conversation rails keep a model on task. A firewall doesn't care about conversation flow.

**Output validation.** Schema and validator checks on model output are a guardrail job.

## What firewalls catch that guardrails don't

**Credential leaks on the wire.** An outbound request carrying a base64-encoded cloud key is caught by DLP. Guardrails don't scan outbound HTTP.

**MCP tool poisoning.** A server can change its tool description mid-session to instruct the agent to exfiltrate data. A firewall fingerprints descriptions and catches the change. Guardrails don't watch MCP tool descriptions.

**SSRF.** An injection can tell the agent to fetch a cloud metadata endpoint. A firewall blocks private and link-local destinations. Guardrails don't operate at the network layer.

**Post-bypass traffic.** If an injection gets past the guardrail, the resulting request still has to pass the firewall. Two independent chances to catch it.

**Closed-pipeline agents.** Claude Code, Cursor, GitHub Copilot, and most commercial agents use hosted models. You can't insert a guardrail into their pipeline. You can route their traffic through a proxy.

## The bypass problem

Guardrails have a structural bypass problem: they run in the same trust domain as the model, so an attack that fools one has a head start on the other. Their maintainers know this and keep improving classifiers, and a guardrail still catches a great deal.

Firewalls have a different bypass surface. Pattern matching misses novel phrasings. DLP regexes miss encrypted payloads. Traffic on a channel the firewall doesn't proxy is invisible to it.

The point is that those failures are independent. An injection that fools the model and the guardrail can still trip DLP when the resulting request carries a recognizable credential.

## Side-by-side

| | Guardrails | Agent firewall |
|---|---|---|
| **Where it runs** | In the model pipeline | At the network boundary |
| **What it inspects** | Model inputs, outputs, reasoning | HTTP requests and responses, WebSocket frames, MCP messages |
| **Credential scanning** | No | Yes |
| **Injection detection** | Model-based classification | Pattern matching with normalization |
| **MCP security** | No | Yes |
| **SSRF protection** | No | Yes |
| **Works with closed agents** | No, needs pipeline access | Yes, proxy-based |
| **Evidence of the decision** | Application logs | Signed receipts, in Pipelock's case |
| **Bypassed by the same injection that fooled the model** | Often | Different failure modes |

## How to use both

```text
User input -> guardrail -> model -> guardrail -> agent -> agent firewall -> external system
```

For a custom Python agent: add LlamaFirewall or NeMo Guardrails in the agent code, run Pipelock as the proxy, set the agent's proxy variable to Pipelock's listener, and wrap MCP servers with `pipelock mcp proxy`.

For commercial agents such as Claude Code or Cursor, guardrails aren't an option because you can't modify the pipeline. Pipelock at the network layer is the enforcement point you do control.

## How Pipelock fits

[Pipelock](/pipelock/) is an open-source agent firewall. It handles the network layer: DLP, injection detection, SSRF, MCP scanning, rate limiting, and signed receipts. It doesn't replace guardrails. If you can deploy guardrails, do. Pipelock handles the traffic they can't see.

## Further reading

- [What is an agent firewall?](/agent-firewall/): definition, threat coverage, and evaluation checklist
- [Pipelock vs LlamaFirewall](/compare/pipelock-vs-llamafirewall/): head-to-head with Meta's guardrail
- [Pipelock vs Lakera Guard](/compare/pipelock-vs-lakera-guard/): a commercial classifier at the model boundary
- [Pipelock vs cloud model guardrails](/compare/pipelock-vs-cloud-model-guardrails/): Bedrock Guardrails and Azure AI Content Safety at the same boundary
- [Prompt injection: network-layer defense](/learn/prompt-injection-network-defense/): how firewalls catch injection at the proxy
- [Agent firewall vs WAF](/compare/agent-firewall-vs-waf/): another commonly confused pair
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
