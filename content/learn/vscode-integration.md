---
title: "VS Code MCP Security: Scanning with Pipelock"
linkTitle: "VS Code MCP Security"
subtitle: "One command to scan all MCP tool calls before they execute."
description: "VS Code MCP security guide. Install Pipelock to scan MCP server traffic for credential leaks, prompt injection, and tool poisoning before execution."
date: 2026-03-17
lastmod: 2026-05-05
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI with go install or Homebrew so the VS Code integration commands are available.
  - name: Wrap the MCP servers
    text: Run pipelock vscode install to rewrite your MCP configuration through pipelock mcp proxy.
  - name: Restart VS Code
    text: Restart VS Code so the rewritten MCP configuration is loaded.
  - name: Verify the install
    text: Run pipelock verify-install to confirm the MCP proxy path is active.
faq:
  - q: "What does Pipelock's VS Code integration do?"
    a: "Pipelock rewrites your .vscode/mcp.json to route all MCP servers through its scanning proxy. Tool arguments are scanned for credential leaks (65 DLP patterns), tool responses are scanned for prompt injection, and tool descriptions are checked for poisoned instructions. All traffic is scanned bidirectionally before it reaches or leaves the MCP server."
  - q: "How do I install Pipelock for VS Code?"
    a: "Run 'pipelock vscode install' after installing the pipelock binary via Go (go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest) or Homebrew (brew install luckyPipewrench/tap/pipelock). The command rewrites .vscode/mcp.json to wrap each MCP server through pipelock's proxy. Restart VS Code to activate."
  - q: "How is VS Code integration different from Claude Code or Cursor?"
    a: "Claude Code and Cursor have hooks systems that intercept actions before they execute. VS Code does not have hooks, so Pipelock wraps MCP servers through its MCP proxy instead. The result is the same: all MCP traffic is scanned bidirectionally. VS Code integration covers MCP tool calls; use HTTPS_PROXY for HTTP traffic scanning."
  - q: "Does Pipelock redact secrets in VS Code MCP tool arguments?"
    a: "Yes, in Pipelock v2.3.0 and later. With the `redaction` section enabled in the pipelock config, matched secrets inside `tools/call` `params.arguments` are rewritten in place with typed placeholders such as `<pl:aws-access-key:1>` before forwarding to the MCP server. Redaction runs on Pipelock's MCP proxy transports: `mcp_stdio`, `mcp_http_upstream`, `mcp_http_listener`, and `mcp_ws`. Request-side only in v1, so tool responses are not rewritten and the redactor blocks fail-closed on parse errors."
learn_cat: ide
level: intro
tags:
  - vscode
  - mcp
  - setup
---
VS Code MCP security is essential now that the editor supports MCP servers giving AI agents access to tools, databases, and external services. When an MCP server is compromised or an agent gets tricked by prompt injection, those tool calls can exfiltrate credentials, execute dangerous commands, or poison future interactions.

Pipelock wraps your VS Code MCP servers through a scanning proxy. Every tool call and response passes through the scanning pipeline before it reaches the MCP server or returns to the agent.

## What's new in recent releases

VS Code integration is pure MCP proxy wrapping, which unlocks the current signed-evidence surface when receipt signing is configured:

- **Mediator-signed action receipts for MCP decisions (v2.2.0).** With `flight_recorder.signing_key_path` set in the pipelock config, each proxied MCP decision emits a chained Ed25519 receipt on the `mcp_stdio` transport for stdio-wrapped servers, and on `mcp_http_upstream` / `mcp_http_listener` for HTTP-backed servers.
- **RFC 9421 mediation envelope signing (v2.2.0).** HTTP/SSE servers get an Ed25519 `Pipelock-Mediation` header on every proxied request, with a canonical policy hash that downstream services can verify before trusting.
- **Cross-implementation conformance (v2.2.0).** Receipts verify byte-for-byte against the published [Python verifier](https://github.com/luckyPipewrench/pipelock-verify-python). The format is open.
- **Posture verify CI gate (v2.2.0).** `pipelock posture verify` gates deploys with distinct exit codes: `0` pass, `1` could not complete, `2` verified but failed.
- **Class-preserving redaction on `tools/call` arguments (v2.3.0).** With the `redaction` section enabled in the pipelock config, matched secrets in `params.arguments` get rewritten in place with typed placeholders like `<pl:aws-access-key:1>` before forwarding to the MCP server. Runs on Pipelock's MCP proxy transports: `mcp_stdio`, `mcp_http_upstream`, `mcp_http_listener`, and `mcp_ws`. Irreversible. Fail-closed on parse errors. Tool responses are not redacted in v1.

See the [action receipt spec](/learn/action-receipt-spec/) for the receipt format and the [AI agent data redaction guide](/learn/ai-agent-data-redaction/) for redaction rollout.

## Install

Install the binary:

{{< install-block "go,homebrew" >}}

Wrap your MCP servers:

```bash
pipelock vscode install
```

Restart VS Code. That's it.

The command rewrites `.vscode/mcp.json` in your project directory. Each MCP server's command gets wrapped through `pipelock mcp proxy`. A `.bak` backup is created before any changes. Already-wrapped servers are skipped (idempotent).

## How it works

Unlike Claude Code and Cursor, VS Code doesn't have a hooks system. Instead, Pipelock rewrites MCP server configs so traffic routes through its proxy.

**Before:**

```json
{
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

**After:**

```json
{
  "servers": {
    "my-server": {
      "command": "pipelock",
      "args": ["mcp", "proxy", "--", "npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

HTTP/SSE servers are automatically converted to stdio wrapping with `--upstream`. Non-server fields like `inputs` and `sandbox` are preserved.

## What it scans

**Tool arguments (outbound).** Scans tool call arguments for credential leaks (65 DLP patterns), prompt injection patterns, and dangerous operations. Catches secrets in any JSON field, including nested objects and arrays.

**Tool responses (inbound).** Scans tool results for prompt injection before they reach the agent. A 6-pass normalization pipeline catches zero-width character evasion, homoglyph substitution, leetspeak encoding, and base64-wrapped payloads.

**Tool descriptions.** Checks `tools/list` responses for poisoned instructions hidden in tool descriptions. Detects mid-session description changes (rug-pull attacks).

Tool policy (allow / deny / redirect rules with shell-obfuscation detection) and session binding (per-session tool-inventory pinning) also run on every wrapped server. Chain detection runs across tool-call sequences within the session. See the [MCP proxy guide](/learn/mcp-proxy/) for the full layer map.

## Proof: a real signed block receipt

A real receipt from a blocked prompt-injection response, captured by the `examples/tool-response-injection/demo.py` harness in the Pipelock repo:

```json
{
  "v": 1, "seq": 1,
  "ts": "2026-04-10T14:54:42.323260257Z",
  "session_id": "proxy",
  "type": "action_receipt",
  "transport": "mcp_stdio",
  "summary": "receipt: block unclassified mcp_stdio",
  "detail": {
    "action_record": {
      "verdict": "block",
      "transport": "mcp_stdio",
      "layer": "mcp_response_scan",
      "pattern": "Prompt Injection",
      "policy_hash": "b28d3f9f54e2f6420b2d69989868c9ee08afac69c39ebd70ab555c01ea72a3cf",
      "chain_prev_hash": "23f7168a500c8d8c2f50194b340082af16cb14955df3d31b9a14dc3ad64cb3b8",
      "chain_seq": 1
    },
    "signature":  "ed25519:fed7f683db09bb57…",
    "signer_key": "6b4f13acbab4498026e270a8d66e0ef87a8b20708089f173023234580f35de1c"
  }
}
```

`verdict`, `layer`, and `pattern` record what and why. `chain_prev_hash` + `chain_seq` link this receipt to the prior one. `signature` + `signer_key` let anyone verify with the public key alone. Full format: [action receipt spec](/learn/action-receipt-spec/).

## Options

**Project vs global scope:**

```bash
# Project-level (default): wraps .vscode/mcp.json in current directory
pipelock vscode install

# Global: wraps VS Code user-level mcp.json
pipelock vscode install --global
```

**Custom config:**

```bash
pipelock vscode install --config ~/.config/pipelock/pipelock.yaml
```

**Dry run (preview without modifying):**

```bash
pipelock vscode install --dry-run
```

## Remove

To restore your original MCP server configs:

```bash
pipelock vscode remove
```

This unwraps all servers and restores the original commands from stored metadata. Use `--global` to remove global-level wrapping.

## Scan your repo first

Before starting work in a new repository, scan it for dangerous IDE config files:

```bash
pipelock preflight .
```

This detects poisoned `.vscode/mcp.json`, `.cursor/hooks.json`, `.mcp.json`, and `.claude/settings.json` files that could register malicious MCP servers or override your security settings.

<div class="hero-buttons" style="margin-top: 2rem;">
  <a href="https://github.com/luckyPipewrench/pipelock" class="btn btn-primary" data-event="github_click" data-event-placement="guide-body" target="_blank" rel="noopener noreferrer">GitHub</a>
  <a href="/install/" class="btn btn-ghost" data-event="install_click" data-event-placement="guide-body">Install Pipelock</a>
  <a href="/proof/" class="btn btn-ghost" data-event="proof_click" data-event-placement="guide-body">Inspect the proof</a>
</div>
