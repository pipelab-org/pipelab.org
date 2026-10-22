---
title: "Pipelock v2.2.0: Companion Proxies, Session Recovery, and Signed Mediation"
linkTitle: "Pipelock v2.2.0 Release"
date: 2026-04-17
author: "Josh Waldrep"
summary: "Pipelock v2.2.0 adds Kubernetes companion-proxy generation, session recovery controls, posture verification, signed mediation, and strict YAML parsing."
description: "Pipelock v2.2.0 adds Kubernetes companion-proxy generation, session recovery, posture verification, signed mediation, and strict YAML validation."
tags: ["pipelock", "mcp", "kubernetes", "runtime-security"]
blog_cat: "releases"
---

Pipelock v2.2.0 is a release for operators, not just for demos.

The big shift is control over real deployments: easier Kubernetes rollout, better handles for quarantined sessions, and stronger proof about what policy mediated a request. There is also one breaking change that matters: config typos now fail loud instead of being silently ignored.

## Companion proxy rollout without hand-editing manifests

The headline operator feature is `pipelock init sidecar --inject-spec`.

Point it at a Kubernetes workload manifest and it generates an enforced companion proxy topology for you. Deployments, StatefulSets, Jobs, and CronJobs are all supported. The command can emit:

- strategic-merge patches
- Kustomize overlays
- Helm values fragments

The important detail: this is not same-pod sidecar injection. The generated bundle includes a separate proxy Deployment, a Service, NetworkPolicies, and a bound workload identity. That gives you an actual egress boundary instead of hoping the agent keeps honoring `HTTPS_PROXY`.

This matters because most teams do not get stuck on the scanner itself. They get stuck on the rollout plumbing: how to generate the proxy topology consistently, preserve workload identity, and prove the patch is safe to apply more than once.

`v2.2.0` moves that work into the product instead of leaving it as bespoke YAML surgery.

## Session recovery now has proper operator handles

Adaptive enforcement is useful right up until a team asks the practical question: what do I do with a quarantined session right now?

`v2.2.0` adds both a session admin API and a `pipelock session` operator CLI. You can:

- list active sessions
- inspect current state
- explain why a session escalated
- release a quarantined session
- terminate the session completely

There is also an interactive `pipelock session recover` flow when you need guided recovery instead of memorizing the subcommands.

That turns adaptive enforcement from a black box into something an operator can actually run in production.

If a session hit airlock because of a real credential leak, you can see why. If it was a false positive during tuning, you can recover cleanly instead of guessing at proxy state.

## Signed mediation envelopes for downstream verification

The most important trust change in `v2.2.0` is optional RFC 9421 envelope signing.

When enabled, Pipelock can sign the mediation envelope it adds to proxied traffic. That gives downstream systems a verifiable record of what policy mediated the request, rather than forcing them to trust an unsigned header at face value.

This is useful in environments where you need stronger proof across service boundaries:

- internal gateways
- audit pipelines
- approval systems
- downstream verifiers that need to know which policy hash and action applied

Pipelock already had signed evidence and receipts. `v2.2.0` extends that trust story onto the mediated request path itself and makes the policy hash stable enough for downstream admission and audit checks.

## Strict YAML parsing is the breaking change

This release also makes a deliberate breaking change: unknown config fields now fail validation.

Before `v2.2.0`, a typo in a security-relevant config field could be silently ignored. That is unacceptable for a security product. If you wrote the wrong field name, the system could look configured while the control was actually inert.

In `v2.2.0`, bad fields fail loud with a clear error. That is the right failure mode.

If you are upgrading from an older config, validate it before rollout with `pipelock check --config <path>` and expect to fix stale or misspelled fields. The full product page at [pipelab.org/pipelock](/pipelock/) reflects the current deployment and operator surfaces, and the full project changelog stays in the [public repo](https://github.com/pipelab-org/pipelock/blob/main/CHANGELOG.md).

## More than one headline feature shipped

`v2.2.0` also adds a set of operator-facing improvements that are easy to miss if you only skim the banner features:

- `pipelock posture verify` turns signed posture capsules into a CI gate with distinct exit codes for integrity failures versus policy failures.
- media policy now blocks audio and video by default, strips image metadata, and hardens active SVG content before it reaches the agent.
- rules bundles now declare tiers and required features, and `pipelock rules status` gives you a runtime view of what is actually loaded.
- DLP warn mode lets teams stage new patterns in production without immediately turning them into hard blocks.

## Why this release matters

`v2.2.0` is not about inventing a new category label. It is about making Pipelock easier to deploy, easier to operate, and easier to verify in environments where the boundary actually matters.

That means:

- less manual Kubernetes rollout work
- clearer recovery paths during enforcement
- stronger cryptographic proof on mediated traffic
- safer config handling
- better operator verification before production cutovers

If you have been evaluating Pipelock as an open-source agent firewall, this is the release that makes the operator story much sharper.

[See the product page](/pipelock/) for the current capability surface, [view the public proof page](/proof/) for methodology and benchmark evidence, or go straight to the new operator guides:

- [Pipelock v2.2 upgrade guide](/learn/pipelock-v220-upgrade/)
- [Pipelock Kubernetes companion proxy](/learn/pipelock-kubernetes-companion-proxy/)
- [Pipelock session recovery](/learn/pipelock-session-recovery/)
- [Pipelock posture verify](/learn/pipelock-posture-verify/)
- [Mediation envelope signing](/learn/mediation-envelope-signing/)
