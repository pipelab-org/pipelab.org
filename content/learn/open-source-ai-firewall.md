---
title: "Open Source AI Firewall: Self-Hosted Agent Security"
linkTitle: "Open Source AI Firewall"
seoTitle: "Open Source AI Firewall: LLM vs Agent vs Gateway"
subtitle: "Runtime agent protection you can inspect, modify, and deploy anywhere."
description: "Open source AI firewall comparison: LLM firewall vs agent firewall vs gateway, with Pipelock, LlamaFirewall, NeMo Guardrails, and MCP tools."
date: 2026-04-11
lastmod: 2026-08-08
faq:
  - q: "What is an open source AI firewall?"
    a: "An open source AI firewall is a self-hosted security tool that sits between AI agents and the network, scanning traffic for credential leaks, prompt injection, SSRF, and tool poisoning. Because the source code is public, you can audit exactly what it scans, how it decides, and what it logs. No vendor black box."
  - q: "Why choose open source over SaaS for AI security?"
    a: "SaaS AI security tools route your agent traffic through a third party's infrastructure. That means your secrets, prompts, and tool calls pass through someone else's servers. Open source AI firewalls run on your infrastructure. You control the data, the deployment, and the update schedule. You can audit the scanning logic and verify there are no backdoors or telemetry you didn't consent to."
  - q: "What's the difference between an AI firewall and AI guardrails?"
    a: "AI guardrails operate at the inference layer, classifying prompts and completions for safety. They analyze text semantics. AI firewalls operate at the network layer, scanning actual HTTP requests, MCP tool calls, and WebSocket frames for credential leaks, injection, and SSRF. Guardrails catch unsafe model outputs. Firewalls catch unsafe agent actions on the wire. They complement each other."
learn_cat: concepts
level: intro
tags:
  - firewall
  - open-source
---
AI agents have API keys, shell access, and internet connections. When one gets compromised through prompt injection or a poisoned MCP tool, secrets leave through HTTP requests before anyone notices. An AI firewall is the enforcement point between the agent and the network. It scans the traffic it mediates: HTTP, WebSocket, and MCP, including local stdio servers run through the wrapper.

The question is whether that firewall should be a SaaS product you can't inspect, or open source software you control.

## What is an open source AI firewall?

An open source AI firewall is a self-hosted security tool that sits between AI agents and the network, scanning traffic for credential leaks, prompt injection, SSRF, and tool poisoning. Because the source code is public, you can audit exactly what it scans, how it decides, and what it logs. No vendor black box.

## LLM firewall vs agent firewall vs AI gateway: what the terms mean

Three terms get used interchangeably and aren't. Pick the one that matches the threat you actually have.

**LLM firewall.** Protects the LLM API surface itself: prompt injection screening, jailbreak detection, output classification, content moderation. Treats the model as the asset and the prompt or completion as the payload. Trylon Gateway, NeMo Guardrails, and most "AI security" products from incumbent network vendors sit here. They look at text, not network actions.

**Agent firewall.** Protects what the agent does on the network: HTTP requests, MCP tool calls, WebSocket frames, fetched content. Treats the agent's outbound actions as the asset and assumes the model can be compromised. Capability separation is the structural answer: the agent holds credentials and reasoning, the firewall holds network reach, and the two are isolated processes. Pipelock and Agent Wall sit here. They look at network actions, not just text.

**AI gateway.** Routing layer for LLM API traffic across multiple providers (rate limiting, key management, observability, sometimes caching). Cloudflare AI Gateway, Portkey, and LiteLLM sit here. Some add basic firewall-like checks, but routing is the core function, not enforcement. An AI gateway typically lives in front of the LLM provider, not in front of the agent's outbound calls to the rest of the world.

The categories overlap at the edges. The buyer's question to answer first: are you trying to protect the LLM from bad prompts, the agent from bad actions, or the LLM call from going to the wrong provider? Different problem, different category, different open-source tool.

| If you searched for... | The market usually means... | Use it when... | Open-source fit |
|---|---|---|---|
| **LLM firewall** | Prompt and completion screening before or around the model. | You expose an LLM app to user prompts and need jailbreak, moderation, or prompt-injection checks at the inference boundary. | LlamaFirewall, NeMo Guardrails, Trylon Gateway. |
| **Agent firewall** | Runtime enforcement on what an agent sends, fetches, and receives through tools and the network. | Your agent has credentials, calls MCP tools, fetches web content, or can make outbound HTTP requests. | Pipelock, Agent Wall. |
| **AI gateway** | LLM-provider routing, observability, key management, and rate limits. | You need to route model calls across providers or centralize LLM API operations. | LiteLLM, Portkey, agentgateway. |

This distinction matters because the LLM-firewall model tries to stop the hostile prompt before the model acts on it. That can help, but it is an incomplete primary boundary for agents. Pipelock takes the opposite bet: assume prompt screening can miss, then block the unsafe outbound effect. The longer version is [why Pipelock is an egress agent firewall, not an inbound WAF](/learn/egress-vs-inbound-agent-firewall/), and the WAF comparison is separate at [agent firewall vs WAF](/compare/agent-firewall-vs-waf/).

The [proof standard](/proof/) is different too. A control description is not a measurement. Pipelock publishes the [Agent Egress Bench results](/gauntlet/results/) and the [known limitations register](/learn/known-limitations/) so buyers can see both measured coverage and documented gaps instead of a vendor-only assertion.

## GitHub projects by security boundary

Open-source AI firewall searches mix several boundaries. Read GitHub projects by the control point they own, not by the label in the README.

| Project | License | Boundary | Best fit | Does not replace |
|---|---|---|---|---|
| [Pipelock](https://github.com/luckyPipewrench/pipelock) | Apache-2.0 core; Enterprise features under ELv2 | Agent egress firewall | Network-enforced HTTP, MCP, and WebSocket inspection with DLP, injection scanning, SSRF defense, signed evidence, and runtime audit. | MCP identity gateways, model-layer moderation, package-manager risk scoring. |
| [LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) | See repo | Model and prompt layer | PromptGuard, AlignmentCheck, and CodeShield-style filtering around prompts, completions, and generated code. | Agent network enforcement or MCP traffic inspection. |
| [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) | See repo | Dialog guardrails | Colang policies for conversational behavior, topical rails, and application-level flow control. | Outbound traffic inspection or runtime MCP proxying. |
| [agentgateway](https://github.com/agentgateway/agentgateway) | Apache 2.0 | Gateway and routing | MCP, A2A, and LLM routing with a central gateway process. | Content-level DLP unless paired with an inspection layer. |
| [DefenseClaw](https://github.com/cisco-ai-defense/defenseclaw) | Apache 2.0 | Application sidecar | MCP server governance and access-control workflows around agent applications. | A separate network firewall for arbitrary agent egress. |
| [Prismor](https://github.com/PrismorSec/prismor) | Apache 2.0 | Hooks and supply chain | Tool-call hooks, policy checks, package-manager wrapping, canary tokens, and session telemetry for coding agents. | Capability separation at the network boundary. |

The clean split is: guardrails decide whether text is acceptable, gateways decide where agent traffic routes, hooks decide whether a tool call should run, and an agent firewall decides what bytes may cross the network boundary.

## What counts as an AI firewall

The term gets used loosely. Three categories of tools call themselves AI firewalls or AI security layers, and they work at different points in the stack.

**Network-level inspection (proxy firewalls).** A separate process sits between the agent and the internet. All HTTP, MCP, and WebSocket traffic flows through it. The proxy scans requests and responses for credential leaks, prompt injection, SSRF attempts, and tool poisoning. Because it runs as its own process, prompt injection targeting the agent doesn't directly compromise the proxy. Full isolation requires network controls (firewall rules or container networking) that prevent the agent from bypassing the proxy or killing the process. [Pipelock](/pipelock/) and GitHub's [agent workflow firewall](https://github.com/github/gh-aw-firewall) operate here, though GitHub's tool does domain allowlisting without content scanning.

**Inference guardrails.** Libraries that classify prompts and completions at the model layer. They check whether the model's input or output is "safe" according to a policy. [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) and [LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) operate here. They don't see HTTP traffic or MCP messages. A guardrail can approve a prompt while the agent exfiltrates credentials in the next HTTP request.

**Agent-side hooks.** Code that intercepts tool calls inside the agent's runtime before execution. Claude Code's permission system and [Sage](https://github.com/gendigitalinc/sage) work this way. Hooks see tool names and arguments but not network traffic. They run inside the agent's process, which means a successful injection can potentially bypass them.

These are not interchangeable. Each layer sees different data and stops different attacks. A real security posture uses more than one. But the network layer is the hardest for an attacker to circumvent because it runs outside the agent's trust boundary.

## Why open source matters for security

A security tool you can't read is a security tool you can't trust. This applies doubly to AI firewalls because they sit on the critical path of every agent action.

**Auditability.** You can read the scanning logic, the DLP patterns, the injection detection rules, and the logging behavior. No wondering whether the vendor added telemetry in the last update or whether a "block" decision actually blocks.

**No vendor lock-in.** SaaS firewalls hold your policy configuration, your audit logs, and your integration. If the vendor raises prices, gets acquired, or shuts down, you start over. Open source tools run on your infrastructure. You own the data.

**Self-hosted by default.** Your agent traffic never leaves your network. Secrets, prompts, and tool call arguments stay on machines you control. For regulated industries, this is not optional.

**Community review.** More eyes on the scanning pipeline means bugs and bypasses get found faster. Published detection rules can be reviewed by anyone, not just the vendor's internal team.

## Open source options compared

Seven open source projects address AI agent security. They solve different problems at different layers.

| Tool | Layer | Language | Content Scanning | MCP Support | Deployment |
|------|-------|----------|-----------------|-------------|------------|
| [Pipelock](/pipelock/) | Network proxy | Go | DLP (65 patterns), injection (34 patterns), SSRF, encoding evasion (6-pass normalization) | Bidirectional (stdio, HTTP, WebSocket) with tool poisoning + rug-pull detection | Single binary, Docker, K8s companion proxy |
| [LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) | Inference | Python | PromptGuard classifier, AlignmentCheck, CodeShield | Not documented in public docs | Python library |
| [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) | Inference | Python | Colang-based dialog policy, topical control | Not documented in public docs | Python library |
| [Trylon Gateway](https://github.com/trylonai/gateway) | Gateway | Python | Self-hosted firewall for LLM apps | Gateway routing | Container |
| [Agent Wall](https://github.com/agent-wall/agent-wall) | Network | Node.js | MCP-focused security firewall | MCP-based AI agents | Library / sidecar |
| [DefenseClaw](https://github.com/cisco-ai-defense/defenseclaw) | Application sidecar | Python | Policy enforcement, access control | MCP server governance | Sidecar container |
| [agentgateway](https://github.com/agentgateway/agentgateway) | Gateway | Rust | Not documented in public docs | A2A and MCP routing | Binary, Docker |

**What this means in practice:**

- **LlamaFirewall** and **NeMo Guardrails** are inference-layer tools. They're strong at classifying unsafe model outputs but don't see network traffic.
- **Trylon Gateway** is an LLM-app firewall focused on the application layer rather than agent egress.
- **Agent Wall** is the closest peer to Pipelock on the MCP side and the most recent entrant. Both target MCP-based agents; Pipelock adds full HTTP, WebSocket, and A2A coverage plus mediator-signed action receipts.
- **DefenseClaw** governs MCP server access but is not a content-inspecting proxy.
- **agentgateway** routes agent-to-agent and agent-to-tool traffic but content scanning is not documented in public docs.

Pipelock is the only option in the table that combines content-inspecting DLP, prompt injection detection, [MCP protocol scanning](/learn/mcp-security/) (tool poisoning + rug-pull + chain detection), SSRF protection, and **mediator-signed action receipts** (cryptographic evidence per decision, with a published cross-language verifier) at the network layer. That's not a knock on the others. They solve different problems.

## Proxy vs in-process

The architectural split matters more than the feature list.

**Proxy (separate process).** The firewall runs as its own process. The agent's traffic routes through it via `HTTPS_PROXY` or MCP wrapping. The agent and the firewall don't share memory. Prompt injection targeting the agent doesn't directly affect the proxy's rules or logs. With proper network isolation (container networking, firewall rules), the agent can't route around the proxy either. The tradeoff: added latency per request (typically 1-5ms for Pipelock) and an extra process to manage.

**In-process (library/SDK).** The firewall runs inside the agent's process as an imported library. Lower latency because there's no inter-process communication. But the agent and the firewall share memory. A sophisticated injection that gains code execution can disable the library, modify its rules, or suppress its logs. The security boundary is the process, and both the attacker and the defender are inside it.

For security-critical deployments, the proxy model wins. The latency cost is negligible compared to LLM inference time (which dominates every agent request). The isolation guarantee is not.

## Self-hosted deployment

Open source AI firewalls should be easy to deploy wherever your agents run. Pipelock ships as a single Go binary with zero runtime dependencies.

**Single binary.** Download, run. No Python, no Node, no container runtime required. Works on Linux, macOS, and Windows.

**Docker.** Pull and run with two environment variables.

```bash
docker run -p 8888:8888 ghcr.io/luckypipewrench/pipelock:latest
```

**Kubernetes companion proxy.** In `v2.2.0`, `pipelock init sidecar --inject-spec` generates an enforced companion proxy topology with a separate proxy Deployment, Service, NetworkPolicies, and bound workload identity. Use this when you want the cluster to enforce that the agent pod can only reach Pipelock. The full guide is [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/).

**Same-pod sidecar.** Pipelock can still run as a same-pod sidecar when you want the fastest rollout, but that is a soft deployment pattern because the agent shares the pod network namespace and still relies on `HTTPS_PROXY` cooperation.

**CI pipeline.** Run `pipelock mcp scan` in CI to check MCP configs, tool descriptions, and policy files before deployment. Catches tool poisoning and policy drift before production. `pipelock audit` and `pipelock git scan-diff` cover related static surfaces.

## Getting started with Pipelock

[Install Pipelock](/install/) and run it in under a minute.

```bash
# Install
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Set up Claude Code with hooks and MCP proxy
pipelock claude setup

# Or proxy any agent's HTTP traffic
export HTTPS_PROXY=http://127.0.0.1:8888
pipelock run
```

Pipelock scans mediated traffic for 65 credential patterns, prompt injection (with 6-pass encoding normalization), SSRF, DNS rebinding, and MCP tool poisoning. Every decision lands in the [flight recorder](/learn/flight-recorder/) audit log, and enabling a signing key adds mediator-signed action receipts on top.

<div class="hero-buttons" style="margin-top: 2rem;">
  <a href="https://github.com/luckyPipewrench/pipelock" class="btn btn-primary" data-event="github_click" data-event-placement="guide-body" target="_blank" rel="noopener noreferrer">GitHub</a>
  <a href="/install/" class="btn btn-ghost" data-event="install_click" data-event-placement="guide-body">Install Pipelock</a>
  <a href="/proof/" class="btn btn-ghost" data-event="proof_click" data-event-placement="guide-body">Inspect the proof</a>
</div>

## Further reading

- [Agent Security Control Layers](/learn/agent-security-control-layers/): the four-lane map showing where open-source egress inspection sits among sandboxing, identity governance, and MCP gateways
- [What is an Agent Firewall?](/agent-firewall/): the architecture behind network-layer agent security
- [Why Pipelock Is an Egress Agent Firewall](/learn/egress-vs-inbound-agent-firewall/): why Pipelock controls outbound effects instead of relying on prompt filtering at the door
- [Agent Firewall vs WAF](/compare/agent-firewall-vs-waf/): why inbound web protection and agent egress control solve different problems
- [MCP Runtime Security](/learn/mcp-runtime-security/): live-traffic defenses for MCP that pre-deploy scanners miss
- [MCP Vulnerability Scanner](/learn/mcp-vulnerability-scanner/): pre-deploy and runtime MCP scanner landscape
- [AI Runtime Security](/learn/ai-runtime-security/): the runtime threat surface beyond the network layer
- [Pipelock](/pipelock/): full feature list, deployment options, and framework coverage
- [AI Agent Security](/learn/ai-agent-security/): three security layers explained
- [Pipelock vs LlamaFirewall](/compare/pipelock-vs-llamafirewall/): network proxy vs inference guardrails
- [Pipelock vs DefenseClaw](/compare/pipelock-vs-defenseclaw/): network proxy vs framework-hook governance
- [Pipelock vs Cloudflare AI Gateway](/compare/pipelock-vs-cloudflare-ai-gateway/): self-hosted egress inspection vs a hosted gateway in front of the model API
- [Pipelock vs Prisma AIRS](/compare/pipelock-vs-prisma-airs/): a focused open-source proxy vs an enterprise AI security platform
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
