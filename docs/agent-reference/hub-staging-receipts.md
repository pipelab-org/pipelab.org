# Hub staging receipt handoff

The protected staging workflow uploads a compact JWE containing the upload receipt. It uses RSA-OAEP-256 and AES-256-GCM. Use an offline JWE tool with the dedicated operator encryption key to decrypt directly into the private case-ledger checkout. Keep the decrypted receipt for the rollback clearance. The operator key for decryption is separate from the Ed25519 key that signs a clearance or receipt. The public acceptance file contains the candidate and verified package digests.

The approved GitHub environment supplies the account and closed version to deploy and both closure paths. Publish and rollback also receive the private ledger repository, its commitment nonce, and the existing read-only token. Prepare receives no deployment settings. The committed account and closed-version commitments pin the deployment target, and the committed ledger repository commitment, ref, and paths pin the case source. The nonce must be an independently generated 32-byte value encoded in lowercase hex. Keep it alongside the private repository setting in the protected environment.

The staging configuration ships with empty commitments and public-key fields. An authorized configuration change must fill the reviewed commitments, public verification key, and operator encryption public key before live staging can run. Account and closed-version commitments use the domain-separated functions in the staging target and authority modules. The ledger commitment also includes the private nonce. Put the environment secrets in the existing protected staging environment. The workflow will refuse unavailable or mismatched bindings.

The prepared package now includes the account commitment in its digest. Prepare a new artifact and clearance for the changed bytes. Older receipts bind the old package and can't clear the new one. For withdrawal, use the protected close operation and verify closure before removing the reviewed target configuration.

The compact serialization and algorithm definitions are in [RFC 7516](https://www.rfc-editor.org/rfc/rfc7516) and [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518).
