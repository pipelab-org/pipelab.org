---
title: "Agent Firewall vs Agent Sandbox"
linkTitle: "Agent Firewall vs Agent Sandbox"
seoTitle: "Agent Firewall vs Agent Sandbox Explained"
subtitle: "A sandbox decides where an agent may run and what it may reach. An agent firewall inspects what the agent sends through the connections the sandbox allows."
description: "Agent firewall vs agent sandbox: OpenShell, Cloudflare Sandbox, E2B, and ToolHive contain execution. An agent firewall inspects the allowed traffic."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "concept"
compare:
  subject: "Agent sandbox"
  subject_job: "Isolate the agent or its tools in a container or microVM, restrict filesystem and process access, and allow only listed egress. NVIDIA OpenShell, Cloudflare Sandbox, E2B, ToolHive, and Docker MCP Gateway are current examples."
  subject_boundary: "Around the process: the execution environment and its egress allowlist"
  subject_source: "Mixed: OpenShell, E2B, ToolHive, and Docker MCP Gateway are open source; Cloudflare Sandbox is a hosted service"
  subject_pricing: "Free open-source runtimes; hosted sandboxes bill by usage"
  subject_deploy: "Containers, microVMs, or a hosted sandbox service"
  pick_subject: "You need a hard boundary around untrusted code: filesystem, process, and destination limits that hold even if the agent is fully compromised."
  pick_pipelock: "You need to know what the agent sends through connections routed to the firewall, and signed receipts when configured."
  pick_both: "Sandbox first, firewall inside it. The sandbox limits where traffic can go. The firewall reads what goes there. Pipelock also ships its own process sandbox for the single-agent case."
sources:
  - label: "NVIDIA/OpenShell README"
    url: "https://github.com/NVIDIA/OpenShell"
    checked: 2026-09-01
    note: "Apache-2.0; each sandbox in its own container with policy-enforced egress routing; every sandbox starts with minimal outbound access and a YAML policy the proxy enforces at HTTP method and path level; MicroVM-backed sandboxes"
  - label: "Cloudflare Sandbox SDK docs"
    url: "https://developers.cloudflare.com/sandbox/"
    checked: 2026-09-01
    note: "runs untrusted code in isolated containers with a full Linux environment, on the Workers Paid plan"
  - label: "e2b-dev/E2B repository"
    url: "https://github.com/e2b-dev/E2B"
    checked: 2026-09-01
    note: "Apache-2.0 SDK for cloud sandboxes"
  - label: "stacklok/toolhive README"
    url: "https://github.com/stacklok/toolhive"
    checked: 2026-09-01
    note: "runs each MCP server in an isolated container with network isolation and access filtering"
  - label: "Docker docs: MCP Gateway"
    url: "https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/"
    checked: 2026-09-01
faq:
  - q: "What's the difference between an agent firewall and a sandbox?"
    a: "A sandbox constrains execution: which files, processes, and network destinations the agent or its tools may touch. An agent firewall inspects the content of traffic that is routed through it after the sandbox allows it. With a signing key configured, Pipelock can emit signed action receipts for mediated decisions. Containment and inspection stop different failures."
  - q: "If the sandbox only allows listed destinations, do I still need inspection?"
    a: "Yes. An allowlist decides which hosts may be reached. It does not read what is sent to them. A credential in a POST body to an allowed API, or an injected response from an allowed server, passes an allowlist and is caught by content inspection."
  - q: "Does Pipelock include a sandbox?"
    a: "Yes, for the single-agent case. Its process sandbox uses Landlock, seccomp, and a network namespace on Linux and sandbox-exec profiles on macOS. It is process-level, not container-grade, and it pairs with the inspection rather than replacing a container or microVM boundary."
---

## The short version

A **sandbox** puts a hard boundary around execution. NVIDIA OpenShell isolates each sandbox in its own container, or a microVM, with policy-enforced egress routing and minimal outbound access by default. Cloudflare Sandbox runs untrusted code in isolated containers at the edge. E2B provides cloud sandboxes through an SDK. ToolHive and Docker MCP Gateway containerize each MCP server. All of them decide where the agent may run and what it may reach.

An **[agent firewall](/agent-firewall/)** reads what the agent sends through the connections that boundary allows. Pipelock inspects HTTP, WebSocket, and MCP traffic routed through it for credential leaks, injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured.

The sandbox is the wall. The firewall is the inspection at the gate in the wall.

## How the sandboxes describe themselves

**[NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell)** is an Apache-2.0 runtime for autonomous agents. Its README describes each sandbox isolated in its own container with policy-enforced egress routing, a gateway that intercepts every outbound connection, minimal outbound access by default, and a short YAML policy the proxy enforces at the HTTP method and path level. NemoClaw builds on it.

**[Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/)** runs untrusted code in isolated containers with a full Linux environment, on the Workers Paid plan, for coding agents and CI-style workloads.

**[E2B](https://github.com/e2b-dev/E2B)** ships an Apache-2.0 SDK for cloud sandboxes where agent-generated code runs.

**[ToolHive](https://github.com/stacklok/toolhive)** and **[Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/)** contain MCP servers rather than the agent, each in its own container with network restrictions.

## What a sandbox catches that a firewall doesn't

**Escape and host access.** A malicious tool that tries to read host files or spawn processes is stopped by the container or microVM boundary. Pipelock's own process sandbox is lighter than that.

**Unlisted destinations, before any request.** OpenShell's default is minimal outbound access with an operator-approved allowlist. Nothing reaches a destination that is not on it.

**Blast radius.** A fully compromised agent inside a sandbox is still inside the sandbox.

## What a firewall catches that a sandbox doesn't

**Content on allowed connections.** An allowlist decides which hosts. A credential in a POST body to an allowed API passes the allowlist. Encoding-aware DLP on the wire catches it.

**Injected responses from allowed servers.** A permitted web page or MCP server can return instructions that hijack the agent. Response scanning catches it.

**Poisoned and drifting tool descriptions.** An allowed MCP server can change its tool description mid-session. Fingerprinting catches the change.

**Evidence.** Docker MCP Gateway documents logging and call tracing; the other sandboxes here do not document their block logs on the pages read. With a signing key and allow-path receipt enforcement configured, Pipelock refuses to forward an allowed mediated request whose signed receipt cannot be emitted. Its signed receipts verify offline against the operator's key.

## Side-by-side

| | Agent sandbox | Agent firewall |
|---|---|---|
| **Boundary** | Around execution: files, processes, destinations | Around traffic: what crosses the network boundary |
| **Decides** | Where the agent may run and reach | Whether what it sends and receives is safe |
| **Reads** | Policy and destination | Request and response bytes, tool descriptions |
| **Failure it stops** | Escape, host access, unlisted destination | Leaked secret, injection, poisoned tool, SSRF on an allowed path |
| **Evidence** | Sandbox and gateway logs | Signed, hash-linked receipts that `pipelock verify-receipt` checks offline against the operator's published key, once a signing key is configured |
| **Open-source examples** | OpenShell, E2B, ToolHive, Docker MCP Gateway | Pipelock |

## How to use both

```text
[sandbox: minimal egress, filesystem and process limits]
   agent -> Pipelock (inspect, decide, sign) -> allowed destinations
```

Run the firewall inside the sandbox as the proxy the agent is forced through, and make the forcing real: the agent's container or network namespace gets no default route except the proxy, or host rules drop every outbound packet that did not come from the proxy's user ([`pipelock contain`](/capabilities/agent-containment/) installs and verifies nftables rules of that shape on Linux). An environment variable such as `HTTPS_PROXY` is a hint the agent can ignore, not a boundary. Wired that way, the failure direction is closed: if the proxy is down, misconfigured, or restarting, the agent has no route out and its requests fail rather than slip past. The firewall reads what goes there and signs the outcome. Inside HTTPS tunnels, payload scanning needs [TLS interception](/capabilities/tls-interception/) enabled; without it Pipelock decides on hostname, SSRF, and rate limits at CONNECT time. For a single agent on one host, Pipelock's own sandbox provides the process-level version of the first line.

## Further reading

- [Pipelock vs NemoClaw](/compare/pipelock-vs-nemoclaw/): NVIDIA's reference stack on OpenShell
- [Pipelock vs ToolHive](/compare/pipelock-vs-toolhive/): containerized MCP servers
- [Pipelock vs Docker MCP Gateway](/compare/pipelock-vs-docker-mcp-gateway/): Docker's container gateway
- [Agent firewall vs guardrails](/compare/agent-firewall-vs-guardrails/): the other layer readers confuse with a firewall
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
