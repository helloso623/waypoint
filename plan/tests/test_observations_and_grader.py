"""Observation widget, class recurrence horizon, and auto-grader contracts."""

from __future__ import annotations

import json
import os
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
# sys.executable, not "python3": that name does not exist on Windows, which is the
# platform this app actually runs on -- the calls below failed with exit 9009.
PYTHON = Path(os.environ.get("PYTHON", "") or sys.executable)


class ObservationAndGraderTests(unittest.TestCase):
    def test_observation_creates_github_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os
import db
from app import app

db.init_db()
client = app.test_client()
created = client.post("/api/observations", json={
    "title": "Fix the Observe button contrast",
    "quote": "Last answer: claude",
    "note": "Make the HUD chip calmer",
    "tab": "Settings",
})
row = created.get_json()
listed = client.get("/api/observations").get_json()
about = client.get("/api/about").get_json()
print(json.dumps({
    "status": created.status_code,
    "id": row.get("id"),
    "url": row.get("github_url") or "",
    "listed": len(listed),
    "token_leaked": "github_token" in about,
    "repo": about.get("github_repo"),
}))
"""
            env = dict(os.environ, PLANNER_DB_PATH=str(Path(tmp) / "planner.db"), WAYPOINT_DATA_DIR=tmp)
            result = subprocess.run(
                [str(PYTHON), "-c", script], cwd=ROOT, env=env, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(payload["status"], 201)
        self.assertTrue(payload["id"])
        self.assertIn("github.com/", payload["url"])
        self.assertIn("issues/new", payload["url"])
        self.assertGreaterEqual(payload["listed"], 1)
        self.assertFalse(payload["token_leaked"])

    def test_class_horizon_and_mocked_grade(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json
from datetime import date
import db
import ai
from app import app

db.init_db()
client = app.test_client()
created = client.post("/api/classes", json={
    "name": "ZZTEST Recurring",
    "weekday": date.today().weekday(),
    "start_time": "09:00",
    "end_time": "10:00",
    "horizon_weeks": 4,
})
body = created.get_json()
class_id = body["class"]["id"]
item = client.post(f"/api/classes/{class_id}/items", json={
    "title": "Problem set",
    "item_type": "homework",
    "notes": "Prove n=n",
    "create_task": False,
}).get_json()

orig = ai.grade_class_work
def fake_grade(*args, **kwargs):
    return {"score": 9, "letter": "A", "feedback": "Clear proof.", "missing": []}
ai.grade_class_work = fake_grade
try:
    graded = client.post(
        f"/api/classes/{class_id}/items/{item['id']}/grade",
        json={"answer": "By induction."},
    )
finally:
    ai.grade_class_work = orig
g = graded.get_json()
print(json.dumps({
    "create_status": created.status_code,
    "events": body.get("events_created"),
    "weeks": body["class"].get("horizon_weeks"),
    "grade_status": graded.status_code,
    "letter": (g.get("grade") or {}).get("letter"),
    "score": (g.get("item") or {}).get("grade_score"),
}))
"""
            env = dict(os.environ, PLANNER_DB_PATH=str(Path(tmp) / "planner.db"), WAYPOINT_DATA_DIR=tmp)
            result = subprocess.run(
                [str(PYTHON), "-c", script], cwd=ROOT, env=env, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(payload["create_status"], 201)
        self.assertEqual(payload["weeks"], 4)
        self.assertGreater(payload["events"], 0)
        self.assertLessEqual(payload["events"], 4)
        self.assertEqual(payload["grade_status"], 200)
        self.assertEqual(payload["letter"], "A")
        self.assertEqual(payload["score"], 9)


if __name__ == "__main__":
    unittest.main()
