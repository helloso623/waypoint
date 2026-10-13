"""Grok E leftover orchestra: Parallel chrome rework, story keys left intact."""
from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraEParallelChromeTests(unittest.TestCase):
    def test_atelier_css_unique_stage_ticket_inventory_selectors(self):
        css = source("static/css/parallel_atelier.css")
        self.assertIn(".rpl-parchment-stage", css)
        self.assertIn(".rpl-choice-ticket", css)
        self.assertIn(".rpl-ticket-list", css)
        self.assertIn(".rpl-inv-cabinet", css)
        self.assertIn(".rpl-cabinet-drawer", css)
        self.assertIn(".rpl-party-plate", css)
        self.assertIn(".wp-parallel-screen", css)
        self.assertNotRegex(
            css,
            r"content:\s*['\"][^'\"]*[\U0001F300-\U0001FAFF]",
            "atelier chrome must not use emoji content",
        )

    def test_parallel_js_rpl_and_wp_parallel_class_names(self):
        js = source("static/js/parallel.js")
        self.assertIn("rpl-", js)
        self.assertIn("wp-parallel-", js)
        self.assertIn("wp-parallel-screen", js)
        self.assertIn("rpl-parchment-stage", js)
        self.assertIn("rpl-choice-ticket", js)
        self.assertIn("rpl-inv-cabinet", js)
        self.assertIn("rpl-party-plate", js)
        self.assertIn('data-rpl-main-tab="${id}"', js)
        self.assertIn('["home", "Home"]', js)
        self.assertIn('["play", "Play"]', js)
        self.assertIn('["inventory", "Inventory"]', js)
        self.assertIn('["shop", "Shop"]', js)
        self.assertIn('["map", "Map"]', js)
        for screen in ("home", "play", "inventory", "shop", "map"):
            self.assertIn(f'data-rpl-screen="{screen}"', js)

    def test_parallel_js_does_not_delete_story_keys(self):
        js = source("static/js/parallel.js")
        for key in (
            "pending_choices",
            "world_date",
            "inventory",
            "characters",
            "quests",
            "beat_summary",
            "stakes_line",
        ):
            self.assertIn(key, js)
        self.assertNotIn("delete RPL_STATE", js)
        self.assertNotRegex(
            js,
            r"delete\s+(RPL_STATE|player|state)\.(inventory|characters|quests|pending_choices|world_date)",
        )
        self.assertIn('const storyOpenAttr = "";', js)
        self.assertIn("typeof window.wpLocalImage", js)
        self.assertNotIn("<strong>Id:</strong>", js)

    def test_parallel_life_chrome_api_keeps_story_helpers(self):
        py = source("parallel_life.py")
        self.assertIn("def chrome_party(", py)
        self.assertIn("def chrome_shop_stalls(", py)
        self.assertIn('"party": chrome_party(state)', py)
        self.assertIn('"shop_stalls": chrome_shop_stalls(state)', py)
        tree = ast.parse(py)
        names = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
        for kept in (
            "_characters_in_scene",
            "_player_facing_character",
            "state_summary",
            "get_map_info",
            "_gm_charter",
            "_world_bible_excerpt",
        ):
            self.assertIn(kept, names)

    def test_parallel_life_chrome_party_passes_existing_names(self):
        import importlib
        import os
        import sys
        import tempfile

        sys.path.insert(0, str(ROOT))
        tmp = tempfile.TemporaryDirectory()
        os.environ["WAYPOINT_DATA_DIR"] = tmp.name
        os.environ["PLANNER_DB_PATH"] = str(Path(tmp.name) / "planner.db")
        try:
            import db
            import parallel_life

            importlib.reload(db)
            db.init_db()
            importlib.reload(parallel_life)
            state = {
                "player": {"name": "Alex", "location": "The workshop"},
                "characters": [
                    {
                        "id": "mc",
                        "name": "Alex",
                        "role": "player_character",
                        "location": "The workshop",
                    },
                    {
                        "id": "ally",
                        "name": "Existing Ally",
                        "role": "companion",
                        "location": "The workshop",
                        "known_to_player": True,
                    },
                ],
            }
            party = parallel_life.chrome_party(state)
            names = {p.get("name") for p in party}
            self.assertIn("Alex", names)
            self.assertIn("Existing Ally", names)
            self.assertNotIn("Invented Merchant", names)
            summary = parallel_life.state_summary(state)
            self.assertIn("party", summary)
            self.assertIn("shop_stalls", summary)
            self.assertEqual(summary["player"]["location"], "The workshop")
        finally:
            tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
