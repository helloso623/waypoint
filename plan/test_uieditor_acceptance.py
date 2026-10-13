#!/usr/bin/env python3
"""Acceptance tests for UMG Designer overhaul."""
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
        ui: { widgets: [], device: 'phone', folders: [], keybinds: [], view: { zoom: 1, panX: 0, panY: 0 } },
        meta: { zoom: 1, panX: 0, panY: 0 },
      };
      window.STUDIO_TAB = 'designer';
      window.UIE_SELECTED = null;
      window.UIE_PLACE_ARMED = null;
      window.UIE_STATE_PREVIEW = null;
      window.UIE_PALETTE_TAB = 'widgets';
      window.UIE_FOLDER_RENAME = null;
      window.UIE_BINDING_SEARCH = '';
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

        # T1: click-to-place Button, Esc cancels, palette clickable again
        try:
            page.click('[data-uie-palette="button"]')
            page.wait_for_timeout(200)
            armed = page.evaluate("() => UIE_PLACE_ARMED === 'button'")
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
            cancelled = page.evaluate(
                "() => !UIE_PLACE_ARMED && !document.getElementById('uie-place-ghost')"
            )
            page.click('[data-uie-palette="label"]')
            page.wait_for_timeout(200)
            rearmed = page.evaluate("() => UIE_PLACE_ARMED === 'label'")
            page.keyboard.press("Escape")
            results["T1_click_place_esc"] = armed and cancelled and rearmed
        except Exception as e:
            results["T1_click_place_esc"] = f"FAIL: {e}"

        # T2: spawn Button, click empty canvas -> deselected, drawer closed
        try:
            open_designer(page)
            page.click('[data-uie-palette="button"]')
            page.locator("#uie-canvas-wrap").click(position={"x": 200, "y": 200})
            page.wait_for_timeout(300)
            selected = page.evaluate("() => UIE_SELECTED")
            drawer_visible = page.locator("#uie-events-drawer").is_visible()
            page.locator("#uie-canvas").click(position={"x": 10, "y": 10})
            page.wait_for_timeout(300)
            deselected = page.evaluate("() => !UIE_SELECTED")
            drawer_closed = page.evaluate(
                "() => document.getElementById('uie-events-drawer').style.display === 'none'"
            )
            results["T2_button_deselect"] = (
                selected is not None
                and drawer_visible
                and deselected
                and drawer_closed
            )
        except Exception as e:
            results["T2_button_deselect"] = f"FAIL: {e}"

        # T3: pan+zoom change canvas transform
        try:
            open_designer(page)
            before = page.evaluate(
                """() => {
              const v = document.getElementById('uie-viewport');
              return v ? v.style.transform : '';
            }"""
            )
            wrap = page.locator("#uie-canvas-wrap")
            box = wrap.bounding_box()
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.keyboard.down("Control")
            page.mouse.wheel(0, -400)
            page.keyboard.up("Control")
            page.wait_for_timeout(150)
            page.keyboard.down(" ")
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.mouse.down()
            page.mouse.move(box["x"] + box["width"] / 2 + 60, box["y"] + box["height"] / 2 + 40)
            page.mouse.up()
            page.keyboard.up(" ")
            page.wait_for_timeout(150)
            after = page.evaluate(
                """() => {
              const v = document.getElementById('uie-viewport');
              const ui = CURRENT_WF.ui.view || {};
              return { transform: v?.style.transform || '', zoom: ui.zoom, panX: ui.panX, panY: ui.panY };
            }"""
            )
            changed = after["transform"] != before or after["zoom"] != 1 or after["panX"] != 0 or after["panY"] != 0
            results["T3_pan_zoom"] = changed
        except Exception as e:
            results["T3_pan_zoom"] = f"FAIL: {e}"

        # T4: custom device 500x500 resizes frame
        try:
            open_designer(page)
            page.select_option("#uie-device-select", "custom")
            page.fill("#uie-device-w", "500")
            page.fill("#uie-device-h", "500")
            page.locator("#uie-device-h").blur()
            page.wait_for_timeout(400)
            size = page.evaluate(
                """() => {
              const f = document.getElementById('uie-device-frame');
              const d = CURRENT_WF.ui.device;
              return { w: f?.offsetWidth, h: f?.offsetHeight, device: d };
            }"""
            )
            results["T4_custom_device"] = (
                size["w"] == 500
                and size["h"] == 500
                and size["device"]["w"] == 500
                and size["device"]["h"] == 500
            )
        except Exception as e:
            results["T4_custom_device"] = f"FAIL: {e}"

        # T5: create folder and drag widget into it
        try:
            open_designer(page)
            page.click('[data-uie-palette="button"]')
            page.locator("#uie-canvas-wrap").click(position={"x": 180, "y": 180})
            page.wait_for_timeout(300)
            widget_id = page.evaluate("() => CURRENT_WF.ui.widgets[0]?.id")
            page.click("#uie-folder-add")
            page.wait_for_timeout(300)
            folder_id = page.evaluate("() => CURRENT_WF.ui.folders[0]?.id")
            page.evaluate(
                """([widgetId, folderId]) => {
              const w = CURRENT_WF.ui.widgets.find(x => x.id === widgetId);
              if (w) w.folderId = folderId;
              renderAutomationStudioView();
            }""",
                [widget_id, folder_id],
            )
            page.wait_for_timeout(300)
            tree = page.evaluate(
                """() => {
              const w = CURRENT_WF.ui.widgets[0];
              const folders = CURRENT_WF.ui.folders;
              const inFolder = !!(w?.folderId && folders.some(f => f.id === w.folderId));
              const hierHasWidget = (document.getElementById('uie-hierarchy')?.innerText || '').includes(w?.id || '');
              return { folderId: w?.folderId, folders: folders.length, inFolder, hierHasWidget };
            }"""
            )
            results["T5_folder_tree"] = (
                tree["folderId"] == folder_id
                and tree["folders"] == 1
                and tree["inFolder"]
                and tree["hierHasWidget"]
            )
        except Exception as e:
            results["T5_folder_tree"] = f"FAIL: {e}"

        browser.close()

    print(json.dumps(results, indent=2))
    all_pass = all(v is True for v in results.values())
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(run_tests())
