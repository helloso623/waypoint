"""Deleting a calendar event must be undoable.

It used to be a hard DELETE with no record_deletion(), so calendar events were the one
deletable entity that never reached the trash. The practical consequence was that any bulk
cleanup could only be made safe by taking a manual database backup first.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["PLANNER_DB_PATH"] = str(Path(tempfile.mkdtemp()) / "trash_test.db")

import db


class CalendarTrashTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()

    def _make(self, title="ZZTEST event"):
        return db.insert_calendar_event(title, "2026-10-01", "09:00", "10:00", None, "notes here")

    def test_delete_puts_the_event_in_the_trash(self):
        event_id = self._make("ZZTEST to trash")
        db.delete_calendar_event(event_id)
        self.assertIsNone(db.get_calendar_event(event_id))
        rows = [t for t in db.list_trash()
                if t["entity_type"] == "calendar_event" and t["label"] == "ZZTEST to trash"]
        self.assertEqual(len(rows), 1)

    def test_restore_brings_the_event_back_intact(self):
        event_id = self._make("ZZTEST to restore")
        db.delete_calendar_event(event_id)
        trash_id = next(t["id"] for t in db.list_trash()
                        if t["entity_type"] == "calendar_event" and t["label"] == "ZZTEST to restore")
        db.restore_deletion(trash_id)
        back = db.get_calendar_event(event_id)
        self.assertIsNotNone(back)
        self.assertEqual(back["title"], "ZZTEST to restore")
        self.assertEqual(back["start_time"], "09:00")
        self.assertEqual(back["notes"], "notes here", "the whole row must survive the round trip")

    def test_calendar_event_is_a_known_restore_target(self):
        """restore_deletion silently does nothing for an entity_type missing from this map."""
        self.assertEqual(db.RESTORE_TABLES.get("calendar_event"), "calendar_events")

    def test_deleting_a_missing_event_does_not_raise(self):
        db.delete_calendar_event(999999)


if __name__ == "__main__":
    unittest.main()
