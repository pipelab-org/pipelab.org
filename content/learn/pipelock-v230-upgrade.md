---
title: "Pipelock v2.3 Upgrade Guide"
linkTitle: "Pipelock v2.3 Upgrade"
subtitle: "No breaking changes. New controls to enable."
description: "Pipelock v2.3 upgrade guide: drop-in upgrade from v2.2.x, plus how to enable class-preserving redaction and generic SSE streaming scanning."
date: 2026-04-24
lastmod: 2026-04-24
og_image: "https://pipelab.org/images/og/og-product.png"
faq:
  - q: "Are there breaking changes in v2.3.0?"
    a: "No. v2.3.0 is a drop-in upgrade for any v2.2.x install. The configuration schema added two opt-in sections, redaction and SSE streaming response scanning; existing configs continue to load and run with the same behavior they had before. The strict YAML parsing introduced in v2.2.0 still applies, so unknown top-level fields fail loud."
  - q: "Should I enable redaction immediately?"
    a: "Only after confirming `request_body_scanning.enabled: true` is already on. Redaction requires it. Roll redaction out by enabling it for one path or one agent first with a narrow `code` profile, watch the receipts for the `redaction` block, and widen the profile only after you have seen rewrites land cleanly. The redactor blocks rather than partially rewrites, so a misconfigured profile blocks rather than leaks."
  - q: "Should I enable SSE streaming scanning?"
    a: "It is on by default in v2.3.0. `response_scanning.sse_streaming.enabled: true` is the default. If you upgrade and a previously buffered streaming response now terminates, that is the scanner doing its job. Use `action: warn` first if you want a soak period before flipping to `block`."
  - q: "What if I want to stage redaction in warn mode?"
    a: "Redaction itself does not have a `warn` mode in v1; it either rewrites successfully or blocks. The closest staging move is to start with `request_body_scanning.action: warn` so DLP findings emit warn receipts while you confirm redaction is rewriting the right classes. Flip request body scanning to `block` once you trust the profile."
  - q: "Are existing receipts still valid?"
    a: "Yes. v2.3.0 receipts continue to validate with the same `pipelock-verify` and `pipelock verify-receipt` tools that were published with v2.2.0. The cross-implementation conformance suite is unchanged. Receipts produced on traffic that needed no redaction stay byte-identical to v2.2.x receipts; receipts on rewritten traffic gain a new optional `redaction` block."
  - q: "Anything I should look at proactively?"
    a: "Three things. One: review your forward-proxy Content-Encoding posture. Compressed SSE now blocks fail-closed, so a previously-streaming endpoint emitting gzip-encoded SSE will start blocking. Two: confirm MCP tool scanning rules still pass. The dangerous-capability regex got a false-positive fix for runtime, runner, launcher, and spawner nouns; if your existing baseline relied on that false positive, drift detection will surface it. Three: re-run pipelock check against every config; the v2.2.0 strict YAML parser still applies."
howto_steps:
  - name: "Upgrade the binary"
    text: "Run `brew upgrade luckyPipewrench/tap/pipelock` or `docker pull ghcr.io/luckypipewrench/pipelock:2.3.0`, or replace the existing binary with the v2.3.0 artifact from the GitHub release. v2.3.0 is a drop-in upgrade with no breaking configuration changes from v2.2.x."
  - name: "Enable class-preserving redaction (optional)"
    text: "Add a `redaction` block to your config alongside the existing `request_body_scanning` section. `request_body_scanning.enabled: true` is required. Start with a narrow `code` profile on one path or one agent, watch the receipts for the new redaction block, and widen the profile only after rewrites land cleanly."
  - name: "Verify SSE streaming scanning"
    text: "SSE streaming scanning is on by default in v2.3.0 with `response_scanning.sse_streaming.enabled: true`. If a previously buffered streaming response now terminates, that is the scanner doing its job. Set `action: warn` first if you want a soak period before flipping to `block`."
  - name: "Re-run pipelock check"
    text: "Run `pipelock check` against every config to confirm the v2.2.0 strict YAML parser still passes. Review your forward-proxy Content-Encoding posture: compressed SSE now blocks fail-closed, so any previously-streaming endpoint emitting gzip-encoded SSE will start blocking. Confirm MCP tool scanning rules still pass after the dangerous-capability regex false-positive fix."
learn_cat: operator
level: ref
tags:
  - release
  - upgrade
  - v2.3
---

Pipelock `v2.3.0` is a drop-in upgrade. There are no breaking config changes from `v2.2.x`. New behavior is opt-in or default-on with conservative defaults.

## What you have to do

For most installs, the upgrade is:

```bash
# Homebrew
brew upgrade luckyPipewrench/tap/pipelock

# or container
docker pull ghcr.io/luckypipewrench/pipelock:2.3.0
```

For direct binary installs, download the `v2.3.0` artifact from the GitHub release and replace the existing binary. That is enough to pick up the bug fixes and tech-debt sprint without touching configs.

If you also want the new headline features active, read on.

## Enable class-preserving redaction (optional, recommended)

The redactor rewrites secrets in JSON request bodies in flight before they leave the agent. It is request-side only in `v2.3.0`. Required prerequisite: `request_body_scanning.enabled: true`.

Minimum config:

```yaml
request_body_scanning:
  enabled: true
  action: warn

redaction:
  enabled: true
  default_profile: code
  profiles:
    code:
      classes:
        - aws-access-key
        - github-token
        - jwt
        - ssh-private-key
```

Roll out staged:

1. Enable on one path or one agent first.
2. Watch action receipts for the `redaction` block. Confirm the right classes are getting rewritten.
3. Widen the profile.
4. Flip `request_body_scanning.action` from `warn` to `block` once you trust the profile end-to-end.

The redactor blocks rather than partially rewrites. Malformed JSON, key collisions, and limit overflow all fail closed. A misconfigured profile blocks; it does not leak.

Full operator guide: [AI Agent Data Redaction](/learn/ai-agent-data-redaction/).

## SSE streaming scanning is on by default

`response_scanning.sse_streaming.enabled: true` is the default. Every `text/event-stream` response now streams with per-event DLP and prompt injection scanning across the forward proxy, TLS interception, and the reverse proxy.

If you have streaming endpoints that emit `Content-Encoding: gzip` (or `br`, `deflate`), they will start blocking. Compressed SSE is rejected fail-closed in `v2.3.0` because it is the obvious bypass. Configure those endpoints to stream `identity`, or accept the block as the correct behavior.

If you want a soak period before enforcement:

```yaml
response_scanning:
  sse_streaming:
    enabled: true
    action: warn
    max_event_bytes: 65536
```

Run with `action: warn` for a release cycle, watch receipts for any false positives, then flip to `block`.

Full operator guide: [SSE Streaming Response Scanning](/learn/sse-streaming-response-scanning/).

## Bug fixes worth checking

A few v2.2.x edge cases got cleaned up. If your environment depended on any of them, you'll want to know.

- **Dangerous-capability regex no longer flags `runtime`, `runner`, `launcher`, `spawner` nouns.** If your `mcp_tool_scanning` baseline previously included a poisoned-tool false positive on those nouns, drift detection will surface the difference on first run after the upgrade.
- **Browser shield short-circuits non-HTML media.** Image, audio, video, PDF, and arbitrary binary responses no longer get processed by the shield ceiling. HTML, JS, and SVG remain shielded. Workaround `exempt_domains` entries you added for `generativelanguage.googleapis.com` or similar can be removed.
- **DLP coverage downgrades on reload now warn.** A reload that replaces a strong DLP regex with a weaker one under the same name was previously silent. It now surfaces as a reload warning.
- **SSRF DNS failures stay adaptive-neutral.** Resolver outages no longer push sessions into airlock. Requests still block when DNS cannot be verified; resolver failures no longer accumulate threat evidence.

These are part of the same release. None require config changes; they behave better.

## What did not change

- Receipt format: same schema, same conformance vectors, same Python verifier.
- Mediation envelope signing: unchanged.
- MCP transport list: unchanged (stdio, HTTP/SSE, HTTP listener, MCP-over-WebSocket).
- Strict YAML config parsing: still on; unknown top-level fields still fail loud.
- License gating: free tier still includes every scanner, every detection, every enforcement layer. Pro is still scoped to multi-agent coordination only.

## See also

- [Pipelock v2.3.0 release notes](/blog/pipelock-v230-release/)
- [AI Agent Data Redaction](/learn/ai-agent-data-redaction/)
- [SSE Streaming Response Scanning](/learn/sse-streaming-response-scanning/)
- [Agent Evidence: SIEM and Detection Integration](/learn/agent-evidence-detection-integration/)
- [Pipelock v2.2 upgrade guide](/learn/pipelock-v220-upgrade/) (the prior tag's guide; still relevant if you are jumping from `v2.1.x`)
