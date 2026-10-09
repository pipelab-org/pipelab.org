---
title: "Pipelock Agent Egress Control: the missing CI primitive for AI agents"
linkTitle: "Agent Egress Control launch"
date: 2026-05-10
author: "Josh Waldrep"
summary: "Pipelock Agent Egress Control is a GitHub Action that runs an agent script through Pipelock with kernel-enforced network containment and produces a signed Audit Packet a third party can verify."
description: "Pipelock Agent Egress Control v0.1.0: GitHub Action that wraps agent scripts in kernel-enforced network containment and writes signed Audit Packets."
tags: ["pipelock", "ci", "agent-egress-control", "github-action"]
blog_cat: "releases"
---

> **TL;DR.** Pipelock Agent Egress Control is a GitHub Action. It runs an agent script inside a Linux network namespace, routes mediated network traffic through Pipelock, and writes a signed Audit Packet a security reviewer can verify offline with the public key alone. v0.1.0 shipped 2026-05-09. Apache 2.0. [Marketplace listing](https://github.com/marketplace/actions/pipelock-agent-egress-control).

Agent jobs are starting to run inside pull requests, issue triage workflows, release pipelines, docs bots, and security automation. Those jobs touch source code, secrets, package registries, cloud APIs, MCP tools, and the public internet. A normal CI log can tell you what the agent said it did. An Audit Packet is meant to prove what the network boundary saw.

This is the launch post for `pipelock-agent-egress-action` v0.1.0, the first tagged release.

## What it does

Wraps a bash script in a Linux network namespace with iptables enforcement. The script runs as a non-root `pipelock-agent` user with sudo denied and capabilities dropped. Pipelock listens on the loopback interface as a separate non-root `pipelock-host` user. All HTTP, HTTPS, and WebSocket traffic from the script is routed through Pipelock at the kernel level. Direct network, DNS, and raw TCP are blocked inside the namespace.

After the run, the action writes a signed Audit Packet: receipt chain, verifier output, policy hash, decision counts, scanner config snapshot, posture metadata, and a human-readable summary. The receipts are signed by Pipelock at the network boundary. The agent process never signs anything. With the public key alone, a third party can verify the chain offline.

## Quick start

```yaml
- name: Pipelock Agent Egress Control
  uses: luckyPipewrench/pipelock-agent-egress-action@v0.1.0
  with:
    script-path: ./scripts/agent.sh
    config: .pipelock/ci.yaml
    audit-packet-dir: pipelock-audit-packet
```

## What is in scope for v0

On supported Linux runners (ubuntu-latest):

- HTTP and HTTPS egress through Pipelock at the kernel level.
- WebSocket destinations contained at the kernel level. Frame-level scanning when the script uses Pipelock's `/ws?url=...` proxy path.
- Direct network, DNS, and raw TCP blocked inside the namespace.
- Non-root execution for both the action script and the listener, with sudo denied and capabilities dropped.
- Signed receipt chain verified at end-of-run; Audit Packet written locally.

## What is out of scope for v0

Disclosed in the release notes rather than papered over:

- Nested Docker workloads launched from the action script.
- GitHub service containers.
- Sibling steps in the caller workflow that run outside the action boundary.
- macOS and Windows runners.
- SSH egress (planned for v0.2).
- MCP stdio (no network surface to enforce on).

If a path is not under the Pipelock control point, the action says so. No silent fail. No magic.

## Why a separate action from Pipelock Scan

The existing Pipelock Scan action is a static check on PR diffs: it grep-and-classify finds credential leaks and injection patterns in the changed code. Agent Egress Control is a runtime container: it executes an agent script inside Pipelock-enforced isolation and produces evidence about the run.

Different primitives, different scope, different SemVer cadence. Both belong on a CI workflow that runs AI agents. The two-action split keeps each artifact's CISO due-diligence story narrow.

## Where to go next

- [Marketplace listing](https://github.com/marketplace/actions/pipelock-agent-egress-control)
- [v0.1.0 release notes](https://github.com/luckyPipewrench/pipelock-agent-egress-action/releases/tag/v0.1.0)
- [Agent Egress Control setup guide](/learn/agent-egress-control/)
- [Pipelock action receipt spec](/learn/action-receipt-spec/)
- [Pipelock](/pipelock/)
