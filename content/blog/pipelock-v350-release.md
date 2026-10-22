---
title: "Pipelock v3.5: Native Agent Evidence Level Records"
linkTitle: "Pipelock v3.5 Release"
seoTitle: "Pipelock v3.5: Native AEL Evidence"
date: 2026-09-01
author: "Josh Waldrep"
summary: "Pipelock v3.5 writes Agent Evidence Level records natively, scans WebSocket control payloads, enforces the containment layers a sandbox launch applied, and disables npm lifecycle scripts in contained installs by default."
description: "Pipelock v3.5 writes Agent Evidence Level records natively, scans WebSocket control frames, and enforces the containment layers a launch applied."
tags: ["pipelock", "release", "agent-firewall", "evidence", "ai-security"]
blog_cat: "releases"
faq:
  - q: "What is the main change in Pipelock v3.5?"
    a: "The receipts Pipelock emits about what an agent did are now the same shape the Agent Evidence Level reference checker consumes, so the checker runs on a real export instead of a fixture."
  - q: "Does Pipelock v3.5 scan WebSocket control frames?"
    a: "Yes. Ping, pong, and close payloads go through the same scanning as data frames, because a control frame can carry bytes too."
  - q: "What changed for contained hosts in v3.5?"
    a: "A sandbox launch now enforces the containment layers it applied and no more and refuses to report a layer it couldn't set up as if it had. Contained installs disable npm lifecycle scripts by default."
---

Pipelock v3.5.0 is out, and it writes Agent Evidence Level records natively.

## Evidence the checker can read

The receipts Pipelock emits about what your agent tried to do, and what it was allowed or refused, are now the same shape the [AEL reference checker](/learn/agent-evidence-levels/) consumes. The evidence standard published this week has a working producer on day one, and you can run the checker on a real export from a real firewall rather than a fixture. Receipts also prove liveness from session start, so a truncated run is evident from the record itself instead of only from a clean shutdown.

## Control frames are payloads

WebSocket control frames get scanned, not only data frames. A ping payload is still a payload. Response taint carried on a WebSocket connection is preserved across the frames that follow, and URL path data is scanned for cross-request exfiltration the same way query data already was.

## Containment reports what it did

A sandbox launch now enforces the containment layers it applied and refuses to report a layer it couldn't set up as if it had. Where the seccomp filter isn't built for an architecture, Pipelock says so rather than claiming it. The containment installer disables npm lifecycle scripts by default, since a postinstall hook is a shell with your agent's permissions, and it refuses an unsafe install instead of proceeding and reporting success.

## Redirects can't escape policy

A redirect now goes through the same session policy and Git push allowlist as the original request, and a refused redirect destination is recorded in the receipt. Signed rule artifacts are verified before release into the request path, and the emit configuration is restart-only so a hot reload can't change where evidence goes mid-session.

## Upgrade

Contained Linux hosts use `pipelock contain upgrade`, which checks the new binary and managed configuration before it stops the old service. The full change list and the breaking-changes section are on the [GitHub release](https://github.com/pipelab-org/pipelock/releases/tag/v3.5.0). If you're on 3.4, read that section before you upgrade.
