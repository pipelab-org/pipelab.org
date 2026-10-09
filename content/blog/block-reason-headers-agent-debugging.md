---
title: "Block-Reason Headers: Make Your Security Proxy Tell You Why"
linkTitle: "Block-Reason Headers"
seoTitle: "Block-Reason Headers for Agent Firewalls"
date: 2026-05-09
author: "Josh Waldrep"
summary: "A 403 from a security proxy with no reason is a black hole for the agent. The X-Pipelock-Block-Reason header gives the agent a structured signal it can route around."
description: "A generic 403 burns retry budget. X-Pipelock-Block-Reason gives agent firewalls a structured reason, severity, and retry hint."
tags: ["ai-security", "agent-firewall", "pipelock", "http", "operations"]
related: ["pipelock-inspection-layers", "politeness-vs-enforcement-https-proxy", "pipelock-v240-release"]
faq:
  - q: "What is the X-Pipelock-Block-Reason header?"
    a: "X-Pipelock-Block-Reason is a structured HTTP response header Pipelock emits on every block path. It carries a reason code (one of the v1 identifiers like dlp_match, ssrf_private_ip, tool_policy_deny, or kill_switch_active), a severity (info, warn, critical), and a retry hint (none, transient, policy). The optional X-Pipelock-Block-Reason-Layer header names the scanner layer that fired. X-Pipelock-Block-Reason-Receipt is reserved in v2.4: the schema and validator ship in this release but production block paths leave the value unset until the receipt-pointer wiring lands. The header is open-spec, defined in Pipelock's docs, and any HTTP client can parse it without a Pipelock-specific library."
  - q: "Why doesn't Pipelock just return a 200 if the request was blocked?"
    a: "Returning a 200 on a block would make Pipelock complicit in the failure mode. The agent would think its request succeeded, the upstream service never received the request, and the operator would have no signal that a control fired. The 4xx status is the correct shape. The header gives the agent enough context to react sensibly to the block instead of treating it as a black hole."
  - q: "Can an agent use the block-reason header to bypass Pipelock?"
    a: "No. The header tells the agent why a request was blocked, not how to make a different request that would not be blocked. If the reason is dlp_match because the request body contained an API key, the agent learns that an API key in the body is the problem. The agent does not learn how to disguise the API key. The block-reason vocabulary is designed to be informational about the verdict, not prescriptive about evasion."
blog_cat: "technical"
---

When a security proxy blocks an agent's request, the agent sees a 4xx and has to guess what happened. Was the destination wrong? The body? A header? Did the proxy timeout? Did the proxy itself crash? Without context, every block looks the same and the agent burns its retry budget on a single attempt's worth of information.

`X-Pipelock-Block-Reason` is the header Pipelock emits on every block path so the agent knows. The vocabulary is small, the format is open-spec, and the impact on operator debugging is large. This post is about the design, the schema, and why making a security proxy explain itself is good for the security posture, not bad for it.

## The problem the header solves

A coding agent runs a tool that fetches a URL, parses the response, and feeds the output back to the model. The fetch goes through Pipelock. Pipelock decides the response contains a prompt-injection pattern and returns 403 with no body.

The agent has no idea what happened. From the agent's perspective:

- The host could be unreachable.
- The proxy could be misconfigured.
- The proxy could be down.
- The destination could be returning 403 itself.
- The agent's request could have failed scanning.
- The agent's response could have failed scanning.

Each of these has a different correct response from the agent. "Host unreachable" might mean "try a different host." "Proxy misconfigured" might mean "tell the operator." "Scanning blocked the request" might mean "do not retry this exact body." Without a signal, the agent treats them all the same way: retry, hit the same block, retry again, eventually give up.

The operator's view is no better. The audit log records the block, but correlating an agent's confused retry sequence with the proxy's decision tree means cross-referencing two log streams by timestamp and request ID. For one block in a quiet period, fine. For a fleet generating thousands of requests an hour, painful.

A structured block reason on the response solves both sides. The agent knows what happened. The operator does not have to grep two logs to figure out what the agent saw.

This is the operator-facing half of enforcement. [Politeness vs Enforcement](/blog/politeness-vs-enforcement-https-proxy/) explains how to make the kernel refuse bypasses; block-reason headers explain what the agent should do after the refusal.

## The header schema

The full schema lives at [docs/specs/block-reason-header.md](https://github.com/luckyPipewrench/pipelock/blob/main/docs/specs/block-reason-header.md) in the Pipelock repo. The shape, in one paragraph:

`X-Pipelock-Block-Reason: <reason>` with companion headers for version, severity, retry, and the layer that fired:

```http
X-Pipelock-Block-Reason: dlp_match
X-Pipelock-Block-Reason-Version: 1
X-Pipelock-Block-Reason-Severity: critical
X-Pipelock-Block-Reason-Retry: none
X-Pipelock-Block-Reason-Layer: dlp
```

`X-Pipelock-Block-Reason-Receipt` is reserved in `v2.4`: the schema and the `WithReceipt` validator ship in this release, but production block paths leave the value unset until the receipt-pointer wiring lands. When populated, the value will be a 26-character Crockford-base32 ULID.

The reason vocabulary is closed. Examples by category include:

- **Egress.** `ssrf_private_ip`, `ssrf_metadata`, `ssrf_dns_rebind`, `domain_blocklist`, `scheme_blocked`, `subdomain_entropy`, `url_length`, `path_entropy`, `rate_limit`, `data_budget`.
- **Content.** `dlp_match`, `prompt_injection`, `redaction_failure`, `media_policy`.
- **MCP.** `tool_policy_deny`, `tool_poisoning`, `tool_chain_blocked`, `session_binding`.
- **Posture.** `airlock_active`, `kill_switch_active`, `envelope_verify_failed`, `outbound_envelope_failed`, `redirect_scan_denied`, `authority_mismatch`, `session_anomaly`, `cross_request_deny`, `compressed_response`, `browser_shield_oversize`.
- **Contract.** `contract_default_deny`, `contract_enforce_default`, `contract_non_default_port`, `contract_invalid_path`, `contract_observed_only`.
- **Generic.** `parse_error`, `timeout`, `bad_request`, `pattern_unavailable`, `not_enabled`, `block_reason_overflow`.

The full canonical list lives at [docs/specs/block-reason-header.md](https://github.com/luckyPipewrench/pipelock/blob/main/docs/specs/block-reason-header.md) in the Pipelock repo and in `internal/blockreason/blockreason.go`.

A block can have at most one reason code. The code is the primary signal. Severity and retry are advisory: severity tells the agent how loud to be when logging the block, retry tells the agent whether retrying with the same payload could ever succeed.

The same reason vocabulary is used for WebSocket close frames. MCP stdio does not have an HTTP header surface, so stdio blocks flow through the JSON-RPC error envelope instead.

## Why the schema is small

Two design choices kept the vocabulary small:

- **No free-form reason strings.** A free-form string would let the proxy tell the agent things like "request body contained `AKIA...EXAMPLE` at offset 1024." That is too useful for an attacker who controls part of the request. The agent learns exactly what the scanner saw and can adjust the next attempt to avoid the match. Closed vocabularies do not leak that detail.
- **No retry-after seconds.** A retry hint with timing would let the agent build a retry policy that matches whatever the proxy is rate-limiting. The hint is categorical: `transient` says "retrying might work because the cause is not your request," `none` says "this exact request will never work," and `policy` says "this might work only after an operator changes policy."

Both choices trade specificity for safety. The agent gets enough signal to react sensibly without learning how to evade.

## What changes for operators

The operator's experience changes from "decode the audit log against the agent's trace" to "read the block reason on the agent's HTTP response." Two examples:

A coding agent's CI pipeline started failing on a fetch tool. The pipeline log shows:

```
fetch tool: HTTP 403, body empty
agent: retrying (1/3)
fetch tool: HTTP 403, body empty
agent: retrying (2/3)
fetch tool: HTTP 403, body empty
agent: failed after 3 retries
```

With the header on, the pipeline log includes:

```
fetch tool: HTTP 403, X-Pipelock-Block-Reason: ssrf_private_ip
fetch tool: X-Pipelock-Block-Reason-Severity: critical
fetch tool: X-Pipelock-Block-Reason-Retry: none
agent: not retrying (non-retryable block)
agent: surfacing block reason to user
```

The agent stops retrying because retry is `none`. The user sees a meaningful error instead of an opaque pipeline failure. The operator does not have to decode anything.

Another example, MCP-shaped:

A new MCP server gets added to the agent's config. The agent calls a tool from it. Pipelock's tool-policy denies the call.

Without the header, the agent sees a JSON-RPC error with no actionable detail. With the header (or its JSON-RPC analog), the agent sees `tool_policy_deny` and can route around it: ask the user, fall back to a different tool, or surface the block reason directly. The behavior change is small in code but big in the agent's ability to recover.

## Pairing with retry-budgeted agents

Modern coding agents have explicit retry budgets. A budget of three on a tool call burns fast when every block looks the same. With block reasons:

- `retry=none` consumes zero budget on retry. The agent should not retry. Surface the block.
- `retry=transient` consumes budget normally. The agent should retry with the same payload, possibly with backoff.
- `retry=policy` is the operator case. The block may clear after a policy change, but the agent should not keep guessing.

For a coding agent with a budget of three retries, this means an agent that runs into a `none` block on attempt one fails in 100ms instead of three round trips. The retry budget is preserved for transient failures where retry actually helps.

## The schema is open

The vocabulary, header format, severity values, retry semantics, and the WebSocket and MCP variants are all documented in the open-source Pipelock repo. Anyone who wants to implement this header in their own proxy can do so without a Pipelock dependency. Any HTTP client that wants to parse the header can do so without a Pipelock-specific library. The header values are short identifiers and fixed allowlist values.

If a competing agent firewall wants to adopt the same vocabulary, that is a feature, not a leak. A common reason vocabulary across vendors means agents can react sensibly regardless of which proxy is in front of them. The schema lives at [docs/specs/block-reason-header.md](https://github.com/luckyPipewrench/pipelock/blob/main/docs/specs/block-reason-header.md). Take it, use it, propose changes via issue or PR.

## Where this fits in the agent firewall stack

Block reasons are the debugging surface of an enforcement layer. The enforcement is the load-bearing piece: the agent firewall scans the request, the response, the headers, the tool calls, and decides allow or deny. The block reason is what makes the deny actionable.

A proxy without block reasons can still enforce, but every block is a black box. Operators get noisier audit logs and longer debugging cycles. Agents get worse retry behavior and more confused error messages. The header fixes both without weakening the enforcement.

If you are running Pipelock on `main` after 2026-05-02, the header is already on. If you are running an older release, [v2.4 ships with the header on every block path](https://pipelab.org/blog/pipelock-v240-release/), and the [block reason headers guide](/learn/block-reason-headers/) walks the operator-facing changes. If you are running something else and your proxy gives you opaque 403s, this is the kind of feature worth asking for.
