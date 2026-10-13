"""Default copperplate restored; painted skins are optional rooms."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ART = (
    "sumi",
    "kintsugi",
    "cyanotype",
    "gesso",
    "stained",
    "tatami",
    "letterpress",
    "mosaic",
    "splatter",
    "chalkboard",
    "terrazzo",
    "shoji",
    "beeswax",
    "cork",
    "shibori",
    "solarium",
    "foundry",
)


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class DefaultIsCopperplate(unittest.TestCase):
    def test_tokens_are_the_old_atelier(self):
        root = source("static/css/app.css").split(":root {", 1)[1].split(":root[data-theme", 1)[0]
        self.assertIn("--bg-shell: #0c0a08", root)
        self.assertIn("--ws-accent: #e84a2f", root)
        self.assertNotIn("--bg-shell: #161412", root)
        self.assertNotIn("--ws-accent: #c56a4a", root)

    def test_pass_css_does_not_override_default_tokens(self):
        css = source("static/css/atelier-pass.css")
        self.assertNotIn("--bg-shell: #161412", css)
        self.assertNotIn("--ws-accent: #c56a4a", css)
        self.assertIn(".wp-focus-dock", css)

    def test_stone_is_not_a_skin(self):
        loot = source("static/js/loot.js")
        self.assertNotIn('id: "plinth"', loot)
        self.assertNotIn('id: "graphite"', loot)
        self.assertNotIn('id: "cairn"', loot)

    def test_brand_peak_is_back(self):
        html = source("static/index.html")
        self.assertIn("L84 76 H12 Z", html)
        self.assertIn("#e84a2f", html)

    def test_focus_dock_still_exists(self):
        html = source("static/index.html")
        self.assertIn("id=\"wp-focus-dock\"", html)
        header = html.split("<header", 1)[1].split("</header>", 1)[0]
        self.assertNotIn("id=\"wp-mini-math\"", header)


class PaintedSkins(unittest.TestCase):
    def test_art_skins_use_photographs(self):
        css = source("static/css/skin-pass.css")
        for name in ART:
            self.assertIn(f"/img/skins/{name}.png", css, name)
            self.assertTrue((ROOT / "static/img/skins" / f"{name}.png").is_file(), name)

    def test_named_skins_are_not_the_same_radius(self):
        css = source("static/css/skin-pass.css")
        radii = []
        for skin in ART:
            block = css.split(f'html[data-player-skin="{skin}"] .launcher-card', 1)
            self.assertGreater(len(block), 1, skin)
            chunk = block[1].split("}", 1)[0]
            match = re.search(r"border-radius:\s*([^;]+)", chunk)
            self.assertIsNotNone(match, skin)
            radii.append(match.group(1).strip())
        self.assertEqual(len(set(radii)), len(radii), radii)

    def test_art_skins_have_unique_families(self):
        family = source("static/js/napkin_issues.js").split("const SKIN_FAMILY = {", 1)[1].split("};", 1)[0]
        names = []
        for skin in ART:
            match = re.search(rf"{skin}:\s*\"([^\"]+)\"", family)
            self.assertIsNotNone(match, skin)
            names.append(match.group(1))
        self.assertEqual(len(set(names)), len(names), names)

    def test_pages_are_rooms_without_clipping_copy(self):
        css = source("static/css/skin-pass.css")
        self.assertNotIn("#main { clip-path", css)
        self.assertNotIn("#main{clip-path", css)
        self.assertNotIn(".launcher-card { clip-path", css)
        self.assertNotIn("border-radius: 42%", css)
        self.assertNotIn("border-radius: 48%", css)
        for skin in ART:
            for tab in ("Home", "Today", "Tasks", "Agent", "Hub", "Practice"):
                self.assertIn(f':root[data-world-skin="{skin}"][data-app-tab="{tab}"]', css, f"{skin}/{tab}")

    def test_arty_pages_use_photographs_not_css_shapes(self):
        css = source("static/css/skin-pass.css")
        for name in (
            "splatter_today.png",
            "splatter_agent.png",
            "splatter_tasks.png",
            "sumi_today.png",
            "cyanotype_today.png",
            "stained_agent.png",
            "chalkboard_today.png",
            "terrazzo_today.png",
            "shoji_today.png",
            "beeswax_today.png",
            "solarium_today.png",
            "foundry_today.png",
            "kintsugi_tasks.png",
            "gesso_today.png",
        ):
            self.assertIn(f"/img/skins/{name}", css, name)
            self.assertTrue((ROOT / "static/img/skins" / name).is_file(), name)

    def test_splatter_is_a_world_skin(self):
        loot = source("static/js/loot.js")
        chunk = loot[loot.index('id: "splatter"'): loot.index('id: "splatter"') + 420]
        self.assertIn("world: true", chunk)
        self.assertIn("#2f5fbf", chunk)
        self.assertIn("#f3eee4", chunk)
        self.assertNotIn("#d95c4a", chunk)
        family = source("static/js/napkin_issues.js").split("const SKIN_FAMILY = {", 1)[1].split("};", 1)[0]
        self.assertIn("splatter:", family)

    def test_splatter_css_is_paint_not_blood(self):
        css = source("static/css/skin-pass.css")
        block = css.split("html[data-player-skin=\"splatter\"]", 1)[1].split("html[data-player-skin=\"chalkboard\"]", 1)[0]
        self.assertIn("#2f5fbf", block)
        self.assertIn("#f3eee4", block)
        self.assertNotIn("#d95c4a", block)
        self.assertNotIn("Oxblood", source("static/js/loot.js"))

    def test_clashing_two_accents_were_retired(self):
        loot = source("static/js/loot.js")
        self.assertNotIn('colorA: "#ec4899", colorB: "#0f766e"', loot)
        self.assertNotIn('colorA: "#dc2626", colorB: "#1d4ed8"', loot)
        self.assertNotIn('colorA: "#fdba74", colorB: "#7dd3fc"', loot)

    def test_css_braces_balance(self):
        for name in (
            "static/css/atelier-pass.css",
            "static/css/atelier-home-pass.css",
            "static/css/skin-pass.css",
            "static/css/skin-intent.css",
            "static/css/skin-rooms.css",
            "static/css/skin-fit.css",
        ):
            css = source(name)
            stripped = re.sub(r"url\([^)]*\)", "url()", css)
            stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.S)
            with self.subTest(file=name):
                self.assertEqual(stripped.count("{"), stripped.count("}"), name)


class IntentPass(unittest.TestCase):
    def test_default_copperplate_is_not_overridden(self):
        intent = source("static/css/skin-intent.css")
        self.assertNotIn("html:not([data-player-skin])", intent)
        self.assertNotIn("--bg-shell: #161412", intent)
        root = source("static/css/app.css").split(":root {", 1)[1].split(":root[data-theme", 1)[0]
        self.assertIn("--bg-shell: #0c0a08", root)
        self.assertIn("--ws-accent: #e84a2f", root)

    def test_sun_has_refraction_and_chiaroscuro_not_beach(self):
        intent = source("static/css/skin-intent.css")
        self.assertIn('html[data-skin-family="sun"]', intent)
        self.assertIn("intent-refract", intent)
        self.assertIn("intent-caustic", intent)
        self.assertIn("chiaroscuro", intent.lower())
        self.assertIn("drop-shadow(-1px -1px 0 rgba(255, 248, 220, 0.5))", intent)
        self.assertIn("not a beach", intent)
        self.assertNotIn("ocean", intent)
        loot = source("static/js/loot.js")
        chunk = loot[loot.index('id: "solarium"'): loot.index('id: "solarium"') + 420]
        self.assertIn("world: true", chunk)
        self.assertIn("Clarity, not a beach", chunk)

    def test_metal_is_anisotropic_not_grey_paint(self):
        intent = source("static/css/skin-intent.css")
        self.assertIn("intent-spec", intent)
        self.assertIn("repeating-linear-gradient", intent)
        self.assertIn('html[data-skin-family="chrome"]', intent)
        loot = source("static/js/loot.js")
        self.assertIn('id: "foundry"', loot)
        self.assertIn("Metal, not grey paint", loot)

    def test_rooms_cover_empty_input_dialog_disabled_focus(self):
        intent = source("static/css/skin-intent.css")
        for skin in ART:
            with self.subTest(skin=skin):
                self.assertIn(f':root[data-world-skin="{skin}"] .empty-state', intent)
                self.assertIn(f':root[data-world-skin="{skin}"] input', intent)
                self.assertIn(f':root[data-world-skin="{skin}"] .loot-shell-dialog', intent)
                self.assertIn(f':root[data-world-skin="{skin}"] button:disabled', intent)
                self.assertIn(f':root[data-world-skin="{skin}"] :focus-visible', intent)

    def test_extra_pages_are_rooms(self):
        intent = source("static/css/skin-intent.css")
        for skin in ART:
            for tab in ("Calendar", "Settings", "Paint", "Parallel", "Projects"):
                self.assertIn(
                    f':root[data-world-skin="{skin}"][data-app-tab="{tab}"]',
                    intent,
                    f"{skin}/{tab}",
                )


class HandcraftedRooms(unittest.TestCase):
    """Each leftover catalog skin is a separate CSS room, not a stencil."""

    ROOMS = (
        "aurora", "neon", "merlot", "honeycomb", "quartz", "pearl", "storm", "cobalt",
        "dune", "volt", "copper", "sapphire", "slate", "coral", "mist", "iris",
        "bronze", "silver", "prairie", "canyon", "tropic", "scrap", "ink", "honey",
        "pebble", "emberglass", "comet", "rust", "thunder", "opal", "frostbite", "candyfloss",
        "paprika", "nimbus", "voltage", "cherry", "terracotta", "iceberg", "venom", "harvest",
        "blizzard", "auroraveil", "satellite", "nightmarket", "signalbox", "glasshouse", "isobar",
        "prism", "moon", "midnight", "royal", "phantom", "eclipse", "nova", "relic",
        "zen", "arcade", "kintsugi", "stained", "void", "gold", "noir",
    )
    PHOTOS = (
        "aurora", "neon", "merlot", "honeycomb", "quartz", "pearl", "storm", "cobalt",
        "dune", "volt", "slate", "sapphire", "coral", "iris",
        "bronze", "canyon", "prairie", "ink", "silver",
        "mist", "copper", "honey", "candyfloss",
    )

    def test_room_files_are_wired_and_balanced(self):
        html = source("static/index.html")
        hub = source("static/css/skin-rooms.css")
        self.assertLess(html.find("skin-intent.css"), html.find("skin-rooms.css"))
        self.assertNotIn("html:not([data-player-skin])", hub)
        for name in self.ROOMS:
            path = ROOT / "static" / "css" / "rooms" / f"{name}.css"
            self.assertTrue(path.is_file(), name)
            self.assertIn(f'/css/rooms/{name}.css', hub, name)
            css = path.read_text(encoding="utf-8")
            self.assertIn(f'html[data-player-skin="{name}"]', css, name)
            stripped = re.sub(r"url\([^)]*\)", "url()", css)
            stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.S)
            self.assertEqual(stripped.count("{"), stripped.count("}"), name)
            self.assertNotIn("#main { clip-path", css)
            self.assertNotIn("#main{clip-path", css)
            self.assertNotIn(".launcher-card { clip-path", css)
            self.assertNotIn("border-radius: 42%", css)
            self.assertNotIn("border-radius: 48%", css)
            self.assertNotIn("html:not([data-player-skin])", css)
            self.assertNotIn("#d95c4a", css)

    def test_photographs_are_wired(self):
        for name in self.PHOTOS:
            css = source(f"static/css/rooms/{name}.css")
            self.assertIn(f"/img/skins/{name}.png", css, name)
            self.assertTrue((ROOT / "static/img/skins" / f"{name}.png").is_file(), name)

    def test_default_copperplate_untouched_by_rooms(self):
        hub = source("static/css/skin-rooms.css")
        fit = source("static/css/skin-fit.css")
        self.assertNotIn("--bg-shell: #161412", hub)
        self.assertNotIn("html:not([data-player-skin])", fit)
        self.assertNotIn("--bg-shell: #161412", fit)
        self.assertNotIn("#d95c4a", fit)
        self.assertNotIn("border-radius: 42%", fit)
        self.assertNotIn("border-radius: 48%", fit)
        root = source("static/css/app.css").split(":root {", 1)[1].split(":root[data-theme", 1)[0]
        self.assertIn("--bg-shell: #0c0a08", root)
        self.assertIn("--ws-accent: #e84a2f", root)

    def test_storm_is_prairie_gold_not_violet(self):
        loot = source("static/js/loot.js")
        chunk = loot[loot.index('id: "storm"'): loot.index('id: "storm"') + 280]
        self.assertIn("#e6c35a", chunk)
        self.assertNotIn("#a78bfa", chunk)
        self.assertIn("chase", chunk.lower())

    def test_every_catalog_skin_except_trailblazer_has_a_named_selector(self):
        loot = source("static/js/loot.js")
        block = loot.split("const SKINS = {", 1)[1].split("  const ROAD", 1)[0]
        ids = re.findall(r'^\s+([a-z][a-z0-9]*): \{ id: "\1"', block, re.M)
        css_blob = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / "static" / "css").rglob("*.css")
        )
        missing = [
            skin_id
            for skin_id in ids
            if skin_id != "trailblazer"
            and f'html[data-player-skin="{skin_id}"]' not in css_blob
        ]
        self.assertEqual(missing, [], missing)

    def test_neon_is_one_tube_not_magenta(self):
        loot = source("static/js/loot.js")
        chunk = loot[loot.index('id: "neon"'): loot.index('id: "neon"') + 280]
        self.assertIn("#22d3ee", chunk)
        self.assertIn("#1a1412", chunk)
        self.assertNotIn("#d946ef", chunk)


if __name__ == "__main__":
    unittest.main()
