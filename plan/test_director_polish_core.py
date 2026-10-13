"""Verify director polish items 1+2 in core.js (HUD truth breaths + launcher left-off thread)."""
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5099"


def main():
    code = subprocess.run(
        ["node", "--check", "/workspace/plan/static/js/core.js"],
        capture_output=True,
        text=True,
    )
    if code.returncode != 0:
        print("FAIL node --check core.js:", code.stderr)
        return 1
    print("PASS node --check core.js")

    curl = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{BASE}/"], capture_output=True, text=True)
    if curl.stdout.strip() != "200":
        print(f"FAIL curl / returned {curl.stdout.strip()}")
        return 1
    print("PASS curl / 200")

    results = {"launcher_context": False, "context_nav": False, "coins_breath": False}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE, wait_until="networkidle")

        seed = {"planner": {"label": "Week view", "restore": {"tab": "Tasks"}}}
        page.evaluate(
            """async (seed) => {
              localStorage.setItem('appLastContext', JSON.stringify(seed));
              await render();
            }""",
            seed,
        )
        page.wait_for_timeout(500)

        ctx = page.locator('.launcher-card[data-app="planner"] .launcher-card-context')
        if ctx.count() and "Week view" in (ctx.first.text_content() or ""):
            results["launcher_context"] = True
            ctx.first.click()
            page.wait_for_timeout(2500)
            active = page.evaluate("() => (typeof ACTIVE_TAB !== 'undefined' ? ACTIVE_TAB : null)")
            if active == "Tasks":
                results["context_nav"] = True

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(500)

        state = {"summary_calls": 0, "coin_calls": 0}

        def route_summary(route):
            state["summary_calls"] += 1
            pts = 100 if state["summary_calls"] == 1 else 250
            route.fulfill(status=200, content_type="application/json",
                           body=f'{{"points":{pts},"streak":3,"total_attempts":10}}')

        def route_coins(route):
            state["coin_calls"] += 1
            bal = 100 if state["coin_calls"] == 1 else 250
            route.fulfill(status=200, content_type="application/json",
                           body=f'{{"balance":{bal},"points":{bal}}}')

        page.route("**/api/practice/summary", route_summary)
        page.route("**/api/coins", route_coins)

        page.evaluate("""async () => {
          if (typeof installHudTruthBreathWrapper === 'function') installHudTruthBreathWrapper();
          HUD_PREV_VALUES = { coins: null, trophies: null, streak: null, budget: null, model: null };
          if (typeof refreshHudData === 'function') await refreshHudData();
          if (typeof refreshHudData === 'function') await refreshHudData();
          const coinsBtn = document.getElementById('hud-coins-btn');
          const trophiesBtn = document.getElementById('hud-trophies-btn');
          window.__breathTest = {
            coinsHad: coinsBtn && coinsBtn.classList.contains('hud-truth-breath'),
            trophiesHad: trophiesBtn && trophiesBtn.classList.contains('hud-truth-breath'),
          };
        }""")
        breath = page.evaluate("() => window.__breathTest || {}")
        if breath.get("coinsHad") and not breath.get("trophiesHad"):
            results["coins_breath"] = True

        browser.close()

    for name, ok in results.items():
        print(f"{'PASS' if ok else 'FAIL'} playwright {name}")

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
