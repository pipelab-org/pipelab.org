---
title: "Shadow MCP: Find and Lock Down Rogue MCP Servers"
linkTitle: "Shadow MCP"
seoTitle: "Shadow MCP: Find and Lock Down Rogue MCP Servers"
subtitle: "Undocumented MCP servers connect your agents to unknown code. Here's how to find them, measure the risk, and lock them down."
description: "Shadow MCP is the unauthorized MCP connectivity hiding in your codebase. How to find rogue MCP servers, score the risk, and enforce policy at runtime."
date: 2026-04-12
lastmod: 2026-08-08
faq:
  - q: "What is a shadow MCP server?"
    a: "A shadow MCP server is a Model Context Protocol server connected to an AI agent without formal approval, inventory tracking, or security review. Mend.io published an early public write-up using the term, and the category is now tracked as MCP09:2025 Shadow MCP Servers in the OWASP MCP Top 10. Shadow MCP is the agent equivalent of shadow IT: developers install servers during exploration, AI IDEs suggest them, and package managers make installation trivial. The organization has no record of what the agent connects to, what tools those servers expose, or what data crosses the boundary."
  - q: "How do you detect shadow MCP in a codebase?"
    a: "Use five detection layers: static codebase scan for mcp.json and MCP package dependencies in package.json and pyproject.toml, IDE config inspection under ~/.config/claude-code and ~/.cursor, runtime network monitoring for outbound connections from agent processes, process monitoring for MCP subprocesses spawned by developer tools, and CI/CD pipeline audit for servers pulled as build dependencies. Pipelock adds a sixth layer: route every MCP session through pipelock mcp proxy and the flight recorder logs every server the agent actually contacts."
  - q: "Why is shadow MCP a compliance risk?"
    a: "Shadow MCP can create gaps against SOC 2 Trust Services Criteria around data flow control and access inventory, EU AI Act Article 12 automatic logging requirements for high-risk AI systems, and NIST 800-53 supply chain controls under the CM and SR families. Applicability depends on scope and deployment, but if an auditor asks what external code your agents execute and what data they transmit, inventory gaps make that answer harder to support. Shadow MCP can turn an inventory gap into an audit issue."
learn_cat: mcp
level: deep
tags:
  - mcp
  - shadow-it
  - detection
---
Shadow MCP is the unknown half of your agent's attack surface. Your developers installed Model Context Protocol servers during exploration, your AI IDE suggested a few more, and your CI pipeline pulls a couple through package dependencies. Nobody kept a list. Nobody reviewed the code. The agent is connecting to all of them.

[Mend.io](https://www.mend.io/blog/shadow-mcp-unauthorized-ai-connectivity-in-your-codebase/) published an early public write-up on shadow MCP as unauthorized AI connectivity in your codebase. The category is now tracked as MCP09:2025 Shadow MCP Servers in the OWASP MCP Top 10 (beta, 2026). Credit where it's due: Mend helped push the problem into the open before most teams had an inventory for it.

This page is the reference for how shadow MCP happens, how to find it, and how to turn unknown server sprawl into a governed inventory.

## What is shadow MCP

Shadow MCP is any Model Context Protocol server connected to an AI agent without formal approval, inventory tracking, or security review. The connection works. The agent uses the tools. The organization has no record of it.

Think of it as shadow IT for agent tool surfaces. Shadow IT describes the SaaS apps employees use without asking security. Shadow MCP describes the servers agents talk to without asking anyone. The shape is similar. The blast radius is different. A shadow IT app runs when a human opens it. A shadow MCP server runs every time the agent starts a session, and agents iterate faster than humans. A server a person uses five times a day might get called five hundred times by an autonomous workflow. Every call is a trust crossing.

OWASP's MCP09:2025 entry describes shadow MCP as "unapproved or unsupervised deployments of Model Context Protocol instances that operate outside the organization's formal security governance." The language is close to Mend's write-up, and both point to the same governance problem.

Shadow MCP is not the same as tool poisoning. Tool poisoning is a malicious description hidden inside a known server. Shadow MCP is an unknown server. You can have a shadow MCP server that is completely benign and still create governance or audit problems, because the issue is inventory and control, not just malice. You can also have a poisoned tool inside an approved server, and that's a different failure mode that needs different defenses. Most teams have both problems at once.

## How shadow MCP happens

Shadow MCP doesn't require anyone to do anything wrong. It emerges from friction-free installation combined with a protocol designed for convenience. Six root causes account for almost every case.

**Developers install MCP servers from random repositories during exploration.** Someone reads a thread about a useful server, copies the install command from the README, runs it, and forgets about it. The config entry stays. The server runs every time they open the IDE. Nothing forced them to check who wrote it.

**AI IDEs auto-suggest MCP servers.** Claude Code, Cursor, Windsurf, VS Code, and JetBrains all ship or recommend servers out of the box. Some come pre-wired at install time. Others appear in settings panels with a one-click install. None went through your security team.

**Package managers make MCP servers trivially installable.** The dominant install pattern is `npx -y @org/mcp-server-name` or `uvx mcp-server-name`. Both commands pull and run code from a public registry with one line of config. No build step, no approval gate, no local cache to audit. Every session pulls fresh.

**MCP servers proliferate faster than inventory tools can track them.** The ecosystem added thousands of servers in 2025. Traditional software asset management tracks installers and packages. It doesn't track subprocess spawns, stdio connections, or config entries in IDE dotfiles.

**Claude Code skills and similar plugin systems spawn MCP connections under the hood.** Plugins don't always announce that they start an MCP server. A skill might spin one up as part of its installation, wire it into the agent's config, and never show up in a top-level server list. Shadow MCP hides behind shadow plugins.

**CI/CD pipelines pull MCP servers via supply chain.** A build script declares a server as a development dependency in `package.json` or `pyproject.toml`. When the pipeline runs, the server installs, the agent uses it for some automated task, and the pipeline exits. The only evidence is a line in a lockfile.

Each root cause is reasonable in isolation. Stacked, they produce an environment where nobody can answer "what MCP servers does our agent talk to?"

## The risks shadow MCP creates

The core risk is not that a shadow MCP server is always malicious. It's that you have no basis for saying it isn't.

**No security review of the server code.** Code that ships through `npx -y` can change between invocations. If nobody ran the review in the first place, there is no baseline to compare against.

**No authentication on the agent-to-server connection.** The MCP spec doesn't require auth between client and server. A stdio server trusts whoever spawned it. An HTTP-transport server trusts whoever reaches the endpoint. Adding auth is the author's choice, and many skip it for local-only use cases.

**Tool description poisoning hits agents that never went through approval.** If a shadow server has poisoned tool descriptions, the agent follows the hidden instructions the first time it calls `tools/list`. The difference with shadow MCP is that the server was never vetted, so there is no scanner between the install and the agent.

**Credential exposure when the agent passes tokens to an untracked server.** Agents build tool arguments from their context. If that context holds secrets, those secrets end up inside tool call arguments. A shadow server collecting those arguments has a credential pipeline the organization does not know exists.

**No audit trail when compliance comes calling.** A SOC 2 auditor asking about data flow from AI systems wants a list of every server the agent connects to, with owner, purpose, and data classification. If the answer is "we do not know," the audit finding writes itself.

**Rug-pull attacks can modify tools mid-session on servers nobody is watching.** Approved servers get runtime scanning. Shadow servers get nothing. The shadow path is the easier attack because it doesn't have to evade any defense.

**Supply chain attacks land on trusted developers before security notices.** A server pulled through a compromised package lands wherever the package lands: a developer laptop, a CI runner, a production container. The first traffic reaches the agent before any alert fires, because the server was never on anyone's watchlist.

The pattern across all seven risks is the same: visibility precedes every other control.

## Detection approaches

Finding shadow MCP requires hitting the problem from multiple angles. No single method catches everything. The following six work together.

**Static codebase scan.** Grep for MCP server configurations across the repo. Look for `mcp.json`, `.mcp/`, `.mcp-servers.json`, and `mcp_servers` keys in YAML and TOML files. Check `package.json` for dependencies matching `@modelcontextprotocol/*`, `*-mcp-server`, or known publisher namespaces. Check `pyproject.toml` and `requirements.txt` for Python MCP packages. Check IDE config files under `~/.config/claude-code/`, `~/.cursor/`, `~/.continue/`, `.vscode/`, and `.idea/`.

**Runtime network monitoring.** Observe outbound connections from agent processes. Flag endpoints not in the approved server catalog. This catches HTTP-transport servers that connect over SSE or Streamable HTTP. Stdio servers need a different approach because they communicate over file descriptors, not sockets, but any HTTP-based server shows up here.

**Process monitoring.** Watch for MCP server subprocesses spawned by developer tools. A Claude Code process that spawns `npx -y some-mcp-server` is running a shadow server whenever that command is not in the approved list. Tools like `auditd` on Linux or `osquery` on any Unix capture process lineage. MCP server commands follow predictable shapes.

**CI/CD inventory.** Audit pipelines for MCP servers pulled as dependencies. Software bill of materials tools surface package-level entries. Add a rule that flags MCP-related packages and run it against every pipeline before it ships. A server that only runs during build is still shadow MCP if nobody put it on the list.

**Agent egress proxy.** Route all MCP traffic through a proxy that logs connection attempts. Pipelock's MCP proxy logs every server the agent connects to, every tool it calls, and every response it receives. When a new server appears in the flight recorder that was not in the approved config, the log is the evidence. A proxy combined with network isolation (container namespaces, iptables rules, or cloud VPC egress controls) is the strongest enforcement because the agent physically cannot reach a server without going through the proxy. Without that isolation, proxy configuration alone can be bypassed by a prompt injection that resets environment variables.

**Package manager inventory.** List all npm, uv, pip, and cargo packages on developer machines and build environments with MCP identifiers in their names or metadata. Cross-reference against the approved list.

One method alone leaves gaps. A developer who manually types server commands into an IDE bypasses the package scan. A server that only runs in CI bypasses the process monitor on developer laptops. A stdio server bypasses network monitoring. Combining the six closes the gaps.

## How to assess a newly discovered shadow MCP server

When you find one, you need to decide: approve, remediate, or block. This is the review checklist.

**Who wrote and maintains it.** Identify the author and check their publication history. A server from an established vendor is a different risk than one from a one-off account with no track record. An unmaintained server is a stuck attack surface.

**Is the source auditable.** For open source servers, check the repository for license, README, commit history, and issue activity. A server with no tests, no issues, and a single commit from 2024 is not ready for production use, shadow or not.

**What tools it exposes and what permissions those tools need.** Connect through a proxy and pull `tools/list`. Read the full descriptions, including parameter names, defaults, and schemas. A server that exposes `read_file`, `write_file`, and `execute_shell` has a different threat model than one that exposes `search_docs` and `format_text`. Match the tool surface against the agent's intended purpose.

**Does it handle credentials.** Check whether the server accepts auth tokens, API keys, or cookies as input. A server that stores credentials on disk is a credential risk. A server that forwards credentials to a third party is an exfiltration risk. Both are fine if you know and trust the design. Both are dangerous if you do not.

**Does it make network calls to third-party services.** Many MCP servers are facades over external APIs. Understand which services it contacts, what data it sends, and what data it retrieves. A shadow server calling out to an unfamiliar domain should be blocked at the egress layer until the destination is approved.

**Does it have a threat model documented.** Mature server authors state what they protect against and what they don't. Absence is not a reason to block, but it raises the bar for review depth.

**Is it covered by any scanner.** Run it through [Cisco mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner), Snyk agent-scan, or Enkrypt AI. These pre-deploy scanners check tool descriptions for injection patterns and known-bad structures. A clean scan does not guarantee the server is safe, but a hit is a hard block.

At the end of review, write down the decision, the reviewer, and the date. That record is what turns a shadow server into an inventoried one.

## Policy enforcement for known MCP servers

Once you have an approved catalog, the next step is enforcing it. Unapproved servers should not run at all. Approved ones should run under the same scanning discipline as everything else.

**Allowlist approach.** Only approved servers can start. Everything outside the list is blocked at spawn time. This is the strictest model and the hardest to maintain, because developers need a process to add a server. It works for regulated environments where change control already exists.

**Denylist approach.** Known-bad or unvetted servers are blocked. Everything else runs. Easier to maintain but weaker, because a new shadow server starts as unknown (therefore allowed) until someone adds it to the denylist. For most teams, this is a starting point that evolves into allowlisting.

**Runtime scanning at the proxy layer.** Every approved server still runs through scanning. Pipelock's MCP proxy scans tool descriptions for poisoning, tool arguments for credentials, and tool responses for injection. Approval is permission to run. Scanning is the check that the server's behavior matches the approval.

**Tool description fingerprinting for rug-pull detection.** On first contact, the proxy fingerprints every tool description with SHA-256. Subsequent descriptions are compared against the baseline. Any change triggers an alert or block with a diff of what changed. This catches the case where an approved vendor ships a silent update that changes tool semantics.

**Authorization and identity verification.** Where the MCP transport supports it, require authentication on the server connection. HTTP-transport servers can enforce API keys or mTLS. Stdio servers can be wrapped in binaries that verify calling process identity. This doesn't stop shadow MCP by itself, but it raises the bar for connecting to approved servers.

## Building an MCP server inventory

Inventory is the operational work underneath every policy. If you cannot produce a current list of approved servers on demand, you do not have an inventory. A project folder with stale YAML does not count.

**Initial discovery sweep.** Run the six detection methods above. Collect every MCP server reference across repos, IDE configs, CI pipelines, and package manifests. Deduplicate. The output is a raw list of everything your agents could reach today.

**Continuous monitoring.** One sweep is a snapshot. Options for staying current: a nightly CI job that runs the static scan across the monorepo, a flight recorder query that lists every server the proxy saw in the last 24 hours, and a hook in the IDE config directory that alerts on new entries.

**Ownership tracking.** Every approved server needs a human owner. The owner is accountable for keeping the server updated, reviewing changes, and responding when the server's tools trigger an alert. Without an owner, the server drifts out of review the moment the original installer leaves the team.

**Review cadence.** Approved servers need periodic re-review. Quarterly is reasonable for most environments. High-risk servers (shell execution, file writes, external network access) need tighter cadences.

**Pipelock's role.** Route all MCP traffic through `pipelock mcp proxy`. Every server connection gets a flight recorder entry. The flight recorder is a hash-chained, tamper-evident JSONL log with Ed25519 signed checkpoints, so the inventory it produces is strong audit evidence. Comparing observed servers against the approved config surfaces every shadow server the agent actually used, not just the ones that were supposed to exist.

## Shadow MCP and compliance

Shadow MCP maps cleanly onto existing frameworks. Auditors who never heard the term still have controls that apply.

**SOC 2 Trust Services Criteria.** CC6 (Logical Access) and CC7 (System Operations) require control over data flows and inventories of resources. An agent connecting to unknown MCP servers is a data flow the organization cannot describe. Depending on scope and assessor judgment, shadow MCP can create gaps against the requirement that data flows are known and controlled.

**EU AI Act.** Article 12 requires automatic event logging for high-risk AI systems. Article 15 requires accuracy, robustness, and cybersecurity controls. Shadow MCP connections are events the organization cannot log because it didn't know the endpoint existed. Whether the AI Act applies depends on whether the system is classified as high-risk, but if it does, inventory gaps make compliance harder to demonstrate.

**NIST SP 800-53 Rev. 5.** The CM (Configuration Management) family requires baseline configurations and inventory of system components. The SR (Supply Chain Risk Management) family requires awareness of third-party components. A shadow server can create gaps against CM-8 (Information System Component Inventory), AU-2 (Event Logging), and SR-3 (Supply Chain Controls). Applicability depends on the control baseline selected and the system boundary, but the pattern is consistent: unknown connections weaken inventory and audit controls.

The most durable reason to solve shadow MCP is not fear of an attacker. It is that "we do not know what our agents connect to" can become a compliance problem even before an attacker shows up.

## How Pipelock detects shadow MCP

[Pipelock](/pipelock/) is an open-source agent firewall. Its role in shadow MCP is visibility, enforcement, and evidence.

**Route MCP traffic through `pipelock mcp proxy`.** Every session runs behind the proxy in stdio wrap mode (`pipelock mcp proxy -- npx @some/mcp-server`) or HTTP upstream mode (`pipelock mcp proxy --upstream https://mcp.example.com/sse`). The agent config points at the proxy. The proxy points at the server. When backed by network isolation, the agent cannot reach a server that isn't wired through the proxy, which means the proxy sees every connection. Without isolation, the proxy still sees all traffic routed through it, but enforcement depends on the agent respecting its configuration.

**Every connection gets logged with the hash-chained flight recorder.** The [flight recorder](/learn/flight-recorder/) captures each session as structured JSONL with cryptographic receipts: every tool call, every response, every description seen on `tools/list`. The log is tamper-evident and signed at configurable checkpoints. That log is the inventory.

**New servers not in config get flagged.** When a new server appears outside the approved catalog, the flight recorder captures it. Alert on unknown server identifiers and route wherever your incident workflow lives.

**Tool descriptions fingerprinted to catch rug-pulls.** The proxy fingerprints tool definitions with SHA-256 on first sight. Mid-session description changes produce a diff and trigger the configured action. Approved vendors ship silent updates too.

**Bidirectional content scanning catches bad behavior from approved servers.** Pipelock scans tool arguments for credentials using 65 DLP patterns and tool responses for {{< stat key="response_patterns" >}} injection patterns. Tool descriptions are scanned by both the injection patterns and a separate set of tool-specific poisoning checks (rug-pull detection, exfiltration directives, cross-tool manipulation). The scanners normalize text and decode encoded variants on each path so leetspeak, homoglyphs, zero-width characters, and encoded payloads are harder to hide. Approved is not the same as trusted.

Pipelock doesn't replace the review work. It replaces the guessing work. You still decide which servers to approve. Pipelock makes sure the decision is enforced and the evidence exists.

## Further reading

- [MCP Security](/learn/mcp-security/): the full MCP threat model including tool poisoning, rug-pulls, and response injection
- [MCP Vulnerabilities](/learn/mcp-vulnerabilities/): every MCP attack vector in one place with runtime defenses for each
- [MCP Tool Poisoning](/learn/mcp-tool-poisoning/): how hidden instructions in tool descriptions hijack agents
- [MCP Proxy](/learn/mcp-proxy/): how Pipelock's MCP proxy scans tool traffic bidirectionally
- [MCP Authorization](/learn/mcp-authorization/): OAuth 2.1, scoped tokens, and the confused deputy problem
- [State of MCP Security 2026](/blog/state-of-mcp-security-2026/): incident timeline and control coverage matrix
- [OWASP MCP Top 10](/learn/owasp-mcp-top10/): risk categories including MCP09 Shadow MCP Servers
- [Compliance Evidence](/learn/compliance-evidence/): framework mappings and signed assessment bundles for auditors
- [Pipelock](/pipelock/): product overview and installation
- [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10): the upstream framework, including MCP09 Shadow MCP Servers
- [Vulnerable MCP Project](https://vulnerablemcp.info/): a catalog of known vulnerabilities and attack patterns in public MCP servers
- [Mend's shadow MCP post](https://www.mend.io/blog/shadow-mcp-unauthorized-ai-connectivity-in-your-codebase/): an early public write-up on unauthorized AI connectivity
