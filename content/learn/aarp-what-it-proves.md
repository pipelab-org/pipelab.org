---
title: "What an AARP Receipt Proves, and What It Does Not"
linkTitle: "AARP: Proves / Does Not"
related:
  - aarp-spec
  - aarp-claims-dictionary
  - audit-packet-threat-model
  - action-receipt-spec
seoTitle: "What an AARP Receipt Proves and Does Not Prove"
subtitle: "The honest trust boundary of an AARP appraisal: what verifies, what stays a claim, and the assumptions a relying party must pin."
description: "What a verified AARP receipt proves and does not prove. Binary-enforced versus deployment-claimed, and the trust assumptions a relying party must pin."
date: 2026-06-03
lastmod: 2026-06-03
learn_cat: evidence
level: ref
tags:
  - receipts
  - assurance
  - threat-model
  - spiffe
---

[AARP](/learn/aarp-spec/) is the assurance profile over a [Pipelock action
receipt](/learn/action-receipt-spec/). A verifier appraises the envelope and
reports a claim-set grouped by axis. This page is the blunt version: what a
verified appraisal proves, what it leaves as a claim, and the assumptions a
relying party should pin before treating any claim as fact.

The honesty is the point. AARP refuses to collapse different kinds of proof into
a single "trusted" score, because a relying party that reads more into a receipt
than it proves is the failure this profile exists to prevent.

## What a verified AARP appraisal proves

When `assertion_signed` is true, at least one signature over the canonical
assertion verified under a key the verifier had pinned. From that point the
appraisal can confirm, each independently:

- **Integrity of the appraised record.** The receipt this envelope points at is
  identified by digest, and the assertion about it was signed and not altered
  after signing.
- **Mediator identity, when pinned.** `mediator_key_pinned` confirms a verifying
  signature's key is bound by a verifier-side trust entry to the asserted
  mediator identity (and role, and trust domain, when the entry sets them). The
  signer is who the assertion says it is, against trust the verifier controls.
- **Verified workload identity, when an X.509-SVID binding is present and
  verifies.** `workload_identity_verified`, `x509_svid_bound`, and
  `svid_valid_at_action_time` confirm a receipt-bound SVID proof-of-possession
  validated offline, at the action time, against a pinned trust bundle. The
  signer holds the private key for a credential issued by the configured trust
  domain, and that credential was valid when the action occurred.
- **Backdating detection within an issuer stream, when a chain link is present.**
  `chain_link_present` confirms a signed position in an issuer's hash-linked
  stream. Over a full stream, insertion, reordering, and backdating break the
  signed linkage and are caught.

The appraisal verifies **offline**. No Pipelock, no server, no transparency log,
and no account are needed: a verifier, a pinned key, and (for attestation) a
pinned trust bundle are enough. That covers the appraisal itself, the assertion
signature, the claims, and the digests it pins. It checks the receipt by digest,
not by re-reading its body, so verifying the receipt's own contents (including any
redacted fields) follows the [receipt format's](/learn/action-receipt-spec/) own
rules rather than anything AARP asserts here.

## What a verified AARP appraisal does not prove

These five sit outside the appraisal's scope and are reported, verbatim, in the
fixed `does_not_assert` list on every result. Each is real, and each is where a
hostile reader will press.

### 1. That the agent is safe

`action_safety` and `efficacy` are never asserted. A receipt proves an action was
observed and adjudicated. It says nothing about whether the action was wise,
whether the policy that allowed it was the right policy, or whether the outcome
was good. A signed `allow` is a signed `allow`, not an endorsement.

### 2. That all egress was mediated

`complete_mediation` and `absence_of_bypass` are never asserted. Whether every
byte the agent sent crossed the mediator is a property of the deployment, not a
fact in the receipt. v0.1 has no local evidence that proves the absence of an
out-of-band path, so a producer's `complete_mediation: true` is reported
claim-only and the deployment axis stays empty. Treat complete mediation as true
only when something outside the receipt enforces it (network policy, a kernel
egress control, an admission gate) and you have verified that enforcement
yourself.

### 3. That the decision was correct

`policy_correctness` is never asserted. The underlying receipt records the policy
hash that was in force, but AARP does not judge whether that policy was the right
one or whether the mediator applied it without a bug. The authority axis carries
no claim in v0.1. A reviewer can confirm the run executed under a declared
configuration; whether that configuration was sound is the reviewer's call.

### 4. Anything a claim-only field asserts

A producer can put any string in `claimed`. The verifier confirms a claim only
when it independently verified the underlying proof. Claim-only fields like
`complete_mediation`, a workload-identity claim backed by JWT-SVID (a replayable
bearer token, never counted), and a transparency-inclusion claim (no log is
operated in v0.1) stay in `claimed_unverified`. Read `verified_claims`, not
`claimed`. A signature is a separate matter from a claim: one under an
unimplemented suite, such as the typed-but-unbuilt `ml-dsa-65` post-quantum slot,
is reported as `unimplemented` in the per-signature `signatures` list, and if it
is the only signature the assertion is not signed at all.

### 5. Runtime facts the static record cannot hold

The receipt is a point-in-time record. It does not prove the credential was not
revoked after the action unless the verifier holds pinned revocation material for
that time, it does not prove the binary that signed it was the binary you expect,
and it does not prove the signing key was not exfiltrated from a compromised host.
Those belong to the deployment and the key-custody story around the signer.

## Binary-enforced versus deployment-claimed

The line that matters most: a few things the AARP binary enforces, and the rest
the deployment claims.

| Property | Enforcement |
|----------|-------------|
| Assertion signature is valid and unaltered | Binary-enforced |
| Mediator key is pinned to an authority namespace | Binary-enforced |
| X.509-SVID identity verified offline at action time | Binary-enforced (Go reference verifier) |
| Backdating detection within an issuer stream | Binary-enforced |
| Complete mediation (all egress crossed the mediator) | Deployment-claimed |
| Agent safety, policy correctness, action efficacy | Not in scope |
| Signer binary integrity, key custody, revocation freshness | Deployment / operator |

A claim in the left column with "Binary-enforced" on the right is a fact the
verifier checked. Everything else is an assumption you carry, and the profile
states it plainly rather than letting a green check imply more than it earned.

## What a relying party must pin

Before treating any AARP claim as provenance, pin the following from a source
outside the producer:

- **The signer key.** A signature against an unpinned key is reported
  `unknown_key` and never verifies. Pin the mediator's public key from a custody
  source you trust, not from the envelope.
- **The trust entry.** For a `mediated` claim, pin the binding from key id to
  mediator identity (and role, and trust domain). A bare key is not enough.
- **The SVID trust bundle and action time.** For verified workload identity, pin
  the trust-bundle history for the trust domain and validate at the real action
  time. Bundle history is append-only; never auto-accept a new root.
- **The boundary.** AARP proves things about the slice the mediator observed. It
  does not enumerate traffic that bypassed the mediator. A missing receipt is not
  a proof of absence. If your threat model needs negative-space evidence, pair the
  receipt with runner-level or network telemetry.

Read the full wire format and verifier behavior in the [AARP v0.1
spec](/learn/aarp-spec/). For the receipt format AARP sits on top of, see the
[Action Receipt spec](/learn/action-receipt-spec/) and the [Audit Packet threat
model](/learn/audit-packet-threat-model/). For the stable verifier vocabulary,
see the [AARP claims dictionary](/learn/aarp-claims-dictionary/). For the doctrine
behind what these receipts do and do not claim, see [what Pipelock claims and does
not](/learn/non-bypass-doctrine/) and the [known limitations
register](/learn/known-limitations/).

Key custody is the question to ask of any signed agent evidence. The
[mediator receipts post](/blog/independent-attestation-mediator-receipts/) walks
through why the party holding the signing key decides whether a receipt is
evidence or a self-report.
