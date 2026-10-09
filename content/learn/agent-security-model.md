---
title: "Agent Firewall, Guardrails, Sandbox: Defining the Category"
linkTitle: "Agent Firewall vs Guardrails vs Sandbox"
subtitle: "The terms get used interchangeably. Here is the category drawn cleanly, by what each control actually does."
description: "Agent firewall, guardrails, and sandbox compared as four security functions: prevention, detection, containment, and evidence. What each does and misses."
date: 2026-06-13
lastmod: 2026-08-08
learn_cat: concepts
level: deep
tags:
  - agent-firewall
  - concepts
  - evidence
faq:
  - q: "What is the difference between an agent firewall, guardrails, and a sandbox?"
    a: "They sit at different points and do different jobs. Guardrails run inside or next to the model and filter prompts and completions. An agent firewall sits on the network and tool path and mediates what the agent sends and receives. A sandbox isolates the process so the agent cannot reach the network or filesystem except through approved paths. None of the three is a substitute for the others, and none of them produces independent evidence of what happened, which is the fourth function most stacks skip."
  - q: "Should I avoid AI firewalls because they can be bypassed?"
    a: "Every layer can be bypassed, including sandboxes. That is an argument for an evidence layer, not against the other three. The honest position is that prevention and detection reduce risk on mediated traffic, containment is enforced by deployment, and evidence makes the mediated fraction measurable so you can see what actually crossed. A control that claims it cannot be bypassed is the one to distrust."
  - q: "What are the four functions of agent security?"
    a: "Prevention stops a known-bad action before it runs. Detection identifies threats in traffic the control can see. Containment forces the agent's traffic through the control so there is no path around it. Evidence produces a signed record outside the agent runtime of what the other three observed. The first three reduce risk; the fourth lets you verify and audit the recorded decisions."
  - q: "Which functions does Pipelock cover?"
    a: "Pipelock's binary performs prevention (tool policy, blocklists, kill switch) and detection (the scanning pipeline for DLP, injection, and SSRF) on mediated traffic. Containment is deployment guidance: you enforce it with host containment, container networking, or network policy, and Pipelock ships a self-test that attempts the bypass and confirms it is blocked. Evidence is the layer Pipelock owns: signed receipts for mediated decisions that verify offline against a pinned key. Pipelock does not claim to be all four."
  - q: "Is runtime security the same as an agent firewall?"
    a: "Runtime security is the umbrella for controls that act while the agent runs, as opposed to static review of code or config before it runs. An agent firewall is one runtime control, the one on the network and tool path. The four-function model (prevention, detection, containment, evidence) describes what any runtime stack needs, regardless of which product names a vendor uses."
---

"Agent firewall," "runtime security," "guardrails," and "sandbox" get used as if they mean the same thing. They do not, and the blur is why the skeptical takes land. "Should you even bother with AI firewalls, they all get bypassed" reads as insight precisely because nobody drew the lines. Once you define the category by what each control actually does, the question answers itself.

Agent security is four functions, not four products: prevention, detection, containment, and evidence. A real deployment needs all four. Most stacks ship the first three and skip the fourth.

## The four functions

### Prevention

Stop a known-bad action before it runs. A tool-call policy that denies `rm -rf` or a reverse shell, a domain blocklist, a kill switch that halts everything. Prevention is the cheapest control when you know the shape of what you want to stop.

What it cannot do: catch what it has never seen. Prevention works against enumerated bad actions. A novel exfiltration route or an action that looks legitimate passes, because there is no rule for it yet.

### Detection

Identify threats in traffic the control can see. Scan outbound requests for credentials, scan tool results for prompt injection, scan resolved addresses for SSRF. Detection is where most of an agent firewall's work happens, because agent traffic is the channel attacks actually travel through.

What it cannot do: see traffic that does not pass through it, or recognize an attack that matches no pattern. Detection on mediated traffic is strong; detection of a semantically novel injection that no signature describes is not.

### Containment

Force the agent's traffic through the control so there is no path around it. This is process and network isolation: the agent account cannot reach the internet except through the proxy, enforced by container networking, host containment, an OS sandbox, or network policy.

What it cannot do: guarantee its own integrity. Every sandbox can be escaped given the right bug. Containment raises the cost of bypass; it does not reduce it to zero. Treating containment as a guarantee is the mistake the skeptics are right to call out.

### Evidence

Produce a signed record of what the other three functions observed. This is not a log the agent could have written. It is a cryptographically signed receipt of each mediated decision that survives outside the agent runtime and verifies against a pinned key. The signature proves who signed the record and that it has not changed. It does not prove the operator recorded every action.

What it cannot do: prove completeness. A verified receipt chain proves the decisions it contains were genuine and untampered. It does not prove that nothing was missed. Evidence makes the mediated fraction measurable, which is a different and more honest claim than "nothing got through."

## Where the familiar terms land

- **Guardrails** are prevention and detection applied inside or beside the model call. They filter prompts and completions. They do not see the network, and they cannot contain a process.
- **Agent firewall** is prevention and detection on the network and tool path. Pipelock is an agent firewall. It mediates what the agent sends and what tool servers send back.
- **Sandbox** is containment. Docker, gVisor, Firecracker, an OS jail. It isolates the process but inspects no content.
- **Runtime security** is the umbrella over all of it, as opposed to static review of code and config before anything runs.

None of these terms names the evidence function, which is why it keeps getting skipped.

## Where Pipelock fits

Pipelock's binary performs **prevention** (tool policy, blocklists, kill switch) and **detection** (the scanning pipeline) on mediated traffic. Both are enforced by the binary on traffic that passes through it.

**Containment** is deployment guidance. Pipelock does not isolate the process by itself; you enforce that with host containment, container networking, or network policy. What the binary does ship is a self-test (`pipelock contain verify`) that attempts egress around the proxy from the contained account and confirms the path is blocked. The control is yours to deploy; the check that it worked is built in.

**Evidence** is the function Pipelock owns. Mediated decisions can emit signed receipts that verify offline against a pinned key and report what was confirmed versus claimed. Pipelock does not assert that it is your sandbox or that nothing bypassed it. The receipts make the mediated fraction measurable without claiming to cover unseen actions.

For the architectural companion to this functional model, mapping the four functions onto where you actually deploy controls, see [agent security control layers](/learn/agent-security-control-layers/). For the product-category buyer's map, see [AI agent security categories](/learn/ai-agent-security-categories/).

## Binary-enforced versus deployment-enforced

The distinction runs through the whole model and it is the line skeptics are right to demand:

- **Binary-enforced:** prevention and detection on mediated traffic, and the evidence receipts. These are properties of the Pipelock binary.
- **Deployment-enforced:** containment. This depends on how you isolate the agent, not on the binary alone. Pipelock states this plainly rather than implying the binary sandboxes the agent.

A vendor that blurs these two is selling the blur. The four-function model exists so you can ask, for any control, which function it serves and whether the property is enforced by the software or by how you deployed it.

## Where to go next

- [What Pipelock claims and does not claim](/learn/non-bypass-doctrine/) for the honest statement of guarantees
- [Known limitations register](/learn/known-limitations/) for the standing list of what Pipelock does not catch
- [Action receipt spec](/learn/action-receipt-spec/) for the evidence format and verifier
- [The agent firewall](/agent-firewall/) for Pipelock's architecture
