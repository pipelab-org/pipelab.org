---
title: "Attack Corpus Governance in Agent Egress Bench"
linkTitle: "Attack Corpus Governance"
date: 2026-09-05
author: "Josh Waldrep"
summary: "A public attack corpus needs fixed cases, visible errors, separate benign scoring, and result ownership that stays with the publisher."
description: "Attack corpus governance keeps benchmarks useful with fixed cases, honest errors, separate benign scoring, and publisher-owned evidence."
tags: ["detection-engineering", "benchmark", "agent-security", "open-source"]
blog_cat: "technical"
related: ["agent-egress-bench-benchmark-corpus", "benign-set-should-look-malicious", "check-the-work"]
---

A benchmark score can improve because the product caught more attacks, or because someone changed the cases. Comparing two runs requires knowing which happened. Case history, measurement errors, and the ownership of published results all affect what a reader can conclude.

I maintain [Agent Egress Bench](https://github.com/luckyPipewrench/agent-egress-bench/tree/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6), a public corpus for tools that sit on the network path between an agent and the internet. The corpus isn't independent. PipeLab maintains it, I build Pipelock, and a Pipelock run is first-party evidence. That boundary belongs in the post before anyone reads a result.

The repository documents how case changes and contributed results are handled. Here are the parts I would check before comparing runs, with links pinned to the source revision this post describes.

## Test the outcome people can see

A case should describe what crossed the boundary and the verdict it expects. It shouldn't reward the scanner for using a particular regex, model, or internal data structure. A credential in a request either gets stopped at the required boundary or reaches its destination. Another tool can attempt to reproduce that outcome.

Agent Egress Bench makes this distinction in its [case design](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/gauntlet.md#case-design) and contribution rules. A proposal that tests one product's implementation doesn't belong in the corpus. A proposal that names observable traffic and an expected allow or block can be debated in public.

This leaves plenty of judgment. A benchmark still has to decide whether a case is benign, malicious, in scope, or ambiguous. It does make the judgment visible. A product can't argue that it passed because it used a clever internal trick the rest of us can't inspect.

## Let old cases stay inconvenient

The quickest way to make a score look better is to change the questions after a run. Rename a case, soften an expected verdict, remove a difficult fixture, then publish the next number as though the denominator never moved.

That's why [case IDs and their semantics freeze when they merge](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/GOVERNANCE.md#case-id-immutability). A case that needs a different meaning gets a new ID. The old case remains in the corpus. A supersession record can explain the relationship, but it can't make the original result disappear.

The rule has a narrow exception for a genuine repository repair. The repair record binds the old and corrected bytes by hash, and CI checks it against the whole case inventory. That makes the exception reviewable instead of a quiet way to rewrite an awkward result.

This rule cuts both ways. It keeps a bad historical case visible. It also keeps an old product result honest about the corpus it used. A reader can see that two runs answered different questions instead of treating a version label as proof that they compare cleanly.

The contract also names a harder problem. A missing route, timeout, or verdict the runner can't observe means the runner failed to measure that case. It doesn't say the product passed or failed. The [run rules](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/gauntlet.md#what-makes-a-valid-run) keep those states visible and refuse a publishable result with measurement errors. A partial run should look partial.

## Score legitimate traffic separately

Containment asks one question. Did the tool stop the attack cases? It can't tell you whether the tool also blocked every normal request it touched. A scanner that denies everything gets a flattering containment number and makes itself unusable.

The [benign control group](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/README.md#what-it-measures) has its own score for that reason. Benign blocks count against the false-positive axis. They never disappear inside the containment number.

Keeping the scores separate lets a reader distinguish missed attacks from blocked normal work. A combined grade would also require choosing how much one error offsets the other; that weighting may not match the deployment being evaluated.

## Keep the result with the person making the claim

The corpus should publish the method. The vendor, lab, or customer who runs it should publish the result and the evidence behind it. That separation matters because a central scoreboard turns the corpus maintainer into the judge of every product claim.

For contributed results, Agent Egress Bench doesn't accept result bytes into the corpus repository. A publisher can host the raw evidence where they choose and add a [digest-bound pointer](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/ADOPTION.md#publish-results). Admission fetches the named evidence and checks its digest. It doesn't award approval, a rank, or a badge.

A matching digest shows that the linked bytes are the bytes the contributor named at admission. It cannot establish that the run was fair, representative, or independent. That distinction keeps the evidence useful without asking the corpus to certify the claim.

A vendor's self-run result still isn't independent. It does give a reader the material needed to inspect the run, compare the corpus and runner identity, and disagree with the claim. A benchmark should say exactly which of those things it has.

## The maintainer has to stay inside the same rules

I don't get a special lane because I wrote the corpus. Pipelock's adapter is a reference example, and Pipelock's published results are first-party regression evidence. The [governance policy](https://github.com/luckyPipewrench/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/GOVERNANCE.md#conflict-of-interest) says the repository publishes no ranking, no cross-tool comparison table, and no certification. Anyone can publish an adverse Pipelock result without asking me first.

People can inspect, run, and challenge those commitments. They don't establish broad adoption. A public repository stays maintainer-run even when its maintainer calls it neutral.

Before comparing two published runs, check their corpus revisions, whether either run has measurement errors, and the benign score alongside containment. Then check who ran them and whether the linked evidence is available. Those checks establish what the comparison covers; the governance policy gives you somewhere to challenge a case or a result that does not meet the documented contract.
