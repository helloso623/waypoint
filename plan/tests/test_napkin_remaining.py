"""Contracts for the second napkin pass: clobber guard, usage split, cart, loot, agents."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class NapkinRemainingSourceTests(unittest.TestCase):
    def test_clobber_guard_and_new_surfaces(self):
        sync = source("napkin_sync.py")
        self.assertIn("def would_clobber_committed_napkin", sync)
        self.assertIn("_temp_data_dir_must_not_touch_repo", sync)
        app = source("app.py")
        self.assertIn('"/api/loot/state"', app)
        self.assertIn('"/api/agents/spawn"', app)
        self.assertIn('"/api/cart"', app)
        self.assertIn('"/api/trends/interpolate"', app)
        self.assertIn('"/api/ai/preflight"', app)
        agent = source("agent.py")
        self.assertIn('"name": "spawn_agent"', agent)
        self.assertIn('"name": "add_to_cart"', agent)
        self.assertIn("napkin_remaining.js", source("static/index.html"))
        self.assertIn("napkin-capture-dialog", source("static/js/misc.js"))
        self.assertIn("tdy-event-url", source("static/js/today.js"))
        self.assertIn("calEventCalendarItems", source("static/js/calendar.js"))
        self.assertIn("linearInterpolateNulls", source("static/js/trends.js"))
        self.assertIn("function confirmCost", source("static/js/napkin_remaining.js"))
        self.assertIn("window.wpConfirmCost", source("static/js/napkin_remaining.js"))
        self.assertIn("wpConfirmCost", source("static/js/agent.js"))
        self.assertIn("CALENDAR_EVENT_UPDATE_FIELDS", source("db.py"))


class NapkinRemainingRuntimeTests(unittest.TestCase):
    def test_interpolate_cart_chest_and_usage(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os
from pathlib import Path
import db
import napkin_remaining
from app import app

db.init_db()
series = napkin_remaining.interpolate_series([
    {"date": "2099-01-01", "value": 2},
    {"date": "2099-01-04", "value": 8},
])
pred = napkin_remaining.predict_next_values(series, horizon=3)
coins = napkin_remaining.happiness_coin_formula({"happiness": 8, "energy": 6}, painted_hours=4)
empty = napkin_remaining.happiness_coin_formula({})
roll = napkin_remaining.roll_chest("common", pity={"rare": 40}, owned_count=1)
cart = napkin_remaining.add_cart_item("Headphones", url="https://example.com")
items = napkin_remaining.list_cart()
cost = napkin_remaining.predicted_cost_usd("x" * 20000, history_len=40)
eid = db.insert_calendar_event("Studio", "2099-07-01", "10:00", "10:05", None, None)
db.update_calendar_event(eid, lane="nope", kind="weird", title="Studio")
ev = db.get_calendar_event(eid)
client = app.test_client()
usage = client.get("/api/usage")
pre = client.post("/api/ai/preflight", json={"prompt": "hello", "history_len": 2})
print(json.dumps({
    "gap_days": [row["date"] for row in series],
    "interpolated": any(row.get("interpolated") for row in series),
    "pred": len(pred),
    "coins": coins["coins"],
    "empty": empty["coins"],
    "rarity": roll["rarity"],
    "cart_id": cart.get("id"),
    "cart_n": len(items),
    "cost": cost,
    "lane": ev.get("lane"),
    "kind": ev.get("kind"),
    "usage": usage.status_code,
    "has_day": "day" in (usage.get_json() or {}),
    "pre": pre.status_code,
    "needs": (pre.get_json() or {}).get("needs_confirm") is not None,
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
            self.assertIn("2099-01-02", payload["gap_days"])
            self.assertTrue(payload["interpolated"])
            self.assertEqual(payload["pred"], 3)
            self.assertGreater(payload["coins"], 0)
            self.assertEqual(payload["empty"], 0)
            self.assertIn(payload["rarity"], ("common", "rare", "epic", "legendary"))
            self.assertTrue(payload["cart_id"])
            self.assertEqual(payload["cart_n"], 1)
            self.assertEqual(payload["usage"], 200)
            self.assertTrue(payload["has_day"])
            self.assertEqual(payload["pre"], 200)
            self.assertTrue(payload["needs"])
            self.assertEqual(payload["lane"], "passion")
            self.assertEqual(payload["kind"], "event")


if __name__ == "__main__":
    unittest.main()
