"""Classes schema/API regression coverage."""

from __future__ import annotations

import json
import os
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
# .venv/bin/python is POSIX-only and may not exist at all; fall back to the interpreter
# running the tests so the suite works on Windows, which is where this app actually runs.
PYTHON = Path(os.environ.get("WAYPOINT_PYTHON") or ROOT.parent / ".venv" / "bin" / "python")
if not PYTHON.exists():
    PYTHON = Path(sys.executable)


class ClassesFoundationTests(unittest.TestCase):
    def test_classes_is_wired_into_studio(self):
        core = (ROOT / "static" / "js" / "core.js").read_text(encoding="utf-8")
        misc = (ROOT / "static" / "js" / "misc.js").read_text(encoding="utf-8")
        index = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn(
            'tabs: ["Projects", "Competitions", "Code", "Obsidian", "Classes"]',
            core,
        )
        self.assertIn('ACTIVE_TAB === "Classes") return await renderClasses()', core)
        self.assertIn('ACTIVE_TAB === "Classes") wireClasses()', misc)
        self.assertRegex(index, r'<script[^>]*src="/js/classes\.js"', "classes.js must be loaded by index.html")

    def test_recurring_class_coursework_and_calendar_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = """
import json
from datetime import date

import db
from app import app

db.init_db()
db.init_db()
client = app.test_client()
created_response = client.post("/api/classes", json={
    "name": "ZZTEST Algorithms",
    "weekday": date.today().weekday(),
    "start_time": "09:00",
    "end_time": "10:30",
    "travel_minutes": 20,
    "location": "Room 101",
})
created = created_response.get_json()
class_id = created["class"]["id"]
item_response = client.post(f"/api/classes/{class_id}/items", json={
    "title": "Problem set 1",
    "item_type": "homework",
    "due_date": "2099-02-03",
    "notes": "Read chapter 2",
    "create_task": True,
})
item = item_response.get_json()
patched_response = client.patch(f"/api/classes/{class_id}", json={
    "start_time": "10:00",
    "end_time": "11:30",
})
patched = patched_response.get_json()
events = [row for row in db.list_calendar_events() if row.get("class_id") == class_id]
task = db.get_task(item["task_id"])
listed = client.get("/api/classes").get_json()
delete_status = client.delete(f"/api/classes/{class_id}").status_code
remaining_events = [row for row in db.list_calendar_events() if row.get("class_id") == class_id]
schedule_payload = {
    "courses": [{
        "name": "ZZTEST Imported seminar",
        "days": ["Tue", "Thu"],
        "start_time": "14:00",
        "end_time": "15:15",
        "location": "Hall A",
    }],
    "weeks": 4,
}
schedule_first = client.post("/api/school/apply-schedule", json=schedule_payload).get_json()
schedule_second = client.post("/api/school/apply-schedule", json=schedule_payload).get_json()
schedule_classes = [row for row in client.get("/api/classes").get_json() if row["source"] == "schedule"]
schema = {
    row["name"] for row in db.get_conn().execute("PRAGMA table_info(classes)").fetchall()
}
print(json.dumps({
    "create_status": created_response.status_code,
    "events_created": created["events_created"],
    "item_status": item_response.status_code,
    "item": item,
    "task": task,
    "listed": listed,
    "patch_status": patched_response.status_code,
    "patched": patched,
    "event_starts": sorted({row["start_time"] for row in events}),
    "delete_status": delete_status,
    "remaining_events": remaining_events,
    "task_after_delete": db.get_task(item["task_id"]),
    "schedule_first": schedule_first,
    "schedule_second": schedule_second,
    "schedule_classes": schedule_classes,
    "schema": sorted(schema),
}))
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

        self.assertEqual(payload["create_status"], 201)
        self.assertGreater(payload["events_created"], 0)
        self.assertEqual(payload["item_status"], 201)
        self.assertIsNotNone(payload["item"]["task_id"])
        self.assertEqual(payload["task"]["due_date"], "2099-02-03")
        self.assertEqual(payload["task"]["category"], "School")
        self.assertEqual(payload["patch_status"], 200)
        self.assertEqual(payload["event_starts"], ["10:00"])
        self.assertEqual(payload["listed"][0]["items"][0]["title"], "Problem set 1")
        self.assertEqual(payload["delete_status"], 200)
        self.assertEqual(payload["remaining_events"], [])
        self.assertIsNotNone(payload["task_after_delete"])
        self.assertEqual(payload["schedule_first"]["classes_upserted"], 2)
        self.assertGreater(payload["schedule_first"]["created"], 0)
        self.assertEqual(payload["schedule_second"]["created"], 0)
        self.assertEqual(len(payload["schedule_classes"]), 2)
        self.assertTrue(
            {"weekday", "start_time", "end_time", "travel_minutes", "source"}.issubset(payload["schema"])
        )


if __name__ == "__main__":
    unittest.main()
