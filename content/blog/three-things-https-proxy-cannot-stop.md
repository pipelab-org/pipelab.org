---
title: "Three Things \"Set HTTPS_PROXY\" Cannot Stop"
linkTitle: "Three HTTPS_PROXY Bypasses"
seoTitle: "Three Bypasses for HTTPS_PROXY Agent Egress"
date: 2026-05-13
author: "Josh Waldrep"
summary: "Setting HTTPS_PROXY is policy. Three bypass shapes the kernel doesn't agree with: env-cleared subprocesses, non-HTTP transports, and NO_PROXY domains."
description: "HTTPS_PROXY is cooperative. Three bypass classes the kernel does not enforce: subprocess env-clear, non-HTTP transports, and NO_PROXY domain matches."
tags: ["ai-security", "agent-security", "agent-firewall", "linux", "pipelock"]
related: ["politeness-vs-enforcement-https-proxy", "three-uid-agent-containment-linux", "why-domain-allowlists-arent-enough"]
faq:
  - q: "Can an AI agent bypass HTTPS_PROXY in a subprocess?"
    a: "Yes. The agent process can spawn a subprocess with the HTTPS_PROXY environment variable cleared or unset. The subprocess inherits a different environment than the parent, so any cooperative HTTP library the subprocess uses will not consult the proxy variable. The kernel sees a normal outbound connection from the subprocess UID and lets it through. Defending against this class of bypass needs a kernel-level rule, like an nftables UID match or a Kubernetes NetworkPolicy, that drops outbound traffic regardless of what the agent process intends."
  - q: "What transports does HTTPS_PROXY not cover?"
    a: "HTTPS_PROXY is a hint to HTTP and HTTPS clients. It does not affect raw socket connections, UDP, ICMP, QUIC over UDP, or any DNS query. An agent that opens a raw TCP socket to a destination port routes around the variable. An agent that uses a QUIC client routes around it (QUIC is UDP, no proxy hop). An agent that uses DNS to encode data into hostname queries routes around it. The variable is HTTP-shaped; non-HTTP traffic is invisible to it."
  - q: "Why does NO_PROXY create a bypass surface?"
    a: "NO_PROXY tells cooperative HTTP libraries to skip the proxy for matching hostnames or domains. Internal cluster services typically end up in NO_PROXY so cluster-internal traffic does not hairpin through the proxy. An agent that finds a service whose hostname matches the NO_PROXY pattern can reach that service directly with no proxy inspection. If any of those services has its own egress (a cluster MCP server, a cluster LLM gateway), the agent has reached the internet through a NO_PROXY-listed intermediary, and the agent firewall never saw the request."
blog_cat: "technical"
---

Three bypass shapes for HTTPS_PROXY-only agent egress controls. The kernel does not enforce any of them. Each is reachable in a default Linux process unless additional kernel-level controls are applied.

This post is the listicle companion to [Politeness vs Enforcement](/blog/politeness-vs-enforcement-https-proxy/). The framing post is the long argument; this one is the short list of specific bypasses to know about and the kernel-level rule that would close each.

## 1. Subprocess that clears the environment

An agent process spawns a subprocess. If the spawn does not pass `HTTPS_PROXY` through, the subprocess has a different environment than its parent. Cooperative HTTP libraries in the subprocess never see the variable, so they never route through the proxy.

The bypass takes two lines:

```python
import subprocess
subprocess.run(["curl", "https://example.com/"], env={})
```

The empty `env={}` clears every variable, including the proxy hint. `curl` runs, dials directly, the kernel sees an outbound connection from the agent UID, the connection succeeds.

If the agent is running as the same UID as the operator and the proxy, the kernel has no rule that distinguishes "should go through proxy" from "should not." Every outbound TCP from the agent UID is allowed. The proxy does not see the request, the audit log does not record it, the dashboards do not flag it.

**The kernel-level fix:** put the agent process on a UID that is denied direct internet by an nftables rule. Loopback to the proxy is allowed; everything else is dropped at the kernel level. The subprocess inherits the agent UID and inherits the same restriction. Clearing the environment changes the agent's behavior, not the kernel's.

The same fix in Kubernetes: separate the agent into its own pod with a NetworkPolicy that only allows egress to the proxy pod's service. The agent container can spawn subprocesses, the subprocesses share the agent pod's network namespace, the NetworkPolicy applies to all of them.

## 2. Transport that does not consult HTTPS_PROXY

`HTTPS_PROXY` is documented to affect HTTP and HTTPS client libraries. Other transports do not consult it:

- **Raw TCP sockets.** A direct `socket.connect((host, port))` in any language is unaffected by the variable. Agents that use lower-level networking primitives (gRPC over a custom transport, custom protocol clients, anything calling `socket()` directly) skip the proxy.
- **UDP.** DNS queries, NTP, syslog, custom datagram protocols. The variable has nothing to say about UDP.
- **QUIC and HTTP/3.** QUIC runs over UDP. Most QUIC client libraries do not consult HTTP_PROXY-style variables, even if the underlying request is HTTP/3-shaped. Browsers under modern Chromium can fall back to HTTP/3 for performance reasons; agent libraries that include QUIC support might prefer it.
- **ICMP.** Raw ICMP from a process with the right capabilities. Less common in agent code, but listed for completeness.

A coding agent that wants to ping a host runs `ping`. The kernel sends ICMP. The proxy is not in the path. A coding agent that uses a gRPC client to talk to a service over HTTP/2 might or might not respect proxy variables depending on the library. A coding agent that constructs a DNS query directly to encode data into the hostname (a known DNS-exfiltration pattern) is exfiltrating bytes via a transport the proxy does not see.

**The kernel-level fix:** the same nftables rule that drops outbound from the agent UID drops every transport, not just TCP. UDP, ICMP, raw sockets, all get the same drop. The rule is `meta skuid <agent_uid> drop`, with allow-list exceptions only for loopback and DNS to a local resolver. Anything not on the allow list is gone.

The Kubernetes equivalent is a NetworkPolicy on the agent pod. NetworkPolicy is per-protocol and per-port: the egress section can specify TCP and UDP individually. A correctly tightened policy allows TCP to the proxy service on the proxy port and nothing else. UDP does not need to be allowed for an agent that does not need to send UDP.

## 3. Service whose hostname matches NO_PROXY

`NO_PROXY` is the variable that tells cooperative HTTP clients to skip the proxy for matching destinations. Operators set it to keep cluster-internal traffic from hairpinning through the proxy. Common patterns:

- `NO_PROXY=127.0.0.1,localhost,10.0.0.0/8,*.cluster.local`
- `NO_PROXY=*.internal.example.com,internal-api`

The bypass surface is whatever the operator has put on the list. If a NO_PROXY-listed destination has its own outbound, the agent has just reached the internet through it.

A specific shape: a Kubernetes cluster has an internal LLM gateway service at `llm-gateway.cluster.local`. The agent's NO_PROXY includes `*.cluster.local`. The agent makes an HTTP call to `https://llm-gateway.cluster.local/chat/completions`. The proxy never sees the call. The LLM gateway receives the call, forwards it to a third-party LLM API, and returns the response. From the agent's perspective, this is a successful API call. From Pipelock's perspective, no scanning happened.

The same shape applies to:

- An internal MCP server with its own outbound, where the agent calls the MCP server directly.
- An internal proxy or gateway, where the agent uses the gateway to reach external services.
- An internal logging or metrics service, where the agent can encode data into log lines that get shipped to an external aggregator.

Any service in the NO_PROXY list with its own outbound is a path through the proxy boundary that the proxy cannot see.

**The kernel-level fix:** route every cluster-internal service through the agent firewall too. The cost is a hop of latency on intra-cluster calls. The benefit is that the agent firewall is the only egress path for the agent process, regardless of whether the destination is internal or external. NO_PROXY on the agent is reduced to `127.0.0.1,localhost`. Everything else, including cluster services, goes through the proxy.

This requires the cluster's internal services to accept proxied requests, which most do. It also requires the proxy to be configured to scan internal traffic the same way it scans external traffic. The architectural pattern is "the agent firewall is the agent's only door, and the door applies the same scanning regardless of which floor you are going to."

## The pattern

All three bypasses share a shape: the agent firewall lives in the application layer, and the agent process can route around the application layer in ways the application layer does not see. The kernel sees them all but has no rule to apply.

The kernel-level fixes for all three are versions of the same answer: put the agent process on an identity (UID or pod) that the kernel denies direct egress to anywhere except the proxy. The kernel does not care what the agent intended, what variable was set, what transport was chosen, or what hostname was the destination. The kernel sees the source identity, checks the rule, and drops or accepts.

That is what enforcement looks like. The application-layer hint, however well-intentioned, is policy. The kernel rule is the control.

## Per-bypass severity

Not every bypass is equally dangerous in every deployment:

- The subprocess env-clear bypass requires the agent to deliberately spawn a subprocess with a clean environment. Most coding-agent workflows do not do this by default, but a prompt-injection that says "run this command in a fresh shell" can produce it.
- The non-HTTP-transport bypass is rare in practice. Most agent workloads are HTTP-shaped. DNS exfiltration is the realistic version of this class for agents that handle high-value secrets.
- The NO_PROXY bypass is common in Kubernetes deployments. Internal cluster services are often wired into NO_PROXY, and any of them with outbound access can expand the agent's effective reach.

A defense posture worth shipping does not pick one of these to address. All three are reachable in a default Linux configuration. The kernel-level fix that addresses them is one fix, not three: deny direct egress from the agent identity at the kernel layer, allow only loopback to the proxy.

## What to do with this list

If you operate AI agents and your egress story is `HTTPS_PROXY` plus a hopeful `NO_PROXY`, audit each of the three bypasses on your own environment. The audit takes minutes:

```bash
# 1. Subprocess env-clear
sudo -u <agent-uid> env -i curl https://example.com/

# 2. Non-HTTP transport
sudo -u <agent-uid> nc -z 1.1.1.1 53

# 3. NO_PROXY service
sudo -u <agent-uid> curl http://<no-proxy-service>/
```

Each command that returns success when you expected blocking is a bypass to fix. The fix shape is described above, in [Politeness vs Enforcement](/blog/politeness-vs-enforcement-https-proxy/), and in the [three-UID containment pattern](/blog/three-uid-agent-containment-linux/) for workstations and per-pod NetworkPolicy for clusters.

The agents are going to find these bypasses on their own. Better to find them first.
