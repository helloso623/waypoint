"""Harness: auto writes, thinking, trustworthy task create, napkin accept/compile."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class HarnessSourceTests(unittest.TestCase):
    def test_companion_normal_route_is_auto(self):
        import companion_memory as cm

        self.assertEqual(cm.tool_policy_for_route("normal"), cm.TOOL_POLICY_AUTO)
        self.assertEqual(cm.tool_policy_for_route("strong"), cm.TOOL_POLICY_AUTO)
        self.assertEqual(cm.tool_policy_for_route("fast"), cm.TOOL_POLICY_NONE)

    def test_desktop_compiles_napkin_on_quit(self):
        src = (ROOT / "desktop.py").read_text(encoding="utf-8")
        self.assertIn("napkin_sync.shutdown_compile()", src)

    def test_prompt_tells_model_not_to_invent_dates_or_counts(self):
        import agent

        self.assertIn("batch_add_tasks once", agent.HOW_TO_WORK)
        self.assertIn("treat a row `id` as a count", agent.HOW_TO_WORK)
        self.assertIn("omit due_date unless the user named a date", agent.HOW_TO_WORK)
        self.assertIn("plan/ISSUES.md", agent.HOW_TO_WORK)
        self.assertIn("Never invent a clock time", agent.HOW_TO_WORK)
        names = [t["name"] for t in agent.TOOLS]
        self.assertIn("read_napkin", names)
        self.assertIn("preview_schedule_import", names)
        self.assertEqual(agent._project_rel_path("plan/NAPKIN.md"), "NAPKIN.md")
        self.assertEqual(agent._project_rel_path("NAPKIN.md"), "NAPKIN.md")


class TaskWriteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PLANNER_DB_PATH"] = str(Path(self.tmp.name) / "test.db")
        os.environ["WAYPOINT_DATA_DIR"] = self.tmp.name
        import importlib
        import db
        import agent

        importlib.reload(db)
        db.init_db()
        importlib.reload(agent)
        self.db = db
        self.agent = agent

    def tearDown(self):
        self.tmp.cleanup()

    def test_add_task_does_not_invent_a_due_date(self):
        result = self.agent._execute_tool("add_task", {"title": "ZZTEST no due"}, tool_policy="auto")
        self.assertTrue(result.get("ok"))
        task = result["task"]
        self.assertIsNone(task.get("due_date"))
        self.assertTrue(task.get("deadline_dismissed"))

    def test_batch_add_tasks_skips_duplicates_and_returns_counts(self):
        first = self.agent._execute_tool(
            "batch_add_tasks",
            {"tasks": [{"title": "ZZTEST buy milk"}, {"title": "ZZTEST buy milk"}, {"title": "ZZTEST eggs"}]},
            tool_policy="auto",
        )
        self.assertEqual(first["count"], 2)
        self.assertEqual(len(first["skipped"]), 1)
        again = self.agent._execute_tool(
            "batch_add_tasks",
            {"tasks": [{"title": "ZZTEST buy milk"}, {"title": "ZZTEST bread"}]},
            tool_policy="auto",
        )
        self.assertEqual(again["count"], 1)
        self.assertEqual(len(again["skipped"]), 1)
        titles = {t["title"] for t in self.db.list_tasks()}
        self.assertEqual(titles, {"ZZTEST buy milk", "ZZTEST eggs", "ZZTEST bread"})

    def test_normal_policy_adds_a_task_without_confirm(self):
        result = self.agent._execute_tool("add_task", {"title": "ZZTEST auto write"}, tool_policy="auto")
        self.assertFalse(result.get("needs_confirmation"))
        self.assertEqual(len(self.db.list_tasks()), 1)

    def test_confirm_policy_still_stages_add_contact(self):
        staged = self.agent._execute_tool(
            "add_contact",
            {"name": "ZZTEST Staged"},
            tool_policy="confirm",
        )
        self.assertTrue(staged.get("needs_confirmation"))
        self.assertEqual(len(self.db.list_contacts()), 0)

    def test_confirm_reply_names_the_saved_task(self):
        result = self.agent._execute_tool("add_task", {"title": "ZZTEST named"}, tool_policy="auto")
        reply = self.agent._confirm_tool_reply("add_task", result)
        self.assertIn("ZZTEST named", reply)
        self.assertIn("Done", reply)

    def test_duplicate_calendar_event_asks_to_confirm(self):
        first = self.agent._execute_tool(
            "add_calendar_event",
            {"title": "ZZTEST standup", "date": "2099-01-02", "start_time": "09:00"},
            tool_policy="auto",
        )
        self.assertTrue(first.get("ok"))
        second = self.agent._execute_tool(
            "add_calendar_event",
            {"title": "ZZTEST standup", "date": "2099-01-02", "start_time": "09:00"},
            tool_policy="auto",
        )
        self.assertTrue(second.get("needs_confirmation"))
        self.assertEqual(len(self.db.list_calendar_events(start="2099-01-02", end="2099-01-02")), 1)

    def test_fact_check_flags_id_used_as_a_count(self):
        actions = [{
            "tool": "add_contact",
            "result": {"ok": True, "contact": {"id": 47, "name": "Ada"}},
        }]
        issues = self.agent._deterministic_fact_issues("Added 47 contacts.", actions)
        self.assertTrue(any("row id" in issue for issue in issues))
        ok_issues = self.agent._deterministic_fact_issues("Added 1 contact: Ada.", actions)
        self.assertFalse(any("row id" in issue for issue in ok_issues))

    def test_add_calendar_event_does_not_invent_a_clock_time(self):
        result = self.agent._execute_tool(
            "add_calendar_event",
            {"title": "ZZTEST untimed hang", "date": "2099-03-03"},
            tool_policy="auto",
        )
        self.assertTrue(result.get("ok"))
        event = result["event"]
        self.assertTrue(event.get("id"))
        self.assertFalse(event.get("start_time"))

    def test_recurring_event_refuses_invented_times(self):
        result = self.agent._execute_tool(
            "add_recurring_event",
            {"title": "ZZTEST series", "start_date": "2099-03-03"},
            tool_policy="auto",
        )
        self.assertIn("invent", (result.get("error") or "").lower())
        self.assertFalse(result.get("ok"))

    def test_schedule_import_previews_then_applies_with_ids(self):
        preview = self.agent._execute_tool(
            "preview_schedule_import",
            {"text": "Mon 09:00-10:30 ZZTEST Calc\nWed 09:00-10:30 ZZTEST Calc", "end_date": "2099-05-01"},
            tool_policy="auto",
        )
        self.assertTrue(preview.get("needs_confirmation") or preview.get("preview"))
        self.assertEqual(preview.get("count"), 2)
        self.assertFalse(preview.get("ids"))
        reply = self.agent._confirm_tool_reply("preview_schedule_import", preview)
        self.assertIn("nothing was added", reply.lower())
        applied = self.agent._execute_tool(
            "preview_schedule_import",
            {"classes": preview["classes"], "confirmed": True},
            tool_policy="auto",
        )
        self.assertTrue(applied.get("ok"))
        self.assertEqual(applied.get("count"), 2)
        self.assertEqual(len(applied.get("ids") or []), 2)
        done = self.agent._confirm_tool_reply("preview_schedule_import", applied)
        self.assertIn("id", done.lower())
        self.assertNotIn("Nothing was saved", done)
        again = self.agent._execute_tool(
            "import_course_schedule",
            {"classes": preview["classes"], "confirmed": True},
            tool_policy="auto",
        )
        self.assertEqual(again.get("count"), 0)
        self.assertTrue(again.get("skipped"))

    def test_confirm_contact_reply_requires_real_id(self):
        saved = self.agent._execute_tool("add_contact", {"name": "ZZTEST Ada"}, tool_policy="auto")
        reply = self.agent._confirm_tool_reply("add_contact", saved)
        self.assertIn("id", reply)
        self.assertIn("ZZTEST Ada", reply)
        empty = self.agent._confirm_tool_reply("add_contact", {"ok": True, "contact": {"name": "Nope"}})
        self.assertIn("Nothing was saved", empty)

    def test_web_search_disabled_without_keys(self):
        for name in ("BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY", "SERPAPI_KEY", "SERPAPI_API_KEY"):
            os.environ.pop(name, None)
        result = self.agent._execute_tool("web_search", {"query": "waypoint"}, tool_policy="auto")
        self.assertTrue(result.get("disabled") or result.get("error"))
        self.assertFalse(result.get("ok"))


class NapkinReadTests(unittest.TestCase):
    def test_read_napkin_returns_real_notes(self):
        import agent

        result = agent._execute_tool("read_napkin", {"which": "napkin", "max_chars": 4000})
        self.assertTrue(result.get("ok"))
        self.assertIn("NAPKIN.md", result.get("files") or [])
        body = (result.get("text") or result.get("content") or "")
        self.assertIn("Napkin", body)

    def test_read_napkin_query_keeps_matching_notes(self):
        import agent

        result = agent._execute_tool(
            "read_napkin", {"which": "napkin", "query": "napkin", "max_chars": 8000}
        )
        self.assertTrue(result.get("ok"))
        body = (result.get("text") or result.get("content") or "")
        self.assertTrue(body)
        self.assertIn("napkin", body.lower())


class NapkinAcceptApiTests(unittest.TestCase):
    def test_accept_and_compile_endpoints(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os
from pathlib import Path
import napkin_sync as ns
from app import app

data = Path(os.environ["WAYPOINT_DATA_DIR"])
ns.STATE_FILE = data / "napkin_state.json"
ns.MARKDOWN_FILE = data / "NAPKIN.md"
ns.ISSUES_FILE = data / "ISSUES.md"
ns.AUTO_COMMIT = False
client = app.test_client()
synced = client.post("/api/napkin/sync", json={
    "entries": [{"id": "n1", "title": "", "details": "Fix harness writes", "createdAt": "2026-09-15T10:00:00Z"}],
    "deleted": [],
})
accepted = client.post("/api/napkin/accept", json={"id": "n1", "details": "Fix harness writes", "flush": False})
compiled = client.post("/api/napkin/compile", json={"flush": False})
print(json.dumps({
    "sync": synced.status_code,
    "title": (synced.get_json() or {}).get("entries", [{}])[0].get("title"),
    "accept": accepted.status_code,
    "accepted_flag": (accepted.get_json() or {}).get("entries", [{}])[0].get("accepted"),
    "compile": compiled.status_code,
    "issues_has_note": "Fix harness writes" in ns.ISSUES_FILE.read_text(encoding="utf-8"),
}))
"""
            env = dict(os.environ)
            env["WAYPOINT_DATA_DIR"] = tmp
            env["PLANNER_DB_PATH"] = str(Path(tmp) / "planner.db")
            env["NAPKIN_AUTO_COMMIT"] = "false"
            import subprocess
            proc = subprocess.run(
                [sys.executable, "-c", script],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["sync"], 200)
            self.assertEqual(payload["title"], "Fix harness writes")
            self.assertEqual(payload["accept"], 200)
            self.assertTrue(payload["accepted_flag"])
            self.assertEqual(payload["compile"], 200)
            self.assertTrue(payload["issues_has_note"])


if __name__ == "__main__":
    unittest.main()
