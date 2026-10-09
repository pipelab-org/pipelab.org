---
title: "Learn-and-Lock Agent Contracts"
linkTitle: "Learn-and-Lock"
subtitle: "Turn observed agent traffic into signed enforcement policy."
description: "Learn-and-lock turns observed AI agent traffic into signed Pipelock contracts, then tests them in shadow mode before enforcement."
date: 2026-05-04
lastmod: 2026-05-09
og_image: "https://pipelab.org/images/og/og-product.png"
learn_cat: operator
level: deep
tags:
  - learn-and-lock
  - contracts
  - agent-firewall
faq:
  - q: "What is learn-and-lock?"
    a: "Learn-and-lock is Pipelock's contract-compile pipeline. It observes agent traffic, compiles a signed candidate contract, replays the contract in shadow mode, then lets an operator ratify and promote the contract."
  - q: "Does learn-and-lock replace hand-written policy?"
    a: "No. It reduces hand-written allowlist work by deriving a starting contract from evidence. Operators still review, split, pin, ratify, promote, and roll back contracts."
  - q: "What does shadow mode do?"
    a: "Shadow mode replays captured observations against a candidate contract and reports verdict deltas such as actions that would have been blocked. It lets you inspect enforcement impact before changing live behavior."
  - q: "Can learned contracts be rolled back?"
    a: "Yes. Promotion and rollback write signed lifecycle receipts. Operators can promote a contract into the active manifest store and roll back to a previously accepted manifest."
---

Learn-and-lock is the path from "watch what this agent normally does" to "enforce that behavior as policy." It is the mechanism behind [progressive enforcement](/learn/progressive-enforcement/), the observe-first rollout pattern for deploying a blocking agent firewall without breaking production.

It exists because static allowlists get brittle fast. A coding agent may need GitHub, package registries, docs, search, issue trackers, MCP servers, and provider APIs. Writing every safe host, path, method, and data-class rule by hand is slow. Skipping policy is worse.

Pipelock `v2.4.0` adds a contract-compile pipeline that learns from recorder evidence, then forces review before enforcement.

## The pipeline

The command tree is:

```bash
pipelock learn observe
pipelock learn compile
pipelock learn review
pipelock learn shadow
pipelock learn diff
pipelock learn ratify
pipelock learn promote
pipelock learn rollback
pipelock learn forget
pipelock learn split
pipelock learn pin
```

The safe rollout shape is:

1. Observe.
2. Compile.
3. Review.
4. Shadow.
5. Ratify.
6. Promote.
7. Roll back if needed.

## Observe

`pipelock learn observe` runs the proxy in observation mode and writes recorder JSONL evidence to a capture directory.

```bash
pipelock learn observe --config pipelock.yaml --capture-dir /var/lib/pipelock/learn
```

The proxy still scans traffic through the normal Pipelock path. Observation adds capture metadata so the compile stage can infer candidate behavior.

Configure the capture root:

```yaml
learn:
  enabled: true
  capture_dir: /var/lib/pipelock/learn
  privacy:
    salt_source: "file:/etc/pipelock/learn-salt"
    public_allowlist_default: true
  inference:
    floors:
      min_sessions: 5
      min_events: 20
      min_windows: 3
```

Use an absolute `capture_dir`. Keep privacy salts out of public repos and use file permissions `0o600` or stricter.

For soak evidence, put the capture directory on durable storage. Pod-lifetime
scratch volumes such as Kubernetes `emptyDir` are acceptable for smoke tests,
but a restart can erase the JSONL corpus needed for `compile` and `shadow`.
Treat metrics as liveness signals; keep replayable capture artifacts on disk
before promoting a contract.

## Compile

`pipelock learn compile` reads recorder evidence and writes a signed candidate contract plus a review report.

```bash
pipelock learn compile \
  --config pipelock.yaml \
  --agent claude-code \
  --output candidate.yaml \
  --review review.md \
  --compile-manifest compile-manifest.json
```

The compiler uses inference floors so low-volume behavior does not become stable policy too early. Default floors are 5 sessions, 20 events, and 3 windows.

Path normalization uses `frequency_weighted_entropy_v1`. High-cardinality path segments can collapse into placeholders when there is enough evidence. The operator can split or pin segments before ratification.

## Review

`pipelock learn review` generates deterministic markdown for a candidate.

```bash
pipelock learn review candidate.yaml > review.md
```

Review is not a formality. This is where you catch over-broad host rules, path collapses that hide admin endpoints, and data classes that should stay capture-only.

## Shadow replay

`pipelock learn shadow` replays captured observations against a candidate contract and reports what would have changed.

```bash
pipelock learn shadow \
  --contract candidate.yaml \
  --agent claude-code \
  --out shadow.md \
  --out-json shadow.json
```

Use the shadow report to answer:

- Which observed actions would have been blocked?
- Which actions changed from allow to capture-only?
- Which rules are too broad?
- Which normal workflows are missing from the observation window?

Shadow mode can also persist signed `shadow_delta` receipts to a recorder chain. That gives the rollout an evidence trail before enforcement changes.

## Ratify

`pipelock learn ratify` walks candidate rules and lets an operator choose enforce, capture-only, or reject.

```bash
pipelock learn ratify --candidate candidate.yaml --interactive
```

Interactive decisions are:

- `e`: enforce
- `c`: capture-only
- `r`: reject

The command writes a newly signed candidate and a `contract_ratified` evidence receipt.

## Promote and rollback

Promotion writes a signed intent receipt, swaps the active manifest, then writes a committed receipt.

```bash
pipelock learn promote \
  --contract sha256:<contract-hash> \
  --selector claude-code \
  --contract-store /var/lib/pipelock/contracts \
  --roster /etc/pipelock/activation-roster.json \
  --roster-root-fingerprint <fingerprint> \
  --keystore /etc/pipelock/keys \
  --activation-key activation-primary
```

Rollback writes the matching rollback receipts and returns to a previously accepted manifest:

```bash
pipelock learn rollback \
  --to sha256:<manifest-hash> \
  --contract-store /var/lib/pipelock/contracts \
  --roster /etc/pipelock/activation-roster.json \
  --roster-root-fingerprint <fingerprint> \
  --keystore /etc/pipelock/keys \
  --activation-key activation-primary
```

In production mode, lifecycle operations require multiple activation authorities. That is deliberate. A learned contract is enforcement policy, not a local note.

## Live enforcement

Once a contract is promoted, Pipelock enforces it live on every URL-bearing transport plus the MCP tool-call surface. The runtime evaluator applies kill switch first, then scanner verdict, then contract verdict, then mode gating, in a single decision sequence on each gated path:

- forward proxy (absolute-URI and CONNECT tunneling)
- reverse proxy and redirect-refresh chains (the redirected leg is re-evaluated against the redirected URL, not the original)
- intercept proxy
- `/fetch`
- WebSocket `/ws` handshake
- MCP HTTP listener (`pipelock mcp proxy --listen --upstream`)
- MCP stdio-to-HTTP bridge (`pipelock mcp proxy --upstream`)
- MCP stdio subprocess wrap (`pipelock mcp proxy -- COMMAND`)
- `mcp_tool_call` rule kind via `runtime.EvaluateMCP` on every MCP transport mode

Two invariants hold across every gated transport. **Scanner block always wins over contract allow** — a `mcp_tool_call` allow rule (or any contract allow on a URL transport) cannot override a DLP, SSRF, or injection block. **Active contracts default-deny on unmatched destinations** — once a contract is promoted, requests that do not match an `http_destination` allow rule (or, for MCP, an `mcp_tool_call` allow rule) are blocked.

Mode gating preserves capture-mode silence (no contract block, no shadow record) and shadow-mode would-have-blocked telemetry (allow + record). Live mode is the only mode that produces a contract block.

The active manifest store reloads on filesystem change via fsnotify with a 100ms debounce and a 2s maximum-debounce cap, fail-closed on initial reload. The loader recovers a missed promote via the accepted-history chain walk so a crash between `promote-intent` and `promote-committed` cannot strand the runtime on a stale manifest. Kill switch overrides every gated transport regardless of contract verdict.

## Fix over-broad candidates

Two commands help clean candidate rules before ratification:

```bash
pipelock learn split --candidate candidate.yaml --rule <rule_id> --index 2 --out candidate-split.yaml
pipelock learn pin --candidate candidate.yaml --rule <rule_id> --segment admin --out candidate-pinned.yaml
```

Use `split` when a collapsed path segment should become literal again. Use `pin` when a literal segment should be treated as reserved and never collapsed.

## Forget a rule

`pipelock learn forget` removes one rule from a candidate, re-signs the reduced candidate, writes a signed tombstone for the prior contract hash, and emits a `contract_redaction_request` evidence receipt.

```bash
pipelock learn forget \
  --candidate candidate.yaml \
  --rule-id <rule_id> \
  --reason <legal-or-ticket-reference>
```

The original history blob is not overwritten. v2.5 enforces tombstones at activation and accepted-load time, so a tombstoned contract hash cannot be re-promoted or resurrected by a stale accepted-load path.

## What to avoid

- Do not promote a contract that has not run through shadow replay.
- Do not treat low-volume observations as stable behavior.
- Do not keep a broad path collapse just because it reduces rule count.
- Do not store privacy salts in the repo.
- Do not bypass the tombstone workflow by copying old accepted-load state between deployments.

## See also

- [Pipelock v2.5 upgrade guide](/learn/pipelock-v250-upgrade/)
- [Pipelock v2.5.0 release notes](/blog/pipelock-v250-release/)
- [Flight Recorder: AI Agent Audit Log](/learn/flight-recorder/)
- [Action Receipt Spec](/learn/action-receipt-spec/)
- [Pro Reference Deployment](/learn/pipelock-pro-reference-deployment/)
