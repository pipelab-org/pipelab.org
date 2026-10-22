---
title: "Agent Security Tool Profiles: Procurement Evidence"
linkTitle: "Agent Security Tool Profiles"
seoTitle: "Agent Security Tool Profiles: Receipt Rubric"
subtitle: "Receipt-scoring profiles answer the procurement question with structured evidence per tool. No aggregate ranking."
description: "Receipt-scoring profiles for agent security tools: signed, offline-verifiable evidence buyers can reproduce against the public corpus."
date: 2026-05-22
lastmod: 2026-05-22
learn_cat: concepts
level: intro
tags:
  - procurement
  - receipts
  - profiles
  - rubric
---

A procurement reviewer asks one question of an agent security tool:

> Can you prove what your tool did, with evidence I can verify offline?

A receipt-scoring profile is the structured answer. The rubric lives in the
public [`agent-egress-bench`](https://github.com/pipelab-org/agent-egress-bench)
corpus. Tool maintainers publish their own profile against a fixed public
case set. A relying party reproduces it before trusting it.

## What a signed receipt proves

A signed action receipt records what an agent tried to do, what verdict the
tool returned, and which key signed the record. A receipt is durable evidence
the tool both observed and adjudicated the action. A relying party can verify
the receipt against a pinned public key without a vendor dashboard and without
a network call to a hosted API. The verifier code is open source. The buyer
runs it.

This is the difference between a tool that *says* it blocked an attack and a
tool that produces a record an auditor can validate after the fact, in their
own runner, with no vendor in the loop.

## What the rubric measures, and what it does not

Five dimensions per case: `blocked`, `explained`, `receipt_produced`,
`receipt_independently_verifiable`, and `false_positive`. The dimensions are
independent. A tool can score `blocked=yes` with `receipt_produced=no` (verdict
without a signed record). A tool can score `receipt_produced=yes` with
`receipt_independently_verifiable=no` (the receipt validates inside the
vendor's own stack). The buyer weights the dimensions; the rubric does not.
There is no aggregate score, no letter grade, and no cross-tool leaderboard.
The [rubric document](https://github.com/pipelab-org/agent-egress-bench/blob/main/docs/RECEIPT-SCORING.md)
spells out how each value is earned and which checks a verifier has to pass.

The profile shape is pinned by
[`receipt-scoring-profile-v4.schema.json`](https://github.com/pipelab-org/agent-egress-bench/blob/main/schemas/receipt-scoring-profile-v4.schema.json).
A submission that does not validate is rejected.

## Pipelock's published profile

[`profiles/pipelock.json`](https://github.com/pipelab-org/agent-egress-bench/blob/main/profiles/pipelock.json)
historically reported at corpus v2.0.0: **113 of 113 malicious cases blocked,
0 false positives on 38 benign baselines, 0 receipts produced or independently
verifiable**. For current case counts and release-run scores, see the live
[Agent Egress Bench results](/gauntlet/).

In this run, Pipelock's scanner pipeline blocked every malicious case. The
runner captured structured evidence on 105 of the 113 blocked cases through
`scanner`, `block_reason`, or `kind` fields in adapter evidence. The proxy
data path does not yet emit per-action signed receipts, so the receipt columns
are zero. The verifier already ships (`pipelock-verifier`, Apache-2.0) for the
receipt formats that do exist: ActionReceipt v1 for proxy-decision evidence
and EvidenceReceipt v2 for contract-lifecycle and shadow evidence. Wiring the
proxy data path to emit a signed receipt for every adjudicated action is a
separate Pipelock feature, not part of the current profile.

That gap is intentional in the rubric. A tool that scores `blocked=yes` and
`receipt_produced=no` is useful in operations and not yet evidence-bearing. A
buyer evaluating for a regulated workload should know that before signing a
contract.

## Publishing your own profile

A tool maintainer adds `profiles/<tool>.json` to the bench repo via pull
request. The PR is reviewed for:

- Profile JSON validates against the published schema.
- Per-case IDs reference real cases in `cases/`.
- The `verifier` block names a real binary, a real OSI license, and the
  exit-code contract a relying party can rely on.

The review is for shape and accuracy. There is nothing to pass. The profile
is the published evidence; the buyer reproduces it before treating it as
trustworthy.

See the [`profiles/` README](https://github.com/pipelab-org/agent-egress-bench/blob/main/profiles/README.md)
for the submission steps and the reproduction command.
