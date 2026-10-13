"""Focused regressions for actionable choice cards and Practice flop guidance."""

import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def asset(name):
    return (ROOT / "static" / "js" / name).read_text(encoding="utf-8")


def node_eval(source, expression):
    result = subprocess.run(
        ["node", "-e", f"{source}\nprocess.stdout.write(JSON.stringify({expression}));"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return json.loads(result.stdout)


class ChoiceActionTests(unittest.TestCase):
    def test_agent_choice_fallback_only_applies_without_tools_or_confirmations(self):
        js = asset("agent.js")
        block = js[js.index("function agentChoiceItems("):js.index("function agentFollowupsHtml(")]
        no_tool = node_eval(
            block,
            'agentApplyChoiceNoToolFallback({reply:"Here is the plan", actions:[], confirmations:[]}, true)',
        )
        with_tool = node_eval(
            block,
            'agentApplyChoiceNoToolFallback({reply:"Done", actions:[{tool:"add_task"}]}, true)',
        )
        with_confirmation = node_eval(
            block,
            'agentApplyChoiceNoToolFallback({reply:"Confirm", confirmations:[{tool:"add_task"}]}, true)',
        )
        self.assertIn("did not run a tool", no_tool["reply"])
        self.assertEqual(no_tool["followups"][0], "Do it now")
        self.assertEqual(with_tool["reply"], "Done")
        self.assertNotIn("followups", with_tool)
        self.assertEqual(with_confirmation["reply"], "Confirm")

    def test_companion_choice_uses_normal_route_and_refreshes_successful_tools(self):
        js = asset("companion.js")
        # Instant answers may force "fast"; choice followups stay pinned to normal for Confirm chips.
        self.assertIn('isChoiceFollowup ? "normal"', js)
        self.assertIn('forcedRoute === "fast"', js)
        self.assertIn("agentRefreshAffectedViews(result.actions || [])", js)
        self.assertIn("Turning your choice into an action", js)


class PracticeFlopTests(unittest.TestCase):
    def test_local_flop_reasons_are_concrete_and_only_for_low_scores(self):
        js = asset("practice.js")
        block = js[js.index("function praxFlopReasons("):js.index("function praxOnlineAiAvailable(")]
        low = node_eval(
            block,
            'praxFlopReasons({key:"math", score:2, maxScore:5, difficulty:5, stats:{maxCombo:1}})',
        )
        recovered = node_eval(
            block,
            'praxFlopReasons({key:"math", score:3, maxScore:5, difficulty:5, stats:{maxCombo:1}})',
        )
        self.assertIn("3 of 5 calculations", low[0])
        self.assertGreaterEqual(len(low), 2)
        self.assertEqual(recovered, [])

    def test_flop_panel_can_open_agent_with_context_and_has_offline_copy(self):
        js = asset("practice.js")
        self.assertIn("Why this round flopped", js)
        self.assertIn("Explain with AI in Agent", js)
        self.assertIn("askAgentAbout(prompt)", js)
        self.assertIn("Local reasons only", js)


if __name__ == "__main__":
    unittest.main()
