---
title: "Pipelock vs Runlayer"
linkTitle: "Pipelock vs Runlayer"
seoTitle: "Pipelock vs Runlayer: MCP Governance Comparison"
subtitle: "A self-hosted proxy that inspects routed agent traffic, next to a Runlayer-hosted or self-hosted AI control plane with MCP governance and content inspection."
description: "Compare Pipelock vs Runlayer: a proxy scanning HTTP, WebSocket, and MCP traffic with signed receipts, and a control plane that governs and scans MCP tools."
date: 2026-04-05
lastmod: 2026-10-14
reviewed: "October 2026"
compare_cat: "platform"
compare:
  subject: "Runlayer"
  subject_job: "AI control plane. A governed MCP gateway with a large MCP catalog, identity-based access, shadow AI discovery, configurable scanning of tool definitions, inputs, and outputs, and audit across many AI clients."
  subject_boundary: "Runlayer-hosted or self-hosted control plane with MCP governance and content inspection"
  subject_source: "Closed source (Anysource Inc.)"
  subject_pricing: "Platform fee based on deployment size; no per-seat charges or dollar amount in the cited description"
  subject_deploy: "Runlayer-hosted single tenant, or self-hosted on AWS ECS with Terraform or on Kubernetes; the site advertises SOC 2, HIPAA, and GDPR"
  pick_subject: "Your problem is who may use which MCP servers across a company, with identity-based access, a catalog, shadow AI discovery, and scanning at the gateway."
  pick_pipelock: "Your problem is what's inside agent traffic on HTTP and WebSocket as well as MCP, with open detection rules and receipts you can verify offline."
  pick_both: "Runlayer governs MCP access and scans tool traffic at its gateway. Pipelock inspects HTTP, WebSocket, and MCP traffic routed through it. Both inspect MCP content, so expect some overlap there; the coverage outside MCP and the evidence format differ."
sources:
  - label: "Runlayer homepage"
    url: "https://www.runlayer.com/"
    checked: 2026-10-14
    note: "advertises 18,000+ MCPs in the catalog, shadow AI discovery, and SOC 2, HIPAA, and GDPR badges"
  - label: "Runlayer site index"
    url: "https://www.runlayer.com/llms.txt"
    checked: 2026-10-14
  - label: "Runlayer blog: why production AI systems need MCP gateways"
    url: "https://www.runlayer.com/blog/MCP-gateways"
    checked: 2026-10-14
    note: "describes the gateway as handling discovery, authentication, input and output filtering, and observability"
  - label: "Runlayer docs: deployment overview"
    url: "https://docs.runlayer.com/deployment/overview"
    checked: 2026-10-14
    note: "Runlayer-hosted single-tenant or self-hosted deployment, with AWS ECS and Terraform or Kubernetes options; says to ask the Runlayer account team for commercial terms"
  - label: "Runlayer docs: ToolGuard"
    url: "https://docs.runlayer.com/runlayer-toolguard"
    checked: 2026-10-14
    note: "tool definitions scanned at registration or re-scan; credential, PII, invisible-character, and ToolGuard checks on tool inputs and outputs with configurable block, mask, or alert actions. Vendor descriptions, not measured efficacy"
  - label: "Runlayer docs: audit logs"
    url: "https://docs.runlayer.com/platform-audit-logs"
    checked: 2026-10-14
    note: "logs tool calls, policy and security events, and scan metadata, with export and retention controls; no offline signature-verification format described"
  - label: "Runlayer blog: Runlayer vs. Natoma"
    url: "https://llms.runlayer.com/blog/runlayer-vs-natoma"
    checked: 2026-10-14
    note: "describes a platform fee scoped to deployment size with no per-seat pricing, no dollar amount; says Runlayer sits between all 300+ MCP clients and their servers; lists rug-pull detection as a ToolGuard capability"
faq:
  - q: "What's the difference between Pipelock and Runlayer?"
    a: "Pipelock is an open-source proxy that scans agent traffic routed through it across HTTP, WebSocket, and MCP, and can emit signed receipts when a recorder directory and signing key are configured. Runlayer is an AI control plane with MCP access governance, a large catalog, identity-based access, shadow AI discovery, and configurable inspection of tool definitions, arguments, and outputs. Runlayer offers Runlayer-hosted and self-hosted deployment. Both inspect MCP content; Pipelock also covers routed HTTP and WebSocket traffic."
  - q: "Does Runlayer scan HTTP traffic?"
    a: "Its ToolGuard docs describe scanners for MCP and local tool traffic: tool definitions, tool inputs, and tool outputs. A general-purpose HTTP or WebSocket forward proxy wasn't described on the pages checked on 2026-10-14. Pipelock scans HTTP, WebSocket, and MCP traffic for agents routed through it; inspecting inner HTTPS content carried through a CONNECT tunnel requires TLS interception."
  - q: "Can I use Pipelock and Runlayer together?"
    a: "Yes. Runlayer decides who may reach which tools and scans tool traffic at its gateway. Pipelock inspects traffic routed through it, including HTTP and WebSocket traffic outside the governed tools, and can emit signed receipts when a recorder directory and signing key are configured. On MCP the two inspections overlap, so tune both to avoid duplicate blocks."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It scans HTTP, MCP, and WebSocket traffic routed through it for credential leaks, injection, SSRF, and tool poisoning, can emit signed action receipts for mediated decisions when a signing key is configured, and runs as a single self-hosted binary.

**[Runlayer](https://www.runlayer.com/)** describes an AI control plane with MCP access governance and configurable inspection of tool definitions, arguments, and outputs. Its site lists a catalog of more than 18,000 MCPs, shadow AI discovery across unmanaged agents and client configs, and SOC 2, HIPAA, and GDPR badges. Its [Natoma comparison post](https://llms.runlayer.com/blog/runlayer-vs-natoma) says it sits between more than 300 MCP clients and their servers. Its [deployment docs](https://docs.runlayer.com/deployment/overview) describe Runlayer-hosted and self-hosted deployment.

Pipelock is a self-hosted proxy for supported HTTP, WebSocket, and MCP paths, with content scanning on traffic routed through it. Inspecting inner HTTPS requests and responses carried through CONNECT tunnels requires TLS interception. Fetch mode can inspect content fetched from HTTPS origins.

### Runlayer pricing

Runlayer describes a platform fee based on deployment size, with no per-seat charges. Its public pricing description doesn't include a dollar amount, so you'll need a quote for the deployment you're evaluating. Pipelock's Apache-2.0 core is free. Pro adds named security profiles with separate policies and budgets. Enterprise adds central fleet governance. See [current Pipelock plans and pricing](/pricing/).

## Feature comparison

| Feature | Pipelock | Runlayer |
|---------|----------|----------|
| **Architecture** | Self-hosted proxy, single binary | Runlayer-hosted or self-hosted control plane with MCP governance and content inspection |
| **Primary scope** | Content scanning on HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, and MCP | MCP access governance, catalog, identity, discovery, and scanning of MCP and local tool traffic |
| **Credential scanning (DLP)** | 65 built-in patterns, encoding-aware, environment leak detection | Credential and PII detection on tool inputs and outputs, with block, mask, or alert actions, per its ToolGuard docs |
| **Prompt injection detection** | Deterministic patterns with multi-pass normalization | ToolGuard classifiers on tool definitions, tool outputs, and input-output intent, per its docs |
| **Tool poisoning** | Description scanning and rug-pull drift detection | Tool definitions scanned at registration or re-scan, per its docs; its Natoma comparison post also claims rug-pull detection |
| **SSRF protection** | Private IP, metadata, and DNS rebinding checks | Not documented on the pages checked |
| **Identity-based access** | Not in scope at the proxy | Yes |
| **MCP catalog** | No | Yes, 18,000+ per the site |
| **Shadow AI discovery** | No | Yes |
| **Signed receipts** | With an enabled flight recorder, recorder directory and signing key, Pipelock can emit signed receipts for covered mediated decisions. Emission is best-effort by default; receipts can be verified offline against a trusted operator public key. | Audit logs and exports; its audit-log page says "All logs are tamper-proof." An offline signed-receipt format wasn't found on the audit-log and ToolGuard pages checked on 2026-10-14. |
| **Compliance** | OWASP, NIST 800-53, and EU AI Act mappings | SOC 2, HIPAA, GDPR advertised |
| **Source availability** | Apache-2.0 core; Enterprise under ELv2 | Closed source |
| **Pricing** | Free core; paid tiers published | Platform fee based on deployment size; no per-seat charges or dollar amount in the cited description |

## Where Runlayer is stronger

**Access governance at company scale.** Which users and teams may reach which MCP servers, with permissions and approval built in. Pipelock doesn't manage identity.

**The catalog.** A curated registry of approved servers that teams can browse and request. Pipelock has no catalog.

**Shadow AI discovery.** Visibility into unmanaged agents, MCPs, skills, and client configs across an organization. Pipelock sees only the traffic routed through it.

**Deployment choice.** Runlayer runs as a single-tenant deployment it operates, or self-hosted in your own AWS account or Kubernetes cluster, and its docs describe continuous audit-log export to S3 for a SIEM.

**Compliance posture for procurement.** SOC 2, HIPAA, and GDPR badges and named enterprise customers matter to buyers who purchase through procurement.

## Where Pipelock is stronger

**Coverage outside MCP.** Pipelock inspects HTTP and WebSocket traffic routed through it alongside MCP, so agent activity outside the MCP tool layer is visible when the proxy is in the path. HTTPS through a CONNECT tunnel shows only the destination unless TLS interception is on.

**Inspection depth.** Encoding-aware DLP, injection normalization passes, tool fingerprinting and drift detection, entropy and environment-leak checks.

**Open, readable rules.** Every Pipelock pattern is in the public repository. Runlayer's ToolGuard docs describe custom-trained classifiers, and their detection rules aren't published on the pages checked.

**Evidence.** With a recorder directory and signing key configured, Pipelock can emit signed receipts for mediated decisions that the shipped verifier checks offline against your public key. Emission is best-effort by default. Turning on `require_receipts` blocks an allowed action when its receipt can't be written; receipts for blocked actions stay best-effort.

**Published pricing.** The free core and the paid tiers are on the [pricing page](/pricing/). Runlayer's [deployment docs](https://docs.runlayer.com/deployment/overview) say to ask its account team for commercial terms.

## Where the two overlap

Access governance and content inspection overlap here. Runlayer decides who may reach which tools, and its [ToolGuard docs](https://docs.runlayer.com/runlayer-toolguard) describe checks on the tool definitions, arguments, and outputs that pass through its gateway. Pipelock inspects the same kinds of content on MCP paths it wraps, plus HTTP and WebSocket traffic routed through its proxy, and can sign a receipt for what it decided.

Agents don't only act through governed tool calls. They fetch URLs and call APIs. A governed MCP path doesn't by itself cover that traffic, and a proxy only sees what's routed through it, so check where each agent's traffic goes before relying on either.

## Further reading

- [What is an agent firewall?](/agent-firewall/): definition and evaluation checklist
- [Agent firewall vs guardrails](/compare/agent-firewall-vs-guardrails/): where enforcement happens
- [Pipelock vs Backslash Security](/compare/pipelock-vs-backslash/): another governance-platform comparison
- [Agent firewall vs AI security platform](/compare/agent-firewall-vs-ai-security-platform/): the shape question, across the platform vendors
- [MCP security](/learn/mcp-security/): the full scope of MCP threats
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
