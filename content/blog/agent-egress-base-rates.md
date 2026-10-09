---
title: "Agent Egress Base Rates: Most Alerts Can Still Be Wrong"
linkTitle: "Agent Egress Base Rates and Alert Precision"
date: 2026-09-07
author: "Josh Waldrep"
summary: "A low false-positive rate can still produce mostly false alerts. Work through the counts before treating a benchmark as a production forecast."
description: "Agent egress base rates change alert precision. A worked example shows why a low false-positive rate can still flood your queue with benign actions."
tags: ["ai-security", "benchmarks", "detection-engineering"]
blog_cat: "technical"
---

A detector can catch 99% of malicious actions and still produce mostly false alerts. You need to know how much benign traffic it's checking before that detection rate tells you what the alert queue will look like.

That matters for agent egress. A benchmark lets you choose how many malicious and benign cases to run. Your production workload determines its own mix.

## Count the alerts

Take a hypothetical detector that catches 99% of malicious actions and flags 0.1% of benign actions. Assume one alert per flagged action. These are made-up rates for the calculation, not measurements of Pipelock or another tool.

Run one million benign actions through it. At a 0.1% false-positive rate, you get 1,000 false alerts. Now change how many malicious actions arrive alongside that same benign traffic:

| Malicious actions | True alerts | False alerts | Alerts that are true |
| --- | --- | --- | --- |
| 10,000 | 9,900 | 1,000 | 90.8% |
| 1,000 | 990 | 1,000 | 49.7% |
| 100 | 99 | 1,000 | 9.0% |

Each row adds its malicious actions to the same one million benign actions. The detector's rates stay fixed. In the last row, it catches 99 of the 100 malicious actions, but 1,000 of its 1,099 alerts are false.

Precision is the fraction of alerts that are true: true alerts divided by all alerts. False-positive rate uses a different denominator: false alerts divided by benign actions. Mixing those up makes a 0.1% false-positive rate sound like 99.9% of alerts are right. They aren't the same measurement.

## A corpus doesn't give you the production mix

[Agent Egress Bench](/agent-egress-bench/) reports containment and false-positive rate separately. Its [methodology](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/gauntlet.md) gives each benign case equal weight in the selected view. That makes the corpus composition part of the measurement.

If you run equal numbers of malicious and benign cases, you've chosen that ratio for the test. It doesn't establish how often malicious actions occur in your workload. Even the detector's rates might change when the input changes. The table holds them fixed to isolate the effect of the traffic mix.

Adding benign cases can expose more false positives. Matching your real benign traffic matters too. A thousand copies of an easy request don't test the same things as documentation, tool descriptions, or development fixtures that resemble the material you're trying to catch. That's the reason to build a [benign set that looks malicious](/blog/benign-set-should-look-malicious/).

## Measure the workload you'll operate

Keep the benchmark result attached to its corpus and configuration. Then evaluate a separately labelled sample of your own traffic. Check unflagged actions as well as alerts; reviewing only alerts can't tell you how many malicious actions the detector missed.

Report the counts behind the rates. For an alerting system, count what someone must investigate. For a blocking system, count legitimate actions interrupted. If repeated alerts get grouped into one incident, report that grouping separately from action-level precision.

You can still use a benchmark to find regressions and compare results under the same test conditions. Before using it to forecast an operator's workload, check the [result-use rules](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/RESULTS-USE.md) and measure the traffic mix the forecast assumes.
