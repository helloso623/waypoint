"""Contracts: every cloud AI can run the app, and failed APIs reroute visibly."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class AiFullChargeContracts(unittest.TestCase):
    def test_roles_are_unlocked_for_chatgpt_and_grok(self):
        roles = source("model_roles.py")
        settings = source("static/js/settings.js")
        env = source(".env.example")
        compact = roles.replace(" ", "")
        self.assertIn('"chat":{"auto","claude","openai","grok"}', compact)
        self.assertIn('"planning":{"auto","claude","openai","grok","ollama"}', compact)
        self.assertIn("def fallback_chain(", roles)
        self.assertIn("def provider_ready(", roles)
        self.assertIn("CLOUD_BACKENDS", roles)
        self.assertIn('routeSelect("chat"', settings)
        self.assertIn("route_chat:", settings)
        self.assertIn("route_judgment:", settings)
        self.assertNotIn("Locked to", settings)
        self.assertIn("ROUTE_CHAT=auto", env)
        self.assertIn("walks the rest of the chain", env)

    def test_agent_and_hud_show_who_answered(self):
        agent_js = source("static/js/agent.js")
        misc = source("static/js/misc.js")
        app = source("app.py")
        ai = source("ai.py")
        agent_py = source("agent.py")
        self.assertIn("function agentProviderPillHtml(", agent_js)
        self.assertIn('id="agent-live-provider"', agent_js)
        self.assertIn('localStorage.agentViewMode || "chat"', agent_js)
        self.assertIn('class="agc-tool-catalog"', agent_js)
        self.assertNotIn('class="agc-tool-catalog" open', agent_js)
        self.assertIn("function liveSourceLabel(", misc)
        self.assertIn("hud-live-reroute", misc)
        self.assertIn("live_routing", app)
        self.assertIn("def call_with_fallback(", ai)
        self.assertIn("def mark_live_source(", ai)
        self.assertIn("def live_routing_status(", ai)
        self.assertIn("def _is_auth_error(", ai)
        self.assertIn("def _chat_model_call(", agent_py)
        self.assertIn("chat_backends.complete", agent_py)
        self.assertNotIn("def openai_compatible_complete(", ai)
        self.assertNotIn("def _openai_agent_chat(", agent_py)
        backends = source("chat_backends.py")
        self.assertIn('ai.mark_live_source("chat", backend)', backends)
        self.assertIn("returned an empty turn", backends)
        self.assertIn('payload["reasoning_effort"]', backends)
        self.assertIn("force_any_tool else \"medium\"", backends)
        self.assertNotIn("ai.LAST_SOURCE = backend", backends)

    def test_chat_surfaces_are_calmer(self):
        agent_js = source("static/js/agent.js")
        companion = source("static/js/companion.js")
        css = source("static/css/app.css")
        self.assertIn("open: false", agent_js)
        self.assertIn("Working…", agent_js)
        agent_working = agent_js[agent_js.find("function agentWorkingTraceHtml"):agent_js.find("function stopAgentWorkingTraceAnimation")]
        self.assertNotIn("agc-trace-steps", agent_working)
        self.assertIn('id="companion-activity-strip" hidden', companion)
        self.assertIn(".agc-provider-pill", css)
        self.assertIn("animation: none;", css[css.find(".page-intent::after"):css.find(".page-intent >")])

    def test_harness_models_observations_and_classes(self):
        agent_py = source("agent.py")
        agent_js = source("static/js/agent.js")
        misc = source("static/js/misc.js")
        settings = source("static/js/settings.js")
        classes = source("static/js/classes.js")
        index = source("static/index.html")
        css = source("static/css/app.css")
        core = source("static/js/core.js")
        ai = source("ai.py")
        app = source("app.py")
        self.assertIn('"name": "batch_add_tasks"', agent_py)
        self.assertIn('"name": "add_recurring_class"', agent_py)
        self.assertIn('"name": "grade_class_item"', agent_py)
        self.assertIn('"name": "list_observations"', agent_py)
        self.assertIn("batch_add_tasks", agent_js)
        self.assertIn("agc-quote-obs", agent_js)
        self.assertIn("OPENAI_MODEL_CHOICES", misc)
        self.assertIn("GROK_MODEL_CHOICES", misc)
        self.assertIn("function settingsAiManageHtml(", settings)
        self.assertIn("function settingsHarnessHtml(", settings)
        self.assertIn("horizon_weeks", classes)
        self.assertIn("cls-grade-item", classes)
        self.assertIn("/js/observation.js", index)
        self.assertIn("body.wp-nonplan", css)
        self.assertIn('classList.toggle("wp-nonplan"', core)
        self.assertIn("def grade_class_work(", ai)
        self.assertIn("/api/observations", app)
        self.assertIn("/items/<int:item_id>/grade", app)


class AiFallbackBehavior(unittest.TestCase):
    def test_fallback_chain_and_reroute(self):
        sys.path.insert(0, str(ROOT))
        import ai
        import model_roles

        calls = []

        def flaky(backend):
            calls.append(backend)
            if backend == "openai":
                raise RuntimeError("503 overloaded")
            return f"ok:{backend}"

        with patch.object(model_roles, "fallback_chain", return_value=["openai", "grok", "claude"]):
            result = ai.call_with_fallback("chat", flaky)
        self.assertEqual(result, "ok:grok")
        self.assertEqual(calls, ["openai", "grok"])
        self.assertEqual(ai.LAST_SOURCE, "grok")
        self.assertEqual(ai.LAST_REROUTE["from"], "openai")
        self.assertEqual(ai.LAST_REROUTE["to"], "grok")
        self.assertEqual(ai.live_routing_status()["last_source"], "grok")

    def test_policy_runtime_errors_do_not_reroute(self):
        sys.path.insert(0, str(ROOT))
        import ai
        import model_roles

        def boom(_backend):
            raise RuntimeError("API is disabled (kill switch is on)")

        with patch.object(model_roles, "fallback_chain", return_value=["openai", "grok"]):
            with self.assertRaises(RuntimeError):
                ai.call_with_fallback("tasks", boom)

    def test_http_auth_errors_demote_and_reroute(self):
        sys.path.insert(0, str(ROOT))
        import ai
        import model_roles

        class FakeHTTPError(Exception):
            pass

        calls = []

        def boom(backend):
            calls.append(backend)
            if backend == "openai":
                raise FakeHTTPError("401 unauthorized invalid api key")
            return f"ok:{backend}"

        ai.reset_backend_health()
        with patch.object(model_roles, "fallback_chain", return_value=["openai", "grok"]):
            result = ai.call_with_fallback("chat", boom)
        self.assertEqual(result, "ok:grok")
        self.assertEqual(calls, ["openai", "grok"])
        self.assertTrue(ai.backend_key_rejected("openai"))
        ai.reset_backend_health()


class ChatPerformsActionsContracts(unittest.TestCase):
    """Write-intent chat retries with forced tools after a missed call, without stripping thinking on round 1."""

    def test_write_intent_forces_tools_immediately(self):
        sys.path.insert(0, str(ROOT))
        import agent

        src = source("agent.py")
        self.assertIn(
            "force_any_tool = bool(fake_tool_retries and wants_write and not actions)",
            src,
        )
        self.assertNotIn(
            "force_any_tool = bool(wants_write and not actions)",
            src,
        )
        self.assertTrue(agent._message_needs_write_tools("add a class Tuesday 9am"))
        self.assertTrue(agent._message_needs_write_tools("schedule Tuesday 9am"))
        self.assertIn("call the matching tool NOW", agent.HOW_TO_WORK)
        refresh = agent._waypoint_capabilities_refresh()
        self.assertIn("HAS live write tools", refresh)
        self.assertNotIn("Companion routes: fast (no tools)", refresh)

    def test_companion_write_ish_messages_are_not_fast(self):
        js = source("static/js/companion.js")
        self.assertIn("looksLikeWrite", js)
        self.assertIn('return looksLikeWrite ? "normal" : "fast"', js)
        self.assertIn("class|classes|homework|assignment", js)


if __name__ == "__main__":
    unittest.main()
