# PipeLab brand and design guide

This guide covers copy and design for the PipeLab website. It applies to all contributors. PipeLab is the parent brand and website; Pipelock is its agent firewall product.

The live site uses the tokens in `themes/pipelab/assets/scss/_variables.scss` and the shared rules in `_brand-standards.scss`. Files in `.brand/sync/` and `.brand/colors_and_type.css` are references for other asset work; they do not replace the theme files. Product counts come from `data/stats.yaml`, with its recorded source and date.

## Brand identity

- Use **PipeLab** for the parent brand and website and **Pipelock** for the product. Use these spellings in prose, even when an image uses an uppercase wordmark.
- Use **AI** in uppercase and **open-source** as a compound adjective. Copy uses plain punctuation without em dashes.
- Address the reader as **you** and describe product behavior in the third person. Company narration belongs on the About page.
- Use **agent firewall** as the product category. The PipeLab identity tagline is **Agent Security**, rendered as `AGENT SECURITY` beneath its wordmark on identity surfaces.
- Explain features with public evidence and their coverage limits. Traffic inspection applies to supported traffic mediated by Pipelock; prevention of direct bypass also depends on deployment isolation and egress controls.

## Writing style

Use direct, technical language. Describe what the product does and what the reader can verify. Use sourced measurements where they help, and include the measured version or scope when it matters. Keep the writer's own voice in attributed articles. Do not invent customer names, quotes, features, or performance claims.

### Anti-vocabulary (forbidden)

revolutionary, leverage, synergy, unleash, unlock, empower, seamlessly, cutting-edge, next-generation, next-gen, world-class, robust, holistic, transform, AI security platform, detection engine, zero trust architecture, enterprise-grade, lightweight solution, freemium, real-time protection, cloud-native, scalable SaaS, comprehensive.

No emoji. No exclamation marks. No hype.

### Canonical terminology

| Use | Avoid |
|---|---|
| agent firewall | AI security platform |
| scanner pipeline | detection engine |
| capability separation | zero trust architecture |
| fail-closed | enterprise-grade security |
| single binary | lightweight solution |
| open-source core | freemium model |
| policy at the point of action | real-time protection |

When the scanner cannot decide, it drops the request. Call this **fail-closed**, not "closes on failure", not "secure by default".

## Default product sentence

> Pipelock sits between AI agents and the internet and blocks secret leaks, unsafe tool traffic, and prompt-injection responses.

## Load-bearing facts

- **Scanner pipeline:** fixed security-sensitive order for mediated URL traffic, with DLP before DNS resolution and documented transport-specific limits. Do not publish a fixed layer count; the checks evolve.
- **DLP:** Use `dlp_patterns` from `data/stats.yaml` for the count; don't keep a second copy here. Families include cloud and payment provider credentials, GitHub tokens, JWTs, private keys, and PII.
- **Agent Egress Bench:** public adversarial corpus and methodology.
- **Binary and licensing:** Pipelock ships as a single Go binary. The core uses Apache 2.0; enterprise modules use the Elastic License 2.0. A size claim must identify the measured release artifact and whether it is compressed or unpacked.
- **Dependencies:** Use `direct_deps` from `data/stats.yaml`; don't keep a second count here. There's no separate runtime service or model dependency.
- **Capability separation:** limit the proxy to the access its configured functions need. Leak detection can retain selected environment and configured secret-file values in memory; treat the proxy and those inputs as sensitive. Proxy scanning covers routed traffic; supported Linux containment can block direct egress when configured and its live restrictions are verified.
- **Fail-closed:** timeouts, parse failures, and malformed inputs block on mediated enforcement paths. Do not extend this claim to traffic that bypasses Pipelock.
- **Evidence:** Ed25519-signed decision records and signed YAML rule bundles, hot-reloadable.
- **Stack:** HTTP/1.1, HTTP/2, WebSocket, MCP, and A2A where documented.
- **Pricing:** The Apache 2.0 scanner is free without per-agent metering; Community has one default security profile. Pro is $49/mo Founding ($99/mo standard). Enterprise is $25k/yr, with a $5k evaluation and limited $15k design-partner offer.
- **Apache 2.0 promise:** community forever, no clawbacks.
- **Surfaces:** `/`, `/pipelock/`, `/proof/`, `/pricing/`, `/enterprise/`, `/about/`, `/learn/`, `/blog/`, `/compare/`, `/gauntlet/`.

## Visual rules

- **Dark only.** `#09090b` page background. Near-black ramp, not navy.
- **One brand accent:** `#00e5a0` Pipelock teal. Purple `#7c3aed` only as a dim hero radial, never as type, button, or border.
- **Headings are mono.** JetBrains Mono Bold for h1, h2, h3, eyebrows, stat numbers, button text, terminal chrome. Inter for body.
- **Type scale:** h1 36px, h2 26px, body 16px, code and eyebrow 14px, caption 12px, wordmark and display 52px. Stats 28px mono accent.
- **Wordmark:** mixed case (PipeLab, Pipelock), two-tone (`Pipe`-slate, brand-accent on the second syllable), default tracking. Pair the PipeLab wordmark with the AGENT SECURITY tagline on identity surfaces.
- **PipeLab mark:** use the canonical two-dot flask generated by `scripts/render_pipelab_brand.py`. The dots may read as observations or stars. Do not add a chart line or substitute Pipelock's padlock or a generic flask-and-atom symbol.
- **Tagline:** Inter Regular, 14px, uppercase, letter-spacing +4px (`0.286em`), color `#94a3b8`.
- **Cards are translucent:** `rgba(255,255,255,0.04)` background, `1px solid rgba(255,255,255,0.06)` border, `border-radius: 12px`.
- **Hover:** border lifts to teal plus 2px upward translate. No fill swap, no scale.
- **Effects use one registry:** page markup may opt into `count`, `decrypt`, `live`, `mininav`, `reveal`, `scan`, `sky`, `spotlight`, `tilt`, or `type` through `data-fx`. Shared behavior lives in `site-fx.js` and shared styling lives in `_fx.scss`. Do not add page-local pointer tracking, glow layers, connector lines, or decorative center-seam glyphs.
- **Raise siblings with every page pass:** when a page duplicates an approved effect, replace the duplicate with the shared token and check the same component on related pages. A new effect needs a shared implementation, reduced-motion and no-JavaScript behavior, and an audit rule before any page can use it.
- **Glow shadows only on accent surfaces** (primary buttons, featured pricing card). Cards have no shadow.
- **Eyebrows** are uppercase mono words: DETECT, ENFORCE, PROVE, EVIDENCE, ARCHITECTURE, GET STARTED.
- **Iconography** is Heroicons outline 24x24, stroke 1.5, `currentColor` set to `var(--accent)`. No emoji.
- **Layout:** single column, max-width 1100px, 5rem section padding, sticky nav with backdrop-blur 12px over `rgba(9,9,11,0.85)`.
- **Hero contracts:** every page template declares one `data-hero` contract. `home` is the interactive homepage; `brand-standard` is a conventional landing page; `brand-rich` is a content-heavy product surface; `editorial-index` and `editorial-article` are quiet reading surfaces; `utility` is a compact task or artifact page. Do not invent a seventh treatment for one page.
- **Hero field:** `brand-standard` and `brand-rich` use the canonical static `pipelab-constellation.svg` field at one shared opacity. Keep a clear reading zone behind the headline. Do not add page-specific star patterns, opacity modifiers, glow layers, or grid overlays.
- **Hero sizing:** Standard branded heroes use `min-height: clamp(32rem, 58svh, 37.5rem)` on desktop and become content-driven below the tablet breakpoint. Rich branded heroes remain content-driven. Both contain identity, one lead, actions, and optional facts; put demos, diagrams, and evidence in adjacent sections. Avoid fixed heights that clip content or leave an empty screen.
- **Homepage exception:** `home` alone uses the interactive receipt-particle constellation. Do not reuse that animation as decoration on another page. Respect reduced motion and keep all other hero fields static.
- **Editorial indexes are one shell:** Blog, Learn, and Compare share the same hero height, top alignment, title and lead measures, padding, and background. Their copy and controls below the header may differ.
- **Long product pages need rhythm:** do not repeat one card primitive for consecutive sections. Alternate only when the content calls for it: capability map, ledger, ordered process, terminal, evidence panel, reference list, or editorial band. Number chips are reserved for sequences whose order matters.
- **No viewport-width bleed inside scrollable pages:** do not set a content chapter to `width: 100vw`. The scrollbar gutter makes it overflow. Use the shared content rail or a scrollbar-safe auto-width bleed.
- **Quiet surfaces:** `editorial-index`, `editorial-article`, and `utility` use the plain dark background. Blog, learn, compare, legal, receipts, contact, form, error, and detail pages must not inherit a generated sky or branded field accidentally.

## Applying the design system

1. For site changes, use `themes/pipelab/assets/scss/_variables.scss` and `_brand-standards.scss`. `.brand/colors_and_type.css` is a standalone asset reference; don't copy it over the theme stylesheet. Propose additions to the shared token system when existing tokens don't cover a requirement.
2. Use the assets in the design system or repo (`pipelock-logo.png`, `architecture.svg`, `ecosystem-flywheel.svg`, screenshots, OG images) as imagery. Do not generate new illustrations.
3. CTAs are short verbs: Install, Get Started Free, GitHub, See Pipelock, Pricing, Claim Founding Pro.
4. End conversion sections with "Public methodology. Public attack cases. Public Pipelock results."

## Evidence for claims

Support feature, customer, pricing, and performance claims with public sources. If a claim can't be verified, leave it out or describe the uncertainty in the pull request. Use the existing product names, tiers, and category language.
