"""Source contracts for Grok C leftover orchestra: tasks drag/bets, events editors, classes off events."""
from __future__ import annotations

import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraCSourceTests(unittest.TestCase):
    def test_tasks_date_drag_writes_due_date_with_undo(self):
        tasks = source("static/js/tasks.js")
        self.assertIn("function wireTaskDateDrag(", tasks)
        self.assertIn("tskSetDueDate", tasks)
        self.assertIn("due_date", tasks)
        self.assertIn("tsk-undo-toast", tasks)
        self.assertIn("Undo", tasks)
        drag = tasks[tasks.index("function wireTaskDateDrag("):]
        self.assertIn("tskSetDueDate", drag)
        self.assertIn("text/task-id", drag)

    def test_tasks_bets_and_forfeit_ui(self):
        tasks = source("static/js/tasks.js")
        self.assertIn("task-bet", tasks)
        self.assertIn("/api/bets", tasks)
        self.assertIn("task-forfeit", tasks)
        self.assertIn("tskForfeitMissed", tasks)
        self.assertIn("/api/bets/settle", tasks)
        self.assertIn("task-bet-stake", tasks)

    def test_events_inline_editors_and_weekly_hide(self):
        events = source("static/js/events.js")
        self.assertIn("function evtIsWeeklyHidden(", events)
        self.assertIn('class="event-title"', events)
        self.assertIn('class="event-description"', events)
        self.assertIn("event-notes", events)
        self.assertIn('class="event-url"', events)
        self.assertIn("event-lane", events)
        self.assertIn("Work vs passion", events)
        self.assertIn("event-start-time", events)
        self.assertIn("event-date", events)
        self.assertIn("id=\"events-select\"", events)
        self.assertIn("id=\"events-clear\"", events)
        self.assertIn("tdy-select-edit-events", events)
        self.assertNotIn('start.value = "09:00"', events)
        render = events[events.index("async function renderEvents("):]
        self.assertIn("evtIsWeeklyHidden", render)

    def test_classes_stay_off_event_calendar(self):
        classes = source("static/js/classes.js")
        events = source("static/js/events.js")
        self.assertIn("function classIsCalendarClass(", classes)
        self.assertIn("function classShouldListAsEvent(", classes)
        self.assertIn("kind: \"class\"", classes)
        self.assertIn("not listed as an event", classes)
        self.assertIn("e.kind !== \"class\" && !e.class_id", events)


class OrchestraCLogicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import db
        db.init_db()

    def test_forfeit_missed_task_puts_coins_in_pool(self):
        import db
        import napkin_issues
        past = (date.today() - timedelta(days=3)).isoformat()
        task_id = db.insert_task("ZZTEST orchestra forfeit", due_date=past)
        result = napkin_issues.forfeit_missed_task(task_id, coins=12)
        self.assertTrue(result.get("ok"))
        self.assertGreaterEqual(result.get("pool") or 0, 12)
        db.delete_task(task_id)

    def test_weekly_hidden_until_last_two_days(self):
        import napkin_issues
        today = date(2026, 9, 20)
        far = {"date": (today + timedelta(days=10)).isoformat(), "rrule": "FREQ=WEEKLY"}
        soon = {"date": (today + timedelta(days=2)).isoformat(), "rrule": "FREQ=WEEKLY"}
        self.assertFalse(napkin_issues.event_is_actionable(far, today))
        self.assertTrue(napkin_issues.event_is_actionable(soon, today))


if __name__ == "__main__":
    unittest.main()
