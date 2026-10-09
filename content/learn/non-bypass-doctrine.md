---
title: "What Pipelock Claims, and What It Doesn't"
linkTitle: "What Pipelock Claims and Doesn't"
subtitle: "Pipelock never claims it cannot be bypassed. Here is exactly what it does claim, and why the honest version is the stronger one."
description: "Pipelock never claims non-bypass. It claims deterministic scanning of mediated traffic, containment as deployment guidance, and signed evidence."
date: 2026-06-13
lastmod: 2026-08-08
learn_cat: concepts
level: deep
tags:
  - evidence
  - agent-firewall
  - concepts
faq:
  - q: "Does Pipelock claim it cannot be bypassed?"
    a: "No. Pipelock never claims non-bypass and never reports that no bypass occurred. Any control on the traffic path can be bypassed, and a vendor that claims otherwise is the one to distrust. Pipelock claims three specific things: deterministic scanning of mediated traffic, kernel containment as deployment guidance backed by a shipped self-test, and a signed receipt set that makes the mediated fraction of traffic measurable."
  - q: "If it can be bypassed, what is the point?"
    a: "Bypassability is the argument for an evidence layer, not against the other controls. Prevention and detection reduce risk on the traffic Pipelock sees. Containment raises the cost of going around it. Evidence then makes the mediated fraction measurable, so instead of trusting that nothing got through, you can see what actually crossed and what was never observed. That is a stronger position for a risk or audit buyer than an unverifiable non-bypass claim."
  - q: "What does a verified receipt chain actually prove?"
    a: "A verified chain proves the included mediated decisions were signed by the mediator and untampered. It does not prove session completeness, that no event was missed, that the agent was sandboxed, or that traffic could not bypass Pipelock. The prompts and responses shown alongside receipts are unsigned playback metadata; only the receipt chain of decisions is signed. Pipelock renders that statement verbatim on every surface that shows a receipt chain."
  - q: "How is containment verified if it is not binary-enforced?"
    a: "Containment is enforced by how you deploy the agent (container networking, host containment, network policy), not by the Pipelock binary on its own. Pipelock ships a self-test, the egress canary in 'pipelock contain verify', that attempts to reach the network from the contained account while bypassing the proxy and confirms the attempt is blocked. The control is the deployment's; the test that it actually holds is built into the binary."
  - q: "What is AARP and how is it different from CSA AARM?"
    a: "AARP, the Agent Action Receipt Profile, is Pipelock's appraisal layer. It sits alongside a frozen receipt and reports what a verifier could cryptographically confirm versus what the producer only claimed, and it never emits a 'trusted' or 'safe' verdict. CSA AARM is a separate, external taxonomy from the Cloud Security Alliance that Pipelock's action and side-effect vocabulary aligns to. They are different things: AARP is Pipelock's profile, AARM is an industry taxonomy. Do not conflate them."
---

Pipelock does not claim it cannot be bypassed. It never reports that no bypass occurred. That is a deliberate position, and it is a sales asset, not a disclaimer.

The skeptical line about runtime security is that every sandbox can be escaped, so why trust any of it. The line is correct about bypassability and wrong about the conclusion. Bypassability is the reason to add an evidence layer, the one control that tells you what actually crossed instead of asking you to trust that nothing did. The honest claim is the stronger one in front of a risk or audit buyer, because it is the one they can verify.

## What Pipelock claims

Three things, stated precisely:

1. **Deterministic scanning of mediated traffic.** Traffic that passes through Pipelock is scanned by a fixed pipeline: DLP, prompt-injection, SSRF, and tool-policy checks that produce the same verdict on the same input every time. This is enforced by the binary, on the fraction of traffic it mediates.
2. **Kernel containment as deployment guidance, with a shipped self-test.** Pipelock does not isolate the agent process by itself. You enforce containment with container networking, host containment, or network policy. The binary ships an egress canary in `pipelock contain verify` that attempts to reach the network from the contained account while deliberately bypassing the proxy, and confirms the attempt is denied. The containment is yours; the proof it holds is built in.
3. **A receipt set that makes the mediated fraction measurable.** Mediated decisions can emit signed receipts that verify offline against a pinned key. That turns "assume the sandbox fails" into a measurable question: of the actions we observed, what fraction did we mediate, and what was never seen. The completeness metric is the technical answer to "prove what actually crossed."

## What Pipelock does not claim

It does not claim non-bypass. It does not claim a verified receipt chain means the session was complete or the agent was sandboxed. The exact, standing statement, rendered verbatim on every surface that shows a receipt chain:

> A verified chain proves the included mediated decisions were signed by the mediator and untampered. It does NOT prove session completeness, that no event was missed, that the agent was sandboxed, or that traffic could not bypass Pipelock. The prompts and responses shown are unsigned playback metadata; only the receipt chain of decisions is signed.

Writing "no bypass occurred" would be the trap. To a risk or audit buyer, an unverifiable non-bypass claim is a liability the day it is wrong. A measurable mediated fraction, with documented limits, holds up.

## Validity is not assurance

A valid signature proves record integrity: these bytes were signed by this key and not altered. It proves nothing about whether the decision was correct, whether anything bypassed the mediator, or whether the receipt is the whole story.

Pipelock's appraisal layer, the [Agent Action Receipt Profile (AARP)](/learn/aarp-what-it-proves/), makes that distinction machine-readable. AARP sits alongside a frozen receipt and reports verified claims, the producer's claimed-but-unverified set, and an explicit list of what it does not assert. The AARP verifier never emits a `trusted` or `safe` verdict.

Keep AARP distinct from CSA AARM. AARP is Pipelock's profile. CSA AARM is a separate external taxonomy from the Cloud Security Alliance that Pipelock's action-type and side-effect vocabulary aligns to. Same neighborhood, different artifacts.

## Binary-enforced versus deployment-enforced

The claims above split on this line, and the split is the doctrine:

- **Binary-enforced:** deterministic scanning of mediated traffic, and the signed evidence. Properties of the software.
- **Deployment-enforced:** containment. A property of how you isolate the agent, not of the binary. Pipelock states this rather than implying the binary sandboxes the agent.

This is the [public documentation standard](/learn/agent-security-model/#binary-enforced-versus-deployment-enforced) Pipelock holds itself to: if a property depends on sandboxing, containers, user separation, or network policy, say so. The non-bypass doctrine lives or dies on that distinction.

## Where to go next

- [Known limitations register](/learn/known-limitations/) for the standing list of what Pipelock does not catch
- [Defining the agent security category](/learn/agent-security-model/) for the four functions this doctrine sits inside
- [AARP: what it proves and what it does not](/learn/aarp-what-it-proves/) for the appraisal layer
- [Action receipt spec](/learn/action-receipt-spec/) for the receipt format and verifier
