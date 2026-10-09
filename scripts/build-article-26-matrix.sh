#!/usr/bin/env bash
# Regenerates static/enterprise/eu-ai-act-article-26-matrix.pdf from the
# HTML source in this directory. Run after editing
# scripts/article-26-matrix-source.html.
#
# Requires WeasyPrint (https://weasyprint.org/) on PATH.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/scripts/article-26-matrix-source.html"
OUT="$REPO_ROOT/static/enterprise/eu-ai-act-article-26-matrix.pdf"

if ! command -v weasyprint >/dev/null 2>&1; then
  echo "weasyprint not found on PATH. Install: pip install --user weasyprint" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
weasyprint "$SRC" "$OUT"

echo "Wrote $OUT"
ls -la "$OUT"
