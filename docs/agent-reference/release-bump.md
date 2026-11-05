# Verified Pipelock release proposals

Run **Propose verified Pipelock release** on `main` with an explicit stable
`vMAJOR.MINOR.PATCH` tag. The workflow prepares one draft pull request on
`automation/pipelock-release`. Repeated dispatches update that proposal;
concurrency serializes preparations. Nothing merges automatically. The normal
site build continues to use committed pins without release discovery.

The site-only `PIPELAB_RULES_SYNC_TOKEN` credential needs Contents and Pull
requests write access to this repository, including permission to update its
workflow file. Checkout does not persist credentials. The token is supplied
only to its presence check and the pinned pull-request action. Provisioning or
expanding that credential is a maintainer action.

## Trust anchor and verification contract

`scripts/pipelock-release-keyring.txt` contains reviewed public Ed25519 keys,
as comma-separated 64-character hex values. Candidate releases cannot edit it.
Key rotation requires a separate reviewed trust decision.

The bootstrap anchor is the public key embedded in the shipped Pipelock
v3.7.1 Linux amd64 binary, as documented by
[`docs/cli/update.md`](https://github.com/pipelab-org/pipelock/blob/d6bb0003c1dac00d3b2df8dd1eb1a51ed8cecd6a/docs/cli/update.md#verification-chain)
and the `internal/release.PublicKeyringHex` linker input in
[`.goreleaser.yaml`](https://github.com/pipelab-org/pipelock/blob/d6bb0003c1dac00d3b2df8dd1eb1a51ed8cecd6a/.goreleaser.yaml#L35).
Its archive SHA-256 was already approved in this site's rules-sync pin:
`2fdc91c27457cb0dfa15d17f9c94e8a4264cf0824b4f8288304e4425661ebbf5`.
The bootstrap check confirmed the key's exact hex bytes in that binary; the
v3.7.1 manifest signature is independently checked with those pinned bytes.
The release being proposed is never a source of trusted keys.

The Node adapter follows v3.7.1
[`internal/release/verify.go`](https://github.com/pipelab-org/pipelock/blob/d6bb0003c1dac00d3b2df8dd1eb1a51ed8cecd6a/internal/release/verify.go):
Ed25519 over `Pipelock release manifest signature v1\n` followed by the exact
manifest bytes, signer identity, schema, repository, and unambiguous JSON.
The manifest repository retains the product's pre-migration identifier.
[`cmd/pipelock-release-manifest`](https://github.com/pipelab-org/pipelock/blob/d6bb0003c1dac00d3b2df8dd1eb1a51ed8cecd6a/cmd/pipelock-release-manifest/main.go#L170)
supports `--verify --manifest PATH --keyring-hex KEYS`, but is source tooling,
not a shipped binary in the release archive matrix. It verifies signatures,
not archive integrity. The adapter uses Node's built-in Ed25519 verification;
it does not build or execute verification code from the candidate release.

Preparation binds the signed tag and commit to GitHub's tag object and the
fetched source tag. It authenticates the complete `checksums.txt` hash before
reading either archive entry. The full archive's entry must also agree with
its signed platform record. The standalone verifier is covered by the signed
checksum-file hash even when absent from the manifest asset list.

Both archive hashes and both executable version reports must match. Extraction
validates every entry and copies only one regular binary without interpreting
archive paths as output paths. Traversal, absolute paths, links, special files
and duplicate names fail. Downloads and extracted content are bounded at
256 MiB, following `internal/cli/selfupdate/update.go`; metadata uses the
manifest tool's 8 MiB limit. Each subprocess/network request has a deadline.

Cosign follows the product's optional secondary check: absence is reported,
while an installed but broken or rejecting cosign aborts preparation. When
present it must accept the GitHub Actions issuer and one of the two exact
`release.yaml@refs/tags/<tag>` identities under `luckyPipewrench/pipelock` or
`pipelab-org/pipelock`. No identity pattern or insecure fallback is used.

## Adoption policy and boundaries

Only published stable releases newer than the approved version are eligible.
Drafts, prereleases, equal versions and downgrades fail visibly. Missing tools,
metadata, signatures, checksum entries or API responses are failures, not skips.
Source verification, unknown capability mappings and changed references also
stop preparation. Offline tests use ephemeral signing keys and local fixtures.

Preparation stages all changes before replacing the five approved files:
`hugo.toml`, the rules-sync workflow, `scripts/pipelock-verifier-pin.env`,
`content/capabilities.md`, and the generated capability snapshot. The installer
continues reading the existing verifier pin file; it has no second pin to edit.
The existing capability generator and exact-source verifier run against the
authenticated release commit. Failure before application leaves pins unchanged;
an application error restores the original bytes and removes the proposal body.
The workflow installs the candidate verifier and requires preflight and link
policy checks before the draft pull request action can run.

Humans approve adoption and merge. Release descriptions, capability/tier
meanings, new grouping, comparisons, standards mappings, legal wording and
commercial terms require human review. The proposal body names those tasks.
This workflow does not update measurements: the product stats exporter does
not define every site's metric, and a release is not a new benchmark result.
Historical signed packets, demos, Gauntlet records and their digests remain
unchanged. Unsigned collateral and dated measurements need separate review.
