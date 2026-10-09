---
title: "The State of MCP Security 2026: Incidents, Attack Patterns, and Defense Coverage"
linkTitle: "State of MCP Security 2026"
seoTitle: "State of MCP Security 2026: Incidents and Fixes"
date: 2026-04-12
author: "Josh Waldrep"
summary: "A data-backed look at MCP security in 2026: public incidents, disclosed CVEs, OWASP MCP Top 10 mapping, and control coverage across scanners, gateways, and runtime inspection."
description: "State of MCP Security 2026: public incidents, CVE trends, OWASP MCP Top 10 mapping, and control coverage across scanners, gateways, and inspection tools."
tags: ["mcp-security", "ai-security", "pipelock", "report"]
faq:
  - q: "What are the biggest MCP security incidents of 2025-2026?"
    a: "The most publicly discussed MCP security incidents of 2025-2026 include the postmark-mcp npm package backdoor (first in-the-wild malicious MCP server, disclosed September 2025), the Invariant Labs tool poisoning disclosure and GitHub MCP prompt injection research (April and May 2025), the WhatsApp MCP rug-pull demonstration (April 2025), the MCPoison persistent code execution flaw in Cursor IDE (CVE-2025-54136, disclosed August 2025), and the three-CVE Anthropic mcp-server-git RCE chain (CVE-2025-68143, 68144, 68145, publicly discussed in early 2026). Public CVE databases show dozens of MCP-related disclosures in the first months of 2026."
  - q: "What does the OWASP MCP Top 10 cover?"
    a: "The OWASP MCP Top 10 is in beta as of 2026 and covers ten risk categories: token mismanagement and secret exposure (MCP01), privilege escalation via scope creep (MCP02), tool poisoning (MCP03), software supply chain attacks (MCP04), command injection and execution (MCP05), intent flow subversion (MCP06), insufficient authentication and authorization (MCP07), lack of audit and telemetry (MCP08), shadow MCP servers (MCP09), and context injection and over-sharing (MCP10). The project is led by Vandana Verma Sehgal."
  - q: "How do MCP security tool categories compare?"
    a: "MCP security tools split into three camps. Network allowlists and control-plane tools (gh-aw-firewall, iron-proxy) restrict where agents can reach. MCP gateways (Docker MCP Gateway, Runlayer, agentgateway, MintMCP) centralize routing, policy, and auth for multiple MCP servers. Inspection and runtime scanners (Pipelock, Cisco mcp-scanner, Snyk agent-scan, Invariant, Backslash) analyze tool definitions, arguments, and responses for poisoning, injection, and exfiltration. Each camp catches different attack classes. A complete posture uses at least one from each camp."
blog_cat: "mcp"
---
## 2026 MCP security in five facts

- **24,008 unique secrets** exposed in MCP-related configs on public GitHub, with 2,117 still valid at scan time (GitGuardian, 2026 State of Secrets Sprawl).
- **82% of 2,614 analyzed MCP implementations** use file operations prone to path traversal; 67% use APIs related to code injection (Endor Labs).
- **The first publicly documented malicious MCP server** (postmark-mcp) shipped about 1,500 downloads per week and reached 300 real organizations before disclosure.
- **Tool poisoning is demonstrated, not theoretical**: Invariant Labs proved in April 2025 that hidden instructions in tool descriptions enter the agent's context window as trusted content. The ecosystem has no built-in defense.
- **The OWASP MCP Top 10 is in beta** as of 2026 and lists ten distinct risk classes. No single tool category covers the whole list on its own.

The deeper sections below cover each incident with primary sources, map them against the [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/), and grade six categories of defenses on coverage. For the evergreen [MCP threat model and best-practices guide](/learn/mcp-security/), start with the pillar page. The runtime inspection layer Pipelock sits in is designed for tool poisoning, response injection, and credential leaks in tool arguments. See [MCP security tools](/learn/mcp-security-tools/) for the broader landscape, [MCP tool poisoning](/learn/mcp-tool-poisoning/) for the attack class, and [Pipelock](/pipelock/) for the runtime control.

## Why this report exists

Every vendor with an MCP security product has an opinion about MCP risk. What the industry does not have is a shared snapshot of the ecosystem: what got hit, what the attackers did, which controls would have caught which attack, and where the gaps sit in April 2026.

This report is the snapshot. It covers public incidents disclosed from April 2025 through early 2026, maps them against the [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) (in beta), and grades six categories of defenses on how much of the risk surface they cover. Only public sources are used: vendor disclosure posts, CVE trackers, research blogs, and OWASP project pages. Every claim has a citation.

2026 matters as a snapshot year because MCP went from a protocol most security teams had barely heard of to the default integration layer for AI agents in less than 18 months. Adoption outpaced hardening. The CVEs and disclosures stacking up in public databases reflect that gap, and the defense market is still sorting itself into camps.

If you run MCP servers in production, this report is the baseline to measure your posture against. If you build security tools, it is the scoreboard of what the market still needs.

## The scale of the problem

The MCP ecosystem is producing vulnerabilities faster than any single vendor can track, and faster than most defenders can deploy mitigations for what has already been disclosed. A few numbers frame it.

[GitGuardian's State of Secrets Sprawl 2026](https://www.gitguardian.com/state-of-secrets-sprawl-report-2026) found 24,008 unique secrets exposed in MCP-related configuration files on public GitHub, with 2,117 still valid at the time of scan (8.8 percent of MCP-related findings). That is the at-rest side of the same problem runtime controls catch in flight.

The [Vulnerable MCP Project](https://vulnerablemcp.info/) tracks over 50 known MCP vulnerabilities across servers, clients, and infrastructure, with 13 rated critical. Public CVE databases show dozens of MCP-related disclosures in the first months of 2026 alone, ranging from trivial path traversals to a CVSS 9.6 remote code execution flaw in a package downloaded nearly half a million times. [Endor Labs' analysis](https://www.endorlabs.com/learn/classic-vulnerabilities-meet-ai-infrastructure-why-mcp-needs-appsec) of 2,614 MCP implementations found that 82 percent use file operations prone to path traversal, 67 percent use APIs related to code injection, and 34 percent use APIs susceptible to command injection.

Tool poisoning is a demonstrated attack class, not a theoretical one. [Invariant Labs showed](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) in April 2025 that MCP tool descriptions enter the agent's context window as trusted content, and an attacker who controls a description can hide instructions that the LLM reads and acts on. The attack is especially effective in clients that auto-approve tool calls, because no human sees the poisoned description before the agent acts on it. The ecosystem has no built-in defense against it.

The supply chain is already a target. The first publicly documented malicious MCP server, [postmark-mcp](https://snyk.io/blog/malicious-mcp-server-on-npm-postmark-mcp-harvests-emails/), was pulling about 1,500 downloads a week before discovery. Koi Security estimated roughly 300 organizations integrated it into real workflows.

The pattern is consistent. MCP servers are being published faster than they are reviewed, installed faster than they are scanned, and attackers are exploiting gaps at every layer of the stack: package registry, tool description, tool argument, response, and the trust boundary between agent and tool. Public data also suggests most MCP implementations ship with defaults that assume the server is trusted and the transport is clean. Neither assumption holds.

## Public MCP incidents of 2025-2026

The incidents below are all publicly disclosed by the research groups or vendors listed. This is not a complete list. It is the set of incidents with primary sources and enough public detail to reason about mitigations.

### Tool poisoning attacks (category disclosure)

**Date disclosed:** April 2025. **Attack class:** Tool poisoning. **Attack path:** Invariant Labs showed that MCP tool descriptions (the text returned by `tools/list`) enter the agent's context window as trusted content. An attacker who controls a description can hide instructions in it. The LLM reads them and acts on them. The attack is especially effective in clients that auto-approve tool calls, because no human reviews the description before execution. **Mitigation:** Tool description scanning (static or runtime), hash-pinning approved definitions, blocking auto-approval on untrusted servers. **Source:** [Invariant Labs: Tool Poisoning Attacks](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks).

### WhatsApp MCP rug-pull demonstration

**Date disclosed:** April 2025. **Attack class:** Rug-pull / cross-server exfiltration. **Attack path:** Invariant built a trivia game MCP server with hidden instructions in its tool description, targeting a second legitimate whatsapp-mcp server connected to the same agent. The agent followed the embedded instructions to pull WhatsApp history through the trusted server and leak it as normal outbound traffic. End-to-end encryption did not help because the exfiltration happened above the encryption layer, through the agent's legitimate access. **Mitigation:** Runtime tool description scanning across the full session, DLP on outbound arguments, and cross-server chain detection. Static scanners that only see the WhatsApp server miss this entirely. **Source:** [Invariant Labs: WhatsApp MCP Exploited](https://invariantlabs.ai/blog/whatsapp-mcp-exploited).

### GitHub MCP server prompt injection

**Date disclosed:** May 2025. **Attack class:** Poisoning via data (not metadata) / confused deputy. **Attack path:** Invariant Labs showed that the widely used GitHub MCP server (about 14,000 stars) could be hijacked through a malicious GitHub Issue. When the agent read the issue, it followed embedded instructions and exfiltrated contents from private repositories the user had authorized. The tool descriptions were clean. The poisoning sat in the data the tool returned. **Mitigation:** Response scanning on every MCP response, not just tool descriptions. Treat inbound tool output as untrusted the way a browser treats HTML. **Source:** [Invariant Labs: GitHub MCP Exploited](https://invariantlabs.ai/blog/mcp-github-vulnerability).

### MCPoison in Cursor IDE (CVE-2025-54136)

**Date disclosed:** August 2025. **Attack class:** MCP trust bypass / persistent code execution. **Attack path:** Check Point Research found that once a user approved an MCP configuration in Cursor IDE, Cursor never re-validated it. An attacker commits a benign `.cursor/rules/mcp.json` to a shared repo, the developer approves the harmless config, and the attacker later swaps in a malicious payload. Every subsequent Cursor launch silently runs the attacker's commands. CVSS 7.2. Reported July 16, 2025. Fixed in Cursor 1.3 on July 29, 2025. **Mitigation:** Mandatory re-approval on any MCP config change, file integrity monitoring on MCP config paths, runtime scanning of MCP commands on every session. **Source:** [Check Point Research: MCPoison](https://research.checkpoint.com/2025/cursor-vulnerability-mcpoison/).

### Anthropic mcp-server-git RCE chain (CVE-2025-68143, 68144, 68145)

**Date disclosed:** Publicly discussed early 2026 after coordinated fix. **Attack class:** Path traversal, argument injection, and unrestricted file write chained to RCE. **Attack path:** Researchers at Cyata found three flaws in Anthropic's reference Git MCP server. CVE-2025-68145 let an attacker escape the configured repository path because the `--repository` flag was not enforced on per-call arguments. CVE-2025-68143 let `git_init` turn any directory, including `.ssh`, into a git repository. CVE-2025-68144 passed user-controlled arguments to GitPython, letting an attacker inject `--output=/path/to/file` in `git_diff` and overwrite arbitrary files. Chained with the Filesystem MCP server, the combination produced RCE through a malicious `.git/config`. Reported in June. Fixed in version 2025.12.18 (path validation, `git_init` removed, arguments sanitized). **Mitigation:** Input validation on every tool argument, least-privilege filesystem access, sandboxing the MCP process, and runtime DLP on filesystem-escape argument patterns. **Source:** [The Vulnerable MCP Project: Anthropic Git MCP RCE Chain](https://vulnerablemcp.info/vuln/cve-2025-68145-anthropic-git-mcp-rce-chain.html).

### postmark-mcp npm backdoor

**Date disclosed:** September 2025. **Attack class:** Supply chain / malicious maintainer / BCC exfiltration. **Attack path:** An npm package named `postmark-mcp`, impersonating a legitimate Postmark integration, shipped 15 clean versions (1.0.0 through 1.0.15) to build trust. Version 1.0.16 (released September 17, 2025) added one line of code that BCC'd every outgoing email to `phan@giftshop.club`. About 1,500 weekly downloads, 1,643 total at removal. Koi Security disclosed the backdoor on September 25, 2025, and estimated roughly 300 organizations had integrated the package into real workflows. The first publicly documented in-the-wild malicious MCP server. **Mitigation:** Supply chain verification (SBOM, package pinning, provenance), runtime DLP on outbound email content, and hash-pinned MCP server binaries. **Source:** [Snyk: Malicious MCP Server on npm](https://snyk.io/blog/malicious-mcp-server-on-npm-postmark-mcp-harvests-emails/), [Koi Security](https://web.archive.org/web/20260827163357/https://www.koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft).

### Anthropic Filesystem MCP EscapeRoute (CVE-2025-53109, 53110)

**Date disclosed:** 2025. **Attack class:** Path traversal in a reference implementation. **Attack path:** Cymulate documented two flaws in Anthropic's Filesystem MCP server that let an agent break out of the allowed directory scope. Widely cited as evidence that even reference implementations had not been reviewed against basic traversal defenses. **Mitigation:** Reject escaping symlinks, canonicalize paths before authorization, and put MCP servers in a chroot or container filesystem. **Source:** [Cymulate: EscapeRoute](https://cymulate.com/blog/cve-2025-53109-53110-escaperoute-anthropic/).

### MCPJam Inspector RCE (CVE-2026-23744) and mcp-remote (CVE-2025-6514)

**Dates:** 2025 and 2026. **Attack class:** RCE in MCP tooling and client libraries. **Attack path:** MCPJam Inspector, an MCP debugging tool, contained an RCE so that inspecting a suspect server could compromise the researcher's machine. `mcp-remote`, a client library downloaded close to half a million times, passed connection parameters into shell commands without sanitization (CVSS 9.6). The two together show the attack surface extends to client-side tooling, not just servers. **Mitigation:** Sandbox dev tools, treat MCP client libraries as untrusted code, and route MCP clients through an egress-inspecting proxy. **Source:** [The Vulnerable MCP Project](https://vulnerablemcp.info/) entries for [CVE-2026-23744](https://vulnerablemcp.info/vuln/cve-2026-23744-mcpjam-inspector-rce.html) and CVE-2025-6514.

The pattern is unmistakable. Attacks hit every layer: package registry, tool description, tool response, tool argument, MCP config, and client library. No single control catches all of them.

## OWASP MCP Top 10 coverage matrix

The [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) is in beta as of April 2026, with Vandana Verma Sehgal leading the project. The ten categories are:

1. **MCP01:** Token Mismanagement and Secret Exposure
2. **MCP02:** Privilege Escalation via Scope Creep
3. **MCP03:** Tool Poisoning
4. **MCP04:** Software Supply Chain Attacks and Dependency Tampering
5. **MCP05:** Command Injection and Execution
6. **MCP06:** Intent Flow Subversion
7. **MCP07:** Insufficient Authentication and Authorization
8. **MCP08:** Lack of Audit and Telemetry
9. **MCP09:** Shadow MCP Servers
10. **MCP10:** Context Injection and Over-Sharing

This table maps those ten (plus two commonly cited adjacent risks: MCP-specific RCE and SSRF via tool calls) against the six defense categories in play in the market. Columns are: **Allowlist** (network egress control and control-plane allowlists), **Gateway** (MCP gateway and routing layer), **Scanner** (pre-deploy static analysis of tool definitions), **Inspection** (runtime proxy and DLP on MCP traffic), **Auth** (MCP authentication / OAuth / identity), **Audit** (centralized MCP audit logging and telemetry). Cells are Yes, Partial, or No.

| OWASP MCP Risk | Allowlist | Gateway | Scanner | Inspection | Auth | Audit |
|---|---|---|---|---|---|---|
| MCP01 Token / secret exposure | No | Partial | No | Yes | Partial | Partial |
| MCP02 Privilege escalation via scope creep | No | Partial | No | Partial | Yes | Partial |
| MCP03 Tool poisoning | No | Partial | Yes | Yes | No | No |
| MCP04 Supply chain / dependency tampering | No | Partial | Partial | Partial | No | No |
| MCP05 Command injection / execution | No | No | Partial | Partial | No | No |
| MCP06 Intent flow subversion | No | No | Partial | Yes | No | Partial |
| MCP07 Insufficient authn/authz | No | Yes | No | No | Yes | Partial |
| MCP08 Lack of audit / telemetry | No | Partial | No | Partial | No | Yes |
| MCP09 Shadow MCP servers | Yes | Yes | Partial | Partial | No | Partial |
| MCP10 Context over-sharing | No | Partial | No | Partial | No | No |
| MCP-specific RCE (path traversal, arg injection) | No | No | Partial | Partial | No | No |
| SSRF via tool call | Yes | Partial | No | Yes | No | No |

Read horizontally. Every row has at least one column that says "No" or "Partial" where buyers might expect a "Yes". Runtime inspection is the widest column, but it misses shadow MCP discovery when agents bypass the proxy, does not close authentication gaps in the protocol itself, and is not a complete audit surface. Gateways cover authentication and routing, but only for agents that actually use the gateway. Scanners catch what is visible at rest, not what happens at runtime. Each category is necessary and none is sufficient.

This is not hedging. Pipelock is in the inspection camp, and the table says inspection is No on MCP07 authentication. Inspection can observe authentication traffic and alert on missing tokens, but it does not replace an OAuth 2.1 implementation. A credible defense posture pulls from multiple columns.

## The three defense camps

The market is splitting into three camps. Most vendors live in one, some straddle two, and a few are starting to claim all three. Understanding the shape helps you pick complementary tools instead of redundant ones.

### Network allowlist and control-plane

Treats MCP security as an egress problem. You decide which destinations the agent can reach, and the control plane enforces the list. Examples: GitHub's gh-aw-firewall, iron-proxy in default mode. Strength: simplicity. An allowlist stops traffic to a random npm package cold, including postmark-mcp-style supply chain risk once the pattern is known. Gap: content. Allowlists do not look inside traffic, so a poisoned tool description from an approved host still gets through, and a credential inside an allowed request still leaks. Allowlists also do not solve shadow MCP unless every agent is forced through the control plane.

### MCP gateway and routing

Sits between agents and multiple MCP servers, centralizing auth, policy, routing, and approval flows. Examples: Docker MCP Gateway, Runlayer, agentgateway, TrueFoundry, Obot, Lasso, [Operant AI](https://www.operant.ai/), MintMCP. Strength: consolidation. The gateway becomes the single control point for authentication, audit, and tool approval. OWASP Top 10 rows on authentication, shadow MCP discovery (within gateway scope), and audit live here. Gap: coverage. Gateways only protect the servers they route. An agent calling an MCP server outside the gateway is invisible. Most gateways also do not do deep content inspection of responses. The gateway enforces who and where, not what.

### Inspection, scanner, and runtime defense

Looks at the content of MCP traffic, split into two sub-camps. Pre-deploy scanners include Cisco mcp-scanner (YARA plus LLM judge), Snyk agent-scan (the former Invariant mcp-scan, now under Snyk), Backslash Security, and Promptfoo. They analyze tool definitions and config files before the server ships. Runtime inspection includes [Pipelock](/pipelock/), Nightfall AI, and parts of Operant AI. Runtime inspection sits in the data path, scanning tool descriptions on every session, arguments on every call, and responses on every reply, with DLP and injection detection against live traffic.

Strength: depth. Inspection catches rug-pulls, response injection, credential leaks in arguments, and poisoned data inside legitimate responses. Scanners catch static poisoning and let you block merges before anything ships. Gap: pre-deploy scanners do not see runtime behavior, and runtime inspection does not replace authentication or network allowlists. A pure inspection posture misses shadow MCP if agents can bypass the proxy.

None of these camps is a competitor to the others once you see what each one solves. The question to ask a vendor is not "do you do MCP security" but "which rows in the OWASP MCP Top 10 do you cover".

## What is still missing from the ecosystem

Even with three camps and dozens of vendors, several gaps show up in the public data.

**Behavioral baselining of MCP traffic.** Cisco added "behavioral code threat analysis" to mcp-scanner in a December 2025 update, but that analyzes code statically. Live traffic baselining (is this agent suddenly calling new tools, is a tool returning responses orders of magnitude larger than usual, is a new destination appearing) is not standard in any commercial tool.

**Cross-session drift detection.** A rug-pull that happens between sessions, not within one, is invisible to tools that only compare hashes inside a single agent run. Fleet-scale fingerprinting of tool descriptions over days or weeks is missing.

**A2A (agent-to-agent) protocol security.** Cisco's DefenseClaw includes an a2a-scanner. Solo.io has one post on MCP plus A2A attack vectors. Most of the market has zero. As agents delegate to each other, A2A is the next layer up and has no standard defenses.

**Context oversharing metrics.** OWASP MCP10 names this risk, but no public tool quantifies it. A real control would measure how much of the context window is relevant to the current task and flag sessions where high-sensitivity content dominates.

**MCP audit log standards.** Every gateway and inspection tool emits logs. None emit the same fields. OWASP MCP08 names lack of audit and telemetry as a top-10 risk, but there is no shared schema for incident responders. A working-group standard here would unlock the most value.

**MCP supply chain verification.** SBOM, provenance, and hash-pinning exist in the broader ecosystem. MCP-specific checks (is the server signed, has the maintainer changed, does the binary match the source) are not uniformly enforced. The postmark-mcp backdoor would have been caught by a version-diff alert on package content.

## Recommended minimum MCP security baseline for 2026

This is the operator-facing section. If you run MCP servers or the agents that consume them, this is the floor for 2026. Each item is specific and testable.

**Pre-deploy.** Pin every MCP server version in source control and block CI on unpinned servers. Run a static scanner (Cisco mcp-scanner, Snyk agent-scan, or Backslash) against tool definitions on every config change. Require a code review for any new server added to an agent's allowed list. Maintain an SBOM for every MCP server, including upstream dependencies. Subscribe to the Vulnerable MCP Project and GitHub Security Advisories for the MCP space.

**Runtime.** Put a runtime inspection layer in front of every agent that consumes MCP. At minimum, scan tool descriptions on every session (not just first approval), scan tool arguments for credential patterns and encoded payloads, and scan tool responses for injection patterns. Enforce network egress allowlists so agents cannot call MCP servers outside approved endpoints. Fail closed on scanner errors: if a policy check cannot run, the call does not go through.

**Audit.** Log every MCP call (server, tool, argument fingerprint, response size, verdict) to a central store with retention matching your incident response SLA. Include enough detail to reproduce a session but redact credentials and DLP-flagged content. Make logs queryable by tool, agent identity, and time window. Alert on new tool descriptions appearing mid-session and on tool description hashes changing between sessions.

**Identity.** Use OAuth 2.1 with PKCE for every MCP server that supports it. Give each agent its own identity, not a shared service account. Scope tokens to the minimum set of tools and rotate them. Block tools that request scopes outside the agent's scope profile. Treat an MCP server with no authentication as equivalent to an open API on a public subnet.

If you run any of this today, you are ahead of most of the public incident victims. If you run none of it, the incident list above is the menu of what happens to teams in that position.

## How to use this report

**For engineers.** Take the OWASP Top 10 matrix, circle the rows your team covers with only "Partial" or "No", and map each gap to an item in the minimum baseline. Ship the one you can in a sprint.

**For CISOs.** Use the matrix in RFPs. Ask vendors which rows they cover, which they do not, and what the defense looks like when their tool is the only control. The right answer is never "we cover all ten".

**For vendors.** If your product lives in one camp, say so. Sell the adjacency to the other two rather than claiming them. A sharp tool in one camp is more defensible than a dull tool in three.

## Methodology and limitations

Sources: [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) beta, the [Vulnerable MCP Project](https://vulnerablemcp.info/) community tracker, [Invariant Labs](https://invariantlabs.ai/) research, [Snyk Labs](https://labs.snyk.io/) and the Snyk security blog, Check Point Research, Cymulate, Koi Security, Acuvity and Proofpoint, Cisco AI Defense, the [Model Context Protocol](https://modelcontextprotocol.io/) docs, and reporting from The Hacker News, Dark Reading, The Register, and Infosecurity Magazine on specific CVE disclosures. Tool category descriptions come from vendor public documentation and open-source code.

Limitations. Incident counts are lower bounds; the real number of MCP security incidents in 2025-2026 is higher than the publicly disclosed total. CVE totals lag active research, and disclosure rates vary by period. The coverage matrix reflects public tooling in April 2026, and any row could shift as vendors ship updates. "No" and "Partial" cells reflect vendor public documentation; capabilities may exist that are not yet documented. Tool camp assignments are based on primary positioning, and several vendors straddle camps.

The time range is April 2025 through early April 2026. The ecosystem is moving fast enough that any snapshot will be partly stale within six months. Treat this as a baseline to revise, not a permanent reference.

## Further reading

Internal:

- [MCP Security Guide](/learn/mcp-security/) covers the full threat model with defense mappings
- [MCP Tool Poisoning Defense](/learn/mcp-tool-poisoning/) goes deep on the attack class that started the category
- [MCP Vulnerabilities](/learn/mcp-vulnerabilities/) catalogs the risks and runtime defenses
- [MCP Gateway](/learn/mcp-gateway/) explains the routing and auth layer
- [MCP Security Tools](/learn/mcp-security-tools/) compares vendors across categories
- [Shadow MCP](/learn/shadow-mcp/) covers unauthorized MCP server discovery and enforcement
- [MCP Authorization](/learn/mcp-authorization/) covers OAuth 2.1, tool-level RBAC, and confused deputy defense
- [OWASP MCP Top 10](/learn/owasp-mcp-top10/) maps each risk category to practical controls
- [Pipelock product page](/pipelock/) has the runtime inspection details and install instructions

External:

- [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) (beta, led by Vandana Verma Sehgal)
- [The Vulnerable MCP Project](https://vulnerablemcp.info/) community CVE tracker
- [Model Context Protocol](https://modelcontextprotocol.io/) official documentation and security best practices
- [Invariant Labs research blog](https://invariantlabs.ai/blog) for ongoing MCP attack research
- [Cisco AI Defense blog](https://blogs.cisco.com/ai) for mcp-scanner and DefenseClaw updates

If a public MCP incident or defense detail is missing here, use the [contact page](/contact/) and send the source. The next snapshot will roll in corrections.
