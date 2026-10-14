---
title: "Pipelock: Open-Source Agent Firewall"
linkTitle: "Pipelock: Open-Source Agent Firewall"
subtitle: "Pipelock scans mediated HTTP, MCP, and WebSocket traffic for secret leaks, prompt injection, and tool poisoning, then emits signed action receipts you can verify offline."
description: "Pipelock: open-source agent firewall that blocks secret leaks and SSRF, detects prompt injection, and emits signed receipts you verify offline."
lastmod: 2026-10-14
og_image: "https://pipelab.org/images/og/og-product.png"
disable_cta: true
type: pipelock
faq:
  - q: "What is Pipelock?"
    a: "Pipelock is an open-source agent firewall. It sits between an AI agent and the internet as a local proxy and scans mediated HTTP, WebSocket, and MCP messages the agent sends or receives. Strict mode blocks unsafe traffic. Balanced mode blocks immutable-floor risks such as SSRF and core DLP secrets, and detects prompt injection and MCP tool poisoning. Pipelock is a single Go binary (Apache-2.0 core; Enterprise features under ELv2)."
  - q: "How does Pipelock differ from a WAF or AI firewall for LLM APIs?"
    a: "A WAF protects a server from inbound attackers. An AI firewall for an LLM API protects the model endpoint. Pipelock protects the agent itself: it enforces the boundary between the agent and the outside world by scanning the agent's own outbound requests and the responses it pulls in. Different traffic direction, different threat model."
  - q: "What transports does Pipelock scan?"
    a: "Pipelock mediates HTTP, WebSocket, MCP, and Agent-to-Agent (A2A) traffic across its supported proxy modes. For HTTP, that includes forward proxy, CONNECT, and fetch. MCP supports stdio wrapping, streamable HTTP, and HTTP reverse proxy. Target URLs use the ordered URL scanner. Response bodies, frames, MCP messages and tools, and A2A tasks and artifacts add controls for the data and actions each transport exposes."
  - q: "Does Pipelock see the agent's real secrets?"
    a: "No. Pipelock holds no agent credentials by design. The agent runs in the privileged zone with its own secrets. Pipelock runs in a separate trust zone with no secret access, inspecting traffic as it crosses the boundary. This capability separation is enforced at the deployment layer through container or process isolation."
  - q: "Is Pipelock free?"
    a: "The core is free and Apache-2.0 licensed. Its scanning, detection, and enforcement controls are in the open-source binary. Run the full firewall on as many agents as you want, free. Pipelock Pro adds coordination once you want multiple agents under one admin boundary. Enterprise adds fleet management and compliance."
  - q: "What does Pipelock catch that a domain allowlist misses?"
    a: "A domain allowlist decides where the agent can go. It does not inspect what the agent sends. Pipelock checks request bodies for credential patterns, responses for prompt injection, and MCP tool descriptions for poisoning and drift. These attacks can pass an allowlist because the destination is trusted while the content is not."
  - q: "Does it fail open or closed?"
    a: "Closed on mediated enforcement paths. Timeouts, parse errors, oversized bodies, malformed JSON-RPC, and non-terminal HITL all block, and so does a compressed response in an encoding with no decoder. Gzip and deflate responses are decoded and scanned. If Pipelock cannot verify a mediated action is safe, it does not pass."
  - q: "How are rules updated?"
    a: "Community rules use Ed25519-signed bundles, CalVer versioning, and hot reload. `pipelock rules install` pulls the latest bundle. `pipelock rules verify` checks signatures against your trusted keyring. Built-in patterns update with each binary release."
  - q: "Can agents reach internal services?"
    a: "`trusted_domains` allows controlled exceptions for services with public DNS that resolve to private IPs, such as localhost development servers, local inference endpoints, and internal APIs. SSRF protection stays active for everything else."
  - q: "What's the performance impact?"
    a: "The current end-to-end performance benchmark shows sub-millisecond MCP stdio overhead and low-millisecond HTTP and tool-chain overhead on localhost. See the Pipelock performance guide for the full transport table, cold-start numbers, and reproduce command: https://pipelab.org/learn/performance/"
---

<p>New in v3.7: <a href="/learn/parallel-receipt-chains/">parallel signed receipts</a>, <a href="/learn/pipelock-contain-guide/">filesystem grants for containment</a>, <a href="/learn/pipelock-exec/">cooperative command launch</a>, <a href="/learn/verified-local-mcp-services/">verified local MCP services</a>, and <a href="/learn/destination-grants/">exact destination grants</a>. Read the <a href="/blog/pipelock-v370-release/">release notes</a> and <a href="/learn/pipelock-v370-upgrade/">upgrade actions</a>.</p>

<section class="pipelock-boundary" id="overview" data-fx="reveal" aria-labelledby="pipelock-boundary-title">
  <div class="pipelock-boundary-copy">
    <p class="pipelock-body-kicker">The enforcement boundary</p>
    <h2 id="pipelock-boundary-title">The agent keeps the keys. Pipelock guards the crossing.</h2>
    <p>Pipelock inspects mediated network and tool traffic without storing the agent's credentials. Routing or containment must prevent a direct path around it.</p>
  </div>
  <div class="pipelock-boundary-map" aria-label="Agent traffic crossing the Pipelock enforcement boundary">
    <article class="pipelock-boundary-zone">
      <span>Privileged zone</span>
      <h3>Agent + credentials</h3>
      <p>The workload owns its secrets and initiates the request.</p>
    </article>
    <div class="pipelock-boundary-crossing">
      <span>Outbound request &rarr;</span>
      <strong>Pipelock</strong>
      <small>scan &middot; enforce &middot; record</small>
      <span>&larr; Inbound response</span>
    </div>
    <article class="pipelock-boundary-zone pipelock-boundary-zone-untrusted">
      <span>Untrusted side</span>
      <h3>Web, APIs + tools</h3>
      <p>Content and destinations are checked before the agent trusts them.</p>
    </article>
  </div>
  <nav class="pipelock-proof-rail" aria-label="Pipelock public evidence">
    <a href="/gauntlet/"><span>Public tests</span>Agent Egress Bench results</a>
    <a href="/playground/replay/"><span>Signed artifacts</span>Replay archive</a>
    <a href="/learn/performance/"><span>Measured cost</span>Performance</a>
    <a href="https://github.com/luckyPipewrench/pipelock/releases" target="_blank" rel="noopener noreferrer"><span>Current build</span>Release notes</a>
  </nav>
</section>

<section class="pipelock-first-run product-band" id="install" data-fx="reveal" aria-labelledby="pipelock-first-run-title">
  <div class="product-band-inner">
    <div class="product-band-head">
      <div>
        <p class="product-band-kicker">First protected run</p>
        <h2 class="product-band-title" id="pipelock-first-run-title">Protect one real path.</h2>
      </div>
      <p class="product-band-lead">Install the binary, route one agent through it, then inspect a signed record. The full install guide owns package choices, upgrades, and editor-specific setup.</p>
    </div>
    <ol class="product-runbook">
      <li class="product-runbook-row" data-fx="reveal">
        <span class="product-runbook-index" aria-hidden="true">01</span>
        <div class="product-runbook-copy">
          <h3>Install the binary</h3>
          <p>Use Go here or choose Docker, Homebrew, or a signed release binary in the <a href="/install/">install guide &rarr;</a></p>
        </div>
        <div class="product-runbook-artifact pipelock-command"><button type="button" data-cmd-copy aria-label="Copy the Pipelock install command"><span class="prompt">$ </span><span class="cmd-text">{{< install-cmd go >}}</span></button></div>
      </li>
      <li class="product-runbook-row" data-fx="reveal">
        <span class="product-runbook-index" aria-hidden="true">02</span>
        <div class="product-runbook-copy">
          <h3>Route Claude Code</h3>
          <p>Wire one real agent through Pipelock. MCP servers and other agents have their own documented paths.</p>
        </div>
        <div class="product-runbook-artifact pipelock-command"><button type="button" data-cmd-copy aria-label="Copy: pipelock claude setup"><span class="prompt">$ </span><span class="cmd-text">pipelock claude setup</span></button></div>
      </li>
      <li class="product-runbook-row" data-fx="reveal">
        <span class="product-runbook-index" aria-hidden="true">03</span>
        <div class="product-runbook-copy">
          <h3>Verify a receipt</h3>
          <p>Configure receipt signing for your own traffic, or use the <a href="/playground/replay/">public replay archive</a> to verify one now.</p>
        </div>
        <div class="product-runbook-artifact pipelock-command"><button type="button" data-cmd-copy aria-label="Copy: pipelock verify-receipt"><span class="prompt">$ </span><span class="cmd-text">pipelock verify-receipt receipt.json --key signer.pub</span></button></div>
      </li>
    </ol>
    <nav class="pipelock-runbook-links" aria-label="Pipelock setup guides">
      <a href="/install/">All install methods</a>
      <a href="/learn/claude-code-hooks/">Claude Code guide</a>
      <a href="/learn/mcp-proxy/">MCP proxy guide</a>
    </nav>
    <p class="pipelock-runbook-release"><span>Current container</span><code>{{< install-cmd docker >}}</code></p>
  </div>
</section>

<section class="pipelock-controls" id="details" data-fx="reveal" aria-labelledby="pipelock-controls-title">
  <header class="pipelock-section-head">
    <div>
      <p class="pipelock-body-kicker">Controls at the point of action</p>
      <h2 id="pipelock-controls-title">Inspect, enforce, and keep the record.</h2>
    </div>
    <p>Four control groups replace the feature wall. Open the group you need, or scan the named controls without expanding anything.</p>
  </header>
  <div class="pipelock-control-ledger">
    <article class="pipelock-control-row" id="detect">
      <span class="pipelock-control-index" aria-hidden="true">01</span>
      <div class="pipelock-control-title">
        <p>Traffic inspection</p>
        <h3>Check both directions.</h3>
      </div>
      <div class="pipelock-control-body">
        <p>DLP and SSRF run on outbound traffic. Response scanning catches prompt injection before untrusted content reaches the agent.</p>
        <ul class="pipelock-control-tags"><li>{{< stat key="dlp_patterns" >}} DLP patterns</li><li>Encoding-aware inspection</li><li>Media policy</li><li>Canary tokens</li></ul>
        <details class="pipelock-control-detail"><summary>Open traffic controls</summary><div><p><strong>Cross-transport DLP.</strong> The same engine scans URLs, headers, request bodies, WebSocket frames, and MCP tool arguments. Cross-request detection catches secrets split across requests.</p><p><strong>Response scanning.</strong> Normalization checks obfuscated prompt injection, control-flow hijacking, and authority assertions before the content reaches the agent.</p><p><strong>Media policy.</strong> Audio and video are blocked by default. JPEG and PNG metadata is stripped. Browser Shield delivers SVG in sanitized form only after structural validation and refuses it otherwise, and SVG stays refused while Shield is off.</p><p><strong>Credential audiences.</strong> On inspected traffic, built-in credential classes are allowed at their provider's published API hosts, on the provider's accepted header or path carriers. Other checks still apply, and plain CONNECT without TLS interception relays opaque bytes that aren't scanned. DNS-over-HTTPS is inspected as DNS, and partial disclosure of a known secret is detected.</p></div></details>
      </div>
    </article>
    <article class="pipelock-control-row">
      <span class="pipelock-control-index" aria-hidden="true">02</span>
      <div class="pipelock-control-title">
        <p>MCP control</p>
        <h3>Inspect the tool, call, and chain.</h3>
      </div>
      <div class="pipelock-control-body">
        <p>Pipelock scans tool descriptions and arguments, applies tool policy before execution, and tracks changes inside a session.</p>
        <ul class="pipelock-control-tags"><li>Tool policy</li><li>Session binding</li><li>Chain detection</li><li>Binary integrity</li></ul>
        <details class="pipelock-control-detail"><summary>Open MCP controls</summary><div><p><strong>Tool policy.</strong> Allow, deny, and redirect rules run before execution. Shell-obfuscation checks resolve variable insertion and backtick substitution before matching.</p><p><strong>Session binding.</strong> A SHA-256 baseline tracks tool definitions. Mid-session description changes can alert or block.</p><p><strong>Tool chains.</strong> Subsequence matching finds configured multi-call patterns, while binary integrity verifies the wrapped MCP process before spawn.</p></div></details>
      </div>
    </article>
    <article class="pipelock-control-row" id="enforce">
      <span id="deploy" class="pipelock-anchor-alias" aria-hidden="true"></span>
      <span class="pipelock-control-index" aria-hidden="true">03</span>
      <div class="pipelock-control-title">
        <p>Enforcement</p>
        <h3>Block when the answer is unknown.</h3>
      </div>
      <div class="pipelock-control-body">
        <p>Mediated enforcement paths fail closed. Operators can add adaptive policy, a process sandbox, and independent kill-switch sources.</p>
        <ul class="pipelock-control-tags"><li>Fail-closed</li><li>Adaptive enforcement</li><li>{{< stat key="kill_switch_sources" >}} kill sources</li><li>Learn-and-Lock</li></ul>
        <details class="pipelock-control-detail"><summary>Open enforcement controls</summary><div><p><strong>Fail-closed paths.</strong> Timeouts, parse errors, oversized bodies, malformed JSON-RPC, and non-terminal human approval prompts block instead of passing.</p><p><strong>Adaptive enforcement.</strong> Per-session threat scores can escalate policy, then recover as traffic stays clean.</p><p><strong>Containment.</strong> Linux and macOS process controls can restrict the agent. Deployment isolation must still stop direct traffic from bypassing Pipelock. A contained agent runs in its own network namespace with private <code>/tmp</code> and <code>/var/tmp</code>. <code>pipelock contain run</code> prints a session contract before launch and attempts to write a signed workspace change statement after, and <code>pipelock contain view</code> lets an operator watch the agent's screen.</p></div></details>
      </div>
    </article>
    <article class="pipelock-control-row" id="prove">
      <span class="pipelock-control-index" aria-hidden="true">04</span>
      <div class="pipelock-control-title">
        <p>Evidence and operations</p>
        <h3>Keep enough context to check later.</h3>
      </div>
      <div class="pipelock-control-body">
        <p>Decision records, hash-chained logs, signed assessments, and machine-readable reports keep enforcement evidence attached to the run.</p>
        <ul class="pipelock-control-tags"><li>Signed receipts</li><li>Flight recorder</li><li>Assess</li><li>HTML, JSON, SARIF</li></ul>
        <details class="pipelock-control-detail"><summary>Open evidence controls</summary><div><p><strong>Flight recorder.</strong> Scanner decisions, policy actions, and session events are hash chained. Optional Ed25519 checkpoints can sign the chain. A process can use parallel receipt chains bound by signed group lifecycle records. Verify the whole group; one valid shard does not prove completeness. A recovery seal attests a discontinuity and preserves the damaged history's failure. HTTP responses carry an <code>X-Pipelock-Receipt</code> header naming the receipt after it is recorded. That needs a configured receipt emitter, and allow coverage depends on <code>flight_recorder.require_receipts</code>.</p><p><strong>Assess.</strong> Pipelock combines simulation, config scoring, install verification, and discovery into signed HTML and JSON evidence bundles.</p><p><strong>CI.</strong> The current GitHub Action is <code>luckyPipewrench/pipelock@v3.7.0</code>. It can scan a diff and fail the job when it finds a blocking issue.</p><p><strong>Upgrade.</strong> Read the <a href="/learn/pipelock-v370-upgrade/">v3.7 upgrade guide</a> before changing receipt automation or containment. <strong>Session records.</strong> Versioned snapshots capture policy state, tool inventory, verdict summaries, and behavioral fingerprints.</p></div></details>
      </div>
    </article>
  </div>
</section>

<section class="pipelock-pipeline-section" id="how-it-works" data-fx="reveal" aria-labelledby="pipelock-pipeline-title">
  <header class="pipelock-section-head">
    <div>
      <p class="pipelock-body-kicker">Scanner pipeline</p>
      <h2 id="pipelock-pipeline-title">The order is part of the control.</h2>
      <p class="pipelock-scan-version"><span>v3.7.0</span><strong>Named checks. Fixed sequence.</strong><a href="https://github.com/luckyPipewrench/pipelock/blob/v3.7.0/docs/security-assurance.md#ordered-url-scanner-pipeline">Read the tagged pipeline</a></p>
    </div>
    <p>For mediated target URLs, length and parsing happen first. Destination policy and credential checks run before the first DNS lookup; usage limits and a final context check close the path.</p>
  </header>
  <ol class="pipelock-scan-flow" aria-label="Pipelock request evaluation order">
    <li><span class="pipelock-scan-index">Preflight</span><div><h3>Reject a broken target.</h3><p>Check the request context, length, parse result, canonical host, scheme, destination port, CRLF, and path traversal before policy runs.</p><ul class="pipelock-scan-gates"><li class="pipelock-scan-gate">Context + length</li><li class="pipelock-scan-gate">Parse + canonicalize</li><li class="pipelock-scan-gate">Scheme + port</li><li class="pipelock-scan-gate">CRLF + traversal</li></ul></div></li>
    <li><span class="pipelock-scan-index">Destination</span><div><h3>Apply destination policy.</h3><p>Run the strict allowlist and blocklist, then reject private or metadata IP literals before DNS.</p><ul class="pipelock-scan-gates"><li class="pipelock-scan-gate">Allowlist</li><li class="pipelock-scan-gate">Blocklist</li><li class="pipelock-scan-gate">Literal-IP SSRF floor</li></ul></div></li>
    <li><span class="pipelock-scan-index">Credentials</span><div><h3>Stop secrets before lookup.</h3><p>Normalize the exact SigV4 credential case, then run the immutable and configured DLP floors plus path, query, and subdomain entropy checks.</p><ul class="pipelock-scan-gates"><li class="pipelock-scan-gate">SigV4 handling</li><li class="pipelock-scan-gate">Core + configured DLP</li><li class="pipelock-scan-gate">Path + query entropy</li><li class="pipelock-scan-gate">Subdomain entropy</li></ul></div></li>
    <li class="pipelock-scan-boundary" aria-label="DNS boundary"><span>No network yet</span><strong>DNS starts only after credential checks</strong></li>
    <li><span class="pipelock-scan-index">Resolution</span><div><h3>Resolve and contain.</h3><p>Resolve the hostname, then block private ranges, cloud metadata, and DNS rebinding.</p><ul class="pipelock-scan-gates"><li class="pipelock-scan-gate">DNS + SSRF</li></ul></div></li>
    <li><span class="pipelock-scan-index">Decision</span><div><h3>Budget and decide.</h3><p>Apply rate and data budgets, then check the request context again before returning an allow verdict.</p><ul class="pipelock-scan-gates"><li class="pipelock-scan-gate">Rate limit</li><li class="pipelock-scan-gate">Data budget</li><li class="pipelock-scan-gate">Final context</li></ul></div></li>
  </ol>
  <dl class="pipelock-transport-rail">
    <div><dt>HTTP</dt><dd>Ordered URL scan plus body and response controls</dd></div>
    <div><dt>WebSocket</dt><dd>Target URL scan, then frames in both directions</dd></div>
    <div><dt>MCP</dt><dd>Separate message, tool, policy, and session controls</dd></div>
    <div><dt>A2A</dt><dd>Separate task, artifact, and agent-metadata controls</dd></div>
  </dl>
</section>

<section class="pipelock-evidence" id="evidence" data-fx="reveal" aria-labelledby="pipelock-evidence-title">
  <div class="pipelock-evidence-copy">
    <p class="pipelock-body-kicker">Evidence you can inspect</p>
    <h2 id="pipelock-evidence-title">See the decision. Check the signature.</h2>
    <p>The operator console keeps the scanner verdict, policy action, receipt timeline, and offline verification command together.</p>
    <div class="pipelock-evidence-command pipelock-command"><button type="button" data-cmd-copy aria-label="Copy: pipelock verify-receipt"><span class="prompt">$ </span><span class="cmd-text">pipelock verify-receipt receipt.json --key signer.pub</span></button></div>
    <nav class="pipelock-evidence-actions" aria-label="Pipelock evidence"><a class="btn btn-primary" href="/proof/">Inspect the evidence</a><a class="btn btn-ghost" href="/assess/demo-assessment/">Open demo report</a></nav>
  </div>
  <a class="pipelock-evidence-visual" data-fx="spotlight" href="/img/dashboard/evidence-scorecard.png" target="_blank" rel="noopener noreferrer"><img src="/img/dashboard/evidence-scorecard.png" alt="Pipelock operator console showing a signed receipt timeline and per-session evidence scorecard" width="1920" height="1080" loading="lazy" decoding="async"><span>Operator console evidence view</span></a>
</section>

<section class="pipelock-pro-band" id="pro" data-fx="reveal spotlight" aria-labelledby="pipelock-pro-title">
  <div class="pipelock-pro-lead">
    <p class="pipelock-body-kicker">Coordinate more than one agent</p>
    <h2 id="pipelock-pro-title">One engine. A separate security boundary for every agent.</h2>
    <p>Community keeps the full scanner and one default profile. Pro adds unlimited named profiles with their own policy, identity, budgets, behavior, and evidence.</p>
    <div class="pipelock-pro-price"><strong><span>$49</span>/month</strong><p>Founding price. Flat rate. No per-agent charge. Grandfathered for life.</p></div>
    <div class="pipelock-pro-actions"><a href="https://buy.polar.sh/polar_cl_QTxAmBq1Fxuok8crBrvzbWsSm0IZfpQF875fM1FtvNb" class="btn btn-primary" target="_blank" rel="noopener noreferrer" data-event="checkout_started" data-event-placement="pipelock-pro-section" data-event-value="pro_founding">Claim Founding Pro</a><a href="/pricing/" class="btn btn-ghost" data-event="pricing_click" data-event-placement="pipelock-pro-section">Compare tiers</a></div>
  </div>
  <div class="pipelock-pro-ledger">
    <article><span>01</span><h3>Policy per agent</h3><p>Separate DLP, allowlists, rate limits, budgets, enforcement mode, and MCP tool policy.</p></article>
    <article><span>02</span><h3>Identity that holds up</h3><p>Bind profiles with dedicated listeners, source CIDRs, headers, and trusted domains.</p></article>
    <article><span>03</span><h3>Learn, then lock</h3><p>Build per-agent behavior baselines, set thresholds, and control sandbox overrides.</p></article>
    <article><span>04</span><h3>Evidence that stays separated</h3><p>Keep profile-scoped audit trails, receipts, metrics, roster views, and exemption inventory.</p></article>
  </div>
</section>

<section class="pipelock-explore" aria-labelledby="pipelock-explore-title">
  <p class="pipelock-body-kicker">Go deeper</p>
  <h2 id="pipelock-explore-title">Keep going from here.</h2>
  <div class="pipelock-explore-grid">
    <a class="pipelock-explore-card" data-fx="spotlight" href="/compare/"><p class="pipelock-explore-label">Compare</p><h3>Compare Pipelock</h3><p>See how an agent firewall differs from MCP gateways, WAFs, and guardrails.</p><span class="pipelock-explore-go">Open comparisons <b aria-hidden="true">&rarr;</b></span></a>
    <a class="pipelock-explore-card" data-fx="spotlight" href="/learn/"><p class="pipelock-explore-label">Learn</p><h3>Understand the threats</h3><p>Trace MCP attacks and credential leaks to the controls that stop them.</p><span class="pipelock-explore-go">Browse guides <b aria-hidden="true">&rarr;</b></span></a>
    <a class="pipelock-explore-card" data-fx="spotlight" href="/install/"><p class="pipelock-explore-label">Operate</p><h3>Install and operate</h3><p>Get Pipelock running, then verify the proxy and containment before trusting it.</p><span class="pipelock-explore-go">Open install guide <b aria-hidden="true">&rarr;</b></span></a>
  </div>
</section>
