---
title: "Self-Hosted Sure with Pipelock: Secure AI Assistant Egress"
linkTitle: "Self-Hosted Sure + Pipelock"
subtitle: "Sure ships Pipelock as a first-class Helm chart component. A forward proxy and MCP reverse proxy gate assistant traffic."
description: "Self-hosted Sure guide for enabling Pipelock in Helm, gating external AI assistant egress, and validating the chart guard."
date: 2026-04-28
cta_copy: "Deploying Sure with the external AI assistant?"
cta_secondary_label: "Chart README"
cta_secondary_href: "https://github.com/we-promise/sure/blob/main/charts/sure/README.md#pipelock-ai-agent-security-proxy"
faq:
  - q: "What does Sure ship for self-hosted AI security?"
    a: "Starting with v0.6.9, Sure's official Helm chart at charts/sure ships Pipelock as a first-class optional deployment, and the repository runs a Pipelock security scan plus deployment-contract checks in its own CI. When you enable the external AI assistant feature, you can also enable Pipelock with a single values block to gate outbound LLM traffic and inbound MCP tool traffic."
  - q: "Do I need Pipelock to run Sure self-hosted?"
    a: "No. Sure runs without Pipelock unless you turn on the external AI assistant feature. For that path, the chart's pipelock.requireForExternalAssistant: true guard makes helm template and helm install fail if the assistant is enabled while Pipelock is disabled."
  - q: "What does Pipelock scan in the Sure deployment?"
    a: "Outbound requests from Sure's AI assistant get DLP scanning for credentials and financial identifiers, plus prompt injection detection on responses. Inbound MCP tool traffic gets tool poisoning and rug-pull drift detection. The Pipelock pod runs as a separate deployment in the same namespace, sharing nothing with Sure's web pods."
  - q: "Where does Pipelock live in the Sure Helm chart?"
    a: "In a top-level pipelock: values block at charts/sure/values.yaml, with dedicated templates for the deployment, service, ingress, configmap, PodDisruptionBudget, and ServiceMonitor. The chart pins Pipelock 3.4.0 by tag and multi-architecture image digest. Operators can override the pin in their values file after testing."
  - q: "What does this integration not cover?"
    a: "It protects the external assistant's LLM and MCP traffic paths. It does not replace Sure application hardening, database access controls, Kubernetes NetworkPolicy, secret management, or operator review of which MCP servers are exposed."
learn_cat: operator
level: deep
tags:
  - sure
  - helm
  - kubernetes
  - self-hosting
---

## Inside the Sure chart

[Sure](https://sure.am/) is an open-source personal finance app maintained at [we-promise/sure](https://github.com/we-promise/sure). It is a community-maintained fork of Maybe Finance, with a Rails 8 app, Sidekiq workers, optional Postgres and Redis, and a first-party Helm chart at [`charts/sure`](https://github.com/we-promise/sure/tree/main/charts/sure).

Starting with v0.6.9, Sure's chart ships Pipelock as a first-class deployable component. Self-hosters running Sure with the external AI assistant feature get a security boundary between the assistant and the LLM provider or MCP servers it talks to, without rolling their own proxy.

## The egress gap Pipelock closes

Sure's external AI assistant feature lets a self-hoster connect an LLM provider to the app for natural-language queries over financial data. That introduces an outbound network path from inside the cluster to a third-party LLM API, plus optional MCP servers feeding tools to the assistant. Two security exposures follow.

**Outbound credential and PII leakage.** The AI assistant can read account and transaction data exposed to it by the app. A poisoned tool description or a crafted prompt can coax the assistant into including sensitive data in a tool argument. The request leaves the cluster through the LLM API endpoint. Without content scanning at the egress layer, the operator has no last-hop check before the data leaves.

**MCP tool poisoning and rug-pull.** Third-party MCP servers can hide instructions in tool descriptions or change tool semantics across sessions. The assistant follows the description it sees. An MCP server an operator added in good faith can turn a benign-looking tool into one that asks for sensitive account data.

Pipelock sits between Sure's assistant and the network. The forward proxy scans outbound requests. The MCP reverse proxy scans inbound tool definitions and responses. Both run as a separate deployment in the same namespace, sharing nothing with the Sure web pods.

## Enabling Pipelock

The chart's `pipelock:` values block is disabled by default. Minimum config to turn it on:

```yaml
pipelock:
  enabled: true
  mode: balanced
  requireForExternalAssistant: true
```

`requireForExternalAssistant: true` is the safety guard. With that guard set, `helm template` and `helm install` fail if `rails.externalAssistant.enabled=true` and `pipelock.enabled=false`. Operators can make the assistant path depend on the security layer instead of relying on a checklist.

`mode` controls Pipelock's enforcement posture:

- `strict`: blocks on anything Pipelock flags. Highest false-positive rate. For high-sensitivity deployments.
- `balanced`: default. Blocks high-confidence detections, warns on lower-confidence ones.
- `audit`: logs every detection, blocks nothing. For initial rollout to measure traffic before enforcing.

The current Sure chart pins Pipelock `3.4.0` by tag and multi-architecture image digest for stable installs. Override the pin in your values file only after testing a newer Pipelock release against your assistant traffic, and read the Pipelock release notes for that version first.

## Pipelock in Sure's own CI

The integration is not only a chart option. The upstream repository runs a `Pipelock Security Scan` workflow on every pull request and shows its badge at the top of the README. That workflow runs the Pipelock GitHub Action against the repository, then validates the deployment contract it ships: `pipelock check` against the repository's `pipelock.example.yaml`, and `pipelock test --fail-on-gap` over the attack categories the assistant path must block. A chart change that weakens the shipped Pipelock configuration fails Sure's CI before it can reach a self-hoster.

## Chart pieces Pipelock renders

Setting `pipelock.enabled: true` renders these chart components in the same namespace as Sure:

- **Deployment** running the Pipelock binary with two listeners.
- **Service** exposing port 8888 (forward proxy) and port 8889 (MCP reverse proxy).
- **ConfigMap** with the rendered `pipelock.yaml` from chart values.
- **Optional Ingress** for external MCP clients reaching the reverse proxy.
- **Optional ServiceMonitor** for Prometheus scraping `/metrics` on the forward proxy.
- **Optional PodDisruptionBudget** to protect Pipelock during node drains.

Sure's web and worker pods route their outbound traffic to Pipelock's forward proxy via `HTTPS_PROXY` env wiring that the chart installs when `pipelock.enabled=true`.

## Verify the install

From a checkout of `we-promise/sure`, build the chart dependencies and render the guard path before installing:

```bash
helm dependency build charts/sure
```

```bash
helm template sure charts/sure \
  --set rails.externalAssistant.enabled=true \
  --set pipelock.enabled=false \
  --set pipelock.requireForExternalAssistant=true
```

That command should fail with the chart guard because the external assistant is enabled without Pipelock. Then render the protected path:

```bash
helm template sure charts/sure \
  --set rails.externalAssistant.enabled=true \
  --set pipelock.enabled=true \
  --set pipelock.requireForExternalAssistant=true
```

After install, check that the Pipelock deployment, service, and configmap exist in the Sure namespace:

```bash
kubectl get deploy,svc,cm -n <namespace> -l app.kubernetes.io/component=pipelock
```

## What this does not cover

This integration protects the external assistant path. It gates outbound LLM requests through the forward proxy and inbound MCP traffic through the reverse proxy.

It does not replace Sure application hardening, database access controls, Kubernetes NetworkPolicy, secret management, or operator review of which MCP servers are exposed. If you set `MCP_API_TOKEN` directly through environment variables, Helm cannot infer that from the `rails.externalAssistant` values block. In that case, keep `pipelock.enabled=true` as an explicit deployment rule.

## Going further

The full Pipelock options surface (trusted domains, MCP tool redirect profiles, ingress, ServiceMonitor, extraConfig escape hatches) lives in the chart README:

- [Sure chart README, Pipelock section](https://github.com/we-promise/sure/blob/main/charts/sure/README.md#pipelock-ai-agent-security-proxy)
- [Sure product site](https://sure.am/)
- [Sure documentation site](https://docs.sure.am)
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock) for the firewall itself
- [Pipelock license setup](/learn/license-setup/) if the deployment uses Pro features

If you're deploying Sure with Helm and you have turned on the external AI assistant, turn on Pipelock and set the guard. The chart already wired the deployment path.
