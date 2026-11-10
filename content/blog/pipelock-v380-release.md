---
title: "Pipelock v3.8: Reload Results and Unconfirmed MCP Wrappers"
linkTitle: "Pipelock v3.8: Reload and Unconfirmed Wrappers"
date: 2026-11-09
author: "Josh Waldrep"
blog_cat: releases
summary: "Reload tells you what happened, discover flags MCP wrappers it can't confirm, and upload scanning reads Office and ZIP text. HTTPS through the forward proxy needs TLS interception, which is off in defaults and all {{stat:presets}} presets. PDF text isn't extracted yet; PDF uploads only get the existing raw-byte scan."
description: "Pipelock v3.8 reports reload results, flags unconfirmed MCP wrappers, moves metrics to their own listener, and ships images under ghcr.io/pipelab-org."
canonical_url: "https://pipelab.org/blog/pipelock-v380-release/"
tags: ["pipelock", "mcp-security", "release"]
---

Here's what's in Pipelock 3.8. A few things change on upgrade, so read the [upgrade notes](/learn/pipelock-v380-upgrade/) before you roll it out. The [source upgrade guide](https://github.com/pipelab-org/pipelock/blob/v3.8.0/docs/guides/upgrading-to-3.8.md) is the full compatibility contract.

## Reload tells you what happened

`pipelock reload` now returns the activation result instead of leaving you to guess. `reload --status` shows the policy that's running and any settings still waiting on a restart. If a reload gets rejected, the old config stays active. It goes through the admin API, so you need your API token.

## Discover won't call a wrapper covered just because it's in a config file

A config entry doesn't prove the client launched through Pipelock. So `discover` now marks file-only MCP wrappers as unconfirmed, and it exits nonzero when coverage is unconfirmed. If you run `discover` in CI, expect that.

## Codex setup keeps secrets off the command line

`pipelock codex install` registers env var names in Codex's `env_vars` instead of putting values on the command line. It refuses to go ahead if a value is missing, so export them where Codex runs.

## Office and ZIP uploads

Request scanning now reads the text inside Office docs and ZIP files, within extraction limits. HTTPS through the forward proxy needs TLS interception, which is off in defaults and all {{< stat key="presets" >}} presets. Files it can't open, or that go past the limits, keep the refusal or limits they already had.

Plain-HTTP proxy, reverse proxy and WebSocket client text get scanned without interception. PDF text isn't extracted yet; PDF uploads only get the existing raw-byte scan.

With the built-in defaults, and in the audit, balanced and generic-agent presets, a body finding warns. The claude-code, cursor, hostile-model and strict presets block. An archive Pipelock can't read is only held back when the action is block and enforce mode is on.

## Prompt-injection wording checks are your call

`prompt_injection_detection` lets you keep, warn on, or turn off the regex wording checks on their own. Turning them off covers the core wording rules and MCP tool-description checks too, and Pipelock warns about what stays active. DLP and destination controls still apply either way. Leave it unset and nothing changes. Receipts and diagnostics show which mode was in effect.

## The mode name doesn't turn off enforcement

`mode: audit` alone still enforces ordinary URL findings when `enforce` is left at the default `true`. Use the bundled `audit` preset if you want an observation trial. That preset still applies independent core and transport refusals.

## Before you upgrade

The big ones:

- `mode: audit` is not an observation switch. Use the `audit` preset when that's what you want.
- `/metrics` and `/stats` only show up on a dedicated `metrics_listen` listener. Leave it unset and they're off.
- New images and charts live under `ghcr.io/pipelab-org`. Releases through 3.7.1 stay where they were. The Go module path and Homebrew tap didn't change.
- `discover` exits nonzero for unconfirmed coverage.
- Codex install refuses missing env values.
- Fleet receipt reports now default to v2. Verifying fleet reports and Audit Packets stays in the open-source CLI and verifier. Only producing fleet reports (Conductor) is Enterprise.
- Unicode tag views of receipts need a current verifier (TypeScript and Rust 0.6.15, or the v3.8.0 Go tools). Python `pipelock-verify` 0.4.1 does not cover every current receipt view.

The rest are in the [upgrade notes](/learn/pipelock-v380-upgrade/).

Pipelock's core is Apache 2.0 and the enterprise features are ELv2. Code's on [GitHub](https://github.com/pipelab-org/pipelock). If something breaks for you on upgrade, open an issue and let me know.
