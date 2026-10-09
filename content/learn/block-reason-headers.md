---
title: "Block Reason Headers"
linkTitle: "Block Reason Headers"
subtitle: "Machine-readable block metadata for AI agents and wrappers."
description: "Pipelock v2.4 X-Pipelock-Block-Reason header reference: vocabulary, severity, retry hints, transports, and agent integration patterns."
date: 2026-05-04
lastmod: 2026-05-04
og_image: "https://pipelab.org/images/og/og-product.png"
learn_cat: operator
level: ref
tags:
  - block-reason
  - http-headers
  - mcp
  - websocket
  - agent-integration
faq:
  - q: "What does X-Pipelock-Block-Reason carry?"
    a: "A stable string from a closed vocabulary naming the rule class that fired, plus version, severity, retry hint, and optional layer and receipt pointer headers. The header is set on every HTTP-capable block path."
  - q: "Should agents switch on the reason or the retry hint?"
    a: "Switch on the retry hint when deciding whether to retry. New reason codes can ship in any v1.x release; the retry vocabulary is bounded to none, transient, and policy."
  - q: "Do MCP stdio blocks get the header?"
    a: "No. MCP stdio is JSON-RPC, not HTTP, so there is no header surface. The same reason vocabulary appears on the JSON-RPC error metadata instead."
  - q: "Can a header value leak the matched secret?"
    a: "No. The header validators reject any value not in the closed vocabulary. DLP matches surface as dlp_match without the rule name. The header cannot carry agent IDs, session IDs, secret bytes, or free-form error messages."
---

When Pipelock blocks a request on an HTTP-capable path, it sets a small set of response headers naming the rule class that fired, the severity, and an optional retry hint. The headers let an agent react to a block intelligently without parsing English error pages.

The schema is locked at v1. Additive changes (new reason codes, new optional headers) keep v1.

## Headers emitted

| Header | Required | Example |
|---|---|---|
| `X-Pipelock-Block-Reason` | Always | `dlp_match` |
| `X-Pipelock-Block-Reason-Version` | Always | `1` |
| `X-Pipelock-Block-Reason-Severity` | Always | `critical` |
| `X-Pipelock-Block-Reason-Retry` | Always | `none` |
| `X-Pipelock-Block-Reason-Layer` | Optional | `body_dlp` |
| `X-Pipelock-Block-Reason-Receipt` | Optional, reserved | `01J0GNYZ7XSQRTQ8FPYM5BHX2K` |
| `X-Pipelock-Receipt` | After a receipt is recorded; allow coverage depends on `flight_recorder.require_receipts` | `01J0GNYZ7XSQRTQ8FPYM5BHX2K` |
| `X-Pipelock-Shield-Rewrite` | When Browser Shield rewrote a response | categories rewritten |

The version header lets a future v2 schema break compatibility cleanly. Receivers should parse the version header first and reject unknown majors.

The receipt header is reserved in `v2.4`. The schema and validator (`WithReceipt`) ship with this release; production block paths leave the value unset until the receipt-pointer wiring lands. When populated, the value is a 26-character Crockford-base32 ULID identifying an action receipt.

As of v3.6.0, `X-Pipelock-Receipt` carries the `action_id` of the signed receipt covering a response. HTTP responses carry it only after the receipt is successfully recorded, so it needs a configured receipt emitter. Whether allow responses get one depends on `flight_recorder.require_receipts`. `X-Pipelock-Shield-Rewrite` lists the categories Browser Shield rewrote, and the fetch envelope carries the same value as `shield_rewrite`.

## Reason vocabulary

Block reasons are grouped by layer. Values are stable strings; agents can switch on them without parsing English.

### Egress and network

| Reason | When |
|---|---|
| `scheme_blocked` | URL scheme is not http/https. |
| `domain_blocklist` | Hostname matches a configured blocklist or rule. |
| `ssrf_private_ip` | DNS resolves to a private, loopback, or link-local address. |
| `ssrf_metadata` | DNS resolves to a cloud metadata endpoint (169.254.169.254, etc.). |
| `ssrf_dns_rebind` | Hostname's DNS answer differs between resolution and connect. |
| `path_entropy` | URL path triggers the high-entropy detector. |
| `query_entropy` | URL query triggers the high-entropy detector. |
| `subdomain_entropy` | Subdomain triggers the high-entropy detector. |
| `url_length` | URL exceeds `monitoring.max_url_length`. |
| `rate_limit` | Per-session or per-target rate ceiling exceeded. |
| `data_budget` | Per-session data budget exhausted. |

### Content and payload

| Reason | When |
|---|---|
| `dlp_match` | DLP pattern matched in body, header, or URL. |
| `prompt_injection` | Response body matched an injection pattern. |
| `redaction_failure` | Body could not be redacted safely; fail-closed. |
| `media_policy` | Media policy rejected the response (binary type, EXIF, SVG active content). |

### MCP and tool

| Reason | When |
|---|---|
| `tool_policy_deny` | An `mcp_tool_policy` rule blocked the call. |
| `tool_chain_blocked` | A configured chain pattern matched the recent tool sequence. |
| `tool_poisoning` | A tool description matched a poisoning pattern. |
| `session_binding` | The tool inventory drifted from the session-pinned baseline. |

### Posture and runtime

| Reason | When |
|---|---|
| `airlock_active` | Adaptive enforcement raised the airlock; all egress denied for the cooldown window. |
| `kill_switch_active` | The six-source kill switch is asserted. |
| `envelope_verify_failed` | Inbound mediation envelope verification failed. |
| `outbound_envelope_failed` | Outbound envelope injection, refresh, or signing failed before forwarding. |
| `redirect_scan_denied` | A followed redirect target was denied by the scanner pipeline. |
| `authority_mismatch` | Operator authority for the requested action is missing or below threshold. |
| `escalation_level` | Adaptive enforcement raised an escalation tier that blocks the requested action class. |
| `session_anomaly` | Session profiling rejected the request because anomaly action is `block`. |
| `cross_request_deny` | Cross-request entropy or fragment reassembly denied the request as exfiltration. |

### Generic

| Reason | When |
|---|---|
| `parse_error` | Pipelock could not parse the request safely; fail-closed. |
| `timeout` | A scanner or upstream operation timed out; fail-closed. |
| `pattern_unavailable` | A configured pattern set is not loaded; fail-closed. |
| `not_enabled` | The requested feature is disabled by config. |
| `bad_request` | The request itself is malformed. |
| `compressed_response` | Inspection was prevented by an unsupported or stacked encoding, malformed compressed data, or unsafe partial decoding. Gzip and deflate are decoded otherwise. |
| `browser_shield_oversize` | Response exceeded Browser Shield's size limit. |
| `block_reason_overflow` | Internal sentinel used when WebSocket close-frame metadata would exceed RFC 6455's 123-byte payload limit. |

## Severity

Three values: `info`, `warn`, `critical`. Severity is hardcoded per reason. Operators control external sink thresholds (`emit.webhook.min_severity`, `emit.syslog.min_severity`, `emit.otlp.min_severity`), not the severity itself, so misconfiguration cannot downgrade a critical event.

## Retry hints

Three values:

- `none`: the block is permanent for this request as is. Retrying the same payload will block again. Examples: `dlp_match`, `ssrf_private_ip`, `tool_policy_deny`.
- `transient`: the block is environmental and time-bound. Retry with backoff is appropriate. Examples: `rate_limit`, `airlock_active`, `timeout`.
- `policy`: the block requires an operator to change pipelock policy before a retry can succeed. Examples: `kill_switch_active`, `authority_mismatch`.

Agents should switch on the retry hint, not the reason code. New reason codes can ship in any v1.x release; the hint vocabulary is bounded.

## Transports

The header is set on every HTTP-capable block path. MCP stdio blocks happen at the JSON-RPC layer; the same reason vocabulary appears in the JSON-RPC error metadata instead.

| Transport | Surface |
|---|---|
| Forward proxy (CONNECT, absolute-URI) | HTTP response header |
| Fetch (`/fetch?url=...`) | HTTP response header |
| TLS-intercepted CONNECT | HTTP response header |
| Reverse HTTP proxy | HTTP response header |
| MCP HTTP / SSE | HTTP response header |
| WebSocket | Close-frame payload (RFC 6455 123-byte limit) |
| MCP stdio (JSON-RPC) | JSON-RPC error metadata, no HTTP header surface |

WebSocket close-frame payloads have a 123-byte limit. When the bare `{block_reason: <code>}` payload would exceed that, Pipelock substitutes the dedicated `block_reason_overflow` sentinel rather than truncating the code mid-string.

Two reason codes intentionally have no HTTP header emit site: `tool_poisoning` (fires on `tools/list` responses) and `tool_chain_blocked` (fires on `tools/call` sequences). Both surface as JSON-RPC errors with the same fixed reason vocabulary. A static production-path matrix gate fails the build if any new reason code ships without at least one production emit site or a documented exemption, so the vocabulary cannot drift from shipped behavior.

## Privacy: what the headers do not carry

The header validators reject any value not in the fixed vocabulary or the documented ID format. The headers therefore cannot carry:

- Matched secret content (DLP would defeat itself).
- Specific DLP pattern names (an attacker probing patterns gets `dlp_match`, not the rule name).
- Agent identifiers, session IDs, or tenant IDs.
- Free-form error messages.

Privacy is enforced at validation, not by convention.

## Agent integration pattern

A simple Python wrapper:

```python
import requests
import time

resp = requests.get(target, proxies={"https": "http://pipelock:8888"})

if resp.status_code == 403:
    reason = resp.headers.get("X-Pipelock-Block-Reason", "")
    retry  = resp.headers.get("X-Pipelock-Block-Reason-Retry", "policy")

    if retry == "transient":
        time.sleep(backoff)
        # retry the request
    elif retry == "none":
        raise PolicyDenied(reason)
    else:  # policy: operator action required
        notify_operator(reason)
        raise PolicyDenied(reason)
```

The agent does not need to enumerate reason codes. The retry hint plus a generic block handler covers every case. New reason codes are forward-compatible because the retry vocabulary is bounded.

## Versioning policy

- Additive changes (new reason codes, new optional headers) keep `version: 1`.
- Removing a reason code, changing the meaning of an existing severity or retry value, or renaming a header bumps the major version.
- Removing the version header bumps the major version.

Receivers that handle unknown reason codes by falling back to the retry hint are forward-compatible across all v1 releases.

## See also

- [Pipelock v2.4 upgrade guide](/learn/pipelock-v240-upgrade/)
- [Pipelock v2.4.0 release notes](/blog/pipelock-v240-release/)
- [Mediation envelope signing](/learn/mediation-envelope-signing/) for `envelope_verify_failed` and `outbound_envelope_failed`
- [Action receipt spec](/learn/action-receipt-spec/) for the receipt referenced by `X-Pipelock-Block-Reason-Receipt`
- [Learn-and-Lock agent contracts](/learn/learn-and-lock/) for contract-aware blocks
