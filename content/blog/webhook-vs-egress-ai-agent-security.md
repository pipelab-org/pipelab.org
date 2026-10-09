---
title: "Webhook vs Egress: Two Architectures for AI Agent Security"
linkTitle: "Webhook vs Egress"
seoTitle: "Webhook vs Egress for AI Agent Security"
date: 2026-05-07
author: "Josh Waldrep"
summary: "Webhook-based controls work when the platform cooperates. Network-egress firewalls work at the traffic boundary. Here is where each fits."
description: "Webhook-based runtime monitoring and network-egress firewalls catch different agent attacks. Where each fits and why most serious deployments need both."
tags: ["ai-security", "agent-security", "agent-firewall", "pipelock", "architecture"]
faq:
  - q: "What is webhook-based AI agent security?"
    a: "Webhook-based AI agent security is a runtime monitoring pattern where the AI platform calls an external policy service before executing an action. The platform sends a webhook with the proposed action, the policy service evaluates it, and returns an allow or block decision. The platform respects that decision. It depends on the platform enforcing the hook. Obsidian Security's AI Agent Runtime Security is one commercial example. Platform-native controls such as AWS Bedrock Guardrails and Salesforce Agentforce policy hooks sit in the same cooperative-runtime family, but they are not the same architecture as an external webhook."
  - q: "What is a network-egress firewall for AI agents?"
    a: "A network-egress firewall sits between the agent and the network as a proxy. Outbound HTTP, WebSocket, or MCP traffic routed through the proxy is inspected before it leaves. When direct egress is blocked at the network layer, the proxy can decide allow or block without relying on cooperation from the agent or platform. Pipelock, iron-proxy, and Tophant ClawVault are examples of tools in or near this lane. The key property is separation: the thing being checked is not also the thing enforcing the check."
  - q: "Which one should I use?"
    a: "Both, in most serious deployments. Webhook-based controls are tight when traffic is fully platformed (Bedrock, Agentforce, Copilot, etc.) and the platform's webhook integration is real and respected. Network-egress firewalls catch what the platform misses: compromised agents, custom MCP servers, dev environments, CI agents, and any traffic that does not route through a supported platform. Real defense uses both because they cover different failure modes."
  - q: "Why is the cooperation problem important?"
    a: "Webhook-based runtime security depends on the agent or AI platform calling the webhook before executing. If the agent is compromised in a way that bypasses the cooperation step, or the platform's integration fails open, the webhook never fires. A compromised agent can also send traffic to destinations the platform has no integration with at all. Network-egress firewalls do not have this dependency because enforcement is at the network boundary, not in the agent."
blog_cat: "technical"
---

Two architectures keep showing up in AI agent runtime security in 2026. Both promise to stop bad agent actions before they complete. Underneath they work differently, and the difference matters when an agent goes wrong in production.

The first is webhook-based runtime monitoring. The AI platform calls out to a policy service before executing an action, the service decides, and the platform respects the answer. Obsidian Security frames its product this way. From their [AI Agent Runtime Security page](https://www.obsidiansecurity.com/ai-agent-runtime-security): *"evaluate every agent against OWASP-aligned risk factors in real time, and use webhooks to intercept and stop policy-violating, high-risk executions before they complete."*

The second is the network-egress firewall. A proxy sits between the agent and the network. Traffic routed through the proxy gets inspected before it leaves or before the response reaches the agent. The proxy decides allow or block based on the content of the traffic itself, not on whether the agent asked for a policy decision.

Both are real defenses. Both ship in production today. They cover different parts of the agent attack surface. I use "webhook" here as the concrete version of the broader cooperative-runtime pattern: any architecture where the platform has to surface the proposed action to the policy layer before the action happens. This post is about which boundary each one actually controls, and why a thorough posture often ends up running both.

## What webhook-based monitoring sees

The webhook flow is straightforward. An agent running on a supported AI platform proposes an action: a tool call, a model invocation, a data lookup. Before execution, the platform sends a webhook to the policy service. The service evaluates the request against rules, behavioral baselines, identity, and any other signal it has. It returns a verdict. The platform respects the verdict and either runs the action or blocks it.

When this works, the coverage is tight. The policy service can correlate the action against user identity, upstream prompt, SaaS context, and anything else the platform exposes. It can refuse a high-privilege action a low-privilege user kicked off. It can flag a sudden spike in data access for one agent versus its baseline. That cross-context awareness is harder to build at the network layer alone.

The places I have seen this approach shine:

- Fully-platformed enterprises where every agent runs through a managed runtime, and that runtime has a real webhook integration with the policy product
- Agentforce-style closed loops where the platform vendor controls the runtime and the policy hook
- Bedrock Guardrails where the cooperation flow is built into the platform itself

For those cases, webhook-based monitoring is a reasonable answer to a real problem.

## Where webhook-based monitoring falls short

The hard part is that webhook-based monitoring depends on cooperation. The agent or the platform has to actually call the webhook for the policy to run. Three failure modes show up in practice.

**The agent path does not cooperate.** A managed platform can enforce its own hook, but only for actions that stay inside that platform's action path. A custom agent, a local coding agent, a CI workflow, or an uninstrumented MCP tool can send traffic without ever calling the policy service. Prompt injection that steers the agent into an alternate tool path bypasses the cooperation step if that path is not instrumented. I made the same point in a [Help Net Security interview on Pipelock](https://www.helpnetsecurity.com/2026/05/04/pipelock-open-source-ai-agent-firewall/) on May 4, 2026: *"Most agent-security tools still need the agent to cooperate."* The rest follows from that architecture. Controls that depend on agent cooperation only work while the agent keeps calling them.

**The platform does not cover everything.** Webhook integrations exist for the platforms vendors choose to integrate with. Custom MCP servers, internal tools, dev environments, CI agents, and on-prem deployments often have no managed platform layer at all. A cooperative-runtime product that integrates with Bedrock, Agentforce, Copilot, Vertex, Claude, and ChatGPT covers commercial managed runtimes. It does not cover the agent your platform team built last quarter that talks straight to a private MCP server.

**The integration can fail open.** If a webhook times out, what does the platform do? In practice it depends on the integration. Some platforms fail closed and refuse the action. Others fail open to keep the agent responsive. The end-to-end security posture is only as strong as the weakest fail-mode in the chain.

These are not theoretical gaps. The cooperation problem is the architectural shape of the model.

## What network-egress firewalls see

A network-egress firewall sits between the agent and the network. The agent process holds API keys and credentials. It runs without direct internet access. The proxy holds network access and no agent secrets. When deployment is correct, direct egress is blocked and every outbound request from the agent crosses the proxy. Every response comes back through it.

The useful pattern is separation of duties: the component being checked is not also the component enforcing the check or producing the evidence.

For AI agents, that pattern means the proxy can scan traffic regardless of what platform the agent is using, as long as that traffic is forced through the proxy. Credential leaks in tool arguments, prompt injection inside MCP responses, SSRF through tool-triggered URLs, tool poisoning in MCP server descriptions: all of it is visible at the boundary because that is where the traffic crosses. There is no cooperation step for the agent to skip.

I run Pipelock as one of these. Tophant ClawVault, iron-proxy, and Agent Vault sit in or near the same request-path and credential-proxy lane, with different scopes. The shared idea is that the policy layer is outside the agent's own decision loop. A compromised agent cannot opt out by skipping a webhook because there is no webhook to skip.

The places this approach shines:

- Custom agents that talk to private or internal MCP servers
- Dev environments and CI agents that do not run on a managed platform
- Compromised-agent scenarios where the platform integration fails or the agent is steered around it
- Compliance and audit traffic where the evidence layer needs to be independent of the runtime

## Where network-egress firewalls fall short

Network-egress firewalls do not see what does not cross the network. That is the limitation.

If an agent runs entirely inside Salesforce, talking to Salesforce data with Salesforce-internal calls, the egress proxy never sees that traffic. The agent reading sensitive records and acting on them inside the SaaS app stays invisible to the wire-level firewall. This is where SaaS posture management and platform-side webhook integrations earn their keep.

The same applies to embedded AI features that ship as part of a SaaS application. Microsoft 365 Copilot against SharePoint internals, Salesforce Einstein against CRM data, ServiceNow Now Assist against ITSM workflows: each runs inside the SaaS layer. An outside-the-agent proxy sees cross-SaaS traffic, not internal queries.

Network-egress firewalls also do not solve identity. They see traffic, not who the agent is supposed to be. They cannot tell you that a service account is impersonating a user, that a token has been re-used across agents, or that an agent has escalated privilege within a SaaS application. Identity and non-human identity governance is a separate layer.

They also depend on enforcement. If the agent can open raw sockets, bypass proxy environment variables, use an uncontained browser, or reach the network namespace directly, the firewall is not actually inline. The architecture only works when direct egress is closed and the proxy is the route out.

This is why the Pipelock category page lists six AI agent security boundaries, not one. Network egress and content firewall is the sixth boundary. Identity and platform governance are different boundaries. Different products. Different threat models.

## The honest mapping

Webhook-based monitoring works when the agent and platform actually cooperate, the platform integration is real, and the traffic stays inside the platforms the policy product integrates with. For a Bedrock-only shop running Bedrock-only agents through Bedrock Guardrails plus a SaaS posture product on top, the webhook flow covers a lot.

Network-egress firewalls work when the agent or platform might not cooperate, when traffic crosses platforms that have no policy integration, when the agent is custom or internal, or when the evidence needs to be independent of the runtime. They only work if direct network bypass is closed. For platform teams running custom MCP, CI agents, or dev environments, that is most of the agent traffic.

Most serious deployments end up with both. They control different parts of the system. A compromised agent that bypasses the webhook is still constrained at the network egress. A SaaS-internal action the egress proxy never sees is still visible to the platform-layer policy hook.

The trap is treating either layer as the whole answer. A landing page that promises end-to-end agent security with a single architecture is selling one slice of the problem. The category split is real and the architectures cover different failure modes. Naming the boundary each one controls makes the trade-off legible.

## What I tell platform teams to ask

When a platform team asks me whether to add an egress firewall, a posture product, or both, the question I push back with is usually: where does your agent traffic actually go?

If the answer is "all through Bedrock, all through Agentforce, all through Copilot, no custom MCP, no internal tools," webhook-based controls cover most of the surface. Add an egress firewall when you start running custom workflows that the platform does not see.

If the answer is "custom MCP servers, agents in CI, dev environments, internal-tool integrations," start with an egress firewall. Add platform-layer governance when managed-platform deployments scale.

If the answer is "all of the above, in production, with real PII and real money," you already need both, and the only question is which order to ship them.

That is the honest read. Webhook and egress are not competing answers to the same question. They are answers to different questions. Buyers who run their procurement that way end up with stronger postures than buyers who treat the category as one undifferentiated slot.

## Further reading

- The [AI agent security categories map](/learn/ai-agent-security-categories/) on this site walks through all six boundaries: model and API gateway, MCP and tool gateway, identity and non-human identity governance, agent application and platform governance, runtime and workspace containment, and network egress and content firewall.
- The [domain allowlists post](/blog/why-domain-allowlists-arent-enough/) covers a related boundary problem inside the egress firewall category.
- The [Pipelock product page](/pipelock/) describes the network-egress and content-firewall layer I work on. Single Go binary (Apache-2.0 core; Enterprise features under ELv2).
