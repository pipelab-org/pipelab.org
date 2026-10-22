---
title: "Pipelock v3.6: Contained Agents You Can Watch and Check"
linkTitle: "Pipelock v3.6 Release"
seoTitle: "Pipelock v3.6: Watch and Check Contained Agents"
date: 2026-10-02
author: "Josh Waldrep"
summary: "Pipelock v3.6 gives each contained agent its own network namespace, lets you watch or take over its screen, attempts to sign a record of which workspace files changed, lets keys reach the services that issued them, and gives each process its own receipt chain."
description: "Pipelock v3.6 isolates contained agents in their own network namespace, signs what they changed, and lets credentials reach the services that issued them."
tags: ["pipelock", "release", "agent-firewall", "agent-containment", "ai-security"]
blog_cat: "releases"
faq:
  - q: "What is the main change in Pipelock v3.6?"
    a: "Contained agents run in their own network namespace and reach only the Pipelock proxy and services you declare. With display and viewer support enabled and installed, you can watch or take over a contained agent's screen with any VNC client. When a session with granted workspaces ends, `contain run` attempts to write a signed list of changed paths. It reports separately when that evidence is unavailable or incomplete."
  - q: "Does Pipelock v3.6 still block a GitHub token sent to GitHub?"
    a: "Not on inspected traffic. Built-in credential classes are allowed at their provider hosts over an encrypted connection. GitHub, GitLab and Google OAuth tokens also have to arrive on the supported header or git path. The same credential sent anywhere else still blocks. The host sets are compiled in and can't be widened from config, except for exact self-hosted GitHub and GitLab instances."
  - q: "Do I need to do anything to upgrade?"
    a: "Read the upgrade notes first. Several config values that used to load are now refused, building from source needs Go 1.26, and contained hosts need `pipelock contain install` with the new binary to move into the private network namespace."
---

A contained agent can edit your workspace and use your credentials. You should be able to see what it's doing and check what changed when it stops.

Pipelock 3.6 gives contained agents their own network namespace, lets you watch or control their screen, and attempts to write a signed workspace change statement when a session with granted workspaces ends. The release includes 322 merged pull requests since v3.5.0.

If you run `pipelock contain`, read the [upgrade guide](/learn/pipelock-v360-upgrade/) first. Contained hosts need `sudo pipelock contain install` with the new binary to move into the new network namespace, and `contain upgrade` alone won't do it.

## Contained agents get their own network

`pipelock contain` used to keep an agent off the internet with firewall rules keyed on its user. In 3.6 the agent also runs in its own network namespace, with its own loopback and no route out. The firewall rules stay as a backstop. The only things it can reach are the Pipelock proxy and the host services you declare, through sockets Pipelock forwards in. `contain run` checks the namespace before every launch. The namespace survives a binary swap and is restored if an install rolls back.

Before launch, `contain run` prints a session contract: the agent user, the egress posture, whether its `/tmp` is private, the tools it may run, and every workspace grant with its expiry. `--dry-run` prints the contract and stops. An expired grant refuses the launch.

## You can watch it

Once you enable `containment.display` and its viewer and rerun `contain install`, `pipelock contain view` opens a contained agent's screen in any VNC client through a local socket only you can open. View-only can't type or click. `--control` takes over, one controller at a time. `contain install` also adds the interception CA to the contained agent's Chromium certificate store, so a contained browser trusts HTTPS through the proxy without hand setup.

## It tells you what it changed

When a contained session with granted workspaces ends, `contain run` compares the workspaces against how they looked before launch and writes a signed [workspace change statement](/blog/what-did-the-agent-change/). It lists the paths that were added, removed or modified, bound to that session's posture capsule. It's a before-and-after comparison, not a running history, so it won't show a file the agent created and deleted before it exited, and it doesn't say which process did it. If part of the tree couldn't be read, the statement says it's incomplete and verification fails instead of handing you an empty list. If the statement can't be written at all, `contain run` says so on its own line.

## Credentials reach their issuing services

A secret scanner that blocks a GitHub token on its way to GitHub gets turned off. In 3.6, on traffic Pipelock inspects, built-in credential classes are allowed at their provider hosts over an encrypted connection. GitHub, GitLab and Google OAuth tokens also have to arrive on the supported header or git path. The same key anywhere else still blocks. That covers GitHub and GitLab (including git push over HTTPS), Slack, Google OAuth and the major model providers. The host sets are compiled in. The coverage table cites provider docs and flags the few bindings carried over without independent verification. I wrote up [why they can't be a config option](/blog/credentials-have-an-audience/).

Same idea, smaller. Signed AWS requests reach their own AWS endpoint. A presigned URL inside a request body needs an exact, expiring `sigv4_credential_routes` entry you add. With TLS interception, header scanning, the issuer-bound session setting and a trusted agent identity in place, a session cookie can go back to the site that set it. A next-page token a JSON API handed out in that session can go back to that API without tripping the entropy gate. DLP still runs on both.

## Evidence you can check

Each Pipelock process writes its own receipt chain, so two processes sharing a recorder directory no longer fork one, and a restart is a signed link to the tail it continues. `verify-receipt --whole-recorder` checks the recorder chains and shutdown seals available on disk in one pass. Success alone does not prove every expected run is present. Blocked HTTP responses carry an `X-Pipelock-Receipt` header once their receipt is recorded. Allowed HTTP responses carry it when `flight_recorder.require_receipts` is enabled. You can [verify a receipt chain in your browser](/verify/) on this site, nothing uploaded. The Go, Rust and TypeScript verifiers now open the same file the operating system would when a path contains symlinks or `..`.

## More it catches

DNS-over-HTTPS messages get inspected as DNS. A configured canary, environment secret or file secret now matches when at least 16 contiguous bytes of a long, random-looking eligible value leak, or when the whole value is spelled as decimal character codes. For URL-valued secrets, partial matching covers their credential-bearing portions. URL destinations hidden in query parameters get the same allowlist, blocklist and SSRF checks as the outer host through several encoding layers. Gzip and deflate responses get decoded and scanned instead of refused. Browser Shield uses browser-compatible HTML parsing, fixing cases that broke pages and bot checks.

## New integrations

`pipelock pi install` points [Pi](/learn/pi/) at a named listener, which needs Pro, and `pipelock continue install` wraps the MCP servers in Continue.dev's YAML config. Both take `--dry-run` and have a matching `remove`. There's also a hand-setup guide for the [Grok CLI](/learn/grok/).

## Try Pro without a card

Pro has a 30-day trial with no card and no automatic conversion. [Pricing](/pricing/) has the link.

## Security fixes

This release fixes the issues described in [CVE-2026-91179](https://github.com/pipelab-org/pipelock/security/advisories/GHSA-78fw-wq47-jvch) and [GHSA-7rx9-4cr3-323c](https://github.com/pipelab-org/pipelock/security/advisories/GHSA-7rx9-4cr3-323c). The second advisory doesn't have a CVE assigned yet. Thanks to paulchum for reporting both. Upgrade to 3.6.0 for the fixes.

## Upgrade

This one has real upgrade notes. Some config that used to load is now refused, with a message naming the field: a host pattern that isn't a hostname, a wildcard passthrough over a public suffix, a temporary exception whose expiry is past that field's new maximum, and the removed `session_profiling.volume_spike_ratio`. Building from source needs Go 1.26. Contained hosts need `sudo pipelock contain install` with the new binary to move into the namespace.

Read the [v3.6 upgrade guide](/learn/pipelock-v360-upgrade/) before you upgrade. The full list is on the [GitHub release](https://github.com/pipelab-org/pipelock/releases/tag/v3.6.0).
