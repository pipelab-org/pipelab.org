---
title: "Codex CLI Security: Wrap MCP Servers and Route Egress"
linkTitle: "Codex CLI Security"
subtitle: "Put Pipelock in front of Codex's MCP servers and proxy-aware commands. One installer wraps the servers it can rewrite safely."
description: "Codex CLI security guide. Wrap Codex MCP servers with pipelock codex install, route proxy-aware commands through Pipelock, and see what each layer covers."
date: 2026-10-28
learn_cat: operator
level: intro
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI with Go or Homebrew so pipelock mcp proxy and pipelock codex install are on PATH.
  - name: Generate a config
    text: Run pipelock generate config with a preset, keep the file at an absolute path, and set forward_proxy.enabled to true if you will route commands through pipelock run.
  - name: Preview the wrap
    text: Run pipelock codex install with the config and --dry-run. Read every skip line, because a skipped server stays unwrapped.
  - name: Wrap the servers
    text: Run pipelock codex install with the same config, restart Codex, and confirm each server's command in codex mcp list is pipelock.
  - name: Prove the wrapper is in the path
    text: Call one tool per server with a synthetic test credential in an argument. A wrapped server returns a Pipelock block instead of running the call.
faq:
  - q: "Is this the same as OpenAI's Codex Security?"
    a: "No. OpenAI's Codex Security scans connected GitHub repositories for vulnerabilities. This guide covers the Codex CLI at runtime: what its MCP servers send back into the session and what its commands send out over the network."
  - q: "Does Pipelock ship a Codex installer?"
    a: "Yes. pipelock codex install reads the servers that codex mcp list reports and rewrites the ones it can preserve to launch through pipelock mcp proxy. It skips servers that are already wrapped, and it also skips servers whose settings codex mcp add can't carry over, such as custom timeouts, a working directory, env_vars passthrough, or a URL server with auth headers. A skipped server keeps talking to Codex directly. Run it with --dry-run first and read every skip line."
  - q: "Codex already has a sandbox. What does Pipelock add?"
    a: "OpenAI documents that Codex runs with network access off by default and confines commands to the workspace. Its optional network proxy for sandboxed commands filters destinations and does not filter web search, apps, MCP or other hosted tools. Pipelock adds content inspection on the paths routed through it: secrets in MCP tool arguments, injection and poisoned descriptions in MCP responses, and DLP on proxy-aware outbound requests."
  - q: "Does wrapping change remote MCP servers registered by URL?"
    a: "Yes. pipelock codex install converts a Streamable HTTP server to a stdio wrapper that reaches the original URL through --upstream. Test each converted server with a harmless call after the install, especially one that signs in with OAuth."
tags:
  - codex
  - setup
  - mcp
related:
  - mcp-proxy
  - grok
  - known-limitations
---
[Codex](https://learn.chatgpt.com/docs/security) is OpenAI's coding agent. The `codex` CLI reads a real repository, runs commands, and calls tools from MCP servers you register with `codex mcp add`. Pipelock covers two of those paths. It wraps each MCP server with `pipelock mcp proxy`, and it inspects outbound requests from commands that honor proxy settings.

This page is about the Codex CLI at runtime. OpenAI's separate Codex Security product scans connected GitHub repositories, and OpenAI's own [security page](https://learn.chatgpt.com/docs/security) points readers looking for it elsewhere. The full command reference for this integration lives in the [Codex integration guide](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/guides/codex.md) on GitHub.

## What Codex already enforces

Codex ships real controls, and they're worth knowing before adding anything. On its [approvals and security page](https://learn.chatgpt.com/docs/agent-approvals-security) (read 2026-10-28), OpenAI says:

- "By default, the agent runs with network access turned off."
- Locally, Codex "uses an OS-enforced sandbox that limits what it can touch (typically to the current workspace), plus an approval policy that controls when it must stop and ask you before acting."
- Codex's automatic approval reviewer "checks for data exfiltration, credential probing, persistent security weakening, and destructive actions."

When you turn on network access for sandboxed commands, Codex offers an optional network proxy with domain rules. Its [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) (read 2026-10-28) lists `features.network_proxy` as "experimental; off by default" and says it "Does not filter web search, apps, MCP, or other hosted tools." The same page says "App and connector traffic is not controlled by the sandboxed-command network proxy or its domain allowlist."

## What Pipelock adds

Codex's controls decide where a command may go and when you get asked. Pipelock looks at what the traffic carries, on the paths you route through it.

| Path | What Pipelock checks | How it's wired |
|---|---|---|
| Codex to an MCP server | Tool call arguments for secrets, credentials and injection patterns | `pipelock codex install`, or a manual `codex mcp add` wrap |
| MCP server back to Codex | Tool results for prompt injection, using six normalization passes | Same wrapper |
| Tool discovery (`tools/list`) | Poisoned descriptions, schema injection, and definitions that change mid-session | Same wrapper |
| Proxy-aware commands (curl, package managers, scripts) | Destination policy on HTTPS; DLP, SSRF and URL exfiltration checks, plus injection in responses, on plain HTTP or with TLS interception on | `pipelock run` with `HTTPS_PROXY` set |
| Hosted tools, web search, apps | Not covered | These don't pass through a local MCP wrapper or proxy |

A sandboxed agent can still carry a credential through a connection it's allowed to make. That's the case content inspection exists for. See [MCP tool poisoning](/learn/mcp-tool-poisoning/) for what discovery scanning catches.

## Set it up

### 1. Install Pipelock and generate a config

```bash
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}
pipelock generate config --preset balanced -o "$PWD/pipelock.yaml"
```

`balanced` isn't a warn-only mode on the MCP path. When `pipelock mcp proxy` starts with it, the wrapper logs `response=block`, `input=block`, `tools=warn` and `policy=warn` for an untrusted server. Secrets in tool arguments and injection in tool results are blocked from the first call, while tool-description findings and tool policy are logged as warnings. `pipelock generate config --list` shows every preset.

### 2. Wrap the registered MCP servers

```bash
pipelock codex install --config "$PWD/pipelock.yaml" --dry-run
pipelock codex install --config "$PWD/pipelock.yaml"
```

The installer reads the servers that `codex mcp list` reports and rewrites each one it can preserve to launch through `pipelock mcp proxy`. It embeds the absolute config path, so the wrapped servers don't depend on the directory Codex starts in. It skips servers that are already wrapped, so you can run it again after `codex mcp add` registers a new one. A server registered by URL becomes a stdio wrapper that reaches the original address through `--upstream`.

It also skips any server whose settings `codex mcp add` can't carry over: a disabled server, custom timeouts, a custom working directory, `env_vars` passthrough, an environment key it can't pass safely, or a URL server with auth or header settings. The dry run prints `skip <name> (<reason>)` for each one and ends with a `Plan:` line counting the servers it wraps and skips. The install still succeeds when it skips servers, and every skipped server keeps talking to Codex without Pipelock in between. Wrap those by hand (step 3) once you've moved the setting the installer can't keep, or accept that they're unprotected.

Restart Codex, then check:

```bash
codex mcp list
```

Confirm that each server's command is `pipelock`. Then prove the wrapper is in the path: call one tool per server with a synthetic test credential in an argument, such as the example access key AWS publishes in its documentation. A wrapped server answers with `pipelock: request blocked by MCP input scanning` instead of running the call. A successful call means that server isn't wrapped, because an ordinary tool call works the same with or without Pipelock.

### 3. Or wrap one server by hand

```bash
codex mcp add filesystem \
  -- pipelock mcp proxy --config "$PWD/pipelock.yaml" \
  -- npx -y @modelcontextprotocol/server-filesystem ~/projects
```

Codex stores MCP servers in `~/.codex/config.toml`, or in a trusted project's `.codex/config.toml`. A wrapped entry looks like this:

```toml
[mcp_servers.filesystem]
command = "pipelock"
args = [
  "mcp", "proxy",
  "--config", "/home/you/pipelock.yaml",
  "--",
  "npx", "-y", "@modelcontextprotocol/server-filesystem", "/home/you/projects"
]
```

### 4. Route proxy-aware commands through Pipelock

The `balanced` and `strict` presets ship with the forward proxy off, and `pipelock run` refuses CONNECT requests until you turn it on. Edit the config first:

```yaml
forward_proxy:
  enabled: true
```

Then start the proxy and point commands at it:

```bash
pipelock run --config "$PWD/pipelock.yaml" &
export HTTPS_PROXY=http://127.0.0.1:8888
export HTTP_PROXY=http://127.0.0.1:8888
export NO_PROXY=127.0.0.1,localhost
```

This only reaches commands that honor proxy variables, and only matters once you've given sandboxed commands network access. A tool that ignores `HTTPS_PROXY` or opens a raw socket goes around it. Use [`pipelock contain`](/learn/pipelock-contain-guide/) or another network boundary when you need that path closed.

Plain HTTPS through the proxy shows Pipelock the destination host, not the request body. Turn on TLS interception when you need headers and bodies scanned. See [known limitations](/learn/known-limitations/) for the CONNECT tunnel limit.

## Pass credentials to MCP servers

Codex's `codex mcp add --env` sets the wrapper's environment. Pipelock doesn't forward every wrapper variable to the MCP server it launches. Pass the ones a server needs with Pipelock's own `--env`:

```bash
codex mcp add my-server \
  -- pipelock mcp proxy --config "$PWD/pipelock.yaml" --env API_KEY \
  -- my-mcp-server
```

Pipelock refuses to pass code-loading variables and other blocked names into the server at startup.

## Undo it

```bash
pipelock codex remove --dry-run
pipelock codex remove
```

`remove` restores only the servers Pipelock wrapped. Registrations it doesn't recognize as Pipelock wrappers stay as they are.

## Check your controls

```bash
pipelock check --config "$PWD/pipelock.yaml"
pipelock verify-install --config "$PWD/pipelock.yaml"
```

`check` validates the config. `verify-install` runs synthetic scanner checks against it with a temporary proxy, so a pass shows the scanner works with that config. It reads the file as written. A generated preset leaves the MCP scanning sections unset, and `pipelock mcp proxy` turns them on when it starts, so `verify-install` reports those checks as failed until you enable them in the file. Neither command proves Codex is using your running proxy or your wrapped servers. The blocked synthetic-credential call in step 2 shows an MCP server is wrapped. It says nothing about the forward proxy. For that, run a proxy-aware command from a Codex session and confirm the request appears in Pipelock's log.

## Honest limits

- **Routed paths only.** Pipelock sees MCP servers you wrapped and commands that use the proxy. Servers the installer skipped, hosted tools, web search and apps don't pass through either.
- **Pattern-based detection.** Injection and poisoning checks match known patterns after normalization. A novel phrasing can pass.
- **No proxy, no coverage.** A command that skips the proxy is outside Pipelock's view unless containment forces the path.

The full register is on [known limitations](/learn/known-limitations/).

## Where to go next

- [MCP proxy](/learn/mcp-proxy/): how the wrapper scans both directions
- [MCP tool poisoning](/learn/mcp-tool-poisoning/): what discovery scanning and drift detection catch
- [Grok Build security](/learn/grok/): the same manual MCP wrap for a client without an installer
- [Claude Code security](/learn/claude-code-security/): hooks, egress inspection and containment for Claude Code
- [Pipelock contain](/learn/pipelock-contain-guide/): close the direct-egress path on Linux

Sources read 2026-10-28: OpenAI's [Codex security page](https://learn.chatgpt.com/docs/security), [approvals and security page](https://learn.chatgpt.com/docs/agent-approvals-security), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) and [MCP page](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), and the Pipelock v3.7.1 [Codex guide](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/guides/codex.md). OpenAI changes these pages; check them before relying on a quoted default.
