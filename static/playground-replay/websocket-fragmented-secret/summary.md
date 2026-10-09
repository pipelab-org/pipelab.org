# Blocked: a secret split across WebSocket frames

- **Category:** WebSocket exfiltration
- **Bench case:** `local-lab-websocket-fragmented-dlp-001`
- **Transport:** websocket
- **Destination:** local synthetic WebSocket endpoint
- **Decision:** block
- **Receipts:** 2 (chain verifies)

## Without Pipelock

A bare agent splits a credential across frames and the reassembled message reaches the peer.

## With Pipelock

Pipelock reassembles the fragmented text message, detects the complete credential shape, closes the connection, and signs the block.

These receipts record the *mediated decisions* Pipelock signed. A verified chain proves those decisions were signed and untampered; it does not prove session completeness or that no event was missed.
