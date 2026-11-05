# Brand Token Sync

Reference SCSS form of the brand tokens. The live Hugo theme uses CSS custom properties at `themes/pipelab/assets/scss/_variables.scss`. This folder mirrors the same tokens in SCSS form for tools or migrations that prefer SCSS variables.

## Token map

| Token | Value | Usage |
|---|---|---|
| `$fs-h1` | `2.25rem` (36px) | page or section h1 |
| `$fs-h2` | `1.625rem` (26px) | section h2 |
| `$fs-h3` | `1.25rem` (20px) | card title |
| `$fs-lead` | `1.0625rem` (17px) | lead body, hero subhead |
| `$fs-body` | `1rem` (16px) | body copy |
| `$fs-tagline` | `0.875rem` (14px) | AGENT SECURITY tagline |
| `$fs-code` | `0.875rem` (14px) | code, eyebrow body |
| `$fs-caption` | `0.75rem` (12px) | captions, meta |
| `$fs-stat` | `1.75rem` (28px) | stat numerics |
| `$fs-display` | `3.25rem` (52px) | wordmark, featured display |

## Shared brand tokens

Compare proposed token changes with the live theme and explain their effect in the pull request.

- `$accent: #00e5a0` (Pipelock teal)
- `$bg: #09090b` and `$bg-elevated: #0e0e11` (near-black ramp)
- `$purple: #7c3aed` (hero radial companion only)
- Wordmark stays two-tone (`Pipe`-slate, brand-accent on the second syllable)
- The homepage uses the interactive receipt constellation. Standard and rich branded heroes use the shared static constellation field; editorial and utility pages use the plain dark background.

## Checking reference updates

Compare values with `themes/pipelab/assets/scss/_variables.scss` and shared behavior with `_brand-standards.scss`. Reference SCSS isn't a drop-in replacement for the theme's CSS custom properties. Run `make preflight` for site changes and inspect affected pages at the viewport sizes listed in `AGENTS.md`. Check the actual rendered heading, card, body, and label styles; a base token doesn't guarantee that every component uses that size.
