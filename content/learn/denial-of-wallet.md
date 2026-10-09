---
title: "Denial of Wallet: AI Agent Cost Control and LLM Cost Abuse"
linkTitle: "Denial of Wallet"
subtitle: "How looping agents turn metered API access into spend, why per-session caps fail, and how subject-keyed AI agent budgets work."
description: "Denial of wallet is LLM cost abuse from looping agents. Learn why session caps fail and how subject-keyed AI agent budgets work."
date: 2026-07-31
faq:
  - q: "What is denial of wallet?"
    a: "Denial of wallet is an AI agent cost-abuse pattern where a looping, hijacked, or misconfigured agent turns metered API access into a bill. The agent may call tools, model APIs, search APIs, MCP servers, or paid SaaS endpoints until the budget is exhausted. The goal may be direct financial harm, noisy disruption, or a side effect of prompt injection that sends the agent into repeated work."
  - q: "How is denial of wallet different from rate limiting?"
    a: "Rate limiting usually controls request volume on a technical handle such as an IP, token, session, endpoint, or client connection. Denial-of-wallet defense has to control spend against the actor that owns the allowance. If the limit follows a disposable session id, the agent can reset it by starting a new session. A budget needs a billing principal, or the closest safe derived subject, so restarts and renamed agents do not buy fresh allowance inside the same budget window."
  - q: "Why do per-session AI agent budgets fail?"
    a: "A session id is a lifecycle handle. It is useful for protocol state, reconnects, and cleanup. It is not a stable identity. An agent that hits a per-session cap can open a new session, restart, or present a new self-declared name. If the budget key follows that handle, the cap resets with it."
  - q: "What changed in Pipelock v3.3 denial-of-wallet budgets?"
    a: "Pipelock v3.3 keys denial-of-wallet budgets by a derived subject instead of the MCP session id. Bound and configured-default agent authentication can contribute an agent component. Self-declared and matched identities collapse to a client-only bucket, so renaming yourself no longer buys a fresh allowance. The configured budget window still controls when allowance refreshes."
  - q: "Does subject-keyed budgeting cap spend across all time?"
    a: "No. It closes the reset path where a renamed or restarted agent gets a fresh allowance inside the same budget window. The configured window still controls refresh, and other paths outside the proxy-visible budget surface still need separate controls. Treat it as scoped cost control, backed by identity binding and egress enforcement."
  - q: "What should I remove before upgrading to Pipelock v3.3?"
    a: "Remove `max_retries_per_endpoint`, `fan_out_limit`, and `fan_out_window_seconds` from every `budget:` block. Earlier releases accepted those fields but did not enforce them. Pipelock v3.3 fails config load when they are still present, so operators do not get a green check for a limit the runtime does not enforce."
  - q: "Can I verify denial-of-wallet behavior myself?"
    a: "Yes. Run the Pipelock v3.3 binary against your config with `pipelock check --config /path/to/pipelock.yaml`, then test an agent that restarts or renames inside the configured window. The allowance should follow the derived subject, not the new session id. Use the v3.3 release notes and the playground to inspect the shipped behavior and evidence model."
learn_cat: concepts
level: deep
tags:
  - denial-of-wallet
  - cost-control
  - budgets
  - v3.3
---
Denial of wallet is what happens when an AI agent turns metered access into spend. The agent loops. A prompt injection points it at repeated work. A tool call retries too aggressively. Each action looks like normal API use, but the bill keeps climbing.

This is why AI agent cost control cannot stop at a per-session cap. LLM cost abuse is an identity problem as much as a rate problem. If the budget follows a handle the agent can throw away, the budget is paper.

Pipelock v3.3 changes the budget key from MCP session id to a derived subject. Renaming or restarting an agent no longer buys a fresh allowance inside the same configured window.

## What denial of wallet is

Denial of wallet is a cost-abuse attack against metered systems. In an agent deployment, the metered thing can be:

- model tokens
- tool calls
- hosted search
- browser sessions
- SaaS APIs
- MCP servers that forward to paid services
- webhook or sink delivery

The attack shape is simple:

1. The agent has permission to call something that costs money.
2. The agent is hijacked, poisoned, misconfigured, or caught in a loop.
3. The agent keeps calling the paid surface.
4. The runtime treats the calls as normal until the bill or quota is gone.

Some denial-of-wallet incidents are malicious. Some are plain failure loops. The control is the same: the runtime needs a budget that survives the cheap reset tricks.

For the broader egress threat model, see [Agent egress security](/learn/agent-egress-security/) and [AI egress proxy](/learn/ai-egress-proxy/).

## A session id is not an identity

A session id is a lifecycle handle. It exists so a protocol can track a connection, resume state, clean up resources, and attach events to one conversation.

That makes it useful operational plumbing. It does not make it a security or billing principal.

If an AI agent budget is keyed to a session id, the agent can reset the budget by changing the session lifecycle:

| Reset path | Why the cap fails |
|------------|-------------------|
| Open a new MCP session | The new session receives a new per-session allowance. |
| Restart the agent | The runtime sees fresh lifecycle state. |
| Rename the agent | A self-declared name becomes a cheap new bucket if the runtime trusts it. |
| Reconnect through a new client path | The old accounting state no longer matches the new handle. |

The architectural lesson is blunt: lifecycle state is not billing identity. Spend limits need to attach to the actor that owns the allowance, or to the safest derived subject available at the enforcement point.

## Why per-session caps fail AI agent cost control

Per-session caps look attractive because they are easy to implement. Every request already has a session. The runtime increments a counter. When the counter crosses the limit, it blocks.

That works until the agent controls the lifecycle.

An agent that hits its allowance can start again. A compromised agent can present a different name. A buggy wrapper can reconnect and accidentally mint a fresh bucket every time. In each case, the system did enforce the per-session cap. It enforced the wrong cap.

For denial-of-wallet defense, the useful question is:

> Does the same actor keep the same budget after a restart, reconnect, or rename inside the configured window?

If the answer is no, the control slows down cost abuse but does not close the reset path.

## The Pipelock v3.3 budget model

Pipelock v3.3 keys denial-of-wallet budgets to a derived subject instead of the MCP session id.

The subject is built from identity signals that are safe enough to carry budget meaning:

| Identity signal | Budget treatment |
|-----------------|------------------|
| Bound agent authentication | Can contribute an agent component to the subject. |
| Configured-default agent identity | Can contribute an agent component to the subject. |
| Self-declared agent name | Collapses to a client-only bucket. |
| Matched identity | Collapses to a client-only bucket. |

That last part matters. A self-declared name is useful metadata, but it is cheap for an agent to change. Pipelock does not let that name mint a fresh budget subject. It collapses those cases to a client bucket, so the allowance follows the safer derived subject.

`max_tool_calls_per_session` now limits per subject. The field name remains for configuration compatibility, but the enforcement key changed.

## The budget window still controls refresh

Subject-keyed budgets close the restart and rename reset path. They do not cap spend across all time.

`window_minutes` still controls when allowance refreshes. In v3.3, the denial-of-wallet window defaults to 30 minutes when unset. A long-lived session receives a fresh allowance every 30 minutes unless you set a different window.

`max_wall_clock_minutes` also changed meaning. It is now window-scoped active time, rather than session-lifetime wall clock. If you depended on session-lifetime behavior, set an explicit window that matches the operational intent.

This is the scoped guarantee:

- Renaming an agent no longer buys a fresh allowance.
- Restarting an agent no longer buys a fresh allowance.
- Opening a new session no longer buys a fresh allowance.
- The configured budget window still controls refresh.

That is the right shape for AI agent budget enforcement. It removes the cheap reset while leaving the operator in charge of the time window.

## Honesty in budget configuration

Pipelock v3.3 also removes three budget fields that earlier releases accepted but did not enforce:

- `max_retries_per_endpoint`
- `fan_out_limit`
- `fan_out_window_seconds`

A config that still sets any of those fields now fails load. The error names the field and the file.

That is an important product behavior. A security control should not accept a limit, show a clean config, then leave the runtime doing nothing with it. Removing an unenforced field changes no enforcement behavior. It changes the operator signal from false comfort to a hard fix.

Run the new binary against your config before upgrading:

```bash
pipelock check --config /path/to/pipelock.yaml
```

Use the actual production config path. The check tells you the exact offending field and file.

## Receipts and evidence, stated carefully

Cost controls need evidence. When a budget blocks a tool call, an operator needs to know which subject hit which limit, in which window, and under which policy.

Pipelock emits signed decision records and Audit Packets that can be verified offline against a key you choose to trust. That is the relevant edge: open implementation, self-hosted enforcement, and offline verification against a published or separately pinned key.

This is not a sole-in-market claim. Other systems, including Microsoft's Agent Governance Toolkit, also emit receipts. The useful question for operators is narrower:

- Can you run the enforcement point yourself?
- Can you inspect the policy and implementation?
- Can a verifier check the evidence offline?
- Does verification require a trust anchor outside the packet itself?

Pipelock v3.3 tightened that last point for trusted Audit Packet verification. Trusted verification now requires `--key` or `--expect-sha256`, so a packet cannot bless itself with its embedded key.

For the evidence layer, see [Action Receipt Spec](/learn/action-receipt-spec/), [Audit Packet Threat Model](/learn/audit-packet-threat-model/), and [Verifiable Egress Control](/learn/verifiable-egress-control/).

## How to try it

Start with the v3.3 release notes, then run the new binary against your config:

```bash
pipelock check --config /path/to/pipelock.yaml
```

If the check reports removed budget fields, delete them before rollout. Then test the behavior you care about:

1. Configure a small tool-call budget and a short explicit window.
2. Send calls until the subject hits the budget.
3. Restart or rename the agent inside that window.
4. Confirm the budget does not reset.
5. Wait for the configured window to refresh.
6. Confirm allowance returns on the window boundary.

Use the [Pipelock v3.3 release notes](/blog/pipelock-v330-release/) for the exact shipped behavior, and use the [playground](/playground/) to inspect public examples of Pipelock decisions without trusting marketing copy.

## Related guides

- [Pipelock v3.3 upgrade guide](/learn/pipelock-v330-upgrade/): operator runbook for the breaking changes.
- [Agent egress security](/learn/agent-egress-security/): outbound controls for credential leaks and unsafe tool traffic.
- [AI agent data loss prevention](/learn/ai-agent-data-loss-prevention/): where DLP fits in agent traffic.
- [MCP runtime security](/learn/mcp-runtime-security/): runtime controls for MCP sessions and tools.
- [What did my agent do?](/learn/what-did-my-agent-do/): how signed evidence answers incident questions.
- [Pipelock](/pipelock/): open-source agent firewall for MCP and agent traffic.
