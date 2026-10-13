#!/usr/bin/env python3
"""Smoke test: Python import -> graph -> generate_code round-trip."""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import _python_to_workflow_graph
from workflow import generate_code, graph_to_markdown, markdown_to_graph

SCRIPT = """\
print("hello")
while True:
    break
"""

CONSTANTS_SCRIPT = """\
WIDTH = 360
HEIGHT = 520
"""

CALC_IF_SCRIPT = """\
if True:
    x = 1
else:
    x = 2
"""

TEMPLATE_EXTRACT_JS = r"""
const fs = require("fs");
const vm = require("vm");
const code = fs.readFileSync("static/js/custom_templates.js", "utf8");
const sandbox = {
  window: {},
  document: {
    getElementById: () => null,
    readyState: "complete",
    addEventListener: () => {},
    querySelector: () => null,
    createElement: () => ({
      id: "", className: "", textContent: "", style: {}, appendChild: () => {}, dataset: {},
    }),
    head: { appendChild: () => {} },
    body: null,
  },
  console,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const out = {};
for (const id of ["calculator", "flappy_bird"]) {
  const tpl = sandbox.window.WAYPOINT_TEMPLATES.find(t => t.id === id);
  out[id] = tpl.build();
}
process.stdout.write(JSON.stringify(out));
"""


def _load_template_graphs():
    plan_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    proc = subprocess.run(
        ["node", "-e", TEMPLATE_EXTRACT_JS],
        cwd=plan_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)


def test_baseline_templates():
    graphs = _load_template_graphs()
    calc = graphs["calculator"]["graph"]
    flappy = graphs["flappy_bird"]["graph"]

    ui_events = [n for n in calc["nodes"] if n.get("type") == "ui_event"]
    exec_in = [
        e for e in calc["edges"]
        if e.get("kind") != "data" and e.get("to") in {n["id"] for n in ui_events}
    ]
    assert not exec_in, f"calculator ui_event has exec-in edges: {exec_in}"

    calc_code = generate_code(calc)
    assert "# unknown node type" not in calc_code, calc_code
    assert "_on_k7_btn_clicked" in calc_code
    assert "_upd_calc_display()" in calc_code, "display label refresh missing from handlers"

    flappy_code = generate_code(flappy)
    assert "run_game()" not in flappy_code
    assert "workflow_templates" not in flappy_code
    assert "_on_tick_flappy_tick" in flappy_code
    assert "place_configure(y=" in flappy_code
    assert "# unknown node type" not in flappy_code
    flappy_ui_events = [n for n in flappy["nodes"] if n.get("type") == "ui_event"]
    flappy_exec_in = [
        e for e in flappy["edges"]
        if e.get("kind") != "data" and e.get("to") in {n["id"] for n in flappy_ui_events}
    ]
    assert not flappy_exec_in, f"flappy ui_event has exec-in edges: {flappy_exec_in}"


def test_markdown_roundtrip():
    graph, _ = _python_to_workflow_graph(SCRIPT)
    graph["variables"] = [{"name": "count", "type": "int", "default": "0"}]
    graph["nodes"].append({
        "id": "print_2",
        "type": "print",
        "x": 240,
        "y": 0,
        "params": {"message": "world"},
    })
    graph["edges"].append({
        "from": graph["nodes"][1]["id"] if len(graph["nodes"]) > 1 else "start_1",
        "fromPort": "next",
        "to": "print_2",
        "kind": "exec",
    })
    md = graph_to_markdown(graph, name="Smoke workflow")
    assert "waypoint-blueprint: 1" in md
    assert "| count | int | 0 |" in md
    restored = markdown_to_graph(md)
    assert restored["variables"] == graph["variables"]
    assert len(restored["nodes"]) == len(graph["nodes"])
    assert len(restored["edges"]) == len(graph["edges"])
    code = generate_code(restored)
    assert "# unknown node type" not in code, code
    print("markdown roundtrip OK")


def main():
    graph, unmapped = _python_to_workflow_graph(SCRIPT)
    code = generate_code(graph)
    assert "# unknown node type" not in code, f"unknown node types in output:\n{code}"
    assert "while" in code, f"while loop missing from output:\n{code}"
    print("roundtrip_smoke OK")
    if unmapped:
        print("unmapped (expected for break):", unmapped)

    const_graph, _ = _python_to_workflow_graph(CONSTANTS_SCRIPT)
    const_code = generate_code(const_graph)
    assert "360" in const_code, f"WIDTH default missing from output:\n{const_code}"
    assert "520" in const_code, f"HEIGHT default missing from output:\n{const_code}"
    assert "WIDTH = ''" not in const_code, f"WIDTH became empty string:\n{const_code}"
    print("constants roundtrip OK")

    if_graph, _ = _python_to_workflow_graph(CALC_IF_SCRIPT)
    if_code = generate_code(if_graph)
    assert "# unknown node type: endif" not in if_code, f"endif emitted as unknown:\n{if_code}"
    assert "if True:" in if_code, f"if branch missing from output:\n{if_code}"
    print("if/endif roundtrip OK")

    test_baseline_templates()
    print("baseline templates OK")

    test_markdown_roundtrip()


if __name__ == "__main__":
    main()
