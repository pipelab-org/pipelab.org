---
title: "Pipelock Health Watchdog"
linkTitle: "Health Watchdog"
subtitle: "Wedge detection for /health so external supervisors notice when scanner pipes go silent."
description: "Pipelock v2.4 health watchdog reference: the /health endpoint, subsystem map, hybrid passive plus active probe, and Kubernetes liveness pattern."
date: 2026-05-04
lastmod: 2026-05-04
og_image: "https://pipelab.org/images/og/og-product.png"
learn_cat: operator
level: ref
tags:
  - health
  - liveness
  - kubernetes
  - operations
faq:
  - q: "What changed in v2.4?"
    a: "Before v2.4, /health returned 200 as long as the HTTP handler responded. A wedged scanner or dead session-manager goroutine would not surface. v2.4 adds an internal wedge-detection watchdog that flips /health to 503 when any tracked subsystem is unhealthy."
  - q: "Is the subsystem map exposed by default?"
    a: "No. The per-subsystem boolean map is gated by `health_watchdog.expose_subsystems: true`. The HTTP status code and top-level status string still reflect wedges regardless of the setting; only the per-subsystem breakdown is gated, because the breakdown is recon material for unauthenticated callers."
  - q: "Will the watchdog flag idle dev systems?"
    a: "No. The scanner uses hybrid detection: passive heartbeats on the normal path, plus a bounded synthetic probe when the heartbeat is stale. The probe scans a fail-fast scheme URL, refreshes the heartbeat on success, and only surfaces a wedge when the scanner cannot complete a trivial scan within interval/2."
  - q: "How should Kubernetes consume /health?"
    a: "Treat consecutive 503s as a restart signal. Set periodSeconds at or above health_watchdog.interval_seconds and pick failureThreshold so failureThreshold times periodSeconds is larger than 3 times interval_seconds."
---

The `/health` endpoint reports whether Pipelock's HTTP server is responsive AND whether its internal subsystems are alive. External supervisors poll it to decide when to restart Pipelock or route traffic away from it.

`v2.4.0` introduces a wedge-detection watchdog that flips `/health` to **503 Service Unavailable** when any tracked subsystem is unhealthy. Before v2.4, `/health` returned 200 as long as the HTTP handler itself responded; a scanner deadlock or dead session-manager goroutine looked healthy from outside while customer traffic failed inside.

## Healthy response

```http
GET /health
```

```json
{
  "status": "healthy",
  "version": "v2.4.0",
  "mode": "balanced",
  "uptime_seconds": 1234.56,
  "dlp_patterns": 78,
  "response_scan_enabled": true,
  "git_protection_enabled": false,
  "rate_limit_enabled": true,
  "forward_proxy_enabled": true,
  "websocket_proxy_enabled": false,
  "request_body_scan_enabled": true,
  "tls_interception_enabled": false,
  "kill_switch_active": false,
  "subsystems": {
    "scanner": true,
    "config": true,
    "session": true,
    "killswitch": true,
    "watchdog": true
  }
}
```

## Unhealthy response

```json
{
  "status": "unhealthy",
  "version": "v2.4.0",
  "subsystems": {
    "scanner": false,
    "config": true,
    "session": true,
    "killswitch": true,
    "watchdog": true
  }
}
```

The HTTP status is 503 with `"status": "unhealthy"` whenever any tracked subsystem is wedged. The top-level fields keep their pre-v2.4 shape so existing consumers parse cleanly.

## subsystems map is opt-in

The `subsystems` map is included only when `health_watchdog.expose_subsystems: true`. The default is `false` because the per-subsystem breakdown is recon material for unauthenticated callers. The HTTP status code and top-level `status` field still reflect wedges (503 on wedge) regardless of the setting; only the per-subsystem breakdown is gated.

When the watchdog is disabled entirely, the `subsystems` field is omitted and `/health` returns HTTP 200 unconditionally (legacy pre-v2.4 shape).

## Tracked subsystems

| Name | Healthy when |
|---|---|
| `scanner` | The scanner pointer and config pointer are both non-nil AND the scanner heartbeat is fresh, or a synthetic probe completes within `interval/2`. |
| `config` | The atomic config pointer is non-nil. A nil pointer means a hot reload race left the proxy unable to read config. |
| `session` | Session profiling is disabled, or the session-manager pointer is non-nil. |
| `killswitch` | The kill switch is disabled in config, or the kill-switch controller is wired. Independent of `kill_switch_active`. |
| `watchdog` | The watchdog goroutine has bumped its self-heartbeat within the staleness threshold. If the goroutine itself dies, `/health` flips to 503. |

## Hybrid passive plus active detection

The scanner subsystem uses two signals.

**Passive scanner heartbeats** are the cheap normal-path signal. Each `Scan()` completion bumps an `atomic.Int64` timestamp. One atomic store per scan; effectively free at scan-rate.

**Bounded synthetic probe** runs only when the scanner heartbeat is stale. The watchdog asks the live scanner to scan a fail-fast scheme URL (`ftp://wedge-probe.invalid/`) under an `interval/2` deadline. A timeout means the scanner is wedged. On success, the heartbeat refreshes so subsequent `/health` calls don't re-pay the probe cost until the heartbeat ages out again.

Idle systems do not flag false positives. If no traffic has reached the scanner for several intervals, the heartbeat ages out, the probe runs, the scanner answers immediately, the heartbeat reseeds, and `/health` stays 200. The probe path only surfaces a wedge when the scanner cannot complete a trivial scan within `interval/2`.

The watchdog goroutine itself is intentionally minimal: a ticker that stores `time.Now()` into one atomic on each tick. If it dies (panic, runtime crash), its self-heartbeat goes stale and `/health` flips to 503 even when every other subsystem looks fine.

## Configuration

```yaml
health_watchdog:
  enabled: true            # default: true
  interval_seconds: 2      # default: 2; staleness threshold = 3 * interval
  expose_subsystems: false # default: false
```

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Turn the watchdog off to restore pre-v2.4 `/health` behavior (no `subsystems` map, always 200). Operators rarely want this off. |
| `interval_seconds` | `2` | Self-beat tick rate. The staleness threshold is derived as 3 times interval, so the default 2s gives a 6s window. |
| `expose_subsystems` | `false` | Include the per-subsystem map in `/health` responses. Default off; the HTTP status and top-level status field still reflect wedges (503) regardless. |

If `health_watchdog` is omitted entirely from the YAML, the section defaults to `enabled: true, interval_seconds: 2`. An operator who omits the section still gets wedge protection.

Watchdog settings are immutable across hot reload in `v2.4`: restarting Pipelock is required to change the interval. The settings are operational and do not affect the canonical policy hash.

## Polling contract for external supervisors

A wedged process cannot reliably restart itself. The watchdog provides the diagnostic; the supervisor performs the action.

Kubernetes liveness pattern:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8888
  periodSeconds: 5            # >= interval_seconds
  failureThreshold: 3         # restart after ~15s of consecutive 503s
  timeoutSeconds: 2
```

The `failureThreshold` times `periodSeconds` budget should be larger than the staleness threshold (3 times `interval_seconds`) so transient probe blips don't trigger restarts.

Non-Kubernetes supervisors (systemd, custom watchdogs, controller-driven setups) follow the same pattern: poll every N seconds, restart after K consecutive failures, where N is at least `interval_seconds` and N times K is greater than 3 times `interval_seconds`.

## Disabling the watchdog

```yaml
health_watchdog:
  enabled: false
```

`/health` returns the pre-v2.4 shape: status always `"healthy"`, no `subsystems` map, HTTP 200 regardless of internal state. Use this only when an external system already provides equivalent liveness signal and you want to silence Pipelock's view.

## Relationship to kill_switch_active

`kill_switch_active` (top-level field) reports whether the kill switch is currently denying traffic. It is a policy signal; operators can flip it on or off through any of six sources.

`subsystems.killswitch` reports whether the kill-switch state machine itself is reachable. A Pipelock that cannot read its kill switch is wedged; one that reads it and reports "active" is fine.

External watchdogs interested in "should this instance receive traffic?" check both: `status == "healthy"` AND `kill_switch_active == false`. The first answers "is Pipelock alive?", the second answers "is Pipelock currently allowing traffic?".

## See also

- [Pipelock v2.4 upgrade guide](/learn/pipelock-v240-upgrade/)
- [Pipelock v2.4.0 release notes](/blog/pipelock-v240-release/)
- [Block reason headers](/learn/block-reason-headers/) for the `kill_switch_active` reason code
