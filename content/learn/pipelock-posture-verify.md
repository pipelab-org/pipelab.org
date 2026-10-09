---
title: "Pipelock Posture Verify Guide"
linkTitle: "Pipelock Posture Verify"
subtitle: "Turn signed posture capsules into a CI gate."
description: "Pipelock posture verify guide: validate signed posture capsules, enforce policy thresholds, and use exit codes separating integrity from policy failures."
date: 2026-04-17
learn_cat: operator
level: ref
tags:
  - posture
  - ci
  - verify
---

`pipelock posture verify` is one of the most useful operator additions in `v2.2.0` because it turns a signed posture capsule into a deployment decision.

Instead of treating posture output as a report someone might read later, you can gate CI or release automation on it.

## What it verifies

`pipelock posture verify` evaluates a signed posture capsule against:

- integrity requirements
- age requirements
- a named policy
- an optional minimum score

That gives you a binary answer for automation and a structured explanation for humans.

## Basic command

```bash
pipelock posture verify \
  --proof .pipelock/posture/proof.json \
  --key /path/to/pipelock-posture.pub \
  --policy enterprise
```

`--proof` (the signed capsule) and `--key` (the signer's Ed25519 public key file or raw hex) are required. Pass a public key you got through a trusted channel and pinned in advance, such as the `.pub` half saved when the signing key was generated. Don't take the key from the same directory or workspace as the proof: a key that travels with the proof only shows the file matches itself, not who signed it.

Useful flags include:

- `--policy enterprise|strict|none`
- `--min-score`
- `--max-age`
- `--max-receipt-age`
- `--require-discovery`
- `--json`

## Exit codes that actually help automation

The important detail is that the command separates integrity failures from policy failures.

- `0`: verification passed
- `1`: verification could not complete or integrity failed
- `2`: verification completed, but policy gates did not pass

That means CI can distinguish:

- "the proof is broken"
- from "the proof is valid, but the deployment does not meet our bar"

Without that split, every failure looks the same and operators end up ignoring the signal.

## Policy choices

### `enterprise`

A practical default when you want a strong posture check without treating every missing signal as a hard stop.

### `strict`

Use this when you want posture verification to fail on gaps that would otherwise look vacuously clean. In `v2.2.0`, strict mode closes the zero-discovered-server loophole instead of scoring it as a meaningless pass.

### `none`

`none` removes the hard policy gates but keeps the score threshold, which defaults to 85. For integrity-and-age-only verification, also pass `--min-score 0`.

## CI pattern

The cleanest rollout is:

1. generate the capsule during assessment or deployment verification
2. verify it in CI
3. block promotion when the result is `1` or `2`

Example:

```bash
pipelock posture verify \
  --proof .pipelock/posture/proof.json \
  --key /path/to/pipelock-posture.pub \
  --policy enterprise --min-score 85 --json
```

If you are staging a rollout, start with `enterprise`, inspect real failures, then decide whether `strict` should gate production.

## What it is not

`pipelock posture verify` is not a replacement for:

- `pipelock check --config`
- live canary testing
- operator recovery drills

It is a verification layer for signed evidence, not a substitute for runtime testing.

## Recommended use

Use posture verification when:

- you want a machine-checkable promotion gate
- you need a clean separation between integrity failure and policy failure
- auditors or internal reviewers care about signed operational evidence

If you are already generating assessments, this is the shortest path from "we have evidence" to "we enforce based on evidence."

## Further reading

- [Compliance evidence](/learn/compliance-evidence/)
- [AI agent compliance](/learn/ai-agent-compliance/)
- [Pipelock v2.2 upgrade guide](/learn/pipelock-v220-upgrade/)
- [Pipelock v2.2.0 release](/blog/pipelock-v220-release/)
