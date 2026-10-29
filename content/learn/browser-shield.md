---
title: "Browser Shield: Defensive Response Rewriting"
linkTitle: "Browser Shield"
subtitle: "Remove supported markup traps and tracking elements while preserving existing HTML scripts."
description: "Browser Shield sanitizes supported HTML and SVG markup before agent delivery. Existing inline scripts and standalone JavaScript stay unchanged."
date: 2026-05-16
learn_cat: operator
level: intro
tags:
  - browser-shield
  - response-rewriting
  - receipts
---

Browser Shield is a defensive response-rewrite layer. It runs after Pipelock fetches a response and before the agent receives the body. It removes supported browser-extension URLs, tracking image elements, prefetch links, and hidden prompt traps outside existing HTML scripts. Existing inline scripts and standalone JavaScript responses keep their original bytes. When receipt emission is configured, rewrites produce signed records you can inspect.

It is opt-in. `browser_shield.enabled` defaults to `false`. The strictness, size limit, and individual rewrite toggles all have safe defaults once enabled.

## v3.7 content types and complete responses

Browser Shield follows the browser's last-valid-value rule for repeated `Content-Type` values. Relaxation requires agreement, and media policy still enforces the effective type derived from leading body bytes. JavaScript remains scanned without rewriting; no OCR or audio transcription is added.

On TLS-intercepted traffic, eligible origin-issued links, query values and new object IDs can return to the issuing origin and session without entropy false blocks. DLP and other checks remain active. Reflection, incomplete sent history, session eviction and restart limit eligibility. XHTML doesn't supply HTML-link evidence.

Forward, intercepted and reverse HTTP paths strip Range and cache-validator request headers and refuse origin `206` and `304` replies as `response_incomplete`. A Browser Shield exemption can't relax that refusal. See the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/) for client compatibility checks.

## What gets rewritten

Browser Shield only touches content the pipeline can classify as shieldable:

- HTML and XHTML markup outside existing script elements
- SVG, subject to complete-body structural validation

Standalone JavaScript receives normal response scanning, but Browser Shield leaves its bytes unchanged. SVG delivery requires structural validation of both the complete input and rewritten body. Active content is refused, and SVG stays refused when Shield is disabled, exempt for the host, or unable to inspect the complete body.

Binary media, PDFs, JSON, and unknown specific content types pass through untouched. The oversize boundary is bounded to actually-shieldable responses, so a large legitimate media payload does not trigger a shield failure.

Within a shieldable response, the rewrites cover:

- **Extension URLs.** Supported browser-extension URLs outside existing HTML scripts.
- **Tracking elements.** Supported 1x1 tracking images and prefetch links outside existing scripts.
- **Hidden agent traps.** Concealed instructions or prompt content positioned to steer an agent reading the page.
- **SVG active content.** Pipelock delivers SVG only after validating the whole document. An SVG containing a script, `foreignObject`, embedded frame, event handler or other active markup is refused (`403`, block reason `media_policy`), and the rewritten output is validated again before delivery.
- **Fingerprint shims.** Optional HTML shim injection can suppress `sendBeacon` at runtime without rewriting the page's JavaScript. It defaults to off and can break bot-verification checks.

`browser_shield.tracking_domains` accepts additional exact tracking hostnames. Wildcards are refused at config load.

## When the shield triggers

The shield runs on response paths where Pipelock buffers the body: fetch, forward, intercept, and reverse. Response scanning is a separate control with its own configuration and action. Injection findings survive Shield rewriting and still follow the configured response action. Shield exemptions skip rewriting only; other response policies still apply.

Oversized shieldable responses follow `oversize_action`:

| Value | Behavior |
|---|---|
| `block` | Fail closed. The response is denied. |
| `warn` | The body returns unchanged. Valid only with `strictness: minimal`; use for short diagnostics. |
| `scan_head` | Default. Rewrite the configured prefix only: partial shielding leaves the remainder unshielded. The receipt records partial coverage. |

## Receipts

When receipt signing is enabled, every shield rewrite emits a chained, signed receipt with a `shield` block alongside the usual action fields. The block records:

- Pipeline used: `html`, `javascript`, or `svg`; `javascript` identifies partial coverage records and never means script bytes were changed
- Total rewrite count
- Extension probe rewrites
- Tracking beacon rewrites
- Hidden agent-trap rewrites
- Fingerprint shim injection
- SVG active-content rewrite counts
- Body size, scanned size, and whether the rewrite was partial
- Adaptive signal count recorded for that response

Receipt targets strip URL userinfo, query strings, and fragments before signing. Common path-borne token shapes (JWT-like segments, long opaque tokens, `;jsessionid=`) are redacted. This is a defensive scrubber, not a full PII classifier; operators should still avoid routing credential-bearing paths through shareable receipt stores.

Existing verifiers that ignore unknown optional fields stay compatible with shield receipts.

## Adaptive enforcement weight

Repeated shield rewrites add a low-weight `SignalShieldRewrite` signal to the session score. The signal is capped at one signal per response body, worth 0.25 points, so one noisy ad-supported page cannot immediately escalate a session.

## Configuration

Minimal opt-in, suitable for a first rollout:

```yaml
browser_shield:
  enabled: true
  strictness: minimal
  oversize_action: scan_head
```

Production posture once a soak shows stable behavior:

```yaml
browser_shield:
  enabled: true
  strictness: standard
  max_shield_bytes: 5242880
  oversize_action: block
  strip_extension_probing: true
  strip_hidden_traps: true
  strip_tracking_pixels: true
  inject_fingerprint_shims: false
  tracking_domains: []
```

`exempt_domains` carves out hosts that should not be rewritten. `tracking_domains` extends the built-in beacon list without replacing it.

## What Browser Shield does not do

Commercial browser-integrity systems such as HUMAN and PerimeterX combine server-side reputation, client telemetry, challenges, behavioral scoring, and encrypted JavaScript signals. Browser Shield does not try to defeat those systems. Treating that as a product goal would blur Pipelock's security boundary and create brittle, site-specific behavior.

Explicit non-goals:

- Solving CAPTCHAs or challenges
- Bypassing commercial bot-management access decisions
- Forging browser-integrity telemetry
- Impersonating a specific human browser profile
- Patching every obfuscated anti-automation script

If a page depends on a commercial browser-integrity system for access, configure an allowed human-driven workflow outside the agent path or treat the target as unsupported for automated access.

## Rollout

Use a staged rollout rather than turning Browser Shield on fleet-wide at the fail-closed posture from day one.

1. Build and verify the release candidate locally.
2. Run the synthetic transport canary across fetch, forward, intercept, and reverse paths with receipt signing enabled.
3. Enable Browser Shield on a small opt-in agent group with `strictness: minimal` and `oversize_action: scan_head`.
4. Monitor shield receipts, validator-clearing behavior, adaptive score movement, response scanner deltas, and page breakage.
5. Move to `strictness: standard` and `oversize_action: block` only after the soak shows stable browsing behavior and no unexpected escalation.

## Inspecting receipts

When `flight_recorder.signing_key_path` is configured, shield receipts land in the flight-recorder directory alongside other action receipts. Each receipt is a chained Ed25519 signature; the published Python and TypeScript verifiers accept the new optional `shield` block without modification.

For receipt format details and verifier links, see [Action Receipt Spec](/learn/action-receipt-spec/). The [v3.7.1 configuration reference](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/configuration.md#browser-shield) and [production-readiness contract](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/security/browser-shield-production-readiness.md) define the rewrite limits.

---

See also: [Action Receipt Spec](/learn/action-receipt-spec/) &middot; [Media Policy](/learn/ai-agent-data-redaction/) &middot; [Full documentation](/pipelock/)
