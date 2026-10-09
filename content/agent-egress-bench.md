---
title: "Agent Egress Bench"
linkTitle: "Agent Egress Bench"
seoTitle: "Agent Egress Bench: Open Agent Security Benchmark"
description: "A tool-neutral benchmark for testing agent egress controls against public attack cases with reproducible, offline-checkable results."
type: project
project_id: bench
project_mark: "/images/brand/agent-egress-bench-logo.svg"
project_eyebrow: "Open benchmark · maintained by PipeLab"
project_name: "Agent Egress Bench"
project_accent: "Bench"
project_actions:
  - label: "Run the benchmark"
    href: "https://github.com/luckyPipewrench/agent-egress-bench"
    primary: true
  - label: "View Pipelock runs"
    href: "/gauntlet/"
project_facts:
  - label: "Cases"
    value_stat: "bench_cases"
  - label: "Scope"
    value: "Tool neutral"
  - label: "Results"
    value: "Reproducible"
  - label: "License"
    value: "Apache 2.0"
project_sections:
  - number: "01"
    label: "What a result adds"
    title: "Attack cases and false-positive controls belong in the same run"
    wide: true
    columns:
      - "Attack cases check whether the control stops an unsafe request and proves the decision it made. False-positive controls check whether ordinary traffic still works. A useful result needs both."
      - "A missing route, delivery record, or decision isn't counted as a pass. The result stays bound to the exact product, version, configuration, adapter, capability profile, corpus, and scoring version used for that run."
  - number: "02"
    label: "Neutrality"
    title: "PipeLab maintains it. Pipelock doesn't control it."
    body: "PipeLab also builds Pipelock, so the boundary matters. The benchmark publishes no ranking and awards no mark. Anyone can test another product or publish a result that reflects badly on Pipelock without asking PipeLab."
  - number: "03"
    label: "Run it yourself"
    title: "The corpus and method are public"
    links:
      - label: "Source and quick start"
        href: "https://github.com/luckyPipewrench/agent-egress-bench"
      - label: "Scoring method"
        href: "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/gauntlet.md"
      - label: "Add another security tool"
        href: "https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/ADOPTION.md"
      - label: "Pipelock's first-party runs"
        href: "/gauntlet/"
date: 2026-08-27
lastmod: 2026-08-27
disable_cta: true
disable_related: true
---
