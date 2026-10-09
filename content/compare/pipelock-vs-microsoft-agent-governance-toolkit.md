---
title: "Pipelock vs Microsoft AGT"
linkTitle: "Pipelock vs Microsoft AGT"
seoTitle: "Pipelock vs Microsoft AGT Compared"
subtitle: "An in-process governance SDK with policy, identity, sandboxing, and a hash-chained audit log, next to a network proxy that inspects the wire and signs each decision from outside the agent."
description: "Compare Pipelock with Microsoft's Agent Governance Toolkit: in-process policy and audit chains versus network-path inspection and signed receipts."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "evidence"
compare:
  subject: "Microsoft Agent Governance Toolkit"
  subject_job: "MIT-licensed Python and TypeScript SDK that intercepts an agent's tool calls, resource access, and inter-agent messages inside the process, enforces capability policies, issues cryptographic agent identity, sandboxes execution, and keeps a Merkle-chained audit log."
  subject_boundary: "The Python interpreter, in the SDK's own words; the agent process holds the policy engine, its credentials, and its network access"
  subject_source: "Open source, MIT (Microsoft)"
  subject_pricing: "Free"
  subject_deploy: "pip install or npm install into the agent as governance middleware; a CLI for policy linting and compliance checks"
  pick_subject: "You build agents in Python or TypeScript, want capability policy, agent identity, trust scoring, and an audit chain inside the framework, and your threat model trusts the agent process itself."
  pick_pipelock: "You need enforcement the agent cannot skip because it sits outside the process, content inspection of what actually leaves on the wire, and, once a signing key is configured, a signed receipt per mediated decision from a key the agent never holds."
  pick_both: "AGT's own layered-defense diagram puts network isolation in a layer beneath it. Pipelock is that layer with inspection: AGT decides which actions the code may attempt, Pipelock decides what may cross the boundary and records it."
sources:
  - label: "microsoft/agent-governance-toolkit README"
    url: "https://github.com/microsoft/agent-governance-toolkit"
    checked: 2026-09-01
    note: "MIT; pip and npm packages; policy, identity, sandboxing, SRE, hypervisor and compliance modules; PromptDefense evaluator; OWASP Agentic Top 10 and AARM Extended badges; VERSION file reads 5.0.0"
  - label: "AGT Known Limitations and Design Boundaries"
    url: "https://raw.githubusercontent.com/microsoft/agent-governance-toolkit/main/docs/LIMITATIONS.md"
    checked: 2026-09-01
    note: "action governance, not reasoning governance; no indirect prompt injection detection; audit logs record attempts, not outcomes; knowledge and credential-persistence gaps; recommended layered architecture with an infrastructure layer for network isolation"
  - label: "AGT architecture document"
    url: "https://raw.githubusercontent.com/microsoft/agent-governance-toolkit/main/docs/ARCHITECTURE.md"
    checked: 2026-09-01
    note: "security model table; the enforcement boundary is the Python interpreter; production recommendation to add container isolation and network policies"
  - label: "AGT audit and compliance specification 1.0"
    url: "https://raw.githubusercontent.com/microsoft/agent-governance-toolkit/main/docs/specs/AUDIT-COMPLIANCE-1.0.md"
    checked: 2026-09-01
    note: "hash-linked Merkle audit chain; JSONL default backend; commitment records for external anchoring; per-entry signatures are not part of the v1.0 audit entry"
faq:
  - q: "What's the difference between Pipelock and Microsoft's Agent Governance Toolkit?"
    a: "AGT is a library the agent imports. It intercepts tool calls and messages inside the agent process, enforces policy there, and writes a hash-chained audit log. Pipelock is a proxy outside the process. It inspects the HTTP, WebSocket, and MCP traffic the agent produces, blocks what policy forbids, and, once a signing key is configured, signs a receipt per mediated decision from a key the agent never holds. AGT's architecture document says its enforcement boundary is the Python interpreter; Pipelock's is the network boundary."
  - q: "Does AGT detect prompt injection or scan what leaves the agent?"
    a: "Its Known Limitations page says it governs what agents do, not what they think or say, and that it does not detect indirect prompt injection that corrupts the agent's reasoning. It ships a PromptDefense evaluator for testing prompts and regex blocked_patterns for tool arguments. Pipelock scans the request body, the response, and the tool description on the wire, with encoding-aware DLP and multi-pass normalization."
  - q: "Can I run Pipelock and AGT together?"
    a: "Yes, and AGT's own layered-defense diagram describes the shape: a governance layer inside the agent for action policy, identity, and trust, and an infrastructure layer beneath it for network isolation. Pipelock is the network layer, with inspection and receipts added."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It sits on the network path outside the agent, inspects HTTP, WebSocket, and MCP traffic for credential leaks, prompt injection, SSRF, and tool poisoning, and, once a signing key is configured for its flight recorder (which `pipelock contain install` does), signs a receipt for every mediated decision from a key the operator holds. Single Go binary, any agent routed through it.

**[Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit)** is an MIT-licensed SDK for Python and TypeScript. Its README describes policy enforcement, zero-trust identity, execution sandboxing, and reliability engineering for autonomous agents, installed with one `pip install` into any framework. Its modules cover a policy engine, an agent mesh with Ed25519 identity and trust scores, runtime sandboxing with privilege rings, a compliance CLI, and a hypervisor with execution audit and a command denylist.

The difference is where each one stands. AGT's architecture document states it plainly: "The enforcement boundary is the Python interpreter, which is the same trust boundary used by every Python-based agent framework." The agent process holds AGT's policy engine, the agent's credentials, and the agent's network access, all in one trust domain. Pipelock stands outside that domain. The agent has no egress except through the proxy, and the proxy holds no agent credentials.

## Feature comparison

| Feature | Pipelock | Agent Governance Toolkit |
|---------|----------|--------------------------|
| **Architecture** | Network proxy, single self-hosted binary | In-process SDK and middleware, Python and TypeScript |
| **Enforcement boundary** | The network path; the agent cannot reach the internet except through it when the deployment routes egress that way | The interpreter, per its architecture document |
| **What it governs** | HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, MCP stdio and HTTP, A2A | Tool calls, resource access, and inter-agent messages inside the process |
| **Policy** | Domain rules, tool policy, request policy in config | Capability policies in YAML (`governance.toolkit/v1`), linted by the `agt` CLI |
| **Agent identity** | Not a function of the proxy | Ed25519 and SPIFFE certificates with a 0 to 1000 trust score, per its architecture document |
| **Content inspection** | Encoding-aware DLP on bodies and arguments, injection normalization on responses, tool-description fingerprinting | Regex `blocked_patterns` on tool arguments; a PromptDefense evaluator for testing prompts |
| **Prompt injection at runtime** | Deterministic patterns with multi-pass normalization on scanned responses | Its limitations page states it does not detect indirect prompt injection that corrupts reasoning |
| **Process sandbox** | Landlock, seccomp, and network namespaces on Linux; sandbox-exec on macOS | Runtime sandboxing with four privilege rings; container isolation recommended on top |
| **Audit record** | Signed receipt per mediated decision when the flight recorder and signing key are configured; Ed25519, hash-linked, verifiable offline against the operator's published key | Merkle-chained audit entries in a JSONL file by default, with commitment records for external anchoring; records attempts, not outcomes, per its limitations page |
| **Compliance mappings** | OWASP MCP Top 10, OWASP Agentic Top 15, OWASP LLM Top 10, NIST 800-53, EU AI Act | OWASP Agentic Top 10, NIST AI RMF, SOC 2, EU AI Act, AARM Extended, per its README |
| **Framework coupling** | None; anything whose traffic is routed through it | Python, TypeScript, and OpenCode packages; "any framework" per its README; the agent must import it |
| **License** | Apache-2.0 core; Enterprise under ELv2 | MIT |

## Where Agent Governance Toolkit is stronger

**Governance inside the framework.** Capability policies, cryptographic agent identity, and trust scoring between agents are things a network proxy does not do. If the question is which agent may take which action under which identity, AGT answers it.

**Reach into the process.** It sees tool calls that never touch the network: a local file write, a function call, a message between two agents in the same runtime. Pipelock only sees what crosses the wire.

**Breadth of modules.** Policy, identity, sandbox, SRE, hypervisor, compliance CLI, and a red-team evaluator, in Python and TypeScript, under one MIT project.

## Where Pipelock is stronger

**The boundary the agent cannot skip.** A library inside the process governs the code that calls it. A compromised agent, a monkeypatched adapter, or a subprocess that never imports the SDK is outside its reach. AGT's own architecture document recommends adding container isolation and network policies for exactly that reason. Pipelock is enforcement at that layer, when the deployment routes all egress through it ([containment](/capabilities/agent-containment/) or a container with the proxy as its only route).

**Content on the wire.** AGT's limitations page says it governs what agents do, not what they say, and lists indirect prompt injection and the flow of confidential knowledge to an allowed channel as gaps, with regex blocked-patterns and egress domain policies as the mitigations available today. Pipelock's scanning is the wire-level version of those mitigations: encoding-aware credential detection in bodies and arguments, injection normalization on responses, and tool-description drift.

**Evidence from outside the process.** With a signing key configured for its flight recorder, Pipelock signs every mediated decision. AGT's audit specification describes a hash-linked Merkle chain written to JSONL by default, with commitment records for external anchoring; per-entry signatures are not part of its v1.0 audit entry. Both approaches keep the material on the deployer's side, so neither makes the operator independent of the evidence; the honest phrasing for both is "verify the chain yourself, offline."

## The layered picture, in AGT's own terms

```text
Model safety layer      Azure AI Content Safety, Llama Guard      (AGT's diagram)
AGT governance layer    policy, identity, trust, audit           (inside the agent)
Application layer       your agent code
Infrastructure layer    containers, network policies, IAM        (AGT's diagram)
                        ^ Pipelock lives here, with inspection and receipts
```

AGT's limitations page ends its architecture section with "AGT is one layer in a defense-in-depth strategy, not the entire strategy." The infrastructure layer in that diagram is where an agent firewall sits.

## Further reading

- [What is an agent firewall?](/agent-firewall/): definition and evaluation checklist
- [Pipelock vs agent evidence tools](/compare/pipelock-vs-agent-evidence-tools/): the receipt-format comparison across five tools
- [Pipelock vs LlamaFirewall](/compare/pipelock-vs-llamafirewall/): an in-process guardrail library at the model boundary
- [Agent firewall vs agent sandbox](/compare/agent-firewall-vs-agent-sandbox/): the execution-boundary side of the layered picture
