---
title: "Pipelock v3.6 Upgrade Guide: Breaking Changes and Checks"
linkTitle: "Pipelock v3.6 Upgrade Guide"
subtitle: "Run the new binary check first, fix refused config, update tools that read receipts or scan verdicts, and reinstall containment."
description: "Pipelock v3.6 upgrade guide: run the binary check, fix refused host patterns and expiries, update receipt and Scan API readers, and reinstall containment."
date: 2026-10-02
faq:
  - q: "What should I do before upgrading to Pipelock v3.6?"
    a: "Run the new v3.6 binary against your current config with `pipelock check --config /path/to/pipelock.yaml`. Several values that loaded under 3.5 are refused in 3.6, and the error names the field. Fix those before you replace the running service."
  - q: "Why does a destination that worked on 3.5 block after upgrading?"
    a: "A config file that omits `fetch_proxy.monitoring.blocklist` now gets the shipped blocklist. Under 3.5 only the no-config path carried it, so a config without the key, including the Helm chart's default values, ran with an empty list. Set `blocklist: []` to keep it off."
  - q: "Do I need to reinstall containment?"
    a: "Yes. Run `sudo pipelock contain install` with the v3.6 binary to move the agent into its private network namespace, get private temporary directories, the 0600 config mode and the refreshed CA export. `contain upgrade` swaps and verifies the binary but does not do that migration."
  - q: "Can I copy a 3.6 preset onto an older binary?"
    a: "No. Shipped 3.6 presets set `arg_source: patch_targets` on tool-policy rules, which older binaries don't know, so they refuse the config at load. Upgrade the binary first. On a Conductor fleet, keep older followers on bundles without the field."
  - q: "What changes for tools that read receipts?"
    a: "Each Pipelock process now writes its own receipt chain, and a restart is a signed link to the tail it continues. Tools that read a single session file must read the run chains instead. `verify-receipt --chain` and `evidence doctor` follow the links."
learn_cat: concepts
level: ref
tags:
  - upgrade
  - v3.6
  - operator
  - containment
---
Pipelock v3.6 refuses some config that 3.5 accepted, and changes a few outputs that scripts read. Run the new binary against your current config before you replace a running service.

```bash
pipelock check --config /path/to/pipelock.yaml
```

Use the real production config path. Every refusal names the field, and most name the value and the fix.

## Config that now fails to load

Each of these was accepted by 3.5 and is refused by 3.6, at startup and on hot reload.

| What | Why | Fix |
|---|---|---|
| A host pattern in an allow, deny, trust or bypass list that isn't an ASCII hostname, or carries a URL, `host:port`, fragment, interior wildcard or malformed label | The pattern couldn't match what the matcher actually compares | Write the bare hostname, or `*.` plus a hostname |
| A wildcard in `tls_interception.passthrough_domains` over a public suffix, including shared private suffixes | Passthrough turns off body and response scanning for everything under it | List exact hosts, or intercept with a trusted local CA |
| A temporary exception whose expiry is past its field's maximum | Seven expiry fields now have a per-field horizon | Shorten the expiry. A config-sourced `sandbox.best_effort_expiry` must be an absolute RFC3339 time at most 30 days out, with a reason |
| `session_profiling.volume_spike_ratio`, top-level or per agent | Nothing ever read it | Delete the key |
| A custom DLP pattern that reuses a core pattern name and sets `exempt_domains` | The core floor never honored that exemption | Remove `exempt_domains` from it |
| `file_sentry.action: block` on the `pipelock run` server listener | That listener has no child process to stop, so block could only log | Use `action: warn` there. Subprocess MCP mode is unchanged |

`contain install` refuses to swap in a build that can't enforce a named-agent config. Plain `pipelock check` on a core build still validates that config and exits 0. Use `sudo pipelock contain install --dry-run` to check the candidate's ability to enforce it before replacing the running binary.

Building from source needs Go 1.26 or newer. Release binaries are built with Go 1.26.8.

## Behavior that changes without a config edit

**The shipped blocklist applies to config files.** A config file that omits `fetch_proxy.monitoring.blocklist` now gets the shipped list. Before 3.6 only the no-config path had it, which included the Helm chart's default values. Destinations on that list that were reachable under 3.5 now block. Set `blocklist: []` if you want it off.

**Request-body trust has its own list.** Outbound request bodies no longer read `response_scanning.exempt_domains`. If you relied on a response exemption to relax outbound bodies for a host, add it to `request_body_scanning.trusted_hosts`.

**Named agent policy follows bound identity only (Pro and Enterprise).** A per-agent listener or `source_cidrs` match selects a named profile. A self-declared `X-Pipelock-Agent` header is still recorded but gets the fallback policy.

**The kill switch blocks held MCP approvals** that haven't started sending. A held call used to forward after activation.

**When MCP receipts are required, a request forwards only after its receipt is durably written.** A failed receipt write blocks the request.

**Credentials can reach the service that issued them.** Built-in credential classes such as GitHub, GitLab, Slack, Google OAuth and the major model-provider keys are allowed on inspected traffic at their provider hosts over an encrypted connection. GitHub, GitLab and Google OAuth tokens also need the supported header or git path. Other checks still apply. Plain CONNECT without TLS interception relays opaque bytes, so headers and bodies aren't scanned there. If you exempted a provider host to get an agent working, you may be able to remove that exemption. For self-hosted GitHub Enterprise or GitLab, name the exact host in `dlp.github_enterprise_hosts` or `dlp.gitlab_hosts`.

**An allowed redirect goes back to the client.** The absolute-URI forward proxy no longer follows it itself. Clients send each hop as a separate request, so each hop gets admission and its own receipt. Ambiguous `Location` values are refused. `/fetch` still follows redirects itself.

**GitLab `Private-Token` and `Job-Token` headers are scanned by default.** Supported tokens sent to gitlab.com still pass. For self-managed GitLab, list the exact host in `dlp.gitlab_hosts`.

## Tools and CI that read Pipelock output

| Consumer | Change | What to do |
|---|---|---|
| Anything that reads receipts from one session file | Each process writes its own chain; a restart is a signed link to the tail it continues | Read the run chains. `verify-receipt --chain` and `evidence doctor` follow the links |
| CI that runs `audit-packet --offline` and reads success | Offline verification returns `verdict: schema_checked_trust_unverified`, with `trusted` and `valid` false, and exits non-zero | Require a full chain check with an explicit trust anchor. Clean reports carry `verification_mode` |
| Audit-log readers matching `redirect followed` | The message is now `redirect observed` | Update the message matcher |
| Receipt and deferred-resolution readers | Receipts add layer `kill_switch`; held HTTP calls add resolution source `upstream_contract` | Accept the new values |
| Scan API clients that expect only `allow` or `deny` | A `tool_call` that matches a warn-configured tool-policy rule returns `decision: "warn"` | Handle `warn` |

The canonical policy hash changes with the config shape and credential-audience rules, so receipt policy hashes shift on upgrade even if you edit nothing.

## Contained hosts

Run `sudo pipelock contain install` with the v3.6 binary. That moves the agent into its private network namespace, gives it private `/tmp` and `/var/tmp`, sets the config to mode `0600`, and refreshes the CA export, including the contained Chromium certificate store. `contain upgrade` is not a substitute: it swaps the binary, re-pins its integrity hash, adds the service marker, restarts the service and verifies, but it does not perform this migration.

Until you do, `contain verify` probe 3 reports the older loopback rules and names the fix. That's expected once on upgrade.

After upgrading, `sudo pipelock contain run --dry-run -- <tool>` prints the session contract the next launch will get, without launching. Check it before the first real session.

## New integrations

v3.6 adds installers for [Pi](/learn/pi/) and Continue.dev. Pi uses a named listener, which needs Pro. Neither changes existing configs until you run it, and both take `--dry-run` first.

## Conductor fleets

Upgrade followers before you publish a bundle that uses a 3.6-only field. A follower older than 3.6 refuses a bundle with `arg_source: patch_targets` at load rather than running without the rule.

The full change list is on the [GitHub release](https://github.com/pipelab-org/pipelock/releases/tag/v3.6.0). For what's new rather than what breaks, see the [v3.6 release post](/blog/pipelock-v360-release/).
