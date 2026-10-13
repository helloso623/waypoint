"""Static contract checks for the local Waypoint loot economy."""
from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOOT = (ROOT / "static/js/loot.js").read_text(encoding="utf-8")
CSS = (ROOT / "static/css/app.css").read_text(encoding="utf-8") + (
    ROOT / "static/css/world-skins.css"
).read_text(encoding="utf-8")
PARALLEL = (ROOT / "parallel_life.py").read_text(encoding="utf-8")
SKINS_BLOCK = re.search(r"const SKINS = \{(.*?)\n  \};", LOOT, re.S).group(1)
SKIN_ROWS = re.findall(r'^\s{4}([a-z0-9_]+): \{([^}\n]+)\},$', SKINS_BLOCK, re.M)
SKIN_IDS = {
    re.search(r'id: "([^"]+)"', body).group(1)
    for _, body in SKIN_ROWS
}


class LootEconomyContractTests(unittest.TestCase):
    def test_coin_road_is_scaled_long_and_migrates_high_water(self):
        thresholds = [int(value) for value in re.findall(r"threshold:\s*(\d+)", LOOT)]
        self.assertGreaterEqual(len(thresholds), 14)
        self.assertEqual(thresholds, sorted(thresholds))
        self.assertGreaterEqual(thresholds[0], 500)
        self.assertGreaterEqual(thresholds[-1], 150_000)
        self.assertIn("COIN_ROAD_SCALE = 20", LOOT)
        self.assertIn("waypointCoinSourceHighWaterV2", LOOT)
        self.assertIn("scaleVersion < COIN_ROAD_SCALE_VERSION", LOOT)

    def test_shop_packs_use_real_reward_grants(self):
        self.assertIn('id: "cache_pair"', LOOT)
        self.assertIn('id: "emberwing_pack"', LOOT)
        self.assertIn('id: "expedition_mix"', LOOT)
        self.assertIn('id: "puzzle_cache_pack"', LOOT)
        self.assertIn('(item.grants || []).forEach(reward => applyReward', LOOT)
        self.assertIn('else if (reward.kind === "chest")', LOOT)
        self.assertIn('else if (reward.kind === "skin")', LOOT)
        self.assertIn('else if (reward.kind === "pieces")', LOOT)
        self.assertIn('else if (reward.kind === "coins")', LOOT)
        self.assertIn('else if (reward.kind === "ticket")', LOOT)

    def test_gem_awards_have_daily_and_weekly_caps(self):
        self.assertIn('GEM_CAP_KEY = "waypointGemCapV1"', LOOT)
        self.assertIn("GEM_DAILY_CAP = 12", LOOT)
        self.assertIn("GEM_WEEKLY_CAP = 40", LOOT)
        self.assertIn("state = { date, week, daily: 0, weekly: 0 }", LOOT)
        self.assertIn("GEM_DAILY_CAP - cap.daily", LOOT)
        self.assertIn("GEM_WEEKLY_CAP - cap.weekly", LOOT)
        self.assertIn("next - before !== allowed", LOOT)
        self.assertIn('showToast("Gem vault full for today"', LOOT)

    def test_pity_pieces_and_assembly_contracts(self):
        self.assertIn("pity: { rare: 0, epic: 0, legendary: 0, world: 0 }", LOOT)
        self.assertIn("pieces: { prism: 0, moon: 0, phantom: 0, royal: 0 }", LOOT)
        self.assertIn("PITY_LIMITS = { rare: 20, epic: 50, legendary: 80, world: 150 }", LOOT)
        self.assertIn("state.pity.rare >= PITY_LIMITS.rare", LOOT)
        self.assertIn("state.pity.epic >= PITY_LIMITS.epic", LOOT)
        self.assertIn("state.pity.legendary >= PITY_LIMITS.legendary", LOOT)
        self.assertIn("state.pity.world >= PITY_LIMITS.world", LOOT)
        self.assertIn("chestRewards(opening.chest, state)", LOOT)
        self.assertIn('MYTHIC_PIECE_IDS = ["phantom", "royal", "prism", "moon"]', LOOT)
        self.assertIn("MYTHIC_PIECES_REQUIRED = 8", LOOT)
        self.assertIn("nextDuplicatePieceReward", LOOT)
        self.assertIn("function assembleSkin(id)", LOOT)
        self.assertIn("data-piece-assemble", LOOT)
        self.assertIn("Puzzle ${pieceCount}/${MYTHIC_PIECES_REQUIRED}", LOOT)
        self.assertGreaterEqual(LOOT.count('reward: { kind: "pieces"'), 4)
        self.assertIn('id: "cache_trio"', LOOT)
        self.assertIn('id: "puzzle_scout"', LOOT)

    def test_daily_route_is_persisted_and_date_scoped(self):
        self.assertIn("waypointDailyMetaV1", LOOT)
        self.assertIn("state.date !== today", LOOT)
        self.assertIn("completedQuestKeys", LOOT)
        self.assertIn("const DAILY_MILESTONES", LOOT)
        self.assertIn('window.addEventListener("waypoint:game-state"', LOOT)
        self.assertIn(".loot-daily-meta-bar", CSS)
        self.assertIn(".loot-daily-hud-meter", CSS)

    def test_motion_and_road_layout_contracts(self):
        self.assertIn("clearShellTimers", LOOT)
        self.assertIn('window.addEventListener("pagehide"', LOOT)
        self.assertIn("prefers-reduced-motion: reduce", CSS)
        self.assertIn(".loot-road-next-strip", CSS)
        self.assertRegex(CSS, r"\.loot-road-track i \{[^}]*transition: height")

    def test_profile_swap_custom_skin_and_tutorial_contracts(self):
        self.assertIn('name.startsWith("loot-skin-")', LOOT)
        self.assertIn("chip.classList.remove(name)", LOOT)
        self.assertIn("chip.classList.add(`loot-skin-${skin.id}`)", LOOT)
        self.assertIn("waypointCustomSkinsV1", LOOT)
        self.assertIn("lootSkinTutorialSeen", LOOT)
        self.assertIn("Try equip Trailblazer", LOOT)
        self.assertIn('[data-player-skin="trailblazer"]', CSS)

    def test_catalog_has_one_hundred_complete_data_driven_skins(self):
        effects = {
            "none", "glow", "ember", "frost", "aurora", "volt", "prism",
            "tide", "void", "bloom", "sand", "signal", "pulse",
            "sparkle", "magma", "chrome",
        }
        self.assertGreaterEqual(len(SKIN_ROWS), 100)
        self.assertEqual(len(SKIN_IDS), len(SKIN_ROWS))
        for key, body in SKIN_ROWS:
            skin_id = re.search(r'id: "([^"]+)"', body).group(1)
            self.assertEqual(key, skin_id)
            for field in ("name", "glyph", "rarity", "note", "colorA", "colorB", "effect"):
                self.assertRegex(body, rf'{field}: "[^"]+"', f"{skin_id} lacks {field}")
            self.assertRegex(body, r'colorA: "#[0-9a-fA-F]{6}"')
            self.assertRegex(body, r'colorB: "#[0-9a-fA-F]{6}"')
            effect = re.search(r'effect: "([^"]+)"', body).group(1)
            self.assertIn(effect, effects)
        self.assertEqual(
            {re.search(r'effect: "([^"]+)"', body).group(1) for _, body in SKIN_ROWS},
            effects,
        )

    def test_custom_skin_capacity_effect_and_delete_contracts(self):
        self.assertIn("CUSTOM_SKIN_LIMIT = 30", LOOT)
        self.assertIn("CUSTOM_SKIN_EFFECTS.includes(raw.effect)", LOOT)
        self.assertIn('select name="effect"', LOOT)
        self.assertIn("function deleteCustomSkin(id)", LOOT)
        self.assertIn("data-custom-skin-delete", LOOT)
        self.assertIn('state.activeSkin = "trailblazer"', LOOT)
        self.assertIn("${custom.length}/${CUSTOM_SKIN_LIMIT}", LOOT)

    def test_skin_effect_application_and_css_contracts(self):
        block = re.search(
            r"function applyUnlockEffects\(\) \{(.*?)\n  \}\n\n  function updateProfileChip",
            LOOT,
            re.S,
        ).group(1)
        self.assertIn("dataset.skinEffect = effect", block)
        self.assertIn("dataset.skinPattern = pattern", block)
        self.assertIn("dataset.skinPlace = place", block)
        self.assertIn('name.startsWith("loot-skin-fx-")', block)
        self.assertIn("document.body.classList.remove(name)", block)
        self.assertIn("document.body.classList.add(`loot-skin-fx-${effect}`)", block)
        self.assertIn('document.getElementById("top-hud")', block)
        self.assertIn('name.startsWith("hud-skin-fx-")', block)
        self.assertIn("topHud.classList.add(`hud-skin-fx-${effect}`)", block)
        self.assertIn('style.setProperty("--skin-a", skin.colorA)', block)
        self.assertIn('style.setProperty("--skin-b", skin.colorB)', block)
        for effect in (
            "glow", "ember", "frost", "aurora", "volt", "prism",
            "tide", "void", "bloom", "sand", "signal", "pulse",
            "sparkle", "magma", "chrome",
        ):
            self.assertTrue(
                f'[data-skin-effect="{effect}"]' in CSS or f".loot-skin-fx-{effect}" in CSS,
                f"missing CSS treatment for {effect}",
            )
        self.assertIn("prefers-reduced-motion: reduce", CSS)
        self.assertIn("loot-skin-volt", CSS)
        self.assertIn("loot-skin-aurora", CSS)
        for effect in ("glow", "volt", "pulse", "frost", "ember"):
            self.assertIn(f"#top-hud.hud-skin-fx-{effect}", CSS)

    def test_locker_filters_dense_grid_and_effect_badges(self):
        for skin_filter in ("all", "common", "rare", "epic", "legendary", "mythic", "world", "custom"):
            self.assertIn(f'["{skin_filter}",', LOOT)
        self.assertIn("data-locker-filter", LOOT)
        self.assertIn("loot-skin-effect-badge", LOOT)
        self.assertIn("data-effect=", LOOT)
        self.assertRegex(
            CSS,
            r"\.loot-skin-grid \{[^}]*repeat\(auto-fill, minmax\(140px, 1fr\)\)",
        )
        self.assertIn(".loot-skin-filters", CSS)

    def test_every_nonstarter_skin_is_in_a_chest_rarity_pool(self):
        pools = re.search(
            r"const CHEST_SKIN_POOLS = \{(.*?)\n  \};",
            LOOT,
            re.S,
        ).group(1)
        pooled_ids = set(re.findall(r'"([a-z0-9_]+)"', pools))
        self.assertEqual(pooled_ids, SKIN_IDS - {"trailblazer"})
        self.assertIn("chestSkinReward(state, CHEST_SKIN_POOLS.common)", LOOT)
        self.assertIn("CHEST_SKIN_POOLS.rare", LOOT)
        self.assertIn("chestSkinReward(state, CHEST_SKIN_POOLS.epic", LOOT)
        self.assertIn("CHEST_SKIN_POOLS.legendary", LOOT)
        self.assertIn("function dayForgeItems(", LOOT)
        self.assertIn("function buyForgeDaily(", LOOT)
        self.assertIn("forgeClaims", LOOT)
        self.assertIn("That pack left with yesterday's caravan", LOOT)
        self.assertIn("standing: true", LOOT)
        self.assertIn('id: "legendary_vault"', LOOT)
        self.assertIn('id: "stray"', LOOT)
        self.assertIn("cost: 40", LOOT)
        self.assertIn("cost: 8, standing: true", LOOT)
        self.assertIn('id: "grove"', LOOT)
        self.assertIn('id: "metro"', LOOT)
        self.assertIn('id: "canyon"', LOOT)
        self.assertGreaterEqual(LOOT.count('badge: "SKIN PACK"'), 5)

    def test_parallel_local_image_provider_is_guaranteed(self):
        self.assertIn('get("parallel_image_provider", "local")', PARALLEL)
        self.assertIn("LOCAL_IMAGE_URL", PARALLEL)
        self.assertIn("/sdapi/v1/txt2img", PARALLEL)
        self.assertIn("def _procedural_image_bytes(", PARALLEL)
        self.assertIn("out_path.write_bytes(_procedural_image_bytes(prompt))", PARALLEL)

    def test_novel_world_skins_rebuild_pages_and_play_sound(self):
        worlds = (
            "cabinet",
            "parchment",
            "harbor",
            "nightmarket",
            "signalbox",
            "glasshouse",
            "velvet",
            "isobar",
        )
        for skin_id in worlds:
            self.assertIn(f'{skin_id}: {{ id: "{skin_id}"', LOOT)
            self.assertIn(f'id: "{skin_id}"', LOOT)
            self.assertIn(f':root[data-world-skin="{skin_id}"][data-app-tab="Home"]', CSS)
            self.assertIn(f':root[data-world-skin="{skin_id}"][data-app-tab="Today"]', CSS)
            self.assertIn(f':root[data-world-skin="{skin_id}"][data-app-tab="Tasks"]', CSS)
            self.assertIn(f':root[data-world-skin="{skin_id}"][data-app-tab="Agent"]', CSS)
            self.assertIn(f':root[data-world-skin="{skin_id}"][data-app-tab="Hub"]', CSS)
            self.assertIn(f':root[data-world-skin="{skin_id}"][data-app-tab="Practice"]', CSS)
        self.assertIn("dataset.worldSkin = skin.id", LOOT)
        self.assertIn("function playCue(name)", LOOT)
        self.assertIn("function playNoise(", LOOT)
        self.assertIn("function playWorldSting(", LOOT)
        self.assertIn("WORLD_SOUNDS", LOOT)
        self.assertIn("waypointLootSoundsMuted", LOOT)
        self.assertIn("if (raw == null) return true", LOOT)
        self.assertIn('window.addEventListener("waypoint:tab"', LOOT)
        self.assertIn("dataset.appTab = ACTIVE_TAB", (ROOT / "static/js/core.js").read_text(encoding="utf-8"))
        self.assertIn("/css/world-skins.css", (ROOT / "static/index.html").read_text(encoding="utf-8"))

    def test_star_drop_tables_are_steep_and_mostly_not_skins(self):
        self.assertIn("CHEST_KIND_TABLES", LOOT)
        self.assertIn("SKIN_RARITY_GIVEN_DROP", LOOT)
        self.assertIn('{ kind: "skin", weight: 2 }', LOOT)
        self.assertIn('{ kind: "coins", weight: 48 }', LOOT)
        self.assertIn("world: 0.1", LOOT)
        self.assertIn("const PINS =", LOOT)
        self.assertIn("const STAMPS =", LOOT)
        self.assertIn("const CHARMS =", LOOT)
        self.assertIn("const TITLES =", LOOT)
        self.assertIn("const BOOSTS =", LOOT)
        self.assertIn("function unlockCollectible(", LOOT)
        self.assertIn("function grantBoost(", LOOT)
        self.assertIn("function redeemTicket(", LOOT)
        self.assertIn("waypointLootCoinBonusV1", LOOT)
        self.assertIn("lootCoinBonus()", LOOT)
        self.assertIn("Duplicate ${item.name}", LOOT)
        self.assertIn("data-ticket-redeem", LOOT)
        self.assertIn("data-collect-equip", LOOT)
        self.assertIn('id: "cabinetkit"', LOOT)
        self.assertLess(
            LOOT.count('{ kind: "skin", weight: 2 }'),
            4,
            "common caches should keep skins in the long tail",
        )


if __name__ == "__main__":
    unittest.main()
