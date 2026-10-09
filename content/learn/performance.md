---
title: "Pipelock Performance"
linkTitle: "Pipelock Performance"
seoTitle: "Pipelock Performance Benchmark"
description: "Latency, cold-start, and memory overhead numbers for Pipelock across HTTP, SSE, MCP stdio, WebSocket, and tool-call chains. Reproducible."
date: 2026-05-15
learn_cat: concepts
level: deep
tags:
  - performance
  - benchmark
  - latency
---

Pipelock adds 0.5 to 2 ms to a round-trip depending on transport, and starts in under 50 ms. Numbers come from one quick-mode run on a Linux x86-64 desktop. Run it yourself; your numbers may vary slightly.

## Latency overhead

The bench drives traffic against a deterministic mock backend directly and through Pipelock, in adjacent pairs to control for thermal drift.

| Transport | Direct p50 | Proxied p50 | Pipelock overhead |
|---|---|---|---|
| HTTP GET | 88 µs | 1.6 ms | +1.5 ms |
| SSE (100 chunks) | 81 ms | 72 ms | within noise |
| Tool-call chain (3 round trips) | 290 µs | 2.2 ms | +1.9 ms |
| MCP stdio (`tools/call`) | 22 µs | 0.5 ms | +0.46 ms |
| WebSocket (100 frames) | 5.7 ms | 65 ms | +60 ms (~600 µs/frame) |

SSE responses stream through Pipelock chunk-by-chunk. Direct TTFB is 152 µs; proxied TTFB is 1.33 ms — within one order of magnitude of direct, on every config including the default with response scanning fully on. Per-event DLP and prompt-injection scanning runs inline against each event; clean events flush immediately. The pre-v2.5 buffered downgrade (proxied TTFB ≈ full-stream time) is gone.

## Cold start

| Config | First request served p50 |
|---|---|
| minimal (audit, no patterns) | 52 ms |
| default (balanced, default patterns) | 52 ms |
| full (strict, every scanner) | 52 ms |

The 50 ms floor is the bench's poll interval. Pipelock starts faster than that. Treat 50 ms as the upper bound.

## Memory

Release-mode runs sample `/proc/<pid>/status` and Pipelock's Prometheus `/metrics` endpoint every 10 seconds for 30 minutes under load. Idle on a 64-bit Linux box: 34 MiB RSS, 15 MiB Go heap-sys, about 20 goroutines.

## Reproduce

```bash
git clone https://github.com/luckyPipewrench/pipelock
cd pipelock
make bench-egress
cat bench/egress/results.json
```

The bench lives in-tree at [`bench/egress/`](https://github.com/luckyPipewrench/pipelock/tree/main/bench/egress) and its [README](https://github.com/luckyPipewrench/pipelock/blob/main/bench/egress/README.md) documents the JSON schema, the five mock backends, and the three configs. Use `make bench-egress-release` for 10,000-iteration percentiles (45-60 min).
