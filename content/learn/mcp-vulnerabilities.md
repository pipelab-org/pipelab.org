---
title: "MCP Vulnerabilities: Known Risks and Defenses"
linkTitle: "MCP Vulnerabilities"
seoTitle: "MCP Vulnerabilities and Security Risks (2026)"
subtitle: "Every MCP attack vector in one place, with runtime defenses for each."
description: "MCP vulnerabilities explained: tool poisoning, credential exposure, server flaws, real CVEs, and practical steps to reduce risk."
date: 2026-04-07
faq:
  - q: "Are MCP servers safe?"
    a: "MCP servers can be used safely when their source, permissions, configuration, and updates are reviewed. Safety depends on the particular server and client, the data they can access, and the controls around them."
  - q: "What are the main MCP security vulnerabilities?"
    a: "Tool poisoning, rug-pull attacks, credential theft through tool arguments, prompt injection in tool responses, SSRF via tool calls, session hijacking, cross-server exfiltration, path traversal and command injection inside MCP server implementations, supply chain backdoors in published MCP packages, and shadow MCP servers that bypass inspection."
  - q: "How do MCP vulnerabilities differ from general LLM security risks?"
    a: "LLM vulnerabilities exist in the model's input and output. MCP vulnerabilities exist in the protocol layer: tool descriptions that carry hidden instructions, tool arguments that leak secrets, tool responses that contain injection payloads, and server-side bugs (path traversal, argument injection, RCE) that turn agent requests into shell access."
  - q: "Do MCP servers have CVEs?"
    a: "Yes. Public advisories include CVE-2025-53109 and CVE-2025-53110 in the MCP filesystem server, and CVE-2025-6514 in mcp-remote. Check the affected versions and fixes in each advisory."
  - q: "How many MCP CVEs have been published?"
    a: "The Vulnerable MCP Project tracks over 50 known MCP vulnerabilities as of April 2026, with 13 rated critical. Notable disclosures include the Anthropic mcp-server-git RCE chain (CVE-2025-68143/68144/68145), Anthropic Filesystem MCP EscapeRoute (CVE-2025-53109/53110), MCPoison in Cursor IDE (CVE-2025-54136), mcp-remote command injection (CVE-2025-6514), and MCPJam Inspector RCE (CVE-2026-23744)."
  - q: "Can MCP vulnerabilities be fixed by the MCP protocol itself?"
    a: "Some flaws are in servers and clients, while others arise when untrusted tool descriptions and responses enter an agent's context. Protocol improvements and runtime inspection can reduce risk, but cannot eliminate every attack."
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

## Are MCP servers safe?

MCP servers can be used safely, but installing one gives software access to whatever its process and credentials can reach. Safety depends on the server's source, the client, its permissions, the data returned by tools, and how updates are handled. A well-maintained server with narrowly scoped access and current patches presents a different risk from an unknown package running with broad filesystem and network access.

Review the command and package before connecting, limit its permissions, and keep it patched. Treat tool descriptions and returned content as untrusted input. The [MCP security best practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices) cover local servers, authorization, and network access. See also [AI agent security](/learn/ai-agent-security/) and [Claude Code security](/learn/claude-code-security/).

## What are MCP vulnerabilities

An MCP vulnerability is any defect in the Model Context Protocol ecosystem that an attacker can use to steal data, execute code, bypass controls, or manipulate an agent's behavior. The definition covers every layer: the protocol, the servers that implement it, the clients that consume it, the packages that ship those servers, and the configs that wire them together.

Four properties make MCP different from classic web or API security. Tool descriptions are documentation the agent acts on, so they are executable surface. Tool responses are data the agent acts on, so they are executable surface too. Most MCP servers run with broad local filesystem or network access. The specification also defines authorization requirements, but implementation, permissions, response integrity, and audit remain important operational concerns. Every attack class below follows from one of those four properties.

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

**Defense.** For tool definitions routed through its MCP proxy, Pipelock extracts text recursively from the full tool definition and scans it for injection patterns. The full breakdown lives in [MCP Tool Poisoning](/learn/mcp-tool-poisoning/) and the [tool-poisoning attack surface](/blog/tool-poisoning-mcp-attack-surface/) post.

## Rug-pull drift attacks

The server returns clean tool descriptions initially. After the agent starts using the tools, subsequent `tools/list` responses contain modified descriptions with hidden instructions. Any check that only runs at session start misses this completely.

The canonical public demonstration is the [Invariant Labs WhatsApp MCP rug-pull](https://invariantlabs.ai/blog/whatsapp-mcp-exploited). A trivia game MCP server with hidden instructions targeted a legitimate `whatsapp-mcp` server connected to the same agent. The agent pulled WhatsApp history through the trusted server and leaked it as outbound traffic. End-to-end encryption did not help because exfiltration happened above the encryption layer, through the agent's own authorized access.

**Defense.** For servers routed through its MCP proxy, Pipelock fingerprints every tool definition with SHA-256 on first contact and compares later responses against that baseline. A change triggers an alert or block with a diff of what changed. Review changes before allowing sensitive actions.

## Command injection and RCE in MCP servers

Several MCP servers have shipped with input validation bugs severe enough to give an attacker remote code execution. These are not protocol-level bugs, but they are MCP bugs in the sense that the MCP attack surface makes them reachable from agent traffic.

The [public CVE table](#cve-patterns-and-disclosure-timelines) covers flaws in `mcp-server-git`, the `mcp-remote` client, and MCPJam Inspector. The issues have different prerequisites and fixes; check each advisory against the version and configuration in use.

The common thread is that MCP server code runs with agent-supplied arguments. Any argument that reaches a shell, a subprocess, or an unsafe library call is a potential RCE.

**Defense.** Input validation inside every MCP server, least-privilege filesystem access, sandboxing the MCP process, and runtime DLP on argument patterns that match shell escape sequences. A runtime proxy that scans tool arguments catches a subset before they reach the vulnerable server.

## Path traversal in MCP filesystem servers

Path traversal is the single most common MCP server vulnerability. [Endor Labs found](https://www.endorlabs.com/learn/classic-vulnerabilities-meet-ai-infrastructure-why-mcp-needs-appsec) that 82% of 2,614 MCP implementations use file operations prone to path traversal.

The MCP filesystem server has had two published path-validation flaws, [CVE-2025-53109](https://github.com/advisories/GHSA-q66q-fx2p-7w4m) and [CVE-2025-53110](https://github.com/advisories/GHSA-hc55-p739-j48w). The first involved symlinks; the second involved paths sharing an allowed directory prefix. Both advisories recommend upgrading to 2025.7.1.

The pattern repeats across third-party servers. Symlinks, `..` segments, and Windows alternate data streams all defeat naive string checks. Server authors frequently check the path string for `..` before joining, which misses the case where the joined path resolves outside the base.

**Defense.** Canonicalize every path before authorization. Reject escaping symlinks explicitly. Put each filesystem MCP server in a chroot, container filesystem, or bind-mount with only the directories it needs. Scan tool arguments for known traversal patterns at the proxy layer.

## Supply chain attacks on MCP packages

**postmark-mcp npm backdoor.** An npm package named `postmark-mcp`, impersonating a legitimate Postmark integration, shipped 15 clean versions (1.0.0 through 1.0.15) to build trust. Reported version 1.0.16, released September 17 2025, added one line of code that BCC'd every outgoing email to `phan@giftshop.club`. Reported weekly downloads were around 1,500. Koi Security disclosed the backdoor on September 25 2025 and estimated roughly 300 organizations had integrated the package. This is the first publicly documented in-the-wild malicious MCP server. Primary sources: [Snyk: Malicious MCP Server on npm](https://snyk.io/blog/malicious-mcp-server-on-npm-postmark-mcp-harvests-emails/) and [Koi Security](https://web.archive.org/web/20260827163357/https://www.koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft).

The postmark-mcp pattern is the template attackers will reuse. A maintainer ships a legitimate MCP server, builds download volume, then inserts the backdoor in a minor release. Agents auto-pull the latest version. Static scanners that checked the package at initial approval miss everything.

**Defense.** Supply chain verification as a first-class control. SBOM on every MCP server, including upstream dependencies. Pin versions by hash and reject unpinned servers in CI. Inspect outbound traffic where practical, recognizing that controls cannot inspect connections that bypass them.

## Authorization and authentication gaps

MCP defines authorization requirements for HTTP-based connections, but implementations and deployments can still have authorization gaps. Shared service-account tokens can also give multiple agents broader access than they need.

Check Point's [MCPoison research](https://research.checkpoint.com/2025/cursor-vulnerability-mcpoison/) (CVE-2025-54136) describes a Cursor IDE configuration approval that remained in effect after an MCP configuration changed. Cursor fixed it in version 1.3. Revalidate configuration changes and tie approval to the current configuration.

**Defense.** Mandatory re-approval on any MCP config change. Per-agent identity with scoped tokens. File integrity monitoring on MCP config paths. The full breakdown lives in [MCP Authorization](/learn/mcp-authorization/).

## Credential exposure, SSRF, and confused deputy attacks

Credentials can leak through tool arguments, logs, server configuration, or outbound requests. Use short-lived, narrowly scoped credentials, keep secrets out of tool descriptions and logs, and rotate exposed tokens. The [MCP security guidance](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices) warns against passing a client token to a downstream API without validating that it was issued for the MCP server.

Server-side request forgery (SSRF) occurs when an attacker causes a client or server to request an unintended destination. Malicious OAuth discovery metadata can, for example, point an MCP client at an internal service. Restrict destinations and validate redirects and resolved addresses. The same MCP guidance describes these controls and DNS rebinding risks.

An MCP server that proxies access to a third-party API can become a confused deputy when it uses its own authority on behalf of a client without the right consent checks. The MCP guidance describes a flow involving a shared OAuth client ID and a previously stored consent cookie. It calls for per-client consent, exact redirect URI validation, and OAuth state validation.

## Prompt injection in tool responses

A tool returns content that contains hidden instructions targeting the agent. The agent reads the response, processes the injected instructions, and follows them. This is indirect prompt injection delivered through the MCP channel instead of a web page.

The canonical public demonstration is Invariant Labs' [GitHub MCP exploit](https://invariantlabs.ai/blog/mcp-github-vulnerability). The widely used GitHub MCP server (reported at around 14,000 stars at disclosure) was hijacked through a malicious GitHub Issue. When the agent read the issue, it followed embedded instructions and exfiltrated contents from private repositories the user had authorized. Tool descriptions were clean. The poisoning sat in the data the tool returned.

**Defense.** For traffic routed through its MCP proxy, Pipelock scans tool responses for known injection patterns, using {{< stat key="response_patterns" >}} injection patterns across six response-scanning passes: normalized text, invisible-with-space retry, leetspeak, optional-whitespace variants, vowel-folded variants, and base64/hex decode. Detection is not a guarantee that all malicious instructions will be caught. Treat inbound tool output as untrusted the way a browser treats HTML.

## Shadow MCP and inventory gaps

A shadow MCP server is an MCP server the security team does not know about. A developer installs one locally, a plugin spins one up inside an IDE, or an agent downloads one on demand. None of the defensive controls above help if the traffic does not reach the proxy.

Shadow MCP is not a single CVE. It is an inventory failure that compounds every other vulnerability on this page. Without an inventory, the postmark-mcp victims had no chance to audit their packages and the MCPoison victims had no chance to revalidate.

**Defense.** Network egress control that forces all agent traffic through an inspection point. Continuous inventory of MCP servers running on developer machines and in CI. Detection of new outbound destinations and new tool hashes in logs. The full breakdown lives in [Shadow MCP](/learn/shadow-mcp/).

## CVE patterns and disclosure timelines

These public CVEs affect particular implementations and versions, not every MCP deployment. Check each advisory against the version and configuration you run.

| CVE and source | Affected package and issue | Fixed version |
|---|---|---|
| [CVE-2025-53109](https://github.com/advisories/GHSA-q66q-fx2p-7w4m) | `@modelcontextprotocol/server-filesystem` could access unintended files through symlinks in allowed directories. | 2025.7.1 |
| [CVE-2025-53110](https://github.com/advisories/GHSA-hc55-p739-j48w) | `@modelcontextprotocol/server-filesystem` could allow unintended file access when a path shared an allowed directory prefix. | 2025.7.1 |
| [CVE-2025-68143](https://github.com/advisories/GHSA-5cgr-j3jf-jw3v) | `mcp-server-git` allowed `git_init` to create repositories at arbitrary accessible paths. | 2025.9.25; the tool was removed. |
| [CVE-2025-68144](https://github.com/advisories/GHSA-9xwc-hfwc-8w59) | `mcp-server-git` passed unsanitized arguments to Git, allowing options that could overwrite files. | 2025.12.18 |
| [CVE-2025-68145](https://github.com/advisories/GHSA-j22h-9j4x-23w5) | `mcp-server-git` did not enforce its configured repository restriction on subsequent tool calls. | 2025.12.18 |
| [CVE-2025-6514](https://github.com/advisories/GHSA-6xpm-ggf7-wc3p) | `mcp-remote` could execute operating system commands when an untrusted server supplied a crafted authorization URL. | 0.1.16 |
| [CVE-2026-23744](https://github.com/advisories/GHSA-232v-j27c-5pp6) | `@mcpjam/inspector` exposed an HTTP endpoint that could execute commands. | 1.4.3 |
| [CVE-2025-54136](https://github.com/cursor/cursor/security/advisories/GHSA-24mc-g4xr-4395) | Cursor IDE kept trusting an approved MCP configuration after it changed (MCPoison). | Cursor 1.3 |

A CVE identifies a disclosed flaw, not proof that your installation is exposed. Check the affected version, configuration, and reachability in the advisory. Other incidents, including tool poisoning demonstrations, may not have a CVE.

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

## Practical risk-reduction steps

1. Inventory servers, startup commands, versions, owners, credentials, and reachable data. Remove servers that are no longer needed.
2. Check client and server advisories, pin reviewed packages, and review updates and dependencies.
3. Restrict filesystem paths, network destinations, and token scopes. Sandbox local processes and require approval for sensitive actions.
4. Authenticate remote connections, validate token audiences and redirect URIs, and use per-client consent for third-party authorization flows.
5. Review tool definitions when they change and inspect calls and responses where appropriate. Detection can miss attacks and only covers traffic routed through the control.
6. Record approvals and security events without recording secrets. Investigate unexpected destinations, tool changes, and denied actions.

[Pipelock](/pipelock/) can inspect MCP tool definitions, calls, and responses routed through its MCP proxy. It can help detect secret leaks and known prompt-injection and tool-poisoning patterns on that path. It does not patch servers or inspect connections that bypass it. The [open-source AI firewall guide](/learn/open-source-ai-firewall/) explains the deployment pattern.

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
