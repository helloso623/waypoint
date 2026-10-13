"""NYU Brightspace + campus-app contracts."""

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
else:
    probe = subprocess.run([str(PYTHON), "-c", "import flask"], capture_output=True)
    if probe.returncode != 0:
        PYTHON = Path(sys.executable)

SAMPLE_ICS = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Waypoint//NYU test//EN
BEGIN:VEVENT
UID:evt-calc-1
DTSTART:20260914T180000Z
DTEND:20260914T193000Z
SUMMARY:DEMO-UA 202 Lecture
DESCRIPTION:Room WWH 109
END:VEVENT
BEGIN:VTODO
UID:todo-hw-1
DUE:20260916T235900Z
SUMMARY:DEMO-UA 202: Problem set 2
DESCRIPTION:WebAssign
END:VTODO
END:VCALENDAR
"""


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class NyuBrightspaceContracts(unittest.TestCase):
    def test_settings_and_classes_expose_nyu(self):
        settings = source("static/js/settings.js")
        classes = source("static/js/classes.js")
        app = source("app.py")
        env = source(".env.example")
        self.assertIn('id="nyu-integrations-card"', settings)
        self.assertIn('id="nyu-app-grid"', settings)
        self.assertIn("/api/nyu/status", settings)
        self.assertIn("/api/nyu/brightspace/ics", settings)
        self.assertIn("Connect Brightspace", settings)
        self.assertIn('id="classes-nyu-sync"', classes)
        self.assertNotIn("NYU sync · TODO", classes)
        self.assertIn('"/api/nyu/status"', app)
        self.assertIn('"/api/nyu/brightspace/ics"', app)
        self.assertIn('"/api/nyu/sync"', app)
        self.assertIn("NYU_BRIGHTSPACE_CLIENT_ID", env)
        self.assertIn("master_campus_api", source("nyu_sync.py"))

    def test_ics_parser_and_host_allowlist(self):
        sys.path.insert(0, str(ROOT))
        import nyu_sync

        blocks = nyu_sync.parse_ics_blocks(SAMPLE_ICS)
        kinds = {block["__kind"] for block in blocks}
        self.assertEqual(kinds, {"VEVENT", "VTODO"})
        self.assertTrue(nyu_sync.ics_host_ok("https://brightspace.nyu.edu/d2l/le/calendar/feed/user/abc.ics"))
        self.assertTrue(nyu_sync.ics_host_ok("https://calendar.google.com/calendar/ical/x/basic.ics"))
        self.assertFalse(nyu_sync.ics_host_ok("https://evil.example/steal.ics"))
        with self.assertRaises(ValueError):
            nyu_sync._assert_ics_url("https://127.0.0.1/secret.ics")

    def test_status_is_honest_about_campus_apis(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json
import os

os.environ["WAYPOINT_DATA_DIR"] = os.environ["WAYPOINT_DATA_DIR"]
import db
import nyu_sync

db.init_db()
payload = nyu_sync.status_payload()
print(json.dumps({
    "apps": [app["id"] for app in payload["apps"]],
    "limits": payload["limits"],
    "can_sync": payload["can_sync"],
    "oauth_configured": payload["oauth_configured"],
    "connected": payload["connected"],
}))
"""
            env = dict(os.environ, PLANNER_DB_PATH=str(Path(tmp) / "planner.db"), WAYPOINT_DATA_DIR=tmp)
            result = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertIn("brightspace", payload["apps"])
        self.assertIn("albert", payload["apps"])
        self.assertIn("home", payload["apps"])
        self.assertFalse(payload["limits"]["albert_api"])
        self.assertFalse(payload["limits"]["master_campus_api"])
        self.assertFalse(payload["can_sync"])
        self.assertFalse(payload["oauth_configured"])

    def test_ics_import_is_idempotent_and_routes_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json
from unittest.mock import patch

import db
import nyu_sync
from app import app

db.init_db()
client = app.test_client()
status = client.get("/api/nyu/status")
apps = client.get("/api/nyu/apps")
sync_empty = client.post("/api/nyu/sync")
blocked = client.post("/api/nyu/brightspace/ics", json={"url": "https://evil.example/x.ics"})
saved = client.post("/api/nyu/brightspace/settings", json={"ics_url": "https://brightspace.nyu.edu/d2l/le/calendar/feed/user/test.ics"})
bad_oauth = client.get("/api/nyu/brightspace/oauth/start")
ics_text = '''BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-calc-1
DTSTART:20260914T180000Z
DTEND:20260914T193000Z
SUMMARY:DEMO-UA 202 Lecture
END:VEVENT
BEGIN:VTODO
UID:todo-hw-1
DUE:20260916T235900Z
SUMMARY:DEMO-UA 202: Problem set 2
END:VTODO
END:VCALENDAR
'''
first = nyu_sync.import_ics_feed(ics_text=ics_text)
second = nyu_sync.import_ics_feed(ics_text=ics_text)
events = [row for row in db.list_calendar_events() if "DEMO-UA" in (row.get("title") or "")]
tasks = [row for row in db.list_tasks() if "Problem set 2" in (row.get("title") or "")]

def fake_urlopen(request, timeout=25):
    class Resp:
        def read(self, *_a, **_k):
            return ics_text.encode("utf-8")
        def __enter__(self):
            return self
        def __exit__(self, *_a):
            return False
    return Resp()

with patch("nyu_sync.urllib.request.urlopen", fake_urlopen):
    imported = client.post("/api/nyu/brightspace/ics", json={"url": "https://brightspace.nyu.edu/d2l/le/calendar/feed/user/test.ics"})

print(json.dumps({
    "status_code": status.status_code,
    "status": status.get_json(),
    "apps": [a["id"] for a in apps.get_json()["apps"]],
    "blocked_status": blocked.status_code,
    "blocked": blocked.get_json(),
    "saved_status": saved.status_code,
    "oauth_status": bad_oauth.status_code,
    "oauth": bad_oauth.get_json(),
    "first": first,
    "second": second,
    "event_titles": [row["title"] for row in events],
    "task_titles": [row["title"] for row in tasks],
    "sync_empty": sync_empty.get_json(),
    "imported_status": imported.status_code,
    "imported": imported.get_json(),
}))
"""
            env = dict(
                os.environ,
                PLANNER_DB_PATH=str(Path(tmp) / "planner.db"),
                WAYPOINT_DATA_DIR=tmp,
                APP_TRUST_LOCALHOST="true",
            )
            env.pop("NYU_BRIGHTSPACE_CLIENT_ID", None)
            env.pop("NYU_BRIGHTSPACE_CLIENT_SECRET", None)
            result = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                self.fail(result.stderr)
            payload = json.loads(result.stdout.strip().splitlines()[-1])

        self.assertEqual(payload["status_code"], 200)
        self.assertIn("brightspace", payload["apps"])
        self.assertEqual(payload["blocked_status"], 400)
        self.assertIn("allowed", payload["blocked"]["error"].lower())
        self.assertEqual(payload["saved_status"], 200)
        self.assertEqual(payload["oauth_status"], 400)
        self.assertEqual(payload["first"], {"events": 1, "tasks": 1})
        self.assertEqual(payload["second"], {"events": 0, "tasks": 0})
        self.assertEqual(payload["event_titles"], ["DEMO-UA 202 Lecture"])
        self.assertEqual(payload["task_titles"], ["DEMO-UA 202: Problem set 2"])
        self.assertIn("calendar feed", payload["sync_empty"]["error"].lower())
        self.assertEqual(payload["imported_status"], 200)
        self.assertEqual(payload["imported"]["events"], 0)
        self.assertEqual(payload["imported"]["tasks"], 0)


if __name__ == "__main__":
    unittest.main()
