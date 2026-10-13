#!/usr/bin/env python3
"""Browser checks for the People / System / intention-chrome tandem pass.

Never opens Today or Projects (excluded from this pass). Run with Waypoint on port 5099:
    python tests/test_opus_tandem_pass.py
"""

from __future__ import annotations

import os

from playwright.sync_api import Page, expect, sync_playwright


BASE_URL = os.environ.get("WAYPOINT_BASE_URL", "http://127.0.0.1:5099")

PEOPLE_TABS = ["Contacts", "Team", "Customers"]
SYSTEM_TABS = ["Settings", "Prompts", "About"]
# Every non-excluded tab must carry the shared intention strip with a real title and primary.
INTENTION_TABS = [
    "Agent", "Hub", "Tasks", "Goals", "Calendar", "Events", "Trends",
    "Skills", "Problems", "Thinking", "Funny", "Essays", "Repository", "Ideas",
    "Competitions", "Code", "Obsidian", "Practice", "Parallel",
] + PEOPLE_TABS + SYSTEM_TABS


def go(page: Page, tab: str) -> None:
    page.evaluate("(tab) => goToTab(tab)", tab)
    settle(page, tab)


def settle(page: Page, tab: str) -> None:
    """ACTIVE_TAB flips before render() swaps the DOM; wait for the swap to land.

    Without this a follow-up click or keypress can resolve against the outgoing page's markup.
    """
    page.wait_for_function("(expected) => ACTIVE_TAB === expected", arg=tab)
    page.wait_for_function(
        """(expected) => {
        const label = document.querySelector(".page-intent-label");
        // Obsidian renders as "Notes", so compare against the display label.
        if (!label || !label.textContent.includes(tabLabel(expected))) return false;
        const rail = document.querySelector(".app-subnav-pills--workspace");
        if (!rail) return true;
        return rail.querySelector(".nts-pill--active")?.dataset.tab === expected;
    }""",
        arg=tab,
    )
    page.wait_for_timeout(120)


def contrast(page: Page, selector: str) -> float:
    """WCAG contrast ratio of an element's own colour against its own background."""
    return page.evaluate(
        """(sel) => {
        const el = document.querySelector(sel);
        if (!el) return -1;
        const cs = getComputedStyle(el);
        const parse = (v) => (v.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = (rgb) => {
          const [r, g, b] = rgb.map(c => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        // Gradient fills report as `background-image`; sample the painted pixel instead.
        let bg = parse(cs.backgroundColor);
        if (cs.backgroundImage && cs.backgroundImage !== "none") {
          const m = cs.backgroundImage.match(/rgba?\\([^)]+\\)/g) || [];
          if (m.length) bg = parse(m[0]);
        }
        const fg = parse(cs.color);
        const a = lum(fg) + 0.05;
        const b = lum(bg) + 0.05;
        return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
    }""",
        selector,
    )


def check_one_group_selector(page: Page) -> None:
    """Exactly one way to switch between a group's sibling pages -- never two, never none."""
    for tab in INTENTION_TABS:
        go(page, tab)
        state = page.evaluate(
            """() => ({
            rails: document.querySelectorAll('#main .app-subnav-pills, #main .nts-list-switcher').length,
            chipBar: getComputedStyle(document.getElementById('nav')).display !== 'none'
                     && document.querySelectorAll('#nav button[data-tab]').length > 1,
        })"""
        )
        assert state["rails"] <= 1, f"{tab}: {state['rails']} in-page rails"
        if state["rails"]:
            assert not state["chipBar"], f"{tab}: in-page rail and a visible tab-chip bar"
        else:
            assert state["chipBar"], f"{tab}: no group selector at all"
    print(f"  exactly one group selector on each of {len(INTENTION_TABS)} tabs")


def check_intention_chrome(page: Page) -> None:
    for tab in INTENTION_TABS:
        go(page, tab)
        expect(page.locator(".page-intent-label")).to_contain_text(
            page.evaluate("(t) => tabLabel(t)", tab)
        )
        title = page.locator(".page-intent-title").inner_text().strip()
        assert title, f"{tab}: intention strip has no title"
        # The chip is uppercased by .pill, so compare on content not casing.
        primary = page.locator(".page-intent-primary").inner_text().strip().lower()
        expected = page.evaluate("(tab) => PAGE_INTENTS[tab].primary", tab)
        assert primary == expected.lower(), f"{tab}: primary chip {primary!r} != PAGE_INTENTS {expected!r}"
        # The primary button promises an action; the page must own a control it can reach.
        target = page.evaluate(
            "(tab) => { const s = PRIMARY_FOCUS_SELECTORS[tab];"
            " return s ? !!document.querySelector(s) : null; }",
            tab,
        )
        assert target is True, f"{tab}: no PRIMARY_FOCUS_SELECTORS target in the DOM ({target})"
    print(f"  intention strip + primary target present on {len(INTENTION_TABS)} tabs")


def check_group_rail(page: Page, tabs: list[str], group: str) -> None:
    for tab in tabs:
        go(page, tab)
        rail = page.locator(".app-subnav-pills--workspace")
        expect(rail).to_have_count(1)
        expect(rail.locator(".app-subnav-pill")).to_have_count(len(tabs))
        expect(rail.locator(f'.app-subnav-pill.nts-pill--active[data-tab="{tab}"]')).to_have_count(1)
        # Single selector for a single decision: the global chip bar must be out of the way.
        assert page.evaluate(
            "() => getComputedStyle(document.getElementById('nav')).display"
        ) == "none", f"{tab}: tab-chip bar still visible alongside the rail"
        radius = page.evaluate(
            "() => getComputedStyle(document.querySelector"
            "('.app-subnav-pills--workspace .app-subnav-pill')).borderRadius"
        )
        assert radius.startswith("999px"), f"{tab}: rail pill radius {radius}"
        ratio = contrast(page, ".app-subnav-pills--workspace .app-subnav-pill.nts-pill--active")
        assert ratio >= 4.5, f"{tab}: active rail pill contrast {ratio}"

    # One click moves between siblings, and arrow keys walk the rail.
    go(page, tabs[0])
    page.locator(f'.app-subnav-pill[data-tab="{tabs[1]}"]').click()
    settle(page, tabs[1])
    page.locator(f'.app-subnav-pill[data-tab="{tabs[1]}"]').press("ArrowLeft")
    settle(page, tabs[0])
    focused = page.evaluate("() => document.activeElement?.dataset?.tab")
    assert focused == tabs[0], f"{group}: arrow-key focus landed on {focused!r}"
    print(f"  {group} rail: {len(tabs)} pills, one-click + arrow-key switching, chip bar hidden")


def check_people_controls(page: Page) -> None:
    go(page, "Contacts")
    track = page.locator(".seg-pill.contacts-cat-chips")
    expect(track).to_have_count(1)
    expect(track.locator(".seg-pill-btn")).to_have_count(5)
    expect(track.locator(".seg-pill-btn.active")).to_have_count(1)
    for sel in [".seg-pill.contacts-cat-chips", ".contacts-cat-chips .seg-pill-btn"]:
        radius = page.evaluate(
            "(s) => getComputedStyle(document.querySelector(s)).borderRadius", sel
        )
        assert radius.startswith("999px"), f"{sel} radius {radius}"
    ratio = contrast(page, ".contacts-cat-chips .seg-pill-btn.active")
    assert ratio >= 4.5, f"active closeness pill contrast {ratio}"

    # Filtering still works after the chips became a segmented track.
    page.locator('.contacts-cat-chips .seg-pill-btn[data-cat="friend"]').click()
    page.wait_for_function("() => CONTACT_CLOSENESS_FILTER === 'friend'")
    expect(page.locator('.contacts-cat-chips .seg-pill-btn.active[data-cat="friend"]')).to_have_count(1)
    page.locator('.contacts-cat-chips .seg-pill-btn[data-cat="all"]').click()
    page.wait_for_function("() => CONTACT_CLOSENESS_FILTER === 'all'")
    print("  Contacts closeness filter is a 5-wide capsule track and still filters")

    for tab, selectors in [
        ("Contacts", [".contact-pin", ".contact-delete"]),
        ("Customers", [".customer-delete"]),
    ]:
        # Already on Contacts at this point, so goToTab() is a no-op -- wait on the markup itself
        # rather than on ACTIVE_TAB, which the filter clicks above have already re-rendered past.
        go(page, tab)
        for sel in selectors:
            expect(page.locator(sel).first).to_be_attached()
            box = page.evaluate(
                "(s) => { const r = document.querySelector(s).getBoundingClientRect();"
                " return [Math.round(r.width), Math.round(r.height),"
                " getComputedStyle(document.querySelector(s)).borderRadius]; }",
                sel,
            )
            w, h, radius = box
            assert radius.startswith("999px"), f"{sel} radius {radius}"
            assert abs(w - h) <= 1, f"{sel} is {w}x{h}, not a circle"
            print(f"  {tab} {sel}: {w}x{h} circle")


def check_system_controls(page: Page) -> None:
    go(page, "Settings")
    modes = page.locator(".settings-inference-modes .seg-pill")
    expect(modes).to_have_count(1)
    expect(modes.locator(".seg-pill-btn")).to_have_count(3)
    expect(modes.locator(".seg-pill-btn.active")).to_have_count(1)
    expect(page.locator("#settings-inference-hint")).not_to_be_empty()
    assert page.locator(".settings-inference-btn:not(.seg-pill-btn)").count() == 0

    prefs = page.locator(".settings-pref-seg")
    expect(prefs).to_have_count(3)
    for key in ["density", "motion", "contrast"]:
        assert page.locator(f'.settings-pref-btn[data-display-pref="{key}"]').count() == 2
        assert page.locator(f'.settings-pref-btn.active[data-display-pref="{key}"]').count() == 1
    assert page.locator("#settings-density-select, #settings-motion-select, #settings-contrast-select").count() == 0

    # One click applies the preference and persists it.
    page.locator('.settings-pref-btn[data-display-pref="density"][data-display-value="compact"]').click()
    page.wait_for_function(
        "() => document.documentElement.classList.contains('settings-density-compact')"
    )
    assert page.evaluate("() => localStorage.getItem('settings_density')") == "compact"
    page.locator('.settings-pref-btn[data-display-pref="density"][data-display-value="comfortable"]').click()
    page.wait_for_function(
        "() => document.documentElement.classList.contains('settings-density-comfortable')"
    )
    ratio = contrast(page, '.settings-pref-btn.active[data-display-pref="density"]')
    assert ratio >= 4.5, f"active display-pref pill contrast {ratio}"
    print("  Settings: inference mode + 3 display prefs are capsule tracks, one click each")


def check_capture_essays(page: Page) -> None:
    go(page, "Essays")
    expect(page.locator(".nts-list-switcher")).to_have_count(1)
    expect(page.locator('.nts-list-switcher .nts-pill--active[data-tab="Essays"]')).to_have_count(1)
    expect(page.locator(".nts-list-switcher .nts-pill")).to_have_count(7)
    assert page.locator("#nts-list-select").count() == 0
    assert page.locator(".nts-capture-connect, .nts-connect-btn").count() == 0
    assert page.evaluate("() => document.querySelectorAll('#nts-scoped-styles').length") == 1
    assert page.locator(".nts-app-identity").count() == 1
    page.locator('.nts-list-switcher .nts-pill[data-tab="Thinking"]').click()
    page.wait_for_function("() => ACTIVE_TAB === 'Thinking'")
    print("  Essays: one 7-wide Capture rail, no dropdown, no Jump-to grid, one scoped sheet")


def main() -> int:
    errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900}, reduced_motion="reduce")
        page.set_default_timeout(20_000)
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.goto(BASE_URL, wait_until="domcontentloaded")
            page.wait_for_function("() => typeof goToTab === 'function'")
            check_capture_essays(page)
            check_group_rail(page, PEOPLE_TABS, "People")
            check_group_rail(page, SYSTEM_TABS, "System")
            check_people_controls(page)
            check_system_controls(page)
            check_intention_chrome(page)
            check_one_group_selector(page)
        finally:
            browser.close()
    noisy = [e for e in errors if "favicon" not in e and "plot.ly" not in e]
    if noisy:
        print("CONSOLE ERRORS:")
        for e in noisy[:20]:
            print("  -", e)
        return 1
    print("PASS: Opus tandem pass (People / System / intention chrome)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
