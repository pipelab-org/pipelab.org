---
title: "A Valid Receipt Chain Can Still Be Cut Short"
linkTitle: "A Valid Receipt Chain Can Be Cut Short"
date: 2026-10-14
author: "Josh Waldrep"
blog_cat: technical
summary: "Every surviving link can verify while the end of a receipt log is missing. Verification needs to say which claim it proved."
description: "A valid receipt chain can still be missing its final records. Learn how endpoint proof separates an intact log prefix from a completed run."
canonical_url: "https://pipelab.org/blog/a-valid-receipt-chain-can-still-be-cut-short/"
tags: ["receipts", "audit-logs", "pipelock"]
---

Remove the end of a hash-chained log and the records you kept can still verify. Each surviving record links to the one before it. Its signature hasn't changed. Nothing in those earlier records tells you how many records used to follow them.

That leaves a gap in an audit. You might have an intact account of the start of an agent run while the actions you need to examine are missing from the end. Checking the links establishes the integrity of the records you have. It doesn't establish that you have the finished run.

## The verifier needs evidence of the ending

A verifier can check the endpoint against a final hash or sequence you preserved independently. It can also check a signed close that binds the run's endpoint. Both give it something beyond the surviving links to compare with.

The scope matters. A close for one run doesn't establish that you collected every run. A close for one chain doesn't establish that you collected every shard of a parallel recording group. A signer you haven't independently trusted can sign a consistent story too.

Pipelock v3.7 makes the missing-end result explicit. For a valid chain without endpoint proof, the verifier prints:

```text
VALID PREFIX, END UNPROVEN
```

It exits 3. A script that requires a successful verification now stops instead of treating that prefix as a completed run. Exit 0 requires verified integrity and a proven endpoint for the declared chain scope. Invalid evidence and usage failures have separate exits.

An active recorder naturally has an open chain. If your task is to inspect what it has recorded so far, `--allow-prefix` accepts a valid prefix and returns 0 while keeping the same `END UNPROVEN` label. That flag changes what your script accepts; it doesn't supply evidence of an ending.

## Different recordings need different boundaries

For a receipt chain, `--expect-head` or `--expect-seq` checks an independently known endpoint. Preserve that endpoint somewhere the person supplying the log can't replace along with it. For an action-receipt chain, a terminal signed session close also proves the end when the run has its own per-run session. EvidenceReceipt v2 chains have no end marker, so a cleanly stopped recorder still needs whole-recorder verification to prove its ending without an independent receipt endpoint pin.

Whole-recorder verification covers more than the receipt chain. Its endpoint proof comes from a transcript root covered by the trailing signed checkpoint. Pinning a receipt hash doesn't authenticate the surrounding recorder entries. For a parallel receipt group, preserve the complete directory and verify the signed group scope; one intact shard is insufficient.

Older Pipelock recordings reused a shared session across restarts. A close or seal in that history doesn't establish that no later run followed it, so those chains retain the unproven-end result. Receipt endpoint pins can establish the selected receipt endpoint; they don't prove a whole-recorder endpoint in that older shared-session history.

Restart links and signed recovery seals also have a different job. They describe continuity or attest a discontinuity. A recovery seal doesn't repair damaged history, and neither record proves that the recording ended.

## Keep the claim as narrow as the evidence

A proven endpoint tells you that the supplied records reach the authenticated boundary of the selected scope. It doesn't prove that every agent action passed through the recorder, that the signer was uncompromised, or that no secret escaped through another path. Those claims need deployment controls and a trusted signer, not just a valid chain.

Review the [receipt verification guide](/learn/verify-a-receipt/) and the [parallel-chain guide](/learn/parallel-receipt-chains/). If you automate verification, the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/) explains the exit and report changes. The [release notes](/blog/pipelock-v370-release/) link the rest of the release.
