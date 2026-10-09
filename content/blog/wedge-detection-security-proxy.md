---
title: "Wedge Detection: Knowing Your Security Proxy Still Works"
linkTitle: "Wedge Detection"
seoTitle: "Wedge Detection for Agent Firewall Health"
date: 2026-05-10
author: "Josh Waldrep"
summary: "A liveness probe that returns 200 doesn't prove the request pipeline is making progress. Monitoring can stay green while enforcement stalls. Here's how to detect that."
description: "Wedge detection catches a security proxy that is running but stuck. Liveness probes pass while scans stop draining. The fix is a watchdog."
tags: ["sre", "ai-security", "agent-firewall", "pipelock", "kubernetes", "operations"]
related: ["block-reason-headers-agent-debugging", "subpath-configmap-no-hot-reload", "pipelock-v240-release"]
faq:
  - q: "What is a wedged process?"
    a: "A wedged process is one that is running, accepting connections, returning 200 on its liveness probe, but no longer making forward progress on its actual work. Goroutines are blocked on a lock that nobody will ever release. The event loop is stuck on a syscall that will not return. The accept queue keeps growing. From the outside the process looks healthy. The work the process is supposed to be doing has stopped."
  - q: "Why doesn't a liveness probe catch a wedged proxy?"
    a: "A liveness probe typically tests that the process is alive and the listener is accepting connections. Both can be true while the work pipeline is stuck. Pipelock's /health endpoint uses scanner heartbeats plus a bounded synthetic scanner probe: if the live scanner cannot complete a trivial scan inside the probe deadline, the endpoint flips to 503 and the kubelet or load balancer reacts. The signal is scanner progress, not aliveness."
  - q: "How does Pipelock's wedge detector decide that the pipeline is stuck?"
    a: "The detector uses passive scanner heartbeats on normal traffic and a bounded synthetic probe when the heartbeat goes stale. If the scanner can complete the probe, the heartbeat refreshes and /health stays 200. If the probe times out, /health flips to 503. Idle systems do not fail just because no traffic is present; the probe distinguishes quiet from wedged."
blog_cat: "sre"
---

A security proxy that is "running but stuck" is the worst-shaped failure in agent security. Monitoring stays green. The proxy returns 200 on its liveness probe. Connections still get accepted. The work the proxy is supposed to be doing, scanning bodies, checking destinations, applying policy, has stopped advancing. From the outside the deployment looks healthy. From the inside, every new request is queueing for a verdict that will never come.

This post is about wedge detection: the watchdog that catches the case liveness probes miss. The implementation is straightforward, the operational behavior is conservative, and the failure mode it catches is one a single dropped goroutine can produce.

## Liveness is not correctness

A standard Kubernetes liveness probe tests that the container is alive. The probe hits an HTTP endpoint, receives a 200, and decides the pod is healthy. If the probe fails, kubelet restarts the container. The probe is good at catching crashes, OOMs, and panics that take the process down.

The probe is not good at catching:

- A goroutine deadlock that locks the scanning pipeline while the HTTP listener stays responsive.
- A blocked syscall in a worker that never times out.
- A queue that is filling faster than it is draining, where the HTTP layer accepts the request but the scanner never sees it.
- An exhausted file descriptor pool where the HTTP server stays up but cannot open new TLS connections.

Each of these classes leaves the process alive and the listener responsive. The HTTP probe returns 200. Kubelet sees a healthy pod. Operators see a healthy dashboard. The agent firewall is, from the perspective of every monitoring layer, fine.

Meanwhile every new request is silently failing to be enforced. If the proxy is configured to fail-open (it should not be, but operators sometimes write it that way during onboarding), traffic flows through unscanned. If the proxy is configured to fail-closed, the agent piles up in retries against an enforcement layer that has stopped working. Either outcome is bad. Both are invisible to a probe that asks "are you alive."

When the proxy does block, [block-reason headers](/blog/block-reason-headers-agent-debugging/) help the agent avoid useless retries. Wedge detection is the companion signal for the harder case: the proxy is alive, but the scanner cannot make progress.

## What the wedge detector watches

Pipelock's wedge detector tracks forward progress on the scanner itself. The signal is not "the queue depth is high" or "latency is high." Both of those can be true during a normal traffic spike. The signal is "the live scanner stopped reporting progress, and a bounded probe cannot complete."

The implementation uses two signals:

- **Passive scanner heartbeat.** Each `Scan()` completion updates an atomic timestamp. Normal traffic pays one cheap store.
- **Bounded synthetic probe.** When the scanner heartbeat is stale, the watchdog sends a fail-fast probe URL through the live scanner under an `interval/2` deadline. Success refreshes the heartbeat. Timeout marks the scanner unhealthy.

The watchdog also checks structural presence for config, session, and kill-switch state. Optional subsystems report healthy when disabled. Enabled subsystems report unhealthy when their live pointer or controller is missing.

## Why the detector is conservative

The wedge signal has to be conservative. False positives flap pods out of service during low-traffic periods. Real wedges happen rarely; flaps happen often. The detector tilts toward missing slow wedges rather than flagging spurious ones, with several gates:

- **Idle-safe probe path.** If no traffic reaches the scanner for several intervals, the heartbeat ages out, the probe runs, and a healthy scanner answers immediately.
- **Staleness window.** The threshold is derived from the watchdog interval. The default `interval_seconds: 2` gives a 6-second staleness window.
- **Bounded probe deadline.** The synthetic scan must complete inside `interval/2`. A slow or hanging scanner fails the probe instead of making `/health` hang.
- **Subsystem detail gating.** `expose_subsystems` controls whether `/health` includes the scanner/config/session/killswitch/watchdog breakdown. The 503 signal still works when the detail map is hidden.

The configuration shape is in the [health watchdog guide](/learn/health-watchdog/). Operators with unusual probe budgets can raise or lower the interval; the underlying signal stays the same.

## What it catches that other monitors miss

Three failure modes this pattern is built to catch when liveness probes cannot:

- **Scanner deadlock.** The HTTP handler can still answer `/health`, but a real scan or synthetic probe cannot complete.
- **Missing config pointer after reload.** The process is alive, but the scanner cannot read the current config. Structural checks catch that as unhealthy.
- **Dead session or kill-switch controller.** Optional subsystems are fine when disabled. When enabled, a missing manager/controller is a wedge signal because the enforcement path cannot make the decision it is supposed to make.

None of these requires the process to crash. That is why `/health` has to ask more than "can the HTTP handler write a 200."

## Wedge detection is not a substitute for fixing the wedge

When `/health` flips to 503 and kubelet recreates the pod, the recreated pod might wedge again on the same input. The detector is a containment mechanism, not a fix. The right operational response when wedge detection fires:

- The pod is taken out of rotation, traffic moves to the rest of the deployment.
- The audit log captures the wedge signal with the subsystem state that triggered it.
- An operator inspects the audit log, finds the failure mode, and ships a fix.

The detector buys time. It does not replace the engineering work of finding and fixing the wedge. The health response and audit trail are the starting point for that debugging, not the fix.

## What to look for in your own services

The pattern is general. If you operate a service whose HTTP listener can stay responsive while its work pipeline stalls, a wedge detector has a job. The implementation is small:

- A heartbeat that updates when the real work completes.
- A bounded active probe that distinguishes idle from wedged.
- A comparison that flags stale heartbeat plus failed probe.
- A health endpoint that reports the wedge signal.

The hard part is not the detection logic. The hard part is choosing a probe that exercises the critical path without becoming expensive or destructive. Pipelock uses a fail-fast scheme URL so the scanner path runs and the upstream network path does not.

## Liveness, readiness, and wedge

Three signals coexist in a healthy operational stack:

- **Liveness:** the process is alive. The listener accepts. Kubelet uses this to decide whether to restart.
- **Readiness:** the process is willing to accept new traffic. Useful during startup, hot-reload, or graceful drain.
- **Wedge:** the process is making forward progress on its actual work. Use this to detect the failure mode where liveness lies.

Pipelock exposes all three on `/health`. The status code reflects the worst signal. If liveness is fine but the wedge detector has flipped, the response is 503. Operators can opt into subsystem details on trusted networks with `health_watchdog.expose_subsystems`.

## Knowing the difference

If your monitoring story for an agent firewall is "we hit /health every five seconds and react to non-200," the wedge mode is the question to ask the vendor. Does the proxy detect when its own pipeline stalls? Does the health endpoint reflect that? If the answer is no, the dashboard is asserting health based on the proxy being able to answer the phone. The phone answering is not the same as the work getting done.

The wedge case is rare. Rare failure modes are the ones that matter on production-scale fleets, because rare across one pod becomes "every few hours" across a hundred pods. A health story that includes wedge detection is a posture that holds up at fleet scale. A health story that stops at liveness gives you a green dashboard during the failures that hurt most.
