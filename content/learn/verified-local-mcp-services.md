---
title: "Verify Local MCP Service Identity"
linkTitle: "Verified Local MCP Services"
description: "Verify local MCP services by kernel-observed owner and pinned program inputs, then bind reviewed credential-request acknowledgments to that identity."
date: 2026-10-13
learn_cat: mcp
level: intermediate
---

A loopback address identifies an endpoint. Any local process can claim a free port. Pipelock's `mcp_identities` registry checks the owner and pinned program inputs of a registered local service on each new connection, before sending data. These controls are free. The article [Localhost Is a Place, Not a Program](/blog/localhost-is-a-place-not-a-program/) explains the threat and the limits of the check.

## Inspect a service you trust

Start the intended MCP service. `pipelock mcp identity register` observes it and prints a configuration entry for review; it doesn't edit your config. The command accepts `--upstream`, `--name`, optional `--mapped-file` inputs and an optional session header carrier.

```bash
pipelock mcp identity register --upstream http://127.0.0.1:43111/rpc/v1 --name local-indexer
```

The endpoint is an example for a service you've started. Review the generated owner, executable digest, held files and control environment before copying the entry into `mcp_identities`. Interpreted applications need their loaded application inputs pinned too; an interpreter's executable digest alone isn't an application identity.

Then use `pipelock mcp identity inspect --config pipelock.yaml --upstream http://127.0.0.1:43111/rpc/v1` to check the live owner. Configure header carriers as the source reference describes, and set a declared carrier in the inspecting command's environment. An unset carrier refuses.

This requires Linux visibility, a unique socket holder and a direct connection. Ambiguous ownership or a pinned program input that no longer matches refuses. Restart a service that still holds a replaced file before registering the new program. Matching a server name alone isn't equivalent verification.

## Acknowledge one reviewed credential request

`mcp_tool_scanning.acknowledged_findings` can acknowledge an operator-reviewed credential-request finding. A deployment-held HMAC key binds the entry to the server, complete tool definition, detector revision and matches. It lifts only that finding; stale or mismatched entries refuse under every action.

Configure `acknowledgment_key` using the documented private-file or environment carrier before collecting a candidate entry. Review the tool, then add owner, reason and expiry to the logged binding. Don't write a literal key into YAML. Entries without a usable key refuse at load.

For a registered local service, the `verified-local-session` binding can survive its changing port and bearer token while retaining kernel verification. This doesn't disable other tool, input, response or taint checks.

Read the [registry and acknowledgment configuration](https://github.com/pipelab-org/pipelock/blob/main/docs/configuration.md#registered-local-mcp-services-mcp_identities) and the [MCP proxy guide](/learn/mcp-proxy/), then apply the [v3.7 upgrade checks](/learn/pipelock-v370-upgrade/).
