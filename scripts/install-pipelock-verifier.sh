#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=pipelock-verifier-pin.env
source "$repo_root/scripts/pipelock-verifier-pin.env"

if [ "$#" -ne 0 ]; then
  echo "usage: $0" >&2
  exit 64
fi

archive="pipelock-verifier_${PIPELAB_VERIFIER_VERSION}_linux_amd64.tar.gz"
release_url="https://github.com/pipelab-org/pipelock/releases/download/v${PIPELAB_VERIFIER_VERSION}/${archive}"
download_dir="$(mktemp -d "${TMPDIR:-/tmp}/pipelock-verifier-download.XXXXXX")"
trap 'rm -r -- "$download_dir"; if [ -n "${replacement:-}" ]; then rm -f -- "$replacement"; fi' EXIT

stage_dir="$download_dir/stage"
mkdir -m 0700 "$stage_dir"
curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
  --output "$download_dir/$archive" "$release_url"
printf '%s  %s\n' "$PIPELAB_VERIFIER_LINUX_AMD64_SHA256" "$download_dir/$archive" | sha256sum -c -
tar xzf "$download_dir/$archive" -C "$stage_dir" pipelock-verifier
stage_bin="$stage_dir/pipelock-verifier"
if [ ! -f "$stage_bin" ] || [ -L "$stage_bin" ]; then
  echo "verifier archive did not contain one regular executable" >&2
  exit 1
fi
chmod 0755 "$stage_bin"

version_output="$($stage_bin --version)"
printf '%s\n' "$version_output"
case "$version_output" in
  "pipelock-verifier ${PIPELAB_VERIFIER_VERSION} "*) ;;
  *)
    echo "installed verifier does not report pinned version ${PIPELAB_VERIFIER_VERSION}" >&2
    exit 1
    ;;
esac

destination="$repo_root/.pipelock-verifier"
replacement="$(mktemp "$repo_root/.pipelock-verifier.XXXXXX")"
install -m 0755 "$stage_bin" "$replacement"
mv -fT -- "$replacement" "$destination"
replacement=""
