"""Tests for Napkin -> git persistence.

The two properties that matter here are both destructive if they regress: entries must survive
a sync from the other device (union, not overwrite), and the auto-commit must never carry a
file the user did not intend to commit.
"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("WAYPOINT_DATA_DIR", tempfile.mkdtemp())
os.environ["NAPKIN_AUTO_COMMIT"] = "false"

import napkin_sync as ns


def _entry(entry_id, title, created):
    return {"id": entry_id, "title": title, "details": "", "createdAt": created}


class MergeTests(unittest.TestCase):
    def setUp(self):
        data = Path(tempfile.mkdtemp())
        ns.STATE_FILE = data / "napkin_state.json"
        ns.MARKDOWN_FILE = data / "NAPKIN.md"
        ns.ISSUES_FILE = data / "ISSUES.md"

    def test_second_device_does_not_wipe_the_first(self):
        """Both devices post their whole local list; overwriting would lose one side."""
        ns.sync([_entry("a", "from laptop", "2026-09-08T10:00:00Z")])
        merged = ns.sync([_entry("b", "from phone", "2026-09-08T11:00:00Z")])
        self.assertEqual({e["id"] for e in merged}, {"a", "b"})

    def test_newest_first(self):
        merged = ns.sync([
            _entry("old", "older", "2026-09-01T10:00:00Z"),
            _entry("new", "newer", "2026-09-08T10:00:00Z"),
        ])
        self.assertEqual([e["id"] for e in merged], ["new", "old"])

    def test_deletion_is_a_tombstone_not_an_absence(self):
        """Union-merge means a deleted note returns unless the deletion is recorded."""
        ns.sync([_entry("a", "x", "2026-09-08T10:00:00Z")])
        ns.sync([], ["a"])
        merged = ns.sync([_entry("a", "x", "2026-09-08T10:00:00Z")])  # other device re-posts it
        self.assertEqual(merged, [])

    def test_markdown_reflects_current_entries(self):
        ns.sync([_entry("a", "Fix the thing", "2026-09-08T10:00:00Z")])
        text = ns.MARKDOWN_FILE.read_text(encoding="utf-8")
        self.assertIn("# Napkin", text)
        self.assertIn("Fix the thing", text)
        ns.sync([], ["a"])
        self.assertNotIn("Fix the thing", ns.MARKDOWN_FILE.read_text(encoding="utf-8"))

    def test_empty_title_becomes_first_line_of_details(self):
        merged = ns.sync([{
            "id": "t",
            "title": "",
            "details": "Fix the send button\nmore context",
            "createdAt": "2026-09-15T10:00:00Z",
        }])
        self.assertEqual(merged[0]["title"], "Fix the send button")

    def test_accept_is_preserved_across_device_sync(self):
        ns.sync([_entry("a", "queue me", "2026-09-15T10:00:00Z")])
        ns.accept_entries([{"id": "a"}])
        merged = ns.sync([_entry("a", "queue me", "2026-09-15T10:00:00Z")])
        self.assertTrue(merged[0].get("accepted"))
        self.assertIn("accepted", ns.MARKDOWN_FILE.read_text(encoding="utf-8"))

    def test_compile_writes_accepted_notes_to_issues(self):
        ns.sync([_entry("a", "queue me", "2026-09-15T10:00:00Z")])
        ns.accept_entries([{"id": "a", "title": "queue me", "details": "do it"}])
        result = ns.compile_work_queue()
        self.assertTrue(result["ok"])
        self.assertEqual(result["accepted"], 1)
        text = ns.ISSUES_FILE.read_text(encoding="utf-8")
        self.assertIn("# Work queue", text)
        self.assertIn("queue me", text)
        self.assertIn("Open napkin", text)

    def test_compile_includes_open_notes_not_just_accepted(self):
        ns.sync([
            _entry("a", "accepted note", "2026-09-15T10:00:00Z"),
            _entry("b", "still open", "2026-09-15T11:00:00Z"),
        ])
        ns.accept_entries([{"id": "a", "title": "accepted note"}])
        result = ns.compile_work_queue()
        self.assertEqual(result["accepted"], 1)
        self.assertEqual(result["open"], 1)
        self.assertEqual(result["all"], 2)
        text = ns.ISSUES_FILE.read_text(encoding="utf-8")
        self.assertIn("still open", text)
        self.assertIn("accepted note", text)


class CommitScopeTests(unittest.TestCase):
    def setUp(self):
        self.repo = Path(tempfile.mkdtemp()) / "repo"
        (self.repo / "plan").mkdir(parents=True)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "t@example.com")
        self._git("config", "user.name", "t")
        (self.repo / "plan" / "other.py").write_text("original\n")
        self._git("add", "-A")
        self._git("commit", "-qm", "base")
        ns._REPO_DIR = self.repo
        ns.MARKDOWN_FILE = self.repo / "plan" / "NAPKIN.md"
        ns.ISSUES_FILE = self.repo / "plan" / "ISSUES.md"
        ns.AUTO_PUSH = False
        # conftest turns commits off for the whole suite so tests can never touch the real
        # repo. These tests are about commit scope and run in the throwaway repo above, so
        # they opt back in explicitly.
        self._auto_commit_was = ns.AUTO_COMMIT
        ns.AUTO_COMMIT = True

    def tearDown(self):
        ns.AUTO_COMMIT = self._auto_commit_was

    def _git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, capture_output=True, text=True)

    def test_commit_carries_only_the_napkin_file(self):
        ns.MARKDOWN_FILE.write_text("# Napkin\n\nnote\n", encoding="utf-8")
        (self.repo / "plan" / "other.py").write_text("unrelated edit\n")
        ns.commit_and_push()
        changed = self._git("show", "--name-only", "--format=", "HEAD").stdout.split()
        self.assertEqual(changed, ["plan/NAPKIN.md"])
        self.assertIn("other.py", self._git("status", "--short").stdout)

    def test_compile_commit_carries_napkin_and_issues_only(self):
        ns.STATE_FILE = Path(tempfile.mkdtemp()) / "state.json"
        ns.sync([_entry("a", "ship it", "2026-09-15T10:00:00Z")])
        ns.accept_entries([{"id": "a", "title": "ship it"}])
        ns.compile_work_queue()
        (self.repo / "plan" / "other.py").write_text("unrelated edit\n")
        ns.commit_and_push()
        changed = set(self._git("show", "--name-only", "--format=", "HEAD").stdout.split())
        self.assertEqual(changed, {"plan/NAPKIN.md", "plan/ISSUES.md"})
        self.assertIn("other.py", self._git("status", "--short").stdout)

    def test_no_change_is_a_noop(self):
        ns.MARKDOWN_FILE.write_text("# Napkin\n", encoding="utf-8")
        ns.commit_and_push()
        before = self._git("rev-parse", "HEAD").stdout
        self.assertEqual(ns.commit_and_push().get("reason"), "no change")
        self.assertEqual(before, self._git("rev-parse", "HEAD").stdout)

    def test_refuses_to_commit_mid_merge(self):
        (self.repo / ".git" / "MERGE_HEAD").write_text("deadbeef\n")
        ns.MARKDOWN_FILE.write_text("# Napkin\n\nnote\n", encoding="utf-8")
        result = ns.commit_and_push()
        self.assertFalse(result["ok"])
        self.assertIn("in progress", result["reason"])

    def test_refuses_lossy_napkin_commit(self):
        headings = "\n".join(f"## note {i}\n\nbody\n" for i in range(12))
        ns.MARKDOWN_FILE.write_text("# Napkin\n\n" + headings, encoding="utf-8")
        ns.commit_and_push()
        ns.MARKDOWN_FILE.write_text("# Napkin\n\n## agent-bug-1\n\nBroken send button\n", encoding="utf-8")
        result = ns.commit_and_push()
        self.assertFalse(result["ok"])
        self.assertIn("clobber", result["reason"])
        text = self._git("show", "HEAD:plan/NAPKIN.md").stdout
        self.assertIn("note 0", text)
        self.assertNotIn("Broken send button", text)


class DeferredCommitTests(unittest.TestCase):
    """Notes pinned just before the app closes must still reach git.

    The debounce runs on a daemon timer, so closing the app inside that window kills the
    pending commit outright -- the note would sit on disk, correct but unversioned, forever.
    """

    def setUp(self):
        self.repo = Path(tempfile.mkdtemp()) / "repo"
        (self.repo / "plan").mkdir(parents=True)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "t@example.com")
        self._git("config", "user.name", "t")
        (self.repo / "plan" / "keep.txt").write_text("base\n")
        self._git("add", "-A")
        self._git("commit", "-qm", "base")
        ns._REPO_DIR = self.repo
        ns.MARKDOWN_FILE = self.repo / "plan" / "NAPKIN.md"
        ns.ISSUES_FILE = self.repo / "plan" / "ISSUES.md"
        ns.STATE_FILE = Path(tempfile.mkdtemp()) / "state.json"
        ns.AUTO_PUSH = False
        ns.AUTO_COMMIT = True

    def tearDown(self):
        ns.COMMIT_MODE = "live"
        ns.AUTO_COMMIT = False

    def _git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")

    def _commits(self):
        return int(self._git("rev-list", "--count", "HEAD").stdout.strip())

    def test_exit_mode_does_not_commit_while_running(self):
        ns.COMMIT_MODE = "exit"
        before = self._commits()
        ns.sync([_entry("a", "note", "2026-09-08T10:00:00Z")])
        self.assertTrue(ns.MARKDOWN_FILE.exists(), "the note must still hit disk immediately")
        self.assertEqual(self._commits(), before, "exit mode must not commit mid-session")
        self.assertIsNone(ns._timer, "exit mode must not schedule a debounce timer")

    def test_exit_flush_commits_what_the_session_pinned(self):
        ns.COMMIT_MODE = "exit"
        ns.sync([_entry("a", "note", "2026-09-08T10:00:00Z")])
        before = self._commits()
        ns._flush_on_exit()
        self.assertEqual(self._commits(), before + 1)

    def test_startup_drains_a_session_that_was_killed(self):
        """No exit handler ran at all -- the next launch has to notice and commit."""
        ns.COMMIT_MODE = "exit"
        ns.sync([_entry("b", "pinned then killed", "2026-09-08T11:00:00Z")])
        self.assertTrue(ns.has_uncommitted_changes())
        before = self._commits()
        ns.startup_sync()
        self.assertEqual(self._commits(), before + 1)
        self.assertFalse(ns.has_uncommitted_changes())

    def test_startup_with_nothing_pending_makes_no_commit(self):
        ns.MARKDOWN_FILE.write_text("# Napkin\n", encoding="utf-8")
        ns.commit_and_push()
        before = self._commits()
        self.assertEqual(ns.startup_sync().get("reason"), "nothing pending")
        self.assertEqual(self._commits(), before)

    def test_shutdown_compile_writes_issues_and_commits(self):
        ns.COMMIT_MODE = "exit"
        ns.sync([_entry("a", "note", "2026-09-08T10:00:00Z")])
        ns.accept_entries([{"id": "a", "title": "note"}])
        before = self._commits()
        ns.shutdown_compile()
        self.assertTrue(ns.ISSUES_FILE.exists())
        self.assertIn("note", ns.ISSUES_FILE.read_text(encoding="utf-8"))
        self.assertGreater(self._commits(), before)


if __name__ == "__main__":
    unittest.main()
