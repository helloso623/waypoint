"""Static contracts for Waypoint's phone/computer adaptation layer."""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_device_layer_is_live_and_exposed():
    device = source("static/js/device.js")
    assert 'window.matchMedia("(max-width: 720px)")' in device
    assert 'window.matchMedia("(max-width: 600px)")' in device
    assert 'window.matchMedia("(pointer: coarse)")' in device
    assert 'window.matchMedia("(hover: none)")' in device
    assert "window.WaypointDevice = device" in device
    assert 'root.setAttribute("data-device", device.mode)' in device
    assert "device-desktop" in device
    assert "device-tablet" in device
    assert "waypoint:devicechange" in device
    assert "orientationchange" in device
    assert '"change", refresh' in device
    assert '"resize", scheduleRefresh' in device


def test_viewport_and_device_script_order():
    index = source("static/index.html")
    assert 'name="viewport"' in index
    assert "viewport-fit=cover" in index
    assert index.index('/js/device.js') < index.index('/js/core.js')
    login = source("app.py")
    assert 'width=device-width, initial-scale=1, viewport-fit=cover' in login


def test_today_paint_uses_pointer_events():
    today = source("static/js/today.js")
    assert 'addEventListener("pointerdown", onPointerDown)' in today
    assert 'addEventListener("pointermove", onPointerMove)' in today
    assert 'addEventListener("pointerup", tdyCanvasPointerUp)' in today
    assert "setPointerCapture" in today
    assert "handle.onpointerdown" in today


def test_phone_spa_history_and_paint_cancel_guards():
    core = source("static/js/core.js")
    assert "function installSpaHistoryGuard()" in core
    assert 'waypointGuard: "root"' in core
    assert 'waypointGuard: "app"' in core
    assert 'window.addEventListener("popstate"' in core
    assert "void navBack()" in core
    assert "pushSpaHistoryTab" not in core
    today = source("static/js/today.js")
    assert 'e.type === "pointercancel"' in today
    assert "document.addEventListener(\"pointercancel\", tdyCanvasPointerUp)" in today
    assert "setTimeout(releaseLostPointer, 8000)" in today
    assert "resetPaintState();" in today


def test_app_css_has_phone_and_desktop_contracts():
    css = source("static/css/app.css")
    assert "html.device-phone" in css
    assert "html.device-coarse" in css
    assert "html.device-desktop" in css
    assert "html.device-tablet" in css
    assert "env(safe-area-inset-top)" in css
    assert "env(safe-area-inset-bottom)" in css
    assert "min-height: 100dvh" in css
    assert "overscroll-behavior-y: none" in css
    today = source("static/js/today.js")
    assert "html.device-desktop .pln-canvas .tdy-hour-cell" in today
    assert "html.device-phone .pln-canvas .tdy-hour-cell" in today


def test_phone_atelier_covers_hud_pages_companion_and_loot():
    css = source("static/css/app.css")
    assert "html.device-phone .hud-title-block" in css
    assert "html.device-phone .companion-panel" in css
    assert "html.device-phone .loot-shell-dialog" in css
    assert "html.device-phone .agent-workspace" in css
    assert "html.device-phone .launcher-grid" in css
    assert "html.device-phone .card-grid" in css
    assert "html.device-phone .page-title" in css
    assert "padding-bottom: calc(92px + env(safe-area-inset-bottom))" in css
    assert "html.device-phone .loot-profile-copy small { display: none; }" in css
    assert "html.device-phone #hud-close-day-chip" in css
    assert "html.device-phone #hud-model-chip" in css
    assert "html.device-phone #quick-capture-fab" in css
    assert "html.device-phone .hub-add-form" in css
    assert "html.device-phone .ideas-add-row" in css
    assert "html.device-phone .play-workspace-strip" in css
    assert "html.device-phone .fast-travel-switcher { display: none !important; }" in css
    assert "html.device-phone .launch-overlay--active" in css
    core = source("static/js/core.js")
    assert "const planChrome = [\"Today\", \"Tasks\", \"Goals\", \"Calendar\", \"Events\", \"Trends\"].includes(ACTIVE_TAB);" in core
    assert "function launchAnimEnabled()" in core
    assert "body[data-workspace=\"plan\"] .hud-intention { display: none; }" in css
    today = source("static/js/today.js")
    assert "flex-direction:row" in today
    assert ".pln-today-header { display:flex" in today
    assert "html.device-phone #nav-back:disabled" in css
    assert "html.device-phone .rpl-action-bar" in css
    assert "right: auto !important;" in css
    assert "html.device-phone .pln-canvas" in css
    assert "body.loot-shell-open .companion-launcher" in css
    loot = source("static/js/loot.js")
    assert 'document.body.classList.add("loot-shell-open")' in loot
    assert "renderShell();" in loot
    assert "html.device-phone .app-subnav-pills {\n  mask-image: none;" in css
    assert "html.device-phone .rit-overlay" in css
    assert "html.device-phone .pln-shell:has(#rit-overlay)" in css
    assert "html.device-phone .launcher-stage" in css
    assert "html.device-phone .pln-mini-month { display: none; }" in css
    assert "html.device-phone body[data-workspace=\"play\"] #quick-capture-fab" in css
    assert "html.device-phone .hub-chips { padding-bottom: 56px; }" in css
    assert "html.device-phone .rpl-scene-filmstrip-empty { display: none; }" in css
    # Desktop density must stay an explicit opposite of the phone plate.
    assert "html.device-desktop .hud-glyph-btn" in css


def test_practice_chest_mentions_are_unchanged_from_head():
    practice = source("static/js/practice.js").lower()
    result = subprocess.run(
        ["git", "show", "HEAD:plan/static/js/practice.js"],
        cwd=ROOT.parent,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert practice.count("chest") == result.stdout.lower().count("chest")
