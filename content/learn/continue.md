---
title: "Continue.dev MCP Security: Scanning with Pipelock"
linkTitle: "Continue.dev MCP Security"
subtitle: "Wrap the MCP servers in Continue.dev's YAML config with bidirectional scanning."
description: "Continue.dev MCP security guide. Wrap each MCP server in Continue's config through pipelock mcp proxy for DLP, injection, and tool-poisoning scanning."
date: 2026-05-16
lastmod: 2026-09-29
learn_cat: ide
level: intro
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI from a pinned source build or Homebrew; see /install/ for prerequisites.
  - name: Preview the wrap
    text: Run pipelock continue install --dry-run to print what would change in ~/.continue/config.yaml and ~/.continue/mcpServers/ without writing anything.
  - name: Wrap each MCP server in Continue's config
    text: Run pipelock continue install. It wraps the supported MCP entries in Continue's YAML config to launch through pipelock mcp proxy and writes a .bak backup of each changed file. JSON entries and remote entries with headers need manual wrapping. To wrap by hand instead, prefix each stdio server command with pipelock mcp proxy --.
  - name: Restart Continue
    text: Restart the IDE host so Continue picks up the wrapped configuration. Undo the wrap with pipelock continue remove.
  - name: Verify
    text: Run pipelock discover to confirm Continue's MCP servers report protected.
faq:
  - q: "What does Pipelock do for Continue.dev?"
    a: "Continue.dev is MCP-native. When each MCP server in your Continue config is launched through pipelock mcp proxy, every tool call, tool response, tool description, and tool-list payload is scanned for credential leaks, prompt injection, tool poisoning, and chain attacks. With receipt signing configured and the recorder writing successfully, decisions produce chained Ed25519 action receipts that an operator can verify after the fact. Set require_receipts where forwarding must depend on that record."
  - q: "Does Pipelock ship a pipelock continue install subcommand?"
    a: "Yes, since v3.6.0. pipelock continue install wraps the supported MCP entries declared in ~/.continue/config.yaml and in the standalone YAML files under ~/.continue/mcpServers/, writes a .bak backup of each changed file, and is safe to re-run. pipelock continue install --dry-run prints the planned changes without writing, and pipelock continue remove unwraps only entries Pipelock wrapped. The manual edit described below remains available."
  - q: "Does Pipelock redact secrets in Continue's MCP tool arguments?"
    a: "Yes, in Pipelock v2.3.0 and later. With the redaction section enabled in the pipelock config, matched secrets inside tools/call params.arguments are rewritten in place with typed placeholders such as <pl:aws-access-key:1> before forwarding to the MCP server. Redaction runs on the same MCP proxy transports the wrap uses. Redaction rewrites request arguments. Response scanning is a separate mechanism: it inspects tool responses and, with the strip action configured, rewrites matched injection content before delivery."
  - q: "Does Continue.dev's HTTP traffic also go through Pipelock?"
    a: "MCP wrapping covers the MCP surface only. For outbound HTTP that Continue's agent makes through tool calls (curl, wget, REST APIs the agent invokes directly), point the shell at the pipelock forward proxy with HTTPS_PROXY and HTTP_PROXY environment variables. These variables route proxy-aware clients only. HTTPS content inspection needs TLS interception and CA trust, and preventing direct bypass needs containment."
tags:
  - continue.dev
  - mcp
  - setup
---
Continue.dev is an open-source AI coding assistant that runs inside VS Code and JetBrains IDEs. It is MCP-native: tools, context providers, and integrations get loaded from MCP servers declared in the Continue config. Pipelock wraps each of those servers so every tool call and response runs through its MCP proxy.

## Why Continue.dev needs an agent firewall

Continue sessions frequently involve:

| Workflow | What Continue accesses | What could go wrong |
|---|---|---|
| Multi-file edits | Source code, secrets in history | Credentials leaked through tool arguments |
| Context providers | Repository search, docs, URLs | Prompt injection in fetched content |
| MCP tool execution | Filesystem, databases, APIs | Tool poisoning, rug-pull updates, chain attacks |
| Conversation history | Past plans, tool outputs | An injected instruction surviving across resume |

Pipelock sits inline on each MCP server. It scans `tools/call` arguments outbound for DLP, scans tool responses inbound for prompt injection, scans tool definitions for poisoned descriptions, and emits signed action receipts so an operator can prove what happened.

## Install pipelock

{{< install-block "go,homebrew" >}}

## Wrap each MCP server with pipelock continue install

`pipelock continue install` wraps the supported MCP entries in Continue's YAML config so they launch through `pipelock mcp proxy`. JSON entries and remote entries with headers need manual wrapping. It reads `~/.continue/config.yaml` and every `.yaml` or `.yml` file in `~/.continue/mcpServers/`. Preview first, then apply:

```bash
pipelock continue install --config "$PWD/pipelock.yaml" --dry-run
pipelock continue install --config "$PWD/pipelock.yaml"
```

`--dry-run` prints the rewritten files without touching anything. `--config` (`-c`) names the Pipelock config the wrapped servers pass to `pipelock mcp proxy`. `--path` points at a different `config.yaml` and `--mcp-dir` at a different standalone block directory. Each changed file gets a `.bak` backup, and the command prints `Wrapped Continue MCP servers in N file(s)`.

The installer wraps local `command` servers and remote `url` servers. It refuses a remote entry with nonempty `headers`, because the generated launch doesn't forward them; wrap that server by hand using `--header-file`. It also refuses a legacy `~/.continue/config.json` when no `config.yaml` exists, because wrapping JSON would be inert.

To undo it, run `pipelock continue remove` (also accepts `--dry-run`, `--path` and `--mcp-dir`). Removal restores only entries that carry Pipelock's wrapping metadata and leaves your other servers alone.

## Wrap by hand instead

If you'd rather edit the files yourself, or need a server the installer refuses, Continue supports MCP servers in a top-level `mcpServers` block and in standalone files under `.continue/mcpServers/`. Continue's current docs show standalone YAML files with `name`, `version`, `schema`, and a `mcpServers` list; if your setup uses the global `config.yaml`, edit the same `mcpServers` list there.

For stdio servers, keep Continue's transport as `stdio` and replace the original command with `pipelock mcp proxy`. Put the original command and arguments after `--`. This is the same shape `pipelock continue install` writes.

A `command`-based MCP server changes from:

```yaml
name: Local MCP Servers
version: 0.0.1
schema: v1
mcpServers:
  - name: filesystem
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/tmp"
```

to:

```yaml
name: Local MCP Servers
version: 0.0.1
schema: v1
mcpServers:
  - name: filesystem
    type: stdio
    command: pipelock
    args:
      - mcp
      - proxy
      - --config
      - /home/you/.config/pipelock/local.yaml
      - --
      - npx
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/tmp"
```

A remote MCP server changes from Continue's direct remote transport:

```yaml
name: Remote MCP Servers
version: 0.0.1
schema: v1
mcpServers:
  - name: remote-example
    type: streamable-http
    url: https://api.example.com/mcp
```

to a local stdio wrapper that points Pipelock at the upstream URL:

```yaml
name: Remote MCP Servers
version: 0.0.1
schema: v1
mcpServers:
  - name: remote-example
    type: stdio
    command: pipelock
    args:
      - mcp
      - proxy
      - --config
      - /home/you/.config/pipelock/local.yaml
      - --upstream
      - https://api.example.com/mcp
```

If your workspace already has JSON MCP config from Claude Desktop, Cursor, or Cline, Continue can load it from `.continue/mcpServers/`. Wrap those servers the same way (the installer only reads YAML), but preserve the JSON file's existing object shape. Continue's own docs are the authoritative reference for the exact schema of each MCP server block.

## Restart Continue

Quit and reopen your IDE so Continue reloads its configuration and spawns each MCP server through `pipelock` instead of the original command.

## What gets scanned

| Direction | What | Scanning |
|---|---|---|
| Continue → MCP server | Tool call arguments | DLP, input injection patterns, tool-policy rules |
| MCP server → Continue | Tool results, error messages | Response injection with 6-pass normalization |
| Tool definitions | `tools/list` responses | Poisoned descriptions, schema injection, rug-pull drift |
| Tool sequences | Multi-call patterns | Chain detection |
| Session inventory | First-seen tool set | Inventory pinning so a malicious mid-session server cannot add new tools silently |

When the redaction section is enabled in the pipelock config, matched secrets inside `tools/call` arguments are rewritten in place with typed placeholders before they reach the MCP server.

## Forward proxy for HTTP egress

For HTTP that Continue's agent makes outside the MCP surface (curl-style tool calls, REST clients), run pipelock as a forward proxy and point the IDE shell at it:

```bash
pipelock run --config ~/.config/pipelock/pipelock.yaml &
export HTTPS_PROXY=http://127.0.0.1:8888
export HTTP_PROXY=http://127.0.0.1:8888
export NO_PROXY=127.0.0.1,localhost
```

These variables route proxy-aware clients only. HTTPS content inspection needs TLS interception and CA trust, and preventing direct bypass needs containment such as `pipelock contain`.

## Choosing a config

| Preset | Action | Best for |
|---|---|---|
| `balanced.yaml` | warn | Getting started, tuning phase |
| `claude-code.yaml` | block | Unattended Continue sessions on regulated codebases |
| `strict.yaml` | block | High-security repos, third-party plugin work |
| `hostile-model.yaml` | block | Running an uncensored or jailbroken model |

Start with `balanced.yaml` to see what gets flagged. Switch to `claude-code.yaml` or `strict.yaml` once you have verified no false positives in your workflow.

## Verify

`pipelock discover` reports MCP servers across every IDE it knows about, including Continue.dev. Once the wrap is in place (by installer or by hand), every server should show as protected.

## Action receipts

For Continue workflows that touch production source code, enable the flight recorder so each tool call produces a verifiable receipt:

```yaml
flight_recorder:
  enabled: true
  dir: /var/lib/pipelock/continue-evidence
  signing_key_path: /etc/pipelock/agents/receipt-signing/id_ed25519
  sign_checkpoints: true
  redact: true
```

Generate the key into that path with `pipelock keygen receipt-signing --keystore /etc/pipelock`, run as the account that runs Pipelock so it can read the key. `pipelock keys status --config <your-config.yaml>` confirms the recorder can load it. Pin the matching public key when you verify: `pipelock verify-receipt <file> --key /etc/pipelock/agents/receipt-signing/id_ed25519.pub`. Without `signing_key_path` the recorder writes no signed receipts, and a receipt the recorder fails to write is logged rather than blocking traffic unless `require_receipts` is set. Receipts verify byte-for-byte against the published Python verifier. The format is open and the verifier is independent of the Pipelock binary; see [Action Receipt Spec](/learn/action-receipt-spec/).

## Limitations

- **Re-run after adding a server.** `pipelock continue install` wraps the servers present when it runs. Run it again after you add a new MCP server; it's idempotent.
- **Remote servers with headers.** The installer refuses them. Wrap those by hand.
- **Tool response redaction.** Credential redaction rewrites request arguments only. Responses go through response scanning instead, which detects prompt injection and tool poisoning and, with the strip action configured, rewrites matched injection content before delivery.
- **IDE restart required** after editing the Continue config.

---

See also: [Pi](/learn/pi/) &middot; [Claude Code](/learn/claude-code-hooks/) &middot; [Cursor](/learn/cursor-integration/) &middot; [VS Code](/learn/vscode-integration/) &middot; [Grok Build](/learn/grok/) &middot; [Codex CLI](/learn/codex-cli-integration/) &middot; [Full documentation](/pipelock/)
