---
title: "AI Agent Data Redaction"
linkTitle: "AI Agent Data Redaction"
subtitle: "Rewrite secrets in transit before the agent sends them."
description: "Pipelock redacts AI agent secrets in flight using class-preserving placeholders across Anthropic, OpenAI, Gemini, and custom JSON providers."
date: 2026-04-24
lastmod: 2026-05-04
og_image: "https://pipelab.org/images/og/og-product.png"
faq:
  - q: "What is class-preserving redaction?"
    a: "Pipelock replaces a matched secret with a typed placeholder of the form `<pl:aws-access-key:1>`. The class label tells downstream tools the field shape they would have seen. Each `(class, occurrence)` pair gets one stable placeholder, so a value that appears twice in the same request gets the same placeholder both times. The original value is never stored anywhere; redaction is irreversible by design."
  - q: "Where does redaction run?"
    a: "Request-side only, on the outbound path before the data leaves the agent. Pipelock applies redaction on HTTP request bodies through fetch, forward, reverse, and TLS-intercepted CONNECT, on outbound WebSocket client messages through `/ws`, and on MCP `tools/call` `params.arguments` across stdio, HTTP/SSE, the HTTP listener, and MCP-over-WebSocket. Tool responses are not redacted in v2.3.0."
  - q: "Is this a credential vault?"
    a: "No. Pipelock holds no persistent agent credentials by design. Redaction inspects bytes as they cross the boundary and rewrites them in place. There is no plaintext store, no key escrow, no later retrieval. If you want a vault, use a vault. Pipelock is the gate that makes sure the wrong thing does not leave the agent."
  - q: "What payload formats are supported?"
    a: "JSON only in v2.3.0. The redactor decodes with `json.Decoder.UseNumber()` so numeric fidelity is preserved, walks both keys and values in `map[string]interface{}` to prevent key-smuggling evasion, and re-serializes with HTML escaping disabled so LLM-bound bodies stay byte-readable. Non-JSON HTTP bodies are blocked unless the destination host is on `allowlist_unparseable`."
  - q: "What happens on a parse error or limit overflow?"
    a: "The request blocks. Malformed JSON, numeric scalars containing secrets, key-collision rewrites, and exceeding `max_redactions_per_request` or `max_depth` all fail closed. Pipelock will not forward partially transformed data."
  - q: "How do I tune what classes get redacted on a given path?"
    a: "Profiles. Each profile lists the classes it activates. A `code` profile might redact AWS, GitHub, Slack, JWT, and SSH keys; a `business` profile might redact emails, FQDNs, and IPs. Pick a profile per path so a developer agent and a customer-facing agent can run on the same Pipelock with different rewrite policies."
  - q: "Does redaction show up in receipts?"
    a: "Yes. When at least one rewrite occurs, the signed action receipt grows a `redaction` block with the profile, total count, and a per-class breakdown. The plaintext is never on the receipt. Receipts with zero rewrites are byte-identical to receipts produced before v2.3.0 so existing verifiers continue to validate."
  - q: "What is not redacted and where will I see gaps?"
    a: "Tool responses (response-side redaction is v2 work), non-JSON request bodies on hosts not in `allowlist_unparseable`, multipart parts other than the JSON one, and outbound WebSocket fragments (partial JSON cannot be safely rewritten). Multimodal redaction (image OCR, PDF text, audio transcripts) is a separate scanner class and a multi-week build."
learn_cat: operator
level: deep
tags:
  - dlp
  - redaction
  - secrets
---

Pipelock `v2.3.0` adds class-preserving redaction. When an agent tries to send a secret across the network boundary, the proxy can rewrite the value in place with a typed placeholder before the request leaves.

This is not a vault. It is not a key store. It is the gate at which a secret either gets rewritten before egress or the request is blocked.

## What gets rewritten

The redactor walks JSON payloads, replaces matched values with typed placeholders such as `<pl:aws-access-key:1>`, then runs the normal request-side DLP scan on the rewritten bytes. Coverage in `v2.3.0`:

- HTTP request bodies on fetch, forward, reverse, and TLS-intercepted CONNECT paths
- Outbound WebSocket client messages sent through `/ws`
- MCP `tools/call` `params.arguments` across stdio, HTTP/SSE, the HTTP listener, and MCP-over-WebSocket transports

The same matcher and profile selection are used across every surface. Tool *responses* are not redacted in this release. Response-side redaction is tracked as a v2 follow-up.

## How a placeholder is chosen

A redaction placeholder has three parts:

```
<pl:aws-access-key:1>
   |   |             |
   |   class label   occurrence index
   prefix
```

- The class label tells downstream tooling what shape the field had. A model receiving a placeholder with `aws-access-key` knows it was an AWS credential.
- The occurrence index is stable within a single request. The same plaintext maps to the same placeholder so downstream code that needs to correlate two fields with the same secret can still do so without seeing the secret.
- The plaintext is never stored. There is no decode path. Redaction is irreversible by design.

This is "class-preserving" because the field shape survives even when the value does not.

For a full reference of every `<pl:CLASS:N>` token Pipelock emits, and how it compares to the redaction placeholders other tools use, see the [redaction placeholder glossary](/learn/redaction-placeholders/).

## A production-shaped config

```yaml
request_body_scanning:
  enabled: true
  action: warn

redaction:
  enabled: true
  default_profile: code
  profiles:
    code:
      classes:
        - aws-access-key
        - google-api-key
        - github-token
        - slack-token
        - jwt
        - ssh-private-key
    business:
      classes:
        - email
        - fqdn
        - ipv4
        - ipv6
      dictionaries:
        - customer-hosts
  dictionaries:
    customer-hosts:
      class: customer-host
      entries:
        - acme.internal
        - billing.acme.internal
      word_boundary: true
      priority: 80
  allowlist_unparseable:
    - api.anthropic.com
    - api.openai.com
```

A narrow `code` profile covers developer agents. Add a broader `business` profile for paths where you intentionally want hostnames, emails, or customer literals rewritten before they reach upstream systems.

`allowlist_unparseable` accepts bare lowercase hostnames only. No schemes, paths, or ports. Use it sparingly for trusted endpoints that legitimately require non-JSON request formats.

## Fail-closed rules

The redactor blocks rather than partially rewrites. Specifically:

- `redaction.enabled: true` requires `request_body_scanning.enabled: true`.
- Only complete JSON payloads are rewritten.
- Non-JSON HTTP bodies and complete non-JSON WebSocket messages are blocked unless the destination is on `allowlist_unparseable`.
- Outbound WebSocket fragments are blocked while redaction is enabled. Partial JSON cannot be rewritten safely.
- Malformed JSON, numeric scalars containing secrets, key-collision rewrites, or `max_redactions_per_request` / `max_depth` exhaustion all block the request rather than forwarding partially transformed data.

If something is unparseable or the limits are exceeded, the request does not get forwarded with half its secrets in the clear.

## Receipts gain a redaction block

When at least one rewrite occurs, the signed action receipt grows a `redaction` block:

```json
{
  "redaction": {
    "profile": "code",
    "total_redactions": 2,
    "by_class": {
      "aws-access-key": 1,
      "fqdn": 1
    }
  }
}
```

The receipt records what classes were rewritten and how many of each. The plaintext is never on the receipt. If nothing was rewritten, the `redaction` field is omitted, so receipts produced on traffic that needed no redaction stay byte-identical to receipts emitted by earlier releases.

## Provider parsers (v2.4)

`v2.3.0` shipped Anthropic and OpenAI parser profiles. `v2.4.0` adds Gemini and exposes a provider plugin shape so third-party JSON providers can drop in without forking the redaction package.

Pipelock now ships built-in parser profiles for:

- Anthropic (`api.anthropic.com`)
- OpenAI (`api.openai.com`)
- Gemini (`generativelanguage.googleapis.com`)

All three use the same JSON parser, which walks every string scalar in the request body. Provider matching is only used for parser selection and receipt labeling. It does not exempt `system`, `tools`, `messages`, Gemini `contents`, or any other field from redaction.

### Adding a third-party JSON provider

Add an entry under `redaction.providers`:

```yaml
redaction:
  providers:
    acme_llm:
      host_patterns:
        - api.acme-llm.example
      path_prefixes:
        - /v1/messages
      parser: json
```

Unknown JSON providers fall back to the generic JSON parser, so a missing provider profile is not a redaction bypass. The provider name appears on the receipt:

```json
{
  "redaction": {
    "profile": "code",
    "provider": "gemini",
    "parser": "json",
    "total_redactions": 2,
    "by_class": {
      "aws-access-key": 1,
      "fqdn": 1
    }
  }
}
```

The receipt records the parser and provider that handled the body, the count by class, and never the plaintext.

## What is intentionally out of scope today

- **Response-side redaction.** A model echoing a value the agent pasted is not rewritten by this feature. Existing response scanning still applies where configured. Response-body redaction is tracked as a follow-up.
- **Multimodal.** Image OCR, PDF text extraction, and audio transcript redaction are a separate scanner class. Tracked for `v2.5+`.
- **Provider-specific non-JSON rewriting.** Pipelock rewrites complete JSON payloads. Provider-specific multipart, binary, and multimodal body handling is out of scope for the request-redaction surface.

These are deliberate scope cuts so the surface ships precise rather than wide.

## See also

- [Mediation envelope signing](/learn/mediation-envelope-signing/): verifiable proof of which policy mediated a redacted request.
- [AI agent data loss prevention](/learn/ai-agent-data-loss-prevention/): the broader DLP surface that runs alongside redaction.
- [Pipelock](/pipelock/): the product page with the full transport list.
- [Pipelock v2.4 upgrade guide](/learn/pipelock-v240-upgrade/): how to roll out the v2.4 redaction provider surface.
- [Pipelock v2.3 upgrade guide](/learn/pipelock-v230-upgrade/): how to enable redaction on an existing install.
