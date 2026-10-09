#!/bin/bash
# Re-sync .brand/ files from an exported brand handoff bundle.
#
# Usage:
#   PIPELAB_BRAND_HANDOFF_URL=<url> .brand/sync-from-design.sh [--diff-only]
#
# Handoff URLs are short-lived. Keep them in the environment and never commit
# them to the repo.

set -euo pipefail

case "${1:-}" in
  ""|--diff-only) ;;
  *)
    echo "ERROR: unknown argument: $1" >&2
    echo "Usage: PIPELAB_BRAND_HANDOFF_URL=<url> $0 [--diff-only]" >&2
    exit 2
    ;;
esac

HANDOFF_URL="${PIPELAB_BRAND_HANDOFF_URL:-}"
if [ -z "$HANDOFF_URL" ]; then
  echo "ERROR: PIPELAB_BRAND_HANDOFF_URL not set." >&2
  echo "Export a fresh handoff URL, then re-run with:" >&2
  echo "  PIPELAB_BRAND_HANDOFF_URL=<url> $0" >&2
  exit 2
fi

BRAND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BRAND_DIR/.." && pwd)"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "==> Fetching handoff bundle"
ARCHIVE="$TMPDIR/bundle.tar.gz"
curl -fsSL "$HANDOFF_URL" -o "$ARCHIVE"
echo "    $(wc -c < "$ARCHIVE") bytes"

echo "==> Validating archive paths"
tar tzf "$ARCHIVE" > "$TMPDIR/archive-paths.txt"
while IFS= read -r path; do
  case "$path" in
    /*|../*|*/../*|*/..)
      echo "ERROR: unsafe archive path: $path" >&2
      exit 1
      ;;
  esac
done < "$TMPDIR/archive-paths.txt"

echo "==> Extracting"
tar xzf "$ARCHIVE" -C "$TMPDIR"
SRC="$TMPDIR/pipelab-design-system/project"
[ -d "$SRC" ] || { echo "ERROR: expected pipelab-design-system/project/ in bundle" >&2; exit 1; }

if find "$SRC" -type l | grep -q .; then
  echo "ERROR: handoff bundle must not contain symlinks" >&2
  exit 1
fi

for required in SKILL.md colors_and_type.css sync/_variables.scss sync/README.md; do
  [ -f "$SRC/$required" ] || { echo "ERROR: missing $required in bundle" >&2; exit 1; }
done

SANITIZED="$TMPDIR/sanitized"
mkdir -p "$SANITIZED/sync"
EM_DASH=$'\xe2\x80\x94'

strip_copy() {
  sed "s/ ${EM_DASH} / - /g; s/${EM_DASH}/-/g" "$1" > "$2"
}

strip_copy "$SRC/SKILL.md" "$SANITIZED/SKILL.md"
strip_copy "$SRC/colors_and_type.css" "$SANITIZED/colors_and_type.css"
strip_copy "$SRC/sync/_variables.scss" "$SANITIZED/sync/_variables.scss"
strip_copy "$SRC/sync/README.md" "$SANITIZED/sync/README.md"

if [ "${1:-}" = "--diff-only" ]; then
  echo "==> Diff vs current .brand/ after voice-rule normalization"
  diff -u "$BRAND_DIR/SKILL.md" "$SANITIZED/SKILL.md" || true
  diff -u "$BRAND_DIR/colors_and_type.css" "$SANITIZED/colors_and_type.css" || true
  diff -u "$BRAND_DIR/sync/_variables.scss" "$SANITIZED/sync/_variables.scss" || true
  diff -u "$BRAND_DIR/sync/README.md" "$SANITIZED/sync/README.md" || true
  exit 0
fi

echo "==> Em-dash check on bundle"
if grep -lF "$EM_DASH" "$SRC/SKILL.md" "$SRC/colors_and_type.css" "$SRC/sync/README.md" "$SRC/sync/_variables.scss" 2>/dev/null; then
  cat >&2 <<WARN

WARNING: Bundle contains em-dashes. Replacing them with hyphens during sync.
Long-term fix: clean the exported source so sync output is already compliant.

WARN
fi

echo "==> Updating .brand/"
cp "$SANITIZED/SKILL.md" "$BRAND_DIR/SKILL.md"
cp "$SANITIZED/colors_and_type.css" "$BRAND_DIR/colors_and_type.css"
cp "$SANITIZED/sync/_variables.scss" "$BRAND_DIR/sync/_variables.scss"
cp "$SANITIZED/sync/README.md" "$BRAND_DIR/sync/README.md"

echo "==> Done. Diff vs git HEAD:"
cd "$REPO_ROOT"
git diff --stat .brand/ || true

cat <<EOF

Next steps:
  1. Review diff above
  2. If SCSS variables changed, also overwrite themes/pipelab/assets/scss/_variables.scss
     and follow the checklist in .brand/sync/README.md
  3. Commit changes to .brand/ on a feature branch
EOF
