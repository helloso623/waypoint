#!/usr/bin/env python3
"""Playwright acceptance tests for Blueprint node interaction fixes."""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5099"


def api_preview(graph):
    req = urllib.request.Request(
        f"{BASE}/api/workflows/preview",
        data=json.dumps({"graph": graph}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def inject_graph(page, graph):
    page.evaluate(
        """(g) => {
      CURRENT_WF.nodes = g.nodes;
      CURRENT_WF.edges = g.edges || [];
      CURRENT_WF.variables = g.variables || [];
      CURRENT_WF.functions = g.functions || [];
      CURRENT_WF.comments = g.comments || [];
      CURRENT_WF.notes = g.notes || [];
      CURRENT_WF.meta = g.meta || { zoom: 1, panX: 0, panY: 0 };
      WF_UNDO_STACK = [];
      WF_REDO_STACK = [];
      AUTOMATION_STUDIO_OPEN = true;
      STUDIO_TAB = 'graph';
    }""",
        graph,
    )
    page.evaluate("() => renderAutomationStudioView()")
    page.wait_for_selector("#node-canvas", timeout=15000)


def pin_center(page, node_id, port, kind, side):
    return page.evaluate(
        """([nodeId, port, kind, side]) => {
      const sel = side === 'in'
        ? (kind === 'data'
          ? `.wf-pin-in[data-pin-node="${nodeId}"][data-pin-port="${port}"][data-pin-kind="data"]`
          : `.wf-pin-in[data-pin-node="${nodeId}"][data-pin-kind="exec"]`)
        : (kind === 'data'
          ? `.wf-pin-out[data-pin-node="${nodeId}"][data-pin-port="${port}"][data-pin-kind="data"]`
          : `.wf-pin-out[data-pin-node="${nodeId}"][data-pin-port="${port || 'next'}"][data-pin-kind="exec"]`);
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }""",
        [node_id, port, kind, side],
    )


def drag_pin_to_pin(page, from_node, from_port, from_kind, from_side, to_node, to_port, to_kind, to_side):
    start = pin_center(page, from_node, from_port, from_kind, from_side)
    end = pin_center(page, to_node, to_port, to_kind, to_side)
    if not start or not end:
        raise RuntimeError(f"pin not found: {from_node}/{from_side} -> {to_node}/{to_side}")
    page.mouse.move(start["x"], start["y"])
    page.mouse.down()
    page.mouse.move(end["x"], end["y"], steps=8)
    page.mouse.up()
    page.wait_for_timeout(200)


def run_tests():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.goto(BASE, wait_until="networkidle", timeout=30000)

        # T1: input->output exec wire (node2 in <- node1 out)
        try:
            g = {
                "nodes": [
                    {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
                    {"id": "n1", "type": "print", "x": 200, "y": 30, "params": {"message": "one"}},
                    {"id": "n2", "type": "print", "x": 400, "y": 30, "params": {"message": "two"}},
                ],
                "edges": [],
                "variables": [],
                "functions": [],
                "comments": [],
                "notes": [],
                "meta": {"zoom": 1, "panX": 0, "panY": 0},
            }
            inject_graph(page, g)
            drag_pin_to_pin(page, "n2", "exec", "exec", "in", "n1", "next", "exec", "out")
            edges = page.evaluate("() => CURRENT_WF.edges")
            results["T1"] = any(
                e.get("from") == "n1" and e.get("to") == "n2" and e.get("kind") != "data"
                for e in edges
            )
        except Exception as e:
            results["T1"] = f"FAIL: {e}"

        # T2: set_var inline literal persists on blur
        try:
            g = {
                "nodes": [
                    {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
                    {"id": "sv", "type": "set_var", "x": 200, "y": 30, "params": {}, "varName": "counter"},
                ],
                "edges": [],
                "variables": [{"name": "counter", "type": "int", "default": "0"}],
                "functions": [],
                "comments": [],
                "notes": [],
                "meta": {"zoom": 1, "panX": 0, "panY": 0},
            }
            inject_graph(page, g)
            lit = page.locator('.wf-pin-literal[data-node="sv"][data-param="value"]')
            page.wait_for_selector('.wf-pin-literal[data-node="sv"][data-param="value"]', timeout=5000)
            visible = lit.is_visible()
            lit.fill("42")
            lit.blur()
            page.wait_for_timeout(150)
            val = page.evaluate("() => CURRENT_WF.nodes.find(n => n.id === 'sv')?.params?.value")
            results["T2"] = visible and val == "42"
        except Exception as e:
            results["T2"] = f"FAIL: {e}"

        # T3: double-click call_func frames function body
        try:
            g = {
                "nodes": [
                    {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
                    {"id": "entry", "type": "func_entry", "x": 100, "y": 200, "params": {}, "funcName": "helper", "pairId": "ret"},
                    {"id": "ret", "type": "func_return", "x": 420, "y": 200, "params": {}, "funcName": "helper", "pairId": "entry"},
                    {"id": "call", "type": "call_func", "x": 200, "y": 30, "params": {}, "funcName": "helper"},
                ],
                "edges": [],
                "variables": [],
                "functions": [{"name": "helper", "params": [], "returns": None, "frameId": "frame1", "entryId": "entry"}],
                "comments": [{"id": "frame1", "x": 80, "y": 170, "w": 420, "h": 160, "title": "helper", "color": "#4a2a5a"}],
                "notes": [],
                "meta": {"zoom": 1, "panX": 0, "panY": 0},
            }
            inject_graph(page, g)
            before = page.evaluate("() => ({ panX: wfMeta().panX, panY: wfMeta().panY, focus: WF_FOCUS_FUNC })")
            page.dblclick('.node-card[data-node-id="call"] .node-header')
            page.wait_for_timeout(300)
            after = page.evaluate("() => ({ panX: wfMeta().panX, panY: wfMeta().panY, focus: WF_FOCUS_FUNC })")
            moved = abs(after["panX"] - before["panX"]) > 5 or abs(after["panY"] - before["panY"]) > 5
            focused = after["focus"] == "helper"
            results["T3"] = moved or focused
        except Exception as e:
            results["T3"] = f"FAIL: {e}"

        # T4: grab wired input, drop empty removes wire; undo restores
        try:
            g = {
                "nodes": [
                    {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
                    {"id": "n1", "type": "print", "x": 200, "y": 30, "params": {"message": "a"}},
                    {"id": "n2", "type": "print", "x": 400, "y": 30, "params": {"message": "b"}},
                ],
                "edges": [{"from": "n1", "fromPort": "next", "to": "n2", "kind": "exec"}],
                "variables": [],
                "functions": [],
                "comments": [],
                "notes": [],
                "meta": {"zoom": 1, "panX": 0, "panY": 0},
            }
            inject_graph(page, g)
            before = page.evaluate("() => CURRENT_WF.edges.length")
            start = pin_center(page, "n2", "exec", "exec", "in")
            page.mouse.move(start["x"], start["y"])
            page.mouse.down()
            page.mouse.move(start["x"] + 120, start["y"] + 80, steps=6)
            page.mouse.up()
            page.wait_for_timeout(200)
            after = page.evaluate("() => CURRENT_WF.edges.length")
            page.evaluate("() => wfUndo()")
            page.wait_for_timeout(300)
            restored = page.evaluate("() => CURRENT_WF.edges.length")
            results["T4"] = before == 1 and after == 0 and restored == 1
        except Exception as e:
            results["T4"] = f"FAIL: {e}"

        browser.close()
    return results


def run_codegen_fixtures():
    fixtures = {
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
                {"from": "a", "fromPort": "result", "to": "p", "toPort": "expression", "kind": "data", "pinType": "float"},
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
    }
    ok = True
    for name, graph in fixtures.items():
        try:
            code = api_preview(graph)["code"]
            compile(code, f"<{name}>", "exec")
            print(f"CODEGEN {name}: OK")
        except Exception as e:
            ok = False
            print(f"CODEGEN {name}: FAIL {e}")
    return ok


if __name__ == "__main__":
    cg_ok = run_codegen_fixtures()
    out = run_tests()
    for k, v in out.items():
        print(f"{k}: {'PASS' if v is True else v}")
    if not cg_ok or not all(v is True for v in out.values()):
        sys.exit(1)
