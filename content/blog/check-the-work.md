---
title: "Agent Security Asks You to Trust It. Four Things You Can Check Instead"
linkTitle: "Four Things You Can Check"
seoTitle: "Agent Security You Can Verify: Four Open Artifacts"
date: 2026-09-01
author: "Josh Waldrep"
summary: "An evidence standard with its own checker, a rerunnable attack corpus, a signed rules registry, and a firewall that writes that evidence natively. Three first releases and a Pipelock release, one idea: hand people the artifact."
description: "Four open artifacts for agent security you can check yourself: an evidence standard and checker, a rerunnable attack corpus, signed rules, and a firewall."
tags: ["agent-security", "evidence", "benchmark", "open-source", "ai-security"]
blog_cat: "field"
faq:
  - q: "What is Agent Evidence Level?"
    a: "A draft standard that grades a record of AI-agent activity from AEL-0 to AEL-4 by what an independent party can verify from the artifact and what omission they can detect. The spec is CC BY 4.0; the reference checker and conformance corpus are Apache-2.0."
  - q: "Can I score my own egress control against Agent Egress Bench?"
    a: "Yes. The corpus is tool-neutral. Each case describes what an agent tries to leak or reach, and any control can be run against the same cases and scored the same way."
  - q: "Does Pipelock v3.5.0 produce AEL evidence?"
    a: "Yes. The receipts Pipelock emits about what an agent did are the same shape the AEL reference checker consumes, so you can run the checker on a real export rather than a fixture."
---

Every agent security product I've looked at defends a boundary of some kind. I couldn't find one that let me check the work afterward without going back to the vendor.

You get a dashboard that says it blocked things, a log the product wrote about itself, and a percentage on a landing page. If an auditor asks you to prove any of it, or you need to know six months later what your agent did on a Tuesday, you end up quoting the same company whose product you're evaluating. That's the normal state of the field and it doesn't seem to bother anyone.

There's no good reason security software gets that pass. A pressure vessel gets a stamp from an inspector who doesn't sell pressure vessels. Runtime security for AI agents gets a screenshot.

So the four things I'm tagging this week are all the same idea from different angles: hand you the artifact and let you check it yourself.

## Agent Evidence Level

[Agent Evidence Level](/learn/agent-evidence-levels/) is a draft standard for grading a record of agent activity, AEL-0 through AEL-4, by one question: what can someone who doesn't trust you verify from the bytes, and what tampering would they catch. The spec is CC BY 4.0 and names no products. The reference checker and a conformance corpus ship with it under Apache-2.0, because a standard that says "earned, not asserted" and then ships without a runnable checker is doing the thing it complains about.

My own deployment is in the registry with no grade. It stays that way until somebody who isn't me signs a verification record, and if this scale graded its own editor at the top you'd be right to distrust the scale.

## Agent Egress Bench

[Agent Egress Bench](/agent-egress-bench/) is the attack corpus. It's tool-neutral: cases describe what an agent tries to leak or reach, and any egress control can be scored against them. A number from this corpus means something because you can rerun it. If you can't rerun a benchmark, it's an advertisement.

## Pipelock Rules

[Pipelock Rules](/pipelock-rules/) is the signed detection-bundle registry. A bundle is Ed25519-signed and additive, so it can add detections and can't weaken a built-in one. Pipelock checks the signature against a keyring compiled into the release binary before anything loads, and a re-run can't roll you back to an older bundle than the one you already had.

## Pipelock v3.5.0

[Pipelock v3.5.0](/blog/pipelock-v350-release/) is the firewall itself, and it now writes AEL evidence natively. The receipts it emits about what your agent did are the same shape the checker consumes, so the standard above isn't a spec I'm hoping someone adopts. There's a producer.

I'm not asking anyone to take my word for any of it. Run the corpus, run the checker, and if you find a hole, send it. That's the bar I want the whole field held to, starting with me.
