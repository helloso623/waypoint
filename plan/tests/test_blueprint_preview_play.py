#!/usr/bin/env python3
"""Playwright coverage for Blueprint-first in-browser Preview execution.

The agent codes from scratch in Blueprint; Python is the compile target.

Run with Waypoint listening on http://127.0.0.1:5099:
    .venv/bin/python tests/test_blueprint_preview_play.py
"""

from __future__ import annotations

import os

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get("WAYPOINT_TEST_URL", "http://127.0.0.1:5099")


def _server_is_up():
    """These tests drive a REAL running Waypoint; without one they should skip, not fail.

    Reporting "3 failed" when the only problem is that nobody started the app buries genuine
    regressions in noise -- which is exactly what happened: a real SyntaxError in misc.js sat
    behind a wall of environmental failures nobody could distinguish from it.
    """
    import urllib.error
    import urllib.request
    try:
        urllib.request.urlopen(BASE_URL, timeout=3)
        return True
    except urllib.error.HTTPError:
        return True          # answered, just not 200 -- the server is up
    except Exception:
        return False


pytest = __import__("pytest")
pytestmark = pytest.mark.skipif(
    not _server_is_up(), reason=f"no Waypoint server listening at {BASE_URL}"
)


def _launch_browser(playwright):
    executable = os.environ.get("WAYPOINT_CHROME_PATH")
    if not executable and os.path.exists("/usr/bin/google-chrome"):
        executable = "/usr/bin/google-chrome"
    kwargs = {"headless": True}
    if executable:
        kwargs["executable_path"] = executable
    return playwright.chromium.launch(**kwargs)


def _open_blueprint(page: Page) -> None:
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
    page.wait_for_selector("#launcher-cinematic", state="visible", timeout=20_000)
    page.locator('.launcher-card[data-app="blueprint"]').click()
    page.wait_for_selector("#node-canvas", state="visible", timeout=20_000)


def _click_primary_run(page: Page) -> None:
    run = page.locator("#studio-tb-run")
    if run.is_visible():
        run.click()
        return
    page.locator("#studio-tb-more").click()
    page.locator("#studio-tb-overflow-menu").get_by_role("button", name="Run", exact=True).click()


def _drag_pin(page: Page, source, target) -> None:
    source_box = source.bounding_box()
    target_box = target.bounding_box()
    assert source_box and target_box
    page.mouse.move(
        source_box["x"] + source_box["width"] / 2,
        source_box["y"] + source_box["height"] / 2,
    )
    page.mouse.down()
    page.mouse.move(
        target_box["x"] + target_box["width"] / 2,
        target_box["y"] + target_box["height"] / 2,
        steps=12,
    )
    page.mouse.up()


def _add_node_from_canvas_menu(page: Page, node_type: str, x_ratio: float) -> None:
    canvas = page.locator("#node-canvas")
    box = canvas.bounding_box()
    assert box
    visible_top = max(0, box["y"])
    visible_bottom = min(page.viewport_size["height"], box["y"] + box["height"])
    page.mouse.click(
        box["x"] + box["width"] * x_ratio,
        visible_top + (visible_bottom - visible_top) * 0.5,
        button="right",
    )
    page.locator("#wf-context-search").fill(node_type)
    page.locator(f'#wf-context-menu button[data-type="{node_type}"]').click()


def test_flappy_plays_in_preview() -> None:
    with sync_playwright() as playwright:
        browser = _launch_browser(playwright)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        context.add_init_script(
            """
            localStorage.setItem("launcherDockTab", "workspace");
            window.__blueprintConfirmCalls = 0;
            window.confirm = () => { window.__blueprintConfirmCalls += 1; return false; };
            """
        )
        page = context.new_page()
        try:
            _open_blueprint(page)
            page.evaluate(
                """
                async () => {
                  const template = window.WAYPOINT_TEMPLATES.find(t => t.id === "flappy_bird");
                  const payload = template.build();
                  CURRENT_WF = { id: null, name: payload.name, ...payload.graph };
                  STUDIO_TAB = "graph";
                  await renderAutomationStudioView();
                }
                """
            )
            page.wait_for_selector("#studio-tb-run", state="attached")
            _click_primary_run(page)

            page.wait_for_function("() => STUDIO_TAB === 'preview'")
            canvas = page.locator("#uie-preview-canvas")
            canvas.wait_for(state="visible")
            assert page.evaluate("() => window.__blueprintConfirmCalls") == 0
            assert page.locator("#uie-preview-root").get_attribute("data-blueprint-running") == "true"

            bird = page.locator('[data-uie-widget="flappy_bird"]')
            flap = page.locator('[data-uie-widget="flappy_flap_btn"] .uie-w-btn')
            bird.wait_for(state="visible")
            before_y = bird.evaluate("el => parseFloat(el.style.top)")
            before_score = page.evaluate("() => UIE_PREVIEW_STATE.score")
            flap.click()
            page.wait_for_function(
                """
                ([y, score]) => {
                  const bird = document.querySelector('[data-uie-widget="flappy_bird"]');
                  return UIE_PREVIEW_STATE.bird_vy < 0
                    || UIE_PREVIEW_STATE.score > score
                    || parseFloat(bird?.style.top || "0") !== y;
                }
                """,
                arg=[before_y, before_score],
                timeout=2_000,
            )
        finally:
            context.close()
            browser.close()


def test_mouse_scratch_print_runs_in_preview() -> None:
    with sync_playwright() as playwright:
        browser = _launch_browser(playwright)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        context.add_init_script(
            """
            localStorage.setItem("launcherDockTab", "workspace");
            window.__blueprintConfirmCalls = 0;
            window.confirm = () => { window.__blueprintConfirmCalls += 1; return false; };
            """
        )
        page = context.new_page()
        try:
            _open_blueprint(page)
            page.evaluate(
                """
                async () => {
                  CURRENT_WF = freshWorkflow();
                  STUDIO_TAB = "graph";
                  await renderAutomationStudioView();
                }
                """
            )

            # Add a real control-flow chain from the searchable canvas catalog.
            _add_node_from_canvas_menu(page, "exec_gate", 0.46)
            gate_node = page.locator(".node-card.type-exec_gate").last
            gate_node.wait_for(state="visible")
            gate_node_id = gate_node.get_attribute("data-node-id")
            assert gate_node_id

            _add_node_from_canvas_menu(page, "print", 0.72)
            print_node = page.locator(".node-card.type-print").last
            print_node.wait_for(state="visible")
            print_node_id = print_node.get_attribute("data-node-id")
            assert print_node_id
            message = print_node.locator('.wf-pin-literal[data-param="message"]')
            message.click()
            page.keyboard.insert_text("Scratch says hello")
            page.keyboard.press("Tab")

            # Wire Start -> Execution Gate -> Print through the gate's Pass branch.
            start_pin = page.locator(
                '.node-card[data-node-id="start"] .wf-pin-out[data-pin-kind="exec"]'
            )
            gate_in = gate_node.locator('.wf-pin-in[data-pin-kind="exec"]')
            gate_pass = gate_node.locator(
                '.wf-pin-out[data-pin-kind="exec"][data-pin-port="pass"]'
            )
            print_pin = print_node.locator('.wf-pin-in[data-pin-kind="exec"]')
            _drag_pin(page, start_pin, gate_in)
            _drag_pin(page, gate_pass, print_pin)
            page.wait_for_function(
                """
                ([gateNodeId, printNodeId]) =>
                  CURRENT_WF.edges.some(edge =>
                    edge.from === "start" && edge.to === gateNodeId && edge.kind === "exec"
                  ) && CURRENT_WF.edges.some(edge =>
                    edge.from === gateNodeId && edge.fromPort === "pass"
                      && edge.to === printNodeId && edge.kind === "exec"
                  )
                """,
                arg=[gate_node_id, print_node_id],
                timeout=2_000,
            )
            page.wait_for_function(
                """
                () => {
                  const code = document.querySelector("#wf-code-editor")?.value || "";
                  return code.includes("if True:") && code.includes("Scratch says hello");
                }
                """,
                timeout=3_000,
            )

            _click_primary_run(page)
            page.wait_for_selector("#uie-preview-canvas", state="visible")
            page.wait_for_function(
                "() => document.querySelector('#uie-preview-console')?.textContent.includes('Scratch says hello')",
                timeout=2_000,
            )
            assert page.evaluate("() => STUDIO_TAB") == "preview"
            assert page.evaluate("() => window.__blueprintConfirmCalls") == 0
        finally:
            context.close()
            browser.close()


def test_empty_canvas_right_click_adds_print_on_screen_and_back_goes_home() -> None:
    with sync_playwright() as playwright:
        browser = _launch_browser(playwright)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            reduced_motion="reduce",
        )
        context.add_init_script('localStorage.setItem("launcherDockTab", "workspace");')
        page = context.new_page()
        try:
            _open_blueprint(page)
            page.evaluate(
                """
                async () => {
                  CURRENT_WF = freshWorkflow();
                  STUDIO_TAB = "graph";
                  await renderAutomationStudioView();
                }
                """
            )

            canvas = page.locator("#node-canvas")
            canvas_box = canvas.bounding_box()
            assert canvas_box
            visible_top = max(0, canvas_box["y"])
            visible_bottom = min(900, canvas_box["y"] + canvas_box["height"])
            assert visible_bottom - visible_top > 180
            click_x = canvas_box["x"] + canvas_box["width"] * 0.68
            click_y = visible_top + (visible_bottom - visible_top) * 0.5

            page.mouse.click(click_x, click_y, button="right")
            menu = page.locator("#wf-context-menu")
            menu.wait_for(state="visible")
            for node_type in (
                "exec_gate",
                "print",
                "add",
                "str_upper",
                "list_append",
                "set_widget",
                "__get_var_create__",
            ):
                assert menu.locator(f'button[data-type="{node_type}"]').count() == 1
            page.locator("#wf-context-search").fill("Print")
            menu.locator('button[data-type="print"]').click()

            print_node = page.locator(".node-card.type-print").last
            print_node.wait_for(state="visible")
            print_box = print_node.bounding_box()
            canvas_box = canvas.bounding_box()
            assert print_box and canvas_box
            visible_left = max(0, canvas_box["x"])
            visible_top = max(0, canvas_box["y"])
            visible_right = min(1440, canvas_box["x"] + canvas_box["width"])
            visible_bottom = min(900, canvas_box["y"] + canvas_box["height"])
            assert print_box["x"] >= visible_left - 1
            assert print_box["y"] >= visible_top - 1
            assert print_box["x"] + print_box["width"] <= visible_right + 1
            assert print_box["y"] + print_box["height"] <= visible_bottom + 1
            assert page.evaluate(
                "() => CURRENT_WF.nodes.some(node => node.type === 'print')"
            )

            page.get_by_role("button", name="Back to Home").click()
            page.wait_for_selector("#launcher-cinematic", state="visible")
            assert page.evaluate("() => !AUTOMATION_STUDIO_OPEN && ACTIVE_TAB === 'Home'")
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    test_flappy_plays_in_preview()
    print("flappy preview play OK")
    test_mouse_scratch_print_runs_in_preview()
    print("mouse scratch preview play OK")
    test_empty_canvas_right_click_adds_print_on_screen_and_back_goes_home()
    print("right-click add + Home back OK")
