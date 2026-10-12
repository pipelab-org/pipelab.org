---
title: "Pipelock License Setup"
linkTitle: "License Setup"
subtitle: "Install your Pipelock Pro license token and verify it loaded."
description: "Pipelock license setup guide. Install your Pro or Founding Pro token, verify it loaded, and start using premium features."
date: 2026-05-14
lastmod: 2026-10-11
howto_steps:
  - name: Install your token
    text: Run pipelock license install with your emailed token. Copy the exact license_file line printed by the command into the configuration your Pipelock process uses.
  - name: Save the intermediate certificate
    text: If your license email includes an intermediate certificate, save its complete JSON in a separate file and set license_intermediate_file to that file's absolute path.
  - name: Verify the configured license
    text: Run pipelock license status with --config pointing to your configuration. Use the same license environment as your Pipelock process and check the verified status, features, and expiry.
  - name: Restart and confirm activation
    text: Restart the process or service that uses that configuration, then confirm the paid feature you configured works.
faq:
  - q: "Where does my license token come from?"
    a: "When you subscribe to Pipelock Pro or Founding Pro, Pipelock's license service signs an Ed25519 token tied to your tier and emails it to you. The token starts with the prefix pipelock_lic_v1_ followed by a base64url-encoded payload and signature. Keep it private; treat it like any API key."
  - q: "Where is the token stored on disk?"
    a: "Without `--path`, `pipelock license install` writes the token under your user home at `.config/pipelock/license.token`. The command prints its actual path and a `license_file` configuration line. Copy that line into the configuration your Pipelock process uses; a literal `~` in YAML is not expanded to your home directory. A nonempty `PIPELOCK_LICENSE_KEY` environment variable takes priority over `license_file`, which takes priority over an inline `license_key`."
  - q: "How do I verify the token loaded correctly?"
    a: "Run `pipelock license status --config /absolute/path/to/pipelock.yaml`, replacing the path with your actual configuration and using the same license environment as your Pipelock process. Check for valid status, the expected features, and the expected expiry. This verifies the configured credential locally; it does not query the running process. Restart Pipelock and confirm the paid feature you configured works. `license inspect` only decodes a token and cannot establish signature validity or activation."
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
Pipelock Pro and Founding Pro subscribers receive a license token by email. Use an official Pipelock release binary for these commands. Keep the token private.

## Install

Replace the placeholder with the token from your license email:

```bash
pipelock license install "<your-token>"
```

The command writes the token to a file and prints a section headed "Add to your pipelock config". Copy that exact `license_file` line into the configuration your Pipelock process uses.

The printed line is not quoted. If the path contains spaces, `:`, `#`, quotes, backslashes or other punctuation, wrap the value in single quotes, for example `license_file: '/opt/my license: v2/license.token'`. On a single line, YAML reads everything inside single quotes literally, including backslashes. If the path itself contains a single quote, write it twice: `'/opt/it''s/license.token'`. Quoting does not preserve line breaks, so when choosing a `--path` destination, use one without line breaks in any directory or file name.

Use the printed path. Do not substitute `~/.config/pipelock/license.token` in YAML: the configuration loader treats a literal `~` as part of a relative path.

For a different destination, choose an absolute path with `--path` and use the configuration line printed by that command. The account running Pipelock must be able to read the file.

If your license email includes an intermediate certificate, save its complete JSON in a separate file. Add its absolute path to the same configuration:

```yaml
license_intermediate_file: /absolute/path/to/license-intermediate.json
```

Replace that example with the file you saved. Keep the certificate and token in separate files.

For deployments already using `PIPELOCK_LICENSE_KEY`, put the token in the environment used by the actual process or service. A nonempty environment value overrides `license_file` and inline `license_key`. Installing a file does not replace that environment value. Configure the intermediate certificate in the YAML as described above.

## Verify

Check the configuration the process will use. Replace the example path and run with the same license-related environment as that process:

```bash
pipelock license status --config /absolute/path/to/pipelock.yaml
```

Check for:

- `License status: valid`
- The expected tier and feature list, including `agents` for Pro
- The expected expiry
- An intermediate certificate configured when one accompanied your license

For structured output, add `--json`.

This command verifies the configured credential and reports its status. It does not query the running process. The install command writes the token after checking its format; `license inspect` decodes its claims without checking the signature.

Restart the Pipelock process or service that uses this configuration. Then confirm the paid behavior you configured works, such as your named agent profile or per-profile listener. A successful status check alone does not establish that the running process loaded the same configuration.

## Offline by design

Pipelock verifies license signatures and expiry locally. A license delivered with an intermediate certificate is verified through that certificate to the release binary's embedded root public key. License verification does not require a phone-home request.

When you receive a replacement token, update the credential your deployment actually consumes:

- File-based setup: run `license install` again. If you used a custom destination, pass `--path` with that same absolute path.
- Environment-based setup: replace `PIPELOCK_LICENSE_KEY` in the process or service environment.
- Inline setup: replace `license_key` in the configuration.

Also save and configure the certificate supplied with the replacement license, if present. Repeat the verification, restart and paid-feature confirmation steps above. Receiving a replacement email does not update a running deployment.

## Troubleshooting

Start with `license status` using the actual configuration path and matching license environment.

If it reports an error, check:

1. The `license_file` path matches the installer's printed path and is readable by the account running Pipelock.
2. The certificate from the license email is saved separately and `license_intermediate_file` points to it.
3. `PIPELOCK_LICENSE_KEY` is not selecting an older token instead of the file you updated.
4. The verified expiry and feature list match the access you expect.

If status is valid but the feature remains unavailable, check that you restarted the intended process and that it uses the same configuration and environment you verified.

If you still need help, email luckypipe@pipelab.org with the Pipelock version, expected feature, and relevant status or error output. Never include the token or private keys. Review the output for subscription identifiers, organization details, local paths and other private information before sharing it.

## Related

- [Pipelock product page](/pipelock/)
- [Pipelock for Cursor](/learn/cursor-integration/)
- [Pipelock for JetBrains](/learn/jetbrains-integration/)
- [Pipelock for Claude Code](/learn/claude-code-hooks/)
- [Self-hosted Sure with Pipelock](/learn/sure-pipelock/) for a Helm deployment that wires the proxy into an assistant path
