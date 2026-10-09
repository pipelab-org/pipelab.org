---
title: "SlowMist MCP Security: Pipelock Coverage"
linkTitle: "SlowMist Coverage"
subtitle: "An honest mapping of Pipelock against SlowMist's 19-item MCP security validation guide."
description: "Pipelock covers 10 of 19 SlowMist MCP security test cases fully, 8 partially, with 1 out of scope. Full item-by-item breakdown."
date: 2026-03-18
learn_cat: compliance
level: ref
tags:
  - slowmist
  - mcp
  - coverage
---

SlowMist published an [MCP Security Validation Guide](https://github.com/slowmist/openclaw-security-practice-guide/blob/main/docs/Validation-Guide-en.md) with 19 test cases covering the attack surface AI agents face when using MCP tools. This page maps SlowMist's MCP security test cases to Pipelock's coverage.

Pipelock is a network-layer agent firewall. Some items map directly, some are partial, and one is architecturally out of scope. This page breaks down all 19.

**Summary: 10 full, 8 partial, 1 out of scope.**

## Full Coverage (10 of 19)

These items are fully addressed by Pipelock's scanner pipeline, tool policy engine, or chain detection.

### 1. Supply Chain Poisoning

Tool policy includes a "Package Install" rule that blocks unauthorized package installation commands. MCP tool scanning detects poisoned tool descriptions that embed hidden instructions.

### 3. Obfuscated Payload Execution

Tool policy catches encoded command execution with shell evasion normalization. Pipelock decodes octal, hex, brace expansion, command substitution, and variable assignment before matching, so `$(printf rm)` resolves to `rm` before the rule evaluates it.

### 5. Tool Argument Spoofing

Same normalization engine. Command substitution, brace expansion, and IFS manipulation are all resolved before policy evaluation. The agent can't sneak a destructive command through encoding tricks.

### 6. Destructive Operations

Three dedicated tool policy rules: "Destructive File Delete," "Disk Wipe Command," and "Destructive Git Operation." All hard block by default.

### 8. Data Exfiltration

Pipelock's core capability. The DLP engine runs pattern matching, entropy analysis, and environment variable leak detection across all traffic. Supports base64, hex, and base32 decoding before matching. Domain blocklist, SSRF protection, and body DLP cover fetch, forward proxy, WebSocket, and MCP transports. TLS interception is available for CONNECT tunnel visibility but is opt-in and disabled by default.

### 9. Cron/Systemd Persistence

Tool policy rules for "Cron Job Persistence," "Systemd Service Persistence," and "Persistence Path Write." Chain detection includes `write-persist` and `persist-callback` sequences that catch multi-step persistence attacks.

### 10. Detached Process Spawning

Tool policy catches `nohup`, `disown`, `setsid`, `screen -d`, and `tmux -d`. These are common techniques for launching background processes that survive the agent session.

### 11. Alias/PATH Hijacking

Tool policy "Shell Profile Modification" and "Shell Profile Write via Command" rules. Catches writes to `.bashrc`, `.zshrc`, `.profile`, alias definitions, and `/etc/profile`.

### 12. Block Device Destruction

Tool policy "Disk Wipe Command" blocks `dd if=...of=/dev/`, `mkfs.`, and `fdisk`. Overlaps with item 6 but specifically targets block device operations.

### 14. Plaintext Secret Leakage

DLP engine matches API keys, private keys, tokens, seed phrases, and other credential patterns. Environment variable leak detection catches secrets loaded from the runtime environment. All encoding variants are decoded before matching.

## Partial Coverage (8 of 19)

These items have real coverage but don't fully solve the threat at every layer.

### 2. Roleplay Jailbreak

Pipelock's response scanning detects prompt injection in tool results, which catches many jailbreak payloads. But it doesn't monitor persona overrides or system prompt integrity directly. If a jailbreak succeeds and the agent tries to exfiltrate data or run destructive commands, Pipelock blocks those actions. It catches the effects, not the jailbreak itself.

**Why partial:** Jailbreak detection requires inference-layer analysis of the model's reasoning process. Tools like LlamaFirewall's AlignmentCheck address this by auditing the chain of thought. Pipelock complements them at the network boundary.

### 4. Context Stuffing / Window Overflow

Rate limiting, data budget controls, and URL length limits constrain the size of payloads an agent can process. Response scanning on tool results catches injection attempts within returned content. But Pipelock has no concept of "context window fullness" since it operates at the network layer, not the inference layer.

**Why partial:** Context window management is an agent-side concern. A network proxy sees request and response payloads but doesn't know how full the model's context window is.

### 7. Unauthorized Config Access

Tool policy's "Credential File Access" rule blocks reads of `.ssh/id_*`, `.aws/credentials`, `.env`, `/etc/shadow`, `.netrc`, and other common sensitive paths. This covers the general credential-read threat through runtime path blocking at the MCP layer.

**Why partial:** SlowMist's test case is about host-level permission boundaries, not just path pattern matching. Pipelock blocks a bounded set of known credential paths but doesn't enforce OS-level file permissions or protect arbitrary application config files outside its rule set. Operators can add custom rules for additional paths, but the defaults don't cover every platform-specific config location.

### 13. High-Risk Blockchain Transfer

Pipelock has three subsystems relevant to crypto security. The seed phrase detector catches BIP-39 mnemonic phrases with checksum validation, preventing wallet recovery phrase exfiltration. The address protection engine detects crypto address poisoning by comparing addresses against a user-supplied allowlist, catching address swaps before funds go to the wrong place. DLP patterns catch private keys (WIF, xprv, ETH) across all transports.

**Why partial:** Pipelock prevents key exfiltration and address substitution, which blocks two common paths to unauthorized transfers. But it doesn't do on-chain transaction risk scoring or AML compliance checks. If the agent has legitimate access to signing infrastructure and uses a valid destination, Pipelock won't flag the transfer itself.

### 15. Signature Isolation

DLP detects Bitcoin WIF private keys, extended private keys (xprv/yprv/zprv/tprv), Ethereum private keys, and BIP-39 seed phrases across mediated transport surfaces; in strict mode or on the core-secret floor it blocks their exfiltration. MCP tool scanning flags poisoned tool descriptions that attempt to read or steal private key material.

**Why partial:** Pipelock prevents key theft, which is a prerequisite for unauthorized signing. But it cannot enforce external signer architecture or ensure that the agent only produces unsigned transaction payloads. Signature isolation is an application-layer design pattern that requires the wallet itself to separate signing from transaction construction.

### 16. Immutable Script Protection

Pipelock's file integrity monitoring system generates SHA-256 manifests of directory contents and detects unauthorized modifications, additions, deletions, and permission changes. If an agent tampers with scripts in a monitored workspace, the integrity check catches it. Tool policy rules also block writes to critical paths that could modify scripts indirectly (shell profiles, cron entries, systemd units).

**Why partial:** This is detection, not prevention. Kernel-level immutability (`chattr +i`) prevents writes entirely at the OS layer. Pipelock detects that a modification happened and can alert on it, but the file change itself occurs before detection. For full protection, combine integrity monitoring with host-level file immutability.

### 17. Covering Tracks (Log Tampering)

Tool policy's "Audit Log Tampering" rule blocks `rm`/`truncate`/`shred` on log files (`/var/log/`, `*.log`, `*.audit`, `*.jsonl`), `history -c`, and `unset HISTFILE`. These cover standard log destruction and shell history clearing techniques.

**Why partial:** The rule set protects common log paths but doesn't implement WORM semantics or protect arbitrary audit files outside the known patterns. Edit-in-place tampering of non-standard log locations isn't caught by default. MCP policy blocks are enforced but not all are emitted as structured audit events, so some blocked attempts may not appear in the audit trail.

### 18. Yellow Line Logging

Pipelock has structured JSON audit logs with severity levels and event categorization. Webhook and syslog emission are built in. Prometheus metrics provide real-time observability. Allowed HTTP traffic is logged with method, URL, status, size, and duration. Reports provide post-session summaries.

**Why partial:** SlowMist's yellow line case expects durable per-command logging of time, command, reason, and result. Pipelock logs blocked and flagged events with full detail, but clean MCP tool calls that pass all scanning are forwarded without a structured audit event. That means the audit trail is complete for violations but not for every allowed action.

## Out of Scope (1 of 19)

### 19. Disaster Recovery / Telemetry

Platform-specific nightly backups and cloud sync for agent state recovery. This is an infrastructure concern that depends on the deployment environment and the agent platform being used.

## What This Means

No single tool covers all 19 items. The SlowMist checklist spans network, inference, host, and application layers. Pipelock covers the network layer, which is where data exfiltration, unauthorized access, and persistence attacks happen.

For the 8 partial items, the gaps are architectural: jailbreak and context stuffing need inference-layer tools, blockchain and signing need on-chain monitoring, config access and script protection need host-level enforcement, and full audit coverage requires logging every allowed action (not just violations). Pipelock catches the downstream effects at the network boundary, and combining it with host and inference-layer tools closes the remaining gaps.

<div class="hero-buttons" style="margin-top: 2rem;">
  <a href="/pipelock/" class="btn btn-primary" data-event="pipelock_click" data-event-placement="guide-body">Get Pipelock</a>
  <a href="/learn/mcp-security/" class="btn btn-ghost">MCP Security Guide</a>
</div>
