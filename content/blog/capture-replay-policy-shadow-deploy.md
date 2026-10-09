---
title: "Capture and Replay: Testing Security Policy Without Production Risk"
linkTitle: "Capture and Replay Policy"
seoTitle: "Capture and Replay for Security Policy Testing"
date: 2026-05-12
author: "Josh Waldrep"
summary: "Changing a live security policy breaks workflows somewhere. Record real verdicts, replay against the candidate config, see the diff before you ship."
description: "Learn-and-lock records verdicts, replays candidate contracts, and reports the diff. Test Pipelock policy before promotion."
tags: ["ai-security", "agent-firewall", "pipelock", "policy", "kubernetes"]
related: ["pipelock-v240-release", "block-reason-headers-agent-debugging", "wedge-detection-security-proxy"]
faq:
  - q: "What is capture and replay for security policy?"
    a: "Capture and replay records the inputs and verdicts of a live security proxy in a structured journal, then replays those inputs against a candidate configuration to compute the verdict diff. The output is a report that says, for each captured request, what the live policy decided, what the candidate would have decided, and where the two disagree. The operator can review every disagreement before activating the candidate, instead of activating blind and watching production."
  - q: "What is the learn-and-lock pipeline in Pipelock?"
    a: "Learn-and-lock is Pipelock's policy compiler. It has four phases: observe (record live traffic), compile (turn observed traffic into a candidate contract), shadow (replay captured observations against the candidate without enforcing), and activate as a two-step lifecycle of ratify (operator approves rule intent) plus promote (the contract becomes active policy). Operators typically read the deterministic review markdown between compile and shadow. The flow shipped in v2.4. Lifecycle receipts cover ratification, promotion, rollback, drift, and redaction requests."
  - q: "Why use a contract instead of editing the config directly?"
    a: "Editing a config directly couples the change to the moment of promotion. The operator changes the file, the proxy reloads, the new policy is live. Any disagreement with reality becomes a production incident. A contract decouples specification from promotion: the operator generates the contract from observed traffic, replays it to find disagreements, fixes the disagreements, and only then promotes. The contract is signed and hash-addressed, which lets the operator prove what was approved was what was deployed."
blog_cat: "technical"
---

You cannot change a security policy in production without breaking somebody's workflow somewhere. Every allowlist update, every new DLP pattern, every tightened SSRF rule disagrees with at least one request that worked yesterday. The cost of finding the disagreements after promotion is the cost of a rollback under pressure: the agent fleet is paging, the dashboard is red, and the operator is editing YAML at 2 AM.

Capture and replay shifts the disagreements left. The proxy records what it saw and what it decided. A candidate policy gets replayed against the captured journal. The diff between live and candidate verdicts becomes a report. The operator reviews the report before promotion, not after. By the time the new policy goes live, the only surprises are the ones the operator already accepted.

The same deployment lesson appears in [subPath ConfigMap Mounts Don't Hot-Reload](/blog/subpath-configmap-no-hot-reload/): changing a policy object is not enough. You need proof that the running enforcement path will see and apply the change.

Pipelock's learn-and-lock pipeline is this pattern, with signed receipts on the lifecycle steps that change contract state. This post is the architecture, the design choices behind the cardinality cap and fidelity gates, and the lifecycle commands an operator runs.

## The four phases

Learn-and-lock has four phases. Activation is a two-step lifecycle inside the fourth. Each produces evidence the next step depends on:

- **Observe.** The proxy records URL verdicts, response verdicts, DLP verdicts, MCP tool-policy verdicts, and tool-scan verdicts to a JSONL journal. Each record carries the input summary that produced the verdict, the verdict itself, and a reference to the session and trace context. Encrypted payload sidecars can hold exact payloads when raw escrow is configured.
- **Compile.** The compile phase takes the journal and produces a candidate contract: a normalized description of the URL paths, MCP method shapes, and argument patterns the proxy observed. Path normalization caps cardinality so a contract built from a million `/users/{id}` requests does not produce a million rules. Operators can pin or split paths the normalizer collapses incorrectly.
- **Shadow.** The candidate contract gets replayed against more traffic. The proxy continues to enforce the live policy; the shadow contract produces verdicts in parallel. The output is a delta receipt: a signed record of every request where the candidate disagrees with the live policy, with severity and reason for each disagreement.
- **Activate** (two steps). **Ratify** — the operator reviews the candidate and marks rules as enforce, capture-only, or reject. Ratification emits a `contract_ratified` evidence receipt. **Promote** — the ratified contract becomes active policy. Promotion writes signed intent and committed receipts that identify the target manifest, prior manifest, operator key, and selector.

The sequence is observe → compile → review → shadow → ratify → promote. Each step produces evidence the next step depends on. The contract that gets promoted is the one that was ratified, which is the one whose shadow report the operator reviewed, which was generated from observed traffic. There is no implicit step where a config edit slips into the active state without going through the chain.

## What capture actually records

The capture journal is a stream of typed records, one per verdict site. The record fields cover the surface needed to replay deterministically:

- **The transport.** Fetch, forward, CONNECT, WebSocket, MCP stdio, MCP HTTP, body scan. Replay needs to know which scanner to invoke.
- **The subsurface.** A label for the specific hook site, like `forward_url` or `dlp_mcp_input`. Replay uses the subsurface to dispatch to the right scanner method.
- **The input.** A replayable summary in the JSONL record, with optional encrypted sidecar payloads when raw escrow is configured.
- **The verdict.** Allow, block, warn, or strip, with the matching pattern names and any classification details.
- **The session and trace context.** Replay of stateful surfaces (rate limiting, cross-request exfiltration, MCP tool baselines) needs the order and grouping of records to match production.

The record envelope reuses the existing Pipelock recorder, which gives the journal hash chaining, signing, retention, and rotation by default. The capture schema is versioned separately from the recorder envelope so the journal format can evolve without breaking older recordings.

## Why path normalization caps cardinality

A naive compiler would produce one rule per observed URL path. For a working agent fleet that is millions of distinct paths, most of which are the same shape with different IDs. The compiled contract would be useless: too long to review, too brittle to maintain, too slow to evaluate.

Path normalization collapses paths with structural similarity. A request to `/users/123/profile` and a request to `/users/456/profile` collapse into `/users/{id}/profile`. The normalizer is conservative; it only collapses when the variable component looks like an identifier (numeric, UUID-shaped, or a short token), and it caps the cardinality so a path with too many distinct values stays unnormalized. The cap exists because some paths really do have a small fixed set of values where each value is its own rule, and collapsing those would be wrong.

Operators can pin a path that should not be normalized (`/admin` is `/admin`, not `/{role}`) or split a path that should be more granular than the default (`/api/v1/foo` is different from `/api/v2/foo`, even though the normalizer might collapse them). The pin and split commands are the operator's escape hatch for cases where the heuristics get the wrong answer.

The contract that comes out of the compile phase is something a human can review. Hundreds or low thousands of rules, not millions. Each rule corresponds to a request shape the proxy actually saw. The reviewer reads the contract and asks "is this the policy I want," instead of writing one from scratch.

## Why fidelity gates exist

Replay produces verdicts against captured records. Replay is only useful if the verdicts it produces match the verdicts the live proxy would produce given the same inputs. The fidelity gates are the checks that hold the replay engine to that standard.

A simple example: an SSRF check during replay needs to see the same DNS resolution as the live proxy. If replay re-resolves a hostname and gets a different IP, the SSRF verdict changes for reasons that have nothing to do with the policy under test. Fidelity gates handle this by either pinning the resolution from the captured record or skipping the SSRF check during replay and reporting the path as "stateful, not replayable."

A harder example: cross-request exfiltration depends on session history. Replay has to process the journal in order so the second request in a sequence sees the first. The replay engine reads the journal as an ordered stream, not a parallel batch, to preserve the history. The fidelity gate flags any replay that deviates from order.

The list of stateful surfaces is small but real: URL rate limiting, URL data budget, MCP chain detection, MCP session binding, adaptive escalation, HITL overrides. Each has its own fidelity gate. Replay against a journal where the order is wrong, the session is missing, or the surface is skipped is replay against a different policy than the live proxy ran. The gates make the difference visible.

## Shadow delta receipts

The output of the shadow phase is a delta receipt, signed with the same chain as every other Pipelock receipt. The receipt has, for each request where the candidate disagreed with the live policy:

- The request shape (transport, subsurface, normalized input).
- The live verdict.
- The candidate verdict.
- The classification of the disagreement: false-positive, false-negative, allowed-now-blocked, blocked-now-allowed, or neutral.

The receipt does not contain the raw request bodies. Those stay in the encrypted payload sidecar. The receipt is a summary an operator can review at scale, with pointers into the sidecar for the cases that need closer inspection.

A contract that produces zero deltas is one that exactly matches live. Useful for a baseline, less useful as a candidate for change. A contract with too many deltas is too aggressive a change for one promotion; the operator can split it into multiple smaller changes, each with its own shadow report. The right delta count depends on the change being made; the report makes the count visible so the operator can decide.

## The lifecycle commands

Pipelock ships the lifecycle as CLI commands:

- `pipelock learn observe` runs observation and writes capture evidence.
- `pipelock learn compile` builds a signed candidate contract.
- `pipelock learn review` renders deterministic review markdown.
- `pipelock learn shadow` replays captured observations against the candidate and writes a shadow report.
- `pipelock learn diff` compares two shadow JSON reports.
- `pipelock learn ratify` records operator approval choices.
- `pipelock learn promote` makes a ratified contract active.
- `pipelock learn rollback` returns to a previously accepted manifest.
- `pipelock learn forget` removes a rule from a candidate, signs the reduced candidate, and writes a tombstone.
- `pipelock learn split` and `pipelock learn pin` fix over-broad path normalization before ratification.

The runtime evaluation hooks for active contracts run in the proxy on every request once promotion lands. The lifecycle receipts cover the promotion moment; the verifier can prove the contract running in production matches the contract that was ratified. If the artifact on disk has been modified since signing, promotion refuses.

## Why this beats blind config edits

Three failure modes that capture and replay catches before promotion:

- **Tightened DLP that breaks a real workflow.** A new pattern matches a string the agent fleet was sending in legitimate requests. Without replay, promotion produces a wave of failed requests. With replay, the delta receipt shows every request the new pattern would have blocked, and the operator either keeps the pattern (blocking real traffic the operator now classifies as exfiltration) or refines the pattern (so the legitimate string stops matching).
- **Loosened allowlist that exposes a path.** An operator adds a domain to the allowlist for a new integration. Replay shows the new domain catches not just the integration's traffic but a category of requests the operator did not anticipate. The allowlist gets a more specific rule before promotion.
- **MCP tool policy change that breaks a tool chain.** A tool gets added to the deny-list because the operator thinks it is unused. Replay shows the chain detector firing on a sequence the new deny-list would break. The operator either accepts the breakage (the chain was the use case being deprecated) or revises the deny-list (the chain is in active use).

In each case, the value is shifting the discovery from "production now" to "before promotion." The cost difference between those two timings is the cost of a paged-on call. Replay's purpose is to never have that call.

## What this enables next

Once the lifecycle is in place, the same capture journals power adjacent work:

- **Regression testing.** A change in scanner code can be replayed against historic journals to confirm the verdicts have not drifted.
- **Compliance evidence.** A captured journal plus a signed contract is a record of "this is what we observed and this is what we approved."
- **Audit trail.** The signed receipts cover contract lifecycle decisions, so an auditor can verify the chain from observation to promotion.

None of those uses required new infrastructure. They fall out of the same capture-and-replay foundation, with the existing receipt chain providing the integrity story.

If you are running a security policy in production today and your change-management story is "edit YAML, hot-reload, hope," capture and replay is the upgrade path. The change-management story becomes "observe, compile, review, shadow, ratify, promote, with signed receipts around lifecycle decisions." The proxy stops being a place where mistakes happen and starts being a place where mistakes are caught before they happen.
