---
title: "SSE Streaming Response Scanning"
linkTitle: "SSE Streaming Response Scanning"
subtitle: "Scan token streams without breaking streaming UX."
description: "Pipelock v2.3.0 streams every SSE response with per-event DLP and prompt injection scanning. OpenAI, Anthropic, Kilo Gateway, any LLM SSE."
date: 2026-04-24
lastmod: 2026-04-24
og_image: "https://pipelab.org/images/og/og-product.png"
faq:
  - q: "What is generic SSE streaming in Pipelock?"
    a: "Server-Sent Events is the wire format LLM providers use to stream tokens to a chat client. Before `v2.3.0`, only Agent-to-Agent (A2A) streams were scanned inline; generic LLM SSE responses (OpenAI chat completions, Anthropic messages, Kilo Gateway, and similar provider streams) were buffered before scanning, which broke streaming UX and capped responses at 1 MB on the reverse proxy. `v2.3.0` generalizes the streaming scan to every `text/event-stream` response across forward proxy, TLS interception, and reverse proxy."
  - q: "What gets scanned per event?"
    a: "Pipelock parses each SSE event per the WHATWG spec and runs scanning on the concatenated `data:` payload. Clean data events flush immediately; a finding terminates the stream fail-closed with an `sse_stream` layer label on the receipt."
  - q: "What is not scanned?"
    a: "Only data: payloads are scanned in the generic SSE path. Standard metadata fields (event:, id:, retry:) pass through unscanned, unknown SSE fields and malformed extension lines are ignored, and comment lines (: prefix) or keepalives are dropped before forwarding to the client."
  - q: "Are compressed SSE streams allowed?"
    a: "No. Any `Content-Encoding` other than `identity` on a `text/event-stream` response is blocked fail-closed before any bytes are forwarded. This closes the obvious bypass of asking for `Content-Encoding: gzip` to skip body scanning."
  - q: "Does cross-event injection get caught?"
    a: "Only on A2A. Generic SSE scans each event in isolation. An attacker who splits one injection payload across two sequential events evades the v1 detector. A2A's rolling-tail scanner still catches that case for A2A. Generalizing cross-event detection to any SSE stream is tracked as a `v2.4+` follow-up."
  - q: "What is `max_event_bytes` and how do I tune it?"
    a: "Per-event `data:` payload ceiling. Default is 65536 (64 KiB). Exceeding it on a single event terminates the stream as a finding. LLM token events are typically very small (a few bytes per token), so 64 KiB is a conservative default. Raise it if a provider you use emits batched-delta or full-response events in one frame."
  - q: "What if I want SSE to stream without scanning?"
    a: "Set `response_scanning.sse_streaming.enabled: false`. Pipelock still streams the response with per-read flushing so the chat UX stays smooth. The body does not get scanned. CONNECT-level visibility (host, TLS, headers) is preserved as before."
  - q: "Which transports got the streaming path?"
    a: "Forward proxy, TLS-intercepted CONNECT, and the reverse proxy. The reverse proxy previously buffered every response with a 1 MB cap, which both broke streaming and silently capped large legitimate responses. After `v2.3.0` the reverse proxy streams `text/event-stream` responses through the same flusher path; non-SSE responses continue to use the buffered path."
learn_cat: operator
level: deep
tags:
  - sse
  - streaming
  - scanner
---

Pipelock `v2.3.0` adds inline scanning for generic `text/event-stream` responses on the HTTP proxy paths, not only A2A. OpenAI chat completions, Anthropic messages, the Kilo Gateway streaming surface, and similar provider streams all flow through the same per-event scanner when they cross the forward proxy, TLS interception, or reverse proxy.

Token-by-token chat UX is preserved. A finding terminates the stream fail-closed before further events are forwarded.

## Before and after

Before `v2.3.0`, only A2A streams received inline scanning. Generic LLM SSE responses were buffered before scanning, which broke streaming UX and capped response size at 1 MB on the reverse proxy.

`v2.3.0` generalizes the streaming scan path to every `text/event-stream` response on the forward proxy, TLS interception, and reverse proxy.

| Transport | Before `v2.3.0` | From `v2.3.0` |
|-----------|-----------------|---------------|
| Forward proxy | A2A-only streaming; generic SSE buffered | All `text/event-stream` streamed and scanned |
| TLS-intercepted CONNECT | A2A-only streaming; generic SSE buffered | All `text/event-stream` streamed and scanned |
| Reverse proxy | No streaming path; all responses buffered at 1 MB | All `text/event-stream` streamed and scanned; non-SSE keeps the buffered path |
| A2A | Already streamed with field-aware walker and cross-event rolling tail | Unchanged |

## What gets scanned per event

Each SSE event is parsed per the WHATWG SSE spec. Scanning runs on the concatenated `data:` payload.

- DLP patterns (same set used for non-streaming response scanning)
- Prompt injection detectors (jailbreak phrases, instruction override, credential solicitation, memory persistence, covert action directives, CJK instruction overrides)
- Response-address protection and CEE taint propagation when enabled

Clean events flush immediately. A finding terminates the stream and emits a block receipt with the `sse_stream` layer label.

## What is not scanned

Generic SSE scanning is intentionally payload-scoped in `v2.3.0`. Standard metadata fields (`event:`, `id:`, `retry:`) pass through unscanned. Unknown SSE fields and malformed extension lines are ignored by the parser, matching the WHATWG SSE rules. Comment lines (: prefix) and keepalives are dropped before forwarding to the client.

## What is rejected fail-closed

- **Compressed SSE streams.** Any `Content-Encoding` other than `identity` is blocked with a receipt before any bytes are forwarded. This prevents scanner bypass via `gzip`, `br`, or `deflate` SSE.
- **Oversized events.** An event exceeding `max_event_bytes` terminates the stream with a finding.
- **Invalid UTF-8 in `data:`.** Cannot be safely scanned as text; the stream terminates.

These are intentional cliffs. A streaming response either flows clean or stops.

## Configuration

SSE streaming scanning lives under `response_scanning.sse_streaming`:

```yaml
response_scanning:
  sse_streaming:
    enabled: true            # default true
    action: block            # block | warn, default block
    max_event_bytes: 65536   # 64 KiB per event, default 65536
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Generic SSE streaming scan. When `false`, `text/event-stream` responses still stream with flushing but are not body-scanned. CONNECT-level visibility is preserved. |
| `action` | `block` | `block` terminates the stream on a finding and emits a block receipt. `warn` logs the finding and forwards the event. |
| `max_event_bytes` | `65536` | Per-event `data:` payload ceiling. LLM token events are small, so 64 KiB is conservative for most providers. Raise it if a provider emits batched deltas or full responses in single events. |

`response_scanning.exempt_domains` and global `suppress` rules apply before the SSE action selection, so a host you have intentionally exempted will continue to stream without action.

## Known limitations in v1

- **Cross-event injection detection applies only to A2A.** Generic SSE scans each event in isolation. An attacker who splits a single injection payload across sequential events evades the current detector. A2A's rolling-tail detector covers that case for A2A. Generalizing to any SSE stream is tracked as a follow-up.
- **Per-account proxy overrides in clients can bypass Pipelock.** If an upstream client sets its own proxy (not through `HTTPS_PROXY`), it may route around Pipelock entirely. Configure clients to honor system proxy env vars.
- **Only `data:` payloads are scanned on generic SSE.** Standard `event:`, `id:`, and `retry:` metadata fields pass through unscanned. Unknown fields and malformed extension lines are ignored per the SSE spec; comment lines are dropped.

These are explicit boundaries, not bugs. They are documented so an operator can decide whether the residual risk matters for their threat model.

## v2.4 update: MCP HTTP listener SSE upstream parity

`v2.4.0` extends streaming parity to a transport that previously stalled on it. `pipelock mcp proxy --listen --upstream` now routes `text/event-stream` upstream responses through the same `SSEReader` path used by the stdio-to-HTTP bridge. JSON-RPC messages stream to the listener client without waiting for upstream EOF.

The fix closes a regression where SSE-streaming MCP servers (Stripe's MCP server, Lakera's MCP server, and similar SSE-streaming upstreams) sat silent until the upstream finished or the client timed out. Behavior on non-SSE responses is unchanged.

## Why this matters for streaming agents

Most agent UX today relies on token streaming. If your security boundary buffers the response, you have given up streaming. If your security boundary drops body scanning to keep streaming, you have given up scanning.

`v2.3.0` does not pick. Each event's `data:` payload scans before it flushes; clean events flush immediately; a finding stops the stream before the bad bytes reach the client. The shape of streaming chat is preserved while the body still gets inspected.

## See also

- [Mediation envelope signing](/learn/mediation-envelope-signing/): cryptographic proof of which policy mediated a streaming response.
- [Pipelock](/pipelock/): full transport list and v2.3 capability map.
- [Browser Shield](/learn/browser-shield/): supported HTML and SVG rewriting before agent delivery; existing JavaScript bytes stay unchanged.
- [AI Agent Data Redaction](/learn/ai-agent-data-redaction/): request-side counterpart to response-side scanning.
- [Pipelock v2.3 upgrade guide](/learn/pipelock-v230-upgrade/): how to roll out streaming scanning on an existing install.
