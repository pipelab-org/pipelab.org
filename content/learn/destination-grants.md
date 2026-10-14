---
title: "Exact Destination Grants in Pipelock"
linkTitle: "Exact Destination Grants"
description: "Authorize one TCP host and port with Pipelock destination grants while retaining content scanning, metadata protection, and fail-closed DNS checks."
date: 2026-10-13
learn_cat: operator
level: intermediate
---

`destination_grants` lets you authorize one TCP host and port for the ordinary proxy. Use it for a specific internal service instead of granting every port on a hostname. It's a free configuration control.

## Declare one destination

```yaml
destination_grants:
  - protocol: tcp
    host: preview.vendor.example
    port: 8443
```

Replace the example with a service you operate. Grants require an exact hostname or IP literal and one port. Wildcards, CIDRs, URLs and port ranges refuse; an omitted or empty list grants nothing.

A grant satisfies strict destination admission and permits ordinary private addresses for that exact destination. It doesn't grant sibling ports, subdomains, aliases or direct requests to a hostname's resolved IP. DNS is checked when scanning and again before dialing; newly returned private addresses require a new admitted scan unless another configured policy already allows them.

## Keep the inspection boundary

Domain blocklists, DLP, entropy, request and response scanning, kill switches and other applicable checks still run. Cloud metadata, link-local, multicast, unspecified addresses and the proxy's own metrics endpoint stay blocked.

Grants apply to fetch, forward HTTP, CONNECT and WebSocket destinations through the shared scanner and dialer. They don't create a raw TCP listener or add UDP support. CONNECT without TLS interception still carries encrypted application content, so the proxy can't inspect its HTTP bodies. Configured MCP upstreams retain their separate metadata-floor policy.

Fleet updates preserve local grants. Strict mode and required security contracts refuse expanded trust on reload; balanced and audit modes warn. Removing a grant prevents new admission but doesn't terminate established tunnels or WebSocket sessions.

Read the [exact destination contract](https://github.com/luckyPipewrench/pipelock/blob/main/docs/configuration.md#exact-destination-grants), [secure deployment guide](/learn/secure-ai-agent-deployment/), and [v3.7 upgrade actions](/learn/pipelock-v370-upgrade/) before applying a grant.
