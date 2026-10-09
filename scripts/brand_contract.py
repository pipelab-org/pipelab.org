#!/usr/bin/env python3
"""Verify PipeLab brand tokens and wording across portfolio repositories."""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

TOKEN_NAMES = {
    "accent": "accent",
    "purple": "purple",
    "background": "bg",
    "elevated": "bg_elevated",
    "text": "text",
    "muted": "muted",
    "dim": "dim",
}


def assignments(path: Path) -> dict[str, object]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: dict[str, object] = {}
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            continue
        if len(targets) == 1 and isinstance(targets[0], (ast.Tuple, ast.List)) and isinstance(value, tuple):
            for target, item in zip(targets[0].elts, value, strict=True):
                if isinstance(target, ast.Name):
                    found[target.id] = item
        else:
            for target in targets:
                if isinstance(target, ast.Name):
                    found[target.id] = value
    return found


def expect(actual: object, expected: object, label: str, problems: list[str]) -> None:
    if actual != expected:
        problems.append(f"{label}: expected {expected!r}, found {actual!r}")


def check_site(root: Path, contract: dict[str, object], problems: list[str]) -> None:
    css = (root / ".brand/colors_and_type.css").read_text(encoding="utf-8").lower()
    renderer = (root / "scripts/render_pipelab_brand.py").read_text(encoding="utf-8")
    for name, value in contract["tokens"].items():
        if value.lower() not in css:
            problems.append(f"site CSS: token {name}={value} is missing")
    if 'assets/brand/brand-contract.json' not in renderer:
        problems.append("PipeLab renderer does not load the canonical brand contract")


def check_pipelock(root: Path, contract: dict[str, object], problems: list[str]) -> None:
    values = assignments(root / "scripts/render_brand.py")
    tokens = contract["tokens"]
    expected = {
        "ACCENT": tokens["accent"], "PURPLE": tokens["purple"], "BG": tokens["background"],
        "ELEVATED": tokens["elevated"], "TEXT": tokens["text"], "MUTED": tokens["muted"], "DIM": tokens["dim"],
    }
    for name, value in expected.items():
        expect(values.get(name), value, f"pipelock {name}", problems)
    expect(values.get("FOOTER"), f'{contract["attribution"]["pipelock_product"]}  ·  {contract["attribution"]["maintainer"]}', "pipelock footer", problems)


def check_rules(root: Path, contract: dict[str, object], problems: list[str]) -> None:
    values = assignments(root / "scripts/render_brand.py")
    tokens = contract["tokens"]
    expected = {
        "ACCENT": tokens["accent"], "PURPLE": tokens["purple"], "BG": tokens["background"],
        "BG_ELEVATED": tokens["elevated"], "TEXT": tokens["text"], "MUTED": tokens["muted"], "DIM": tokens["dim"],
    }
    for name, value in expected.items():
        expect(values.get(name), value, f"rules {name}", problems)
    expect(values.get("CARD_FOOTER"), f'{contract["attribution"]["apache_component"]}  ·  {contract["attribution"]["maintainer"]}', "rules footer", problems)


def check_bench(root: Path, contract: dict[str, object], problems: list[str]) -> None:
    values = assignments(root / "scripts/render_diagrams.py")
    actual = values.get("BRAND", {})
    tokens = contract["tokens"]
    for contract_name, bench_name in TOKEN_NAMES.items():
        expect(actual.get(bench_name), tokens[contract_name], f"bench TOKENS[{bench_name}]", problems)
    expect(values.get("CARD_FOOTER"), f'{contract["attribution"]["apache_component"]}  ·  {contract["attribution"]["maintainer"]}', "bench footer", problems)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, required=True)
    parser.add_argument("--pipelock", type=Path)
    parser.add_argument("--rules", type=Path)
    parser.add_argument("--bench", type=Path)
    args = parser.parse_args()
    contract = json.loads((args.site / "assets/brand/brand-contract.json").read_text(encoding="utf-8"))
    problems: list[str] = []
    check_site(args.site, contract, problems)
    if args.pipelock:
        check_pipelock(args.pipelock, contract, problems)
    if args.rules:
        check_rules(args.rules, contract, problems)
    if args.bench:
        check_bench(args.bench, contract, problems)
    if problems:
        print("brand contract failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print("brand contract matches every checked repository")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
