---
title: "Record signed receipts and verify them offline"
linkTitle: "Record and Verify Signed Receipts"
seoTitle: "Record and Verify Signed Receipts"
description: "Record a blocked request with Pipelock on Ubuntu, verify its signed receipt with the standalone verifier, and reject a tampered evidence copy."
date: 2026-11-05
learn_cat: operator
level: intro
recipe: true
evidence_date: 2026-11-05
tested_pipelock: "3.7.1"
requires_pro: false
limitations:
  - "Verifies the recorded prefix with a locally generated test signer."
  - "The unanchored chain end remains unproven."
not_claimed:
  - "Independently trusted signer"
  - "Complete mediation"
  - "No data leaked"
  - "Tail completeness"
tags: [recipes, receipts, verification]
---

Pipelock can sign the record of a blocked request so you can verify it later using local files. This recipe starts from release archives, creates a disposable signing key, records one synthetic-secret block, and checks the evidence with `pipelock-verifier`. It also changes a copy and confirms that verification rejects it.

The [existing receipt-generation demo](/learn/what-did-my-agent-do/#try-it-on-your-own-setup) exercises several transports from source. This recipe uses the pinned release and HTTP fetch path. [Action receipts](/learn/agent-action-receipts/) explains the evidence format; [Verify a receipt](/learn/verify-a-receipt/) uses published conformance fixtures instead of generating new evidence.

## Starting point

Use Ubuntu 24.04 on Linux x86-64 with Bash, curl, CA certificates and tar. The commands also use standard Ubuntu tools, including `grep`, `sha256sum`, `seq`, `cp` and `sed`. Start in an empty working directory with no Pipelock installation, config, installed rules or license. Run the blocks in order in the same Bash shell. This recipe uses free features.

Downloads need HTTPS access to GitHub release assets. Keep any proxy settings your environment requires. If a security proxy refuses a download, stop and inspect its logs. Don't bypass it.

## Download and check Pipelock

Select the Linux amd64 archive from the [v3.7.1 release](https://github.com/pipelab-org/pipelock/releases/tag/v3.7.1), check it against that release's `checksums.txt`, and unpack only the executable. A checksum from the same release checks download integrity; it isn't an independent attestation of the publisher.

```bash
set -euo pipefail
mkdir recipe
cd recipe
release=https://github.com/pipelab-org/pipelock/releases/download/v3.7.1
archive=pipelock_3.7.1_linux_amd64.tar.gz
curl --proto '=https' --proto-redir '=https' -fsSL "$release/checksums.txt" -o checksums.txt
curl --proto '=https' --proto-redir '=https' -fsSL "$release/$archive" -o "$archive"
grep "  $archive\$" checksums.txt | sha256sum --check --strict -
tar -xzf "$archive" pipelock
./pipelock --version
```

The checks print `pipelock_3.7.1_linux_amd64.tar.gz: OK` and `pipelock version 3.7.1`. Stop if either check fails.

## Install the verifier, record a block and verify it

Port 8898 must be unused. Both local requests use `--noproxy 127.0.0.1`, so a proxy set in your environment can't intercept them. If you interrupt the block, the background proxy keeps running: stop it with `kill "$proxy_pid"` in the same shell before you run the block again. The key-generation command requires an absolute output path. Keep `receipt-signing.json` private; only `signer.pub` belongs with evidence given to a verifier. This local test gives both processes to one user, so it doesn't demonstrate a protected signing boundary.

```bash
verifier_archive=pipelock-verifier_3.7.1_linux_amd64.tar.gz
curl --proto '=https' --proto-redir '=https' -fsSL "$release/$verifier_archive" -o "$verifier_archive"
grep "  $verifier_archive\$" checksums.txt | sha256sum --check --strict -
tar -xzf "$verifier_archive" pipelock-verifier
./pipelock-verifier --version
./pipelock signing key generate --purpose receipt-signing --out "$PWD/receipt-signing.json"
./pipelock signing pubkey --key-file receipt-signing.json --out signer.pub
cat > pipelock.yaml <<YAML
mode: balanced
fetch_proxy:
  listen: "127.0.0.1:8898"
flight_recorder:
  enabled: true
  dir: "$PWD/evidence"
  signing_key_path: "$PWD/receipt-signing.json"
  sign_checkpoints: true
  require_receipts: true
YAML
./pipelock check --config pipelock.yaml
./pipelock run --config pipelock.yaml > proxy.log 2>&1 &
proxy_pid=$!
trap 'kill -TERM "$proxy_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 50); do
  if curl --noproxy 127.0.0.1 -fsS http://127.0.0.1:8898/health > /dev/null; then break; fi
  sleep 0.1
done
fake_secret="$(printf '%s' AKIA IOSFODNN7EXAMPLE)"
target="https://example.com/?sample=$fake_secret"
curl -sS --get --data-urlencode "url=$target" --dump-header headers.txt --output response.json --noproxy 127.0.0.1 http://127.0.0.1:8898/fetch
cat headers.txt response.json
grep -q '^HTTP/1.1 403' headers.txt
kill -TERM "$proxy_pid"
wait "$proxy_pid"
trap - EXIT
chains=(evidence/evidence-*.jsonl)
test "${#chains[@]}" -eq 1
chain=${chains[0]}
grep -q '"verdict":"block"' "$chain"
if ./pipelock-verifier chain "$chain" --key signer.pub; then
  echo 'Expected an unanchored chain end' >&2
  exit 1
else
  test "$?" -eq 3
fi
cp -a evidence tampered-evidence
tampered_chain="tampered-evidence/${chain#evidence/}"
sed 's/"verdict":"block"/"verdict":"allow"/' "$chain" > "$tampered_chain"
if ./pipelock-verifier chain "$tampered_chain" --key signer.pub; then
  echo 'Expected tampered evidence to fail' >&2
  exit 1
else
  test "$?" -eq 1
fi
cat proxy.log
```

## Check the result

The second archive check prints `pipelock-verifier_3.7.1_linux_amd64.tar.gz: OK`. The verifier identifies itself as `pipelock-verifier 3.7.1 (commit d6bb0003, built 2026-10-22T17:49:00Z, go1.26.10)`.

Key IDs, signatures, request IDs, hashes and run filenames vary. The request returns HTTP 403 and this JSON:

```json
{"url":"https://example.com/[redacted]","agent":"anonymous","blocked":true,"block_reason":"core DLP match: AWS Access ID (critical)"}
```

The response also has an `X-Pipelock-Receipt` header. That correlation ID alone isn't proof. After graceful shutdown, the script selects the one `evidence-*.jsonl` file in the new evidence directory rather than assuming a fixed filename. It checks that a block was recorded before verifying.

The original chain reports these fields:

```text
  record_type: evidence_receipt_v2
  receipts:   1
  final seq:  0
```

It also prints `signatures: verified` and `VALID PREFIX, END UNPROVEN`, and exits 3. The signature and linkage checks passed for the supplied prefix; the end remains unproven. Graceful shutdown doesn't turn this unanchored chain into a complete run. The script expects 3 deliberately. Don't translate that to a complete-chain pass in CI.

The tampered copy prints `CHAIN BROKEN:` followed by its filename, an error containing `hash mismatch`, and exits 1. The script expects 1. Copy the whole evidence directory, including its `ael` subdirectory: verifying the loose JSONL file alone can fail because its root is missing, before reaching the tamper check. Keep the original evidence bytes unchanged.

## Verify on another machine

After recording, the standalone verifier only needs local inputs. Transfer `pipelock-verifier`, the complete `evidence/` directory and the trusted public key to an offline Linux x86-64 machine. For another platform, download that platform's verifier archive from the same release instead and check it against `checksums.txt`. Obtain the public key through a channel you trust independently of the evidence sender. This command was tested on Linux x86-64. In the directory holding those files, run:

```bash
set -euo pipefail
chains=(evidence/evidence-*.jsonl)
test "${#chains[@]}" -eq 1
if ./pipelock-verifier chain "${chains[0]}" --key signer.pub; then
  echo 'Expected an unanchored chain end' >&2
  exit 1
else
  test "$?" -eq 3
fi
```

It reports the same fields and exits 3 without a running proxy or network service.

For a complete-chain claim, follow the [v3.7.1 verification guide](https://github.com/pipelab-org/pipelock/blob/v3.7.1/docs/guides/receipt-verification.md) and pin an independently known head with `--expect-head`. Reading the head from the same untrusted evidence isn't independent end proof.

## What this doesn't prove

The test proves that the supplied prefix verifies under this test key and that the changed copy fails integrity verification. It doesn't establish an independently trusted signer, a protected mediator, full mediation, tail completeness, or that nothing leaked elsewhere. The key is disposable and generated on the same machine as the requesting client.

Try [community-rule blocking](/learn/block-community-secret/) or [synthetic patient-data blocking](/learn/block-synthetic-patient-data/) for more detection cases. Neither recipe replaces deployment-level egress controls.
