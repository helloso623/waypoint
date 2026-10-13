#!/usr/bin/env python3
"""ZONE H acceptance fixtures for workflow macros, diagnostics, and health."""
import sys

import workflow


def _macro_graph():
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "cm1", "type": "call_macro", "x": 100, "y": 0, "params": {}, "macroId": "m1"},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "cm1", "kind": "exec"},
        ],
        "variables": [],
        "functions": [],
        "macros": [
            {
                "id": "m1",
                "name": "say_hello",
                "inputs": [],
                "outputs": [],
                "description": "Print hello from a macro",
                "nodes": [
                    {"id": "ms", "type": "start", "x": 0, "y": 0, "params": {}},
                    {"id": "mp", "type": "print", "x": 0, "y": 0, "params": {"message": "hello macro"}},
                ],
                "edges": [
                    {"from": "ms", "fromPort": "next", "to": "mp", "kind": "exec"},
                ],
            },
        ],
    }


def _unwired_graph():
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "p1", "type": "print", "x": 0, "y": 0, "params": {}},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "p1", "kind": "exec"},
        ],
        "variables": [],
        "functions": [],
    }


def _health_graph():
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "p1", "type": "print", "x": 0, "y": 0, "params": {"message": "ok"}},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "p1", "kind": "exec"},
        ],
        "variables": [{"name": "x", "type": "int", "default": "0"}],
        "functions": [],
        "macros": [],
    }


REGRESSION_FIXTURES = {
    "print_chain": {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "p1", "type": "print", "x": 0, "y": 0, "params": {"message": "hi"}},
        ],
        "edges": [{"from": "start", "fromPort": "next", "to": "p1", "kind": "exec"}],
        "variables": [],
        "functions": [],
    },
    "pure_math": {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "a", "type": "add", "x": 0, "y": 0, "params": {"a": "1", "b": "2"}},
            {"id": "p", "type": "print_value", "x": 0, "y": 0, "params": {}},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "p", "kind": "exec"},
            {"from": "a", "fromPort": "result", "to": "p", "toPort": "expression", "kind": "data"},
        ],
        "variables": [],
        "functions": [],
    },
    "set_var_typed": {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "sv", "type": "set_var", "x": 0, "y": 0, "params": {"value": "42"}, "varName": "n"},
        ],
        "edges": [{"from": "start", "fromPort": "next", "to": "sv", "kind": "exec"}],
        "variables": [{"name": "n", "type": "int", "default": "0"}],
        "functions": [],
    },
    "function_call": {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "entry", "type": "func_entry", "x": 0, "y": 100, "params": {}, "funcName": "helper", "pairId": "ret"},
            {"id": "ret", "type": "func_return", "x": 0, "y": 100, "params": {}, "funcName": "helper", "pairId": "entry"},
            {"id": "fp", "type": "print", "x": 0, "y": 100, "params": {"message": "fn"}},
            {"id": "call", "type": "call_func", "x": 100, "y": 0, "params": {}, "funcName": "helper"},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "call", "kind": "exec"},
            {"from": "entry", "fromPort": "next", "to": "fp", "kind": "exec"},
            {"from": "fp", "fromPort": "next", "to": "ret", "kind": "exec"},
        ],
        "variables": [],
        "functions": [{"name": "helper", "params": [], "returns": None, "entryId": "entry"}],
    },
    "ui_codegen": {
        "nodes": [
            {"id": "start", "type": "start", "x": 0, "y": 0, "params": {}},
            {"id": "ue", "type": "ui_event", "x": 0, "y": 0, "params": {"event": "clicked", "widget_id": "btn1"}},
            {"id": "p1", "type": "print", "x": 0, "y": 0, "params": {"message": "clicked"}},
        ],
        "edges": [
            {"from": "ue", "fromPort": "next", "to": "p1", "kind": "exec"},
        ],
        "variables": [],
        "functions": [],
        "ui": {
            "widgets": [
                {"id": "btn1", "type": "button", "x": 10, "y": 10, "width": 80, "height": 24,
                 "props": {"text": "Go"}, "events": {"clicked": {"binding": "graph", "nodeId": "ue"}}},
            ],
        },
    },
}


def test_macro_codegen():
    graph = _macro_graph()
    code = workflow.generate_code(graph)
    assert "# begin macro say_hello" in code, "missing begin macro comment"
    assert "# end macro say_hello" in code, "missing end macro comment"
    compile(code, "<macro>", "exec")
    print("(a) macro codegen: PASS")
    return True


def test_diagnose_unwired():
    result = workflow.diagnose_graph(_unwired_graph())
    warnings = [
        d for d in result["diagnostics"]
        if d.get("severity") == "warning" and d.get("fix_hint") == "wire or set a literal"
    ]
    assert warnings, "expected unwired pin warning"
    assert any(d.get("node_id") == "p1" for d in warnings), "expected node_id p1"
    print("(b) diagnose_graph unwired: PASS")
    return True


def test_graph_health():
    health = workflow.graph_health(_health_graph())
    assert "counts" in health and "readiness" in health
    assert health["counts"]["nodes"] == 2
    assert health["counts"]["variables"] == 1
    assert health["readiness"] in ("ready", "warnings", "blocked")
    print("(c) graph_health: PASS")
    return True


def test_regression():
    ok = True
    for name, graph in REGRESSION_FIXTURES.items():
        try:
            code = workflow.generate_code(graph)
            compile(code, f"<{name}>", "exec")
            print(f"regression {name}: PASS")
        except Exception as exc:
            ok = False
            print(f"regression {name}: FAIL {exc}")
    return ok


def main():
    results = []
    for fn in (test_macro_codegen, test_diagnose_unwired, test_graph_health, test_regression):
        try:
            results.append(fn())
        except Exception as exc:
            print(f"{fn.__name__}: FAIL {exc}")
            results.append(False)
    if not all(results):
        sys.exit(1)
    print("ALL FIXTURES PASS")


if __name__ == "__main__":
    main()
