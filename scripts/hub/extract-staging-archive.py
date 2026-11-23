"""Extract authenticated staging artifacts without following archive paths."""
import os
from pathlib import Path
import shutil
import stat
import sys
import zipfile


def extract(archive, destination):
    root = Path(destination).resolve()
    with zipfile.ZipFile(archive) as source:
        seen = set()
        for entry in source.infolist():
            name = entry.filename.rstrip("/")
            parts = name.split("/")
            mode = entry.external_attr >> 16
            if (not name or name.startswith("/") or "\\" in name or ":" in name
                    or any(part in ("", ".", "..") for part in parts)
                    or any(ord(character) < 32 for character in name)
                    or parts[0] not in ("package", "evidence")
                    or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)
                    or name in seen):
                raise ValueError("staging archive entry refused")
            seen.add(name)
        for entry in source.infolist():
            target = root.joinpath(*entry.filename.rstrip("/").split("/"))
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(entry) as incoming, target.open("xb") as outgoing:
                    shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
                os.chmod(target, 0o600)


if __name__ == "__main__":
    try:
        extract(*sys.argv[1:])
    except Exception:
        print("staging archive extraction refused", file=sys.stderr)
        sys.exit(1)
