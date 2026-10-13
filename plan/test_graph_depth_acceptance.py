#!/usr/bin/env python3
"""Acceptance tests for Blueprint GRAPH DEPTH wave."""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5099"
PY = "/workspace/.venv/bin/python"


def api_preview(graph):
    req = urllib.request.Request(
        f"{BASE}/api/workflows/preview",
        data=json.dumps({"graph": graph}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def make_print_chain():
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
            {"id": "n1", "type": "print", "x": 200, "y": 30, "params": {"message": "one"}},
            {"id": "n2", "type": "print", "x": 400, "y": 30, "params": {"message": "two"}},
            {"id": "n3", "type": "print", "x": 600, "y": 30, "params": {"message": "three"}},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "n1", "kind": "exec"},
            {"from": "n1", "fromPort": "next", "to": "n2", "kind": "exec"},
            {"from": "n2", "fromPort": "next", "to": "n3", "kind": "exec"},
        ],
        "variables": [],
        "functions": [],
        "comments": [],
        "notes": [],
        "meta": {"zoom": 1, "panX": 0, "panY": 0},
    }


def inject_graph(page, graph):
    page.evaluate(
        """(g) => {
      CURRENT_WF.nodes = g.nodes;
      CURRENT_WF.edges = g.edges;
      CURRENT_WF.variables = g.variables || [];
      CURRENT_WF.functions = g.functions || [];
      CURRENT_WF.comments = g.comments || [];
      CURRENT_WF.notes = g.notes || [];
      CURRENT_WF.meta = g.meta || { zoom: 1, panX: 0, panY: 0 };
      AUTOMATION_STUDIO_OPEN = true;
      STUDIO_TAB = 'graph';
    }""",
        graph,
    )
    page.evaluate("() => renderAutomationStudioView()")
    page.wait_for_selector("#node-canvas", timeout=15000)


def run_tests():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page()
        page.goto(BASE, wait_until="networkidle", timeout=30000)

        # T1: 3-node print chain
        try:
            inject_graph(page, make_print_chain())
            page.click("#wf-sim-play")
            page.wait_for_function(
                "() => (document.getElementById('wf-sim-console')?.textContent || '').split('\\n').filter(l => l.includes('Print')).length >= 3",
                timeout=15000,
            )
            console = page.locator("#wf-sim-console").inner_text()
            lines = [l for l in console.split("\n") if l.strip().startswith("Print")]
            ok_count = page.locator(".wf-sim-ok").count()
            results["T1"] = len(lines) == 3 and ok_count == 3 and "one" in lines[0] and "two" in lines[1] and "three" in lines[2]
        except Exception as e:
            results["T1"] = f"FAIL: {e}"

        # T2: breakpoint on node 2
        try:
            g = make_print_chain()
            g["nodes"][2]["meta"] = {"breakpoint": True}
            inject_graph(page, g)
            page.evaluate("() => { WF_SIM = null; }")
            page.click("#wf-sim-play")
            page.wait_for_selector(".wf-sim-paused", timeout=10000)
            paused = page.locator(".wf-sim-paused").count() >= 1
            page.click("#wf-sim-step")
            page.wait_for_function(
                "() => (document.getElementById('wf-sim-console')?.textContent || '').includes('two')",
                timeout=10000,
            )
            page.wait_for_selector(".wf-sim-paused", timeout=10000)
            paused2 = page.locator(".wf-sim-paused").count() >= 1
            results["T2"] = paused and paused2
        except Exception as e:
            results["T2"] = f"FAIL: {e}"

        # T3: disable node 2 -> codegen omits it
        try:
            g = make_print_chain()
            g["nodes"][2]["meta"] = {"disabled": True}
            code = api_preview(g)["code"]
            results["T3"] = "print('one')" in code and "print('two')" not in code and "print('three')" in code
            if not results["T3"]:
                results["T3"] = f"FAIL: code snippet: {code[:400]}"
        except Exception as e:
            results["T3"] = f"FAIL: {e}"

        # T4: collapse two print nodes into greet_twice
        try:
            g = make_print_chain()
            inject_graph(page, g)
            page.evaluate(
                """() => {
              WF_SELECTED_NODES = new Set(['n2', 'n3']);
              wfCollapseSelectionToFunction = wfCollapseSelectionToFunction || (() => {});
            }"""
            )
            # Programmatic collapse (simulate user prompt)
            page.evaluate(
                """() => {
              const orig = window.prompt;
              window.prompt = () => 'greet_twice';
              WF_SELECTED_NODES = new Set(['n2', 'n3']);
              wfCollapseSelectionToFunction();
              window.prompt = orig;
            }"""
            )
            page.wait_for_timeout(500)
            state = page.evaluate(
                """() => ({
              call: CURRENT_WF.nodes.some(n => n.type === 'call_func' && n.funcName === 'greet_twice'),
              fn: (CURRENT_WF.functions || []).find(f => f.name === 'greet_twice'),
              bodyPrints: CURRENT_WF.nodes.filter(n => n.type === 'print' && n.params.message !== 'one').length,
            })"""
            )
            code = api_preview(page.evaluate("() => wfGraphPayload()"))["code"]
            results["T4"] = (
                state.get("call")
                and state.get("fn")
                and state.get("bodyPrints", 0) >= 2
                and "def greet_twice" in code
            )
            if not results["T4"]:
                results["T4"] = f"FAIL: {state} code has def: {'def greet_twice' in code}"
        except Exception as e:
            results["T4"] = f"FAIL: {e}"

        browser.close()
    return results


if __name__ == "__main__":
    out = run_tests()
    for k, v in out.items():
        print(f"{k}: {'PASS' if v is True else v}")
    if not all(v is True for v in out.values()):
        sys.exit(1)
