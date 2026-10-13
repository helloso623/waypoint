"""Personal content must not live in the shareable git checkout.

Daily notes, goals and the planning spreadsheet were tracked in git, so handing someone the
repo handed them a journal. They belong in WAYPOINT_DATA_DIR next to the database.

The migration runs on every startup, so the two properties that matter are that it is
idempotent and that it never overwrites a live copy with a stale checked-out one.
"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PLAN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PLAN))

import personal_data


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.repo = Path(tempfile.mkdtemp()) / "plan"
        self.repo.mkdir(parents=True)
        self.data = Path(tempfile.mkdtemp()) / "data"
        personal_data._PLAN_DIR = self.repo
        os.environ["WAYPOINT_DATA_DIR"] = str(self.data)
        os.environ.pop("OBSIDIAN_VAULT_PATH", None)

    def _make_vault(self, text="# private journal"):
        vault = self.repo / "obsidian_vault"
        (vault / "Daily").mkdir(parents=True)
        (vault / "Daily" / "2026-01-01.md").write_text(text, encoding="utf-8")
        return vault

    def test_vault_moves_out_of_the_checkout(self):
        self._make_vault()
        personal_data.migrate()
        self.assertFalse((self.repo / "obsidian_vault").exists(), "still in the repo")
        moved = self.data / "obsidian_vault" / "Daily" / "2026-01-01.md"
        self.assertTrue(moved.exists())
        self.assertEqual(moved.read_text(encoding="utf-8"), "# private journal")

    def test_spreadsheet_moves_too(self):
        (self.repo / "MASTER_planning_v3.xlsx").write_bytes(b"xlsx bytes")
        personal_data.migrate()
        self.assertFalse((self.repo / "MASTER_planning_v3.xlsx").exists())
        self.assertEqual((self.data / "MASTER_planning_v3.xlsx").read_bytes(), b"xlsx bytes")

    def test_running_twice_is_harmless(self):
        self._make_vault()
        personal_data.migrate()
        self.assertEqual(personal_data.migrate(), [], "second run should find nothing to do")

    def test_a_live_copy_is_never_overwritten(self):
        """A fresh clone brings its own obsidian_vault back; it must not clobber the real one."""
        (self.data / "obsidian_vault" / "Daily").mkdir(parents=True)
        live = self.data / "obsidian_vault" / "Daily" / "2026-01-01.md"
        live.write_text("the real notes", encoding="utf-8")
        self._make_vault("stale checkout copy")
        report = personal_data.migrate()
        self.assertEqual(live.read_text(encoding="utf-8"), "the real notes")
        self.assertTrue(any("already in the data dir" in line for line in report))

    def test_vault_path_prefers_an_explicit_setting(self):
        os.environ["OBSIDIAN_VAULT_PATH"] = str(Path(tempfile.mkdtemp()) / "elsewhere")
        try:
            self.assertEqual(personal_data.vault_path().name, "elsewhere")
        finally:
            os.environ.pop("OBSIDIAN_VAULT_PATH", None)

    def test_vault_path_defaults_into_the_data_dir(self):
        self.assertEqual(personal_data.vault_path(), self.data / "obsidian_vault")


class RepoHygieneTests(unittest.TestCase):
    """The real repo must not track personal content."""

    def test_no_personal_paths_are_tracked(self):
        proc = subprocess.run(
            ["git", "ls-files"], cwd=str(PLAN.parent),
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if proc.returncode != 0:
            self.skipTest("not a git checkout")
        tracked = proc.stdout.splitlines()
        bad = [f for f in tracked if "obsidian_vault" in f or f.endswith(".xlsx")]
        self.assertEqual(bad, [], "personal content is tracked in git:\n  " + "\n  ".join(bad))


if __name__ == "__main__":
    unittest.main()
