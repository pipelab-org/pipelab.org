---
title: "The Pipelock Kill Switch: Six Sources, One Deny-All"
linkTitle: "Kill Switch"
subtitle: "Any single source flips the agent into deny-all. The agent cannot flip it back."
description: "How the Pipelock kill switch works: six OR-composed sources, port isolation so agents cannot self-deactivate, and automation over the API."
date: 2026-08-23
learn_cat: operator
level: intro
tags:
  - kill-switch
  - enforcement
  - operations
---

The kill switch is Pipelock's emergency stop. When it is active, every mediated request is denied until an operator deactivates it. HTTP-facing paths return 503; other transports use their native denial response. It exists for the moment something feels wrong: an agent behaving strangely, a credential you are not sure about, a tool call you want stopped right now while you look.

## Six activation sources, OR-composed

The kill switch controller composes six independent activation sources. Any single active source denies traffic; all six must be clear for traffic to flow. OR-composed means the sources add up in one direction only: another source can always stop traffic, but no source can override a stop.

| Source | How it triggers |
|---|---|
| Config | `kill_switch.enabled: true` activates deny-all from startup |
| API | `POST /api/v1/kill` with the bearer token, from CLI, dashboard, or automation |
| Signal | `SIGUSR1` to the pipelock process, for local shell or scripts |
| Sentinel file | The configured `sentinel_file` path exists on disk |
| Conductor remote kill | The fleet control plane orders a stop (enterprise follower runtime) |
| Conductor stale bundle | A follower's policy bundle goes stale past its freshness window (enterprise follower runtime) |

One heads-up that surprises people: `enabled` is a *source*, not a subsystem switch. Setting `enabled: true` in config does not "turn the feature on for later" — it activates the kill switch immediately. To arm the API, signal, and sentinel sources without stopping traffic, leave `enabled: false`.

Kill-switch runtime activation state survives config hot reloads, so a reload cannot silently clear an active stop.

## The agent cannot save itself

A kill switch an agent can reach is a kill switch an injected agent can turn off. Pipelock prevents this with port isolation: when `api_listen` is set, the kill, session, adaptive, and baseline admin APIs run on a dedicated admin port. The main proxy port, the one the agent talks through, has no API routes at all. The agent physically cannot deactivate its own kill switch.

On long-lived transports the switch is checked per-read, per-frame, and per-message, so an already-open WebSocket or MCP session stops mid-stream rather than draining to completion.

Health and metrics endpoints are exempt by default (`health_exempt`, `metrics_exempt`), so your monitoring keeps seeing the process while it refuses traffic, and specific IPs can be allowlisted for break-glass access.

## Chat-ops: trigger it from anywhere the API reaches

Because activation is a single authenticated API call, you can wire the kill switch into whatever control surface you already watch: a chat command, a workflow automation, or a runbook step that posts to the API, with a matching restore step to clear it.

The same pattern works with any automation that can send an HTTP request with a bearer token: Slack workflows, PagerDuty runbooks, a cron guard, a CI job that trips the switch when a canary token fires.

```yaml
kill_switch:
  enabled: false                       # leave false: arm sources, do not activate
  sentinel_file: /tmp/pipelock-kill    # touch this file to stop traffic
  api_listen: 127.0.0.1:9090           # dedicated admin port, not the proxy port
  api_token: ""                        # or PIPELOCK_KILLSWITCH_API_TOKEN from a secret
```

Full field reference: [configuration guide](https://github.com/pipelab-org/pipelock/blob/main/docs/configuration.md).

## When it fires on its own

The kill switch is also the fail-closed floor for other subsystems. Deferred tool calls resolve to block when the kill switch is active. On enterprise fleets, a follower whose policy bundle goes stale stops itself rather than running on outdated policy. The direction is always the same: uncertainty stops traffic, and only an explicit operator action starts it again.
