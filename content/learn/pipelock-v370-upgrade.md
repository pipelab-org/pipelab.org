---
title: "Pipelock v3.7 Upgrade Guide"
linkTitle: "Pipelock v3.7 Upgrade"
description: "Upgrade Pipelock v3.7 with complete-chain verification, filesystem containment grants, local MCP identities, and stricter request inspection."
date: 2026-10-13
learn_cat: operator
level: intermediate
---

Upgrade the binary before loading the new configuration fields. Then check receipt automation, reinstall containment, and test clients that depend on partial HTTP responses. The [v3.7 release notes](/blog/pipelock-v370-release/) describe the changes; the [source upgrade guide](https://github.com/luckyPipewrench/pipelock/blob/main/docs/guides/upgrading-to-3.7.md) holds the full compatibility contract.

## Prove the end of a receipt chain

A valid prefix doesn't prove the writer finished. Chain verification reports `VALID PREFIX, END UNPROVEN` and exits 3 when its end isn't proven. `--allow-prefix` accepts an intentional open-prefix check with exit 0, but keeps the label. Don't use it as a completeness check.

For a recorder directory, use `pipelock verify-receipt --chain ./recorder --whole-recorder` to check the transcript seal. A cleanly stopped recorder containing EvidenceReceipt v2 receipts can still exit 3 in receipt-chain mode because that chain has no end marker. Other verifiers can pin an independently retained expected head or sequence where supported. Signed group closes establish the end for [parallel receipt chains](/learn/parallel-receipt-chains/).

Clean reports use schema version 2 and expose end-proof status. Dispatch consumers by schema version. A recovery seal attests the torn predecessor bytes and successor opening; it preserves the damaged history's failure.

## Configure recording with its limits

`flight_recorder.receipt_chains` defaults to 1 and accepts 1 through 32. Changing it requires a restart. Reload retains the old count with a warning. Keep the complete directory and use a group-capable verifier when the count exceeds 1. Automatic multi-chain anchoring isn't supported. Changing a multi-chain signing key closes the group and requires supervised restart.

Required receipts make covered effects wait for every configured receipt family's durable record. With required receipts and multiple chains, a sync failure stops the group and process. Denials still have best-effort receipt emission. Review the [receipt content boundary](https://github.com/luckyPipewrench/pipelock/blob/main/docs/guides/receipt-verification.md#receipt-content-boundary): whole secrets remain scanned before signing, while fragment reassembly has a bounded search and process-proven generated IDs are excluded.

Native evidence streams have a 256 MiB verifier ceiling that the writer doesn't enforce. Keep each run below it using a schedule measured for your traffic. An over-ceiling multi-chain history refuses restart; single-chain restart leaves the old run unverifiable.

## Reinstall containment and restart agents

Run `sudo pipelock contain install` with the new binary, then restart existing agent services and sessions. A binary swap doesn't change their live mounts. `contain doctor` detects stale managed setup; `contain verify` checks the live boundary.

New installs set `containment.filesystem.mode: enforce`. Existing configs that omit it stay off. Enforce mode hides other homes and signing material, mounts unexpired workspace grants, and refuses launch unless its canary succeeds. The [containment guide](/learn/pipelock-contain-guide/) explains the remaining user-namespace, same-user process, socket, and operator-written-unit limits.

Linux sandbox socket isolation depends on Landlock support. On amd64 below ABI 9, the fallback denies Unix socket creation, datagram pairs and receive-message calls, so some multiprocessing and Node IPC fail. Strict ARM64 below ABI 9 refuses. Consult the [sandbox guide](https://github.com/luckyPipewrench/pipelock/blob/main/docs/guides/sandbox.md) before upgrading these workloads. Explicit child overrides for code-loading variables such as `PYTHONHOME`, `NODE_PATH`, and `CLASSPATH` now refuse.

## Check policy and clients

- The immutable core credential floor blocks in audit mode; ordinary audit policy still warns. HTTP bodies can forward a fully redacted core credential only to a configured request-body trusted host. MCP input retains its separate configured action.
- Typed JSON requires canonical keys. Malformed MCP JSON, invalid UTF-8, duplicates and noncanonical protocol keys refuse even under `on_parse_error: forward`.
- Forward, intercepted and reverse HTTP paths strip Range and cache-validator headers and refuse origin `206` and `304` responses as `response_incomplete`. Browser Shield exemptions don't relax this.
- JWT cookies follow header DLP policy and the core floor. Issuer-bound cookies observed through interception keep their scoped allowance.
- Paid live connections end on expiry, revocation or proven entitlement loss. Unrelated reloads preserve surviving security state.
- All presets cover supported credential-file writes, moves, copies and patch targets. Review tool access before updating a preset.
- Built-in credential audiences change the canonical policy hash. Upgrade Conductor and followers together before republishing policy.
- Generated request IDs use `req-<UUIDv7>`. Update parsers that assumed decimal counters.

Use [exact destination grants](/learn/destination-grants/) for a single host and port, [verified local MCP identities](/learn/verified-local-mcp-services/) for a changing local service, or [cooperative command launch](/learn/pipelock-exec/) to route a command through a running proxy. Verify the behavior you depend on before restoring unattended work.
