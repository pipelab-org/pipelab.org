---
title: "Pipelock vs Attested Intelligence"
linkTitle: "Pipelock vs Attested Intelligence"
seoTitle: "Pipelock vs Attested Intelligence Receipts"
subtitle: "Two mediators that can emit signed receipts. One governs MCP tool calls. The other inspects mediated MCP, HTTP, and WebSocket traffic."
description: "Pipelock and Attested Intelligence both sign offline-verifiable receipts from outside the agent. Compare scope, key custody, and verification."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "evidence"
compare:
  subject: "Attested Intelligence"
  subject_job: "MCP governance proxy. Evaluates every tools/call against a sealed policy, signs a receipt per decision, and exports Merkle-bundled evidence that verifies offline."
  subject_boundary: "Between the MCP client and the MCP server, outside the agent process"
  subject_source: "Open source, MIT; receipt spec under Apache-2.0"
  subject_pricing: "Free packages on npm and PyPI"
  subject_deploy: "TypeScript MCP server and proxy via npx; Python SDK via pip"
  pick_subject: "Your evidence need is MCP tool calls only, you want a policy-and-receipt gateway with three cross-language verifiers, and you are fine without HTTP or WebSocket coverage."
  pick_pipelock: "You need signed receipts configured across mediated MCP, HTTP, and WebSocket, plus the inspection that produces the decision: DLP, injection, SSRF, tool poisoning, and drift."
  pick_both: "Rarely. Both are mediators on the same MCP path. Pick one for MCP; Pipelock can also mediate the other agent traffic routed through it."
sources:
  - label: "attestedintelligence/aga-mcp-server README"
    url: "https://github.com/attestedintelligence/aga-mcp-server"
    checked: 2026-09-01
    note: "MIT; documents the aga-proxy, the ephemeral default signing key, AGA_GATEWAY_KEY, and the non-omission limit"
  - label: "Attested Intelligence specification and benchmarks"
    url: "https://attestedintelligence.com/spec"
    checked: 2026-09-01
    note: "receipt fields, evidence bundle format, verification checks, cross-language conformance corpus"
  - label: "@attested-intelligence/aga-verify on npm"
    url: "https://www.npmjs.com/package/@attested-intelligence/aga-verify"
    checked: 2026-09-01
faq:
  - q: "What's the difference between Pipelock and Attested Intelligence?"
    a: "Both sit outside the agent process and have a shipped verifier that works offline. Attested Intelligence is an MCP governance proxy: it evaluates tools/call requests against policy and receipts the decision. Pipelock is an agent firewall: it inspects mediated MCP, HTTP, and WebSocket traffic for leaks, injection, SSRF, and tool poisoning. With a signing key configured, Pipelock can emit signed action receipts for mediated decisions. The scope of what gets receipted is the difference."
  - q: "Who holds the signing key?"
    a: "In both products, the deployer. Attested Intelligence signs with a default ephemeral key that rotates on every restart until you set a persistent seed; its README tells you to do that first. Pipelock can use a deployment signing key and publishes a demo key for its public receipts. Neither vendor holds your key, and neither product makes the operator independent of its own receipts."
  - q: "Can a third party verify the receipts without the vendor?"
    a: "Yes for both. Attested Intelligence ships an npm verifier CLI plus reference verifiers in JavaScript, Go, and Python checked against a conformance corpus. Pipelock ships an offline verifier and a public receipt format, and its public demo receipts verify against a published key."
---

## The short version

**[Pipelock](/pipelock/)** is an open-source agent firewall. It mediates MCP, HTTP, and WebSocket traffic routed through it and scans it for credential leaks, prompt injection, SSRF, and tool poisoning. With an Ed25519 signing key configured, it can emit signed action receipts for mediated decisions. The shipped verifier checks a receipt chain offline.

**[Attested Intelligence](https://github.com/attestedintelligence/aga-mcp-server)** ships an MCP governance proxy under the MIT license. It runs between any MCP client and server, evaluates every `tools/call` against a sealed policy, signs a receipt for the decision, chains receipts by hash, and exports Merkle-bundled evidence that verifies offline. The spec, the conformance corpus, and three reference verifiers are public.

Both products are mediators with offline verification, and in both the deployer holds the key. The difference is what gets mediated. Attested Intelligence governs MCP tool calls. Pipelock inspects the MCP, HTTP, and WebSocket traffic routed through it.

## Feature comparison

| Feature | Pipelock | Attested Intelligence |
|---------|----------|------------------------|
| **What it mediates** | Routed MCP (stdio and HTTP), HTTP, HTTPS CONNECT (payloads only with TLS interception on), WebSocket, A2A | MCP `tools/call`; other methods pass through with a signed passthrough receipt |
| **What produces the decision** | Content inspection: DLP, injection, SSRF, tool poisoning and drift, plus policy | Policy evaluation of the tool call |
| **Receipt signature** | Ed25519 when a signing key is configured | Ed25519 by default; ML-DSA-65 hybrid specified but not the live signer |
| **Chaining** | Hash-linked receipts and a hash-chained flight recorder | Hash-linked receipts with Merkle proofs and a signed checkpoint per bundle |
| **Shipped verifier** | Offline verifier, plus a reference Python verifier | npm CLI, plus JavaScript, Go, and Python reference verifiers |
| **Conformance corpus** | Public receipt format; no separate conformance corpus | 61-case cross-language corpus, company-authored |
| **Key custody** | Deployer; key generated at install | Deployer; ephemeral key by default until a seed is set |
| **Published trust anchor** | Demo key published for public receipts; deployments pin their own key | None by default; pin the gateway key from `get_server_info` |
| **Non-omission** | Not proven; receipts cover mediated traffic only | Not proven; the README says so explicitly |
| **Enforcement** | Configured block, warn, or allow per control on mediated paths | PERMITTED or DENIED per tool call |
| **Source availability** | Apache-2.0 core; Enterprise under ELv2 | MIT; receipt spec Apache-2.0 |

## Where Attested Intelligence is stronger

**Verifier breadth.** Three reference verifiers in three languages, checked against a shared conformance corpus that the company authored, plus a standalone verifier with no third-party cryptography. That's a strong answer to "can someone who isn't you check this".

**Bundle format.** Evidence bundles carry Merkle proofs and a signed checkpoint, so a verifier can prove a receipt's inclusion without the whole chain.

**Focus.** It does one job on one protocol and documents its limits, including that verified receipts don't prove every action was logged.

## Where Pipelock is stronger

**Scope of what gets receipted.** Attested Intelligence receipts MCP tool calls. With a signing key configured, Pipelock can receipt decisions on mediated MCP, HTTP, HTTPS, WebSocket, and A2A traffic, so a leaked credential in a routed plain HTTP POST or an injected routed web page can produce evidence too.

**The decision is informed by inspection.** A configured Pipelock receipt can record why: a DLP pattern, an injection match, an SSRF check, or a poisoned or drifted mediated tool description. Attested Intelligence records a policy verdict on the call.

**Key from day one.** Pipelock generates the deployment key at install. Attested Intelligence signs with an ephemeral key that rotates on restart until you set one, and its README makes that the first thing to fix.

**Containment and the rest of the firewall.** Process sandboxing, kill switch, rate limits, TLS interception, and the scanning engine come with the receipts.

## The honest caveat, for both

A signed receipt from a mediator proves what the mediator decided about the traffic it saw. It doesn't prove the agent took no other path, and it doesn't make the operator independent of the evidence, because the operator holds the key. Both projects say this in their own words. Treat any "independently verifiable" claim, from either, as "verify the signature yourself, offline, without a server", which is true and useful, and nothing more.

## Further reading

- [Pipelock vs agent evidence tools](/compare/pipelock-vs-agent-evidence-tools/): the wider evidence-axis roundup
- [Action receipt spec](/learn/action-receipt-spec/): Pipelock's receipt format
- [Flight recorder](/learn/flight-recorder/): the hash-chained record behind the receipts
- [Proof](/proof/): Pipelock's public receipts and verifier
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
