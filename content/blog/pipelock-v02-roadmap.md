---
title: "What's next for Pipelock: the v0.2 roadmap"
date: 2026-02-11
author: "Josh Waldrep"
summary: "GitHub Actions, MCP input scanning, smart DLP, and what Pipelock Pro will look like."
description: "Historical v0.2 Pipelock roadmap (Feb 2026). GitHub Actions, MCP input scanning, smart DLP, enterprise tier. Current state in the v2.5.0 release post."
tags: ["pipelock", "roadmap"]
blog_cat: "releases"
---

> **Historical roadmap (Feb 2026).** Pipelock is now at v2.5.0. For current state and shipped features, see the [v2.5.0 release post](/blog/pipelock-v250-release/).

v0.1.5 just shipped. 750+ tests, 7-layer scanner pipeline, MCP proxy, integrity monitoring, project auditing, all in one binary with six dependencies. (Update: v1.1.0 is now out with 5,400+ tests, a 9-layer pipeline, GitHub Action, TLS interception, multi-agent profiles, and Streamable HTTP MCP transport. Pipelock is now open core: Apache-2.0 core; Enterprise features under ELv2.) I also got listed on the [OWASP Solutions Landscape](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) for agentic AI security, which feels pretty good for a project built by a plumber.

Here's what's coming next.

## GitHub Action

(Update: Shipped.) The [GitHub Action](https://github.com/marketplace/actions/pipelock-agent-security-scan) runs Pipelock in CI. Scans diffs for leaked credentials, injection patterns, and security misconfigurations.

```yaml
- uses: luckyPipewrench/pipelock@v1.1.0
  with:
    scan-diff: 'true'
    fail-on-findings: 'true'
```

## MCP input scanning

(Update: Shipped.) Pipelock now scans both directions on the MCP proxy. Tool responses are scanned for injection. Tool arguments are scanned for DLP patterns, catching credential leaks before they reach the tool server.

## Smart DLP

The DLP scanner uses regex patterns against URLs, headers, request bodies, and MCP arguments. Suppressions let you reduce false positives by path, rule, or pattern. Context-aware DLP with ML-based confidence scoring is on the roadmap.

## Pipelock Enterprise

(Update: Enterprise shipped in v1.1.0.) The core proxy and scanner pipeline are free and always will be. Enterprise adds multi-agent profiles with per-agent DLP, allowlists, and rate limits. Usage budgets with per-agent request and data caps. Ed25519-signed license with embedded org, tier, and agent count. All gated by build tag and license verification.

Enterprise features are under ELv2. [Get in touch](https://pipelab.org/pipelock/) if you're interested.

## Get involved

The code is at [github.com/pipelab-org/pipelock](https://github.com/pipelab-org/pipelock) (Apache-2.0 core; Enterprise features under ELv2). The [CONTRIBUTING guide](https://github.com/pipelab-org/pipelock/blob/main/CONTRIBUTING.md) has architecture docs, testing patterns, and recipes for adding new scanner layers.

If you're running AI agents in production and care about security, give it a shot. And if you break something, open an issue. That's how this gets better.
