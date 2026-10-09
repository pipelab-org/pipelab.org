---
title: "The Mythos-Ready Playbook: Runtime Controls for the AI Vulnerability Storm"
linkTitle: "Mythos-Ready Playbook"
subtitle: "CSA, SANS, and OWASP published a security program for the post-Mythos world. Four of eleven priority actions describe runtime agent controls. Here is what they call for and how to implement it."
description: "CSA/SANS/OWASP Mythos-Ready playbook mapped to runtime controls: egress filtering, agent containment, and machine-speed response."
date: 2026-04-13
faq:
  - q: "What is a Mythos-ready security program?"
    a: "A Mythos-ready security program is one built for the post-Mythos threat environment, where AI-driven vulnerability discovery has compressed time-to-exploit from years to hours. The term comes from a joint briefing by CSA, SANS, and the OWASP GenAI Security Project published on April 13, 2026. The program focuses on containment and resilience rather than patching alone, with 11 priority actions spanning agent defense, egress filtering, deception, automated response, and continuous vulnerability operations."
  - q: "What are the Mythos-Ready priority actions for agent security?"
    a: "The playbook lists 11 priority actions. Four directly involve runtime agent controls: PA 3 (Defend Your Agents) calls for scope boundaries, blast-radius limits, and human override mechanisms before deploying agents in production. PA 8 (Harden Your Environment) calls for egress filtering, noting it blocked every public log4j exploit. PA 9 (Build a Deception Capability) calls for canaries, honey tokens, and pre-authorized containment at machine speed. PA 10 (Build an Automated Response Capability) calls for pre-authorized containment actions and response playbooks that execute at machine speed."
  - q: "What is the time-to-exploit trend that prompted the Mythos-Ready briefing?"
    a: "Mean time-to-exploit dropped from 2.3 years in 2018 to approximately 20 hours in 2026, according to the Zero Day Clock by Sergej Epp, based on 3,529 CVE-exploit pairs from CISA KEV, VulnCheck KEV, and XDB. The briefing argues that patching alone is no longer sufficient at this pace and that containment architecture becomes the primary defense."
learn_cat: compliance
level: deep
tags:
  - playbook
  - csa
  - sans
---
## The 20-hour window

Mean time-to-exploit has collapsed. In 2018 it took an average of 2.3 years from CVE disclosure to confirmed exploitation. In 2024 that was down to 56 days. In 2026 it is approximately 20 hours.

Those numbers come from the [Zero Day Clock](https://zerodayclock.com/) by Sergej Epp, based on 3,529 CVE-exploit pairs drawn from CISA KEV, VulnCheck KEV, and XDB. The trend was cited in ["The AI Vulnerability Storm: Building a Mythos-Ready Security Program"](https://labs.cloudsecurityalliance.org/mythos-ciso/) (v0.4, April 13, 2026), a joint briefing published by the CSA CISO Community, SANS, [un]prompted, and the OWASP GenAI Security Project.

The paper was authored by the CSA Chief Analyst, the SANS Chief of Research, and the CEO of Knostic. Contributing authors include the former CISA Director, the Google CISO, the former NSA Cybersecurity Director, and executives from Cloudflare, 1Password, and SANS. Many CISOs and other practitioners reviewed and edited the document.

The paper's thesis is direct: patching alone cannot keep pace with AI-accelerated exploit generation. Defenders must shift to containment and resilience. Egress filtering, deep segmentation, Zero Trust, pre-authorized containment actions that execute at machine speed, and AI-augmented defense.

This page maps four of the paper's eleven priority actions to runtime agent controls. The full paper covers vulnerability operations, governance, risk model updates, and continuous patching as well. This page focuses on the actions where runtime controls do the work.

## Priority Action 3: Defend Your Agents

**Severity:** CRITICAL. **Timeline:** Start this month, 45 days to initial capability.

From the paper (Section IV, p.20):

> "Without agents, most tasks on this list will be untenable, but they must be defended. Agents are not covered by existing controls and introduce both cyber defense and agentic supply chain risks. The agent harness -- prompts, tool definitions, retrieval pipelines, and escalation logic -- is where the most consequential failures occur; audit it with the same rigor as the agent's permissions. Before deploying agents in or adjacent to production environments, define scope boundaries, blast-radius limits, escalation logic, and human override mechanisms. Do not wait for industry governance frameworks. Define your own now."

What the paper calls for and where runtime controls fit:

**Scope boundaries.** The agent should only reach the endpoints and tools it needs. An [agent firewall](/agent-firewall/) enforces this at the network layer with domain allowlists and MCP tool policy rules. Traffic to anything outside scope gets blocked before it leaves the machine.

**Blast-radius limits.** Rate limiting, data budgets, and per-agent resource caps contain the damage if an agent is compromised. Adaptive enforcement tiers that escalate restrictions automatically when anomalous behavior is detected move a deployment from monitoring to blocking without waiting for human intervention.

**Escalation logic and human override.** HITL (human-in-the-loop) prompting pauses high-risk actions for operator approval. A kill switch with six independent activation sources, OR-composed so any single source blocks all traffic, provides the machine-speed override the paper describes. Graduated airlock tiers contain individual sessions without taking the whole fleet offline.

**Agentic supply chain.** [MCP tool scanning](/learn/mcp-tool-poisoning/) catches poisoned tool descriptions. Session binding pins the tool inventory so new tools cannot appear mid-session without detection. [Shadow MCP](/learn/shadow-mcp/) detection surfaces unauthorized servers the security team doesn't know about.

The paper's instruction to "not wait for industry governance frameworks" aligns with how Pipelock operates: a runtime contract between the operator and the agent, enforced at the proxy layer, without requiring upstream protocol changes or vendor coordination.

## Priority Action 8: Harden Your Environment

**Severity:** HIGH. **Timeline:** Start this month, 6 months to full coverage.

From the paper (Section IV, p.21):

> "The basics remain valid and can be prioritized for risks that can't be easily mitigated. Implement egress filtering (it blocked every public log4j exploit). Enforce deep segmentation and zero trust where possible. Lock down your dependency chain. Mandate phishing-resistant MFA for all privileged accounts. Every boundary increases attacker cost."

Egress filtering is the first control the paper names. The parenthetical is the important part: egress filtering blocked every public log4j exploit. Not some. Every one. Because log4j exploitation required the vulnerable server to make an outbound connection to attacker-controlled infrastructure, and egress filtering stopped that connection.

Agent traffic has the same shape. A compromised agent exfiltrates data by making outbound requests. An MCP tool poisoning attack works by convincing the agent to include stolen data in a tool call. Both require outbound traffic to reach a destination the attacker controls or to carry content the operator didn't authorize.

A [scanner pipeline](/learn/mcp-proxy/) running on every outbound request covers most of that shape: DLP scans tool arguments and HTTP bodies for credentials, injection patterns scan responses for prompt injection, SSRF checks block requests to private IPs and cloud metadata endpoints, and rate limiting caps request volume. The proxy sits between the agent and the network. When backed by network isolation (container networking, iptables, or namespace rules), the agent cannot bypass it. Without that isolation, the proxy still scans all traffic routed through it, but enforcement depends on the agent respecting its configuration.

The paper also calls for deep segmentation. When backed by network isolation, the [capability separation](/agent-firewall/) model is a form of segmentation: the agent holds credentials but has no direct network access; the firewall has network access but no credentials. Neither side alone can both access secrets and exfiltrate them.

## Priority Action 9: Build a Deception Capability

**Severity:** HIGH. **Timeline:** Start within 90 days, 6 months to full capability.

From the paper (Section IV, p.21):

> "Deploy canaries and honey tokens, layer behavioral monitoring, pre-authorize containment actions, and build response playbooks that execute at machine speed."

Three concepts in one sentence, each with a natural mapping to runtime controls:

**Canaries and honey tokens.** A [canary token](/learn/canary-tokens/) mechanism lets operators plant specific values (fake API keys, synthetic credentials, marker strings) and monitor every outbound path for them. If a canary appears in a tool call, an HTTP request, or a WebSocket frame, the agent has been compromised and the canary tells you exactly which secret path was followed. The scanner normalizes against base64, hex, URL encoding, subdomain splitting, and separator tricks so encoded canaries still trigger.

**Pre-authorized containment actions.** The kill switch activates from any of six independent sources without requiring a human to log in, find the right UI, and click a button. Each one is designed to be triggered by automation. When the paper says "execute at machine speed," this is the mechanism: a monitoring system detects anomalous behavior, calls the kill switch API, and traffic gets blocked on the next request.

**Behavioral monitoring.** Adaptive enforcement tracks an agent's behavior score across the session. Low-risk traffic passes normally. As suspicious patterns accumulate (high request rates, unusual destinations, entropy spikes), the enforcement tier escalates automatically. The agent doesn't need to trigger a specific rule. The pattern of behavior triggers the escalation.

## Priority Action 10: Build an Automated Response Capability

**Severity:** HIGH. **Timeline:** Start within 90 days, 12 months to full capability.

From the paper (Section IV, p.21):

> "Improve detection engineering and incident response capabilities to be systemic and, to the degree possible, autonomous. Examples: asset and user behavioral analysis, pre-authorized containment actions, and response playbooks that execute at machine speed."

This action overlaps with PA 9 and extends it. The core requirement is the same: detection and response that operates faster than a human can type.

A tamper-evident flight recorder provides the detection substrate. Every scan decision, every policy action, every tool call and response is logged in a hash-chained JSONL file with Ed25519 signed checkpoints. That log feeds into whatever incident response pipeline the organization runs. The structured format (JSON with consistent fields for action, verdict, tool name, session ID, timestamp) makes it consumable by SIEM, SOAR, and custom alerting without parsing unstructured text.

The response side is the kill switch and airlock system. When a detection fires, the containment action is a single API call. No ticket, no approval chain, no "we'll look at it Monday." That is what "machine speed" means in practice.

## Framework mapping

The paper's risk register (Appendix B, pp.27-28) maps every risk against four frameworks. The table below maps Pipelock's controls to the same frameworks using the same codes.

| Paper Risk | Framework Codes | Pipelock Control |
|---|---|---|
| #3 Unmanaged AI Agent Attack Surface | LLM06, ASI02, ASI03, AML.T0047, PR.AA, GV.SC | MCP wrapping, tool policy, session binding, airlock |
| #4 Inadequate Incident Detection and Response Velocity | ASI08, AML.T0047, DE.CM, DE.AE, RS.MA | Adaptive enforcement tiers, kill switch (6 sources, OR-composed), HITL |
| #6 Incomplete Asset and Exposure Inventory | ASI04, AML.T0000, ID.AM, GV.SC | `pipelock discover`, rules bundle inventory, explicit MCP server pinning |
| #7 Unsecured Software Delivery Pipeline | LLM01, LLM05, LLM08, ASI01, AML.T0018, AML.T0051.001, PR.PS, ID.IM | DLP scanning, injection detection, tool poisoning checks, flight recorder |
| #8 Network Architecture Insufficient for Lateral Movement | PR.IR, PR.PS | Egress filtering, SSRF protection, per-agent data budgets, CONNECT/WebSocket interception |

Framework prefixes: **LLMxx** = OWASP Top 10 for LLM Applications 2025. **ASIxx** = OWASP Top 10 for Agentic Applications 2026. **AML.Txxxx** = MITRE ATLAS. **Two-letter codes** = NIST CSF 2.0 (GV = Govern, ID = Identify, PR = Protect, DE = Detect, RS = Respond).

For the full Pipelock coverage story against each individual framework, see:
- [OWASP Agentic Top 10 coverage](/learn/owasp-agentic-top10/)
- [OWASP LLM Top 10 coverage](/learn/owasp-llm-top10/)
- [OWASP MCP Top 10 coverage](/learn/owasp-mcp-top10/)
- [Compliance evidence](/learn/compliance-evidence/)

## The 10 CISO self-assessment questions

The paper (Section IV, p.15) lists ten questions "to understand your security program state and influence." Two of them map directly to runtime agent controls.

**Question 2: "Can employees use agentic coding tools in the enterprise today? Do you have security guardrails in place for these coding agents?"**

If the answer is yes and no: `pipelock init` discovers IDE configs and generates a starter configuration. `pipelock claude setup` rewrites the Claude Code config to route MCP traffic through the proxy. `pipelock cursor install` does the same for Cursor. The agent keeps working normally. Every tool call now runs through DLP, injection, and tool poisoning checks. After that, `pipelock assess` runs a multi-step posture evaluation that reports which agents are wrapped and which controls are active.

**Question 4: "Do we have disciplined control repos, artifacts, and software, including for agentic supply chain such as MCP servers, plugins, and skills?"**

If the answer is "not yet": start with [shadow MCP detection](/learn/shadow-mcp/). Run a sweep across IDE configs, package manifests, and CI pipelines. Route all MCP traffic through a proxy so the flight recorder captures every server the agent actually contacts. Compare observed servers against the approved list. The gap between those two lists is the agentic supply chain risk the paper is asking about.

The other eight questions (AI stance, open source legal, cooling-off gates, operational vs. advisory security, fastest production change, crown jewels tracking, third-party escalation, executive urgency definition) are organizational maturity questions. Runtime tooling doesn't answer them directly, but the flight recorder and posture reports provide evidence that those answers exist in practice, not just in policy.

## The implementation gap

The paper describes the runtime containment layer in detail across PA 3, 8, 9, and 10 but stays vendor-neutral on who provides it. PA 1 (Point Agents at Your Code) names six commercial and open source tools for LLM-based vulnerability discovery. PA 3, 8, 9, and 10 name zero. The paper treats runtime containment as a category requirement, not a product recommendation.

That leaves the implementation question open. A runtime containment layer needs to cover scope boundaries, blast-radius limits, human override mechanisms, pre-authorized containment actions, canaries and honey tokens integrated into the flight path, and visibility into the agentic supply chain (MCP servers, plugins, skills). Any implementation that covers these maps to the paper's priority actions; any that does not leaves a gap a CISO will need to fill some other way.

The paper also recommends controls outside the runtime containment layer: LLM-based vulnerability scanning (PA 1), governance frameworks (PA 4), continuous patching capacity (PA 5), risk model updates (PA 6), asset inventory (PA 7), and VulnOps staffing (PA 11). Runtime containment is one layer in a larger program and does not replace any of these.

## The Glasswing gap and open source

The paper frames Anthropic's Project Glasswing as an early-access program for approximately 40 vendors and maintainers. Then it adds (Section III, p.10):

> "The world's exploitable attack surface is vastly larger than what any curated partner ecosystem can cover, and most organizations that build or maintain critical software will not have early access to Mythos-class capabilities."

Open source implementations of runtime containment fill part of that gap. The category is deployable without a partnership, a waitlist, or a vendor relationship, which matches the paper's argument that runtime containment should not be restricted to organizations inside a vetted early-access program.

For organizations below what the paper calls the "Cyber Poverty Line" (a concept introduced by Wendy Nather, cited in Section II, p.7), open source implementations lower the adoption cost of the runtime containment layer substantially. [Pipelock](/pipelock/) is one such implementation; the architecture is what matters, not any particular vendor's version of it.

## Source

["The AI Vulnerability Storm: Building a Mythos-Ready Security Program."](https://labs.cloudsecurityalliance.org/mythos-ciso/) Version 0.4, April 13, 2026. Published by the CSA CISO Community, SANS, [un]prompted, and the OWASP GenAI Security Project. Licensed CC BY-NC 4.0.

All quotes in this page are attributed by section and page number. Framework codes are from Appendix B (pp.27-28) of the paper.

## Further reading

- [Agent Firewall](/agent-firewall/): the three-camp framework and capability separation architecture
- [MCP Security](/learn/mcp-security/): the full MCP threat model
- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/): the attack class PA 3 is designed to stop
- [Shadow MCP](/learn/shadow-mcp/): the supply chain gap Question 4 asks about
- [OWASP Agentic Top 10 coverage](/learn/owasp-agentic-top10/): Pipelock mapped against ASI01-ASI10
- [OWASP MCP Top 10 coverage](/learn/owasp-mcp-top10/): Pipelock mapped against MCP01-MCP10
- [State of MCP Security 2026](/blog/state-of-mcp-security-2026/): incident timeline and defense coverage matrix
- [Mythos-ready in 20 minutes](/blog/mythos-ready-in-20-minutes/): a hands-on run through the priority action list with Pipelock
- [Claude Mythos: Agent Security Risk](/blog/claude-mythos-agent-security/): why the runtime containment thesis applies to coding agents specifically
- [Compliance Evidence](/learn/compliance-evidence/): signed assessment bundles for audit
- [Pipelock](/pipelock/): install, configure, deploy
