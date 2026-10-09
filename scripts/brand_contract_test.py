#!/usr/bin/env python3

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import brand_contract


class BrandContractTest(unittest.TestCase):
    def test_reads_tuple_and_dictionary_assignments(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "tokens.py"
            source.write_text(
                'ACCENT, BG = "#00e5a0", "#09090b"\nBRAND = {"muted": "#94a3b8"}\n',
                encoding="utf-8",
            )
            self.assertEqual(
                brand_contract.assignments(source),
                {"ACCENT": "#00e5a0", "BG": "#09090b", "BRAND": {"muted": "#94a3b8"}},
            )

    def test_mismatch_is_a_failure(self) -> None:
        problems: list[str] = []
        brand_contract.expect("#00ffc8", "#00e5a0", "accent", problems)
        self.assertEqual(problems, ["accent: expected '#00e5a0', found '#00ffc8'"])


if __name__ == "__main__":
    unittest.main()
