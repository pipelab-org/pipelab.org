---
title: "Pipelock vs LlamaFirewall"
linkTitle: "Pipelock vs LlamaFirewall"
subtitle: "Network-layer enforcement next to inference-layer guardrails. One watches the wire, the other watches the model."
description: "Pipelock and LlamaFirewall work at different layers. Compare Meta's inference-layer guardrail library with a network-layer agent firewall."
date: 2026-02-24
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "inference"
compare:
  subject: "LlamaFirewall"
  subject_job: "Python guardrail library from Meta's PurpleLlama. Classifies inputs (PromptGuard), audits the agent's reasoning (AlignmentCheck), and scans generated code (CodeShield)."
  subject_boundary: "Inside the inference pipeline, as a library you import"
  subject_source: "Open source, MIT"
  subject_pricing: "Free"
  subject_deploy: "pip install; needs a Python runtime and model weights for the classifier"
  pick_subject: "You build a custom Python agent, control the model pipeline, and want to catch unsafe intent or unsafe generated code before the agent acts."
  pick_pipelock: "You run agents whose pipeline you can't modify (Claude Code, Cursor, Copilot) or you need credential, MCP, and SSRF coverage on the traffic itself, with a signed record."
  pick_both: "Custom Python agent: LlamaFirewall catches bad intent, Pipelock catches bad traffic. Different failure modes, complementary coverage."
sources:
  - label: "LlamaFirewall in the PurpleLlama repository"
    url: "https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall"
    checked: 2026-09-01
  - label: "LlamaFirewall LICENSE"
    url: "https://github.com/meta-llama/PurpleLlama/blob/main/LlamaFirewall/LICENSE"
    checked: 2026-09-01
    note: "MIT; the repository-level license metadata reads Other because PurpleLlama mixes licenses"
faq:
  - q: "What's the main difference between Pipelock and LlamaFirewall?"
    a: "Pipelock operates at the network layer, scanning HTTP requests, WebSocket frames, and MCP tool calls routed through it and can emit signed receipts when a signing key is configured. LlamaFirewall operates at the inference layer, checking inputs, the model's reasoning, and generated code before the agent acts. Pipelock catches credential leaks and injection in routed traffic. LlamaFirewall catches unsafe intent. They are complementary."
  - q: "Should I use Pipelock or LlamaFirewall?"
    a: "Ideally both. If you can only pick one: LlamaFirewall if you control the model pipeline and your risk is unsafe reasoning or generated code, Pipelock if you run third-party agents you can't modify or your risk is what leaves the machine."
  - q: "Does LlamaFirewall work with Claude Code or Cursor?"
    a: "Not directly. LlamaFirewall is a Python library that hooks into a model pipeline you control. Hosted agents don't expose that pipeline. Pipelock works with any agent because it operates at the network layer and needs only a proxy setting or MCP wrapping."
---

## The short version

**[Pipelock](/pipelock/)** is a network-layer agent firewall. It scans HTTP requests, WebSocket frames, and MCP tool calls routed through it for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured. It works with any agent whose traffic you can route.

**[LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall)** is an inference-layer Python library from Meta's PurpleLlama project. It runs three scanners: PromptGuard classifies inputs with a fine-tuned model, AlignmentCheck audits the agent's chain of thought with a second model, and CodeShield runs static analysis on generated code.

They operate at different layers. One watches the wire. The other watches the model.

## Feature comparison

| Feature | Pipelock | LlamaFirewall |
|---------|----------|---------------|
| **Layer** | Network: HTTP, WebSocket, MCP proxy | Inference: Python library in the pipeline |
| **Language** | Go, single binary | Python |
| **Deployment** | Proxy, sidecar, or standalone | Library imported into your agent code |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware | No |
| **Prompt injection detection** | Deterministic patterns with normalization on scanned responses | PromptGuard classifier, model-based |
| **Chain-of-thought auditing** | No | AlignmentCheck |
| **Generated-code analysis** | No | CodeShield |
| **MCP tool scanning** | Both directions, with drift detection | No |
| **SSRF protection** | Yes | No |
| **Works with hosted agents** | Yes, proxy setting or MCP wrapping | Needs pipeline access; no hosted-agent integration documented |
| **Process sandbox** | Landlock, seccomp, and network namespaces on Linux; sandbox-exec on macOS | No |
| **Signed receipts** | Yes, Ed25519, verifiable offline | No |
| **Runtime dependencies** | None; 27 direct build dependencies | Python runtime, PyTorch, model weights |
| **License** | Apache-2.0 core; Enterprise under ELv2 | MIT |

## Where LlamaFirewall is stronger

**AlignmentCheck sees intent.** It uses a second model to audit the primary model's reasoning. If the model is planning to read a key file and send it somewhere, AlignmentCheck can catch that before anything happens. A network-layer tool only sees the result.

**PromptGuard is model-based.** A classifier can catch novel injection phrasings that a pattern set hasn't seen.

**CodeShield catches unsafe code.** Generated code with known-bad patterns gets flagged before it runs. Pipelock doesn't analyze generated code.

## Where Pipelock is stronger

**Closed-pipeline agents.** Claude Code, Cursor, GitHub Copilot, and most commercial agents run on hosted models. You can't insert a Python library into their inference chain. You can route their traffic through a proxy.

**Credential leak prevention.** Every outbound request is checked for secret patterns after decoding base64, hex, and URL encoding. LlamaFirewall has no DLP.

**MCP security.** Tool descriptions are fingerprinted and scanned for poisoning, mid-session changes are flagged, arguments and responses are inspected. LlamaFirewall doesn't speak MCP.

**SSRF protection.** Private IP ranges, cloud metadata endpoints, and link-local addresses are blocked, with DNS rebinding protection.

**Process containment.** The `pipelock sandbox` command wraps a process with Landlock, seccomp, and network namespace isolation on Linux, and sandbox-exec profiles on macOS.

**Evidence.** With a signing key configured, Pipelock can emit signed receipts for mediated decisions and verify them offline.

## Bypass surface

Both tools have limits, and they fail differently.

A classifier guardrail shares the model's trust boundary. Input designed to fool the model is processed by similar techniques in the guardrail, so a sufficiently crafted injection can pass both. AlignmentCheck depends on the auditing model being sharper than the attack, and on the reasoning it audits actually revealing intent.

Pattern-based detection misses novel phrasings, and DLP regexes miss encrypted payloads. If an agent sends data through a channel Pipelock doesn't proxy, Pipelock doesn't see it.

Those failures are independent of each other, which is the argument for running both.

## When to use each

**Start with Pipelock if** you run commercial or hosted agents, or your first risk is what leaves the machine. No Python required, no pipeline access needed.

**Use LlamaFirewall if** you build a custom Python agent, control the model pipeline, and want reasoning audits or model-based input classification.

**Use both if** you build a custom Python agent and want defense at both layers.

## Further reading

- [Pipelock vs Microsoft AGT](/compare/pipelock-vs-microsoft-agent-governance-toolkit/): an in-process governance SDK with its own audit chain
- [What is an agent firewall?](/agent-firewall/): definition and threat model
- [Agent firewall vs guardrails](/compare/agent-firewall-vs-guardrails/): the category-level version of this comparison
- [Pipelock vs Lakera Guard](/compare/pipelock-vs-lakera-guard/): a commercial classifier at the same boundary
- [MCP security](/learn/mcp-security/): tool poisoning and rug-pulls
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
