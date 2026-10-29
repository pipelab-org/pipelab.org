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
author: "Josh Waldrep"
summary: "One-liner for list cards."
description: "SEO meta description, 120-155 chars with keywords."
tags: ["ai-security", "pipelock"]
---
```

`date` is mandatory. For a dev.to cross-post, create `<slug>.devto.md` alongside it (gitignored) and
convert internal links to absolute URLs.

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

JSON-LD is auto-generated per section: Organization plus WebSite on the home page, BlogPosting on blog,
TechArticle plus FAQPage on learn and compare, FAQPage on the pipelock page, BreadcrumbList everywhere.
FAQPage comes from frontmatter `faq:`: write 2-3 real Q&As, with no Google rich-result expectation.
OG images are auto-selected by section and overridden with `og_image:` in frontmatter.

### Hero and responsive contracts

Every H1 template puts one `data-hero` value on the element that forms the real hero boundary:

| Contract | Use |
|---|---|
| `home` | Homepage receipt constellation. This is the only animated hero. |
| `brand-standard` | Product, project, proof, pricing, and campaign landings. |
| `brand-rich` | A branded hero with a real demo or installation panel beside the copy. |
| `editorial-index` | Blog, learn, and compare indexes. |
| `editorial-article` | Articles, guides, comparisons, and episodes. |
| `utility` | Receipts, forms, contact, errors, and detail pages. |

All branded heroes use `site-hero` and `brand-field-hero`. Standard branded heroes also use `brand-field-hero-standard`. Put architecture, evidence grids, and product explainers after the hero so they can't distort its responsive boundary.

Blog, Learn, and Compare use the shared `editorial-index-*` classes for inner width, eyebrow, title, and lead geometry. Page-specific styles own their filters and content grids, not the hero alignment.

On long product pages, choose a presentation that matches the information instead of repeating cards. Use cards for a small set of peers, ledgers for controls, numbered rows for real sequences, terminals for commands, and compact lists for reference material. Chapters stay inside the responsive content rail. Never use `width: 100vw` or a negative viewport-margin bleed inside that rail; both create overflow or off-screen content on real browsers.

Build narrow-first with the breakpoint tokens in `_variables.scss`. Visual changes need checks at 390x844, 768x1024, 1366x768, and 1440x900. The checklist lives in `AGENTS.md`; the CSS contract and shared field live in `_brand-standards.scss`.

## Footer structure

Four-column sitemap: Product, Learn, Community, Company. One `<nav aria-label="X">` per column, column
headings are `<span>`, and external links carry `target="_blank" rel="noopener"`.

## Static files

Everything under `static/` is copied verbatim, so Hugo will never keep it in sync with `content/` or
`data/`.

| File | Purpose |
|------|---------|
| `static/_headers` | Cloudflare security headers |
| `static/_redirects` | URL redirects, append-only |
| `static/robots.txt` | Crawl policy, content signals, sitemap reference |
| `static/llms.txt` | Short machine-readable site summary |
| `static/llms-full.txt` | Full machine-readable site summary for agents |
| `static/images/og/` | Section-level OG images |
