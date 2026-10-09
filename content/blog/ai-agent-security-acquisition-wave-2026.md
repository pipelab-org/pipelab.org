---
title: "The AI Agent Security Acquisition Wave: What It Means for Buyers"
linkTitle: "AI Security Acquisition Wave"
date: 2026-04-12
author: "Josh Waldrep"
summary: "Six AI agent security deals announced in recent months (five closed, one pending). What the consolidation means for buyers, and why permissive licensing still matters."
description: "AI agent security acquisitions: Snyk, F5, Check Point, SentinelOne, Proofpoint. What the M&A wave means for buyers and why open-source matters."
tags: ["ai-security", "market", "pipelock"]
blog_cat: "industry"
---

Six deals announced in a handful of months. Five closed. One pending. Most of the startups on my "companies to watch" list from last summer are now part of someone else's platform or agreed to be.

If you were evaluating AI agent security tools in Q3 2025, there's a good chance at least one of the vendors on your shortlist no longer operates as an independent company. Some of them were acquired before their documentation finished loading in your browser tabs.

This post is a map of what happened, why it happened, and what it means if you're the person on the other side of those sales calls trying to pick a tool that will still be yours in a year.

## The deals

Here's the wave, in the order it broke. Prices are reported where disclosed.

| Startup | Acquirer | Date | Reported Price |
|---|---|---|---|
| CalypsoAI | F5 | 2025 | Reported ~$180M |
| Invariant Labs | Snyk | 2025 | Undisclosed |
| Lakera | Check Point | 2025 | Undisclosed |
| Prompt Security | SentinelOne | 2025 | Undisclosed |
| Acuvity | Proofpoint | 2026 | Undisclosed |
| Promptfoo | OpenAI | Announced 2026 | Undisclosed (pending close) |

A few notes on the table. Snyk's Invariant acquisition folded an MCP-focused runtime team into a developer security platform. Check Point's Lakera deal brought in one of the most cited prompt injection research groups. SentinelOne's Prompt Security pickup added a runtime AI security layer to an endpoint-first portfolio. F5's CalypsoAI acquisition brought guardrails into a traffic-layer vendor. Proofpoint's Acuvity pickup gave them agent posture in a portfolio that's mostly email. And the Promptfoo deal, still pending at the time of writing, would put one of the most widely used open-source eval frameworks under OpenAI's roof.

That's a lot of movement. It's also not slowing down.

## What's driving it

I don't think any of this is mysterious. Four things are happening at once.

**Every big security vendor needs an AI agent security story.** In 2024 you could show up to an enterprise sales call and say "we'll add it to the roadmap." In 2026 that answer loses the deal. Palo Alto, Cisco, F5, Check Point, Proofpoint, Snyk, CrowdStrike, SentinelOne: all of them have analyst calls where somebody asks "what's your agent security posture?" and the answer needs to be more than a slide.

**Buying is faster than building.** Runtime agent security is a moving target. Injection patterns change every time a new model ships. DLP rules have to keep up with new data exfiltration techniques. MCP just became a protocol most enterprises had never heard of, and now it's everywhere. Building a team from scratch to keep up with all of that takes 18 months. Buying a team that's already done it takes 18 weeks.

**Enterprise buyers want platforms, not point tools.** This is the part that feels obvious but gets underweighted. A CISO running a 3,000-person company does not want 14 AI security tools. They want one dashboard, one contract, one renewal conversation. The vendors that win are the ones who can say "it's already in the console you're using."

**The LLM firewall and agent security category is growing fast.** Whatever the exact size, it's crossed the threshold where incumbents feel they need a credible story. When a category enters that phase, the buying side of M&A gets aggressive.

Put those together and you get a wave. Startups that spent two years building specialized runtime tools get absorbed into larger platforms faster than anyone expected.

## What it means for buyers

Here's where it gets uncomfortable. If you were in the middle of a proof-of-concept with one of these vendors when the deal closed, you're now in a different conversation than the one you started.

**The point tool you evaluated six months ago is now part of a platform you may not use.** If you picked Lakera because you liked their research team and their API, you're now buying a Check Point relationship. If you were running Prompt Security because it was easy to drop in, you're now on SentinelOne's roadmap. That's not inherently bad. But it's a different product.

**Your vendor's roadmap is now set by the acquirer, not the founding team.** The people who sold you on the tool are probably still around for a vesting cycle. Their priorities, however, are now set by someone who has different customers, different integration requirements, and a different definition of what "done" looks like for an AI security feature. Roadmap items that mattered to you might get deprioritized in favor of integration work with the acquirer's existing stack.

**Integration with the acquirer's platform becomes the focus.** Standalone improvements slow down. The next 12 months of engineering time at these acquired companies goes into making sure the product fits into the mothership's console, SSO, billing, and data pipeline. That's work that matters to the acquirer. It may not matter to you.

**Pricing often gets repriced post-acquisition.** Acquired products tend to get repositioned against the acquirer's existing line card, which can mean bundling into larger enterprise suites or different tier structures than the original standalone pricing. Sometimes existing customers get a grace period. Sometimes they don't.

**Apache 2.0 code sidesteps the worst part of this failure mode.** Open-source projects can still get acquired. Promptfoo is in that table. What an Apache 2.0 license gives you is structural protection for the code that's already public: if the owning entity changes hands and the new direction doesn't suit you, the released code is still permissively licensed and forkable. You can run the last good release indefinitely. You can audit it. Whether a given project can actually be run offline or airgapped depends on how it's built, not on the license alone. That's a smaller promise than "immune to acquisition," but it's the one that actually holds.

## The case for open source and self-hosted

I build an open-source project in this space, so take this with whatever salt you think is fair. But the argument doesn't need much dressing up.

Apache 2.0 code is structurally protected in a way a closed-source product isn't. If the commercial entity behind a project gets acquired and the new owner changes the terms, the existing code is still yours. You can fork it. You can run the last good release indefinitely. You can audit every line. Whether a given open-source project is also architected for offline or airgapped operation is a separate question that depends on the specific tool, but the license at least keeps the door open for that kind of review and deployment.

The trade-off is real and I'll name it. Open-source commercial projects are usually backed by small teams. Support is whatever the maintainers offer, which is very different from what you get when you call a platform vendor's support line and have a dedicated team show up. If you need that level of hand-holding, a platform vendor may be the right answer for you, and that's fine.

But if you're an engineering team that values auditability, the right to fork, and not having your stack quietly become someone else's product roadmap, a permissively licensed project is the only category that gives you those protections at the code level.

A few independent projects worth knowing about:

- [Pipelock](/pipelock/) (the one I work on). Runtime AI agent firewall (Apache-2.0 core; Enterprise features under ELv2). DLP and injection detection as a local proxy.
- iron-proxy, a community project for MCP server isolation.
- Meta's [LlamaFirewall](https://github.com/meta-llama/PurpleLlama), a research-grade guardrails toolkit.
- NVIDIA's [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails), a programmable rails framework for LLM apps.
- Docker's [MCP Gateway](https://github.com/docker/mcp-gateway), which adds a broker in front of MCP servers.
- [agentgateway](https://github.com/agentgateway/agentgateway), a Linux Foundation project focused on agent-to-agent routing.

Any of these can still change hands, as Promptfoo's pending OpenAI deal shows. What's different is that every release under a permissive license remains forkable. If a new owner takes the project in a direction you don't like, you can keep running the version you have and a community can pick up the previous tree. That's the durable protection, not immunity.

## The content decay problem nobody is talking about

I'll be honest about a meta-effect of all this consolidation that doesn't get enough attention. Acquired product domains go stale. It's an almost universal pattern.

The marketing site gets moved to a subpath on the acquirer's domain, or redirected entirely. Documentation stops updating. Blog posts from the founding team disappear or get archived behind a "resources" nav that nobody clicks. Changelog pages go quiet. Community Slack channels get wound down. Within 18 months, the product you're running has a public footprint that looks abandoned even if the code is still being maintained.

The search consequences of this are real. Queries for "lakera injection patterns" or "prompt security MCP" will increasingly return stale blog posts, broken links, or redirects into generic platform pages that don't answer the question you asked. Google's rankings for those queries will decay because the pages stop getting updated. Developers looking for documentation will end up on Stack Overflow answers from 2024 and third-party tutorials from people who no longer use the tool.

This is a real cost of buying an acquired product. You're not just buying what the product does today. You're betting on what stays: the docs, the community, the blog, the research output, the conference talks, the third-party integrations, the Stack Overflow answers. Most of that does not survive an acquisition intact.

If you're evaluating a tool right now and the company is rumored to be in acquisition talks, factor content decay into your decision. The product may ship a great feature next quarter. The documentation for it may never get written.

## Where this ends up

My read on the next 12 months:

Two camps will finish forming. On one side, enterprise platforms: Palo Alto, Cisco, F5, Check Point, Proofpoint, Snyk, SentinelOne, and probably one or two more who haven't bought anyone yet but are shopping. They'll offer bundled agent security inside existing SSE, CASB, and code security products. They'll win most enterprise deals because of procurement gravity and because they already have the relationships.

On the other side, open source and independent alternatives. Smaller projects, permissively licensed, funded by small commercial teams or community contributions. They'll win with engineering-led orgs, regulated industries that need airgapped deployments, and teams that got burned once by a vendor acquisition and don't want to repeat the experience.

Mid-market vendors in between will get consolidated faster than most people expect. If you're a Series A AI security startup right now with one or two enterprise logos and a good engineering team, you are an acquisition target whether you planned to be or not. The platforms need the talent and the story.

Specialized runtime tools (proxies, scanners, policy engines that hook into system calls or network flows) will stay independent longest. They're hard to bolt onto a platform without losing focus, and the teams that build them tend to be engineering-driven rather than sales-driven. That's the category I think has the most headroom to stay independent, partly because it's the category Pipelock lives in and I see the shape of the work every day.

The buyers who come out ahead from this wave are the ones who ask one question before signing anything: "what happens to this product if you get acquired?" If the honest answer is "it depends on the acquirer," factor that into your risk model. If the honest answer is "the core is Apache 2.0 and the community can fork if the terms change," you know what structural protection you have even if the commercial side evolves.

## Further reading

- [AI Agent Security: The Complete Guide](/learn/ai-agent-security/)
- [AI Agent Security Tools](/learn/ai-agent-security-tools/) (independent + commercial)
- [Open-Source AI Firewalls Compared](/learn/open-source-ai-firewall/)
- [Pipelock vs commercial alternatives](/compare/)
- [Pipelock on GitHub](https://github.com/luckyPipewrench/pipelock)
- [Pipelock product page](/pipelock/)

If you're evaluating tools right now and want to talk through the landscape with someone who isn't selling you an enterprise platform, my email is in the footer. I do have my own project in the mix, but I'm happy to be a sounding board even if you pick a competitor.
