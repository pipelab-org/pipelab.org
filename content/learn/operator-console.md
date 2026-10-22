---
title: "The Pipelock Operator Console"
linkTitle: "Operator Console"
seoTitle: "Pipelock Operator Console for AI Agents"
subtitle: "See what your agents did, inspect the signed evidence, and read your fleet state — with a console that is honest about the limits of what it can prove."
description: "The Pipelock operator console: a read-only view over signed agent evidence, exemptions, budgets, and fleet state, with offline-verifiable proof."
date: 2026-07-15
lastmod: 2026-07-15
learn_cat: operator
level: intro
tags:
  - dashboard
  - operator
  - evidence
  - fleet
  - agents
related:
  - agent-egress-control
  - verifiable-egress-control
  - egress-vs-inbound-agent-firewall
faq:
  - q: "Can an agent bypass Pipelock?"
    a: "Coverage is for MEDIATED traffic, meaning traffic that actually routes through Pipelock. The binary enforces policy on what it mediates; it does not, by itself, force every process on the host through it. Blocking direct egress around Pipelock is a deployment step (container networking, Kubernetes NetworkPolicy, firewall rules, or pipelock contain install, which uses kernel nftables owner-match so a contained agent's only route out is the proxy; posture evidence reports this as kernel_observed, not a continuous kernel_enforced guarantee, since a reachable setuid or file-capability helper could still egress under another UID). The console reflects this honestly: it reports on mediated activity and shows unknown or empty states where a source is not connected."
  - q: "Who signs the receipts, and what does verifying one actually prove?"
    a: "The operator's Pipelock instance signs each decision with an Ed25519 key. Verifying a single receipt offline against the expected pinned public key proves the record is Authentic (it came from that key) and was not changed. Verifying a JSONL file or a directory with --chain proves hash-chain continuity for the loaded receipts. Neither proves that all agent activity was mediated, that no direct activity occurred, or that an external party witnessed it; the console labels those as separate properties."
  - q: "What does Completeness: LIMITED mean?"
    a: "The evidence scorecard never claims COMPLETE. LIMITED means the signed record covers the sessions and window Pipelock mediated, with any gaps or standing exclusions shown. It is honest scoping, not a defect. A coverage certificate attests declared coverage for listed mediated sessions over a bounded window, exclusions visible."
  - q: "What is free versus Pro versus Enterprise?"
    a: "Free: inspect ONE selected recorded session as a read-only evidence view (pipelock evidence serve / view) and verify signed evidence and coverage certificates offline. Pro (agents license): the operator console's agent and evidence surfaces plus coverage-certificate generation. Enterprise (fleet license): adds the live Fleet, Workbench, and Incident surfaces and SIEM event forwarding. The dashboard is not free; single-session evidence viewing and offline verification are."
  - q: "What data leaves my environment?"
    a: "No Pipelock-managed telemetry leaves by default. Pipelock still forwards the mediated agent traffic you allow on to the destination you configured or requested (it is an egress mediator, not a data diode). Crash reporting is opt-in; Enterprise SIEM forwarding is a configured path to an exact-host allowlist; offline verification calls no service."
  - q: "What happens when a data source is not connected?"
    a: "The console renders an explicit unknown or empty state. It does not imply health it cannot show. A disconnected source reads as disconnected, not green."
---

Pipelock includes an operator console: a read-only view over the signed evidence Pipelock records for the traffic and tool calls it mediates. It shows what your agents did, lets you inspect and verify the receipt behind each decision, and gives operators read-only surfaces for exemptions, budgets, keys, and fleet state (mutations happen through the CLI and Conductor commands, not the console). It is deliberately honest about the limits of what it can prove.

{{< youtube WeoTRuiYy3s >}}

## What you are looking at

The console filters by authorization: a Pro license opens the agent and evidence surfaces; Enterprise adds the live fleet, workbench, and incident surfaces. Unconnected sources render explicit empty states rather than implying health.

{{< figure src="/img/dashboard/overview.png" alt="Operator console Overview: a summary of what is happening and what can be proven, with an explicit notice that no conductor source is configured" caption="Overview (Enterprise view, live fleet posture populated). It leads with 'what can I prove?' and shows honest empty states, like an unconfigured conductor source, instead of faking a healthy dashboard; on a Pro license the fleet section shows an Enterprise-required or no-source state." >}}

{{< figure src="/img/dashboard/evidence-scorecard.png" alt="Evidence view scorecard showing Authentic verified, Untampered chain valid, Anchored not anchored, and Completeness limited" caption="Evidence (Pro). Each session’s evidence is scored on four separate axes: Authentic (signed by the expected key), Untampered (hash chain intact), Anchored (whether it was externally anchored), and Completeness (LIMITED, never COMPLETE). The console never collapses these into a single 'verified.'" >}}

{{< figure src="/img/dashboard/fleet.png" alt="Fleet Overview listing enrolled followers with applied-state and drift status" caption="Fleet (Enterprise). Enrolled followers report runtime, signed-audit, applied-state, and drift status; stale or diverged followers render as non-green states rather than being assumed healthy." >}}

## Free, Pro, and Enterprise

| Capability | Free | Pro (`agents`) | Enterprise (`fleet`) |
|---|---|---|---|
| Inspect one recorded session (read-only) | yes | yes | yes |
| Verify signed evidence + [coverage certs](/learn/coverage-certificates/) offline | yes | yes | yes |
| Operator console: Overview, Evidence, Exemptions, Agents, Budgets, Trust & Keys | no | yes | yes |
| Generate coverage certificates | no | yes | yes |
| Live Fleet, Workbench, Incident surfaces | no | no | yes |
| [SIEM event forwarding](/learn/ai-agent-siem-logging/) | no | no | yes |

Single-session evidence viewing and offline verification are free. The console itself is a Pro and Enterprise capability.

## The evidence is honest about what it proves

The scorecard keeps four claims separate on purpose, because collapsing them into one word is how "audit logs" oversell themselves:

- **Authentic** — the record was signed by the expected key. Verifying offline against the expected pinned public key is what makes this meaningful; a valid signature alone does not establish a trusted signer.
- **Untampered** — the loaded hash chain is intact, so loaded records were not altered or reordered and no sequence gap was found. Tail truncation, omitted sources, and direct egress stay completeness and anchoring questions.
- **Anchored** — whether the record was additionally committed to an external log. The scorecard reports Not anchored unless an external inclusion proof is verified, and shows that default state rather than folding it into Authentic or Untampered.
- **Completeness** — reported as LIMITED, never COMPLETE. It covers the sessions and window Pipelock **mediated**, with gaps and standing exclusions visible.

That last point is the boundary that matters: Pipelock proves what it mediated, not what it never saw. If you need every path forced through the proxy, that is a deployment control (see the FAQ), not a claim the binary makes on its own.

## Run it yourself

You do not need the console, or a license, to see the proof model:

```bash
pipelock demo --receipts-dir /tmp/r
receipt="$(find /tmp/r -maxdepth 1 -name '*.json' | sort | head -n 1)"
pipelock verify-receipt "$receipt" --key "$(cat /tmp/r/signer.pub)"
```

That throws real attacks at a local instance, blocks them, and signs a receipt for each; you then verify one offline against the published key. Without `--key`, verification is structural only and reports `UNPINNED`. To view a recorded session as a read-only evidence page, free:

```bash
pipelock evidence serve --receipt-dir /var/lib/pipelock/evidence --session agent-a
```

Or try the [browser challenge](/playground/): a real agent guards a planted secret, and you try to get it out.

## Upgrading

Pipelock 3.2 is the current hardening line with fail-closed changes to receipt verification, reload behavior, and signing-key requirements. Read the [GitHub releases](https://github.com/pipelab-org/pipelock/releases) before upgrading.
