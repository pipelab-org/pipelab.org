---
title: "Launch a Command Through Pipelock"
linkTitle: "Pipelock Exec: Cooperative Launch"
description: "Use pipelock exec to check a running proxy and launch cooperative commands with proxy and CA settings. Use containment for enforced isolation."
date: 2026-10-13
learn_cat: operator
level: intermediate
---

`pipelock exec` checks a running proxy and starts a command with shared proxy and certificate-authority settings. It checks health, forwarding and the kill switch before launch. This free command is useful for clients that honor proxy environment variables.

Commands can ignore those settings. For operating-system enforcement, use [host containment](/learn/pipelock-contain-guide/), [sandboxing](https://github.com/pipelab-org/pipelock/blob/main/docs/guides/sandbox.md), or network policy.

## Start the proxy, then launch the client

Run `pipelock run --config pipelock.yaml` first. In another terminal, launch your client through that configuration:

```bash
pipelock exec --config pipelock.yaml -- curl https://api.vendor.example/
```

The URL is a placeholder for an endpoint your policy permits. Pipelock refuses launch if its proxy checks fail. This command doesn't install or start a proxy for you.

For HTTPS body inspection, configure TLS interception and provide the trusted CA according to the [exec command reference](https://github.com/pipelab-org/pipelock/blob/main/docs/cli/exec.md). Without interception, CONNECT application traffic remains encrypted and can't be body-scanned.

## Understand what the environment changes

Pipelock replaces inherited proxy variables and bypass settings, including a blanket `NO_PROXY=*`. It also supplies supported client trust settings when a CA is provided, combining it with ordinary public roots. Combined bundles persist so long-running children can keep reading them. A dry run with a CA creates the bundle too.

The launch retains unrelated environment values. A program flag or application configuration can still override routing, and a process with direct network access can bypass the proxy. Check the actual client path you intend to use.

For filesystem and egress enforcement, continue with the [containment walkthrough](/learn/pipelock-contain-guide/). For migration details, read the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/).
