"""Orchestra I: additive instance sync, bind host, Settings Push/Pull."""
from __future__ import annotations

import ast
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_TMP = tempfile.mkdtemp()
os.environ["WAYPOINT_DATA_DIR"] = _TMP
os.environ["PLANNER_DB_PATH"] = str(Path(_TMP) / "planner.db")
os.environ["NAPKIN_AUTO_COMMIT"] = "false"
os.environ.pop("WAYPOINT_TAILSCALE", None)

sys.path.insert(0, str(ROOT))


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraISourceTests(unittest.TestCase):
    def test_settings_js_has_push_pull_and_server_toggle(self):
        js = source("static/js/settings.js")
        self.assertIn("Push snapshot", js)
        self.assertIn("Pull snapshot", js)
        self.assertIn("This machine is the server", js)
        self.assertIn("settingsSafeBindHost", js)
        self.assertIn("Last sync", js)
        self.assertIn("/api/sync/push", js)
        self.assertIn("/api/sync/pull", js)

    def test_napkin_issues_has_no_wildcard_fallback_string(self):
        src = source("napkin_issues.py")
        self.assertNotIn("0.0.0.0", src)
        self.assertIn('return "127.0.0.1"', src)
        self.assertIn("union_rows_by_id", src)
        self.assertIn("last_seen", src)

    def test_python_parses(self):
        ast.parse(source("napkin_issues.py"))


class OrchestraISyncMergeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import db
        db.init_db()

    def test_union_by_id_is_additive_and_keeps_first(self):
        import napkin_issues
        local = [{"id": 1, "title": "keep me"}, {"id": 2, "title": "also local"}]
        incoming = [{"id": 1, "title": "would clobber"}, {"id": 3, "title": "new from peer"}]
        merged = napkin_issues.union_rows_by_id(local, incoming)
        by_id = {row["id"]: row["title"] for row in merged}
        self.assertEqual(by_id[1], "keep me")
        self.assertEqual(by_id[2], "also local")
        self.assertEqual(by_id[3], "new from peer")
        self.assertEqual(set(by_id), {1, 2, 3})

    def test_apply_sync_snapshot_never_wipes_local_rows(self):
        import db
        import napkin_issues
        local_id = db.insert_task("Orchestra I local keep")
        before_titles = {task.get("title") for task in db.list_tasks()}
        before_count = len(before_titles)
        result = napkin_issues.apply_sync_snapshot(
            {
                "kind": "planner-bundle",
                "tasks": [
                    {"id": local_id, "title": "would clobber local"},
                    {"id": 900001, "title": "Orchestra I incoming peer"},
                ],
                "calendar": [
                    {"id": 900011, "title": "Orchestra I incoming cal", "date": "2026-12-02", "start_time": "13:00"},
                ],
                "events": [
                    {"id": 900021, "title": "Orchestra I incoming event", "date": "2026-12-03"},
                ],
                "napkins": [
                    {
                        "id": "orch-i-note",
                        "title": "Orchestra I napkin",
                        "details": "union by id",
                        "createdAt": "2026-09-20T00:00:00Z",
                    }
                ],
            },
            role="peer",
        )
        self.assertTrue(result.get("ok"))
        self.assertGreaterEqual(result.get("created_tasks", 0), 1)
        self.assertGreaterEqual(result.get("skipped", 0), 1)
        after = {task["id"]: task.get("title") for task in db.list_tasks()}
        self.assertEqual(after[local_id], "Orchestra I local keep")
        self.assertIn("Orchestra I incoming peer", after.values())
        self.assertGreaterEqual(len(after), before_count + 1)
        cal_titles = {row.get("title") for row in db.list_calendar_events()}
        self.assertIn("Orchestra I incoming cal", cal_titles)
        event_titles = {row.get("title") for row in db.list_events()}
        self.assertIn("Orchestra I incoming event", event_titles)
        napkin_ids = {str(row.get("id")) for row in napkin_issues._list_napkins()}
        self.assertIn("orch-i-note", napkin_ids)
        again = napkin_issues.apply_sync_snapshot(
            {
                "kind": "planner-bundle",
                "tasks": [{"id": local_id, "title": "would clobber local"}],
                "napkins": [{"id": "orch-i-note", "title": "Orchestra I napkin", "createdAt": "2026-09-20T00:00:00Z"}],
            },
            role="peer",
        )
        self.assertEqual(db.get_task(local_id).get("title"), "Orchestra I local keep")
        self.assertGreaterEqual(again.get("skipped", 0), 1)
        self.assertIn("orch-i-note", {str(row.get("id")) for row in napkin_issues._list_napkins()})

    def test_role_and_last_seen_survive_role_only_save(self):
        import napkin_issues
        pushed = napkin_issues.push_instance_sync(role="server")
        self.assertTrue(pushed.get("ok"))
        self.assertEqual(pushed.get("role"), "server")
        self.assertTrue(pushed.get("last_seen"))
        self.assertTrue(pushed.get("updated_at"))
        before = napkin_issues.load_sync_snapshot()
        self.assertTrue((before.get("payload") or {}).get("tasks") is not None)
        flipped = napkin_issues.set_sync_role("peer")
        self.assertEqual(flipped.get("role"), "peer")
        after = napkin_issues.load_sync_snapshot()
        self.assertEqual(after.get("role"), "peer")
        self.assertTrue(after.get("last_seen"))
        self.assertTrue((after.get("payload") or {}).get("kind") == "planner-bundle")
        self.assertIsInstance((after.get("payload") or {}).get("tasks"), list)

    def test_advertised_bind_host_never_wildcard(self):
        import napkin_issues
        from unittest import mock
        previous = os.environ.get("FLASK_HOST")
        fake_ts = mock.Mock()
        fake_ts.tailscale_ipv4.return_value = None
        try:
            os.environ["FLASK_HOST"] = "0.0.0.0"
            with mock.patch.dict(sys.modules, {"tailscale_net": fake_ts}):
                host = napkin_issues.advertised_bind_host()
            self.assertNotEqual(host, "0.0.0.0")
            self.assertEqual(host, "127.0.0.1")
            os.environ["FLASK_HOST"] = "100.64.1.8"
            self.assertEqual(napkin_issues.advertised_bind_host(), "100.64.1.8")
        finally:
            if previous is None:
                os.environ.pop("FLASK_HOST", None)
            else:
                os.environ["FLASK_HOST"] = previous


if __name__ == "__main__":
    unittest.main()
