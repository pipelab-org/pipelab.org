#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

source_root="$temp_dir/source"
destination_root="$temp_dir/site-rules"
ownership_manifest=".pipelock-rules-sync-manifest"
mkdir -p "$source_root/published/alpha" "$source_root/published/beta"
printf 'name: alpha\nversion: "1"\n' > "$source_root/published/alpha/bundle.yaml"
printf 'alpha-signature\n' > "$source_root/published/alpha/bundle.yaml.sig"
printf 'name: beta\nversion: "2"\n' > "$source_root/published/beta/bundle.yaml"
printf 'beta-signature\n' > "$source_root/published/beta/bundle.yaml.sig"

sync_script="$root_dir/scripts/sync-pipelock-rules.sh"

bash "$sync_script" --write "$source_root" "$destination_root"
bash "$sync_script" --check "$source_root" "$destination_root"

before_failed_write="$temp_dir/before-failed-write.sha256"
after_failed_write="$temp_dir/after-failed-write.sha256"
(
	cd "$destination_root"
	find -P . -mindepth 1 -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
) > "$before_failed_write"
printf 'name: alpha\nversion: "2"\n' > "$source_root/published/alpha/bundle.yaml"
fail_bin="$temp_dir/fail-bin"
mkdir -p "$fail_bin"
printf '%s\n' \
	'#!/usr/bin/env bash' \
	'set -euo pipefail' \
	'if [[ "$*" == *".pipelock-rules-sync-stage."* && "$*" == *"/bundle.yaml.sig"* ]]; then' \
	'  exit 23' \
	'fi' \
	'exec "$REAL_CP" "$@"' > "$fail_bin/cp"
chmod +x "$fail_bin/cp"
if REAL_CP="$(command -v cp)" PATH="$fail_bin:$PATH" bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - staged copy failure passed\n' >&2
	exit 1
fi
(
	cd "$destination_root"
	find -P . -mindepth 1 -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
) > "$after_failed_write"
if ! cmp -s "$before_failed_write" "$after_failed_write"; then
	printf 'rules sync test: FAIL - staged copy failure modified the live destination\n' >&2
	exit 1
fi
if find "$temp_dir" -maxdepth 1 -name '.site-rules.pipelock-rules-sync-stage.*' -print -quit | grep -q .; then
	printf 'rules sync test: FAIL - staged copy failure left transaction state\n' >&2
	exit 1
fi
bash "$sync_script" --write "$source_root" "$destination_root"
bash "$sync_script" --check "$source_root" "$destination_root"

before_exchange_failure="$temp_dir/before-exchange-failure.sha256"
after_exchange_failure="$temp_dir/after-exchange-failure.sha256"
(
	cd "$destination_root"
	find -P . -mindepth 1 -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
) > "$before_exchange_failure"
printf 'name: alpha\nversion: "3"\n' > "$source_root/published/alpha/bundle.yaml"
capability_fail_bin="$temp_dir/capability-fail-bin"
mkdir -p "$capability_fail_bin"
printf '%s\n' \
	'#!/usr/bin/env bash' \
	'if find "$CAPABILITY_DEST_PARENT" -maxdepth 1 -name ".site-rules.pipelock-rules-sync-stage.*" -print -quit | grep -q .; then' \
	'  : > "$CAPABILITY_STAGE_SEEN"' \
	'fi' \
	'exit 23' > "$capability_fail_bin/python3"
chmod +x "$capability_fail_bin/python3"
capability_stage_seen="$temp_dir/capability-stage-seen"
if CAPABILITY_DEST_PARENT="$temp_dir" CAPABILITY_STAGE_SEEN="$capability_stage_seen" PATH="$capability_fail_bin:$PATH" bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - missing atomic exchange capability passed\n' >&2
	exit 1
fi
if [[ -e "$capability_stage_seen" ]]; then
	printf 'rules sync test: FAIL - capability rejection happened after staging\n' >&2
	exit 1
fi
if find "$temp_dir" -maxdepth 1 -name '.site-rules.pipelock-rules-sync-stage.*' -print -quit | grep -q .; then
	printf 'rules sync test: FAIL - capability rejection created transaction state\n' >&2
	exit 1
fi
exchange_fail_bin="$temp_dir/exchange-fail-bin"
mkdir -p "$exchange_fail_bin"
printf '%s\n' \
	'#!/usr/bin/env bash' \
	'if [[ "${2:-}" == --check ]]; then' \
	'  exec "$REAL_PYTHON3" "$@"' \
	'fi' \
	'exit 23' > "$exchange_fail_bin/python3"
chmod +x "$exchange_fail_bin/python3"
if REAL_PYTHON3="$(command -v python3)" PATH="$exchange_fail_bin:$PATH" bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - atomic exchange failure passed\n' >&2
	exit 1
fi
(
	cd "$destination_root"
	find -P . -mindepth 1 -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
) > "$after_exchange_failure"
if ! cmp -s "$before_exchange_failure" "$after_exchange_failure"; then
	printf 'rules sync test: FAIL - atomic exchange failure modified the live destination\n' >&2
	exit 1
fi
if find "$temp_dir" -maxdepth 1 -name '.site-rules.pipelock-rules-sync-stage.*' -print -quit | grep -q .; then
	printf 'rules sync test: FAIL - atomic exchange failure left transaction state\n' >&2
	exit 1
fi
bash "$sync_script" --write "$source_root" "$destination_root"
bash "$sync_script" --check "$source_root" "$destination_root"

concurrent_source="$temp_dir/concurrent-source"
cp -a "$source_root" "$concurrent_source"
printf 'name: alpha\nversion: "4"\n' > "$concurrent_source/published/alpha/bundle.yaml"
# The workflow serializes production writes. This direct-writer test audits the
# documented last-completed-exchange behavior and rejects partial generations.
bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1 &
first_writer=$!
bash "$sync_script" --write "$concurrent_source" "$destination_root" >/dev/null 2>&1 &
second_writer=$!
set +e
wait "$first_writer"
first_status=$?
wait "$second_writer"
second_status=$?
set -e
if (( first_status != 0 && second_status != 0 )); then
	printf 'rules sync test: FAIL - both concurrent writers failed\n' >&2
	exit 1
fi
if ! bash "$sync_script" --check "$source_root" "$destination_root" >/dev/null 2>&1 && ! bash "$sync_script" --check "$concurrent_source" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - concurrent writers produced a mixed destination\n' >&2
	exit 1
fi
if find "$temp_dir" -maxdepth 1 -name '.site-rules.pipelock-rules-sync-stage.*' -print -quit | grep -q .; then
	printf 'rules sync test: FAIL - concurrent writers left transaction state\n' >&2
	exit 1
fi
bash "$sync_script" --write "$source_root" "$destination_root"
bash "$sync_script" --check "$source_root" "$destination_root"

rm -rf "$destination_root"
bash "$sync_script" --write "$source_root" "$destination_root"
if [[ ! -d "$destination_root" ]]; then
	printf 'rules sync test: FAIL - missing destination was not rebuilt\n' >&2
	exit 1
fi
bash "$sync_script" --check "$source_root" "$destination_root"

locale_source="$temp_dir/locale-source"
locale_destination="$temp_dir/locale-site-rules"
mkdir -p "$locale_source/published/a-1" "$locale_source/published/a0"
printf 'name: a-1\n' > "$locale_source/published/a-1/bundle.yaml"
printf 'a-1-signature\n' > "$locale_source/published/a-1/bundle.yaml.sig"
printf 'name: a0\n' > "$locale_source/published/a0/bundle.yaml"
printf 'a0-signature\n' > "$locale_source/published/a0/bundle.yaml.sig"
sort_guard_bin="$temp_dir/sort-guard-bin"
mkdir -p "$sort_guard_bin"
printf '%s\n' \
	'#!/usr/bin/env bash' \
	'set -euo pipefail' \
	'if [[ "${LC_ALL:-}" != C ]]; then' \
	'  exit 24' \
	'fi' \
	'exec "$REAL_SORT" "$@"' > "$sort_guard_bin/sort"
chmod +x "$sort_guard_bin/sort"
REAL_SORT="$(command -v sort)" PATH="$sort_guard_bin:$PATH" bash "$sync_script" --write "$locale_source" "$locale_destination"
if [[ "$(sed -n '1p' "$locale_destination/$ownership_manifest")" != a-1 || "$(sed -n '2p' "$locale_destination/$ownership_manifest")" != a0 ]]; then
	printf 'rules sync test: FAIL - ownership manifest did not use canonical C ordering\n' >&2
	exit 1
fi
REAL_SORT="$(command -v sort)" PATH="$sort_guard_bin:$PATH" bash "$sync_script" --check "$locale_source" "$locale_destination"

mv "$destination_root/$ownership_manifest" "$temp_dir/ownership-manifest"
if bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - existing destination without ownership passed\n' >&2
	exit 1
fi
mv "$temp_dir/ownership-manifest" "$destination_root/$ownership_manifest"

printf 'drift\n' >> "$destination_root/alpha/bundle.yaml"
if bash "$sync_script" --check "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - changed bundle passed the check\n' >&2
	exit 1
fi
bash "$sync_script" --write "$source_root" "$destination_root"

rm "$source_root/published/beta/bundle.yaml.sig"
if bash "$sync_script" --check "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - missing signature passed the check\n' >&2
	exit 1
fi
printf 'beta-signature\n' > "$source_root/published/beta/bundle.yaml.sig"

rm "$source_root/published/beta/bundle.yaml" "$source_root/published/beta/bundle.yaml.sig"
rmdir "$source_root/published/beta"
if bash "$sync_script" --check "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - removed source bundle passed without synchronization\n' >&2
	exit 1
fi
bash "$sync_script" --write "$source_root" "$destination_root"
if [[ -e "$destination_root/beta" ]]; then
	printf 'rules sync test: FAIL - stale managed bundle was not removed\n' >&2
	exit 1
fi
bash "$sync_script" --check "$source_root" "$destination_root"

mkdir -p "$destination_root/unowned"
printf 'unowned\n' > "$destination_root/unowned/bundle.yaml"
printf 'unowned-signature\n' > "$destination_root/unowned/bundle.yaml.sig"
if bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - write deleted or accepted an unowned bundle\n' >&2
	exit 1
fi
if [[ ! -f "$destination_root/unowned/bundle.yaml" || ! -f "$destination_root/unowned/bundle.yaml.sig" ]]; then
	printf 'rules sync test: FAIL - rejected unowned bundle was modified\n' >&2
	exit 1
fi
rm -rf "$destination_root/unowned"

mkdir -p "$destination_root/alpha/nested"
printf 'hidden\n' > "$destination_root/alpha/nested/file.txt"
if bash "$sync_script" --check "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - nested published file passed the check\n' >&2
	exit 1
fi
rm -rf "$destination_root/alpha/nested"

mv "$destination_root" "$destination_root-real"
ln -s "$destination_root-real" "$destination_root"
if bash "$sync_script" --write "$source_root" "$destination_root" >/dev/null 2>&1; then
	printf 'rules sync test: FAIL - linked destination root passed the check\n' >&2
	exit 1
fi

printf 'rules sync tests: OK\n'
