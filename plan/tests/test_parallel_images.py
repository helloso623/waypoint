"""Parallel art must live in the durable data dir and only count as present when the file exists."""
from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24


class ParallelImageCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["WAYPOINT_DATA_DIR"] = self.tmp.name
        os.environ["PLANNER_DB_PATH"] = str(Path(self.tmp.name) / "planner.db")
        import db
        import parallel_life

        importlib.reload(db)
        db.init_db()
        importlib.reload(parallel_life)
        self.db = db
        self.pl = parallel_life

    def tearDown(self):
        self.tmp.cleanup()

    def test_writes_go_to_data_dir_not_gitignored_static(self):
        rel = self.pl._write_static_png("scenes/99.png", PNG)
        path = self.pl.resolve_image_path(rel)
        self.assertIsNotNone(path)
        self.assertTrue(path.is_file())
        self.assertIn("parallel_images", str(path))
        self.assertFalse((self.pl.LEGACY_STATIC / "scenes" / "99.png").exists())

    def test_legacy_static_file_is_copied_into_the_cache(self):
        self.pl.LEGACY_STATIC = Path(self.tmp.name) / "legacy_static"
        legacy = self.pl.LEGACY_STATIC / "scenes" / "7.png"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        legacy.write_bytes(PNG)
        found = self.pl.resolve_image_path("scenes/7.png")
        self.assertIsNotNone(found)
        self.assertTrue(found.is_file())
        self.assertIn("parallel_images", str(found))
        self.assertTrue((self.pl.IMAGE_CACHE_DIR / "scenes" / "7.png").is_file())

    def test_missing_file_is_not_a_cache_hit(self):
        self.assertFalse(self.pl.image_cached("scenes/missing.png"))
        mid = self.db.rp_add_message("gm", "A ruined tower at dusk.")
        self.db.rp_save_scene(mid, f"scenes/{mid}.png")
        msgs = self.pl.annotate_messages_with_scenes(
            self.db.rp_recent_messages_with_scenes(limit=10)
        )
        row = next(m for m in msgs if m["id"] == mid)
        self.assertFalse(row["has_scene"])
        self.assertTrue(row.get("scene_missing"))

    def test_has_scene_true_only_with_file(self):
        mid = self.db.rp_add_message("gm", "A painted harbour.")
        self.pl._write_static_png(f"scenes/{mid}.png", PNG)
        self.db.rp_save_scene(mid, f"scenes/{mid}.png")
        msgs = self.pl.annotate_messages_with_scenes(
            self.db.rp_recent_messages_with_scenes(limit=10)
        )
        row = next(m for m in msgs if m["id"] == mid)
        self.assertTrue(row["has_scene"])


if __name__ == "__main__":
    unittest.main()
