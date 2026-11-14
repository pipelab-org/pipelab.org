---
title: "Best MCP Security Tools 2026: Scanners, Gateways, Proxies Compared"
linkTitle: "MCP Security Tools"
seoTitle: "Best MCP Security Tools 2026: Compared"
subtitle: "The tools that protect MCP connections, compared."
description: "Best MCP security tools for 2026 compared: pre-deploy scanners, runtime proxies, and MCP gateways, with what each one catches and misses."
date: 2026-04-11
lastmod: 2026-11-14
faq:
  - q: "What are the main categories of MCP security tools?"
    a: "MCP security tools fall into three categories: pre-deploy scanners (check MCP servers before you connect them), runtime proxies (inspect tool calls and responses while the agent runs), and MCP gateways (route and control access across multiple MCP servers). Scanners find problems before launch. Proxies catch problems at runtime. Gateways manage routing and access policy."
  - q: "Do I need both an MCP scanner and a runtime proxy?"
    a: "Combining them covers more threats. Scanners check tool descriptions for known injection patterns before you deploy. But they run once, at a point in time. A rug-pull attack sends clean descriptions to the scanner and poisoned descriptions later during the session. A runtime proxy can catch changes that happen after the scan. Either is a useful partial control when you can only deploy one."
  - q: "What should I look for when choosing an MCP security tool?"
    a: "Check for bidirectional scanning (both tool arguments and responses), encoding evasion handling (base64, hex, URL encoding), session awareness (detecting mid-session tool description changes), and protocol coverage beyond just MCP (HTTP, WebSocket). A tool that only scans one direction or only handles plaintext leaves gaps that attackers will find."
  - q: "What are the best MCP vulnerability scanners?"
    a: "There is no single best because the lanes serve different threats. For pre-deploy scanning, options include Snyk Agent Scan (formerly MCP-Scan, Apache-2.0), mcpscan.ai (SaaS), NeuralTrust MCP Scanner (commercial), Proximity (open source), Cisco MCP Scanner (Apache-2.0), Akto MCP security tools (commercial), and Enkrypt MCP Scan (SaaS). For runtime scanning at the agent boundary, Pipelock is the open-source option. For server-side runtime guardrails, Cisco MCP Runtime Guardrails is the commercial one. Most enterprise rollouts combine pre-deploy and runtime."
  - q: "How do I scan an MCP server for vulnerabilities?"
    a: "Run a pre-deploy scanner against the server's `tools/list` output, source code, and dependency manifest. Look for poisoned tool descriptions, schema injection vectors, path traversal patterns, command injection patterns, and known-vulnerable dependencies. Add a runtime scanner in front of the agent to inspect threats that appear when traffic flows, such as rug-pulls and response injection. Combining the two covers more threat classes. Either is a useful partial control when you can only deploy one."
  - q: "Are MCP vulnerability scanners free?"
    a: "Some are. Snyk Agent Scan (formerly MCP-Scan), Cisco MCP Scanner, and Proximity are open source. The SlowMist MCP Security Checklist is a free static reference, not a scanner. Pipelock is open source (Apache-2.0 core; Enterprise features under ELv2). It ships both a pre-deploy `pipelock mcp scan` subcommand and a runtime proxy. Hosted and commercial offerings include mcpscan.ai, NeuralTrust, Enkrypt MCP Scan, and Akto. Check each vendor for current pricing and team features."
  - q: "What open-source MCP security tools should I run?"
    a: "Match the tool to the job. MCP Inspector is the official way to look at one server you already run. Snyk Agent Scan, Cisco MCP Scanner, Ramparts, MCP-Shield, and Proximity scan configs or tool definitions before you connect. Docker MCP Gateway and ToolHive run servers in containers. ContextForge and agentgateway are gateways you host. mcp-proxy only bridges stdio and HTTP. Pipelock inspects live tool arguments and responses, and Lasso's MCP Gateway can mask listed token shapes with its basic plugin. mcp-context-protector pins a server configuration at runtime, and GitHub lists that repository as archived. One tool doesn't cover every job."
  - q: "Is the MCP Inspector a vulnerability scanner?"
    a: "The MCP Inspector README describes a developer tool for inspecting an MCP server, with a web UI, a CLI, and a terminal UI. Vulnerability scanning and blocking a tool call are not documented in public docs for that repository. It stores OAuth tokens and stdio environment values in the OS keychain when one is available. Without a keychain, the README says those secrets are saved to ~/.mcp-inspector/secrets.json, unencrypted unless you supply a key."
  - q: "Can an MCP gateway see a stdio server on my laptop?"
    a: "Only if the client launches that server through the gateway, or a wrapper sits on the subprocess. In the MCP stdio transport, the client launches the server as a subprocess and exchanges JSON-RPC on stdin and stdout. That traffic doesn't cross the network by itself, so a gateway that only receives Streamable HTTP never sees a server the client still launches locally."
  - q: "How do I choose between an MCP scanner and an MCP gateway?"
    a: "Use a scanner when you need a report on tool descriptions, skills, or server code before you connect. Use a gateway when you need one place to route, authenticate, or isolate servers. A scanner doesn't sit on the live call unless that product's docs say it proxies. A gateway doesn't inspect tool arguments and responses unless that product's docs say it does. The selection checklist on this page is the longer version of the same choice."
learn_cat: mcp
level: ref
tags:
  - mcp
  - tools
  - comparison
---
MCP (Model Context Protocol) gives AI agents access to external tools. Each connection is a trust boundary. For the full [MCP security](/learn/mcp-security/) threat model and best-practices baseline, start with the pillar guide. A compromised or malicious MCP server can poison tool descriptions, steal credentials through tool arguments, or inject prompts in responses.

The ecosystem has responded with MCP security tools. They vary widely in what they actually check. This guide breaks down the categories, names the major tools, and helps you evaluate what you need.

## Shortlist by job

Pick the row that matches the failure you're trying to stop. The tools in one row don't do the job in the next row. The sections below say what each tool's own docs describe. Where a control is missing from those pages, the entry says "not documented in public docs."

| Job | Start here |
|---|---|
| Look at one server you already run | [MCP Inspector](https://github.com/modelcontextprotocol/inspector) |
| Scan configs and tool definitions before you connect | [Snyk Agent Scan](https://github.com/snyk/agent-scan), [Cisco MCP Scanner](https://github.com/cisco-ai-defense/mcp-scanner), [Ramparts](https://github.com/highflame-ai/ramparts), [MCP-Shield](https://github.com/riseandignite/mcp-shield), [Proximity](https://github.com/Nova-Hunting/nova-proximity) |
| Pin the server configuration during the session | [mcp-context-protector](https://github.com/trailofbits/mcp-context-protector) (GitHub lists the repo as archived) |
| Run the server in its own container | [Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/), [ToolHive](https://github.com/stacklok/toolhive) |
| Bridge a stdio client to a remote HTTP server | [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) |
| Route many servers, with auth and policy where the docs describe it | [ContextForge](https://github.com/IBM/mcp-context-forge), [agentgateway](https://agentgateway.dev/), [Obot](https://github.com/obot-platform/obot), [Runlayer](https://www.runlayer.com/) |
| Inspect live tool arguments and responses | [Pipelock](/pipelock/), [Lasso MCP Gateway](https://github.com/lasso-security/mcp-gateway) |
| Inventory MCP servers across machines you manage | [Pillar](https://www.pillar.security/platform/agentic-endpoint), [Noma](https://noma.security/solutions/ai-supply-chain-security), [Zenity](https://zenity.io/blog/zenity-joins-the-cursor-marketplace) |
| Scan MCP tool definitions, inputs, and outputs in a Palo Alto deployment | [Prisma AIRS](https://docs.paloaltonetworks.com/prisma-airs/ai-runtime-security/airs-vm-firewall/detect-mcp-threats) |

## Selection checklist

Answer these before you install anything. The evaluation checklist further down covers how a tool scans. This one covers whether it's the right job.

1. Name the row in the shortlist that matches the failure. A scan of tool descriptions doesn't see a description that changes after you approve the server. That gap is the rug-pull row in the scanner-versus-proxy table.
2. Read whether the tool starts the configured server in order to scan it, and whether it sends tool names and descriptions to an API you don't run. Snyk Agent Scan can do both. The Snyk section has the flags.
3. If the agent launches the server itself, an HTTP-only gateway doesn't see that process. In the [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio), the client launches the MCP server as a subprocess and exchanges JSON-RPC on stdin and stdout.
4. If the tool writes a report and stops, pick a second control for the live call. A report from yesterday doesn't block a tool call today.

## Tool categories

MCP security tools solve different problems at different stages:

**Pre-deploy scanners** check MCP servers before you connect them to an agent. They analyze tool descriptions for hidden instructions, flag suspicious patterns, and give you a risk assessment. They run once (or periodically), not continuously.

**Runtime proxies** sit between the agent and MCP servers during operation. They inspect every tool call and every response in real time. If a tool description changes mid-session or a credential appears in a tool argument, the proxy catches it live. [Pipelock](/pipelock/) is the open-source runtime proxy in this category. Pipelock emits mediator-signed action receipts from outside the agent trust boundary so each decision carries offline-verifiable evidence.

**MCP gateways** manage routing, access control, and policy enforcement across multiple MCP servers. Some gateways include content inspection. Others focus on authentication, authorization, and connection management.

The boundaries between these categories blur. Some tools span multiple categories. What matters is which checks actually run on your traffic.

## Pre-deploy scanners

These tools analyze MCP server tool descriptions before you connect them to an agent. They look for injection patterns, suspicious instructions, and known attack signatures.

### mcp-scanner (Cisco)

[mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner) connects to an MCP server, pulls tool descriptions, and runs them through YARA rules and an LLM-based classifier to detect hidden instructions. It flags descriptions that tell the agent to read files, exfiltrate data, or change behavior. Good for catching obvious tool poisoning before deployment. Relies on LLM judgment, so novel attacks may pass.

### Snyk Agent Scan

[Snyk Agent Scan](https://github.com/snyk/agent-scan) discovers agent configurations, MCP servers, and skills, then reports risks such as prompt injection, tool poisoning, and malicious skill content. Background mode periodically scans and reports results to Snyk Evo. The CLI uses the [Apache-2.0 license](https://github.com/snyk/agent-scan/blob/main/LICENSE); scans require a Snyk account and API token.

The [official README](https://github.com/snyk/agent-scan/blob/main/README.md), checked October 22, 2026, describes local checks plus API analysis. It sends agent application details, MCP configurations and signatures, tool names and descriptions, and skill content for analysis, with secrets redacted before transmission. Snyk states that MCP tool-call contents and results are not stored or logged.

Scanning can execute configured stdio server commands or contact remote MCP servers to retrieve tool descriptions. Interactive scans ask for consent per server by default. Background and push-key scans inspect remote servers automatically, but only start stdio servers with `--dangerously-run-mcp-servers`. Review configured commands and URLs; use a sandbox for untrusted configurations. These are component-scanning and inventory features; assess any separate enterprise runtime-governance offering on its own documentation.

### mcpscan.ai (Invariant Labs)

[mcpscan.ai](https://mcpscan.ai/) is a web-based scanner. Paste an MCP server config and it analyzes tool descriptions, checks for cross-origin escalation patterns, and generates a risk report. Low friction for quick assessments. Useful for evaluating third-party servers before adding them to your stack.

### Enkrypt AI

[Enkrypt](https://www.enkryptai.com/) offers MCP security scanning as part of a broader AI security platform. Their scanner checks tool descriptions against known attack patterns and provides continuous monitoring for description changes. Enterprise-focused with dashboard and alerting.

### Ramparts

[Ramparts](https://github.com/highflame-ai/ramparts) scans MCP servers and agent skill files. The README (checked November 14, 2026) describes YARA rules, an LLM analysis pass, SARIF 2.1.0 output, and findings tagged to the OWASP MCP Top 10. It also fingerprints server configs, tool definitions, and skill files against a stored baseline and flags a change after approval. Supply-chain checks query OSV.dev. The same README says Ramparts analyzes static metadata, configurations, and skill files. Live blocking of a tool call is not documented in public docs. License: Apache-2.0.

### MCP-Shield

[MCP-Shield](https://github.com/riseandignite/mcp-shield) scans installed MCP configs. The README (checked November 14, 2026) says `npx mcp-shield` looks for hidden instructions in tool descriptions, tool shadowing, exfiltration channels, and cross-origin violations. Config paths it names include Cursor, Claude Desktop, Windsurf, VS Code, and Continue. Deeper analysis is an optional Claude API key. Runtime enforcement is not documented in public docs. License: MIT.

## Runtime proxies

Runtime proxies intercept MCP traffic while the agent runs. They scan tool calls and responses in real time, catching attacks that pre-deploy scanners miss.

### Pipelock

[Pipelock](/pipelock/) wraps MCP server commands and routes all JSON-RPC traffic through a scanning pipeline. It inspects tool descriptions for poisoning ({{< stat key="response_patterns" >}} injection patterns plus tool-specific checks), tool arguments for credential leaks ({{< stat key="dlp_patterns" >}} DLP patterns), and tool responses for prompt injection. Fingerprints descriptions with SHA-256 to detect rug-pull attacks. Also proxies HTTP and WebSocket traffic in the same binary, so you get MCP scanning and egress inspection in one tool. Open source, single Go binary, self-hosted.

### Promptfoo

[Promptfoo](https://github.com/promptfoo/promptfoo) includes an MCP proxy that intercepts tool calls between the agent and MCP servers. It focuses on red-teaming and evaluation: injecting adversarial inputs to test how your agent handles poisoned tool responses. More of a testing and evaluation tool than a production runtime scanner, but useful for identifying weaknesses before deployment.

### mcp-context-protector (Trail of Bits)

[mcp-context-protector](https://github.com/trailofbits/mcp-context-protector) is a wrapper you put in front of an MCP server. The README (checked November 14, 2026) describes trust-on-first-use pinning of the server configuration. A change from the approved configuration blocks downstream tool calls until you approve it with `--review-server`. It checks again when it receives `notifications/tools/list_changed`. GitHub lists the repository as archived. License: Apache-2.0.

### Lasso MCP Gateway

[Lasso MCP Gateway](https://github.com/lasso-security/mcp-gateway) reads an `mcp.json`, starts the servers listed there, and sits between the client and those servers. The README (checked November 14, 2026) says the `basic` plugin masks a fixed list of token shapes, including GitHub tokens, cloud API keys, and JWTs. The `presidio` plugin masks PII and is a separate install. The `lasso` plugin adds the prompt-injection and harmful-content checks in the README's plugin table, and it needs a Lasso API key. Those checks are not documented in public docs for the `basic` plugin. License: MIT.

## MCP gateways

Gateways manage routing, access control, and policy for MCP connections. Some include security scanning. Others focus on infrastructure.

### Docker MCP Gateway

[Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/) runs MCP servers in isolated Docker containers with restricted networking. Each server gets its own container with limited filesystem and network access. Includes call tracing, logging, and a `--block-secrets` flag for basic secret filtering. The primary security model is container isolation, with some content-level controls.

### Docker MCP Toolkit

The [Docker MCP Gateway README](https://github.com/docker/mcp-gateway) (checked November 14, 2026) describes the MCP Toolkit as the Docker Desktop screen for configuring servers from the Docker MCP Catalog. The same README says the Toolkit is the `docker-mcp` CLI plugin, and that each local catalog server runs in an isolated container. The Toolkit is the desktop control for that gateway. A vulnerability scanner is not documented in public docs for the Toolkit.

### Runlayer

[Runlayer](https://www.runlayer.com/) is an AI control plane with MCP access governance, fine-grained permissions, and audit logs. It sits between agents and MCP servers and applies access policies. Its [ToolGuard docs](https://docs.runlayer.com/runlayer-toolguard) describe scanners that check tool definitions when a connector is registered, and tool inputs and outputs at call time, for prompt injection, credentials, and PII. Its [deployment docs](https://docs.runlayer.com/deployment/overview) (checked 2026-10-14) describe a Runlayer-hosted single-tenant deployment or self-hosting on AWS ECS with Terraform or on Kubernetes.

### agentgateway (Linux Foundation)

[agentgateway](https://agentgateway.dev/) is a Rust-based gateway contributed by Solo.io to the Linux Foundation. It supports MCP and A2A protocols, JWT authentication, tool-level RBAC, and OpenTelemetry tracing. Infrastructure-focused: routing, auth, and observability rather than content-level security scanning.

### Obot (Acorn Labs)

[Obot](https://github.com/obot-platform/obot) is an open-source agent platform that includes MCP gateway functionality. It manages tool access, credentials, and permissions for agents. Broader scope than just MCP security: it's a full agent orchestration platform with MCP support built in.

### ToolHive (Stacklok)

[ToolHive](https://github.com/stacklok/toolhive) runs each MCP server in an isolated container. The README (checked November 14, 2026) describes a gateway, a registry, local runs through Docker or Podman, and a Kubernetes operator. It enforces identity and access policy per request when you configure an authentication source, and it can manage encrypted secrets and network isolation. Inspection of tool-call arguments and responses is not documented in public docs. License: Apache-2.0.

### ContextForge (IBM)

[ContextForge](https://github.com/IBM/mcp-context-forge) is a registry and proxy you host. The README (checked November 14, 2026) says it federates MCP servers, A2A servers, and REST or gRPC APIs behind one endpoint, with auth, rate limits, and plugins. The package name on PyPI is `mcp-contextforge-gateway`. The gateway won't start until you set `JWT_SECRET_KEY` and `AUTH_ENCRYPTION_SECRET`. Content scanning of tool arguments is not documented in public docs. License: Apache-2.0.

## Inspectors and bridges

These tools show up next to scanners and gateways in current roundups. They do a narrower job.

### MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the official developer tool for one MCP server. The README (checked November 14, 2026) ships a web UI, a CLI, and a terminal UI in `@modelcontextprotocol/inspector`, plus an experimental `mcpdo` connection CLI. You point it at a server you run and list or call its tools, prompts, and resources. Vulnerability scanning and blocking a call are not documented in public docs. The README warns that OAuth tokens and stdio `env` values go to the OS keychain when one exists. Without a keychain, they're written to `~/.mcp-inspector/secrets.json`, unencrypted unless you supply a key. The repository `LICENSE` says new contributions are Apache-2.0, and earlier contributions whose authors haven't agreed to relicense remain MIT.

### mcp-proxy

[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) switches transports. The README (checked November 14, 2026) documents two modes: a stdio process that connects to a remote SSE or Streamable HTTP server, and an SSE server that connects to a local stdio server. That's how a desktop client reaches a remote server, or how a remote client reaches a server that only speaks stdio. Security scanning is not documented in public docs. License: MIT. Once a stdio server is reachable over HTTP, anything that can open that port can send it JSON-RPC, so bind and authenticate that listener on purpose.

## Hosted platforms

These are licensed products. The notes below are limited to the page linked in each entry, checked November 14, 2026.

### Prisma AIRS

Palo Alto's [Detect MCP Threats](https://docs.paloaltonetworks.com/prisma-airs/ai-runtime-security/airs-vm-firewall/detect-mcp-threats) page says Prisma AIRS scans MCP tool definitions, inputs, and outputs. The detection services named on that page include prompt injection, toxic content, URL detection, malicious code, and DLP. The page requires an AI Security Profile and a network intercept managed by Strata Cloud Manager or Panorama. A self-hosted scanner binary is not documented in public docs on that page.

### Pillar

Pillar's [agentic endpoint](https://www.pillar.security/platform/agentic-endpoint) page says the product inventories coding agents, MCP servers, skills, and plugins on machines you manage, scores each MCP server against a catalog of pre-analyzed servers, and can block a risky command or data flow before it runs. A public repository for that agent is not documented in public docs on that page.

### Noma

Noma's [AI supply chain](https://noma.security/solutions/ai-supply-chain-security) page says Noma assesses MCP servers for unpinned versions, excessive tool permissions, low-trust packages, known vulnerabilities, and exposed secrets. The same page says you can mark agents, MCP servers, and skills as approved, in review, or blocked, and enforce tool or user policies. A public repository for the scanner is not documented in public docs on that page.

### Zenity

Zenity's [Cursor marketplace post](https://zenity.io/blog/zenity-joins-the-cursor-marketplace) says the Cursor plugin builds an inventory that maps each Cursor agent to the MCP endpoints it uses, from webhooks and OpenTelemetry events. Inspection of tool-call arguments is not documented in public docs on that post.

## Scanner vs proxy: which do you need?

Both. They catch different things at different times.

| | Pre-deploy scanner | Runtime proxy |
|---|---|---|
| **When it runs** | Before connection, on demand | Continuously during operation |
| **What it checks** | Tool descriptions at scan time | All traffic: descriptions, arguments, responses |
| **Catches rug-pulls** | No (only sees the initial description) | Yes (fingerprints and tracks changes) |
| **Catches credential leaks** | No (doesn't see runtime traffic) | Yes (DLP on tool arguments) |
| **Catches injection in responses** | No (doesn't see responses) | Yes (scans inbound content) |
| **Integration effort** | Low (run once, review report) | Medium (wrap servers or configure proxy) |

A scanner tells you "this MCP server looks safe right now." A proxy enforces "this MCP server stays safe for the entire session." Run the scanner before you deploy. Run the proxy while you operate.

## Scanner landscape: pre-deploy and runtime

The table covers the projects most commonly referenced when teams shop for MCP security. The categories below the table cover what's not in the table (server-side runtime guardrails, static checklists). The Snyk and Cisco scanner names, capabilities, and Apache-2.0 licenses were checked against their linked repository READMEs and licenses on October 22, 2026. For a comparison of what the Cisco and Snyk scanners catch versus Pipelock, see the [MCP scanner comparison](/blog/mcp-scanner-comparison-2026/). Rows for MCP Inspector, Ramparts, MCP-Shield, mcp-context-protector, Lasso MCP Gateway, ToolHive, ContextForge, mcp-proxy, Prisma AIRS, Pillar, Noma, and Zenity were checked against the linked pages on November 14, 2026.

| Tool | Lane | License / model | Key strength | Key gap |
|---|---|---|---|---|
| [Snyk Agent Scan](https://github.com/snyk/agent-scan) | Pre-deploy and inventory scanning | Apache-2.0 | Scans agent configurations, skills, and MCP tools; supports inventory reporting to Snyk Evo. | The cited README describes scanning and inventory; runtime egress enforcement needs a separate control. |
| [mcpscan.ai](https://mcpscan.ai/) | Pre-deploy | Commercial SaaS | Easy onboarding, hosted scan workflow, scheduled re-scans. | No agent-side runtime inspection. Sends server data to the SaaS for analysis. |
| [NeuralTrust MCP Scanner](https://neuraltrust.ai/mcp-scanner) | Pre-deploy | Commercial | Server-code and tool-definition scanning with enterprise reporting. | No public agent-side runtime layer; commercial dependency. |
| [Proximity](https://github.com/Nova-Hunting/nova-proximity) | Pre-deploy | Open source (GPL-3.0) | Self-hosted, scriptable, suitable for CI integration. | Pre-deploy only; no runtime traffic inspection. |
| [Cisco MCP Scanner](https://github.com/cisco-ai-defense/mcp-scanner) | Pre-deploy | Apache-2.0 | SDK and CLI for scanning MCP tools with YARA and model-based analyzers. | Point-in-time scanning; Cisco AI Defense Runtime Guardrails is a separate offering. |
| [Akto MCP security](https://www.akto.io/blog/mcp-security-tools) | API-test driven scanning | Commercial | API-security background applied to MCP traffic shapes. | Closer to API security than agent-egress security. |
| [Enkrypt MCP Scan](https://www.enkryptai.com/product/mcp-scanner) | Pre-deploy | Commercial SaaS | AI-driven pattern detection in MCP source. | SaaS dependency; runtime layer not in the same product. |
| [Pipelock](/pipelock/) | Runtime agent-side proxy + pre-deploy CLI | Apache-2.0 core; Enterprise features under ELv2 | Sits between the agent and every MCP server, scans live traffic in both directions, plus a `pipelock mcp scan` subcommand for CI use (with `pipelock audit` and `pipelock git scan-diff` for related static surfaces). Tool poisoning + rug-pull + response injection + chain detection + session binding. | The runtime layer is process-isolation-strongest when deployed with proper network controls; without those, deployment shape matters more than feature parity. |
| [MCP Inspector](https://github.com/modelcontextprotocol/inspector) | Interactive inspection | New contributions Apache-2.0; earlier contributions remain MIT where the author hasn't relicensed | Official client for listing and calling tools, prompts, and resources on a server you run. | Vulnerability scanning is not documented in public docs. Without an OS keychain, secrets are stored in an unencrypted file unless you supply a key. |
| [Ramparts](https://github.com/highflame-ai/ramparts) | Pre-deploy scan of MCP servers and skill files | Apache-2.0 | YARA and LLM analysis, SARIF output, OWASP MCP Top 10 tags, and a drift check against a stored baseline. | Live blocking is not documented in public docs. Supply-chain checks query OSV.dev. |
| [MCP-Shield](https://github.com/riseandignite/mcp-shield) | Pre-deploy scan of installed configs | MIT | Hidden instructions, tool shadowing, exfiltration channels, and cross-origin violations. `npx mcp-shield`. | Deeper analysis uses an optional Claude API key. Runtime enforcement is not documented in public docs. |
| [mcp-context-protector](https://github.com/trailofbits/mcp-context-protector) | Runtime wrapper | Apache-2.0 | Trust-on-first-use pin. Blocks tool calls when the server configuration changes, until you approve it. | GitHub lists the repository as archived. |
| [Lasso MCP Gateway](https://github.com/lasso-security/mcp-gateway) | Runtime gateway you run | MIT | Sits in front of the servers in `mcp.json`. The `basic` plugin masks a listed set of token shapes. | Prompt-injection checks are on the `lasso` plugin, which needs a Lasso API key. They are not documented in public docs for the `basic` plugin. |
| [ToolHive](https://github.com/stacklok/toolhive) | Container runtime and gateway | Apache-2.0 | Each MCP server runs in an isolated container. Local Docker or Podman, or Kubernetes. | Inspection of tool-call arguments is not documented in public docs. |
| [ContextForge](https://github.com/IBM/mcp-context-forge) | Registry and proxy you host | Apache-2.0 | Federates MCP, A2A, and REST or gRPC behind one endpoint, with auth and rate limits. | Content scanning of tool arguments is not documented in public docs. |
| [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) | Transport bridge | MIT | Connects a stdio client to a remote SSE or Streamable HTTP server, and the reverse. | Security scanning is not documented in public docs. |
| [Prisma AIRS](https://docs.paloaltonetworks.com/prisma-airs/ai-runtime-security/airs-vm-firewall/detect-mcp-threats) | Licensed MCP threat detection | Commercial | Scans MCP tool definitions, inputs, and outputs, including prompt injection and DLP, on the cited deployment. | The cited page requires an AI Security Profile and a network intercept managed by Strata Cloud Manager or Panorama. A self-hosted scanner binary is not documented in public docs on that page. |
| [Pillar](https://www.pillar.security/platform/agentic-endpoint) | Endpoint inventory and pre-action control | Commercial | Inventories agents and MCP servers on managed machines and can block a risky command before it runs. | A public repository for that agent is not documented in public docs on the cited page. |
| [Noma](https://noma.security/solutions/ai-supply-chain-security) | Supply-chain assessment and access policy | Commercial | Assesses MCP servers for unpinned versions, tool permissions, packages, known vulnerabilities, and exposed secrets. | A public repository for the scanner is not documented in public docs on the cited page. |
| [Zenity](https://zenity.io/blog/zenity-joins-the-cursor-marketplace) | Cursor agent and MCP inventory | Commercial | Maps each Cursor agent to the MCP endpoints it uses. | Inspection of tool-call arguments is not documented in public docs on the cited post. |

What is intentionally not in the table:

- [SlowMist MCP Security Checklist](https://github.com/slowmist/MCP-Security-Checklist) is a static reference document, not a scanner. Useful for review, not a tool you run.
- [Vulnerable MCP Project](https://vulnerablemcp.info/) tracks known-vulnerable servers but is not a scanner you point at your own servers.
- "Runtime guardrails inside an MCP server" (the server protecting itself) is a different lane from "runtime guardrails between the agent and the MCP server." Cisco MCP Runtime Guardrails sits in the first lane. Pipelock sits in the second.
- Hook and supply-chain tools such as [Prismor](https://github.com/PrismorSec/prismor) are adjacent, not replacements for scanner or proxy coverage. They can block risky tool calls and package installs inside supported agent runtimes, but they do not sit between every agent process and the network.

### How to read the lanes

The two lanes solve different problems.

**Pre-deploy scanners are necessary, not sufficient.** They catch code-level flaws, schema injection vectors, poisoned descriptions that exist at scan time, and known-vulnerable dependencies. Endor Labs analyzed 2,614 MCP implementations using static analysis alone and found path-traversal-prone file operations in 82% and code-injection-related APIs in 67%. That work is real; pre-deploy scanning closes a real gap.

The bound is what scanners cannot see: a clean tool description that returns a poisoned response, a description that changes after approval, a sequence of three calls where each individual call looks fine, or a session that talks to a tool not in the original inventory. Those threats only appear once traffic is flowing.

**Runtime scanners catch what scanners cannot see at scan time.** They sit on the wire, watch every `tools/list`, every `tools/call` argument, and every response, and apply the same content-detection logic to live bytes that a pre-deploy scanner applies to static code. The bound is what runtime scanners cannot see: the source-code flaw an attacker has not yet exercised, the dependency CVE in a tool the agent has not yet called.

The combined posture is pre-deploy on every approval + runtime on every session. Vendors that sell only one lane are not wrong, they are partial.

### Where Pipelock fits in this landscape

Pipelock is the open-source agent-side option in the runtime lane. Specifically:

- Runtime MCP proxy that wraps any MCP server (stdio, Streamable HTTP, HTTP reverse proxy) and scans bidirectionally.
- Tool poisoning detection on `tools/list` responses with rug-pull description-drift detection across the session.
- Prompt injection detection on `tools/call` results (same 6-pass normalization that protects HTTP responses).
- DLP scanning on `tools/call` arguments ({{< stat key="dlp_patterns" >}} credential patterns, encoded-form coverage).
- Tool policy enforcement (allow / deny / redirect, shell-obfuscation detection on command-shaped arguments).
- Cross-call chain detection (subsequence matching against the session's tool-call history).
- Session binding (pins the tool inventory at session start, rejects unknown tools mid-session).
- Fail-closed defaults on parse error, scanner timeout, HITL timeout, and context cancellation.

Plus a pre-deploy lane on the same project: `pipelock mcp scan` runs against MCP configs, tool definitions, and policy files. CI-friendly, JSON-output, exit-code-driven. Same threat patterns, same project, same release line. `pipelock audit` and `pipelock git scan-diff` cover related static surfaces (workspace directories and git-diff change sets).

The repo also ships a standalone `pipelock-verifier` binary at `cmd/pipelock-verifier/` with subcommands for audit-packet, chain, and receipt verification (offline verification of signed action receipts and chain integrity). Download the standalone verifier archive from the [Pipelock releases](https://github.com/pipelab-org/pipelock/releases). The shipping pre-deploy lane is `pipelock mcp scan`; runtime is the MCP proxy. Use both.

### Choosing between scanners

If you can only run one lane, pick the lane that matches your dominant threat. If you control the MCP servers and care about source-code flaws, run a pre-deploy scanner. If you do not control the MCP servers (Claude Desktop talking to third-party servers, IDE agents pulling from registries, hosted MCP gateways), run a runtime scanner because the source code is not yours to scan.

If you can run both, run a pre-deploy scanner in CI for the servers you ship and a runtime scanner in front of every agent that connects to MCP. Independent layers. Each catches what the other cannot see.

Open-source bias: prefer open-source in both lanes so the scanning logic is auditable. Snyk Agent Scan, Cisco MCP Scanner, and Proximity in the pre-deploy lane; Pipelock in the runtime lane. Hosted and commercial tools (mcpscan.ai, NeuralTrust, Enkrypt, Cisco AI Defense, Snyk Evo, Akto) layer on top if you need enterprise reporting and managed service.

## Evaluation checklist

When choosing an MCP security tool, check these capabilities:

**Bidirectional scanning.** Does it inspect both outbound traffic (tool arguments) and inbound traffic (tool responses, tool descriptions)? Many tools only scan one direction. Credential leaks happen outbound. Injection happens inbound. You need both.

**Encoding evasion handling.** Does it decode base64, hex, URL encoding, and Unicode before scanning? Attackers encode payloads to bypass pattern matching. A tool that only scans plaintext misses encoded secrets and obfuscated injection.

**Session awareness.** Does it track tool descriptions across the session lifetime? A rug-pull attack sends clean descriptions first and poisoned descriptions later. Session-aware tools detect the change.

**Protocol coverage.** Does it cover only MCP, or also HTTP and WebSocket? AI agents don't just use MCP. They fetch web pages, call REST APIs, and open WebSocket connections. If your MCP security tool ignores HTTP traffic, you have a gap.

**Deployment model.** Self-hosted or SaaS? Open source or proprietary? Single binary or distributed system? These aren't security features, but they determine whether the tool fits your environment.

## Sources checked November 14, 2026

These are the pages read for the tools added on that date. Older sections keep the check date already written next to them.

- MCP Inspector README and LICENSE: <https://github.com/modelcontextprotocol/inspector>
- Ramparts README: <https://github.com/highflame-ai/ramparts>
- MCP-Shield README: <https://github.com/riseandignite/mcp-shield>
- mcp-context-protector README: <https://github.com/trailofbits/mcp-context-protector>
- Lasso MCP Gateway README and LICENSE: <https://github.com/lasso-security/mcp-gateway>
- ToolHive README: <https://github.com/stacklok/toolhive>
- ContextForge README: <https://github.com/IBM/mcp-context-forge>
- mcp-proxy README: <https://github.com/sparfenyuk/mcp-proxy>
- Docker MCP Gateway README, including its description of the MCP Toolkit: <https://github.com/docker/mcp-gateway>
- MCP stdio transport, specification revision 2025-11-25: <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio>
- Prisma AIRS, Detect MCP Threats: <https://docs.paloaltonetworks.com/prisma-airs/ai-runtime-security/airs-vm-firewall/detect-mcp-threats>
- Pillar agentic endpoint: <https://www.pillar.security/platform/agentic-endpoint>
- Noma AI supply chain: <https://noma.security/solutions/ai-supply-chain-security>
- Zenity Cursor marketplace post: <https://zenity.io/blog/zenity-joins-the-cursor-marketplace>

## Further reading

- [MCP Security](/learn/mcp-security/): the full MCP security threat model, best-practices baseline, and runtime defense map
- [MCP Proxy](/learn/mcp-proxy/): how Pipelock's MCP proxy scans bidirectionally
- [MCP gateway](/learn/mcp-gateway/): gateway vs proxy, market landscape
- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/): the attack that hides in tool descriptions
- [Pipelock](/pipelock/): all features, one page
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
