---
title: "AI Agent Compliance: Audit Logs, Policy, and Evidence"
linkTitle: "AI Agent Compliance"
subtitle: "Prove your agents do what you say they do."
description: "AI agent compliance needs audit logs, runtime policy controls, and signed evidence. Map agent behavior to SOC 2, EU AI Act, and OWASP frameworks."
date: 2026-04-11
lastmod: 2026-08-24
faq:
  - q: "What do auditors need for AI agent compliance?"
    a: "Auditors need evidence that controls exist and function at runtime. For AI agents, that means structured audit logs showing mediated actions, policy configurations proving restrictions were in place, and tamper-evident records showing the logs were not modified after the fact. A description of your model or a list of intended behaviors is not sufficient."
  - q: "Which frameworks apply to AI agents?"
    a: "SOC 2 Trust Services Criteria apply when agents process customer data. Regulation (EU) 2026/1744 defers stand-alone Annex III high-risk obligations under the EU AI Act to 2 December 2027 and Annex I embedded-in-product safety-component obligations to 2 August 2028. NIST SP 800-53 Rev. 5 covers federal and regulated environments. The OWASP Top 10 for Agentic Applications (2026) defines the 10 most common agent-specific security risks. Each framework has different evidence requirements, but all of them require audit logging and runtime controls."
  - q: "How do you prove an AI agent followed policy?"
    a: "You need three things: records for mediated actions, evidence that policy controls were active during those actions, and tamper-evidence showing the records were not altered. Pipelock's flight recorder writes hash-chained JSONL logs with Ed25519 signed checkpoints. The pipelock assess command generates signed evidence bundles that map controls to specific framework requirements."
learn_cat: compliance
level: deep
tags:
  - compliance
  - soc2
  - nist
---
AI agents make HTTP requests, call external tools, read files, and write code. Each of those actions creates compliance exposure. If an agent leaks credentials, calls an unauthorized API, or follows a prompt injection into a policy violation, your organization owns the consequences.

AI agent compliance is the practice of proving that agents operated within defined boundaries. Not describing what they should do. Proving what they did.

## What Auditors Actually Ask

Auditors do not ask "what model do you use?" They ask:

- **What controls restrict agent behavior?** They want to see policy configurations, not architecture diagrams.
- **What evidence proves those controls were active?** Logs with timestamps, not a slide deck.
- **Can someone tamper with the evidence?** They look for integrity guarantees: hashing, signing, chain-of-custody.
- **What happens when a control fails?** They want fail-closed behavior, not "the agent retries."

The gap for most teams is that traditional application monitoring does not capture agent-specific actions. Your APM tool logs HTTP responses. It does not log which MCP tool the agent called, what arguments it passed, or whether DLP scanning blocked a credential in the request body.

## Risk Areas for AI Agents

Agents introduce risks that do not exist in traditional software:

**Data leaks.** Agents handle credentials, API keys, and customer data in tool arguments and HTTP bodies. A single unscanned request can exfiltrate secrets to an attacker-controlled domain.

**Unauthorized actions.** An agent with broad tool access can call APIs it was never intended to use. Without tool-level policy, there is no boundary between "allowed" and "not allowed."

**Unmonitored tool use.** MCP servers give agents access to databases, file systems, and external services. If tool calls are not logged, you have no record of what the agent did.

**Prompt injection leading to policy violations.** An attacker injects instructions into content the agent reads. The agent follows those instructions, bypasses its intended behavior, and the violation looks like normal operation unless you inspect the content that triggered it.

## Framework Mappings

Different frameworks ask for different things. Here is what each one requires for agents:

| Framework | Agent-Relevant Requirements | Evidence Type |
|-----------|---------------------------|---------------|
| **SOC 2** (TSC) | Access controls, monitoring, data confidentiality, processing integrity | Audit logs, policy configs, incident records |
| **EU AI Act** (Art. 9, 12, 14, 15) | Risk management, automatic event logging, human oversight, cybersecurity | Structured logs, override records, fail-closed evidence |
| **NIST 800-53** Rev. 5 | AC (access control), AU (audit), CM (config management), SI (system integrity) | Per-family control evidence, continuous monitoring data |
| **OWASP Agentic Top 10** | Goal hijack, tool misuse, supply chain, privilege abuse, rogue agents | Scanner results, tool policy logs, injection detection records |

SOC 2 auditors want to see that you know what your agents access and that you restrict it. The EU AI Act wants automatic logging and a stop button. NIST 800-53 maps to specific control families. OWASP gives you a threat checklist to test against.

If you need a scoring model for how runtime controls change agentic risk, see [OWASP AIVSS Coverage](/learn/owasp-aivss-coverage/).

For detailed framework-specific mappings, see [Compliance Evidence](/learn/compliance-evidence/), [EU AI Act Compliance](/learn/eu-ai-act-compliance/), [MITRE ATLAS Coverage](/learn/mitre-atlas/), [NIST AI RMF Coverage](/learn/nist-ai-rmf/), [HIPAA Security Rule Coverage](/learn/hipaa-security-rule/), and [SOC 2 Criteria Mapping](/learn/soc2-trust-services-criteria/).

## The Evidence Model

Compliance evidence for agents has four layers:

**Audit logs.** Structured records of mediated agent actions: URL, method, scanner verdict, timestamp, request ID. These are the foundation. Without them, nothing else matters.

**Signed receipts.** Each mediated action can get an Ed25519 signed receipt showing the mediator recorded an attempted action and reached a decision. Receipts include the policy hash that was active at the time, the verdict, and the transport surface that processed the action.

In `v2.2.0`, that evidence story extends in two useful directions: [Pipelock posture verify](/learn/pipelock-posture-verify/) gives you CI-friendly verification of signed posture capsules, and [mediation envelope signing](/learn/mediation-envelope-signing/) lets downstream systems verify what policy mediated a proxied request.

**Tamper-evident chains.** Receipts and log entries are hash-chained. Each entry includes the SHA-256 hash of the previous entry. Insert, delete, or reorder a record and the chain breaks. Signed checkpoints at configurable intervals provide cryptographic evidence the chain was intact at that point.

The deploying operator holds the signing key, so signed evidence proves what the boundary decided and that the keyholder signed it, not that the operator is honest. Operator-independent evidence requires external transparency-log anchoring with `pipelock anchor receipts --backend rekor` and pinned Rekor log keys; the local anchor backend is not operator-independent.

**Redaction for sensitive data.** Compliance logs should not become a second source of leaked secrets. DLP scanning runs on each entry before it is written. Matched patterns are replaced with redaction markers. For incident response, encrypted escrow sidecars preserve the original content under a separate key.

## Runtime Policy Controls

Evidence without enforcement is just observation. Agents need runtime policy controls that restrict behavior before it happens:

**Domain allowlists.** Agents can only reach domains you explicitly permit. Everything else is blocked.

**DLP scanning.** Credential patterns, environment variables, and high-entropy strings are detected and blocked in request bodies, URLs, headers, and MCP tool arguments.

**Tool restrictions.** MCP tool policies define which tools an agent can call and what arguments are allowed. Unauthorized tool calls are blocked at the proxy layer.

**Budget controls.** Rate limiting prevents runaway agent behavior. Per-agent profiles isolate settings so one agent's permissions do not leak to another.

**Human-in-the-loop.** Flagged actions pause the agent and require human approval. Timeout defaults to deny.

**Kill switch.** Six independent activation sources. Any one active blocks all traffic immediately.

## How Pipelock Supports Compliance

Pipelock is an open-source AI agent firewall that sits between agents and the network. It enforces policy at runtime and generates signed evidence for mediated actions when receipt or flight-recorder signing is configured.

**Flight recorder.** Hash-chained, tamper-evident JSONL audit log with Ed25519 signed checkpoints and DLP redaction. Every scan decision, policy action, and session event is recorded. See [Flight Recorder](/learn/flight-recorder/) for the full format.

**Signed assessment reports.** `pipelock assess` runs attack simulations, scores your config, verifies your installation, and discovers unprotected MCP servers. The output is a signed evidence bundle with framework-specific control mappings. Generate reports for auditors with a single command. See [Assess](/assess/).

**OWASP coverage.** Pipelock maps to all 10 categories in the [OWASP Agentic Top 10](/learn/owasp-agentic-top10/). Scanner layers are mapped to specific threat categories so you can show auditors exactly which control addresses which risk.

**Runtime enforcement.** Domain allowlists, DLP scanning, MCP tool policy, SSRF protection, prompt injection detection, rate limiting, and human-in-the-loop approval. Controls are active at runtime, not applied after the fact.

**Fail-closed architecture.** Scan errors, parse failures, DNS errors, and HITL timeouts all default to block. Auditors want to know what happens when something goes wrong. The answer is: traffic stops.

## Further Reading

- [Compliance Evidence](/learn/compliance-evidence/): Framework mappings and signed assessment bundles
- [EU AI Act Compliance](/learn/eu-ai-act-compliance/): Article-by-article control mappings with enforcement timeline
- [Flight Recorder](/learn/flight-recorder/): Hash-chained audit log format and configuration
- [Pipelock Posture Verify](/learn/pipelock-posture-verify/): signed posture capsules as a CI gate
- [Mediation Envelope Signing](/learn/mediation-envelope-signing/): downstream-verifiable policy mediation
- [OWASP Agentic Top 10](/learn/owasp-agentic-top10/): Per-threat coverage assessment
- [Assess](/assess/): Generate signed compliance reports
- [Pipelock](/pipelock/): Product overview and installation
- [GitHub](https://github.com/pipelab-org/pipelock): Source code and documentation
