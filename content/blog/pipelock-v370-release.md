---
title: "Pipelock v3.7: Parallel Receipts and Filesystem Grants"
linkTitle: "Pipelock v3.7: Receipts and Containment"
date: 2026-10-14
author: "Josh Waldrep"
blog_cat: releases
summary: "Parallel signed receipt chains, filesystem grants, verified local MCP services, and an explicit proof that a receipt chain ended."
description: "Pipelock v3.7 adds parallel signed receipts, filesystem grants, local MCP identity checks, exact destination grants, and stricter chain verification."
canonical_url: "https://pipelab.org/blog/pipelock-v370-release/"
tags: ["pipelock", "receipts", "containment", "mcp-security"]
---

A signed receipt chain can be intact without proving the writer finished. Pipelock v3.7 makes that distinction visible: an open chain reports `VALID PREFIX, END UNPROVEN` and exits 3. The release also adds parallel signed receipt chains, filesystem grants for Linux containment, and checks that a local MCP endpoint belongs to the program you registered.

The [upgrade guide](/learn/pipelock-v370-upgrade/) covers the operator actions. Read why [a valid receipt chain can still be cut short](/blog/a-valid-receipt-chain-can-still-be-cut-short/) and why [localhost doesn't identify a program](/blog/localhost-is-a-place-not-a-program/) for the reasoning behind those checks. The [full changelog](https://github.com/luckyPipewrench/pipelock/blob/v3.7.0/CHANGELOG.md) holds the compatibility details.

## Parallel recording with a complete-group check

`flight_recorder.receipt_chains` accepts 1 through 32 and defaults to 1. Requests stay on one chain for their decisions, outcomes and evidence. Signed group openings, closes and successor transitions bind the shards together. Preserve the complete directory: one valid shard doesn't prove a complete group.

The published TypeScript and Rust verifiers at 0.6.5 check whole groups. Python `pipelock-verify` 0.4.1 verifies individual shards and chains with their signed group binding, but doesn't verify the group. Changing the chain count requires restart. Multi-chain automatic anchoring isn't supported, and a signing-key change closes the group for supervised restart.

Required receipts make covered effects wait for every configured receipt family's durable record. With required receipts and multiple chains, one sync failure stops the whole group and process. Denials keep best-effort receipt emission. Signed recovery seals attest a discontinuity; they preserve damaged history as damaged.

Recording has limits worth reading before raising throughput. Receipt content scanning checks whole secrets before signing, uses a bounded fragment search, and excludes process-proven generated IDs. Native AEL streams have a 256 MiB verifier ceiling the writer doesn't enforce. Measure your own traffic and restart before a run reaches it. Closing the receipt group at shutdown also takes time, so managed units, the Helm chart, generated output and the examples now give a recording proxy 10 minutes to stop. A run killed before its close finishes verifies as `GROUP_INCOMPLETE`. The [parallel-chain guide](/learn/parallel-receipt-chains/) explains these boundaries and the complete-group verification path.

## Filesystem grants and socket isolation

With `containment.filesystem.mode: enforce`, managed Linux launches hide other homes and signing material and mount unexpired workspace grants with their declared access. A failed launch canary refuses the session. New installs select enforce mode; existing configurations that omit it stay off.

Managed launches also hide host runtime socket directories and verify their live mount evidence. Reinstall containment with the new binary and restart running agents to adopt the changes. User-namespace remounts, same-user `/proc`, socket access and operator-written units retain documented limits. The [containment walkthrough](/learn/pipelock-contain-guide/) covers setup and verification.

`pipelock exec` offers a simpler path for [cooperative commands](/learn/pipelock-exec/): check a running proxy, then launch with shared proxy and CA settings. Commands can ignore those settings. Use containment or sandboxing for operating-system enforcement.

## Verify local MCP services and narrow policy grants

The `mcp_identities` registry and `pipelock mcp identity` commands verify a local service's owner and pinned program inputs before data is sent on each new connection. This requires Linux visibility, a unique socket holder and a direct connection.

Expiring credential-request acknowledgments bind a reviewed finding to the complete tool definition, server, detector revision and matches using a deployment-held HMAC key. A verified local session can retain that binding across changing ports and bearer tokens. Other inspection remains active. Start with the [local MCP identity guide](/learn/verified-local-mcp-services/).

[Exact destination grants](/learn/destination-grants/) authorize one TCP host and port while keeping content scanning and protected-address checks. Grants remain local fleet policy. They don't add raw TCP proxying or UDP support, and CONNECT without interception still carries encrypted application content.

## Browser, protocol and operator changes

Browser Shield and media policy follow the browser-visible effective content type. Origin-issued links, query values and object IDs get scoped entropy relief only within the issuing origin and session; other checks still run. Forward, intercepted and reverse HTTP proxies strip Range and cache-validator headers and refuse incomplete `206` and `304` responses.

MCP preserves successful protocol negotiation, clean eligible upstream refusals and empty successful acknowledgments. Typed JSON rejects noncanonical keys; malformed MCP JSON, invalid UTF-8 and duplicate keys refuse even when parse-error forwarding is configured. Audit mode still blocks the immutable core credential floor. Generated request IDs now use UUIDv7.

`emit.correlation_header` can put a bounded, DLP-clean header into emitted events on HTTP-capable transports. It doesn't enter receipts or local audit logs. TLS interception adds per-request status, size and timing under `intercept_http`, honoring `logging.include_allowed`.

The new scanner, launch and receipt controls described here are free. Named profiles, the operator dashboard and Conductor retain their existing license boundaries. See the [capability inventory](/capabilities/) for the operator entry points and tier of each surface.

Read the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/), then [install Pipelock](/install/) and verify the path your agents use.
