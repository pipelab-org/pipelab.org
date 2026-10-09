---
title: "Hermes Agent Integration: Hook-Based Scanning for Non-MCP Agents"
linkTitle: "Hermes Integration"
seoTitle: "Hermes Agent + Pipelock Hook Integration"
subtitle: "Not every agent framework speaks MCP. Pipelock bridges Hermes Agent's hook events into the same scanner pipeline through a small plugin that calls back into the binary."
description: "Bridge Hermes Agent into Pipelock's scanner pipeline with a hook plugin. Install, verify, and roll back the integration with one command each."
date: 2026-05-31
lastmod: 2026-09-29
learn_cat: operator
level: intro
tags:
  - integration
  - hermes
  - mcp
related:
  - request-policy
  - mcp-proxy
  - verifiable-egress-control
faq:
  - q: "How does Pipelock integrate with Hermes Agent?"
    a: "pipelock hermes install extracts a small Python plugin into ~/.hermes/plugins/pipelock/ and wires it into Hermes. When Hermes fires a hook event, the plugin calls pipelock hermes hook as a subprocess, which runs that event through the same scanner pipeline Pipelock uses everywhere else. No MCP required."
  - q: "What does pipelock hermes verify report?"
    a: "It inspects ~/.hermes and reports the coverage state honestly. 'full' means the plugin is present, has its manifest, is enabled, the hook is wired, and the proxy environment is set. 'mcp-only' means the framework is covered through wrapped MCP servers or injected proxy env but the hook plugin is not fully ready. verify reports what is actually wired, not what files happen to exist."
  - q: "How do I undo the integration?"
    a: "pipelock hermes rollback removes the plugin and unwinds the wiring. install, verify, and rollback are the three lifecycle commands; hook is the per-event subprocess entrypoint Hermes calls, not something you run by hand."
---

MCP gave Pipelock a clean place to stand between an agent and its tools. Frameworks that do not run on MCP never had that seam. Their tool calls and lifecycle events happened entirely inside the framework, where no proxy could see them.

The Hermes Agent integration adds the seam. A small plugin inside Hermes forwards each hook event to Pipelock, which scans it the same way it scans everything else.

## How it works

`pipelock hermes install` extracts an embedded Python plugin into `~/.hermes/plugins/pipelock/` and wires it into the Hermes configuration. From then on, when Hermes fires a hook event, the plugin calls `pipelock hermes hook` as a subprocess. That entrypoint feeds the event into Pipelock's scanner pipeline and returns the verdict, so the same DLP, injection, and policy checks that guard MCP and HTTP traffic now guard the framework's hook surface. The fail-closed defaults carry over: a parse error or a timeout blocks rather than waves through.

The plugin is the only supported way to change the installed integration. It ships inside the Pipelock binary and is materialized verbatim, so the version on disk always matches the binary you are running.

## Lifecycle

Three commands manage the integration, and one runs underneath it:

- `pipelock hermes install` extracts the plugin and wires it in.
- `pipelock hermes verify` inspects `~/.hermes` and reports the real coverage state.
- `pipelock hermes rollback` removes the plugin and unwinds the wiring, including the browser defaults below.
- `pipelock hermes hook` is the per-event subprocess entrypoint Hermes invokes. You do not call it directly.

## Browser launch defaults

As of v3.6.0, `pipelock hermes install` also sets agent-browser launch defaults that stop agent-browser from advertising the automation marker. `pipelock hermes verify` reports whether they're in place, and `pipelock hermes rollback` reverses them. Pass `--no-browser-defaults` to `install` to skip them. `install` and `rollback` take an exclusive lock, so two runs can't interleave.

## Coverage is reported honestly

`verify` does not infer protection from the presence of files. It distinguishes `full` coverage, where the plugin is present, manifested, enabled, the hook is wired, and the proxy environment names are set, from `mcp-only`, where the agent is covered through wrapped MCP servers or injected proxy environment but the hook plugin is not fully ready. Reporting `full` from file presence alone would be false protection, so it does not.

To control what those scanned events are allowed to do once they reach the network, pair this with [request policy](/learn/request-policy/) and the [MCP proxy](/learn/mcp-proxy/).
