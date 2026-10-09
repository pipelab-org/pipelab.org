# PipeLab Brand

Single source of truth for PipeLab and Pipelock brand. The live Hugo theme derives from these tokens.

## What is here

- `SKILL.md` brand voice, anti-vocabulary, terminology, personality pillars, and visual rules. Load this when writing copy or designing surfaces.
- `sync/_variables.scss` SCSS reference of the design tokens.
- `sync/README.md` token map and locked-current decisions.

## How this relates to the theme

- The live theme tokens are CSS custom properties in `themes/pipelab/assets/scss/_variables.scss`.
- Hardcoded font-sizes have been migrated to `var(--fs-*)` tokens. Future type-scale changes happen in one place.

## Brand identity (locked-current)

- **Accent:** `#00e5a0` Pipelock teal.
- **Background:** `#09090b` near-black ramp.
- **Hero:** purple radial plus particle network.
- **Wordmark:** mixed case, two-tone (`Pipe`-slate, brand-accent on the second syllable).

## Voice signature (always)

- No em dashes, no emoji, no exclamation marks.
- Lead with what the product does, not what it is.
- Use concrete numbers ("48 DLP patterns" beats "comprehensive detection").
- Imperative mood preferred ("Install. Configure. Protect.").

## Default product sentence

> Pipelock sits between AI agents and the internet and blocks secret leaks, unsafe tool traffic, and prompt-injection responses.

## When to update this folder

- A brand guideline changes.
- The upstream brand handoff adds a token, component, or rule.
- An anti-vocabulary item is added or removed.

Run any update through a brand review. Cross-check `themes/pipelab/assets/scss/_variables.scss` before merging so the theme stays in sync.

## Cross-references

- Theme variables: `themes/pipelab/assets/scss/_variables.scss`
- Stats data: `data/stats.yaml` (binary size, dep count, test count, etc.)
- Repo guidance: `CLAUDE.md` and `CLAUDE.local.md`
