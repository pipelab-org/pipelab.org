---
title: "Per-Pod NetworkPolicy in Practice: Migrating Five Agents in a Day"
linkTitle: "Per-Pod NetworkPolicy Field Report"
seoTitle: "Per-Pod NetworkPolicy Migration Field Report"
date: 2026-05-15
author: "Josh Waldrep"
summary: "A field report on moving five Kubernetes-deployed AI agents from in-pod sidecars to companion-pod separation. The non-glamorous lessons that burned cycles."
description: "A per-pod NetworkPolicy migration for AI agents: ConfigMap drift, init container egress, identity binding, and VPN sidecars."
tags: ["kubernetes", "ai-security", "agent-firewall", "pipelock", "networkpolicy", "operations"]
related: ["three-uid-agent-containment-linux", "subpath-configmap-no-hot-reload", "three-things-https-proxy-cannot-stop"]
faq:
  - q: "Why move from an in-pod sidecar to a separate pod for the agent firewall?"
    a: "NetworkPolicy is a per-pod control. Every container in the same pod shares one network namespace. A NetworkPolicy that says 'no internet for this pod' applies to every container, including the firewall sidecar that needs internet by definition. Splitting the firewall into its own pod gives each pod a separate NetworkPolicy: the agent pod has no internet except to the firewall service, the firewall pod has the internet it needs to do its job. The agent cannot bypass the firewall because the kernel has no route from the agent pod to anywhere else."
  - q: "What gotchas burn time during a per-pod migration?"
    a: "ConfigMap subPath mounts that don't propagate updates, init containers that fetch binaries before the lockdown lands, identity binding when multiple agents share a namespace but need distinct identities, projected secret volume modes that Pipelock refuses, and VPN sidecar flake during initial bring-up. Each is documented and fixable, but each takes thirty minutes to an hour the first time it surfaces. Building a checklist from the first agent's migration cuts the next few to a fraction of the time."
  - q: "Should the agent firewall pod include a VPN sidecar?"
    a: "Generally no. A VPN sidecar adds a moving piece whose job is exit-IP rotation, not security scanning. The agent firewall's job is content scanning, and the cluster's normal egress is fine for that. Existing deployments that already had a VPN for legacy reasons can keep it during migration. New companion deployments do not need it unless exit-IP rotation is a hard requirement."
blog_cat: "kubernetes"
---

A working cluster ran five AI agents, each with an in-pod Pipelock sidecar scanning their traffic. The boundary was real but advisory: every container in a pod shares a network namespace, so a NetworkPolicy that says "no internet for this pod" applies to the sidecar too. Tightening the agent's egress required loosening the sidecar's egress, which defeats the point.

This post is a field report on migrating those agents from in-pod sidecars to a separate-pod model where the firewall lives in its own pod with its own NetworkPolicy, and the agent pod has no route to anywhere except the firewall. The migration took about a working day and surfaced six gotchas worth writing down.

## The structural reason for separation

NetworkPolicy is per-pod. The Kubernetes networking spec does not allow a NetworkPolicy to scope to a specific container in a pod, because the policy is enforced by the CNI plugin which sees pods as the unit of identity. Three containers in one pod are one Kubernetes "you" from the CNI's perspective.

This means an in-pod sidecar architecture has a contradiction baked in: the agent container should have no internet, and the sidecar container needs internet because the sidecar is the agent's exit. Both are in the same pod. NetworkPolicy applies to both equally. You either let the whole pod out or block the whole pod, including the sidecar.

In practice, this gets papered over with `HTTPS_PROXY` configuration on the agent container and a wide-open NetworkPolicy on the pod. The sidecar can scan everything the agent sends through the proxy. The agent can clear `HTTPS_PROXY` in a subprocess and dial direct, and the kernel will let it through because the pod's NetworkPolicy says yes to internet.

The fix is structural. Move the firewall to its own pod. Tighten the agent pod's NetworkPolicy to allow egress only to the firewall pod's service. Now the agent pod has no internet route except through the firewall, the firewall pod has the internet it needs, and NetworkPolicy enforces both shapes correctly. This is the per-pod model.

## The five agents and the migration sequence

The fleet had five distinct agent deployments. Each had been running with an in-pod sidecar for months. The migration sequence:

- One agent first, fully end-to-end, including the bypass-closure verification probes from the [three-UID containment](/blog/three-uid-agent-containment-linux/) playbook adapted to Kubernetes.
- Three agents in parallel, applying the same pattern.
- The fifth agent last, because it had a workload-specific quirk (anti-bot scraping, see below) that needed its own treatment.

Per agent, the steps were:

- Generate a `pipelock-companion` Deployment + Service in the same namespace.
- Generate a scoped `pipelock-companion-egress` NetworkPolicy permitting TCP 443/80 only for that pod selector.
- Update the agent Deployment to drop the in-pod Pipelock sidecar.
- Update the agent's environment to point `HTTPS_PROXY` at the companion service.
- Tighten the baseline NetworkPolicy on the agent pod to remove the wide internet-egress rules and keep only the egress to the companion service.
- Ship the change through the normal manifest pipeline.
- Run the bypass-closure probes: raw TCP dial, env-clear subprocess, NO_PROXY domain match.

The first agent took four hours including two false starts on init container egress. The fourth agent took less than an hour. The pattern of "first one is a slog, the rest fall in line" held.

## Gotcha 1: subPath ConfigMap mounts don't hot-reload

The single biggest unexpected friction during the migration. Pipelock has fsnotify hot-reload on its config file. Kubernetes ConfigMap updates are supposed to propagate to mounted files. They do, for directory mounts. They do not, for `subPath:` single-file mounts. The mount path stays pointing at an immutable file-handle from pod creation.

A handful of namespaces had their Pipelock config mounted with `subPath:`. Multiple commits added redaction allowlist entries that landed in the cluster ConfigMap object but never reached the running Pipelock instance. The fix was a `kubectl delete pod` to force a fresh mount.

The structural fix is to mount the ConfigMap as a directory whenever possible. The detailed writeup is in [subPath ConfigMap Mounts Don't Hot-Reload](/blog/subpath-configmap-no-hot-reload/). For this migration, the workaround was "always restart the pod after changing Pipelock config" until the mount shape gets fixed.

## Gotcha 2: init containers that fetch from the internet

Several agent deployments had init containers that fetched the Pipelock binary before the main container started. The pattern:

```yaml
initContainers:
  - name: install-pipelock
    image: alpine
    command: ["sh", "-c"]
    args:
      - |
        wget -O /opt/bin/pipelock https://github.com/pipelab-org/pipelock/releases/...
        chmod +x /opt/bin/pipelock
```

This worked fine when the pod's NetworkPolicy allowed wide-open egress. After the lockdown, the init container's wget was the first thing to fail, because the pod's NetworkPolicy now denied direct internet.

The fix was to make the init container copy the binary from the same image used by the companion pod. Zero network needed.

```yaml
initContainers:
  - name: install-pipelock
    image: pipelock:VERSION
    command: ["sh", "-c"]
    args: ["cp /usr/local/bin/pipelock /opt/bin/pipelock && chmod +x /opt/bin/pipelock"]
```

The image is the same image the companion pod runs, so the binary is byte-for-byte identical to the running companion. That becomes the canonical pattern across agent pods.

## Gotcha 3: browser automation that can't tolerate TLS interception

One of the agents had a browser-driver container for workloads that fail under MITM. The browser stack did its own TLS handling and broke under interception. Pipelock could be configured with `passthrough_domains` to skip MITM for those targets, but the browser's egress also needed direct internet, not loopback to a proxy.

The structural fix mirrored the firewall split: the scraping tool moved into its own Deployment, with its own egress NetworkPolicy permitting TCP 443/80 directly. The agent's NetworkPolicy got an additional allow rule for traffic to the scraping service. The agent calls the scraper through the cluster service, the scraper reaches the internet directly for its scraping work, and Pipelock no longer sits in the path for that traffic.

This is an architectural compromise the per-pod model accepts: tools that fundamentally cannot work behind MITM get their own pod with their own egress. Pipelock loses visibility into the scraping traffic, but the URLs the agent passes to the scraper go through Pipelock's MCP-stdio scanner, so the calling-side surface is still covered.

## Gotcha 4: identity binding with shared namespaces

Two of the agents lived in the same namespace and shared PVCs and ConfigMaps but bound different identities to their Pipelock companion. A single companion deployment cannot bind two identities; the companion config has one `default_agent_identity` field.

Two options: deploy two companions, one per agent, or use the Pro `agents.*.source_cidrs` feature to match against pod IPs.

The migration chose two companions. The cost is roughly one extra pod's worth of memory (~50 MiB per companion). The benefit is that every agent identity maps to one companion deployment, which keeps the namespace's manifest set fleet-consistent. The Pro source_cidrs feature would be more elegant but is more complex to dogfood-validate and has not been the test path.

For a single-tenant namespace, one companion is enough. For a shared namespace where each tenant binds a distinct identity, the per-tenant companion is cleaner.

## Gotcha 5: projected secret volume modes

The Pipelock companion runs as an unprivileged UID. The TLS-MITM CA is delivered via a Kubernetes Secret mounted into the companion pod. The first version of the manifest set the volume mode to `0444` (world-readable), thinking that would let the companion read the file regardless of UID.

Pipelock refused to start. Its validator (in `internal/config/validate.go`) rejects CA key files whose mode permits world-read, any-write, or any-execute, by masking against `0o137`. That allows `0o600` (owner-read) and `0o640` (owner-read plus group-read), and rejects `0o444` and `0o644`.

Two patterns work:

- **`0o600` plus matching owner.** Set the pod's `runAsUser` (or `runAsNonRoot` plus an explicit `runAsUser`) to a UID that matches the file's owner. Kubernetes Secret volumes default the file owner to root unless `securityContext.runAsUser` is set on the pod, so this path needs that field plus a matching `runAsUser` for the Pipelock container.
- **`0o640` plus `fsGroup`.** Set the volume's `defaultMode` to `0o440` or `0o640`, and set the pod's `securityContext.fsGroup`. Kubernetes chowns the secret files to the fsGroup and adds the fsGroup to the container's supplementary groups. The container reads the file through the group bits, no matter what UID it runs as.

The companion deployment uses the `fsGroup` pattern because it composes cleanly with `runAsNonRoot: true` and arbitrary container UIDs. The narrow trap is `0o400` plus `fsGroup`: the file mode has no group-read bit, so the supplementary group does not grant access — the only reader would be the file owner, and Secret volumes do not put the container UID there by default.

This pattern is consistent across Pipelock companion deployments now, but the first time it surfaces is a confusing thirty minutes of debugging "why does my secret mount fail to be readable by the only container that should read it."

## Gotcha 6: VPN sidecar flake during companion bring-up

One namespace's existing in-pod sidecar setup had been running a VPN sidecar for months without incident. The first time the new companion pod came up with a fresh VPN sidecar, the tunnel cycled for several minutes before stabilizing. Same image, same provider, same config. The difference was server selection, evidently a flaky one.

The lesson: do not put VPN on the companion pod when the agent does not strictly need exit-IP rotation. The agent firewall's job is content scanning. The cluster's normal egress is fine for that. The companion pods do not need a VPN.

The legacy VPN stays for one specific deployment that has other sidecars depending on it. New companion pods are VPN-free. This shaved another moving part out of the operational footprint.

## What the day produced

End of day, the cluster had:

- Five companion pods running, one per agent identity.
- Five baseline NetworkPolicies tightened to remove direct internet-egress rules.
- Five agent deployments with the in-pod Pipelock sidecar removed.
- Two scraping deployments split out so the agent's NetworkPolicy could stay tight.
- A small set of manifest commits, each with a clear rollback path.
- A bypass-closure probe set verified on the first agent, partially run on the other four (full sweep is a v2.4.x followup).

The structural model is now consistent across the fleet: agent pod has no internet, companion pod has internet, NetworkPolicy enforces the separation, and the agent's runtime choices do not reach the kernel.

## What I would do differently next time

Three changes for the next migration like this:

- **Audit ConfigMap mount shapes before starting.** Every `subPath:` on a hot-reload-bearing config file is a future "why is the change not propagating" debugging session. Switch them to directory mounts up front.
- **Pre-build the migration commits per agent.** The pattern of "drop sidecars, add companion, tighten NetworkPolicy" is the same across all agents. The first agent is bespoke; the rest can be templated. A small Kustomize generator would have saved time on agents 2-5.
- **Run the full bypass-closure probe set on every agent.** Doing it on agent 1 and skipping it on agents 2-5 because "the pattern is the same" is the kind of confidence that bites you. The probes catch one-off regressions that the boilerplate cannot. v2.4.x followup is to make the probe set a CI-runnable artifact so every namespace has one.

The non-glamorous lessons compound. Most of the friction in this migration was operational, not architectural. The architectural model (per-pod separation) is correct and stable. The operational details (mount shapes, init container egress, secret modes, identity binding) are what consumed the day.

If your fleet runs in-pod agent firewall sidecars, the per-pod migration is worth the day. The structural change closes a class of bypass that no amount of `HTTPS_PROXY` tightening can close.
