---
title: "Pipelock Session Recovery"
linkTitle: "Pipelock Session Recovery"
subtitle: "Inspect, explain, release, and terminate quarantined sessions."
description: "Pipelock session recovery guide: use inspect, explain, release, terminate, and recover to handle airlocked sessions without guessing at proxy state."
date: 2026-04-17
learn_cat: operator
level: ref
tags:
  - sessions
  - recovery
  - ops
---

Adaptive enforcement is only operationally useful if someone can recover a session on purpose.

Pipelock `v2.2.0` adds a real session-recovery surface: API endpoints for inspection and control, plus the `pipelock session` CLI for operators.

## What the session CLI adds

The `pipelock session` command group gives operators five direct actions and one guided flow:

- `list`
- `inspect`
- `explain`
- `release`
- `terminate`
- `recover`

That is the difference between "we airlocked the session" and "we know exactly how to handle the next incident."

## The basic workflow

Start with visibility, not action:

```bash
pipelock session list
pipelock session inspect <key>
pipelock session explain <key>
```

Use those three commands to answer:

- which session is affected
- what tier it is in
- why it escalated
- whether auto-recovery is about to happen anyway

If the session truly needs operator action, then choose between `release` and `terminate`.

## Release vs terminate

These are not the same operation.

### Release

`release` moves an airlocked session down to a lower tier.

Use it when:

- the escalation was a false positive
- the session is already understood
- you want traffic to resume without destroying all state

Example:

```bash
pipelock session release <key> --to none
```

### Terminate

`terminate` is destructive. It resets enforcement state, cuts in-flight activity, and clears the session state entirely.

Use it when:

- the session is actively compromised
- you do not trust the current session state
- you want a clean restart rather than a de-escalation

Example:

```bash
pipelock session terminate <key>
```

This should be treated as an incident action, not the default way to unstick tuning mistakes.

## Explain before you act

The most useful v2.2 addition is often `explain`, not `release`.

`pipelock session explain <key>` gives you the recorded trigger, evidence summary, and expected next auto-recovery point. That keeps operators from making blind changes when the better move is simply to wait for the session to decay back down or adjust a noisy policy later.

## Guided recovery

If you do not want operators to memorize the decision tree, use:

```bash
pipelock session recover <key>
```

That interactive flow walks through:

1. inspect
2. explain
3. action choice

It is useful for teams that do not touch airlock events every day but still need a safe operational path.

## API and auth notes

The CLI resolves the admin endpoint from:

- flags
- environment variables
- the Pipelock config file

Mutating actions are rate-limited and destructive actions require the full kill-switch API token. That is intentional. Session recovery is operator control, not something the agent should ever be able to trigger on its own.

## Recommended runbook

For a real deployment, write down a default policy like this:

- `inspect` and `explain` first
- `release` only for understood false positives
- `terminate` for confirmed compromise or unrecoverable state
- follow up with policy tuning after the incident, not during it

That keeps operators from using destructive cleanup as the first move every time something noisy happens.

## Further reading

- [Pipelock v2.2 upgrade guide](/learn/pipelock-v220-upgrade/)
- [Pipelock posture verify](/learn/pipelock-posture-verify/)
- [Secure agent deployment](/learn/secure-ai-agent-deployment/)
- [Pipelock v2.2.0 release](/blog/pipelock-v220-release/)
