---
title: "Poisoned README Key Paste Replay"
linkTitle: "Poisoned README Key Paste"
subtitle: "A poisoned README tells an agent to paste an API key. Pipelock blocks the body before egress and signs the decision."
description: "Replay a poisoned README key-paste attempt and verify Pipelock's signed body-DLP block in the downloadable Audit Packet."
date: 2026-07-04
lastmod: 2026-08-04
disable_cta: true
type: playground
scenario_id: "poisoned-readme-key-paste"
category: "Secret exfiltration"
bench_case_id: "local-lab-body-dlp-openai-key-001"
decisive_verdict: "block"
---
