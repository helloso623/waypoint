"""Focused regressions for Today leave-save, Pulse, and importance acceleration."""

import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TODAY_JS = ROOT / "static" / "js" / "today.js"
TASKS_JS = ROOT / "static" / "js" / "tasks.js"
CALENDAR_JS = ROOT / "static" / "js" / "calendar.js"


def node_eval(path: Path, expression: str):
    script = f"""
const fs = require("fs");
const vm = require("vm");
const context = {{
  console,
  Date,
  setTimeout,
  clearTimeout,
  window: {{}},
  document: {{}},
  escapeHtml: value => String(value),
}};
vm.createContext(context);
vm.runInContext(fs.readFileSync({json.dumps(str(path))}, "utf8"), context);
process.stdout.write(vm.runInContext({json.dumps(expression)}, context));
"""
    result = subprocess.run(
        ["node", "-e", script],
        check=True,
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    return json.loads(result.stdout)


class TodayP0BehaviorTests(unittest.TestCase):
    def test_importance_click_acceleration_resets_and_preserves_sign(self):
        deltas = node_eval(
            TASKS_JS,
            """JSON.stringify([
              nextTaskImportanceDelta(7, "up", 1000),
              nextTaskImportanceDelta(7, "up", 1500),
              nextTaskImportanceDelta(7, "up", 1900),
              nextTaskImportanceDelta(7, "up", 2200),
              nextTaskImportanceDelta(7, "up", 2400),
              nextTaskImportanceDelta(7, "up", 3201),
              nextTaskImportanceDelta(7, "down", 3300),
              nextTaskImportanceDelta(7, "down", 3500)
            ])""",
        )
        self.assertEqual(deltas, [1, 5, 10, 20, 30, 1, -1, -5])

    def test_compact_pulse_offers_energy_before_happiness(self):
        positions = node_eval(
            TODAY_JS,
            """(() => {
              const html = renderPulseCompactRow({
                pulses: [], today_count: 0, next_allowed_at: null
              }, true);
              return JSON.stringify({
                energy: html.indexOf("pls-compact-energy"),
                happiness: html.indexOf("pls-compact-happiness-row")
              });
            })()""",
        )
        self.assertGreaterEqual(positions["energy"], 0)
        self.assertLess(positions["energy"], positions["happiness"])

    def test_compact_pulse_note_is_rendered_and_wired_to_both_write_paths(self):
        rendered = node_eval(
            TODAY_JS,
            """JSON.stringify(renderPulseCompactRow({
              pulses: [], today_count: 0, next_allowed_at: null
            }, true).includes('id="pls-compact-note"'))""",
        )
        self.assertTrue(rendered)
        source = TODAY_JS.read_text(encoding="utf-8")
        self.assertIn('document.getElementById("pls-compact-save-details")', source)
        self.assertIn("const note = readNote();", source)
        self.assertIn("body.note = readNote();", source)
        self.assertIn('aria-label="Pulse note"', source)

    def test_pulse_save_shows_countdown_and_energy_full_happiness_check(self):
        source = TODAY_JS.read_text(encoding="utf-8")
        self.assertIn("function formatPulseRemaining(", source)
        self.assertIn("function startPulseCountdownTicker(", source)
        self.assertIn("markPulseNoteSavedNow(", source)
        self.assertIn("PULSE_NOTE_SAVE_COOLDOWN_MS", source)
        self.assertIn('id="pls-happiness-check"', source)
        self.assertIn("Energy full — happiness check", source)
        self.assertIn("Note saved · next pulse in", source)
        self.assertIn("data-pls-countdown", source)
        next_at = "2099-01-01T12:00:00.000Z"
        html = node_eval(
            TODAY_JS,
            f"""JSON.stringify(renderPulseCompactRow({{
              pulses: [{{id: 1, happiness: 7, energy: 10, note: "hi", created_at: "2099-01-01T10:00:00.000Z"}}],
              today_count: 1,
              next_allowed_at: {json.dumps(next_at)},
              details_editable: true,
              editable_pulse_id: 1
            }}, true))""",
        )
        self.assertIn("data-pls-countdown=", html)
        self.assertIn("pls-compact-save-details", html)
        remaining = node_eval(
            TODAY_JS,
            """JSON.stringify(formatPulseRemaining(new Date(Date.now() + 125000).toISOString()))""",
        )
        self.assertRegex(remaining, r"^\d+:\d{2}$")

    def test_commitments_are_sorted_clickable_edit_controls(self):
        result = node_eval(
            TODAY_JS,
            """(() => {
              const ordered = sortPlannerDayEvents([
                {id: 3, title: "No time", start_time: null},
                {id: 2, title: "Beta", start_time: "09:00"},
                {id: 1, title: "Alpha", start_time: "09:00"},
                {id: 4, title: "Early", start_time: "07:30"}
              ]).map(item => item.id);
              const html = buildPlannerCommitments("2099-01-01", [
                {id: 8, title: "Editable", date: "2099-01-01", start_time: "10:00"}
              ], []);
              return JSON.stringify({
                ordered,
                button: html.includes('class="pln-commit-chip"'),
                kind: html.includes('data-kind="calendar"'),
                id: html.includes('data-id="8"')
              });
            })()""",
        )
        self.assertEqual(result["ordered"], [4, 1, 2, 3])
        self.assertTrue(result["button"])
        self.assertTrue(result["kind"])
        self.assertTrue(result["id"])

    def test_today_week_modes_are_persistent_editable_and_paintable(self):
        source = TODAY_JS.read_text(encoding="utf-8")
        self.assertIn('id="tdy-week-day"', source)
        self.assertIn('id="tdy-week-events"', source)
        self.assertIn('id="tdy-week-paint"', source)
        self.assertIn('id="tdy-week-paint-sheet"', source)
        self.assertIn('aria-pressed="${paintOn}"', source)
        self.assertIn('localStorage.getItem("todayWeekOpen")', source)
        self.assertIn('localStorage.getItem("todayWeekMode")', source)
        self.assertIn('localStorage.setItem("todayWeekMode"', source)
        self.assertIn("function buildTodayWeekSurface(", source)
        self.assertIn("function buildTodayWeekPaint(", source)
        self.assertIn("function loadWeekPaintHours(", source)
        self.assertIn("WEEK_PAINT_HOURS", source)
        self.assertIn("WEEK_PAINT_DIRTY = new Set()", source)
        self.assertIn("Promise.all(dates.map(day => api(`/api/day/${day}`)))", source)
        self.assertIn('data-week-date="${escapeHtml(day)}"', source)
        self.assertIn('data-week-hour="${hour}"', source)
        self.assertIn("flushWeekPaint({ keepalive: true })", source)
        self.assertIn('class="secondary tdy-week-add"', source)
        self.assertIn("tdy-week-chip", source)
        self.assertIn("plnOpenCommitmentEditor", source)
        self.assertIn('id="save-day"', source)
        # Save lives on the shared canvas, not only the Today header.
        header = source[source.index("function buildTodayHeaderHtml("):source.index("function updateDayGradeBadge(")]
        self.assertNotIn('id="save-day"', header)
        self.assertIn(".pln-event-badge", source[source.index("function wireHourCellInteractions("):])

    def test_leave_autosave_is_keepalive_and_silent(self):
        source = TODAY_JS.read_text(encoding="utf-8")
        self.assertIn('document.addEventListener("visibilitychange"', source)
        self.assertIn('window.addEventListener("beforeunload"', source)
        self.assertIn("keepalive: true", source)
        self.assertNotIn('showToast("day autosaved"', source)
        self.assertNotIn("autosaved ✓", source)

    def test_pulse_success_updates_only_the_pulse_mount(self):
        source = TODAY_JS.read_text(encoding="utf-8")
        start = source.index("function updatePulseUiInPlace(")
        end = source.index("\n}\n", start) + 2
        helper = source[start:end]
        self.assertIn("compact.outerHTML", helper)
        self.assertNotIn("render();", helper)

    def test_history_nav_flushes_today_before_leaving(self):
        core = (ROOT / "static" / "js" / "core.js").read_text(encoding="utf-8")
        self.assertIn("async function navBack()", core)
        self.assertIn("async function navForward()", core)
        self.assertIn('ACTIVE_TAB === "Today"', core)
        self.assertIn("flushTodayAutosave({ keepalive: true })", core)
        today = TODAY_JS.read_text(encoding="utf-8")
        self.assertIn("if (!Object.keys(metrics).length && !Object.keys(hours).length) return;", today)
        self.assertIn("if (notesEl) metrics.notes = notesEl.value || \"\";", today)

    def test_triumph_overlays_queue_instead_of_dropping(self):
        core = (ROOT / "static" / "js" / "core.js").read_text(encoding="utf-8")
        self.assertIn("MOMENT_OF_TRIUMPH_QUEUE", core)
        self.assertIn("MOMENT_OF_TRIUMPH_QUEUE.push", core)
        self.assertIn("MOMENT_OF_TRIUMPH_QUEUE.shift()", core)

    def test_day_complete_waits_for_all_pursuits_and_does_not_block_input(self):
        misc = (ROOT / "static" / "js" / "misc.js").read_text(encoding="utf-8")
        start = misc.index("function gameAwardQuestCompletions(")
        end = misc.index("\nfunction gameTodayComplete()", start)
        completion_flow = misc[start:end]
        self.assertIn("if (gameAllQuestsDone(state)) gameMarkTodayComplete();", completion_flow)
        self.assertIn("alreadyComplete", completion_flow)
        self.assertIn("nonBlocking: true", completion_flow)

    def test_calendar_week_view_contract(self):
        source = CALENDAR_JS.read_text(encoding="utf-8")
        self.assertIn('data-view="week">Week</button>', source)
        self.assertIn('localStorage.getItem("calendarWeekStart")', source)
        self.assertIn('localStorage.setItem("calendarWeekStart"', source)
        self.assertIn("function renderCalendarWeekGrid(", source)
        self.assertIn('class="secondary cal-week-add"', source)
        self.assertIn('class="secondary cal-week-today"', source)
        self.assertIn('document.querySelectorAll(".cal-month-chip-cal, .cal-week-chip")', source)
        self.assertIn("function calWeekEventIsOffHours", source)
        self.assertIn("function calWeekOverlapColumns", source)
        tasks = (ROOT / "static" / "js" / "tasks.js").read_text(encoding="utf-8")
        self.assertIn('if (mode === "manual")', tasks)
        self.assertIn('localStorage.setItem("taskSortMode"', tasks)

    def test_planner_leftover_napkins_are_wired(self):
        today = TODAY_JS.read_text(encoding="utf-8")
        calendar = CALENDAR_JS.read_text(encoding="utf-8")
        self.assertIn("waypointPlannerDate", today)
        self.assertIn("todayDaySnapshotV1", today)
        self.assertIn("todayHourSplitsV1", today)
        self.assertIn("todayMetricsOpen", today)
        self.assertIn("hourSplitMinutes", today)
        self.assertIn("function tdyTimePickHtml(", today)
        self.assertIn("function tdyStopPaint(", today)
        self.assertIn("function tdySendNapkinIssuesToGit(", today)
        self.assertIn("/api/napkin/compile", today)
        self.assertIn('id="tdy-napkin-git"', today)
        self.assertIn('id="tdy-select-move-events"', today)
        self.assertIn("pln-event-remove", today)
        self.assertIn("pln-event-lane-btn", today)
        self.assertIn("pln-event-badge-class", today)
        self.assertIn("tdy-now-marker", today)
        self.assertIn('id="tdy-hour-div"', today)
        self.assertIn("contextmenu", today)
        self.assertIn("function calPaintStripHtml(", calendar)
        self.assertIn("cal-week-nav", calendar)
        self.assertIn("cal-paint-strip", calendar)
        self.assertIn("cal-chip-class", calendar)
        self.assertIn("function calWeekEventBounds(", calendar)
        compact = node_eval(
            TODAY_JS,
            """JSON.stringify(renderPulseCompactRow({
              pulses: [], today_count: 0, next_allowed_at: null
            }, true).includes('value=""'))""",
        )
        self.assertTrue(compact)
        times = node_eval(
            TODAY_JS,
            """JSON.stringify({
              digits: tdyParseTimeMinutes("455"),
              colon: tdyParseTimeMinutes("4:55"),
              format: tdyFormatMinutes(295)
            })""",
        )
        self.assertEqual(times["digits"], 4 * 60 + 55)
        self.assertEqual(times["colon"], 4 * 60 + 55)
        self.assertEqual(times["format"], "04:55")
        color = node_eval(TODAY_JS, """JSON.stringify(importanceColor(80))""")
        self.assertEqual(color, "#c0392b")


if __name__ == "__main__":
    unittest.main()
