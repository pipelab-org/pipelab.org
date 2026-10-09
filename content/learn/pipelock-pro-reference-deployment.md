---
title: "Pipelock Pro Reference Deployment"
linkTitle: "Pro Reference Deployment"
seoTitle: "Pipelock Pro Reference Deployment Pattern"
subtitle: "What the Pro feature surface looks like when you run it."
description: "Pipelock Pro reference deployment: per-agent budgets, source-CIDR routing, cross-agent federation, signed receipts. The architecture, not the marketing."
date: 2026-05-23
lastmod: 2026-05-30
learn_cat: operator
level: deep
tags:
  - pro
  - deployment
  - federation
  - budgets
  - architecture
---

Pipelock Pro adds multi-agent coordination on top of the same scanning, redaction, and receipt-emission that ships in the open-source build. The OSS binary already enforces a single-agent boundary. Pro is what happens when you have a fleet of agents that need to be told apart, billed apart, and audited apart.

This page documents the architecture pattern, not a particular deployment. The reference shape is real and exercised in production, but the names, namespaces, and addresses below are abstract.

## What the Pro feature surface looks like

A Pro deployment turns on four primitives that a single-agent OSS install never needs:

**Per-agent identity profiles.** Each agent gets a named profile in the companion config. The companion resolves every request to one of those profiles before scanning. The fallback `_default` profile still exists for traffic that does not match. Configured profiles get named-label metrics, named-actor receipts, and their own DLP, rate-limit, and budget overrides.

**Per-agent denial-of-wallet budgets.** Each profile carries a `budget` block. Configurable axes include request count per window, byte count per window, distinct destination count per window, MCP tool-call count per subject, same-tool retry storms, loop detection, and window-scoped active time. When a request would push the agent past one of these, the budget evaluator emits a `denial_of_wallet` audit event. HTTP request, byte, and domain budgets reject with `429 Too Many Requests`; MCP tool-call budgets reject with a JSON-RPC error when `dow_action` is `block`. With `dow_action: warn` the call is logged and allowed through. Limits and actions are per profile, not global.

**Source-CIDR profile routing.** A profile can declare `source_cidrs`. When multiple workloads share a companion, the companion maps the calling pod's IP to its profile before the request is scanned. One companion serves many agents, and each gets its own rules. Without Pro, one companion serves one agent.

**Cross-agent mediation envelopes.** When agent A calls agent B through their respective Pipelock companions, A's companion signs an RFC 9421 envelope over the request. B's companion verifies the signature against the configured trust list, rejects unsigned or untrusted callers on the protected path, and emits an inbound-verification receipt. Both ends produce signed evidence of the same call. Replay-window enforcement on the verifier closes the most common abuse path.

## The cross-agent shape

A two-agent Pro deployment looks like this:

```text
agent A -> agent A companion (Pipelock)
              signs the envelope as A's identity
              scans the outbound body, emits an outbound receipt
          -> agent B companion (Pipelock)
                 verifies A's signature and replay window
                 rejects unsigned or untrusted agents on the protected port
                 emits an inbound-verification receipt
              -> agent B
```

The protected path is in-cluster only. Human or browser traffic to agent B keeps the existing ingress route. NetworkPolicy on B's namespace allows A's pods to reach B only through B's companion, not directly. That makes the federation contract enforceable at the network layer, not just at the application layer.

The same envelope shape works for federated trust between two organizations. The trust list is the seam: each side declares which key IDs and trust domains it accepts on its inbound port.

## What the receipts look like

Two receipts get emitted for every cross-agent call. The outbound receipt names A as actor, includes the action ID, the verdict, the layer that adjudicated it, and the hash chain pointer. The inbound receipt on B's side names A as the verified actor, names B as the receiving identity, and either verifies-clean or rejects with a `block_reason`. Both are Ed25519-signed and chain-linked. A third party can replay both sides against the public key without contacting either Pipelock instance.

## Why the reference deployment matters

Pro features get sold on their description. They get believed on their evidence. Running them in front of a real workload, on a real fleet, with real receipts going to a real audit sink, makes the difference between a deployment doc and a deployment proof.

If a Pro feature cannot justify itself in the reference deployment, it does not belong in the tier. That gate runs continuously, on every release.
