---
title: "Schema mirrors for agent security artifacts"
linkTitle: "Schema mirrors"
date: 2026-09-07T18:00:00-04:00
description: "Immutable PipeLab mirrors of pinned Agent Egress Bench and Pipelock Rules schemas, with source commits, retrieval URLs, and SHA-256 digests."
---

PipeLab mirrors exact schema bytes from pinned Agent Egress Bench and Pipelock Rules revisions. The catalog records each upstream identity, source commit, retrieval URL, JSON Schema dialect, and SHA-256 digest.

The upstream repositories define these schemas. The mirrors give machines a stable retrieval path for the pinned bytes.

Schema validation checks an artifact's structure. It doesn't establish that signatures, scores or freshness claims are valid. The [Bench schema audit](https://github.com/pipelab-org/agent-egress-bench/blob/c31d44fec9f42e17874ecbaaa3cbf9dd928895a6/docs/SCHEMA-AUDIT.md) names each semantic verifier. The [Rules compatibility contract](https://github.com/pipelab-org/pipelock-rules/blob/aac8980c60add9f9f6b663a46d26b42da4b8c75a/compatibility/contract.yaml) records the supported reader and bundle limits.

## Catalog

[Open the machine-readable schema mirror catalog](/.well-known/schema-mirror-catalog.json).
