---
title: "AI Agent Security & Hardening: 2026 Checklist Mapped to OWASP"
linkTitle: "AI Agent Security"
seoTitle: "AI Agent Security & Hardening: 2026 Checklist"
subtitle: "Identity, scoped tokens, sandboxing, egress allowlists, approvals, logging, and a kill switch, mapped to OWASP and ISACA."
description: "AI agent security and hardening checklist mapped to OWASP: identity, scoped tokens, sandbox, egress allowlist, approvals, logging, and kill switch."
date: 2026-04-07
lastmod: 2026-10-21
faq:
  - q: "What are the three layers of AI agent security?"
    a: "AI agent security has three distinct layers: agent-side hooks (intercept tool calls before execution), inference guardrails (classify prompts and completions for safety), and egress inspection (scan actual network traffic between the agent and the internet). Each layer catches different attacks. No single layer covers everything."
  - q: "Why do AI agents need security beyond the model's built-in safety?"
    a: "AI agents have network access, file system access, and API credentials. A prompt injection can make the agent exfiltrate secrets via HTTP, leak credentials through MCP tool calls, or access internal services via SSRF. The model's built-in safety training helps but can be bypassed. Defense-in-depth requires security controls outside the model's trust boundary."
  - q: "What is egress inspection for AI agents?"
    a: "Egress inspection is a network proxy that sits between an AI agent and the internet, scanning the outbound and inbound traffic it mediates. It checks HTTP requests for leaked secrets, MCP tool calls for poisoned descriptions, responses for prompt injection, and URLs for SSRF attempts. Because it runs as a separate process, prompt injection cannot rewrite its rules. Enforcement still depends on isolation that keeps the agent from routing around the proxy."
  - q: "What is AI agent security?"
    a: "AI agent security is the set of controls that limit what an AI agent can reach and do, and that record what it did. An agent holds credentials, runs tools, and reads untrusted content, so a prompt injection can turn its permissions against you. The core controls are per-agent identity, short-lived scoped credentials, sandboxed execution, an egress allowlist, human approval for high-impact actions, tamper-resistant logs, and a way to stop the agent quickly."
  - q: "What does AI agent hardening mean?"
    a: "Agent hardening means reducing an agent's access to the minimum its task needs and putting deterministic controls outside the model: a sandbox for execution, a proxy that enforces which destinations it can reach, approval gates for risky tool calls, and a kill switch. The model's own safety training is not a security boundary."
  - q: "Why isn't the model's built-in safety enough?"
    a: "Model safety training can be bypassed with crafted input, and the model can't reliably tell instructions from data in fetched pages or tool results. Controls that run outside the agent's process, such as a sandbox or an egress proxy, keep working when the model is fooled."
learn_cat: concepts
level: intro
tags:
  - agent-security
  - layers
  - explainer
---

*Last updated: 2026-10-21.*

AI agent security is not one tool or one layer. Your agent has API keys, file system access, and an internet connection. When something goes wrong, secrets leave through HTTP requests, MCP tool calls, or DNS queries before anyone notices. The model's built-in safety training helps, but it's not a security boundary. It can be bypassed with the right prompt.

Real defense requires multiple layers, each catching different attacks at different points. Most teams either have zero layers or think one tool covers everything. Neither is true.

Hardening an agent means two things. Give it only the access its task needs. Then put deterministic controls outside the model, where a prompt can't turn them off. This page is a checklist for both, mapped to two public sources:

- the [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- ISACA's white paper [Cybersecurity Recommendations for Securing AI Agents](https://www.isaca.org/resources/white-papers/2026/cybersecurity-recommendations-for-securing-ai-agents) (15 September 2026)

Each item also lists what [Pipelock](/pipelock/) can do for it. The configs were checked with `pipelock check` on the v3.7.0 release, and the result is noted for each one. Several items are things Pipelock does not do, and the page says so.

For MCP-specific controls (tool poisoning, drift, argument DLP), see [MCP Security](/learn/mcp-security/).

## The hardening checklist (2026-10-21)

| # | Control | OWASP AI Agent Security Cheat Sheet | ISACA practice category | Pipelock role |
|---|---|---|---|---|
| 1 | Per-agent identity | §7 Multi-Agent Security (authenticate agents) | Strong Identity, Authentication, and Authorization | Attribution only |
| 2 | Short-lived, scoped credentials | §1 Tool Security & Least Privilege; §8 Data Protection | Strong Identity…; Data Protection, Secrets Management, and Memory Security | Leak detection only |
| 3 | Sandboxed execution | Don't: "execute arbitrary code without sandboxing"; §7 "Isolate agent execution environments" | Network Segmentation, Isolation, and Sandbox Execution | Yes (Linux, macOS) |
| 4 | Egress allowlist | §5 boundaries on output actions; key risk: Data Exfiltration | Network Segmentation…: "Restrict outbound traffic to approved domains" | Yes |
| 5 | Approval for high-impact actions | §4 Human-in-the-Loop Controls; High-Impact Action Integrity Controls | Policy Enforcement, Output Control, and Human Oversight | Yes, for MCP tool calls |
| 6 | Tamper-resistant logging | §6 Monitoring & Observability | Logging, Monitoring, Detection, and Incident Response | Yes |
| 7 | Kill switch and safe degradation | §4 "Allow users to interrupt and rollback agent operations"; §7 circuit breakers | Reliability, Resilience, Kill Switches, and Safe Degradation | Yes |


### 1. Give each agent its own identity

Shared accounts and shared tokens make it impossible to tell which agent did what, or to revoke one without breaking the others. ISACA: "Use per-agent and per-workload identity; do not share accounts or long-lived tokens", and "Separate identities for human users and functions and the agent runtime, tool runner, and admin/operator."

**What Pipelock does:** it attributes traffic to an agent name in logs, receipts, and metrics. It does not issue or verify credentials for your other systems. On the free tier, set a default identity and bind it so a caller can't claim a different name through the `X-Pipelock-Agent` header:

```yaml
version: 1
mode: balanced
default_agent_identity: "deployment/research-agent"
bind_default_agent_identity: true
```

Validation (v3.7.0): `pipelock check --config 01-identity.yaml` → `Config validation: OK`, exit 0.

Per-agent profiles, where each agent gets its own listener port, mode, and allowlist, use the `agents:` section. It requires a license key:

```yaml
version: 1
agents:
  claude-code:
    listeners: [":8889"]
    mode: strict
    api_allowlist: ["github.com", "*.githubusercontent.com", "*.anthropic.com"]
  _default:
    mode: balanced
```

Validation (v3.7.0): `Config validation: OK`, exit 0, with the warning `agents: section requires a license key. Multi-agent profiles disabled. Single-agent protection is active.` The config parses, but without a license the profiles are not applied.

### 2. Use short-lived, scoped credentials

Only give the agent the keys it uses. Prefer short-lived tokens with automatic rotation, and scope each one to the narrowest set of resources. ISACA: "Never place secrets in prompts. Use a secrets manager and scoped tokens for all credentials." The OWASP cheat sheet asks for "per-tool permission scoping (read-only vs. write, specific resources)."

**What Pipelock does:** it doesn't mint, scope, or rotate tokens. That is your identity provider's and secrets manager's job. It catches a credential leaving the machine: 65 built-in DLP patterns run on URLs, headers, and request bodies (when [request body scanning](https://github.com/pipelab-org/pipelock/blob/v3.7.0/docs/configuration.md#request-body-scanning) is on), and on MCP tool arguments. A short-lived token that leaks is still a leak; DLP and short lifetimes cover different halves of the problem. [Canary tokens](/learn/canary-tokens/) (`pipelock canary`) let you test whether a planted fake credential gets caught.

### 3. Run tools and code in a sandbox

ISACA: "Run tool execution, code interpretation, browser automation, and file parsing in sandboxed environments such as containers, virtual machines (VMs), or microVMs." The OWASP cheat sheet's Don'ts include letting agents "execute arbitrary code without sandboxing."

**What Pipelock does:** `pipelock sandbox` and `pipelock mcp proxy --sandbox` run a command with Landlock filesystem rules, a network namespace, and, on `linux/amd64` only, a seccomp syscall filter. Protected directories such as `~/.ssh`, `~/.aws`, and `~/.kube` are denied. Inside the namespace, HTTP(S) can only leave through Pipelock. On macOS it uses sandbox-exec profiles. `strict: true` refuses to start if any layer is unavailable:

```yaml
version: 1
mode: strict
api_allowlist:
  - "*.anthropic.com"
sandbox:
  enabled: true
  strict: true
  workspace: /home/user/project
  filesystem:
    allow_write:
      - /tmp/agent-work
```

Validation (v3.7.0): `Config validation: OK`, exit 0. `check` does not test whether the host supports the layers; run `pipelock sandbox --dry-run --json -- <command>` on the target machine for that.

Limits: on Linux it needs kernel 5.13+. On non-amd64 Linux, seccomp is unavailable and containment is two of three layers. In containers without user namespaces, the `--best-effort` mode can't create a network namespace, so a child process that clears `HTTPS_PROXY` can reach the network directly. On Ubuntu 24.04+, AppArmor's user-namespace restriction can block the launch. See the [sandbox reference](https://github.com/pipelab-org/pipelock/blob/v3.7.0/docs/configuration.md#sandbox).

### 4. Allowlist egress

Deny outbound access by default and allow only the destinations the agent needs. ISACA's checklist says "Deny outbound access by default", and its controls say "Route outbound requests through inspection or proxy layers when practical" and "Block access to internal admin interfaces, metadata services, and nonapproved internal network resources."

**What Pipelock does:** in `strict` mode only `api_allowlist` domains are reachable. Private, link-local, and metadata ranges are blocked by default, with a post-DNS check against rebinding. Allowlisting a domain does not turn off DLP or response scanning for it.

```yaml
version: 1
mode: strict
api_allowlist:
  - "*.anthropic.com"
  - "github.com"
  - "*.githubusercontent.com"
  - "registry.npmjs.org"
```

Validation (v3.7.0): `Config validation: OK`, `Mode: strict`, `API allowlist: 4 domains`, exit 0.

`*.example.com` matches subdomains and the apex. Wildcards over a whole TLD (`*.com`) are refused. Leave chat platforms such as Slack, Discord, and Telegram off the list unless you need them; they are common exfiltration channels. In `balanced` mode (the default) all domains are reachable, and Pipelock blocks known-bad traffic instead.

The allowlist only applies to traffic that goes through Pipelock. Enforce that with the sandbox, container networking, or a Kubernetes NetworkPolicy (`pipelock init sidecar` generates a companion-proxy setup).

### 5. Require approval for high-impact actions

The OWASP cheat sheet: "Require explicit approval for high-impact or irreversible actions," and bind approval "to the exact action," including the actor, tool name, target, parameters, and expiry. ISACA calls for "a deterministic policy enforcement point (PEP) between agent outputs and action-capable systems."

**What Pipelock does:** in `mcp_tool_policy`, `action: defer` holds a matching MCP tool call until a resolver program returns `allow`. Anything else blocks: timeout, error, restart, kill switch, or any other output. The resolver gets a manifest with the target, method, and argument digest, and each held call produces a hash-chained receipt.

```yaml
version: 1
defer:
  enabled: true
  timeout_seconds: 120
  max_pending: 64
  max_pending_per_session: 8
mcp_tool_policy:
  enabled: true
  action: warn
  defer_resolver_profiles:
    approve-writes:
      exec: ["/usr/local/bin/approve-resolver"]
      reason: "human approval for write tools"
  rules:
    - name: "hold-file-writes"
      tool_pattern: "^(write_file|fs_write)$"
      action: defer
      resolution_policy:
        resolver_profile: approve-writes
        allow_on:
          approval: true
```

Validation (v3.7.0): `Config validation: OK`, exit 0. `check` doesn't verify that `/usr/local/bin/approve-resolver` exists. You write that program; it must print exactly `allow`, `block`, or `step_up`. Operators can also list and resolve held calls with `pipelock session deferred`. The shipped default is `timeout_seconds: 2`; a human needs a longer window, as above.

Limits: defer works on MCP stdio and the stdio-to-HTTP bridge. On other MCP transports, a matching call is blocked rather than held. It doesn't cover HTTP requests or actions the agent takes outside MCP. Setting `rules:` replaces the 30 built-in tool policy rules, so copy in any you still want.

### 6. Log every action in a tamper-resistant record

The OWASP cheat sheet: "Log all agent decisions, tool calls, and outcomes," including "authorization outcome, approval identifier, execution result, and policy version." ISACA asks for "centralized, tamper-resistant logging" with redaction.

**What Pipelock does:** structured JSON audit logs, plus a flight recorder. The flight recorder writes every scanner verdict, tool call, and session event to JSONL with SHA-256 hash chains, optional Ed25519-signed checkpoints, and redaction.

```yaml
version: 1
logging:
  format: json
  output: both
  file: /var/log/pipelock/audit.jsonl
  include_allowed: true
  include_blocked: true
flight_recorder:
  enabled: true
  dir: /var/lib/pipelock/evidence
  checkpoint_interval: 1000
  retention_days: 90
  redact: true
```

Validation (v3.7.0): `Config validation: OK`, exit 0. Without a `flight_recorder.dir`, v3.7.0 prints `[ADVISORY] flight_recorder is enabled but dir is unset; no receipts will be written`, so set one.

Pipelock logs what passes through it. It doesn't see the model's prompts or reasoning, or actions that never reach the network or an MCP server. Forward events to your SIEM with the `emit` section (webhook, syslog, or OTLP).

### 7. Keep a kill switch ready

ISACA: "Add global and per-capability kill switches to disable unsafe agent behavior quickly," and design fallbacks such as read-only mode. The OWASP cheat sheet: "Allow users to interrupt and rollback agent operations."

**What Pipelock does:** a deny-all kill switch with several independent triggers: the `enabled` config field, a sentinel file, an API call, and `SIGUSR1`. Any one of them active denies traffic. Put the API on a separate port so the agent can't reach it to switch it off, and keep the token out of the config file:

```yaml
version: 1
kill_switch:
  enabled: false
  sentinel_file: /var/run/pipelock/kill
  message: "Emergency deny-all active"
  api_listen: "127.0.0.1:9090"
  api_token: ""
```

Validation (v3.7.0): run with `PIPELOCK_KILLSWITCH_API_TOKEN` set, `Config validation: OK`, exit 0. Without the variable or an `api_token`, validation fails with `kill_switch.api_listen requires kill_switch.api_token or PIPELOCK_KILLSWITCH_API_TOKEN to be set`. That failure is the check working as intended.

Don't set `enabled: true` unless you want deny-all from startup. That field is a trigger, not an on/off switch for the feature. To stop traffic, `touch /var/run/pipelock/kill`, send `SIGUSR1`, or `POST /api/v1/killswitch` on the API port with the bearer token. Under `pipelock mcp proxy`, the API port serves only the deferred-action routes, so use the sentinel file there. A tool call already sent upstream before activation can't be recalled.

For a softer response than deny-all, adaptive enforcement and airlock can move one session into observe-only, read-only, or drain tiers. See the [kill switch and airlock reference](https://github.com/pipelab-org/pipelock/blob/v3.7.0/docs/configuration.md#kill-switch).

## Beyond the seven: test it

Hardening that hasn't been tested is an assumption. The OWASP cheat sheet's section 9 lists abuse cases to test before production and after changes to prompts, tools, memory, or providers. They include prompt override, tool misuse, privilege escalation, memory poisoning, data exfiltration, recursive tool abuse, approval bypass, and multi-agent chaining. ISACA's checklist says to "Conduct red team exercises continuously for prompt injection and tool misuse."

- Plant [canary tokens](/learn/canary-tokens/) and check that they're caught on the way out.
- Run `pipelock simulate` or `pipelock demo` against your config to see which attack scenarios it stops.
- Test indirect injection through tool results and fetched pages, not only the user prompt. Test encoded payloads (base64, hex, Unicode tricks) and multi-step chains, where one call reads a secret and a later call sends it out.

## Where Pipelock fits

Pipelock runs as a separate process between the agent and the network, and between the agent and its MCP servers. It covers egress allowlisting, DLP, response and MCP scanning, sandboxing, approval holds for MCP tool calls, audit evidence, and the kill switch.

It does not cover:

- **Identity and credential issuance.** It attributes traffic. It doesn't issue, scope, or rotate the agent's tokens for other systems.
- **The model's reasoning.** It can't see prompts or chain of thought. Inference guardrails are a separate layer.
- **Memory security.** Memory isolation, TTLs, and integrity checks (OWASP §3, ISACA's memory controls) belong to your agent framework.
- **Local actions with no network or MCP traffic.** A file write from a shell is only covered if the sandbox or a hook blocks it.
- **Traffic that bypasses it.** Without the sandbox, container networking, or a NetworkPolicy, a compromised agent can connect directly.
- **Unknown attack patterns.** DLP and injection detection match known shapes and phrasing.
- **Governance.** Inventory, ownership, change control, and supplier risk (ISACA's first two practice categories) are organizational work.

Read the [measured coverage and known gaps](/proof/) and [known limitations](/learn/known-limitations/) before relying on it.

## The three security layers

There are three fundamentally different places to enforce security on AI agents. They're not interchangeable. Each one operates at a different level of the stack, sees different data, and stops different attacks.

### Layer 1: Agent-side hooks

**What it is:** Code that intercepts tool calls before the agent executes them. Hooks see the tool name and arguments, run checks, and return allow/deny.

**Examples:** [Sage](https://github.com/gendigitalinc/sage) (Gen Digital), AgentGuard (GoPlus), Claude Code's built-in permission system.

**What it catches:** Dangerous shell commands, suspicious file writes, known-bad URLs in tool arguments, package supply chain attacks.

**What it misses:** Anything that doesn't go through the hook system. HTTP requests made by tools after they execute. Secrets encoded in base64 or hex. Response content returning from tools (hooks run pre-execution, not post). MCP tool descriptions that poison the agent before any tool is called.

**The fundamental limit:** Hooks run inside the agent's process. A successful prompt injection can potentially disable or bypass them.

### Layer 2: Inference guardrails

**What it is:** A classifier (usually ML-based) that analyzes prompts and completions for safety. Either embedded in the application code or called as an API.

**Examples:** [LlamaFirewall](https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) (Meta), [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) (NVIDIA), Guardrails AI.

**What it catches:** Direct jailbreak attempts, harmful content generation, some prompt injection patterns in the model's input and output.

**What it misses:** Secrets in HTTP traffic (guardrails don't see HTTP requests). MCP tool poisoning (guardrails don't parse MCP protocol). Encoded exfiltration (base64 secrets in URLs look like normal text to a classifier). DNS-based exfiltration. SSRF. Anything that happens at the network layer.

**The fundamental limit:** Guardrails analyze text for semantic safety. They don't see network traffic. An agent that passes a guardrail check can still exfiltrate your AWS keys through a perfectly benign-looking HTTP request.

### Layer 3: Egress inspection

**What it is:** A network proxy between the agent and the internet. Mediated traffic flows through it. It scans HTTP requests, MCP messages, and WebSocket frames for security violations. DLP runs before DNS resolution, blocking strict-mode secret exfiltration through DNS query strings and detecting it in balanced mode.

**Examples:** [Pipelock](/pipelock/) does content-inspecting egress proxy for AI agents (DLP, injection, SSRF, encoding evasion across HTTP, MCP, and WebSocket). GitHub's [agent workflow firewall](https://github.com/github/gh-aw-firewall) does domain-level allowlisting without content scanning. Most other tools in this space either scan MCP only or do allowlisting only.

**What it catches:** Secret exfiltration (API keys, tokens, credentials in URLs, headers, POST bodies, tool arguments), prompt injection in fetched content and tool responses, SSRF (private IPs, cloud metadata, DNS rebinding), MCP tool poisoning and rug-pulls, multi-tool exfiltration chains, encoded secrets (base64, hex, URL encoding, Unicode tricks).

**What it misses:** Attacks that don't touch the network (local file manipulation, in-memory reasoning corruption). Jailbreaks that change the agent's behavior without producing suspicious traffic. That's where hooks and guardrails complement it.

**The fundamental advantage:** Runs as a separate process with no shared memory. The agent can't disable it through prompt injection. If direct egress is blocked with container networking, NetworkPolicy, or kernel egress containment, even a fully compromised agent's network traffic still passes through the proxy.

## Why one layer isn't enough

| Attack | Hooks | Guardrails | Egress Inspection |
|--------|-------|------------|-------------------|
| Shell command injection | Catches | Misses | Misses (no shell visibility) |
| Secret in URL query param | Misses (no URL scanning) | Misses (not text safety) | **Catches** |
| Secret in POST body | Misses (no body visibility) | Misses | **Catches** |
| MCP tool poisoning | Misses (no MCP parsing) | Misses (no MCP parsing) | **Catches** |
| Prompt injection in web page | Misses (post-fetch) | Catches (maybe) | **Catches** |
| Base64-encoded secret in header | Misses | Misses | **Catches** (6-pass decode) |
| SSRF to cloud metadata | Misses | Misses | **Catches** |
| DNS exfiltration | Misses | Misses | **Catches** |
| Direct jailbreak prompt | Misses (pre-tool) | **Catches** | Misses (no prompt visibility) |
| Dangerous file write | **Catches** | Misses | Misses (local operation) |

No layer covers every row. An agent protected by all three has real defense-in-depth.

## Getting started

If you have zero layers today, start with egress inspection. It covers the widest attack surface with the least integration work. [Install Pipelock](/install/), set `HTTPS_PROXY` to route HTTP traffic through a scanning proxy, and wrap MCP servers through the proxy for tool call inspection. Before trusting any of it, read the [measured coverage and the documented gaps](/proof/).

```bash
# Install
{{< install-cmd go >}}
# Homebrew alternative on macOS/Linux: {{< install-cmd homebrew >}}

# Set up Claude Code (hooks + MCP proxy)
pipelock claude setup

# Or just proxy HTTP traffic for any agent
export HTTPS_PROXY=http://127.0.0.1:8888
pipelock run
```

Then add hooks and guardrails as your threat model demands. The three layers are complementary, not competing.

<div class="hero-buttons" style="margin-top: 2rem;">
  <a href="https://github.com/pipelab-org/pipelock" class="btn btn-primary" data-event="github_click" data-event-placement="guide-body" target="_blank" rel="noopener noreferrer">GitHub</a>
  <a href="/install/" class="btn btn-ghost" data-event="install_click" data-event-placement="guide-body">Install Pipelock</a>
  <a href="/proof/" class="btn btn-ghost" data-event="proof_click" data-event-placement="guide-body">Inspect the proof</a>
</div>

## Further reading

- [LLM Security](/learn/llm-security/): the practitioner-level threat taxonomy and defense map
- [What is an Agent Firewall?](/agent-firewall/): the egress inspection architecture
- [Agent Egress Security](/learn/agent-egress-security/): preventing credential leaks
- [AI Agent Data Loss Prevention](/learn/ai-agent-data-loss-prevention/): the DLP layer specifically
- [MCP Vulnerabilities](/learn/mcp-vulnerabilities/): the full MCP attack surface
- [Prompt Injection Defense](/learn/prompt-injection-network-defense/): catching injection at the proxy layer
- [Agent Firewall vs Guardrails](/compare/agent-firewall-vs-guardrails/): detailed comparison
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [ISACA: Cybersecurity Recommendations for Securing AI Agents](https://www.isaca.org/resources/white-papers/2026/cybersecurity-recommendations-for-securing-ai-agents)
- [MCP Security](/learn/mcp-security/): the MCP control checklist
- [Kill Switch](/learn/kill-switch/)
- [Secure AI Agent Deployment](/learn/secure-ai-agent-deployment/)
- [Pipelock configuration reference (v3.7.0)](https://github.com/pipelab-org/pipelock/blob/v3.7.0/docs/configuration.md)
