#!/usr/bin/env python3
"""Acceptance tests for Designer image upload, asset manager, and codegen."""
import ast
import json
import re
import struct
import sys
import zlib

import requests
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5099"
PNG_PATH = "/tmp/zz.png"
CREATED_ATTACHMENT_IDS = []


def write_tiny_png(path):
    try:
        from PIL import Image

        img = Image.new("RGB", (8, 8), color=(200, 40, 80))
        img.save(path, format="PNG")
        return
    except ImportError:
        pass

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes([0, 0, 0, 200, 40, 80]) * 8 for _ in range(8))
    ihdr = struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def upload_test_png():
    write_tiny_png(PNG_PATH)
    with open(PNG_PATH, "rb") as f:
        res = requests.post(
            f"{BASE}/api/attachments",
            files={"file": ("zz.png", f, "image/png")},
            data={"entity_type": "ui_asset", "entity_id": "0"},
            timeout=15,
        )
    res.raise_for_status()
    data = res.json()
    CREATED_ATTACHMENT_IDS.append(data["id"])
    return data


def cleanup_attachments():
    for att_id in CREATED_ATTACHMENT_IDS:
        try:
            requests.delete(f"{BASE}/api/attachments/{att_id}", timeout=10)
        except Exception:
            pass


def open_designer(page):
    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.wait_for_function("() => typeof uieRenderDesigner === 'function'", timeout=15000)
    page.evaluate(
        """() => {
      window.CURRENT_WF = window.CURRENT_WF || {
        id: 0,
        nodes: [{ id: 'start', type: 'start', x: 30, y: 30, params: {} }],
        edges: [], variables: [], functions: [], comments: [], notes: [],
        ui: { widgets: [], device: 'phone', folders: [], keybinds: [], assets: [],
              screens: [{ id: 'screen_home', name: 'Home', rootWidgetIds: [] }],
              activeScreenId: 'screen_home',
              view: { zoom: 1, panX: 0, panY: 0 } },
        meta: { zoom: 1, panX: 0, panY: 0 },
      };
      window.STUDIO_TAB = 'designer';
      window.UIE_SELECTED = null;
      window.UIE_SELECTED_IDS = [];
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
    write_tiny_png(PNG_PATH)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        open_designer(page)

        # T1: Image widget upload shows attachment URL and renders image
        try:
            page.click('[data-uie-palette="image"]')
            page.locator("#uie-canvas-wrap").click(position={"x": 200, "y": 200})
            page.wait_for_timeout(400)
            widget_id = page.evaluate("() => CURRENT_WF.ui.widgets[0]?.id")
            with page.expect_file_chooser() as fc_info:
                page.click('[data-uie-upload-prop="imageSrc"]')
            fc_info.value.set_files(PNG_PATH)
            page.wait_for_timeout(1200)
            state = page.evaluate(
                """() => {
              const w = CURRENT_WF.ui.widgets[0];
              const src = w?.props?.imageSrc || '';
              const img = document.querySelector('[data-uie-widget] .uie-w-image-img');
              const bg = document.querySelector('[data-uie-widget]')?.style?.backgroundImage || '';
              return {
                src,
                hasImg: !!img,
                naturalWidth: img?.naturalWidth || 0,
                bgImage: bg,
              };
            }"""
            )
            match = re.match(r"^/api/attachments/(\d+)/file$", state["src"] or "")
            if match:
                CREATED_ATTACHMENT_IDS.append(int(match.group(1)))
            results["T1_image_upload"] = bool(
                match
                and state["hasImg"]
                and (state["naturalWidth"] > 0 or "attachments" in (state["bgImage"] or state["src"]))
            )
        except Exception as e:
            results["T1_image_upload"] = f"FAIL: {e}"

        # T2: Uploaded asset grid, apply to background, delete + 404
        try:
            open_designer(page)
            page.click('[data-uie-palette-tab="assets"]')
            page.wait_for_timeout(300)
            with page.expect_file_chooser() as fc_info:
                page.click("#uie-asset-upload-btn")
            fc_info.value.set_files(PNG_PATH)
            page.wait_for_timeout(1200)
            grid_info = page.evaluate(
                """() => {
              const items = document.querySelectorAll('[data-uie-uploaded-asset]');
              const assets = CURRENT_WF.ui.assets || [];
              return { gridCount: items.length, registryCount: assets.length, firstUrl: assets[0]?.url || '' };
            }"""
            )
            page.click('[data-uie-palette-tab="widgets"]')
            page.wait_for_timeout(200)
            page.click('[data-uie-palette="button"]')
            page.locator("#uie-canvas-wrap").click(position={"x": 160, "y": 160})
            page.wait_for_timeout(300)
            page.evaluate(
                """() => {
              const asset = (CURRENT_WF.ui.assets || [])[0];
              const w = CURRENT_WF.ui.widgets.find(x => x.type === 'button');
              if (asset && w) uieApplyUploadedAssetToWidget(w, asset.url, 'bg');
              renderAutomationStudioView();
            }"""
            )
            page.wait_for_timeout(400)
            bg_applied = page.evaluate(
                """() => {
              const w = CURRENT_WF.ui.widgets.find(x => x.type === 'button');
              const url = typeof w?.props?.bgAsset === 'object' ? w.props.bgAsset.assetUrl : '';
              const style = document.querySelector('[data-uie-widget]')?.getAttribute('style') || '';
              return { url, styleHasBg: style.includes('background-image') || style.includes('url(') };
            }"""
            )
            att_id = page.evaluate(
                """() => {
              const asset = (CURRENT_WF.ui.assets || [])[0];
              return asset ? asset.id : null;
            }"""
            )
            if att_id:
                CREATED_ATTACHMENT_IDS.append(int(att_id))
            page.click('[data-uie-palette-tab="assets"]')
            page.wait_for_timeout(200)
            page.once("dialog", lambda d: d.accept())
            page.click(f'[data-uie-asset-del="{att_id}"]')
            page.wait_for_timeout(800)
            status_after = requests.get(f"{BASE}/api/attachments/{att_id}/file", timeout=10).status_code if att_id else 0
            registry_after = page.evaluate("() => (CURRENT_WF.ui.assets || []).length")
            results["T2_asset_manager"] = (
                grid_info["gridCount"] >= 1
                and grid_info["registryCount"] >= 1
                and bool(bg_applied["url"])
                and (bg_applied["styleHasBg"] or bool(bg_applied["url"]))
                and status_after == 404
                and registry_after == 0
            )
        except Exception as e:
            results["T2_asset_manager"] = f"FAIL: {e}"

        # Regression: click-to-place + styles panel render
        try:
            open_designer(page)
            page.click('[data-uie-palette="button"]')
            page.wait_for_timeout(200)
            armed = page.evaluate("() => UIE_PLACE_ARMED === 'button'")
            page.click('[data-uie-palette-tab="styles"]')
            page.wait_for_timeout(200)
            styles_ok = page.evaluate(
                """() => {
              const panel = document.getElementById('uie-palette-styles');
              return !!panel && !panel.hidden && panel.innerText.length > 0;
            }"""
            )
            results["T_regression_place_styles"] = armed and styles_ok
        except Exception as e:
            results["T_regression_place_styles"] = f"FAIL: {e}"

        browser.close()

    # T3: codegen contains PhotoImage + download logic
    try:
        uploaded = upload_test_png()
        url = f"/api/attachments/{uploaded['id']}/file"
        graph = {
            "nodes": [{"id": "start", "type": "start", "x": 0, "y": 0, "params": {}}],
            "edges": [],
            "variables": [],
            "ui": {
                "widgets": [
                    {
                        "id": "image_1",
                        "type": "image",
                        "screenId": "screen_home",
                        "x": 10,
                        "y": 10,
                        "width": 80,
                        "height": 80,
                        "props": {"imageSrc": url, "text": "Image"},
                        "events": {},
                    }
                ],
                "screens": [{"id": "screen_home", "name": "Home", "rootWidgetIds": ["image_1"]}],
            },
        }
        from workflow import generate_code

        code = generate_code(graph)
        ast.parse(code)
        results["T3_codegen"] = (
            "PhotoImage" in code
            and "_download_ui_attachment" in code
            and "urllib" in code
        )
    except Exception as e:
        results["T3_codegen"] = f"FAIL: {e}"

    cleanup_attachments()
    print(json.dumps(results, indent=2))
    all_pass = all(v is True for v in results.values())
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(run_tests())
