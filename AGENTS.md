# AGENTS.md: pipelab.org

Hugo static site for PipeLab. Served by a Cloudflare Worker (`src/worker.js`,
`wrangler.jsonc`) with `./public` as static assets. Auto-deploys on push to
main via Cloudflare's GitHub integration.

## Hard Rules

- **Always preview locally before pushing.** Run `hugo server -p 1314 --bind 0.0.0.0`, share the correct preview URL for the current environment, and wait for go-ahead.
- **Never push to main.** Branch protection is enabled. Always use a PR.
- **Never push without explicit approval.**
- **Never curl live URLs before deploy completes.** Cloudflare caches 404s.
- **Published blog posts are frozen by default.** Frontmatter (title, description, linkTitle, tags) can be updated for SEO without approval. Body edits require explicit Josh approval in the current session: state the concrete reason (broken command, factual error, dead link, broken URL), show the minimal diff, and wait for agreement before editing. Do not self-authorize body edits for typos, stylistic polish, voice changes, or reframing — those stay frozen. "It would be nicer this way" is not a reason; "this command no longer exists" is.
- **Author is always "Josh Waldrep".** Not luckyPipewrench, not PipeLab.
- **Add specific files only.** Never `git add -A` or `git add .`.
- **Sanitize before committing.** No personal names (except author), IPs, cluster details, bot names, internal workflow.

## Branding Rules (NON-NEGOTIABLE)

**Source of truth:** [`.brand/SKILL.md`](.brand/SKILL.md). Read before writing copy or designing surfaces. Anti-vocabulary, terminology table, voice rules, and visual rules all live there. Theme tokens live at `themes/pipelab/assets/scss/_variables.scss`.

- **PipeLab** is the site and project brand. **Pipelock** is the product. Use exact casing.
- Default category language is **open-source agent firewall** or **agent firewall for MCP and agent traffic**. Do not invent new category labels casually.
- Default product sentence: **Pipelock sits between AI agents and the internet and blocks secret leaks, unsafe tool traffic, and prompt-injection responses.**
- Default proof line: **Public methodology. Public attack cases. Public Pipelock results.**
- Use the gauntlet as **proof**, not as fake neutral market adoption. Do not imply broad multi-vendor participation unless that is actually true on the page.
- Keep the site wedge centered on **MCP security + agent egress security**. Do not let hero copy drift into unrelated categories without a deliberate decision.
- Before changing `/`, `/pipelock/`, `/proof/`, `/pricing/`, `/enterprise/`, or `/about/`, read the current copy on all six pages first and keep naming, proof language, and positioning aligned.
- Cross-cutting visual rules (scrollbar, text-wrap, FAQ + cta + share alignment, pill centering) live at `themes/pipelab/assets/scss/_brand-standards.scss`. Read it before touching any layout SCSS; rules are documented inline in the file.

### Responsive template rules

- Build pages from shared template primitives before adding page-specific classes. A one-page layout is the exception and needs a concrete reason.
- Every H1 template declares one `data-hero` contract from `.brand/SKILL.md`. Standard branded heroes also use `site-hero`, `brand-field-hero`, and `brand-field-hero-standard`.
- A hero contains the eyebrow, title or lockup, one lead, actions, and optional facts. Put diagrams, demos, evidence tables, and explainers in the next section.
- Start with the narrow layout. Use the breakpoint tokens in `_variables.scss`; don't add arbitrary media-query widths.
- Don't use fixed content heights. Use `min()`, `max()`, `clamp()`, `minmax()`, wrapping, and content-driven height. Horizontal scrolling is allowed only for data tables, diagrams, and code that can't reflow.
- Buttons wrap on smaller screens and become full-width on phones when two side-by-side buttons would squeeze their labels.
- Before a visual PR, inspect every changed template at 390x844, 768x1024, 1366x768, and 1440x900. Check horizontal overflow, clipped text, overlapping controls, tap targets, readable line length, and whether the next section begins without dead space.
- Add or extend a source-level audit when a new shared layout rule can be checked mechanically. A screenshot is approval evidence, not the only regression guard.

## SEO Rules (NON-NEGOTIABLE)

### Keyword Targeting

**One keyword per page. No cannibalization.** Before changing any title or description, check the current keyword map. Two pages competing for the same keyword split ranking power and neither wins.

### Title Tags

- Rendered as `{linkTitle} | PipeLab` in the browser tab.
- **Target: under 50 chars for `linkTitle`** so the full `<title>` stays under 60.
- `title` is the full SEO title (used in `<h1>`, OG tags, structured data).
- `linkTitle` controls the `<title>` tag and nav/breadcrumbs. Falls back to `title` if not set.
- Title must contain the page's primary keyword.

### Meta Descriptions

- Every indexable page needs a unique `description:` in frontmatter.
- **120-155 characters.** Must contain primary keyword. No em-dashes, no AI-speak.

### Heading Hierarchy

H1 (template title) → H2 (markdown `##`) → H3 (`###`). No level skips.

- Template renders `<h1>` from frontmatter `title`. Content starts at `##`.
- Footer/card/widget labels use `<span>` with a class, never heading tags.

### External Links

Markdown links auto-get `target="_blank" rel="noopener noreferrer"` via render hook at `layouts/_default/_markup/render-link.html`. Raw HTML `<a>` tags must add these manually.

### Page Noindex

Add `robots: "noindex, follow"` to frontmatter. Template checks `.Params.robots` before taxonomy fallback.

### Internal Linking

New pages need links from: nav (hugo.toml), footer (footer.html), parent section index, product page (`pipelock.md`), and related content pages. Orphan pages get no crawl priority.

### Redirects

`static/_redirects` (Cloudflare Pages format). Append-only. Don't use Hugo `aliases:`.

## Machine Access Policy (NON-NEGOTIABLE)

The site is a distribution asset. Optimize for human discovery, search visibility, citation, user-directed retrieval, and model training.

- Current public posture: allow everything. `robots.txt` is a single `User-agent: *` / `Allow: /` with no vendor-specific blocks and no training exclusions.
- Training reach is treated as distribution. A model that trained on this material can answer agent-security questions without the reader having to find PipeLab first, so the corpus is not withheld from training crawlers.
- Do not reintroduce a partial block. The previous policy blocked `GPTBot` and `ClaudeBot` while allowing `anthropic-ai`, `Google-Extended`, `Applebot-Extended`, `DeepseekBot`, and `Meta-ExternalAgent`, so Anthropic training was blocked under one user-agent name and allowed under another. If the policy ever reverses, block the full current list of training crawlers rather than the two best-known names, and say why in the PR.
- Changing this posture is Josh's call, not a cleanup.
- Cloudflare Markdown for Agents no longer conflicts with the stated posture: its converted responses default to `Content-Signal: ai-train=yes, search=yes, ai-input=yes`, which now matches this site. Enabling it is still a deliberate decision with its own tradeoffs, so scope it and state them in the PR.
- Keep these files aligned whenever policy changes:
  - `static/robots.txt`
  - `static/llms.txt`
  - `static/llms-full.txt`
  - `static/_headers`
- When any core positioning page changes (`/`, `/pipelock/`, `/proof/`, `/pricing/`, `/enterprise/`, `/about/`, `/learn/`, `/compare/`, `/agent-firewall/`), update the llms surfaces in the same PR if the summary or category language changed.

## Workflow: Any Content Change

### 1. Make changes

Create or edit files in `content/`. For blog posts, match Josh's established voice and verify technical accuracy against the pipelock codebase.

### 2. SEO check

- Heading hierarchy: verify with the local audit helper before push (must be 0 broken)
- Description length: 120-155 chars
- linkTitle length: under 50 chars
- External HTML links: must have `target="_blank"`
- Keyword: check map, no duplicates
- Run `npm run site:audit` before proposing a PR. Treat failures as real regressions unless proven otherwise.
- Run BOTH `make preflight` and `npm run site:audit`. Preflight does not invoke the audit, so a green preflight alone does not predict CI.

#### Structured data

Every JSON-LD property is validated against `data/schema-org-properties.json`. That table lists the properties this site emits, each confirmed valid for its type against the published schema.org vocabulary by `scripts/generate-schema-property-table.mjs`. It records only what the site emits rather than the whole vocabulary, which would drag thousands of unrelated terms into a public repository.

Two guards, and the second is what makes the first hard to defeat:

- The audit reports any emitted property missing from the table, so a newly-emitted one is flagged as unverified rather than silently accepted.
- The generator refuses to record a property the vocabulary rejects, and exits non-zero naming it. Regenerating is therefore not a way to make an invalid property pass.

Do not edit the table by hand. Rebuild the site, then rerun the generator; it needs `public/` and network access to schema.org. Add a new `@type` to `EMITTED_TYPES` when a template starts emitting one.

The rule this enforces: a property that reads like it belongs on a type is not evidence that it does. `codeRepository` shipped on `SoftwareApplication` for months, and schema.org scopes it to `SoftwareSourceCode`.

#### External links

`npm run site:links` runs on every PR and enforces the hand-maintained stale-URL blocklist in `scripts/external-link-policy.mjs`. It does not fetch.

Liveness is a separate, scheduled job (`.github/workflows/external-link-liveness.yml`, weekly) that probes every external URL and reports redirects and failures. It never blocks a merge on purpose: probing a few hundred third-party hosts depends on their uptime, rate limits, and bot policies, and a merge blocked by someone else's outage is a gate people route around. Run it locally with `node scripts/external-link-audit.mjs --check-liveness`.

Read its output as leads, not verdicts. A 403 can be bot protection or a local egress proxy scanning the response rather than a dead page, and a 429 means the probe was throttled. Confirm in a browser before editing a URL.

### 3. Local preview

```bash
# From repo root:
hugo server -p 1314 --bind 0.0.0.0 &
# Share the correct preview URL for the current environment.
# For gauntlet/API pages: hugo --gc && npx wrangler dev --port 8789 --ip 0.0.0.0
```

### 4. Commit and PR

```bash
git checkout -b <type>/<short-name>
git add content/<specific-files>
git commit -m "<type>: <short description>"
git push -u origin <branch>
gh pr create --title "<type>: <description>" --body "..."
```

Wait for Josh to merge. Cloudflare auto-deploys on merge to main.

## Machine-Readable Surfaces (NON-NEGOTIABLE)

These are public contracts now, not optional polish:

- `static/.well-known/security.txt`
- HTML `<link rel="alternate">` discovery in `baseof.html`
- markdown mirrors from `hugo.toml` + `*.markdown.md` templates
- visible page-format links from `partials/page-formats.html`
- the machine-access files listed above (`robots.txt`, `llms.txt`, `llms-full.txt`, `_headers`)

When touching layouts, output formats, or discovery metadata:

- Verify a representative generated mirror like `public/learn/mcp-security/index.md` still preserves raw markdown structure, links, and code fences.
- Verify a representative article page still emits both the site-wide RSS autodiscovery link and any per-page alternates like markdown.
- Keep `security.txt` fresh. `Expires` must stay in the future and less than one year out.
- If you break any of these, fix the audit rather than teaching reviewers to remember the edge case manually.

## Conversion Rules (NON-NEGOTIABLE)

The site must always make the next step obvious. Do not ship pages that teach or explain without a clear action.

### CTA ownership by page type

- **Product / solution pages** own their CTA markup directly in content. They need a strong hero CTA and a strong bottom CTA. Current examples: `content/pipelock.md`, `content/proof.md`, `content/enterprise.md`.
- **Article pages** (`learn`, `blog`, `compare`, and `_default` singles) get CTA coverage from `themes/pipelab/layouts/partials/article-cta.html`.
  - Top CTA: compact, near the header
  - Bottom CTA: fuller close with optional extra link
- **Section index pages** (`/learn/`, `/blog/`, `/compare/`) get their bottom CTA from `themes/pipelab/layouts/partials/section-cta.html` and may add hero buttons in the section `_index.md` content when the page needs stronger above-the-fold action.
- **Exempt pages** should not inherit generic CTA blocks: legal pages, `contact`, `pricing`, `assess`, `proof`, `enterprise`, and `pipelock`. Those pages either have bespoke conversion UI already or should stay clean.
- Pages with bespoke CTA handling must set `disable_cta: true` in frontmatter. Do not rely on template slug checks to keep generic CTAs off those pages.

### Do not hand-roll CTA logic in random templates

- If the CTA pattern for articles changes, update `partials/article-cta.html`.
- If the CTA pattern for section indexes changes, update `partials/section-cta.html`.
- If the CTA pattern for product pages changes, update the owning content file.
- Do not scatter one-off CTA blocks across templates unless the page truly needs bespoke behavior.

### CTA review checklist before push

For every changed public page, verify:

1. **Top-of-page action exists where expected**
   - Product pages: hero CTA in content
   - Articles/guides/comparisons: compact CTA near the top via template
   - Section hubs: hero buttons in content when needed
2. **Bottom-of-page next step exists**
   - Teaching pages must close with a next move
3. **Buttons go somewhere real**
   - No dead hash anchors like `#install` without a matching `id`
4. **CTA matches page intent**
   - `learn` pages point to product or assess
   - `blog` pages point to product or proof
   - `compare` pages point to product or pricing
5. **Exempt pages stay intentional**
   - Pricing/contact/legal pages should not get generic sales footers by accident

### Minimum local page audit

Before proposing a PR, spot-check:

- `/pipelock/`
- `/learn/`
- `/blog/`
- `/compare/`
- one representative `learn` page
- one representative `blog` page
- one representative `compare` page
- any page with hero buttons or anchor links you changed

Ask:

1. What is the first action above the fold?
2. What is the next action at the bottom?
3. If I click the primary button, does it resolve correctly?
4. Does this page have contradictory or stale product facts?

## Content Types

**Frontmatter shapes for all four content types live in
[`docs/agent-reference/content-and-theme.md`](docs/agent-reference/content-and-theme.md). Read it before
creating a page in `content/blog/`, `content/learn/`, `content/compare/` or `content/make-it-leak/`.**
The rules that are not derivable from an existing file stay here:

- **Blog:** `date` is mandatory. For a dev.to cross-post, **always set `canonical_url` to pipelab.org.**
  Without it dev.to gets the ranking credit.
- **Learn:** also add a link in `content/learn/_index.md`, or the guide is orphaned.
- **Compare:** include FAQPage JSON-LD with 3 Q&As. Use "not documented in public docs" for competitor
  capabilities, verify DLP and pattern counts live, and keep private competitor notes and planning out of
  this repo entirely.
- **Make It Leak:** each episode publishes a real, signed Audit Packet captured deterministically through
  Pipelock's replay-capture system, the same system behind the `/playground/` gallery.

### Producing a Make It Leak episode

The packet is built in the pipelock repo; only the page lives here.

1. In pipelock, add the scenario to `internal/replaycapture` (`scenario.go` DefaultScenarios,
   `capture.go` driveScenario, `config.go` labConfig). Synthetic material only.
2. Capture with `pipelock-replay-capture generate --out <dir>`, then verify every packet:
   `pipelock-verifier audit-packet <dir>/<id> --key <signer-key>` must report `result: VALID`.
3. Copy `packet.json`, `manifest.json`, `evidence.jsonl`, `summary.md` and `verifier.txt` into
   `static/make-it-leak/<NN>/`.
4. Write the page (narrative, the signed decision, download links, the `audit-packet` verify command,
   the honest caveat), add it under `## Episodes` in `content/make-it-leak/_index.md`, and cross-link the
   sibling episodes.
5. `npm run site:audit` must pass before pushing.

**Episode pages are NOT draft.** A draft content page fails `site:audit`, which requires a built markdown
mirror and at least two inbound content links for every page and ignores the draft flag. So only add an
episode page once its packet exists, and cross-link it so the inbound-link count is met.

**Claim discipline.** Scope copy to "mediated action" and the "allow/block decision". Verification is
`pipelock-verifier audit-packet . --key <the packet's published signer key>`, the same key-in-manifest
model as the `/playground/` gallery. That proves the packet is internally consistent and signed by that
key. Do NOT imply it roots in a key the reader already independently trusts, and never imply "independent
attestation" or "proves nothing leaked".

**Never put drop procedures or internal notes in an HTML comment inside a page body.** goldmark runs with
`unsafe = true`, so comments render into public HTML. Keep such notes in this file.

## Theme, navigation, footer

Custom theme at `themes/pipelab/`, dark, accent `#00e5a0` on `#09090b`. **Template inventory, the
per-section JSON-LD mapping and the footer column structure are in
[`docs/agent-reference/content-and-theme.md`](docs/agent-reference/content-and-theme.md);** read it before
adding a template or changing the footer.

Main navigation is defined in `hugo.toml`. Run `rg -n 'name = ' hugo.toml` before citing its current
items or count. Blog and Contact are footer-only.

## Gauntlet (API-driven)

Cloudflare Worker at `src/worker.js` with Postgres backend. Config: `wrangler.jsonc`. Local dev: `npx wrangler dev --port 8789 --ip 0.0.0.0` (needs `.dev.vars` with DB creds). Detail view routing via `_redirects` rewrite, not Hugo.

## Pipelock Version References

Stale every release. Part of pipelock-pre-tag version sweep.

| File | What |
|------|------|
| `hugo.toml` | `params.pipelock_version` used by site audit release checks |
| `themes/pipelab/layouts/index.html` | Reads `site.Params.pipelock_version` (there is no `docker pull` on the homepage; verified 2026-08-11) |
| `content/pipelock.md` | GitHub Action version, Docker pull, test/DLP/coverage counts |

Also check these public facts when product stats change:

| File | What |
|------|------|
| `content/pricing.md` | Assess scenario counts and packaged feature claims |
| `content/enterprise.md` | Enterprise-facing dependency and evidence claims |
| `static/enterprise/pipelock-solution-brief.pdf` | Downloadable public brief artifact; keep it aligned with the enterprise page and current public product facts |
| `static/enterprise/pipelock-solution-brief.html` | Legacy redirect shim to the PDF; do not maintain separate copy here |
| `themes/pipelab/layouts/index.html` | Homepage proof-strip metrics and capability counts |

Anything under `static/` is copied verbatim. Hugo will not keep those files in sync with `content/` or `data/`. If a public count or version appears in `static/`, update it manually and replace the public artifact deliberately.

## Static Files

Everything under `static/` is copied verbatim, so Hugo will never keep it in sync with `content/` or
`data/`. If a public count or version appears there, update it manually and replace the public artifact
deliberately. **The file-by-file purposes are in
[`docs/agent-reference/content-and-theme.md`](docs/agent-reference/content-and-theme.md).**
