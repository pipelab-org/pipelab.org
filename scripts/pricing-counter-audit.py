#!/usr/bin/env python3
"""Fail if rendered HTML matches the retired .pricing-card .pricing-tier selector."""

import argparse
from html.parser import HTMLParser
from pathlib import Path
import sys


class PricingSelector(HTMLParser):
    # HTML void elements never become ancestors. Script/style text is handled
    # as raw text by HTMLParser, so selector-like strings there are not nodes.
    voids = set("area base br col embed hr img input link meta param source track wbr".split())

    def __init__(self):
        super().__init__()
        self.stack = []
        self.matches = 0

    def handle_starttag(self, tag, attrs):
        classes = set((dict(attrs).get("class") or "").split())
        if "pricing-tier" in classes and any("pricing-card" in c for _, c in self.stack):
            self.matches += 1
        if tag not in self.voids:
            self.stack.append((tag, classes))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.voids:
            self.handle_endtag(tag)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default="public")
    parser.add_argument("--stdin", action="store_true", help="check an injected HTML fixture")
    args = parser.parse_args()
    files = [Path("<stdin>")] if args.stdin else sorted(Path(args.root).rglob("*.html"))
    if not files:
        print("pricing counter audit: no rendered HTML files", file=sys.stderr)
        return 1
    total = 0
    for file in files:
        selector = PricingSelector()
        selector.feed(sys.stdin.read() if args.stdin else file.read_text())
        total += selector.matches
        if selector.matches:
            print(f"{file}: {selector.matches} match(es) for .pricing-card .pricing-tier", file=sys.stderr)
    print(f"pricing counter audit: {len(files)} HTML files, {total} matching elements")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
