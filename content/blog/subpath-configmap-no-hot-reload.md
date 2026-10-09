---
title: "subPath ConfigMap Mounts Don't Hot-Reload: Silent Drift in Kubernetes"
linkTitle: "subPath ConfigMap Drift"
seoTitle: "subPath ConfigMap Mounts Skip Hot Reload"
date: 2026-05-07
author: "Josh Waldrep"
summary: "Mount a ConfigMap with subPath and kubelet stops propagating updates. Your service's hot-reload watches a frozen file. Documented behavior, easy to miss, real impact."
description: "subPath ConfigMap mounts in Kubernetes do not propagate updates to running pods. The mount is frozen at creation. What breaks and how to avoid it."
tags: ["kubernetes", "configmap", "ai-security", "pipelock", "operations"]
related: ["politeness-vs-enforcement-https-proxy", "three-uid-agent-containment-linux", "pipelock-v240-release"]
faq:
  - q: "Do ConfigMap updates propagate to pods?"
    a: "Yes, when the ConfigMap is mounted as a directory volume, subject to kubelet's sync period and cache behavior. No, when the ConfigMap is mounted with subPath to inject a single file at a specific path. The subPath mount is resolved at pod creation, and kubelet does not re-resolve it when the ConfigMap data changes. The file the running container sees stays frozen."
  - q: "Why does subPath skip hot-reload for ConfigMap mounts?"
    a: "subPath was added so that a single file from a multi-key ConfigMap or Secret could land at a specific filesystem path inside a container. The implementation mounts a bind to the source inode at pod start. Kubelet's atomic-update mechanism for directory-mounted ConfigMaps replaces the symlink target inside the volume; subPath bypasses that mechanism by mounting a different inode entirely. The upstream issue tracking this behavior is kubernetes/kubernetes #50345, open since 2017. The behavior is documented in the Kubernetes ConfigMap docs but does not appear in the volume reference where most operators look first."
  - q: "What's the workaround for hot-reload with ConfigMap files?"
    a: "Mount the entire ConfigMap as a directory volume rather than using subPath. If you need the file at a specific path that conflicts with other content, use a separate volume mount for the directory and have your service read the file from inside that directory. Or, for smaller services, use a sidecar that watches a directory mount and writes the consolidated file to an emptyDir that the main container reads. The structural fix is to avoid subPath whenever the file content is expected to change after pod start."
blog_cat: "kubernetes"
---

A Pipelock instance running in a Kubernetes cluster watched its config file for hours while four edits to the underlying ConfigMap landed in etcd. The dashboards showed updates. The pod showed an old config. The tests that exercised the new config kept failing for reasons that made no sense.

The problem is not Pipelock. The problem is `subPath`. Mount a ConfigMap key as a single file with `subPath`, and kubelet stops propagating updates to that mount. The behavior is documented but easy to miss, and it is the load-bearing reason any service that runs hot-reload in Kubernetes needs to think about how its config volume is mounted.

## The shape of the bug

A reasonable-looking ConfigMap mount in a Deployment spec:

```yaml
spec:
  containers:
    - name: pipelock
      volumeMounts:
        - name: config
          mountPath: /etc/pipelock/pipelock.yaml
          subPath: pipelock.yaml
  volumes:
    - name: config
      configMap:
        name: pipelock-config
```

The pod gets `/etc/pipelock/pipelock.yaml` populated from the `pipelock.yaml` key of the `pipelock-config` ConfigMap. Other files in `/etc/pipelock/` are unaffected. This is what `subPath` was designed for: pin one file to one path without taking over the whole directory.

The drift surfaces when you `kubectl edit configmap pipelock-config`, change the value, and watch the running pod for the change to propagate. It does not propagate. The running pod's view of `/etc/pipelock/pipelock.yaml` is the same content it had at pod creation. The kubelet has updated the underlying ConfigMap volume, but the bind mount that `subPath` created points at a different inode that is not part of the update path.

Restart the pod and the new content shows up. fsnotify watchers configured to react to file changes never fire because the file the container sees is, from the container's perspective, the same file it has always been.

## Why the directory mount works

Drop the `subPath` and mount the whole ConfigMap as a directory:

```yaml
spec:
  containers:
    - name: pipelock
      volumeMounts:
        - name: config
          mountPath: /etc/pipelock
  volumes:
    - name: config
      configMap:
        name: pipelock-config
```

Now `/etc/pipelock/` contains every key from the ConfigMap. Kubelet syncs the directory periodically, subject to its sync period and ConfigMap cache. The atomic-update mechanism Kubernetes uses for ConfigMap volumes replaces a symlink that points at the current "version" of the data. Watchers need to watch the mounted directory or reopen the file path after an update, because the inode under an old file descriptor can change. With that watch shape, the service hot-reloads correctly.

The cost is that `/etc/pipelock/` now belongs to the ConfigMap. If you had other files in that directory (a CA certificate from a different volume, a generated state file written by an init container), the directory mount overwrites them. You have to mount each piece into a directory of its own and let the service compose them at runtime.

## The kubelet propagation lifecycle

Kubelet runs a sync loop that watches the API server for ConfigMap and Secret updates. When an update lands, kubelet writes the new content to a versioned directory inside the volume's emptyDir on the node, then atomically swaps a symlink. The container, which had been reading through the symlink, now reads the new version. The whole swap is one syscall, so readers either see the old version or the new version, never a torn state.

`subPath` works by computing the source path at pod creation and creating a bind mount to that specific path. The bind mount captures the inode that backs the file at that moment. Kubelet's atomic swap operates on the symlink in the volume, not on the inode the bind mount points at. The bind survives the swap and continues to point at the original inode, which kubelet never updates.

There is no documented kubelet behavior that re-evaluates a `subPath` mount during a ConfigMap update. The upstream issue, [kubernetes/kubernetes#50345](https://github.com/kubernetes/kubernetes/issues/50345), has been open since 2017. The current state of the world is "subPath plus ConfigMap is static for running containers."

## Where this hurts

Anyone running a service that watches its config file for live updates. Pipelock has fsnotify-based hot-reload on its config (SIGHUP is also supported). Other services with the same shape:

- Envoy and most service-mesh proxies, which use file-based dynamic configuration discovery.
- Prometheus, which reloads scrape configs on file change.
- Nginx with the `auto_reload` patches.
- Any custom service that watches its config for runtime updates.

For all of these, `subPath` is a silent foot-gun. The service starts up, reads its config, watches the file, and never sees the file change because the file is a frozen bind mount.

The damage scales with how much you trust your config-update workflow. If you `kubectl apply` a new ConfigMap and assume the running pod picks it up, every minute between the apply and the next pod restart is a minute the cluster is running stale config. For a security tool, that gap means the new policy is not enforced, the new pattern does not match, the new allowlist is not honored. The dashboards say one thing. The reality is another.

This is the Kubernetes version of the same lesson in [Politeness vs Enforcement](/blog/politeness-vs-enforcement-https-proxy/): a dashboard that confirms the policy object changed is not the same thing as a kernel-enforced runtime boundary that changed.

## Two patterns that work

**Mount the directory, expose the file.** Mount the ConfigMap as a directory volume, and read the file by path from inside that directory. This is the simplest pattern for services that own their config directory. The cost is that the directory is now ConfigMap-shaped, so anything else that needs to live there has to come from a different mount point.

**Sidecar plus emptyDir.** A sidecar container mounts the ConfigMap as a directory, watches for updates, and writes the consolidated file to a shared emptyDir volume that the main container reads. This adds a moving piece, but it lets you compose multiple sources (ConfigMap, Secret, downward API, environment) into a single config file at a single path. The sidecar pattern is heavier than the direct mount but more flexible when the file's content is built from multiple inputs.

If you see `subPath:` and your service expects hot-reload, change the mount shape. The sidecar pattern is the fallback when a directory mount conflicts with other tenants of the target path.

## How to spot this in a fleet

A Helm chart or Kustomize overlay that mounts a ConfigMap with `subPath:` on a service that has a hot-reload code path is the warning. Two signals to look for in code review:

- A volume mount with `subPath:` and a target path that matches a config file the service is known to watch.
- The service's startup logs include "watching config file" or fsnotify-style messages.

If both are true, the hot-reload is broken. The service will read the initial value at startup and freeze.

The other signal is operational. If your platform has a story like "edit the ConfigMap, observe the pod pick up the new value," and that story sometimes does not work, `subPath` is the first thing to check. The behavior is consistent: `subPath` mounts always freeze, directory mounts always update. The trick is that the freeze is silent.

## Why this surfaced

A fleet of agent-firewall sidecars all mounted their Pipelock config with `subPath:`. Operators added new entries to the redaction allowlist over a span of two weeks. The ConfigMaps in etcd reflected the changes. The running Pipelock pods continued to apply the older allowlist that had been in effect when the pods started. The drift surfaced when a new test fixture failed against the live agent because Pipelock had not picked up the allowlist entry that had been added to the ConfigMap five days earlier.

`kubectl delete pod` fixed the symptom. Switching to a directory mount fixed the cause. The lesson generalizes: any service that hot-reloads needs a directory mount for its config, not a `subPath` mount. If your platform team has standardized on `subPath` for "single file" ConfigMap injection, audit which of those services have hot-reload code paths and migrate them.

The Kubernetes docs warn about this behavior in the [ConfigMap reference](https://kubernetes.io/docs/concepts/configuration/configmap/#mounted-configmaps-are-updated-automatically), but only in passing, and the `subPath` documentation does not link to the warning. The upstream issue is the canonical reference for the depth of the problem and the design discussion around fixing it. Until that discussion turns into a kubelet change, the workaround is structural: avoid `subPath` for hot-reload-bearing files.
