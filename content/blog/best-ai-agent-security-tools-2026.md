---
title: "Best AI Agent Security Tools 2026: 24 Options by Boundary"
linkTitle: "Best AI Agent Security Tools 2026"
date: 2026-04-12
lastmod: 2026-04-29
author: "Josh Waldrep"
summary: "24 AI agent security options mapped to the six boundaries: model gateway, MCP gateway, identity, platform governance, runtime containment, and network egress."
description: "Compare AI agent security tools for 2026 by boundary: model gateway, MCP gateway, identity, platform governance, containment, and egress."
tags: ["ai-security", "agent-security", "mcp-security", "pipelock"]
blog_cat: "comparisons"
---

The AI agent security market splits into six boundaries: model and API gateway, MCP and tool gateway, identity and non-human identity governance, agent application and platform governance, runtime and workspace containment, and network egress and content firewall. Most "best of" pages mix the categories without naming the difference, which is how a buyer ends up with a model gateway when the threat model needed a content firewall. This piece walks the tools that sit in each boundary and what each one catches.

I build [Pipelock](/pipelock/), which sits in boundary 6 (network egress and content firewall). Pipelock emits mediator-signed action receipts from outside the agent trust boundary, which is the architectural property the boundary-6 category is built around. The category-by-category tour below tries to be honest about the tools across the other five boundaries that Pipelock does not replace. The [AI Agent Security Categories](/learn/ai-agent-security-categories/) page is the architectural reference; this page is the buyer's tour.

## Methodology

Six boundaries, named by the thing each one controls rather than by marketing label. The framing matches the [category map](/learn/ai-agent-security-categories/) page, which goes deeper on what each boundary catches and misses.

1. **Model and API gateway** controls the call from an application to a model provider. Inference guardrails sit in this layer too.
2. **MCP and tool gateway** controls the agent-to-MCP-server connection. MCP scanners sit alongside as the pre-deploy variant.
3. **Identity and non-human identity governance** controls who the agent is and what it can access.
4. **Agent application and platform governance** controls visibility and posture for agents on enterprise platforms.
5. **Runtime and workspace containment** controls the execution environment the agent runs inside.
6. **Network egress and content firewall** controls outbound network traffic at the content level.

Inclusion rules. Each tool has to be in active development, shipping code or a hosted service as of April 2026, and aimed at AI agent or MCP security specifically. Tools where the parent product folded into a larger platform and the standalone name no longer ships were left out. Snyk agent-scan stays because the Invariant product continues under the new name. Pricing, funding, and acquisition status come from public announcements. For capabilities not confirmed in public docs, the entry says so rather than guessing.

Each section lists 2-5 tools, picked for representativeness and current relevance. The goal is honest coverage of the boundary, not a vendor pitch.

## 1. Model and API gateway

[Boundary 1 in the category map.](/learn/ai-agent-security-categories/#1-model-and-api-gateway) Routes API calls between applications and model providers. Handles auth, token budgets, rate limits, and basic logging. Inference guardrails live in this layer too.

### 1. Vercel AI Gateway

Hosted gateway sitting in front of OpenAI, Anthropic, Google, and other model providers. Single API surface for switching models, tracking spend, and enforcing rate limits. Vercel ranks first on the live SERP for "ai gateway" and the product is positioned as the default routing layer for teams running multiple LLM providers.

**Strengths**
- One auth surface and one billing line in front of every provider, which simplifies key rotation and cost reporting.
- Tight integration with the rest of the Vercel platform for teams already shipping there.

**Trade-offs**
- Routing focus. Tool calls and MCP traffic that happen after the model responds are out of scope.
- Hosted only. Regulated shops that cannot send model traffic to a third party have to look elsewhere.

**Best for:** product teams running multiple LLM providers who want one billing and auth surface in front of inference traffic.

Link: [vercel.com/ai-gateway](https://vercel.com/ai-gateway).

### 2. Cloudflare AI Gateway

Cloudflare's gateway product sits in front of model providers and adds caching, rate limiting, and analytics. Part of a broader Cloudflare AI stack that also includes Workers AI for inference and Sandbox Auth for runtime isolation.

**Strengths**
- Caching at the gateway can cut model spend on repeated prompts.
- Cloudflare's edge footprint puts the gateway close to most users by default.

**Trade-offs**
- Inference traffic only. The gateway does not see what an agent does with the model response.
- Some analytics features are tied to other Cloudflare products, so the value is highest for teams already on the platform.

**Best for:** teams already running on Cloudflare who want a gateway that fits the same edge platform.

Link: [cloudflare.com/products/ai-gateway](https://www.cloudflare.com/products/ai-gateway/). See also: [Pipelock vs Cloudflare AI Gateway](/compare/pipelock-vs-cloudflare-ai-gateway/).

### 3. Kong, IBM, and the enterprise gateway pack

Several enterprise API gateway vendors extended their existing products into AI routing: Kong, IBM, Portkey, Solo.io, TrueFoundry, Azure AI Gateway in API Management. The mechanics vary, but the value pitch is the same: govern model traffic the way you already govern API traffic, with one policy plane.

**Strengths**
- Enterprise procurement story. The CISO already approved the vendor for API governance, so the AI extension is a contract amendment.
- Existing integrations with SIEM, RBAC, and observability stacks carry over.

**Trade-offs**
- AI-specific features are typically thinner than the routing core. Tool calls, MCP traffic, and content inspection are usually out of scope or sold as a separate module.
- Multiple products in the pack still mature their AI-specific feature set. Verify against current docs before committing.

**Best for:** enterprises that want their AI traffic governed by the same gateway that already runs their API portfolio.

### 4. LlamaFirewall

Open source Python library from Meta's PurpleLlama project. Provides classifiers for prompt injection, jailbreaks, and unsafe outputs at the model layer. Ships as a library that wraps LLM calls rather than a network proxy. Sits in the model layer because the inspection point is the prompt-and-completion pair, not the network.

**Strengths**
- Backed by a well-funded research team with a steady release cadence.
- Python library fits naturally into agent code that already calls LLMs from Python.

**Trade-offs**
- Library integration means every agent has to adopt the SDK. Agents in other languages or behind opaque frameworks get no coverage.
- Model-layer classifiers catch prompt-shaped threats but do not see network egress, so credential leaks in tool calls are out of scope.

**Best for:** Python-native agent stacks that want prompt injection and jailbreak classification close to the LLM call.

Link: [github.com/meta-llama/PurpleLlama](https://github.com/meta-llama/PurpleLlama).

### 5. NeMo Guardrails

Open source framework from NVIDIA. Uses a DSL called Colang to define conversational rails, safety checks, and topic boundaries for LLM applications. Supports custom actions, integration with other guardrail models, and fact-checking flows.

**Strengths**
- Colang gives a structured way to express conversation policy, which is easier to audit than a pile of system prompts.
- Mature project with documentation, examples, and a growing ecosystem.

**Trade-offs**
- Framework requires learning Colang and wiring rails into every application, which is real adoption work.
- Focus is conversational safety and grounding, not network-level agent threats like credential leaks or SSRF.

**Best for:** teams building conversational LLM apps who want structured, auditable safety rules at the application layer.

Link: [github.com/NVIDIA-NeMo/Guardrails](https://github.com/NVIDIA-NeMo/Guardrails).

## 2. MCP and tool gateway

[Boundary 2 in the category map.](/learn/ai-agent-security-categories/#2-mcp-and-tool-gateway) Sits between agents and MCP servers, handling auth, routing, and policy on tool calls. MCP scanners are the pre-deploy variant and live in the same boundary because they inspect the same surface.

### 6. Docker MCP Gateway

Open source gateway from Docker that manages containerized MCP servers. Agents connect to the gateway, which routes to servers running in isolated containers. Includes a `--block-secrets` flag that filters secret-shaped data from tool responses, plus call tracing for observability.

**Strengths**
- Container isolation is a strong boundary. Each MCP server runs in its own sandbox, limiting blast radius.
- Call tracing plus the block-secrets flag give a baseline of runtime visibility and protection without a separate firewall.

**Trade-offs**
- Gateway focus. Content inspection beyond the secret-blocking flag is narrow. For full DLP coverage, pair it with a runtime firewall.
- Docker-native workflow works best if the rest of your stack is already Docker-shaped.

**Best for:** teams running MCP servers in containers who want Docker-managed isolation and basic secret filtering out of the box.

Link: [github.com/docker/mcp-gateway](https://github.com/docker/mcp-gateway).

### 7. Runlayer

Cloud MCP control plane. Raised a reported $11M. Hosts MCP servers, manages access control across teams, and provides usage analytics. Aimed at orgs that want a registry and central management rather than running MCP infrastructure themselves.

**Strengths**
- Fully hosted, so teams skip the infra work of running and patching MCP servers.
- Central access control and analytics give a clean story for audit and spend.

**Trade-offs**
- Hosted model means MCP traffic goes through a third party, which some regulated shops will not accept.
- Hosted MCP catalog is only as useful as the servers it offers for your use case.

**Best for:** teams that want someone else to run MCP infrastructure and would rather pay than patch.

Link: [runlayer.com](https://www.runlayer.com/).

### 8. agentgateway

Open source gateway from Solo.io, recently contributed to the Linux Foundation. Written in Rust. Handles MCP and agent-to-agent traffic with JWT authentication, RBAC, and observability hooks. Positioned as the neutral open source gateway for multi-agent systems.

**Strengths**
- Linux Foundation project reduces single-vendor risk compared with a company-owned gateway.
- Rust core is fast and has a tight memory footprint, which matters in sidecar deployments.

**Trade-offs**
- Gateway scope. Content inspection beyond routing and auth is not the focus.
- Younger project than some commercial alternatives. Some advanced features are still landing.

**Best for:** teams that want a vendor-neutral, open source gateway they can deploy as a sidecar or ingress in front of many agents.

Link: [github.com/agentgateway/agentgateway](https://github.com/agentgateway/agentgateway).

### 9. Cisco mcp-scanner

Open source scanner for MCP servers from Cisco's AI Defense team. Combines YARA rules with LLM-based analysis to flag tool poisoning, cross-origin escalation, and known vulnerability patterns in tool descriptions and configs.

**Strengths**
- Hybrid YARA plus LLM approach catches both pattern-based and semantic issues.
- Backed by a large vendor, which tends to mean steady rule updates.

**Trade-offs**
- Pre-deploy only. Nothing in this tool inspects runtime traffic.
- LLM-based analysis has cost and latency implications at scale. Run it in CI rather than on every request.

**Best for:** teams that want a vendor-backed MCP scanner in CI with both deterministic and LLM-driven checks.

Link: [github.com/cisco-ai-defense/mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner).

### 10. Snyk agent-scan (formerly Invariant)

MCP scanner originally built by Invariant Labs, acquired by Snyk in 2025. The product continues under the Snyk name and integrates with Snyk's broader security workflows. Pins MCP tool descriptions and flags changes over time, catching rug-pull patterns. Licensing and deployment options are documented in Snyk's product pages rather than in a single open-source repo.

**Strengths**
- Description pinning is a strong defense against rug-pull attacks where a server changes its tool metadata mid-session.
- Native integration with Snyk workflows means one place for SCA, SAST, and MCP scanning.

**Trade-offs**
- Pre-deploy and CI focus. Runtime MCP traffic inspection is out of scope.
- Acquisition means roadmap is tied to Snyk's priorities, which may or may not match a given team's direction.

**Best for:** Snyk customers who want MCP scanning in the same dashboard as their existing code security checks.

Link: [snyk.io](https://snyk.io/).

### 11. Enkrypt AI

Commercial agent security product that includes MCP scanning alongside red teaming and model evaluation. Scans tool descriptions against known attack patterns, with continuous monitoring for changes in deployed servers.

**Strengths**
- Scanning plus red teaming in one platform, so teams can go from "what are my MCP servers doing" to "what happens when they get attacked."
- Continuous monitoring catches changes after the initial scan.

**Trade-offs**
- Commercial platform with broader scope than pure MCP scanning, which can be too much for small teams that just want a CI check.
- Public feature set changes quickly. Verify specifics against current docs before committing.

**Best for:** teams that want MCP scanning and LLM red teaming from one vendor.

Link: [enkryptai.com](https://www.enkryptai.com/).

## 3. Identity and non-human identity governance

[Boundary 3 in the category map.](/learn/ai-agent-security-categories/#3-identity-and-non-human-identity-governance) Controls who the agent is, what it is allowed to access, and how its credentials rotate. Identity decides at auth time. It does not inspect what happens after.

### 12. Okta agent identity

Okta extended its identity platform to cover non-human actors, including AI agents. Ranks first on the live SERP for "ai agent runtime security" thanks to a piece published days before this list was last updated. The pitch is treating agents as first-class identities with the same lifecycle controls Okta already runs for human users and service accounts.

**Strengths**
- Existing Okta deployments add agent identity as a contract addendum, not a new procurement.
- Strong fit for compliance frameworks that treat agents as first-class identities with auditable lifecycle.

**Trade-offs**
- Auth-time control. What the agent does after authentication is invisible to the identity layer.
- Marketing copy uses "runtime security" loosely. The controls are at auth and access, not at the network or content layer.

**Best for:** organizations already running Okta that need centralized lifecycle and rotation for agent credentials.

Link: [okta.com](https://www.okta.com/).

### 13. Pomerium

Open source identity-aware proxy that coined the "agentic gateway" framing for non-human access control. Sits in front of internal services and applies per-request policy based on identity, device posture, and context. Works for human and agent traffic with the same policy engine.

**Strengths**
- Open source core, so the policy engine is auditable and self-hostable.
- Per-request policy lets agent access scopes shrink without rotating credentials.

**Trade-offs**
- Gateway and identity focus. Content inspection of request bodies and tool responses is not the product.
- Identity-aware proxy framing assumes the operator can route agent traffic through the proxy, which not every dev workflow allows.

**Best for:** teams that want identity-aware access control for internal services with one open source policy engine for human and non-human traffic.

Link: [pomerium.com](https://www.pomerium.com/).

### 14. Silverfort and BeyondTrust

Both vendors come from the privileged access management world and extended into non-human and AI agent identity. Silverfort covers identity protection across legacy and cloud auth surfaces. BeyondTrust covers privileged access for service accounts and is adding agent-specific lifecycle features.

**Strengths**
- PAM heritage means strong session monitoring, vaulting, and rotation primitives that agent identity inherits for free.
- Compliance-friendly. SOC 2, ISO, and FedRAMP customers get reports the auditors recognize.

**Trade-offs**
- Identity layer only. Network-level agent threats and content inspection sit outside the product.
- Enterprise sales motion. Smaller teams will find the procurement weight excessive for a small fleet of agents.

**Best for:** regulated enterprises that already run PAM and want their agent identity story sourced from the same vendor.

Links: [silverfort.com](https://www.silverfort.com/), [beyondtrust.com](https://www.beyondtrust.com/).

## 4. Agent application and platform governance

[Boundary 4 in the category map.](/learn/ai-agent-security-categories/#4-agent-application-and-platform-governance) Controls visibility, posture management, and policy for agents built on enterprise platforms (Microsoft Copilot Studio, Salesforce Agentforce, ServiceNow, Power Platform).

### 15. Zenity

Commercial agent security governance platform. Raised a reported $38M Series B and ranks first for "ai agent security platform" on the live SERP. Discovers agents running across an organization, builds an inventory, assesses risk, and enforces policy. Positioned for enterprise programs where the hard problem is "how many agents do we even have."

**Strengths**
- Discovery story is strong. Finding shadow agents and MCP servers is a real problem at scale and Zenity has been working on it longer than most.
- Enterprise policy and reporting aligned with existing GRC workflows.

**Trade-offs**
- Governance first, enforcement second. Runtime tools in the traffic path still do the actual blocking.
- Enterprise pricing model is a poor fit for small teams with a handful of agents.

**Best for:** enterprises with many teams shipping agents independently who need inventory and policy before they can talk about enforcement.

Link: [zenity.io](https://zenity.io/).

### 16. Reco AI, Obsidian, SentinelOne, Microsoft Agent 365

Several SaaS security and posture vendors extended into agent platform governance. Reco AI and Obsidian Security come from SaaS security posture and added agent inventory. SentinelOne extended its endpoint platform. Microsoft Agent 365 provides Copilot Studio governance from inside the Microsoft 365 stack. The lane is consolidating fast and feature parity changes month to month.

**Strengths**
- Existing SaaS security posture buyers can extend coverage without onboarding a new vendor.
- Microsoft Agent 365 specifically owns deep integration with Copilot Studio, which other vendors have to build on top.

**Trade-offs**
- Most products in this lane sit at the SaaS API layer and do not see traffic from standalone agents like Claude Code or Cursor on a developer laptop.
- Feature parity is shifting. Verify the specific capability you care about against current docs.

**Best for:** enterprises standardized on a SaaS security posture vendor that now wants agent coverage in the same console.

Links: [reco.ai](https://www.reco.ai/), [obsidiansecurity.com](https://www.obsidiansecurity.com/), [sentinelone.com](https://www.sentinelone.com/), [Microsoft Agent 365](https://learn.microsoft.com/en-us/security/security-for-ai/agent-365-security).

## 5. Runtime and workspace containment

[Boundary 5 in the category map.](/learn/ai-agent-security-categories/#5-runtime-and-workspace-containment) Controls the execution environment the agent runs inside. Filesystem confinement, syscall restrictions, network namespaces, sandbox isolation.

### 17. Coder Agent Firewall

Coder ships an Agent Firewall feature inside its workspace product. Owns the #1 SERP slot for "agent firewall" via the workspace integration. The mechanism is workspace-level egress control: an agent running inside a Coder workspace gets a network policy that limits which destinations it can reach. The policy lives at the workspace boundary, not at the content layer.

**Strengths**
- Tied to the workspace lifecycle, so policy follows the agent without separate proxy configuration.
- Allowlist-shaped containment defeats whole classes of post-compromise lateral movement.

**Trade-offs**
- Allowlist-only. Content inside permitted egress is not inspected. An agent allowed to reach github.com can still exfil to github.com/attacker/repo.
- Tied to Coder workspaces. Standalone agents on a developer laptop are out of scope.

**Best for:** Coder workspace customers who want network policy that follows their agents without a separate firewall product.

Link: [coder.com](https://coder.com/).

### 18. Cloudflare Sandbox Auth

Cloudflare's sandbox isolation product for agents and code execution. Pairs with Workers and the AI Gateway to give agent traffic a constrained execution environment. The pitch is running agent code at the edge in a sandbox that limits filesystem and network reach.

**Strengths**
- Edge-native execution puts the sandbox close to wherever the agent runs.
- Integrates with the rest of the Cloudflare AI stack for teams already on the platform.

**Trade-offs**
- Sandbox boundary, not content boundary. Egress to permitted destinations is not inspected.
- Cloudflare-platform-shaped. The value drops sharply for agents running outside Cloudflare's edge.

**Best for:** teams running agent code on Cloudflare Workers who want an execution sandbox tied to the same platform.

Link: [developers.cloudflare.com](https://developers.cloudflare.com/).

### 19. GitHub Codespaces and Copilot's sandboxed runner

GitHub Codespaces gives developers ephemeral cloud workspaces with network and filesystem boundaries. GitHub Copilot's coding agent runs tasks inside a sandboxed runner that limits what the agent can touch. Neither is marketed as "agent security," but both function as runtime containment for agent workloads in GitHub-flavored environments.

**Strengths**
- Free or already-paid-for in GitHub Enterprise. Containment without a new procurement.
- Tight integration with the rest of the GitHub workflow.

**Trade-offs**
- Containment, not content inspection. Same allowlist-shape limit as other runtime products.
- GitHub-specific. Agents running outside Codespaces or the Copilot runner do not benefit.

**Best for:** GitHub Enterprise customers who want runtime containment for Copilot and Codespaces agent workloads without adding a vendor.

Links: [github.com/codespaces](https://github.com/features/codespaces), [github.com/copilot](https://github.com/features/copilot).

### 20. Linux Landlock and seccomp

OS-layer sandbox primitives. Landlock restricts filesystem reach. Seccomp restricts syscalls. Both are kernel-enforced and free with any modern Linux distribution. Pipelock uses Landlock internally for its own subprocess sandbox; the same primitives can wrap other agent runtimes.

**Strengths**
- Kernel-enforced. Bypass requires kernel-level escape, which raises the bar significantly.
- No vendor, no license, no recurring cost.

**Trade-offs**
- DIY. The operator writes the policy and tests it; there is no UI or governance dashboard.
- OS containment, not content inspection. Once egress is permitted, traffic content is invisible at this layer.

**Best for:** infrastructure teams comfortable writing and testing kernel-level policy who want runtime containment without a vendor.

Link: [landlock.io](https://landlock.io/).

## 6. Network egress and content firewall

[Boundary 6 in the category map.](/learn/ai-agent-security-categories/#6-network-egress-and-content-firewall) Controls outbound network traffic at the content level. Every HTTP request, URL, body payload, and MCP message in both directions.

### 21. Pipelock

Open source agent firewall, written in Go, ships as a single binary. Sits between agents and external services as a content-inspecting egress proxy for HTTP and MCP traffic. Scans requests for credential leaks using a DLP engine with multi-layer decoding, scans responses for prompt injection, blocks SSRF, and scans MCP tool descriptions for poisoning and rug-pulls. Wraps MCP servers through stdio or HTTP. Hash-chained audit logging for compliance evidence.

**Strengths**
- Content inspection on every hop, not just domain filtering. Catches credential leaks to allowlisted hosts, which allowlists alone cannot.
- Single binary, systemd friendly, works with any agent that respects `HTTPS_PROXY`. No SDK lock-in.
- Hash-chained flight recorder gives tamper-evident audit logs for incident response and SOC 2 style questions.

**Trade-offs**
- Runtime only. It does not scan MCP servers before deployment, so pair it with a scanner in CI.
- Network-only scope. In-memory reasoning corruption and local filesystem abuse do not generate network traffic, so a network proxy cannot see them.

**Best for:** teams running agents with network access who want open source, content-level egress protection without adopting a vendor SDK.

Links: [Pipelock site](/pipelock/), [GitHub](https://github.com/luckyPipewrench/pipelock).

### 22. iron-proxy

Open source Go proxy for agent traffic. Uses MITM TLS interception to see inside HTTPS. Combines host allowlisting with boundary credential proxying, replacing secrets with placeholders at the proxy edge so the agent only ever handles rewritten values.

**Strengths**
- Boundary rewriting is a clean design for keeping real credentials out of the agent's working context.
- Open source, Go, small surface area, easy to read and reason about.
- The surface has grown well past allowlisting. Its docs describe an LLM judge transform that serializes a request into an envelope and asks a model to reject it, stated as an additional rejection layer that cannot override the other controls, MCP interception with a default-deny tool allowlist that also filters `tools/list`, OAuth2 and AWS or GCP request signing, and a control plane with enrollment and policy distribution.

**Trade-offs**
- The judge transform decides with a model rather than a deterministic rule, so its verdicts depend on the backend and prompt an operator configures. Its docs specify a configurable fallback for model errors, timeouts, and malformed output.
- MITM certificate trust has to be installed in every agent environment, which adds ops overhead on managed endpoints.

**Best for:** teams that like the secret-rewriting model and want a small, auditable Go proxy they can self-host.

Link: [GitHub](https://github.com/paradigmxyz/iron-proxy).

### 23. Backslash Security

Commercial agent security product. Raised a reported $27M total ($19M Series A) and ships MCP coverage, DLP, and IDE integration aimed at developer workflows. Focus is on protecting the developer path from source editor through agent tooling, with policies that follow code as it moves through CI.

**Strengths**
- IDE integration meets developers where they work, which helps adoption in engineering orgs.
- DLP plus MCP coverage in one product avoids stitching two vendors together.

**Trade-offs**
- Commercial only. No open source path for teams that want to self-host everything.
- Best fit is IDE-centric workflows. Non-developer agents get less direct value.

**Best for:** engineering orgs that want AI coding assistants and MCP tooling governed the same way they govern the rest of their SDLC.

Link: [backslash.security](https://www.backslash.security/).

### 24. Nightfall AI

Commercial DLP-first platform. Started in classic SaaS DLP (Slack, Jira, Google Drive) and extended into AI traffic. Markets itself as a firewall for AI, with emphasis on sensitive data discovery, classification, and blocking across AI chat and agent traffic.

**Strengths**
- Mature DLP engine, built for regulated environments with long-running compliance programs.
- Covers both SaaS DLP and AI traffic in one product, which simplifies vendor management for enterprise buyers.

**Trade-offs**
- Commercial only. SMBs and open source shops often find it overkill.
- AI agent features are newer than the SaaS DLP core, so specific MCP capabilities should be verified against current docs.

**Best for:** regulated enterprises that already run Nightfall for SaaS DLP and want their AI traffic in the same console.

Link: [nightfall.ai](https://www.nightfall.ai/).

## Tooling adjacent to security: testing and evaluation

Worth a callout because these tools often show up on "agent security" lists despite sitting outside the six runtime boundaries.

**Promptfoo** is an open source LLM testing and red teaming framework with an MCP proxy mode that intercepts tool calls during test runs. OpenAI announced plans to acquire Promptfoo in March 2026; the deal is pending closing as of this writing. Strong red team and eval story, large community, wide LLM provider support. The primary mode is testing, not production blocking. Teams that want an inline enforcement point should not treat it as a drop-in firewall. Best for pre-production evaluation pipelines. Link: [promptfoo.dev](https://www.promptfoo.dev/).

## How to choose

Start with the boundary your worst-case incident maps to. The six boundaries are not interchangeable. Buying a model gateway when the threat model needed a content firewall is not partial coverage; it is no coverage for that threat. The architectural reference at [AI Agent Security Categories](/learn/ai-agent-security-categories/) walks each boundary's catch-and-miss profile.

Stack as the program matures. Most serious agent deployments need three of the six. A typical first round picks one boundary and ships. The second round adds an adjacent boundary based on incidents or audit findings. Vendors that claim to cover all six rarely do; treat the claim as marketing rather than architecture.

Quick decision shortcut for the common cases. Developer machine running a coding agent (Claude Code, Cursor, Copilot in agent mode): boundaries 5 and 6, runtime containment plus a content-inspecting egress firewall. The [agent firewall guide](/agent-firewall/) goes deeper on boundary 6. Enterprise Copilot Studio fleet: boundaries 3 and 4, identity governance plus platform posture. Multi-agent production system with secrets and broad network access: boundaries 1, 3, and 6, model gateway plus identity plus content firewall.

## Further reading

- [AI Agent Security Categories](/learn/ai-agent-security-categories/) is the architectural reference for the six boundaries this post tours.
- [AI Agent Security](/learn/ai-agent-security/) explains the broader landscape and how the boundaries relate to common attack patterns.
- [Open Source AI Firewall](/learn/open-source-ai-firewall/) focuses on the open source end of boundary 6.
- [Agent Firewall Guide](/agent-firewall/) goes deep on boundary 6 specifically.
- [Pipelock Comparisons](/compare/) walks through head-to-head positioning against specific alternatives.
- [Pipelock](/pipelock/) is the open source agent firewall I build.
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock) has the code, the tests, and the issues.

If a tool deserves a spot on this list and is missing, the [contact page](/contact/) has the form. Corrections welcome.
