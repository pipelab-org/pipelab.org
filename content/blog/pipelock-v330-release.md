---
title: "Pipelock v3.3: The Budget an Agent Can't Reset"
linkTitle: "Pipelock v3.3 Release"
seoTitle: "Pipelock v3.3: Denial-of-Wallet Budgets"
date: 2026-07-30
author: "Josh Waldrep"
summary: "Pipelock v3.3 keys spend limits to the subject so a renamed or restarted agent cannot buy a fresh allowance, adds encoded-exfiltration detection across request bodies, WebSocket frames, and agent-to-agent traffic, ships opt-in encryption for the fleet audit queue, and can require TLS with SNI on forward-proxy CONNECT."
description: "Pipelock v3.3 adds subject-keyed denial-of-wallet budgets, encoded-egress detection, opt-in audit-queue encryption, and SNI-required CONNECT."
tags: ["pipelock", "release", "ai-security", "agent-firewall", "mcp-security"]
blog_cat: "pipelock"
faq:
  - q: "What is the headline change in Pipelock v3.3?"
    a: "Denial-of-wallet budgets now key on the subject making the request, not the MCP session id. An agent that renames itself or opens a fresh session no longer earns a new allowance, so the common reset trick stops working; the configured window still controls when allowance refreshes."
  - q: "Does v3.3 catch encoded data exfiltration?"
    a: "Yes. v3.3 adds opaque high-entropy egress detection across request bodies, WebSocket frames, and agent-to-agent traffic, so a secret that a plaintext pattern would miss because it was base64 or otherwise encoded still gets caught on the way out."
  - q: "Is the fleet audit queue encryption on by default?"
    a: "No. It is opt-in through a keyring. A follower with no keyring keeps a plaintext queue and says so at startup and in pipelock check, so upgrades do not break. Set a keyring and existing records migrate on startup; after that a missing or invalid key fails closed."
---

> Installation correction (2026-10-16): The `go install` command below doesn't install current Pipelock releases. Use the [current installation guide](/install/) for a release binary or a source build pinned to the release tag. The original post follows unchanged.


An AI agent that loops, or one an attacker has pointed somewhere it should not go, burns real money. Every tool call is an API call, and API calls have a bill. A per-session cap looks like protection until the agent opens a new session and gets a clean budget, or renames itself and gets a clean budget, or restarts and gets a clean budget. The limit was never the limit.

v3.3 fixes that reset path. Renaming the agent or opening a new session no longer buys a fresh allowance.

## Budgets keyed to who is asking

Denial-of-wallet budgets now key on a derived subject instead of the MCP session id. Only a bound or configured-default agent identity contributes an agent component to that subject. A self-declared name or a matched identity collapses to a client-only bucket, so calling yourself something new buys nothing. The same subject keeps the same allowance no matter how many sessions it opens.

`max_tool_calls_per_session` now limits per subject. The wall-clock budget changed meaning too: `max_wall_clock_minutes` is window-scoped active time, and the window defaults to 30 minutes when you do not set one. A long-lived session gets a fresh allowance every window, so pick a window that matches how you run.

Three budget fields that earlier releases accepted but never enforced are gone: `max_retries_per_endpoint`, `fan_out_limit`, and `fan_out_window_seconds`. A config that still sets any of them will not load, and the startup error names the field and the file. Pipelock refuses to start rather than pretend a limit is in force when it is not. Run `pipelock check --config /path/to/pipelock.yaml` against the new binary before you upgrade and it will tell you exactly what to remove.

## Encoded exfiltration, caught on the way out

A pattern that looks for a raw API key never sees the key once an agent base64-encodes it. v3.3 adds opaque high-entropy egress detection across request bodies, WebSocket frames, and agent-to-agent traffic. Encoded payloads that carry a secret out under the cover of looking like noise now trip on their own entropy on those visible content paths.

## Forward-proxy CONNECT that has to speak TLS

A CONNECT tunnel is a blind spot if you let raw bytes through it. v3.3 lets the forward proxy require TLS with SNI on CONNECT, and the shipped profiles turn it on when SNI verification is already enabled. Raw CONNECT bytes and TLS handshakes with no SNI get blocked. If a legacy client cannot send SNI, there is a documented opt-out, so you make that call on purpose instead of leaving the hole open by default.

## Fleet audit queue, encrypted when you want it

The Enterprise Conductor keeps a durable audit queue on each follower so evidence survives a restart. v3.3 lets you encrypt that queue at rest, opt-in through a keyring. Leave the keyring unset and the queue stays plaintext, and both startup and `pipelock check` name it as an advisory so it is never a silent default. Set a keyring and existing plaintext records migrate on startup. After that, a missing or invalid keyring, or a record encrypted under a key you no longer have, fails closed rather than falling back to reading it in the clear.

## Built for scrutiny

v3.3 keeps tightening the line between what evidence claims and what a verifier can prove. A rule bundle that cannot establish its own compatibility no longer loads on faith: a build that cannot resolve its version will not auto-satisfy a bundle's `min_pipelock`, and the runtime reports the shortfall through an audit event, `/stats`, and a Prometheus gauge instead of quietly running rules it could not vouch for. Trusted audit-packet verification now requires an external anchor, so `pipelock audit-packet` fails closed without a `--key` or an independently obtained `--expect-sha256` rather than blessing a packet on its own say-so.

Source builds also report a truthful version derived from version control now, instead of a placeholder. The full implementation detail is in the [CHANGELOG](https://github.com/pipelab-org/pipelock/blob/main/CHANGELOG.md), including the upgrade notes for every breaking change above.

## Get it

Pipelock is a single Go binary (Apache-2.0 core; Enterprise features under ELv2). The firewall, scanners, and enforcement layers are in the open-source core. The dashboard and fleet operations are Enterprise surfaces.

```bash
brew install luckyPipewrench/tap/pipelock
# or
go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest
# or
docker pull ghcr.io/luckypipewrench/pipelock:3.3.0
```

Start with the [product page](/pipelock/), inspect the [proof stack](/proof/), then run the [public gauntlet](/gauntlet/) yourself.
