"""Grok A HUD / launcher leftover napkin contracts."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class AtelierChromeATests(unittest.TestCase):
    def test_core_kills_auto_palette_and_keeps_user_open(self):
        core = source("static/js/core.js")
        self.assertIn("killAutoCommandPalette", core)
        self.assertIn("__wpPaletteUserOpened", core)
        self.assertIn("command palette", core.lower())
        self.assertNotIn("initCommandPalette();", core)
        self.assertNotIn('open();', core.split("killAutoCommandPalette")[1][:400])

    def test_core_launch_precalc_cinematic(self):
        core = source("static/js/core.js")
        self.assertIn("withLaunchPrecalc", core)
        self.assertIn("showLaunchPrecalcOverlay", core)
        self.assertIn("launch-precalc", core)
        self.assertIn("Preparing", core)

    def test_hud_collapses_extra_keeps_coins_status(self):
        core = source("static/js/core.js")
        self.assertIn("wp-hud-extra-collapsed", core)
        self.assertIn("applyHudChrome", core)
        self.assertIn("#hud-quests-btn", core)
        self.assertIn("#hud-coins-label", source("static/js/misc.js"))

    def test_game_off_hides_arcade_and_loot(self):
        core = source("static/js/core.js")
        self.assertIn("wp-hide-game", core)
        self.assertIn("waypointGameOff", core)
        self.assertIn('a.id === "arcade"', core)
        self.assertIn("hud-game-cluster", core)
        eggs = source("static/js/eggs.js")
        self.assertIn("function gameOff()", eggs)
        self.assertIn("applyEggsGameOff", eggs)

    def test_share_control_on_hub_and_home(self):
        core = source("static/js/core.js")
        hub = source("static/js/hub.js")
        self.assertIn("copyShareAppLink", core)
        self.assertIn("/api/system/security", core)
        self.assertIn("tailscale_urls", core)
        self.assertIn("launcher-share-app", core)
        self.assertIn("hub-share-app", hub)
        self.assertIn("copyShareAppLink", hub)

    def test_quest_auto_display_no_accept(self):
        core = source("static/js/core.js")
        self.assertIn("ensureDailyQuestsAuto", core)
        self.assertIn("showQuestAutoBanner", core)
        self.assertIn("wp-quest-auto-banner", core)
        radar = core.split("function launcherQuestRadarHtml")[1].split("function ensureLauncherQuestRadarStyles")[0]
        self.assertNotIn("Open board", radar)
        self.assertNotIn("Accept", radar)

    def test_last_used_search_dock_focus(self):
        core = source("static/js/core.js")
        self.assertIn("launcherLastApp", core)
        self.assertIn("dockBeforeSearch", core)
        self.assertIn("readLauncherLastApp", core)
        self.assertIn("ctx.label", core)

    def test_jump_and_observe_stay_gone(self):
        core = source("static/js/core.js")
        hub = source("static/js/hub.js")
        eggs = source("static/js/eggs.js")
        for blob in (core, hub, eggs):
            self.assertNotIn("id=\"hud-jump\"", blob)
            self.assertNotIn("obs-fab", blob)
            self.assertNotIn("Observe button", blob)


if __name__ == "__main__":
    unittest.main()
