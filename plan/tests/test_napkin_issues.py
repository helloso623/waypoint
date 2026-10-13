import ast
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


class NapkinIssuesSourceTests(unittest.TestCase):
    def test_assets_are_wired(self):
        html = source("static/index.html")
        self.assertIn("napkin_issues.css", html)
        self.assertIn("atelier.css", html)
        self.assertIn("skin-feels.css", html)
        self.assertIn("hud-focus-cluster", html)
        self.assertIn("id=\"wp-mini-math\"", html)
        self.assertIn("id=\"wp-focus-dock\"", html)
        self.assertIn("id=\"hud-game-cluster\"", html)
        self.assertIn("id=\"hud-xp-btn\"", html)
        self.assertIn("id=\"hud-quests-btn\"", html)
        self.assertIn("id=\"hud-pomodoro-btn\"", html)
        self.assertIn("id=\"open-command-palette\"", html)
        self.assertIn("id=\"launch-automation-studio\"", html)
        self.assertIn("id=\"hud-settings-btn\"", html)
        self.assertIn("id=\"nav-back\"", html)
        self.assertIn("id=\"nav-forward\"", html)
        self.assertIn("atelier-pass.css", html)
        self.assertIn("skin-pass.css", html)
        self.assertIn("skin-intent.css", html)
        self.assertIn("skin-rooms.css", html)
        self.assertIn("skin-fit.css", html)
        self.assertLess(html.find("skin-pass.css"), html.find("skin-intent.css"))
        self.assertLess(html.find("skin-intent.css"), html.find("skin-rooms.css"))
        self.assertLess(html.find("skin-rooms.css"), html.find("skin-fit.css"))
        self.assertIn("atelier-home-pass.css", html)
        self.assertIn("napkin_issues.js", html)

    def test_travel_category_is_black(self):
        self.assertIn('"travel"', source("categories.py"))
        self.assertIn("#111111", source("categories.py"))
        self.assertIn("travel", source("napkin_issues.py"))

    def test_calendar_fields_include_recurrence(self):
        src = source("db.py")
        self.assertIn('"status"', src[src.index("CALENDAR_EVENT_UPDATE_FIELDS"):])
        self.assertIn('"rrule"', src[src.index("CALENDAR_EVENT_UPDATE_FIELDS"):])
        self.assertIn('"series_id"', src[src.index("CALENDAR_EVENT_UPDATE_FIELDS"):])

    def test_paint_tab_is_week_only(self):
        today = source("static/js/today.js")
        self.assertIn('return ["Today", "Calendar", "Tasks"].includes(ACTIVE_TAB)', today)
        self.assertIn("ACTIVE_TAB === \"Paint\" || (ACTIVE_TAB === \"Today\" && tdyWeekLayerOn(\"paint\"))", today)
        self.assertIn("function buildPaintWeekToolbar(", today)
        self.assertIn("Array.from({ length: 24 }", today)
        self.assertIn("id=\"pln-paint-week-select\"", today)
        self.assertIn("tdy-select-edit-events", today)
        self.assertIn("Cleared", today)

    def test_events_are_inline_editable(self):
        events = source("static/js/events.js")
        self.assertIn("class=\"event-title\"", events)
        self.assertIn("class=\"event-description\"", events)
        self.assertIn("class=\"event-url\"", events)
        self.assertIn("evtIsWeeklyHidden", events)

    def test_tasks_support_bets_and_date_drag(self):
        tasks = source("static/js/tasks.js")
        self.assertIn("task-bet", tasks)
        self.assertIn("/api/bets", tasks)
        self.assertIn("function wireTaskDateDrag(", tasks)
        self.assertIn("task-edit-prerequisite", tasks)

    def test_loot_has_retro_and_quiet(self):
        loot = source("static/js/loot.js")
        self.assertIn("id: \"retro\"", loot)
        self.assertIn("world: true", loot[loot.index("id: \"retro\""):loot.index("id: \"retro\"") + 400])
        self.assertIn("quietGrantCount", loot)
        self.assertIn("loot-ticket-window", loot)

    def test_icon_system_is_refined_svg(self):
        js = source("static/js/napkin_issues.js")
        self.assertIn("wp-icon-refined", js)
        self.assertIn("function markSvg(", js)
        self.assertIn("function upgradeAppIcons(", js)
        self.assertIn("function skinMark(", js)
        self.assertIn("SKIN_FAMILY", js)
        self.assertIn("FAMILY_PATHS", js)
        self.assertIn("TAB_ICONS", js)
        self.assertIn("function upgradeTabIcons(", js)
        self.assertIn("function mixHex(", js)
        self.assertIn("function equippedSkinColors(", js)
        self.assertIn("function refreshSkinChrome(", js)
        self.assertIn("window.wpRefreshSkinChrome", js)
        self.assertIn("window.wpSkinFamily", js)
        self.assertIn("window.wpSkinMark", js)
        self.assertIn("window.wpUsesEmojiIcons", js)
        self.assertIn("window.wpIsTrailblazer", js)
        self.assertIn("const APP_EMOJI =", js)
        self.assertIn("function usesEmojiIcons(", js)
        self.assertIn("function isTrailblazer(", js)
        self.assertIn("trailblazerEmoji", js)
        self.assertIn("function appGlyphHtml(", js)
        self.assertIn("mixHex(spec.a, skin.a, 0.88)", js)
        self.assertNotIn("mixHex(spec.a, skin.a, 0.62)", js)
        self.assertIn("arcade:", js)
        people = js.split("people: {", 1)[1].split("system:", 1)[0]
        self.assertNotIn('cy="28"', people)
        self.assertNotIn('cy="36"', people)
        self.assertIn("Contacts: \"card\"", js)
        css = source("static/css/napkin_issues.css")
        self.assertIn("html[data-player-skin]", css)
        atelier = source("static/css/atelier.css")
        self.assertIn("html[data-player-skin] body", atelier)
        self.assertIn("launcher-tile-glyph", atelier)
        self.assertIn("data-skin-effect=\"bloom\"", atelier)
        self.assertIn("data-skin-pattern=\"hex\"", atelier)
        self.assertIn("tab-chip-mark", atelier)
        self.assertIn("data-world-skin=\"retro\"", source("static/css/world-skins.css"))
        feels = source("static/css/skin-feels.css")
        self.assertIn("data-skin-effect=\"bloom\"", feels)
        self.assertIn("data-skin-pattern=\"hex\"", feels)
        self.assertIn("data-skin-pattern=\"dots\"", feels)
        self.assertIn("data-skin-pattern=\"stripes\"", feels)
        self.assertIn("data-skin-family=\"leaf\"", feels)
        self.assertIn("data-skin-family=\"void\"", feels)
        self.assertIn("--feel-3d", feels)
        self.assertIn("feel-halo-btn", feels)
        self.assertIn("--feel-3d-press", feels)
        loot = source("static/js/loot.js")
        self.assertIn("window.wpSkinMark", loot)
        self.assertIn("dataset.skinFamily", loot)
        self.assertIn("wpRefreshSkinChrome", loot)
        skins_block = loot.split("const SKINS = {", 1)[1].split("  const ROAD", 1)[0]
        family = js.split("const SKIN_FAMILY = {", 1)[1].split("};", 1)[0]
        for skin_id in (
            "trailblazer", "moss", "solar", "void", "retro", "cabinet", "parchment",
            "harbor", "velvet", "sapphire", "emberglass", "prism", "sakura",
        ):
            self.assertIn(f"{skin_id}:", family)
            self.assertIn(f'id: "{skin_id}"', skins_block)

    def test_capture_paste_boards_and_drafts(self):
        issues = source("static/js/napkin_issues.js")
        misc = source("static/js/misc.js")
        complete = source("static/js/napkin_complete.js")
        remaining = source("static/js/napkin_remaining.js")
        notes = source("static/js/notes.js")
        self.assertIn("navigator.clipboard?.read", issues)
        self.assertIn("fileToDataUrl", issues)
        self.assertIn("waypointBoardsV1", issues)
        self.assertIn("wp-docs-shell", issues)
        self.assertIn("wp-sheet-formula", issues)
        self.assertIn("wp-slide-notes", issues)
        self.assertIn("window.wpResolvePastedImage", issues)
        self.assertIn("const APP_ICONS =", issues)
        self.assertIn("function markSvg(", issues)
        self.assertIn('id: "feedback"', misc)
        self.assertIn('options.type || "feedback"', misc)
        self.assertIn("waypointCaptureDraftV1", misc)
        self.assertIn("playCaptureSuccess", misc)
        self.assertIn("firstDetailsLine", misc)
        self.assertIn("napkin-gg-body", misc)
        self.assertIn("Keep scribbling here — this is the only writing area", misc)
        self.assertNotIn("Pinned to your Napkin", misc)
        self.assertNotIn("it worked", misc.lower())
        self.assertIn("waypointCaptureDraftV1", complete)
        self.assertIn("wireMetricRightClickGuard", remaining)
        self.assertIn("pointerdown", remaining)
        self.assertIn("wpInsertPastedImage", notes)
        self.assertIn("ntsInsertImageFigure", notes)

    def test_agent_can_complete_and_edit_events(self):
        agent = source("agent.py")
        for name in ("complete_event", "update_event", "add_recurring_event", "add_task_bet", "set_task_prerequisite", "add_alarm"):
            self.assertIn(f'"{name}"', agent)
        self.assertIn("Never invent a clock time", agent)

    def test_settings_sync_export_and_game_off(self):
        settings = source("static/js/settings.js")
        self.assertIn("wp-hide-game", settings)
        self.assertIn("settingsSetGameOff", settings)
        self.assertIn("/api/sync/push", settings)
        self.assertIn("/api/sync/pull", settings)
        self.assertIn("settings-export-profile", settings)
        self.assertIn("settings-usage-periods", settings)
        self.assertIn("cannot be minted", settings)
        app = source("app.py")
        self.assertIn('"/api/sync/push"', app)
        self.assertIn('"/api/sync/pull"', app)
        self.assertIn('"/api/export/profile"', app)
        self.assertIn('"/api/calendar/conflicts"', app)
        self.assertIn("_ABOUT_ALLOWLIST", app)
        self.assertIn("shell=False", app)
        self.assertIn("refusing wildcard bind", app)
        self.assertIn("def would_clobber_committed_napkin", source("napkin_sync.py"))
        db = source("db.py")
        self.assertIn("def titles_are_similar", db)
        self.assertIn("idx_calendar_events_date", db)
        self.assertIn("idx_tasks_due_date", db)
        self.assertIn("def prune_api_usage", db)


class NapkinIssuesLogicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import db
        db.init_db()

    def test_weekly_events_hide_until_last_two_days(self):
        import napkin_issues
        today = date(2026, 9, 19)
        far = {"date": (today + timedelta(days=10)).isoformat(), "rrule": "FREQ=WEEKLY"}
        soon = {"date": (today + timedelta(days=2)).isoformat(), "rrule": "FREQ=WEEKLY"}
        self.assertFalse(napkin_issues.event_is_actionable(far, today))
        self.assertTrue(napkin_issues.event_is_actionable(soon, today))

    def test_bets_forfeit_into_pool(self):
        import db
        import napkin_issues
        task_id = db.insert_task("Bet forfeit target", due_date="2026-09-01")
        placed = napkin_issues.place_bet(task_id, "2026-09-01", 25)
        self.assertTrue(placed.get("ok"))
        settled = napkin_issues.settle_bets("2026-09-19")
        self.assertGreaterEqual(settled["pool"], 25)
        self.assertTrue(any(b["status"] == "forfeit" for b in settled["settled"]))

    def test_prerequisite_blocks_until_done(self):
        import db
        import napkin_issues
        parent = db.insert_task("Read chapter")
        child = db.insert_task("Write notes")
        napkin_issues.set_prerequisite(child, parent)
        child_row = db.get_task(child)
        self.assertTrue(napkin_issues.task_is_blocked(child_row))
        db.update_task(parent, status="done")
        child_row = db.get_task(child)
        self.assertFalse(napkin_issues.task_is_blocked(child_row))

    def test_recurring_event_materializes_weekly(self):
        import napkin_issues
        result = napkin_issues.add_recurring_event(
            "Studio night", "2026-09-21", "19:00", "21:00", weekday=0, weeks=4,
        )
        self.assertTrue(result.get("ok"))
        self.assertEqual(result["count"], 4)
        self.assertTrue(result.get("series_id"))

    def test_complete_calendar_event(self):
        import db
        import napkin_issues
        eid = db.insert_calendar_event("Office hours", "2026-09-19", "10:00", "11:00", None, "")
        result = napkin_issues.complete_calendar_event(eid)
        self.assertTrue(result.get("ok"))
        row = db.get_calendar_event(eid)
        self.assertEqual(row.get("status"), "done")

    def test_similar_title_slot_is_deduped(self):
        import db
        first = db.insert_calendar_event("DEMO-UA 101 Exam", "2026-10-20", "09:00", "11:00", None, "")
        second = db.insert_calendar_event("DEMO-UA 101 Exam", "2026-10-20", "09:00", "11:00", None, "")
        self.assertEqual(first, second)
        other = db.insert_calendar_event("Read AI paper", "2026-10-20", "09:00", "14:00", None, "")
        self.assertNotEqual(first, other)
        self.assertTrue(db.titles_are_similar("Harkness (Mon)", "Harkness"))
        self.assertFalse(db.titles_are_similar("Harkness (Mon)", "Seminar (Mon)"))

    def test_recurring_stops_at_term_end(self):
        import napkin_issues
        result = napkin_issues.add_recurring_event(
            "Calculus", "2026-09-21", "09:00", "10:30", weekday=0, weeks=40,
            end_date="2026-12-14",
        )
        self.assertTrue(result.get("ok"))
        self.assertEqual(result["end_date"], "2026-12-14")
        self.assertLessEqual(result["count"], 13)
        uncapped = napkin_issues.add_recurring_event(
            "Open studio", "2026-09-21", "19:00", "21:00", weekday=0, weeks=40,
        )
        self.assertLessEqual(uncapped["count"], 16)

    def test_instance_sync_push_pull_merges_bundle(self):
        import db
        import napkin_issues
        db.insert_task("Sync source task", due_date=None)
        db.insert_calendar_event("Sync source event", "2026-11-02", "13:00", "14:00", None, "")
        pushed = napkin_issues.push_instance_sync(role="server")
        self.assertTrue(pushed.get("ok"))
        self.assertGreaterEqual(pushed["counts"]["tasks"], 1)
        pulled = napkin_issues.pull_instance_sync()
        self.assertTrue(pulled.get("ok"))
        self.assertGreaterEqual(pulled.get("skipped", 0), 1)
        titles = {t.get("title") for t in db.list_tasks()}
        self.assertIn("Sync source task", titles)

    def test_empty_due_date_stays_empty(self):
        import db
        task_id = db.insert_task("Indefinite writing", urgency="high")
        row = db.get_task(task_id)
        self.assertIsNone(row.get("due_date"))
        self.assertTrue(row.get("deadline_dismissed"))

    def test_loot_quiet_mode(self):
        import napkin_issues
        quiet = napkin_issues.loot_quiet_mode()
        self.assertEqual(quiet["max_daily_chests"], 1)
        self.assertTrue(quiet["hide_ticket_window"])
        self.assertEqual(quiet["road_chest_every"], 3)

    def test_python_parses(self):
        for rel in ("napkin_issues.py", "agent.py", "app.py", "db.py"):
            ast.parse(source(rel))

    def test_export_profile_conflicts_and_wildcard_bind(self):
        import json
        import os
        import subprocess
        import sys
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os
from pathlib import Path
import db
from app import app, _resolve_bind_host

db.init_db()
db.save_settings({"user_profile": "public-ok", "pronote_password": "secret-school"})
db.insert_calendar_event("Overlap A", "2099-06-01", "10:00", "11:00", None, None)
client = app.test_client()
about = client.get("/api/about").get_json()
export = client.get("/api/export/profile").get_json()
conflicts = client.get("/api/calendar/conflicts?date=2099-06-01&start_time=10:30&end_time=11:30&title=Other")
pushed = client.post("/api/sync/push", json={"role": "server"}).get_json()
pulled = client.post("/api/sync/pull", json={}).get_json()
os.environ["FLASK_HOST"] = "0.0.0.0"
os.environ.pop("WAYPOINT_TAILSCALE", None)
host = _resolve_bind_host()
print(json.dumps({
    "about_profile": about.get("user_profile"),
    "about_pronote": about.get("pronote_password"),
    "export_profile": export.get("profile"),
    "export_activity": isinstance(export.get("activity"), list),
    "conflict_overlaps": len((conflicts.get_json() or {}).get("overlaps") or []),
    "push_ok": pushed.get("ok"),
    "pull_ok": pulled.get("ok"),
    "host": host,
}))
"""
            env = dict(os.environ)
            env["WAYPOINT_DATA_DIR"] = tmp
            env["PLANNER_DB_PATH"] = str(Path(tmp) / "planner.db")
            env["NAPKIN_AUTO_COMMIT"] = "false"
            env["WAYPOINT_TAILSCALE_RETRY_ATTEMPTS"] = "1"
            env["WAYPOINT_TAILSCALE_RETRY_DELAY"] = "0"
            proc = subprocess.run(
                [sys.executable, "-c", script],
                cwd=str(ROOT),
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["about_profile"], "public-ok")
            self.assertIsNone(payload["about_pronote"])
            self.assertEqual(payload["export_profile"], "public-ok")
            self.assertTrue(payload["export_activity"])
            self.assertGreaterEqual(payload["conflict_overlaps"], 1)
            self.assertTrue(payload["push_ok"])
            self.assertTrue(payload["pull_ok"])
            self.assertEqual(payload["host"], "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
