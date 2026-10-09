---
title: "Pipelock v3.3 Upgrade Guide: Breaking Changes and Checks"
linkTitle: "Pipelock v3.3 Upgrade Guide"
subtitle: "Run the new binary check first, remove failed budget fields, and review every v3.3 behavior change before rollout."
description: "Pipelock v3.3 upgrade guide: run the new binary check, remove failed budget fields, review subject budgets, receipts, rules, and SNI."
date: 2026-07-31
faq:
  - q: "What should I do before upgrading to Pipelock v3.3?"
    a: "Run the new v3.3 binary against your current config with `pipelock check --config /path/to/pipelock.yaml`. This catches removed denial-of-wallet fields, reserved concurrency settings, audit-queue keyring advisories, and other load-time problems before you replace the running service."
  - q: "Which denial-of-wallet fields break config load in v3.3?"
    a: "`max_retries_per_endpoint`, `fan_out_limit`, and `fan_out_window_seconds` were removed. Earlier releases accepted them but did not enforce them. Pipelock v3.3 refuses to load a config that still sets any of the three, and the error names the exact field and file."
  - q: "What changed about denial-of-wallet budgets in v3.3?"
    a: "Budgets now key on a derived subject instead of the MCP session id. Bound and configured-default agent authentication can contribute an agent component. Self-declared and matched identities collapse to a client-only bucket, so a renamed or restarted agent does not receive a fresh allowance inside the same configured window."
  - q: "Why did my receipt policy hashes change after upgrading?"
    a: "The canonical policy hash changed in v3.3 because the policy surface changed. The new bundle-version configuration field and the new default response pattern both move the hash. Receipt policy hashes shift for every deployment on upgrade, even if you do not set the new field."
  - q: "Do unversioned rule bundles still load?"
    a: "Rule bundles that cannot prove compatibility no longer load implicitly. A build that cannot resolve its version no longer auto-satisfies `min_pipelock`. Strict startup starts without that bundle's rules, reports a `rule_bundle_degraded` audit event, and surfaces the shortfall through `/stats` and Prometheus."
  - q: "What changed for Audit Packet verification?"
    a: "Trusted Audit Packet verification now requires an external trust anchor. Existing automation that invokes `audit-packet` without `--key` or `--expect-sha256` fails closed. Add the trusted signer public key or a separately obtained SHA-256 digest of `packet.json`."
  - q: "Is Conductor durable audit-queue encryption automatic in v3.3?"
    a: "No. Encryption is opt-in through `conductor.durable_audit_queue_keyring`. A follower with no keyring keeps a plaintext queue and emits a startup and `pipelock check` advisory. When a keyring is configured, existing plaintext records migrate on startup and missing or invalid key material fails closed."
learn_cat: concepts
level: ref
tags:
  - upgrade
  - v3.3
  - denial-of-wallet
  - operator
---
Pipelock v3.3 has action-required changes. Run the new binary against your current config before you replace a running service.

```bash
pipelock check --config /path/to/pipelock.yaml
```

Use the actual production config path. The v3.3 binary names the exact offending field and file when a config still uses removed budget keys.

## Action-required checklist

Do these before rollout:

1. Run `pipelock check --config /path/to/pipelock.yaml` with the new v3.3 binary.
2. Remove `max_retries_per_endpoint`, `fan_out_limit`, and `fan_out_window_seconds` from every `budget:` block.
3. Remove `max_concurrent_tool_calls` or set it to zero.
4. Review denial-of-wallet windows, because `max_wall_clock_minutes` is now window-scoped active time and `window_minutes` defaults to 30 minutes when unset.
5. Check rule bundles that depend on `min_pipelock`, because bundles that cannot prove compatibility no longer load implicitly.
6. Expect receipt policy hashes to shift after upgrade.
7. Update trusted Audit Packet verification automation to pass `--key` or `--expect-sha256`.
8. Review CONNECT tunnel behavior if you use shipped forward-proxy profiles with SNI verification.
9. Decide whether to enable Conductor durable audit-queue encryption with a keyring.

## Breaking changes table

| Change | Old behavior | New behavior | What you do |
|--------|--------------|--------------|-------------|
| Removed budget field: `max_retries_per_endpoint` | Config accepted the field, but runtime did not enforce it. | Config load fails and names the offending field and file. | Remove it from every `budget:` block. |
| Removed budget field: `fan_out_limit` | Config accepted the field, but runtime did not enforce it. | Config load fails and names the offending field and file. | Remove it from every `budget:` block. |
| Removed budget field: `fan_out_window_seconds` | Config accepted the field, but runtime did not enforce it. | Config load fails and names the offending field and file. | Remove it from every `budget:` block. |
| Denial-of-wallet budget key | Budgets were keyed by MCP session id. A new session could receive a fresh allowance. | Budgets key on a derived subject. Bound and configured-default identity can contribute an agent component. Self-declared and matched identities collapse to a client-only bucket. | Test restart, rename, and new-session flows inside your configured budget window. |
| `max_tool_calls_per_session` meaning | Limited per session. | Limits per derived subject. The field name remains for configuration compatibility. | Keep the field if it expresses the right limit, but update runbooks to say subject, not session. |
| `max_wall_clock_minutes` meaning | Session-lifetime wall clock. | Window-scoped active time. | Set an explicit `window_minutes` if you depended on session-lifetime semantics. |
| Unset `window_minutes` | No v3.3 default window behavior. | Defaults to 30 minutes. A long-lived session receives fresh allowance every 30 minutes. | Set a larger or smaller explicit window to match your budget policy. |
| `max_concurrent_tool_calls` | Parsed as a config field. | Reserved. Validation rejects any nonzero value. | Remove it or set it to zero. Do not use it as an enforced concurrency cap. |
| Rule-bundle compatibility proof | A build that could not resolve its version could auto-satisfy a bundle's `min_pipelock`. | Bundles that cannot prove compatibility no longer load implicitly. Strict startup starts without those rules and emits `rule_bundle_degraded`. | Fix bundle metadata or use `rules.allow_unversioned_bundle_load` only as an explicit compatibility choice. Monitor audit, `/stats`, and Prometheus. |
| Canonical policy hash | Older policy-surface derivation. | Hash changes because bundle-version configuration and a new default response pattern moved the policy surface. | Expect receipt policy hashes to shift for every deployment. Update baselines and explain the planned hash move to auditors. |
| Control-actor names | Some reserved actor names could be used in agent configuration. | Reserved control-actor names are rejected at load. | Rename any configured agent that uses a reserved control name. |
| Rekor log-key acceptance | Wider key acceptance. | Acceptance is narrowed, and operators may drop the vendor rules key. | Check pinned Rekor keys. Update any deployment pinning a key outside the accepted set. |
| Source-build version | Source builds could report a placeholder version. | Source builds report a truthful VCS-derived version. | Recheck tooling that parsed or matched the old placeholder. |
| `pipelock mcp scan` and `pipelock explain mcp-response` verdict scope | Response findings could widen these command verdicts. | Verdicts are scoped to injection. | Review automation that interpreted response findings through those two command verdicts. |
| Trusted Audit Packet verification | Automation could invoke `audit-packet` without an external trust anchor. | Trusted verification requires `--key` or `--expect-sha256` and fails closed without one. | Add the trusted signer public key or a separately obtained SHA-256 digest of `packet.json`. |
| Forward-proxy CONNECT with SNI verification | CONNECT tunnel behavior could allow raw bytes or TLS without SNI unless separately blocked. | CONNECT can require TLS with SNI. Shipped profiles enable `forward_proxy.sni_require_tls` when SNI verification is on. | Test clients that use CONNECT. Use the documented compatibility opt-out only for known legacy clients. |
| Conductor durable audit queue | Existing queues stayed plaintext. | Encryption is opt-in through `conductor.durable_audit_queue_keyring`. With a keyring, plaintext records migrate on startup. Missing or invalid key material fails closed. | Decide whether to configure a keyring. Run `pipelock check` and document the startup advisory if you leave it plaintext. |

## Run the new binary check first

Download or build the v3.3 binary, then run it against the config you plan to deploy:

```bash
pipelock check --config /path/to/pipelock.yaml
```

This is a preflight. It does not require you to start the service with the new binary first.

When removed budget fields are present, the error names the field and file. The important part is the direction of failure: Pipelock refuses to load rather than silently ignoring a limit the runtime does not enforce.

## Commands affected by removed budget fields

Until the config is fixed, every subcommand that resolves the discovered config fails the same way.

Measured on a real pre-upgrade config, these fail until the removed fields are gone:

| Fails until config is fixed |
|-----------------------------|
| `rules verify` |
| `rules status` |
| `license status` |
| `signing pubkey` |
| `session list` |
| `adaptive status` |
| `baseline list` |

These commands do not resolve a config and are unaffected:

| Unaffected |
|------------|
| `version` |
| `doctor` |
| `discover` |
| `explain` |

After you remove the fields, rerun:

```bash
pipelock check --config /path/to/pipelock.yaml
```

Then rerun the command that originally failed.

## Review denial-of-wallet windows

The v3.3 budget model closes the easy reset path. A renamed, restarted, or newly sessioned agent no longer receives fresh allowance inside the same configured window when the derived subject is the same.

The window remains load-bearing:

- `window_minutes` defaults to 30 minutes when unset.
- `max_wall_clock_minutes` is now window-scoped active time.
- `max_tool_calls_per_session` now limits per subject, even though the field name remains.

If your old policy meant "this agent gets this many calls for the life of a session," translate that into an explicit window before upgrade.

For the concept and test sequence, see [Denial of Wallet](/learn/denial-of-wallet/).

## Update receipt and policy-hash expectations

The canonical policy hash changed in v3.3. That is expected. The policy surface changed because v3.3 added the bundle-version configuration field and a new default response pattern.

Operational impact:

- receipt policy hashes shift after upgrade
- golden files and auditor baselines need updates
- a hash change alone is not evidence of tampering during this planned upgrade

Trusted Audit Packet verification also changed. Automation must now pass an external trust anchor:

```bash
pipelock-verifier audit-packet /path/to/audit-packet --key /path/to/signer.pub
```

or:

```bash
pipelock-verifier audit-packet /path/to/audit-packet --expect-sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Replace the example digest with the 64-character hex digest of your `packet.json`. Use the command shape that matches your trust process. The key point is that trusted verification no longer accepts a packet as its own trust anchor.

Related references: [Action Receipt Spec](/learn/action-receipt-spec/), [Audit Packet Threat Model](/learn/audit-packet-threat-model/), and [Verifiable Egress Control](/learn/verifiable-egress-control/).

## Check rule bundles

Rule bundles that cannot prove compatibility no longer load implicitly.

In strict startup, the runtime starts without that bundle's rules rather than aborting the whole process. It reports the shortfall through:

- `rule_bundle_degraded` audit event
- `/stats`
- Prometheus gauge

That is an availability-class refusal. The service can come up, but the missing rules are visible. Treat the event as an upgrade blocker unless you intentionally allow an unversioned bundle during a compatibility migration.

## Check CONNECT clients

Forward-proxy CONNECT tunnels can require TLS with SNI in v3.3. Shipped profiles enable `forward_proxy.sni_require_tls` when SNI verification is on.

Expected result:

- raw CONNECT bytes are blocked
- TLS handshakes without SNI are blocked
- SNI-capable clients continue through the tunnel

If a legacy client cannot send SNI, use the documented compatibility opt-out deliberately and track the exception. Do not leave the blind spot implicit.

## Decide on Conductor durable audit-queue encryption

Conductor durable audit-queue encryption is opt-in through:

```yaml
conductor:
  durable_audit_queue_keyring: /path/to/keyring
```

If no keyring is configured, an existing follower keeps a plaintext queue. Startup and `pipelock check` report an advisory so the state is visible.

When a keyring is configured:

- existing plaintext records migrate on startup
- corrupt records are quarantined
- retired keys remain available for migration
- missing or invalid key material fails closed
- encrypted recovery enforces the maximum record size across restart and delivery

Roll this out as its own operator step. Key lifecycle deserves a rollback and recovery plan.

## Upgrade sequence

Use this order:

1. Fetch or build the v3.3 binary.
2. Run `pipelock check --config /path/to/pipelock.yaml`.
3. Remove failed budget fields and nonzero reserved concurrency values.
4. Set explicit denial-of-wallet windows where needed.
5. Review rule-bundle compatibility and expected `rule_bundle_degraded` alerts.
6. Update Audit Packet verification automation.
7. Test CONNECT clients that rely on forward proxying.
8. Decide on Conductor audit-queue encryption.
9. Replace the running binary.
10. Confirm startup logs, `/stats`, Prometheus, and receipt policy hashes match the expected upgrade state.

## See also

- [Pipelock v3.3 release notes](/blog/pipelock-v330-release/)
- [Denial of Wallet](/learn/denial-of-wallet/)
- [Agent egress security](/learn/agent-egress-security/)
- [MCP runtime security](/learn/mcp-runtime-security/)
- [Community rules](/learn/community-rules/)
- [Audit Packet Threat Model](/learn/audit-packet-threat-model/)
- [Pipelock v2.5 upgrade guide](/learn/pipelock-v250-upgrade/)
