---
title: "Agent Egress Control: GitHub Action Setup"
linkTitle: "Agent Egress Control"
related:
  - verifiable-egress-control
  - action-receipt-spec
  - agent-action-receipts
seoTitle: "Agent Egress Control: Pipelock GitHub Action Setup"
subtitle: "Run an agent script through Pipelock with kernel-enforced network containment and a signed Audit Packet."
description: "Pipelock Agent Egress Control GitHub Action setup guide. Kernel-enforced containment, signed Audit Packets, pinning options, offline receipt verification."
date: 2026-05-10
lastmod: 2026-05-17
howto_steps:
  - name: Add the action to a workflow
    text: Reference luckyPipewrench/pipelock-agent-egress-action@v0.1.0 in a GitHub Actions workflow with the script-path, config, and audit-packet-dir inputs.
  - name: Provide the agent script
    text: Place the script at the path you passed to script-path. The action runs it inside a Linux network namespace with iptables enforcement.
  - name: Inspect the Audit Packet
    text: Read the signed receipt chain and verifier output that the action writes to audit-packet-dir, or upload it as a workflow artifact for a third party to verify.
  - name: Verify offline
    text: Run the published Python verifier against the receipt chain with the public key alone. No agent self-attestation required.
faq:
  - q: "How is this different from the Pipelock Scan action?"
    a: "Pipelock Scan is a static check on PR diffs for credential leaks and injection patterns. Agent Egress Control is a runtime container: it wraps an agent script in a Linux network namespace, routes mediated network traffic through Pipelock, and writes a signed Audit Packet. The two actions are intentionally separate products with different scope and SemVer cadence."
  - q: "Which runners are supported in v0?"
    a: "Linux (ubuntu-latest). macOS and Windows runners are out of scope for v0. The action does not silently degrade on them; the README discloses the boundary."
  - q: "What does a signed Audit Packet contain?"
    a: "A receipt chain (each receipt hash-linked to the previous), the verifier output, the policy hash, allowed and blocked decision counts, the scanner config snapshot, posture metadata, and a Markdown summary humans can read."
  - q: "Can I pin to a SHA?"
    a: "Yes. Full-length commit SHA is the recommended form for security-sensitive workflows because git only treats the full 40-character SHA as immutable. Tags are mutable; short SHAs are prefix identifiers, not release anchors. The signed-tag forms (@v0.1.0, @v0.1, @v0) all point to the same signed commit and rotate as patches and minor releases land."
  - q: "What does a verified Audit Packet not prove?"
    a: "It does not prove the runner was honest. If the runner image, kernel, or workflow harness is compromised before Pipelock initialises, the verifier can still return valid if the attacker can use the configured signing key or if the relying party accepts a runner-supplied key. Pin the signer key from a source outside the runner, run the verifier outside the runner, and treat the wrapped script as the sole secret-bearing step in the job. The audit-packet threat model has the full list."
  - q: "Does this contain sibling steps in my workflow?"
    a: "No. The v0 enforcement boundary is the script executed inside the action, not the rest of the caller workflow. Sibling steps and later steps run as normal GitHub Actions steps without Pipelock containment."
learn_cat: operator
level: intro
tags:
  - github-action
  - ci
  - audit-packet
  - egress-control
---
[Pipelock](/pipelock/) Agent Egress Control is the missing CI primitive for AI agents. The action runs an agent script inside a Linux network namespace, routes mediated network traffic through Pipelock at the boundary, scans for credential exfiltration, prompt injection, SSRF, and policy violations, then writes a signed Audit Packet a third party can verify offline.

This page is the operator-facing setup guide for v0.1.0. Full reference and design notes live in the [release notes](https://github.com/pipelab-org/pipelock-agent-egress-action/releases/tag/v0.1.0) and the [README](https://github.com/pipelab-org/pipelock-agent-egress-action#action-interface).

## Quick start

Add the action to a workflow file:

```yaml
- name: Pipelock Agent Egress Control
  uses: luckyPipewrench/pipelock-agent-egress-action@v0.1.0
  with:
    script-path: ./scripts/agent.sh
    config: .pipelock/ci.yaml
    audit-packet-dir: pipelock-audit-packet
```

The script at `./scripts/agent.sh` runs as a non-root `pipelock-agent` user with sudo denied and capabilities dropped. Pipelock listens on the loopback interface as a separate non-root `pipelock-host` user. iptables forces all egress through the listener.

After the run, the action writes the Audit Packet to `pipelock-audit-packet/`. Upload it as a workflow artifact, archive it, or hand it to a security reviewer.

## What is enforced in v0

On supported Linux runners (ubuntu-latest):

- HTTP and HTTPS egress routes through Pipelock at the kernel level.
- WebSocket destinations are contained at the kernel level. Frame-level scanning runs when the script uses Pipelock's `/ws?url=...` proxy path.
- Direct network, DNS, and raw TCP from the action script are blocked inside the namespace.
- The action script runs as non-root `pipelock-agent` with sudo denied and capabilities dropped.
- The Pipelock listener runs as non-root `pipelock-host` with sudo denied and capabilities dropped.
- The receipt chain is verified at end-of-run; the Audit Packet is written locally.

## What is out of scope in v0

Disclosed in the release notes rather than papered over:

- Nested Docker workloads launched from the action script.
- GitHub service containers.
- Sibling steps in the caller workflow that run outside the action boundary.
- macOS and Windows runners.
- SSH egress (planned for v0.2).
- MCP stdio (no network surface to enforce on).

If a path is not under the Pipelock control point, the action says so. No silent fail.

## What this action does not prove

A verified Audit Packet is evidence about traffic that crossed the Pipelock control point. It is not evidence about the runner that produced it. A relying party should pin the following before treating a `valid` verdict as provenance:

- Signer key pinned from a source outside the run environment. A key fetched from the same runner Pipelock just ran on is not pinned in the sense this page uses. Hand the public key over before the run or fetch it from a known trust anchor.
- Verifier run outside the run environment. The Go, Rust, TypeScript, and Python verifiers all run offline. Running the verifier inside the same runner that produced the packet reduces the verdict to "the runner's verifier reported a verdict."
- Pipelock binary pinned by checksum. This action does not download `latest`. Install a pinned binary in an earlier workflow step. A compromised runner that swaps the binary can still produce receipts that verify if it can use the configured signing key, so checksum pinning and signer-key pinning have to travel together.
- This action pinned by full-length commit SHA. Tags are mutable. Short SHAs are prefix identifiers, not immutable release anchors. The "Pinning options" block below uses the full 40-character SHA for the same reason.
- Workflow scoped so the wrapped agent script is the sole secret-bearing step in the job. Sibling steps and steps that run before this action are outside the boundary. Secrets passed to other steps via `env:` or surfaced via `outputs:` are not in the receipt chain.

A missing receipt is not a proof of absence. The packet does not enumerate traffic Pipelock should have seen but didn't. Complement with runner-level network telemetry if the threat model needs negative-space evidence.

The canonical text on what a verified packet proves and does not prove lives at [Audit Packet threat model](/learn/audit-packet-threat-model/).

## Audit Packet structure

An Audit Packet is the evidence bundle from one agent run. It includes:

- A receipt chain. Each receipt is hash-linked to the previous, signed by Pipelock at the network boundary (not the agent process). Tampering with any receipt breaks every receipt that follows.
- Verifier output. The result of running the bundled verifier against the chain.
- Policy hash. The canonical hash of the Pipelock config that produced the decisions.
- Decision counts. Allowed and blocked totals per category.
- Scanner config snapshot. Which scanners were active, with their settings.
- Posture metadata. Pipelock version, signing key fingerprint, run identifiers.
- Markdown summary. A human-readable digest of the run.

The Audit Packet does not depend on the agent's transcript. It records what the network boundary saw, signed from outside the agent trust boundary.

## Pinning options

```yaml
# Full-length commit SHA (recommended for security-sensitive workflows)
uses: luckyPipewrench/pipelock-agent-egress-action@8f1894db09ec98d0bcbc46d0cc1cedffe5e5b504 # v0.1.0

# Precise tag (cryptographically signed, but tags are mutable in git)
uses: luckyPipewrench/pipelock-agent-egress-action@v0.1.0

# Floating-minor (auto-pulls v0.1.x patches)
uses: luckyPipewrench/pipelock-agent-egress-action@v0.1

# Floating-major (auto-pulls v0.x features, breaks at v1.0.0)
uses: luckyPipewrench/pipelock-agent-egress-action@v0
```

All four forms currently point to the same v0.1.0 commit. Full-length commit SHA is the only form git treats as immutable. Short SHAs are prefix identifiers and tags can be repointed; for an evidence-bearing action, use the full SHA and update by hand when a new release ships.

## Verifying receipts offline

Pin the Pipelock signer key from a known source (your Pipelock deployment or a published trust anchor) before treating the verifier output as evidence. The verifier can run without a pinned key and confirm a receipt is internally consistent, but that proves self-consistency, not provenance.

The reference verifier is the [Pipelock Python verifier](https://github.com/pipelab-org/pipelock-verify-python). It accepts a receipt chain and a public key and returns a structured decision. Run it offline; no network access required.

## See also

- [Verifiable Egress Control](/learn/verifiable-egress-control/) for the umbrella category and the property pair (binary-enforced mediation plus signed evidence) that this Action implements.
- [Agent Action Receipts](/learn/agent-action-receipts/) for the receipt primitive the Action bundles into Audit Packets.
- [Audit Packet threat model](/learn/audit-packet-threat-model/) for the canonical statement of what a verified packet proves, what it does not prove, and the trust assumptions a relying party should pin.
- [Pipelock Action Receipt Format](/learn/action-receipt-spec/) for the on-wire receipt structure.
- [Agent Egress Bench](https://github.com/pipelab-org/agent-egress-bench) for the public adversarial corpus the scanner is tested against.
- [Pipelock posture verify](/learn/pipelock-posture-verify/) for the related signed-capsule and policy-gate flow used by other CI surfaces.
- [Why Pipelock Is an Egress Agent Firewall](/learn/egress-vs-inbound-agent-firewall/) for why egress is the boundary that matters for agents, and why inbound filtering does not hold up.
- [The Pipelock Operator Console](/learn/operator-console/) for the read-only console over the signed evidence, with a free single-session evidence view.
