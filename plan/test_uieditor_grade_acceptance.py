#!/usr/bin/env python3
"""Playwright acceptance tests for UNITY-GRADE 2D Designer layer."""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5099"


def open_designer(page):
    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.evaluate(
        """() => {
      window.CURRENT_WF = window.CURRENT_WF || {
        nodes: [{ id: 'start', type: 'start', x: 30, y: 30, params: {} }],
        edges: [], variables: [], functions: [], comments: [], notes: [],
        ui: { widgets: [], device: 'phone', folders: [], keybinds: [], view: { zoom: 1, panX: 0, panY: 0 },
              canvas: { gridSize: 8, showGrid: true, showRulers: true, showGuides: true, wireframe: false, dimOthers: false, guides: [] } },
        meta: { zoom: 1, panX: 0, panY: 0 },
      };
      window.AUTOMATION_STUDIO_OPEN = true;
      window.STUDIO_TAB = 'designer';
      STUDIO_TAB = 'designer';
      window.UIE_SELECTED_IDS = [];
      window.UIE_PLACE_ARMED = null;
      window.UIE_STATE_PREVIEW = null;
      window.UIE_PALETTE_TAB = 'widgets';
      window.UIE_FOLDER_RENAME = null;
      window.UIE_BINDINGS_OVERLAY = false;
      window.renderAutomationStudioView = async () => {
        const root = document.getElementById('studio-designer-panel') || document.body;
        root.innerHTML = uieRenderDesigner();
        uieWireDesigner();
      };
      window.wfPushUndo = window.wfPushUndo || (() => {});
      const root = document.createElement('div');
      root.id = 'studio-designer-panel';
      document.body.innerHTML = '';
      document.body.appendChild(root);
      root.innerHTML = uieRenderDesigner();
      uieWireDesigner();
    }"""
    )
    page.wait_for_selector("#uie-designer-root", timeout=15000)


def run_tests():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        open_designer(page)

        # T1: effect stack add + reorder persists save/load
        try:
            page.evaluate("""() => {
              const w = uieAddWidget('frame', 40, 40);
              w.effects = [];
              const types = ['gradientFill', 'dropShadow', 'cornerRadius'];
              types.forEach((t, i) => {
                const et = UIE_EFFECT_TYPES.find(x => x.type === t);
                w.effects.push({ id: 'fx_' + t, type: t, enabled: true, params: { ...et.defaults }, order: i });
              });
              w.effects.reverse().forEach((fx, i) => { fx.order = i; });
              renderAutomationStudioView();
            }""")
            page.wait_for_timeout(200)
            saved = page.evaluate("""() => {
              const ui = JSON.parse(JSON.stringify(CURRENT_WF.ui));
              return { ui, order: ui.widgets[0].effects.map(e => e.type) };
            }""")
            page.evaluate("""(ui) => {
              CURRENT_WF.ui = ui;
              renderAutomationStudioView();
            }""", saved["ui"])
            page.wait_for_timeout(200)
            check = page.evaluate("""() => {
              const w = CURRENT_WF.ui.widgets[0];
              const order = (w.effects || []).map(e => e.type);
              const el = document.querySelector('[data-uie-widget="' + w.id + '"]');
              const style = el ? getComputedStyle(el).backgroundImage : '';
              return { order, hasGradient: style.includes('gradient') || (el?.getAttribute('style')||'').includes('gradient') };
            }""")
            results["T1_effects_persist"] = (
                check["order"] == ["cornerRadius", "dropShadow", "gradientFill"] and check["hasGradient"]
            )
        except Exception as e:
            results["T1_effects_persist"] = f"FAIL: {e}"

        # T2: export honesty for Glow + BackdropBlur
        try:
            wid = page.evaluate("""() => {
              const w = uieAddWidget('label', 10, 10);
              w.id = 'test_glow_widget';
              w.effects = [
                { id: 'g1', type: 'glow', enabled: true, params: { color: '#fff', size: 10, intensity: 1 }, order: 0 },
                { id: 'b1', type: 'backdropBlur', enabled: true, params: { radius: 8, tint: '#000' }, order: 1 },
              ];
              return w.id;
            }""")
            code = page.evaluate("""async () => {
              const r = await fetch('/api/workflows/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graph: CURRENT_WF }) });
              const j = await r.json();
              return j.code || '';
            }""")
            results["T2_export_honesty"] = (
                "unsupported effect glow on widget test_glow_widget" in code
                and "unsupported effect backdropBlur on widget test_glow_widget" in code
            )
        except Exception as e:
            results["T2_export_honesty"] = f"FAIL: {e}"

        # T3: marquee 3 widgets, group drag
        try:
            open_designer(page)
            page.evaluate("""() => {
              CURRENT_WF.ui.view = { zoom: 1, panX: 0, panY: 0 };
              uieAddWidget('button', 50, 50);
              uieAddWidget('button', 150, 50);
              uieAddWidget('button', 250, 50);
              renderAutomationStudioView();
            }""")
            page.wait_for_timeout(200)
            wrap = page.locator("#uie-canvas-wrap")
            box = wrap.bounding_box()
            page.mouse.move(box["x"] + 40, box["y"] + 40)
            page.mouse.down()
            page.mouse.move(box["x"] + box["width"] - 40, box["y"] + 120)
            page.mouse.up()
            page.wait_for_timeout(300)
            has_group = page.evaluate("() => !!document.querySelector('[data-uie-group-box]')")
            before = page.evaluate("""() => CURRENT_WF.ui.widgets.map(w => ({ id: w.id, x: w.x, y: w.y }))""")
            gb = page.locator("[data-uie-group-box]")
            if gb.count():
                gbox = gb.bounding_box()
                page.mouse.move(gbox["x"] + 10, gbox["y"] + 10)
                page.mouse.down()
                page.mouse.move(gbox["x"] + 50, gbox["y"] + 30)
                page.mouse.up()
            page.wait_for_timeout(300)
            after = page.evaluate("""() => CURRENT_WF.ui.widgets.map(w => ({ id: w.id, x: w.x, y: w.y }))""")
            deltas = [(a["x"] - b["x"], a["y"] - b["y"]) for b, a in zip(before, after)]
            same_delta = len(deltas) >= 3 and len(set(deltas)) == 1 and deltas[0] != (0, 0)
            results["T3_marquee_group_drag"] = has_group and same_delta
        except Exception as e:
            results["T3_marquee_group_drag"] = f"FAIL: {e}"

        # T4: copy/paste 2 widgets +16 offset
        try:
            page.mouse.up()
            page.wait_for_timeout(200)
            page.evaluate("""() => {
              CURRENT_WF.ui.widgets = [];
              UIE_CLIPBOARD = null;
              UIE_SELECTED_IDS = [];
              uieSyncSelection();
              const a = uieAddWidget('label', 20, 20);
              const b = uieAddWidget('label', 60, 60);
              uieSetSelection([a.id, b.id]);
              renderAutomationStudioView();
            }""")
            page.evaluate("""() => { STUDIO_TAB = 'designer'; }""")
            page.locator("#uie-designer-root").focus()
            page.wait_for_timeout(100)
            page.keyboard.press("Control+C")
            page.wait_for_timeout(100)
            before_ids = page.evaluate("() => CURRENT_WF.ui.widgets.map(w => w.id)")
            page.keyboard.press("Control+V")
            page.wait_for_timeout(300)
            check = page.evaluate("""(beforeIds) => {
              const all = CURRENT_WF.ui.widgets;
              const newOnes = all.filter(w => !beforeIds.includes(w.id));
              const orig = all.filter(w => beforeIds.includes(w.id));
              if (newOnes.length !== 2 || orig.length !== 2) return { ok: false, reason: 'count', newLen: newOnes.length, total: all.length, clip: !!UIE_CLIPBOARD };
              const unique = new Set(all.map(w => w.id)).size === all.length;
              const sortedOrig = [...orig].sort((a,b) => a.x - b.x || a.y - b.y);
              const sortedNew = [...newOnes].sort((a,b) => a.x - b.x || a.y - b.y);
              const offsetOk = sortedNew.every((n, i) => {
                const o = sortedOrig[i];
                return o && n.x === o.x + 16 && n.y === o.y + 16;
              });
              return { ok: unique && offsetOk, newOnes: sortedNew.map(w=>({x:w.x,y:w.y})), orig: sortedOrig.map(w=>({x:w.x,y:w.y})) };
            }""", before_ids)
            results["T4_copy_paste"] = check.get("ok", False)
        except Exception as e:
            results["T4_copy_paste"] = f"FAIL: {e}"

        # T5: guide at 120px snap
        try:
            open_designer(page)
            page.evaluate("""() => {
              uieEnsureCanvas().guides = [{ id: 'g120', axis: 'v', position: 120, locked: false }];
              const w = uieAddWidget('button', 200, 100);
              uieSetSelection([w.id]);
              w.x = 126;
              w.x = uieSnapAxis(w.x, 'v');
              renderAutomationStudioView();
              return w.x;
            }""")
            page.wait_for_timeout(200)
            x = page.evaluate("() => CURRENT_WF.ui.widgets[0].x")
            results["T5_guide_snap"] = abs(x - 120) <= 1
        except Exception as e:
            results["T5_guide_snap"] = f"FAIL: {e}"

        # T6: code view live update
        try:
            open_designer(page)
            page.evaluate("""() => {
              const w = uieAddWidget('label', 30, 30);
              w.props.text = 'Hello';
              uieSetSelection([w.id]);
              renderAutomationStudioView();
            }""")
            page.wait_for_timeout(200)
            page.fill('[data-uie-prop="text"]', "UpdatedLabel")
            page.wait_for_timeout(200)
            py = page.evaluate("() => document.getElementById('uie-inspector-code-python')?.textContent || ''")
            results["T6_code_view_live"] = "UpdatedLabel" in py
        except Exception as e:
            results["T6_code_view_live"] = f"FAIL: {e}"

        # T7: bindings overlay
        try:
            open_designer(page)
            page.evaluate("""() => {
              const btn = uieAddWidget('button', 80, 80);
              const nodeId = uieCreateGraphEvent(btn.id, 'clicked');
              UIE_BINDINGS_OVERLAY = true;
              renderAutomationStudioView();
              return { btnId: btn.id, nodeId };
            }""")
            page.wait_for_timeout(200)
            has_overlay = page.evaluate("""() => {
              const conn = document.querySelector('.uie-bind-connector');
              const chip = document.querySelector('[data-uie-bind-chip]');
              return !!(conn && chip);
            }""")
            page.evaluate("""() => { document.querySelector('[data-uie-bind-chip]')?.click(); }""")
            page.wait_for_timeout(300)
            tab = page.evaluate("() => STUDIO_TAB")
            results["T7_bindings_overlay"] = has_overlay and tab == "graph"
        except Exception as e:
            results["T7_bindings_overlay"] = f"FAIL: {e}"

        # T8: hover animation preview + codegen omission
        try:
            open_designer(page)
            page.evaluate("""() => {
              const btn = uieAddWidget('button', 100, 100);
              btn.id = 'anim_btn_test';
              btn.animations = [{ id: 'a1', enabled: true, trigger: 'hover', property: 'scale', from: 1, to: 1.1, duration: 160, easing: 'easeOut', delay: 0, repeat: false }];
              renderAutomationStudioView();
            }""")
            page.wait_for_timeout(200)
            # switch to preview
            page.evaluate("""() => {
              STUDIO_TAB = 'preview';
              const root = document.getElementById('studio-designer-panel') || document.body;
              root.innerHTML = uieRenderPreview();
              uieWirePreview();
            }""")
            page.wait_for_timeout(200)
            btn = page.locator('[data-uie-widget="anim_btn_test"] .uie-w-btn')
            btn.hover()
            page.wait_for_timeout(200)
            transform = page.evaluate("""() => {
              const el = document.querySelector('[data-uie-widget="anim_btn_test"]');
              return el ? getComputedStyle(el).transform : 'none';
            }""")
            code = page.evaluate("""async () => {
              const r = await fetch('/api/workflows/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graph: CURRENT_WF }) });
              return (await r.json()).code || '';
            }""")
            has_transform = transform not in ("none", "matrix(1, 0, 0, 1, 0, 0)")
            has_comment = "animation omitted: hover scale on widget anim_btn_test" in code
            results["T8_hover_animation"] = has_transform and has_comment
        except Exception as e:
            results["T8_hover_animation"] = f"FAIL: {e}"

        browser.close()

    print(json.dumps(results, indent=2))
    all_pass = all(v is True for v in results.values())
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(run_tests())
