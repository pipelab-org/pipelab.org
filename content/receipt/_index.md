---
title: "Receipts"
linkTitle: "Receipts"
seoTitle: "Pipelock Agent Action Receipts"
description: "Signed Pipelock agent action receipts. Each URL renders one receipt readably with verifier instructions, plus the canonical JSON for offline verification."
subtitle: "One URL per signed agent action. Buyer-readable, machine-verifiable, third-party auditable."
date: 2026-05-23
lastmod: 2026-05-23
robots: "noindex, follow"
---

A Pipelock receipt is the signed record of one agent action that the proxy
mediated. Each receipt has its own URL. The URL serves a buyer-readable
page with a "verify it yourself" panel and links to the canonical JSON used
for offline verifier consumption.

The pages on this section are demonstration receipts signed with the
public conformance test key
([`sdk/conformance/testdata/test-key.json`](https://github.com/luckyPipewrench/pipelock/blob/main/sdk/conformance/testdata/test-key.json)).
Anyone can run the conformance verifier against them and read accept or
reject from the exit code. Real customer receipts come from the customer's
Pipelock deployment, signed by the customer's own key.

The format is documented at [/learn/action-receipt-spec/](/learn/action-receipt-spec/).
The in-toto v0.1 predicate schema is published at
[/attestation/agent-action-receipt/v0.1.schema.json](/attestation/agent-action-receipt/v0.1.schema.json).

## Sample receipts

- [`rcpt-conformance-allow-write`](/receipt/rcpt-conformance-allow-write/) — allow verdict on outbound write to `api.example.com`
