---
title: "Pipelock v2.3.0: Class-Preserving Redaction and Generic SSE Streaming"
linkTitle: "Pipelock v2.3.0 Release"
date: 2026-04-24
author: "Josh Waldrep"
summary: "Pipelock v2.3.0 adds class-preserving request redaction and generic SSE streaming response scanning, plus a release-blocker pass and a tech-debt sprint."
description: "Pipelock v2.3.0 ships class-preserving redaction across request transports, plus inline scanning for text/event-stream responses."
tags: ["pipelock", "mcp", "redaction", "sse", "runtime-security"]
faq:
  - q: "What are the headline changes in Pipelock v2.3.0?"
    a: "Two features define the release: class-preserving request redaction and generic SSE streaming response scanning. Redaction rewrites matched secrets with typed placeholders before outbound requests leave the agent. Generic SSE scanning inspects streaming response events inline so token streaming keeps working without dropping body inspection."
  - q: "Is Pipelock v2.3.0 a breaking upgrade?"
    a: "No. Existing v2.2.x configs continue to load. Redaction is opt-in, and generic SSE streaming scanning is default-on with conservative block/warn controls under `response_scanning.sse_streaming`."
  - q: "Does redaction store the original secret?"
    a: "No. Pipelock rewrites matched values in transit and does not keep plaintext, escrow keys, or a decode path. The signed receipt records class counts, not the original value."
  - q: "Why does generic SSE streaming matter?"
    a: "Most agent chat UX depends on token streaming. Before v2.3.0, non-A2A SSE responses were buffered before scanning on the HTTP proxy paths. v2.3.0 scans each event before it flushes, so clean streams stay interactive and findings stop fail-closed."
  - q: "Where should operators start?"
    a: "Read the v2.3 upgrade guide first, then enable redaction with a narrow profile and watch receipts. For streaming providers, check whether any endpoint emits compressed SSE and switch those responses to identity encoding."
blog_cat: "releases"
---

Pipelock v2.2.0 was for operators. v2.3.0 is for the data on the wire.

Two headline features ship in this release. The first rewrites secrets in request bodies before they leave the agent. It covers HTTP fetch, forward proxy, TLS-intercepted CONNECT, reverse proxy, outbound WebSocket messages, and MCP `tools/call` arguments across the four MCP transports. The second scans generic Server-Sent Events responses inline across the forward proxy, TLS interception, and reverse proxy so streaming chat UX survives without dropping body inspection.

There is also a release-blocker hardening pass and a tech-debt sprint that closes a refactor arc going back to last release.

## Class-preserving redaction

When an agent tries to send a credential through the proxy, Pipelock can now rewrite the value in place with a typed placeholder before the request leaves. A matched AWS key gets replaced with `<pl:aws-access-key:1>`. The class label tells downstream tooling what shape the field had. The same plaintext maps to the same placeholder within a single request, so code that needs to correlate two fields with the same secret can still do so without seeing the secret.

The original value is never stored. Pipelock has no plaintext store, no key escrow, no later retrieval path. Redaction is irreversible by design. This is not a vault.

Coverage in v2.3.0:

- HTTP request bodies on fetch, forward, reverse, and TLS-intercepted CONNECT paths
- Outbound WebSocket client messages
- MCP `tools/call` `params.arguments` across stdio, HTTP/SSE, the HTTP listener, and MCP-over-WebSocket

The same matcher and profile selection runs on every surface. Tool responses are not redacted in this release; that is v2 work. The cliffs in v1 are explicit: only complete JSON payloads are rewritten, non-JSON bodies block unless the host is on `allowlist_unparseable`, malformed JSON blocks, key collisions block, and limit overflow blocks. Pipelock will not forward partially transformed data.

When at least one rewrite happens, the signed action receipt grows a `redaction` block with the profile and per-class counts. The plaintext is never on the receipt. Receipts on traffic that needed no redaction stay byte-identical to v2.2.x receipts, so existing verifiers continue to validate.

Full operator guide: [AI Agent Data Redaction](/learn/ai-agent-data-redaction/).

## Generic SSE streaming response scanning

Most agent UX today depends on token streaming. If a security boundary buffers the response, you have given up streaming. If it drops body scanning to keep streaming, you have given up scanning.

v2.3.0 does not pick.

Before this release, only Agent-to-Agent (A2A) streams got inline scanning. Generic LLM SSE responses (OpenAI chat completions, Anthropic messages, Kilo Gateway, anything else) were buffered before scan, which broke streaming UX and capped responses at 1 MB on the reverse proxy. Now every `text/event-stream` response streams with per-event DLP and prompt injection scanning across the forward proxy, TLS interception, and the reverse proxy. Clean data events flush immediately. A finding terminates the stream fail-closed before the bad bytes reach the client, with an `sse_stream` layer label on the receipt.

Compressed SSE is rejected fail-closed. Any `Content-Encoding` other than `identity` on a streaming response gets blocked before any bytes are forwarded. That closes the obvious bypass of asking for `gzip` SSE to skip body scanning.

Documented limitations are upfront in the operator guide, not buried. Cross-event injection detection only applies to A2A; generic SSE scans each event in isolation, so an attacker who splits a single payload across two sequential events evades the v1 detector. Unknown SSE extension fields are ignored by the parser. Both are tracked as v2.4 follow-ups.

Full operator guide: [SSE Streaming Response Scanning](/learn/sse-streaming-response-scanning/).

## Tech-debt sprint

Six tech-debt items closed alongside the headline features.

Runtime server lifecycle is now its own type with `NewServer`, `Start`, `Shutdown`, `Reload`, and `cleanup` methods, lifting the coverage ceiling on the runtime layer that was previously locked behind a 877-line god function. The 5,170-line `internal/config/config.go` got mechanically split into seven focused files, with a canonical-hash golden fixture pinning the split as byte-equivalent before any of the file motion happened. Runtime policy resolution consolidated into `Config.ResolveRuntime`, eliminating duplicate resolution paths across the CLI and MCP entry points. Eight transport-parity fixtures now lock down per-transport behavior on the MCP pipeline before each stage extraction, and 34 scattered `extractRPCID` / `extractToolCallName` / `extractToolCallArgs` calls collapsed to a single `ParseMCPFrame` per message.

A non-blocking CI debt tracker now surfaces gocyclo / gocognit / maintidx / dupl metrics per PR without blocking merges, so regression trends are visible without slowing review.

These are not external-facing changes, but they are the kind of work that has to happen before learn-and-lock policy compilation lands in v2.4. Doing it now keeps the next release on a clean foundation.

## Release-blocker hardening

Pre-tag review surfaced several gaps. All shipped in the v2.3.0 commit.

- The walker now fail-closed on duplicate JSON keys before redaction. JSON parsers collapse duplicate keys; an attacker who sends `{"key":"value","key":"different"}` could otherwise smuggle one of the two values past redaction.
- Generic SSE scanning now runs on each event's concatenated `data:` payload before forwarding. A2A keeps its existing field-aware scanner and rolling-tail detection.
- `DisableCompression: true` is set on the forward, reverse, and MCP HTTP client transports. This prevents a request leg from inadvertently re-compressing a response Pipelock had decompressed for inspection, and prevents the matching scanner-bypass.
- Hot-reload no longer races the redaction runtime. A reload during an in-flight redacted request now atomically swaps without leaving a window where the new policy is partly applied.
- MCP envelope and `params` duplicate-key check runs at every JSON-RPC ingress before `json.Unmarshal` collapses duplicates. Same reasoning as the request body walker, applied to the MCP transport surface.

## Bug fixes worth knowing about

A handful of v2.2.x edge cases got cleaned up in this release.

The dangerous-capability regex used by MCP tool scanning was over-matching nouns like `runtime`, `runner`, `launcher`, and `spawner`. Replaced the open `(execut|run|launch|spawn)\w*` pattern with explicit verb-form enumeration. Seven regression cases added.

Browser shield now short-circuits on non-HTML media. Image, audio, video, PDF, and arbitrary binary responses no longer go through the shield ceiling. HTML, JS, and SVG remain shielded.

DLP coverage downgrades on reload now warn. A reload that replaces a strong DLP regex with a weaker one under the same name was previously silent because the count stayed constant. It now surfaces as a reload warning, preserving the "hot reload must preserve security state" invariant.

SSRF DNS failures stay adaptive-neutral. Resolver outages no longer push sessions into airlock. Requests still block when DNS cannot be verified, but resolver failures stop accumulating threat evidence.

`context.Canceled` errors no longer reach Sentry, dropping a class of benign reports generated during normal shutdown.

## Upgrade

There are no breaking changes from v2.2.x. Existing configs continue to load. The new sections (`redaction` and `response_scanning.sse_streaming`) are opt-in or default-on with conservative defaults.

The full upgrade guide walks through enabling redaction with a staged rollout and the one or two existing endpoints that may start blocking under the new SSE scanner: [Pipelock v2.3 upgrade guide](/learn/pipelock-v230-upgrade/).

If you operate Pipelock in production and want to feed receipts into a SIEM, an audit pipeline, or a long-window LLM detection funnel, the new [Agent Evidence detection integration guide](/learn/agent-evidence-detection-integration/) walks the full path from `flight_recorder.signing_key_path` to a working Python receipt consumer.

Full changelog at the [public repo](https://github.com/luckyPipewrench/pipelock/blob/main/CHANGELOG.md).
