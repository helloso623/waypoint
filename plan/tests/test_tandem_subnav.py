#!/usr/bin/env python3
"""Mouse-check the compact tandem subnav rails.

Run with Waypoint listening on port 5099:
    python tests/test_tandem_subnav.py
"""

from __future__ import annotations

import os

from playwright.sync_api import Page, expect, sync_playwright


BASE_URL = os.environ.get("WAYPOINT_BASE_URL", "http://127.0.0.1:5099")


def assert_active_tab(page: Page, tab: str, body_selector: str) -> None:
    page.wait_for_function("(expected) => ACTIVE_TAB === expected", arg=tab)
    assert page.evaluate("() => ACTIVE_TAB") == tab
    expect(page.locator(body_selector)).to_be_visible()
    expect(page.locator(".page-intent-label")).to_contain_text(tab)


def main() -> int:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1280, "height": 900},
            reduced_motion="reduce",
        )
        page.set_default_timeout(20_000)
        try:
            page.goto(BASE_URL, wait_until="domcontentloaded")
            page.locator('.launcher-card[data-app="capture"]').click()
            expect(page.locator(".nts-list-switcher")).to_be_visible()
            page.locator('.nts-list-switcher .nts-pill[data-tab="Skills"]').click()
            assert_active_tab(page, "Skills", '.nts-pill--active[data-tab="Skills"]')

            page.evaluate("() => goToTab('Practice')")
            assert_active_tab(page, "Practice", '.play-subnav-pills .nts-pill--active[data-tab="Practice"]')
            expect(page.locator(".play-status-chip")).to_have_count(3)
            page.locator('.play-subnav-pills [data-tab="Parallel"]').click()
            assert_active_tab(page, "Parallel", '.play-subnav-pills .nts-pill--active[data-tab="Parallel"]')

            page.evaluate("() => goToTab('Competitions')")
            assert_active_tab(page, "Competitions", '.app-subnav-pill.nts-pill--active[data-tab="Competitions"]')
            page.locator('.app-subnav-pill[data-tab="Code"]').click()
            assert_active_tab(page, "Code", '.app-subnav-pill.nts-pill--active[data-tab="Code"]')
            expect(page.locator(".cod-mode-toggle.seg-pill")).to_be_visible()

            page.evaluate("() => goToTab('Contacts')")
            assert_active_tab(page, "Contacts", '.app-subnav-pill.nts-pill--active[data-tab="Contacts"]')
            page.locator('.app-subnav-pill[data-tab="Team"]').click()
            assert_active_tab(page, "Team", '.app-subnav-pill.nts-pill--active[data-tab="Team"]')

            # Enter Tasks directly so this pass never opens or exercises Today.
            page.evaluate("() => goToTab('Tasks')")
            assert_active_tab(page, "Tasks", '.app-subnav-pill.nts-pill--active[data-tab="Tasks"]')
            page.locator('.app-subnav-pill[data-tab="Goals"]').click()
            assert_active_tab(page, "Goals", '.app-subnav-pill.nts-pill--active[data-tab="Goals"]')
            page.locator('.app-subnav-pill[data-tab="Calendar"]').click()
            assert_active_tab(page, "Calendar", '.app-subnav-pill.nts-pill--active[data-tab="Calendar"]')
            expect(page.locator(".cal-view-toggle.seg-pill")).to_have_count(1)
            page.locator('.app-subnav-pill[data-tab="Events"]').click()
            assert_active_tab(page, "Events", '.app-subnav-pill.nts-pill--active[data-tab="Events"]')
            page.locator('.app-subnav-pill[data-tab="Trends"]').click()
            assert_active_tab(page, "Trends", '.app-subnav-pill.nts-pill--active[data-tab="Trends"]')
            assert page.locator(".trend-range-preset.seg-pill-btn").count() > 0

            page.evaluate("() => goToTab('Agent')")
            assert_active_tab(page, "Agent", '.app-subnav-pill.nts-pill--active[data-tab="Agent"]')
            page.locator('.app-subnav-pill[data-tab="Hub"]').click()
            assert_active_tab(page, "Hub", '.app-subnav-pill.nts-pill--active[data-tab="Hub"]')
            expect(page.locator(".hub-stack")).to_be_visible()
        finally:
            browser.close()
    print("PASS: tandem subnav mouse navigation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
