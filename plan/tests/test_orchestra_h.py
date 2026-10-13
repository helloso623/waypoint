"""Orchestra H leftover contracts: local forecast honesty + infinite image atelier."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraHTests(unittest.TestCase):
    def test_images_generate_route_in_app(self):
        py = source("app.py")
        self.assertIn("/api/images/generate", py)
        self.assertIn("def api_images_generate", py)
        self.assertIn("_atelier_local_image_data_url", py)
        self.assertIn("_atelier_try_openai_image_once", py)

    def test_wp_local_image_in_atelier(self):
        js = source("static/js/image_atelier.js")
        self.assertIn("wpLocalImage", js)
        self.assertIn("window.wpLocalImage", js)
        self.assertIn("data-wp-generate-image", js)
        self.assertIn("/api/images/generate", js)

    def test_image_atelier_linked_from_index(self):
        html = source("static/index.html")
        self.assertIn("image_atelier.js", html)
        self.assertRegex(html, r'<script[^>]*src="/js/image_atelier\.js"', "image_atelier.js must be loaded by index.html")

    def test_trends_still_has_mae_and_forecast(self):
        js = source("static/js/trends.js")
        self.assertIn("holdoutMae", js)
        self.assertIn("Hold-out MAE", js)
        self.assertIn("predictForwardDetailed", js)
        self.assertIn("forecast", js)
        self.assertIn("MAE", js)
        self.assertIn("Fill gaps", js)
        self.assertIn("renderLocalForecastHtml", js)
        self.assertIn("7-day", js)
        self.assertIn("linearInterpolateNulls", js)


if __name__ == "__main__":
    unittest.main()
