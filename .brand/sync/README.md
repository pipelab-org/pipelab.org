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

## Locked-current decisions

These values are canonical. Do not change without a brand review:

- `$accent: #00e5a0` (Pipelock teal)
- `$bg: #09090b` and `$bg-elevated: #0e0e11` (near-black ramp)
- `$purple: #7c3aed` (hero radial companion only)
- Wordmark stays two-tone (`Pipe`-slate, brand-accent on the second syllable)
- Hero stays particles plus radial

## Verification after sync

If you ever migrate the live theme from CSS custom properties to SCSS variables (or vice versa), verify:

1. `hugo server` runs clean, no SCSS compile errors
2. Hero h1 reads at 36px (down from the prior 51px)
3. Card titles at 20px
4. Body copy at 16px
5. Stat labels at 12px
6. The `.hero-tagline` pattern renders below h1 in uppercase letterspaced slate
7. Stats strip shows 5 columns (Layers, DLP, Attacks, Deps, Binary)
