---
title: "Progressive Enforcement for AI Agents"
linkTitle: "Progressive Enforcement"
subtitle: "Observe, baseline, shadow, then enforce. Roll a blocking agent firewall into a live fleet without breaking production."
description: "Progressive enforcement for AI agents: observe, baseline, shadow, then enforce. Roll out a blocking agent firewall with signed, reversible receipts."
date: 2026-06-13
lastmod: 2026-06-13
learn_cat: operator
level: deep
tags:
  - progressive-enforcement
  - learn-and-lock
  - agent-firewall
faq:
  - q: "What is progressive enforcement?"
    a: "Progressive enforcement is the rollout pattern where a security control first observes traffic, derives a baseline of normal behavior, runs in shadow mode to show what it would block, and only then switches to blocking. For an AI agent firewall it means you watch the agent, compile a policy from what it actually does, replay that policy against live traffic without enforcing, review the would-be blocks, then promote to enforcement. Nothing breaks on day one because nothing is blocked on day one."
  - q: "What does 'observe before enforce' mean for an agent firewall?"
    a: "It means the firewall logs and scores traffic without blocking it until you have evidence that blocking is safe. Static allowlists written up front are brittle: you guess at what the agent needs, the agent does something legitimate you did not predict, and you get a 2 AM outage. Observe-first inverts that. The policy is derived from observed behavior, so the allowlist matches reality instead of a guess."
  - q: "Is observe-first mode the default in Pipelock?"
    a: "Yes. The learn-and-lock lock mode defaults to shadow, so a compiled contract is replayed without enforcing until you explicitly promote it. Top-level 'enforce: false' detects and logs without blocking. When an agent has no baseline yet, 'no_baseline_action' defaults to warn, not block. Observe-first is the behavior you get without hunting for a setting."
  - q: "How is this different from ARMO, StrongDM, or Airia?"
    a: "Those describe observe-then-enforce as a philosophy or a managed-SaaS feature. The difference is proof and self-hosting. Pipelock's contracts are signed and hash-addressed, every ratify, promote, and rollback writes a signed receipt, and shadow-mode deltas record every would-have-blocked event before you flip to enforce. You can verify the evidence yourself with a published verifier instead of trusting a vendor dashboard, and you run it on your own infrastructure."
  - q: "Can I roll back after enforcing?"
    a: "Yes. The learn-and-lock rollback flow reverts to a prior accepted manifest, and the revert is itself a signed receipt, so the change is auditable. Per-session escalation has its own recovery path: 'pipelock session release' and 'pipelock session recover' bring a locked-down session back without restarting the proxy."
  - q: "What happens when the agent's normal behavior changes?"
    a: "Adaptive enforcement handles drift. Pipelock scores per-session risk and escalates enforcement for that session when the score crosses a threshold, then isolates it in an airlock rather than blocking the whole fleet. You inspect with 'pipelock session inspect' and recover with 'pipelock session recover'. Infrastructure errors like a DNS timeout are classified as score-neutral so a resolver wobble does not escalate a session on its own."
---

You cannot deploy a blocking agent firewall blind. Drop a hard allowlist in front of a live agent fleet on Monday and by Tuesday the agent has tried something legitimate you did not predict, the firewall blocked it, and someone is paged. The control gets ripped out, and now you have no firewall at all. That is the single most common way a runtime enforcement tool dies.

Progressive enforcement is the fix. Observe first, derive a baseline from what the agent actually does, run in shadow to see what you would block, then enforce once the evidence says it is safe. Pipelock ships that whole workflow, and it can prove each step happened.

## Why you cannot deploy blind

Static allowlists written up front are guesses. You sit down, imagine every host, tool, and pattern the agent will ever need, and write a policy. The agent then does something reasonable that your list did not anticipate, like calling a new internal API or fetching from a CDN it has never touched. A blocking firewall stops it. The failure lands at the worst time, on legitimate traffic, and the operator's fastest fix is to turn the firewall off.

The deeper problem is that an AI agent's behavior is not fully knowable in advance. It adapts to its inputs. A hand-written allowlist is stale the moment the agent's task changes. Deriving the policy from observed behavior keeps it tied to what the agent really does.

## What progressive enforcement means

The workflow has four states, and Pipelock has a command for each transition.

- **Observe.** The firewall scans and logs every request without blocking. You collect evidence of normal behavior.
- **Baseline.** That evidence compiles into a candidate policy, a signed contract describing what the agent is allowed to do.
- **Shadow.** The contract runs against live traffic and records every request it *would* have blocked, still without blocking anything. This is the dress rehearsal.
- **Enforce.** Once the shadow deltas look right, you promote the contract and the firewall starts blocking, with a signed receipt marking the change and a rollback path if you need it.

One definition, four states, each one reversible. The point of the ordering is that you never block traffic you have not first watched in shadow.

## Observe-first is the default, not a setting you hunt for

A safe-by-default control has to be safe before the operator reads the manual. Pipelock's defaults reflect that:

- The learn-and-lock **lock mode defaults to shadow**. A compiled contract replays without enforcing until you explicitly promote it. An empty or unknown mode resolves to shadow, never to live.
- Top-level **`enforce: false`** puts the whole proxy in detect-and-log mode.
- When an agent has **no baseline yet, `no_baseline_action` defaults to `warn`**, not block.

You get observe-first behavior out of the box. Flipping to enforcement is the deliberate action, which is the right way around for a control that sits in the request path.

## Progressive enforcement you can prove

This is where Pipelock parts ways with the managed-SaaS crowd. ARMO, StrongDM, and Airia describe observe-then-enforce as a feature of their platform. You see the result on their dashboard and you trust it.

Pipelock signs the evidence:

- Contracts are **hash-addressed and signed**. The policy you reviewed is cryptographically the policy that enforces.
- Every **ratify, promote, and rollback writes a signed receipt**, so the transition from observe to enforce is an auditable event, not a config change someone made quietly.
- **Shadow-mode deltas are recorded.** Before you enforce, you have a signed record of every request the contract would have blocked, so promotion is a decision backed by data.

You verify all of it yourself. The receipt format is open and checks byte-for-byte against a published verifier. See the [action receipt spec](/learn/action-receipt-spec/) and the [flight recorder audit log](/learn/flight-recorder/). You check the rollout against the evidence instead of taking a vendor dashboard's word for it.

## When the baseline shifts: adaptive enforcement

A baseline is a snapshot, and agents change. Adaptive enforcement handles the drift without a redeploy. Pipelock scores per-session risk and, when a session crosses the escalation threshold, tightens enforcement for **that session only**, isolating it in an airlock instead of locking down the whole fleet.

```bash
pipelock session list --tier hard
pipelock session inspect "agent|203.0.113.10"
pipelock session release "agent|203.0.113.10" --to none
pipelock session recover "agent|203.0.113.10" --choice release-none
```

Infrastructure failures are classified as score-neutral, so a DNS resolver timeout or an unreachable upstream does not poison a session's risk score and trigger a spurious lockdown. The fail-closed behavior still blocks the individual request; it just does not escalate the session on infrastructure noise.

Adaptive enforcement isolates one risky session. The [kill switch](/learn/kill-switch/) is the separate emergency control for stopping traffic across the deployment.

## The five-step rollout

| Step | Command | What it does | Blocks traffic? |
|------|---------|-------------|-----------------|
| Observe | `pipelock learn observe` | Logs agent traffic, builds evidence | No |
| Compile | `pipelock learn compile` | Derives a signed candidate contract | No |
| Review | `pipelock learn review` | You inspect, split, and pin the contract | No |
| Shadow | `pipelock learn shadow` | Replays the contract, records would-be blocks | No |
| Promote | `pipelock learn ratify` then `pipelock learn promote` | Approves and activates enforcement | Yes |

Compare two shadow runs with `pipelock learn diff` before you promote, and revert to a prior accepted manifest after selecting the target manifest hash recorded in history. The mechanism behind the contracts is in the [learn-and-lock guide](/learn/learn-and-lock/), and the architecture is walked through in the [capture-and-replay deploy post](/blog/capture-replay-policy-shadow-deploy/).

## Where to go next

- [Learn-and-lock agent contracts](/learn/learn-and-lock/) for the contract-compile mechanism
- [Flight recorder](/learn/flight-recorder/) for the signed audit log behind the receipts
- [Action receipt spec](/learn/action-receipt-spec/) for the open receipt format and verifier
- [Enterprise deployment](/enterprise/) for adopting Pipelock across a live fleet without breaking production
