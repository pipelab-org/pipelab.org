---
title: "Pipelock v3.0: Fail Closed by Default"
linkTitle: "Pipelock v3.0 Release"
seoTitle: "Pipelock v3.0: Fail-Closed Defaults"
date: 2026-06-23
author: "Josh Waldrep"
summary: "Pipelock v3.0 hardens enforcement defaults to fail closed across the board, anchors self-update to a signed release manifest, and gives the Enterprise Conductor the operations a real fleet needs to run long-term: decommission a follower, and back up and restore the control plane."
description: "Pipelock v3.0 hardens defaults to fail closed, adds signed self-update, provider-key DLP, and Conductor fleet operations."
tags: ["pipelock", "release", "ai-security", "mcp-security"]
blog_cat: "pipelock"
faq:
  - q: "What changed in the fail-closed defaults in Pipelock v3.0?"
    a: "Several enforcement defaults now block instead of warn. An MCP server's responses are evaluated against a per-server trust class that defaults to untrusted, which blocks on a response-injection finding. A hot reload that would disable the proxy or any scanner is rejected and the running config is kept. The generated api_allowlist no longer ships messaging platforms, so a strict-mode deployment that relied on the default for Slack, Discord, or Telegram egress must name those hosts. Every change in the set blocks or tightens; none of them open a hole."
  - q: "How does signed self-update work in Pipelock v3.0?"
    a: "pipelock update verifies a signed release.json with the release keyring embedded in the binary before any download is trusted. The native Ed25519 check is mandatory and fail-closed. cosign becomes an optional secondary cross-check whose absence is no longer a bypass, and --insecure-skip-signature is a deprecated no-op. You can prove a release came from the project, offline, with the key already in your binary."
  - q: "What fleet operations did the Conductor add in v3.0?"
    a: "Two that a real fleet needs. pipelock conductor follower remove decommissions a follower so it leaves fleet status and its later audit evidence, signed with the enrolled key, is rejected. pipelock conductor store backup and store restore capture and recover the control-plane store (enrollments, policy bundles, stream heads, emergency controls), so a lost Conductor is a restore rather than a rebuild. Both are Enterprise and require the fleet license feature."
---

> Installation correction (2026-10-16): The `go install` command below doesn't install current Pipelock releases. Use the [current installation guide](/install/) for a release binary or a source build pinned to the release tag. The original post follows unchanged.


A major version earns the number by changing defaults, and v3.0 moves them in one direction: toward the safe choice. Every breaking change in this release blocks or tightens. Review the upgrade notes before you roll it out, then upgrade with the knowledge that the new behavior errs on the side of denying.

## Defaults fail closed

An MCP server's responses now run against a per-server trust class, and the default is untrusted. An untrusted server that returns a response-injection finding gets blocked instead of warned. The configured `response_scanning.action` used to govern that path; now the trust class does, and you opt a server back into warn-through by marking it `trust: reasoning`.

A hot reload that would weaken the running posture is refused. If a file edit, a SIGHUP, or a Conductor policy bundle would disable the proxy or any scanner, Pipelock keeps the config it already has instead of quietly applying the weaker one. The generated `api_allowlist` also stopped shipping messaging platforms, so a strict-mode deployment that leaned on the default for Slack, Discord, or Telegram egress now has to name those hosts itself. Allowlisting never bypassed content scanning, and it still does not.

## Self-update you can verify

`pipelock update` checks a signed `release.json` with the release keyring built into the binary before it trusts a download. The native Ed25519 check is mandatory. cosign drops to an optional second opinion whose absence is no longer a way around the check, and `--insecure-skip-signature` is now a deprecated no-op. A release you pull is one you can prove came from the project, offline, with the key already in your binary. A stock binary from before this release still uses the older path; the mandatory native check applies once you are running v3.0 or later.

## Introducing the Conductor

v3.0 is where Pipelock's Enterprise control plane, the Conductor, becomes something you can run a real fleet on. It pushes one signed policy to every agent, collects a signed record of what each one did, and can cut off the whole fleet's internet access at once with an emergency switch that takes more than one person to pull. Detection and enforcement stay free on every agent; the Conductor governs the fleet. v3.0 adds the operations a fleet needs once it is running for real. `pipelock conductor follower remove` retires an agent for good, so it drops out of `fleet status` and any later evidence signed with its old key is rejected. `pipelock conductor store backup` and `pipelock conductor store restore` save and recover the whole control plane, so a lost Conductor is a restore instead of a rebuild. Both commands are Enterprise and require the `fleet` license feature. The full picture is on the [enterprise page](/enterprise/).

A cross-stream retarget now carries a signed stream-switch authorization with a bounded validity window, and an upgraded follower rejects an old-style retarget that lacks one. Upgrade followers before you use the new stream-switch publish path.

## Provider-key DLP

DLP now covers distinctively prefixed LLM and provider API-key shapes, with default exemptions so a provider credential sent to that provider's own endpoint is not treated as exfiltration. The patterns dropped a leading word boundary, so a key glued to an adjacent character is still caught. A standing false-positive corpus guards the additions, and the documentation lists both the covered shapes and the ones intentionally left out because they are too false-positive-prone to enforce.

## Upgrade notes

Every item in the breaking-changes set fails closed, so the upgrade risk is over-blocking, not a silent leak. Read the [CHANGELOG](https://github.com/pipelab-org/pipelock/blob/main/CHANGELOG.md) before rolling v3.0 to a fleet, upgrade followers ahead of the new cross-stream retarget path, and re-check any strict-mode `api_allowlist` that depended on the old messaging defaults.

## Get it

Pipelock is a single Go binary (Apache-2.0 core; Enterprise features under ELv2). Every scanner, every detection, and every enforcement layer in this release is in the free core. Fleet governance is the Enterprise line.

```bash
brew install luckyPipewrench/tap/pipelock
# or
go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest
# or
docker pull ghcr.io/luckypipewrench/pipelock:3.0.0
```

The full list of changes is in the [CHANGELOG](https://github.com/pipelab-org/pipelock/blob/main/CHANGELOG.md). If you want to see what it blocks before you trust it, [run the assessment](/assess/) and read the signed report yourself.
