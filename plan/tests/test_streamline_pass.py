"""Smoke tests for streamline pass: pulse details, C++ export, happiness policy."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class StreamlinePassTests(unittest.TestCase):
    def test_generate_cpp_includes_main_and_python_source(self):
        import workflow

        graph = {
            "nodes": [
                {"id": "start_1", "type": "start", "x": 0, "y": 0, "params": {}},
                {"id": "print_1", "type": "print", "x": 40, "y": 80, "params": {"message": "hi"}},
            ],
            "edges": [{"from": "start_1", "to": "print_1", "fromPort": "next", "kind": "exec"}],
            "variables": [{"name": "count", "type": "int", "default": "2"}],
        }
        cpp = workflow.generate_cpp(graph)
        self.assertIn("int main()", cpp)
        self.assertIn("namespace waypoint", cpp)
        self.assertIn("std::cout", cpp)
        self.assertIn('"hi"', cpp)
        self.assertIn("experimental C++ scaffold", cpp)
        self.assertIn("Python source of truth", cpp)
        self.assertNotIn("if (true)", cpp)
        self.assertNotIn("if(true)", cpp)

        empty_cpp = workflow.generate_cpp({})
        self.assertIn("int main()", empty_cpp)
        self.assertIn("experimental C++ scaffold", empty_cpp)
        self.assertNotIn("if (true)", empty_cpp)
        self.assertNotIn("if(true)", empty_cpp)

        branch_cpp = workflow.generate_cpp({
            "nodes": [
                {"id": "start_1", "type": "start", "params": {}},
                {"id": "branch_1", "type": "branch", "params": {}},
            ],
            "edges": [
                {"from": "start_1", "to": "branch_1", "fromPort": "next", "kind": "exec"},
            ],
        })
        self.assertIn("branch node has no condition wired", branch_cpp)
        self.assertNotIn("if (true)", branch_cpp)
        self.assertNotIn("if(true)", branch_cpp)

        # Legacy props still accepted as fallback.
        legacy = {
            "nodes": [
                {"id": "start_1", "type": "start", "props": {}},
                {"id": "print_1", "type": "print", "props": {"message": "legacy"}},
            ],
            "edges": [{"from": "start_1", "to": "print_1", "fromPort": "next", "kind": "exec"}],
            "variables": [],
        }
        self.assertIn('"legacy"', workflow.generate_cpp(legacy))

    def test_happiness_policy_text_reward(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["WAYPOINT_DATA_DIR"] = tmp
            import importlib
            import happiness_policy

            importlib.reload(happiness_policy)
            out = happiness_policy.observe_text_feedback("this is great and helpful", "Agent")
            self.assertEqual(out["method"], "local-gru-ema")
            self.assertTrue(out["top_sections"])
            pulse = happiness_policy.observe_pulse(9, energy=8, section="Today")
            self.assertEqual(pulse["recommended"], pulse["top_sections"][0]["section"])

    def test_mood_pulse_update_details(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PLANNER_DB_PATH"] = str(Path(tmp) / "test.db")
            os.environ["WAYPOINT_DATA_DIR"] = tmp
            import importlib
            import db

            importlib.reload(db)
            db.init_db()
            pulse = db.insert_mood_pulse(7, note=None, energy=None)
            updated = db.update_mood_pulse_details(pulse["id"], energy=5, note="after")
            self.assertEqual(updated["happiness"], 7)
            self.assertEqual(updated["energy"], 5)
            self.assertEqual(updated["note"], "after")

    def test_confirm_tool_accepts_add_contact_writes(self):
        """Companion normal route stages add_contact; Confirm must execute it."""
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PLANNER_DB_PATH"] = str(Path(tmp) / "test.db")
            os.environ["WAYPOINT_DATA_DIR"] = tmp
            import importlib
            import agent
            import db

            importlib.reload(db)
            db.init_db()
            importlib.reload(agent)

            staged = agent._execute_tool(
                "add_contact",
                {"name": "Ada Lovelace", "email": "ada@example.com", "what_they_do": "mathematician"},
                tool_policy="confirm",
            )
            self.assertTrue(staged.get("needs_confirmation"))
            self.assertEqual(len(db.list_contacts()), 0)

            msg = agent.CONFIRM_TOOL_PREFIX + __import__("json").dumps({
                "tool": "add_contact",
                "input": {
                    "name": "Ada Lovelace",
                    "email": "ada@example.com",
                    "what_they_do": "mathematician",
                },
            })
            parsed = agent._parse_confirm_tool_message(msg)
            self.assertIsNotNone(parsed)
            tool, tool_input = parsed
            self.assertEqual(tool, "add_contact")
            self.assertTrue(tool_input.get("confirmed"))

            out = agent.chat(msg, tool_policy="auto")
            contacts = db.list_contacts()
            self.assertEqual(len(contacts), 1)
            self.assertEqual(contacts[0]["name"], "Ada Lovelace")
            self.assertIn("Done", out.get("reply") or "")
            self.assertFalse(any(
                isinstance(a.get("result"), dict) and a["result"].get("needs_confirmation")
                for a in (out.get("actions") or [])
            ))

    def test_prompt_forbids_no_write_hallucination(self):
        import agent

        self.assertIn("LIVE WRITE ACCESS", agent.HOW_TO_WORK)
        self.assertIn("never say that", agent.HOW_TO_WORK.lower())
        self.assertIn("live Waypoint database", agent._waypoint_capabilities_refresh())
        self.assertIn("CAN and DO write planner data", agent.SYSTEM_PROMPT_DATA_ONLY)

    def test_detects_fake_contacts_add_prose(self):
        import agent

        self.assertTrue(agent._message_needs_write_tools(
            "add Oscar and Dr. Hunt as contacts with full context"
        ))
        self.assertTrue(agent._message_needs_write_tools(
            "adddddddd them with the tooooooollklllllllll"
        ))
        self.assertTrue(agent._message_needs_write_tools("no not done it is a tool you need to search"))
        self.assertTrue(agent._message_needs_write_tools("add a class Tuesday 9am"))
        self.assertTrue(agent._message_needs_write_tools("schedule Tuesday 9am"))
        self.assertTrue(agent._message_needs_write_tools("grade this homework"))
        self.assertTrue(agent._reply_fakes_tool_use(
            "Adding both now:\n\n**contacts.add**\n- Name: Oscar\n\nDone."
        ))
        self.assertFalse(agent._reply_fakes_tool_use("Saved Oscar via add_contact."))

    def test_sticky_tool_catalog_lists_add_contact(self):
        import agent

        card = agent._sticky_tool_catalog()
        self.assertIn("add_contact", card)
        self.assertIn("TOOL CARD", card)
        prompt = (
            agent.SYSTEM_PROMPT_DATA_ONLY
            + "\n"
            + agent._waypoint_capabilities_refresh()
            + "\n"
            + card
        )
        self.assertGreater(prompt.rfind("TOOL CARD"), prompt.rfind("WAYPOINT REFRESH"))

    def test_agent_multi_conversation_isolation(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PLANNER_DB_PATH"] = str(Path(tmp) / "test.db")
            os.environ["WAYPOINT_DATA_DIR"] = tmp
            import importlib
            import db

            importlib.reload(db)
            db.init_db()
            a = db.create_agent_conversation("Alpha")
            b = db.create_agent_conversation("Beta")
            companion_id = db.ensure_agent_conversation_by_title("Companion")
            db.insert_agent_message("user", "hello alpha", conversation_id=a["id"])
            db.insert_agent_message("assistant", "hi alpha", conversation_id=a["id"])
            db.insert_agent_message("user", "hello beta", conversation_id=b["id"])
            alpha_msgs = db.list_agent_messages(conversation_id=a["id"])
            beta_msgs = db.list_agent_messages(conversation_id=b["id"])
            self.assertEqual([m["content"] for m in alpha_msgs], ["hello alpha", "hi alpha"])
            self.assertEqual([m["content"] for m in beta_msgs], ["hello beta"])
            # Last talked-to (beta) should be first.
            ordered = db.list_agent_conversations()
            titles = [c["title"] for c in ordered if c["title"] in ("Alpha", "Beta")]
            self.assertEqual(titles[0], "Beta")
            deleted = db.delete_agent_conversation(b["id"])
            self.assertEqual(deleted["deleted_id"], b["id"])
            self.assertNotEqual(deleted["active_id"], companion_id)
            self.assertNotEqual(
                db.get_agent_conversation(deleted["active_id"])["title"],
                "Companion",
            )
            remaining = {c["id"] for c in db.list_agent_conversations()}
            self.assertNotIn(b["id"], remaining)
            self.assertIn(a["id"], remaining)

    def test_deterministic_fact_check_flags_fake_done(self):
        import agent
        import orchestrator

        issues = agent._deterministic_fact_issues(
            "Adding both now with **contacts.add**. Done.",
            actions=[],
        )
        self.assertTrue(any("fake" in i.lower() or "saved" in i.lower() for i in issues))

        original = orchestrator.run

        def fake_run(name, **kwargs):
            if name == "fact_check_agent_reply":
                return {
                    "ok": False,
                    "issues": ["claimed save without tools"],
                    "corrected_reply": "Nothing was saved yet — no write tool ran.",
                }
            return original(name, **kwargs)

        orchestrator.run = fake_run
        try:
            reply, report = agent._fact_check_and_correct(
                "Done — saved Oscar and Dr. Hunt.",
                actions=[],
                user_message="add them with the tool",
            )
        finally:
            orchestrator.run = original
        self.assertTrue(report.get("corrected"))
        self.assertIn("Nothing was saved", reply)


if __name__ == "__main__":
    unittest.main()
