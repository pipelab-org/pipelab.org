---
title: "Pipelock Pricing and Assess License"
seoTitle: "Pipelock Pricing: Free, Pro, and Assess Plans"
subtitle: "Detection is free. Coordination is paid. Governance is enterprise."
description: "Pipelock pricing: free agent firewall, full scanning. Pro coordination $49/mo. Assess $999/yr adds server findings, remediation, and framework mappings."
og_image: "https://pipelab.org/images/og/og-pricing.png"
disable_cta: true
lastmod: 2026-08-08
type: pricing
faq:
  - q: "What counts as a \"security profile\"?"
    a: "A security profile is a named configuration for a specific agent, workflow, or trust boundary. Each profile gets its own DLP patterns, allowlists, rate limits, mode, enforce flag, MCP tool policy, session profiling thresholds, and request budgets. Agents can be identified by dedicated listener ports, source CIDRs, or headers. Community uses one default profile. Pro lets you create as many named profiles as you need. See the [Pro reference deployment](/learn/pipelock-pro-reference-deployment/) for the full architecture."
  - q: "Do licenses phone home?"
    a: "No. License verification is fully offline using Ed25519 signatures. No network calls, no telemetry, no tracking. The binary verifies the license locally at startup."
  - q: "Can one license run on multiple machines?"
    a: "Yes. No machine binding, no hardware fingerprinting. You can deploy Pipelock on as many machines as you need within your licensed scope."
  - q: "What happens when a license expires?"
    a: "Agent profiles are disabled. Single-profile protection stays fully active. The proxy keeps protecting traffic, it simply falls back to Community features. No bricking, no lockouts."
  - q: "Can I try Pro features before buying?"
    a: "Yes. Pro has a 30-day trial with no card and no automatic conversion. [Start the trial](https://buy.polar.sh/polar_cl_ff23dTaTesK9RZrtU3nJqsjQJjRS3pFJCTRcR129P9L) to get access now."
  - q: "What does the Assess license include?"
    a: "Run `pipelock assess run` to collect evidence, then `pipelock assess finalize` to generate output. Verification is free for everyone. The free summary shows your grade, section scores, and top findings, signed by default. The Assess license ($999/yr) adds the full report: server-specific findings, remediation guidance, detailed framework mappings for OWASP, NIST AI RMF, EU AI Act, and SOC 2, and the optional attestation and badge. No consulting call required. [See sample reports](/assess/)."
  - q: "What's the difference between Pro and Enterprise?"
    a: "Scope. Pro coordinates multiple named security profiles under one admin boundary. Enterprise is central fleet governance: Pipelock Conductor distributes signed policy bundles, aggregates fleet audit batches, and supports M-of-N emergency remote kill. Fleet Receipt Reports let procurement and audit teams verify what a whole fleet enforced, offline, with the free Apache binary. Anyone can verify a Fleet Receipt Report; only an Enterprise Conductor can mint one."
  - q: "How does license renewal work?"
    a: "Active subscribers get a replacement license by email before the current one expires. Install it with `pipelock license install <token>` and restart Pipelock. If a paid license expires, Pipelock falls back to Community instead of shutting off protection."
  - q: "What's the refund policy?"
    a: "30-day money-back guarantee, no questions asked. Annual plans get prorated refunds after 30 days. All refunds processed through Polar. [Full refund policy](/refund/)."
  - q: "How do I manage my subscription?"
    a: "Log into the [Polar customer portal](https://polar.sh) to update your payment method, switch plans, download invoices, or cancel. You can also email [luckypipe@pipelab.org](mailto:luckypipe@pipelab.org) and we will handle it for you."
---

<div class="pricing-plans">

<div class="pricing-billing-toggle" data-billing-toggle role="group" aria-label="Billing period">
  <button type="button" class="pricing-bill-btn is-active" data-bill="monthly" data-event="pricing_billing_selected" data-event-placement="pricing-toggle" data-event-value="monthly" aria-pressed="true">Monthly</button>
  <button type="button" class="pricing-bill-btn" data-bill="annual" data-event="pricing_billing_selected" data-event-placement="pricing-toggle" data-event-value="annual" aria-pressed="false">Annual <span class="pricing-bill-save">save 17%</span></button>
</div>

<div class="pricing-tier-grid pricing-tier-grid--duo" data-fx="reveal">

<article class="pricing-tier" data-fx="reveal spotlight" data-tier="community">
  <p class="pricing-tier-name">Community</p>
  <p class="pricing-tier-price">$0</p>
  <p class="pricing-tier-period">Forever. No credit card.</p>
  <p class="pricing-tier-scope">Full security engine, one default security profile.</p>
  <p class="pricing-tier-value">One profile. Full free engine.</p>
  <p class="pricing-tier-bridge">Move to Pro for multi-agent coordination: separate policies, budgets, and audit trails for named profiles.</p>

  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">01</span> Detect</p>
    <ul class="pricing-feat-list">
      <li>Fixed-order scanner pipeline, 65 DLP patterns (keys, tokens, PII)</li>
      <li>MCP scanning: input, response, and tool poisoning</li>
      <li>Prompt-injection detection across encoding chains</li>
      <li>SSRF, private-IP, and cloud-metadata blocking</li>
      <li>Canary tokens: plant a synthetic secret, know the moment it moves</li>
    </ul>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">02</span> Enforce</p>
    <ul class="pricing-feat-list">
      <li>Kill switch with {{< stat key="kill_switch_sources" >}} independent sources (fail-closed)</li>
      <li>Adaptive enforcement + human-in-the-loop approvals</li>
      <li>MCP tool policy: warn, block, redirect, defer</li>
      <li>Kernel-enforced egress containment (nftables owner-match)</li>
    </ul>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">03</span> Prove</p>
    <ul class="pricing-feat-list">
      <li>Ed25519-signed decision receipts</li>
      <li>Free receipt verifiers: CLI (Go, TypeScript, Rust, Python) and in-browser, no server</li>
      <li>Web evidence viewer: <code>pipelock evidence view</code> renders a session as a self-contained HTML report</li>
      <li>Signed audit reports (HTML, JSON, SARIF)</li>
      <li>Signed, hot-reloadable rule bundles (28 community rules)</li>
    </ul>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">04</span> Operate</p>
    <ul class="pricing-feat-list">
      <li>Fetch, forward, and WebSocket proxy + MCP (stdio + HTTP)</li>
      <li>TLS interception + cross-request detection</li>
      <li>Process sandbox: Landlock on supported Linux systems; seccomp on Linux/amd64 with kernel support; Seatbelt via sandbox-exec on macOS</li>
      <li>Core CLI, all 7 presets, Prometheus + OTLP, attack simulation</li>
    </ul>
  </div>

  <p class="pricing-tier-aud"><strong>Preview:</strong> Guard is a Linux HTTP/HTTPS egress-guard preview. It is excluded from the released capability manifest.</p>

  <div class="pricing-tier-cta">
    <a href="https://github.com/pipelab-org/pipelock" class="btn btn-ghost" target="_blank" rel="noopener noreferrer">Get Started</a>
    <p class="pricing-tier-aud"><a href="/pipelock/">See all capabilities &rarr;</a></p>
  </div>
</article>

<article id="pro" class="pricing-tier is-featured" data-fx="reveal spotlight" data-tier="founding">
  <p class="pricing-tier-badge">Founding Offer</p>
  <p class="pricing-tier-name">Founding Pro</p>
  <p class="pricing-tier-price" data-price-monthly="$49" data-price-annual="$490">
    <span class="pricing-tier-price-currency">$</span><span class="pricing-tier-price-amount" data-price-amount>49</span><span class="pricing-tier-price-period" data-price-period>/mo</span>
    <span class="pricing-tier-price-strike" data-strike-monthly="$99/mo" data-strike-annual="$990/yr">$99/mo</span>
  </p>
  <p class="pricing-tier-period" data-tier-period-detail data-period-monthly="or $490/yr · save $98" data-period-annual="$490 billed yearly · save $98">or $490/yr · save $98</p>

  <p class="pricing-tier-scope">Many named security profiles, one admin boundary.</p>
  <p class="pricing-tier-value">Multi-agent coordination.</p>
  <p class="pricing-tier-bridge">Keep the full free engine. Add named profiles with separate policies, budgets, and audit trails in one deployment.</p>

  <p class="pricing-tier-grandfather">★ Grandfathered for life</p>
  {{< founding-seats >}}

  <div class="pricing-feat-block">
    <p class="pricing-everything">Everything in Community</p>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">01</span> Coordination</p>
    <ul class="pricing-feat-list">
      <li>Named security profiles (unlimited)</li>
      <li>Per-profile DLP, allowlists, rate limits</li>
      <li>Per-profile mode and enforce overrides</li>
      <li>Per-profile MCP tool policy</li>
    </ul>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">02</span> Identity &amp; budgets</p>
    <ul class="pricing-feat-list">
      <li>Dedicated agent listeners (spoof-proof)</li>
      <li>Source CIDR agent resolution</li>
      <li>Usage budgets (requests, bytes, domains)</li>
      <li>Per-agent API allowlists and SSRF trusted domains</li>
      <li>Per-agent crypto address allowlists</li>
    </ul>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">03</span> Govern</p>
    <ul class="pricing-feat-list">
      <li>Operator dashboard: live evidence, agent roster, exemption inventory</li>
      <li>Per-agent behavioral baselines: learn, then lock</li>
      <li>Per-profile session-profiling thresholds</li>
      <li>Per-agent process sandbox overrides</li>
    </ul>
  </div>
  <div class="pricing-feat-block">
    <p class="pricing-feat-head"><span class="pricing-feat-num">04</span> Audit</p>
    <ul class="pricing-feat-list">
      <li>Profile-scoped audit trails and signed receipts</li>
      <li>Per-profile metrics and Prometheus labels</li>
      <li>Cross-agent session isolation (no cross-agent leakage)</li>
      <li class="pricing-feat-dim">Best-effort email support</li>
    </ul>
  </div>

  <div class="pricing-tier-cta">
    <a href="https://buy.polar.sh/polar_cl_QTxAmBq1Fxuok8crBrvzbWsSm0IZfpQF875fM1FtvNb" class="btn btn-primary" target="_blank" rel="noopener noreferrer" data-event="checkout_started" data-event-placement="pricing-tier" data-event-value="pro_founding">Claim Founding Price</a>
    <p class="pricing-tier-aud"><a href="https://buy.polar.sh/polar_cl_ff23dTaTesK9RZrtU3nJqsjQJjRS3pFJCTRcR129P9L" target="_blank" rel="noopener noreferrer" data-event="checkout_started" data-event-placement="pricing-tier-trial" data-event-value="pro_trial">Or try Pro free for 30 days</a>. No card, no automatic charge.</p>
    <p class="pricing-tier-aud">For startups, small teams, and solo builders coordinating multiple agent profiles.</p>
  </div>
</article>

</div>

<p class="pricing-duo-foot">Free engine to paid coordination. The same flat rate either way.</p>

<div class="pricing-flat-strip">
  <p>Your agent count can 10x. Your bill won&rsquo;t.</p>
  <ul class="pricing-flat-chips">
    <li>No seats</li>
    <li>No per-agent pricing</li>
    <li>No per-request metering</li>
    <li>Flat rate at every tier</li>
  </ul>
</div>

</div>

<!-- ── Enterprise fleet-governance ladder band ───────────── -->

<section class="pricing-fleet pricing-chapter" data-fx="reveal" aria-label="Enterprise fleet governance">
  <div class="pricing-fleet-head">
    <p class="pricing-fleet-eyebrow">Fleet governance</p>
    <h2 class="pricing-fleet-title" data-fx="decrypt">Fleet governance is flat-priced too</h2>
    <p class="pricing-fleet-lead">Anyone can verify a Fleet Receipt Report with the free Apache binary. Only an Enterprise Conductor can mint one.</p>
    <p class="pricing-fleet-sub">For teams that need signed policy distribution, fleet audit aggregation, and procurement evidence. No seats. No per-agent meter. No quote maze.</p>
    <p class="pricing-fleet-sub">Day-two operations ship with it: enrol and remove followers, publish and roll back policy, rotate and revoke keys, back up and restore control-plane state, and query the fleet audit trail.</p>
  </div>

  <p class="pricing-ladder-label">Enterprise on-ramp</p>

<div class="pricing-ladder">

<article class="pricing-rung" data-fx="spotlight tilt">
  <p class="pricing-rung-step"><span class="pricing-rung-num">01</span> Evaluate</p>
  <p class="pricing-rung-price">$5,000</p>
  <p class="pricing-rung-period">60 days</p>
  <p class="pricing-rung-desc">Credited toward year one if you sign within 30 days of the eval ending. You walk away with your own signed Fleet Receipt Report either way.</p>
  <a href="https://buy.polar.sh/polar_cl_ToGNrYlQDH6Xrnf9kBvrrSG3D3yRn0P0y4xEZ2Z0cCH" class="btn btn-ghost pricing-rung-cta" target="_blank" rel="noopener noreferrer" data-event="checkout_started" data-event-placement="pricing-tier" data-event-value="enterprise_eval">Start a $5k eval</a>
</article>

<article class="pricing-rung is-featured" data-fx="spotlight tilt">
  <p class="pricing-rung-badge">Best on-ramp</p>
  <p class="pricing-rung-step"><span class="pricing-rung-num">02</span> Design Partner</p>
  <p class="pricing-rung-price">$15,000</p>
  <p class="pricing-rung-period">year one</p>
  <p class="pricing-rung-desc">For the first 3 enterprise buyers who want direct input on Conductor, Fleet Receipt Reports, and evidence workflows. Includes the same flat fleet license for year one.</p>
  <p class="pricing-rung-note">Renews at the published $25,000/year price unless both sides agree otherwise.</p>
  <p class="pricing-rung-scarcity">Limited to 3 design partners</p>
  <a href="https://buy.polar.sh/polar_cl_uEr20ZxF9tPBNCmuERPpx8L2MI0J4Dw6gfav42LAcnD" class="btn btn-primary pricing-rung-cta" target="_blank" rel="noopener noreferrer" data-event="checkout_started" data-event-placement="pricing-tier" data-event-value="enterprise_design_partner">Become a design partner</a>
</article>

<article class="pricing-rung" data-fx="spotlight tilt">
  <p class="pricing-rung-step"><span class="pricing-rung-num">03</span> Annual</p>
  <p class="pricing-rung-price">$25,000</p>
  <p class="pricing-rung-period">per year</p>
  <p class="pricing-rung-desc">Flat contract. Your agent count can grow without changing the bill.</p>
  <a href="https://buy.polar.sh/polar_cl_LZMUGHD1BTl7uY9RanjBsp9keZUs4R5ioj6iM3MZGxT" class="btn btn-ghost pricing-rung-cta" target="_blank" rel="noopener noreferrer" data-event="checkout_started" data-event-placement="pricing-tier" data-event-value="enterprise_annual">Buy annual: $25,000/yr</a>
</article>

</div>

  <p class="pricing-fleet-everything">Everything in Pro, plus fleet governance and signed evidence.</p>

<div class="pricing-fleet-features">

<div class="pricing-feat-block">
<p class="pricing-feat-head">Fleet control</p>
<ul class="pricing-feat-list">
  <li>Signed policy bundles pushed to every follower</li>
  <li>One-command rollback</li>
  <li>Emergency remote kill, M-of-N signed</li>
</ul>
</div>

<div class="pricing-feat-block">
<p class="pricing-feat-head">Evidence and audit</p>
<ul class="pricing-feat-list">
  <li>Signed fleet report, verified offline with the free binary</li>
  <li>Durable fleet audit aggregation and query</li>
  <li>Live stream observability</li>
</ul>
</div>

<div class="pricing-feat-block">
<p class="pricing-feat-head">Ongoing operations</p>
<ul class="pricing-feat-list">
  <li>Enrollment-token lifecycle and recovery</li>
  <li>Backup, restore, repair</li>
  <li>Self-hosted, named entity, async support</li>
</ul>
</div>

</div>

  <ul class="pricing-fleet-honesty">
    <li>Async product support with a response target, not an SLA</li>
    <li>No professional services</li>
    <li>Self-hosted, no phone home</li>
  </ul>
</section>

<script>
(function () {
  // Monthly/Annual toggle. Updates price + period text on the Founding card
  // (the only paid tier whose annual presentation differs). Uses aria-pressed
  // for the segmented control semantics, not role="tablist".
  var btns = document.querySelectorAll('[data-billing-toggle] [data-bill]');
  var amount = document.querySelector('[data-price-amount]');
  var period = document.querySelector('[data-price-period]');
  var strike = document.querySelector('[data-strike-monthly]');
  var detail = document.querySelector('[data-tier-period-detail]');
  if (!btns.length) return;

  function setBilling(mode) {
    var isAnnual = mode === 'annual';
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset.bill === mode;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (amount) amount.textContent = isAnnual ? '490' : '49';
    if (period) period.textContent = isAnnual ? '/yr' : '/mo';
    if (strike) strike.textContent = isAnnual ? strike.dataset.strikeAnnual : strike.dataset.strikeMonthly;
    if (detail) detail.textContent = isAnnual ? detail.dataset.periodAnnual : detail.dataset.periodMonthly;
  }

  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (e) {
      setBilling(e.currentTarget.dataset.bill);
    });
  }
})();
</script>

<!-- ── At-a-glance comparison matrix ─────────────── -->

<section class="pricing-matrix" id="compare-tiers" data-fx="reveal" aria-label="Tier feature comparison">
  <div class="pricing-matrix-head">
    <p class="pricing-matrix-label">At a glance</p>
    <h2 data-fx="decrypt">What changes between tiers</h2>
    <p class="pricing-matrix-sub">Detection is free. Coordination is paid. Governance is enterprise.</p>
  </div>

  <div class="pricing-matrix-table-wrap">
    <table class="pricing-matrix-table">
      <thead>
        <tr>
          <th scope="col">Feature</th>
          <th scope="col">Community</th>
          <th scope="col" class="is-featured">Pro</th>
          <th scope="col">Enterprise</th>
        </tr>
      </thead>
      <tbody>
        <tr class="pricing-matrix-group"><th colspan="4" scope="colgroup">Detection and evidence &middot; free at every tier</th></tr>
        <tr><td>Fixed-order scanner pipeline</td><td class="cell-yes">Full</td><td class="cell-yes is-featured">Full</td><td class="cell-yes">Full</td></tr>
        <tr><td>MCP proxy + tool scanning</td><td class="cell-yes">Full</td><td class="cell-yes is-featured">Full</td><td class="cell-yes">Full</td></tr>
        <tr><td>Process sandbox + kill switch</td><td class="cell-yes">Full</td><td class="cell-yes is-featured">Full</td><td class="cell-yes">Full</td></tr>
        <tr><td>Signed reports (HTML / JSON / SARIF)</td><td class="cell-yes">Full</td><td class="cell-yes is-featured">Full</td><td class="cell-yes">Full</td></tr>
        <tr><td>Agent Evidence Level records (native)</td><td class="cell-yes">Full</td><td class="cell-yes is-featured">Full</td><td class="cell-yes">Full</td></tr>
        <tr class="pricing-matrix-group"><th colspan="4" scope="colgroup">Coordination &middot; Pro</th></tr>
        <tr><td>Named security profiles</td><td class="cell-no">1 default</td><td class="cell-yes is-featured">Unlimited</td><td class="cell-yes">Unlimited</td></tr>
        <tr><td>Per-profile DLP, allowlists, rate limits</td><td class="cell-no">No</td><td class="cell-yes is-featured">Yes</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Per-profile mode + enforce overrides</td><td class="cell-no">No</td><td class="cell-yes is-featured">Yes</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Per-profile MCP tool policy</td><td class="cell-no">No</td><td class="cell-yes is-featured">Yes</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Usage budgets per profile</td><td class="cell-no">No</td><td class="cell-yes is-featured">Yes</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Dedicated agent listeners + CIDR resolution</td><td class="cell-no">No</td><td class="cell-yes is-featured">Yes</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Per-profile audit trails + Prometheus labels</td><td class="cell-no">No</td><td class="cell-yes is-featured">Yes</td><td class="cell-yes">Yes</td></tr>
        <tr class="pricing-matrix-group"><th colspan="4" scope="colgroup">Fleet governance &middot; Enterprise</th></tr>
        <tr><td>Signed fleet policy distribution</td><td class="cell-no">No</td><td class="cell-no is-featured">No</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Fleet audit aggregation + one-command rollback</td><td class="cell-no">No</td><td class="cell-no is-featured">No</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Emergency remote kill, M-of-N signed</td><td class="cell-no">No</td><td class="cell-no is-featured">No</td><td class="cell-yes">Yes</td></tr>
        <tr><td>Fleet Receipt Reports</td><td class="cell-no">No</td><td class="cell-no is-featured">No</td><td class="cell-yes">Yes</td></tr>
      </tbody>
      <tfoot>
        <tr class="pricing-matrix-foot"><td colspan="4">The Assess license ($999/yr) is separate from these tiers and works with any of them.</td></tr>
      </tfoot>
    </table>
  </div>
</section>

<!-- ── Assess License Band ──────────────────── -->

<div class="assess-band pricing-chapter pricing-chapter-violet" data-fx="reveal">
  
  <div class="assess-inner assess-inner-split">
    <div class="assess-left assess-pitch">
      <p class="pricing-fleet-eyebrow">Assess &middot; annual license</p>
      <h2 class="pricing-fleet-title" data-fx="decrypt">Grade your deployment. Keep the receipt.</h2>
      <div class="assess-price"><span class="currency">$</span>999<span class="period">/yr</span></div>
      <p class="assess-desc">Run <code>pipelock assess</code> against your deployment and get the full security assessment: server-specific findings, remediation guidance, and detailed framework mappings. Run collects evidence; finalize generates HTML and JSON output with an Ed25519-signed manifest by default in both tiers; the license adds an optional offline-verifiable attestation and badge anyone can re-check with the free verifier.</p>
      <div class="assess-actions">
        <a href="/assess/" class="btn btn-primary">Get Assess License</a>
        <a href="/assess/demo-assessment/" class="btn btn-ghost">View a demo report</a>
      </div>
    </div>
    <div class="assess-report" data-fx="scan" aria-hidden="true">
      <div class="assess-report-top"><span>SECURITY ASSESSMENT</span><span class="assess-report-sig">ED25519 SIGNED</span></div>
      <div class="assess-report-main">
        <div>
          <div class="assess-report-grade">A&minus;</div>
          <p class="assess-report-verdict">PASS &middot; 23 categories</p>
        </div>
        <ul class="assess-report-meta">
          <li><i>&#10003;</i> signed manifest</li>
          <li><i>&#10003;</i> attestation + badge</li>
          <li><i>&#10003;</i> HTML &middot; JSON &middot; SARIF</li>
          <li class="assess-report-cmd">$ pipelock assess</li>
        </ul>
      </div>
      <div class="assess-report-bars">
        <div class="assess-report-bar"><span>OWASP</span><i style="--w: 92%"></i></div>
        <div class="assess-report-bar"><span>NIST AI RMF</span><i style="--w: 88%"></i></div>
        <div class="assess-report-bar"><span>EU AI Act</span><i style="--w: 84%"></i></div>
        <div class="assess-report-bar"><span>SOC 2</span><i style="--w: 90%"></i></div>
      </div>
      <div class="assess-report-stamp">VERIFY OFFLINE</div>
    </div>
    <div class="assess-compare">
      <div class="assess-compare-card" data-fx="spotlight">
        <h3 class="assess-card-title">Free Summary</h3>
        <ul>
          <li>Overall letter grade</li>
          <li>Section scores</li>
          <li>Top findings summary</li>
          <li>Pass/fail verdict</li>
          <li>Ed25519-signed manifest</li>
        </ul>
      </div>
      <div class="assess-compare-card paid" data-fx="spotlight">
        <h3 class="assess-card-title">Assess License</h3>
        <ul>
          <li>Server-specific findings</li>
          <li>Remediation guidance</li>
          <li>Detailed framework mappings (OWASP, NIST AI RMF, EU AI Act, SOC 2)</li>
          <li>Risk rating + exposure analysis</li>
          <li>Offline-verifiable attestation + badge</li>
        </ul>
      </div>
    </div>
  </div>
</div>

<section class="pricing-promise" data-fx="reveal" aria-label="Community forever promise">
  <h2 data-fx="decrypt">Community Forever Promise</h2>
  <p class="pricing-promise-lead">Everything that shipped free in v0.3.6, the last release before paid features, stays free. No clawbacks.</p>
  <p>That includes the full scanner pipeline, all proxy modes, MCP protections, TLS interception, kill switch, HITL approvals, audit logging, metrics, reports (HTML, JSON, SARIF), integrity monitoring, all CLI commands from that release, and all presets. If it detects, blocks, scans, or produces signed evidence, it stays free.</p>
</section>
