---
title: "AARP Claims Dictionary"
linkTitle: "AARP Claims Dictionary"
related:
  - aarp-spec
  - aarp-what-it-proves
  - action-receipt-spec
seoTitle: "AARP Claims Dictionary"
subtitle: "The machine-readable vocabulary behind AARP verified claims, limitations, reserved axes, and overclaim-risk warnings."
description: "AARP claims dictionary: verified claims, reserved vocabulary, does_not_assert limits, and overclaim-risk warnings for receipt appraisal."
date: 2026-06-08
lastmod: 2026-06-08
learn_cat: evidence
level: ref
tags:
  - receipts
  - assurance
  - evidence
  - spec
---

An AARP appraisal reports a claim set, not a trust score. Each claim name says
what the verifier mechanically confirmed, and the paired limitations say what a
reader must not infer from that evidence.

This page renders from the public JSON dictionary shipped with the Pipelock SDK.
The human page is a view of that source, not a separate hand-maintained table.

Reserved entries are vocabulary locks. They name future transparency,
deployment, and authority claims, but the current verifier does not emit those
claims until the evidence and hostile fixtures exist.

{{< aarp-claims-dictionary >}}
