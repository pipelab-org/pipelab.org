---
title: "Pipelock v3.4: A Trust Label Can't Weaken a Block"
linkTitle: "Pipelock v3.4 Release"
seoTitle: "Pipelock v3.4: Stricter Agent Firewall Controls"
date: 2026-08-20
author: "Josh Waldrep"
summary: "Pipelock v3.4 stops MCP trust labels from weakening stricter response policy, scans reverse-proxy media request bodies, hardens credential detection across encoding and URL seams, and adds containment-aware upgrades."
description: "Pipelock v3.4 tightens MCP trust policy, scans media request bodies, hardens credential detection, and adds containment-aware upgrades."
tags: ["pipelock", "release", "agent-firewall", "mcp-security", "ai-security"]
blog_cat: "releases"
faq:
  - q: "What is the main security change in Pipelock v3.4?"
    a: "An MCP server's reasoning trust label can no longer weaken a stricter response action. If response scanning says block, ask, or strip, that stronger action wins."
  - q: "Does Pipelock v3.4 scan file uploads?"
    a: "Reverse-proxy request bodies declared as image, audio, or video now pass through request-body policy instead of being skipped. Pipelock blocks bodies above the configured scan limit rather than forwarding them unscanned. This doesn't detect a secret embedded inside a valid image."
  - q: "How should contained hosts upgrade to v3.4?"
    a: "Use pipelock contain upgrade. It checks the new binary and managed configuration, updates the integrity pin, and verifies that the running service matches the installed binary."
---

> Installation correction (2026-10-16): The `go install` command below doesn't install current Pipelock releases. Use the [current installation guide](/install/) for a release binary or a source build pinned to the release tag. The original post follows unchanged.


Trust labels should be able to make policy stricter. They should never turn a block into a warning.

Pipelock v3.4 closes that gap. It also scans reverse-proxy media request bodies that older releases skipped, tightens several credential-detection paths, and gives contained Linux hosts an upgrade command that checks the binary, config, integrity pin, and running service together.

## A trust label can't weaken the section policy

An MCP server marked `trust: reasoning` maps to `warn`. Before v3.4, that mapping could override a stricter `response_scanning.action`, so an operator who configured `block`, `ask`, or `strip` could still get warn-and-forward for that server.

v3.4 applies the stricter action. A trust class can tighten the surrounding policy, but it can't relax it. If you depended on the older behavior, set `response_scanning.action: warn` explicitly. The result is visible in config diagnostics before you roll it out.

## Media request bodies no longer skip inspection

Reverse-proxy uploads declared as images, audio, or video used to bypass request-body scanning. A secret placed after a valid media signature could leave through that path without inspection.

Those bodies now follow the same request-body policy as other content. A body larger than `request_body_scanning.max_body_bytes` gets a 413 response instead of streaming through unscanned. The default limit is 5 MiB. If you proxy legitimate larger uploads, raise the limit deliberately or route that upload path outside Pipelock.

This change doesn't claim to find a secret hidden inside image pixels. It closes the skipped-body path around visible request content.

## Credential matching across the seams

Several fixes in v3.4 deal with credentials split where a scanner used to lose the full value.

URL DLP now joins the decoded path and query for matching, so a credential divided across that boundary is still visible to the configured scanner and the immutable core floor. Query scanning also assembles credentials spread across more than four values. Encoded credentials split by unexpected noise characters are normalized against the alphabet they claim to use instead of a hand-maintained separator list.

The provider-opaque body exception is stricter too. Length alone no longer makes a field look like ciphertext. The body has to measure like ciphertext before Pipelock lets it use that exception.

## Containment-aware upgrades

`pipelock contain upgrade` updates a contained host without breaking the boundary it's supposed to protect. It validates the replacement config with the binary being installed, verifies the binary digest across the copy, updates the integrity pin, restarts the service, and checks that the running service image matches the installed binary.

The install path now refuses before it stops anything if the new binary can't load the effective config. That matters on a contained host because the packet-filter rules can stay active while the proxy is down. A bad config should fail before it turns into an agent outage.

## Guard and evidence controls

Guard manifests can now enforce filesystem and command-execution policy with exact protocol, host, and port grants. Path decisions explain which rule allowed or denied an operation, and declared path types refuse credential locations.

Evidence provenance moves to a second immutable profile where the transforms changed. A receipt selects the profile by its exact digest. An older verifier that doesn't know the new profile refuses the proof instead of replaying it under the wrong rules.

Commitment keys also gain a durable operator-owned keyring with recorded lifecycle operations. Backup content has to pass its own integrity check before the keyring adopts it.

## Upgrade checks

Three old `airlock.triggers` fields now fail config loading because they were accepted but never used: `on_severity`, `anomaly_count`, and `anomaly_window_minutes`. Remove them and use `on_elevated`, `on_high`, or `on_critical`.

`pipelock git scan-diff` now has three exit states. Exit 0 means the scan completed and found nothing. Exit 1 means it found secrets. Exit 2 means it couldn't produce a verified result. CI should treat exit 2 as an instrument error, not as proof that a secret was found or that the diff was clean.

Run the new binary against every config before the rollout:

```bash
pipelock check --config /path/to/pipelock.yaml
```

## Get v3.4

Pipelock is a single Go binary (Apache-2.0 core; Enterprise features under ELv2). The scanner and enforcement controls in this release are part of the open-source core.

```bash
brew upgrade luckyPipewrench/tap/pipelock
# or
go install github.com/luckyPipewrench/pipelock/cmd/pipelock@v3.4.0
# or
docker pull ghcr.io/luckypipewrench/pipelock:3.4.0
```

Read the full [v3.4.0 changelog](https://github.com/luckyPipewrench/pipelock/releases/tag/v3.4.0), inspect the [proof stack](/proof/), or run the [public gauntlet](/gauntlet/) against the release yourself.
