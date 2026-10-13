"""Unit + static checks for Blueprint quest/minigame foundations."""

from __future__ import annotations

import sys
import unittest
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import blueprint_quests  # noqa: E402


def _data(source, source_port, target, target_port):
    return {
        "from": source,
        "fromPort": source_port,
        "to": target,
        "toPort": target_port,
        "kind": "data",
    }


def _exec(source, source_port, target):
    return {
        "from": source,
        "fromPort": source_port,
        "to": target,
        "toPort": "exec",
        "kind": "exec",
    }


class BlueprintQuestTests(unittest.TestCase):
    def test_calculator_quest_grades_preview_style_fixtures(self):
        graph = deepcopy(blueprint_quests.QUESTS["calculator"]["starterGraph"])
        graph["edges"] = [
            _exec("start", "next", "gate"),
            _exec("gate", "pass", "answer"),
            _data("input_a", "result", "operator", "a"),
            _data("input_b", "result", "operator", "b"),
            _data("operator", "result", "answer", "expression"),
        ]

        result = blueprint_quests.grade_quest("calculator", graph)

        self.assertTrue(result["passed"])
        self.assertEqual([fixture["actual"] for fixture in result["fixtures"]], [5, 6, 3.75])

    def test_calculator_quest_reports_disallowed_nodes_and_missing_wires(self):
        graph = deepcopy(blueprint_quests.QUESTS["calculator"]["starterGraph"])
        graph["nodes"].append(
            {"id": "unsafe", "type": "run_shell", "x": 0, "y": 0, "params": {}}
        )

        result = blueprint_quests.grade_quest("calculator", graph)

        self.assertFalse(result["passed"])
        self.assertTrue(
            any(
                check["name"] == "Known parts only"
                and "run_shell" in check["detail"]
                and not check["passed"]
                for check in result["checks"]
            )
        )
        self.assertTrue(any(not fixture["passed"] for fixture in result["fixtures"]))

    def test_circuit_quest_checks_series_resistor_and_truth_table(self):
        graph = deepcopy(blueprint_quests.QUESTS["and_led_circuit"]["starterGraph"])
        graph["edges"] = [
            _data("switch_a", "signal", "and_gate", "a"),
            _data("switch_b", "signal", "and_gate", "b"),
            _data("and_gate", "signal", "resistor", "signal"),
            _data("resistor", "signal", "led", "signal"),
        ]

        result = blueprint_quests.grade_quest("and_led_circuit", graph)

        self.assertTrue(result["passed"])
        self.assertEqual(
            [fixture["actual"] for fixture in result["fixtures"]],
            [False, False, False, True],
        )
        self.assertIn("specs", blueprint_quests.QUESTS["and_led_circuit"]["parts"]["74hc08"])

    def test_blueprint_quest_ui_is_loaded_and_has_entry_points(self):
        index = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        quest_js = (ROOT / "static" / "js" / "blueprint_quests.js").read_text(encoding="utf-8")
        automation_js = (ROOT / "static" / "js" / "automation.js").read_text(encoding="utf-8")

        self.assertRegex(index, r'<script[^>]*src="/js/blueprint_quests\.js"', "blueprint_quests.js must be loaded by index.html")
        self.assertIn("blueprint-quest-panel", quest_js)
        self.assertIn("blueprint-part-spec", quest_js)
        self.assertIn('id="studio-tb-quests"', automation_js)
        self.assertIn('id="studio-tb-grade-quest"', automation_js)


if __name__ == "__main__":
    unittest.main()
