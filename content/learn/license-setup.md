---
title: "Pipelock License Setup"
linkTitle: "License Setup"
subtitle: "Install your Pipelock Pro license token and verify it loaded."
description: "Pipelock license setup guide. Install your Pro or Founding Pro token, verify it loaded, and start using premium features."
date: 2026-05-14
lastmod: 2026-05-14
howto_steps:
  - name: Install your token
    text: Run pipelock license install with the token from your welcome email, then point license_file at the installed token path.
  - name: Verify it loaded
    text: Run pipelock license inspect to decode the token and confirm the tier, expiry, and feature flags.
  - name: Restart Pipelock
    text: Restart the pipelock process or service so the license loads from the configured file or environment variable.
faq:
  - q: "Where does my license token come from?"
    a: "When you subscribe to Pipelock Pro or Founding Pro, Pipelock's license service signs an Ed25519 token tied to your tier and emails it to you. The token starts with the prefix pipelock_lic_v1_ followed by a base64url-encoded payload and signature. Keep it private; treat it like any API key."
  - q: "Where is the token stored on disk?"
    a: "By default, pipelock license install writes the token to ~/.config/pipelock/license.token with file mode 0600. You can override the path with --path. At startup, Pipelock reads the file referenced by the license_file config key, or the value of the PIPELOCK_LICENSE_KEY environment variable if set."
  - q: "How do I verify the token loaded correctly?"
    a: "Run pipelock license inspect TOKEN to decode the payload locally. Confirm the tier, expiry, and feature list match what you expect. Inspect does not verify the cryptographic signature; the running pipelock binary does that at startup and refuses to load a bad signature. The inspect output also includes the email address and subscription ID associated with the token, so redact those before posting it to a public issue or shared channel."
  - q: "What if I lose the welcome email or the token?"
    a: "Email luckypipe@pipelab.org from the address tied to your subscription. Pipelock's license service can re-issue the token against your active subscription. Token rotation does not require a new subscription."
  - q: "Does Pipelock phone home with the token?"
    a: "No. License verification is offline. The pipelock binary verifies the token's Ed25519 signature against a compiled-in public key at startup. No network call is made for license enforcement. This is by design so air-gapped and self-hosted deployments work without a license server."
learn_cat: operator
level: intro
tags:
  - license
  - install
  - pro
---
Pipelock Pro and Founding Pro subscribers receive a signed license token by email after subscribing. The token unlocks premium features inside the pipelock binary. Setup is either an environment variable or an installed token file referenced from your config.

## Install

```bash
pipelock license install <your-token>
```

That writes the token to `~/.config/pipelock/license.token` with mode `0600`. Override the path with `--path` if you want it somewhere else.

Then add the installed path to your pipelock YAML:

```yaml
license_file: ~/.config/pipelock/license.token
```

If you prefer environment variables, set `PIPELOCK_LICENSE_KEY` to the token value and skip the file step:

```bash
export PIPELOCK_LICENSE_KEY="<your-token>"
```

## Verify

Decode the token locally:

```bash
pipelock license inspect <your-token>
```

The output shows the tier, expiry, and feature flags. This is a local decode, not a signature check; the running pipelock binary verifies the Ed25519 signature against its compiled-in public key at startup and refuses to load a tampered token.

To confirm the running process picked up the license, restart pipelock and exercise the Pro-tier behavior you configured, such as a named agent profile or per-profile listener. A tampered or expired token disables Pro-gated features and keeps single-agent protection active, so a clean restart plus the Pro behavior working is the confirmation.

## Offline by design

License verification is offline. The pipelock binary holds the public key; the token is signed with the matching private key on Pipelock's license service. No network call is made at runtime for license enforcement. This means:

- Air-gapped deployments work without a license server
- Self-hosted Pipelock running in an isolated VPC works without an outbound exception
- Token expiry is enforced locally based on the signed `exp` claim, not a remote check

If you rotate your token, run `pipelock license install` again with the new value and restart pipelock.

## Troubleshooting

If pipelock starts but the premium feature does not activate, run `pipelock license inspect <token>` and check three things:

1. The `exp` claim is in the future
2. The `tier` matches the feature you expected
3. The `features` list contains the feature flag the binary is checking

If those look right and the feature still does not activate, email luckypipe@pipelab.org with the inspect output. Redact your email address and subscription ID first if you would not paste them into a public issue, since inspect prints both alongside the tier and feature list. Include the pipelock version (`pipelock --version`) and the exact feature you expected.

## Related

- [Pipelock product page](/pipelock/)
- [Pipelock for Cursor](/learn/cursor-integration/)
- [Pipelock for JetBrains](/learn/jetbrains-integration/)
- [Pipelock for Claude Code](/learn/claude-code-hooks/)
- [Self-hosted Sure with Pipelock](/learn/sure-pipelock/) for a Helm deployment that wires the proxy into an assistant path
