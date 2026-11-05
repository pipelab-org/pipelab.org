---
title: "Block synthetic patient data with Pipelock"
linkTitle: "Block Synthetic Patient Data"
seoTitle: "Block Synthetic Patient Data"
description: "Install the signed healthcare rule bundle on Ubuntu, block a synthetic medical record number in an HTTP request, and inspect the verdict."
date: 2026-11-05
learn_cat: operator
level: intro
recipe: true
evidence_date: 2026-11-05
tested_pipelock: "3.7.1"
requires_pro: false
limitations:
  - "Tests one labeled synthetic MRN in a fetch URL."
  - "Other patient identifiers and HTTP bodies need their own tests."
not_claimed:
  - "HIPAA compliance"
  - "Detection of every form of patient data"
  - "Containment of direct network access"
tags: [recipes, rules, healthcare, dlp]
---

Pipelock can block a labeled medical record number (MRN) in a request URL when the signed `healthcare-phi-pii` bundle is loaded. Use synthetic data only. This recipe sends one planted MRN through the fetch proxy and checks the exact bundle rule that stopped it.

The [HIPAA mapping](/learn/hipaa-security-rule/) explains the organizational and deployment controls this test doesn't cover. The [community rules guide](/learn/community-rules/) covers signature trust, freshness and additive loading.

## Starting point

Use Ubuntu 24.04 on Linux x86-64 with Bash, curl, CA certificates and tar. The commands also use standard Ubuntu tools, including `grep`, `sha256sum` and `seq`. Start in an empty working directory with no Pipelock installation, config, installed rules or license. Run the blocks in order in the same Bash shell. This recipe uses free features.

Downloads need HTTPS access to GitHub release assets and pipelab.org. Keep any proxy settings your environment requires. If a security proxy refuses a download, stop and inspect its logs. Don't bypass it. The [bundle-download prerequisite](/learn/community-rules/#installing-through-a-pipelock-proxy) explains the operator-approved signed-artifact configuration for a Pipelock proxy.

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

## Install the healthcare bundle and send synthetic data

Port 8898 must be unused. The loop checks the local proxy's health before sending the request. `/fetch` is Pipelock's explicit HTTP API: curl acts as the requesting client, and the `url` parameter is the outbound destination Pipelock evaluates. This isn't a system-wide proxy installation.

```bash
./pipelock rules install healthcare-phi-pii
./pipelock rules verify
cat > pipelock.yaml <<'YAML'
mode: balanced
fetch_proxy:
  listen: "127.0.0.1:8898"
YAML
./pipelock check --config pipelock.yaml
./pipelock run --config pipelock.yaml > proxy.log 2>&1 &
proxy_pid=$!
trap 'kill -TERM "$proxy_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 50); do
  if curl -fsS http://127.0.0.1:8898/health > /dev/null; then break; fi
  sleep 0.1
done
patient_id="MRN:$(printf '%s' 1234 5678)"
target="https://example.com/?patient=$patient_id"
curl -sS --get --data-urlencode "url=$target" --dump-header headers.txt --output response.json http://127.0.0.1:8898/fetch
cat headers.txt response.json
grep -q '^HTTP/1.1 403' headers.txt
grep -q 'healthcare-phi-pii:dlp-phi-mrn' response.json
if ./pipelock explain --config pipelock.yaml "$target"; then
  echo "Expected a blocked verdict" >&2
  exit 1
else
  test "$?" -eq 3
fi
kill -TERM "$proxy_pid"
wait "$proxy_pid"
trap - EXIT
cat proxy.log
```

## Check the result

The bundle install and verification printed these lines in the test run. Bundle versions can change independently of Pipelock; check your own output.

```text
Installed healthcare-phi-pii v2026.05.1 (official)
OK    healthcare-phi-pii (signature OK)
```

The response includes these headers:

```text
HTTP/1.1 403 Forbidden
X-Pipelock-Block-Reason: dlp_match
X-Pipelock-Block-Reason-Layer: dlp
```

The JSON response was:

```json
{"url":"https://example.com/[redacted]","agent":"anonymous","blocked":true,"block_reason":"DLP match: healthcare-phi-pii:dlp-phi-mrn (critical)"}
```

`curl` doesn't use `--fail` here, so the HTTP 403 is checked separately. Both `grep` checks must pass. `pipelock explain` prints `Verdict: BLOCKED`, `Scanner: dlp`, `Target: url_query` and `Pattern: healthcare-phi-pii:dlp-phi-mrn`. In v3.7.1, that blocked explanation exits 3; the command block checks for it. The full explanation can also print a display-anomaly warning for this synthetic input. The verdict still names the matching rule.

Read the explanation to see which layer made the decision. Don't apply its exemption suggestions to this deliberately planted value. The proxy log ends with `Pipelock stopped.` after shutdown. Its earlier warning that the recorder is inert is expected here because receipt signing isn't configured.

## What this doesn't prove

This tests one labeled MRN shape in a mediated URL. It doesn't establish HIPAA compliance, recognition of names or clinical narratives, coverage of every identifier format, or HTTP request-body inspection. Use the [healthcare bundle catalog](https://github.com/pipelab-org/pipelock-rules/blob/main/docs/rule-catalog.md) to select additional synthetic cases for your workload.

Pipelock blocks this request before fetching the destination. It doesn't stop a separate client from using a direct network route. Deployment isolation and egress controls need their own verification. Try [community-rule blocking](/learn/block-community-secret/) for another bundle, or [record a signed block receipt](/learn/record-verify-receipts/) for offline review.
