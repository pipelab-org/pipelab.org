---
title: "Pipelock v3.1: Operator Evidence Gets Teeth"
linkTitle: "Pipelock v3.1 Release"
seoTitle: "Pipelock v3.1: Operator Evidence"
date: 2026-07-13
lastmod: 2026-08-02
author: "Josh Waldrep"
summary: "Pipelock v3.1 turns runtime enforcement into operator evidence: an enterprise dashboard, a free evidence viewer, stricter receipt verification, SIEM/fleet readiness, and a refreshed public Agent Egress Bench corpus."
description: "Pipelock v3.1 adds an operator dashboard, free evidence viewer, strict receipt verification, SIEM/fleet readiness, and public benchmark-corpus updates."
tags: ["pipelock", "release", "ai-security", "agent-firewall", "mcp-security"]
blog_cat: "pipelock"
updates:
  - date: 2026-08-02
    note: "The corpus has grown to 213 logical cases across 18 categories since this was written."
    link: /gauntlet/
faq:
  - q: "What is the headline change in Pipelock v3.1?"
    a: "Pipelock v3.1 is the operator-evidence release. It adds the dashboard and evidence surfaces needed to inspect what the runtime enforced, not just trust a log line or a model summary."
  - q: "Does v3.1 change the public benchmark?"
    a: "The public Agent Egress Bench corpus now has 197 logical cases across 18 categories: 149 block-expected attack cases, 47 false-positive controls, and one warn-class drift case. Pipelock publishes release-run results on the Gauntlet scoreboard."
  - q: "Is the evidence viewer paid?"
    a: "No. The evidence viewer is free. Enterprise adds the fleet dashboard and managed operator workflows; the verifier story stays inspectable."
---

> Installation correction (2026-10-16): The `go install` command below doesn't install current Pipelock releases. Use the [current installation guide](/install/) for a release binary or a source build pinned to the release tag. The original post follows unchanged.


v3.1 is the release where Pipelock stops sounding like a proxy and starts looking like an operator system.

The core job is still the same: put a hard boundary between the agent and the network, scan the actual bytes that cross it, and fail closed when the request is unsafe. The change in v3.1 is the surface around that boundary. When a block happens, an operator can inspect the decision, trace the evidence, and verify the receipt instead of asking the agent what it thinks happened.

## Operator dashboard

Enterprise operators get a dashboard built for repeated incident work: agents, budgets, exemptions, fleet posture, evidence, and investigation surfaces in one place. It is not a marketing console. It is the glass you need when multiple agents are running under one boundary and somebody asks, "what changed, what was blocked, and what can we prove?"

## Free evidence viewer

The evidence viewer is free because verification should not sit behind a sales gate. Pipelock already emits signed action receipts and audit packets; v3.1 makes those artifacts easier to inspect, explain, and hand to someone else without asking them to trust your runtime.

That matters for security reviews. A model can summarize a run. A log can say a block happened. A signed receipt lets a verifier check the decision outside the agent process.

## Stricter receipts

v3.1 tightens the receipt and verifier story around overclaiming. Unknown signed fields are rejected instead of being silently accepted, receipt chains are checked more carefully, and coverage/evidence claims are treated as something a verifier must prove rather than something a producer gets to narrate.

The practical effect is simple: if evidence says it proves a boundary, the verifier has to agree.

## Public benchmark corpus refresh

The current public Agent Egress Bench corpus has 197 logical cases across 18 categories:

- 149 block-expected attack cases
- 47 allow-expected false-positive controls
- 1 warn-class drift case

The corpus covers DLP evasion, prompt injection, SSRF, tool poisoning, encoding chains, shell obfuscation, hostname exfiltration, WebSocket DLP, MCP drift, and A2A scanning. Pipelock runs the corpus against production binaries before release and publishes the results on the [Gauntlet scoreboard](/gauntlet/results/).

The one warn-class case stays visible. That is the point of a public benchmark: no hidden category cleanup, no private spreadsheet, no "trust us" score.

## Built for scrutiny

v3.1 also includes SIEM and fleet-readiness work, stronger exemption lifecycle behavior, Conductor drift and replay improvements, dashboard auth/RBAC improvements, and broader evidence surfaces across the operator path. The full implementation detail is in the [CHANGELOG](https://github.com/pipelab-org/pipelock/blob/main/CHANGELOG.md).

## Get it

Pipelock is a single Go binary (Apache-2.0 core; Enterprise features under ELv2). The firewall, scanners, and enforcement layers are in the open-source core. The dashboard and fleet operations are Enterprise surfaces.

```bash
brew install luckyPipewrench/tap/pipelock
# or
go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest
# or
docker pull ghcr.io/luckypipewrench/pipelock:3.1.0
```

Start with the [product page](/pipelock/), inspect the [proof stack](/proof/), then run the [public gauntlet](/gauntlet/) yourself.
