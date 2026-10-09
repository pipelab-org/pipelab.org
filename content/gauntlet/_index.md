---
title: "Agent Egress Bench"
seoTitle: "Agent Egress Bench: Pipelock Run History"
description: "Pipelock's own Agent Egress Bench run history: containment scores, false positive rates, and per-category breakdowns, with the commands to reproduce them."
lastmod: 2026-08-05
hide_list: true
---

<div class="hero-buttons" style="margin-bottom: 2rem;">
  <a href="/gauntlet/results/" class="btn btn-primary">View the run history</a>
  <a href="/gauntlet/submit/" class="btn btn-ghost">Publish your own result</a>
</div>

This page carries Pipelock's own Agent Egress Bench runs, disclosed as first-party evidence. It is not a ranking and it does not score other tools. Anyone can run the same corpus against any target and publish what they find, including a result that reflects badly on Pipelock, with no notice or approval. The [results-use and attribution policy](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/RESULTS-USE.md) defines the labels to use and the facts to publish beside a score, and the [launch write-up](/blog/pipelock-gauntlet-public-benchmark/) explains why the scores are published this way.

{{< bench-summary >}}

This tests the security tool, not the agent. [View the scoring methodology.](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/gauntlet.md)

<details>
<summary>How to run Agent Egress Bench yourself</summary>

Run the reviewed Pipelock release from a clean Linux clone:

```bash
git clone https://github.com/luckyPipewrench/agent-egress-bench.git
cd agent-egress-bench
./scripts/run-pipelock-gauntlet.sh
```

For another security tool, build the shared runner and supply that tool's capability profile and adapter:

```bash
git clone https://github.com/luckyPipewrench/agent-egress-bench.git
cd agent-egress-bench/runner
go build -o aeb-gauntlet .
./aeb-gauntlet --cases ../cases --profile my-profile.json --output results.json
```

See the [adoption guide](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/ADOPTION.md) for building a runner. You publish and own your result. Label the run and include the identifying facts from the [results-use policy](https://github.com/luckyPipewrench/agent-egress-bench/blob/main/docs/RESULTS-USE.md), then [open a discussion](https://github.com/luckyPipewrench/agent-egress-bench/discussions) if you want it looked at.

</details>
