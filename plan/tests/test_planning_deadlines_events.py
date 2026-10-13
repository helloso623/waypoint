"""Focused persistence/API regressions for task deadlines, timed events, and hour intent."""

from __future__ import annotations

import json
import os
import sys
import subprocess
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
# .venv/bin/python is POSIX-only and may not exist at all; fall back to the interpreter
# running the tests so the suite works on Windows, which is where this app actually runs.
PYTHON = Path(os.environ.get("WAYPOINT_PYTHON") or ROOT.parent / ".venv" / "bin" / "python")
if not PYTHON.exists():
    PYTHON = Path(sys.executable)


class PlanningPersistenceTests(unittest.TestCase):
    def test_api_forces_deadline_and_preserves_description_and_timed_event(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "planner.db")
            script = """
import json
from app import app

client = app.test_client()
task = client.post("/api/tasks", json={
    "title": "ZZTEST forced deadline",
    "description": "First line\\nSecond line",
    "urgency": "high",
}).get_json()
event_response = client.post("/api/events", json={
    "title": "ZZTEST timed event",
    "date": "2099-02-03",
    "start_time": "09:30",
    "end_time": "11:00",
    "all_day": False,
})
event = event_response.get_json()
patched = client.patch(f"/api/tasks/{task['id']}", json={
    "description": "Changed\\nDescription",
}).get_json()
print(json.dumps({
    "task": task,
    "patched": patched,
    "event_status": event_response.status_code,
    "event": event,
}))
"""
            env = dict(os.environ, PLANNER_DB_PATH=db_path, WAYPOINT_DATA_DIR=tmp)
            result = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])

        self.assertIsNone(payload["task"]["due_date"])
        self.assertTrue(payload["task"]["deadline_dismissed"])
        self.assertEqual(payload["task"]["description"], "First line\nSecond line")
        self.assertEqual(payload["patched"]["description"], "Changed\nDescription")
        self.assertEqual(payload["event_status"], 201)
        self.assertEqual(payload["event"]["start_time"], "09:30")
        self.assertEqual(payload["event"]["end_time"], "11:00")
        self.assertEqual(payload["event"]["all_day"], 0)

    def test_schedule_and_idempotent_migrations_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = """
import importlib
import json
import os
import db

importlib.reload(db)
db.init_db()
db.init_db()
task_id = db.insert_task(
    "ZZTEST scheduled",
    urgency="low",
    deadline_dismissed=True,
    description="Visible detail",
)
db.schedule_task(task_id, "2099-03-04", [9, 10, 10])
first = db.list_task_schedule("2099-03-04")
db.schedule_task(task_id, "2099-03-04", [14])
second = db.list_task_schedule("2099-03-04")
task = db.get_task(task_id)
event_id = db.insert_event(
    "ZZTEST legacy all-day", "", "2099-03-04", "", "", "human"
)
event = db.get_event(event_id)
print(json.dumps({"first": first, "second": second, "task": task, "event": event}))
"""
            env = dict(
                os.environ,
                PLANNER_DB_PATH=str(Path(tmp) / "planner.db"),
                WAYPOINT_DATA_DIR=tmp,
            )
            result = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])

        self.assertEqual([row["hour"] for row in payload["first"]], [9, 10])
        self.assertEqual([row["hour"] for row in payload["second"]], [14])
        self.assertIsNone(payload["task"]["due_date"])
        self.assertEqual(payload["task"]["deadline_dismissed"], 1)
        self.assertEqual(payload["event"]["all_day"], 1)


if __name__ == "__main__":
    unittest.main()
