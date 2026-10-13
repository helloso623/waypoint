"""Accepting a quest must survive logging in again.

The JS half lives in quest_persistence_check.js, which loads the real functions out of
static/js/misc.js instead of reimplementing them, so this cannot pass while the shipped code
is broken.
"""
import os
import shutil
import subprocess
import unittest
from pathlib import Path

CHECK = Path(__file__).resolve().parent / "quest_persistence_check.js"
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class QuestPersistenceTests(unittest.TestCase):
    def test_accepted_quests_survive_a_second_login(self):
        proc = subprocess.run(
            [NODE, str(CHECK)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        self.assertEqual(
            proc.returncode, 0,
            "quest acceptance regressed:\n" + (proc.stderr or proc.stdout or "").strip(),
        )


if __name__ == "__main__":
    unittest.main()
