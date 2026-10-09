---
title: "Browser Shield: Defensive Response Rewriting"
linkTitle: "Browser Shield"
subtitle: "Strip page-side probes, hidden traps, and tracking beacons from agent-fetched content."
description: "Browser Shield strips extension probes, hidden prompt traps, and tracking beacons from agent-fetched HTML and SVG, and reports JavaScript. Signed receipts."
date: 2026-05-16
learn_cat: operator
level: intro
tags:
  - browser-shield
  - response-rewriting
  - receipts
---

Browser Shield is a defensive response-rewrite layer. It runs after Pipelock fetches a response and before the agent receives the body. Page-side probes that try to enumerate browser extensions, tracking beacons, and hidden prompt traps get stripped from the response. Every rewrite gets recorded in the action receipt so an operator can audit the intervention later.

It is opt-in. `browser_shield.enabled` defaults to `false`. The strictness, size limit, and individual rewrite toggles all have safe defaults once enabled.

## What gets rewritten

Browser Shield only touches content the pipeline can classify as shieldable:

- HTML and XHTML
- JavaScript (reported, not rewritten)
- SVG active content

Binary media, PDFs, JSON, and unknown specific content types pass through untouched. The oversize boundary is bounded to actually-shieldable responses, so a large legitimate media payload does not trigger a shield failure.

Within a shieldable response, the rewrites cover:

- **Extension probes.** Page-side JavaScript that enumerates local browser extensions or automation state.
- **Tracking beacons.** Prefetch-style telemetry not required for rendering agent-visible content.
- **Hidden agent traps.** Concealed instructions or prompt content positioned to steer an agent reading the page.
- **SVG active content.** Script-bearing SVG elements that would otherwise execute on render.
- **Fingerprint shims.** Optional injection that normalizes a small set of fingerprint vectors when enabled.

The default tracking-domain list ships with the binary; operators can extend it through `browser_shield.tracking_domains`.

## When the shield triggers

The shield runs on response paths where Pipelock buffers the body: fetch, forward, intercept, and reverse. Response injection scanning still runs after shield rewriting on applicable transports, so the agent receives content that has passed both layers.

Oversized shieldable responses follow `oversize_action`:

| Value | Behavior |
|---|---|
| `block` | Fail closed. The response is denied. |
| `warn` | The body returns unchanged. The intervention is recorded as a warning. |
| `scan_head` | Rewrite the configured prefix only. The receipt records the rewrite as partial. |

## Receipts

When receipt signing is enabled, every shield rewrite emits a chained, signed receipt with a `shield` block alongside the usual action fields. The block records:

- Pipeline used: `html`, `javascript`, or `svg`
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
  oversize_action: warn
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

If a page depends on a commercial browser-integrity system for access, configure an allowed human-driven workflow outside the agent path or treat the target as unsupported for automated access. HUMAN and PerimeterX coverage is not on the v2.5 roadmap.

## Rollout

Use a staged rollout rather than turning Browser Shield on fleet-wide at the fail-closed posture from day one.

1. Build and verify the release candidate locally.
2. Run the synthetic transport canary across fetch, forward, intercept, and reverse paths with receipt signing enabled.
3. Enable Browser Shield on a small opt-in agent group with `strictness: minimal` and `oversize_action: warn`.
4. Monitor shield receipts, validator-clearing behavior, adaptive score movement, response scanner deltas, and page breakage.
5. Move to `strictness: standard` and `oversize_action: block` only after the soak shows stable browsing behavior and no unexpected escalation.

## Inspecting receipts

When `flight_recorder.signing_key_path` is configured, shield receipts land in the flight-recorder directory alongside other action receipts. Each receipt is a chained Ed25519 signature; the published Python and TypeScript verifiers accept the new optional `shield` block without modification.

For receipt format details and verifier links, see [Action Receipt Spec](/learn/action-receipt-spec/).

---

See also: [Action Receipt Spec](/learn/action-receipt-spec/) &middot; [Media Policy](/learn/ai-agent-data-redaction/) &middot; [Full documentation](/pipelock/)
