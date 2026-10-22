---
title: "Pipelock vs Docker MCP Gateway"
linkTitle: "Pipelock vs Docker MCP Gateway"
subtitle: "Content inspection next to container isolation. Different layers of MCP security that stack well."
description: "Docker MCP Gateway isolates MCP servers in containers. Pipelock is an agent firewall that scans what flows through them. Compare MCP security layers."
date: 2026-04-05
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "egress"
compare:
  subject: "Docker MCP Gateway"
  subject_job: "Runs MCP servers in isolated containers behind one gateway, with a catalog, shareable profiles, OAuth handling, and image signature checks."
  subject_boundary: "Container runtime and the MCP transport between client and servers"
  subject_source: "Open source, MIT"
  subject_pricing: "Free; ships with Docker Desktop and works with Docker CE. The Docker AI Governance bundle is invite-only."
  subject_deploy: "Docker CLI plugin"
  pick_subject: "You already run MCP servers in Docker and want per-server isolation, a catalog, shareable profiles, and image verification."
  pick_pipelock: "You need to inspect tool descriptions, arguments, and responses for poisoning, drift, and injection, and cover HTTP and WebSocket traffic too."
  pick_both: "Docker draws the container boundary. Pipelock inspects the traffic that crosses it. Wrap the gateway's MCP transport with Pipelock and keep the containers."
sources:
  - label: "Docker docs: MCP Gateway"
    url: "https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/"
    checked: 2026-09-01
    note: "carries the note that MCP Gateway as part of Docker AI Governance is invite-only"
  - label: "docker/mcp-gateway README"
    url: "https://github.com/docker/mcp-gateway"
    checked: 2026-09-01
  - label: "docker/mcp-gateway CLI reference"
    url: "https://github.com/docker/mcp-gateway/blob/main/docs/mcp-gateway.md"
    checked: 2026-09-01
    note: "--block-secrets and --verify-signatures default to true; --block-network is documented"
  - label: "docker/mcp-gateway releases"
    url: "https://github.com/docker/mcp-gateway/releases"
    checked: 2026-09-01
    note: "v0.43.3 from July 2026 is the newest tag; recent tags are marked pre-release"
faq:
  - q: "What's the difference between Pipelock and Docker MCP Gateway?"
    a: "Docker MCP Gateway runs each MCP server in its own container with resource limits and network restrictions, fronted by one gateway. Pipelock is a network proxy that scans the content of HTTP requests, MCP tool calls, and WebSocket frames. Docker controls the container. Pipelock scans the traffic."
  - q: "Does Docker MCP Gateway scan for credential leaks or prompt injection?"
    a: "Its CLI documents a --block-secrets flag, on by default, that blocks secret-shaped content flowing to or from tools, plus --verify-signatures for server images and --block-network for forbidden network access. Prompt-injection or tool-poisoning scanning is not documented. Pipelock's DLP covers 65 credential patterns with encoding normalization and scans responses and tool descriptions for injection and drift."
  - q: "Can I use Pipelock and Docker MCP Gateway together?"
    a: "Yes. Docker handles isolation, the catalog, profiles, and OAuth. Pipelock handles content scanning. Wrap the gateway's transport with pipelock mcp proxy and both layers apply."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall that scans HTTP, WebSocket, and MCP traffic routed through it for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured. Single binary, no runtime dependencies.

**[Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/)** is Docker's open-source MCP orchestrator. It runs MCP servers in isolated containers behind a single gateway endpoint, integrates with the Docker MCP Catalog, packages server sets as shareable profiles, handles OAuth for servers that need it, and verifies server image signatures. The docs note that the gateway as part of Docker's AI Governance bundle is invite-only; the open-source CLI plugin itself is public and MIT-licensed.

Docker gives you container isolation and server management. Pipelock gives you content-level scanning. Isolation protects the host from a compromised server. Scanning looks at what an allowed server is saying.

## Feature comparison

| Feature | Pipelock | Docker MCP Gateway |
|---------|----------|-------------------|
| **Architecture** | Network proxy, single binary | Container-isolated MCP gateway |
| **Runtime dependencies** | None | Docker |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware, environment leak and entropy checks | `--block-secrets`, on by default, blocks secret-shaped content to and from tools |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization | Not documented |
| **Tool poisoning and rug-pull drift** | Fingerprinting and drift detection | Not documented |
| **SSRF protection** | Private IP, metadata, and DNS rebinding checks | `--block-network` for forbidden network resources |
| **HTTP forward proxy** | Yes: fetch, forward, CONNECT, WebSocket | MCP transport only, per its docs |
| **WebSocket scanning** | Yes, both directions | Not documented |
| **Container isolation** | No; process-level sandbox instead | Yes, per server, with capped resources |
| **MCP catalog and profiles** | No | Yes: Docker MCP Catalog, profiles shared as OCI artifacts |
| **OAuth handling** | No | Yes |
| **Image verification** | Binary integrity for Pipelock itself | `--verify-signatures`, on by default |
| **Kill switch** | Yes | Not documented in the cited sources |
| **Signed receipts** | Yes, Ed25519, verifiable offline | Call tracing and logging; no signed-receipt format documented |
| **Process sandbox** | Landlock, seccomp, and network namespaces | Not applicable; containers |
| **Source and pricing** | Apache-2.0 core, free | MIT, free |

## Where Docker MCP Gateway is stronger

**Container isolation.** Each server runs in its own container with capped resources and restricted host access. If a malicious server tries to reach the host, Docker's isolation contains it. Pipelock's sandbox is process-level: Landlock, seccomp, and network namespaces, which is lighter and not container-grade.

**Catalog and profiles.** The MCP Catalog makes discovering and running containerized servers a click. Profiles bundle a set of servers and ship through container registries, so a team can share one configuration.

**OAuth and image verification.** The gateway handles OAuth flows for servers that need them, and signature verification for server images is on by default.

**Distribution.** It ships with Docker. If your team already lives in Docker Desktop, the gateway is already there.

## Where Pipelock is stronger

**Content scanning depth.** Docker's `--block-secrets` matches secret-shaped content. Pipelock decodes base64, hex, and URL encoding before matching, checks for environment variable leaks, and runs entropy analysis, across URLs, headers, bodies, and tool arguments.

**Injection and drift.** Pipelock scans responses and tool outputs for injection through several normalization passes, fingerprints tool descriptions at session start, and flags a server that changes a description mid-session. Docker's public docs, read in September 2026, describe container-level controls and secret blocking but not content-level injection or drift scanning.

**Beyond MCP.** Pipelock also scans the agent's HTTP and WebSocket traffic when it is routed through Pipelock. If the agent fetches a page or opens a socket through the proxy, that traffic is inspected too.

**Evidence.** With a signing key configured, Pipelock can emit signed receipts for mediated decisions that are verifiable offline. Docker's call logging is a log.

**No Docker dependency.** A static binary runs in CI, on a bare server, and anywhere a container runtime is unavailable.

## The container-versus-content distinction

Container isolation answers: can this server escape its sandbox? Content scanning answers: is this server leaking credentials or injecting instructions in the traffic it sends?

A server that reads host files it shouldn't is stopped by isolation. A server whose response carries an encoded credential, or whose tool description changes to add exfiltration instructions, is valid MCP traffic at the transport layer. Isolation alone doesn't flag it. Scanning does.

Run both for defense in depth.

## Further reading

- [What is an agent firewall?](/agent-firewall/): definition and evaluation checklist
- [MCP security](/learn/mcp-security/): MCP-specific threats and how scanning addresses them
- [Pipelock vs open source MCP gateways](/compare/pipelock-vs-open-source-mcp-gateways/): Docker alongside agentgateway, Lasso, and Obot
- [Pipelock vs NemoClaw](/compare/pipelock-vs-nemoclaw/): another sandbox-versus-scanning comparison
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
