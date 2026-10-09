---
title: "AI Agent Security Best Practices: A Practical Checklist"
linkTitle: "Agent Security Best Practices"
subtitle: "The controls that matter, in the order you should add them."
description: "AI agent security best practices start with least privilege, network isolation, and runtime inspection. Use this checklist to lock down your agents."
date: 2026-04-11
faq:
  - q: "What is the most important AI agent security best practice?"
    a: "Start with least privilege. Remove credentials your agent doesn't need, restrict file system access to specific directories, and block network egress to all domains except those the agent actually uses. Most agent compromises exploit permissions that should never have been granted."
  - q: "How do you secure MCP tool calls from AI agents?"
    a: "Route all MCP traffic through a scanning proxy that inspects tool descriptions for poisoning, tool arguments for credential leaks, and tool responses for prompt injection. Pin tool descriptions with cryptographic hashes to detect mid-session changes (rug-pulls). Block tools that request access beyond their stated purpose."
  - q: "Should you red team AI agents before deploying them?"
    a: "Yes. Run prompt injection tests against every agent that has network access or credentials. Test with encoded payloads (base64, hex, Unicode), indirect injection via tool responses, and multi-step exfiltration chains. Automated red teaming catches the attacks you didn't think of."
  - q: "How do you keep SSH keys and credentials safe from an AI agent?"
    a: "Use two controls. Treat an OpenAI-powered agent like any code-running agent: keep `~/.ssh` and credential files out of reach with OS or container filesystem isolation. Then route HTTP and MCP egress through a proxy that scans outbound traffic for SSH keys and tokens. Isolation prevents the read. Egress inspection blocks common credential-shaped leaks if the agent gets access anyway."
learn_cat: concepts
level: intro
tags:
  - best-practices
  - checklist
---
AI agents ship with broad permissions by default. They get API keys, file system access, shell execution, and internet connectivity. When an agent is compromised through prompt injection, every one of those permissions becomes an attack vector.

These best practices are ordered by impact. Start at the top and work down. Each one closes a category of attack that the previous steps leave open.

## Start with least privilege

Most agents run with more access than they need. A coding agent with read/write to your entire home directory can exfiltrate SSH keys. An agent with unrestricted internet access can POST credentials to any endpoint. The first step is removing what's unnecessary.

**Credentials:** Only mount the API keys and tokens the agent actually uses. If the agent doesn't call AWS, don't set `AWS_ACCESS_KEY_ID` in its environment. Use short-lived tokens instead of long-lived keys. Rotate them on a schedule.

**File system:** Restrict the agent to the directories it needs. A code generation agent needs the project directory, not `/etc/` or `~/.ssh/`. Use filesystem sandboxing or container mounts to enforce boundaries the agent can't override.

**Network:** Block all outbound connections except the domains the agent requires. If the agent only calls the OpenAI API and GitHub, those are the only two domains it should reach. Every other domain is a potential exfiltration target.

**Tools:** Only expose the MCP tools the agent needs for its task. A research agent doesn't need a shell executor. A summarization agent doesn't need a file writer. Each unnecessary tool increases the attack surface.

## Isolate agent network traffic

Even with least privilege, agents still need some network access. The question is how you control it.

**Egress proxy:** Route all agent HTTP traffic through a proxy. The proxy enforces a domain allowlist. Requests to unlisted domains get blocked before DNS resolution. This prevents exfiltration to attacker-controlled servers even if the agent is fully compromised, provided the agent cannot bypass the proxy. Enforce that with container networking, NetworkPolicy, or kernel egress containment.

**Domain allowlists over denylists:** Denylists are always incomplete. New attacker domains appear daily. Allowlists flip the problem: only approved destinations are reachable. Everything else is blocked by default.

**DNS controls:** Block DNS queries to external resolvers. Agents can encode secrets in DNS query strings (subdomain-based exfiltration). Force all DNS through your proxy or a controlled resolver that strips suspicious patterns.

**SSRF prevention:** Block requests to private IP ranges (10.x, 172.16.x, 192.168.x) and cloud metadata endpoints (169.254.169.254). A compromised agent can pivot to internal services or steal cloud credentials through SSRF if these aren't blocked.

## Inspect tool calls and responses

Network isolation handles HTTP traffic. MCP tool calls need separate inspection because they often travel over stdio, not HTTP.

**Scan tool arguments:** Run DLP (data loss prevention) on every tool call's arguments. Credential patterns like API keys, tokens, and private keys should trigger a block before the arguments reach the MCP server.

**Scan tool responses:** Inspect what comes back from tools. Responses can contain prompt injection that hijacks the agent's next action. Scan for known injection patterns and flag suspicious instructions embedded in tool output.

**Detect tool poisoning:** MCP servers advertise tool descriptions that the agent trusts implicitly. A malicious server can embed hidden instructions in those descriptions. Scan descriptions for injection patterns and pin them with SHA-256 hashes. If a description changes mid-session, block it.

**Bidirectional scanning:** Arguments flow out. Responses flow in. Descriptions arrive at session start and can change later. All three directions need inspection. A proxy like [Pipelock](/pipelock/) handles this by wrapping MCP servers and scanning every JSON-RPC message.

## Log everything

Security without logging is security without evidence. When something goes wrong, you need to know what happened, when, and what data was involved.

**Structured audit trail:** Log every tool call, every HTTP request, every block decision. Include timestamps, tool names, argument hashes (not raw secrets), and the rule that triggered each action. Structured logs are searchable. Unstructured logs are noise.

**Tamper detection:** If an attacker can modify your logs, they can cover their tracks. Use hash-chained log entries where each record includes the hash of the previous one. An Ed25519-signed checkpoint at regular intervals lets you prove the chain hasn't been altered.

**Redaction:** DLP logs will contain references to the secrets they caught. Redact the actual credential values in log output while preserving enough context to identify what was blocked and why.

**Retention:** Keep logs long enough for incident response and compliance. Most frameworks (SOC 2, NIST 800-53, EU AI Act) require audit trails for AI system actions. Define retention before you need it, not during an incident.

## Test with adversarial inputs

Defenses that aren't tested are assumptions. Red teaming turns assumptions into evidence.

**Prompt injection tests:** Feed your agent payloads designed to override its instructions. Test direct injection (in the user prompt), indirect injection (in tool responses and fetched content), and encoded injection (base64, hex, URL encoding, Unicode normalization tricks).

**Exfiltration tests:** Plant canary tokens (fake API keys, synthetic credentials) in the agent's environment. Run prompt injection attacks and verify whether the canary values appear in outbound traffic. If they do, your DLP and egress controls have gaps.

**Multi-step chains:** Test attacks that span multiple tool calls. An agent might read a secret with one tool and exfiltrate it with another three steps later. Single-call inspection misses these unless you're scanning the data at each stage.

**Automate it:** Manual red teaming doesn't scale. Build a test suite that runs injection and exfiltration scenarios against every agent configuration change. The [Pipelock Gauntlet](/gauntlet/) runs standardized egress security benchmarks you can use as a starting point.

## Checklist

1. Audit every credential in the agent's environment. Remove any it doesn't need.
2. Restrict file system access to specific directories.
3. Route all HTTP traffic through an egress proxy with a domain allowlist.
4. Block private IP ranges and cloud metadata endpoints.
5. Wrap all MCP servers through a scanning proxy.
6. Enable DLP scanning on tool arguments and HTTP request bodies.
7. Enable injection scanning on tool responses and HTTP response bodies.
8. Pin MCP tool descriptions with hashes to detect rug-pulls.
9. Set up structured, hash-chained audit logging.
10. Run automated prompt injection tests before every deployment.
11. Plant canary tokens and verify they trigger DLP on exfiltration attempts.
12. Review and rotate all agent credentials on a regular schedule.

## Further reading

- [AI Agent Security](/learn/ai-agent-security/): the three security layers explained
- [What is an Agent Firewall?](/agent-firewall/): the egress inspection architecture
- [How to Secure Your MCP Setup](/learn/how-to-secure-mcp/): seven attacks, seven defenses
- [MCP Proxy](/learn/mcp-proxy/): how scanning MCP traffic works
- [Pipelock](/pipelock/): open-source agent firewall with DLP, injection scanning, and egress control
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
