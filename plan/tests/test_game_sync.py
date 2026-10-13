"""Tests for cash / achievement sync.

The destructive failure here is silent progress loss: both the laptop and the phone hold a
complete copy of this state and post all of it, so a naive overwrite would let whichever
synced last wipe the other's trophies and coins. Every test below is about that.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("WAYPOINT_DATA_DIR", tempfile.mkdtemp())
os.environ["NAPKIN_AUTO_COMMIT"] = "false"

import game_sync as gs


class MergeTests(unittest.TestCase):
    def setUp(self):
        data = Path(tempfile.mkdtemp())
        gs.STATE_FILE = data / "game_state.json"
        gs.MARKDOWN_FILE = data / "GAME_STATE.md"

    def test_counters_never_go_backwards(self):
        """A device that synced late with a stale count must not lower the total."""
        gs.sync({"arcadeTrophies": 12, "arcadeCoinsBonus": 500}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"arcadeTrophies": 3, "arcadeCoinsBonus": 10}, "2026-09-15T11:00:00Z")
        self.assertEqual(merged["arcadeTrophies"], 12)
        self.assertEqual(merged["arcadeCoinsBonus"], 500)

    def test_counters_still_climb(self):
        gs.sync({"arcadeTrophies": 3}, "2026-09-15T10:00:00Z")
        self.assertEqual(gs.sync({"arcadeTrophies": 9}, "2026-09-15T11:00:00Z")["arcadeTrophies"], 9)

    def test_achievement_sets_union_across_devices(self):
        gs.sync({"seenLevels": [1, 2, 3]}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"seenLevels": [1, 7]}, "2026-09-15T11:00:00Z")
        self.assertEqual(merged["seenLevels"], [1, 2, 3, 7])

    def test_unlocks_earned_anywhere_stay_unlocked(self):
        gs.sync({"arcadeUnlocks": {"neon": True, "retro": False}}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"arcadeUnlocks": {"neon": False, "retro": True}}, "2026-09-15T11:00:00Z")
        self.assertTrue(merged["arcadeUnlocks"]["neon"], "a later device must not re-lock this")
        self.assertTrue(merged["arcadeUnlocks"]["retro"])

    def test_daily_xp_takes_the_max_on_the_same_day(self):
        gs.sync({"gameXpToday": {"date": "2026-09-15", "amount": 40}}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"gameXpToday": {"date": "2026-09-15", "amount": 25}}, "2026-09-15T11:00:00Z")
        self.assertEqual(merged["gameXpToday"]["amount"], 40)

    def test_daily_xp_resets_on_a_new_day(self):
        gs.sync({"gameXpToday": {"date": "2026-09-15", "amount": 90}}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"gameXpToday": {"date": "2026-09-16", "amount": 5}}, "2026-09-16T09:00:00Z")
        self.assertEqual(merged["gameXpToday"], {"date": "2026-09-16", "amount": 5})

    def test_balance_follows_the_most_recent_device(self):
        """gameGems goes DOWN when spent, so max() would resurrect spent gems."""
        gs.sync({"gameGems": 50}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"gameGems": 20}, "2026-09-15T12:00:00Z")
        self.assertEqual(merged["gameGems"], 20)

    def test_a_stale_post_does_not_overwrite_a_newer_balance(self):
        gs.sync({"gameGems": 20}, "2026-09-15T12:00:00Z")
        merged = gs.sync({"gameGems": 50}, "2026-09-15T10:00:00Z")
        self.assertEqual(merged["gameGems"], 20)

    def test_a_partial_post_leaves_other_keys_alone(self):
        """The phone may only know about some keys; it must not blank the rest."""
        gs.sync({"arcadeTrophies": 5, "gameGems": 30, "seenLevels": [1]}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"gameGems": 31}, "2026-09-15T11:00:00Z")
        self.assertEqual(merged["arcadeTrophies"], 5)
        self.assertEqual(merged["seenLevels"], [1])
        self.assertEqual(merged["gameGems"], 31)

    def test_unknown_keys_are_ignored(self):
        merged = gs.sync({"somethingElse": "x", "arcadeTrophies": 2}, "2026-09-15T10:00:00Z")
        self.assertNotIn("somethingElse", merged)

    def test_state_survives_a_reload(self):
        gs.sync({"arcadeTrophies": 7}, "2026-09-15T10:00:00Z")
        self.assertEqual(gs.current()["arcadeTrophies"], 7)

    def test_markdown_lists_cash_and_achievements(self):
        gs.sync({"gameGems": 12, "arcadeTrophies": 4}, "2026-09-15T10:00:00Z")
        text = gs.MARKDOWN_FILE.read_text(encoding="utf-8")
        self.assertIn("# Game state", text)
        self.assertIn("gameGems", text)
        self.assertIn("arcadeTrophies", text)


class LootAndAchievementTests(unittest.TestCase):
    """Loot, eggs and skins store under constant-named keys, so they were missed at first.

    They are the things it hurts most to lose: boxes opened, coins banked, skins owned.
    """

    def setUp(self):
        data = Path(tempfile.mkdtemp())
        gs.STATE_FILE = data / "game_state.json"
        gs.MARKDOWN_FILE = data / "GAME_STATE.md"

    def test_loot_state_is_synced_at_all(self):
        merged = gs.sync({"waypointLootStateV1": {"boxes": 3, "opened": 11}}, "2026-09-15T10:00:00Z")
        self.assertEqual(merged["waypointLootStateV1"]["opened"], 11)

    def test_coin_high_water_never_drops(self):
        gs.sync({"waypointCoinHighWater": 900}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"waypointCoinHighWater": 120}, "2026-09-15T11:00:00Z")
        self.assertEqual(merged["waypointCoinHighWater"], 900)

    def test_achievements_union_across_devices(self):
        gs.sync({"waypointAchievementsV1": ["first-egg", "ten-boxes"]}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"waypointAchievementsV1": ["night-owl"]}, "2026-09-15T11:00:00Z")
        self.assertEqual(set(merged["waypointAchievementsV1"]),
                         {"first-egg", "ten-boxes", "night-owl"})

    def test_owned_skins_are_never_lost(self):
        gs.sync({"waypointCustomSkinsV1": ["neon"]}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"waypointCustomSkinsV1": ["retro"]}, "2026-09-15T11:00:00Z")
        self.assertEqual(set(merged["waypointCustomSkinsV1"]), {"neon", "retro"})

    def test_unlocked_themes_union(self):
        gs.sync({"unlockedThemes": ["dark"]}, "2026-09-15T10:00:00Z")
        self.assertIn("gold", gs.sync({"unlockedThemes": ["gold"]}, "2026-09-15T11:00:00Z")["unlockedThemes"])

    def test_union_rule_does_not_wipe_a_non_list_value(self):
        """A union key holding an object used to merge to [] and destroy the value."""
        gs.sync({"hardwareStageClears": {"stage1": True}}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"hardwareStageClears": {"stage2": True}}, "2026-09-15T11:00:00Z")
        self.assertIsInstance(merged["hardwareStageClears"], dict)
        self.assertTrue(merged["hardwareStageClears"])

    def test_union_rule_survives_one_side_being_a_list(self):
        gs.sync({"seenUnlocks": ["a", "b"]}, "2026-09-15T10:00:00Z")
        merged = gs.sync({"seenUnlocks": "not-a-list"}, "2026-09-15T11:00:00Z")
        self.assertEqual(merged["seenUnlocks"], ["a", "b"])

    def test_markdown_has_a_loot_section(self):
        gs.sync({"waypointLootStateV1": {"boxes": 1}, "waypointAchievementsV1": ["x"]},
                "2026-09-15T10:00:00Z")
        text = gs.MARKDOWN_FILE.read_text(encoding="utf-8")
        self.assertIn("## Loot", text)


class ResetTests(unittest.TestCase):
    """A reset must beat the merge rules.

    Counters combine with MAX, so a browser still holding the old figure would restore it on
    its next sync and the reset would look like it never happened.
    """

    def setUp(self):
        data = Path(tempfile.mkdtemp())
        gs.STATE_FILE = data / "game_state.json"
        gs.MARKDOWN_FILE = data / "GAME_STATE.md"

    def test_reset_clears_the_named_keys(self):
        gs.sync({"waypointCoinHighWater": 32520, "gameGems": 6, "arcadeTrophies": 4},
                "2026-09-20T10:00:00Z")
        gs.reset(["waypointCoinHighWater", "gameGems"])
        values = gs.current()
        self.assertNotIn("waypointCoinHighWater", values)
        self.assertNotIn("gameGems", values)
        self.assertEqual(values.get("arcadeTrophies"), 4, "untouched keys must survive")

    def test_previous_values_are_recorded(self):
        gs.sync({"waypointCoinHighWater": 32520}, "2026-09-20T10:00:00Z")
        out = gs.reset(["waypointCoinHighWater"], note="unfairly obtained")
        self.assertEqual(out["previous"]["waypointCoinHighWater"], 32520)

    def test_a_stale_client_cannot_restore_a_reset_counter(self):
        gs.sync({"waypointCoinHighWater": 32520}, "2026-09-20T10:00:00Z")
        gs.reset(["waypointCoinHighWater"])
        merged = gs.sync({"waypointCoinHighWater": 32520}, "2026-09-20T10:00:00Z")
        self.assertNotIn("waypointCoinHighWater", merged,
                         "the pre-reset value came back, so the reset did nothing")

    def test_earning_again_after_the_reset_counts(self):
        gs.sync({"waypointCoinHighWater": 32520}, "2026-09-20T10:00:00Z")
        gs.reset(["waypointCoinHighWater"])
        merged = gs.sync({"waypointCoinHighWater": 40}, "2099-01-01T00:00:00Z")
        self.assertEqual(merged["waypointCoinHighWater"], 40)

    def test_reset_info_tells_the_client_what_to_clear(self):
        gs.sync({"gameGems": 6}, "2026-09-20T10:00:00Z")
        gs.reset(["gameGems"])
        info = gs.reset_info()
        self.assertIn("gameGems", info["resetKeys"])
        self.assertTrue(info["resetEpoch"])

    def test_unknown_keys_are_not_resettable(self):
        out = gs.reset(["somethingElse"])
        self.assertEqual(out["cleared"], [])


if __name__ == "__main__":
    unittest.main()
