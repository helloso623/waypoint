"""Orchestra F: quieter loot, art-forward skins, standalone arcade extra."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NEW_SKINS = [
    "linocut",
    "risograph",
    "enamel",
    "brutalist",
    "ukiyo",
    "bauhaus",
    "noir",
    "celadon",
    "vermilion",
    "kiln",
]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraFTests(unittest.TestCase):
    def test_new_catalog_skins_exist_in_loot(self):
        js = source("static/js/loot.js")
        pools_start = js.find("const CHEST_SKIN_POOLS")
        pools_end = js.find("const PINS")
        self.assertGreater(pools_start, 0)
        self.assertGreater(pools_end, pools_start)
        pools = js[pools_start:pools_end]
        for skin_id in NEW_SKINS:
            self.assertIn(f'id: "{skin_id}"', js)
            self.assertIn(f'"{skin_id}"', pools)

    def test_quiet_daily_chests(self):
        js = source("static/js/loot.js")
        self.assertTrue("quietGrantCount" in js or "max_daily_chests" in js)
        self.assertIn("quietGrantCount", js)
        self.assertIn("max_daily_chests: 1", js)

    def test_new_arcade_game_exists(self):
        js = source("static/js/napkin_depth.js")
        self.assertIn("function openReversi", js)
        self.assertIn("wpOpenReversi", js)


if __name__ == "__main__":
    unittest.main()
