---
title: "Why Pipelock Is an Egress Agent Firewall, Not an Inbound WAF"
linkTitle: "Egress vs. Inbound Agent Firewall"
seoTitle: "Egress Agent Firewall vs Inbound WAF"
subtitle: "For an AI agent the dangerous moment is not what arrives, it is what leaves. Pipelock controls the outbound effect instead of filtering every prompt at the door."
description: "Why Pipelock is an egress agent firewall, not an inbound WAF, and why blocking the outbound effect beats filtering prompts at the door for AI agents."
date: 2026-07-14
lastmod: 2026-07-14
learn_cat: concepts
level: intro
tags:
  - egress
  - agent-firewall
  - waf
  - prompt-injection
  - containment
related:
  - agent-egress-control
  - agent-firewall
  - verifiable-egress-control
faq:
  - q: "Is Pipelock an inbound firewall or a WAF?"
    a: "No. Pipelock is an egress agent firewall. A WAF inspects requests coming into a service and blocks malicious payloads at the door. Pipelock does the opposite: it controls what the agent is allowed to send out. For an AI agent, the attack is prompt injection in natural language that arrives through legitimate channels, which you cannot reliably filter at the input. The durable control is on the outbound effect, not the input."
  - q: "Why not just block malicious prompts before they reach the agent?"
    a: "Because prompt injection is semantic, not a structured payload. It hides in a web page, a ticket, a tool response, or a user message, and the syntax is often normal. Filtering every input becomes an enumeration problem: block one phrasing and the attacker rephrases, encodes, or splits it. Known markers are worth catching, and Pipelock does catch them in content it mediates, but input filtering cannot be the center of the model."
  - q: "Does Pipelock inspect anything inbound?"
    a: "Yes, on mediated paths. The fetch proxy scans fetched response content for prompt injection before the agent consumes it, and Pipelock scans MCP tool results and tool metadata for injection and tool-poisoning. That is inbound content inspection, not a classic inbound-request WAF sitting in front of an agent exposed as a network service."
  - q: "How do I make sure the agent cannot bypass Pipelock?"
    a: "Coverage is for mediated traffic, so the agent's traffic has to actually route through Pipelock. Blocking direct egress around the proxy is a deployment step, not a property of the binary. On Linux, pipelock contain install sets it up: it creates a separate low-privilege agent user and nftables owner-match rules so the agent's only route out is the Pipelock proxy, with direct egress dropped at the kernel. pipelock contain verify confirms the rules are live."
---

Pipelock is an egress agent firewall. Instead of trying to block malicious input on the way in, it controls what the agent is allowed to send out, because for an AI agent the dangerous moment is not what arrives, it is what leaves. This page explains why that inversion is deliberate, why inbound filtering is the wrong primary model for agents, and where inbound protection still fits.

## The question behind the word firewall

Security teams hear "firewall" and picture something inbound. A firewall, WAF, or IPS sits in front of a service. Traffic comes from the outside world toward the protected app. The control inspects requests before they reach the app and blocks malicious payloads at the door.

That is outside-in protection. It fits web applications, where many attacks have recognizable request shapes: SQL injection, cross-site scripting, known exploit signatures, or malformed protocol behavior. The web server is the thing being attacked, and the attacker sends requests into it.

AI agents invert that model. The agent is not only a server receiving input. It reads external content, calls tools, sends HTTP requests, invokes MCP servers, and runs with credentials. The dangerous event is rarely that a hostile packet reached the agent. The dangerous event is that the agent got talked into doing something with outbound effects.

That is why Pipelock is built as an egress agent firewall, not a WAF-style inbound firewall.

## Why inbound filtering is the wrong primary model

Prompt injection does not behave like a structured malware packet. It is natural-language instruction sitting in places the agent is supposed to read: a web page, a ticket, a search result, a tool response, an MCP server reply, or a user message. The channel is legitimate. The syntax is often normal. The attack is semantic and context-dependent.

Solving that by filtering every input before it reaches the agent turns into an enumeration problem. You write patterns for "ignore previous instructions," then the attacker rephrases. You block one formatting trick, then the instruction is split across paragraphs, hidden in quoted text, encoded, or dressed up as policy text. Known phrases are worth catching, and Pipelock catches known injection markers in content it mediates, but input filtering cannot be the center of the security model.

The conclusion is blunt: inspect inbound content, but do not bet the security model on recognizing every hostile instruction before the model sees it.

## Egress control: protect the consequence

Pipelock's stronger boundary is egress control. Rather than assume every bad instruction can be stopped on the way in, Pipelock focuses on the harmful effect on the way out.

A prompt injection matters when it produces an outbound consequence: exfiltrating a secret, reaching a cloud metadata endpoint such as `169.254.169.254`, POSTing data to an attacker-controlled server, invoking a destructive tool, or sending unsafe tool arguments to an MCP server. If the agent cannot carry out the harmful action, the injection has lost its practical effect.

The short framing: let it in, but don't let it out.

The most durable part of egress control is the destination-and-action check. An attacker can rephrase a prompt injection endlessly. It is much harder to rephrase the destination. A request trying to reach a link-local metadata address, a blocklisted domain, or a denied tool gets stopped on the pattern that is hardest to disguise: where the action is going and what it is asking to do. Content inspection on the way out (DLP for a secret sitting in a request body) is a second layer that helps, but it faces the same evasion pressure as inbound scanning. An attacker can encode or split a leaking secret the same way they rephrase an injection. So the destination-and-action policy carries the weight; content DLP backs it up.

Input filtering asks, "Can I recognize every instruction that might cause harm?" Egress control asks, "Is this action allowed to cross the boundary?" The second question is narrower, more concrete, and closer to what security teams need to prevent.

## The exit-guard analogy

An inbound filter is a guard at the front door frisking everyone for weapons. That works when the weapon is a metal object. For an agent, the weapon is a whispered instruction, and a con artist talks his way past the front desk because words do not look like a knife.

Pipelock puts the guard at the exit and checks what anyone tries to carry out.

The con man can talk his way in and convince an employee to pick up the files. He still has to get the briefcase out the door. At the exit, the guard checks the consequence: what is leaving, where it is going, and whether policy allows it.

## What Pipelock inspects inbound today

Pipelock is not blind to inbound content. It inspects content flowing into the agent's context on mediated paths.

For HTTP-style fetches, the fetch proxy scans fetched response content for prompt injection before the agent consumes it. For MCP, Pipelock scans tool results and tool metadata for injection and tool-poisoning patterns. A poisoned response can become the instruction that triggers a later leak, so the inbound side matters on those paths.

That is different from being a classic inbound-request WAF. Pipelock is not positioned as a service-fronting filter where arbitrary internet clients send requests into an agent-hosted web endpoint and Pipelock decides whether those requests reach the service. The core threat model is agent egress and tool traffic.

If you run a public web app, you still need web controls: WAF, auth, rate limits, request validation, app-layer authorization, and abuse handling. Pipelock covers the agent side: the traffic the agent sends, the tool calls it makes, and the responses it pulls into context through mediated paths.

## Capability separation and the mediated-traffic caveat

The clean Pipelock deployment separates capabilities. The agent environment holds secrets and does useful work, but it should not have direct network egress. Pipelock has network egress, but it should not hold agent secrets. The intended path to the internet and to MCP servers runs through Pipelock, where policy is enforced.

Two limits define what that buys you.

First, coverage is for mediated traffic: traffic that actually routes through Pipelock. If an HTTP request, WebSocket frame, MCP call, or tool result does not pass through Pipelock, Pipelock cannot inspect or block it.

Content visibility is part of this. Pipelock scans a request body only when it can see the body: the fetch endpoint, plaintext forward-proxy traffic, or a CONNECT tunnel with TLS interception turned on. On a plain CONNECT tunnel without interception, Pipelock sees the destination host but not the encrypted body, so on that path it enforces destination policy rather than body DLP. Turn on TLS interception to get body and response scanning on CONNECT traffic.

Second, blocking direct egress around Pipelock is deployment-enforced, not a property of the binary. The Pipelock binary enforces policy on traffic it mediates. It does not, on its own, rewire the host network so every process is forced through it. Operators enforce that with container networking, Kubernetes NetworkPolicy, firewall rules, or Pipelock's own containment command.

On Linux, `pipelock contain install` sets that up directly. It creates a separate low-privilege agent user and installs nftables owner-match rules so the agent's only route to the network is the Pipelock proxy. Direct egress from that user is dropped at the kernel, and `pipelock contain verify` confirms the rules are live. That turns "traffic should go through Pipelock" into "traffic can only go through Pipelock" for the contained user. It is still a deployment step you run, not something the binary does to your host by itself.

That distinction is the security model. Binary-enforced controls apply on the mediated path. Direct-egress prevention depends on how the agent is run.

## Where inbound may fit later

There is a reasonable future shape for inbound request filtering in hosted or multi-tenant agent deployments. An organization that exposes agent endpoints as network services could add an inbound agent-specific admission layer that combines normal API security with agent-specific context checks, signed mediator headers, and tenant isolation.

That would sit next to Pipelock's core model, not replace it. The main reason to deploy an agent firewall is still the egress problem: agents read untrusted content, hold useful authority, and take outbound actions. The boundary that matters most is the point where those actions leave the agent environment.
