---
title: "Pipelock v3.8 Upgrade Guide"
linkTitle: "Pipelock v3.8 Upgrade"
description: "Upgrade to Pipelock v3.8: move metrics to a dedicated listener, use ghcr.io/pipelab-org images and charts, and review audit mode, exceptions and presets."
date: 2026-11-09
learn_cat: operator
level: intermediate
---

Install the new binary before loading configuration that uses new fields. Then move metrics scrapers, update registry references, and review the audit mode name, exceptions, presets, and repository-scan suppressions. The [v3.8 release notes](/blog/pipelock-v380-release/) describe the changes; the [source upgrade guide](https://github.com/pipelab-org/pipelock/blob/v3.8.0/docs/guides/upgrading-to-3.8.md) holds the full compatibility contract. Upgrading from an earlier line? Read the [v3.7 upgrade guide](/learn/pipelock-v370-upgrade/) first.

## Move metrics scrapers to a dedicated listener

The agent-facing proxy no longer serves `/metrics` or `/stats`. Counters still collect internally, but neither route is exposed unless `metrics_listen` names a dedicated listener. Omitted, null, and blank values disable it at startup. For a scraper on the proxy host:

```yaml
metrics_listen: "127.0.0.1:9091"
```

Restart Pipelock and point the scraper at that port; address changes require a restart. The listener has no authentication, and loopback alone doesn't separate same-host processes, so keep agents off it with the operating-system or container network boundary. Under managed containment, a non-loopback listener also needs a current `containment.metrics_exposure` policy, which permits only `/metrics`.

## Update image and chart repositories

Releases from v3.8.0 publish images and Helm charts under `ghcr.io/pipelab-org`. Update registry allowlists, image repository overrides, and Helm OCI references to `ghcr.io/pipelab-org/pipelock` and `oci://ghcr.io/pipelab-org/charts/pipelock`. Current commands are on the [install page](/install/).

Image names (`pipelock`, `pipelock-init`, `pipelock-license-service`) and the chart name stay the same. A retained `image.digest` still selects the older artifact after `image.tag` or the chart version changes, so choose the release digest explicitly from the verified `release-images.json`. Regenerate Compose and sidecar output to pick up the new defaults; Helm users with an explicit `image.repository` must update it themselves. v3.7.1 and older keep their original registry addresses and attestation identity. The Go module path and Homebrew tap don't change.

## Review exceptions, URL limits, and numeric settings

- Valid expired scanner exceptions now lapse with a warning instead of refusing the configuration. Normal scanning resumes for that scope. Renew only the exceptions you still intend to grant.
- The default `fetch_proxy.monitoring.max_url_length` rises from 2048 to 8000 octets. Set it explicitly if you need the old ceiling. DLP, entropy, and the other URL checks still run.
- Floating-point settings must be finite. Replace any NaN or infinity before upgrading; invalid values refuse load and reload.

## Review regenerated presets

Generated configurations now preserve bundled policy, and regenerated strict configurations keep their strict actions, taint policy, and tool-chain detection. The `claude-code`, `cursor`, `generic-agent`, and `hostile-model` presets keep built-in response patterns alongside supplemental expressions, which regenerated YAML names with `Preset`. An old rule name doesn't cover its `Preset` counterpart, so review name-based alerts and suppressions before replacing an older configuration.

## The mode name does not disable enforcement

`mode: audit` alone keeps the default `enforce: true`, so ordinary URL findings still block. Use the bundled `audit` preset when you want an observation trial. The mode name doesn't change scanning actions or the independent core and transport refusals. Startup and check now warn when the mode name and the effective behavior don't match. Details are in the [source upgrade guide](https://github.com/pipelab-org/pipelock/blob/v3.8.0/docs/guides/upgrading-to-3.8.md).

## Other operator notes from this release

- Signed URL evidence records the scheme, host, and port, and drops path and query so those values don't land in receipts.
- Outbound responses whose decoding can't finish are refused instead of passed through.
- Provider credential relief is tighter. Don't assume an older exception still applies.
- Unicode tag views of receipts need a current verifier: TypeScript and Rust 0.6.15, or the v3.8.0 Go tools. Python `pipelock-verify` 0.4.1 does not cover every current receipt view.

## Prompt-injection wording checks

`prompt_injection_detection` lets operators retain, warn on, or turn off the supported regex wording checks independently of DLP and other security controls. It's on by default, so leaving it unset changes nothing. `enabled: false` turns it off. `action: warn` records wording findings without blocking. `action: block` keeps each surface's existing action. If `enabled: false` is set, it wins over `action`. With `warn` or `enabled: false`, wording matches no longer block, and local stdio MCP servers get no prompt-injection protection; see the configuration reference.

## Review repository-scan suppressions

`pipelock git scan-diff`, `pipelock audit`, and the GitHub Action apply the core DLP floor even when configured defaults are disabled. Inline `pipelock:ignore` markers and rule suppressions can't silence core findings, so synthetic test fixtures can start producing findings. Build synthetic values from fragments where you can, and keep path exclusions narrow.

## Reinstall containment and check reloads

After replacing the binary, rerun `pipelock contain install` with the same configuration, then `pipelock contain verify` and `pipelock contain doctor`. A binary swap alone doesn't replace every forwarder. Install now refuses runtime write paths the managed service can't use. See the [containment guide](/learn/pipelock-contain-guide/).

Strict sandbox cross-directory renames and hard links need a kernel that reports Landlock erratum 3 fixed; otherwise they stay denied with `EXDEV`, which isn't a proxy failure.

When automation needs to know whether a new policy became active, use `pipelock reload --status --json`. It reports the active policy identity and settings still waiting for a restart. A successful `systemctl reload` means evaluation finished, not that the candidate became active.

## Export Codex MCP environment variables

`pipelock codex install` now registers server environment variables by name in Codex's `env_vars` list instead of putting values on the command line. Export the required variables in the environment that launches Codex, including after a service or desktop restart. Install prints the names it needs and refuses missing values before changing anything. See the [Codex CLI guide](/learn/codex-cli-integration/).

## Check what upload inspection covers

Request scanning reads the text inside Office and ZIP uploads, within extraction limits. Files it can't open, or that go over the limits, keep their stated refusal or limits. With the built-in `warn` action an unreadable archive is still delivered; with `action: block` and `enforce: true` it's withheld.

HTTPS through the forward proxy (CONNECT) needs TLS interception, which is off in defaults and all {{< stat key="presets" >}} presets. Plain-HTTP forward proxy, reverse proxy and WebSocket client text are scanned without it. PDF text isn't extracted yet; PDF uploads only get the existing raw-byte scan. See [request body scanning](https://github.com/pipelab-org/pipelock/blob/v3.8.0/docs/configuration.md#request-body-scanning).

## Keep inspection and evidence limits visible

- Oversized complete JSON on forward, intercepted, and reverse HTTP paths can get bounded partial inspection. The body stays withheld until policy permits delivery, and evidence labels the inspection as partial.
- Fleet receipt reports default to v2; verifying fleet reports and Audit Packets is open source; producing fleet reports (Conductor) is Enterprise. Update report consumers that assume v1, and keep the full evidence and trusted keys.
- `pipelock discover` marks file-only MCP wrappers as `unconfirmed` and now exits nonzero when it reports unconfirmed coverage. Update scripts that expect exit 0. An integration entry doesn't prove the client used it.

For earlier versions, see the [Pipelock release notes](/learn/pipelock-release-notes/), which list every release post with its upgrade guide.
