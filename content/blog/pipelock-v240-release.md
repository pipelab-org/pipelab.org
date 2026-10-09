---
title: "Pipelock v2.4.0: Learn-and-Lock Contracts for Agent Traffic"
linkTitle: "Pipelock v2.4.0 Release"
date: 2026-05-04
author: "Josh Waldrep"
summary: "Pipelock v2.4.0 adds observed-traffic contracts, shadow replay, block reason headers, inbound envelope verification, and Gemini redaction."
description: "Pipelock v2.4.0 ships learn-and-lock contracts, block reason headers, inbound envelope verification, Gemini redaction, and health checks."
tags: ["pipelock", "agent-firewall", "mcp", "runtime-security", "release"]
blog_cat: "releases"
faq:
  - q: "What is the headline feature in Pipelock v2.4.0?"
    a: "Learn-and-lock. Pipelock observes real agent traffic, compiles a signed behavioral contract, replays it in shadow mode, then lets an operator ratify and promote that contract with signed lifecycle receipts."
  - q: "Is Pipelock v2.4.0 a breaking upgrade?"
    a: "No public config break is expected for v2.3.x users. Existing v2.3 configs continue to run. New v2.4 controls are additive."
  - q: "Does generic SSE cross-event injection detection ship in v2.4.0?"
    a: "No. Generic SSE per-event scanning remains in place, but cross-event payload splitting is still only covered on A2A streams. The limitation stays documented rather than overstated."
  - q: "What should operators enable first?"
    a: "Start with block reason headers and the health watchdog because they improve operations without changing allow or block decisions. Then trial learn-and-lock in observe and shadow modes."
---

v2.3.0 protected more bytes on the wire. v2.4.0 turns observed agent behavior into policy, makes block decisions machine-readable, and extends the proof path across trust boundaries.

The release adds learn-and-lock contracts, block reason headers, inbound mediation envelope verification, SPIFFE actor formatting, a well-known HTTP Message Signatures key directory, Gemini redaction parser support, and a wedge-detection health watchdog.

## Learn-and-lock

Hand-written allowlists do not scale when agents call many APIs, use many MCP tools, and change behavior across tasks.

Learn-and-lock gives operators a safer path:

1. Observe real traffic with `pipelock learn observe`.
2. Compile recorder evidence into a signed candidate contract with `pipelock learn compile`.
3. Review the generated contract with `pipelock learn review`.
4. Replay captures against the contract in shadow mode with `pipelock learn shadow`.
5. Ratify rules, promote the contract, and roll back with signed lifecycle receipts.

The important part is the shadow step. Operators can see what would have been blocked before enforcement changes production behavior. Shadow replay emits delta reports and can write `shadow_delta` receipts into a recorder chain.

The contract pipeline also has operator affordances for cleanup. `pipelock learn split` demotes an over-collapsed path segment back to a literal. `pipelock learn pin` marks a segment as reserved before ratification. `pipelock learn forget` removes a rule from a candidate and writes signed tombstone evidence for local private erasure.

Once a contract is promoted, Pipelock enforces it live on every URL-bearing transport — forward proxy (absolute-URI and CONNECT), reverse proxy and redirect-refresh chains, intercept proxy, `/fetch`, WebSocket handshake, MCP HTTP listener, and MCP stdio-to-HTTP bridge — plus the `mcp_tool_call` rule kind on every MCP transport mode via the runtime evaluator. Scanner block always wins over contract allow on every gated path. Mode gating preserves capture-mode silence and shadow-mode would-have-blocked telemetry; live mode is the only mode that produces a contract block.

Full guide: [Learn-and-Lock Agent Contracts](/learn/learn-and-lock/).

## Block reason headers

Agents should not treat every block as an opaque 403. Full reference: [Block Reason Headers](/learn/block-reason-headers/).

v2.4.0 adds a stable block reason vocabulary on HTTP block paths:

- `X-Pipelock-Block-Reason`
- `X-Pipelock-Block-Reason-Version`
- `X-Pipelock-Block-Reason-Severity`
- `X-Pipelock-Block-Reason-Retry`
- optional layer and receipt pointer headers

The retry hint is the operational win. A `rate_limit` block can be retried with backoff. A `dlp_match` block should not be retried with the same payload. A `domain_blocklist` block needs a policy change.

WebSocket blocks carry the same taxonomy in the close-frame JSON payload. MCP stdio remains a separate JSON-RPC surface, so it does not get HTTP headers.

## Inbound envelope verification

Mediation envelopes already let downstream services verify what policy mediated a request. v2.4.0 extends that into inbound verification.

When `mediation_envelope.verify_inbound.enabled` is true, Pipelock verifies the inbound `Pipelock-Mediation` header and RFC 9421 signature before forwarding signed mediator traffic. This is for Pipelock-to-Pipelock federation and other explicitly signed clients; ordinary proxy clients should leave it off unless a signing wrapper is in front of them. Signatures must carry `created`, `expires`, and `nonce`, and nonces are stored in a bounded replay cache.

The verifier also enforces SPIFFE trust-domain pins when configured. That prevents one trusted peer key from attesting traffic for another trust domain.

Outbound envelopes now default to SPIFFE-formatted actors:

```text
spiffe://<trust_domain>/agent/<agent-name>
```

Signing proxies can expose their public envelope key at:

```text
/.well-known/http-message-signatures-directory
```

Unsigned envelope configurations return 404 for that route.

## Redaction provider plugins

v2.3.0 introduced class-preserving request redaction. v2.4.0 adds Gemini parser coverage and the provider plugin shape.

Pipelock now ships built-in provider profiles for Anthropic, OpenAI, and Gemini. All use the same JSON parser. Provider matching labels receipts and selects parser behavior; it does not exempt a field from redaction.

Third-party JSON providers can be configured with host patterns, optional path prefixes, and `parser: json`. Unknown JSON providers still fall back to the generic JSON parser, so a missing provider profile does not become a bypass.

## Health watchdog

Before v2.4.0, `/health` could return 200 when the HTTP handler was alive even if an internal subsystem was wedged. Full reference: [Health Watchdog](/learn/health-watchdog/).

The new watchdog adds a `subsystems` map and flips `/health` to 503 when any tracked subsystem is unhealthy:

- `scanner`
- `config`
- `session`
- `killswitch`
- `watchdog`

The scanner check uses hybrid detection. Normal scans update a passive heartbeat. If the heartbeat is stale, Pipelock runs a bounded synthetic probe under `interval/2`. Idle systems stay healthy because the probe reseeds the heartbeat. Wedged scanners fail the probe and surface to external supervisors.

## MCP HTTP listener SSE fix

The MCP HTTP-to-HTTP listener now routes SSE upstream responses through the same streaming reader path used by the stdio-to-HTTP bridge. `text/event-stream` upstreams stream message by message instead of failing as non-JSON-RPC bodies.

This is transport parity work, not a new public category. It closes a real silent-failure mode: SSE-streaming MCP servers (Stripe's MCP server, Lakera's MCP server, and similar) previously sat silent until the upstream finished or the client timed out.

## MCP proxy `--header` flag

`pipelock mcp proxy --header` lets you pass arbitrary request headers on the upstream-MCP connection. The flag ships with strict header hardening:

- Header names must be RFC 7230 tokens.
- Values are validated before trimming and reject ASCII control bytes, DEL, CRLF, and Unicode whitespace.
- Transport-managed headers are blocked case-insensitively: `Content-Type`, `Accept`, `Mcp-Session-Id`, `Content-Length`, `Transfer-Encoding`, and `Host`.

Both the CLI flag parser and the HTTP transport guard enforce the rejection so an attacker-controlled extra header cannot shadow Pipelock's session correlation or smuggle a request through header injection. The companion `--exempt-domain` flag now uses the same wildcard parity as every other domain check in the binary.

## EvidenceReceipt v2 envelope

Contract lifecycle and shadow evidence ship in a new **EvidenceReceipt v2** envelope alongside the existing ActionReceipt v1.

The two envelopes are distinguished by a top-level `record_type` field. v1 verifiers reject v2 with the explicit error `unsupported version 2 (expected 1)`, so the existing audit pipeline keeps working unchanged for non-contract-aware deployments.

EvidenceReceipt v2 carries thirteen typed payloads, including `proxy_decision`, `contract_ratified`, `contract_promote_intent`, `contract_promote_committed`, `contract_rollback_authorized`, `contract_rollback_committed`, `contract_demoted`, `contract_expired`, `contract_drift`, `shadow_delta`, `opportunity_missing`, `key_rotation`, and `contract_redaction_request`. Canonicalization is RFC 8785 JCS over typed structures, with strict unknown-field rejection recursive in every signed object.

A `pipelock-verify-python` 0.2.0 update is prepared alongside this release with the matching v2 verification surface: v2 verification for all 13 payload kinds, RFC 8785 canonicalization, an RFC 9421 well-known directory fetch helper, and a key-purpose authority matrix that rejects valid signatures from the wrong purpose or wrong root. Until 0.2.0 is published on PyPI, use the Go reference verifier for EvidenceReceipt v2. ActionReceipt v1 verification is unchanged; auditors verifying v1 chains see no behaviour change.

Full receipt format reference: [Action receipt spec](/learn/action-receipt-spec/).

## Capture pipeline observability

The learn-and-lock recorder needs to be observable during soak. v2.4.0 adds five Prometheus counters for the capture and federation paths:

- `pipelock_capture_dropped_total`
- `pipelock_capture_session_id_sanitized_total{reason}` with closed label set `unsafe_path`, `overlength`, `unknown`
- `pipelock_envelope_verify_total{result}` with closed label set `disabled`, `verified`, `missing`, `failed`
- `pipelock_learn_capture_records_total`
- `pipelock_learn_capture_dropped_total`

The dropped counters should stay at zero in steady state. A spike on `pipelock_capture_session_id_sanitized_total{reason="unsafe_path"}` after a config change is worth investigating.

For promotion-grade soak, keep the capture directory on durable storage. Metrics
prove that capture is ticking; replayable JSONL artifacts prove that the soak
survives a restart and can feed `learn compile` / `learn shadow`.

A static production-path block-reason matrix test fails the build if any new reason code ships without at least one production emit site or a documented exemption. Same idea on a different surface: ship the proof, not the claim.

## Synthetic replay regression harness

Shadow replay is part of how operators ratify a learned contract. It needs to be deterministic across releases or the rollout becomes brittle.

`v2.4.0` ships a synthetic replay regression harness: a hand-curated multi-session capture corpus, replayed against a frozen candidate config, with byte-comparison of the contract YAML, compile manifest, replay diff, review markdown, and rendered corpus JSONL against checked-in goldens. `make test-replay-harness` and a dedicated CI step run ahead of the broader test job, so any byte-level drift in compile, inference, or signing logic fails fast.

## What did not change

Generic SSE cross-event payload splitting is still a known limitation. Pipelock scans each generic SSE event, but a payload split across sequential events can evade the generic detector. A2A keeps its rolling-tail coverage. The SSE guide continues to state that limitation directly.

Browser Shield production-hardening and new IDE installer coverage are not part of this release. They remain future work.

## Upgrade

Most v2.3.x users can upgrade the binary first, then enable the new controls deliberately.

Start with the low-risk operator surfaces:

1. Read block reason headers in your agent or wrapper.
2. Confirm `/health` consumers tolerate the new `subsystems` map and 503 behavior.
3. Turn on inbound envelope verification only after trust lists and clock skew are configured.
4. Run learn-and-lock in observe and shadow modes before promoting any contract.

Full operator guide: [Pipelock v2.4 upgrade guide](/learn/pipelock-v240-upgrade/).

Full changelog at the [public repo](https://github.com/luckyPipewrench/pipelock/blob/main/CHANGELOG.md).
