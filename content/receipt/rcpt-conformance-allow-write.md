---
title: "Receipt rcpt-conformance-allow-write"
linkTitle: "rcpt-conformance-allow-write"
seoTitle: "Pipelock Receipt rcpt-conformance-allow-write"
description: "Pipelock action receipt: allow verdict on outbound HTTPS POST to api.example.com. Ed25519 signed by the Pipelock conformance test key, hash-chained at chain_seq 0."
subtitle: "Allow verdict on outbound HTTPS POST. Signed by Pipelock from outside the agent process. Verifiable offline against the pinned conformance test key."
date: 2026-05-23
lastmod: 2026-05-23
robots: "noindex, follow"
receipt_id: "rcpt-conformance-allow-write"
receipt_file: "rcpt-conformance-allow-write.json"
test_key_file: "conformance-test-key.json"
---

## What this receipt records

The Pipelock mediator observed an agent attempt to POST to
`https://api.example.com/conformance` over HTTPS. The mediator applied
policy, returned an **allow** verdict, and signed a receipt of the
decision before the agent's request continued upstream. The signature
covers the action record's canonical JSON. Anyone with the signer's
public key can verify the receipt offline.

The receipt is the first in its chain (`chain_seq: 0`, `chain_prev_hash:
genesis`). Subsequent receipts in the same chain reference this receipt's
hash, so any tampering here breaks every receipt that follows.

## Trust boundary

Pipelock signs receipts from outside the agent process. The agent does
not hold the signing key. A compromised agent can rewrite its own logs;
it cannot forge a receipt signature. The verification step does not
trust the agent, the agent's logs, the agent's vendor, or any vendor
dashboard. The verifier reads bytes, recomputes a hash, runs Ed25519,
and emits accept or reject.

That is the property ordinary application logs do not have.
