---
title: "AI Redaction Placeholders: What They Mean"
linkTitle: "Redaction Placeholders"
seoTitle: "<private_person> Meaning: AI Redaction"
subtitle: "You found a token like <private_address> or <pl:aws-access-key:1> in an AI transcript. Here is what it means, which tool put it there, and whether the original value is recoverable."
description: "Decode AI redaction placeholders like <private_address>, <private_person>, and <pl:aws-access-key:1>: what each token means, what tool emits it, and why."
date: 2026-05-31
lastmod: 2026-05-31
learn_cat: concepts
level: intro
tags:
  - redaction
  - dlp
  - privacy
related:
  - ai-agent-data-redaction
  - ai-agent-data-loss-prevention
  - verifiable-egress-control
faq:
  - q: "What does <private_address> mean in an AI transcript?"
    a: "<private_address> is a redaction placeholder. A PII-redaction layer found a postal address in the text and replaced it with the label <private_address> before the text reached the model or the log you are reading. The lowercase <private_*> token shape is what OpenAI's open-source Privacy Filter emits. The original address is gone from the text you have; the placeholder is what remains."
  - q: "What does <private_person> mean?"
    a: "<private_person> marks a place where a person's name was removed by a redaction layer. OpenAI's Privacy Filter uses <private_person> for names of natural persons. Other PII tools use similar bracketed labels. The name itself is not in the redacted text."
  - q: "What does <pl:aws-access-key:1> mean?"
    a: "That is a Pipelock placeholder. Pipelock replaces a detected secret with <pl:CLASS:N>, where CLASS is the secret type (here, an AWS access key) and N is a per-request counter. <pl:aws-access-key:1> is the first AWS access key Pipelock found in that request. The format keeps the type visible to the model while removing the secret value."
  - q: "Can I recover the original value from a redaction placeholder?"
    a: "No. Redaction replaces the value before the text is forwarded or logged. The placeholder carries the type, not the data. There is no key and no lookup table in the placeholder itself. If you need the original, you have to go back to the source that existed before redaction ran."
  - q: "Why does the placeholder keep the type instead of using one generic token?"
    a: "A generic mask tells the model that something was here. A typed placeholder tells it what kind of thing was here, without handing over the value. An agent reading <pl:github-token:1> can still reason about the request shape. The same agent reading [REDACTED] loses that. Pipelock defaults to the typed form for exactly that reason, and it numbers per request so two removed values stay distinguishable while staying uncorrelated across calls."
  - q: "What is the difference between <pl:...> and [REDACTED]?"
    a: "Both come from Pipelock. <pl:CLASS:N> is the typed placeholder used when Pipelock rewrites a request body in place. [REDACTED] and [REDACTED: PatternName] are the strip-action form used elsewhere in the response path. The <pl:> form preserves type and count; the [REDACTED] form is a flat mask."
---

You opened an AI chat transcript, an agent log, or an API response and found a token like `<private_address>`, `<private_person>`, or `<pl:aws-access-key:1>` sitting where a real value should be. A redaction layer put it there. It found something sensitive and swapped in a label before the text reached the model or the log you are reading.

This page decodes the common placeholder vocabularies and tells you which tool emits each one.

## Quick decode

| You see | It means | Emitted by |
|---------|----------|------------|
| `<private_person>` | A person's name was removed | OpenAI Privacy Filter |
| `<private_address>` | A postal address was removed | OpenAI Privacy Filter |
| `<private_email>` | An email address was removed | OpenAI Privacy Filter |
| `<pl:aws-access-key:1>` | An AWS access key (the 1st in this request) | Pipelock |
| `<pl:email:2>` | An email address (the 2nd in this request) | Pipelock |
| `[REDACTED]` / `[REDACTED: PatternName]` | A value matched a secret pattern and was masked | Pipelock |

The original value is not in the text you have. Redaction runs before the text is forwarded or stored, and the placeholder carries the type, not the data.

## The `<private_*>` family: OpenAI Privacy Filter

The lowercase, angle-bracketed tokens like `<private_address>` are what [OpenAI's Privacy Filter](https://github.com/openai/privacy-filter) emits ([announcement](https://openai.com/index/introducing-openai-privacy-filter/)). It is an open-weight PII detection model that classifies spans of text into eight categories and replaces each span with a bracketed label. The categories it detects are account numbers, addresses, emails, names, phone numbers, URLs, dates, and secrets. The labels you are most likely to run into:

| Placeholder | Removed value |
|-------------|---------------|
| `<private_person>` | A person's name |
| `<private_address>` | A postal address |
| `<private_email>` | An email address |
| `<private_url>` | A URL |
| `<private_date>` | A date tied to a person |
| `<account_number>` | An account number |

Any other bracketed label you see follows the same idea: a category name standing in for a removed value. The redaction is irreversible from the output alone, and the original value is not encoded anywhere in the token.

## The `<pl:CLASS:N>` family: Pipelock

Pipelock is an [open-source agent firewall](/pipelock/). When it detects a secret in agent traffic and the policy is to redact rather than block, it rewrites the value in place as `<pl:CLASS:N>`:

- `CLASS` is the secret type (for example `github-token`, `email`, `ipv4`).
- `N` is a per-request counter. The first email is `<pl:email:1>`, the second is `<pl:email:2>`.
- Numbering restarts at 1 per class on every request, so nothing in the placeholder ties one request to another. The model keeps type information; it gains no way to correlate values across calls.

Pipelock's built-in classes:

| Category | Classes |
|----------|---------|
| Network | `ipv4`, `ipv6`, `cidr`, `fqdn`, `mac` |
| Identity / PII | `email`, `ssn`, `credit-card`, `ad-user`, `seed-phrase` |
| Cloud & infra keys | `aws-access-key`, `google-api-key`, `hashicorp-vault-token`, `databricks-token`, `supabase-service-key` |
| Source control & registries | `github-token`, `gitlab-token`, `npm-token`, `pypi-token` |
| Model & AI providers | `openai-api-key`, `anthropic-api-key`, `fireworks-api-key`, `huggingface-token`, `replicate-api-token`, `together-ai-key` |
| SaaS tokens | `slack-token`, `vercel-token`, `linear-api-key`, `notion-api-key`, `sentry-auth-token`, `telegram-bot-token`, `discord-bot-token` |
| Crypto material | `jwt`, `ssh-private-key`, `hash-md5`, `hash-sha1`, `hash-sha256`, `hash-sha512` |
| Generic | `env-secret` |

Some labels (`hash-ntlm`, `credential`, `known-secret`) are reserved for future detection profiles and are not matched by the built-in patterns yet. (`aws-secret-key` and `bearer` are now active redaction classes.)

Pipelock also uses a flat mask in its response path: `[REDACTED]` on its own, or `[REDACTED: PatternName]` when the matching pattern is named. That form drops the type. The `<pl:CLASS:N>` form keeps it.

## Why typed placeholders instead of one blank token

A generic mask tells the model that *something* was here. A typed placeholder tells it *what kind* of thing was here, without handing over the value. An agent reading `<pl:github-token:1>` can still reason about the request shape. The same agent reading `[REDACTED]` loses that. Pipelock defaults to the typed form for exactly that reason, and it numbers per request so two removed values stay distinguishable while staying uncorrelated across calls.

If you run Pipelock and want the full picture of how redaction is configured and where it sits in the scanner pipeline, see [AI agent data redaction](/learn/ai-agent-data-redaction/). For the broader model of inspecting and proving what an agent sent, see [verifiable egress control](/learn/verifiable-egress-control/).
