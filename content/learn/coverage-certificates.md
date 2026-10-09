---
title: "Coverage Certificates: Signed Proof of What Your Agent Firewall Mediated"
linkTitle: "Coverage Certificates"
seoTitle: "Coverage Certificates for AI Agent Evidence"
subtitle: "A receipt proves one decision. A coverage certificate is the signed statement above it: these sessions, this window, this agent, these exclusions, and nothing implied beyond that."
description: "Coverage certificates: signed, offline-verifiable attestations of the AI agent sessions Pipelock mediated over a bounded window, exclusions visible."
date: 2026-07-21
lastmod: 2026-07-21
learn_cat: evidence
level: intermediate
tags:
  - coverage
  - receipts
  - evidence
  - audit
  - signing
related:
  - verify-a-receipt
  - agent-action-receipts
  - operator-console
  - known-limitations
faq:
  - q: "What does a coverage certificate prove?"
    a: "It attests declared coverage: for a named agent and a bounded time window, these are the mediated sessions whose signed receipt chains stand behind the claim, with any exclusions listed. When generation is given a trusted receipt signer, each session's chain is verified against that signer set before the certificate is issued. It is a statement an auditor can check offline against the certificate signer's public key."
  - q: "What does a coverage certificate NOT prove?"
    a: "It never proves the absence of unmediated activity. A process that egressed around the proxy is invisible to the receipt record, so the certificate scopes itself to what was mediated and says so. Blocking direct egress around Pipelock is a deployment control (container networking, NetworkPolicy, or kernel-level containment), and the certificate does not claim it for you. This is deliberate: an attestation that quietly implied completeness would be worth less than one that states its boundary."
  - q: "How do I verify one, and what does it cost?"
    a: "Verification is free and offline: pipelock evidence verify-cert --cert agent-a-coverage.json --trusted-signer file=coverage-cert.pub,source=security-team. There is no server, no account, and no call home. Verification fails closed: without a trusted signer the command exits non-zero, and the structural-only mode must be requested explicitly with --allow-unpinned, so a forged certificate cannot pass by leaving the signer check out."
  - q: "Why can't a certificate over-count a named agent's traffic?"
    a: "A real session interleaves unattributed control receipts with agent-attributed ones. Generation tolerates unattributed receipts only for the default control actor; for a named agent, mixing in unattributed traffic fails closed rather than folding it into that agent's totals. An over-counting certificate would be a false coverage claim, so the generator refuses to produce one."
  - q: "What keys are involved?"
    a: "Two separate purposes. Receipt signing keys sign the per-decision evidence as it is recorded. A coverage-cert signing key, generated with pipelock signing key generate --purpose coverage-cert-signing --out /etc/pipelock/keys/coverage-cert.key, signs the certificate itself. Verifiers pin the certificate signer's public key, and can additionally demand that the underlying receipt chains were verified against a trusted receipt signer set at generation time."
---

Signed action receipts answer "what did the agent do, and can you prove this record is intact?" one decision at a time. The question procurement, auditors, and your own security team ask next is one level up: for this agent, over this month, what does the signed record actually cover?

A coverage certificate is Pipelock's answer. It is a signed, offline-verifiable attestation that declares which mediated sessions stand behind an agent's evidence for a bounded window, with exclusions visible rather than smoothed over. One artifact, checkable by anyone holding the signer's public key, that turns a directory of receipt chains into a scoped claim someone can rely on.

## The honest boundary comes first

The defining property of a coverage certificate is what it refuses to say. It attests declared coverage of mediated traffic. It does not certify that no unmediated activity occurred, because no signed record can prove a negative about traffic that never passed through the signer. The [known limitations](/learn/known-limitations/) page treats that boundary in depth; the certificate format is built around stating it instead of hiding it.

That restraint is what makes the artifact useful. An auditor reading one knows exactly which sessions and which window the mediator is willing to sign for, and what falls outside the claim. Anything broader would be marketing in a JSON file.

## Generating one

Generation reads a receipt directory, selects an agent and a window, and signs the result:

```bash
pipelock dashboard coverage-cert generate \
  --receipt-dir /var/lib/pipelock/evidence \
  --agent agent-a \
  --window-start 2026-07-01T00:00:00Z \
  --window-end 2026-07-12T00:00:00Z \
  --trusted-receipt-signer file=/etc/pipelock/keys/receipt-signing.pub,source=security-team \
  --signing-key /etc/pipelock/keys/coverage-cert.key \
  --out agent-a-coverage.json
```

With `--trusted-receipt-signer` supplied, every session's receipt chain is verified against that trusted signer set before the certificate is issued, and the output says so: `receipt chains: verified against trusted signer set`. Without it, generation falls back to self-consistency checks and labels the result `self-consistent only`, so the weaker basis is visible in the artifact rather than silent.

The signing key carries a declared purpose. `pipelock signing key generate --purpose coverage-cert-signing --out /etc/pipelock/keys/coverage-cert.key` emits key material scoped to certificate signing, separate from the receipt signing keys that sign per-decision evidence.

Generation also refuses a certificate that would over-claim. Normal sessions interleave unattributed control receipts with agent-attributed ones; that mixing is tolerated only for the default control actor. Ask for a certificate over a named agent and the unattributed traffic does not quietly pad its totals. The generator fails closed instead.

## Verifying one is free, offline, and fails closed

```bash
pipelock evidence verify-cert \
  --cert agent-a-coverage.json \
  --trusted-signer file=/etc/pipelock/keys/coverage-cert.pub,source=security-team
```

No server, no account, no network. The verifier separates structural validity (the certificate parses and is internally consistent) from signer trust (it was signed by a key you chose to pin), and it exits non-zero when no trusted signer is supplied. Checking structure alone requires the explicit `--allow-unpinned` opt-in. A relying party keying on the exit code cannot be fooled by a certificate that is merely well-formed.

Generation is part of the Pro operator surface; verification ships free, in the same spirit as [receipt verification](/learn/verify-a-receipt/). The party being asked to trust a coverage claim never needs a license to check it.

## Where it fits in the evidence stack

Receipts are the base layer: per-decision, signed, hash-chained. The [operator console](/learn/operator-console/) reads them and scores each session on separate axes rather than collapsing everything into one green checkmark. A coverage certificate sits on top as the portable artifact: the thing you attach to a vendor questionnaire response, hand an auditor, or archive per reporting period, so the answer to "what does your agent evidence cover?" is a signed file instead of a paragraph of assurances.

Receipts prove a decision. Chains prove sequence. Coverage certificates scope the record. Each layer states exactly what it can defend, which is the only kind of evidence worth signing.
