---
title: "Pipelock Rules"
linkTitle: "Pipelock Rules"
seoTitle: "Pipelock Rules: Signed Detection Rule Bundles"
description: "Signed, versioned detection rules that extend Pipelock with community DLP, prompt-injection, and tool-poisoning coverage."
type: project
project_id: rules
project_mark: "/images/brand/pipelock-rules-logo.svg"
project_eyebrow: "Open detection content · maintained by PipeLab"
project_name: "Pipelock Rules"
project_accent: "Rules"
project_actions:
  - label: "Browse rule bundles"
    href: "https://github.com/pipelab-org/pipelock-rules"
    primary: true
  - label: "Read the install guide"
    href: "/learn/community-rules/"
project_facts:
  - label: "Bundles"
    value: "Signed"
  - label: "Verification"
    value: "Ed25519"
  - label: "Loading"
    value: "Hot reload"
  - label: "License"
    value: "Apache 2.0"
project_sections:
  - number: "01"
    label: "Additive by design"
    title: "New coverage without weakening the built-in scanners"
    wide: true
    columns:
      - "Pipelock Rules adds DLP, prompt-injection, and tool-poisoning detections between binary releases. A bundle can add a detection. It can't override or disable a built-in rule."
      - "Every published bundle has a version and an Ed25519 signature. Pipelock verifies the signature against a trusted key before it loads the rules."
  - number: "02"
    label: "Installed state"
    title: "Pipelock records exactly which bundle it loaded"
    body: "A successful install writes the bundle name, version, and digest to bundle.lock. The healthcare-phi-pii bundle installs separately from pipelock-community, so operators choose each bundle deliberately."
  - number: "03"
    label: "Inspect it"
    title: "Rules, fixtures, manifests, and trust docs"
    links:
      - label: "Bundles and source"
        href: "https://github.com/pipelab-org/pipelock-rules"
      - label: "Generated rule catalog"
        href: "https://github.com/pipelab-org/pipelock-rules/blob/main/docs/rule-catalog.md"
      - label: "Installation and trust guide"
        href: "/learn/community-rules/"
      - label: "Community bundle manifest"
        href: "/rules/pipelock-community/bundle.yaml"
      - label: "Healthcare bundle manifest"
        href: "/rules/healthcare-phi-pii/bundle.yaml"
date: 2026-08-27
lastmod: 2026-08-27
disable_cta: true
disable_related: true
---
