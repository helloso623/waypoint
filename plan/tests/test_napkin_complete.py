"""Remaining napkin items: no auto-deadline, calendar conflicts, export, recovery, bind host."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = Path(os.environ.get("WAYPOINT_PYTHON") or ROOT.parent / ".venv" / "bin" / "python")
if not PYTHON.is_file():
    PYTHON = Path(sys.executable)


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class NapkinCompleteSourceTests(unittest.TestCase):
    def test_tools_and_ui_landed(self):
        agent = source("agent.py")
        self.assertIn('"name": "preview_bulk_import"', agent)
        self.assertIn('"name": "import_course_schedule"', agent)
        self.assertIn("end_date", agent)
        self.assertIn("created_by=\"ai\"", agent)
        app = source("app.py")
        self.assertIn('"/api/export/me"', app)
        self.assertIn('"/api/tasks/reorganise"', app)
        self.assertIn('"/api/tasks/rollover"', app)
        self.assertIn("127.0.0.1 (not 0.0.0.0)", app)
        self.assertIn("proc.poll()", app)
        self.assertIn(".doc", app)
        self.assertIn("napkin_complete.js", source("static/index.html"))
        self.assertIn("wp-boot-splash", source("static/js/napkin_complete.js"))
        self.assertIn("observationBoot", source("static/js/observation.js"))
        self.assertIn("wp-observe-hidden", source("static/css/app.css"))
        vbs = (ROOT.parent / "Waypoint.vbs").read_text(encoding="utf-8")
        self.assertIn("EXIT=%ERRORLEVEL%", vbs)
        self.assertIn("starting git pull --ff-only", vbs)
        self.assertIn("showVoiceReview", source("static/js/companion.js"))
        self.assertIn("task-reorganise", source("static/js/tasks.js"))
        self.assertIn("cal-day-nav", source("static/js/calendar.js"))
        self.assertIn("settings-export-me", source("static/js/settings.js"))
        self.assertIn("openTimeGame", source("static/js/napkin_complete.js"))
        self.assertIn("spawn_agent", source("agent.py"))
        self.assertIn("would_clobber_committed_napkin", source("napkin_sync.py"))
        self.assertIn("cal-hours-panel", source("static/js/calendar.js"))
        self.assertIn("estimate1", source("static/js/misc.js"))
        self.assertIn('"/api/ai/failures"', app)
        self.assertIn("settings-ai-failures", source("static/js/settings.js"))
        self.assertIn("loot-level-back", source("static/js/loot.js"))
        self.assertIn("scribble", source("static/js/misc.js"))
        self.assertIn("game-off", source("static/css/app.css"))

    def test_bind_host_never_falls_back_to_wildcard(self):
        app = source("app.py")
        self.assertNotIn('return "0.0.0.0"', app)
        self.assertIn("binding 127.0.0.1", app)


class NapkinCompleteRuntimeTests(unittest.TestCase):
    def test_insert_task_export_conflicts_and_personal_todos(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os
from pathlib import Path
import db
import napkin_complete
from app import app

db.init_db()
# To-dos are promoted from notes explicitly marked as tasks, not from a hardcoded list
# (real names must not live in a tracked source file), so seed one. `private` alone must
# NOT promote: it means "keep out of the shared napkin", and using it as the selector swept
# every personal note -- including long free-form brain dumps -- into the task list.
import napkin_sync
napkin_sync.sync([{"id": "zz-private", "title": "Water the plants", "private": True,
                   "task": True, "createdAt": "2026-01-01T00:00:00Z"},
                  {"id": "zz-note", "title": "ZZTEST just thinking out loud", "private": True,
                   "createdAt": "2026-01-01T00:00:00Z"}])
created = napkin_complete.ensure_personal_napkin_tasks()
task_id = db.insert_task("ZZTEST no due please", urgency="high")
task = db.get_task(task_id)
db.insert_calendar_event("Overlap A", "2099-06-01", "10:00", "11:00", None, None)
conflicts = napkin_complete.calendar_conflicts("2099-06-01", "10:30", "11:30", title="Other")
dups = napkin_complete.calendar_conflicts("2099-06-01", "10:00", "11:00", title="Overlap A")
parsed = napkin_complete.parse_bulk_lines("- Buy milk\n- Water the plants", "task")
classes = napkin_complete.parse_course_schedule("Mon 09:00-10:30 Calculus\nWed 09:00-10:30 Calculus", end_date="2099-12-15")
napkin_complete.save_recovery_snapshot("ui", {"agent": "hello"})
snaps = napkin_complete.list_recovery_snapshots()
export = napkin_complete.export_everything()
client = app.test_client()
about = client.get("/api/about").get_json()
empty_due = client.post("/api/tasks", json={"title": "ZZTEST api empty due", "urgency": "critical"}).get_json()
conflict = client.post("/api/calendar", json={
    "title": "Overlap B", "date": "2099-06-01", "start_time": "10:30", "end_time": "11:30",
})
forced = client.post("/api/calendar", json={
    "title": "Overlap B", "date": "2099-06-01", "start_time": "10:30", "end_time": "11:30", "force": True,
})
fail = client.post("/api/ai/failures", json={"kind": "model", "detail": "ZZTEST fail", "extra": {"classification": "model"}})
print(json.dumps({
    "due": task.get("due_date"),
    "dismissed": task.get("deadline_dismissed"),
    "kind": task.get("deadline_kind"),
    "personal": len(created) >= 1 or any("plants" in (t.get("title") or "") for t in db.list_tasks()),
    "plain_note_not_promoted": not any("thinking out loud" in (t.get("title") or "") for t in db.list_tasks()),
    "overlaps": len(conflicts["overlaps"]),
    "duplicates": len(dups["duplicates"]),
    "parsed": [p["title"] for p in parsed],
    "classes": len(classes),
    "class_end": classes[0]["end_date"] if classes else None,
    "snap": bool(snaps),
    "export_tasks": "tasks" in (export.get("tables") or {}),
    "about_fallback": about.get("anthropic_fallback") is not None,
    "api_due": empty_due.get("due_date"),
    "conflict_status": conflict.status_code,
    "forced_status": forced.status_code,
    "fail_status": fail.status_code,
    "fail_ok": (fail.get_json() or {}).get("ok"),
}))
"""
            env = dict(os.environ)
            env["WAYPOINT_DATA_DIR"] = tmp
            env["PLANNER_DB_PATH"] = str(Path(tmp) / "planner.db")
            env["NAPKIN_AUTO_COMMIT"] = "false"
            proc = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertIsNone(payload["due"])
            self.assertTrue(payload["dismissed"])
            self.assertEqual(payload["kind"], "indefinite")
            self.assertTrue(payload["personal"])
            self.assertTrue(payload["plain_note_not_promoted"],
                            "a private note that was never marked as a task became a task")
            self.assertGreaterEqual(payload["overlaps"], 1)
            self.assertGreaterEqual(payload["duplicates"], 1)
            self.assertIn("Buy milk", payload["parsed"])
            self.assertGreaterEqual(payload["classes"], 2)
            self.assertEqual(payload["class_end"], "2099-12-15")
            self.assertTrue(payload["snap"])
            self.assertTrue(payload["export_tasks"])
            self.assertTrue(payload["about_fallback"])
            self.assertIsNone(payload["api_due"])
            self.assertEqual(payload["conflict_status"], 409)
            self.assertEqual(payload["forced_status"], 201)
            self.assertEqual(payload["fail_status"], 200)
            self.assertTrue(payload["fail_ok"])


if __name__ == "__main__":
    unittest.main()
