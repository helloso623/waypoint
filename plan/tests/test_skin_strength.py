"""Overlap and diversity contracts for equipped skins.

Copy must sit on a plate — not collide with decorations, siblings,
or a veil painted on top. Skins and pages must be different kits,
not the same layout in a new hue.
"""
from __future__ import annotations

import http.server
import re
import socketserver
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS_ROOT = ROOT / "static" / "css"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "skin_overlap.html"

FLAGSHIP = (
    "sakura",
    "moss",
    "forest",
    "honeycomb",
    "merlot",
    "mist",
    "cobalt",
    "quartz",
    "neon",
    "ink",
    "candyfloss",
    "copper",
    "lotus",
    "zen",
    "honey",
    "solar",
)

BLOSSOM = ("sakura", "lotus", "wisteria", "lilac", "zen", "candyfloss")

COPY_SURFACES = {
    ".launcher-card",
    ".empty-state",
    "#main",
    ".card",
    ".tdy-hour-cell",
    ".cal-day",
    "button.primary",
    ".tsk-row",
    ".hub-glance-item",
    ".toast-item",
}

COPY_SKIP = (
    ".launcher-card-glyph",
    ".launcher-tile-glyph",
    ".launcher-card-name",
    ".launcher-card-intention",
    ".launcher-card-main",
)


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def css_blob() -> str:
    parts = []
    for path in sorted(CSS_ROOT.rglob("*.css")):
        parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts)


def catalog_ids() -> list[str]:
    block = read("static/js/loot.js").split("const SKINS = {", 1)[1].split("  const ROAD", 1)[0]
    return re.findall(r'^\s+([a-z][a-z0-9]*): \{ id: "\1"', block, re.M)


def last_card_radius(css: str, skin: str) -> str:
    matches = re.findall(
        rf'html\[data-player-skin="{skin}"\][^{{]*\.launcher-card[^{{]*\{{([^}}]*)\}}',
        css,
    )
    radii = []
    for chunk in matches:
        found = re.search(r"border-radius:\s*([^;]+)", chunk)
        if found:
            radii.append(found.group(1).strip())
    token = re.findall(
        rf'html\[data-player-skin="{skin}"\][^{{]*\{{([^}}]*--at-r-card:\s*([^;]+))',
        css,
    )
    if token:
        radii.append(token[-1][1].strip())
    return radii[-1] if radii else ""


def last_font(css: str, skin: str) -> str:
    matches = re.findall(
        rf'html\[data-player-skin="{skin}"\][^{{]*\{{([^}}]*--at-font-display:\s*([^;]+))',
        css,
    )
    return matches[-1][1].strip() if matches else ""


def last_accent_ink(css: str, skin: str) -> str:
    matches = re.findall(
        rf'html\[data-player-skin="{skin}"\][^{{]*\{{([^}}]*--accent-ink:\s*([^;]+))',
        css,
    )
    return matches[-1][1].strip() if matches else ""


def last_card_padding(css: str, skin: str) -> str:
    matches = re.findall(
        rf'html\[data-player-skin="{skin}"\][^{{]*\.launcher-card[^{{]*\{{([^}}]*)\}}',
        css,
    )
    pads = []
    for chunk in matches:
        found = re.search(r"padding:\s*([^;]+)", chunk)
        if found:
            pads.append(found.group(1).strip())
    return pads[-1] if pads else ""


def _selector_tokens(sel: str) -> list[str]:
    tokens = []
    for raw in re.split(r"[\s,>+~]", sel):
        raw = raw.strip()
        if not raw:
            continue
        tokens.append(raw.split("[")[0].split(":")[0])
    return tokens


def copy_surface_rules(css: str) -> list[tuple[str, str]]:
    rules = []
    for sel, body in re.findall(r"([^{}]+)\{([^{}]+)\}", css):
        if "::" in sel or any(skip in sel for skip in COPY_SKIP):
            continue
        tokens = _selector_tokens(sel)
        if any(token in COPY_SURFACES for token in tokens):
            rules.append((sel.strip(), body))
    return rules


class SkinOverlapContracts(unittest.TestCase):
    def test_copy_surfaces_are_not_clipped_by_percent_radii(self):
        hits = []
        for sel, body in copy_surface_rules(css_blob()):
            match = re.search(r"border-radius:\s*([^;]+)", body)
            if match and "%" in match.group(1):
                hits.append(f"{sel} → {match.group(1).strip()}")
        self.assertEqual(hits, [], hits)

    def test_overlays_stay_behind_copy(self):
        fit = read("static/css/skin-fit.css")
        self.assertIn("html[data-player-skin]:root body::after", fit)
        closer = fit.split("html[data-player-skin]:root body::after", 1)[1]
        self.assertIn("z-index: 0", closer.split("}", 1)[0])
        main = fit.split("html[data-player-skin]:root #main::after", 1)[1].split("}", 1)[0]
        self.assertIn("z-index: 0", main)
        self.assertIn("position: absolute", main)
        # Last-wins must not put the veil back on top of type.
        self.assertNotIn("z-index: 2", closer[:400])
        self.assertNotIn("z-index: 3", closer[:400])

    def test_sakura_is_not_a_petal_whiteout(self):
        blob = css_blob()
        fit = read("static/css/skin-fit.css")
        self.assertNotIn(
            'html[data-skin-family="blossom"] .launcher-card { border-radius: 50%',
            blob,
        )
        block = fit.split('html[data-player-skin="sakura"] {', 1)[1].split("html[data-player-skin=", 1)[0]
        self.assertIn("--feel-grain-opacity: 0.08", block)
        self.assertIn("--feel-title-style: normal", block)
        self.assertIn("padding: 28px 18px 16px", fit)
        closer = fit.split("Last file wins", 1)[1]
        self.assertIn("content: none", closer.split(".launcher-card::after", 1)[1][:80])
        self.assertIn("animation: none", closer)

    def test_fit_does_not_add_gimmick_motion(self):
        fit = read("static/css/skin-fit.css")
        feels = read("static/css/skin-feels.css")
        self.assertNotIn("perspective(900px)", feels)
        self.assertNotIn("rotateX(12deg)", feels)
        self.assertNotIn("rotate(-1.2deg)", feels)
        closer = fit.split("Last file wins", 1)[1]
        self.assertIn("transform: none", closer)
        self.assertNotIn("rotate(", closer)

    def test_blossom_siblings_are_not_the_same_kit(self):
        css = css_blob()
        prints = []
        for skin in BLOSSOM:
            prints.append(
                (
                    skin,
                    last_card_radius(css, skin),
                    last_font(css, skin),
                    last_accent_ink(css, skin),
                    last_card_padding(css, skin),
                )
            )
        keys = [item[1:] for item in prints]
        self.assertEqual(len(keys), len(set(keys)), prints)

    def test_flagship_skins_are_not_recolors(self):
        css = css_blob()
        prints = {}
        for skin in FLAGSHIP:
            prints[skin] = (
                last_card_radius(css, skin),
                last_font(css, skin),
                last_accent_ink(css, skin),
                last_card_padding(css, skin),
            )
        missing = [skin for skin, value in prints.items() if not any(value)]
        self.assertEqual(missing, [], missing)
        twins = []
        names = list(prints)
        for i, left in enumerate(names):
            for right in names[i + 1 :]:
                same = sum(a == b and a != "" for a, b in zip(prints[left], prints[right]))
                if same >= 3:
                    twins.append((left, right, prints[left], prints[right]))
        self.assertEqual(twins, [], twins)

    def test_catalog_skins_still_have_named_selectors(self):
        blob = css_blob()
        missing = [
            skin
            for skin in catalog_ids()
            if skin != "trailblazer" and f'html[data-player-skin="{skin}"]' not in blob
        ]
        self.assertEqual(missing, [], missing)

    def test_fit_does_not_rewrite_copperplate_default(self):
        fit = read("static/css/skin-fit.css")
        self.assertNotIn("html:not([data-player-skin])", fit)
        self.assertNotIn('data-player-skin="trailblazer"', fit)

    def test_hud_skin_chip_is_a_label_not_a_squashed_jewel(self):
        fit = read("static/css/skin-fit.css")
        block = fit.split("html[data-player-skin] .top-hud .loot-profile-chip {", 1)[1].split("}", 1)[0]
        self.assertIn("width: auto", block)
        self.assertIn("white-space: nowrap", block)
        self.assertIsNone(re.search(r"(?<!-)width:\s*36px", block))

    def test_basic_skins_keep_pre_emoji_glyphs(self):
        issues = read("static/js/napkin_issues.js")
        core = read("static/js/core.js")
        loot = read("static/js/loot.js")
        icons = read("static/css/skin-icons.css")
        self.assertIn("const APP_EMOJI =", issues)
        self.assertIn('agent: "🤖"', issues)
        self.assertIn('hub: "📌"', issues)
        self.assertIn('planner: "📅"', issues)
        self.assertIn('people: "👥"', issues)
        self.assertIn("function usesEmojiIcons(", issues)
        self.assertIn("function isTrailblazer(", issues)
        self.assertIn("return isTrailblazer();", issues)
        self.assertIn("trailblazerEmoji", issues)
        self.assertIn('if (skin.id === "trailblazer")', loot)
        self.assertIn("delete root.dataset.playerSkin", loot)
        self.assertIn("delete root.dataset.skinRarity", loot)
        self.assertIn("window.wpAppMark", core)
        mark = core.split("function launcherAppMark(", 1)[1].split("function ", 1)[0]
        self.assertIn("wpAppMark", mark)
        self.assertNotIn("L84 76", mark)
        self.assertIn("html:not([data-player-skin]) .launcher-card-glyph", icons)
        self.assertIn("font-size: 36px", icons)
        self.assertIn("width: 48px", icons)
        self.assertIn("html[data-player-skin][data-skin-rarity]", icons)
        self.assertIn(".wp-app-emoji", icons)
        self.assertIn("filter: none", icons)
        self.assertIn("#nav.tab-chip-bar .tab-chip::before", icons)
        self.assertIn("content: none", icons)

    def test_default_brand_and_title_match_pre_atelier(self):
        html = read("static/index.html")
        icons = read("static/css/skin-icons.css")
        atelier = read("static/css/atelier.css")
        self.assertIn('<svg class="brand-mark" width="22" height="22"', html)
        brand = html.split('class="brand-mark"', 1)[1].split("</svg>", 1)[0]
        self.assertNotIn("wp-brand-rim", brand)
        self.assertNotIn('id="brand-rim"', brand)
        self.assertNotIn("wp-brand-plate", brand)
        # The mark matches the desktop icon (Waypoint.ico): a node with two routes down to
        # dots. The old filled triangle (wp-brand-peak) must not come back -- skin CSS fills
        # that class solid.
        self.assertNotIn("wp-brand-peak", brand)
        self.assertIn("wp-brand-route", brand)
        self.assertIn("wp-brand-core", brand)
        self.assertIn("wp-brand-jewel", brand)
        self.assertIn('rx="24"', brand)
        lock = icons.split("Copperplate brand + wordmark", 1)[1]
        self.assertIn("html:not([data-player-skin]) .brand-mark", lock)
        self.assertIn("width: 22px", lock)
        self.assertIn("html:not([data-player-skin]) .hud-app-name", lock)
        self.assertIn("font-family: var(--font-display)", lock)
        self.assertIn("font-size: 15px", lock)
        self.assertIn("font-weight: 700", lock)
        self.assertIn("letter-spacing: 0.02em", lock)
        self.assertIn("html:not([data-player-skin]) .top-hud .hud-glyph-btn", lock)
        self.assertIn("width: 34px", lock)
        self.assertIn("html[data-player-skin] .top-hud .hud-glyph-btn", atelier)
        self.assertIn("html[data-player-skin] .hud-app-name", atelier)
        self.assertNotIn("\n.top-hud .hud-glyph-btn {", atelier)

    def test_default_icons_sit_in_compact_wells(self):
        icons = read("static/css/skin-icons.css")
        copper = icons.split("Copperplate default", 1)[1].split("Rare+:", 1)[0]
        self.assertIn("width: 48px", copper)
        self.assertIn("height: 48px", copper)
        self.assertIn("font-size: 36px", copper)
        self.assertNotIn("width: auto", copper)
        self.assertIn("width: 14px", copper)
        self.assertIn("width: 16px", copper)
        self.assertIn("width: 20px", copper)

    def test_default_html_has_no_skin_rarity_stamp(self):
        html = read("static/index.html")
        opening = html.split(">", 1)[0]
        self.assertNotIn("data-skin-rarity", opening)

    def test_workspace_still_has_every_app_and_planner_tab(self):
        core = read("static/js/core.js")
        apps = core.split("const WORKSPACE_APPS = [", 1)[1].split("];", 1)[0]
        for app_id in ("agent", "hub", "planner", "capture", "studio", "blueprint", "arcade", "parallel", "people", "system"):
            self.assertIn(f'id: "{app_id}"', apps)
        planner = apps.split('id: "planner"', 1)[1].split("},", 1)[0]
        for tab in ("Today", "Tasks", "Goals", "Calendar", "Events", "Paint", "Trends"):
            self.assertIn(f'"{tab}"', planner)
        self.assertIn('if (ACTIVE_TAB === "Home")', core)
        self.assertIn("tab-chip-bar--hidden", core)
        fixture = read("tests/fixtures/skin_full_chrome.html")
        self.assertEqual(fixture.count("launcher-card launcher-tile"), 10)
        self.assertEqual(fixture.count('data-tab="'), 7)
        self.assertIn("hud-pomodoro-btn", fixture)
        self.assertIn("open-command-palette", fixture)
        self.assertIn("hud-settings-btn", fixture)

    def test_density_does_not_inflate_planner_chrome(self):
        settings = read("static/js/settings.js")
        today = read("static/js/today.js")
        self.assertIn("button.primary, button.secondary, .pill", settings)
        self.assertNotIn("html.settings-density-comfortable button { min-height: 38px; }", settings)
        self.assertIn("function plannerCanvasHasContent(", today)
        self.assertIn("plannerDayHasTimedEvents()", today)
        self.assertIn("@media (min-width:721px)", today)
        self.assertIn(".pln-canvas .tdy-hour-cell { min-height:22px", today)
        self.assertIn("html:not([data-player-skin]) .pln-canvas .tdy-hour-cell { border-radius:6px; }", today)
        self.assertIn('html[data-player-skin]:not([data-player-skin="harbor"]) .pln-canvas .tdy-hour-cell', today)

    def test_high_rarity_rooms_have_an_idea_and_motion(self):
        ideas = {
            "prism": "dispersion optics",
            "moon": "selenographic chart",
            "midnight": "blue-hour city grid",
            "royal": "geodesic / theodolite",
            "phantom": "penumbra geometry",
            "eclipse": "annular corona",
            "nova": "supernova light curve",
            "relic": "astrolabe rete",
            "zen": "karesansui / enso",
            "arcade": "vector CRT persistence",
            "kintsugi": "gold lives only in the cracks",
            "stained": "gothic rose-window tracery",
            "void": "astrolabe negative space",
            "gold": "gilding leaf on bole",
            "noir": "silver halide chiaroscuro",
        }
        hub = read("static/css/skin-rooms.css")
        spectacle = read("static/css/skin-spectacle.css")
        html = read("static/index.html")
        self.assertLess(html.find("/css/skin-icons.css"), html.find("/css/skin-spectacle.css"))
        self.assertIn("wp-spec-sheen", spectacle)
        self.assertIn("prefers-reduced-motion", spectacle)
        self.assertNotIn("html:not([data-player-skin])", spectacle)
        for skin, idea in ideas.items():
            css = read(f"static/css/rooms/{skin}.css")
            self.assertIn(f'html[data-player-skin="{skin}"]', css)
            self.assertIn(idea.split()[0], css.lower())
            self.assertIn("@keyframes", css)
            self.assertIn("prefers-reduced-motion", css)
            self.assertIn('data-app-tab="Today"', css)
            self.assertIn('data-app-tab="Tasks"', css)
            self.assertIn('data-app-tab="Agent"', css)
            self.assertIn(f'/css/rooms/{skin}.css', hub)
            self.assertNotIn("html:not([data-player-skin])", css)
            self.assertNotIn("border-radius: 999px", css)

    def test_hour_cells_are_not_shared_stadium_pills(self):
        icons = read("static/css/skin-icons.css")
        self.assertIn("html:not([data-player-skin]) :is(", icons)
        self.assertIn(".tdy-hour-cell", icons)
        self.assertIn("border-radius: 6px", icons)
        self.assertIn('html[data-player-skin]:not([data-player-skin="harbor"])', icons)
        self.assertIn("border-radius: var(--at-r-cell, 6px)", icons)
        self.assertGreater(icons.rfind("border-radius: var(--at-r-cell, 6px)"), icons.find("Copperplate default"))

    def test_drawn_marks_are_not_people_and_take_skin_color(self):
        issues = read("static/js/napkin_issues.js")
        depth = read("static/js/napkin_depth.js")
        people = issues.split("people: {", 1)[1].split("system:", 1)[0]
        self.assertIn("h54c6", people)
        self.assertNotIn('r="18"', people)
        self.assertNotIn("two figures, one forward", depth)
        self.assertIn("do not stamp people figures", depth)
        self.assertIn("mixHex(spec.a, skin.a, 0.88)", issues)
        self.assertIn("rarity === \"mythic\"", issues)

    def test_icon_sheet_is_last_and_fits_buttons(self):
        html = read("static/index.html")
        fixture = read("tests/fixtures/skin_overlap.html")
        icons = read("static/css/skin-icons.css")
        self.assertLess(html.find("/css/skin-fit.css"), html.find("/css/skin-icons.css"))
        self.assertLess(fixture.find("/css/skin-fit.css"), fixture.find("/css/skin-icons.css"))
        self.assertIn("width: 13px", icons)
        self.assertIn("width: 16px", icons)
        self.assertIn("width: 32px", icons)
        self.assertIn("width: 48px", icons)
        self.assertIn("wp-icon-breathe", icons)
        self.assertIn("prefers-reduced-motion: reduce", icons)
        self.assertNotRegex(icons, r"filter:\s*[^;]*hue-rotate")

    def test_mythic_and_epic_kits_are_not_recolors(self):
        css = css_blob()
        deep = (
            "prism", "moon", "midnight", "royal", "phantom",
            "frost", "glacier", "gold", "magma", "polar",
            "arcade", "thunder", "iris", "abyssal", "onyx",
        )
        prints = {}
        for skin in deep:
            prints[skin] = (
                last_card_radius(css, skin),
                last_font(css, skin),
                last_accent_ink(css, skin),
                last_card_padding(css, skin),
            )
        missing = [skin for skin, value in prints.items() if not any(value)]
        self.assertEqual(missing, [], missing)
        twins = []
        names = list(prints)
        for i, left in enumerate(names):
            for right in names[i + 1 :]:
                same = sum(a == b and a != "" for a, b in zip(prints[left], prints[right]))
                if same >= 3:
                    twins.append((left, right, prints[left], prints[right]))
        self.assertEqual(twins, [], twins)

    def test_accent_ink_pairs_are_not_mud(self):
        css = css_blob()
        skins = FLAGSHIP + (
            "prism", "moon", "midnight", "royal", "phantom",
            "frost", "gold", "magma", "arcade",
        )
        muddy = []
        for skin in skins:
            ink = last_accent_ink(css, skin)
            accs = re.findall(
                rf'html\[data-player-skin="{skin}"\][^{{]*\{{([^}}]*--accent:\s*([^;]+))',
                css,
            )
            accent = accs[-1][1].strip() if accs else ""
            if not ink or not accent or not ink.startswith("#") or not accent.startswith("#"):
                continue
            def lum(hex_color: str) -> float:
                h = hex_color.lstrip("#")
                if len(h) == 3:
                    h = "".join(ch * 2 for ch in h)
                r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
                return 0.2126 * r + 0.7152 * g + 0.0722 * b
            if abs(lum(accent) - lum(ink)) < 0.28:
                muddy.append((skin, accent, ink))
        self.assertEqual(muddy, [], muddy)


class SkinLayoutPlaywright(unittest.TestCase):
    """Render flagship skins and fail if copy collides or kits match."""

    @classmethod
    def setUpClass(cls):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:  # pragma: no cover
            raise unittest.SkipTest("playwright is required for overlap tests") from exc

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(ROOT / "static"), **kwargs)

            def log_message(self, fmt, *args):
                return

            def translate_path(self, path):
                if path.startswith("/fixture"):
                    return str(FIXTURE)
                return super().translate_path(path)

        cls._httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
        cls._thread = threading.Thread(target=cls._httpd.serve_forever, daemon=True)
        cls._thread.start()
        port = cls._httpd.server_address[1]
        cls.base = f"http://127.0.0.1:{port}/fixture"
        cls._pw = sync_playwright().start()
        cls.browser = cls._pw.chromium.launch(
            headless=True,
            args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls._pw.stop()
        cls._httpd.shutdown()
        cls._httpd.server_close()

    def _measure(self, skin: str, family: str = "", effect: str = "") -> dict:
        page = self.browser.new_page(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
        page.goto(self.base, wait_until="networkidle")
        page.evaluate(
            """([skin, family, effect]) => {
              const html = document.documentElement;
              html.setAttribute("data-player-skin", skin);
              html.setAttribute("data-app-tab", "Home");
              if (family) html.setAttribute("data-skin-family", family);
              if (effect) html.setAttribute("data-skin-effect", effect);
            }""",
            [skin, family, effect],
        )
        page.wait_for_timeout(80)
        data = page.evaluate(
            """() => {
              const collide = (a, b) => !(
                a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom
              );
              const box = el => {
                const r = el.getBoundingClientRect();
                return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
              };
              const zOf = (el, which) => {
                const raw = getComputedStyle(el, which).zIndex;
                const n = parseInt(raw, 10);
                return Number.isFinite(n) ? n : 0;
              };
              const alpha = color => {
                const m = String(color || "").match(/[\\d.]+/g);
                if (!m) return 1;
                return m.length >= 4 ? parseFloat(m[3]) : 1;
              };
              const html = document.documentElement;
              const labels = [
                ".hud-app-name", ".hud-intention", ".launcher-card-name",
                ".launcher-card-intention", ".card h3", ".card p",
                ".empty-state-title", ".empty-state-body", "button.primary"
              ];
              const nodes = labels.map(sel => document.querySelector(sel)).filter(Boolean);
              const rects = nodes.map(el => ({ sel: el.className || el.tagName, ...box(el), text: (el.textContent || "").trim() }));
              const hits = [];
              for (let i = 0; i < rects.length; i++) {
                for (let j = i + 1; j < rects.length; j++) {
                  if (rects[i].width < 2 || rects[j].width < 2) continue;
                  if (collide(rects[i], rects[j])) hits.push([rects[i].text, rects[j].text]);
                }
              }
              const card = document.querySelector(".launcher-card");
              const name = document.querySelector(".launcher-card-name");
              const glyph = document.querySelector(".launcher-card-glyph");
              let clipped = false;
              let glyphHit = false;
              let hairlineHit = false;
              if (card && name) {
                const cr = card.getBoundingClientRect();
                const nr = name.getBoundingClientRect();
                const inset = 6;
                clipped = nr.left < cr.left + inset || nr.right > cr.right - inset || nr.top < cr.top + inset;
                if (glyph) {
                  const gr = glyph.getBoundingClientRect();
                  glyphHit = collide(nr, gr);
                }
                const before = getComputedStyle(card, "::before");
                const bw = parseFloat(before.width) || 0;
                const bh = parseFloat(before.height) || 0;
                const display = before.display;
                const content = before.content;
                if (display !== "none" && content !== "none" && content !== "normal" && bw > 1 && bh > 1) {
                  const top = before.top === "auto" ? cr.top : cr.top + (parseFloat(before.top) || 0);
                  const left = before.left === "auto" ? cr.left : cr.left + (parseFloat(before.left) || 0);
                  const br = { left, top, right: left + bw, bottom: top + bh };
                  hairlineHit = collide(nr, br);
                }
              }
              const bodyZ = zOf(document.body, "::after");
              const mainEl = document.querySelector("#main");
              const mainZ = mainEl ? zOf(mainEl, "::after") : 0;
              const cardCs = card ? getComputedStyle(card) : null;
              const btn = getComputedStyle(document.querySelector("button.primary"));
              const title = name ? getComputedStyle(name) : null;
              const overlayOnTop = bodyZ > 0 || mainZ > 0;
              const cardClear = cardCs
                ? (alpha(cardCs.backgroundColor) >= 0.88 || (cardCs.backgroundImage && cardCs.backgroundImage !== "none"))
                : true;
              const chip = document.querySelector(".loot-profile-chip");
              const chipName = document.querySelector(".loot-profile-name") || chip;
              let chipOverlap = false;
              let chipWrapped = false;
              if (chip && chipName) {
                const range = document.createRange();
                range.selectNodeContents(chipName);
                const lines = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
                chipWrapped = lines.length > 1;
                if (chipWrapped) {
                  for (let i = 0; i < lines.length; i++) {
                    for (let j = i + 1; j < lines.length; j++) {
                      if (collide(lines[i], lines[j])) chipOverlap = true;
                    }
                  }
                }
                const glyphEl = chip.querySelector(".loot-profile-glyph");
                if (glyphEl) {
                  const gr = glyphEl.getBoundingClientRect();
                  const nr = chipName.getBoundingClientRect();
                  if (nr.width > 2 && collide(gr, nr)) chipOverlap = true;
                }
              }

              html.setAttribute("data-app-tab", "Today");
              const cell = document.querySelector(".tdy-hour-cell");
              const cellCs = cell ? getComputedStyle(cell) : null;
              html.setAttribute("data-app-tab", "Tasks");
              const row = document.querySelector(".tsk-row");
              const rowCs = row ? getComputedStyle(row) : null;
              html.setAttribute("data-app-tab", "Home");

              return {
                hits,
                clipped,
                glyphHit,
                hairlineHit,
                overlayOnTop,
                cardClear,
                chipOverlap,
                chipWrapped,
                print: [
                  cardCs && cardCs.borderRadius,
                  title && title.fontFamily,
                  title && title.letterSpacing,
                  title && title.fontSize,
                  title && title.textTransform,
                  btn && btn.backgroundColor,
                  btn && btn.color,
                  btn && btn.borderRadius,
                  cardCs && cardCs.paddingTop,
                ].join("|"),
                pages: [
                  cardCs && cardCs.borderRadius,
                  cellCs && cellCs.borderRadius,
                  rowCs && rowCs.borderRadius,
                  cardCs && cardCs.paddingTop,
                  cellCs && cellCs.paddingTop,
                  rowCs && rowCs.paddingTop,
                ].join("|"),
              };
            }"""
        )
        page.close()
        return data

    def test_flagship_copy_does_not_overlap(self):
        families = {
            "sakura": ("blossom", "bloom"),
            "lotus": ("blossom", "bloom"),
            "zen": ("blossom", "bloom"),
            "candyfloss": ("blossom", "sparkle"),
            "moss": ("leaf", "bloom"),
            "forest": ("leaf", "bloom"),
            "honeycomb": ("cells", "sand"),
            "merlot": ("cellar", "glow"),
            "mist": ("frost", "frost"),
            "cobalt": ("signal", "signal"),
            "quartz": ("prism", "prism"),
            "neon": ("signal", "signal"),
            "ink": ("signal", "signal"),
            "copper": ("compass", "glow"),
            "honey": ("sun", "sand"),
            "solar": ("sun", "glow"),
        }
        prints = {}
        pages = {}
        for skin in FLAGSHIP:
            family, effect = families.get(skin, ("", ""))
            measured = self._measure(skin, family, effect)
            self.assertEqual(measured["hits"], [], f"{skin} overlapping copy: {measured['hits']}")
            self.assertFalse(measured["clipped"], f"{skin} title clipped by the card")
            self.assertFalse(measured["glyphHit"], f"{skin} title overlaps the glyph")
            self.assertFalse(measured["hairlineHit"], f"{skin} title overlaps the card mark")
            self.assertFalse(measured["overlayOnTop"], f"{skin} overlay sits on top of copy")
            self.assertTrue(measured["cardClear"], f"{skin} card plate is too transparent")
            self.assertFalse(measured["chipOverlap"], f"{skin} skin-chip text overlaps itself")
            self.assertFalse(measured["chipWrapped"], f"{skin} skin-chip label wraps over itself")
            self.assertNotIn("999px", measured["pages"], f"{skin} hour/task cells are stadium pills")
            prints[skin] = measured["print"]
            pages[skin] = measured["pages"]
        twins = [
            (left, right)
            for i, left in enumerate(FLAGSHIP)
            for right in FLAGSHIP[i + 1 :]
            if prints[left] == prints[right]
        ]
        self.assertEqual(twins, [], twins)
        page_twins = [
            (left, right)
            for i, left in enumerate(FLAGSHIP)
            for right in FLAGSHIP[i + 1 :]
            if pages[left] == pages[right] and prints[left] == prints[right]
        ]
        self.assertEqual(page_twins, [], page_twins)


if __name__ == "__main__":
    unittest.main()
