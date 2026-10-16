---
title: "Zed MCP Security: Scanning with Pipelock"
linkTitle: "Zed MCP Security"
subtitle: "Wrap Zed context_servers with bidirectional scanning."
description: "Zed MCP security guide. Install Pipelock to scan every context_server tool call in Zed stable, Zed Preview, and Flatpak Zed."
date: 2026-05-15
lastmod: 2026-05-15
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI from a pinned source build or Homebrew; see /install/ for prerequisites so the Zed integration commands are available.
  - name: Wrap the Zed context_servers
    text: Run pipelock zed install to rewrite every context_server in Zed's settings.json through pipelock mcp proxy.
  - name: Restart Zed
    text: Restart Zed so the updated settings.json loads and the wrapped servers spawn through pipelock.
  - name: Verify coverage
    text: Run pipelock discover to confirm every Zed channel reports protected servers.
faq:
  - q: "What does Pipelock's Zed integration do?"
    a: "Pipelock wraps every entry under context_servers in Zed's settings.json so that the spawned command is pipelock instead of the original MCP server. Every tool call, tool response, tool description, and tool-list payload is scanned bidirectionally for credential leaks (full default DLP pattern set), prompt injection (6-pass normalization), and tool poisoning. The original command, args, and env are stashed in a _pipelock metadata block for clean removal."
  - q: "How do I install Pipelock for Zed?"
    a: "Run 'pipelock zed install' after installing the pipelock binary from a pinned source build or Homebrew as documented at https://pipelab.org/install/. Default discovery scans every standard Zed settings.json path (project-local, native stable, native Preview, Flatpak stable, Flatpak Preview). Each file that exists is wrapped independently with its own .bak backup. Restart Zed to activate."
  - q: "Does Pipelock support Flatpak-installed Zed?"
    a: "Yes. Default discovery includes ~/.var/app/dev.zed.Zed/config/zed/settings.json for Flatpak stable and ~/.var/app/dev.zed.Zed.Preview/config/zed-preview/settings.json for Flatpak Preview. Both are wrapped automatically alongside any native install on the same machine."
  - q: "Does Pipelock redact secrets in Zed MCP tool arguments?"
    a: "Yes, in Pipelock v2.3.0 and later. With the redaction section enabled in the pipelock config, matched secrets inside tools/call params.arguments are rewritten in place with typed placeholders such as <pl:aws-access-key:1> before forwarding to the MCP server. Redaction runs on the same MCP proxy transports the wrap uses (mcp_stdio for command-based servers, mcp_http_upstream for url-based servers). Request-side only in v1; tool responses are not rewritten and the redactor fails closed on parse errors."
learn_cat: ide
level: intro
tags:
  - zed
  - mcp
  - setup
  - context-servers
---
Zed MCP security starts with inspecting what flows between Zed and every context_server. Pipelock wraps each entry in your settings.json so every tool call and response runs through its MCP proxy. Works on Zed stable, Zed Preview, and Flatpak builds of either channel.

## What's new in recent releases

Zed integration is pure MCP proxy wrapping. That brings the current signed-evidence and class-preserving redaction surface into the Zed MCP path as soon as the wrap is in place:

- **Mediator-signed action receipts for MCP decisions (v2.2.0).** With flight_recorder.signing_key_path set in the pipelock config, each proxied Zed MCP decision emits a chained Ed25519 receipt on the mcp_stdio transport.
- **Cross-implementation verifier (v2.2.0).** Receipts verify byte-for-byte against the published [Python verifier](https://github.com/luckyPipewrench/pipelock-verify-python) using a conformance suite. The receipt format is open, not a vendor artifact.
- **Class-preserving redaction on tools/call arguments (v2.3.0).** Matched secrets in params.arguments are rewritten in place with typed placeholders like <pl:aws-access-key:1> before forwarding to the MCP server.
- **Header sidecar carrier for credential-bearing remote servers (v2.4.0).** Remote context_servers with Authorization or X-API-Key headers get their values stashed in a 0o600 sidecar file referenced via --header-file. Header values never appear in /proc/<pid>/cmdline.

See the [action receipt spec](/learn/action-receipt-spec/) for the receipt format and the [AI agent data redaction guide](/learn/ai-agent-data-redaction/) for redaction rollout.

## Quick Start

```bash
# Install pipelock
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Wrap every Zed MCP context_server (default discovery; no args needed)
pipelock zed install

# Restart Zed
```

Verify with `pipelock discover`: the report should show every Zed channel with all servers tagged as protected.

## What Gets Scanned

Once installed, pipelock sits between Zed and every MCP server:

```
Zed agent  <-->  pipelock mcp proxy  <-->  MCP Server
                 (scan both directions)    (subprocess or HTTP upstream)
```

Every layer applies: DLP pattern matching on tool arguments, prompt injection detection on tool results, tool poisoning checks on tool definitions, tool policy with shell-obfuscation detection, chain detection across tool call sequences, and session binding pinning the tool inventory per session. From Pipelock v2.3.0, request-side redaction also rewrites matched secrets in tools/call params.arguments before forwarding. When receipt signing is configured, every decision emits a signed action receipt.

## Install Discovers Every Standard Path

Default discovery scans all five standard Zed settings.json locations:

| Path | Channel |
|------|---------|
| `<cwd>/.zed/settings.json` | Project-local |
| `$XDG_CONFIG_HOME/zed/settings.json` (or `~/.config/zed/settings.json`) | Native stable |
| `$XDG_CONFIG_HOME/zed-preview/settings.json` | Native Preview |
| `~/.var/app/dev.zed.Zed/config/zed/settings.json` | Flatpak stable |
| `~/.var/app/dev.zed.Zed.Preview/config/zed-preview/settings.json` | Flatpak Preview |

Each file that exists is wrapped independently with its own .bak backup. Use --path to target a single explicit file.

```bash
# Default: wrap every existing Zed settings.json
pipelock zed install

# Preview without writing
pipelock zed install --dry-run

# Single explicit file
pipelock zed install --path ~/some/custom/settings.json

# Specific pipelock config
pipelock zed install --config ~/.config/pipelock/pipelock.yaml
```

## How It Works

`zed install` reads each settings.json, wraps every context_servers entry through `pipelock mcp proxy`, and atomically writes the modified file back. The original command, args, and env are preserved in a _pipelock metadata block. Non-server top-level fields (theme, ui_font_size, agent settings, key bindings) are preserved across the rewrite.

**Stdio servers** get their command wrapped:

```json
// Before
{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]}

// After
{
  "type": "stdio",
  "command": "pipelock",
  "args": ["mcp", "proxy", "--config", "...", "--", "npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
}
```

**Remote (URL) servers** get rewritten to spawn pipelock as a stdio-to-HTTP bridge:

```json
// Before
{"url": "https://api.example.com/mcp"}

// After
{"command": "pipelock", "args": ["mcp", "proxy", "--config", "...", "--upstream", "https://api.example.com/mcp"]}
```

Credential-bearing headers land in a 0o600 sidecar file referenced via --header-file. The sidecar path is hashed from the absolute settings.json path, so a same-named context_server at project and user scope can never clobber the other scope's credential carrier.

## Remove

```bash
# Restore original configs across every wrapped settings.json
pipelock zed remove

# Single file
pipelock zed remove --path ~/.config/zed/settings.json

# Preview without writing
pipelock zed remove --dry-run
```

Remove restores the original server entries from the _pipelock metadata field and strips that field. Non-wrapped entries and non-server top-level fields are left untouched.

## Proof: a real MCP-level DLP block

With the wrap in place against the official `@modelcontextprotocol/server-filesystem` MCP server, an attempted `tools/call write_file` carrying an AWS-style key gets blocked at the MCP input boundary:

```text
pipelock: proxying MCP server [npx -y @modelcontextprotocol/server-filesystem /tmp]
          (response=warn, input=block, tools=block, policy=warn)
pipelock: input line 3: blocked tools/call request (AWS Access ID)

{"jsonrpc":"2.0","id":2,"error":{"code":-32001,
  "message":"pipelock: request blocked by MCP input scanning"}}

$ ls /tmp/mcp-leak.txt
ls: cannot access '/tmp/mcp-leak.txt': No such file or directory
```

The credential never reaches the filesystem MCP server and the file is never written. The block is at the protocol layer, not a model-side refusal. Whatever model you have configured in Zed sees the JSON-RPC error and the tool call fails.

## Discovering Wrap Status Across Channels

`pipelock discover` reports MCP servers across every IDE it knows about, including all four Zed channels:

```bash
$ pipelock discover
zed                  1 server,  1 protected
zed-preview          1 server,  0 protected   <-- channel missed during install
zed-flatpak          0 servers
zed-preview-flatpak  0 servers
```

Use `pipelock discover --json` for a machine-readable report.

## Limitations

- **Header passthrough on `tools/call` responses** is request-side only in v1: the wrap rewrites secrets in arguments before forwarding to the MCP server, but tool responses are not rewritten. Use prompt injection and tool poisoning detection on the response path for response-side coverage.
- **`agent_servers`** (Zed's separate block for built-in agent integrations like the claude-acp registry) is not an MCP surface and is intentionally left alone.
- **IDE restart required** after install or remove.

---

See also: [Claude Code](/learn/claude-code-hooks/) · [Cursor](/learn/cursor-integration/) · [JetBrains](/learn/jetbrains-integration/) · [Full documentation](/pipelock/)
