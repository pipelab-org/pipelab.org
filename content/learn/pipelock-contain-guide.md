---
title: "Contain an AI Agent on Linux with Pipelock"
linkTitle: "Contain an AI Agent on Linux"
subtitle: "Install containment, grant one workspace, launch a tool, watch it, and verify what it changed."
description: "Contain an AI agent on one Linux host with pipelock contain. Install, grant a workspace, launch, watch the screen, and verify the signed change statement."
date: 2026-09-29
learn_cat: operator
level: intermediate
howto_steps:
  - name: Install containment
    text: Run sudo pipelock contain install with --config and --pipelock-binary. It creates the accounts, private network namespace, nftables rules and wrappers.
  - name: Register a tool
    text: Run sudo pipelock contain add-tool for each tool the contained agent may launch.
  - name: Grant a workspace
    text: Run sudo pipelock contain grant-workspace on one project directory, read-only by default, with an optional --expires.
  - name: Review the session contract
    text: Run sudo pipelock contain run --dry-run -- TOOL to print what the launch would grant without launching.
  - name: Launch the tool
    text: Run sudo pipelock contain run -- TOOL. Pipelock verifies the boundary, signs a posture capsule, launches the tool, and attempts to write a signed workspace change statement after it exits.
  - name: Verify the evidence
    text: Run pipelock posture verify with --proof, --key and --workspace-statement. Exit 0 passed, 1 could not complete, 2 verified but failed or incomplete.
faq:
  - q: "What does pipelock contain do?"
    a: "It splits one Linux host into three accounts: the operator, pipelock-proxy, and pipelock-agent. The agent runs in a private network namespace with no route off the host. It reaches only the Pipelock proxy and the services you declare, through sockets Pipelock forwards. nftables owner-match rules deny the agent account direct egress if a process ever runs outside the managed launch path."
  - q: "Do I need root?"
    a: "Yes for install, upgrade, rollback, add-tool, grant-workspace, revoke-workspace and run. verify, list-workspaces and posture verify do not change the host."
  - q: "Can I watch the contained agent's screen?"
    a: "Yes. With containment.display.viewer enabled, pipelock contain view opens a local socket that any VNC client can connect to. It is view-only unless you pass --control, and only one controller holds the display at a time."
  - q: "Does the workspace change statement back up my files?"
    a: "No. It is a signed list of added, removed and modified paths, unreadable entries and counts, with a boundary check and an incomplete flag and reason, bound to the posture capsule digest. It never contains file content, and Pipelock keeps no copy of what changed. Sizes, timestamps and digests are used internally to compare the before and after snapshots and are not in the statement. It is evidence that a difference exists, not a way to undo it."
  - q: "What does exit code 2 from pipelock posture verify mean?"
    a: "The signature is valid and the artifact is authentic, but a policy gate or the minimum score failed, or a bound workspace statement reports an incomplete observation. Exit 1 means verification could not complete and the artifact can't be trusted."
tags:
  - containment
  - linux
  - operator
  - evidence
---
`pipelock contain` runs an AI agent on your Linux host in a way the agent can't quietly leave. The agent gets its own network with no route off the machine, and the only ways out are the Pipelock proxy and services you name. This guide walks the whole lifecycle in the order you'd run it. The full flag reference is in the [`contain` CLI doc](https://github.com/pipelab-org/pipelock/blob/main/docs/contain-cli.md).

## v3.7 filesystem grants and socket isolation

`containment.filesystem.mode: enforce` gives managed launches a restricted filesystem view. It hides other home directories and signing material, binds unexpired workspace grants with their declared access, and refuses launch unless a canary confirms the profile took effect. New installs select `enforce`; existing configs that omit the setting keep filesystem enforcement off.

Managed launches also hide host `/run` and `/dev/shm` and verify the runtime mount evidence. Reinstall containment with the new binary and restart running services and sessions to adopt it. A binary swap alone doesn't update their mounts. Operator-written units are left unchanged.

A process able to create a user namespace can remount, same-user `/proc` remains visible, and private `/tmp` is shared with the namespace anchor and its forwarders. Socket access retains the documented boundary. The grant list alone doesn't prove filesystem isolation; verify the live launch. Read the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/) and [host containment reference](https://github.com/pipelab-org/pipelock/blob/main/docs/contain-cli.md).

## What containment is

Containment splits one workstation into three accounts:

- **The operator** is you. You own the install and reach the internet directly.
- **`pipelock-proxy`** runs Pipelock itself. It owns the config, the CA bundle and the binary-integrity pin, and the agent can't read its state directory.
- **`pipelock-agent`** runs the agent process inside a private network namespace (a separate copy of the network stack, with its own loopback and no external route).

Inside that namespace, a socket that Pipelock forwards is the only path to the proxy. Declared host services get their own forwarded sockets. On top of that, nftables owner-match rules key on the account that owns a socket, so if a process ever runs as the agent account outside the managed launch path, the kernel denies its direct egress.

One thing to know up front: the rule keys on the socket owner. A setuid or file-capability helper the agent can reach could egress under a different account. Keeping host setuid and sudo policy tight stays your job. See the Limits section.

## Prerequisites

- Linux with systemd. `contain run` needs systemd 254 or newer for its private `/tmp` and `/var/tmp`.
- nftables 0.8 or newer. Install fails with a clear error on an older `nft`.
- `certutil` (the `nss` tools package, named `libnss3-tools`, `mozilla-nss-tools`, `nss` or `nss-tools` depending on the distro), because install adds the Pipelock CA to the agent's browser certificate database and fails rather than reporting ready without it.
- Root access, usually through `sudo`.
- A Pipelock config that includes `flight_recorder.signing_key_path`, because `contain run` signs its evidence with that key.
- If `/usr/local/bin` isn't in sudo's `secure_path`, `sudo pipelock ...` reports "command not found". Install prints a warning with the fix.

## Install

```bash
sudo pipelock contain install \
  --config /etc/pipelock/pipelock.yaml \
  --pipelock-binary /usr/local/bin/pipelock
```

Add `--dry-run` first to print the planned steps without changing anything. Each step is idempotent, so rerunning is safe. If a step fails, install undoes what that attempt changed in reverse order. If an undo also fails, the error says `rollback incomplete` and tells you to rerun `pipelock contain install` as root.

Before touching the host, install runs `pipelock check` from the binary it is about to install against the config it is about to install. If that binary can parse the config but can't enforce it, for example named `agents.<profile>` entries on a build without agent profiles, install refuses before it replaces anything.

Hosts installed before v3.6.0 need `sudo pipelock contain install` with the v3.6 binary to move into the private network namespace. `contain upgrade` does not do that migration. See the [v3.6 upgrade guide](/learn/pipelock-v360-upgrade/).

## Register a tool

The agent can only launch tools you register. This adds a wrapper at `/usr/local/bin/plk-<name>` and puts the tool on the runtime allow-list.

```bash
sudo pipelock contain add-tool claude
```

Use `--target` to pin an explicit absolute path when the tool isn't resolvable from the agent's `PATH`.

## Grant a workspace

Workspace grants declare the project access. Hiding other host paths also requires `containment.filesystem.mode: enforce`; an existing config that omits it keeps that filesystem restriction off. By default the grant is read-only inside the directory and execute-only on its parents.

```bash
sudo pipelock contain grant-workspace /home/alice/src/my-project --mode read-write --reason "sprint-42 refactor" --expires 336h
```

`--expires` takes a Go duration such as `336h` or an absolute RFC3339 timestamp. An expired grant makes `contain run` refuse to launch and fails the `workspace_access` verify probe. Expiry gates the launch. It doesn't remove the access control entries on disk, so use `revoke-workspace` to take the access away:

```bash
pipelock contain list-workspaces
sudo pipelock contain revoke-workspace /home/alice/src/my-project
```

## Preview the session

Add `--dry-run` to run preflight and print the session contract without emitting evidence or launching. This is the way to review what a launch would grant. The example below is the one in the `contain` CLI doc:

```bash
sudo pipelock contain run --dry-run -- claude
```

```text
# Output, abridged.
pipelock contain run: session contract for claude
  agent user:       pipelock-agent
  proxy egress:     http://127.0.0.1:8888 (loopback proxy only; direct egress denied by nftables)
  posture capsule:  /var/lib/pipelock/contain/posture/proof.json
  agent temp dirs:  /tmp and /var/tmp private (isolated from the operator)
  registered tools: claude, codex
  workspaces:
    /home/alice/src/proj  read-write  owner=alice  created=2026-06-01T12:00:00Z  expires=never  [active]
```

The dry run applies the same expiry gate as a real launch. A grant already expired at the `workspace_access` preflight check exits 1 before the contract prints. A grant that expires after that check is refused by the final expiry check and exits 2.

## Launch

```bash
sudo pipelock contain run -- claude
```

Before starting the tool, `contain run` fails closed unless every containment probe passes. That includes a direct-egress canary from the agent account that must fail while the operator's succeeds, private `/tmp` and `/var/tmp` for the launch, a network namespace that differs from the host's, and a check that `pipelock-agent` can't run `sudo -n true`.

It then writes a signed posture capsule (a signed record of what boundary the agent was allowed) and starts the tool as `pipelock-agent`. Pipelock doesn't read or store the agent's API keys. The tool loads its own credentials from the contained account's environment and config.

Exit 0 means preflight passed and the tool exited cleanly. Exit 1 means containment was broken, posture emission failed, or the agent exited non-zero. Exit 2 is a usage or precondition error, including a grant that expires after the workspace preflight check.

## Watch the agent's screen

If the agent drives a browser, it needs a display. Enable one, and a viewer for a named operator account:

```yaml
containment:
  display:
    enabled: true
    backend: xvnc
    geometry: 1280x1024
    viewer:
      enabled: true
      operator_user: operator
      clipboard: false
```

`geometry` is one `WxH` token and defaults to `1280x1024`. Display and viewer changes need `sudo pipelock contain install` again. A config reload doesn't apply them.

Then, as that operator account:

```bash
pipelock contain view
pipelock contain view --control
```

`view` opens a local Unix socket, prints its path and an SSH forwarding example, and any VNC client can connect to it. The socket is reachable only by the calling operator account. Without `--control` the session is view-only, so a viewer can't type or click. With `--control`, at most one controller holds the display at a time. `--socket` overrides the default `$XDG_RUNTIME_DIR/pipelock-contain-view.sock`.

## Check what the agent changed

When the session has granted workspaces, `contain run` records a snapshot of each one before launch and again after the tool exits, and attempts to write a signed **workspace change statement** next to the capsule as `workspace-change-statement.json`. The statement lists the paths added, removed and modified between the two snapshots, unreadable entries, counts, `boundary_check`, and an incomplete flag with its reason, bound to the posture capsule digest. It compares two points in time. It isn't a continuous change history, and it doesn't show which process changed a file. It reports unavailable or incomplete evidence separately from the agent's exit status. It also prints one stable line you can key a script on:

```text
workspace_change_statement=written path=<path> boundary_check=<mode>
workspace_change_statement=incomplete reason="<why>" path=<path> boundary_check=<mode>
workspace_change_statement=unavailable reason="<why>"
```

Verify the capsule and statement together:

```bash
pipelock posture verify \
  --proof /var/lib/pipelock/contain/posture/proof.json \
  --key /path/to/pipelock-posture.pub \
  --workspace-statement /var/lib/pipelock/contain/posture/workspace-change-statement.json
```

The statement's own signature only proves the statement is authentic. `--workspace-statement` also re-hashes the capsule file and rejects the pair if it isn't the capsule this statement was bound to. The exit codes:

| Exit | Meaning |
|---|---|
| `0` | Signature valid, capsule fresh, policy gates and score passed, and any bound statement is complete. |
| `1` | Verification could not complete: bad file or key, signature mismatch, expired capsule or schema mismatch. Don't trust the artifact. |
| `2` | Authentic, but a policy gate or minimum score failed, or the bound statement is incomplete. |

An incomplete statement is real evidence of a partial observation, so it fails with exit 2. Relaxing policy won't change that result. Read the statement's incomplete reason instead. See [the posture verify guide](/learn/pipelock-posture-verify/) and [What did the agent change?](/blog/what-did-the-agent-change/) for why an empty change list only counts when the tool says it saw everything.

## Verify and diagnose

`verify` is read-only and proves the boundary is installed. `doctor` proves it's usable, by running live checks through the proxy. Run both as root.

```bash
sudo pipelock contain verify
sudo pipelock contain doctor
```

Both exit 0 when everything passes, 1 on a failure, and 2 when a check was skipped or inconclusive. `doctor` tags each remediation with a class (`policy`, `proxy-compat`, `local-context` or `infra`), so a tool that ignores `HTTPS_PROXY` reads as a compatibility note, not a broken agent. Add `--json` for newline-delimited records.

## Upgrade

```bash
sudo pipelock contain upgrade
sudo pipelock contain upgrade --version v3.7.0
```

Upgrade validates the managed config, downloads and verifies the release through the deployed binary, re-pins the integrity hash, restarts the service and runs `contain verify`. Any failure after the binary is replaced triggers rollback attempts for the binary and its pin. Exit 0 means every probe passed, 1 means it failed, and 2 is a precondition error. After a failure, read any rollback errors and verify the resulting binary and service state.

## Roll back

```bash
sudo pipelock contain rollback --dry-run
sudo pipelock contain rollback
```

Rollback undoes install: wrappers, the sudoers entry, nftables rules, the systemd unit migration and, by default, the two accounts. It keeps `/etc/pipelock` and `/var/lib/pipelock` unless you pass `--keep-data=false`, and it keeps the accounts with `--keep-users`. It is safe to rerun on a partial install.

## Limits

- **Host setuid and sudo policy is yours.** The built-in sudo canary catches direct `pipelock-agent` to root sudo access. It isn't an audit of every setuid helper on the host.
- **The statement lists paths, counts and observation limits, not contents.** Sizes, timestamps and digests are used internally for the comparison and aren't in it. It isn't a backup. Pipelock keeps no copy of what changed and has no restore path.
- **It covers granted workspaces only.** Changes outside them aren't recorded.
- **Large files have a digest cap.** Files over 10 MiB by default are compared by size and modification time, which marks the statement incomplete. Set `--workspace-diff-cap-bytes` to raise the cap when content comparisons are needed.
- **It can be incomplete.** An unreadable or mount-excluded path, an exceeded walk budget or a vanished workspace root makes the statement say so, and verification fails with exit 2.
- **Linux only.** `contain run` doesn't run on other platforms.
- **A posture capsule grades the boundary as observed by the kernel at attestation time.** It isn't a continuous kernel-enforced guarantee.

Next: [Upgrade to v3.7](/learn/pipelock-v370-upgrade/).
