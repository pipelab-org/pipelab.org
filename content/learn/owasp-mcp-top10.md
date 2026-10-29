---
title: "OWASP MCP Top 10 (MCP01:2025 through MCP10:2025): Risks and Practical Defenses"
linkTitle: "OWASP MCP Top 10"
seoTitle: "OWASP MCP Top 10 2025: Risks and Defenses"
subtitle: "MCP01:2025 through MCP10:2025 explained, with the runtime controls that actually stop each risk category."
description: "OWASP MCP Top 10 (MCP01:2025-MCP10:2025): each risk category explained with the scanner, gateway, inspection, and audit controls that stop it."
date: 2026-04-12
lastmod: 2026-08-08
faq:
  - q: "What is the OWASP MCP Top 10?"
    a: "The OWASP MCP Top 10 is OWASP's first Top 10 project dedicated to Model Context Protocol security. It catalogs the ten most common risk categories in MCP deployments, from token mismanagement and tool poisoning to shadow MCP servers and context oversharing. The project is in beta as of 2026 under the lead of Vandana Verma Sehgal, published as MCP01:2025 through MCP10:2025. It is a community framework, not a standard."
  - q: "How does the OWASP MCP Top 10 differ from the OWASP Top 10 for LLMs?"
    a: "The OWASP Top 10 for LLMs covers the model and the application that wraps it: prompt injection at the model layer, training data poisoning, output handling, and similar concerns. The OWASP MCP Top 10 focuses on the protocol an agent uses to call external tools. That means tool poisoning, server authentication, audit gaps, and shadow servers. There is overlap on prompt injection, but the MCP framework looks at where injection enters through tool descriptions and tool responses, not through the user prompt. Most teams need both."
  - q: "Which tools cover the OWASP MCP Top 10 risks?"
    a: "No single tool covers all ten risks. Pre-deploy scanners catch tool poisoning and supply chain issues at install time. Runtime proxies inspect tool calls and responses while the agent runs and catch rug-pulls, command injection, and prompt injection via contextual payloads. Identity gateways handle authentication and scope enforcement. Audit log platforms cover the telemetry gap. Network allowlists and MCP gateways add policy at the routing layer. A defensible MCP deployment combines four to six of these categories so each tool covers a different row of the matrix."
  - q: "Does Pipelock cover the OWASP MCP Top 10?"
    a: "Pipelock covers the runtime inspection rows: tool poisoning, prompt injection through tool responses, credential leaks, context oversharing, and part of command-injection defense. Its shipped mapping marks audit and telemetry covered, and shadow MCP partial: local discovery does not enforce an organization-wide registry or approval workflow. It does not replace an identity gateway for authentication, authorization, token lifecycle, or per-tool scopes."
learn_cat: compliance
level: ref
tags:
  - owasp
  - mcp
  - OWASP-MCP
---
The [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10) is the first OWASP framework dedicated to Model Context Protocol security. It catalogs the ten risk categories most likely to compromise an MCP deployment, from token mismanagement to shadow servers. The project is in beta as of 2026 under the lead of Vandana Verma Sehgal, with categories published as MCP01:2025 through MCP10:2025.

This page explains every category, then maps each one to the control type that actually mitigates it. The matrix is the core of the page. No single tool category covers all ten risks, and the honest answer about any vendor (including Pipelock) is that it covers some rows fully, some partially, and others not at all.

If you want background on the protocol itself, start with [MCP Security](/learn/mcp-security/) and [MCP Vulnerabilities](/learn/mcp-vulnerabilities/). For the broader ecosystem of tools that fit into the matrix below, see [MCP Security Tools](/learn/mcp-security-tools/). For a 2026 view of how the market is responding, read [The State of MCP Security 2026](/blog/state-of-mcp-security-2026/).

## What the OWASP MCP Top 10 is

OWASP runs several Top 10 projects. The web Top 10 has been around for two decades. The [Top 10 for LLM Applications](/learn/owasp-llm-top10/) launched in 2023. The [Top 10 for Agentic Applications](/learn/owasp-agentic-top10/) followed in 2025. The OWASP MCP Top 10 is the newest entry and the first to focus on a single protocol surface.

The project page lives at [owasp.org/www-project-mcp-top-10](https://owasp.org/projects/mcp-top-10). At time of writing, the framework is in Phase 3, beta release and pilot testing, which means the categories are stable enough to cite but the rankings and descriptions may shift. Check the project page for the current license terms before commercial use.

The framework exists because MCP changed the risk model for AI agents. Before MCP, an agent had a small fixed set of tools coded into the application. With MCP, the agent discovers tools at runtime from any server it can reach, and every server is a trust boundary. The OWASP MCP Top 10 catalogs the ten ways that boundary fails most often.

The categories are based on real incidents. The Postmark MCP supply chain compromise, the MCPJam Inspector RCE, the mcp-remote command injection CVE, the Mend.io shadow MCP report, the CyberArk "Poison Everywhere" research, and the Equixly data on missing MCP authentication all show up somewhere in the framework. You can think of the Top 10 as a structured index of attacks people have already paid for in production.

## The ten risk categories

The list below uses the live OWASP MCP Top 10 categories as published on the project page. Because the framework is in beta, descriptions and ordering may change. Check the [official OWASP page](https://owasp.org/projects/mcp-top-10) for the current version before you cite specific wording in audit material.

| ID | Category | What it covers |
|----|----------|----------------|
| MCP01:2025 | Token Mismanagement & Secret Exposure | Hard-coded credentials, long-lived tokens, secrets in logs or model context |
| MCP02:2025 | Privilege Escalation via Scope Creep | Permissions that expand over time, agents acquiring unintended capabilities |
| MCP03:2025 | Tool Poisoning | Malicious tool descriptions or schemas that hijack agent behavior |
| MCP04:2025 | Software Supply Chain Attacks & Dependency Tampering | Compromised packages, backdoored servers, poisoned dependencies |
| MCP05:2025 | Command Injection & Execution | Agents constructing system commands from untrusted input |
| MCP06:2025 | Prompt Injection via Contextual Payloads | Injection that hijacks the agent's reasoning chain through context |
| MCP07:2025 | Insufficient Authentication & Authorization | Servers that fail to verify identity or enforce access controls |
| MCP08:2025 | Lack of Audit and Telemetry | Missing logs, no real-time alerting, no record of what happened |
| MCP09:2025 | Shadow MCP Servers | Unapproved MCP deployments operating outside governance |
| MCP10:2025 | Context Injection & Over-Sharing | Sensitive data leaking across users, sessions, or agents |

The middle of the framework is where most production incidents happen. Tool poisoning, supply chain compromise, and command injection together account for the majority of disclosed MCP CVEs. Authentication gaps and shadow MCP often surface first as governance and inventory problems even before an exploit write-up exists. Token mismanagement and context oversharing are quieter risks that compound over time.

## Risk coverage matrix

This is the most important section on the page. Each row is one OWASP MCP risk. Each column is a category of security tool. Each cell describes how well that category addresses the risk on its own. Combine four to six categories and the matrix fills out.

| Risk | Network Allowlist | MCP Gateway | Pre-deploy Scanner | Runtime Proxy (Inspection) | Identity Gateway (Auth) | Audit Log Platform |
|------|-------------------|-------------|--------------------|----------------------------|-------------------------|--------------------|
| MCP01: Token Mismanagement | No | Partial | Partial | Partial | Yes | Complementary |
| MCP02: Scope Creep | No | Partial | No | Partial | Yes | Complementary |
| MCP03: Tool Poisoning | No | No | Yes | Yes | No | Complementary |
| MCP04: Supply Chain | No | No | Yes | Partial | No | Complementary |
| MCP05: Command Injection | No | No | Partial | Partial | No | Complementary |
| MCP06: Prompt Injection via Contextual Payloads | No | No | Partial | Yes | No | Complementary |
| MCP07: Auth & Authorization | No | Partial | No | No | Yes | Complementary |
| MCP08: Audit & Telemetry | No | No | No | Partial | No | Yes |
| MCP09: Shadow MCP | Partial | Partial | No | Partial | No | Complementary |
| MCP10: Context Oversharing | No | Partial | Partial | Yes | Partial | Complementary |

A few things to read into the matrix:

**Pipelock sits in the Runtime Proxy column.** It catches tool poisoning, command injection, prompt injection via contextual payloads, and context oversharing in flight. It does not handle authentication for you, it does not replace an identity gateway, and it cannot fully verify packages before they ship. The matrix shows where Pipelock fits and where you need a different tool.

**The audit column is "complementary" for almost every row** because audit logs do not prevent anything on their own. They give you the record an auditor wants and the trail an incident responder needs. Pair an audit platform with whichever control covers the actual risk and you have both prevention and evidence.

**MCP07 (auth and authz) is the row only an identity gateway clears.** Inspection tools do not authenticate identities. Network allowlists do not enforce per-tool scopes. If you want a defensible answer to MCP07, you need an OAuth-aware gateway in front of every MCP server.

**No row reads "Yes" across the board.** That is the whole point. A defensible MCP deployment combines four to six of these categories. The combinations that work are described in the defense in depth section below.

## Practical runtime controls

Runtime controls matter because MCP risk changes after install. A server can return a clean tool description during review and a poisoned one later. A permitted tool can return a prompt injection. A trusted server can receive a credential in a tool argument because the agent copied too much context.

The practical control set is direct: scan `tools/list`, scan `tools/call` arguments, scan tool responses before the model reads them, keep a per-session baseline for tool descriptions, and record every decision. Pipelock implements those controls in the runtime proxy layer. It still needs identity, package scanning, and retention systems around it for the rows outside runtime inspection.

## Pipelock coverage by MCP01-MCP10

Assess v3.7.1 uses the following statuses for the product controls it contributes. Covered does not mean that every instance of a risk is prevented.

| ID | Risk | Status | Pipelock mapping | Limit |
|---|---|---|---|---|
| MCP01 | Token Mismanagement & Secret Exposure | Covered | DLP scanners and canary tokens detect secrets in outbound text, URLs, and environment leaks. |  |
| MCP02 | Privilege Escalation via Scope Creep | Covered | Agent profiles, session profiling, and tool policy rules constrain privilege expansion. |  |
| MCP03 | Tool Poisoning | Covered | Tool scanning detects poisoned descriptions, provenance verifies signatures, baseline detects drift. |  |
| MCP04 | Software Supply Chain Attacks & Dependency Tampering | Covered | Binary integrity verifies subprocess hashes, tool provenance verifies Ed25519/Sigstore signatures. |  |
| MCP05 | Command Injection & Execution | Covered | Tool policy blocks dangerous tool calls, sandbox contains subprocess execution. |  |
| MCP06 | Prompt Injection via Contextual Payloads | Covered | Bidirectional MCP scanning with 6-pass normalization detects injection in responses and tool args. |  |
| MCP07 | Insufficient Authentication & Authorization | Partial | Agent profiles enforce per-agent policy, session binding pins tool inventories. | Org-wide authentication and authorization governance is a deployment concern. |
| MCP08 | Lack of Audit and Telemetry | Covered | Flight recorder produces hash-chained evidence, emit delivers to webhook/syslog/OTLP, Prometheus metrics. |  |
| MCP09 | Shadow MCP Servers | Partial | Discovery surfaces unprotected MCP servers on the system. | Org-wide registry and approval workflow for MCP servers is not enforced by the proxy. |
| MCP10 | Context Injection & Over-Sharing | Covered | Bidirectional scanning detects context injection, flight recorder provides forensic evidence. |  |

## MCP01: Token Mismanagement & Secret Exposure

The most common MCP failure is also the most basic. Servers ship with API keys hard-coded in config files. Tokens get logged in transcripts. Long-lived credentials sit in environment variables that any spawned subprocess can read. When the model sees a credential in its context window, it can leak it on the next tool call.

The defenses are layered. At the identity layer, you want short-lived tokens with explicit scopes, ideally OAuth 2.1 client credentials with rotation. At the inspection layer, you want DLP scanning on every tool argument and response so credentials never reach an outbound server. At the audit layer, you want a log of every credential access so leaks can be retraced.

Pipelock contributes the inspection piece. Its DLP engine carries 65 credential patterns at the time of writing and checks normalized text plus decoded variants such as URL-encoded, base64, hex, base32, and dot-collapsed forms before matching. If a credential appears in a tool argument, the proxy strips or blocks the request based on the configured action. That covers the runtime side. For provisioning and rotation you still need an identity gateway. See [MCP Authorization](/learn/mcp-authorization/) for the auth half of the story.

## MCP03: Tool poisoning and rug-pulls

The shipped MCP03 mapping names tool scanning, provenance verification, and behavioral baselines for poisoned descriptions and drift.

Static scanners catch poisoning at install time. They pull tool descriptions, run them through pattern matchers and LLM classifiers, and flag suspicious instructions before the agent connects. That stops the obvious cases. What it does not stop is a server that serves clean descriptions to the scanner and poisoned descriptions later, or a server that updates its tool definitions during an active session.

The runtime defense is tool description fingerprinting. A proxy hashes each tool definition on first contact, caches the baseline, and compares every subsequent tools/list response against it. If a description changes after the baseline, the proxy logs the diff and blocks the modified tool. That catches rug-pulls in the act.

For the full pattern, including which fields in an MCP tool definition can carry injection and how the response-scanning passes and related normalization work, read [MCP Tool Poisoning Defense](/learn/mcp-tool-poisoning/). The [tool poisoning blog post](/blog/tool-poisoning-mcp-attack-surface/) walks through the attack surface in more detail.

## MCP04: Software supply chain integrity

MCP servers ship as packages. Most install through npm or pip with no signature verification. A maintainer who sells their account, ships a backdoored update, or has their token stolen can push malicious code into thousands of agent installations overnight. The Postmark MCP incident in 2025 was the canonical example: an email server with thousands of downloads pushed an update that exfiltrated message contents to an attacker-controlled domain.

The defenses are pre-deploy and runtime. Pre-deploy means dependency scanning, package signature verification, and reproducible builds. Tools like Trivy, Snyk, and Socket cover the dependency tree. A pre-deploy MCP scanner adds tool-level inspection on top of dependency scanning.

The shipped MCP04 mapping names MCP binary-integrity checks for subprocess hashes and tool-provenance verification for Ed25519/Sigstore signatures. For the dependency half, pair it with a package scanner that runs in CI before any new MCP server enters production.

## MCP05: Command injection in MCP servers

Several disclosed MCP CVEs are command injection bugs in the server itself, not in the agent. The mcp-remote project shipped a code execution vulnerability in 2025 that allowed arbitrary commands when a malicious URL was passed to the tool. The MCPJam Inspector had a similar issue in its WebSocket handler. Both bugs let an attacker execute code on the host running the MCP server through a crafted argument.

The fix at the server level is input validation and argument sanitization. Servers should never construct shell commands from untrusted input. They should use parameterized APIs. They should run with the least privilege required to do their job. None of that is the agent's responsibility.

The compensating control at the network level is a runtime proxy that scans tool arguments before they reach the server. If the argument carries a payload that looks like shell metacharacters, encoded command sequences, or injection patterns, the proxy can block the request. That does not patch the server bug. It does mean the server never sees the malicious input.

For containment after the fact, sandbox the MCP server. On Linux, run it under Landlock plus seccomp plus a network namespace. On macOS, use sandbox-exec. On Windows, pair the server with a runtime sandbox like agentsh. Even a vulnerable server cannot exfiltrate data it cannot reach.

## MCP06: Prompt injection via contextual payloads

Prompt injection via contextual payloads is the OWASP category for prompt injection that hijacks the agent's reasoning chain through MCP context. The injection might enter through a tool description, a tool response, a fetched document, or a memory entry. Once the agent reads it, the injected instructions compete with the user's original goal for control of the next action.

The defense is content inspection at every entry point. Pipelock scans tool descriptions, tool arguments, tool responses, and fetched HTTP content. The pattern library includes "ignore previous instructions" variants, system and role overrides, jailbreak templates, multi-language equivalents, and known injection corpora. The response and description scanners normalize text and decode encoded variants before matching.

Pattern-based detection has limits. Novel attacks can slip through if they are not in the corpus. The mitigation is to combine pattern matching with classifier-based detection (on the roadmap), to log every detection for review, and to scope the agent's tool access tightly so even a successful injection cannot reach high-impact tools. See [Prompt Injection: Network-Layer Defense](/learn/prompt-injection-network-defense/) for the full pattern.

## MCP07: Insufficient authentication and authorization

Equixly's 2025 audit of public MCP servers found that a large share shipped without any authentication at all. Tools were callable by anyone who could reach the endpoint. Of the servers that did authenticate, many used long-lived tokens, no scope enforcement, and no per-tool authorization. The agent's auth token granted access to every tool the server exposed.

The defense is an identity gateway in front of the MCP server. OAuth 2.1 with client credentials gives short-lived tokens. Per-tool scopes give granular access control. PKCE prevents authorization code interception. The MCP spec now documents OAuth as the recommended pattern, and several gateways implement it.

This is the row a runtime proxy does not clear. Pipelock does not issue tokens, does not validate OAuth scopes, and does not act as an identity provider. It can log which agent called which tool and surface that to your audit pipeline, but the authentication decision happens elsewhere. For the full story, see [MCP Authorization](/learn/mcp-authorization/), which also covers the [confused deputy problem](/learn/mcp-authorization/) you have to solve once auth is in place.

## MCP08: Audit and telemetry gaps

Auditors ask three questions about AI agents. What did the agent do. What data did it touch. Can you prove the record has not been tampered with. Most MCP deployments cannot answer any of them. Logs are missing, partial, or trivially editable.

The defense is a tamper-evident audit log. Each entry should record the request, the decision, the data classification, and a link to the previous entry through a cryptographic chain. Periodic checkpoints should be signed with a key the operator controls. Redaction should run on sensitive content before write so the log itself does not become a leak vector. That is the [flight recorder](/learn/flight-recorder/) approach.

Pipelock implements this in the runtime proxy. Every scan decision, policy action, and session event lands in a JSONL log with hash chaining and Ed25519 signed checkpoints. DLP redaction runs on each entry before write. The log is a durable session artifact designed for audit review. Pair it with a [compliance evidence](/learn/compliance-evidence/) workflow and you have something concrete to hand to a SOC 2 or EU AI Act assessor.

## MCP09: Shadow MCP servers

Shadow MCP is the unauthorized half of the agent's attack surface. Developers install servers during exploration, AI IDEs suggest more, package managers make installation trivial, and nobody keeps a list. [Mend.io](https://www.mend.io/blog/shadow-mcp-unauthorized-ai-connectivity-in-your-codebase/) published an early public write-up on shadow MCP, and the category is now tracked as MCP09:2025.

Detection happens at five layers: codebase scan for mcp.json and MCP package dependencies, IDE config inspection, runtime network monitoring, process monitoring for spawned MCP subprocesses, and CI pipeline audit. Routing every MCP session through a proxy adds a sixth layer because the proxy logs every server the agent actually contacts.

The full reference is [Shadow MCP](/learn/shadow-mcp/). The shipped MCP09 mapping names discovery of unprotected MCP servers on the local system. An organization-wide registry and approval workflow remain outside proxy enforcement.

## MCP10: Context injection and oversharing

The last category covers what happens when sensitive data leaks across users, sessions, or agents through shared context. A multi-tenant MCP server returns the wrong customer's data because session boundaries are loose. A shared memory entry written by one agent gets read by another. An over-privileged tool returns more fields than the agent needs and the extras enter the model's context window forever.

The shipped MCP10 mapping names bidirectional scanning for context injection and the flight recorder for forensic evidence. Field-level access controls, scope enforcement, and tenant isolation still belong to the server and identity layer.

The harder version of this problem is detecting that data has been over-shared without knowing what "too much" means in advance. That is a server design problem, not a runtime one. Get your MCP servers to return only the fields the agent's task requires, then use the proxy as a backstop for the rest.

## Defense in depth model

No single tool covers the OWASP MCP Top 10. The matrix above makes that clear. The combinations that do work look like this:

**Minimum viable stack (small team, single agent fleet):**
- Pre-deploy scanner for MCP03 and MCP04
- Runtime proxy for MCP03, MCP05, MCP06, MCP10
- Audit log platform for MCP08

This handles the core risks for a team that has not yet centralized identity. You have a known set of MCP servers, you scan them before deploy, you inspect traffic at runtime, and you keep a tamper-evident log. MCP01, MCP02, and MCP07 are gaps you accept until you can put an identity gateway in front of the servers.

**Defensible stack (regulated environment, audit pressure):**
- Pre-deploy scanner
- Runtime proxy
- Identity gateway with OAuth 2.1
- Audit log platform with hash-chained evidence
- Network allowlist or [agent egress proxy](/learn/agent-egress-security/) on outbound traffic
- Optional MCP gateway if you route across many servers

Every row of the matrix has a covering tool. The audit platform reinforces every row. This is the configuration most enterprises end up at after they take the framework seriously.

**Shipped Pipelock mapping:** eight entries are covered; MCP07 (authentication and authorization) and MCP09 (shadow MCP) are partial. These statuses name product contributions, not complete prevention. Organization-wide identity governance, server approval, package review, and SIEM retention remain separate controls. Read [MCP Security Tools](/learn/mcp-security-tools/) for the surrounding tool categories.

## Getting started with OWASP MCP Top 10 mitigation

The first cuts are fast. Order matters because some controls reduce the cost of others.

**Week one: inventory and inspect.** Scan the codebase and IDE configs for every MCP server in use. Drop a runtime proxy in front of every agent so you have at least one record of what is calling what. Turn on audit logging. This handles MCP09 and MCP08 immediately and gives you the baseline for everything else.

**Week two: pre-deploy scanning.** Add an MCP scanner to CI. Block any server that fails the scan from reaching production. This handles the static side of MCP03 and MCP04 and stops the bleeding from new installs.

**Week three: runtime inspection.** Tune the runtime proxy to scan tool descriptions, arguments, and responses. Enable DLP scanning. Configure the action (block, strip, warn, ask) per server based on risk. This activates the matrix's runtime proxy column for MCP03, MCP05, MCP06, and MCP10.

**Week four: identity and authorization.** Stand up an OAuth 2.1 identity gateway in front of MCP servers that handle sensitive data. Issue short-lived tokens with explicit scopes. This handles MCP01, MCP02, and MCP07. It is the most expensive step because it touches every server, which is why it comes last.

**Ongoing: audit reviews and red team.** Review the audit log weekly for the first month. Run a red team exercise against the deployed stack. Patch what fires. Rinse and repeat as the OWASP MCP Top 10 framework moves out of beta and as new categories of attack appear.

## Further reading

- [OWASP MCP Top 10 project page](https://owasp.org/projects/mcp-top-10) (the official source)
- [The State of MCP Security 2026](/blog/state-of-mcp-security-2026/) (market overview and where the industry stands)
- [MCP Tool Poisoning Defense](/learn/mcp-tool-poisoning/)
- [MCP Runtime Security](/learn/mcp-runtime-security/) (live-traffic defenses, runtime mapping to MCP Top 10)
- [MCP Security Tools](/learn/mcp-security-tools/) (pre-deploy and runtime scanner landscape)
- [Tool Poisoning: The MCP Attack Surface](/blog/tool-poisoning-mcp-attack-surface/)
- [Shadow MCP](/learn/shadow-mcp/)
- [MCP Authorization](/learn/mcp-authorization/)
- [MCP Vulnerabilities](/learn/mcp-vulnerabilities/)
- [MCP Security Tools](/learn/mcp-security-tools/)
- [MCP Proxy](/learn/mcp-proxy/)
- [MCP Gateway](/learn/mcp-gateway/)
- [MCP Security](/learn/mcp-security/)
- [Flight Recorder](/learn/flight-recorder/)
- [Compliance Evidence](/learn/compliance-evidence/)
- [OWASP Agentic Top 10 coverage](/learn/owasp-agentic-top10/)
- [Pipelock](/pipelock/)
- [What is an Agent Firewall?](/agent-firewall/)
- [MCP specification](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro)
- [Vulnerable MCP Project](https://vulnerablemcp.info/)
- [Shipped mapping (Pipelock v3.7.1)](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/owasp_mcp.go): control IDs, status, evidence, and limitations.
