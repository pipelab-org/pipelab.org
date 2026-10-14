---
title: "Pi Security: Route the Coding Agent Through Pipelock"
linkTitle: "Pi Security"
subtitle: "Point Pi's global proxy setting at a named Pipelock listener with one command, and undo it just as easily."
description: "Route the Pi coding agent through Pipelock with pipelock pi install. Set a named proxy listener, preview with --dry-run, verify, and undo with remove."
date: 2026-09-29
learn_cat: operator
level: intro
howto_steps:
  - name: Add a named listener
    text: Add an agents.pi profile with a listener such as 127.0.0.1:18991 to the Pipelock config, enable forward_proxy, and restart Pipelock. Named agent listeners require Pipelock Pro.
  - name: Preview the change
    text: Run pipelock pi install with --config, --profile pi, --proxy and --dry-run to print the httpProxy change without writing it.
  - name: Install
    text: Run the same command without --dry-run. It writes only the httpProxy member of Pi's global settings.
  - name: Restart Pi and verify
    text: Restart Pi, then confirm the listener bound in Pipelock's startup output and that Pi's settings show the proxy.
  - name: Remove
    text: Run pipelock pi remove to restore the previous httpProxy value.
faq:
  - q: "How does Pipelock work with Pi?"
    a: "Pi reads a global httpProxy setting from ~/.pi/agent/settings.json and sets HTTP_PROXY and HTTPS_PROXY from it. pipelock pi install writes that one setting so Pi's requests go to a dedicated named Pipelock listener. Traffic on that listener gets the pi agent profile without relying on a header or a shared default identity."
  - q: "Do I need a Pipelock license?"
    a: "Named agent listeners require Pipelock Pro. The installer compares Pi's settings with your config file, but it can't prove that Pipelock has an active Pro license or that the listener bound. Confirm the listener in Pipelock's startup output before starting Pi."
  - q: "Does pipelock pi install log Pi into a model provider?"
    a: "No. It only writes httpProxy. Pi's default provider is Google Gemini, so set GEMINI_API_KEY or store the key under google in Pi's auth file yourself."
  - q: "What isn't covered?"
    a: "Requests that honor the proxy setting are routed through Pipelock. Without TLS interception and a CA that Pi trusts, HTTPS requests get destination checks only; their headers and bodies stay encrypted. Tools and subprocesses that ignore proxy environment variables need separate network containment."
  - q: "How do I undo it?"
    a: "pipelock pi remove restores the httpProxy value the installer recorded beside Pi's settings and keeps other changes made after installation. Add --dry-run to preview."
tags:
  - pi
  - setup
  - integration
---
Pi is a terminal coding agent. It reads a global `httpProxy` setting from `~/.pi/agent/settings.json` and turns it into the `HTTP_PROXY` and `HTTPS_PROXY` environment variables. Pipelock uses that setting: `pipelock pi install` points it at a dedicated listener, so Pi's proxy-aware traffic routes through Pipelock under the `pi` agent profile. Of Pi's own settings, the installer changes only that one. See Pi's [proxy setting documentation](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/settings.md) for the upstream side.

## What this covers

This setup routes requests that honor the proxy setting through Pipelock. For HTTPS, Pipelock sees only the destination of a plain CONNECT tunnel; scanning headers and bodies needs TLS interception and a Pipelock CA that Pi trusts. Tools and subprocesses that ignore proxy environment variables need separate network containment. See the [containment guide](/learn/pipelock-contain-guide/) for that.

Pi's default provider is Google Gemini. Set `GEMINI_API_KEY`, or store the key under `google` in Pi's auth file. `pipelock pi install` doesn't log Pi into Gemini.

## Install pipelock

{{< install-block "go,homebrew" >}}

## Add a named listener

A named listener is a proxy port that belongs to one agent profile. Requests arriving on this listener receive the Pi profile, so Pipelock doesn't have to trust a self-declared header to tell agents apart. Restrict who can reach the listener if that profile must mean Pi alone. Named agent listeners require Pipelock Pro. Add one for Pi to your Pipelock config:

```yaml
forward_proxy:
  enabled: true

agents:
  pi:
    listeners:
      - "127.0.0.1:18991"
```

Start or restart Pipelock with that config. Pipelock binds listener sockets at startup, so a listener change needs a restart.

## Install

Preview the settings change first. The proxy URL must match the listener in the named profile.

```bash
pipelock pi install --config "$PWD/pipelock.yaml" --profile pi \
  --proxy http://127.0.0.1:18991 --dry-run

pipelock pi install --config "$PWD/pipelock.yaml" --profile pi \
  --proxy http://127.0.0.1:18991
```

`--config` is the Pipelock config that defines the listener, `--profile` names the agent profile, and `--proxy` is the HTTP URL of that listener. The command updates only the global `httpProxy` member and keeps Pi's other settings. It uses `PI_CODING_AGENT_DIR` when set, so an overridden Pi config directory gets the change instead. On success it prints that it configured Pi in the settings path to use the profile and proxy, and reminds you to restart Pi after restarting Pipelock.

The command refuses when the config doesn't define the named profile or when the profile has no listener matching the proxy URL.

## Verify

The installer compares Pi's settings with your config file. It can't prove that Pipelock has an active Pro license or that the listener bound. So check both:

1. Confirm the Pi listener appears in Pipelock's startup output.
2. Restart Pi and check that the `httpProxy` value in `~/.pi/agent/settings.json` (or under `PI_CODING_AGENT_DIR`) is your listener URL.

A second install with the same values reports that Pi already routes through the proxy. An offline walkthrough that never touches your real settings lives in the [pi-integration example](https://github.com/luckyPipewrench/pipelock/tree/main/examples/pi-integration). It uses `PI_CODING_AGENT_DIR` and needs no Gemini key.

## Remove

The installer records Pi's prior `httpProxy` value beside its settings. Remove restores that value and keeps changes made after installation:

```bash
pipelock pi remove --dry-run
pipelock pi remove
```

Restart Pi to apply it. Re-running install recovers a prepared install only when Pi's proxy still matches the recorded target or prior value. The command refuses to overwrite a changed proxy value or an interrupted removal. Inspect the settings and the state file before resolving another interrupted condition by hand.

See also: [Continue.dev MCP Security](/learn/continue/) · [Contain an AI Agent on Linux](/learn/pipelock-contain-guide/) · [Pipelock v3.7 Upgrade Guide](/learn/pipelock-v370-upgrade/) · [Pi integration guide](https://github.com/luckyPipewrench/pipelock/blob/main/docs/guides/pi.md)
