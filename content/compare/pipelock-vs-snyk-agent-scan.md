---
title: "Pipelock vs Snyk Agent Scan"
linkTitle: "Pipelock vs Snyk Agent Scan"
seoTitle: "Pipelock vs Snyk Agent Scan: Scan vs Runtime"
subtitle: "A pre-deploy scanner that finds installed agents, MCP servers, and skills and checks them for injection and secrets, next to a runtime firewall that inspects the traffic they produce."
description: "Compare Pipelock with Snyk Agent Scan, the open-source scanner for agents, MCP servers, and skills. Pre-deploy scanning versus runtime inspection."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "sandbox"
compare:
  subject: "Snyk Agent Scan"
  subject_job: "Discovers the agent components installed on a machine (harnesses, MCP servers, skills) and scans them for prompt injection, sensitive data handling, and malware patterns before they run."
  subject_boundary: "Pre-deploy, on the developer machine or in CI; it starts MCP servers to read their tool descriptions"
  subject_source: "Open source, Apache-2.0 (Snyk); the former Invariant Labs mcp-scan repository redirects here"
  subject_pricing: "Free scanner; runs with a Snyk API token"
  subject_deploy: "uvx or release binary; PyPI package"
  pick_subject: "You want an inventory of every agent, MCP server, and skill on a machine, scored for injection, secret handling, and malware, before anything is trusted."
  pick_pipelock: "You need the traffic those components produce at runtime inspected on a routed path, and signed receipts when configured."
  pick_both: "Scan before you trust, inspect while it runs. Agent Scan catches a poisoned skill at install time; Pipelock catches the drift that appears after the scan."
sources:
  - label: "snyk/agent-scan README"
    url: "https://github.com/snyk/agent-scan"
    checked: 2026-09-01
    note: "Apache-2.0; discovers harnesses, MCP servers, and skills; scans for prompt injections, sensitive data handling, malware patterns; warns that scanning an MCP configuration executes its commands; installs via uvx or release binaries"
  - label: "snyk/agent-scan releases"
    url: "https://github.com/snyk/agent-scan/releases"
    checked: 2026-09-01
    note: "v0.6.1 from August 2026 was the newest release at the time of checking"
  - label: "Snyk blog: introducing Agent Security"
    url: "https://snyk.io/blog/introducing-agent-security/"
    checked: 2026-09-01
    note: "Agent Scan in open preview; Agent Guard, a runtime policy enforcer, in private preview; Agent Red Teaming in open preview"
faq:
  - q: "What's the difference between Pipelock and Snyk Agent Scan?"
    a: "Agent Scan is a scanner. It discovers the agents, MCP servers, and skills installed on a machine and checks them for prompt injection, sensitive data handling, and malware patterns before they are used. Pipelock is a runtime agent firewall. It inspects HTTP, WebSocket, and MCP traffic routed through it as the agent works and can emit signed receipts when a signing key is configured. One runs before deployment, the other during."
  - q: "Does Agent Scan run at runtime?"
    a: "The open-source scanner is a point-in-time scan. To read tool descriptions it starts the MCP servers defined in a configuration, which its README flags as executing those commands. It does not sit on the network path or mediate live traffic."
  - q: "Can I use both?"
    a: "Yes, and the combination is the natural one. Scan components before trusting them, then inspect the traffic they produce. A tool description that changes after the scan is exactly the case a runtime firewall exists for."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It inspects HTTP, WebSocket, and MCP traffic routed through it at runtime for credential leaks, prompt injection, SSRF, and tool poisoning, and can emit signed action receipts for mediated decisions when a signing key is configured.

**[Snyk Agent Scan](https://github.com/snyk/agent-scan)** is an Apache-2.0 scanner from Snyk. Its README describes discovering the agent components installed on a machine, including harnesses, MCP servers, and skills, and scanning them for prompt injections, sensitive data handling, and malware patterns. It installs with `uvx` or a release binary, runs with a Snyk API token, and warns that scanning an MCP configuration executes the commands defined in it, because that is how it reads the tool descriptions. The Invariant Labs mcp-scan repository redirects here.

Agent Scan checks what is installed before you trust it. Pipelock checks what it does while it runs. Snyk's announcement also names Agent Guard, a runtime policy enforcer in private preview; this page compares the open-source scanner only, because the guard is in private preview and its behavior is not documented publicly.

## Feature comparison

| Feature | Pipelock | Snyk Agent Scan |
|---------|----------|-----------------|
| **When it runs** | Continuously, on live traffic | Point in time, on demand or in CI |
| **What it examines** | HTTP, WebSocket, and MCP payloads as they flow | Installed harnesses, MCP servers, and skills |
| **Tool-description poisoning** | Scanned at runtime, fingerprinted, drift flagged | Scanned at scan time |
| **Rug-pull drift after install** | Detected when a description changes mid-session | Not a runtime function; re-scan to see it |
| **Credential scanning (DLP)** | 65 patterns, encoding-aware, on live traffic | Sensitive data handling checks on components |
| **Prompt injection** | Deterministic patterns with multi-pass normalization on responses | Injection checks on component content |
| **Malware patterns in skills** | Not in scope | Yes |
| **SSRF protection** | Yes | Not in scope |
| **Enforcement** | Blocks or warns on mediated traffic | Reports; not on the traffic path |
| **Signed receipts** | Yes, Ed25519, verifiable offline | Reports |
| **License** | Apache-2.0 core; Enterprise under ELv2 | Apache-2.0 |

## Where Snyk Agent Scan is stronger

**Discovery.** It finds what is installed, across harnesses, servers, and skills, which a network proxy never enumerates.

**Skill and malware checks.** Agent skills are scanned for malware patterns and unsafe handling before they are used. Pipelock doesn't analyze installed components.

**Fits CI.** A scan is a report you can gate a pipeline on.

## Where Pipelock is stronger

**Runtime truth.** A component that passed a scan can still change later. Pipelock reads the tool description every session, fingerprints it, and flags drift.

**Traffic inspection.** Credentials in a request body, an injected web page, an SSRF attempt: none of these are in a component scan. Pipelock inspects the traffic itself.

**Enforcement and evidence.** Pipelock blocks on mediated paths and can emit signed receipts for mediated decisions when a signing key is configured. A scanner reports.

## Scan, then inspect

The two tools stop failures at different moments. A poisoned skill in a marketplace is caught at install time by a scanner. A tool description that changes after the agent connected, or a response that carries an injection, is caught on the wire by a firewall. Teams that care about both run both.

## Further reading

- [Agent firewall vs agent sandbox](/compare/agent-firewall-vs-agent-sandbox/): where install-time and runtime controls sit
- [Pipelock vs DefenseClaw](/compare/pipelock-vs-defenseclaw/): another tool that scans components before they run
- [MCP tool poisoning](/learn/mcp-tool-poisoning/): what the scanners and the firewall both look for
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
