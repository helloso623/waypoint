#!/usr/bin/env python3
"""Repository tab acceptance tests."""
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5099"


def main():
    for path in (
        "/workspace/plan/static/js/repository.js",
        "/workspace/plan/static/js/core.js",
        "/workspace/plan/static/js/misc.js",
    ):
        code = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if code.returncode != 0:
            print(f"FAIL node --check {path}:", code.stderr)
            return 1
        print(f"PASS node --check {path}")

    curl = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{BASE}/js/repository.js"],
        capture_output=True,
        text=True,
    )
    if curl.stdout.strip() != "200":
        print(f"FAIL curl /js/repository.js returned {curl.stdout.strip()}")
        return 1
    print("PASS curl /js/repository.js 200")

    results = {
        "renders": False,
        "drop_multiple": False,
        "ui_chrome": False,
        "search_highlight": False,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        page.route("**/api/repo/categories", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body='[{"name":"Docs","count":2},{"name":"Notes","count":1}]',
        ))
        page.route("**/api/repo/files*", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body='[{"id":1,"filename":"readme.md","category":"Docs","size_bytes":1200,"summary":"Project readme"}]',
        ))
        page.route("**/api/repo/summary*", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body='{"summary":"Two docs and one note.","categories":[{"name":"Docs","count":2}],"total_files":3,"total_words":500,"generated_at":"2026-07-26T12:00:00Z"}',
        ))
        page.route("**/api/repo/search", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body='[{"file_id":1,"filename":"readme.md","snippet":"local second brain for everything","score":0.92,"category":"Docs"}]',
        ))

        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.evaluate("""async () => {
          if (typeof goToTab === 'function') await goToTab('Repository');
        }""")
        page.wait_for_selector("#repo-drop-zone", timeout=15000)

        if page.locator("#repo-drop-zone").count():
            results["renders"] = True

        multi = page.locator("#repo-file-input").get_attribute("multiple")
        if multi is not None:
            results["drop_multiple"] = True

        if (
            page.locator("#repo-cats .repo-cat-chip").count() >= 1
            and page.locator("#repo-search-input").count() == 1
            and page.locator("#repo-summary-panel").count() == 1
        ):
            results["ui_chrome"] = True

        page.fill("#repo-search-input", "brain")
        page.click("#repo-search-btn")
        page.wait_for_selector("#repo-search-results .repo-search-hit", timeout=10000)
        hit = page.locator("#repo-search-results mark.repo-hit")
        if hit.count() >= 1:
            results["search_highlight"] = True

        browser.close()

    for name, ok in results.items():
        print(f"{'PASS' if ok else 'FAIL'} playwright {name}")

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
