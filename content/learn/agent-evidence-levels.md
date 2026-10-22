---
title: "Agent Evidence Level (AEL): Grading AI-Agent Audit Evidence"
linkTitle: "Agent Evidence Level"
seoTitle: "Agent Evidence Level (AEL) Standard"
subtitle: "An open draft standard for grading AI-agent evidence by what an independent party can verify and what omission they can detect."
description: "Agent Evidence Level is an open standard for grading AI-agent audit evidence by what an independent party can verify offline."
og_image: "https://pipelab.org/images/og/og-agent-evidence-levels.png"
type: project
project_id: ael
project_mark: "/images/brand/ael-logo.svg"
project_eyebrow: "Open draft standard · AEL v0.1"
project_name: "Agent Evidence Level"
project_accent: "Level"
project_actions:
  - label: "Read the specification"
    href: "https://github.com/pipelab-org/agent-evidence-levels/blob/main/SPEC.md"
    primary: true
  - label: "Run the checker"
    href: "https://github.com/pipelab-org/agent-evidence-levels"
project_facts:
  - label: "Status"
    value: "Draft v0.1"
  - label: "Scale"
    value: "AEL-0 to AEL-4"
  - label: "Specification"
    value: "CC BY 4.0"
  - label: "Code"
    value: "Apache 2.0"
project_sections:
  - number: "01"
    label: "Evaluation and verification"
    title: "Running the checker isn't the same as earning a public grade"
    wide: true
    columns:
      - "A producer or operator can run the checker and publish a signed evaluation package. That package displays EVALUATED. It has no grade or verifier field."
      - "A public grade needs a signed verification record from someone who is neither the producer nor the operator. The record ties the grade to the exact run, artifact bytes, checker, corpus, and replay inputs."
  - number: "02"
    label: "The boundary"
    title: "AEL grades the supplied evidence for one run"
    body: "It doesn't certify a product or prove that every event was recorded. Each level closes a specific omission path by adding another source of signed evidence. Organizational independence still has to be disclosed outside the cryptography."
  - number: "03"
    label: "PipeLab's role"
    title: "The draft is vendor-neutral. Its governance isn't independent yet."
    body: "PipeLab maintains the v0.1 draft and also builds Pipelock. PipeLab can't award grades, Pipelock receives no special treatment, and product marks stay out of the normative specification."
  - number: "04"
    label: "Read and run it"
    title: "Specification, checker, schemas, and registry"
    wide: true
    link_grid: true
    links:
      - label: "Specification"
        href: "https://github.com/pipelab-org/agent-evidence-levels/blob/main/SPEC.md"
      - label: "Reference checker"
        href: "https://github.com/pipelab-org/agent-evidence-levels"
      - label: "Evidence registry"
        href: "https://github.com/pipelab-org/agent-evidence-levels/blob/main/GRADES.md"
      - label: "Verification record schema"
        href: "/schemas/ael/v0.1/verification-record.schema.json"
date: 2026-07-03
lastmod: 2026-08-27
learn_cat: evidence
disable_cta: true
disable_title_fx: true
disable_related: true
tags:
  - ael
  - evidence
  - standard
  - verifiable
  - procurement
faq:
  - q: "What is Agent Evidence Level (AEL)?"
    a: "AEL is an open draft standard for grading a record of AI-agent activity from AEL-0 to AEL-4. The grade describes what an independent party can verify and what omission they can detect without trusting the producer or operator."
  - q: "Can a producer or operator award an AEL grade?"
    a: "No. A producer or operator can run the checker and publish a signed evaluation package, but that package is displayed as EVALUATED and can't support a public numeric AEL grade."
  - q: "What supports a public AEL grade?"
    a: "A verifier that is neither the producer nor the operator must check the exact artifact and issue a signed verification record. The grade stays bound to that run, those artifact bytes, the named checker, and the published verification inputs."
  - q: "Is AEL a PipeLab product?"
    a: "No. PipeLab maintains the draft and intends to donate it to a neutral body after independent use and critique. The normative specification contains no PipeLab or Pipelock marks, and its governance isn't independent yet."
  - q: "How is AEL licensed?"
    a: "The normative specification is CC BY 4.0. The reference checker, schemas, fixtures, scripts, and other code are Apache 2.0."
---
- [Verification status schema](/schemas/ael/v0.1/verification-status.schema.json)
- [Schema mirror catalog](/schemas/): pinned Agent Egress Bench and Pipelock Rules schema bytes with source commits and digests

The specification is CC BY 4.0. The checker, schemas, fixtures, scripts, and other code are Apache 2.0.
