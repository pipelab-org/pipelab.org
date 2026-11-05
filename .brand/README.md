# PipeLab Brand

Brand and design guidance for PipeLab and Pipelock. The live site's tokens are maintained in `themes/pipelab/assets/scss/_variables.scss`; shared visual rules are in `_brand-standards.scss`. Files in `.brand/sync/` are reference material, not build inputs.

## What is here

- `SKILL.md` brand voice, anti-vocabulary, terminology, personality pillars, and visual rules. Load this when writing copy or designing surfaces.
- `sync/_variables.scss` SCSS reference of the design tokens.
- `sync/README.md` explains the reference token map and how to compare it with the theme.

## How this relates to the theme

- The live theme tokens are CSS custom properties in `themes/pipelab/assets/scss/_variables.scss`.
- Hardcoded font-sizes have been migrated to `var(--fs-*)` tokens. Future type-scale changes happen in one place.

## Brand identity

- **Accent:** `#00e5a0` Pipelock teal.
- **Background:** `#09090b` near-black ramp.
- **Hero:** The homepage uses the interactive receipt constellation. Standard and rich branded heroes use the shared static constellation field; editorial and utility pages use the plain dark background.
- **Wordmark:** mixed case, two-tone (`Pipe`-slate, brand-accent on the second syllable).

## Voice signature (always)

- No em dashes, no emoji, no exclamation marks.
- Lead with what the product does, not what it is.
- Use concrete, sourced measurements. Read current product counts from `data/stats.yaml` instead of copying counts into examples.
- Imperative mood preferred ("Install. Configure. Protect.").

## Default product sentence

> Pipelock sits between AI agents and the internet and blocks secret leaks, unsafe tool traffic, and prompt-injection responses.

## When to update this folder

- A brand guideline changes.
- A pull request proposes a change to the shared tokens, components, or brand rules.
- An anti-vocabulary item is added or removed.

Explain brand changes in the pull request and compare them with the live theme tokens and shared rules before merging.

## Cross-references

- Theme variables: `themes/pipelab/assets/scss/_variables.scss`
- Product metrics and their recorded provenance: `data/stats.yaml`.
- Contributor guidance: `AGENTS.md`.
