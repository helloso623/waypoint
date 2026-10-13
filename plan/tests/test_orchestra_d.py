"""Source contracts for Grok D leftover orchestra: calendar CRUD, escalate, fallback."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraDTests(unittest.TestCase):
    def test_calendar_tool_names_exist_in_agent(self):
        agent = source("agent.py")
        for name in (
            "delete_calendar_event",
            "complete_calendar_event",
            "update_calendar_event",
        ):
            self.assertIn(f'"{name}"', agent)
            self.assertIn(f'name": "{name}"', agent)
        for field in ("start_time", "date", "title", "url", "status", "kind"):
            self.assertIn(f'"{field}"', agent)

    def test_no_auto_time_invention_or_empty_time_guard(self):
        agent = source("agent.py")
        lowered = agent.lower()
        self.assertTrue(
            "empty-time guard" in lowered or "no auto-time invention" in lowered,
            "agent.py must keep an empty-time guard or no auto-time invention comment",
        )
        self.assertIn("never invent a clock time", lowered)
        self.assertIn("def _persist_named_clock", agent)

    def test_escalate_or_retry_harder_symbol(self):
        agent = source("agent.py")
        self.assertTrue(
            "escalate_model" in agent or "retry_harder" in agent,
            "agent.py must expose escalate_model or retry_harder",
        )
        self.assertIn("def escalate_model", agent)
        self.assertIn("def retry_harder", agent)

    def test_fallback_mentioned_in_chat_backends(self):
        backends = source("chat_backends.py")
        self.assertIn("fallback", backends.lower())
        self.assertIn("Do not require Anthropic", backends)


if __name__ == "__main__":
    unittest.main()
