---
title: "Poisoned Ticket Webhook Replay"
linkTitle: "Poisoned Ticket Webhook"
subtitle: "A poisoned support ticket tries to send private-key material to a webhook. Pipelock blocks and signs the write."
description: "Replay a poisoned support-ticket exfiltration attempt and verify Pipelock's signed body-DLP block in the downloadable Audit Packet."
date: 2026-07-04
lastmod: 2026-08-04
disable_cta: true
type: playground
scenario_id: "poisoned-ticket-webhook-exfil"
category: "Secret exfiltration"
bench_case_id: "local-lab-body-dlp-private-key-001"
decisive_verdict: "block"
---
