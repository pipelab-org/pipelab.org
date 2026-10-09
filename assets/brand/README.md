# PipeLab identity

PipeLab is the parent brand. Pipelock, Pipelock Rules, and Agent Egress Bench keep their own marks and names.

The PipeLab mark is a laboratory flask drawn as one continuous system. The two dots suggest observations or stars inside the same controlled boundary. It must not be replaced with Pipelock's padlock, a chart line, or a generic atom symbol.

## Files

- `brand-contract.json` is the machine-readable source for shared colors, attribution, and license wording.
- `scripts/render_pipelab_brand.py` renders every file under `static/images/brand/`, the site favicon set, and the default social card.
- PNG and ICO outputs carry `.source` files binding the source SVG digest to the rendered bytes.

Run `make brand` after changing the generator or contract. `make check-brand` fails when committed outputs are stale or, with Inkscape installed, when a mark is off center. Raster bytes vary between Inkscape builds, so re-rendering and comparing the PNGs runs only with `python3 scripts/render_pipelab_brand.py --check --require-renderer`.

## Usage

Use the horizontal lockup when width allows. Use the stacked lockup for square placements and the mark alone below 120 pixels wide. Keep clear space around the mark equal to one quarter of its width. Do not render the full mark below 16 pixels.

Use `pipelab-lockup-dark-panel.png` for a 300 by 150 partner slot when the host page background is outside our control. Its opaque `#09090b` field keeps the existing mint mark, wordmark, and tagline readable on light or dark pages. The SVG of the same name is the source; keep the panel intact when placing it.

The teal mark is the default on dark surfaces. The light and dark monochrome marks are for one-color production only. Purple is a background glow, not a wordmark or button color.

Use `PipeLab` in text. The accent belongs on `Lab`, the part that distinguishes the parent brand from the Pipelock product family.

## Shared site motifs

The constellation field is PipeLab's ambient background motif. Use the generated `pipelab-constellation.svg` for full backgrounds and `pipelab-particle-field.svg` for transparent overlays. Both come from the same seeded particle generator as the social card. Don't invent page-specific rings, target marks, star fields, or network patterns.

Executable command blocks must use the site's shared copy control. Fenced `bash`, `sh`, and `shell` blocks copy their full contents automatically. Template-owned transcripts use `data-command-lines` with an explicit `data-command-text` value, so rendered output can never become copied input. Template-owned commands use `data-cmd-copy` or `data-command`. Inline code remains plain text unless it represents a complete command that a reader should run.
