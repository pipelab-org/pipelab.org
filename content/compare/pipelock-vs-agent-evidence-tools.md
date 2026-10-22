---
title: "Pipelock vs Agent Evidence Tools"
linkTitle: "Pipelock vs Agent Evidence Tools"
seoTitle: "Agent Evidence Tools Compared with Pipelock"
subtitle: "Attested Intelligence, Asqav, Obsigna, and Halo-record next to Pipelock. Who holds the key, where the recorder sits, and whether an auditor can verify offline."
description: "Compare agent evidence tools: Pipelock, Attested Intelligence, Asqav, Obsigna, and Halo-record on receipt format, verifier, key custody, and offline use."
date: 2026-09-01
lastmod: 2026-09-01
reviewed: "September 2026"
compare_cat: "evidence"
compare:
  subject: "Agent evidence tools"
  subject_job: "Produce a tamper-evident record of what an agent did. They differ on who signs, where the recorder sits, and whether an outsider can check the result without the vendor."
  subject_boundary: "Ranges from inside the agent process to a hosted third-party notary"
  subject_source: "Attested Intelligence (MIT), Asqav SDK (Elastic License 2.0, closed service), Obsigna (Apache-2.0), Halo-record (Apache-2.0)"
  subject_pricing: "Free packages; Asqav sells a hosted service with a free plan"
  subject_deploy: "MCP proxy, SDK plus hosted signer, or in-process recorder"
  pick_subject: "Pick by the property you need. Attested Intelligence for MCP-only policy receipts. Asqav for a hosted third-party signer with post-quantum keys. Obsigna for an out-of-process signing daemon with a public receipt protocol. Halo-record for a zero-dependency in-process hash chain."
  pick_pipelock: "You want the evidence to come from the same boundary that inspected and enforced the traffic, across MCP, HTTP, and WebSocket, with a key you hold."
  pick_both: "Halo-record can ingest gateway logs, so it can sit downstream of Pipelock. The two mediator products overlap with Pipelock on the MCP path; pick one there."
sources:
  - label: "attestedintelligence/aga-mcp-server README"
    url: "https://github.com/attestedintelligence/aga-mcp-server"
    checked: 2026-09-01
  - label: "Attested Intelligence specification"
    url: "https://attestedintelligence.com/spec"
    checked: 2026-09-01
  - label: "Asqav docs: quick start"
    url: "https://www.asqav.com/docs/"
    checked: 2026-09-01
    note: "states that Asqav signs each action server-side with its own keys as an unaffiliated third party"
  - label: "Asqav docs: key custody and selective disclosure"
    url: "https://www.asqav.com/docs/key-custody-and-disclosure"
    checked: 2026-09-01
    note: "hosted signer holds the agent key encrypted at rest; customer-managed KMS and a self-hosted signer are documented alternatives"
  - label: "Asqav docs: verify without Asqav"
    url: "https://www.asqav.com/docs/verify-without-asqav"
    checked: 2026-09-01
    note: "open verifier under Elastic License 2.0 with an Apache-licensed standalone file, public conformance vectors, and a public JWKS"
  - label: "agent-receipts/obsigna README"
    url: "https://github.com/agent-receipts/obsigna"
    checked: 2026-09-01
    note: "Apache-2.0; out-of-process signing daemon holds the key; MCP proxy signs every tool call; PostToolUse hook; CLI verifier; three SDKs that verify one another's receipts; formal chain-invariant check names the Byzantine key holder as its boundary"
  - label: "bkuan001/halo-record README"
    url: "https://github.com/bkuan001/halo-record"
    checked: 2026-09-01
    note: "Apache-2.0; hash chain with no signatures, opt-in witness and RFC 3161 timestamp, documented fail-open framework adapters"
faq:
  - q: "What separates these tools if they all produce tamper-evident records?"
    a: "Three things. Who holds the signing key: the deployer (Pipelock, Attested Intelligence, Halo-record) or a vendor by default (Asqav, with customer-managed and self-hosted options). Where the recorder sits: outside the agent process as a mediator (Pipelock, Attested Intelligence), inside the agent process (Halo-record), or wherever the SDK is called (Asqav). And what it covers: MCP tool calls only, framework events, or the agent traffic routed through a mediator."
  - q: "Does a hash chain without signatures prove anything?"
    a: "It proves the chain is internally consistent. Anyone holding the file can edit a record and recompute every hash after it, so tamper evidence depends on a copy of the chain head held somewhere else. Halo-record documents this and offers an opt-in witness and an RFC 3161 timestamp for that reason."
  - q: "Which of these is independent of the operator?"
    a: "None fully. A deployer-held key proves what the mediator decided, not that the operator is honest. Asqav's hosted signer is a third party by design, which moves trust to Asqav rather than removing it. Verify the signature yourself, offline, is the claim each of them can honestly make."
---

## The short version

Every tool on this page records agent actions, but the protection against later editing depends on its signature, key custody, or external witness. They differ on the three questions an auditor will ask.

Who holds the signing key? Where does the recorder sit relative to the agent? Can I verify the record without contacting the vendor?

**[Pipelock](/pipelock/)** is an agent firewall. It sits outside the agent process on the routed network path and inspects mediated MCP, HTTP, and WebSocket traffic. With an Ed25519 signing key configured, it can emit signed action receipts for mediated decisions. The shipped verifier works offline.

**[Attested Intelligence](https://github.com/attestedintelligence/aga-mcp-server)** is an MCP governance proxy. It evaluates tool calls against policy, signs a receipt per decision with a deployer-held Ed25519 key, and exports Merkle-bundled evidence with three reference verifiers. MCP only.

**[Asqav](https://www.asqav.com/docs/)** is a hosted evidence service with an SDK. By its own description it's an unaffiliated third party that signs each agent action server-side with its own keys, using ML-DSA-65 post-quantum signatures, and publishes a JWKS. Customer-managed keys and a self-hosted signer are documented alternatives. The verifier is public and works offline.

**[Obsigna](https://github.com/agent-receipts/obsigna)** is the Apache-2.0 reference toolchain for the Agent Receipts protocol. Its README describes an out-of-process signing daemon that holds the key and owns the audit chain, an MCP proxy that signs every tool call and adds policy hooks, a hook for coding agents, a CLI that browses and verifies receipt databases, and Go, Python, and TypeScript SDKs that verify one another's receipts against a shared conformance suite. It is small and new, and pushed the day this page was checked.

**[Halo-record](https://github.com/bkuan001/halo-record)** is an in-process recorder. It appends SHA-256 hash-chained records to a local file from framework callbacks, hooks, or ingested telemetry. No signatures by design. Verification recomputes the chain; an opt-in witness and an RFC 3161 timestamp add an outside anchor.

## The comparison

| Property | Pipelock | Attested Intelligence | Asqav | Obsigna | Halo-record |
|---|---|---|---|---|---|
| **Recorder position** | Mediator on the network path, outside the agent | Mediator on the MCP path, outside the agent | SDK call in the agent; signing happens in Asqav's service or a customer signer | MCP proxy or hook feeds an out-of-process daemon that signs | Inside the agent process |
| **Coverage** | Mediated MCP, HTTP, WebSocket, and A2A; CONNECT payloads need TLS interception | MCP `tools/call` | Whatever the SDK is asked to sign, across 27 listed integrations | MCP tool calls through its proxy; coding-agent hook events | Framework callbacks, coding-agent hooks, MCP interceptor, ingested logs |
| **Signature** | Ed25519 when a signing key is configured | Ed25519; ML-DSA-65 hybrid specified | ML-DSA-65, with Ed25519 options | Ed25519 | None; hash chain only |
| **Who holds the key** | Deployer | Deployer | Asqav by default; customer KMS or self-hosted signer optional | Deployer, in the daemon | No key |
| **Published format** | Public receipt spec | Public receipt spec | Public spec, submitted as an IETF draft | Public protocol spec and JSON schemas | Public JSON schema |
| **Shipped verifier** | Offline verifier plus a Python reference | npm CLI plus JS, Go, and Python references | Python verifier under Elastic License 2.0 | `obsigna verify` CLI plus three SDKs | `halo verify` CLI |
| **Offline verification** | Yes | Yes | Yes, against the published keys | Local verification of the receipt database; documented design | Yes, chain recompute; timestamp check alone makes a network call |
| **Trust anchor** | Deployment key; demo key published | Pinned gateway key | Public JWKS at a well-known endpoint | The daemon's key; third-party key publication not exercised for this page | Optional witness and RFC 3161 timestamp |
| **The decision is inspected** | Yes: DLP, injection, SSRF, tool poisoning inform the receipt | Policy verdict on the call | Policy gate per action | Policy hooks and risk scoring in the proxy | Records; doesn't gate |
| **Failure direction** | Configured block paths fail closed on mediated traffic | PERMITTED or DENIED per call | Per its docs, policy gate before the action | Not documented in the README | Framework adapters fail open by design; documented |
| **License** | Apache-2.0 core; Enterprise under ELv2 | MIT; spec Apache-2.0 | SDK ELv2; service closed | Apache-2.0 | Apache-2.0 |

## What the differences mean

**Mediator versus in-process.** A recorder that runs inside the agent process can only record what the agent chooses to call it for. A compromised or misbehaving agent can skip it. A mediator records traffic that crosses its path, but it does not see traffic that bypasses that path. Pipelock and Attested Intelligence are mediators. Halo-record's README is candid that its framework adapters fail open: if a record can't be written, the action completes and the record is lost.

**Deployer key versus vendor key.** With Pipelock, Attested Intelligence, Obsigna, and Halo-record's optional anchors, you hold the material. Asqav inverts that on purpose: its pitch is that a third party the agent's operator doesn't control does the signing, so the recorded party can't forge or backdate. That's a real property, and it means you trust Asqav's service and key directory instead. Its docs also offer customer-managed KMS keys and a self-hosted signer for buyers who want the key out of the vendor's database.

**Coverage.** Attested Intelligence and Obsigna receipt MCP tool calls, and Obsigna also takes coding-agent hook events. Halo-record records whatever adapters feed it. Asqav signs whatever the SDK is asked to sign. With a signing key configured, Pipelock can receipt decisions on its mediated network path, and the decision carries the reason from inspection.

**Post-quantum.** Asqav signs with ML-DSA-65 today. Attested Intelligence specifies a hybrid but signs with Ed25519 live. Pipelock signs with Ed25519. Of the five tools on this table, Asqav is the one whose documented default is a post-quantum signature.

## Where the others are stronger

**A signer you don't control.** Asqav's hosted service holds the signing authority by default, rather than the agent operator. Its documented default signature is post-quantum.

**Hooks inside the agent.** Obsigna takes coding-agent hook events, so it records steps that never touch the network. Attested Intelligence receipts the policy decision on each MCP tool call with a purpose-built format. Halo-record runs in-process with no proxy to deploy.

## What none of them prove

A verified chain proves the records present are authentic and in order. It doesn't prove non-omission: that every action the agent took produced a record. Attested Intelligence's README says so. Halo-record's LIMITS document says so. Obsigna's formal chain-invariant check names the Byzantine key holder as the boundary it does not cover. Pipelock's receipts cover mediated traffic, and traffic that bypasses the proxy leaves no receipt.

A deployer-held key proves what the mediator decided. It doesn't make the operator independent of the evidence. The honest phrasing for all of them is: verify the signature yourself, offline, without a server.

## Not on this table

Two more projects came up in research and were left off. CertNode publishes a receipt format and a verify-only npm package, but its website answered every request with a paused-deployment notice on the date checked and the source repository path in the package metadata didn't resolve, so key custody couldn't be confirmed from a primary source. Hopframe is a BSL-licensed alpha with signed hash chains and Sigstore anchoring on paper, and a single maintainer; the claims weren't exercised. Both may earn a row later.

## Further reading

- [Pipelock vs Attested Intelligence](/compare/pipelock-vs-attested-intelligence/): the closest one-to-one comparison
- [Action receipt spec](/learn/action-receipt-spec/): Pipelock's receipt format
- [Flight recorder](/learn/flight-recorder/): the hash-chained record behind the receipts
- [Proof](/proof/): Pipelock's public receipts and verifier
- [Pipelock vs Microsoft AGT](/compare/pipelock-vs-microsoft-agent-governance-toolkit/): an in-process governance SDK with its own audit chain
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
