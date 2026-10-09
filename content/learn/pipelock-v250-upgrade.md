---
title: "Pipelock v2.5 Upgrade Guide"
linkTitle: "Pipelock v2.5 Upgrade"
subtitle: "Roll out Audit Packet verification, strict federation, containment, and MCP integrity deliberately."
description: "Pipelock v2.5 upgrade guide: verifier rollout, containment lifecycle, strict federation, MCP integrity, and installer checks."
date: 2026-05-20
lastmod: 2026-05-20
og_image: "https://pipelab.org/images/og/og-product.png"
learn_cat: operator
level: ref
tags:
  - release
  - upgrade
  - v2.5
faq:
  - q: "Is Pipelock v2.5 a breaking upgrade?"
    a: "Most v2.4.x configs continue to run. The main behavior change is strict inbound federation: verified inbound mediation envelopes require SPIFFE-format actors by default unless the operator explicitly selects legacy actor mode for migration."
  - q: "Should I enable containment during the binary upgrade?"
    a: "No. Upgrade the binary first, then run contain verify and stage the three-UID containment model separately. Containment changes host networking and workspace access, so it deserves its own rollout window."
  - q: "What should I test before requiring MCP integrity manifests?"
    a: "Generate a manifest, verify it against your current MCP server binaries and scripts, sign it with the intended trust key, then run the wrapper in warn or verification-only mode before requiring signatures."
  - q: "What verifier should auditors use?"
    a: "Use the standalone pipelock-verifier CLI for Audit Packet directories, single receipts, and receipt chains. The Go, TypeScript, and Rust verifier implementations are first-party references for embedding verification in pipelines."
---

Pipelock `v2.5.0` is an additive upgrade for most `v2.4.x` operators, but it changes two operational assumptions: inbound federation is stricter by default, and host containment now has a full lifecycle CLI that can enforce the agent/proxy separation on Linux.

Upgrade the binary first. Then enable the new controls one at a time.

## Upgrade the binary

```bash
# Homebrew
brew upgrade luckyPipewrench/tap/pipelock

# or container
docker pull ghcr.io/luckypipewrench/pipelock:2.5.0
```

For direct binary installs, download the `v2.5.0` artifact from the GitHub release and replace the existing binary.

Run:

```bash
pipelock version
pipelock check --config pipelock.yaml
```

## Run the deployment doctor

`pipelock doctor` separates configured from enforceable. Run it before claiming the new release is active in production:

```bash
pipelock doctor --config pipelock.yaml
```

Review failures for:

- proxy reachability
- TLS interception
- request-body scanning
- Browser Shield
- MCP wrapping
- MCP binary integrity
- tool provenance
- file sentry
- Sentry
- containment
- deployment-boundary signals

If a control is configured but not enforceable in the current process or host topology, fix the topology before relying on the control.

## Review inbound federation

v2.5 requires SPIFFE-format actors for inbound verified mediation envelopes by default.

If your peers already emit SPIFFE actors, validate each trust-list entry:

```yaml
mediation_envelope:
  actor_format: spiffe
  verify_inbound:
    enabled: true
    trust_list:
      - key_id: partner-pipelock
        public_key: "64-char-hex-encoded-ed25519-public-key"
        trust_domains:
          - partner.example
```

If a peer still emits legacy free-form actors, keep that peer on the explicit legacy migration path until it is updated. Do not leave permissive actor handling implicit.

Use the operator trust CLI to inspect local state:

```bash
pipelock envelope trust list
pipelock envelope trust verify --config pipelock.yaml
```

## Treat tombstones as enforced state

In v2.4, learn-and-lock tombstones were evidence markers operators had to respect during promotion. In v2.5, tombstones are enforced at activation and accepted-load time.

Before upgrade:

1. Check whether any contract hashes were tombstoned with `pipelock learn forget`.
2. Confirm active manifests do not reference those hashes.
3. Remove stale accepted-load state from deployment images and config bundles.

After upgrade, a tombstoned contract hash cannot be re-promoted or resurrected through accepted-load.

## Stage host containment separately

Do not combine the binary upgrade and host containment cutover unless you have already tested the topology.

Recommended sequence:

```bash
pipelock contain install
pipelock contain verify
pipelock contain add-tool <name> --target <path>
pipelock contain grant-workspace <path>
```

Then run the agent as the contained user and confirm:

- the agent cannot reach the network except through Pipelock on loopback
- the proxy can read its state directory
- the agent cannot replace proxy state
- workspace ACLs grant only the intended project paths
- `pipelock contain verify` passes after reboot

Keep `pipelock contain rollback` documented in the host runbook before switching production launchers.

## Add MCP integrity manifests

Generate a manifest from the MCP servers you actually launch:

```bash
pipelock mcp integrity manifest generate --output mcp-integrity.json -- <server-command> [args...]
pipelock mcp integrity manifest verify --manifest mcp-integrity.json -- <server-command> [args...]
```

Then sign and verify the manifest:

```bash
pipelock mcp integrity manifest sign --manifest mcp-integrity.json --signer <name>
pipelock mcp integrity manifest verify-signature --manifest mcp-integrity.json --signer <name>
```

Roll this out in two steps:

1. Verify current binaries and scripts without changing launch behavior.
2. Require trusted manifest signatures once every expected server path is pinned.

## Update IDE and MCP wrappers

v2.5 adds installer coverage for more agent surfaces. Re-run setup for the agents you use so their MCP server launches route through Pipelock:

```bash
pipelock claude setup
pipelock cline install
pipelock opencode install
pipelock codex install
pipelock zed install
```

Then inspect the agent's MCP config and confirm the command now launches through `pipelock mcp proxy`.

## Verify Audit Packets

Use `pipelock-verifier` before wiring release evidence into a procurement or SIEM workflow:

```bash
pipelock-verifier chain evidence/evidence-proxy-0.jsonl --key <public-key-hex>
pipelock-verifier receipt path/to/single-receipt.json --key <public-key-hex>
pipelock-verifier audit-packet path/to/audit-packet-directory/
```

The verifier should run outside the agent process and outside the proxy process. That preserves the point of the artifact: a third party can verify signed evidence without trusting the component that generated it.

## Check scanner expectations

The v2.5.0 counts were:

- 48 DLP patterns
- 25 injection patterns
- 10 chain patterns
- 7 presets

v2.5 hardens specific scanner behavior inside those counts. Skill-poisoning text now covers memory-persistence directives, credential-solicitation phrasing, and covert-action directives when the skill content crosses a body-visible path.

If you tuned suppressions around educational prompt-injection examples or AWS pre-signed URLs, re-test those flows. v2.5 reduces those false positives with response-doc filtering and a SigV4 structural carve-out.

## See also

- [Pipelock v2.5.0 release notes](/blog/pipelock-v250-release/)
- [Mediation Envelope Signing](/learn/mediation-envelope-signing/)
- [Learn-and-Lock Agent Contracts](/learn/learn-and-lock/)
- [Skill Supply Chain Security](/learn/skill-supply-chain-security/)
- [What Did My Agent Do? Verifiable Receipt Demo](/learn/what-did-my-agent-do/)
- [Pipelock v2.4 upgrade guide](/learn/pipelock-v240-upgrade/)
