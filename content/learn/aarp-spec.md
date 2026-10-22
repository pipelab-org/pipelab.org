---
title: "AARP v0.1: The Agent Action Receipt Profile (Spec)"
linkTitle: "AARP Spec"
related:
  - action-receipt-spec
  - aarp-claims-dictionary
  - aarp-what-it-proves
  - agent-action-receipts
  - verify-a-receipt
seoTitle: "AARP v0.1 Spec: Agent Action Receipt Profile"
subtitle: "A signed assurance profile that appraises a receipt and reports what a verifier could confirm versus what the producer only claimed."
description: "AARP v0.1 spec: a signed assurance profile over Pipelock receipts. Claim-set by axis, JCS canonicalization, parallel signatures, X.509-SVID identity."
date: 2026-06-03
lastmod: 2026-06-03
learn_cat: evidence
level: ref
tags:
  - receipts
  - assurance
  - ed25519
  - spiffe
  - spec
---

When a signing key is configured, [Pipelock](/pipelock/) signs an [action
receipt](/learn/action-receipt-spec/) for every agent action it mediates. A valid
receipt signature proves the bytes were signed by a key and not altered. It
proves nothing about whether the decision was correct, whether something
bypassed the mediator, or whether the receipt is the whole story. AARP is the
profile that makes that distinction machine-readable.

AARP is the **Agent Action Receipt Profile**. It is not a new receipt format. The
shipped [ActionReceipt v1](/learn/action-receipt-spec/) and EvidenceReceipt v2
stay byte-for-byte frozen. AARP appraises one of them as an immutable input,
referenced by digest, and emits a structured result that lists exactly what it
could cryptographically confirm and what it could not. It never rewrites a
receipt, and it never emits a "trusted" or "safe" verdict.

This page is an implementation spec for an experimental v0.x profile. It
describes what the reference verifier does today. The reference implementation is
[`internal/aarp`](https://github.com/pipelab-org/pipelock/tree/main/internal/aarp)
in the Pipelock repository, exercised by the standalone
[`pipelock-verifier aarp`](https://github.com/pipelab-org/pipelock/tree/main/cmd/pipelock-verifier)
command. The normative envelope spec lives in the repository at
[`docs/specs/aarp-v0.1-envelope.md`](https://github.com/pipelab-org/pipelock/blob/main/docs/specs/aarp-v0.1-envelope.md);
this page is the public restatement. When the page, the in-repo spec, and the
code ever disagree, the code wins.

For the blunt version of the same content, the trust boundary stated as plainly
as it can be, read [What an AARP receipt proves and does not prove](/learn/aarp-what-it-proves/).
For the stable public names behind the verifier output, read the [AARP claims
dictionary](/learn/aarp-claims-dictionary/).

**Requirements notation.** The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL
NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to
be interpreted as described in
[RFC 2119](https://www.rfc-editor.org/info/rfc2119/). They apply to a conforming
AARP verifier and to a producer emitting an AARP assurance envelope.

## Validity is not assurance

A linear "trust level 1 to 5" lies by construction. Transparency proves log
inclusion, not runtime correctness. Attestation proves workload identity, not
the absence of a bypass. A self-signed record that claims to be transparent must
never sort above a key-pinned mediated one, because they rest on different kinds
of proof.

So AARP reports a **claim-set grouped by axis** instead of a score. Each claim is
something a verifier confirmed independently, filed under the axis of proof it
rests on. A relying party reads the axes and applies its own policy. The profile
hands it facts, not a grade.

## The assurance envelope

An AARP envelope sits alongside a frozen receipt and carries its own signatures.
It never touches the receipt bytes; it points at them by digest.

```json
{
  "profile": "aarp/v0.1",
  "subject": {
    "action_record_sha256": "<64-hex SHA-256 of the canonical receipt action record>",
    "receipt_envelope_sha256": "<64-hex SHA-256 of the canonical, unchanged receipt>",
    "receipt_signer_key": "<64-hex Ed25519 public key that signed the receipt>",
    "receipt_type": "action_receipt_v1"
  },
  "assertion": {
    "claimed": ["mediated", "workload_identity_verified"],
    "mediator_id": "pipelock-prod-1",
    "trust_domain": "example.org",
    "complete_mediation": false,
    "evidence_refs": ["spiffe_svid"],
    "issued_at": "2026-06-03T12:00:00Z"
  },
  "signatures": [
    {
      "protected": {
        "profile": "aarp/v0.1",
        "canon": "jcs-rfc8785-nfc",
        "alg": "ed25519",
        "key_type": "ed25519",
        "key_id": "mediator-key-1",
        "signer_role": "mediator"
      },
      "sig": "ed25519:<base64 signature over the canonical signing input>"
    }
  ],
  "crit_ext": []
}
```

The fields, exactly as the code defines them:

* **`profile`** is `aarp/v0.1`. A verifier MUST NOT appraise an envelope whose
  profile it does not implement.
* **`subject`** names the receipt being appraised by digest: the SHA-256 of the
  canonical receipt action record, the SHA-256 of the canonical receipt envelope,
  the receipt's Ed25519 signer key, and **`receipt_type`**. The receipt type is
  the "hash of what" disambiguation: `action_receipt_v1` (the v1 record, signed
  by Go struct-order JSON then SHA-256) or `evidence_receipt_v2` (the v2 evidence
  receipt, signed over its JCS preimage). Every digest field is a typed string,
  not a raw number.
* **`assertion`** is the producer's claim set. `claimed` lists the claim names the
  producer asserts. `mediator_id` is the producer's self-declared mediator
  identity, trusted only insofar as it matches a verifier-side trust entry.
  `trust_domain` is the SPIFFE trust domain (required when an SVID binding is
  present). `complete_mediation` is a claim-only boolean that v0.1 never verifies.
  `evidence_refs` names attached evidence objects. `issued_at` is an RFC 3339
  timestamp with nanosecond precision.
* **`signatures`** holds one or more parallel signatures over the same payload,
  described below.
* **`crit_ext`** is the envelope-level critical-extension list. A producer MUST
  serialize it as `[]` when empty because it is part of the signed bytes
  and a nil and an explicit empty array would canonicalize differently across
  languages. v0.1 defines no critical extensions, so a verifier MUST reject the
  envelope if any name appears here.
* **`chain`** (OPTIONAL) places the envelope in an issuer's hash-linked stream.
  See [Backdating detection](#backdating-detection-the-rung-1-chain).
* **`ext`** (OPTIONAL) carries non-critical extensions. A verifier MUST ignore
  unrecognized entries safely. They are not part of the signed bytes.

### What is signed

Every signature binds the same canonical payload: the profile, subject,
assertion, the critical-extension list, and the chain link when present. The
critical-extension list is signed so a man in the middle cannot strip a flag the
producer set. The signatures array and the non-critical `ext` are deliberately
outside the signed payload, so appending a junk signature cannot deny a
legitimately signed envelope.

## Canonicalization and number safety

The signed bytes use RFC 8785 JSON Canonicalization with NFC string
normalization. The canonicalization identifier is `jcs-rfc8785-nfc`, and it is
carried inside every signature's protected header, so a verifier can never be
tricked into matching bytes produced under a different canonicalization.

JSON numbers only interoperate across languages inside the I-JSON safe-integer
range. Outside it, a JavaScript verifier silently rounds to a float, the
canonical bytes change, and the signature breaks. AARP refuses that failure mode
at the door: raw JSON numbers MUST fall inside the safe range, and every
identity, digest, counter, timestamp, and amount field MUST be a typed string
with an explicit grammar. Digests MUST be lowercase 64-hex. Counters MUST be
unsigned decimal with no leading zeros. Timestamps MUST be RFC 3339 nanosecond
strings with a mandatory zone. A verifier MUST reject a float, an exponent, a
negative zero, or an out-of-range integer anywhere in the envelope before
decoding.

The envelope decoder MUST reject duplicate keys at any nesting depth and unknown
fields in AARP-controlled objects. A producer MUST NOT rely on duplicate keys or
unknown fields to carry meaning, and `{"verdict":"allow","verdict":"block"}`
MUST NOT mean different things to different language parsers.

## Parallel signatures and the protected suite

AARP signatures are **parallel**, not chained. Each one independently binds the
same shared payload digest under its own suite. Adding a signer adds a signature
and never re-signs another signer's output, so a multi-signature envelope (a
mediator plus a co-signing issuer, for example) is structurally first-class.

Each signature carries a **protected header** that is itself covered by that
signature's bytes:

| Field | Meaning |
|-------|---------|
| `profile` | `aarp/v0.1` |
| `canon` | `jcs-rfc8785-nfc` |
| `alg` | the signature algorithm |
| `key_type` | the key type the algorithm requires |
| `key_id` | the signer's key identifier |
| `signer_role` | `mediator`, `issuer`, or `countersig` |
| `crit` | optional per-signature critical extensions |

Binding the suite into the signed bytes is authenticated agility: the choice of
algorithm and canonicalization lives inside the signature, never in an
unprotected sibling label. The signing input is the canonical form of an object
carrying the domain-separation context `pipelock-aarp-v0.1/assurance-assertion`,
the payload digest, and the protected header. The context is a signed field, so a
signature made for one purpose can never be replayed as evidence for another.

### Signature suites

| Algorithm | Status |
|-----------|--------|
| `ed25519` | Ed25519 PureEdDSA. Default, and the only implemented suite. |
| `ml-dsa-65` | FIPS 204 ML-DSA-65. A recognized, typed post-quantum slot whose signer and verifier are not built. |

The post-quantum slot is real on the wire so a hybrid or PQ envelope is
structurally first-class today, but signing or verifying an `ml-dsa-65` signature
fails closed: a verifier MUST report it unverified and MUST NOT downgrade it to
verification under a different algorithm. There is no fallback. An unrecognized
algorithm, an unimplemented one, an untrusted key, or a signature that does not
verify MUST all leave that signature unverified without rejecting the envelope.
One bad parallel signature MUST NOT mask a good one, and a good one MUST NOT be
denied by an appended bad one.

## The appraisal result

The verifier MUST emit a claim-set grouped by axis, plus a fixed list of
properties it never asserts. The result MUST NOT carry a `trusted` or `safe`
field.

```json
{
  "profile": "aarp/v0.1",
  "assertion_signed": true,
  "signatures": [
    {"key_id": "mediator-key-1", "alg": "ed25519", "signer_role": "mediator", "status": "verified"}
  ],
  "assurance_claimed": ["mediated", "workload_identity_verified"],
  "verified_claims": ["assertion_signature_valid", "mediator_key_pinned"],
  "claimed_unverified": ["workload_identity_verified"],
  "axes": {
    "identity": ["mediator_key_pinned"],
    "integrity": ["assertion_signature_valid"]
  },
  "does_not_assert": ["efficacy", "absence_of_bypass", "complete_mediation", "policy_correctness", "action_safety"],
  "warnings": []
}
```

* **`assertion_signed`** is the single cryptographic gate. It is true only when at
  least one parallel signature verified under a trusted key. Without it, every
  producer claim is reported as untrusted input rather than a producer-authored
  claim.
* **`signatures`** reports a per-signature status: `verified`, `failed`,
  `unknown_key`, `unimplemented`, `unknown_suite`, or `malformed`. Only
  `verified` counts toward a claim.
* **`assurance_claimed`** echoes the producer's claim list verbatim. It is input,
  not result.
* **`verified_claims`** lists the claims the verifier confirmed independently.
* **`claimed_unverified`** lists the producer claims the verifier did not confirm,
  whether they are claim-only by design, unknown, or simply unmet.
* **`axes`** groups the verified claims by the kind of proof they rest on.
* **`does_not_assert`** is the fixed list a relying party can never read past:
  `efficacy`, `absence_of_bypass`, `complete_mediation`, `policy_correctness`,
  `action_safety`. It is reported verbatim on every appraisal.
* **`warnings`** carries human-readable notes (an unsigned assertion, an unknown
  claim reported claim-only, an SVID that did not verify).

The verifier MUST NOT bake in a global threshold. A relying party passes its own
claim policy and reads the result. Exit codes: `0` the envelope was appraised;
`1` the envelope is fatal to appraise at all; `2` an I/O or trust-file error;
`64` a usage error. Fatal means a schema violation, a mismatch of the
envelope-level `profile`, or an unknown envelope-level critical extension. A
per-signature suite problem (a signature's own `profile`, `canon`, or critical
extension that the verifier does not recognize) MUST be reported as
`unknown_suite` for that signature and MUST NOT reject the envelope, so an
appended bad signature cannot deny a verifiable one.

## The axes and the claims

Six axes group the proofs. The claim names below are the exact strings the
verifier emits.

| Axis | Verified claims it can hold |
|------|-----------------------------|
| `identity` | `mediator_key_pinned`, `workload_identity_verified`, `x509_svid_bound` |
| `integrity` | `assertion_signature_valid`, `chain_link_present` |
| `freshness` | `svid_valid_at_action_time` |
| `authority` | (reserved) |
| `transparency` | (reserved in v0.1) |
| `deployment` | (empty in v0.1) |

It helps to read the assurance story as a progression of what becomes verifiable
as more evidence is attached, but the verifier emits claims, never a single
level:

1. **Core.** A signed canonical record. `assertion_signature_valid` lands on the
   integrity axis once a trusted signature verifies.
2. **Mediated.** The producer claims `mediated`. The verifier confirms it as
   `mediator_key_pinned` only when a verifying signature's key is bound by a
   verifier-side trust entry to the asserted mediator identity (and, when the
   entry sets them, the signer role and trust domain). An attacker self-signing
   with `signer_role: mediator` and no matching trust entry gets `mediated`
   reported claim-only.
3. **Complete mediation.** A claim that all egress routed through the mediator.
   v0.1 never verifies this. There is no local evidence that proves the absence
   of an out-of-band path, so `complete_mediation` stays in `does_not_assert` and
   the `deployment` axis stays empty. It is a deployment property, not a
   cryptographic fact.
4. **Attested.** A verified X.509-SVID workload identity, below. This adds
   `workload_identity_verified` and `x509_svid_bound` to identity and
   `svid_valid_at_action_time` to freshness.
5. **Transparency.** External inclusion proof against a public log. v0.1 reports
   transparency claims claim-only and Pipelock operates no log. The integrity
   axis does carry `chain_link_present` when the envelope sits in an issuer
   stream, which is backdating detection within that stream, not external
   transparency.

## Verified workload identity (X.509-SVID)

The strongest identity claim AARP makes is a verified X.509-SVID binding. Only
X.509-SVID counts. JWT-SVID is a bearer token anyone holding it can replay, so it
is claim-only in this profile.

The SVID's leaf private key signs a binding payload that ties the credential to
this exact receipt and assertion:

```json
{
  "context": "pipelock-aarp-v0.1/svid-receipt-binding",
  "profile": "aarp/v0.1",
  "action_record_sha256": "<from the subject>",
  "receipt_envelope_sha256": "<from the subject>",
  "assurance_assertion_sha256": "<digest of the signed AARP payload>",
  "receipt_signer_key": "<from the subject>",
  "mediator_id": "pipelock-prod-1",
  "spiffe_id": "spiffe://example.org/mediators/pipelock-prod",
  "issued_at": "2026-06-03T12:00:00Z",
  "nonce": "<at least 128 bits, base64url>"
}
```

The evidence object (the leaf certificate DER, any intermediates, the SPIFFE ID,
the nonce, and this binding) rides alongside the envelope as a sidecar. It does
not need to be inside the signed envelope, because the binding signature commits
to `assurance_assertion_sha256`, the digest of the signed AARP payload. The
binding is the cryptographic tie.

For the binding to verify, all of the following MUST hold. On any failure, the
verifier MUST NOT add a workload-identity claim, and MUST NOT remove an integrity
claim already verified from the core signature:

* The evidence type is `x509`.
* The SVID chain MUST validate **offline** against an operator-pinned trust
  bundle, with no network fetch.
* The SVID MUST validate **at the action time**, not at "now". A short-lived
  credential that was valid when the action occurred still validates for that
  action, checked against pinned bundle history that handles trust-domain
  rotation and rejects a forked or stale bundle.
* The assertion's `trust_domain` MUST match the trust domain the SVID validated
  against. A valid SVID from one domain MUST NOT back an assertion claiming
  another.
* The claimed SPIFFE ID MUST equal the SVID's URI SAN, and that SPIFFE ID MUST
  be permitted by the verifier's allowed set.
* The nonce MUST be at least 128 bits, defeating replay across actions.
* The binding's `issued_at` MUST fall inside the leaf's validity window.
* The proof-of-possession signature MUST verify under the leaf key. The leaf key
  type drives the algorithm: ECDSA P-256 with SHA-256, or Ed25519. A declared
  algorithm that disagrees with the leaf key type, or a P-384 leaf under a name
  that promises P-256, MUST fail closed.

Revocation is not implied unless the verifier holds pinned revocation material
for the action time. Absent that, the freshness model is "a valid short-lived
SVID at the action time, validated against pinned bundle history."

The SVID substrate is built on the [SPIFFE](https://spiffe.io/) Go library and
answers one question, fail-closed: is this X.509-SVID a genuine credential from a
configured trust domain, valid at a given time, chaining to a bundle we pinned?
Verified SVID attestation is implemented in the Go reference verifier. The
other-language ports below appraise the envelope but do not yet verify SVID
bindings, so they never emit the three workload-identity claims.

## Backdating detection (the Rung-1 chain)

An envelope MAY carry a `chain` link placing it in an issuer's append-only,
hash-linked stream:

```json
"chain": {
  "issuer_id": "pipelock-prod-1",
  "seq": "42",
  "prior_hash": "<64-hex SHA-256 of the previous link's payload digest>"
}
```

The link is part of the signed payload, so `seq` and `prior_hash` cannot be
altered after signing. The first link in a stream MUST carry sequence `0` and a
prior hash of 64 zeros. Verifying a full stream checks that every envelope
carries a link, all links share one issuer, the sequence MUST increment by
exactly one, and each link's prior hash MUST equal the previous envelope's
payload digest. A verifier MAY also check a contiguous segment that starts
mid-stream; the same issuer, increment, and prior-hash checks apply inside that
segment. Inserting, reordering, or backdating a receipt within the checked stream
or segment breaks the signed linkage and is detected.

This is issuer-local backdating detection, not an external transparency log. A
single envelope's appraisal reports `chain_link_present`: the link's position is
authenticated, but stream continuity is a separate check over the whole stream.
The profile names this Rung 1. A trusted external timestamp (Rung 2) and external
log inclusion are deferred.

## Trust model

* **Mediated binds to an authority namespace, never a bare key.** A verified
  `mediated` claim requires the verifying signature's key to match a trust entry
  that pins the mediator identity, and optionally the signer role and trust
  domain. Accepting a signer alone, without the namespace it is authorized to
  assert, is the bug class this rule closes.
* **Trust is pinned, never fetched.** The verifier MUST load operator-controlled
  trusted keys and trust entries from a local file. A signature whose key id is
  absent MUST be reported `unknown_key` and MUST NOT verify. Trust-bundle history
  MUST be pinned and append-only; validation MUST be read-only and MUST NOT
  auto-accept a new root.

## Conformance and ports

The reference implementation is Go ([`internal/aarp`](https://github.com/pipelab-org/pipelock/tree/main/internal/aarp)).
Independent verifier ports in TypeScript, Rust, and Python appraise the AARP
envelope: the parallel signatures, JCS canonicalization, number safety, the
protected-suite binding with fail-closed-on-unknown-suite, the claim-set-by-axis
output, and the Rung-1 chain. Verified X.509-SVID attestation is in the Go
reference today; the ports do not yet implement the SVID binding, so they cannot
add the workload-identity claims.

A hostile conformance corpus drives all of this. It covers valid envelopes,
forged and replayed signatures, downgrade attempts, untrusted keys, role
escalation, post-signing claim injection, parser-differential traps (unsafe
numbers, floats, negative zero, duplicate keys, trailing tokens, unknown fields),
broken chains (reordered, mixed-issuer, backdated), and the SVID attacks (replay
across actions, expiry, not-yet-valid, wrong key, stale or forked bundle,
trust-domain confusion, SPIFFE-ID substitution, curve confusion, short nonce,
JWT-treated-as-verified). For appraisable fixtures, every verifier MUST produce
byte-identical comparable output; for fatal fixtures, every verifier MUST reject.
The envelope, chain, and parser fixtures run across all four implementations
today. The SVID attestation fixtures are covered by the Go reference conformance
now and join the four-language gate once the TypeScript, Rust, and Python ports
implement the SVID binding. The corpus is the authority for cross-language
agreement, and a divergence is the bug it exists to catch.

The verifiers are in the Pipelock repository. They are not yet published to npm,
crates.io, or PyPI as AARP packages.

## Governance and naming

AARP is the Agent Action Receipt Profile. Pipelock maintains v0.x as an
experimental open implementation profile; governance can move once independent
implementers exist. There is no foundation, no self-run transparency log, and no
certification mark.
AARP appraises an already-shipped receipt as an immutable input. It does not
replace the receipt format, and it does not control a wire standard. The profile
is vendor-neutral by design: it names no third-party product, and the trust model
turns on pinned keys and SPIFFE trust domains an operator controls.
