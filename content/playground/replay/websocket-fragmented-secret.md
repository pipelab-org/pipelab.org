---
title: "Fragmented WebSocket Secret Replay"
linkTitle: "Fragmented WebSocket Secret"
subtitle: "A credential is split across WebSocket frames. Pipelock reassembles the message, blocks it, and signs the decision."
description: "Replay a fragmented WebSocket credential leak and verify Pipelock's signed DLP block after frame reassembly in the Audit Packet."
date: 2026-08-04
lastmod: 2026-08-04
disable_cta: true
type: playground
scenario_id: "websocket-fragmented-secret"
category: "WebSocket exfiltration"
bench_case_id: "local-lab-websocket-fragmented-dlp-001"
decisive_verdict: "block"
---
