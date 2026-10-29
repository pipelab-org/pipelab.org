---
title: "Pipelock v2.5.0: Portable Audit Evidence and Host Containment"
linkTitle: "Pipelock v2.5.0 Release"
date: 2026-05-20
author: "Josh Waldrep"
summary: "Pipelock v2.5.0 adds Audit Packet verifiers, host containment lifecycle commands, strict federation, MCP integrity manifests, and broader IDE coverage."
description: "Pipelock v2.5.0 ships Audit Packet verifiers, host containment lifecycle commands, strict federation, MCP integrity, and IDE installers."
tags: ["pipelock", "agent-firewall", "mcp", "runtime-security", "release"]
blog_cat: "releases"
faq:
  - q: "What is the headline change in Pipelock v2.5.0?"
    a: "Portable audit evidence. Pipelock v2.5.0 ships the Audit Packet v0 schema, first-party Go, TypeScript, and Rust verifier implementations, and the standalone pipelock-verifier CLI so auditors can verify signed evidence without running Pipelock."
  - q: "Is Pipelock v2.5.0 a breaking upgrade?"
    a: "Most v2.4.x configs are additive upgrades. Operators using inbound mediation-envelope verification should review actor format settings because v2.5 requires SPIFFE-format inbound actors by default."
  - q: "What changed for host containment?"
    a: "The contain CLI now manages install, verify, rollback, tool additions, workspace grants and revokes, and CA refresh for the three-UID containment model."
  - q: "What should operators check first?"
    a: "Run pipelock check, then pipelock doctor or pipelock verify-install against the live deployment path. Review federation actor format before enabling v2.5 against legacy peers."
---

> v3.7.0 clarification (2026-10-29): the Scanner and audit hardening section below describes v2.5.0. Do not treat educational framing, quotation marks or code fences as a trust boundary. For v3.7.0, the [false-positive tuning guide](https://github.com/pipelab-org/pipelock/blob/v3.7.0/docs/false-positive-tuning.md) describes operator-declared exceptions for a named host and core response pattern. Those exceptions retain the finding and its evidence; they withhold that finding's block. The original post follows unchanged.

v2.4.0 turned observed agent behavior into enforceable policy. v2.5.0 turns the evidence and deployment boundary around that policy into something operators can install, verify, and hand to a third party.

The release adds Audit Packet v0, first-party verifier SDKs, a standalone verifier CLI, host containment lifecycle commands, strict-default federation, MCP integrity manifests, Kubernetes launcher contracts, new IDE installers, scanner hardening, and release-chain cleanup.

## Audit Packet v0 and verifiers

The Audit Packet is the release's proof artifact. It gives procurement teams, SIEM pipelines, and external reviewers a directory they can validate without running the Pipelock proxy.

v2.5.0 ships:

- the canonical Audit Packet v0 schema
- Go bindings
- TypeScript verifier implementation
- Rust verifier implementation
- a standalone `pipelock-verifier` CLI

The CLI verifies receipt chains, single receipts, and full Audit Packet directories:

```bash
pipelock-verifier chain evidence/evidence-proxy-0.jsonl --key <public-key-hex>
pipelock-verifier receipt path/to/single-receipt.json --key <public-key-hex>
pipelock-verifier audit-packet path/to/audit-packet-directory/
```

That matters for separation of duties. The system that generated the receipt does not need to be the system that verifies it. A reviewer can validate the signed artifact offline against the public schema and a pinned key.

## Host containment lifecycle

Pipelock's security model depends on capability separation: the agent has secrets, Pipelock has network access, and the agent's network path crosses Pipelock.

v2.5.0 gives operators a fuller lifecycle for the Linux containment shape:

```bash
pipelock contain install
pipelock contain verify
pipelock contain rollback
pipelock contain add-tool <name> --target <path>
pipelock contain grant-workspace <path>
pipelock contain revoke-workspace <path>
pipelock contain ca-refresh
```

The model uses three UIDs: operator, `pipelock-proxy`, and `pipelock-agent`. nftables owner-match rules force the contained agent user through Pipelock on loopback. The proxy user can read the Pipelock state it needs, while the agent user cannot replace it.

Install also pins the binary hash for TOFU integrity checks, and workspace ACL subcommands keep project access explicit instead of opening broad system paths.

## Federation strict mode

v2.4.0 added inbound mediation-envelope verification. v2.5.0 tightens the default.

Inbound verified envelopes now require SPIFFE-format actors by default:

```text
spiffe://<trust-domain>/agent/<agent-name>
spiffe://<trust-domain>/mediators/<deployment-id>
```

Legacy free-form actors remain available for migration, but they are no longer the permissive default. The new `pipelock envelope trust` operator CLI manages the local trust list for peer onboarding.

Contract tombstones also move from evidence marker to enforcement input. A tombstoned contract hash cannot be re-promoted, and accepted-load cannot resurrect a tombstoned hash.

Full reference: [Mediation Envelope Signing](/learn/mediation-envelope-signing/).

## MCP integrity and launcher contracts

MCP server launch is a supply-chain boundary. v2.5.0 adds first-party manifest tooling:

```bash
pipelock mcp integrity manifest generate
pipelock mcp integrity manifest verify
pipelock mcp integrity manifest sign
pipelock mcp integrity manifest verify-signature
```

Operators can pin MCP server binaries and scripts by SHA-256, merge updates into a manifest, and require a trusted Ed25519 manifest signature before subprocess launch.

Kubernetes launcher plumbing also gets stricter. `pipelock init sidecar --mcp-upstream` now emits the companion MCP listener, service port, workload annotations, NetworkPolicy allowance, `PIPELOCK_MCP_PROXY_URL`, and mounted `PIPELOCK_MCP_CONFIG`. The agent launcher or MCP client must consume one of those values for MCP traffic to traverse Pipelock.

## More agent surfaces

The installer surface grows beyond Claude Code, Cursor, VS Code, and JetBrains.

v2.5.0 adds setup flows for:

- Cline
- OpenCode
- OpenAI Codex CLI
- Zed

The installers follow the same pattern: find the agent's MCP configuration, wrap server launches through `pipelock mcp proxy`, and preserve the operator's existing server commands.

## Scanner and audit hardening

The scanner keeps its public live counts at 48 DLP patterns, 25 injection patterns, 10 chain patterns, and 7 presets. v2.5.0 hardens specific gaps inside that surface:

- response scanning covers memory-persistence directives, credential-solicitation phrasing, and covert-action directives in skill-poisoning text
- project scan now applies DLP validators to candidate matches, reducing false positives for checksum-validated classes
- response-scanner educational examples are filtered so defensive docs about prompt injection do not trip the product
- split-payload DLP now decodes structured delimiter fragments in JSON, YAML, CSV-style text, and WebSocket frame sequences
- SigV4 presigned URLs get a structural carve-out so legitimate AWS pre-signed URLs do not trip URL DLP
- `pipelock claude-hook` now fails closed on unsupported hook events

The rules bundle keyring is now separate from the license key, so signing-key rotation for detection content is independent of commercial license material.

## Operator diagnostics and release chain

`pipelock doctor` reports whether configured protections are actually enforceable in the current deployment. It covers proxying, TLS interception, request-body scanning, Browser Shield, MCP wrapping, MCP binary integrity, tool provenance, file sentry, Sentry, containment, and deployment-boundary signals.

`pipelock verify-install` grows smoke checks for the install path, and `pipelock adaptive status / flush / whoami` exposes runtime adaptive state through the authenticated admin API.

The dependency-update path moved from Dependabot to Renovate with a 10-day cooldown for non-security churn, digest-pinned Docker base images, and refreshed CI Actions. Release artifacts continue to ship cosign signatures and SLSA L3 provenance.

## Upgrade

Most v2.4.x deployments can upgrade the binary first, then roll out the new enforcement surfaces deliberately.

Start with:

1. Run `pipelock check --config pipelock.yaml`.
2. Run `pipelock doctor --config pipelock.yaml` against the deployment you actually use.
3. If you verify inbound envelopes, confirm peers emit SPIFFE actors or set the legacy migration mode explicitly.
4. Generate and verify MCP integrity manifests before requiring signatures.
5. Trial containment with `pipelock contain verify` before switching agent launchers to the contained path.
6. Use `pipelock-verifier` against a real receipt chain before wiring Audit Packets into SIEM or procurement evidence.

Full operator guide: [Pipelock v2.5 upgrade guide](/learn/pipelock-v250-upgrade/).

Full changelog at the [public repo](https://github.com/pipelab-org/pipelock/blob/main/CHANGELOG.md).
