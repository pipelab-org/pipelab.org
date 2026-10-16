---
title: "AI Security Assessment Reports from Pipelock Assess"
linkTitle: "Pipelock Assess"
seoTitle: "AI Security Assessment Reports from Pipelock"
subtitle: "Know what happened. Know what's exposed."
description: "AI security assessment: findings, remediation, and framework mappings across OWASP, MITRE ATLAS, EU AI Act, NIST AI RMF, HIPAA, SOC 2. Signed by default."
og_image: "https://pipelab.org/images/og/og-assess.png"
disable_cta: true
type: assess
headline: "Two tools. Two questions."
headline_accent: "One evidence chain."
lastmod: 2026-05-30
---

Finalize an assessment for free to generate an HTML and JSON summary with an Ed25519-signed manifest. The Assess license adds full findings, remediation guidance, detailed framework mappings, and optional attestation and badge. Verification is free for everyone.

## Verify another operator's assessment

Each operator signs with their own key. Obtain their public key through an authenticated channel and confirm its association with that operator before trusting it. A key supplied only alongside the bundle does not establish the signer's identity.

For the default signing identity, the operator shares only `~/.pipelock/agents/pipelock-assess/id_ed25519.pub`, never the private key. This path assumes the default keystore; use the operator's selected keystore and signing identity if overridden. Save the public key locally as `signer.pub`, then run:

```sh
pipelock trust pipelock-assess signer.pub --keystore ./assessment-trust
pipelock assess verify my-assessment/ --agent pipelock-assess --keystore ./assessment-trust
```

Use the agreed signing identity in both commands if it differs from `pipelock-assess`. Confirm any replacement key with the operator through an authenticated channel before trusting it; keep earlier trusted keys in a separate keystore to verify older bundles. A key mismatch is a reason to investigate, not to replace a trusted key blindly. Verification checks artifact integrity and the signature against the key you trusted; it does not independently prove execution.

## Page links

- [Demo egress report](/assess/demo-egress-report/) (sample generated with Pipelock 3.6.0)
- [Demo paid assessment](/assess/demo-assessment/) (sample generated with Pipelock 3.6.0)
- [Signed summary demo](/assess/demo-summary/) (sample generated with Pipelock 3.6.0)
- [Pipelock](/pipelock/)
- [Pricing](/pricing/)
- [Proof](/proof/)
- [Enterprise](/enterprise/)
- [Agent Egress Bench results](/gauntlet/)
- [Compare](/compare/)
- [Pipelock on GitHub](https://github.com/pipelab-org/pipelock)
- [Get an Assess license (Polar)](https://buy.polar.sh/polar_cl_xiD0xkZuLFvPG0nTYpezAnar0vU6MWd3qbWdj4XcB9D)
