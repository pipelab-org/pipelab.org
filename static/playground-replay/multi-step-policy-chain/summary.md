# Chain: two safe actions, then a blocked write

- **Category:** Multi-step evidence
- **Bench case:** `local-lab-multi-step-policy-chain-001`
- **Transport:** forward
- **Destination:** local synthetic workflow endpoints
- **Decision:** block
- **Receipts:** 4 (chain verifies)

## Without Pipelock

A bare agent reads context, prepares a change, and sends the final credential-bearing write with no linked record of the sequence.

## With Pipelock

Pipelock signs the two allowed local actions and the final body-DLP block into one ordered receipt chain.

These receipts record the *mediated decisions* Pipelock signed. A verified chain proves those decisions were signed and untampered; it does not prove session completeness or that no event was missed.
