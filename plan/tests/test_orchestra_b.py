"""Source contracts for Grok B: Paint-tab week board, 52-week picker, travel paint."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraBPaintWeekTests(unittest.TestCase):
    def test_paint_week_toolbar_and_52_week_picker(self):
        today = source("static/js/today.js")
        self.assertIn("function buildPaintWeekToolbar(", today)
        self.assertIn("pln-paint-week-select", today)
        self.assertIn('id="pln-paint-week-select"', today)
        self.assertIn("Array.from({ length: 24 }", today)
        self.assertIn("Array.from({ length: 52 }", today)
        self.assertIn("pln-paint-week-prev", today)
        self.assertIn("pln-paint-week-next", today)
        self.assertIn("function wirePaintTab(", today)
        self.assertIn("function wirePaintToolsAndWeekNav(", today)

    def test_paint_tab_omits_today_events_chrome(self):
        today = source("static/js/today.js")
        self.assertIn("paint-week-only", today)
        self.assertIn("tdy-paint-tools", today)
        self.assertIn('ACTIVE_TAB === "Paint" ? "" : buildPlannerModeChips()', today)
        self.assertIn('ACTIVE_TAB === "Paint" || (ACTIVE_TAB === "Today" && tdyWeekLayerOn("paint"))', today)
        self.assertIn("function buildTodayWeekPeek(", today)
        self.assertIn('(ACTIVE_TAB === "Paint" ? buildTodayWeekPaint(CURRENT_DATE) : "")', today)
        self.assertIn("tdy-week-peek", today)

    def test_travel_time_change_paint_is_black(self):
        today = source("static/js/today.js")
        self.assertIn("function tdyIsTravelPaint(", today)
        self.assertIn("function tdyTravelPaintColor(", today)
        self.assertIn("#111111", today)
        self.assertIn('key === "travel"', today)
        self.assertIn("time-change", today)
        calendar = source("static/js/calendar.js")
        self.assertIn("function calTravelPaintStyle(", calendar)
        self.assertIn("#111111", calendar)
        self.assertIn("travel", calendar)

    def test_short_events_fill_rest_of_hour(self):
        today = source("static/js/today.js")
        self.assertIn("function tdyEventRestOfHourStyle(", today)
        self.assertIn("tdy-week-paint-event-fill", today)
        calendar = source("static/js/calendar.js")
        self.assertIn("const hourEnd = Math.floor(start / 60) * 60 + 60;", calendar)
        self.assertIn("function calWeekEventBounds(", calendar)

    def test_events_remain_editable_on_today_and_paint(self):
        today = source("static/js/today.js")
        self.assertIn("function plnOpenCommitmentEditor(", today)
        self.assertIn(".pln-event-badge", today)
        self.assertIn("tdy-week-chip", today)
        self.assertIn("function tdyEventQuickFormHtml(", today)
        self.assertIn('TODAY_WEEK_LAYERS.add("events")', today)


if __name__ == "__main__":
    unittest.main()
