"""Verify the exact file set delivered by the read-only Hub import job."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import sys


CATALOG = {
    "data/hub/generated/" + name + ".json"
    for name in ("inventory", "lifecycle", "listings", "references", "routes", "sections", "source")
}
ID = r"[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
ASSET = re.compile(
    rf"assets/hub/(?:community/{ID}/{ID}/bundle\.yaml(?:\.sig)?|configs/{ID}/pipelock\.yaml)"
)
MANIFEST = "hub-sync-manifest.json"


def file_inventory(root, directory):
    for entry in directory.iterdir():
        mode = entry.lstat().st_mode
        if stat.S_ISDIR(mode):
            yield from file_inventory(root, entry)
        elif stat.S_ISREG(mode):
            yield entry.relative_to(root).as_posix()
        else:
            raise ValueError("Hub delivery contains a non-regular file")


def unique_fields(pairs):
    fields = dict(pairs)
    if len(fields) != len(pairs):
        raise ValueError("Hub manifest repeats a field")
    return fields


def verify(root, site_sha, rules_sha):
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise ValueError("Hub delivery must be a regular directory")
    files = set(file_inventory(root, root))
    if MANIFEST not in files or not CATALOG.issubset(files):
        raise ValueError("Hub delivery is missing the manifest or a catalog file")
    manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"), object_pairs_hook=unique_fields)
    if (type(manifest["format"]) is not int or manifest["format"] != 1 or manifest["producer"]["sha"] != site_sha
            or manifest["producer"]["ref"] != "refs/heads/main" or manifest["rules_sha"] != rules_sha):
        raise ValueError("Hub delivery identity differs from the expected revisions")

    expected = files - {MANIFEST}
    seen = set()
    for entry in manifest["files"]:
        name = entry["path"]
        if (name not in expected or name in seen
                or (name not in CATALOG and not ASSET.fullmatch(name))):
            raise ValueError("Hub manifest has an unexpected or repeated path")
        file = root / name
        if type(entry["size"]) is not int or file.stat().st_size != entry["size"]:
            raise ValueError("Hub delivery file size differs")
        with file.open("rb") as payload:
            if hashlib.file_digest(payload, "sha256").hexdigest() != entry["sha256"]:
                raise ValueError("Hub delivery file digest differs")
        seen.add(name)
    if seen != expected:
        raise ValueError("Hub manifest does not cover the complete delivery")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("site_sha")
    parser.add_argument("rules_sha")
    arguments = parser.parse_args()
    try:
        for revision in (arguments.site_sha, arguments.rules_sha):
            if not re.fullmatch(r"[a-f0-9]{40}", revision):
                raise ValueError("Expected exact site and Rules SHAs")
        verify(arguments.root, arguments.site_sha, arguments.rules_sha)
    except (ValueError, TypeError, KeyError, AttributeError, OSError, RecursionError):
        sys.exit("Hub delivery could not be verified.")


if __name__ == "__main__":
    main()
