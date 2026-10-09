#!/usr/bin/env bash
set -euo pipefail

usage() {
	printf 'usage: %s (--check|--write) RULES_REPOSITORY [SITE_RULES_DIRECTORY]\n' "${0##*/}" >&2
}

if (( $# < 2 || $# > 3 )); then
	usage
	exit 2
fi

mode="$1"
source_root="$2"
destination_root="${3:-static/rules}"

case "$mode" in
	--check | --write) ;;
	*)
		usage
		exit 2
		;;
esac

if [[ -L "$source_root" || -L "$source_root/published" || ! -d "$source_root/published" ]]; then
	printf 'rules sync: FAIL - source has no published directory: %s\n' "$source_root" >&2
	exit 1
fi

temp_dir="$(mktemp -d)"
stage_dir=""
cleanup() {
	local status=$?
	trap - EXIT INT TERM
	if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then
		rm -rf -- "$stage_dir"
	fi
	rm -rf -- "$temp_dir"
	exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
expected_root="$temp_dir/expected"
ownership_manifest=".pipelock-rules-sync-manifest"
mkdir -p "$expected_root"

mapfile -d '' bundle_dirs < <(find -P "$source_root/published" -mindepth 1 -maxdepth 1 -type d -print0 | LC_ALL=C sort -z)
if (( ${#bundle_dirs[@]} == 0 )); then
	printf 'rules sync: FAIL - source has no published bundles\n' >&2
	exit 1
fi

expected_bundles=()
for bundle_dir in "${bundle_dirs[@]}"; do
	bundle="${bundle_dir##*/}"
	if [[ ! "$bundle" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
		printf 'rules sync: FAIL - invalid bundle directory name: %s\n' "$bundle" >&2
		exit 1
	fi
	expected_bundles+=("$bundle")

	for asset in bundle.yaml bundle.yaml.sig; do
		source_file="$bundle_dir/$asset"
		if [[ ! -f "$source_file" || -L "$source_file" ]]; then
			printf 'rules sync: FAIL - missing or linked source asset: %s\n' "$source_file" >&2
			exit 1
		fi
		mkdir -p "$expected_root/$bundle"
		cp "$source_file" "$expected_root/$bundle/$asset"
	done
done
printf '%s\n' "${expected_bundles[@]}" | LC_ALL=C sort > "$expected_root/$ownership_manifest"

write_manifest() {
	local root="$1"
	local output="$2"
	(
		cd "$root"
		find -P . -mindepth 1 -type f -print0 \
			| LC_ALL=C sort -z \
			| xargs -0 sha256sum
	) > "$output"
}

expected_manifest="$temp_dir/expected.sha256"
write_manifest "$expected_root" "$expected_manifest"

destination_parent="$(dirname -- "$destination_root")"
destination_name="$(basename -- "$destination_root")"

atomic_exchange() {
	python3 - "$@" <<'PY'
import ctypes
import os
import stat
import sys
import tempfile

libc = ctypes.CDLL(None, use_errno=True)
if sys.platform == "darwin":
    try:
        rename = libc.renamex_np
    except AttributeError as error:
        raise OSError("renamex_np(RENAME_SWAP) is unavailable") from error
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
elif sys.platform.startswith("linux"):
    try:
        rename = libc.renameat2
    except AttributeError as error:
        raise OSError("renameat2(RENAME_EXCHANGE) is unavailable") from error
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
else:
    raise OSError(f"atomic directory exchange is unsupported on {sys.platform}")

def exchange(old_path, new_path):
    if sys.platform == "darwin":
        result = rename(old_path, new_path, 0x00000002)  # RENAME_SWAP
    else:
        result = rename(-100, old_path, -100, new_path, 0x00000002)  # AT_FDCWD, RENAME_EXCHANGE
    if result != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))

def validate_parent(parent):
    parent_stat = os.lstat(parent)
    if not stat.S_ISDIR(parent_stat.st_mode) or parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o022:
        raise PermissionError("atomic exchange parent must be an owner-only-writable directory", parent)

if len(sys.argv) == 4 and sys.argv[1] == "--check":
    parent = os.path.abspath(sys.argv[2])
    validate_parent(parent)
    probe_paths = []
    try:
        prefix = f".{sys.argv[3]}.pipelock-rules-sync-probe."
        probe_paths.append(tempfile.mkdtemp(prefix=prefix, dir=parent))
        probe_paths.append(tempfile.mkdtemp(prefix=prefix, dir=parent))
        exchange(*(os.fsencode(path) for path in probe_paths))
    finally:
        for path in probe_paths:
            if os.path.isdir(path):
                os.rmdir(path)
    raise SystemExit(0)
if len(sys.argv) != 3:
    raise ValueError("atomic exchange requires two paths")

old_path = os.fsencode(sys.argv[1])
new_path = os.fsencode(sys.argv[2])
old_parent = os.path.dirname(os.path.abspath(sys.argv[1]))
new_parent = os.path.dirname(os.path.abspath(sys.argv[2]))
if old_parent != new_parent:
    raise OSError("atomic exchange paths must share a parent directory")
validate_parent(old_parent)
exchange(old_path, new_path)
PY
}

validate_destination_shape() {
	stale_bundle_dirs=()
	declare -gA previously_managed=()

	if [[ -L "$destination_root" ]]; then
		printf 'rules sync: FAIL - destination root is a symbolic link: %s\n' "$destination_root" >&2
		return 1
	fi
	if [[ ! -d "$destination_root" ]]; then
		return 0
	fi

	if find -P "$destination_root" -mindepth 1 -type l -print -quit | grep -q .; then
		printf 'rules sync: FAIL - destination contains a symbolic link\n' >&2
		return 1
	fi

	destination_manifest="$destination_root/$ownership_manifest"
	if [[ ! -f "$destination_manifest" || -L "$destination_manifest" ]]; then
		printf 'rules sync: FAIL - destination has no ownership manifest: %s\n' "$destination_manifest" >&2
		return 1
	fi
	mapfile -t previous_bundles < "$destination_manifest"
	if (( ${#previous_bundles[@]} == 0 )); then
		printf 'rules sync: FAIL - destination ownership manifest is empty\n' >&2
		return 1
	fi
	for bundle in "${previous_bundles[@]}"; do
		if [[ ! "$bundle" =~ ^[a-z0-9][a-z0-9-]*$ || -n "${previously_managed[$bundle]+x}" ]]; then
			printf 'rules sync: FAIL - destination ownership manifest is invalid\n' >&2
			return 1
		fi
		previously_managed["$bundle"]=1
	done
	normalized_manifest="$temp_dir/previously-managed.normalized"
	printf '%s\n' "${previous_bundles[@]}" | LC_ALL=C sort > "$normalized_manifest"
	if ! cmp -s "$destination_manifest" "$normalized_manifest"; then
		printf 'rules sync: FAIL - destination ownership manifest is not canonical\n' >&2
		return 1
	fi

	while IFS= read -r directory; do
		bundle="${directory##*/}"
		if [[ -d "$expected_root/$bundle" ]]; then
			if [[ -z "${previously_managed[$bundle]+x}" ]]; then
				printf 'rules sync: FAIL - destination has an unowned bundle directory: %s\n' "$directory" >&2
				return 1
			fi
		else
			if [[ "$mode" == --check ]]; then
				printf 'rules sync: FAIL - destination has a stale bundle directory: %s\n' "$directory" >&2
				return 1
			fi
			if [[ -z "${previously_managed[$bundle]+x}" ]]; then
				printf 'rules sync: FAIL - destination has an unowned bundle directory: %s\n' "$directory" >&2
				return 1
			fi
			stale_bundle_dirs+=("$directory")
		fi
	done < <(find -P "$destination_root" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)

	if find -P "$destination_root" -mindepth 2 -type d -print -quit | grep -q .; then
		printf 'rules sync: FAIL - destination contains a nested directory\n' >&2
		return 1
	fi

	while IFS= read -r file; do
		relative="${file#"$destination_root"/}"
		if [[ ! -f "$expected_root/$relative" ]]; then
			bundle="${relative%%/*}"
			asset="${relative#*/}"
			if [[ "$mode" == --write && "$relative" == */* && ! -d "$expected_root/$bundle" && -n "${previously_managed[$bundle]+x}" ]]; then
				case "$asset" in
				bundle.yaml | bundle.yaml.sig) continue ;;
				esac
			fi
			printf 'rules sync: FAIL - destination has an unowned file: %s\n' "$file" >&2
			return 1
		fi
	done < <(find -P "$destination_root" -mindepth 1 -type f | LC_ALL=C sort)

	for directory in "${stale_bundle_dirs[@]}"; do
		for asset in bundle.yaml bundle.yaml.sig; do
			if [[ ! -f "$directory/$asset" ]]; then
				printf 'rules sync: FAIL - stale bundle is incomplete: %s\n' "$directory" >&2
				return 1
			fi
		done
	done
}

validate_destination_shape

if [[ "$mode" == --write ]]; then
	mkdir -p "$destination_parent"
	if [[ -d "$destination_root" ]] && ! atomic_exchange --check "$destination_parent" "$destination_name"; then
		printf 'rules sync: FAIL - atomic directory exchange is unavailable on this platform\n' >&2
		exit 1
	fi
	stage_dir="$(mktemp -d "$destination_parent/.${destination_name}.pipelock-rules-sync-stage.XXXXXX")"
	while IFS= read -r -d '' expected_file; do
		relative="${expected_file#"$expected_root"/}"
		if [[ "$relative" == */* ]]; then
			mkdir -p "$stage_dir/${relative%/*}"
		fi
		cp "$expected_file" "$stage_dir/$relative"
	done < <(find -P "$expected_root" -mindepth 1 -type f -print0 | LC_ALL=C sort -z)

	staged_manifest="$temp_dir/staged.sha256"
	write_manifest "$stage_dir" "$staged_manifest"
	if ! diff -u "$expected_manifest" "$staged_manifest"; then
		printf 'rules sync: FAIL - staged destination is incomplete\n' >&2
		exit 1
	fi

	# The production workflow serializes writes. Direct concurrent writers use
	# last-completed-exchange wins; the final manifest check below makes a writer
	# fail if another exchange overtakes it before verification.
	if [[ -d "$destination_root" ]]; then
		if ! atomic_exchange "$stage_dir" "$destination_root"; then
			printf 'rules sync: FAIL - could not atomically exchange staged destination\n' >&2
			exit 1
		fi
		rm -rf -- "$stage_dir"
	elif ! mv -- "$stage_dir" "$destination_root"; then
		printf 'rules sync: FAIL - could not install staged destination\n' >&2
		exit 1
	fi
	stage_dir=""
fi

if [[ ! -d "$destination_root" ]]; then
	printf 'rules sync: FAIL - destination is missing: %s\n' "$destination_root" >&2
	exit 1
fi

actual_manifest="$temp_dir/actual.sha256"
write_manifest "$destination_root" "$actual_manifest"

if ! diff -u "$expected_manifest" "$actual_manifest"; then
	printf 'rules sync: FAIL - site bundles differ from Pipelock Rules\n' >&2
	exit 1
fi

printf 'rules sync: OK - %d signed bundle(s) match\n' "${#bundle_dirs[@]}"
