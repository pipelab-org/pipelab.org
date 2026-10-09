---
title: "Canary Tokens: Synthetic Secret Detection"
linkTitle: "Canary Tokens"
subtitle: "Plant fake credentials. Catch real exfiltration."
description: "Canary tokens for AI agent security. Plant synthetic secrets in Pipelock that trigger alerts when an agent attempts to exfiltrate them."
date: 2026-03-29
learn_cat: operator
level: intro
tags:
  - canary
  - detection
  - credentials
---

Canary tokens are synthetic secrets you plant in your environment. They look like real credentials but serve no purpose other than detection. If an agent tries to send one out, Pipelock catches it and blocks the request.

Unlike regex-based DLP patterns that match known formats, canary tokens match exact values you define. You control what the token looks like and where it lives.

## How It Works

When canary tokens are enabled, Pipelock compiles each token value into a normalized matcher at startup. Every outbound request (URLs, headers, bodies, MCP tool arguments) is scanned against these matchers.

The scanner normalizes canary values using DLP-specific decoding steps:

- **Unicode normalization** (NFKC, zero-width stripping, confusable mapping)
- **Iterative URL decoding** (peels encoded layers until stable)
- **Base64 and hex decoding** (catches encoded exfiltration)
- **Separator canonicalization** (strips dots, slashes, dashes, underscores, and other delimiters used to split tokens across URL segments)
- **Subdomain splitting** (detects tokens embedded as subdomain labels)

Note: canary token matching uses these DLP-specific steps, which differ from the 6-pass response/injection scanner pipeline (NFKC+confusable, invisible-to-space, leetspeak, optional-whitespace, vowel folding, base64/hex decode).

An agent that base64-encodes your canary, splits it across query parameters, or embeds it as subdomain labels will still trigger detection.

## Configuration

Add a `canary_tokens` section to your Pipelock config:

```yaml
canary_tokens:
  enabled: true
  tokens:
    - name: "fake-aws-key"
      value: "AKIAIOSFODNN7EXAMPLE1234"
      env_var: "CANARY_AWS_KEY"
    - name: "fake-db-password"
      value: "canary-pg-credential-do-not-use"
      env_var: "CANARY_DB_PASS"
```

Each token requires:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable label (appears in alerts and logs) |
| `value` | Yes | The synthetic secret value (minimum 8 characters) |
| `env_var` | No | Environment variable name to expose the token to agents |

Token names must be unique (case-insensitive). Token values must be unique and at least 8 characters long.

## Generating a Config Snippet

Pipelock includes a helper command:

```bash
pipelock canary --name db_canary --value "canary-db-credential-value" --env-var DB_CANARY
```

This prints a YAML snippet you can paste into your config. Add `--literal` to print the actual value (by default it emits an environment variable reference for safety). Use `--format json` for JSON output.

## Detection Severity

Canary token matches are always classified as **critical** severity. Any match means an agent is attempting to exfiltrate a credential it should never have used, which is a strong signal of compromise or misconfiguration.

## Deployment Pattern

1. Generate several canary values that resemble your real credential formats
2. Add them to your Pipelock config with descriptive names
3. Optionally set the `env_var` field so agents see them in their environment
4. Monitor for "Canary Token" alerts in your emit pipeline (webhook, syslog, or OTLP)

The `env_var` field is particularly useful for catching environment scanning attacks. If an agent enumerates environment variables and tries to exfiltrate them, the canary triggers before any real secret leaves.

---

[Back to Pipelock](/pipelock/) | [Proof](/proof/)
