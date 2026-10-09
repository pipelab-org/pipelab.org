# Browser-verifier assets

These files are served through Hugo's asset pipeline with content-hashed URLs
and SRI digests; the page scripts verify the fetched bytes against those
digests before use. `evidence-proxy-0.jsonl` is a frozen, signed reference
capture from the shipped Pipelock release binary. It must not be edited: any
byte change breaks its signatures, which is the property being demonstrated.

Reviewer notes on the capture's intentional semantics, each verified against
the Pipelock verifier and its emitter tests:

- **Two root hashes are two chain positions, not a contradiction.** The
  `session_close` record seals the chain up to itself, so its `root_hash`
  equals its own `chain_prev_hash` (a signed record cannot contain its own
  hash). The `transcript_root` record covers the chain *including* the close
  receipt. The offline verifier checks the close root explicitly and reports
  this capture CHAIN VALID.
- **`receipt_count: 6` counts action receipts.** The file's 16 records are
  6 action receipts plus evidence receipts, checkpoints, decision records,
  and the transcript root, which are not chain receipts.
- **Two policy-hash values are two hash domains.** Traffic receipts carry the
  per-decision resolved policy hash; session open/close records carry the
  recorder's config hash. Both are emitted that way by design.
- **Decision records do not reproduce blocked content.** A DLP block decision
  binds to its action receipt through `request_id`, and the receipt's target
  is sanitized. Recording the blocked credential inside signed, published
  evidence would itself be the leak the block prevented.
