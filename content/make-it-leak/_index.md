---
title: "Make It Leak"
linkTitle: "Make It Leak"
subtitle: "Each episode is a captured blocked attempt with a signed receipt you verify yourself, offline."
description: "Make It Leak: each episode is a real agent-style attack that Pipelock blocked, with a signed audit packet you can verify offline."
date: 2026-07-04
lastmod: 2026-07-04
type: make-it-leak
disable_cta: true
og_image: "https://pipelab.org/images/og/og-playground-v2.png"
---

Make It Leak is a running series. In each episode an agent is manipulated into trying to send a secret somewhere it should not go, and Pipelock signs the allow or block decision before the destination ever sees the request. Every episode ships the real signed audit packet from that run, so you can re-check the decision yourself, offline, with the same verifier anyone can download.

The [live Playground](/playground-challenge/) lets you try this against a real agent right now. The episodes below are captured, signed runs you can verify at your own pace.

## Episodes

- [#002: poisoned ticket, webhook exfiltration](/make-it-leak/002/)
- [#003: poisoned README, key paste](/make-it-leak/003/)
- [#004: hostile page, session keys](/make-it-leak/004/)

Each episode records the *mediated decision* Pipelock signed. A verified chain proves that decision was signed and untampered. It does not prove session completeness, that the agent was sandboxed, or that traffic could not bypass Pipelock. The prompts are unsigned narration; only the chain of decisions is signed.
