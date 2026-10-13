"""Contract tests for the Anthropic <-> OpenAI chat translation.

These are the shapes that the provider rejects with a 400, which is exactly the class of bug
that is invisible until a real conversation happens to produce it. No network: the point is to
pin the serialization, not to test OpenAI.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import chat_backends as cb


class ToolConversionTests(unittest.TestCase):
    def test_server_side_tools_are_dropped(self):
        """Web search has no input_schema and no OpenAI equivalent."""
        tools = [
            {"name": "add_task", "description": "Add a task.",
             "input_schema": {"type": "object", "properties": {"title": {"type": "string"}}}},
            {"type": "web_search_20260209", "name": "web_search", "allowed_callers": ["direct"]},
        ]
        converted = cb.to_openai_tools(tools)
        self.assertEqual([t["function"]["name"] for t in converted], ["add_task"])
        self.assertEqual(converted[0]["function"]["parameters"], tools[0]["input_schema"])


class MessageConversionTests(unittest.TestCase):
    def test_assistant_without_text_or_tools_is_empty_string_not_null(self):
        """content=null is only legal alongside tool_calls; otherwise it is a hard 400."""
        out = cb.to_openai_messages(None, [
            {"role": "assistant", "content": [cb._Block(type="thinking", thinking="...")]},
        ])
        self.assertEqual(out[0]["content"], "")
        self.assertNotIn("tool_calls", out[0])

    def test_assistant_with_tool_calls_may_have_null_content(self):
        out = cb.to_openai_messages(None, [
            {"role": "assistant", "content": [
                cb._Block(type="tool_use", id="c1", name="add_task", input={"title": "x"})]},
        ])
        self.assertIsNone(out[0]["content"])
        self.assertEqual(out[0]["tool_calls"][0]["id"], "c1")

    def test_tool_result_links_back_to_its_call(self):
        """OpenAI matches tool output to the call by id; a mismatch silently loses the result."""
        out = cb.to_openai_messages("SYS", [
            {"role": "user", "content": "add a task"},
            {"role": "assistant", "content": [
                cb._Block(type="text", text="Sure."),
                cb._Block(type="tool_use", id="tu_1", name="add_task", input={"title": "x"})]},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "tu_1", "content": '{"ok": true}'}]},
        ])
        self.assertEqual([m["role"] for m in out], ["system", "user", "assistant", "tool"])
        self.assertEqual(out[3]["tool_call_id"], out[2]["tool_calls"][0]["id"])

    def test_thinking_blocks_are_dropped(self):
        out = cb.to_openai_messages(None, [
            {"role": "assistant", "content": [
                cb._Block(type="thinking", thinking="secret"),
                cb._Block(type="text", text="hello")]},
        ])
        self.assertEqual(out[0]["content"], "hello")
        self.assertNotIn("secret", json.dumps(out))


class ResponseConversionTests(unittest.TestCase):
    def test_tool_calls_become_tool_use_blocks(self):
        r = cb.from_openai_response({"choices": [{"finish_reason": "tool_calls", "message": {
            "content": "on it",
            "tool_calls": [{"id": "c9", "function": {"name": "add_task", "arguments": '{"title":"x"}'}}]}}],
            "usage": {"prompt_tokens": 11, "completion_tokens": 3}}, "openai:test")
        self.assertEqual(r.stop_reason, "tool_use")
        self.assertEqual([b.type for b in r.content], ["text", "tool_use"])
        self.assertEqual(r.content[1].input, {"title": "x"})
        self.assertEqual((r.usage.input_tokens, r.usage.output_tokens), (11, 3))

    def test_plain_reply_ends_the_turn(self):
        r = cb.from_openai_response(
            {"choices": [{"finish_reason": "stop", "message": {"content": "done"}}]}, "m")
        self.assertEqual(r.stop_reason, "end_turn")

    def test_malformed_arguments_do_not_crash_the_turn(self):
        r = cb.from_openai_response({"choices": [{"finish_reason": "tool_calls", "message": {
            "content": None,
            "tool_calls": [{"id": "c1", "function": {"name": "add_task", "arguments": "{not json"}}]}}]}, "m")
        self.assertEqual(r.content[0].input, {})

    def test_response_blocks_survive_a_round_trip(self):
        """The loop appends response.content back onto the transcript, so shim blocks must
        re-serialize on the following turn."""
        r = cb.from_openai_response({"choices": [{"finish_reason": "tool_calls", "message": {
            "content": None,
            "tool_calls": [{"id": "c9", "function": {"name": "f", "arguments": "{}"}}]}}]}, "m")
        out = cb.to_openai_messages(None, [{"role": "assistant", "content": r.content}])
        self.assertEqual(out[0]["tool_calls"][0]["id"], "c9")


    def test_disabled_note_when_function_tool_is_absent(self):
        self.assertIn("via the web_search tool", cb.NO_WEB_SEARCH_NOTE)
        self.assertIn("DISABLED", cb.WEB_SEARCH_DISABLED_NOTE)
        self.assertFalse(cb.tools_include_web_search([
            {"type": "web_search_20260209", "name": "web_search", "allowed_callers": ["direct"]},
        ]))
        self.assertTrue(cb.tools_include_web_search([
            {"name": "web_search", "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}}},
        ]))


if __name__ == "__main__":
    unittest.main()
