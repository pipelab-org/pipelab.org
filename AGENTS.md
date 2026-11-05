# Contributing to pipelab.org

PipeLab's website is built with Hugo and served by the Cloudflare Worker in `src/worker.js`. `wrangler.jsonc` points the Worker at the generated `public/` directory. Updates to `main` are deployed through Cloudflare's configured repository integration.

## Setup and checks

Use Node.js 22, Python 3, GNU Make, and the extended Hugo version declared in `.hugo-version`. Put the pinned Hugo on `PATH`. `HUGO_VERSION.md` explains how the Cloudflare build setting relates to that pin.

From the repository root:

```sh
npm ci
bash scripts/install-pipelock-verifier.sh
make preflight
npm run site:links -- --fail-on-blocked
```

The verifier installer downloads the pinned Linux amd64 binary, checks its SHA-256 and reported version, and installs it as `.pipelock-verifier`. Other platforms need a matching executable at that path; this repository's installer does not install one for them. The installer uses standard shell utilities including `curl`, `tar`, `sha256sum`, and `install`.

Run `make preflight` as a bare command from the repository root. It checks Hugo and the verifier before running brand checks, rule-sync checks, Node tests, the Hugo build, corpus and version checks, the site audit, and render comparison. It does not install prerequisites. Individual commands and targets are in `package.json` and `Makefile`.

CI separately compares the pinned extended Hugo with the latest extended release. Locally, `site:render-diff` reports that there is nothing to compare when the Hugo on `PATH` is already the pinned version. To compare two versions, configure `HUGO_PINNED` and `HUGO_LOCAL`; a successful skip is not a two-build comparison.

## Preview and pull requests

Preview static pages with:

```sh
hugo server -p 1314
```

Open `http://localhost:1314/`. Hugo alone does not serve the Worker's API routes. Check each changed page and include screenshots or a preview link for visual changes. Submit a pull request from a feature branch or fork and list the checks you ran and their results. Maintainers review and merge pull requests.

Published blog bodies are preserved as historical articles. Propose factual corrections, broken-command repairs, and dead-link fixes as minimal pull requests and explain the reason. Keep stylistic rewrites and reframing out of correction pull requests. Frontmatter can be updated for search metadata if it still describes the article accurately.

Set `author:` to the writer's own full name. Preserve existing published bylines. Keep credentials, personal tool settings, private infrastructure details, and internal operating notes out of the repository. HTML comments in content can reach generated pages; they are not private storage.

## Source files and reference guides

- `content/` contains the pages. Frontmatter examples, theme responsibilities, hero contracts, and static-file purposes are in [content-and-theme.md](docs/agent-reference/content-and-theme.md).
- `themes/pipelab/` contains the theme. Main navigation is in `hugo.toml`; footer groups are in `themes/pipelab/layouts/partials/footer.html`.
- [.brand/SKILL.md](.brand/SKILL.md) owns brand terminology, copy style, product wording, the proof line, and design conventions.
- Theme tokens are in `themes/pipelab/assets/scss/_variables.scss`; shared visual rules are in `_brand-standards.scss`. `.brand/` token references are not replacements for these files.
- [evidence-versions.md](docs/agent-reference/evidence-versions.md) explains current product versions and historical evidence.
- [install-audit.md](docs/agent-reference/install-audit.md) explains the installation scanner's coverage and known grouping limits.

## Brand, product claims, and layouts

Use **PipeLab** for the site and parent brand and **Pipelock** for the product. Keep product and benchmark claims within their documented scope. Gauntlet results are first-party Pipelock evidence, not evidence of broad market adoption or participation by other vendors. Verify comparative claims against cited public sources; an undocumented capability is not proof that it is absent.

When changing a core positioning page, read `/`, `/pipelock/`, `/proof/`, `/pricing/`, `/enterprise/`, and `/about/` together to keep terminology and proof language consistent. Update `static/llms.txt` and `static/llms-full.txt` in the same pull request when their summaries change. The same applies to summary changes on `/learn/`, `/compare/`, and `/agent-firewall/`.

Use shared template primitives before adding page-specific classes. Every H1 template declares one of the hero contracts documented in the content reference. Standard branded heroes use `site-hero`, `brand-field-hero`, and `brand-field-hero-standard`. A hero contains identity, a title or lockup, one lead, actions, and optional facts. Put diagrams, demos, evidence tables, and explainers in adjacent sections.

Start with the narrow layout and use the breakpoint tokens. Prefer content-driven sizing and wrapping over fixed content heights. Horizontal scrolling is reserved for tables, diagrams, and code that cannot reflow. Buttons should wrap or become full-width when their labels would otherwise be squeezed. Keep content inside the shared rail; viewport-width bleeds can create overflow.

Inspect changed templates at 390x844, 768x1024, 1366x768, and 1440x900. Check overflow, clipping, overlapping controls, tap targets, readable line lengths, and excess empty space. Extend a source-level audit when a shared layout rule can be checked mechanically. Screenshots support visual review alongside those checks.

## Search metadata and links

Choose one primary search intent per page. Inspect related pages for overlap before changing a title or description and explain substantial overlap in the pull request.

The browser title uses `seoTitle`, otherwise `linkTitle`, which falls back to `title`. Pages other than the homepage append ` | PipeLab`. The same computed title supplies `og:title`; `title` supplies the page H1 and article headline. `linkTitle` also labels navigation and breadcrumbs. The audit rejects indexable titles over 60 characters; keeping `seoTitle` or `linkTitle` under 50 leaves room for the suffix.

Indexable pages need unique descriptions of 120-155 characters. Use the page's primary search term where it fits naturally. Templates supply the H1; content starts at H2. The audit checks for exactly one H1; also inspect heading levels for skips. Footer, card, and widget labels use spans where they are not section headings.

Markdown external links receive `target="_blank" rel="noopener noreferrer"` through `layouts/_default/_markup/render-link.html`. Add the same attributes to raw HTML external links.

Set `robots: "noindex, follow"` in frontmatter when a page should not be indexed. The template checks that value before its taxonomy fallback.

Link new pages from their section index and related content. Learn and Compare articles need links from at least two other content pages; the audit checks this. Main navigation and footer menus are curated, so add entries only where appropriate. Blog and Contact are footer-only in the current main navigation.

Maintain redirects in `static/_redirects` using its existing format and preserve published routes. Use that file rather than Hugo `aliases:`.

`npm run site:links -- --fail-on-blocked` checks the stale-URL policy without fetching destinations. Without the flag it only reports. External-link liveness is a separate weekly workflow. Its redirects and failures are leads to inspect; rate limits and bot protection do not establish that a page is dead. The optional local liveness command is `node scripts/external-link-audit.mjs --check-liveness`.

### Structured data

`themes/pipelab/layouts/_default/baseof.html` owns JSON-LD. FAQ entries must also be visible on the page; do not promise search rich results. The type-to-route mapping is described in the content reference.

`data/schema-org-properties.json` records the properties emitted by this site and their validation against the schema.org vocabulary. The audit rejects emitted properties missing from that table. Rebuild the site and run `node scripts/generate-schema-property-table.mjs` to regenerate it; the generator needs `public/` and network access to schema.org. Add a type to `EMITTED_TYPES` when templates start emitting it. The generator rejects invalid properties, so regenerating the table does not excuse invalid structured data.

## Machine access and outputs

The committed crawl policy allows access without vendor-specific training exclusions. Changes to machine access belong in a dedicated pull request explaining the tradeoff. Keep `static/robots.txt`, `static/llms.txt`, `static/llms-full.txt`, and `static/_headers` aligned with the declared policy. Any additional Markdown conversion service must preserve that policy, canonical URLs, and machine-readable content.

Layouts and output-format changes must preserve:

- `static/.well-known/security.txt`, with an expiry in the future and less than one year away.
- RSS autodiscovery and per-page alternate-format links.
- Markdown mirrors declared in `hugo.toml` and rendered by the Markdown templates.
- Visible format links from `partials/page-formats.html`.

Inspect a generated article and a representative mirror, such as `public/learn/mcp-security/index.md`, for retained text, links, code fences, and shortcode output. Extend the audit when a newly discovered regression can be checked mechanically.

## Calls to action

Product and solution pages own their hero and bottom actions in content. Articles use `partials/article-cta.html`; section indexes use `partials/section-cta.html` and can add hero actions in their content. Pages with bespoke actions set `disable_cta: true`, including the existing legal, contact, pricing, assess, proof, enterprise, and product cases where applicable.

Change the shared partial for a shared pattern. Keep bespoke behavior in the owning page. Check that primary buttons reach real routes or existing anchors, that the next action matches the page's purpose, and that pages with bespoke handling do not inherit generic sales footers.

For content or template changes, inspect `/pipelock/`, `/learn/`, `/blog/`, `/compare/`, representative articles in those sections, and any changed hero or anchor action. Check the first action, the closing action, link destinations, and consistency of product facts.

## Content and signed examples

Read the frontmatter examples before adding Blog, Learn, Compare, or Make It Leak pages. Blog posts require `date`. For dev.to cross-posts, use a gitignored sibling `<slug>.devto.md`, convert internal links to absolute URLs, and set `canonical_url` to the original article's complete URL. Add Learn guides to `content/learn/_index.md`. Compare articles use sourced capability descriptions and useful visible FAQ answers.

Make It Leak episodes publish real signed Audit Packets from Pipelock's replay-capture system. Scenario capture is implemented in the public Pipelock repository under `internal/replaycapture`; only the site pages and served packet files belong here. Use synthetic material.

Capture with `pipelock-replay-capture generate --out <output-directory>`. Verify each packet with `pipelock-verifier audit-packet <packet-directory> --key <published-signer-key>` and require successful verification with `CHAIN VALID`. Copy `packet.json`, `manifest.json`, `evidence.jsonl`, `summary.md`, and `verifier.txt` into `static/make-it-leak/<episode>/`. Write the narrative, signed decision, downloads, verification command, and limitations; add the episode to the index and link relevant siblings. Publish only when the verified packet is present.

Scope evidence claims to the mediated action and signed allow/block decision. A packet can establish internal consistency and a signature under its published key. That alone does not establish an independently trusted signer, complete mediation, or that nothing leaked. Preserve signed bytes; do not hand-edit evidence to make a check pass.

## Gauntlet (API-driven)

`src/worker.js` implements the Postgres-backed results API. `wrangler.jsonc` configures the Worker and static assets. API development needs the appropriate local database configuration in a gitignored `.dev.vars` file; never commit credentials.

Build the static assets before starting the Worker locally:

```sh
hugo --gc
npx wrangler dev --port 8789
```

Use a test database for development. Detail-view routing uses the existing redirect rewrite rather than a separate Hugo detail page. `scripts/dev-preview.mjs` can instead answer results routes from a supplied snapshot; its comments describe the snapshot file layout.

## Product versions and static assets

When `params.pipelock_version` changes in `hugo.toml`, follow the evidence-version guide and run `make preflight`. Current capability data, verifier pins, and product summaries must match the declared release. Historical signed artifacts and reviewed Gauntlet measurements keep their own recorded versions under the explicit classification and promotion contracts.

Check version and metric claims in `content/pipelock.md`, pricing and enterprise pages, the homepage, machine-readable summaries, and downloadable artifacts such as `static/enterprise/pipelock-solution-brief.pdf`. The related HTML file is a redirect shim, not a second copy of the brief.

Everything under `static/` is copied verbatim. Hugo does not synchronize those files with `content/` or `data/`. Update affected unsigned artifacts deliberately, and preserve signed or digest-bound evidence through its documented publication process.
