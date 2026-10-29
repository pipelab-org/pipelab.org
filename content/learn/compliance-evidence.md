---
title: "AI Compliance Evidence: Signed Reports"
linkTitle: "AI Compliance Evidence"
related:
  - verifiable-egress-control
  - compliance-evidence-substrate
  - agent-evidence-detection-integration
subtitle: "OWASP, NIST, EU AI Act, SOC 2, mapped and proven."
description: "AI compliance evidence from Pipelock. Maps runtime controls to seven frameworks and generates signed bundles. SARIF integrates with GitHub Code Scanning."
date: 2026-03-29
learn_cat: compliance
level: ref
tags:
  - evidence
  - frameworks
faq:
  - q: "How do I get an audit trail of what my AI agent did?"
    a: "Route the agent through Pipelock, enable the flight recorder, and configure receipt signing with a mediator signing key. Pipelock records the agent's HTTP, MCP, and WebSocket decisions as structured evidence. Signed receipts add offline verification so an auditor can check the action, verdict, policy hash, and chain integrity without trusting the agent's own logs."
---

[Pipelock](/pipelock/) can emit mediator-signed action receipts from outside the agent trust boundary when receipt signing is configured. That signing position is the load-bearing property compliance evidence depends on: a mediator outside the agent process recording mediated actions instead of the agent attesting to itself.

The deploying operator holds the signing key, so a receipt proves what the boundary decided and that the keyholder signed it, not that the operator is honest. Operator-independent evidence requires external transparency-log anchoring with `pipelock anchor receipts --backend rekor` and pinned Rekor log keys; the local anchor backend is not operator-independent.

Pipelock generates AI compliance evidence through structured mappings between its runtime security controls and seven external frameworks. These are control mappings with evidence generation, not compliance certifications. They document which controls Pipelock addresses and what evidence the product can emit.

## AI agent compliance evidence answer

AI agent compliance evidence should connect each runtime action to a control, a policy version, and a record an auditor can check later. Pipelock generates that evidence by mediating the agent's network and MCP traffic, writing structured events, and producing signed receipts when receipt signing is configured.

| Compliance evidence need | Signed receipt | Plain log |
|---|---|---|
| AI agent audit logs | One decision per mediated action with verdict and policy hash | Usually operational text or vendor event data |
| Tamper evidence | Ed25519 signature and hash-chain linkage | Depends on storage controls |
| Offline review | Verifier checks bytes against a pinned public key | Often tied to the original logging system |
| Deployer duty | Keep, review, and sign off through your compliance program | Same deployer duty, with weaker evidence |

## Mapped Frameworks

| Framework | Scope | Controls Mapped |
|-----------|-------|-----------------|
| [OWASP MCP Top 10](/learn/owasp-mcp-top10/) | MCP protocol security risks | 10 controls (MCP01-MCP10) |
| [OWASP Agentic Top 10](/learn/owasp-agentic-top10/) | AI agent application risks | 10 controls (ASI01-ASI10) |
| [MITRE ATLAS](/learn/mitre-atlas/) | Adversarial ML threat techniques | 14 mapping entries (ATLAS01-ATLAS14) |
| [EU AI Act](/learn/eu-ai-act-compliance/) | Articles 12, 13, 14, 26 | Record-keeping, transparency, human oversight, deployer monitoring |
| [SOC 2 Trust Services Criteria](/learn/soc2-trust-services-criteria/) | Security, availability, processing integrity, confidentiality, privacy | 5 criteria (SEC, AVA, PI, CONF, PRIV) |
| [NIST AI RMF](/learn/nist-ai-rmf/) | Core functions and Generative AI profile | 8 entries, including harmful bias as not covered |
| [HIPAA Security Rule](/learn/hipaa-security-rule/) | Selected technical and administrative safeguards | 9 entries, including BAA and workforce security as not covered |

The catalog includes partial and not-covered entries. An entry is not a certification or a claim of complete framework coverage. NIST SP 800-53 is not included in the Assess v3.7.1 catalog.

## Generating Evidence with `pipelock assess`

The `pipelock assess` command orchestrates four security primitives into a reproducible evidence bundle, Ed25519-signed by default:

```bash
pipelock assess init --config pipelock.yaml
pipelock assess run assessment-a1b2c3d4/
pipelock assess finalize assessment-a1b2c3d4/
```

**Init** creates a run directory with a manifest and a SHA-256 hash of your config file. **Run** executes the assessment primitives: attack simulation, audit scoring, installation verification, and MCP server discovery. **Finalize** synthesizes the results into a scored report (JSON and HTML) and signs the manifest with Ed25519 by default (use `--unsigned` to opt out).

Additional finalize options:

```bash
pipelock assess finalize assessment-a1b2c3d4/ --archive      # .tar.gz bundle
pipelock assess finalize assessment-a1b2c3d4/ --attestation   # attestation.json + signature
pipelock assess finalize assessment-a1b2c3d4/ --badge         # SVG badge (requires --attestation)
```

Verify a previous assessment with `pipelock assess verify` or `pipelock assess verify-attestation`.

Pipelock `v2.2.0` also adds `pipelock posture verify`, which checks a signed posture capsule against a named policy and gives CI-friendly exit codes for integrity failures versus policy failures. That turns the evidence bundle from a report artifact into a deployment gate.

## SARIF Output for GitHub Code Scanning

Pipelock's `audit` and `git scan-diff` commands support SARIF v2.1.0 output:

```bash
pipelock audit --format sarif -o results.sarif
pipelock git scan-diff --format sarif -o results.sarif
```

Upload the SARIF file using the `github/codeql-action/upload-sarif` action. Findings appear as inline annotations on pull request diffs, integrating security scanning into your existing code review workflow.

## What Each Primitive Tests

| Primitive | What It Does |
|-----------|-------------|
| `simulate` | Runs 30 built-in attack scenarios (DLP exfiltration, prompt injection, tool poisoning, SSRF, URL evasion) plus 6 per canary token. Verifies the correct scanner layer detected each attack |
| `audit-score` | Scores your config across 23 security categories (0-100, A-F grade) with tool policy overpermission audit |
| `verify-install` | 15 deterministic checks verifying the scanning pipeline and network containment are operational |
| `discover` | Scans MCP server configs across IDEs and reports which servers lack Pipelock wrapping |

## Licensing

Unlicensed users get a signed summary projection: grade, section scores, and top findings with an Ed25519-signed manifest. Licensed users get the full assessment: server-specific findings, remediation guidance, detailed framework mappings, and the attestation documents and SVG badges. All detection and scanning is free and open source; the paid tier adds the full report content, not the signature.

---

For procurement, audit, and legal-team framing of Pipelock as evidence substrate inside an existing compliance program (rather than as a compliance product), see [Compliance Evidence Substrate](/learn/compliance-evidence-substrate/). For a framework-by-framework view across EU AI Act, DORA, NIS2, NIST AI RMF, ISO 42001, the Colorado AI Act, SOC 2, and OWASP, see the [AI Agent Regulatory Controls hub](/learn/ai-agent-regulatory-controls/). To walk through a single decision end-to-end with a real signed receipt and verifier output, see [What did my agent do?](/learn/what-did-my-agent-do/).

[Back to Pipelock](/pipelock/) | [Proof](/proof/) | [Generate signed reports with Assess](/assess/)

- [Assess v3.7.1 framework catalog](https://github.com/pipelab-org/pipelock/blob/v3.7.1/internal/report/compliance/coverage.go): the shipped framework list.
