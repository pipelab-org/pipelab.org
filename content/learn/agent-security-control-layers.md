---
title: "Agent Security Control Layers: Sandboxing, Identity, MCP Gateway, Egress Inspection"
linkTitle: "Agent Security Control Layers"
seoTitle: "Agent Security Control Layers Compared"
subtitle: "Four lanes of AI agent security with named examples in each. Pipelock sits in the egress-inspection lane and emits signed action receipts."
description: "Four-layer map of AI agent security: process sandboxing, identity governance, MCP gateway mediation, and egress inspection with signed receipts."
date: 2026-05-21
lastmod: 2026-05-21
learn_cat: comparison
level: intro
tags:
  - comparison
  - architecture
  - egress
  - receipts
faq:
  - q: "Why are there four agent-security layers and not one?"
    a: "Because they catch different attacks. A sandbox cannot inspect MCP traffic content. An identity broker cannot tell you a tool description was rewritten between approval and call. An MCP gateway sees tool calls but not the raw HTTP an agent might fall back to. An egress inspector sees the bytes but not the workspace process that produced them. A defensible deployment combines controls from multiple layers so each layer covers a different failure mode."
  - q: "Where does Pipelock sit?"
    a: "Layer 4: content inspection at the egress boundary with signed action receipts. Pipelock runs as a local proxy between the agent and the network, scans every HTTP, MCP, and WebSocket message in both directions for credential leaks, prompt injection, SSRF, and tool poisoning, and emits an Ed25519-signed receipt for every adjudicated action. Receipts chain by hash into a tamper-evident evidence trail any third party can verify offline (Apache-2.0 core; Enterprise features under ELv2)."
  - q: "Is Pipelock a competitor to Coder, Astrix, or Docker MCP Gateway?"
    a: "Not directly. Coder Agent Firewall is a process-level isolation tool tied to Coder workspaces. Astrix and Reco discover and govern AI agent identities and SaaS access. Docker MCP Gateway and IBM ContextForge route and mediate MCP tool calls. None of these inspect content for credential leaks or emit signed receipts. The four layers complement each other; a serious operator deploys controls from two or three lanes."
  - q: "What happens if a deployment skips layer 4?"
    a: "Sandboxing blocks the wrong process from running. Identity governance blocks the wrong principal from authenticating. MCP gateways block the wrong tool from being routed. None of those layers see the bytes flowing between an authorized agent and an authorized endpoint, so credential exfiltration via query string, prompt injection in a fetched response, and tool poisoning in a returned description all pass through unobserved. Layer 4 is the only layer that produces evidence of what actually crossed the boundary."
  - q: "Can layer 4 replace the other layers?"
    a: "No. Pipelock does not constrain process capability the way nsjail does. Pipelock does not catalog AI-agent identities the way Astrix does. Pipelock does not authenticate MCP clients the way a gateway does. Pipelock inspects the traffic and proves what happened. Each layer is necessary for its own threat class."
---

AI agent security splits into four layers. Each lane catches a different
class of attack. Operators evaluating tools should map their threat model
to the layers, not chase a single vendor that claims to cover everything.

Pipelock sits in layer 4. This page exists so a buyer comparing
"agent firewall" products can see where the named examples actually fit.

## Layer 1: process sandboxing and OS isolation

Constrains what the agent process can do at the kernel level. Network
namespaces, Linux capabilities, Landlock, seccomp filters. The agent
process is contained inside a jail; outbound network goes through a
controlled proxy port.

**Named examples:**

- **Coder Agent Firewall.** Process-level firewall using nsjail or
  Landlock V4 for network isolation. Terraform module bundled into
  Coder workspaces. Restricts which domains and HTTP methods an agent
  can reach. Logs decisions to the Coder control plane.
- **iron-proxy.** Open-source Go egress firewall built around domain
  allowlists with boundary secret rewriting. Process-runs alongside the
  agent inside a container.
- **gh-aw-firewall.** GitHub's network allowlist for Copilot coding
  agent. Constrains domains the agent can reach.

**What this layer catches:** unauthorized process execution, escape
attempts into the host filesystem or kernel, outbound to disallowed
hosts at the network layer.

**What this layer misses:** content of allowed traffic. A sandbox that
permits api.anthropic.com cannot tell you the agent sent an API key in
the request body. A sandbox that permits a vetted MCP server cannot
tell you the tool returned a poisoned response.

## Layer 2: identity and access governance

Catalogs which AI agents, non-human identities, and machine accounts
exist; what they can authenticate to; and what permissions they hold.
Closer to a CASB or identity provider than a network control.

**Named examples:**

- **Astrix Security.** AI agent discovery, non-human identity mapping,
  real-time policy engine, MCP server visibility.
- **Reco.** AI agent security across SaaS, with permissions and access
  control at the application layer.
- **Unbound AASB.** "Agent Access Security Broker" framing: governs
  coding agent terminal commands, MCP actions, and sensitive resource
  access with audit evidence.

**What this layer catches:** unauthorized identity, scope creep,
overprivileged service accounts, shadow agent provisioning.

**What this layer misses:** content of authorized actions. Once the
identity is approved and the scope is right, this layer does not look
at the bytes.

## Layer 3: MCP gateway and tool mediation

Routes MCP traffic through a control plane. Authenticates clients,
applies tool-level policy, caches and logs tool calls. Some platforms
fold light scanning into the gateway.

**Named examples:**

- **Docker MCP Gateway.** Container-isolated MCP server runtime with
  routing and basic tool-level controls.
- **IBM ContextForge.** Open-source MCP gateway federating MCP, A2A,
  and REST/gRPC behind a single registry.
- **TrueFoundry.** Commercial MCP gateway with auth, observability,
  and policy.
- **Composio.** Hosted MCP routing layer with first-party tool
  integrations.
- **Proofpoint AI MCP Security.** Discovery, policy enforcement,
  content inspection, audit logging packaged as a gateway-plus product.
- **MCPTotal / Autonomous.** AI-EDR framing for agents and MCP servers
  with runtime enforcement and a token vault.
- **Runlayer.** MCP control plane for enterprise rollouts with auth
  and policy.

**What this layer catches:** unauthorized MCP server attachment, tool
routing violations, missing authentication, the MCP-protocol level of
trust.

**What this layer misses:** non-MCP egress. An agent that falls back
to raw HTTP, a WebSocket pull from a model API, or an HTTPS GET with
secrets in the query string bypasses the gateway because none of those
go through MCP. Most MCP gateways also do not scan response bodies for
prompt injection or DLP patterns.

## Layer 4: egress inspection with signed action receipts

Sits inline on the agent's outbound network and inspects every byte.
Decodes layered encodings, normalizes Unicode evasion, scans request
and response bodies, runs MCP-aware tool scanning, and emits a signed
receipt for every adjudicated action. Receipts chain by hash into a
tamper-evident log a relying party can verify offline.

**Named examples:**

- **Pipelock.** Open-source, single Go binary (Apache-2.0 core; Enterprise features under ELv2). Inspects
  HTTP, MCP stdio and HTTP, and WebSocket transports. The fixed-order
  scanner pipeline with DLP, prompt injection, SSRF, tool poisoning,
  rug-pull detection, and policy-bound MCP tool routing. Emits
  Ed25519-signed [action receipts](/learn/agent-action-receipts/) that
  any party can [verify with a copy-paste demo](/learn/verify-a-receipt/).
  The receipt envelope ([Audit Packet v0](/schemas/audit-packet-v0.schema.json))
  is the procurement-evidence artifact for delegated machine action.

**What this layer catches:** credential exfiltration via query string,
header, or body; prompt injection in tool responses; SSRF; MCP tool
description drift between approval and call; tool poisoning in returned
descriptions; data exfiltration via DNS query encoding before resolution.

**What this layer misses:** process-level isolation. A sandbox is still
required to keep the agent off the host filesystem. Identity governance
is still required to make sure the right principal is acting.

## Choosing layers by threat model

| If the failure mode is... | The covering layer is... |
| --- | --- |
| Agent escapes the workspace, runs unsigned binaries | Layer 1 (sandboxing) |
| Wrong identity assumes the right role | Layer 2 (identity) |
| Untrusted MCP server attaches without review | Layer 3 (MCP gateway) |
| Approved tool returns poisoned content | Layer 4 (egress inspection) |
| Approved domain exfiltrates secrets via query string | Layer 4 |
| Auditor asks "prove what the agent did" | Layer 4 (signed receipts) |

A buyer-side rule of thumb: layers 1, 2, and 3 keep the wrong things
from running. Layer 4 produces evidence of what actually ran. Both
matter.

## Where to go next

- [Pipelock product page](/pipelock/): single-binary egress inspector
  with the v2.5 receipt verifier shipping in the release archive.
- [Verify a Pipelock receipt](/learn/verify-a-receipt/): hands-on
  walkthrough of the four shipped verifier invocations.
- [Open-source AI firewall comparison](/learn/open-source-ai-firewall/):
  more depth on layer 4 alternatives and license posture.
- [Agent firewall hub](/agent-firewall/): the three-camp taxonomy this
  page extends with an identity layer and a receipt layer.
- [Compliance evidence substrate](/learn/compliance-evidence-substrate/):
  what auditors and procurement teams actually want from layer 4.

Receipts or it didn't happen. Layers 1, 2, and 3 stop the wrong things.
Layer 4 proves what crossed the boundary.
