"""Source contracts for Grok H: trends honesty, cart orchestrator, safer emit, vault open."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraTrendsHTests(unittest.TestCase):
    def test_trends_deepens_forecast_honesty(self):
        js = source("static/js/trends.js")
        self.assertIn("linearInterpolateNulls", js)
        self.assertIn("seasonalInterpolateNulls", js)
        self.assertIn("weekday seasonality", js.lower())
        self.assertIn("observed", js)
        self.assertIn("holdoutMae", js)
        self.assertIn("Hold-out MAE", js)
        self.assertIn("Next-month outlook", js)
        self.assertIn("predictForwardDetailed", js)
        self.assertNotIn("urgency", js.lower())
        self.assertNotIn("coin formula", js.lower())

    def test_automation_cart_and_emit_guard(self):
        js = source("static/js/automation.js")
        self.assertIn("function wfSanitizeGraphForEmit", js)
        self.assertIn("function wfParseBuyCommand", js)
        self.assertIn('studioTabBtn("cart", "Cart")', js)
        self.assertIn("/api/cart", js)
        self.assertIn("Nothing is purchased", js)
        self.assertIn("n8n", js)
        self.assertIn("workflow.py", js)
        self.assertIn("JSON.stringify(s)", js)

    def test_repository_obsidian_extension_surface(self):
        js = source("static/js/repository.js")
        self.assertIn("waypointOpenRepository", js)
        self.assertIn("WaypointRepository", js)
        self.assertIn("Obsidian extension", js)
        self.assertIn("use_integration obsidian", js)
        self.assertIn("repo-open-extension-btn", js)


if __name__ == "__main__":
    unittest.main()
