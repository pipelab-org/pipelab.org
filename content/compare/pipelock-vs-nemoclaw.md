---
title: "Pipelock vs NemoClaw"
linkTitle: "Pipelock vs NemoClaw"
subtitle: "Content scanning next to a sandbox reference stack. NemoClaw decides where an agent may connect. Pipelock inspects what it sends."
description: "NemoClaw runs agents inside NVIDIA OpenShell sandboxes with network policy. Pipelock scans what they send. Compare sandbox vs agent firewall."
date: 2026-04-05
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "sandbox"
compare:
  subject: "NemoClaw"
  subject_job: "Reference stack for running supported agents inside NVIDIA OpenShell sandboxes: guided onboarding, managed inference, network policy with operator approval, integrations, snapshots, and lifecycle."
  subject_boundary: "The sandbox around the agent process and its egress allowlist"
  subject_source: "Open source, Apache-2.0 (NVIDIA); described by NVIDIA as an alpha project"
  subject_pricing: "Free"
  subject_deploy: "CLI on a host with a supported container runtime; agents run inside OpenShell sandboxes"
  pick_subject: "You run OpenClaw, Hermes, or LangChain Deep Agents and want a hardened sandbox with an egress allowlist and an approval flow for new destinations."
  pick_pipelock: "You need to inspect the content of traffic routed through Pipelock across MCP, HTTP, and WebSocket, and keep signed records where receipt signing is configured."
  pick_both: "NemoClaw draws the execution boundary. Pipelock inspects traffic routed through it. Running both covers both boundaries."
sources:
  - label: "NVIDIA/NemoClaw README"
    url: "https://github.com/NVIDIA/NemoClaw"
    checked: 2026-09-01
    note: "supported agents listed as OpenClaw (default), Hermes, and LangChain Deep Agents Code; alpha status stated in the README"
  - label: "NemoClaw documentation"
    url: "https://docs.nvidia.com/nemoclaw/user-guide/openclaw/home"
    checked: 2026-09-01
    note: "docs index"
  - label: "NemoClaw docs: Network Policies reference"
    url: "https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/reference/network-policies"
    checked: 2026-09-01
    note: "deny-by-default; baseline policy allows named endpoints per binary with method and path rules; Restricted, Balanced, Open, and Personal tiers; Personal is a hostless port 80 and 443 rule that the page says does not inspect protocol or payload and does not prompt; external inference goes through the OpenShell gateway; operator approval flow in the TUI"
faq:
  - q: "What's the difference between Pipelock and NemoClaw?"
    a: "NemoClaw is NVIDIA's reference stack for running supported agents inside OpenShell sandboxes, with network policy, managed inference, and lifecycle tooling. Pipelock is a network proxy that scans the content of HTTP, MCP, and WebSocket traffic routed through it. NemoClaw controls where the agent can connect. Pipelock inspects what the agent sends through the paths routed to Pipelock."
  - q: "Does NemoClaw scan for credential leaks or prompt injection?"
    a: "Its network-policy reference describes a deny-by-default policy, baseline endpoint rules scoped to a binary with HTTP method and path rules, tiers of presets, and an operator approval flow. It also states that the Personal tier rule does not inspect the application protocol or payload. Content scanning of request or response bodies, DLP pattern matching, or injection detection is not described in the public materials read for this page."
  - q: "Can I use Pipelock and NemoClaw together?"
    a: "Yes. NemoClaw provides the sandbox and allowlist. Pipelock can run as the proxy the sandboxed agent talks through and scan that content. The deployment can use both containment and content inspection."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It scans HTTP, MCP, and WebSocket traffic routed through it for credential leaks, prompt injection, SSRF, and tool poisoning. With a signing key configured, it can emit signed action receipts for mediated decisions. Single binary, works with any agent routed through it.

**[NemoClaw](https://github.com/NVIDIA/NemoClaw)** is NVIDIA's open-source reference stack for running supported AI agents more safely inside OpenShell sandboxes. It provides guided onboarding, managed inference, network policy, managed integrations, snapshots, and lifecycle operations through a CLI. The README lists OpenClaw as the default agent and Hermes and LangChain Deep Agents Code as supported, and calls the project alpha with best-effort maintenance.

They operate at different layers. NemoClaw controls the execution environment and which destinations the agent may reach. Pipelock inspects traffic routed through it on the way to those destinations.

## Feature comparison

| Feature | Pipelock | NemoClaw |
|---------|----------|----------|
| **Architecture** | Network proxy, single binary | Sandbox orchestrator on top of OpenShell |
| **Agent support** | Any agent routed through the proxy | OpenClaw, Hermes, LangChain Deep Agents Code |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware, on mediated traffic | Not described in public materials |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization on mediated traffic | Not described in public materials |
| **SSRF protection** | Mediated private-IP, metadata, and DNS rebinding checks | Not described in public materials |
| **MCP scanning** | Mediated traffic, both directions: tool descriptions, arguments, responses | Not described in public materials |
| **WebSocket scanning** | Mediated frames, both directions | Not described in public materials |
| **Network policy** | Domain blocklist and allowlist plus content scanning on routed traffic | Deny by default; baseline endpoint rules scoped to a binary with method and path rules; Restricted, Balanced, Open, and Personal tiers of presets; operator approval flow for unlisted hosts |
| **Broad-egress mode** | No broad egress policy; routed traffic still passes Pipelock's scanners | Personal tier: any host on ports 80 and 443, which the docs say is not inspected for protocol or payload and does not prompt |
| **Process sandbox** | Landlock, seccomp, and network namespaces (process-level) | OpenShell sandbox (container-grade) |
| **Managed inference** | Not in scope | Yes |
| **Snapshots and lifecycle** | Not in scope | Yes |
| **Signed receipts** | Available with a signing key; Ed25519, verifiable offline | Not described in public materials |
| **License** | Apache-2.0 core; Enterprise under ELv2 | Apache-2.0 |

## Where NemoClaw is stronger

**Container-grade isolation.** The agent runs inside an OpenShell sandbox. Pipelock's own sandbox is process-level, and Pipelock doesn't manage a container lifecycle.

**Operator approval for egress.** The network-policy reference describes a deny-by-default baseline, rules that name the endpoint, the requesting binary, and the allowed methods and paths, and a TUI approval flow: an unlisted host is blocked and logged, shown with host, port, and binary, and added to the running policy if approved. That's a useful gate for interactive agents, and it is finer than a hostname allowlist.

**Managed inference and onboarding.** Model routing, snapshots, and a guided setup for the supported agents. Pipelock doesn't route model calls or manage agents.

## Where Pipelock is stronger

**Content inspection.** An allowlist decides which hosts the agent may reach. It doesn't read what the agent sends to an allowed host. NVIDIA's own reference says so for the Personal tier: the rule "does not inspect the application protocol or payload," and "an agent can send workspace data or sandbox-visible credentials to an arbitrary reachable service on either port without an operator approval prompt." When the sandbox routes traffic through Pipelock, Pipelock scans the request body for encoded credentials, the response for injection, and the tool description for poisoning.

**Transport coverage.** Pipelock mediates HTTP forward proxy traffic, HTTPS via CONNECT, WebSocket frames, and MCP over stdio and HTTP, with the same scanning engine on each.

**Framework independence.** Pipelock works with any agent whose traffic goes through it, including agents NemoClaw doesn't support.

**Evidence.** With a signing key configured, Pipelock can emit signed receipts for mediated decisions. The shipped verifier checks them offline.

## The enforcement gap

```text
NemoClaw:  Agent -> [sandbox + egress allowlist] -> allowed hosts only
Pipelock:  Agent -> [content-scanning proxy]     -> scanned routed traffic
Both:      Agent -> [sandbox] -> [Pipelock]       -> scanned routed traffic to allowed hosts
```

The third line puts the controls in series. NemoClaw provides the execution boundary. Pipelock provides the content boundary for routed traffic. Different failure modes, one stack.

## A note on what this page could verify

The NemoClaw column is drawn from the README, the docs index, and the Network Policies reference page, each dated above. The security best-practice pages were not read for this revision, so nothing here rests on them.

## Further reading

- [What is an agent firewall?](/agent-firewall/): definition and evaluation checklist
- [Pipelock vs DefenseClaw](/compare/pipelock-vs-defenseclaw/): the framework-hook side of the same question
- [Pipelock vs Docker MCP Gateway](/compare/pipelock-vs-docker-mcp-gateway/): container isolation for MCP servers
- [MCP security](/learn/mcp-security/): MCP threats and content-level scanning
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
