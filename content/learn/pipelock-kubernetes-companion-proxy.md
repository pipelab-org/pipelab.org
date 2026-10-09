---
title: "Pipelock Kubernetes Companion Proxy"
linkTitle: "Pipelock K8s Companion Proxy"
subtitle: "Generate an enforced egress boundary for agent workloads."
description: "Pipelock Kubernetes companion proxy guide: generate an enforced proxy Deployment, Service, NetworkPolicies, and bound identity from a workload manifest."
date: 2026-04-17
learn_cat: operator
level: deep
tags:
  - kubernetes
  - proxy
  - topology
---

`pipelock init sidecar --inject-spec` is the most important deployment feature in `v2.2.0`, and its name is easy to misread.

It does not generate a same-pod sidecar. It generates an enforced companion-proxy topology for Kubernetes workloads.

## What the command generates

Point the command at a Deployment, StatefulSet, Job, or CronJob manifest and it emits:

- a patched workload that points `HTTP_PROXY` and `HTTPS_PROXY` at the companion Service
- a Pipelock ConfigMap
- a separate Pipelock Deployment
- a Pipelock Service
- agent and proxy NetworkPolicies
- a PodDisruptionBudget

That gives you a cluster-enforced path where the workload can reach DNS and the Pipelock Service, and the Pipelock pods handle the actual internet egress.

## Why this matters

Same-pod sidecars are convenient, but they are still a soft pattern unless your CNI supports container-level enforcement. The agent container shares the pod network namespace and can still reach the internet directly if it stops cooperating.

The companion-proxy topology is stronger because:

- the proxy is a separate workload
- the agent pod egress is restricted to the proxy Service
- the generated config binds the workload identity so caller-supplied agent hints are ignored

That turns `HTTPS_PROXY` from "please use this" into part of an enforced deployment shape.

## Basic command

```bash
pipelock init sidecar --inject-spec deployment.yaml --output enforced.yaml
```

You can also emit:

- a Kustomize overlay
- a Helm values bundle
- a dry-run or JSON summary for review tooling

Examples:

```bash
pipelock init sidecar --inject-spec deployment.yaml --dry-run
pipelock init sidecar --inject-spec deployment.yaml --emit kustomize --output ./overlay
pipelock init sidecar --inject-spec deployment.yaml --emit helm-values --output ./bundle
```

## Identity binding

The generated config sets:

- `default_agent_identity`
- `bind_default_agent_identity: true`

That means `X-Pipelock-Agent` headers and `?agent=` query parameters are ignored for the bound workload. Audit logs, receipts, and metrics attribute requests to the workload identity instead of `anonymous`.

This is the right shape for single-workload companion mode. It reduces spoofing risk and keeps the runtime identity stable.

## Rollout order

For an existing workload, do not patch the workload first and hope the proxy is ready by the time pods restart.

Roll it out in this order:

1. generate the topology
2. deploy the proxy workload and Service
3. wait for ready endpoints
4. apply the agent NetworkPolicy
5. patch the workload to point at the proxy

That avoids a fail-closed brownout where the workload restarts before the proxy path exists.

## Verify the result

The command includes static verification and canary coverage, but you should still check the live behavior:

- the workload resolves the proxy Service
- direct egress from the workload pod is blocked by NetworkPolicy
- the proxy can still reach intended upstreams
- a canary or synthetic secret is blocked on the live path

If your CNI does not enforce egress NetworkPolicies, the generated manifests still look correct but the enforcement claim is weaker. That is a cluster problem, not a Pipelock problem.

For what this looks like across a real cluster rather than one workload, the [per-pod NetworkPolicy field report](/blog/per-pod-networkpolicy-five-agents-field-report/) walks through migrating five agents in a day, including what broke.

## Scratch and init-container note

`v2.2.0` also adds the hidden `pipelock install <dest>` helper for scratch-based init-container flows that need to copy the running binary into a shared volume without relying on `/bin/sh`. If your deployment uses that pattern, use it to keep the binary handoff atomic.

## When to use this vs a same-pod sidecar

Use the companion proxy when:

- you want a real Kubernetes egress boundary
- the agent should not be able to bypass the proxy
- you need stable workload identity in receipts and logs

Use a same-pod sidecar when:

- you are in local dev or a low-friction quickstart
- you accept that the agent still shares the pod network namespace
- you are optimizing for ease of rollout instead of strongest enforcement

## Further reading

- [Pipelock v2.2 upgrade guide](/learn/pipelock-v220-upgrade/)
- [Pipelock session recovery](/learn/pipelock-session-recovery/)
- [AI egress proxy](/learn/ai-egress-proxy/)
- [Secure agent deployment](/learn/secure-ai-agent-deployment/)
- [Pipelock v2.2.0 release](/blog/pipelock-v220-release/)
