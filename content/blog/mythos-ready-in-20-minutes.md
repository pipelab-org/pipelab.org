---
title: "What CSA, SANS, and OWASP Just Told Every CISO About Runtime Agent Security"
linkTitle: "Mythos-Ready Runtime Controls"
date: 2026-04-13
author: "Josh Waldrep"
summary: "A joint briefing from CSA, SANS, and OWASP lays out 11 priority actions for the post-Mythos threat environment. Four of them describe runtime agent controls in detail but name zero tools. Here is what they are asking for."
description: "CSA, SANS, and OWASP published a Mythos-Ready playbook. Four priority actions call for egress filtering and machine-speed containment."
tags: ["ai-security", "pipelock", "mythos", "owasp"]
blog_cat: "industry"
---

## The paper

On April 13, 2026, the CSA CISO Community, SANS, and the OWASP GenAI Security Project published ["The AI Vulnerability Storm: Building a Mythos-Ready Security Program"](https://labs.cloudsecurityalliance.org/mythos-ciso/) (v0.4). The paper was authored by the CSA Chief Analyst, the SANS Chief of Research, and the CEO of Knostic. Contributing authors include the former CISA Director, the Google CISO, and the former NSA Cybersecurity Director. Many CISOs and other practitioners reviewed and edited it.

The paper describes what happens to security programs when AI compresses time-to-exploit from years to hours. It is a coordinated call to action, not a marketing document. The runtime layer it describes fits the same category as an [agent firewall](/agent-firewall/): egress filtering, content scanning, and containment that operates faster than a human can respond.

## The stat that frames everything

Mean time-to-exploit went from 2.3 years in 2018 to approximately 20 hours in 2026. That data comes from the [Zero Day Clock](https://zerodayclock.com/) by Sergej Epp, based on 3,529 CVE-exploit pairs from CISA KEV, VulnCheck KEV, and XDB.

At 20 hours, patching is still necessary but no longer sufficient as a primary defense. The paper's response: shift to containment and resilience. Build the architecture that limits blast radius when (not if) something gets exploited before the patch ships.

## The four priority actions that describe runtime agent controls

The paper lists 11 priority actions. PA 1 (Point Agents at Your Code) names specific vulnerability scanning tools. PA 3, 8, 9, and 10 describe runtime controls in detail but name zero tools for those actions. That gap is where the interesting question lives.

### PA 3: Defend Your Agents (CRITICAL, start this month)

> "Agents are not covered by existing controls and introduce both cyber defense and agentic supply chain risks. The agent harness -- prompts, tool definitions, retrieval pipelines, and escalation logic -- is where the most consequential failures occur; audit it with the same rigor as the agent's permissions." (Section IV, p.20)

The paper calls for scope boundaries, blast-radius limits, escalation logic, and human override mechanisms before deploying agents in production. And then: "Do not wait for industry governance frameworks. Define your own now."

That is unusually direct language from CSA and SANS. The message: existing security frameworks do not cover agents yet, and waiting for them to catch up is not an acceptable posture.

### PA 8: Harden Your Environment (HIGH, start this month)

> "Implement egress filtering (it blocked every public log4j exploit). Enforce deep segmentation and zero trust where possible. Lock down your dependency chain." (Section IV, p.21)

The log4j parenthetical matters. Log4j exploitation required outbound connections to attacker infrastructure. Organizations with egress filtering in place were not affected. Agent exfiltration works the same way: compromised agents leak data through outbound requests. If the request can't leave, the leak doesn't happen.

### PA 9: Build a Deception Capability (HIGH, next 90 days)

> "Deploy canaries and honey tokens, layer behavioral monitoring, pre-authorize containment actions, and build response playbooks that execute at machine speed." (Section IV, p.21)

Three things in one sentence: plant traps, watch behavior, and pre-authorize automated response so containment doesn't wait for a human to wake up and log in.

### PA 10: Build an Automated Response Capability (HIGH, next 90 days)

> "Examples: asset and user behavioral analysis, pre-authorized containment actions, and response playbooks that execute at machine speed." (Section IV, p.21)

The phrase "execute at machine speed" appears in both PA 9 and PA 10. That's the paper's way of saying: if your containment action requires a human clicking a button in a UI, the window has already closed.

## The runtime layer they describe but don't name

Across PA 3, 8, 9, and 10, the paper describes a runtime enforcement layer that:

- Filters agent egress traffic
- Scans for credential leaks in outbound requests
- Enforces scope boundaries and blast-radius limits
- Monitors behavior and escalates restrictions automatically
- Provides pre-authorized containment that triggers at machine speed
- Supports canary tokens and deception
- Produces tamper-evident logs for incident response

The paper names six tools for PA 1 (vulnerability scanning). It names zero tools for PA 3, 8, 9, or 10.

Pipelock is an open source runtime proxy that addresses these four priority actions. The full mapping, with verbatim quotes and framework codes from the paper's risk register, is at the [Mythos-Ready Playbook](/learn/mythos-ready-playbook/) page.

## The Glasswing constraint

The paper also addresses the Glasswing early-access model directly (Section III, p.10):

> "The world's exploitable attack surface is vastly larger than what any curated partner ecosystem can cover."

About 40 vendors and maintainers had early access to Mythos through Glasswing. The rest of the ecosystem is responding now. Open source runtime controls are deployable today without a partnership or a waitlist.

For organizations the paper describes as below the "Cyber Poverty Line" (a concept from Wendy Nather, cited in Section II), the runtime layer is free. Pipelock's scanning and enforcement features are Apache 2.0 with no feature gating.

## What to do this week

The paper's own aggressive timetable says "start this week" for six of the eleven priority actions. For the runtime controls in PA 3 and PA 8:

```bash
curl -L https://github.com/luckyPipewrench/pipelock/releases/latest/download/pipelock_linux_amd64 -o pipelock
chmod +x pipelock && sudo mv pipelock /usr/local/bin/
pipelock init
pipelock claude setup   # or: pipelock cursor install
pipelock assess
```

`pipelock init` discovers IDE configs and generates a starter configuration. The setup commands rewrite IDE configs to route MCP traffic through the proxy. `pipelock assess` runs a multi-step posture evaluation covering config, scanning, and MCP wrapping status.

The [Mythos-Ready Playbook](/learn/mythos-ready-playbook/) has the full priority action mapping, framework table, and the CISO self-assessment questions the paper asks on page 15.

## Source

"The AI Vulnerability Storm: Building a Mythos-Ready Security Program." Version 0.4, April 13, 2026. CSA CISO Community, SANS, [un]prompted, OWASP GenAI Security Project. CC BY-NC 4.0.
