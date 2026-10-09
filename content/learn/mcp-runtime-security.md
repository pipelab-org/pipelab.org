---
title: "MCP Runtime Security: Live-Traffic Defenses for AI Agents"
linkTitle: "MCP Runtime Security"
seoTitle: "MCP Runtime Security: Live-Traffic Defenses"
subtitle: "What runtime inspection catches that pre-deploy scanning cannot: tool poisoning in responses, rug-pull drift, chain attacks, session-bound pinning."
description: "MCP runtime security covers live-traffic defenses pre-deploy scanners miss: tool poisoning in responses, rug-pull drift, chain attacks, fail-closed."
date: 2026-05-12
lastmod: 2026-05-12
faq:
  - q: "What is MCP runtime security?"
    a: "MCP runtime security is the practice of inspecting Model Context Protocol traffic while an agent is using it, not just before. It scans `tools/list` responses for poisoned descriptions, scans `tools/call` arguments for credential leaks, scans `tools/call` results for injected instructions and exfiltration, watches for tool description drift mid-session (rug-pulls), and tracks cross-call patterns (chains). Pre-deploy scanners catch a server before connection. Runtime catches the attacks that only appear once traffic is flowing."
  - q: "Pre-deploy MCP scanner versus runtime: what's the difference?"
    a: "Pre-deploy scanners (Cisco mcp-scanner, Invariant Labs MCP-Scan, mcpscan.ai, Proximity, NeuralTrust) check an MCP server before an agent connects to it. They read tool descriptions, check schemas, and flag suspicious patterns. They are necessary and not sufficient. They cannot catch a clean tool description that returns a poisoned response, a description that changes after approval (rug-pull), a call pattern that only becomes malicious when chained, or a session that talks to a tool it should not have access to. Those are runtime problems and require runtime inspection."
  - q: "Why does runtime inspection matter for MCP?"
    a: "MCP places tool descriptions and tool responses directly into the model's context window. The model treats both as instructions it can act on. A clean description with a malicious response (or vice versa) is enough to push the model into leaking data or calling the wrong tool. Static analysis cannot anticipate every response the model will receive, so the inspection has to happen on live traffic."
  - q: "What does runtime MCP security catch that scanners miss?"
    a: "Four classes: (1) prompt injection in tool responses where the description was clean, (2) rug-pulls where a server changes its tool descriptions after the initial approval, (3) cross-call chains where each individual call looks benign but the sequence is the attack, and (4) session-level integrity violations such as a tool appearing mid-session that was not in the original inventory."
  - q: "Is MCP runtime security the same as an MCP gateway?"
    a: "Not exactly. An MCP gateway typically handles routing, authentication, and rate limiting at the protocol layer. Some gateways include content scanning; many do not. MCP runtime security specifically means inspecting the payloads (descriptions, arguments, responses) for content threats. A gateway plus a runtime scanner is a useful combination; a gateway alone is not a runtime scanner."
  - q: "What is the OWASP coverage for MCP runtime threats?"
    a: "The OWASP MCP Top 10 covers tool poisoning (MCP03, with rug-pulls as a sub-technique), command injection in MCP servers (MCP05), insufficient authentication and authorization (MCP07), audit and telemetry gaps (MCP08), shadow MCP servers (MCP09), and context injection and oversharing (MCP10). Most of these need runtime inspection to detect; static analysis only covers them at the description-text level. Pipelock's runtime coverage maps to MCP03, MCP05, MCP07 (logging side), MCP08, MCP09, and MCP10."
  - q: "What does fail-closed mean in MCP runtime security?"
    a: "Fail-closed means that when the runtime scanner cannot make a decision (network timeout, parser error, ambiguous content), the request is blocked rather than allowed. The alternative (fail-open) is the bypass-by-default failure mode. Fail-closed is the only safe default for a security control that protects agent egress. Pipelock fail-closes on HITL timeout, parse error, context cancellation, scanner error, and DNS failure."
learn_cat: mcp
level: deep
tags:
  - mcp
  - runtime
  - security
  - owasp
---

## MCP runtime security in one paragraph

MCP runtime security is the practice of inspecting Model Context Protocol traffic while an agent is using it. It scans `tools/list` responses for poisoned tool descriptions, scans `tools/call` arguments for credential leaks, scans `tools/call` results for injected instructions, watches for tool description drift mid-session, and tracks cross-call patterns. Pre-deploy scanners check the server before the agent connects. Runtime scanners catch attacks that only appear once traffic is flowing. Both are necessary. Neither replaces the other.

## Why runtime is a distinct layer

Pre-deploy MCP scanners (Cisco mcp-scanner, Invariant Labs MCP-Scan, mcpscan.ai, Proximity, NeuralTrust, Akto) catch real risks and should be part of any MCP rollout. They read tool descriptions, validate schemas, flag obvious poisoning, and detect known-vulnerable server packages. Endor Labs reported security findings in 2,614 MCP implementations using static analysis alone. That work is necessary.

It is also bounded by what the scanner can see at scan time. A scanner reads `tools/list` at one moment, against one set of inputs. It does not see the response a server returns to a specific argument, the description the server returns three hours into a session, or the chain of three tool calls that together produce an exfiltration path. Those are runtime conditions.

The argument for runtime is the same argument as for a network intrusion detection system over a code scanner: code reviews catch design flaws, network inspection catches the bytes that actually move. For MCP, the attack surface is the live message, not the source code, because the live message is what enters the model's context.

## What runtime inspection catches

### Prompt injection inside tool responses

A poisoned description gets caught by a pre-deploy scanner. A poisoned response does not. The CyberArk "Poison Everywhere" research class shows tool servers where every individual description reads cleanly but the response to a routine call contains injected instructions that push the model into the next attack step. The agent never sees a "suspicious" tool. It sees a clean-looking tool whose output is the payload.

Runtime inspection scans every `tools/call` result through the same prompt-injection detection that protects HTTP fetched content. A response carrying `Ignore previous instructions and...` gets blocked at the boundary. The model never receives it.

### Rug-pull description drift

Invariant Labs disclosed a rug-pull class in April 2025 against the WhatsApp MCP server. A tool description passes initial review, then changes after approval, sometimes session by session. Install-time scanners only check the description once. Runtime scanners fingerprint every tool description on first sight and flag any change during the session.

Detection mechanics: hash the canonical description string on first observation, store the hash bound to the session, and compare against the description on every subsequent `tools/list` or `tools/call` involving that tool. A mismatch is a runtime event. The right response depends on policy (warn, ask, block); the detection itself is a runtime capability.

### Cross-call chains

A single tool call to read a config file is not an attack. A single tool call to read a credentials file is suspicious but not necessarily blocked. A chain of (read public file, read config file, read credentials file, send HTTPS request to external host) is the attack. Pre-deploy scanners cannot see the chain because it does not exist at scan time. Runtime chain detection maintains a per-session sequence and matches against known suspicious subsequences.

This is where runtime overlaps with anomaly detection. The chain is not just "any combination of these tools" but specifically the ordered sequence with the right argument shape. Chain detection requires session state, which is by definition a runtime capability.

### Session-bound tool pinning

A common attack pattern is for a tool to appear mid-session that was not present at the start. Either a new tool was registered, or the agent connected to an additional MCP server, or a server announced a tool dynamically. Without pinning, the agent treats the new tool as if it were approved.

Session binding fixes the tool inventory at the start of the session and rejects any tool not in the original list. This is purely a runtime control because the binding point is per session, not per deployment.

### Fail-closed defaults at the runtime layer

When the runtime scanner cannot decide (network timeout, parser error, ambiguous content, context cancellation), the request gets blocked rather than allowed. Fail-open is the bypass-by-default failure mode and the wrong default for a control protecting agent egress. Fail-closed is the only safe default for a runtime control. Pipelock fail-closes on HITL timeout, parser error, scanner error, DNS failure, and context cancellation.

## Where Pipelock fits

Pipelock is an open-source agent firewall (Apache-2.0 core; Enterprise features under ELv2). Its runtime MCP coverage maps to five primitives:

| Runtime primitive | What it does | What it catches that pre-deploy misses |
|---|---|---|
| Response scanning | Scans every `tools/call` result for prompt injection, DLP patterns, and encoding evasion (6-pass normalization). | Poisoned responses that originate from a clean-description server. |
| Tool policy | Pre-execution allow / deny / redirect on each tool call. Shell-obfuscation detection on command-shaped arguments. | Tools whose name was unblocked but whose specific argument pattern is an attack. |
| Chain detection | Subsequence matching across the session's tool-call history. | Multi-step attacks where each individual call looks benign. |
| Session binding | Pins the tool inventory at session start. Rejects unknown tools that appear mid-session. | Mid-session tool injection and unauthorized server announcements. |
| Kill switch | Six independent activation sources. Any one active blocks all traffic. | Operator-driven emergency stop independent of the agent's cooperation. |

The runtime layer pairs with the existing pre-deploy lane (the Pipelock CLI `scan` subcommand) so the same project covers static and runtime inspection.

## Pipelock vs the MCP runtime SERP

Most "MCP runtime" results on the live SERP are MCP server runtime guardrails (a server protecting itself) or MCP gateway products (routing and auth). The agent-side runtime inspection lane is narrower. Pipelock is positioned there: an open-source process the agent talks to before any MCP server, scanning the bytes on the wire in both directions.

If you arrived here looking for a runtime control inside an MCP server, you want a server-side framework like Cisco MCP Runtime Guardrails. If you arrived here looking for an agent-side enforcement point that protects the agent regardless of which MCP servers it connects to, Pipelock is in that lane.

## How this page relates to the rest of the cluster

The hub at [MCP Security](/learn/mcp-security/) covers the full taxonomy: definition, threat catalog, best practices, OWASP mapping, and rollout sequencing. This page is depth on the runtime layer specifically. The sibling pages:

- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/) goes deep on the tool-description and tool-response poisoning class.
- [How to Secure MCP](/learn/how-to-secure-mcp/) is the operator checklist.
- [MCP Vulnerability Scanner](/learn/mcp-vulnerability-scanner/) compares pre-deploy scanners.
- [OWASP MCP Top 10](/learn/owasp-mcp-top10/) is the framework crosswalk.
- [Agent Firewall](/agent-firewall/) is the architecture the runtime layer sits inside.
- [Agent Egress Control](/learn/agent-egress-control/) is the broader control surface beyond MCP.

## Getting started with Pipelock runtime MCP coverage

```bash
# Install
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Wrap an MCP server (stdio) through Pipelock
pipelock mcp proxy --config pipelock.yaml -- npx @modelcontextprotocol/server-filesystem /workspace

# Or run as an HTTP reverse proxy in front of a Streamable HTTP MCP server
pipelock mcp proxy --config pipelock.yaml --listen 0.0.0.0:9000 --upstream https://your-mcp-server.example
```

Every `tools/list`, `tools/call`, and response flows through the scanner. Every decision lands in the [flight recorder](/learn/flight-recorder/) audit log. Enabling a signing key adds Ed25519-signed action receipts on each emitted decision so a third party can verify what happened later.

## What runtime does not cover

Runtime MCP inspection does not replace pre-deploy scanning, package supply-chain verification, OAuth and identity controls on the MCP server side, network segmentation, or organizational policy. It is the live-traffic layer of a defense-in-depth stack. Use it alongside install-time scanners, server-side authorization, audit retention, and the rest of the OWASP MCP Top 10 mitigations.

## Further reading

- [MCP Security](/learn/mcp-security/) — the hub page covering taxonomy, threats, and rollout.
- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/) — definitive page on the poisoning class.
- [MCP Vulnerability Scanner](/learn/mcp-vulnerability-scanner/) — pre-deploy scanner landscape.
- [OWASP MCP Top 10 coverage](/learn/owasp-mcp-top10/) — framework mapping.
- [Shadow MCP](/learn/shadow-mcp/) — discovery and inventory of unauthorized servers.
- [Agent Egress Control](/learn/agent-egress-control/) — broader control surface beyond MCP.
- [Agent Firewall](/agent-firewall/) — the architectural pattern this runtime layer fits into.
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
