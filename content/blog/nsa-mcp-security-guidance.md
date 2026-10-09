---
title: "What the NSA's MCP security guidance says, and what an agent firewall does"
linkTitle: "NSA MCP Security Guidance"
date: 2026-05-22
author: "Josh Waldrep"
summary: "The NSA's May 2026 MCP guidance names filtering outgoing proxies, DLP, sandboxing, message integrity, output filtering, and local MCP scans. Here is where an agent firewall fits."
description: "NSA MCP security guidance names outgoing proxies, DLP, sandboxing, message integrity, and output filtering. Where an agent firewall fits."
tags: ["mcp", "agent-firewall", "ai-security", "compliance"]
blog_cat: "deep-dives"
---

The NSA published a Cybersecurity Information Sheet on Model Context Protocol security in May 2026. It is 17 pages, public release, identifier U/OO/6030316-26 (PP-26-1834), Version 1.0. Worth reading if you ship agents that touch MCP servers.

The line that matters for runtime controls is on page 11. The CSI recommends a "filtering outgoing proxy" or enterprise DLP for external MCP connections, with resource URLs and access methods pinned tightly enough to reduce unintended leakage.

That is the control shape Pipelock is built for: an inline agent firewall that sits in the data path and inspects HTTP, WebSocket, and MCP traffic. The CSI names traditional proxies such as Squid and tinyproxy, plus enterprise DLP. Those tools are useful, but they are not MCP-aware by default.

The guide is also blunt about maturity:

> MCP-aware security proxies remain limited and are still maturing.

That is accurate. The field is small. Runtime options include agent firewalls, MCP proxies, and MCP gateways with varying inspection depth. Pre-deploy scanners such as MCP Scanner, Ramparts, CyberMCP, and Proximity answer a different question: whether exposed or installed MCP servers look unsafe before an agent uses them.

This is not an endorsement claim. The CSI says references to commercial products do not imply U.S. Government endorsement, recommendation, or favoring. The useful reading is narrower: the guidance names a runtime control category, and an agent firewall is one way to implement that category.

## What the guide asks for

The CSI lists nine recommendations. The ones that map cleanly to a runtime proxy:

| CSI item | Where Pipelock does this |
|---|---|
| Filtering outgoing proxy plus DLP | Forward proxy with fixed-order request scanning and DLP before DNS resolution |
| Content length checks, keyword scanning, rate limiting, application-specific policy | URL length cap, DLP and injection patterns across normalization passes, rate limiter, MCP tool policy with allow/deny/redirect |
| Detection of indirect prompt injection or toolchain pivot attempts | Response scanner, MCP tool-result scanning, tool-chain detection when enabled |
| Logging and inspecting MCP tool output before passing it onward | MCP proxy with bidirectional JSON-RPC scanning and structured audit records |
| Tool name collision and drift detection | Tool inventory pinning across a session, including description and parameter fingerprinting |
| Constrain and sandbox tool execution | Linux containment with Landlock, seccomp, and network namespaces for wrapped processes |
| Detailed audit logs feeding into SIEM | Structured logs, event emission, webhooks, syslog, and signed action receipts where configured |

The honest version of that table is harder. Filtering proxy plus DLP catches anything that flows through Pipelock. It does not catch what flows around Pipelock. If the deployment doesn't block raw egress with NetworkPolicy or container network rules, the agent can route past the firewall. Capability separation is a deployment property. The binary alone doesn't enforce it.

Sandbox coverage is OS-dependent. Linux has the strongest path today; macOS sandboxing exists with different constraints. Tool name collision detection catches drift after first observation, not malicious registry resolution at the moment of first lookup. Indirect prompt injection scanning catches pattern-matchable cases, not every paraphrase or semantic-equivalence attack.

## What it doesn't cover yet

The guide recommends signing MCP messages with expiration timestamps and replay protection. Pipelock already has signed receipts and mediation metadata for audit and downstream verification, but that is not the same as protocol-native signing for every MCP JSON-RPC message. Treat per-message MCP signatures as a distinct control until the implementation, key distribution, and multi-agent trust roots are all explicit.

The guide also calls for scanning the local network for open MCP listeners. That's a different category from what a forward proxy does. The CSI names MCP Scanner, Ramparts, CyberMCP, and Proximity for that role. Pipelock and those tools are complements, not competitors. Pipelock answers "is this specific call safe to execute right now." The scanners answer "is this MCP server safe to install in the first place." A complete posture wants both.

## If you read the guide

Read the full 17 pages. The threat sections (poor approval workflows, token lifecycle, inconsistent behaviors, denial of service) describe failure modes that aren't all a proxy's job to solve. The MCP spec itself has gaps. Pipelock plays in the runtime egress slot. Static scanners play in the supply-chain slot. The spec, the registry, and the protocol level need their own moves.

The category exists now. The guide gives buyers and builders a concrete checklist: proxy/DLP, sandboxing, message integrity, output filtering, logging, patch tracking, and MCP server discovery. The work is making each control precise enough that operators can test it instead of trusting a diagram.

## References

- [NSA Cybersecurity Information Sheet: Model Context Protocol (MCP): Security Design Considerations for AI-Driven Automation](https://www.nsa.gov/Portals/75/documents/Cybersecurity/CSI_MCP_SECURITY.pdf) (PDF, May 2026, U/OO/6030316-26)
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
- [Agent Egress Bench: receipt verifier conformance corpus](https://github.com/luckyPipewrench/agent-egress-bench)
