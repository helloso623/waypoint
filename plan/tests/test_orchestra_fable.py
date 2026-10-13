"""Design contracts for Fable (leftover orchestra round 2).

Every skin is a room, not a recolor: family rooms and named-skin rooms in
skin-feels.css, a quieter default atelier, and nine world rooms that each
frame the app as a different physical object.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "static" / "css"


def source(name: str) -> str:
    return (CSS / name).read_text(encoding="utf-8")


def block_for(css: str, selector_prefix: str) -> str:
    """Return the first declaration block whose selector starts with prefix."""
    idx = css.find(selector_prefix)
    if idx < 0:
        return ""
    open_brace = css.find("{", idx)
    close_brace = css.find("}", open_brace)
    return css[open_brace + 1 : close_brace]


FAMILIES = [
    "leaf", "blossom", "void", "wave", "flame", "frost", "prism",
    "signal", "bolt", "dune", "chrome", "cabinet", "paper",
]
NAMED = ["sakura", "moss", "void", "solar", "retro", "velvet", "parchment"]
WORLDS = [
    "cabinet", "parchment", "harbor", "nightmarket", "signalbox",
    "glasshouse", "velvet", "isobar", "retro",
]


class SkinFeelsFamilyRooms(unittest.TestCase):
    def setUp(self):
        self.css = source("skin-feels.css")

    def test_every_required_family_has_a_room(self):
        for family in FAMILIES:
            with self.subTest(family=family):
                self.assertIn(f'html[data-skin-family="{family}"]', self.css)

    def test_family_rooms_change_more_than_hue(self):
        """Each family sets radius, grain, hairline and icon filter — the
        properties that make moss ≠ sakura ≠ forest even under one effect."""
        for family in FAMILIES:
            block = block_for(self.css, f'html[data-skin-family="{family}"] {{')
            with self.subTest(family=family):
                self.assertIn("--at-r-", block, f"{family}: no radius scale")
                self.assertIn("--feel-grain", block, f"{family}: no grain overlay")
                self.assertIn("--feel-hud-hair", block, f"{family}: no HUD hairline")
                self.assertIn("--feel-icon", block, f"{family}: no icon filter")
                self.assertIn("--at-plate", block, f"{family}: no card plate")

    def test_families_that_share_bloom_are_distinct(self):
        leaf = block_for(self.css, 'html[data-skin-family="leaf"] {')
        blossom = block_for(self.css, 'html[data-skin-family="blossom"] {')
        self.assertNotEqual(leaf.strip(), blossom.strip())
        for token in ("--at-r-ctl", "--feel-hud-hair", "--feel-grain:"):
            leaf_val = re.search(rf"{token}[^;]*;", leaf)
            blossom_val = re.search(rf"{token}[^;]*;", blossom)
            self.assertIsNotNone(leaf_val, token)
            self.assertIsNotNone(blossom_val, token)
            self.assertNotEqual(leaf_val.group(0), blossom_val.group(0), token)

    def test_family_grain_and_hairline_hooks_are_wired(self):
        self.assertIn("html[data-player-skin] #main::after", self.css)
        self.assertIn("var(--feel-grain, none)", self.css)
        self.assertIn("var(--feel-hud-hair", self.css)
        self.assertIn("var(--feel-icon, none)", self.css)

    def test_named_skin_rooms_exist(self):
        for skin in NAMED:
            with self.subTest(skin=skin):
                self.assertIn(f'html[data-player-skin="{skin}"]', self.css)

    def test_at_least_eight_named_skin_rooms(self):
        named = set(re.findall(r'html\[data-player-skin="([a-z]+)"\]', self.css))
        self.assertGreaterEqual(len(named), 8, sorted(named))

    def test_sakura_and_moss_do_not_share_a_shell(self):
        sakura = block_for(self.css, 'html[data-player-skin="sakura"] {')
        moss = block_for(self.css, 'html[data-player-skin="moss"] {')
        shell = lambda b: re.search(r"--bg-shell:\s*([^;]+);", b).group(1).strip()
        self.assertNotEqual(shell(sakura), shell(moss))

    def test_only_one_retro_id(self):
        loot = (ROOT / "static" / "js" / "loot.js").read_text(encoding="utf-8")
        self.assertEqual(len(re.findall(r'\bid:\s*"retro"', loot)), 1)
        self.assertNotIn('id: "retro2"', loot)
        self.assertNotIn('id: "retro-', loot)

    def test_reduced_motion_covers_new_overlays(self):
        idx = self.css.rfind("@media (prefers-reduced-motion: reduce)")
        self.assertGreater(idx, 0)
        self.assertIn("#main::after", self.css[idx:])


class QuietDefaultAtelier(unittest.TestCase):
    def setUp(self):
        self.css = source("atelier.css")

    def test_quiet_default_section_exists(self):
        self.assertIn("Quiet default", self.css)
        self.assertIn("html:not([data-world-skin])", self.css)

    def test_quiet_default_kills_glow_and_rainbow(self):
        idx = self.css.find("Quiet default")
        block = self.css[idx:]
        self.assertIn("--glow-accent: transparent", block)
        self.assertIn("--glow-violet: transparent", block)
        self.assertIn(".brand-mark { filter: none; }", block)
        self.assertIn("feTurbulence", block, "paper grain missing from default")

    def test_quiet_default_desaturates_tokens(self):
        block = block_for(self.css, "html:not([data-world-skin]) {")
        self.assertIn("--at-vermilion:", block)
        self.assertIn("--at-gold:", block)
        self.assertNotIn("#e84a2f", block)
        self.assertNotIn("#c9a227", block)

    def test_starter_kit_is_paper_and_brass(self):
        self.assertIn('html:not([data-world-skin])[data-player-skin="trailblazer"]', self.css)


class WorldRooms(unittest.TestCase):
    def setUp(self):
        self.css = source("world-skins.css")

    def test_all_nine_rooms_present_including_retro(self):
        for world in WORLDS:
            with self.subTest(world=world):
                self.assertIn(f'data-world-skin="{world}"', self.css)

    def test_each_room_frames_the_viewport_as_an_object(self):
        for world in WORLDS:
            with self.subTest(world=world):
                self.assertIn(f':root[data-world-skin="{world}"] #main::before', self.css)

    def test_each_room_restyles_inputs_buttons_and_bubbles(self):
        for world in WORLDS:
            with self.subTest(world=world):
                self.assertIn(f':root[data-world-skin="{world}"] button.primary', self.css)
                self.assertIn(f':root[data-world-skin="{world}"] .agent-bubble', self.css)
                self.assertIn(f':root[data-world-skin="{world}"] .launcher-tile-glyph', self.css)
                self.assertRegex(
                    self.css,
                    rf':root\[data-world-skin="{world}"\] input:not\(\[type="checkbox"\]\)',
                )

    def test_rooms_do_not_share_a_primary_button(self):
        buttons = {}
        for world in WORLDS:
            marker = f':root[data-world-skin="{world}"] button.primary {{'
            block = block_for(self.css, marker)
            self.assertTrue(block, f"{world}: no primary button block")
            buttons[world] = re.sub(r"\s+", " ", block).strip()
        self.assertEqual(len(set(buttons.values())), len(WORLDS), "two rooms share a button")

    def test_retro_is_deepened_not_duplicated(self):
        self.assertIn('data-world-skin="retro"', self.css)
        self.assertNotIn('data-world-skin="retro2"', self.css)
        self.assertNotIn('data-world-skin="crt"', self.css)
        self.assertIn('[data-world-skin="retro"] .tsk-row-title::before', self.css)
        self.assertIn("counter(crt-line", self.css)


class LoadOrder(unittest.TestCase):
    def test_skin_feels_wins_over_atelier(self):
        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        self.assertLess(html.find("world-skins.css"), html.find("atelier.css"))
        self.assertLess(html.find("atelier.css"), html.find("skin-feels.css"))


class BraceBalance(unittest.TestCase):
    def test_css_files_have_balanced_braces(self):
        for name in ("atelier.css", "skin-feels.css", "world-skins.css", "napkin_issues.css"):
            css = source(name)
            stripped = re.sub(r"url\([^)]*\)", "url()", css)
            stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.S)
            with self.subTest(file=name):
                self.assertEqual(stripped.count("{"), stripped.count("}"), name)


if __name__ == "__main__":
    unittest.main()
