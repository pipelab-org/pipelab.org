---
title: "Politeness vs Enforcement: Why \"Set HTTPS_PROXY\" Isn't a Security Control"
linkTitle: "Politeness vs Enforcement"
seoTitle: "Why HTTPS_PROXY Is Not a Security Control"
date: 2026-05-05
author: "Josh Waldrep"
summary: "HTTPS_PROXY env vars and tool deny-lists are policy, not enforcement. Here's the line between them and what crossing it actually takes."
description: "HTTPS_PROXY is policy, not enforcement. The kernel does not enforce environment variables. How agent egress controls fail and how to fix them."
tags: ["ai-security", "agent-security", "agent-firewall", "pipelock", "linux", "kubernetes"]
related: ["what-is-an-agent-firewall", "why-domain-allowlists-arent-enough", "securing-claude-code-with-pipelock"]
faq:
  - q: "Is setting HTTPS_PROXY a security control?"
    a: "No. HTTPS_PROXY is an environment variable that cooperative HTTP libraries read and route their traffic through. Nothing prevents an agent process from clearing the variable in a subprocess, ignoring it entirely, or using a transport that does not consult it. The kernel has no view of HTTPS_PROXY. For a control to count as enforcement, the host must refuse traffic that does not match policy at a layer below the agent process. On Linux that means nftables UID rules or NetworkPolicy in Kubernetes. On a workstation that takes a separate UID running the agent. In a cluster that takes a separate pod for the proxy."
  - q: "What is the difference between a policy and a control in agent security?"
    a: "A policy is a stated rule. A control is a mechanism that prevents the policy from being violated. HTTPS_PROXY tells well-behaved HTTP libraries to route through a proxy. A NetworkPolicy or nftables chain refuses traffic that does not match a rule, regardless of what the agent process intends. The first is policy. The second is enforcement. A complete posture sets both, but only the second one survives a compromised or prompt-injected agent."
  - q: "Can a prompt-injected agent bypass HTTPS_PROXY?"
    a: "Yes, and trivially. The agent process can spawn a subprocess with the variable cleared. Or it can call a system library that does not consult the variable. Or it can talk to a service whose hostname matches NO_PROXY. None of these require code execution exploits. They require the agent to do something the agent already knows how to do. Defense against this class of bypass needs an enforcement layer below the agent process, where the agent's runtime choices do not reach."
blog_cat: "technical"
---

If your agent egress story is "we set HTTPS_PROXY to point at the proxy," the proxy is asking nicely. The kernel has no opinion on what the agent does next.

This post is about the line between asking nicely and actually preventing the thing. The line is whether the kernel agrees with you. Everything on the wrong side of that line is policy. Everything on the right side is a control.

## The bestiary

Plenty of common AI security controls live on the asking-nicely side. A short catalog:

- **`HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` environment variables.** Cooperative libraries read them. Uncooperative subprocesses ignore them. There is no kernel hook that says "this UID's traffic must traverse 127.0.0.1:8888."
- **Tool deny-lists at the model layer.** "Do not call `curl`." The model agrees and then writes a Python script that imports `requests`. The deny-list never sees `requests`.
- **System prompts that say "do not exfiltrate."** A system prompt is text inside a context window. The text shapes the model's output distribution. The model is free to be wrong, and a prompt injection further along in the context can rewrite the rules.
- **Allowlists in the agent's own configuration.** A configuration the agent process can read, the agent process can edit. Anything under `~/.config` is asking nicely with extra steps.
- **MCP server lists in `~/.mcp.json`.** Same shape. The agent picks which MCP servers to talk to. If the agent picks a different one, nobody stops it.

The asking-nicely controls all share a pattern: the agent process is the entity expected to comply. The check, the variable, the deny-list, the allowlist, all live somewhere the agent can read or modify. Compliance is voluntary.

The enforcement-side controls share a different pattern: the agent process is the entity being constrained. The check lives somewhere below the agent. A short catalog of those:

- **NetworkPolicy in Kubernetes.** The CNI drops traffic that does not match the policy. The pod cannot opt out.
- **`nftables` rules with `meta skuid` matches.** The kernel drops traffic from the agent UID that does not match the egress rule. The agent process cannot remove the rule.
- **Linux user namespaces with no route to the internet.** A process inside the namespace has no IP routes that lead outside. Setting `HTTPS_PROXY` would be a no-op for traffic that has nowhere to go.
- **Capability separation by UID.** The agent UID has access to a proxy on loopback. The proxy UID has access to the internet. The agent UID does not.

The line is the kernel. Below the line, no agent runtime choice changes the outcome.

## A real bypass that landed

A working coding agent on a real Linux host had `HTTPS_PROXY=http://127.0.0.1:8888` set as policy. Every browser, every CLI, every script the operator ran picked up the variable and routed through the proxy. The proxy scanned the traffic, the audit log filled up, the dashboards showed coverage.

The agent decided it needed to refresh an OAuth token. It spawned a subprocess. The subprocess did not inherit the proxy environment, by design or by accident. The subprocess dialed the OAuth endpoint directly. The OAuth refresh succeeded. The proxy never saw the request.

The DLP scanner did not run. The audit log did not record the request. The dashboards still showed compliant traffic for the requests that used the proxy. The operator was looking at metrics that confirmed partial compliance with a policy the agent had already routed around.

Nothing about this story requires the agent to be malicious or compromised. The agent did the thing agents do: it ran a process. The process did the thing processes do: it talked to the network. The kernel, watching the whole thing, had no policy to apply because the policy lived in an environment variable inside a process that no longer existed by the time the dial happened.

This is not theoretical in modern agent deployments. The fix is not "set the variable harder."

## What enforcement actually takes

On a workstation that runs a coding agent, an AI CLI, and a browser-driver alongside the operator's normal applications, a kernel-enforced boundary takes a few specific things:

- The agent runs as a different Linux UID than the operator and the proxy.
- An `nftables` chain matches `meta skuid <agent_uid>` and drops everything except DNS to loopback.
- A separate `nftables` rule allows the proxy UID to reach the internet, because the proxy is the agent's only legitimate exit.
- The operator's UID is unaffected, so the desktop continues to work normally.

That last point is load-bearing. If enforcement breaks the operator's daily flow, nobody runs it. The three-UID model exists because two UIDs is not enough: the proxy needs internet, so the proxy UID has internet, so an agent running as the proxy UID inherits internet. The agent UID has to be a third identity that can only see loopback.

In Kubernetes, the same idea takes pod separation. NetworkPolicy is per-pod, not per-container. Every container in the same pod shares one network namespace, so a NetworkPolicy cannot say "agent container has no internet, proxy sidecar has internet." The proxy has to live in its own pod, and the agent pod gets a NetworkPolicy whose only egress is to the proxy pod's service IP.

Both stories rhyme. The kernel layer below the agent is doing the refusing. The agent's runtime choices do not reach the kernel.

## Why this distinction matters

If you are evaluating an agent security tool, ask the vendor what happens when the agent ignores the tool. The answer separates policy from enforcement.

A vendor whose answer is "the agent is configured to use our proxy" is selling policy. That is fine if you trust your agent. If you are running production AI assistants that handle credentials, parse untrusted content, or execute attacker-controllable instructions, you should not.

A vendor whose answer is "the agent process cannot reach the internet without going through us, because the kernel says so" is selling enforcement. The implementation might be Kubernetes NetworkPolicy, Linux UID separation, or a managed-runtime environment that controls the egress. The detail varies. The shape is consistent: the agent is the entity being constrained, not the entity expected to comply.

This is not a critique of asking-nicely controls in general. They have a place. A correctly-set `HTTPS_PROXY` is real coverage for compliant traffic. A clear deny-list raises the bar for casual misuse. They are policies, and policies are useful.

They are not controls. Treating them as controls produces dashboards that confirm a policy the agent has already routed around.

## The fix model in two sentences

On Linux: put the agent process on a UID the kernel firewall denies direct internet. Allow only loopback to the proxy.

In Kubernetes: put the proxy in a different pod from the agent, and write a NetworkPolicy on the agent pod whose only egress destination is the proxy pod's service IP.

The rest is wrappers, CA bundles, sudoers carve-outs, and operational care. Pipelock works inside both shapes today as the proxy that handles content scanning above the kernel-enforced boundary, and the [agent firewall guide](/agent-firewall/) walks the layered model that sits on top of the egress boundary. The boundary itself is the load-bearing part. Without it, every layer above it is asking nicely.

## What to do this week

If you run agents on a workstation:

- Check whether the agent process and the proxy process run as the same UID. If yes, the agent has direct internet whenever it wants it.
- Check whether your firewall has a rule that mentions the agent UID. If no, the policy is in `HTTPS_PROXY` and nowhere else.
- Try the bypass. Open a shell as the agent UID, run `env -u HTTPS_PROXY -u HTTP_PROXY curl https://example.com`, and see what happens. If you get a 200, your enforcement layer is missing.

If you run agents in Kubernetes:

- Check whether the agent container and the proxy container live in the same pod. If yes, the proxy can scan but cannot prevent.
- Check whether the agent pod has a NetworkPolicy. If no, the agent has direct internet to anything inside or outside the cluster.
- Try the bypass from inside the agent pod. `kubectl exec` in, `curl https://example.com`. A 200 is the same problem in a different shape.

A green dashboard with no enforcement layer below it is the most expensive form of theater in security work. Worth knowing whether you are running it.
