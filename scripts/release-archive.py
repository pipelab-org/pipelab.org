"""Extract one regular Linux binary, without extracting archive paths."""
import pathlib
import shutil
import sys
import tarfile

# Same 256 MiB limit as Pipelock v3.7.1 internal/cli/selfupdate/update.go.
LIMIT = 256 << 20


def extract(archive, binary, destination):
    with tarfile.open(archive, "r:gz") as source:
        selected = None
        seen = set()
        total = 0
        for entry in source:
            parts = entry.name.split("/")
            if (entry.name.startswith("/") or ".." in parts or "\\" in entry.name
                    or entry.name in seen or not (entry.isfile() or entry.isdir())):
                raise ValueError("unsafe or duplicate archive entry")
            seen.add(entry.name)
            total += entry.size
            if total > LIMIT:
                raise ValueError("archive exceeds extracted size limit")
            if entry.name == binary:
                if not entry.isfile():
                    raise ValueError("binary must be a regular file")
                selected = entry
        if selected is None:
            raise ValueError("archive is missing expected binary")
        # Never use extract/extractall: archive paths cannot become output paths.
        with source.extractfile(selected) as incoming, open(destination, "xb") as output:
            shutil.copyfileobj(incoming, output)
    pathlib.Path(destination).chmod(0o755)


if __name__ == "__main__":
    extract(*sys.argv[1:])
