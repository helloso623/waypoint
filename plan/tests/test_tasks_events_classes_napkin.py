"""Contracts for leftover Tasks / Events / Classes napkin items."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class TasksEventsClassesNapkin(unittest.TestCase):
    def test_tasks_date_drag_keyboard_undo_and_classify(self):
        tasks = source("static/js/tasks.js")
        self.assertIn("function wireTaskDateDrag(", tasks)
        self.assertIn("function tskWireDateKeyboard(", tasks)
        self.assertIn("function tskActionToast(", tasks)
        self.assertIn("tsk-undo-toast", tasks)
        self.assertIn("tsk-keyword-chip", tasks)
        self.assertIn("task-classify-all", tasks)
        self.assertIn("function tskBucketOf(", tasks)
        self.assertIn("function tskHomeworkDeferred(", tasks)
        self.assertIn("Later schoolwork", tasks)
        self.assertIn("not work yet", tasks)
        self.assertIn("task-edit-deadline-kind", tasks)
        self.assertIn("definite", tasks)
        self.assertIn("indefinite", tasks)
        self.assertIn("task-napkin-add-all", tasks)
        self.assertIn("/api/napkin/compile", tasks)
        self.assertIn("/api/repo/search", tasks)
        self.assertIn("task-place-hours", tasks)
        self.assertIn('CALENDAR_VIEW = "hours"', tasks)
        self.assertIn("function tskOpenEstimateGame(", tasks)
        self.assertIn("function tskWireEnterAsDone(", tasks)
        self.assertIn("Replan remaining", tasks)
        self.assertIn("/api/tasks/rollover", tasks)
        self.assertIn("task-bucket-game", tasks)
        self.assertIn("tsk-always-bar", tasks)

    def test_events_weekly_zoom_overlap_and_cancel_day(self):
        events = source("static/js/events.js")
        self.assertIn("function evtIsWeeklyHidden(", events)
        self.assertIn("function evtIsActionable(", events)
        self.assertIn("/api/events/actionable", events)
        self.assertIn("evt-join", events)
        self.assertIn("Zoom / meeting URL", events)
        self.assertIn("function evtWarnOverlaps(", events)
        self.assertIn("/api/calendar/check", events)
        self.assertIn("evt-overlap-warn", events)
        self.assertIn("evt-day-chip", events)
        self.assertIn("function evtCancelInstance(", events)
        self.assertIn("Paint still works", events)
        self.assertIn("evt-toggle-weekly", events)

    def test_classes_homework_defer_and_join(self):
        classes = source("static/js/classes.js")
        self.assertIn("function classHomeworkDeferred(", classes)
        self.assertIn("not work yet", classes)
        self.assertIn("cls-join", classes)
        self.assertIn("/api/calendar/check", classes)
        self.assertIn("last two days", classes)
        self.assertIn("cls-open-task", classes)
        self.assertIn("horizon_weeks", classes)
        self.assertIn("cls-grade-item", classes)
        self.assertIn('id="classes-nyu-sync"', classes)
