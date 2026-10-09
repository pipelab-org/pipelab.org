---
title: "Pipelock v2.6: Inspection Moves to the Operation Boundary"
linkTitle: "Pipelock v2.6 Release"
seoTitle: "Pipelock v2.6: Operation-Level Egress Control"
date: 2026-05-31
author: "Josh Waldrep"
summary: "Pipelock v2.6 decides egress by operation, not just by host: allow or deny individual API and GraphQL operations, catch prompt injection hidden in files, bridge hook-based agent events into the scanner pipeline, and harden MCP against the attack chains the NSA guidance calls out."
description: "Pipelock v2.6 adds operation-level request policy, file-borne injection detection, hook-based agent inspection, and MCP hardening from NSA guidance."
tags: ["pipelock", "release", "ai-security", "mcp-security"]
blog_cat: "pipelock"
faq:
  - q: "What is operation-level request policy in Pipelock?"
    a: "Operation-level request policy lets you allow or deny specific outbound operations rather than whole hosts. A rule can permit reads to an API but deny a particular GraphQL mutation, deny one sub-request inside a JSON batch, or block a multipart upload to a destination you otherwise trust. The policy is enforced on every transport, including per-frame on WebSocket, and a blocked call returns a machine-readable request_policy_deny reason."
  - q: "What is file-borne injection detection?"
    a: "Agents read files, and a file can carry a prompt-injection payload hidden in invisible Unicode or bidirectional control characters that a human reviewer never sees. Pipelock v2.6 scans files an agent is about to read on supported hook surfaces, and File Sentry can now terminate the protected agent session after an agent-attributed write finding instead of only alerting."
  - q: "What MCP hardening did Pipelock v2.6 add?"
    a: "Three things drawn from the NSA MCP security guidance: detection of tool parameters that try to extract the model's own context (system prompt, conversation history, tool list), detection of the lethal-trifecta tool-call chain where an untrusted source feeds a sensitive source feeds an external sink, and per-message signing with a replay cache on the MCP path."
---

Until v2.6, Pipelock made its allow-or-block call mostly on where an agent was going. Host, path, method. That catches a lot. It misses the case where the destination is fine and the operation is not: a GraphQL mutation buried in an allowed POST, one dangerous call inside a JSON batch of ten, a multipart upload to an API you trust for reads.

v2.6 moves the decision down to the operation itself.

## Allow and deny individual operations

The new [`request_policy`](/learn/request-policy/) block writes rules against operations, not just hosts. You can let an agent read from an API and still deny one specific GraphQL mutation. You can allow a JSON batch and reject a single sub-request inside it. The same logic runs on every transport Pipelock already inspects, including per-frame on WebSocket, and it covers the awkward shapes attackers reach for: GraphQL over GET, multipart bodies, batched calls. When a rule denies a call, the agent gets a machine-readable `request_policy_deny` reason it can act on instead of a silent failure.

A host allowlist tells you the agent talked to a trusted place. It cannot tell you the agent did a trusted thing once it got there. That gap is what this closes.

## Prompt injection hides in files now

An agent that reads files is reading attacker-controlled input the moment one of those files came from outside. The payload does not have to be visible. Invisible Unicode and bidirectional control characters can carry an instruction a human reviewer scrolling the file will never see. On supported hook surfaces, v2.6 scans files an agent is about to read for that class of smuggled injection.

File Sentry also grew teeth. It used to watch paths and alert. With `action: block`, an agent-attributed finding now cancels the proxy context and terminates the MCP child so the agent cannot keep acting after the leak. The write has already landed; use filesystem containment for write-time prevention. A per-path `required` flag still forces the path to fail closed if the watcher cannot arm. This is enforcement, with the boundary stated plainly.

## A bridge for agents that do not speak MCP

Plenty of agent frameworks do not run on MCP. Their tool calls and lifecycle events never touched Pipelock's scanners because there was no place to hook them. v2.6 ships a [hook bridge for Hermes Agent](/learn/hermes-integration/): an embedded plugin calls `pipelock hermes hook`, so supported hook events run through the same scanner pipeline everything else uses. `pipelock hermes install`, `verify`, and `rollback` manage that integration. Same inspection, same fail-closed defaults, on a surface that used to be dark.

## MCP hardening, straight from the NSA guidance

The NSA's MCP security guidance names specific patterns worth catching, and v2.6 catches three of them. Pipelock now flags tool parameters that try to pull the model's own context out of it, the system prompt, the conversation history, the tool list, the things a poisoned tool asks for when it wants to learn what it is talking to. It detects the lethal-trifecta chain, where an untrusted source feeds a sensitive source feeds an external sink, and raises a critical verdict on the sequence rather than on any one call. And it signs each message on the MCP path with a replay cache behind it, so a captured message cannot be replayed back at you.

## Compliance evidence grew

Assess now maps two more frameworks, NIST AI RMF and the HIPAA Security Rule, alongside what it already covered. The signed evidence bundle an auditor can verify offline now answers more of the rows they actually ask about.

## Get it

Pipelock is a single Go binary (Apache-2.0 core; Enterprise features under ELv2). Every scanner, every detection, every enforcement layer in this release is in the free core.

```bash
brew install luckyPipewrench/tap/pipelock
# or
go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest
```

The full list of changes is in the [CHANGELOG](https://github.com/luckyPipewrench/pipelock/blob/main/CHANGELOG.md). If you want to see what it blocks before you trust it, [run the assessment](/assess/) and read the signed report yourself.
