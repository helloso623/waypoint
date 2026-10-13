"""Grok A leftover orchestra round 2 contracts."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNED = (
    "static/js/core.js",
    "static/js/companion.js",
    "static/js/hub.js",
    "static/js/eggs.js",
)


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraATests(unittest.TestCase):
    def test_kill_auto_command_palette_still_present(self):
        core = source("static/js/core.js")
        self.assertIn("killAutoCommandPalette", core)
        self.assertIn("__wpPaletteUserOpened", core)
        self.assertIn("command palette", core.lower())
        self.assertNotIn("initCommandPalette();", core)
        after = core.split("killAutoCommandPalette")[1][:400]
        self.assertNotIn("open();", after)

    def test_hud_focus_cluster_hides_with_game_off(self):
        core = source("static/js/core.js")
        self.assertIn("applyHudChrome", core)
        self.assertIn("hud-focus-cluster", core)
        self.assertIn("wp-hide-game", core)
        self.assertIn("html.wp-hide-game #hud-focus-cluster", core)
        self.assertIn("body.wp-hide-game #hud-focus-cluster", core)
        chrome = core.split("function applyHudChrome")[1].split("function parseHudCoins")[0]
        self.assertIn("hud-focus-cluster", chrome)
        self.assertIn("wp-hide-game", chrome)

    def test_no_mini_dock_inject_on_body(self):
        for rel in OWNED:
            blob = source(rel)
            self.assertNotIn('id="wp-mini-dock"', blob)
            self.assertNotIn("id = \"wp-mini-dock\"", blob)
            self.assertIsNone(
                re.search(r"document\.body[\s\S]{0,180}wp-mini-dock|wp-mini-dock[\s\S]{0,180}document\.body", blob),
                msg=f"{rel} must not inject #wp-mini-dock onto document.body",
            )

    def test_observe_and_jump_stay_gone(self):
        for rel in OWNED:
            blob = source(rel)
            self.assertNotIn('id="hud-jump"', blob)
            self.assertNotIn("obs-fab", blob)
            self.assertNotIn("Observe button", blob)

    def test_companion_keeps_one_memory_and_voice_review(self):
        companion = source("static/js/companion.js")
        self.assertEqual(companion.count('id="companion-memory-btn"'), 1)
        self.assertIn("Review transcript, then send.", companion)
        self.assertIn("showVoiceReview", companion)
        self.assertIn("wp-tile-mark", companion)

    def test_hub_share_copy_tight_no_jump(self):
        hub = source("static/js/hub.js")
        self.assertIn("hub-share-app", hub)
        self.assertIn("copyShareAppLink", hub)
        self.assertIn("Send app", hub)
        self.assertNotIn("Jump", hub)
        self.assertNotIn("Observe", hub)


if __name__ == "__main__":
    unittest.main()
