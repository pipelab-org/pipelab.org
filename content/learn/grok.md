---
title: "Grok Build Security: Forward Proxy and Manual MCP Wrap"
linkTitle: "Grok Build Security"
subtitle: "Point Grok Build through Pipelock. Wrap MCP servers by hand. No installer command."
description: "Grok Build security guide. Point the CLI through Pipelock with HTTPS_PROXY, wrap MCP servers by hand, and see what TLS interception adds."
date: 2026-09-19
learn_cat: operator
level: intro
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI with Go or Homebrew so pipelock run and pipelock mcp proxy are on PATH.
  - name: Install Grok first
    text: Install the Grok CLI before exporting HTTPS_PROXY so the installer is not forced through the proxy.
  - name: Start the forward proxy
    text: Generate a config, set forward_proxy.enabled to true, raise forward_proxy.idle_timeout_seconds to at least 600, and start pipelock run.
  - name: Point Grok at Pipelock
    text: Export HTTPS_PROXY and HTTP_PROXY to the listener, then start grok.
  - name: Wrap each MCP server
    text: Add each stdio server through grok mcp add with pipelock mcp proxy as the command. There is no pipelock grok install.
faq:
  - q: "Does Pipelock ship a pipelock grok install command?"
    a: "No. Grok Build has no automatic config rewriter. Model API traffic uses the standard HTTPS_PROXY and HTTP_PROXY environment variables. MCP servers are wrapped by hand with pipelock mcp proxy. Codex has pipelock codex install, which rewrites the registered MCP servers it can preserve."
  - q: "Does HTTPS_PROXY scan Grok's prompts and model responses?"
    a: "Only when TLS interception is on and Grok trusts Pipelock's CA in the OS trust store. Without interception, Pipelock sees the CONNECT hostname and can enforce destination policy, but request and response bodies stay encrypted. Grok loads system roots through rustls, so NODE_EXTRA_CA_CERTS does not fix the CLI."
  - q: "How do I wrap a Grok MCP server?"
    a: "Resolve the pipelock binary once with command -v. Then grok mcp add NAME with pipelock mcp proxy as the command, an absolute config path, and the upstream server after the separator. Persist absolute paths. A listed server is not proof it connected; run grok mcp doctor after a harmless tool call."
  - q: "Can I put an API token on grok mcp add header flags?"
    a: "Do not. Static Authorization values land in config and on the process argument list. Store one Header-Name: value per line in a mode-0600 file and wrap with pipelock mcp proxy using a header file and an upstream URL. Native HTTP remotes that use Grok OAuth are not auto-wrapped; replacing them with a stdio wrap drops Grok's OAuth flow for that server."
tags:
  - grok
  - setup
  - mcp
related:
  - mcp-proxy
  - continue
  - known-limitations
---
[Grok Build](https://docs.x.ai/build/overview) is xAI's coding agent. The `grok` CLI has an interactive TUI, a headless mode, ACP, and MCP servers configured with `grok mcp` or `~/.grok/config.toml`. Model traffic is ordinary HTTPS. Pipelock covers that path as a forward proxy, and it covers MCP tool traffic when you wrap each stdio server with `pipelock mcp proxy`.

There is no `pipelock grok install`. Do not treat this page as env-only, and do not treat MCP as unsupported. The full command reference lives in the [Grok CLI integration guide](https://github.com/pipelab-org/pipelock/blob/main/docs/guides/grok.md) on GitHub.

## Why Grok needs an agent firewall

| Workflow | What Grok accesses | What could go wrong |
|---|---|---|
| Interactive and headless prompts | Repo files, diffs, tool results sent to the model | Secrets or private paths leaving in prompt context |
| Model inference and auth | `cli-chat-proxy.grok.com`, `auth.x.ai`, and (API-key path) `api.x.ai` over HTTPS | Uninspected hostname egress; opaque CONNECT bodies without interception |
| MCP tool use (`grok mcp`) | Local stdio servers and remote HTTP MCP endpoints | Tool poisoning, rug-pulls, secrets in tool arguments or results |
| Shell and local tools | Commands and network from the agent session | Exfiltration that never hits the model API or a wrapped MCP path |

## What is covered

Coverage depends on which surface you wire and whether TLS interception is enabled. Ordinary CONNECT without interception is hostname-visible only. Bodies, headers, and prompts stay encrypted end to end. That is the same CONNECT tunnel limit documented on [known limitations](/learn/known-limitations/).

| Surface | Covered? | How |
|---|---|---|
| Hostname and destination policy on CONNECT | Yes, without interception | `pipelock run` sees the CONNECT target host, not tunnel plaintext |
| Full outbound DLP and response injection on model HTTPS | Yes only with TLS interception and a trusted OS CA | Same listener; see the TLS section below |
| MCP stdio servers wrapped with `pipelock mcp proxy` | Yes, manual wrap | `grok mcp add … -- pipelock mcp proxy --config … -- <upstream>` |
| Remote HTTP MCP with static auth headers | Manual only | Prefer `--header-file` plus `--upstream`. Do not put secrets on argv |
| `pipelock grok install`, Pro-only named listeners, unpublished controls | No | Not claimed here |

Tools and subprocesses that ignore proxy environment variables need `pipelock contain`, a sandbox, or another network boundary. Cooperative proxying is not binary-enforced isolation.

## Install Pipelock

{{< install-block "go,homebrew" >}}

## Install Grok before the proxy env

Install Grok **before** exporting `HTTPS_PROXY` or `HTTP_PROXY`. With `pipelock run` already up, `curl` and `npm` install traffic would be forced through the proxy and can fail.

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
# or: npm install -g @xai-official/grok
```

Public install paths are on [xAI's CLI docs](https://docs.x.ai/build/overview). If the proxy is already running, allow `x.ai` and `storage.googleapis.com` in policy, or use npm, which does not need those hosts.

## Start the forward proxy

Grok SSE idle defaults to 600 seconds. xAI recommends proxy idle timeouts of at least 10 minutes. The `balanced` preset ships `forward_proxy.idle_timeout_seconds: 120`, so raise it before you start the listener.

```bash
pipelock generate config --preset balanced -o pipelock.yaml
# edit pipelock.yaml (the balanced preset ships the forward proxy off):
#   forward_proxy:
#     enabled: true
#     idle_timeout_seconds: 600
pipelock run --config pipelock.yaml
```

Start with `balanced` if you want to see what gets flagged. Move to `strict` or `hostile-model` once you have checked the false positives.

## Point Grok at Pipelock

The CLI honors standard proxy environment variables.

```bash
export HTTPS_PROXY=http://127.0.0.1:8888
export HTTP_PROXY=http://127.0.0.1:8888
export NO_PROXY=127.0.0.1,localhost

grok
# headless: grok -p "Explain this repo"
# CI / ACP: grok --no-auto-update -p "Explain this repo"
```

Authenticate with `grok login`, device auth, or `XAI_API_KEY`. Pipelock does not replace Grok authentication.

For scripts, CI, or `grok agent stdio`, pass `--no-auto-update` so background update checks do not hit install hosts. Persist that with `auto_update = false` under `[cli]` in `~/.grok/config.toml`.

`~/.grok/config.toml` can bind an `api_key` or custom `base_url` per model. Those entries are not a Pipelock proxy rewrite surface. They do not replace `HTTPS_PROXY` / `HTTP_PROXY`.

## Wrap each MCP server

Grok supports MCP via [`grok mcp`](https://docs.x.ai/build/features/mcp-servers). Wrap each stdio server by hand so tool calls and results pass through `pipelock mcp proxy`. It's the same pattern as a manual `codex mcp add` wrap, though [Codex](/learn/codex-cli-integration/) also has `pipelock codex install` to do most of it for you. MCP stdio wrapping scans JSON-RPC directly and does not need TLS interception.

Resolve the installed binary once. Homebrew on Apple Silicon typically lands at `/opt/homebrew/bin/pipelock`, not `/usr/local/bin`. Persist absolute paths; Grok user-scope MCP does not depend on later cwd.

```bash
PIPELOCK="$(command -v pipelock)"
test -n "$PIPELOCK" || { echo "pipelock not on PATH"; exit 1; }
CONFIG="/home/you/pipelock.yaml"

grok mcp add filesystem \
  -- "$PIPELOCK" mcp proxy --config "$CONFIG" \
  -- npx -y @modelcontextprotocol/server-filesystem /home/you/projects
```

Equivalent TOML:

```toml
# command must be the absolute path from `command -v pipelock`
[mcp_servers.filesystem]
command = "/absolute/path/to/pipelock"
args = [
  "mcp", "proxy",
  "--config", "/home/you/pipelock.yaml",
  "--",
  "npx", "-y", "@modelcontextprotocol/server-filesystem", "/home/you/projects"
]
```

Grok also accepts project-scoped servers (`grok mcp add --scope project` writes `.grok/config.toml`) and can merge compat configs from Claude or Cursor MCP files. Wrap those entries the same way if you rely on them.

### Verify the wrap

```bash
grok mcp list
grok mcp doctor
```

A listed server is not proof the client connected. After wrapping, run a harmless tool action, then `grok mcp doctor`. Stdio stderr lives under `~/.grok/logs/mcp/` if a server fails to start. Cold-start `npx` downloads may need a higher `startup_timeout_sec` on the `[mcp_servers.*]` entry.

### Remote HTTP MCP and auth headers

Grok can register remotes with HTTP transport:

```bash
# Native Grok remote. OAuth is handled by Grok. Pipelock does not auto-wrap this.
grok mcp add --transport http linear https://mcp.linear.app/mcp
```

Do **not** register static bearer tokens with native `grok mcp add --header …`. Those values land in config and on the process argument list.

Pipelock does not rewrite Grok's `[mcp_servers.*]` `url` / `headers` entries. A native `url=` remote bypasses `pipelock mcp proxy` and skips MCP-layer JSON-RPC scanning. If `HTTPS_PROXY` is set, that HTTP connection may still traverse the forward proxy; without TLS interception, CONNECT bodies stay opaque.

For remotes that need static auth headers, store one `Header-Name: value` per line in a private `0600` file and wrap with `--header-file` plus `--upstream`:

```bash
install -d -m 700 ~/.config/pipelock/wrap-headers
umask 077
printf 'Authorization: Bearer %s\n' "$API_TOKEN" > ~/.config/pipelock/wrap-headers/grok-api.headers
chmod 600 ~/.config/pipelock/wrap-headers/grok-api.headers

grok mcp add api-wrapped \
  -- "$PIPELOCK" mcp proxy --config "$CONFIG" \
  --header-file "$HOME/.config/pipelock/wrap-headers/grok-api.headers" \
  --upstream https://mcp.example.com/mcp
```

Replacing a native HTTP remote with a stdio `pipelock mcp proxy --upstream` wrap removes Grok from the HTTP transport, so Grok's OAuth flow does **not** run for that server. Pipelock only forwards operator-supplied static headers. It cannot read `~/.grok/mcp_credentials.json`. Keep OAuth-only remotes on Grok's native HTTP transport unless you have a separately supplied token for `--header-file`.

## Optional: TLS interception

When Pipelock terminates TLS so it can scan HTTPS bodies on the forward-proxy path:

1. Enable interception and distribute the CA per the [TLS interception guide](https://github.com/pipelab-org/pipelock/blob/main/docs/guides/tls-interception.md).
2. Trust `~/.pipelock/ca.pem` in the **OS trust store**. Grok loads system roots. On Linux that is typically `update-ca-certificates` or `update-ca-trust`; on macOS, the system keychain.

Without a trusted CA, intercepted HTTPS handshakes fail. Without interception, CONNECT tunnels stay body-opaque.

## Destination hosts

Authoritative public tables: [xAI enterprise network requirements](https://docs.x.ai/build/enterprise). All connections use HTTPS on port 443. Allow destinations in Pipelock policy the same way you allow other model endpoints.

| Host | When you need it |
|---|---|
| `cli-chat-proxy.grok.com` | Inference proxy and settings |
| `auth.x.ai` | OAuth2/OIDC authentication |
| `api.x.ai` | Direct API-key path (`XAI_API_KEY`) only |
| `code.grok.com` | Remote session sync and share links (optional) |
| `x.ai`, `storage.googleapis.com` | Shell installer and `grok update` only; npm does not need them |

If you use enterprise OIDC, also allow your IdP domain.

## Limitations

- **No installer.** Every new MCP server is a hand wrap. Re-run the wrap after you add one.
- **Body DLP on model HTTPS needs interception.** `HTTPS_PROXY` without a trusted OS CA is hostname policy only.
- **Native HTTP MCP remotes skip JSON-RPC scanning** unless you replace them with a stdio wrap.
- **OAuth is Grok's.** A `--upstream` wrap does not preserve Grok OAuth for that server.
- **Ignored proxy env is out of scope** for this recipe. Containment and sandboxing are separate.

## Troubleshooting

**MCP server listed but not connecting.** Run the upstream command alone, then the wrap with absolute `pipelock` and `--config` paths, then `grok mcp doctor <name>`.

**Install or update fails with the proxy already set.** Install Grok before exporting proxy env, or allow the install hosts, or use npm. Prefer `--no-auto-update` in headless environments.

**TLS handshake failures after enabling interception.** Trust the Pipelock CA in the OS store. `NODE_EXTRA_CA_CERTS` alone does not fix the Rust CLI.

See also: [Continue.dev MCP Security](/learn/continue/) · [MCP Proxy](/learn/mcp-proxy/) · [Known Limitations](/learn/known-limitations/) · [Grok CLI integration guide](https://github.com/pipelab-org/pipelock/blob/main/docs/guides/grok.md)
