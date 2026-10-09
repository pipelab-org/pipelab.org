---
title: "Pipelock v2.4 Upgrade Guide"
linkTitle: "Pipelock v2.4 Upgrade"
subtitle: "Roll out learned contracts without skipping shadow mode."
description: "Pipelock v2.4 upgrade guide: learn-and-lock rollout, block reason headers, inbound envelope verification, Gemini redaction, and health checks."
date: 2026-05-04
lastmod: 2026-05-04
og_image: "https://pipelab.org/images/og/og-product.png"
learn_cat: operator
level: ref
tags:
  - release
  - upgrade
  - v2.4
faq:
  - q: "Is Pipelock v2.4 a breaking upgrade?"
    a: "No public v2.3.x config break is expected. Existing configs continue to run. The new learn, health watchdog, block reason, redaction provider, and inbound verification surfaces are additive."
  - q: "Should I promote a learned contract immediately?"
    a: "No. Observe first, compile the candidate, review it, replay it in shadow mode, inspect the delta report, then ratify and promote only after the contract matches real behavior."
  - q: "What should I check before enabling inbound envelope verification?"
    a: "Confirm each trusted key has the right key_id, public key, replay window, and SPIFFE trust domain pins. Also confirm clock skew is within the configured created_skew_seconds."
  - q: "Will the health endpoint change?"
    a: "Yes. With the watchdog enabled, /health includes a subsystems map and returns 503 when scanner, config, session, kill switch, or watchdog liveness fails."
---

Pipelock `v2.4.0` is an additive upgrade for `v2.3.x` operators. Upgrade the binary first, then roll out the new controls deliberately.

## Upgrade the binary

```bash
# Homebrew
brew upgrade luckyPipewrench/tap/pipelock

# or container
docker pull ghcr.io/luckypipewrench/pipelock:2.4.0
```

For direct binary installs, download the `v2.4.0` artifact from the GitHub release and replace the existing binary.

Run:

```bash
pipelock version
pipelock check --config pipelock.yaml
```

## Review health consumers

The health watchdog is enabled by default:

```yaml
health_watchdog:
  enabled: true
  interval_seconds: 2
```

With the watchdog enabled, `/health` adds:

```json
"subsystems": {
  "scanner": true,
  "config": true,
  "session": true,
  "killswitch": true,
  "watchdog": true
}
```

The endpoint returns HTTP 503 when any tracked subsystem is unhealthy. Kubernetes liveness probes, systemd wrappers, and custom supervisors should treat consecutive 503s as a restart or drain signal.

## Read block reason headers

v2.4 adds a machine-readable block reason header set on HTTP block paths:

```http
X-Pipelock-Block-Reason: dlp_match
X-Pipelock-Block-Reason-Version: 1
X-Pipelock-Block-Reason-Severity: critical
X-Pipelock-Block-Reason-Retry: none
```

Teach wrappers and agents to branch on the retry hint:

- `none`: do not retry the same request.
- `transient`: retry with backoff if the user still wants the action.
- `policy`: retry only after an operator changes policy.

Do not parse human block bodies when the header is present. The header is the stable machine contract.

## Stage learn-and-lock

Learn-and-lock turns observed traffic into a signed candidate contract. Treat it as a staged rollout, not a one-command switch.

```bash
pipelock learn observe --config pipelock.yaml --capture-dir /var/lib/pipelock/learn
pipelock learn compile --config pipelock.yaml --agent claude-code
pipelock learn review candidate.yaml
pipelock learn shadow --contract candidate.yaml --agent claude-code --out shadow.md --out-json shadow.json
pipelock learn ratify --candidate candidate.yaml --interactive
pipelock learn promote --contract sha256:<contract-hash> --selector claude-code
```

Recommended sequence:

1. Observe enough real sessions to cover normal traffic.
2. Compile with deterministic output if you need reproducible review artifacts.
3. Read the markdown review before touching enforcement.
4. Run shadow replay and inspect would-have-blocked deltas.
5. Use `learn split` or `learn pin` when a path rule collapsed too much.
6. Ratify rule by rule.
7. Promote with lifecycle receipts and keep rollback ready.

Do not skip shadow mode. It is the guardrail that keeps a learned contract from becoming an outage.

## Configure inbound envelope verification

If you use mediation envelopes between Pipelock instances or downstream services, v2.4 can verify inbound peer signatures before forwarding.

```yaml
mediation_envelope:
  enabled: true
  sign: true
  signing_key_path: /etc/pipelock/envelope-sign.key
  key_id: pipelock-prod
  actor_format: spiffe
  trust_domain: prod.example
  verify_inbound:
    enabled: true
    trust_list:
      - key_id: partner-pipelock
        public_key: "64-char-hex-encoded-ed25519-public-key"
        well_known_url: "https://partner.example/.well-known/http-message-signatures-directory"
        trust_domains:
          - partner.example
    replay_cache:
      window: 5m
      max_entries: 10000
```

Checklist before enabling:

- Confirm every trusted key is current.
- Pin `trust_domains` for production peers.
- Keep `signature_expires` less than or equal to the replay cache window.
- Confirm clocks stay within `created_skew_seconds`.
- Verify the partner's well-known directory returns the expected key.

## Update redaction provider profiles

Pipelock now ships Anthropic, OpenAI, and Gemini provider profiles. Existing redaction configs keep working.

If you call Gemini endpoints, keep redaction enabled through the normal request-body path:

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
        - google-api-key
        - github-token
        - jwt
```

Provider matching labels receipts and selects parser behavior. It does not exempt Gemini `contents`, OpenAI `messages`, Anthropic `messages`, tools, system fields, or any other JSON string from redaction.

## Keep the SSE limitation in mind

Generic SSE per-event scanning remains active. Cross-event payload splitting is still only covered for A2A streams.

If you rely on generic SSE for untrusted upstreams, assume this limitation still exists:

- each event is scanned
- a malicious payload split across two sequential generic SSE events may evade the detector
- compressed SSE still blocks fail-closed

## See also

- [Pipelock v2.4.0 release notes](/blog/pipelock-v240-release/)
- [Learn-and-Lock Agent Contracts](/learn/learn-and-lock/)
- [Block Reason Headers](/learn/block-reason-headers/)
- [Health Watchdog](/learn/health-watchdog/)
- [Mediation Envelope Signing](/learn/mediation-envelope-signing/)
- [AI Agent Data Redaction](/learn/ai-agent-data-redaction/)
- [SSE Streaming Response Scanning](/learn/sse-streaming-response-scanning/)
