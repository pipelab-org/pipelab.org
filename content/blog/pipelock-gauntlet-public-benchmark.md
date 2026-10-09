---
title: "I published my benchmark scores. Your turn."
linkTitle: "Pipelock Benchmark Scores"
date: 2026-04-06
lastmod: 2026-08-02
author: "Josh Waldrep"
summary: "Every score published. Pipelock runs the gauntlet before every release and posts the results for anyone to inspect."
description: "Pipelock runs agent-egress-bench before every release and publishes the scores. The gauntlet is open to any security tool. Submit your results."
tags: ["ai-security", "benchmark", "pipelock", "agent-firewall"]
blog_cat: "releases"
updates:
  - date: 2026-08-02
    note: "The corpus has grown to 213 logical cases across 18 categories since this was written."
    link: /gauntlet/
---

The Pipelock benchmark is public. Back in March I released [agent-egress-bench](/blog/agent-egress-bench-benchmark-corpus/), a test corpus for evaluating security tools that sit between AI agents and the network. 72 cases at the time. The idea was simple: if your tool claims to catch credential exfiltration, prove it against a shared set of attacks.

That corpus has grown to 197 logical cases across 18 categories. And now there's a public scoreboard.

## The gauntlet

[pipelab.org/gauntlet](/gauntlet/) shows benchmark results for any tool that runs the test suite and submits scores. Right now that's just Pipelock, because nobody else has submitted yet. That's the point of writing this.

The scores break down into four metrics per category:

**Containment** is the one that matters most. What percentage of attacks did the tool actually block? Not detect, not log, not flag for review. Block. If a credential left the network, containment failed.

**False positive rate** is how often the tool blocked clean traffic. A tool that blocks everything gets 100% containment and a useless false positive rate. Both numbers matter.

**Detection** and **evidence** measure whether the tool identified what kind of attack it stopped and whether it produced structured proof. A tool can block an attack without knowing which scanner caught it, and without producing a machine-readable finding. Containment alone is table stakes. Detection and evidence are what make the block auditable.

## What's in the current corpus

The corpus covers the attack surface between an AI agent and the network. Not model behavior. Not prompt quality. The wire.

URL DLP, request body DLP, header DLP. Prompt injection in fetched content and in TLS-intercepted responses. MCP input scanning, tool poisoning, chain detection, MCP drift. A2A message scanning and Agent Card poisoning. WebSocket DLP. SSRF bypasses. Hostname exfiltration. Multi-layer encoding evasion. Shell obfuscation. Cryptocurrency and financial credential detection. The current split is 149 block-expected attack cases, 47 allow-expected false-positive controls, and one warn-class drift case.

Each case is a self-contained JSON file with the payload, expected verdict, severity, and a machine-readable explanation of why. No vendor lock-in. The runner is a few hundred lines of Go with zero dependencies outside the standard library.

## How Pipelock scores

The original published Pipelock v2.1.2 run against the April corpus: 96.2% containment on applicable cases, 89.4% full corpus, 0% false positive rate. 142 of 151 cases were applicable. The 9 not-applicable cases required a DNS rebinding test fixture that was impractical in automated runs.

Most categories hit 100%. Two don't, and I know exactly why.

**Request body at 50%**: the scan API doesn't do recursive base64/multipart decode yet. Four cases miss because the secret is double-encoded in a multipart body and the scanner only peels the first layer.

**Headers at 80%**: one SendGrid token case uses a format the header DLP pattern doesn't match yet.

Both are queued. I chose to ship with these gaps visible rather than hide them.

You'll also see some detection/evidence columns at 0% for response_fetch, ssrf_bypass, and url (at 72.7%). Those are categories where Pipelock blocks correctly but the fetch endpoint returns `fetch_blocked` without scanner attribution labels. The block works. The structured proof-of-what-caught-it doesn't. Also in the backlog.

Nothing regressed. These are known gaps I specifically chose to leave room for. Publishing the scores means publishing the weaknesses too.

I put these numbers out because I think security tools should prove they work against something other than their own test suite. Internal tests are the floor, not the ceiling.

## How to submit your results

Build the runner, point it at your tool's profile, run it:

```bash
git clone https://github.com/luckyPipewrench/agent-egress-bench.git
cd agent-egress-bench/runner
go build -o aeb-gauntlet .
./aeb-gauntlet --cases ../cases --profile your-tool-profile.json --output results.json
```

The profile tells the runner what your tool supports (which transports, which capabilities) so it only scores applicable cases. Submit your results at [pipelab.org/gauntlet/submit](/gauntlet/submit/) or open a [discussion on GitHub](https://github.com/luckyPipewrench/agent-egress-bench/discussions).

The [methodology docs](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/gauntlet.md) explain scoring in detail. The [adoption guide](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/ADOPTION.md) walks through building a runner for your tool.

## Why this matters

Every tool in this space says they stop credential leaks. Most of them show a demo where they catch `AKIA` in a URL. That's the easy case.

What happens when the key is base64-encoded in a POST body? When it's split across five requests? When it's hex-encoded inside a tool argument nested three levels deep in a JSON-RPC call? When the exfiltration path is a WebSocket frame fragment?

Those are the cases that separate a real security tool from a demo. The gauntlet tests all of them against a shared corpus so you can compare apples to apples.

If your tool is good, the scores will show it. If it's not, you'll know exactly which categories need work. Either way, the data is public.

[View the gauntlet](/gauntlet/) or [submit your results](/gauntlet/submit/).
