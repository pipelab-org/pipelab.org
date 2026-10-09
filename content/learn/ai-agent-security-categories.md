---
title: "AI Agent Security Categories: What Each One Catches and Misses"
linkTitle: "AI Agent Security Categories"
seoTitle: "AI Agent Security Categories: A Buyer's Map"
subtitle: "Six different products are selling themselves as the answer. They guard six different boundaries. Pick the one your threat model needs."
description: "A buyer's map of the six AI agent security categories. What each one controls, what each one misses, and how they stack."
date: 2026-04-29
lastmod: 2026-04-29
og_image: "https://pipelab.org/images/og/og-learn.png"
faq:
  - q: "What are the AI agent security categories?"
    a: "Six categories define the AI agent security market in 2026: model and API gateways, MCP and tool gateways, identity and non-human identity governance, agent application and platform governance, runtime and workspace containment, and network egress and content firewalls. Each category controls a different boundary. Most serious deployments need at least three of the six."
  - q: "Are AI agent firewalls and AI gateways the same thing?"
    a: "No. An AI gateway sits between your application and a model provider, routing API calls and managing token budgets. An AI agent firewall sits between the agent and everything it talks to, inspecting outbound traffic for secret leaks, prompt injection, and tool poisoning. Different boundaries, different threat models. Vercel AI Gateway and Cloudflare AI Gateway are model gateways. Pipelock is a network egress and content firewall."
  - q: "What does an MCP gateway do that an agent firewall does not?"
    a: "An MCP gateway centralizes auth, routing, and policy across many MCP servers. It tells you which agents can call which tools. An agent firewall inspects the content of every tool call and tool response for secret leaks, prompt injection, and tool poisoning. The two layers are complementary. Most enterprise deployments end up running both."
  - q: "Why is identity not enough for AI agent security?"
    a: "Identity tells you who the agent is and what it is allowed to access. It does not inspect what the agent sends or receives at run time. A correctly authenticated agent following a poisoned tool response can still exfiltrate credentials over a permitted channel. Identity governance answers who; content firewalls answer what."
  - q: "Where does Pipelock fit in this map?"
    a: "Pipelock sits in the network egress and content firewall category. It inspects outbound HTTP, WebSocket, and MCP traffic in both directions for credential exfiltration, prompt injection, SSRF, and tool poisoning. It pairs well with identity governance (boundary 3) and runtime containment (boundary 5). It does not replace either."
  - q: "Which AI agent security category should I buy first?"
    a: "Start with the boundary that maps to your worst-case incident. If your top concern is credential exfiltration through agent traffic, buy a network egress and content firewall. If your top concern is shadow agents inside Microsoft Copilot Studio, buy a platform governance product. If your top concern is regulated identity controls for non-human actors, buy identity governance. Stack additional layers as the program matures."
learn_cat: concepts
level: deep
tags:
  - agent-security
  - ai-agent-security
  - market-map
---

The AI agent security market looks crowded because six different categories of product are all calling themselves the answer. Each category guards a different boundary. Each catches some attacks and misses others. Most buyers pick one and assume they bought coverage they did not.

This is a map. For each category, the page names the boundary it controls, the vendors who own it, what it catches, what it misses, and the buyer profile it actually serves. Pipelock sits in the sixth category. The other five are competition for budget more than for the same threat model.

## How to read this map

Each section names the category by the boundary it controls, not the marketing label vendors use. Several products span more than one boundary; in those cases the section places them by primary capability and notes the spillover. The "what it misses" lines are honest and structural, not snipes. A boundary cannot inspect what it does not see.

## 1. Model and API gateway

**The boundary it controls:** the API call from an application to a model provider. Routing between models, auth, token budgets, rate limits, basic logging.

**Vendors who own this:** Vercel AI Gateway (#1 on the live SERP for "ai gateway"), IBM, [Cloudflare AI Gateway](/learn/cloudflare-ai-gateway/), Kong, Portkey, Solo.io, TrueFoundry, Azure AI Gateway in API Management.

**What it catches:** model auth misuse, token budget overruns, request-level rate violations, some prompt-layer injection patterns at the model input. A few products add basic content filtering at the model output.

**What it misses:** tool calls the agent makes after the model responds, MCP traffic, network-level egress to non-LLM destinations, secret exfiltration through shell commands the agent runs, the content of agent-generated outbound HTTP. The category is built for inference traffic, not agent traffic.

**When this is your category:** the team is building a model-routing platform, has many models in production, or needs a single billing and auth surface in front of a fleet of LLM providers. Not the right buy when the goal is locking down what an agent can do once it has a model response in hand.

## 2. MCP and tool gateway

**The boundary it controls:** the agent-to-MCP-server connection. Auth, routing, and policy applied to tool calls specifically.

**Vendors who own this:** mcpmanager.ai (#1 for "mcp gateway"), Microsoft mcp-gateway, Operant AI, TrueFoundry MCP Gateway, WSO2, Portkey MCP Gateway, Hookdeck. Several AI gateway vendors are extending into this lane via plugins.

**What it catches:** tool authorization, MCP server access policy, tool-level rate limits, registry hygiene. The better products add tool-description hashing and drift detection.

**What it misses:** HTTPS traffic to non-MCP destinations (the agent can still call any public API the gateway does not see), deep content inspection of tool descriptions for poisoning, DLP scanning on tool arguments and responses. Most products in this category gate access; few inspect content end-to-end.

**When this is your category:** the team runs an internal MCP marketplace, needs centralized auth across many MCP servers, or wants a single policy plane for tool-call governance. Pairs well with a content firewall layer underneath.

## 3. Identity and non-human identity governance

**The boundary it controls:** agent authentication, scoped credentials, lifecycle of agent identities, policy at auth time.

**Vendors who own this:** Okta (#1 for "ai agent runtime security" with a piece published 18 hours before this map was written), Silverfort, BeyondTrust, Pomerium (which coined the "agentic gateway" framing), Microsoft Entra Agent ID, Astrix, Aembit, Obsidian Security on the platform side.

**What it catches:** who the agent is, what it is allowed to access, when its credentials should rotate, policy decisions at the moment of auth. Strong fit for compliance frameworks that treat agents as first-class identities.

**What it misses:** what the agent does with its access. A correctly authenticated agent that follows a poisoned tool response can still exfiltrate credentials over a permitted channel. Identity does not inspect content. The agent looks compliant from the auth point of view at the exact moment it is leaking.

**When this is your category:** the organization already runs an identity vendor, regulators require strong non-human identity controls, the fleet of agents needs centralized lifecycle and rotation. Stack with a content firewall to cover the action layer.

## 4. Agent application and platform governance

**The boundary it controls:** visibility, posture management, and policy for agents built on enterprise platforms (Microsoft Copilot Studio, Salesforce Agentforce, ServiceNow, Power Platform).

**Vendors who own this:** Zenity (#1 for "ai agent security platform"), Reco AI, Noma Security, Obsidian Security, SentinelOne, BeyondTrust on the identity overlap, Microsoft Agent 365.

**What it catches:** shadow agents, configuration drift, posture across an enterprise app catalog, policy violations on platform-hosted agents, ownership mapping for non-human identities the security team did not provision.

**What it misses:** standalone agents like Claude Code, Cursor, GitHub Copilot, dev workflows, and open-source agent stacks. Most products in this category sit at the SaaS API layer, not the network. They inspect platform telemetry; they do not see raw outbound HTTP from a developer's laptop.

**When this is your category:** the company runs Copilot Studio or Agentforce at scale, the CISO needs a single posture dashboard across enterprise agent platforms, compliance requires app-catalog evidence. Often the first agent-security buy at large enterprises and rarely the last.

## 5. Runtime and workspace containment

**The boundary it controls:** the execution environment the agent runs inside. Filesystem confinement, syscall restrictions, network namespaces, sandbox isolation.

**Vendors who own this:** Coder (#1 for "agent firewall" via their workspace Agent Firewall feature), GitHub Codespaces, GitHub Copilot's sandboxed coding runner, Cloudflare Sandbox Auth, Apple sandbox-exec, Linux Landlock and seccomp at the OS layer.

**What it catches:** the agent cannot escape the box. It cannot reach outside what the workspace permits. It cannot write outside permitted filesystem paths. Containment defeats whole classes of post-compromise lateral movement.

**What it misses:** anything inside the permitted box. If the workspace is allowed to reach github.com, an exfil request to github.com/attacker/repo is permitted by definition. Containment is allowlist-shaped; it cannot inspect the content of permitted egress. Most runtime products do not scan request bodies for credentials.

**When this is your category:** dev environment platforms, multi-tenant agent hosting, regulated execution boundaries, anywhere the operator controls where the agent runs. The answer becomes weaker the more the agent needs broad network access to do its job.

## 6. Network egress and content firewall

**The boundary it controls:** outbound network traffic, inspected at the packet, protocol, and content level. Every HTTP request, every URL, every body payload, every MCP message in both directions.

**Vendors who own this:** Pipelock, iron-proxy in allowlist mode, parts of the MCP gateway space that add deep inspection, the open-source agent firewall niche. The category is smaller and less branded than the other five.

**What it catches:** secret exfiltration in URL paths, query strings, headers, and bodies. Prompt injection in tool responses. MCP tool poisoning and tool-description drift. SSRF to private CIDRs and metadata services. DNS exfiltration patterns. Encoding-disguised payloads (base64, hex, URL-encoding) at multiple normalization passes.

**What it misses:** identity-level violations (a properly authed agent doing a permitted-but-undesirable action), platform-level shadow-agent posture, model-routing decisions, runtime isolation. An agent that escapes its container is the runtime layer's problem; the agent that exfils through a permitted-and-poisoned tool response is this layer's problem.

**When this is your category:** the agent already has secrets and network access by design (Claude Code, Cursor, GitHub Copilot, custom agents on developer machines). The threat model includes prompt injection from untrusted documents, MCP tool poisoning, or credential exfiltration through outbound channels. Pairs with identity (boundary 3) and runtime (boundary 5) for full-stack coverage.

## How these stack

Most serious agent deployments need three of the six boundaries: identity for who, runtime for where, egress for what. The other three are platform-specific or workload-specific. The reason most agent-security purchases miss is that buyers think they bought one product that solves agent security and instead bought one boundary.

Two examples of the gap. A platform governance buy (boundary 4) catches shadow agents in Copilot Studio and gives the CISO a dashboard. It does not catch credential exfil from a developer running Claude Code on a laptop. An identity governance buy (boundary 3) proves the agent is the agent it claims to be. It does not catch a poisoned MCP tool response steering that authenticated agent into curl-ing credentials to an attacker. The boundaries do not substitute. They stack.

Pick the boundary your worst-case incident maps to. Layer the next one when the program matures. Treat any vendor claiming to cover all six with the skepticism that claim earns.

## Where to go from here

For credential exfiltration and prompt injection threat models, see [Agent Egress Security](/learn/agent-egress-security/) and [Preventing SSRF in AI Agents](/learn/preventing-ssrf-in-ai-agents/). For Claude Code specifically, see [Securing Claude Code Against Secret Exfiltration](/learn/securing-claude-code-against-secret-exfiltration/). For tool-poisoning patterns at the MCP layer, see [MCP Security](/learn/mcp-security/) and [MCP Tool Poisoning](/learn/mcp-tool-poisoning/). For the boundary-by-boundary architecture comparison, see [Agent Firewall Guide](/agent-firewall/).
