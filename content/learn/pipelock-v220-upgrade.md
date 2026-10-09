---
title: "Pipelock v2.2 Upgrade Guide"
linkTitle: "Pipelock v2.2 Upgrade"
subtitle: "Validate config, rollout the new surfaces, and avoid a noisy cutover."
description: "Pipelock v2.2 upgrade guide: strict YAML validation, rollout checks, and the operator steps to verify config before you cut traffic over."
date: 2026-04-17
learn_cat: operator
level: ref
tags:
  - release
  - upgrade
  - v2.2
---

Pipelock `v2.2.0` is an operator release. The biggest risk in the upgrade is not the scanner itself. It is rolling the new deployment and verification surfaces out without checking the configs that used to load quietly.

## What changed in v2.2

The release adds four operator-visible surfaces:

- strict YAML parsing that fails on unknown fields
- `pipelock init sidecar --inject-spec` for Kubernetes companion-proxy generation
- `pipelock session` for airlock recovery
- `pipelock posture verify` and signed mediation envelopes for stronger downstream verification

Those changes sharpen the product, but they also make old config drift visible. That is a good thing, as long as you validate before swapping traffic.

## Upgrade order

Run the upgrade in this order:

1. Validate every config file with the new parser.
2. Check which runtime features the deployment will actually use.
3. Roll the new topology out in a staging environment.
4. Verify posture, canary behavior, and session-recovery paths.
5. Cut traffic over after those checks pass.

## Validate config first

This is the breaking change that matters most.

Before `v2.2.0`, typos in security-relevant config fields could be ignored. In `v2.2.0`, unknown fields fail loud with the field name and line number. Multi-document YAML is also rejected.

Run this against every config you ship:

```bash
pipelock check --config pipelock.yaml
```

Pay special attention to:

- stale field names from older configs
- nested sections added by hand and never verified
- copied examples that still use deprecated names
- YAML files that use `---` document separators

If you are using generated presets as a baseline, diff against the current `balanced`, `strict`, or `audit` config and re-run `pipelock check` until the file loads cleanly.

## Plan the deployment surface

`v2.2.0` adds a new Kubernetes rollout command, but it changes the shape of the deployment.

`pipelock init sidecar --inject-spec` does not generate a same-pod sidecar. It generates an enforced companion-proxy topology with:

- a separate proxy Deployment
- a Service fronting the proxy
- NetworkPolicies
- a bound `default_agent_identity`

Use it when you want the cluster to enforce that the workload can only reach Pipelock. The full rollout guide is [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/).

If you are staying on a same-pod sidecar or local proxy pattern, you can still upgrade to `v2.2.0`, but you do not get the enforced egress boundary from the new command.

## Verify the rollout before cutover

For a real upgrade, verify three things:

### 1. Canary and DLP path

Confirm that the generated or upgraded config still blocks a synthetic credential:

```bash
pipelock canary
```

Then run your usual smoke test through the proxy and confirm the block path, logs, and receipts still show up where expected.

### 2. Session recovery path

If you use adaptive enforcement, do not wait for production to discover whether operators know the new recovery flow.

Exercise:

```bash
pipelock session list
pipelock session inspect <key>
pipelock session explain <key>
```

Then test the recovery action you actually expect operators to use:

- `release` for false positives
- `terminate` for destructive teardown
- `recover` for guided incident handling

The full workflow is in [Pipelock session recovery](/learn/pipelock-session-recovery/).

### 3. Posture verification

If you generate posture capsules, add `pipelock posture verify` to CI before production cutover:

```bash
pipelock posture verify \
  --proof .pipelock/posture/proof.json \
  --key /path/to/pipelock-posture.pub \
  --policy enterprise
```

That gives you a clean separation between:

- integrity failures
- verified but policy-failing deployments

The full flag and exit-code reference, including where the `--key` value must come from, is in [Pipelock posture verify](/learn/pipelock-posture-verify/).

## Features operators often miss

The v2.2 release is bigger than the banner items. During upgrade review, decide whether you want to enable:

- **media policy** for metadata stripping and audio/video blocking
- **mediation envelope signing** for downstream verification
- **DLP warn mode** for staged pattern rollout
- **rules status** for runtime bundle visibility

If you skip those decisions, the upgrade lands as "new version, same ops model" and you leave real value unused.

## Recommended rollout checklist

- run `pipelock check --config` on every config file
- confirm the deployment mode you actually want after upgrade
- verify canary blocking and receipt emission in staging
- run at least one session recovery drill
- add `pipelock posture verify` where CI gates make sense
- review whether media policy and envelope signing should be on by default

## Further reading

- [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/)
- [Pipelock session recovery](/learn/pipelock-session-recovery/)
- [Pipelock posture verify](/learn/pipelock-posture-verify/)
- [Mediation envelope signing](/learn/mediation-envelope-signing/)
- [Pipelock v2.2.0 release](/blog/pipelock-v220-release/)
- [Pipelock product page](/pipelock/)
