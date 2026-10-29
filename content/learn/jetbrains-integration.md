---
title: "JetBrains MCP Security: Scanning with Pipelock"
linkTitle: "JetBrains MCP Security"
subtitle: "Wrap Junie MCP servers with bidirectional scanning."
description: "JetBrains MCP security guide. Install Pipelock to scan MCP connections in IntelliJ IDEA, PyCharm, WebStorm, GoLand, and Junie agents."
date: 2026-03-29
lastmod: 2026-08-08
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI from a pinned source build or Homebrew; see /install/ for prerequisites so the JetBrains integration commands are available.
  - name: Wrap the Junie MCP servers
    text: Run pipelock jetbrains install to rewrite Junie MCP server entries through pipelock mcp proxy.
  - name: Restart the IDE
    text: Restart IntelliJ IDEA, PyCharm, WebStorm, GoLand, or the JetBrains IDE you use so the updated MCP config loads.
  - name: Verify coverage
    text: Run pipelock discover or pipelock verify-install to confirm the wrapped MCP path is active.
faq:
  - q: "What does Pipelock's JetBrains integration do?"
    a: "Pipelock wraps Junie MCP server configurations in ~/.junie/mcp/mcp.json through its MCP proxy. Every tool call, tool response, and tool description is scanned bidirectionally for credential leaks (65 DLP patterns), prompt injection (response-scanning patterns with 6-pass normalization), and tool poisoning (full-schema inspection). Works with IntelliJ IDEA, PyCharm, WebStorm, GoLand, and any JetBrains IDE that uses Junie."
  - q: "How do I install Pipelock for JetBrains IDEs?"
    a: "Run 'pipelock jetbrains install' after installing the pipelock binary from a pinned source build or Homebrew as documented at https://pipelab.org/install/. The command rewrites Junie's mcp.json to route each server through pipelock's MCP proxy. Restart the IDE to activate. Use 'pipelock jetbrains remove' to restore the original configuration from the preserved _pipelock metadata."
  - q: "Does Pipelock emit signed evidence for JetBrains MCP traffic?"
    a: "Yes. As of Pipelock v2.2.0, when receipt signing is configured (flight_recorder.signing_key_path in the pipelock config), every tool call, tool response, and policy decision on the wrapped MCP path emits a chained Ed25519 action receipt. Receipts verify offline against a published Python verifier and a cross-implementation conformance suite. The receipt format is open, documented, and reproducible from another implementation."
  - q: "Does Pipelock redact secrets in Junie MCP tool arguments?"
    a: "Yes, in Pipelock v2.3.0 and later. With the `redaction` section enabled in the pipelock config, matched secrets inside `tools/call` `params.arguments` are rewritten in place with typed placeholders such as `<pl:aws-access-key:1>` before forwarding to the MCP server. Redaction runs on Pipelock's MCP proxy transports: `mcp_stdio`, `mcp_http_upstream`, `mcp_http_listener`, and `mcp_ws`. Request-side only in v1, so tool responses are not rewritten and the redactor blocks fail-closed on parse errors."
learn_cat: ide
level: intro
tags:
  - jetbrains
  - junie
  - setup
---
JetBrains MCP security starts with scanning what flows between your IDE and MCP servers. Pipelock wraps Junie MCP server configurations through its MCP proxy, scanning all tool calls and responses bidirectionally. Works with IntelliJ IDEA, PyCharm, WebStorm, GoLand, and any JetBrains IDE that uses Junie.

## What's new in recent releases

JetBrains integration is pure MCP proxy wrapping, which unlocks the current signed-evidence surface when receipt signing is configured:

- **Mediator-signed action receipts for MCP decisions (v2.2.0).** With `flight_recorder.signing_key_path` set in the pipelock config, each proxied Junie MCP decision emits a chained Ed25519 receipt on the `mcp_stdio` transport.
- **Cross-implementation verifier (v2.2.0).** Receipts verify byte-for-byte against a published [Python verifier](https://github.com/pipelab-org/pipelock-verify-python) using a conformance suite. The receipt format is open, not a vendor artifact.
- **RFC 9421 mediation envelope signing (v2.2.0).** If a Junie config routes to a remote MCP server over HTTP/SSE, every request carries an Ed25519 `Pipelock-Mediation` signature with a canonical policy hash.
- **Posture verify CI gate (v2.2.0).** `pipelock posture verify` gates deploys with distinct exit codes: `0` pass, `1` could not complete, `2` verified but failed.
- **Class-preserving redaction on `tools/call` arguments (v2.3.0).** With the `redaction` section enabled in the pipelock config, matched secrets in `params.arguments` are rewritten in place with typed placeholders like `<pl:aws-access-key:1>` before forwarding to the MCP server. Runs on Pipelock's MCP proxy transports. Irreversible. Fail-closed on parse errors. Tool responses are not redacted in v1.

See the [action receipt spec](/learn/action-receipt-spec/) for the receipt format and the [AI agent data redaction guide](/learn/ai-agent-data-redaction/) for redaction rollout.

## Quick Start

```bash
# Install pipelock
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Wrap all Junie MCP servers
pipelock jetbrains install

# Restart your JetBrains IDE
```

Verify protection with `pipelock discover`.

## What Gets Scanned

Once installed, pipelock sits between your IDE and every MCP server:

```
JetBrains IDE  <-->  pipelock mcp proxy  <-->  MCP Server
  (Junie)            (scan both directions)     (subprocess)
```

All scanning and policy layers apply: DLP pattern matching, prompt injection detection, tool poisoning checks, tool policy with shell-obfuscation detection, chain detection, and session binding. From Pipelock v2.3.0, request-side redaction also rewrites matched secrets in `tools/call` `params.arguments` before forwarding. When receipt signing is configured, every decision emits a signed action receipt (see [Proof](#proof-a-real-signed-block-receipt) below).

## Install Options

```bash
# User-level (default)
pipelock jetbrains install

# Project-level (current directory only)
pipelock jetbrains install --project

# Preview changes without writing
pipelock jetbrains install --dry-run

# Use a specific config
pipelock jetbrains install --config ~/.config/pipelock/pipelock.yaml
```

## How It Works

`jetbrains install` reads `~/.junie/mcp/mcp.json`, wraps each MCP server through `pipelock mcp proxy`, and writes the modified config back. Original configs are stored in a `_pipelock` metadata field for clean removal.

**Stdio servers** get their command wrapped:
```json
// Before
{"command": "node", "args": ["server.js"]}

// After
{"command": "pipelock", "args": ["mcp", "proxy", "--", "node", "server.js"]}
```

Environment variables from `env` blocks are passed through automatically via `--env KEY` flags.

## Remove

```bash
# Restore original configs
pipelock jetbrains remove

# Preview first
pipelock jetbrains remove --dry-run
```

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

## Limitations

- **Header passthrough:** HTTP/SSE servers with custom headers cannot be wrapped yet. Use environment variable authentication instead.
- **Project-local configs** are not visible to `pipelock discover`. The default user-level install is visible.
- **IDE restart required** after install or remove.

---

See also: [Claude Code](/learn/claude-code-hooks/) · [Cursor](/learn/cursor-integration/) · [VS Code](/learn/vscode-integration/) · [Zed](/learn/zed-integration/) · [Full documentation](/pipelock/)
