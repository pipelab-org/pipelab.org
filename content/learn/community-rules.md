---
title: "Pipelock Detection Rules: Community Collection"
linkTitle: "Pipelock Detection Rules"
subtitle: "Signed, versioned detection patterns you can install with one command."
description: "Pipelock detection rules from the community. 28 signed rules covering DLP patterns, MCP tool poisoning, and prompt injection scanning."
date: 2026-03-19
learn_cat: operator
level: intro
tags:
  - rules
  - hot-reload
  - detection
---

Pipelock ships with 65 built-in DLP patterns and {{< stat key="response_patterns" >}} response scanning patterns. Pipelock detection rules from the community extend that with additional patterns maintained outside the release cycle.

## Install

```bash
pipelock rules install pipelock-community
```

That's it. Pipelock downloads the signed bundle, verifies the Ed25519 signature against the keyring baked into the binary, and installs the rules to `$XDG_DATA_HOME/pipelock/rules/` (typically `~/.local/share/pipelock/rules/`).

## What's Included

The `pipelock-community` bundle ships 28 rules across three categories:

**DLP patterns (secret detection):** 1Password service account tokens, Buildkite user tokens, Doppler service tokens, Modal workspace keys and secrets, Perplexity API keys, Pulumi access tokens, Shopify tokens, and Vercel tokens. These extend the 65 built-in patterns with provider-specific formats that change more frequently than the core release cycle.

**MCP tool poisoning detection:** Patterns that flag suspicious tool descriptions containing hidden instructions, data exfiltration commands, or prompt injection payloads. Rules scoped to `scan_field: description` scan the tool description and description fields nested in its input schema. Built-in tool scanning still covers other agent-visible fields.

**Response injection patterns:** Additional prompt injection signatures for response scanning, covering techniques like invisible Unicode injection and cross-agent instruction leaking.

The published bundle contains stable and experimental rules. By default, `rules.include_experimental: false` skips experimental rules and `rules.min_confidence: medium` filters lower-confidence rules, so the installed total is not the active count. Check `pipelock rules status` for loaded counts.

## Managing Rules

```bash
pipelock rules list                         # Show installed bundles
pipelock rules update pipelock-community    # Pull latest version
pipelock rules verify                       # Re-verify all signatures
pipelock rules diff pipelock-community      # Compare installed vs remote
pipelock rules remove pipelock-community    # Uninstall a bundle
```

Pipelock `v2.2.0` adds `pipelock rules status`, which gives you a single runtime view of the active rule tiers, bundle sources, signed state, and loaded counts:

```bash
pipelock rules status
pipelock rules status --json
```

## What's New in Recent Releases

The bundles this site serves (`pipelock-community` and `healthcare-phi-pii`) are `format_version: 1` and declare the minimum Pipelock version they support (`min_pipelock`). They load on current Pipelock releases, v3.3 and later included, because they are signed by the official Pipelock rules key and carry a valid version declaration; the rules repository's CI verifies each bundle against both its declared minimum and the current Pipelock release before publication.

`format_version: 2` bundles add `tier` and `required_features`. Tier marks a bundle as `standard`, `community`, or `pro`. Required features fail fast if the runtime is missing something the bundle depends on, such as `dlp` or `checksum`. Version 2 also requires `key_id`, `monotonic_version`, `published_at`, and `expires_at` freshness metadata. These fields belong to version 2 bundles, not the version 1 files served here. New bundles should use version 2.

In v3.7.1, an unprovable running build version warns and loads a bundle by default. Set `rules.allow_unversioned_bundle_load: false` to refuse that case. A released runtime below `min_pipelock`, or an incompatible bundle format, is refused. Set the option explicitly during mixed-version upgrades because older binaries treat an omitted value differently.

## How Rules Merge

Installed bundles extend the built-in detection floor at startup. Community and Pro bundle patterns use namespaced IDs (`bundle:rule`) to avoid name collisions; they cannot override or disable core or standard rules. Bundle rules are deny-only. A bundle's `pattern.exempt_domains` is accepted for compatibility but ignored with a warning; configure exemptions locally instead.

Custom patterns belong in your local config:

```yaml
dlp:
  include_defaults: true
  patterns:
    - name: "My Custom Key"
      regex: 'mykey_[a-z0-9]{32}'
      severity: critical
```

Integrity failures such as bad signatures or mismatched lock files refuse startup in strict mode unless `rules.allow_degraded: true` is explicitly set. Availability failures mark the bundle state degraded. Non-strict modes start with the remaining rules and report degradation. On hot reload, strict mode also rejects removal of a previously live bundle unless that override is set. Use `pipelock rules status` to inspect errors; it returns non-zero if any bundle has an error.

## Trust Model

Official community bundles are Ed25519-signed. Pipelock verifies them against its compiled official keyring by default. Add third-party signer keys through `rules.trusted_keys`. With `rules.trust_embedded_keys: false`, only those configured keys are trusted and unsigned local bundles are rejected.

The installed lock file records a SHA-256 integrity hash. Freshness starts with trust on first use: a new machine cannot prove the first valid bundle it sees is the newest. Later installs and updates cannot move the saved monotonic version or format backward. Removing or resetting freshness state removes that local rollback history.

For local testing with the default trust policy, the CLI requires `--allow-unsigned` for a local directory install. It skips signature verification and logs a warning at startup:

```bash
pipelock rules install --path ./my-rules/ --allow-unsigned
```

## Installing through a Pipelock proxy

A bundle contains attack patterns, so a Pipelock proxy can block the download as prompt injection. Confirm the refusal in the proxy log. The v3.7.1 [rules guide](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/rules.md#installing-a-bundle-through-a-pipelock-proxy) documents `response_scanning.authenticated_artifacts` for an operator-approved exact official artifact. The proxy verifies the signature and bundle identity before skipping only response injection matching for that artifact. Request-side DLP and other controls still apply; no preset enables this exception.

## Source

The rules source is on GitHub: [pipelab-org/pipelock-rules](https://github.com/pipelab-org/pipelock-rules). Contributions welcome. See CONTRIBUTING.md for the rule format and testing requirements.

The [v3.7.1 rule-bundle contract](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/rules.md) covers formats, trust, merging, and degraded state. Run `pipelock rules schema` from a release-stamped binary to export its machine-readable contract.
