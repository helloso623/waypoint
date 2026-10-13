"""Focused regressions for repository kind tabs and partial goal updates."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def isolated_round_trip(script: str):
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(
            os.environ,
            PLANNER_DB_PATH=str(Path(tmp) / "planner.db"),
            WAYPOINT_DATA_DIR=tmp,
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=ROOT,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout.strip().splitlines()[-1])


class DocsFoundationTests(unittest.TestCase):
    def test_goal_patch_is_partial_enriched_and_migration_safe(self):
        payload = isolated_round_trip(
            """
import json
import app as app_module
import db

db.init_db()
goal_id = db.create_goal(
    "ZZTEST Original goal",
    "2099-01-01",
    [{"title": "Keep this chunk", "due_date": "2098-12-15"}],
)
client = app_module.app.test_client()
title_only = client.patch(
    f"/api/goals/{goal_id}",
    json={"title": "ZZTEST Renamed goal"},
)
details = client.patch(
    f"/api/goals/{goal_id}",
    json={"deadline": "2099-02-02", "notes": "A durable note"},
)
blank = client.patch(f"/api/goals/{goal_id}", json={"title": "  "})
empty = client.patch(f"/api/goals/{goal_id}", json={})
missing = client.patch("/api/goals/999999", json={"title": "Missing"})
conn = db.get_conn()
notes_columns = [
    row["name"] for row in conn.execute("PRAGMA table_info(goals)").fetchall()
].count("notes")
conn.close()
print(json.dumps({
    "title_status": title_only.status_code,
    "title_goal": title_only.get_json(),
    "details_status": details.status_code,
    "details_goal": details.get_json(),
    "blank_status": blank.status_code,
    "empty_status": empty.status_code,
    "missing_status": missing.status_code,
    "notes_columns": notes_columns,
}))
"""
        )

        self.assertEqual(payload["title_status"], 200)
        self.assertEqual(payload["title_goal"]["title"], "ZZTEST Renamed goal")
        self.assertEqual(payload["title_goal"]["deadline"], "2099-01-01")
        self.assertEqual(payload["title_goal"]["chunks"][0]["title"], "Keep this chunk")
        self.assertIn("coach_quests", payload["title_goal"])
        self.assertEqual(payload["details_status"], 200)
        self.assertEqual(payload["details_goal"]["deadline"], "2099-02-02")
        self.assertEqual(payload["details_goal"]["notes"], "A durable note")
        self.assertEqual(payload["blank_status"], 400)
        self.assertEqual(payload["empty_status"], 400)
        self.assertEqual(payload["missing_status"], 404)
        self.assertEqual(payload["notes_columns"], 1)

    def test_custom_goal_quest_and_manual_progress_need_no_coach(self):
        payload = isolated_round_trip(
            """
import json
import app as app_module
import db

db.init_db()
goal_id = db.create_goal("ZZTEST Direct controls", "2099-04-01", [])
client = app_module.app.test_client()
progress = client.patch(f"/api/goals/{goal_id}", json={"progress_pct": 62})
created = client.post(
    f"/api/goals/{goal_id}/quests",
    json={"title": "ZZTEST Write the first draft"},
)
blank = client.post(f"/api/goals/{goal_id}/quests", json={"title": "  "})
missing = client.post("/api/goals/999999/quests", json={"title": "Missing"})
goal = client.get("/api/goals").get_json()[0]
print(json.dumps({
    "progress_status": progress.status_code,
    "progress_pct": progress.get_json().get("progress_pct"),
    "quest_status": created.status_code,
    "quest_title": created.get_json().get("title"),
    "blank_status": blank.status_code,
    "missing_status": missing.status_code,
    "quest_count": len(goal.get("coach_quests") or []),
}))
"""
        )
        self.assertEqual(payload["progress_status"], 200)
        self.assertEqual(payload["progress_pct"], 62)
        self.assertEqual(payload["quest_status"], 201)
        self.assertEqual(payload["quest_title"], "ZZTEST Write the first draft")
        self.assertEqual(payload["blank_status"], 400)
        self.assertEqual(payload["missing_status"], 404)
        self.assertEqual(payload["quest_count"], 1)

    def test_file_kind_classifier_api_tabs_and_high_recent_limit(self):
        payload = isolated_round_trip(
            """
import json
import app as app_module
import db
import repository

for index in range(125):
    db.insert_repo_file(
        f"ZZTEST recent-{index}.md", f"fake-{index}.md", "text/markdown",
        1, "Docs", "", "", 0,
    )
for filename in ("budget.xlsx", "pitch.pptx", "deck.slides.md", "archive.zip"):
    db.insert_repo_file(filename, f"fake-{filename}", "application/octet-stream", 1, "Other", "", "", 0)

client = app_module.app.test_client()
all_rows = client.get("/api/repo/files").get_json()
slides = client.get("/api/repo/files?kind=slides&limit=300").get_json()
invalid = client.get("/api/repo/files?kind=ideas")
print(json.dumps({
    "kinds": {
        name: repository.file_workspace_kind(name)
        for name in ("memo.md", "budget.xlsx", "pitch.pptx", "deck.slides.md", "archive.zip")
    },
    "all_count": len(all_rows),
    "first_name": all_rows[0]["filename"],
    "slides": [(row["filename"], row["kind"]) for row in slides],
    "invalid_status": invalid.status_code,
}))
"""
        )

        self.assertEqual(
            payload["kinds"],
            {
                "memo.md": "docs",
                "budget.xlsx": "sheets",
                "pitch.pptx": "slides",
                "deck.slides.md": "slides",
                "archive.zip": "other",
            },
        )
        self.assertGreater(payload["all_count"], 100)
        self.assertEqual(payload["first_name"], "archive.zip")
        self.assertEqual(
            sorted(payload["slides"]),
            [["deck.slides.md", "slides"], ["pitch.pptx", "slides"]],
        )
        self.assertEqual(payload["invalid_status"], 400)

        source = (ROOT / "static" / "js" / "repository.js").read_text(encoding="utf-8")
        for label in ('label: "Docs"', 'label: "Sheets"', 'label: "Slides"', 'label: "Other"'):
            self.assertIn(label, source)
        self.assertIn('data-repo-kind="${item.key}"', source)
        self.assertIn('data-repo-create-kind="${item.key}"', source)
        self.assertNotIn('renderNtsListSwitcher("Repository")', source)

    def test_task_goal_id_can_link_and_unlink_via_patch(self):
        payload = isolated_round_trip(
            """
import json
import app as app_module
import db

db.init_db()
goal_id = db.create_goal("ZZTEST Link goal", "2099-06-01", [])
client = app_module.app.test_client()
created = client.post("/api/tasks", json={
    "title": "ZZTEST linked task",
    "urgency": "medium",
    "goal_id": goal_id,
})
task = created.get_json()
linked = client.patch(f"/api/tasks/{task['id']}", json={"goal_id": goal_id})
unlinked = client.patch(f"/api/tasks/{task['id']}", json={"goal_id": None})
bad = client.patch(f"/api/tasks/{task['id']}", json={"goal_id": "nope"})
missing = client.patch(f"/api/tasks/{task['id']}", json={"goal_id": 999999})
after_missing = client.patch(
    f"/api/tasks/{task['id']}",
    json={"title": "ZZTEST still writable"},
)
relink = client.patch(f"/api/tasks/{task['id']}", json={"goal_id": goal_id})
deleted = client.delete(f"/api/goals/{goal_id}")
after_delete = client.patch(
    f"/api/tasks/{task['id']}",
    json={"title": "ZZTEST after goal delete"},
)
goal = client.get("/api/goals").get_json()
print(json.dumps({
    "create_status": created.status_code,
    "create_goal_id": task.get("goal_id"),
    "link_status": linked.status_code,
    "link_goal_id": linked.get_json().get("goal_id"),
    "unlink_status": unlinked.status_code,
    "unlink_goal_id": unlinked.get_json().get("goal_id"),
    "bad_status": bad.status_code,
    "missing_status": missing.status_code,
    "after_missing_status": after_missing.status_code,
    "relink_status": relink.status_code,
    "delete_status": deleted.status_code,
    "after_delete_status": after_delete.status_code,
    "after_delete_goal_id": after_delete.get_json().get("goal_id"),
    "goal_gone": all(g["id"] != goal_id for g in goal),
}))
"""
        )
        self.assertEqual(payload["create_status"], 201)
        self.assertEqual(payload["create_goal_id"], payload["link_goal_id"])
        self.assertEqual(payload["link_status"], 200)
        self.assertEqual(payload["unlink_status"], 200)
        self.assertIsNone(payload["unlink_goal_id"])
        self.assertEqual(payload["bad_status"], 400)
        self.assertEqual(payload["missing_status"], 404)
        self.assertEqual(payload["after_missing_status"], 200)
        self.assertEqual(payload["relink_status"], 200)
        self.assertEqual(payload["delete_status"], 200)
        self.assertEqual(payload["after_delete_status"], 200)
        self.assertIsNone(payload["after_delete_goal_id"])
        self.assertTrue(payload["goal_gone"])


if __name__ == "__main__":
    unittest.main()
