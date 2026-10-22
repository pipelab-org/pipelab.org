---
title: "EU AI Act Runtime Security: What You Need Before August"
linkTitle: "EU AI Act Runtime Security"
date: 2026-02-14
author: "Josh Waldrep"
summary: "Update: Regulation (EU) 2026/1744 defers EU AI Act stand-alone Annex III high-risk obligations to 2 December 2027 and embedded-product obligations to 2 August 2028."
description: "Regulation (EU) 2026/1744 defers EU AI Act Annex III high-risk obligations to 2 December 2027 and embedded-product obligations to 2 August 2028."
tags: ["compliance", "ai-security", "agent-firewall"]
blog_cat: "industry"
---

*The compliance deadline is real. The guidance isn't ready. Welcome to EU AI regulation.*

---

> **Update, 24 August 2026:** This article was published on 14 February 2026. Regulation (EU) 2026/1744, the Digital Omnibus on AI, is the first major amendment to the AI Act, Regulation (EU) 2024/1689. The European Parliament endorsed it on 16 June 2026, the Council gave final approval on 29 June 2026, it was published in the Official Journal on 24 July 2026, and it entered into force on 27 July 2026. It defers stand-alone Annex III high-risk obligations to 2 December 2027 and Annex I embedded-in-product safety-component obligations to 2 August 2028. The timeline below reflects the original publication.

## The timeline

The [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689) took effect August 2024. Requirements roll out in phases.

**Already enforced (since February 2025):** Prohibited AI practices. Penalties up to EUR 35 million or 7% of global turnover. Finland started enforcing January 1, 2026, the first country to actually do it.

**Already enforced (since August 2025):** General-purpose AI model obligations. Governance rules. National authorities designated in all member states.

**August 2, 2026** *(superseded, see the update above)***:** High-risk AI system requirements take full effect. Articles 9, 12, 13, 14, and 15. Risk management, record-keeping, transparency, human oversight, and cybersecurity. Penalties: up to EUR 15 million or 3% of global turnover.

That's six months from today.

## Are AI coding agents high-risk?

Probably not, for most use cases. The eight high-risk categories in [Annex III](https://artificialintelligenceact.eu/annex/3/) cover biometrics, critical infrastructure, education, employment, essential services, law enforcement, migration, and justice.

But it's not that simple.

If your AI coding agent writes software for **medical devices or critical infrastructure**, it might count as a safety component of a high-risk system. If it **evaluates developer performance or allocates tasks**, that could put it in the employment bucket.

[Article 7](https://artificialintelligenceact.eu/article/7/) lets the Commission expand the high-risk list, and they're already talking about agentic AI.

But classification isn't the only reason to care. When a regulator asks "what did you do to secure your AI tools?", your answer matters whether you're classified or not. Teams in regulated industries are already putting these controls in place just to cover themselves. Waiting to be told you're high-risk is all downside, no upside.

## What Article 15 actually requires

[Article 15](https://artificialintelligenceact.eu/article/15/) covers accuracy, robustness, and cybersecurity. Section 5 spells out the threats you have to protect against:

- **Adversarial examples** (prompt injection falls here)
- **Confidentiality attacks** (data exfiltration, credential theft)
- **Data poisoning** (corrupted inputs altering behavior)
- **Model poisoning** (compromised training or fine-tuning)

It also requires fail-safe design ([Art. 15(4)](https://artificialintelligenceact.eu/article/15/)). If something breaks, it should block, not let everything through.

This isn't theoretical. If your AI system hits the high-risk bar in EU markets, you need real controls for each of these threats. Documented ones, with audit trails. "We trust the model provider" doesn't count.

## The standard gap

CEN/CENELEC is developing [prEN 18282](https://aiassurance.institute/pren-18282-clauses.html), the harmonized cybersecurity standard for AI systems. Once it's published and cited in the EU Official Journal, following it means you're presumed compliant with Article 15. Easiest path to checking the box.

Problem: prEN 18282 hasn't even reached its formal enquiry phase yet. The target is Q4 2026. The compliance deadline is August 2, 2026.

You can't wait for the standard. You need to implement controls now and align when it arrives.

So what do you build in the meantime? OWASP's AI Exchange wrote [70 pages of ISO/IEC 27090](https://owaspai.org/) (the global AI security standard) and 40 pages of prEN 18282. If you build to OWASP's recommendations now, you'll be in good shape when the official standard lands.

## What runtime security means in practice

Most people hear "AI cybersecurity" and think model hardening or prompt injection filters. That's part of it. Article 15 goes further. Here's what each threat actually means when your agents are running.

### Confidentiality attacks

Your AI agent has API keys, tokens, and environment variables. If it can reach the internet directly, those can leave through an outbound URL, a query parameter, or a DNS subdomain query.

**[Capability separation](/agent-firewall/)** stops this when direct egress is blocked. The agent process holds secrets but cannot touch the network. A proxy process has network access but no secrets. The agent's only mediated way out is through the proxy. Every mediated request gets scanned for credential patterns, entropy anomalies, and leaked env vars.

That's Article 15(5) in practice. In strict mode with contained egress, the architecture blocks the leak path instead of only detecting it. Balanced mode detects more sophisticated attempts and blocks immutable-floor risks such as SSRF and core DLP secrets.

### Adversarial examples

The Act's term "adversarial examples" covers attacks that mess with AI inputs to get wrong outputs. For AI agents, the big one is prompt injection. Malicious content in tool responses that hijacks what the agent does next.

MCP (Model Context Protocol) tool responses flow directly into the agent's context window. If an MCP server returns poisoned content, the agent processes it as trusted. Scanning those responses for injection patterns before they hit the agent is exactly what Article 15(5) is asking for.

The same applies to the other direction. Tool arguments going from the agent to MCP servers can leak credentials or carry injections too. Scanning both directions catches both.

### Data poisoning

When one AI agent writes files that another agent reads, a compromised agent can poison the shared workspace. Corrupted config files, skill definitions, or memory files let the compromise spread to other agents.

File integrity monitoring (SHA256 manifests) catches unexpected changes. Ed25519 signing verifies who made each change. This won't stop every poisoning attack. But it catches the scariest one: someone quietly changing the files that control how your agents behave.

### Fail-safe mechanisms

Article 15(4) says your system needs to handle errors without falling apart. For a runtime security layer, that means fail-closed design. Scan errors, timeouts, parse failures, DNS errors. All of them block the request. If the scanner breaks, traffic stops. No "fail-open" paths.

## Audit trails aren't optional

[Article 12](https://artificialintelligenceact.eu/article/12/) requires automatic event logging. What happened, when, to which agent, what the scan result was, and why. Not just "we have logs." Structured logs with enough context to figure out what went wrong and prove it to a regulator.

"We use Claude Code" is not an audit trail. "Every outbound request is logged with scan result, scanner reason, agent name, timestamp, and duration" is.

You need Prometheus metrics for real-time monitoring. Per-agent identification in every log entry. Persistent structured logs you can pipe into whatever monitoring stack you use. When a regulator asks what happened, you show them the data.

## Human oversight means override capability

[Article 14](https://artificialintelligenceact.eu/article/14/) says humans need to understand what the system is doing, spot problems, and be able to stop it. For AI agents, that means a human can see a flagged request and approve it, deny it, or change it before anything happens.

The fail-closed default matters here too. If nobody responds to an approval request, the safe behavior is to block, not to proceed. You can dial enforcement up or down depending on how locked down you need to be.

## NIST is asking the same questions

In January 2026, NIST published a [Request for Information](https://www.federalregister.gov/documents/2026/01/08/2026-00206/request-for-information-regarding-security-considerations-for-artificial-intelligence-agents) on security considerations for AI agents. Agent hijacking, backdoor attacks, autonomous action risks. The same threats the EU AI Act calls out in Article 15.

Comment deadline is March 9, 2026. The US and EU are landing in the same place: AI agents that act on their own need runtime security.

## Where Pipelock fits

I built Pipelock because AI coding agents needed runtime security and nothing was doing it right. It handles:

- Capability separation (secrets and network access in separate processes)
- DLP scanning and prompt injection detection
- MCP bidirectional scanning (requests and responses)
- File integrity monitoring (SHA256 manifests + Ed25519 signing)
- Human approval gates (fail-closed by default)
- Structured audit logging (Prometheus + JSON)

One binary, nine dependencies, open source.

There's an [Article-by-Article mapping](https://github.com/pipelab-org/pipelock/blob/main/docs/compliance/eu-ai-act-mapping.md) showing how each feature maps to EU AI Act requirements, with NIST AI RMF references side by side. It covers Articles 9, 12, 13, 14, 15, and 26. Everything in the mapping points to actual code, and gaps are called out explicitly.

Pipelock is one layer. You need more than one. You still need process sandboxing, least-privilege file access, and actual risk management at the org level. The mapping doc tells you exactly what's covered and what's not.

## What to do now

1. **Audit your agent deployments.** What secrets do they have access to? What can they reach over the network? Start with visibility.
2. **Implement runtime controls.** Start with capability separation and DLP scanning. Don't wait for prEN 18282. The deadline is August, the standard drops in Q4.
3. **Build audit trails.** Structured logs, metrics, dashboards. This is what conformity assessments will ask for.
4. **Document your coverage gaps.** Use an Article-by-Article format. Show what you cover, what you don't, and why.
5. **Watch the NIST RFI.** Comments due March 9. Whatever NIST publishes will shape the global conversation on AI agent security.

---

*This article maps EU AI Act requirements to runtime security controls for informational purposes. It's not legal advice. Talk to a lawyer about your specific compliance obligations.*

---

## References

- EU AI Act full text. EUR-Lex, 2024. ([link](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689))
- Article 15: Accuracy, Robustness, and Cybersecurity. ([link](https://artificialintelligenceact.eu/article/15/))
- Article 12: Record-Keeping. ([link](https://artificialintelligenceact.eu/article/12/))
- Article 14: Human Oversight. ([link](https://artificialintelligenceact.eu/article/14/))
- Annex III: High-Risk AI Systems. ([link](https://artificialintelligenceact.eu/annex/3/))
- prEN 18282: Cybersecurity for AI Systems. CEN/CENELEC. ([status](https://aiassurance.institute/pren-18282-clauses.html))
- OWASP AI Exchange Liaison with CEN/CENELEC and ISO. OWASP, May 2025. ([link](https://owaspai.org/))
- NIST CAISI: Request for Information on AI Agent Security. Federal Register, January 2026. ([link](https://www.federalregister.gov/documents/2026/01/08/2026-00206/request-for-information-regarding-security-considerations-for-artificial-intelligence-agents))
- Pipelock EU AI Act Compliance Mapping. ([link](https://github.com/pipelab-org/pipelock/blob/main/docs/compliance/eu-ai-act-mapping.md))
