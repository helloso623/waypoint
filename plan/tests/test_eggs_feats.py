"""Contracts for local feats, daily shop rarity, and quiet easter eggs."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EGGS = (ROOT / "static/js/eggs.js").read_text(encoding="utf-8")
LOOT = (ROOT / "static/js/loot.js").read_text(encoding="utf-8")
INDEX = (ROOT / "static/index.html").read_text(encoding="utf-8")
MISC = (ROOT / "static/js/misc.js").read_text(encoding="utf-8")
CSS = (ROOT / "static/css/app.css").read_text(encoding="utf-8")


def test_eggs_script_is_loaded_after_the_game_layer():
    assert INDEX.index("/js/misc.js") < INDEX.index("/js/eggs.js")
    assert "waypointEggsV1" in EGGS
    assert "waypointAchievementsV1" in EGGS
    assert "window.WaypointEggs" in EGGS


def test_feats_cover_weird_use_and_original_secret_writing():
    assert EGGS.count("id: ") >= 20
    for feat in (
        "empty_cache", "tab_whirlwind", "midnight_paint", "skin_fidget",
        "konami_route", "pacifist_cache", "stray_dog", "spoken_for",
        "piano_route", "fun_sixty_six", "snowed_in",
    ):
        assert f'id: "{feat}"' in EGGS
    assert "The route still wants you" in EGGS
    assert "The cache was empty" in EGGS
    assert "That name is already spoken for" in EGGS
    forbidden = [
        "filled with determination",
        "but nobody came",
        "it's a beautiful day outside",
        "despite everything, it's you",
    ]
    lower = EGGS.lower()
    for line in forbidden:
        assert line not in lower


def test_daily_forge_and_rare_stock_contracts():
    assert "function dayForgeItems(" in LOOT
    assert "function buyForgeDaily(" in LOOT
    assert "rareEvery" in LOOT
    assert 'id: "legendary_vault"' in LOOT
    assert 'id: "stray"' in LOOT
    assert "RESETS EACH LOCAL MIDNIGHT" in LOOT
    assert "TODAY'S CARAVAN" in LOOT
    assert ".loot-rarity-legendary" in CSS
    assert ".loot-shop-item--rare" in CSS
    assert "CHEST_TAPS" in LOOT


def test_quests_skip_unused_blueprint_and_stay_data_driven():
    assert "function gameQuestEligible(" in MISC
    assert "function gameQuestLabel(" in MISC
    assert "waypointQuestSignalsV1" in MISC
    assert "hasBlueprints" in MISC
    assert "gameCompanionSnippet" in MISC
    assert "overdue1" in MISC
    assert "talk1" in MISC
    assert not re.search(r"fill out yesterday", MISC, re.I)
