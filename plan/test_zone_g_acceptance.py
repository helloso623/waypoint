#!/usr/bin/env python3
"""Zone G acceptance tests for Unreal frontier graph UX."""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5099"


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
      CURRENT_WF.ui = CURRENT_WF.ui || { widgets: [], device: "phone", folders: [], keybinds: [] };
      WF_UNDO_STACK = [];
      WF_REDO_STACK = [];
      AUTOMATION_STUDIO_OPEN = true;
      STUDIO_TAB = 'graph';
    }""",
        graph,
    )
    page.evaluate("() => renderAutomationStudioView()")
    page.wait_for_selector("#node-canvas", timeout=15000)


def make_search_graph():
    token = "SHARED_TOKEN_XYZ"
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
            {"id": "n1", "type": "print", "x": 200, "y": 30, "params": {"message": token}},
            {"id": "n2", "type": "print", "x": 400, "y": 120, "params": {"message": f"pre {token} post"}},
            {"id": "n3", "type": "print", "x": 600, "y": 220, "params": {"message": token}},
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


def make_chain_graph():
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
            {"id": "a", "type": "print", "x": 200, "y": 30, "params": {"message": "a"}},
            {"id": "b", "type": "print", "x": 400, "y": 30, "params": {"message": "b"}},
            {"id": "c", "type": "print", "x": 600, "y": 30, "params": {"message": "c"}},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "a", "kind": "exec"},
            {"from": "a", "fromPort": "next", "to": "b", "kind": "exec"},
            {"from": "b", "fromPort": "next", "to": "c", "kind": "exec"},
        ],
        "variables": [],
        "functions": [],
        "comments": [],
        "notes": [],
        "meta": {"zoom": 1, "panX": 0, "panY": 0},
    }


def make_print_chain():
    return {
        "nodes": [
            {"id": "start", "type": "start", "x": 30, "y": 30, "params": {}},
            {"id": "n1", "type": "print", "x": 200, "y": 30, "params": {"message": "one"}},
            {"id": "n2", "type": "print", "x": 400, "y": 30, "params": {"message": "two"}},
        ],
        "edges": [
            {"from": "start", "fromPort": "next", "to": "n1", "kind": "exec"},
            {"from": "n1", "fromPort": "next", "to": "n2", "kind": "exec"},
        ],
        "variables": [],
        "functions": [],
        "comments": [],
        "notes": [],
        "meta": {"zoom": 1, "panX": 0, "panY": 0},
    }


def run_tests():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.goto(BASE, wait_until="networkidle", timeout=30000)

        # T1 search
        try:
            inject_graph(page, make_search_graph())
            page.locator("#node-canvas").click()
            pans = []
            page.keyboard.press("Control+f")
            page.wait_for_selector("#wf-graph-search-pill:not([hidden])", timeout=5000)
            page.fill("#wf-graph-search-input", "SHARED_TOKEN_XYZ")
            for _ in range(3):
                before = page.evaluate("() => ({ panX: wfMeta().panX, panY: wfMeta().panY })")
                page.keyboard.press("Enter")
                page.wait_for_timeout(350)
                pulsed = page.evaluate(
                    "() => !!document.querySelector('.wf-search-pulse')"
                )
                after = page.evaluate("() => ({ panX: wfMeta().panX, panY: wfMeta().panY })")
                pans.append((before, after, pulsed))
            # typing in node input must not jump bookmarks/slots
            page.locator('.node-card[data-node-id="n1"] input').first.fill("SHARED_TOKEN_XYZ typed")
            slot_before = page.evaluate("() => wfMeta().panX")
            page.keyboard.press("1")
            page.wait_for_timeout(100)
            slot_after = page.evaluate("() => wfMeta().panX")
            no_slot_jump = abs(slot_after - slot_before) < 1
            framed = all(
                abs(a["panX"] - b["panX"]) > 0.5 or abs(a["panY"] - b["panY"]) > 0.5 or p
                for b, a, p in pans
            )
            results["T1"] = framed and any(p for _, _, p in pans) and no_slot_jump
        except Exception as e:
            results["T1"] = f"FAIL: {e}"

        # T2 bookmarks
        try:
            inject_graph(page, make_search_graph())
            page.evaluate(
                """() => {
              const m = wfMeta();
              m.panX = 120; m.panY = 80; m.zoom = 0.9;
              applyWfCanvasTransform();
            }"""
            )
            saved = page.evaluate(
                """() => {
              wfSaveBookmark(1);
              return { panX: wfMeta().panX, panY: wfMeta().panY, zoom: wfMeta().zoom };
            }"""
            )
            page.evaluate(
                "() => { const m = wfMeta(); m.panX = -200; m.panY = -150; m.zoom = 0.6; applyWfCanvasTransform(); }"
            )
            page.locator("#node-canvas").click()
            page.keyboard.press("1")
            page.wait_for_timeout(150)
            restored = page.evaluate("() => ({ panX: wfMeta().panX, panY: wfMeta().panY, zoom: wfMeta().zoom })")
            ok = (
                abs(restored["panX"] - saved["panX"]) <= 2
                and abs(restored["panY"] - saved["panY"]) <= 2
                and abs(restored["zoom"] - saved["zoom"]) <= 0.02
            )
            results["T2"] = ok
        except Exception as e:
            results["T2"] = f"FAIL: {e}"

        # T3 LOD
        try:
            inject_graph(page, make_search_graph())
            page.evaluate(
                "() => { wfMeta().zoom = 0.5; applyWfCanvasTransform(); }"
            )
            compact = page.locator(".node-card.compact-LOD").count() >= 3
            page.evaluate(
                "() => { wfMeta().zoom = 0.3; applyWfCanvasTransform(); }"
            )
            block = page.locator(".node-card.block-LOD").count() >= 3
            results["T3"] = compact and block
        except Exception as e:
            results["T3"] = f"FAIL: {e}"

        # T4 chain focus
        try:
            inject_graph(page, make_chain_graph())
            page.evaluate(
                """() => {
              WF_SELECTED_NODES = new Set(['b']);
              wfUpdateChainFocusToolbar();
            }"""
            )
            page.click('[data-chain-focus="downstream"]')
            page.wait_for_timeout(200)
            state = page.evaluate(
                """() => ({
              cFocus: document.querySelector('.node-card[data-node-id="c"]')?.classList.contains('wf-chain-focus'),
              cDim: document.querySelector('.node-card[data-node-id="c"]')?.classList.contains('wf-chain-dim'),
              aFocus: document.querySelector('.node-card[data-node-id="a"]')?.classList.contains('wf-chain-focus'),
              aDim: document.querySelector('.node-card[data-node-id="a"]')?.classList.contains('wf-chain-dim'),
              bFocus: document.querySelector('.node-card[data-node-id="b"]')?.classList.contains('wf-chain-focus'),
            })"""
            )
            results["T4"] = state["cFocus"] and not state["cDim"] and state["aDim"] and not state["aFocus"] and state["bFocus"]
        except Exception as e:
            results["T4"] = f"FAIL: {e}"

        # Regression: simulation Play still runs print chain
        try:
            g = make_print_chain()
            g["meta"] = {"zoom": 1, "panX": 0, "panY": 0}
            inject_graph(page, g)
            page.click("#studio-tb-play")
            page.wait_for_function(
                "() => document.querySelectorAll('.wf-sim-ok').length >= 2",
                timeout=15000,
            )
            results["REGRESSION_SIM"] = page.locator(".wf-sim-ok").count() >= 2
        except Exception as e:
            results["REGRESSION_SIM"] = f"FAIL: {e}"

        browser.close()
    return results


if __name__ == "__main__":
    out = run_tests()
    for k, v in out.items():
        print(f"{k}: {'PASS' if v is True else v}")
    if not all(v is True for v in out.values()):
        sys.exit(1)
