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

Pipelock ships with 65 built-in DLP patterns and 29 response scanning patterns. Pipelock detection rules from the community extend that with additional patterns maintained outside the release cycle.

## Install

```bash
pipelock rules install pipelock-community
```

That's it. Pipelock downloads the signed bundle, verifies the Ed25519 signature against the keyring baked into the binary, and installs the rules to `$XDG_DATA_HOME/pipelock/rules/` (typically `~/.local/share/pipelock/rules/`).

## What's Included

The `pipelock-community` bundle ships 28 rules across three categories:

**DLP patterns (secret detection):** 1Password service account tokens, Mapbox tokens, Cloudflare API tokens, PlanetScale passwords, Supabase keys, Linear API keys, Notion tokens, Airtable tokens, and more. These extend the 65 built-in patterns with provider-specific formats that change more frequently than the core release cycle.

**MCP tool poisoning detection:** Patterns that flag suspicious tool descriptions containing hidden instructions, data exfiltration commands, or prompt injection payloads. These scan the `description` field of MCP tool definitions for known attack patterns.

**Response injection patterns:** Additional prompt injection signatures for response scanning, covering techniques like invisible Unicode injection and cross-agent instruction leaking.

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

`format_version: 2` bundles add `tier` and `required_features`. Tier marks a bundle as `standard`, `community`, or `pro`. Required features fail fast if the runtime is missing something the bundle depends on, such as `dlp` or `checksum`. Those fields ship with format_version 2 bundles, not with the format_version 1 files on this site today.

The v3.3 change is about bundles that cannot prove compatibility: external or unsigned bundles without a valid version declaration no longer load implicitly. The signed bundles on this page are unaffected. See the [Pipelock v3.3 upgrade guide](/learn/pipelock-v330-upgrade/) before upgrading a deployment that depends on other external bundles.

## How Rules Merge

Installed rules merge with your config at startup. If a community rule has the same name as a built-in pattern, the built-in takes precedence. You can override this in your config YAML:

```yaml
dlp:
  include_defaults: true    # Keep built-in patterns (default)
  patterns:                 # Your custom patterns merge on top
    - name: "My Custom Key"
      regex: 'mykey_[a-z0-9]{32}'
      severity: critical
```

Community rules, built-in defaults, and your custom patterns all combine. Rules are deduplicated by name.

## Trust Model

Every community bundle is signed with an Ed25519 key. The public key is compiled into the pipelock binary at build time, so signature verification requires no network access and no external trust store.

The signing key is held offline (USB-stored, encrypted). Bundles are CalVer versioned (`2026.07.0`) and include a SHA-256 integrity hash in the lock file after installation.

To install unsigned local rules (for development or private use):

```bash
pipelock rules install --path ./my-rules/ --allow-unsigned
```

## Source

The rules source is on GitHub: [pipelab-org/pipelock-rules](https://github.com/pipelab-org/pipelock-rules). Contributions welcome. See CONTRIBUTING.md for the rule format and testing requirements.
