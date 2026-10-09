---
title: "LinkedIn Scanned 6,222 Browser Extensions. Your AI Agent's Browser Is Next."
linkTitle: "BrowserGate and AI Agent Fingerprinting"
date: 2026-04-04
author: "Josh Waldrep"
summary: "LinkedIn's BrowserGate scandal exposed mass extension fingerprinting via first-party JavaScript. The same technique works against headless Chromium browsers running AI agents, and DNS blocking can't stop it."
description: "AI agent fingerprinting using the same technique as LinkedIn's BrowserGate. Headless Chromium browsers running AI agents are the next target."
tags: ["ai-security", "browser-security", "agent-fingerprinting", "pipelock"]
blog_cat: "industry"
---

> **TL;DR.** LinkedIn's production JavaScript probes 6,222 Chrome extensions per page load using `chrome-extension://` fetches inside the browser. Any headless Chromium browser running an AI agent is exposed to the same technique. DNS blocking, CSP, and user-agent spoofing do not stop it. Only content-aware inspection at the agent's egress boundary does.

AI agent fingerprinting is the next frontier of browser surveillance. In February 2026, a German nonprofit called Fairlinked e.V. published an evidence pack that caught LinkedIn scanning 6,222 Chrome extensions on every page load. Not 38 (the 2017 count). Not 461 (2024). Over six thousand, covering a combined user base of roughly 405 million people.

The evidence is public, timestamped with RFC 3161, and SHA-512 hashed. The JavaScript is sitting in LinkedIn's production bundle right now. Open DevTools and search for `fetchExtensions`.

This isn't speculation. It's source code.

## How the scanner works

LinkedIn serves a ~2.7MB JavaScript bundle to every Chromium browser visitor. Inside Webpack chunk `chunk.905`, starting around line 9571, there's a hardcoded array of 6,222 Chrome extension IDs. Each one is paired with a specific internal file path.

Three functions do the work:

`fetchExtensions` makes `fetch()` calls to `chrome-extension://` URLs, targeting files that extensions expose via `web_accessible_resources`. If the fetch succeeds, the extension is installed. If it fails, it's not. Takes milliseconds. Completely invisible to the user.

`scanDOMForPrefix` does a passive scan of the DOM for elements injected by extensions.

`fireExtensionDetectedEvents` sends the results to LinkedIn's `li/track` endpoint through `AedEvent` and `SpectroscopyEvent` objects.

The whole thing is gated behind `isUserAgentChrome()`. Firefox and Safari are architecturally immune because they don't support `chrome-extension://` fetches from web content. Chromium does.

## What they're scanning

The 6,222 extensions include 509 job search tools (Indeed, Glassdoor, Monster) and over 200 direct competitors (Apollo, Lusha, ZoomInfo, Hunter.io). But the list also includes extensions that indicate religious beliefs, political orientation, and disability status. ADHD tools, autism support extensions, screen readers.

Under GDPR, religion, politics, and health data are Special Category Data. Processing them requires explicit consent. LinkedIn has none for this scanning.

There's more running alongside it. A HUMAN Security (formerly PerimeterX) invisible tracking element sets cookies without disclosure. A separate Google fingerprinting script fires on every page load. None of it appears in LinkedIn's privacy policy.

## The affidavit that contradicts itself

In February 2026, LinkedIn's Senior Engineering Manager Milinda Lakkam filed a sworn affidavit in a German court. The claim: extension data isn't used for ad targeting or content ranking.

Same paragraph: LinkedIn "may have taken action against LinkedIn users that happen to have [XXXXXX] installed."

So the models don't use extension data, but LinkedIn acts against users based on their extensions. Pick one.

Fairlinked filed the evidence under EU Digital Markets Act proceedings. The legal process is ongoing.

## Why AI agents are exposed

When AI agents browse interactive websites, they usually do it through headless Chromium tooling like Playwright, Puppeteer, or scrapling. If your agent visits a website this way, it's running a real Chromium instance with a real JavaScript engine. LinkedIn's scanner, or any site using the same technique, runs against your agent the same way it runs against a human visitor.

Think about what that reveals. Headless Chromium has detectable characteristics: distinctive viewport sizes, missing fonts, no mouse movement. Extension scanning adds another signal. If your agent framework injects anything into the browser profile, those modifications are detectable through the same `chrome-extension://` probing. Combine that with IP ranges and TLS fingerprints and you have a full profile of the agent's infrastructure.

This isn't hypothetical. The scanning code is live on one of the most-visited sites on the internet. The 6,222-extension list grew from 38 in 2017. It'll keep growing. And LinkedIn isn't the only site that can deploy this technique. Any JavaScript served to a browser can do the same thing.

## Why the obvious defenses fail

**DNS blocking.** The `fetch()` calls to `chrome-extension://` URLs use a browser-local scheme. No DNS query happens. There is no network request for the probe itself to intercept. Network-layer blocking can't see it.

**Browser extensions.** Some privacy extensions try to intercept these fetches. But the scanner's 6,222-item list includes privacy and ad-blocking tools. The scanner detects the blocker. And any extension that modifies behavior adds its own detectable fingerprint.

**Content Security Policy.** CSP restricts what a page loads from external origins. `chrome-extension://` is a local scheme, not an external origin. The browser treats it differently.

**User-Agent spoofing.** The `isUserAgentChrome()` gate is simple. Even if you spoof the UA string, the `chrome-extension://` protocol behavior is what matters.

The problem is architectural. The fingerprinting code runs inside the JavaScript engine where it has direct access to browser APIs. Anything that operates outside the browser (DNS, network firewall, proxy rules) never sees it. Anything that operates inside the browser (extensions) gets detected by the scanner.

## Content-aware mediation at the action boundary

The strongest control point for this class of attack is inspecting page content before the browser executes it. Not at the DNS layer. Not inside the browser. At the action boundary, where web content enters your agent's environment.

This means a layer that understands what it's looking at. Not checking hostnames or blocking IPs. Parsing the JavaScript, identifying fingerprinting payloads like `fetchExtensions` and `chrome-extension://` probing patterns, and neutralizing them before the browser processes the page.

For AI agents, this is the egress layer: the point where your agent's browser traffic crosses from your controlled environment into the open web and responses come back in. At that boundary, you can:

1. Detect `chrome-extension://` probing in JavaScript payloads
2. Strip fingerprinting functions before they execute
3. Block telemetry beacons that exfiltrate the collected data
4. Normalize browser characteristics to reduce the fingerprint surface

This is what safe automation in hostile environments looks like. The web is not friendly to machine actions. Every page your agent visits can run arbitrary JavaScript against the browser environment. Extension scanning is one technique out of dozens. The operators are updating their lists constantly, and the growth curve (38 to 6,222 in nine years) isn't slowing down.

## No governance, no accountability

LinkedIn got caught because researchers decompiled their JavaScript and filed a legal challenge. But the technique itself is trivial to implement. Any website can serve a script that probes installed extensions, builds a browser fingerprint, and exfiltrates the results. No browser permission required. No consent dialog. No opt-out.

For a human visitor, at least there's the possibility of noticing unusual behavior or reading about a scandal like this one. An AI agent doesn't notice anything. It processes the page, executes the JavaScript, and moves on. The fingerprinting data flows out silently, and nobody's reviewing the browser session to check what happened.

No governance for machine actions at the browser level means the only real protection is architectural. Your agents need a boundary that understands content, not just addresses, one that can evaluate what a site is actually serving before the agent's browser executes it.

The alternative is deploying agents into a web where every site they visit can silently map their capabilities, fingerprint their infrastructure, and track them across sessions. That's the status quo. It doesn't have to stay that way.

[Pipelock](https://github.com/luckyPipewrench/pipelock) scans agent traffic at the network boundary today across HTTP, MCP, and WebSocket. Content-aware mediation for agent browsing sessions is the next step in that architecture.

---

*The Fairlinked e.V. evidence pack, including SHA-512 hashed source and RFC 3161 timestamps, is available at [browsergate.eu](https://browsergate.eu/the-evidence-pack/).*
