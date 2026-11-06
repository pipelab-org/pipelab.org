---
title: "Block a fake secret with signed community rules"
linkTitle: "Block a Secret with Community Rules"
seoTitle: "Block a Secret with Community Rules"
description: "Install signed Pipelock community rules on Ubuntu, block a planted fake secret in an outbound HTTP request, and read the verdict explanation."
date: 2026-11-05
learn_cat: operator
level: intro
recipe: true
evidence_date: 2026-11-05
tested_pipelock: "3.7.1"
requires_pro: false
limitations:
  - "Tests one synthetic credential shape in a fetch URL."
  - "Installed bundle versions can change independently of the binary."
not_claimed:
  - "Detection of every secret"
  - "Containment of direct network access"
  - "Inspection of all encrypted traffic"
tags: [recipes, rules, dlp]
---

Install the signed `pipelock-community` bundle, send a fake Buildkite-shaped token through Pipelock's fetch proxy, and check that the block names the community rule. The planted value isn't a credential and can't authenticate to anything.

The [community rules guide](/learn/community-rules/) explains signature trust, freshness, experimental-rule filtering and updates. [Pipelock Rules](/pipelock-rules/) describes the published bundles.

## Starting point

Use Ubuntu 24.04 on Linux x86-64 with Bash, curl, CA certificates and tar. The commands also use standard Ubuntu tools, including `grep`, `sha256sum` and `seq`. Start in an empty working directory with no Pipelock installation, config, installed rules or license. Run the blocks in order in the same Bash shell. This recipe uses free features.

Downloads need HTTPS access to GitHub release assets and pipelab.org. Keep any proxy settings your environment requires. Before installing the bundle, configure `HTTPS_PROXY` (or `https_proxy`) with your operator-approved proxy address. Pipelock's Go downloader doesn't use `ALL_PROXY`. Check that `NO_PROXY` (or `no_proxy`) doesn't exclude `pipelab.org`, including through a domain suffix or `*` entry. If a security proxy refuses a download, stop and inspect its logs. Don't bypass it. The [bundle-download prerequisite](/learn/community-rules/#installing-through-a-pipelock-proxy) explains the operator-approved signed-artifact configuration for a Pipelock proxy.

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

## Install the bundle and send the planted request

Port 8898 must be unused. Both local requests use `--noproxy 127.0.0.1`, so a proxy set in your environment can't intercept them. If you interrupt the block, the background proxy keeps running: stop it with `kill "$proxy_pid"` in the same shell before you run the block again. The loop checks the local proxy's health before sending the request. `/fetch` is Pipelock's explicit HTTP API: curl acts as the requesting client, and the `url` parameter is the outbound destination Pipelock evaluates. This isn't a system-wide proxy installation.

```bash
./pipelock rules install pipelock-community
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
  if curl --noproxy 127.0.0.1 -fsS http://127.0.0.1:8898/health > /dev/null; then break; fi
  sleep 0.1
done
fake_secret="bkua_$(printf 'a%.0s' {1..24})"
target="https://example.com/?sample=$fake_secret"
curl -sS --get --data-urlencode "url=$target" --dump-header headers.txt --output response.json --noproxy 127.0.0.1 http://127.0.0.1:8898/fetch
cat headers.txt response.json
grep -q '^HTTP/1.1 403' headers.txt
grep -q 'pipelock-community:dlp-buildkite-user-access-token' response.json
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
Installed pipelock-community v2026.07.0 (official)
OK    pipelock-community (signature OK)
```

The response includes these headers:

```text
HTTP/1.1 403 Forbidden
X-Pipelock-Block-Reason: dlp_match
X-Pipelock-Block-Reason-Layer: dlp
```

The JSON response was:

```json
{"url":"https://example.com/[redacted]","agent":"anonymous","blocked":true,"block_reason":"DLP match: pipelock-community:dlp-buildkite-user-access-token (critical)"}
```

`curl` doesn't use `--fail` here, so the HTTP 403 is checked separately. Both `grep` checks must pass. `pipelock explain` prints `Verdict: BLOCKED`, `Scanner: dlp`, `Target: url_query` and `Pattern: pipelock-community:dlp-buildkite-user-access-token`. In v3.7.1, that blocked explanation exits 3; the command block checks for it. The full explanation can also print a display-anomaly warning for this synthetic input. The verdict still names the matching rule.

Read the explanation to see which layer made the decision. Don't apply its exemption suggestions to this deliberately planted value. The proxy log ends with `Pipelock stopped.` after shutdown. Its earlier warning that the recorder is inert is expected here because receipt signing isn't configured.

## What this doesn't prove

This tests one synthetic credential shape in a mediated URL. It doesn't establish coverage of every secret format or encoded variant, HTTP request-body inspection, or visibility inside an ordinary HTTPS CONNECT tunnel. The bundle is additive, and the namespaced pattern identifies the rule that fired.

Pipelock blocks this request before fetching the destination. It doesn't stop a separate client from using a direct network route. Deployment isolation and egress controls need their own verification. Try [synthetic patient-data blocking](/learn/block-synthetic-patient-data/) for another bundle, or [record a signed block receipt](/learn/record-verify-receipts/) for offline review.
