---
title: "The Three-UID Containment Pattern for AI Agents on Linux"
linkTitle: "Three-UID Agent Containment"
seoTitle: "Three-UID Linux Containment for AI Agents"
date: 2026-05-06
author: "Josh Waldrep"
summary: "A working agent containment story on Linux needs three UIDs, not two. The proxy UID has internet by design, so the agent UID has to be a third identity."
description: "Naive Linux agent containment uses two UIDs and leaks. The right model uses three: operator, proxy-runner, agent-runner. Here is the working chain."
tags: ["ai-security", "agent-security", "linux", "nftables", "pipelock"]
related: ["politeness-vs-enforcement-https-proxy", "what-is-an-agent-firewall", "securing-claude-code-with-pipelock"]
faq:
  - q: "Why three UIDs for AI agent containment instead of two?"
    a: "The proxy needs internet because the proxy IS the agent's exit. If the agent runs as the proxy UID, the agent inherits direct internet too, and the kernel firewall has no way to tell them apart. A third UID, distinct from both operator and proxy, gives the kernel a target to drop. The operator UID stays normal so the desktop continues to work. The proxy UID has internet so the proxy can do its job. The agent UID has loopback only, so the agent has nowhere to go except through the proxy."
  - q: "What does the nftables chain for a contained agent look like?"
    a: "The chain has four ordered rules in the OUTPUT hook. First, accept anything to loopback. Second, accept anything from the operator UID. Third, accept anything from the proxy UID. Fourth, allow only DNS to loopback from the agent UID, then drop. The rule that matters is the last one. Everything not matched by the earlier accepts gets dropped if it originates from the agent UID. The kernel never lets the traffic out, regardless of what HTTPS_PROXY says."
  - q: "Does the operator's browser need to be contained too?"
    a: "Not in this model. The operator's browser runs as the operator UID, which has unrestricted egress. The point is to contain the agent's process tree, not to lock down the entire workstation. If the operator types a URL into a browser, that traffic is the operator's responsibility, not the proxy's. The boundary exists for processes the operator launches via wrapper scripts that drop into the agent UID, not for the operator's normal day."
blog_cat: "technical"
---

A correct AI agent containment model on a Linux workstation needs three Linux UIDs, not two. Two UIDs has a hole. The hole is structural, not a configuration mistake.

This post shows the three-UID model with a working `nftables` chain, the wrapper script that drops the agent process into the right identity, and the rollback path. The model came out of porting Kubernetes NetworkPolicy containment back to a single-machine setup, and the lesson it teaches is the same: the proxy needs internet because the proxy is the agent's exit. So the agent has to be a third identity.

## Why two UIDs leaks

Naive containment says: run the proxy as one UID, run the agent as another. Add an `nftables` rule that drops anything from the agent UID except loopback. Done.

The problem surfaces the moment you ask which UID the agent runs as. If the agent runs as the proxy UID, the agent inherits direct internet because the proxy needs direct internet. The firewall cannot tell the agent's syscalls apart from the proxy's. They are the same UID.

If the agent runs as the operator UID, the agent has the operator's whole egress story, which is "anything I want." Same problem with extra steps.

The fix is to put the agent on a UID that is neither the operator nor the proxy. Three identities. The kernel firewall has a target to drop on. The proxy keeps its internet because it has its own UID. The operator keeps a normal desktop because the rules do not touch the operator UID. The agent process loses direct internet because it runs as a UID the firewall denies.

## The model in one diagram and one chain

Three Linux UIDs:

- `operator`: the human at the keyboard. Browser, terminal, git, kubectl. Normal egress.
- `pipelock-proxy`: the proxy daemon. Runs the agent firewall. Has internet because that is its job.
- `cc-agent`: every agent process. Coding CLI, AI assistant, browser driver, screenshot tool. Has loopback only.

The agent UID is denied direct internet by `nftables`. Loopback to the proxy is allowed. DNS to loopback is allowed because the operator's local resolver still serves names. Everything else from the agent UID drops.

The rule set lives in `/etc/nftables.d/50-pipelock-containment.nft`:

```nft
table inet pipelock_containment {
    chain output_filter {
        type filter hook output priority filter; policy accept;

        # Loopback always accepted. This is what the agent uses to reach the proxy.
        meta oif "lo" accept
        ip daddr 127.0.0.0/8 accept

        # Operator UID stays normal.
        meta skuid 1000 accept

        # Proxy UID has internet because the proxy IS the exit.
        meta skuid 988 accept

        # Agent UID: DNS to loopback resolver, then drop everything.
        meta skuid 987 udp dport 53 ip daddr 127.0.0.0/8 accept
        meta skuid 987 tcp dport 53 ip daddr 127.0.0.0/8 accept
        meta skuid 987 drop
    }
}
```

That is the whole boundary. The proxy listens on `127.0.0.1:8888`, the agent UID can reach loopback, the agent reaches the proxy through loopback, the proxy reaches the internet through its own UID's accepted rule. Everything else from the agent UID hits the drop and stays inside the kernel.

UIDs in the example are placeholders. The values vary by host. `useradd --system` picks them; capture them into your install state file once and reference by number.

## The wrapper that drops the agent into the contained UID

Containment is structural, but a wrapper makes it usable day-to-day. Operators do not want to type `sudo -u cc-agent --` every time they launch an agent.

Two pieces. First, a generic launcher at `/usr/local/bin/cc-launch`:

```bash
#!/bin/bash
set -euo pipefail
TOOL="$1"; shift
exec sudo -u cc-agent -- env \
    HOME=/home/cc-agent \
    HTTPS_PROXY=http://127.0.0.1:8888 \
    HTTP_PROXY=http://127.0.0.1:8888 \
    NO_PROXY=127.0.0.1,localhost \
    NODE_EXTRA_CA_CERTS=/etc/pipelock/ca.pem \
    SSL_CERT_FILE=/etc/pipelock/combined-ca.pem \
    REQUESTS_CA_BUNDLE=/etc/pipelock/combined-ca.pem \
    CURL_CA_BUNDLE=/etc/pipelock/combined-ca.pem \
    PATH=/home/cc-agent/.local/bin:/usr/local/bin:/usr/bin:/bin \
    "$TOOL" "$@"
```

Second, per-tool wrappers like `/usr/local/bin/cc-claude` that just `exec` into the launcher:

```bash
#!/bin/bash
exec /usr/local/bin/cc-launch claude "$@"
```

A scoped sudoers entry at `/etc/sudoers.d/50-cc-agent` allows the operator to drop into `cc-agent` without a password, but only via the launcher. The shape is:

```
operator ALL=(cc-agent) NOPASSWD: /usr/local/bin/cc-launch *
```

This is not general-purpose `sudo -u cc-agent` access. The operator can run `cc-launch` to start agents, and that is all. The kernel firewall handles the network side. The sudoers handles the launch side. Together they keep the agent in its lane.

## The CA bundle is load-bearing

If the proxy intercepts TLS, the agent UID needs the proxy's MITM CA in its trust store. The wrapper environment points every common library at the combined bundle:

- `NODE_EXTRA_CA_CERTS` for Node.js and anything that uses `tls.createSecureContext`.
- `SSL_CERT_FILE` for OpenSSL-linked clients.
- `REQUESTS_CA_BUNDLE` for Python `requests`.
- `CURL_CA_BUNDLE` for curl.

The bundle gets built once with `pipelock tls show-ca` plus the system roots concatenated. Rebuild whenever the proxy CA rotates. Wrappers read the bundle by path, so a refresh of the file picks up automatically.

If you skip the CA bundle, the agent's HTTPS calls fail at TLS verification, and you spend an afternoon convinced the firewall is broken when the cert chain is the problem.

## The verification probes

Containment is only real if you can prove it. Run these probes after install:

```bash
# 1. Operator still has internet.
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/

# 2. Proxy UID still has internet.
sudo -u pipelock-proxy curl -s -o /dev/null -w '%{http_code}\n' https://example.com/

# 3. Agent UID cannot dial direct.
sudo -u cc-agent curl -s -o /dev/null -w '%{http_code}\n' \
    --max-time 5 https://example.com/ 2>&1 \
    | grep -E '000|Connection refused|Network is unreachable'

# 4. Agent UID can reach the internet through the proxy.
sudo -u cc-agent curl -s -o /dev/null -w '%{http_code}\n' \
    -x http://127.0.0.1:8888 https://example.com/

# 5. The wrapper end-to-end.
cc-launch curl -s -o /dev/null -w '%{http_code}\n' https://example.com/
```

Probes 1 and 2 prove the operator and proxy paths still work. Probe 3 proves the boundary holds. Probe 4 proves the proxy path is the legitimate exit. Probe 5 proves the wrapper sets up the agent's egress correctly.

If any of these fail, the boundary is not real. Roll back, fix the offending step, try again. Half-installed containment is worse than no containment because the dashboard says "secure" and the kernel disagrees.

## Rollback

The boundary is reversible. The teardown:

1. Disable the system pipelock unit, re-enable the user-mode unit.
2. Delete the `nftables` table and remove the rule file.
3. Remove the wrappers and the sudoers carve-out.
4. Optionally remove the system users.

If the rollback procedure does not exist as a script, the install procedure is incomplete. Production systems get installed and uninstalled. Skipping rollback design is how operators end up afraid to touch the firewall later.

## Why a CLI is the natural endpoint

The procedure described above is fifteen pages long when written out as a runbook. It collapses to five commands when written as a CLI: `pipelock contain install / verify / rollback / add-tool / ca-refresh`. The runbook proves the model. The CLI makes the model deployable to more than one workstation.

`pipelock contain` is being scoped for a future release. Until it lands, the runbook is the documented procedure. Either way, the load-bearing piece is the three-UID separation. The wrappers, sudoers entries, CA bundle, and probes are operational glue around that core idea.

## What this post is and is not

This post is a description of a working pattern for one Linux workstation. It is the same shape as Kubernetes per-pod NetworkPolicy: the kernel below the agent is the boundary, and the agent's runtime choices do not reach the kernel.

This post is not a substitute for content scanning at the proxy. The boundary stops the agent from leaving without going through the proxy. The proxy is what catches credential leaks, prompt injection in responses, and tool-call abuse. Containment without scanning is a tunnel with no inspection. Scanning without containment is inspection that the agent can route around. Both layers exist for a reason.

If you are running agents on a Linux box and the only egress control is `HTTPS_PROXY`, this is the upgrade path. The kernel will agree with you for the first time.
