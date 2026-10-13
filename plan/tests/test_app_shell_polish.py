"""Contracts for the product-shell polish: empty states, no blank flash, one nav rail."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class AppShellPolishTests(unittest.TestCase):
    def test_shared_empty_state_and_busy_bar(self):
        core = source("static/js/core.js")
        css = source("static/css/app.css")
        html = source("static/index.html")
        self.assertIn("function emptyStateHtml(", core)
        self.assertIn("function setMainBusy(", core)
        self.assertIn("setMainBusy(true)", core)
        self.assertIn("setMainBusy(false)", core)
        self.assertNotIn('main.style.opacity = "0";\n    if (crossingHome) main.style.transform = "scale(0.94)"', core)
        self.assertIn('id="main-progress"', html)
        self.assertIn(".empty-state", css)
        self.assertIn(".main-progress", css)
        self.assertIn("#main[aria-busy=\"true\"]", css)

    def test_first_run_surfaces_have_ctas(self):
        agent = source("static/js/agent.js")
        companion = source("static/js/companion.js")
        hub = source("static/js/hub.js")
        today = source("static/js/today.js")
        prompts = source("static/js/misc.js")
        self.assertIn('ctaId: "agent-empty-cta"', agent)
        self.assertIn("empty-state-cta", source("static/js/core.js"))
        self.assertIn("function companionEmptyHtml", companion)
        self.assertIn("data-companion-starter", companion)
        self.assertNotIn("scoreRouteStrength", companion[companion.index("function companionEmptyHtml"):companion.index("function renderMessages")])
        self.assertIn('id="hub-empty-add"', hub)
        self.assertIn('id="pln-rail-empty-add"', today)
        self.assertIn("PROMPT_STARTERS", prompts)
        self.assertIn("prompts-page-blank", prompts)

    def test_launcher_intention_is_hover_only(self):
        css = source("static/css/app.css")
        self.assertIn(".launcher-card:hover .launcher-card-intention", css)
        self.assertIn("max-height: 0;", css[css.index(".launcher-card-intention {"):css.index(".launcher-card:hover .launcher-card-intention")])

    def test_page_intent_lives_in_css(self):
        core = source("static/js/core.js")
        css = source("static/css/app.css")
        self.assertNotIn('style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;', core)
        self.assertIn(".page-intent.page-intent-compact", css)
        self.assertIn('page-intent-details"${expanded ? "" : " hidden"}', core)

    def test_tasks_and_notes_use_toasts(self):
        self.assertNotIn("window.alert(", source("static/js/tasks.js"))
        self.assertNotIn("window.alert(", source("static/js/notes.js"))


if __name__ == "__main__":
    unittest.main()
