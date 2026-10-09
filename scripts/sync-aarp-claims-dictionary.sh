#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_json="${1:-${PIPELOCK_REPO:-../pipelock}/sdk/claims/aarp-v0.1-claims.json}"
target_json="${repo_root}/data/aarp_claims_dictionary.json"

if [[ ! -f "${source_json}" ]]; then
  echo "claims dictionary not found: ${source_json}" >&2
  exit 1
fi

mkdir -p "$(dirname "${target_json}")"
cp "${source_json}" "${target_json}"
