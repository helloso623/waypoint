"""Contracts for the third napkin pass: integrations, stop events, analysis, Paint tab."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class NapkinDepthSourceTests(unittest.TestCase):
    def test_visible_gaps_are_wired(self):
        core = source("static/js/core.js")
        self.assertIn('return "";', core)
        self.assertIn('"Paint"', core)
        self.assertIn("ACTIVE_TAB === \"Paint\"", core)
        html = source("static/index.html")
        self.assertIn("napkin_depth.css", html)
        self.assertIn("napkin_depth.js", html)
        today = source("static/js/today.js")
        self.assertIn("happiness_month_outlook", today)
        self.assertIn("interpolated_hours", today)
        self.assertIn("importanceColor", today)
        self.assertIn('goToTab("Paint")', today)
        remaining = source("napkin_remaining.py")
        self.assertIn("cancel_event", remaining)
        self.assertIn("cancel.set()", remaining)
        agent = source("agent.py")
        self.assertIn('"name": "use_integration"', agent)
        self.assertIn("cancel_event=None", agent)
        self.assertIn("background=False", agent)
        self.assertIn("this_cancelled", agent)
        trends = source("static/js/trends.js")
        self.assertIn("weekday seasonality", trends.lower())
        self.assertIn("observed", trends)
        depth_js = source("static/js/napkin_depth.js")
        self.assertIn("function inCheck", depth_js)
        self.assertIn("legalMoves", depth_js)
        self.assertIn("agent-mic", depth_js)
        self.assertIn("wp-coin-breakdown", depth_js)
        self.assertIn("waypointMark", depth_js)
        app = source("app.py")
        self.assertIn('"/api/integrations/use"', app)
        self.assertIn('"/api/upgrades"', app)
        self.assertIn('"/api/trends/analyze"', app)


class NapkinDepthRuntimeTests(unittest.TestCase):
    def test_stop_event_integrations_and_analysis(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os, threading
from pathlib import Path
import db
import napkin_remaining
import napkin_depth
from app import app

db.init_db()
formula = napkin_remaining.happiness_coin_formula({"happiness": 8, "energy": 6}, painted_hours=4)
powered = napkin_depth.apply_coin_powers(formula)
unknown = napkin_depth.use_integration("nope")
obs = napkin_depth.use_integration("obsidian")
rows = [
    {"date": "2099-01-04", "value": 2},
    {"date": "2099-01-05", "value": 8},
    {"date": "2099-01-11", "value": 3},
]
season = napkin_depth.weekday_seasonality(rows)
analysis = napkin_depth.analyze_series(rows)
upgrades = napkin_depth.list_upgrades()
buy_fail = napkin_depth.buy_upgrade("luck", coins=1)
job_id = "deadbeefcafe"
ev = threading.Event()
with napkin_remaining._agent_lock:
    napkin_remaining._spawned_agents[job_id] = {"id": job_id, "cancel": ev, "status": "running"}
stopped = napkin_remaining.stop_spawned_agent(job_id)
client = app.test_client()
use = client.post("/api/integrations/use", json={"id": "obsidian", "action": "status"})
ups = client.get("/api/upgrades")
print(json.dumps({
    "powered_coins": powered["coins"],
    "has_power": "power" in powered,
    "unknown": unknown.get("error"),
    "obs_ok": obs.get("ok") is not None or "error" in obs,
    "weekday_n": len(season),
    "analysis_n": analysis["n"],
    "upgrade_n": len(upgrades),
    "buy_fail": buy_fail.get("error"),
    "job": True,
    "stopped": stopped.get("status"),
    "event_set": ev.is_set(),
    "use_status": use.status_code,
    "ups_status": ups.status_code,
}))
"""
            env = dict(os.environ)
            env["WAYPOINT_DATA_DIR"] = tmp
            env["PLANNER_DB_PATH"] = str(Path(tmp) / "planner.db")
            env["NAPKIN_AUTO_COMMIT"] = "false"
            import subprocess
            proc = subprocess.run(
                [sys.executable, "-c", script],
                cwd=str(ROOT),
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertGreaterEqual(payload["powered_coins"], 1)
            self.assertTrue(payload["has_power"])
            self.assertEqual(payload["unknown"], "unknown integration")
            self.assertTrue(payload["obs_ok"])
            self.assertEqual(payload["weekday_n"], 7)
            self.assertEqual(payload["analysis_n"], 3)
            self.assertGreaterEqual(payload["upgrade_n"], 5)
            self.assertEqual(payload["buy_fail"], "not enough coins")
            self.assertTrue(payload["job"])
            self.assertEqual(payload["stopped"], "stopped")
            self.assertTrue(payload["event_set"])
            self.assertIn(payload["use_status"], (200, 400))
            self.assertEqual(payload["ups_status"], 200)


if __name__ == "__main__":
    unittest.main()
