#!/usr/bin/env python3
"""ZONE I acceptance tests for UI Designer frontier wave."""
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
      window.UIE_SELECTED_IDS = [];
      window.UIE_PLACE_ARMED = null;
      window.UIE_STATE_PREVIEW = null;
      window.UIE_PALETTE_TAB = 'widgets';
      window.UIE_FOLDER_RENAME = null;
      window.UIE_BINDING_SEARCH = '';
      window.UIE_SELECTED_STYLE_CLASS = null;
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


def open_preview(page):
    page.evaluate(
        """() => {
      window.STUDIO_TAB = 'preview';
      const root = document.getElementById('studio-designer-panel') || document.body;
      root.innerHTML = uieRenderPreview();
      uieWirePreview();
    }"""
    )
    page.wait_for_selector("#uie-preview-canvas", timeout=10000)


def run_tests():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        open_designer(page)

        # T1: style class on 3 buttons, class color updates all, override badge on one
        try:
            page.evaluate(
                """() => {
              const ui = CURRENT_WF.ui;
              ui.widgets = [];
              ui.styles = [];
              ui.screens = [{ id: 'screen_home', name: 'Home', rootWidgetIds: [] }];
              ui.activeScreenId = 'screen_home';
              const styleId = 'style_t1';
              ui.styles.push({
                id: styleId, name: 'BtnStyle',
                props: { appearance: { bg: '#111111', fg: '#ffffff' }, typography: { fontSize: 12 }, effects: [] }
              });
              ['button_1','button_2','button_3'].forEach((id, i) => {
                ui.widgets.push({
                  id, type: 'button', screenId: 'screen_home', parent: null,
                  x: 20, y: 20 + i * 50, width: 120, height: 32,
                  props: { text: 'B' + (i+1), bg: '', fg: '', fontSize: 12, visible: true, enabled: true, behavior: {}, states: {} },
                  events: {}, effects: [], animations: [], z: i,
                  styleClassId: styleId, styleOverrides: {}
                });
                ui.screens[0].rootWidgetIds.push(id);
              });
              ui.widgets[2].styleOverrides = { appearance: { bg: '#ff0000' } };
              renderAutomationStudioView();
            }"""
            )
            page.wait_for_timeout(400)
            colors_before = page.evaluate(
                """() => {
              const ui = CURRENT_WF.ui;
              return ui.widgets.map(w => {
                const el = document.querySelector(`[data-uie-widget="${w.id}"]`);
                const bg = el ? getComputedStyle(el).backgroundColor : '';
                return bg;
              });
            }"""
            )
            page.evaluate(
                """() => {
              CURRENT_WF.ui.styles[0].props.appearance.bg = '#00ff00';
              uieRefreshTokenReferences();
              renderAutomationStudioView();
            }"""
            )
            page.wait_for_timeout(300)
            colors_after = page.evaluate(
                """() => {
              const ui = CURRENT_WF.ui;
              return ui.widgets.map(w => {
                const el = document.querySelector(`[data-uie-widget="${w.id}"]`);
                return el ? getComputedStyle(el).backgroundColor : '';
              });
            }"""
            )
            badge = page.locator(".uie-override-badge").count()
            page.click('[data-uie-hier="button_3"]')
            page.wait_for_timeout(200)
            badge_after_select = page.locator(".uie-override-badge").count()
            results["T1_style_classes"] = (
                len(colors_before) == 3
                and colors_after[0] == colors_after[1]
                and colors_after[0] != colors_after[2]
                and badge_after_select >= 1
            )
        except Exception as e:
            results["T1_style_classes"] = f"FAIL: {e}"

        # T2: VStack panel with 3 children, spacing 12, read-only x/y
        try:
            open_designer(page)
            page.evaluate(
                """() => {
              const ui = CURRENT_WF.ui;
              ui.widgets = [];
              ui.screens = [{ id: 'screen_home', name: 'Home', rootWidgetIds: ['panel_1'] }];
              ui.activeScreenId = 'screen_home';
              ui.widgets.push({
                id: 'panel_1', type: 'frame', screenId: 'screen_home', parent: null,
                x: 10, y: 10, width: 200, height: 200,
                props: { text: '', visible: true, enabled: true, behavior: {}, states: {} },
                layout: { mode: 'vstack', spacing: 12, padding: 8, align: 'start' },
                events: {}, effects: [], animations: [], z: 0
              });
              ['child_a','child_b','child_c'].forEach((id, i) => {
                ui.widgets.push({
                  id, type: 'button', screenId: 'screen_home', parent: 'panel_1',
                  x: 99, y: 99, width: 100, height: 28,
                  props: { text: id, visible: true, enabled: true, behavior: {}, states: {} },
                  events: {}, effects: [], animations: [], z: i + 1
                });
              });
              renderAutomationStudioView();
            }"""
            )
            page.wait_for_timeout(400)
            layout = page.evaluate(
                """() => {
              const canvas = document.getElementById('uie-canvas');
              const kids = ['child_a','child_b','child_c'].map(id => canvas.querySelector(`[data-uie-widget="${id}"]`));
              const tops = kids.map(el => el ? parseFloat(el.style.top) : -1);
              const sorted = [...tops].sort((a,b) => a-b);
              const domOrder = kids.map(el => el ? parseFloat(el.style.top) : -1);
              const increasing = tops[0] < tops[1] && tops[1] < tops[2];
              const gap1 = tops[1] - tops[0] - 28;
              const gap2 = tops[2] - tops[1] - 28;
              return { tops, increasing, gap1, gap2, domOrder };
            }"""
            )
            page.click('[data-uie-hier="child_b"]')
            page.wait_for_timeout(200)
            readonly = page.evaluate(
                """() => {
              const x = document.querySelector('[data-uie-prop="x"]');
              const y = document.querySelector('[data-uie-prop="y"]');
              return { xReadonly: x?.readOnly, yReadonly: y?.readOnly };
            }"""
            )
            results["T2_vstack"] = (
                layout["increasing"]
                and abs(layout["gap1"] - 12) < 2
                and abs(layout["gap2"] - 12) < 2
                and readonly["xReadonly"]
                and readonly["yReadonly"]
            )
        except Exception as e:
            results["T2_vstack"] = f"FAIL: {e}"

        # T3: Home+Settings screens, navigate binding switches preview screen
        try:
            open_designer(page)
            page.evaluate(
                """() => {
              const ui = CURRENT_WF.ui;
              ui.widgets = [];
              ui.screens = [
                { id: 'screen_home', name: 'Home', rootWidgetIds: ['btn_nav'] },
                { id: 'screen_settings', name: 'Settings', rootWidgetIds: ['lbl_settings'] }
              ];
              ui.activeScreenId = 'screen_home';
              ui.widgets.push({
                id: 'btn_nav', type: 'button', screenId: 'screen_home', parent: null,
                x: 20, y: 20, width: 140, height: 32,
                props: { text: 'Go Settings', visible: true, enabled: true, behavior: {}, states: {} },
                events: { clicked: { binding: 'navigate', type: 'navigate', event: 'clicked', targetScreenId: 'screen_settings' } },
                effects: [], animations: [], z: 0
              });
              ui.widgets.push({
                id: 'lbl_settings', type: 'label', screenId: 'screen_settings', parent: null,
                x: 20, y: 20, width: 160, height: 24,
                props: { text: 'SETTINGS_SCREEN', visible: true, enabled: true, behavior: {}, states: {} },
                events: {}, effects: [], animations: [], z: 0
              });
            }"""
            )
            open_preview(page)
            page.wait_for_timeout(300)
            before = page.evaluate(
                "() => document.getElementById('uie-preview-canvas')?.innerText || ''"
            )
            page.click(".uie-w-btn")
            page.wait_for_timeout(400)
            after = page.evaluate(
                """() => ({
              text: document.getElementById('uie-preview-canvas')?.innerText || '',
              screen: UIE_PREVIEW_SCREEN_ID
            })"""
            )
            results["T3_navigate"] = (
                "SETTINGS_SCREEN" not in before
                and "SETTINGS_SCREEN" in after["text"]
                and after["screen"] == "screen_settings"
            )
        except Exception as e:
            results["T3_navigate"] = f"FAIL: {e}"

        # Round-trip persistence
        try:
            open_designer(page)
            snap = page.evaluate(
                """() => {
              const ui = JSON.parse(JSON.stringify(CURRENT_WF.ui));
              ui.styles = [{ id: 's1', name: 'S', props: uieDefaultStyleProps() }];
              ui.tokens = { colors: [{ id: 'c1', name: 'primary', value: '#abc' }], fonts: [] };
              ui.templates = [{ id: 't1', name: 'T', widgets: [], rootId: 'x' }];
              ui.screens = [
                { id: 'screen_home', name: 'Home', rootWidgetIds: [] },
                { id: 'screen_s2', name: 'S2', rootWidgetIds: [] }
              ];
              ui.activeScreenId = 'screen_s2';
              ui.preview = { responsivePreview: { width: 400, height: 600 } };
              CURRENT_WF.ui = ui;
              uieEnsureUi();
              return JSON.stringify(CURRENT_WF.ui);
            }"""
            )
            restored = page.evaluate(
                """(s) => {
              CURRENT_WF.ui = JSON.parse(s);
              uieEnsureUi();
              return JSON.stringify({
                styles: CURRENT_WF.ui.styles,
                screens: CURRENT_WF.ui.screens,
                tokens: CURRENT_WF.ui.tokens,
                templates: CURRENT_WF.ui.templates,
                preview: CURRENT_WF.ui.preview,
                activeScreenId: CURRENT_WF.ui.activeScreenId
              });
            }""",
                snap,
            )
            data = json.loads(restored)
            results["round_trip"] = (
                len(data["styles"]) == 1
                and len(data["screens"]) == 2
                and data["tokens"]["colors"][0]["value"] == "#abc"
                and len(data["templates"]) == 1
                and data["preview"]["responsivePreview"]["width"] == 400
                and data["activeScreenId"] == "screen_s2"
            )
        except Exception as e:
            results["round_trip"] = f"FAIL: {e}"

        browser.close()

    print(json.dumps(results, indent=2))
    all_pass = all(v is True for v in results.values())
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(run_tests())
