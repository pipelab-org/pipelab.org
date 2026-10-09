---
title: "Agent Evidence: SIEM and Detection Integration"
linkTitle: "Agent Evidence Integration"
related:
  - verifiable-egress-control
  - compliance-evidence
  - flight-recorder
subtitle: "Feed signed Pipelock receipts to your SIEM, analyst, or LLM funnel."
description: "Pipelock action receipts integrate with SIEM, audit, and LLM detection pipelines. Tamper-evident JSONL, hash-chained, Ed25519-signed."
date: 2026-04-24
lastmod: 2026-05-13
og_image: "https://pipelab.org/images/og/og-product.png"
faq:
  - q: "Why does an agent firewall need a downstream detection layer?"
    a: "Pipelock blocks what it can see on the wire. That is a hard, narrow job, and it is not the whole detection story. Long-running agents move through multi-week attack chains and produce actions that look benign in isolation. No real-time gateway will catch all of that. The gate is the first line, not the last. Signed receipts are the input the next line uses."
  - q: "Does Pipelock emit OpenTelemetry attributes for these decisions?"
    a: "Yes, when you opt in. Set emit.otlp.agent_threat_detection_emit: true and qualifying scanner-decision OTLP log records carry the proposed OTel agent.threat.detection.* attributes. The convention is unstable, so the flag is off by default and attribute names may change in subsequent Pipelock releases. The convention does not touch signed receipts; their schema and verifier conformance tests are separate."
  - q: "What is a signed action receipt?"
    a: "A JSON record Pipelock emits for every proxy decision when receipt signing is enabled. Each receipt carries the verdict, layer, pattern, transport, session, principal, policy hash, side-effect classification, and a hash-chain link to the previous receipt. Each one is Ed25519-signed. Any deletion or reordering breaks the chain and the verifier rejects the stream."
  - q: "How do I enable receipt signing?"
    a: "Generate a key with `pipelock keygen <name>`, set `flight_recorder.signing_key_path` to the key path in your Pipelock config, then start or restart Pipelock. Receipts begin streaming to `flight_recorder.dir` immediately. The public key portion is what downstream verifiers need; the private key never leaves the host running Pipelock."
  - q: "How is this different from logs?"
    a: "Logs are unstructured text shaped by whoever wrote the log line. An attacker who can influence the agent reasoning tokens can shape the log narrative. Receipts are fixed-field, signed, and chain-linked. The fields a detector cares about, including verdict, layer, pattern, policy hash, and timestamp, are not up for attacker manipulation."
  - q: "Which detection styles does this support?"
    a: "Three. SIEM rules (Splunk, Datadog, Elastic, anything that ingests JSONL) for real-time alerting. Analyst review for incident response and audit, where the chain proves the stream is intact. Long-window LLM detection where receipts are the structured input for funnels of cheaper-then-stronger models reasoning over agent history."
  - q: "How do I verify a stream?"
    a: "Use the built-in `pipelock verify-receipt`, the standalone `pipelock-verifier`, or an independent verifier listed in the receipt spec. Verifiers exit 0 on success and non-zero on any signature failure, chain break, or reordering. The receipt format is open and conformance vectors let other implementations verify the same streams."
  - q: "What does this not solve?"
    a: "Compromised mediators can still lie: a signed wrong answer is still a wrong answer. Real-time gateways still miss multi-week attacks. Receipts are input to detection, not a substitute for it. Agent-side attacks (code execution on the agent process, shared memory) are out of scope. And same-user deployments have a known ceiling: an agent running as the same Unix user can truncate the receipt file. Capability separation has to come from the deployment layer."
  - q: "Where is the schema?"
    a: "The canonical receipt spec is at `/learn/action-receipt-spec/` on this site. The Python reference verifier is at <https://pypi.org/project/pipelock-verify/>. Cross-implementation conformance vectors live in `sdk/conformance/` in the Pipelock repo."
learn_cat: compliance
level: deep
tags:
  - evidence
  - siem
  - receipts
---

[Pipelock](/pipelock/) is a real-time agent firewall. It blocks what it can see on the wire. That is a hard, narrow job, and it is not the whole detection story.

Long-running agents move through multi-week attack chains, reason in natural language, and produce actions that look benign in isolation. No real-time gateway will catch all of that. The gate is the first line, not the last.

This page is for the people building the layer that runs behind the gate. SIEM engineers, SOC analysts, and researchers training detection models all need the same thing upstream: structured, tamper-evident evidence of what the agent did. Pipelock emits that as mediator-signed action receipts.

## Why real-time gateways are not enough

Picture a malicious MCP server running a two-step attack across a week.

Step one, Monday: the agent calls an innocent-looking tool. The tool response tells the agent to install a hook that exfiltrates data to `https://google.com/report`. To an inline detector, that looks like a single bad tool response, but the destination is benign and the content might pass under a looser policy.

Step two, the following Monday: a different tool response tells the agent to change the hook's destination. To an inline detector, that request is a one-line config edit. The agent already has the hook. Changing an endpoint is not structurally suspicious.

Put the two steps next to each other and the intent is obvious. A detector looking at a week of activity sees the shape. A detector looking at a single request cannot.

Long-window detection is the only way to catch attacks designed to look like two benign things. The question is what you feed that detector.

## The primitive: mediator-signed action receipts

When `flight_recorder.signing_key_path` is set, every proxy decision produces a signed receipt. Receipts are Ed25519-signed, JSON-structured, and linked into a SHA-256 hash chain so any deletion or reordering is detectable after the fact.

Each receipt carries the fields a downstream detector needs:

| Field | What |
|-------|------|
| `action_id` | UUIDv7, unique per decision. |
| `timestamp` | RFC 3339 wall-clock time the decision was made. |
| `verdict` | `block`, `warn`, `exemption`, `allow`, `strip`, `redirect`, or `ask`. |
| `layer` | Which scanner triggered (`mcp_response_scan`, `dlp_header`, `response_scan`, `airlock`, etc.). |
| `pattern` | Named rule inside the layer (`Prompt Injection`, `aws_access_key`, etc.). |
| `transport` | `fetch`, `forward`, `websocket`, `mcp_stdio`, `mcp_http_upstream`, `mcp_http_listener`, `connect`, `intercept`. |
| `session_id` | Groups receipts from the same agent session. |
| `principal` / `actor` | Who initiated the action and who enforced it. |
| `policy_hash` | SHA-256 of the canonical policy config at decision time. Moves whenever the policy changes. |
| `side_effect_class` / `reversibility` | Classification of the attempted action. |
| `chain_prev_hash` / `chain_seq` | Hash-chain linkage to the prior receipt in the stream. |
| `signature` / `signer_key` | Ed25519 signature and public key. |

These are fixed fields. A detector parses them with a JSON reader, not a log regex. Full schema reference: [Pipelock action receipt spec](/learn/action-receipt-spec/).

## Three downstream consumers

The same receipt stream serves three detection styles without modification.

### SIEM rules

Ship the flight-recorder JSONL file to Splunk, Datadog, Elastic, or any SIEM that ingests JSON. The standard pattern is a file shipper (Filebeat, Fluent Bit, Vector) tailing `flight_recorder.dir` and forwarding each line. Filter to `type == "action_receipt"` at the shipper or at the SIEM.

The fields map cleanly onto structured search. Group by `session_id` to reconstruct a session. Filter `verdict=block` to audit enforcement. Alert on `pattern=aws_access_key` for secret-exfil attempts.

Pipelock also has a separate real-time emit pipeline (webhook, syslog, OTLP) for operator alerts. That is a different envelope format focused on severity. Receipts and emit events are complementary streams, not the same stream in different wrappers.

### Analyst review

When a SIEM rule fires or a session looks suspicious, an analyst pulls the full receipt stream for that `session_id` and reconstructs every decision in order. The hash chain confirms the stream has not been edited since it was written. The `policy_hash` confirms which policy was in force. The signature confirms the record came from Pipelock and not from a tampered agent log.

This is the audit-trail use case. Receipts are designed to be presentable to a third party (auditor, incident responder, internal review) without requiring trust in Pipelock itself. The signature and the chain are the trust anchors.

### Long-window LLM detection

If detection involves feeding agent history to a reasoning model and asking "is this suspicious", what you feed the model matters more than which model you pick. Raw log text lets an attacker shape the model's view by shaping the agent's reasoning tokens. Structured receipts do not.

A receipt stream is a deterministic sequence of fixed-field events. `verdict`, `layer`, `pattern`, `policy_hash`, and `timestamp` are not up for attacker manipulation. The attacker cannot inject text into the stream that changes what these fields say. The stream is signed and chain-linked, so injection is detectable.

That is the substrate a long-window LLM funnel runs on. Whether the funnel works is its own question. But if it does, it works on inputs the attacker cannot massage. Structured receipts are that kind of input. Raw reasoning tokens are not.

## OpenTelemetry attribute mapping

Receipts are the canonical form. They are also the artifact that has to survive long-term storage, third-party review, and offline verification. None of that requires a standard set of attribute names on the runtime telemetry side.

Some SIEM and observability deployments do want standard attribute names. They want one OTLP collector pipeline that ingests threat-detection events from every tool that emits them, keyed by the same attribute set, queryable with the same SIEM rules. An open OpenTelemetry semantic-conventions discussion proposes that shape ([`open-telemetry/semantic-conventions-genai#132`](https://github.com/open-telemetry/semantic-conventions-genai/issues/132)), and Pipelock operators can opt in.

When `emit.otlp.agent_threat_detection_emit` is on, Pipelock's existing OTLP log records gain convention attributes on qualifying scanner-decision events:

| Attribute | Value source |
|-----------|--------------|
| `agent.threat.detection.rule_id` | The matched rule. If a bundle pattern fired, the bundle's primary rule ID. Otherwise the scanner label (`ssrf`, `dlp`, `entropy`, etc.). |
| `agent.threat.detection.ruleset` | Source-specific identity. `pipelock-rules@<bundle-version>` if the match came from a loaded community bundle. `pipelock-core@<binary-version>` if the match came from built-in scanner logic. |
| `agent.threat.detection.severity` | `low`, `medium`, or `high`. Mapped from Pipelock's `info`, `warn`, `critical`. |
| `agent.threat.detection.action` | The enforcement decision: `allow`, `block`, `warn`, or `ask`. Pipelock suppresses its wider verdict surface (`strip`, `forward`, `redirect`) until the convention defines vocabulary for those. |
| `agent.threat.detection.correlation_id` | Opaque per-request identifier. Matches `request_id` inside the signed receipt for the same operation. Omitted when no request ID is present. |

The point of the `correlation_id` is the join back to receipts. Runtime telemetry is cheap to query, easy to fan out, and lives in the SIEM. Receipts are signed, chain-linked, and live in the audit store. The OTLP record names the operation; the receipt proves what happened. A consumer that wants both follows the link.

```text
OTLP log record (in SIEM)              Signed receipt (in audit store)
-------------------------              -------------------------------
agent.threat.detection.action=block    verdict=block
agent.threat.detection.severity=high   severity=critical
agent.threat.detection.rule_id=...     pattern=...
agent.threat.detection.ruleset=...     bundle_version=...    (matching bundle)
agent.threat.detection.correlation_id  --- request_id -------- matches
```

A worked example (one OTLP log record + one signed receipt joined by `correlation_id`, plus a README walkthrough) lives in the Pipelock repo at [`examples/agent-threat-detection/`](https://github.com/luckyPipewrench/pipelock/tree/main/examples/agent-threat-detection).

### Why this is off by default

The proposed convention is unstable. Maintainers may rename attributes, add or remove fields, change the action vocabulary, or reject the namespace entirely before any OTEP lands. Operators who opt in accept that attribute names may change in subsequent Pipelock releases.

The signed receipts themselves are not affected by the convention's state. They are Pipelock's own format, covered by cross-implementation conformance tests and published reference verifiers. Runtime telemetry is a separate concern with separate stability guarantees.

### Enabling

```yaml
emit:
  otlp:
    endpoint: "http://collector:4318"
    agent_threat_detection_emit: true
```

The flag is separate from the OTLP endpoint settings. With the endpoint set and the flag on, qualifying scanner-decision OTLP records gain the convention attributes. Pipelock leaves records without an identifiable scanner rule alone, including lifecycle events, configuration reloads, and kill-switch transitions. The original Pipelock-native fields stay on the same record.

## Verifying a stream

```bash
pipelock verify-receipt evidence/evidence-proxy-0.jsonl --key <public-key-hex>
```

Or use another verifier listed in the receipt spec, including the standalone `pipelock-verifier` binary and independent language implementations. The Python package remains available for ActionReceipt v1 streams:

```bash
pip install pipelock-verify
python -m pipelock_verify evidence/evidence-proxy-0.jsonl --key <public-key-hex>
```

All conforming verifiers exit 0 on success and non-zero on any signature failure, chain break, or reordering. The conformance corpus keeps implementations aligned on the same pass/fail vectors.

## Consuming receipts in a detector

Once the stream verifies, a downstream detector reads it like any JSONL source.

```python
import json
import subprocess
from typing import Callable, Iterator


def verified_receipts(path: str, pubkey_hex: str) -> Iterator[dict]:
    """Yield each receipt only if the full stream verifies."""
    check = subprocess.run(
        ["pipelock-verify", path, "--key", pubkey_hex],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        raise RuntimeError(check.stderr.strip() or check.stdout.strip())
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            entry = json.loads(line)
            if entry.get("type") != "action_receipt":
                continue
            record = entry["detail"]["action_record"]
            record.setdefault("session_id", entry.get("session_id"))
            yield record


def route_to_siem(receipt: dict) -> None:
    if receipt["verdict"] == "block":
        forward_to_siem(receipt)
    if receipt["layer"] == "mcp_response_scan":
        score_for_llm_funnel(receipt)


for receipt in verified_receipts("evidence.jsonl", PUBKEY_HEX):
    route_to_siem(receipt)
```

The shape of the consumer is up to you. The shape of the input is fixed by the receipt spec.

## What this does not solve

Signed receipts solve one narrow problem. They do not solve several others.

**Compromised mediators can still lie.** A receipt proves Pipelock recorded a decision. It does not prove Pipelock made the right decision. A signed wrong answer is still a wrong answer.

**Real-time gateways still miss multi-week attacks.** A slow-boiling attack where each step looks benign needs a long-window detector running on the receipt stream, not a faster gateway.

**Receipts are input to detection, not a substitute for it.** A stream of signed records does not tell you which sessions are compromised. Someone or something still has to look at the stream and make that call. Receipts give you a trustworthy place to look.

**Agent-side attacks are out of scope.** Pipelock sees what the agent tries to do on the network. If an attacker has already compromised the agent process (code execution, same-user file access, shared memory), receipts can document what the agent tried, but they cannot prevent the compromise.

**Same-user deployments have a known ceiling.** If Pipelock runs as the same Unix user as the agent, the agent can delete or truncate the receipt file. Capability separation has to come from the deployment layer (separate user, separate container).

## See also

- [Pipelock action receipt spec](/learn/action-receipt-spec/): canonical schema and field reference.
- [Agent Evidence Levels (AEL)](/learn/agent-evidence-levels/): the open standard that grades how much of an agent's evidence an outside party can verify.
- [AI Agent Data Redaction](/learn/ai-agent-data-redaction/): the v2.3 request-side redactor whose decisions also get receipts.
- [SSE Streaming Response Scanning](/learn/sse-streaming-response-scanning/): streaming-response decisions also produce receipts with the `sse_stream` layer.
- [Mediation envelope signing](/learn/mediation-envelope-signing/): in-flight signed metadata that complements the receipt audit trail.
- [Pipelock](/pipelock/): product page with the full transport and capability list.
