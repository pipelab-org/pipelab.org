---
title: "Chatbot Security: Risks, Defenses, and Where Network Controls Fit"
linkTitle: "Chatbot Security"
seoTitle: "Chatbot Security: Controls and Network Defense"
subtitle: "What goes wrong with AI chatbots, what stops the failures, and where chatbot security ends and agent security begins."
description: "Chatbot security guide: credential leaks, prompt injection, jailbreaks, oversharing, and the network-layer controls that catch what the model misses."
date: 2026-04-18
lastmod: 2026-04-23
faq:
  - q: "What is chatbot security?"
    a: "Chatbot security is the practice of protecting users, operators, and downstream systems from the failures and attacks unique to chatbots that use large language models. Major risk categories are credential and PII leaks (the chatbot reads sensitive data and sends it somewhere it should not), prompt injection (a user or upstream system manipulates the chatbot's instructions), jailbreaks (the chatbot is convinced to ignore its safety training), oversharing (the chatbot reveals system prompts or backend data), and abuse of any tools or APIs the chatbot can call."
  - q: "What are the main chatbot security risks?"
    a: "The most-cited chatbot security risks are: 1) sensitive data exposure (PII, credentials, business data leaked to the model or to logs), 2) prompt injection and indirect prompt injection through retrieved content, 3) jailbreak prompts that bypass safety training, 4) hallucinations that produce confidently wrong answers, 5) confused-deputy attacks where the chatbot calls a tool with attacker-influenced parameters, 6) tool abuse when the chatbot has APIs or actions it can call, 7) supply-chain compromise of model providers or hosted services, and 8) inadequate logging and audit, which makes any of the above invisible after the fact."
  - q: "Are AI chatbots safe to use?"
    a: "AI chatbots are safe to use for low-stakes tasks. Safety degrades as the chatbot is given access to sensitive data, allowed to call tools or make outbound network requests, or relied on for decisions that have legal or financial consequences. The right question is not 'is this chatbot safe' but 'is this chatbot safe for this specific task with this specific data and these specific permissions.' Treat the chatbot's output as untrusted user input by default, and put security controls between the chatbot and any system it can affect."
  - q: "How is chatbot security different from agent security?"
    a: "Chatbot security mostly covers a single conversational surface: the chat interface, the model, the messages going in and out. Agent security covers a chatbot that can also act: call tools, make HTTP requests, run shell commands, query databases, write to files. Every additional capability is an additional attack surface. Chatbot security tends to focus on prompt-level controls and content moderation. Agent security adds runtime network controls, MCP traffic scanning, sandboxing, and signed evidence of what the agent did. If your chatbot can take actions, you need agent security too."
  - q: "Can a chatbot leak sensitive data?"
    a: "Yes. Chatbots can leak sensitive data through several channels: the user accidentally pastes secrets into the prompt and the chatbot logs or echoes them; the chatbot is given access to a knowledge base containing sensitive content and surfaces it in answers; the chatbot's training data or RAG sources contain leaked credentials and the model regurgitates them; the chatbot calls a tool with sensitive parameters and the tool logs them; or a prompt injection convinces the chatbot to send sensitive content to an attacker-controlled destination. DLP scanning at the network layer catches the last category and flags many of the first."
  - q: "What is prompt injection in chatbots?"
    a: "Prompt injection is when content the chatbot reads (a user message, a retrieved document, a tool response, a webpage) contains instructions that override the chatbot's intended behavior. Direct prompt injection comes from the user typing manipulative instructions. Indirect prompt injection is more dangerous: it comes from content the chatbot fetches on the user's behalf, like a webpage or a tool result. The chatbot has no reliable way to tell instructions apart from data, so injected instructions often work. Defending requires content scanning at the boundary, not at the model."
learn_cat: injection
level: intro
tags:
  - chatbot
  - explainer
---
## What chatbot security means

Chatbot security is the practice of protecting users, operators, and downstream systems from the failures and attacks unique to chatbots that use large language models. The boundary is wider than it looks: a chatbot is a model plus a prompt plus everything it reads plus everything it can do.

The main risk categories:

- **Credential and PII leaks**: the chatbot reads sensitive content and sends it somewhere it should not.
- **Prompt injection and indirect prompt injection**: content the chatbot reads (user message, retrieved document, tool response, webpage) overrides its intended behavior.
- **Jailbreaks**: adversarial prompts that bypass safety training.
- **Oversharing**: the chatbot reveals system prompts, internal context, or backend data.
- **Hallucinations**: the chatbot confidently states things that are not true and the user acts on them.
- **Tool abuse**: when the chatbot can call APIs or take actions, those calls become an attack surface.
- **Supply-chain compromise**: the model provider or hosted service is compromised.
- **Inadequate logging and audit**: any of the above is invisible after the fact.

Each category has a defense pattern. The defenses combine; no single control catches everything.

## Are AI chatbots safe to use?

AI chatbots are safe to use for low-stakes tasks. Safety degrades as the chatbot is given access to sensitive data, allowed to call tools or make outbound network requests, or relied on for decisions that have legal or financial consequences.

The right question is not *"is this chatbot safe"*. The right question is **"is this chatbot safe for this specific task with this specific data and these specific permissions."** Treat the chatbot's output as untrusted user input by default, and put security controls between the chatbot and any system it can affect.

## Defending against the major chatbot security risks

### Credential and PII leaks

DLP (data loss prevention) scanning on every outbound request from the chatbot catches credential patterns (API keys, tokens, private keys), payment card numbers, and other regex-detectable secrets. The right place for DLP is at the network boundary, not inside the chatbot, because attackers can encode secrets to evade prompt-level filters.

For PII (names, emails, social security numbers), the answer is more about input gating: do not give the chatbot access to PII it does not need. If access is needed, log every retrieval, scope by user, and audit who saw what.

### Prompt injection and indirect prompt injection

A model cannot reliably tell instructions apart from data. The defense is to scan the data (every webpage the chatbot fetches, every tool response it reads, every document it retrieves) for known injection patterns before the chatbot sees them. Pattern matching is imperfect and arms-race; the goal is to raise the cost of an attack, not to claim 100% coverage.

See [prompt injection defense at the network layer](/learn/prompt-injection-network-defense/) for the technical pattern, and [LLM prompt injection](/learn/llm-prompt-injection/) for the broader category.

### Jailbreaks

Jailbreak attempts come through the user message. Refusing to answer is a model-layer response and not a security control. A jailbreak that succeeds means refusal failed. Real defense is layered: input filtering for known jailbreak patterns, monitoring for unusual response content (refusals that turn into compliance), and limiting what a jailbroken chatbot can actually do downstream.

If your chatbot has tool access, the network layer matters more than the prompt layer. A jailbroken chatbot that cannot call dangerous tools because the tool policy blocks them is a much smaller incident than one that can.

### Oversharing system prompts and backend data

Set the chatbot's system prompt with the assumption that users will see it. Anything truly sensitive does not go in the system prompt. Backend data the chatbot can access should be scoped by user identity at the data layer, not by trusting the chatbot to filter.

### Hallucinations

Not strictly a security risk, but operationally similar: a confident-but-wrong answer that the user acts on can cause real damage. Guard with citations to source material, RAG over a curated knowledge base, retrieval result verification, and human-in-the-loop for any high-stakes action.

### Tool abuse and confused deputy

The moment a chatbot can call a tool, the tool's permissions become the chatbot's permissions. A tool that holds an API token and accepts model-influenced parameters is a *confused deputy*: the model can be tricked into invoking the tool on the attacker's behalf with privileges the attacker should not have.

The defenses are pre-execution allow/deny rules on tool calls, argument validation, scoping tools to the minimum permission they need, and runtime inspection of every tool call before it runs.

### Supply-chain compromise

Pin model versions when possible. For hosted chatbots, monitor the provider's security posture and incident response. For self-hosted chatbots, scan dependencies (the SDK, the model file, any containers) and watch for tampering. Signed model checkpoints and reproducible builds help where they are available.

### Inadequate logging and audit

Every chatbot interaction needs to be loggable. At minimum: timestamp, user identity, prompt, response, any tools called and their arguments, any external content retrieved, any safety filter outcomes. Hash-chained signed audit logs are a stronger version of this for regulated environments.

## Where chatbot security ends and agent security begins

Chatbot security covers the conversational surface. Agent security extends to chatbots that can also *act*: call tools, make HTTP requests, run shell commands, query databases, write to files.

Every additional capability is an additional attack surface. Chatbot security tends to focus on prompt-level controls and content moderation. Agent security adds:

- Runtime network controls (egress filtering, DLP on every outbound request)
- MCP traffic scanning (tool descriptions and tool responses scrutinized)
- Process sandboxing (filesystem and syscall isolation)
- Signed evidence of what the agent did (audit trail you can hand to a compliance reviewer)

If your chatbot can take actions, you need both layers. See [What is an agent firewall?](/agent-firewall/) for the network-layer pattern.

## Practical chatbot security checklist

For any chatbot deployment that touches sensitive data or has tool access:

- [ ] DLP scanning on every outbound request from the chatbot's host
- [ ] Prompt injection scanning on every piece of content the chatbot reads (RAG sources, tool responses, fetched URLs)
- [ ] Tool allowlist with explicit deny for dangerous categories (file writes outside scoped paths, network egress to unknown destinations, environment dumps)
- [ ] System prompts authored under the assumption that users will see them
- [ ] Backend data access scoped at the data layer per user identity, not by trusting the chatbot to filter
- [ ] Citations or source attribution on factual answers
- [ ] Hash-chained audit log capturing prompts, responses, tool calls, and retrieved content
- [ ] Rate limits per user and per tool to bound any single incident
- [ ] Kill switch the operator can flip without restarting the chatbot
- [ ] Signed evidence trail for any high-stakes action

If the chatbot is also an agent, add the controls in the [AI agent security and hardening](/learn/ai-agent-security/) checklist.

## Related guides

- [What is an agent firewall?](/agent-firewall/): the network layer that catches what the model misses.
- [Prompt injection defense at the network layer](/learn/prompt-injection-network-defense/): pattern-matching detection at the proxy.
- [LLM prompt injection](/learn/llm-prompt-injection/): the category, the variants, and defense-in-depth.
- [AI agent security and hardening](/learn/ai-agent-security/): the broader checklist when the chatbot can also act.
- [MCP security best practices](/learn/mcp-security/): the checklist for MCP-enabled chatbots.
- [Pipelock](/pipelock/): the open-source agent firewall.
