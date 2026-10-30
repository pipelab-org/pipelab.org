---
title: "MCP Vulnerabilities: Known Risks and Defenses"
linkTitle: "MCP Vulnerabilities"
seoTitle: "MCP Vulnerabilities and Security Risks (2026)"
subtitle: "Every MCP attack vector in one place, with runtime defenses for each."
description: "MCP vulnerabilities mapped: tool poisoning, rug-pulls, credential theft, SSRF, prompt injection, session hijacking. Runtime defenses for each risk."
date: 2026-04-07
faq:
  - q: "What are the main MCP security vulnerabilities?"
    a: "Tool poisoning, rug-pull attacks, credential theft through tool arguments, prompt injection in tool responses, SSRF via tool calls, session hijacking, cross-server exfiltration, path traversal and command injection inside MCP server implementations, supply chain backdoors in published MCP packages, and shadow MCP servers that bypass inspection."
  - q: "How do MCP vulnerabilities differ from general LLM security risks?"
    a: "LLM vulnerabilities exist in the model's input and output. MCP vulnerabilities exist in the protocol layer: tool descriptions that carry hidden instructions, tool arguments that leak secrets, tool responses that contain injection payloads, and server-side bugs (path traversal, argument injection, RCE) that turn agent requests into shell access."
  - q: "How many MCP CVEs have been published?"
    a: "The Vulnerable MCP Project tracks over 50 known MCP vulnerabilities as of April 2026, with 13 rated critical. Notable disclosures include the Anthropic mcp-server-git RCE chain (CVE-2025-68143/68144/68145), Anthropic Filesystem MCP EscapeRoute (CVE-2025-53109/53110), MCPoison in Cursor IDE (CVE-2025-54136), mcp-remote command injection (CVE-2025-6514), and MCPJam Inspector RCE (CVE-2026-23744)."
  - q: "Can MCP vulnerabilities be fixed by the MCP protocol itself?"
    a: "Some are protocol-level gaps (no built-in authentication, no response integrity). Others are architectural: tool descriptions are untrusted text that enters the agent's context. Protocol improvements help but cannot eliminate the core issue that agents execute instructions from content they consume. Runtime inspection at the proxy layer catches attacks regardless of protocol version."
  - q: "How do I find vulnerabilities in my MCP servers?"
    a: "Start with the Vulnerable MCP Project CVE tracker and OWASP MCP Top 10. Run a static scanner against tool definitions (Cisco mcp-scanner, Snyk agent-scan, Backslash). Route live traffic through a runtime inspection proxy that scans tool descriptions, arguments, and responses on every call. Audit the inventory for shadow MCP servers. Check binaries against published hashes and SBOMs."
learn_cat: mcp
level: deep
tags:
  - mcp
  - ssrf
  - credentials
---
MCP vulnerabilities are real and growing. The Model Context Protocol gives AI agents access to external tools, and those tools introduce attack surface that did not exist when agents only processed text. Every MCP connection is a trust boundary, and most agents cross it without any inspection.

This page is the canonical reference for known MCP vulnerabilities. It catalogs the attack classes, lists the public CVEs, cites primary sources, and shows which runtime defenses exist for each risk. For the full ecosystem snapshot, see the [State of MCP Security 2026](/blog/state-of-mcp-security-2026/) report.

## What are MCP vulnerabilities

An MCP vulnerability is any defect in the Model Context Protocol ecosystem that an attacker can use to steal data, execute code, bypass controls, or manipulate an agent's behavior. The definition covers every layer: the protocol, the servers that implement it, the clients that consume it, the packages that ship those servers, and the configs that wire them together.

Four properties make MCP different from classic web or API security. Tool descriptions are documentation the agent acts on, so they are executable surface. Tool responses are data the agent acts on, so they are executable surface too. Most MCP servers run with broad local filesystem or network access. And the protocol spec stops at transport and message format, so authentication, response integrity, and audit are ecosystem decisions rather than protocol guarantees. Every attack class below follows from one of those four properties.

## The vulnerability landscape in 2026

The [Vulnerable MCP Project](https://vulnerablemcp.info/) tracks over 50 known MCP vulnerabilities, with 13 rated critical. Public CVE databases show dozens of MCP-related disclosures in the first months of 2026 alone. That is a lower bound. The real count is higher because many MCP servers are first-party internal tools that never get a CVE number when they get fixed.

Scale is worse at the implementation level. [Endor Labs' analysis](https://www.endorlabs.com/learn/classic-vulnerabilities-meet-ai-infrastructure-why-mcp-needs-appsec) of 2,614 MCP implementations found that 82% use file operations prone to path traversal, 67% use APIs related to code injection, and 34% use APIs susceptible to command injection. Invariant Labs [demonstrated](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) in April 2025 that tool descriptions enter the agent's context as trusted content, making tool poisoning attacks effective. The risk increases in clients that auto-approve tool calls, where no human reviews the description before execution. The ecosystem shipped faster than it hardened.

## Categories of MCP vulnerabilities

MCP vulnerabilities fall into nine recurring classes. The rest of the page covers each in detail with the cited CVEs and public incidents.

| Class | Where the bug lives | Detection surface |
|---|---|---|
| Tool description poisoning | MCP server metadata | Tool description scanning |
| Rug-pull drift | MCP server metadata over time | Drift detection and hash fingerprinting |
| Command injection / RCE | MCP server code | Input validation, server-side sandboxing |
| Path traversal | MCP filesystem servers | Canonicalization, chroot, policy |
| SSRF via tool calls | MCP server network code | DNS-aware allowlists |
| Supply chain backdoor | Package registry, binary distribution | SBOM, provenance, hash pinning |
| Authorization / authentication gaps | Protocol and server | OAuth 2.1, scoped tokens |
| Prompt injection in responses | Tool output content | Response scanning |
| Shadow MCP | Inventory | Discovery, egress control |

Each row is a different defense story. No single control catches all of them, which is why the [State of MCP Security 2026](/blog/state-of-mcp-security-2026/) report grades six defense categories against these rows.

## Tool description poisoning

A malicious MCP server hides instructions in its tool descriptions. When the agent calls `tools/list`, those instructions enter the context window. The agent follows them because it cannot distinguish documentation from commands.

The attack is not limited to the `description` field. Instructions can hide in parameter names, default values, enum options, and example values. CyberArk's ["Poison Everywhere" research](https://web.archive.org/web/20260511055221/https://www.cyberark.com/resources/threat-research-blog/poison-everywhere-no-output-from-your-mcp-server-is-safe) demonstrated encoding exfiltration instructions in MCP tool parameter names. [Invariant Labs](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) published the canonical tool poisoning disclosure in April 2025, demonstrating that the attack works because tool descriptions enter the context as trusted content.

**Defense.** Pipelock's MCP proxy extracts text recursively from the full tool definition and scans it for injection patterns. The full breakdown lives in [MCP Tool Poisoning](/learn/mcp-tool-poisoning/) and the [tool-poisoning attack surface](/blog/tool-poisoning-mcp-attack-surface/) post.

## Rug-pull drift attacks

The server returns clean tool descriptions initially. After the agent starts using the tools, subsequent `tools/list` responses contain modified descriptions with hidden instructions. Any check that only runs at session start misses this completely.

The canonical public demonstration is the [Invariant Labs WhatsApp MCP rug-pull](https://invariantlabs.ai/blog/whatsapp-mcp-exploited). A trivia game MCP server with hidden instructions targeted a legitimate `whatsapp-mcp` server connected to the same agent. The agent pulled WhatsApp history through the trusted server and leaked it as outbound traffic. End-to-end encryption did not help because exfiltration happened above the encryption layer, through the agent's own authorized access.

**Defense.** Pipelock fingerprints every tool description with SHA-256 on first contact. Subsequent responses are compared against the baseline. Any change triggers an alert or block with a diff of what changed. Cross-session drift detection is still an open gap across most of the market.

## Command injection and RCE in MCP servers

Several MCP servers have shipped with input validation bugs severe enough to give an attacker remote code execution. These are not protocol-level bugs, but they are MCP bugs in the sense that the MCP attack surface makes them reachable from agent traffic.

**Anthropic mcp-server-git RCE chain (CVE-2025-68143, 68144, 68145).** Researchers at Cyata reported three flaws in Anthropic's reference Git MCP server. CVE-2025-68145 let an attacker escape the configured repository path because `--repository` was not enforced per-call. CVE-2025-68143 let `git_init` turn any directory (including `.ssh`) into a git repo. CVE-2025-68144 passed user-controlled arguments to GitPython, letting an attacker inject `--output=/path/to/file` in `git_diff` and overwrite arbitrary files. Chained with the Filesystem MCP server, the combination produced RCE through a malicious `.git/config`. Reported in June 2025. Fixed in version 2025.12.18 (path validation, `git_init` removed, arguments sanitized). [Vulnerable MCP Project entry](https://vulnerablemcp.info/vuln/cve-2025-68145-anthropic-git-mcp-rce-chain.html).

**mcp-remote command injection (CVE-2025-6514, CVSS 9.6).** The `mcp-remote` client library, reported as downloaded close to half a million times, passed connection parameters into shell commands without sanitization. Tracked by the [Vulnerable MCP Project](https://vulnerablemcp.info/).

**MCPJam Inspector RCE (CVE-2026-23744).** MCPJam Inspector is an MCP debugging tool. The RCE flaw meant that inspecting a suspect server could compromise the researcher's machine, turning the defender's tool into the attack vector. See [CVE-2026-23744](https://vulnerablemcp.info/vuln/cve-2026-23744-mcpjam-inspector-rce.html) on the Vulnerable MCP Project.

The common thread is that MCP server code runs with agent-supplied arguments. Any argument that reaches a shell, a subprocess, or an unsafe library call is a potential RCE.

**Defense.** Input validation inside every MCP server, least-privilege filesystem access, sandboxing the MCP process, and runtime DLP on argument patterns that match shell escape sequences. A runtime proxy that scans tool arguments catches a subset before they reach the vulnerable server.

## Path traversal in MCP filesystem servers

Path traversal is the single most common MCP server vulnerability. [Endor Labs found](https://www.endorlabs.com/learn/classic-vulnerabilities-meet-ai-infrastructure-why-mcp-needs-appsec) that 82% of 2,614 MCP implementations use file operations prone to path traversal.

**Anthropic Filesystem MCP EscapeRoute (CVE-2025-53109, 53110).** Cymulate documented two flaws in Anthropic's Filesystem MCP server that let an agent break out of the allowed directory scope. Widely cited as evidence that even reference implementations had not been reviewed against basic traversal defenses. Source: [Cymulate EscapeRoute disclosure](https://cymulate.com/blog/cve-2025-53109-53110-escaperoute-anthropic/).

The pattern repeats across third-party servers. Symlinks, `..` segments, and Windows alternate data streams all defeat naive string checks. Server authors frequently check the path string for `..` before joining, which misses the case where the joined path resolves outside the base.

**Defense.** Canonicalize every path before authorization. Reject escaping symlinks explicitly. Put each filesystem MCP server in a chroot, container filesystem, or bind-mount with only the directories it needs. Scan tool arguments for known traversal patterns at the proxy layer.

## Supply chain attacks on MCP packages

**postmark-mcp npm backdoor.** An npm package named `postmark-mcp`, impersonating a legitimate Postmark integration, shipped 15 clean versions (1.0.0 through 1.0.15) to build trust. Reported version 1.0.16, released September 17 2025, added one line of code that BCC'd every outgoing email to `phan@giftshop.club`. Reported weekly downloads were around 1,500. Koi Security disclosed the backdoor on September 25 2025 and estimated roughly 300 organizations had integrated the package. This is the first publicly documented in-the-wild malicious MCP server. Primary sources: [Snyk: Malicious MCP Server on npm](https://snyk.io/blog/malicious-mcp-server-on-npm-postmark-mcp-harvests-emails/) and [Koi Security](https://web.archive.org/web/20260827163357/https://www.koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft).

The postmark-mcp pattern is the template attackers will reuse. A maintainer ships a legitimate MCP server, builds download volume, then inserts the backdoor in a minor release. Agents auto-pull the latest version. Static scanners that checked the package at initial approval miss everything.

**Defense.** Supply chain verification as a first-class control. SBOM on every MCP server, including upstream dependencies. Pin versions by hash and reject unpinned servers in CI. Runtime DLP on outbound content catches exfiltration like the BCC pattern regardless of which version of the server is running.

## Authorization and authentication gaps

MCP does not specify authentication. Individual servers implement it, or they do not. OAuth 2.1 with PKCE is the emerging baseline for servers that need it, but large swaths of the ecosystem still ship with no authentication at all, or with shared service-account tokens that give every agent identical access.

**MCPoison in Cursor IDE (CVE-2025-54136, CVSS 7.2).** Check Point Research found that once a user approved an MCP configuration in Cursor IDE, Cursor never re-validated it. An attacker commits a benign `.cursor/rules/mcp.json` to a shared repo, the developer approves the harmless config, and the attacker later swaps in a malicious payload. Every subsequent Cursor launch silently runs the attacker's commands. Reported to Cursor on July 16 2025 and fixed in Cursor 1.3 on July 29 2025. Source: [Check Point Research: MCPoison](https://research.checkpoint.com/2025/cursor-vulnerability-mcpoison/).

MCPoison is not a classic authorization bug, but it lives in the same class. Approval state without revalidation is equivalent to no authorization at all. Every MCP config change should require a fresh approval tied to a current hash of the server and tool definitions.

**Defense.** Mandatory re-approval on any MCP config change. Per-agent identity with scoped tokens. File integrity monitoring on MCP config paths. The full breakdown lives in [MCP Authorization](/learn/mcp-authorization/).

## Prompt injection in tool responses

A tool returns content that contains hidden instructions targeting the agent. The agent reads the response, processes the injected instructions, and follows them. This is indirect prompt injection delivered through the MCP channel instead of a web page.

The canonical public demonstration is Invariant Labs' [GitHub MCP exploit](https://invariantlabs.ai/blog/mcp-github-vulnerability). The widely used GitHub MCP server (reported at around 14,000 stars at disclosure) was hijacked through a malicious GitHub Issue. When the agent read the issue, it followed embedded instructions and exfiltrated contents from private repositories the user had authorized. Tool descriptions were clean. The poisoning sat in the data the tool returned.

**Defense.** Pipelock scans tool response content for {{< stat key="response_patterns" >}} injection patterns through six sequential response-scanning passes: normalized text, invisible-with-space retry, leetspeak, optional-whitespace variants, vowel-folded variants, and base64/hex decode. Patterns cover jailbreak attempts, authority assertions, credential solicitation, and state manipulation in English, Chinese, Japanese, and Korean. Treat inbound tool output as untrusted the way a browser treats HTML.

## Shadow MCP and inventory gaps

A shadow MCP server is an MCP server the security team does not know about. A developer installs one locally, a plugin spins one up inside an IDE, or an agent downloads one on demand. None of the defensive controls above help if the traffic does not reach the proxy.

Shadow MCP is not a single CVE. It is an inventory failure that compounds every other vulnerability on this page. Without an inventory, the postmark-mcp victims had no chance to audit their packages and the MCPoison victims had no chance to revalidate.

**Defense.** Network egress control that forces all agent traffic through an inspection point. Continuous inventory of MCP servers running on developer machines and in CI. Detection of new outbound destinations and new tool hashes in logs. The full breakdown lives in [Shadow MCP](/learn/shadow-mcp/).

## CVE patterns and disclosure timelines

The following table is the quick reference. It lists the CVEs and public incidents cited above along with the affected component, year, CVSS where a public source records one, and the primary mitigation. Every entry is backed by the source links in the preceding sections.

| CVE or incident | Affected component | Year | CVSS | Primary mitigation |
|---|---|---|---|---|
| CVE-2025-68143 | Anthropic mcp-server-git (`git_init`) | 2025 | Not public | Removed in 2025.12.18 |
| CVE-2025-68144 | Anthropic mcp-server-git (`git_diff` argument injection) | 2025 | Not public | Argument sanitization in 2025.12.18 |
| CVE-2025-68145 | Anthropic mcp-server-git (repository path escape) | 2025 | Not public | Path validation in 2025.12.18 |
| CVE-2025-53109 | Anthropic Filesystem MCP (EscapeRoute) | 2025 | Not public | Canonicalization, chroot, scoping |
| CVE-2025-53110 | Anthropic Filesystem MCP (EscapeRoute) | 2025 | Not public | Canonicalization, chroot, scoping |
| CVE-2025-54136 | Cursor IDE (MCPoison) | 2025 | 7.2 | Fixed in Cursor 1.3 |
| CVE-2025-6514 | mcp-remote client library | 2025 | 9.6 | Input sanitization, sandbox client |
| CVE-2026-23744 | MCPJam Inspector | 2026 | Not public | Upgrade, sandbox dev tools |
| postmark-mcp npm backdoor | `postmark-mcp` package v1.0.16 | 2025 | N/A | Package removal, DLP on outbound email |
| WhatsApp MCP rug-pull (Invariant) | Third-party trivia MCP server | 2025 | N/A | Runtime description scanning, chain detection |
| GitHub MCP injection (Invariant) | GitHub MCP server response handling | 2025 | N/A | Response scanning, treat tool output as untrusted |

Year is the disclosure year. CVSS is "Not public" where no rating has been published in a primary source, and N/A for incidents that never got a CVE number. The Vulnerable MCP Project tracks additional entries this page does not enumerate; treat it as the living index. Disclosure rates vary by period and are expected to climb as the ecosystem grows.

## How to find vulnerabilities in your MCP servers

No single tool covers every class above, so the workflow combines four layers.

**Start with the public trackers.** The [Vulnerable MCP Project](https://vulnerablemcp.info/) is the community CVE index. The [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10) is the category framework in beta as of 2026. Both give you the vocabulary and known-bad list before you scan your own servers.

**Run a static scanner against tool definitions.** Cisco mcp-scanner, Snyk agent-scan (the former Invariant mcp-scan), and Backslash Security analyze tool definitions and configs before the server ships. See [MCP security tools](/learn/mcp-security-tools/) for the landscape.

**Route live traffic through a runtime inspection proxy.** Static scanners miss rug-pulls, response injection, credential leaks in arguments, and poisoned data returned at runtime. An inspection proxy ([MCP Proxy](/learn/mcp-proxy/), [Agent Firewall](/agent-firewall/)) scans tool descriptions on every session, arguments on every call, and responses on every reply.

**Audit the inventory.** Walk every developer machine and CI runner. List every MCP server. Check binary hashes and SBOMs against published releases. Flag any server without an approval ticket. See [Shadow MCP](/learn/shadow-mcp/). The [MCP security best practices](/learn/mcp-security/) checklist pulls the short operator steps together.

## Mitigation layers

The [State of MCP Security 2026](/blog/state-of-mcp-security-2026/) matrix rates six control categories against the OWASP MCP Top 10. The simpler version for this page is five mitigation layers that belong in every serious posture.

| Layer | Primary classes caught | Example tools |
|---|---|---|
| Network egress allowlist | Shadow MCP, SSRF, supply chain destinations | gh-aw-firewall, iron-proxy |
| MCP gateway | Auth gaps, shadow MCP (within scope), routing and audit | Docker MCP Gateway, MintMCP, agentgateway |
| Static scanner | Tool poisoning, some supply chain | Cisco mcp-scanner, Snyk agent-scan, Backslash |
| Runtime inspection | Rug-pull, response injection, credential exfil, argument DLP | [Pipelock](/pipelock/), Nightfall, Operant AI |
| Identity and audit | Auth gaps, telemetry, incident response | OAuth 2.1 stacks, audit log pipelines |

No layer is a full answer. Runtime inspection is the widest because it sees content, but it does not replace authentication and cannot catch an agent that bypasses the proxy. Static scanning catches static poisoning but misses rug-pulls. Gateways centralize authentication but only for agents that use the gateway. Network allowlists block destinations but do not look inside traffic. Put a layer from each row in front of every agent that speaks MCP. What slips through one row should be caught by the next.

## Further reading

- [State of MCP Security 2026](/blog/state-of-mcp-security-2026/): public incidents, CVE trends, OWASP MCP Top 10 mapping, and control coverage matrix.
- [MCP Security](/learn/mcp-security/): the full MCP threat model.
- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/): deep dive on poisoning and rug-pulls.
- [Tool Poisoning MCP Attack Surface](/blog/tool-poisoning-mcp-attack-surface/): the blog companion to this page's poisoning section.
- [MCP Authorization](/learn/mcp-authorization/): OAuth 2.1, scoped tokens, and the MCPoison class of bugs.
- [Shadow MCP](/learn/shadow-mcp/): inventory and discovery workflow.
- [MCP Proxy](/learn/mcp-proxy/) and [MCP Gateway](/learn/mcp-gateway/): the runtime inspection and gateway patterns.
- [MCP Security Tools](/learn/mcp-security-tools/): landscape of scanners, gateways, and inspection proxies.
- [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10): the upstream category framework.
- [Vulnerable MCP Project](https://vulnerablemcp.info/): the community CVE tracker.
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock).
