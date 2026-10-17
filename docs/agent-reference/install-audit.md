# Installation source audit

The installation check in `scripts/install-contract.mjs` reports drift from the shared release-pinned installation data. `scripts/site-audit.mjs` runs it over article sources, frontmatter, templates and the raw machine-readable site summaries. It also checks the explicit correction on the frozen historical articles.

The source scanner groups top-level paragraphs, fenced and indented code, headings and HTML blocks. Its line endings, indentation and block rules follow CommonMark 0.31.2, with measured Goldmark behavior for rendered article examples. The outer raw-text pass retains the specification rules because those files have no Markdown renderer.

This is a source heuristic, not a complete Markdown or shell parser. Nested lists and blockquotes have known grouping gaps, including lazy continuations, comments or indented code inside list items, and unterminated fences inside containers. A passing audit does not establish that every installation example in those layouts was checked. The shared installation shortcode and `/install/` remain the maintained installation sources.

Link reference definitions before underline-shaped lines can cause false rejections. Raw `<h2>` tags inside HTML blocks can also change how the scanner groups examples.

The renderer-specific cases were measured with Goldmark 1.7.11 in Hugo 0.147.7. That correspondence is not automatically checked when the Hugo pin changes. A rendered-output audit or a full container parser would extend coverage beyond this scanner.
