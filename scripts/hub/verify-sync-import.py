"""Verify the exact file set delivered by the read-only Hub import job."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import sys
import tarfile
from tempfile import TemporaryDirectory


CATALOG = {
    "data/hub/generated/" + name + ".json"
    for name in ("inventory", "lifecycle", "listings", "references", "routes", "sections", "source")
}
ID = r"[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
ASSET = re.compile(
    rf"assets/hub/(?:community/{ID}/{ID}/bundle\.yaml(?:\.sig)?|configs/{ID}/pipelock\.yaml)"
)
MANIFEST = "hub-sync-manifest.json"
OWNED = ("data/hub/generated", "assets/hub/community", "assets/hub/configs")


def allowed_file(name):
    return name in CATALOG or ASSET.fullmatch(name)


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
                or not allowed_file(name)):
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


def apply_delivery(archive, site, site_sha, rules_sha):
    with TemporaryDirectory(prefix="hub-sync-") as directory:
        root = Path(directory)
        with tarfile.open(archive, "r:") as bundle:
            seen = set()
            for member in bundle:
                name = member.name
                if (not member.isreg() or name in seen
                        or (name != MANIFEST and not allowed_file(name))):
                    raise ValueError("Hub sync archive includes an invalid entry")
                seen.add(name)
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, target.open("xb") as destination:
                    shutil.copyfileobj(source, destination)
        verify(root, site_sha, rules_sha)

        for relative in OWNED:
            target = site / relative
            for ancestor in (target, *target.parents):
                if ancestor == site.parent:
                    break
                if ancestor.is_symlink():
                    raise ValueError("Hub output path contains a symbolic link")
        for relative in OWNED:
            target = site / relative
            if target.exists():
                shutil.rmtree(target)
            source = root / relative
            if source.exists():
                shutil.copytree(source, target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("site_sha")
    parser.add_argument("rules_sha")
    parser.add_argument("--apply-to", type=Path)
    arguments = parser.parse_args()
    try:
        for revision in (arguments.site_sha, arguments.rules_sha):
            if not re.fullmatch(r"[a-f0-9]{40}", revision):
                raise ValueError("Expected exact site and Rules SHAs")
        if arguments.apply_to:
            apply_delivery(arguments.root, arguments.apply_to, arguments.site_sha, arguments.rules_sha)
        else:
            verify(arguments.root, arguments.site_sha, arguments.rules_sha)
    except (ValueError, TypeError, KeyError, AttributeError, OSError, RecursionError, tarfile.TarError):
        sys.exit("Hub delivery could not be verified.")


if __name__ == "__main__":
    main()
