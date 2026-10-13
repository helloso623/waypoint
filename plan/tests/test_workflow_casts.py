"""Unit coverage for Blueprint cast-node code generation."""

from __future__ import annotations

import contextlib
import io
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from workflow import NODE_TYPES, check_code, generate_code  # noqa: E402


class WorkflowCastTests(unittest.TestCase):
    def test_cast_nodes_compile_and_run(self):
        casts = {
            "cast_int": ("42", "42"),
            "cast_float": ("3.5", "3.5"),
            "cast_bool": ("false", "False"),
            "cast_list": ("ab", "['a', 'b']"),
            "cast_json": ('{"ok": true}', "{'ok': True}"),
        }
        nodes = [{"id": "start", "type": "start", "x": 0, "y": 0, "params": {}}]
        edges = []
        previous = "start"
        expected = []

        for index, (cast_type, (raw, output)) in enumerate(casts.items()):
            literal_id = f"literal_{index}"
            cast_id = f"cast_{index}"
            print_id = f"print_{index}"
            nodes.extend([
                {"id": literal_id, "type": "literal_string", "x": 0, "y": 0, "params": {"value": raw}},
                {"id": cast_id, "type": cast_type, "x": 0, "y": 0, "params": {}},
                {"id": print_id, "type": "print_value", "x": 0, "y": 0, "params": {}},
            ])
            edges.extend([
                {"from": previous, "fromPort": "next", "to": print_id, "kind": "exec"},
                {"from": literal_id, "fromPort": "result", "to": cast_id, "toPort": "value", "kind": "data"},
                {"from": cast_id, "fromPort": "result", "to": print_id, "toPort": "expression", "kind": "data"},
            ])
            previous = print_id
            expected.append(output)

        nodes.extend([
            {"id": "cast_string", "type": "cast_string", "x": 0, "y": 0, "params": {}},
            {"id": "print_string", "type": "print_value", "x": 0, "y": 0, "params": {}},
        ])
        edges.extend([
            {"from": previous, "fromPort": "next", "to": "print_string", "kind": "exec"},
            {"from": "cast_4", "fromPort": "result", "to": "cast_string", "toPort": "value", "kind": "data"},
            {"from": "cast_string", "fromPort": "result", "to": "print_string", "toPort": "expression", "kind": "data"},
        ])
        expected.append('{"ok": true}')

        code = generate_code({"name": "Cast coverage", "nodes": nodes, "edges": edges})

        self.assertTrue(check_code(code)["ok"], code)
        self.assertNotIn("# unknown node type", code)
        self.assertTrue(all(name in NODE_TYPES for name in (
            "cast_string", "cast_int", "cast_float", "cast_bool", "cast_list", "cast_json",
        )))
        self.assertTrue(all(NODE_TYPES[name].get("searchKeys") for name in casts))

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            exec(code, {})
        self.assertEqual(stdout.getvalue().splitlines(), expected)


if __name__ == "__main__":
    unittest.main()
