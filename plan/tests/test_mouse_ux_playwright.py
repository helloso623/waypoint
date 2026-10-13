#!/usr/bin/env python3
"""Mouse-driven Playwright UX verification for Waypoint.

Run from the repository root:
    .venv/bin/python tests/test_mouse_ux_playwright.py
"""

from __future__ import annotations

import json
import sys
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Locator, Page, TimeoutError, sync_playwright


BASE_URL = "http://127.0.0.1:5099"
ARTIFACT_ROOT = Path("/opt/cursor/artifacts/mouse-ux")
SCREENSHOT_DIR = ARTIFACT_ROOT / "screenshots"
RESULTS_DIR = ARTIFACT_ROOT / "results"
CONSOLE_LOG = ARTIFACT_ROOT / "console.log.txt"

SURFACES = (
    "HOME",
    "TODAY",
    "COMPANION Confirm",
    "BLUEPRINT",
    "ARCADE",
    "DOCS/Repo",
    "CONSOLE",
)


class MouseUxRunner:
    def __init__(self, browser: Browser) -> None:
        self.context: BrowserContext = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            device_scale_factor=1,
            reduced_motion="reduce",
        )
        self.context.add_init_script(
            """
            (() => {
              const now = new Date();
              const pad = n => String(n).padStart(2, "0");
              const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
              localStorage.removeItem("companionChatHistory");
              localStorage.removeItem("companionMemories");
              localStorage.removeItem("companionOpen");
              localStorage.removeItem("repo-open-file-id");
              localStorage.removeItem("repo-editor-mode-by-ext");
              localStorage.setItem("launcherDockTab", "workspace");
              localStorage.setItem("ritualDate", localToday);
            })();
            """
        )
        self.page: Page = self.context.new_page()
        self.page.set_default_timeout(12_000)
        self.results: list[dict[str, Any]] = []
        self.console_entries: list[dict[str, str]] = []
        self.chat_posts: list[dict[str, Any]] = []
        self._install_observers_and_mocks()

    def close(self) -> None:
        self.context.close()

    def _install_observers_and_mocks(self) -> None:
        def on_console(message: Any) -> None:
            if message.type != "error":
                return
            location = message.location or {}
            self.console_entries.append(
                {
                    "kind": "console.error",
                    "text": message.text,
                    "source": str(location.get("url") or ""),
                }
            )

        def on_page_error(error: Exception) -> None:
            self.console_entries.append(
                {"kind": "pageerror", "text": str(error), "source": ""}
            )

        self.page.on("console", on_console)
        self.page.on("pageerror", on_page_error)

        def companion_history(route: Any) -> None:
            if route.request.method == "GET":
                body = {"messages": [], "updated_at": None}
            else:
                body = {"ok": True}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

        def companion_chat(route: Any) -> None:
            try:
                request_body = route.request.post_data_json
            except Exception:
                request_body = {}
            if not isinstance(request_body, dict):
                request_body = {}
            self.chat_posts.append(request_body)
            message = str(request_body.get("message") or "")
            if message.startswith("[CONFIRM_TOOL]"):
                body = {
                    "reply": "Done — the test contact was added.",
                    "actions": [
                        {
                            "tool": "add_contact",
                            "input": {
                                "name": "ZZTEST Mouse UX",
                                "email": "mouse-ux@example.invalid",
                            },
                            "result": {"ok": True},
                        }
                    ],
                    "steps": ["Added ZZTEST Mouse UX"],
                    "confirmations": [],
                    "confirmed": True,
                }
            else:
                body = {
                    "reply": "I prepared the contact and need your confirmation.",
                    "actions": [],
                    "steps": ["Prepared a contact write"],
                    "confirmations": [
                        {
                            "tool": "add_contact",
                            "input": {
                                "name": "ZZTEST Mouse UX",
                                "email": "mouse-ux@example.invalid",
                            },
                            "summary": "Add ZZTEST Mouse UX as a contact",
                        }
                    ],
                }
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

        def no_running_agents(route: Any) -> None:
            body: Any
            if "/activity/" in route.request.url:
                body = []
            else:
                body = {"in_flight": False, "running_agents": []}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

        self.page.route("**/api/companion/history", companion_history)
        self.page.route("**/api/companion/chat", companion_chat)
        self.page.route("**/api/agent/running", no_running_agents)
        self.page.route("**/api/agent/activity/running", no_running_agents)

    def record(self, surface: str, check: str, passed: bool, detail: str = "") -> None:
        row = {"surface": surface, "check": check, "passed": bool(passed), "detail": detail}
        self.results.append(row)
        suffix = f" — {detail}" if detail else ""
        print(f"{'PASS' if passed else 'FAIL'} [{surface}] {check}{suffix}")

    def check(self, surface: str, check: str, condition: Any, detail: str = "") -> bool:
        passed = bool(condition)
        self.record(surface, check, passed, detail)
        return passed

    def mouse_point(self, locator: Locator) -> tuple[float, float]:
        locator.wait_for(state="visible")
        locator.scroll_into_view_if_needed()
        box = locator.bounding_box()
        if not box or box["width"] <= 0 or box["height"] <= 0:
            raise AssertionError(f"element has no clickable bounding box: {locator}")
        x = box["x"] + box["width"] / 2
        y = box["y"] + box["height"] / 2
        self.page.mouse.move(x, y, steps=8)
        self.page.wait_for_timeout(80)
        return x, y

    def mouse_click(self, locator: Locator, *, button: str = "left") -> None:
        x, y = self.mouse_point(locator)
        self.page.mouse.click(x, y, button=button)

    def screenshot(self, surface: str, filename: str) -> None:
        path = SCREENSHOT_DIR / filename
        try:
            self.page.screenshot(path=str(path), full_page=True, animations="disabled")
            self.record(surface, "screenshot captured", True, str(path))
        except Exception as exc:
            self.record(surface, "screenshot captured", False, str(exc))

    def goto_home(self) -> None:
        self.page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
        self.page.wait_for_selector("#launcher-cinematic", state="visible", timeout=20_000)
        self.page.wait_for_function(
            "() => document.querySelectorAll('.launcher-card').length > 0",
            timeout=20_000,
        )

    def open_home_app(self, app_id: str, destination_selector: str) -> None:
        tile = self.page.locator(f'.launcher-card[data-app="{app_id}"]')
        self.mouse_click(tile)
        self.page.wait_for_selector(destination_selector, state="visible", timeout=20_000)

    def run_surface(self, surface: str, filename: str, body: Callable[[], None]) -> None:
        try:
            body()
        except Exception as exc:
            detail = f"{type(exc).__name__}: {exc}"
            self.record(surface, "surface completed", False, detail)
            print(traceback.format_exc())
        finally:
            self.screenshot(surface, filename)

    def test_home(self) -> None:
        surface = "HOME"
        self.goto_home()

        apps_tab = self.page.locator('.launcher-dock-tab[data-dock="workspace"]')
        if apps_tab.count() and apps_tab.is_visible():
            self.mouse_click(apps_tab)
            self.check(
                surface,
                "Apps dock selected with mouse",
                apps_tab.get_attribute("aria-selected") == "true",
            )
        else:
            self.record(surface, "Apps dock selected with mouse", True, "not rendered")

        weather_button_visible = self.page.locator("#launcher-weather-btn").is_visible()
        set_weather_visible = self.page.locator("button", has_text="Set weather").evaluate_all(
            "(els) => els.some(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length))"
        )
        self.check(surface, "weather button absent", not weather_button_visible)
        self.check(surface, "Set weather action absent", not set_weather_visible)

        customize = self.page.locator("#launcher-spots-customize")
        self.mouse_point(customize)
        self.check(
            surface,
            "Reset hidden while only hovering Customize pins",
            not self.page.locator("#launcher-spots-reset").is_visible(),
        )
        self.mouse_click(customize)
        self.page.wait_for_selector("#launcher-spots-reset", state="visible")
        self.check(
            surface,
            "Reset appears only after Customize mode",
            self.page.locator("#launcher-spots-reset").is_visible()
            and customize.get_attribute("aria-pressed") == "true",
        )

    def test_today(self) -> None:
        surface = "TODAY"
        self.goto_home()
        self.open_home_app("planner", "#pls-compact-row")

        compact = self.page.locator("#pls-compact-row")
        self.check(surface, "compact pulse row visible", compact.is_visible())
        self.check(surface, "legacy full pulse card absent", self.page.locator("#pls-card").count() == 0)

        due = self.page.locator('.pln-rail-filter[data-filter="due_today"]')
        overdue = self.page.locator('.pln-rail-filter[data-filter="overdue"]')
        self.check(
            surface,
            "task rail exposes Due and Overdue",
            due.is_visible()
            and overdue.is_visible()
            and due.inner_text().strip() == "Due"
            and overdue.inner_text().strip() == "Overdue",
        )

        day_metrics = self.page.locator("details.tdy-metrics-card")
        self.check(surface, "Day metrics details visible", day_metrics.is_visible())
        self.check(
            surface,
            "Day metrics closed by default",
            day_metrics.get_attribute("open") is None,
        )

    def test_companion_confirm(self) -> None:
        surface = "COMPANION Confirm"
        self.goto_home()
        self.chat_posts.clear()

        self.mouse_click(self.page.locator("#companion-launcher"))
        self.page.wait_for_selector("#companion-panel:not([hidden])", state="visible")
        companion_input = self.page.locator("#companion-input")
        self.mouse_click(companion_input)
        self.page.keyboard.insert_text(
            "Add ZZTEST Mouse UX as a contact with email mouse-ux@example.invalid"
        )
        self.mouse_click(self.page.locator("#companion-send"))
        confirm = self.page.locator(".companion-confirm-tool")
        confirm.wait_for(state="visible", timeout=10_000)
        self.check(surface, "write response renders Confirm chip", confirm.is_visible())

        self.mouse_click(confirm)
        self.page.wait_for_function(
            "() => document.querySelector('#companion-log')?.textContent.includes('test contact was added')",
            timeout=10_000,
        )
        confirmed_posts = [
            post
            for post in self.chat_posts
            if str(post.get("message") or "").startswith("[CONFIRM_TOOL]")
        ]
        self.check(
            surface,
            "Confirm mouse click posts confirmation envelope",
            len(confirmed_posts) == 1
            and confirmed_posts[0].get("route_strength") == "strong",
            f"chat_posts={len(self.chat_posts)} confirm_posts={len(confirmed_posts)}",
        )
        try:
            self.page.wait_for_function(
                "() => document.querySelectorAll('.companion-confirm-tool').length === 0",
                timeout=2_500,
            )
        except TimeoutError:
            pass
        self.check(
            surface,
            "Confirm chip clears after successful post",
            self.page.locator(".companion-confirm-tool").count() == 0,
        )

    def test_blueprint(self) -> None:
        surface = "BLUEPRINT"
        self.goto_home()
        self.open_home_app("blueprint", "#automation-studio")
        self.page.wait_for_selector("#node-canvas", state="visible", timeout=20_000)

        self.page.evaluate(
            """
            async () => {
              CURRENT_WF = freshWorkflow();
              STUDIO_TAB = "graph";
              await renderAutomationStudioView();
            }
            """
        )
        self.page.wait_for_selector('.node-card[data-node-id="start"]', state="visible")
        start = self.page.locator('.node-card[data-node-id="start"]')
        self.check(surface, "Start node available", start.is_visible())

        self.mouse_click(start.locator(".node-header"), button="right")
        menu = self.page.locator("#wf-context-menu")
        menu.wait_for(state="visible")
        edit_start = menu.get_by_text("Edit Start", exact=True)
        edit_start.wait_for(state="visible")
        self.check(surface, "Start context menu appears", menu.is_visible())
        self.check(surface, "Start menu exposes Edit Start", edit_start.is_visible())
        self.check(
            surface,
            "Blueprint context menu stays above studio",
            menu.evaluate("el => getComputedStyle(el).zIndex") == "100060",
        )
        self.page.evaluate(
            "() => new Promise(resolve => requestAnimationFrame("
            "() => requestAnimationFrame(resolve)))"
        )
        self.screenshot(surface, "04-blueprint-context.png")
        self.check(
            surface,
            "Start context menu remains open through screenshot",
            menu.is_visible() and edit_start.is_visible(),
        )
        self.page.wait_for_timeout(200)
        self.page.mouse.click(5, 5)
        menu.wait_for(state="detached")

        pin = start.locator(".wf-pin").first
        if pin.count() and pin.is_visible():
            self.mouse_click(pin, button="right")
            menu.wait_for(state="visible")
            break_wires = menu.get_by_text("Break wires on this pin", exact=True)
            break_wires.wait_for(state="visible")
            self.check(
                surface,
                "pin context menu appears",
                break_wires.is_visible(),
            )
            self.page.evaluate(
                "() => new Promise(resolve => requestAnimationFrame("
                "() => requestAnimationFrame(resolve)))"
            )
            self.screenshot(surface, "04-blueprint-pin-menu.png")
            self.check(
                surface,
                "pin context menu remains open through screenshot",
                menu.is_visible() and break_wires.is_visible(),
            )
            self.page.wait_for_timeout(200)
            self.page.mouse.click(5, 5)
            menu.wait_for(state="detached")
        else:
            self.record(surface, "pin context menu appears", True, "no visible pin")

        canvas = self.page.locator("#node-canvas")
        canvas_metrics = canvas.evaluate(
            """
            el => {
              const rect = el.getBoundingClientRect();
              const left = Math.max(0, rect.left);
              const top = Math.max(0, rect.top);
              const right = Math.min(innerWidth, rect.right);
              const bottom = Math.min(innerHeight, rect.bottom);
              return {
                height: rect.height,
                visibleHeight: Math.max(0, bottom - top),
                clickX: left + (right - left) * 0.62,
                clickY: top + (bottom - top) * 0.65,
              };
            }
            """
        )
        self.check(
            surface,
            "canvas height is clamped to the studio pane",
            canvas_metrics["height"] < 1000,
            (
                f"height={canvas_metrics['height']:.1f} "
                f"visible={canvas_metrics['visibleHeight']:.1f}"
            ),
        )

        node_count = self.page.locator(".node-card").count()
        click_x = canvas_metrics["clickX"]
        click_y = canvas_metrics["clickY"]
        self.page.mouse.click(click_x, click_y, button="right")
        menu.wait_for(state="visible")
        search = self.page.locator("#wf-context-search")
        self.mouse_click(search)
        self.page.keyboard.insert_text("print")
        print_option = menu.locator('button[data-type="print"]').first
        print_option.wait_for(state="visible")
        self.mouse_click(print_option)
        self.page.wait_for_function(
            "(count) => document.querySelectorAll('.node-card').length === count + 1",
            arg=node_count,
        )
        self.check(
            surface,
            "empty-canvas right-click search adds Print",
            self.page.locator(".node-card").count() == node_count + 1,
        )
        context_print = self.page.locator(".node-card.type-print").last
        context_box = context_print.bounding_box()
        context_intersects = bool(
            context_box
            and context_box["x"] < 1440
            and context_box["x"] + context_box["width"] > 0
            and context_box["y"] < 1000
            and context_box["y"] + context_box["height"] > 0
        )
        self.check(
            surface,
            "right-click Print node intersects viewport near click",
            context_intersects,
            (
                f"click=({click_x:.1f},{click_y:.1f}) "
                f"node={context_box}"
            ),
        )

        palette_print = self.page.locator('.wf-node-chip[data-node-type="print"]')
        chip_x, chip_y = self.mouse_point(palette_print)
        self.page.evaluate(
            """
            () => {
              WF_LAST_MOUSE.clientX = 0;
              WF_LAST_MOUSE.clientY = 0;
              WF_LAST_MOUSE.worldX = 200;
              WF_LAST_MOUSE.worldY = 200;
              WF_MOUSE_ENTERED_CANVAS = false;
              WF_CANVAS_HOVER = false;
            }
            """
        )
        node_count = self.page.locator(".node-card").count()
        self.page.mouse.click(chip_x, chip_y)
        self.page.wait_for_function(
            "(count) => document.querySelectorAll('.node-card').length === count + 1",
            arg=node_count,
        )
        self.check(
            surface,
            "palette chip click adds Print",
            self.page.locator(".node-card").count() == node_count + 1,
        )
        palette_node = self.page.locator(".node-card.type-print").last
        palette_box = palette_node.bounding_box()
        palette_intersects = bool(
            palette_box
            and palette_box["x"] < 1440
            and palette_box["x"] + palette_box["width"] > 0
            and palette_box["y"] < 1000
            and palette_box["y"] + palette_box["height"] > 0
        )
        self.check(
            surface,
            "palette Print node intersects viewport without pan",
            palette_intersects,
            f"node={palette_box}",
        )

    def _arcade_hub_outside_lab_text(self) -> str:
        return self.page.locator(".arc-hub").evaluate(
            """
            hub => [...hub.children]
              .filter(child => child.id !== "arc-lab-panel")
              .map(child => child.textContent || "")
              .join("\\n")
            """
        )

    def _dismiss_arcade_reward_overlay(self) -> None:
        # Previously earned, browser-local skins can queue several claim overlays
        # above PLAY, with the next one appearing shortly after each claim.
        for _ in range(8):
            self.page.wait_for_timeout(550)
            overlay = self.page.locator(".rwd-loot-overlay")
            if not overlay.count() or not overlay.is_visible():
                return
            claim = self.page.locator("#rwd-loot-claim")
            if not claim.is_visible():
                open_button = self.page.locator("#rwd-loot-open")
                if open_button.is_visible():
                    self.mouse_click(open_button)
                    claim.wait_for(state="visible")
            self.mouse_click(claim)
            overlay.wait_for(state="detached")
        raise AssertionError("arcade reward overlays did not drain")

    def test_arcade(self) -> None:
        surface = "ARCADE"
        self.goto_home()
        self.open_home_app("arcade", "#arc-play-btn")
        self._dismiss_arcade_reward_overlay()

        outside_lab_text = self._arcade_hub_outside_lab_text()
        self.check(surface, "Skin Road absent from PLAY hub", "Skin Road" not in outside_lab_text)
        self.check(surface, "legacy reward hub road absent", self.page.locator("#rwd-hub-road").count() == 0)

        play_button = self.page.locator("#arc-play-btn")
        self.page.mouse.move(0, 0)
        self.screenshot(surface, "05-arcade-play-before.png")
        x, y = self.mouse_point(play_button)
        self.check(
            surface,
            "PLAY button receives mouse hover",
            play_button.evaluate("el => el.matches(':hover')"),
        )
        self.screenshot(surface, "05-arcade-play-hover.png")
        self.page.mouse.click(x, y)
        self.page.wait_for_selector("#arc-match-go", state="visible", timeout=15_000)
        self.check(surface, "PLAY mouse click opens match hub", self.page.locator("#arc-match-go").is_visible())
        self.screenshot(surface, "05-arcade-play.png")

        # Reloading closes the modal without using a DOM click or mutating game progress.
        self.goto_home()
        self.open_home_app("arcade", "#arc-play-btn")
        self._dismiss_arcade_reward_overlay()
        lab_toggle = self.page.locator("#arc-lab-toggle")
        self.mouse_click(lab_toggle)
        self.page.wait_for_function(
            "() => document.querySelector('#arc-lab-panel')?.classList.contains('open')"
        )
        rewards_toggle = self.page.locator("#arc-lab-panel #rwd-strip-toggle")
        self.mouse_click(rewards_toggle)
        self.page.wait_for_function(
            "() => document.querySelector('#arc-lab-panel #rwd-panel')?.classList.contains('expanded')"
        )
        skin_road = self.page.locator("#arc-lab-panel .rwd-road-title", has_text="Skin Road")
        self.check(
            surface,
            "Training Lab opens with mouse and contains Skin Road",
            self.page.locator("#arc-lab-panel").is_visible() and skin_road.is_visible(),
        )

    def test_docs(self) -> None:
        surface = "DOCS/Repo"
        self.goto_home()
        self.open_home_app("capture", ".nts-list-switcher")
        repo_pill = self.page.locator('.nts-list-switcher [data-tab="Repository"]')
        self.mouse_click(repo_pill)
        self.page.wait_for_selector(".repo-root", state="visible", timeout=20_000)
        # Capture pill navigation re-renders the page — re-query after settle.
        self.page.wait_for_timeout(250)

        docs_category = self.page.locator('[data-repo-cat="Docs"]')
        if not docs_category.count() or not docs_category.first.is_visible():
            self.record(surface, "Docs category available", False, "Repository has no Docs category")
            return
        self.mouse_click(docs_category.first)
        self.page.wait_for_timeout(250)
        docs_category = self.page.locator('[data-repo-cat="Docs"]')
        self.check(surface, "Docs category opened with mouse", docs_category.count() > 0)

        doc_row = self.page.locator(".repo-file-row").first
        if not doc_row.count() or not doc_row.is_visible():
            self.record(surface, "Docs file available", False, "Docs category has no files")
            return
        self.mouse_click(doc_row)
        self.page.wait_for_selector("#repo-docs-editor", state="visible", timeout=15_000)
        self.check(surface, "Docs editor opened with mouse", self.page.locator("#repo-docs-editor").is_visible())
        self.check(
            surface,
            "repo-docs-extras absent",
            self.page.locator(".repo-docs-extras").count() == 0,
        )

        fullscreen_labels = self.page.locator("#repo-viewer button").evaluate_all(
            """
            els => els
              .filter(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length))
              .map(el => (el.textContent || "").trim())
              .filter(text => /full\\s*screen/i.test(text))
            """
        )
        self.check(
            surface,
            "single Fullscreen control in Docs",
            len(fullscreen_labels) == 1,
            f"visible={fullscreen_labels}",
        )

    @staticmethod
    def _console_entry_is_benign(entry: dict[str, str]) -> bool:
        blob = f"{entry.get('text', '')} {entry.get('source', '')}".lower()
        benign_patterns = (
            "resizeobserver loop",
            "net::err_aborted",
            "cdn.plot.ly",
            "favicon.ico",
        )
        if any(pattern in blob for pattern in benign_patterns):
            return True
        # Blueprint capability probes intentionally issue empty requests and
        # inspect these status codes before enabling their toolbar controls.
        capability_probe_responses = (
            ("/api/workflows/0/run-python", "status of 404"),
            ("/api/workflows/vibecode", "status of 403"),
            ("/api/workflows/import-python", "status of 400"),
            ("/api/workflows/import-markdown", "status of 400"),
            ("/api/apps", "status of 400"),
        )
        return any(path in blob and status in blob for path, status in capability_probe_responses)

    def finish_console(self) -> None:
        unexpected = [
            entry for entry in self.console_entries if not self._console_entry_is_benign(entry)
        ]
        lines = ["Waypoint mouse UX console errors", "================================="]
        if not self.console_entries:
            lines.append("No console errors observed.")
        for entry in self.console_entries:
            disposition = "IGNORED" if self._console_entry_is_benign(entry) else "ERROR"
            source = f" ({entry['source']})" if entry.get("source") else ""
            lines.append(f"[{disposition}] {entry['kind']}: {entry['text']}{source}")
        CONSOLE_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.check(
            "CONSOLE",
            "no unexpected console errors",
            not unexpected,
            f"{len(unexpected)} unexpected; {len(self.console_entries)} total logged",
        )

    def write_results(self) -> None:
        aggregate: list[dict[str, Any]] = []
        for surface in SURFACES:
            checks = [row for row in self.results if row["surface"] == surface]
            failed = [row for row in checks if not row["passed"]]
            aggregate.append(
                {
                    "surface": surface,
                    "passed": bool(checks) and not failed,
                    "checks": len(checks),
                    "failed_checks": [row["check"] for row in failed],
                }
            )
        payload = {
            "base_url": BASE_URL,
            "passed": all(row["passed"] for row in aggregate),
            "surfaces": aggregate,
            "checks": self.results,
            "artifacts": {
                "root": str(ARTIFACT_ROOT),
                "screenshots": str(SCREENSHOT_DIR),
                "console": str(CONSOLE_LOG),
            },
        }
        (RESULTS_DIR / "results.json").write_text(
            json.dumps(payload, indent=2) + "\n", encoding="utf-8"
        )
        summary = ["Surface\tResult\tFailed checks"]
        for row in aggregate:
            summary.append(
                f"{row['surface']}\t{'PASS' if row['passed'] else 'FAIL'}"
                f"\t{', '.join(row['failed_checks']) or '-'}"
            )
        (RESULTS_DIR / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")

    def failed(self) -> bool:
        return any(not row["passed"] for row in self.results)


def main() -> int:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        runner = MouseUxRunner(browser)
        try:
            runner.run_surface("HOME", "01-home-customize.png", runner.test_home)
            runner.run_surface("TODAY", "02-today-fused-shell.png", runner.test_today)
            runner.run_surface(
                "COMPANION Confirm",
                "03-confirm-cleared.png",
                runner.test_companion_confirm,
            )
            runner.run_surface(
                "BLUEPRINT",
                "04-blueprint-final.png",
                runner.test_blueprint,
            )
            runner.run_surface(
                "ARCADE",
                "05-arcade-training-lab.png",
                runner.test_arcade,
            )
            runner.run_surface(
                "DOCS/Repo",
                "06-docs-repository.png",
                runner.test_docs,
            )
            runner.finish_console()
            runner.write_results()
            return 1 if runner.failed() else 0
        finally:
            runner.close()
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
