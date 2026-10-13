"""Lightweight source and pure-JS contracts for the focused polish wave."""

import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "static" / "js"


def run_node(script: str):
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


class PolishWaveContractTests(unittest.TestCase):
    def test_task_rail_search_ignores_status_filter_and_rebuilds(self):
        path = JS / "today.js"
        source = path.read_text(encoding="utf-8")
        script = f"""
const fs = require("fs");
const vm = require("vm");
const context = {{
  console, Date, setTimeout, clearTimeout, window: {{}}, document: {{}},
  escapeHtml: value => String(value),
}};
vm.createContext(context);
vm.runInContext(fs.readFileSync({json.dumps(str(path))}, "utf8"), context);
process.stdout.write(vm.runInContext(`(() => {{
  PLN_RAIL_FILTER = "due_today";
  PLN_RAIL_SEARCH = "match";
  const matches = plnFilterTasks([
    {{id: 1, title: "Completed match", status: "done"}},
    {{id: 2, title: "Other match", status: "open", due_date: "2099-05-01"}},
    {{id: 3, title: "Nope", status: "open", due_date: "2099-01-01"}}
  ], "2099-01-01").map(task => task.id);
  PLN_RAIL_SEARCH = "";
  CURRENT_DATE = "2099-01-01";
  const filtered = plnFilterTasks([
    {{id: 1, title: "Due", status: "open", due_date: "2099-01-01"}},
    {{id: 2, title: "Later", status: "open", due_date: "2099-05-01"}}
  ], "2099-01-01").map(task => task.id);
  return JSON.stringify({{matches, filtered}});
}})()`, context));
"""
        payload = run_node(script)
        self.assertEqual(payload["matches"], [1, 2])
        self.assertEqual(payload["filtered"], [1])
        self.assertIn("list.innerHTML = buildPlannerRailCards(", source)
        self.assertIn("}, 120);", source)
        self.assertIn('e.key !== "Escape"', source)
        self.assertIn('aria-label="Happiness ${n}"', source)
        self.assertIn('aria-label="Energy ${n}"', source)

    def test_numeric_practice_answers_accept_trailing_units(self):
        path = JS / "practice.js"
        source = path.read_text(encoding="utf-8")
        start = source.index("function hwParseNumericAnswer(")
        end = source.index("\nfunction hwFormatAnswer(", start)
        function_source = source[start:end]
        payload = run_node(
            f"{function_source}\n"
            'process.stdout.write(JSON.stringify(["5/8 V", "0.625V", "2 kΩ", "3 ohms"].map(hwParseNumericAnswer)));'
        )
        self.assertEqual(payload, [0.625, 0.625, 2, 3])

    def test_goals_toasts_auto_progress_and_empty_cta(self):
        source = (JS / "goals.js").read_text(encoding="utf-8")
        self.assertIn('type="button" class="primary" id="add-goal"', source)
        self.assertIn('id="goal-empty-cta"', source)
        self.assertIn("body: JSON.stringify({ progress_pct: null })", source)
        self.assertIn('showToast("Back to calculated progress", "good")', source)
        self.assertIn("updateGoalCardProgress(card)", source)
        self.assertNotIn("window.alert(", source)

    def test_toast_aliases_and_accessibility_contract(self):
        source = (JS / "misc.js").read_text(encoding="utf-8")
        self.assertIn('bad: "warn", error: "warn", warning: "warn"', source)
        self.assertIn('root.setAttribute("role", "status")', source)
        self.assertIn('toast.setAttribute("aria-live", "polite")', source)

    def test_parallel_and_i18n_polish_contracts(self):
        parallel = (JS / "parallel.js").read_text(encoding="utf-8")
        inspect = parallel[
            parallel.index("function rplRenderInventoryInspect("):
            parallel.index("\nfunction rplRenderResourcesBlock(", parallel.index("function rplRenderInventoryInspect("))
        ]
        self.assertNotIn("<strong>Id:</strong>", inspect)
        self.assertIn('const storyOpenAttr = "";', parallel)

        i18n = (JS / "i18n.js").read_text(encoding="utf-8")
        self.assertIn('"hud.calmShort": "Calm"', i18n)
        self.assertIn('"hud.calmShort": "Calme"', i18n)
        self.assertIn('t("hud.calmShort")', i18n)
        self.assertNotIn('t("hud.calm").split(" ")[0]', i18n)


if __name__ == "__main__":
    unittest.main()
