---
title: "Mediation Envelope Signing and Inbound Verification"
linkTitle: "Mediation Envelope"
subtitle: "Sign outbound proof. Verify inbound peers. Federate across orgs."
description: "Pipelock mediation envelope guide: RFC 9421 signing, inbound verification, SPIFFE actors, and the well-known directory for cross-org federation."
date: 2026-04-17
lastmod: 2026-05-04
og_image: "https://pipelab.org/images/og/og-product.png"
learn_cat: operator
level: deep
tags:
  - signing
  - rfc9421
  - ed25519
  - spiffe
  - federation
faq:
  - q: "What does the mediation envelope prove?"
    a: "It proves that a particular Pipelock instance mediated a request under a specific policy hash, with a specific actor identity, and a specific verdict. Downstream services or external auditors verify the signature against the publishing Pipelock's public key."
  - q: "What changed in v2.4?"
    a: "Pipelock v2.4 adds inbound envelope verification, SPIFFE actor format, a well-known signing-key directory per RFC 9421, and a replay cache. Outbound signing is unchanged from v2.2.0."
  - q: "Do I have to enable inbound verification?"
    a: "No. Inbound verification is opt-in. Without it, Pipelock strips inbound mediation headers unconditionally and treats the request as if it came from a non-mediated client."
  - q: "Why SPIFFE for the actor?"
    a: "SPIFFE IDs give every actor a cryptographically-defined trust domain. Free-form actor strings made it ambiguous whether two organisations were referring to the same identity. SPIFFE removes the ambiguity and lets a trust list pin a key to a specific trust domain."
---

Pipelock `v2.2.0` extends the proof story from logs and receipts onto the request path itself.

When `mediation_envelope.sign` is enabled, Pipelock can attach a signed mediation envelope to proxied HTTP and MCP traffic so downstream systems can verify what policy mediated the request.

## What the envelope carries

The mediation envelope is sideband metadata that tells the downstream system things like:

- action
- verdict
- actor identity
- policy hash
- receipt correlation
- taint state
- task ID

Without signing, that metadata is still useful, but it is just a header or `_meta` field. With signing, the downstream verifier can check that the envelope was produced by Pipelock and not rewritten along the way.

## Why this matters

This is useful when the downstream system needs more than a log line after the fact.

Examples:

- an internal gateway that wants proof a request passed through the expected policy
- an approval service that needs the policy hash and action before it accepts a side effect
- an audit pipeline that wants verifiable mediation metadata without scraping logs

In those cases, unsigned metadata is not enough.

## Signing model

Pipelock uses RFC 9421 HTTP Message Signatures with an Ed25519 signing key.

The important operator-facing details are:

- signing is opt-in
- startup fails closed if signing is enabled without a readable key
- reload also fails closed if the new signing key cannot be read
- the policy hash is canonicalized so formatting noise does not change it

That last point is what makes the policy hash useful for downstream verification. Reformatting the YAML should not look like a behavior change. Real behavioral changes still move the hash.

## Configuration shape

At a high level, enable:

```yaml
mediation_envelope:
  enabled: true
  sign: true
  signing_key_path: /path/to/ed25519-key
  key_id: pipelock-prod
```

The exact envelope and signing fields live in the upstream configuration reference, but the operational point is simple: do not turn signing on until the key path, reload behavior, and downstream verifier expectations are all understood.

## HTTP and MCP behavior

For HTTP traffic, the envelope is attached as a `Pipelock-Mediation` header.

For MCP traffic, the envelope is attached in `_meta["com.pipelock/mediation"]`.

In both cases, Pipelock strips forged inbound envelope and signature members before adding its own. That keeps caller-supplied mediation claims from bleeding through as if they were trusted.

## Redirects and downstream verification

`v2.2.0` also refreshes the envelope on allowed redirects, so redirect legs carry the right target, hop count, and signature state instead of stale metadata from the original request.

That matters because downstream verifiers are only useful if the signed envelope still matches the actual request they received.

## Inbound verification (v2.4)

`v2.2.0` shipped the outbound side. `v2.4.0` closes the loop by letting a Pipelock instance verify envelopes signed by another mediator before forwarding the request.

Inbound verification is opt-in. Add a `verify_inbound` block under `mediation_envelope`:

```yaml
mediation_envelope:
  verify_inbound:
    enabled: true
    trust_list:
      - key_id: "partner-pipelock-2026-q2"
        public_key: "64-char-hex-encoded-ed25519-public-key"
        well_known_url: "https://partner-org.example/.well-known/http-message-signatures-directory"
        trust_domains:
          - "partner-org.example"
    replay_cache:
      window: 5m
      max_entries: 100000
```

When verification is enabled, Pipelock requires a `Pipelock-Mediation` header on every inbound request. Missing signatures fail before any request body is buffered. Missing or invalid signatures reject 403 with a `block_reason` of `envelope_verify_failed` and a more specific `inbound_verify_*` audit pattern.

Use this only on hops where the immediate caller signs Pipelock mediation
envelopes. It is for Pipelock-to-Pipelock federation and other explicitly
signed clients, not for ordinary browser, CI, package-manager, or agent proxy
traffic. If a normal proxy client does not sign envelopes, enabling
`verify_inbound` will fail closed.

Trust list rules:

- `public_key` is the source of truth for inbound verification. It must be either a raw 64-character Ed25519 hex or the versioned `pipelock-ed25519-public-v1` format. Validated at config load.
- `well_known_url` is HTTPS metadata only. Inbound verification does not fetch from it. Rotate keys by editing `public_key` and hot-reloading.
- `trust_domains` restricts which SPIFFE actor trust domains a key may sign for. Empty accepts any actor under the key (migration default); a future release will require an explicit pin per key.

Replay cache notes:

- The cache keys on the envelope nonce, not the URL or body. Legitimate retries with different bodies still verify; a captured signed envelope cannot be replayed within the window.
- The cache is in-process. Multi-replica deployments need a window slightly larger than failover RTT so a request that arrives at replica B after replica A verified it does not falsely fail.

## SPIFFE actor format

Outbound envelopes write SPIFFE format by default in `v2.4`:

```text
spiffe://<trust-domain>/agent/<agent-name>
spiffe://<trust-domain>/mediators/<deployment-id>
```

Inbound accepts both SPIFFE and legacy free-form actors in `v2.4` (permissive). `v2.5` requires SPIFFE for inbound unless the operator explicitly selects legacy actor mode for migration.

SPIFFE parsing follows the SPIFFE-ID spec strictly. Pipelock rejects:

- Trust domains that are IPv4 or IPv6 literals. Both envelope verification and config validation reject IP-address trust domains so a federation peer cannot impersonate a domain by claiming a numeric host.
- Trust domains with userinfo, port, query, or fragment.
- Workload paths with empty, `.`, or `..` segments.
- Schemes other than `spiffe`.

Legacy free-form actors are flagged with `actor_format: "legacy"` in the verification result so operators can monitor migration progress.

## Well-known directory

Pipelock serves its current outbound mediation-envelope signing keys at the standard RFC 9421 path:

```http
GET https://<pipelock-host>/.well-known/http-message-signatures-directory
```

The response shape is a JSON `keys` array with `keyid`, `alg`, `public_key`, and `use: "pipelock-mediation"` per entry. External verifiers fetch the directory on a configurable interval.

The endpoint is unauthenticated because the keys are public verification material, not secrets. If you do not want this endpoint exposed to the public internet, gate it at your ingress layer. Deployments that are not signing envelopes return `404` for the route.

## Failure modes

Inbound verification rejects the request with HTTP 403 and increments `pipelock_envelope_verify_total{result="failed"}`. The receipt and audit-event `result` field carries a more specific pattern:

| Failure | Pattern |
|---|---|
| Inbound signature invalid | `inbound_verify_signature` |
| Inbound digest mismatch | `inbound_verify_digest` |
| Envelope structure malformed | `inbound_verify_parse` |
| Actor not in trust list | `inbound_verify_not_trusted` |
| Replay (nonce already seen) | `inbound_verify_replay` |
| Envelope expired | `inbound_verify_expired` |
| Inbound signature missing while enabled | `inbound_verify_missing` |
| Other / uncategorised | `inbound_verify_failed` |

Watch `pipelock_envelope_verify_total{result}` during soak. The closed result set is `disabled`, `verified`, `missing`, and `failed`. The counter increments even when verification is disabled so an operator can confirm the configured-off state from metrics alone.

## Outbound over-cap body limitation

When Pipelock signs an outbound mediated request, the signer buffers the body up to `mediation_envelope.max_body_bytes` (default 1 MiB) to compute the RFC 9421 `Content-Digest` header. If the body exceeds the cap the request is still signed, but `Content-Digest` is dropped from the declared component list and the signature covers headers and envelope only.

A standards-compliant RFC 9421 verifier reads `@signature-params` and knows the body was not covered. Partners running non-compliant verifiers may miss this and believe the body was authenticated. Mitigations:

- Confirm federation peers verify the declared component list and fail closed on missing `content-digest` for body-bearing requests. Pipelock's own inbound verifier does this correctly.
- Raise `mediation_envelope.max_body_bytes` to cover peak request size if peers cannot enforce the declared component list. The cap is buffer-cost driven, not security-driven.
- A `mediation_envelope.fail_closed_oversize_body` switch is planned.

## Deployment patterns

Two organisations, peer trust:

Org A and Org B both run with `verify_inbound.enabled: true`. Each pins the other's current `public_key` in `trust_list`, with `trust_domains` set to the partner's SPIFFE trust domain. Rotation is a config edit plus hot reload.

One organisation, multi-region:

Different deployments sign their own envelopes. A central audit pipeline maintains a single trust list with both regions' public keys, or pulls keys into a curated registry that both regions publish to.

External auditor:

The auditor does not run Pipelock at all. They use `pipelock-verify-python` 0.2.0 or later against the deployment's well-known directory and verify receipts the deployment emits without out-of-band coordination. The 0.1.x verifier pinned a SHA out of band; 0.2.0 uses the well-known fetch.

## When to turn this on

Enable outbound signing when downstream services already verify envelopes or you are integrating Pipelock into an approval or admission workflow. Enable inbound verification when peers also run Pipelock and you want a replay-protected, trust-list-bounded admission gate at your edge. Do not enable either side just because the feature exists. Key management without a verifier is overhead.

## Further reading

- [Pipelock v2.5 upgrade guide](/learn/pipelock-v250-upgrade/)
- [Pipelock v2.4 upgrade guide](/learn/pipelock-v240-upgrade/)
- [Pipelock v2.2 upgrade guide](/learn/pipelock-v220-upgrade/)
- [Pipelock posture verify](/learn/pipelock-posture-verify/)
- [Action receipt spec](/learn/action-receipt-spec/)
- [AI agent compliance](/learn/ai-agent-compliance/)
- [Pipelock v2.5.0 release](/blog/pipelock-v250-release/)
- [Pipelock v2.4.0 release](/blog/pipelock-v240-release/)
- [Pipelock v2.2.0 release](/blog/pipelock-v220-release/)
