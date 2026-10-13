"""Behavioural tests for the loot state merge.

The bug these exist to prevent: `chests` was unioned along with `claims`, `unlocks` and
`unlockedSkins`. A union can only ever grow, so every cache ever granted stayed in the server's
list forever. Opening one removed it in the browser, the browser posted its shorter list, and
the union put it straight back -- so caches piled up and logging in handed back the cumulative
total of every crate ever earned.

`chests` is a consumable queue. The other three are permanent collections. That difference is
the whole point of this file.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("WAYPOINT_DATA_DIR", tempfile.mkdtemp())
os.environ["NAPKIN_AUTO_COMMIT"] = "false"

import db  # noqa: E402
import napkin_remaining as nr  # noqa: E402


def chest(cid, rarity="common"):
    return {"id": cid, "rarity": rarity, "taps": 3}


class ChestQueueTests(unittest.TestCase):
    def setUp(self):
        db.init_db()
        nr.save_loot_state({})

    def test_opening_a_chest_removes_it_for_good(self):
        """The regression itself: open one, sync, and it must not come back."""
        nr.merge_loot_state({"chests": [chest("a"), chest("b")]})
        merged = nr.merge_loot_state({"chests": [chest("b")]})
        self.assertEqual([c["id"] for c in merged["chests"]], ["b"])

    def test_opening_the_last_chest_empties_the_queue(self):
        nr.merge_loot_state({"chests": [chest("a")]})
        merged = nr.merge_loot_state({"chests": []})
        self.assertEqual(merged["chests"], [],
                         "an emptied queue came back populated, so crates stack up forever")

    def test_logging_in_does_not_re_award_past_chests(self):
        """Grant, open, then post the empty queue twice as a fresh session would."""
        nr.merge_loot_state({"chests": [chest("a"), chest("b"), chest("c")]})
        nr.merge_loot_state({"chests": []})
        merged = nr.merge_loot_state({"chests": []})
        self.assertEqual(merged["chests"], [])

    def test_a_newly_granted_chest_still_arrives(self):
        nr.merge_loot_state({"chests": []})
        merged = nr.merge_loot_state({"chests": [chest("new")]})
        self.assertEqual([c["id"] for c in merged["chests"]], ["new"])

    def test_a_post_without_chests_leaves_the_queue_alone(self):
        """A partial post (e.g. gems only) must not silently wipe pending caches."""
        nr.merge_loot_state({"chests": [chest("a")]})
        merged = nr.merge_loot_state({"unlocks": ["something"]})
        self.assertEqual([c["id"] for c in merged["chests"]], ["a"])


class PermanentCollectionTests(unittest.TestCase):
    """These genuinely are permanent: earning on one device must not lose them on another."""

    def setUp(self):
        db.init_db()
        nr.save_loot_state({})

    def test_skins_earned_anywhere_stay_owned(self):
        nr.merge_loot_state({"unlockedSkins": ["trailblazer", "forest"]})
        merged = nr.merge_loot_state({"unlockedSkins": ["trailblazer", "solar"]})
        self.assertEqual(set(merged["unlockedSkins"]), {"trailblazer", "forest", "solar"})

    def test_road_claims_are_never_lost(self):
        nr.merge_loot_state({"claims": ["road-25"]})
        merged = nr.merge_loot_state({"claims": ["road-75"]})
        self.assertEqual(set(merged["claims"]), {"road-25", "road-75"})

    def test_a_claim_cannot_be_taken_twice(self):
        nr.merge_loot_state({"claims": ["road-25"]})
        merged = nr.merge_loot_state({"claims": ["road-25"]})
        self.assertEqual(merged["claims"], ["road-25"])


class ResetTests(unittest.TestCase):
    def setUp(self):
        db.init_db()
        nr.save_loot_state({})

    def test_a_client_that_has_not_acked_a_reset_cannot_undo_it(self):
        nr.merge_loot_state({"chests": [chest("a")], "unlockedSkins": ["forest"]})
        nr.reset_loot_state("test")
        merged = nr.merge_loot_state({"chests": [chest("a")], "unlockedSkins": ["forest"]})
        self.assertNotIn("forest", merged.get("unlockedSkins") or [],
                         "a stale client restored skins the reset had cleared")


if __name__ == "__main__":
    unittest.main()
