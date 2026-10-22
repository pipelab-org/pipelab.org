---
title: "Pipelock vs ToolHive"
linkTitle: "Pipelock vs ToolHive"
seoTitle: "Pipelock vs ToolHive: MCP Isolation vs Inspection"
subtitle: "Stacklok's runtime puts every MCP server in an isolated container with permissions and secrets management. Pipelock inspects routed server traffic and can emit signed receipts when configured."
description: "Compare Pipelock with Stacklok ToolHive, which runs MCP servers in isolated containers with permissions and secrets. Isolation versus payload inspection."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "sandbox"
compare:
  subject: "ToolHive"
  subject_job: "Runs every MCP server in an isolated container with a minimal permission file, encrypted secrets, network access filtering, a registry, and a Kubernetes operator; enforces identity and access policy per request when an auth source is configured."
  subject_boundary: "The container around each MCP server and the proxy in front of it"
  subject_source: "Open source, Apache-2.0 (Stacklok)"
  subject_pricing: "Free"
  subject_deploy: "CLI and desktop app locally; Kubernetes operator with CRDs"
  pick_subject: "You run a fleet of MCP servers and want each one containerized with no local credentials, scoped permissions, managed secrets, and a registry, on a laptop or in Kubernetes."
  pick_pipelock: "You need the tool descriptions, arguments, and responses inspected for poisoning, leaks, and injection, HTTP and WebSocket covered too, and signed receipts when configured."
  pick_both: "ToolHive contains and manages the servers. Pipelock inspects the traffic between the agent and those servers. Wrap ToolHive's endpoints with Pipelock and keep both."
sources:
  - label: "stacklok/toolhive README"
    url: "https://github.com/stacklok/toolhive"
    checked: 2026-09-01
    note: "Apache-2.0; isolated containers, minimal permission file, encrypted secrets, network isolation, registry, Kubernetes operator, provenance verification"
  - label: "ToolHive documentation"
    url: "https://docs.stacklok.com/toolhive/"
    checked: 2026-09-01
    note: "runtime with fine-grained permissions, network access filtering, and secrets management; remote server proxying"
  - label: "ToolHive releases"
    url: "https://github.com/stacklok/toolhive/releases"
    checked: 2026-09-01
    note: "v0.46.0 from August 2026 was the newest release at the time of checking"
faq:
  - q: "What's the difference between Pipelock and ToolHive?"
    a: "ToolHive is Stacklok's runtime for MCP servers. It runs each server in an isolated container with a minimal permission file and no local credentials, manages encrypted secrets, filters network access, and adds a registry and a Kubernetes operator. Pipelock is an agent firewall that inspects routed HTTP, WebSocket, and MCP traffic and can emit signed receipts when a signing key is configured. ToolHive controls the server's environment. Pipelock reads what the server sends when its traffic is routed through Pipelock."
  - q: "Does ToolHive scan tool descriptions or responses?"
    a: "Its README and docs describe isolation, permissions, secrets, network access filtering, per-request identity and access policy with an auth source, provenance verification, and server signing. Content scanning of tool descriptions, arguments, or responses, drift detection, and signed receipts are not documented."
  - q: "Can I use both?"
    a: "Yes. ToolHive runs and contains the servers; Pipelock wraps the transport between the agent and those servers for inspection and receipts. Container isolation and payload inspection stop different failures."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It inspects HTTP, WebSocket, and MCP traffic routed through it for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured.

**[ToolHive](https://github.com/stacklok/toolhive)** is Stacklok's Apache-2.0 runtime for MCP servers. Its README describes running every server in an isolated container with a minimal permission file and no local credentials. Around that it adds encrypted secrets, network isolation and access filtering, a registry of servers, provenance verification and signing, a virtual MCP workflow engine, and a Kubernetes operator with custom resources. With an authentication source configured it enforces identity and access policy per request.

ToolHive answers how a server runs, what it may reach, and who may call it. Pipelock answers what the server says and proves the decision.

## Feature comparison

| Feature | Pipelock | ToolHive |
|---------|----------|----------|
| **Architecture** | Network proxy, single self-hosted Go binary | Container runtime and proxy for MCP servers; CLI, desktop app, Kubernetes operator |
| **What it covers** | HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP stdio and HTTP, A2A | MCP servers it runs or proxies |
| **Container isolation** | No; process-level sandbox instead | Yes, per server, minimal permission file |
| **Secrets** | Holds none by design | Encrypted secrets management; no local credentials in the server container |
| **Network control** | Domain policy plus content scanning | Network isolation and access filtering per server |
| **Identity and access** | Tool policy via config | Per-request identity and access policy with an auth source |
| **Registry and provenance** | No | Registry, provenance verification, server signing |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware, on the traffic | Not documented |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization | Not documented |
| **Tool poisoning and rug-pull drift** | Fingerprinting and drift detection | Not documented |
| **Signed receipts** | Yes, Ed25519, verifiable offline | Not documented |
| **Process sandbox for the agent** | Landlock, seccomp, and network namespaces | Not in scope; ToolHive contains servers, not the agent |
| **License** | Apache-2.0 core; Enterprise under ELv2 | Apache-2.0 |

## Where ToolHive is stronger

**Server containment.** Each MCP server runs in its own container with scoped permissions and no local credentials. A misbehaving server is boxed in.

**Secrets and network filtering.** Encrypted secrets handed to servers as needed, and network access filtering per server.

**Fleet management.** A registry, a Kubernetes operator with custom resources, remote server proxying, and provenance checks on what gets run.

**Identity-aware access.** With an auth source, policy is enforced per request by identity.

## Where Pipelock is stronger

**Payload inspection.** A contained server can still return an injected response or change its tool description. Pipelock fingerprints descriptions, flags drift, decodes and scans arguments for secrets, and scans responses for injection.

**Beyond MCP.** Pipelock also inspects the agent's HTTP and WebSocket egress.

**Evidence.** With a signing key configured, Pipelock can emit signed receipts for mediated decisions that an auditor verifies offline.

**Containing the agent, not only the servers.** Pipelock's sandbox wraps the agent process itself with Landlock, seccomp, and a network namespace.

## The container-versus-content distinction

Isolation answers whether a server can escape or reach something it shouldn't. Inspection answers whether a server's traffic is leaking credentials or injecting instructions. A server that reads a host file it shouldn't is stopped by ToolHive. A server whose tool description quietly changes to add exfiltration instructions is valid MCP traffic to a container boundary, and Pipelock is the layer that sees it.

## Further reading

- [Agent firewall vs agent sandbox](/compare/agent-firewall-vs-agent-sandbox/): the concept behind this comparison
- [Pipelock vs Docker MCP Gateway](/compare/pipelock-vs-docker-mcp-gateway/): Docker's container gateway for MCP servers
- [Pipelock vs Snyk Agent Scan](/compare/pipelock-vs-snyk-agent-scan/): scanning the servers before you run them
- [MCP security](/learn/mcp-security/): MCP-specific threats
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
