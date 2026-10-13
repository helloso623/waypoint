"""Focused regressions for proposal-confirm coaching and the Skills heightmap contract."""

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


def isolated_round_trip(script: str):
    with tempfile.TemporaryDirectory() as tmp:
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
        return json.loads(result.stdout.strip().splitlines()[-1])


class GoalCoachAndSkillsTests(unittest.TestCase):
    def test_coach_schema_and_explicit_confirm_writes(self):
        payload = isolated_round_trip(
            """
import json
import app as app_module
import db

goal_id = db.create_goal(
    "ZZTEST Build a field recorder",
    "2099-06-30",
    [{"title": "Choose microphones", "due_date": "2099-06-01"}],
)

def fake_run(name, **kwargs):
    assert name == "goal_coach"
    assert kwargs["goal"]["id"] == goal_id
    return {
        "ideas": [{
            "title": "Blind subway audition",
            "why": "It tests speech isolation against a real noise floor.",
            "first_move": "Record the same 20-second announcement with two microphone positions.",
            "ignored": "not in the API schema",
        }],
        "quests": [{
            "title": "The 3-noise gauntlet",
            "description": "Capture one intelligible clip in wind, traffic, and a cafe.",
            "success_criteria": "Three labeled clips with speech understandable at normal volume.",
            "difficulty": "hard",
        }],
        "time_allocations": [{
            "title": "Prototype listening session",
            "minutes": 90,
            "cadence": "one-off",
            "rationale": "Compare artifacts before buying hardware.",
            "due_date": "2099-06-10",
        }, {"title": "invalid", "minutes": 2}],
    }

app_module.orchestrator.run = fake_run
client = app_module.app.test_client()
coach = client.post(f"/api/goals/{goal_id}/coach", json={})
proposal = coach.get_json()

unconfirmed = client.post(
    f"/api/goals/{goal_id}/coach/confirm",
    json={"kind": "quest", "proposal": proposal["quests"][0]},
)
before = db.get_conn().execute("SELECT COUNT(*) FROM goal_coach_quests").fetchone()[0]

accepted_quest = client.post(
    f"/api/goals/{goal_id}/coach/confirm",
    json={"kind": "quest", "proposal": proposal["quests"][0], "confirmed": True},
)
quest = accepted_quest.get_json()["quest"]
checked = client.patch(f"/api/goals/quests/{quest['id']}", json={"done": True})
deleted = client.delete(f"/api/goals/quests/{quest['id']}")

accepted_task = client.post(
    f"/api/goals/{goal_id}/coach/confirm",
    json={
        "kind": "time_allocation",
        "proposal": proposal["time_allocations"][0],
        "confirmed": True,
    },
)
task = accepted_task.get_json()["task"]
conn = db.get_conn()
trash_type = conn.execute(
    "SELECT entity_type FROM deleted_items ORDER BY id DESC LIMIT 1"
).fetchone()[0]
task_count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
conn.close()
print(json.dumps({
    "coach_status": coach.status_code,
    "proposal": proposal,
    "unconfirmed_status": unconfirmed.status_code,
    "before": before,
    "quest_status": accepted_quest.status_code,
    "checked": checked.get_json(),
    "deleted_status": deleted.status_code,
    "trash_type": trash_type,
    "task_status": accepted_task.status_code,
    "task": task,
    "task_count": task_count,
}))
"""
        )

        self.assertEqual(payload["coach_status"], 200)
        self.assertFalse(payload["proposal"]["writes_committed"])
        self.assertEqual(
            set(payload["proposal"]["ideas"][0]),
            {"title", "why", "first_move"},
        )
        self.assertEqual(len(payload["proposal"]["time_allocations"]), 1)
        self.assertEqual(payload["unconfirmed_status"], 400)
        self.assertEqual(payload["before"], 0)
        self.assertEqual(payload["quest_status"], 201)
        self.assertEqual(payload["checked"]["done"], 1)
        self.assertEqual(payload["deleted_status"], 200)
        self.assertEqual(payload["trash_type"], "goal_coach_quest")
        self.assertEqual(payload["task_status"], 201)
        self.assertEqual(payload["task_count"], 1)
        self.assertEqual(payload["task"]["progress_total"], 90)
        self.assertEqual(payload["task"]["progress_unit"], "minutes")

    def test_heightmap_ids_trends_practice_and_embedding_fallback(self):
        payload = isolated_round_trip(
            """
import json
import app as app_module
import db

python_id = db.insert_note("skill", "Python programming", "Build reliable scripts")
logic_id = db.insert_note("skill", "Logic", "Deduction puzzles")
hardware_id = db.insert_note("skill", "Hardware", "Circuits and robotics")
db.record_practice_attempt("code_exercise", 8, 10, 3)

client = app_module.app.test_client()
patched = client.patch(f"/api/lists/skill/{python_id}", json={"proficiency": 7})
skills = client.get("/api/lists/skill").get_json()

app_module.embeddings.texts_to_2d = lambda texts: [[0, 0], [1, 0], [0, 1]]
primary = client.get("/api/skills/heightmap").get_json()

def unavailable(_texts):
    raise RuntimeError("provider unavailable")
app_module.embeddings.texts_to_2d = unavailable
fallback = client.get("/api/skills/heightmap").get_json()

deleted = client.delete(f"/api/lists/skill/{hardware_id}")
skills_after_delete = client.get("/api/lists/skill").get_json()

app_module.parallel_life.pregen_all_images = None
unsupported = client.post("/api/parallel/pregen-images")
app_module.parallel_life.pregen_all_images = lambda: {"ok": True, "generated": 4}
supported = client.post("/api/parallel/pregen-images")

python_skill = next(item for item in skills if item["id"] == python_id)
print(json.dumps({
    "patched": patched.get_json(),
    "python_skill": python_skill,
    "hardware_id": hardware_id,
    "delete_status": deleted.status_code,
    "delete_body": deleted.get_json(),
    "remaining_ids": [item["id"] for item in skills_after_delete],
    "primary": primary,
    "fallback": fallback,
    "unsupported_status": unsupported.status_code,
    "supported": supported.get_json(),
}))
"""
        )

        self.assertEqual(payload["patched"].get("ok"), True)
        self.assertIn("skill", payload["patched"])
        self.assertEqual(
            [entry["proficiency"] for entry in payload["patched"]["skill"]["proficiency_trend"]],
            [5, 7],
        )
        self.assertEqual(
            [entry["proficiency"] for entry in payload["python_skill"]["proficiency_trend"]],
            [5, 7],
        )
        self.assertEqual(payload["python_skill"]["last_practiced"]["game_key"], "code_exercise")
        self.assertEqual(payload["delete_status"], 200)
        self.assertEqual(payload["delete_body"], {"ok": True})
        self.assertNotIn(payload["hardware_id"], payload["remaining_ids"])
        self.assertEqual(payload["primary"]["embedding_source"], "embeddings.py")
        self.assertEqual(len(payload["primary"]["points"]), 3)
        self.assertTrue(all("id" in point for point in payload["primary"]["points"]))
        self.assertEqual(payload["fallback"]["embedding_source"], "tfidf-fallback")
        self.assertEqual(payload["unsupported_status"], 501)
        self.assertEqual(payload["supported"]["generated"], 4)


if __name__ == "__main__":
    unittest.main()
