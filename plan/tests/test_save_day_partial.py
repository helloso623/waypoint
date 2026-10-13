"""save_day must not null out metrics when a sparse quiet payload arrives."""

import os
import tempfile
import unittest
from pathlib import Path


class SaveDayPartialTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        os.environ["WAYPOINT_DATA_DIR"] = self._tmpdir.name
        # Fresh import against the temp data dir.
        import importlib
        import db
        importlib.reload(db)
        self.db = db
        self.db.init_db()

    def tearDown(self):
        self._tmpdir.cleanup()

    def test_sparse_update_preserves_existing_metrics(self):
        self.db.save_day(
            "2099-01-01",
            {
                "happiness": 7,
                "volatility": 2,
                "motivation": 8,
                "focus": 6,
                "work_time": 4,
                "effective_work_time": 3,
                "sports": 1,
                "eating": 5,
                "notes": "kept",
            },
            {},
        )
        # Quiet leave race: only notes key present as empty, or empty metrics entirely.
        self.db.save_day("2099-01-01", {}, {})
        metrics = self.db.get_day("2099-01-01")["metrics"]
        self.assertEqual(metrics["happiness"], 7)
        self.assertEqual(metrics["notes"], "kept")

        self.db.save_day("2099-01-01", {"notes": "edited"}, {})
        metrics = self.db.get_day("2099-01-01")["metrics"]
        self.assertEqual(metrics["happiness"], 7)
        self.assertEqual(metrics["motivation"], 8)
        self.assertEqual(metrics["notes"], "edited")


if __name__ == "__main__":
    unittest.main()
