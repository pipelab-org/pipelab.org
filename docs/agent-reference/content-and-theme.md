# Content frontmatter templates, theme layout, static files

Read on demand. `AGENTS.md` points here from the sections that need it and keeps every rule and gotcha
inline; this file holds only the shapes and inventories, which are the parts you would otherwise copy
from an existing file or discover with `ls`.

## Contents

- Blog post frontmatter
- Learn guide frontmatter
- Compare article frontmatter
- Make It Leak episode frontmatter
- Theme templates and JSON-LD mapping
- Footer structure
- Static files and their purposes

## Blog post frontmatter (`content/blog/`)

```yaml
---
title: "Full SEO Title With Keywords"
linkTitle: "Short Tab Title"          # under 50 chars
date: 2026-03-11
author: "Writer Full Name"
summary: "One-liner for list cards."
description: "SEO meta description, 120-155 chars with keywords."
tags: ["ai-security", "pipelock"]
---
```

`date` is mandatory. Set `author:` to the writer's own full name. For a dev.to cross-post, create
`<slug>.devto.md` beside the article. These files are gitignored. Convert internal links to absolute URLs
and set the cross-post's `canonical_url` to the original article's complete URL, including its path.

## Learn guide frontmatter (`content/learn/`)

```yaml
---
title: "Guide Title"
linkTitle: "Short Tab Title"
subtitle: "Tagline under h1."
description: "SEO description, 120-155 chars."
date: 2026-03-11
---
```

Also add a link in `content/learn/_index.md`.

Title marks: a guide the homepage orbit links to shows that integration's logo beside the title automatically. Any other guide can opt in with `title_brand: "<name>"`, naming an orbit or tile-row entry in `data/integrations.yaml`, a brand mark one of those entries uses (`"cloudflare"` for a Cloudflare product with no entry of its own), or `"Pipelock"` for the product mark; an unknown name fails the build. A `project_mark` image sits above the title unless the page also sets `title_mark_inline: true`.

## Compare article frontmatter (`content/compare/`)

```yaml
---
title: "Pipelock vs X"
subtitle: "One-line positioning."
description: "SEO description, 120-155 chars."
reviewed: "April 2026"
---
```

## Make It Leak episode frontmatter (`content/make-it-leak/`)

One page per episode, numbered to match the social post (`002.md` -> `/make-it-leak/002`), with the
packet files at `static/make-it-leak/<NN>/`.

```yaml
---
title: "Make It Leak #002: Poisoned Ticket, Webhook Exfiltration"
linkTitle: "Make It Leak #002"        # under 50 chars
subtitle: "One line on what was attempted."
description: "SEO description, 120-155 chars."
date: 2026-07-04
disable_cta: true
episode: "002"
---
```

## Theme templates and JSON-LD

Custom theme at `themes/pipelab/`. Dark theme, accent `#00e5a0` on `#09090b`.

Current templates: `ls themes/pipelab/layouts/`. The ones with distinct responsibilities are
`baseof.html` (master SEO, OG and JSON-LD), `index.html` (homepage), `single.html` (standard pages),
`blog/single.html`, `compare/single.html`, `list.html` (section indexes), `gauntlet/results.html`
(API-driven scoreboard) and `gauntlet/submit.html`.

`themes/pipelab/layouts/_default/baseof.html` emits Organization and WebSite on the homepage,
BlogPosting on blog articles, TechArticle on supported article and product routes, and BreadcrumbList
on pages other than the homepage. FAQPage is emitted when frontmatter contains `faq:`. Write two or
three useful questions whose answers also appear on the page; don't promise search rich results.
OG images are auto-selected by section and overridden with `og_image:` in frontmatter.

### Hero and responsive contracts

Every H1 template puts one `data-hero` value on the element that forms the real hero boundary:

| Contract | Use |
|---|---|
| `home` | Homepage receipt constellation. This is the only animated hero. |
| `brand-standard` | Product, project, proof, pricing, and campaign landings. |
| `brand-rich` | Content-heavy product surfaces. The hero contains identity, one lead, actions, and optional facts; demos, diagrams, and evidence belong in the following sections. |
| `editorial-index` | Blog, learn, and compare indexes. |
| `editorial-article` | Articles, guides, comparisons, and episodes. |
| `utility` | Receipts, forms, contact, errors, and detail pages. |

All branded heroes use `site-hero` and `brand-field-hero`. Standard branded heroes also use `brand-field-hero-standard`. Put architecture, evidence grids, and product explainers after the hero so they can't distort its responsive boundary.

Blog, Learn, and Compare use the shared `editorial-index-*` classes for inner width, eyebrow, title, and lead geometry. Page-specific styles own their filters and content grids, not the hero alignment.

On long product pages, choose a presentation that matches the information instead of repeating cards. Use cards for a small set of peers, ledgers for controls, numbered rows for real sequences, terminals for commands, and compact lists for reference material. Chapters stay inside the responsive content rail. Never use `width: 100vw` or a negative viewport-margin bleed inside that rail; both create overflow or off-screen content on real browsers.

Build narrow-first with the breakpoint tokens in `_variables.scss`. Visual changes need checks at 390x844, 768x1024, 1366x768, and 1440x900. The checklist lives in `AGENTS.md`; the CSS contract and shared field live in `_brand-standards.scss`.

## Footer structure

`themes/pipelab/layouts/partials/footer.html` owns the footer columns and links. Each link group is a
labeled `<nav>`, headings use `<span>`, and external links use `target="_blank" rel="noopener noreferrer"`.

## Static files

Everything under `static/` is copied verbatim, so Hugo will never keep it in sync with `content/` or
`data/`.

| File | Purpose |
|------|---------|
| `static/_headers` | Cloudflare security headers |
| `static/_redirects` | URL redirects, append-only |
| `static/robots.txt` | Crawl policy, content signals, sitemap reference |
| `themes/pipelab/layouts/index.llms.txt` | Plain-text home output at `/llms.txt` |
| `themes/pipelab/layouts/index.llmsfull.txt` | Plain-text home output at `/llms-full.txt` |
| `static/images/og/` | Section-level OG images |

## Shared count rendering

Body counts use the `stat` shortcode and `data/stats.yaml`. The `community_rules` key reads the number of rules in the served `static/rules/pipelock-community/bundle.yaml`, including experimental rules; it is not the number of active rules in a running binary. Bundle bytes and signatures stay under the verified rule-sync workflow.

Descriptions and FAQ text can use `{{stat:dlp_patterns}}` or `{{stat:community_rules}}`. The shared `fact-text.html` partial resolves these tokens in metadata, visible FAQs, structured data, cards, RSS and Markdown mirrors. Unknown keys and malformed tokens fail the build. These tokens only insert shared facts; they do not execute arbitrary templates.

The two machine-context templates retain approved editorial prose. Their shared release opening and guide list use `data/machine_context.yaml`; a new minor release requires review of that copy. Matching page titles use page metadata. Dated technical citations and the existing Docker `:latest` example retain their published meaning.

## Hub rendering and explicit Markdown mirrors

Cloudflare serves generated static pages directly. The API Worker doesn't negotiate Markdown or convert HTML. Request the explicit `index.md` alternate linked in a page's head; changing the Accept header doesn't select a mirror.

The hub adapter adds pages only when `params.hub.open` is boolean `true`. Omitted or `false` keeps hub-owned pages, mirrors, JSON, community downloads, and the listing schema out of the build. Other values fail the build. Existing official `static/rules/` distribution remains available. Machine guides and the footer use the same switch. Build into a clean destination when changing modes.

`scripts/hub/schema/listing-v1.json` and `scripts/hub/validate.mjs` define the structural, text, and URL contract. The copy in `assets/hub/schema/` must match it byte for byte. This is metadata validation, not signature verification, compatibility assessment, or admission. The later admission pipeline supplies trusted normalized records at `data/hub/generated/listings.json`: an array of `{listing, evidence_present}` objects, with `listing` holding normalized validated metadata. Only confirmed local evidence may set `evidence_present`.

Hub values stay under `Params.hub`; descriptions use fixed text, listing type, and ID. Hub templates escape plain text directly, serialize JSON with `jsonify`, and escape Markdown through dedicated partials. They never run contributor text through Goldmark or the shared fact-token processor. The transitive template lint runs in the site audit. Browser search, verification badges, config assessment, and publication checks belong to their respective pipelines.
