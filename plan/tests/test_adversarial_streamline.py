"""Adversarial verification of the comprehensive streamline pass.

Offline-fast by construction: every check is either a temp-DB round trip or a static
read of the served asset files. Nothing here talks to an LLM or the live Flask process.

Aspects covered (one test class each):
  A. Companion Confirm path + delete-chat isolation from the Companion thread
  B. Revert completeness for the #18 Arcade/Docs/weather pass (absence assertions)
  C. Blueprint toolbar honesty + context menus + C++ scaffold
  D. Today / Arcade / Home UI claims
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
sys.path.insert(0, str(ROOT))

# Commit that introduced the reverted Arcade/Docs pass (#18); its parent is the baseline.
PR18 = "90cd9b3"


def asset(relpath: str) -> str:
    return (STATIC / relpath).read_text(encoding="utf-8", errors="replace")


def baseline_asset(relpath: str) -> str:
    """Contents of a static file as of the commit *before* #18."""
    out = subprocess.run(
        ["git", "show", f"{PR18}^:plan/static/{relpath}"],
        cwd=ROOT.parent, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return out.stdout if out.returncode == 0 else ""


def slice_between(text: str, start: str, end: str) -> str:
    """Body of `text` from the first `start` marker up to the next `end` marker after it."""
    i = text.index(start)
    j = text.index(end, i + len(start))
    return text[i:j]


def temp_db():
    """Fresh isolated planner.db + data dir; returns the reloaded db module."""
    tmp = tempfile.mkdtemp()
    os.environ["PLANNER_DB_PATH"] = str(Path(tmp) / "adversarial.db")
    os.environ["WAYPOINT_DATA_DIR"] = tmp
    import importlib
    import db as _db
    importlib.reload(_db)
    _db.init_db()
    conn = _db.get_conn()
    conn.execute("DELETE FROM agent_conversations")
    conn.commit()
    conn.close()
    return _db


class AspectACompanionConfirmAndDelete(unittest.TestCase):
    """Companion Confirm writes go through the normal route; deletes never surface Companion."""

    def test_delete_prefers_real_chat_even_when_companion_is_newest(self):
        db = temp_db()
        companion = db.ensure_agent_conversation_by_title("Companion")
        alpha = db.create_agent_conversation("Alpha")["id"]
        beta = db.create_agent_conversation("Beta")["id"]
        # Adversarial ordering: make Companion the most recently updated row, so a naive
        # "newest wins" replacement query would hand back the Companion thread.
        db.touch_agent_conversation(companion)

        out = db.delete_agent_conversation(beta)

        self.assertEqual(out["deleted_id"], beta)
        self.assertNotEqual(out["active_id"], companion)
        self.assertEqual(db.get_agent_conversation(out["active_id"])["title"], "Alpha")
        self.assertEqual(alpha, out["active_id"])

    def test_delete_opens_fresh_chat_when_companion_is_the_only_survivor(self):
        """Regression: deleting the last real chat must not activate the Companion thread.

        The Agent picker filters Companion out (agent.js agentConversationsForPicker), so
        returning Companion as active_id strands the tab on a chat it refuses to list.
        """
        db = temp_db()
        companion = db.ensure_agent_conversation_by_title("Companion")
        disposable = db.create_agent_conversation("Only real chat")["id"]

        out = db.delete_agent_conversation(disposable)

        self.assertNotEqual(out["active_id"], companion)
        active = db.get_agent_conversation(out["active_id"])
        self.assertNotEqual(active["title"], "Companion")
        # Companion itself must survive — it is a side-thread, not a casualty.
        self.assertIsNotNone(db.get_agent_conversation(companion))

    def test_delete_replaces_companion_when_it_is_the_only_chat(self):
        db = temp_db()
        companion = db.ensure_agent_conversation_by_title("Companion")

        out = db.delete_agent_conversation(companion)

        self.assertIsNotNone(out["active_id"])
        self.assertNotEqual(out["active_id"], companion)
        self.assertNotEqual(db.get_agent_conversation(out["active_id"])["title"], "Companion")

    def test_confirmations_are_never_stored_as_raw_confirm_tool_messages(self):
        """The [CONFIRM_TOOL] envelope is transport only; history must read 'Confirmed.'"""
        db = temp_db()
        import importlib
        import agent
        importlib.reload(agent)

        cid = db.ensure_agent_conversation_by_title("Companion")
        msg = agent.CONFIRM_TOOL_PREFIX + json.dumps({
            "tool": "add_contact",
            "input": {"name": "ZZTEST Adversarial", "what_they_do": "fixture"},
        })
        out = agent.chat(msg, tool_policy="auto", conversation_id=cid)

        stored = db.list_agent_messages(conversation_id=cid)
        contents = [m["content"] for m in stored]
        self.assertNotIn(agent.CONFIRM_TOOL_PREFIX, "\n".join(contents))
        self.assertFalse(any("[CONFIRM_TOOL]" in c for c in contents))
        self.assertIn("Confirmed.", contents)
        # The write actually executed rather than re-proposing itself.
        self.assertEqual(out.get("confirmations"), [])
        self.assertTrue(out.get("confirmed"))
        self.assertEqual(len(db.list_contacts()), 1)

    def test_companion_write_route_stays_normal_so_confirm_chips_appear(self):
        """scoreRouteStrength must return 'normal' (not 'fast') for write intents.

        Normal and strong both auto-apply ordinary writes; fast has no tools.
        """
        js = asset("js/companion.js")
        body = slice_between(js, "function scoreRouteStrength(", "function ")
        self.assertIn("ROUTE_WRITE_FORCE_HINTS", body)
        write_branch = re.search(
            r"if \(ROUTE_WRITE_FORCE_HINTS\.some\(re => re\.test\(text\)\)\) return \"(\w+)\";",
            body,
        )
        self.assertIsNotNone(write_branch, "write-intent branch missing from scoreRouteStrength")
        self.assertEqual(write_branch.group(1), "normal")
        # Short add/schedule lines must not fall through to fast (no tools).
        self.assertIn("looksLikeWrite", body)
        self.assertIn('return looksLikeWrite ? "normal" : "fast"', body)

    def test_companion_confirm_chip_posts_confirm_tool_envelope(self):
        js = asset("js/companion.js")
        self.assertIn('CONFIRM_TOOL_PREFIX = "[CONFIRM_TOOL]"', js)
        self.assertIn("companion-confirm-tool", js)
        self.assertIn("sendToolConfirmation", js)
        # Normal route auto-applies ordinary writes; Confirm remains for deletes/repeats.
        self.assertIn("apply ordinary writes immediately", js)
        self.assertIn("only wait for confirm on deletes, repeats, and situations", js)


class AspectBRevertCompleteness(unittest.TestCase):
    """The #18 Arcade shop / dual roads / Elo hub / Home weather must stay dead."""

    # Every function+const the revert removed from the #18 Arcade/economy pass.
    REVERTED_IDENTIFIERS = [
        "arcApplyChestLoot", "arcDailyChestClaimed", "arcDailyChestHtml", "arcDualRoadsHtml",
        "arcGetPlayerElo", "arcGetShopSpent", "arcGetSpendableCoins", "arcMarkDailyChestClaimed",
        "arcOpenShopChest", "arcRefreshHubEconomy", "arcRollChestLoot", "arcRunLuckyFlip",
        "arcSetPlayerElo", "arcShopHtml", "ARC_SHOP_ITEMS", "arcShopPrice", "arcShopSaleId",
        "arcTrySpendCoins", "arcUpdatePlayerElo", "arcWireShopAndDaily",
    ]

    def test_reverted_arcade_economy_identifiers_are_absent(self):
        blob = "".join(
            asset(f"js/{name}") for name in ("practice.js", "core.js", "misc.js", "hub.js")
        ) + asset("css/app.css")
        revived = [i for i in self.REVERTED_IDENTIFIERS if i in blob]
        self.assertEqual(revived, [], f"reverted #18 identifiers are back: {revived}")

    def test_no_coin_shop_or_dual_road_chrome_in_any_served_asset(self):
        for path in sorted(STATIC.glob("js/*.js")):
            text = path.read_text(encoding="utf-8", errors="replace")
            self.assertNotRegex(text, r"dual[-_ ]?road", f"dual road chrome in {path.name}")
            self.assertNotRegex(text, r"coin[-_ ]?shop", f"coin shop chrome in {path.name}")
            self.assertNotRegex(text, r"lucky[-_ ]?flip", f"lucky flip in {path.name}")

    def test_arcade_files_match_pre_18_baseline_for_chest_and_elo_volume(self):
        """Pre-existing chest/Elo systems should be untouched — neither revived nor collateral.

        misc.js may gain a small intentional delta for HUD chest badge/claim cues
        (loot consolidation). Cap that delta so #18 shop revival still fails loudly.
        """
        for name in ("practice.js", "misc.js", "core.js"):
            current = asset(f"js/{name}").lower()
            base = baseline_asset(f"js/{name}").lower()
            self.assertTrue(base, f"missing pre-#18 baseline for {name}")
            chest_delta = current.count("chest") - base.count("chest")
            # HUD loot cluster / launcher ember cues may mention "chest" in misc.js + core.js.
            # Cap the delta so a full #18 shop revival still fails loudly.
            if name in ("misc.js", "core.js"):
                self.assertGreaterEqual(chest_delta, 0, f"{name} lost chest language")
                self.assertLessEqual(chest_delta, 10, f"{name} chest drift too large: {chest_delta}")
            else:
                self.assertEqual(chest_delta, 0, f"{name} chest drift")
            self.assertEqual(
                len(re.findall(r"\belo\b", current)),
                len(re.findall(r"\belo\b", base)),
                f"{name} elo drift",
            )

    def test_home_launcher_renders_no_weather(self):
        core = asset("js/core.js")
        launcher = slice_between(core, "async function renderLauncher()", "function stopLauncherAmbient")
        self.assertNotIn("weather", launcher.lower())
        self.assertNotIn("launcher-weather-wrap", launcher)
        # And the weather chip element is never produced anywhere: only ever read back.
        producers = [
            line for line in core.splitlines()
            if "launcher-weather-wrap" in line and "getElementById" not in line
        ]
        self.assertEqual(producers, [], f"something still emits the weather wrap: {producers}")

    def test_home_launcher_weather_dead_code_is_pruned(self):
        core = asset("js/core.js")
        for identifier in (
            "launcherGetWeatherLoc",
            "launcherSaveWeatherLoc",
            "launcherWeatherEmoji",
            "launcherFetchWeather",
            "launcherGeocodeCity",
            "launcherWeatherChipHtml",
            "launcherPromptWeatherCity",
            "refreshLauncherWeather",
            "wireLauncherWeather",
        ):
            self.assertNotIn(identifier, core)
        self.assertNotIn("Set weather", core)

    def test_docs_toolbar_not_rewritten_beyond_pre_18_baseline(self):
        """Both rich and compact Docs toolbar paths match their pre-#18 baseline."""
        repo = asset("js/repository.js")
        docs_toolbar = slice_between(repo, "function repoDocsToolbarHtml(", "function repoTextToDocsContent")
        base_toolbar = slice_between(
            baseline_asset("js/repository.js"),
            "function repoDocsToolbarHtml(", "function repoTextToDocsContent",
        )
        compact_toolbar = slice_between(
            repo, "function repoCompactToolbarHtml(", "function repoDocsToolbarHtml",
        )
        base_compact_toolbar = slice_between(
            baseline_asset("js/repository.js"),
            "function repoCompactToolbarHtml(", "function repoDocsToolbarHtml",
        )

        # Baseline returned the shared rich toolbar and nothing else.
        self.assertNotIn("repo-docs-extras", base_toolbar)
        self.assertNotIn("data-repo-fullscreen", base_toolbar)

        self.assertNotIn(
            "repo-docs-extras", docs_toolbar,
            "#18 Docs toolbar extras row is still rendered — Docs chrome was not fully reverted",
        )
        self.assertNotIn(
            "${extras}", docs_toolbar,
            "repoDocsToolbarHtml still appends #18 extras to the live RICH_TOOLBAR_HTML branch",
        )
        self.assertEqual(docs_toolbar, base_toolbar)
        self.assertEqual(
            compact_toolbar,
            base_compact_toolbar,
            "compact fallback still contains #18 sheet/graph/color/fullscreen chrome",
        )

    def test_docs_mode_does_not_stack_two_fullscreen_buttons(self):
        """Docs mode must not combine rich-toolbar and #18 fullscreen controls."""
        rich = slice_between(asset("js/core.js"), "const RICH_TOOLBAR_HTML", "function openFullscreenEditor")
        docs_toolbar = slice_between(
            asset("js/repository.js"), "function repoDocsToolbarHtml(", "function repoTextToDocsContent",
        )
        rich_has_fullscreen = "rich-fullscreen-btn" in rich
        extras_has_fullscreen = "data-repo-fullscreen" in docs_toolbar
        self.assertFalse(
            rich_has_fullscreen and extras_has_fullscreen,
            "Docs toolbar stacks the rich toolbar's 'Full screen' with an extra 'Fullscreen' button",
        )


class AspectCBlueprintHonesty(unittest.TestCase):
    """Blueprint toolbar tells the truth and the context menus exist."""

    def test_toolbar_has_no_overleaf_and_no_compile_button(self):
        js = asset("js/automation.js")
        self.assertNotIn("Overleaf", js)
        compile_buttons = [
            line for line in js.splitlines()
            if "<button" in line and re.search(r">\s*Compile", line)
        ]
        self.assertEqual(compile_buttons, [], f"Compile button present: {compile_buttons}")

    def test_single_honest_cpp_export_plus_code_toggle_and_app_links(self):
        js = asset("js/automation.js")
        self.assertEqual(js.count('id="studio-tb-cpp"'), 1, "expected exactly one C++ export button")
        self.assertIn("Export C++ scaffold", js)
        self.assertIn("not a full compiler", js)

        self.assertEqual(js.count('id="studio-tb-split"'), 1)
        self.assertIn("Hide code", js)
        self.assertIn("Show code", js)

        self.assertEqual(js.count('id="studio-tb-library"'), 1)
        self.assertIn("App links", js)

    def test_start_node_and_pin_context_menus_are_wired(self):
        js = asset("js/automation.js")

        # Start is protected but must still open a menu instead of silently doing nothing.
        node_menu = slice_between(js, "function wfShowNodeContextMenu(", "if (WF_SELECTED_NODES.size >= 2)")
        self.assertIn('n.type === "start"', node_menu)
        self.assertIn("Edit Start", node_menu)
        self.assertIn("Delete (locked)", node_menu)
        self.assertIn("showWfActionMenu", node_menu)

        self.assertIn("function wfShowPinContextMenu(", js)
        self.assertIn("wfShowPinContextMenu(e, pin)", js)
        self.assertIn('pin.addEventListener("contextmenu"', js)

    def test_generate_cpp_reads_params_and_never_emits_if_true(self):
        import workflow

        graph = {
            "nodes": [
                {"id": "s", "type": "start", "params": {}},
                {"id": "p", "type": "print", "params": {"message": "from params"}},
                {"id": "b", "type": "branch", "params": {}},
            ],
            "edges": [
                {"from": "s", "to": "p", "fromPort": "next", "kind": "exec"},
                {"from": "p", "to": "b", "fromPort": "next", "kind": "exec"},
            ],
            "variables": [{"name": "count", "type": "int", "default": "3"}],
        }
        cpp = workflow.generate_cpp(graph)

        self.assertIn('"from params"', cpp)
        self.assertIn("long long count = 3;", cpp)
        self.assertNotRegex(cpp, r"if\s*\(\s*true\s*\)")
        self.assertIn("branch node has no condition wired", cpp)
        self.assertIn("experimental C++ scaffold", cpp)

        # params must win over a stale legacy props value on the same node.
        conflicted = workflow.generate_cpp({
            "nodes": [
                {"id": "s", "type": "start", "params": {}},
                {"id": "p", "type": "print", "props": {"message": "stale"}, "params": {"message": "fresh"}},
            ],
            "edges": [{"from": "s", "to": "p", "fromPort": "next", "kind": "exec"}],
        })
        self.assertIn('"fresh"', conflicted)
        self.assertNotIn('"stale"', conflicted)

        # Degenerate graphs stay honest rather than emitting a fake always-true branch.
        for degenerate in ({}, {"nodes": [], "edges": []}):
            out = workflow.generate_cpp(degenerate)
            self.assertIn("int main()", out)
            self.assertNotRegex(out, r"if\s*\(\s*true\s*\)")


class AspectDTodayArcadeHome(unittest.TestCase):
    """Today / Arcade / Home streamline claims."""

    def test_only_the_compact_pulse_row_is_rendered_and_only_in_the_fused_shell(self):
        js = asset("js/today.js")
        shell = slice_between(js, "async function renderPlannerFusedShell()", "return renderPlannerFusedShell();")
        self.assertIn("renderPulseCompactRow(pulseData, isViewingToday)", shell)
        self.assertIn('ACTIVE_TAB === "Today"', shell)

        # The full pulse card must not be rendered into any template.
        self.assertNotIn("renderPulseCard(pulseData", shell)
        template_calls = [
            line.strip() for line in js.splitlines()
            if "renderPulseCard(" in line and "function renderPulseCard" not in line
        ]
        for line in template_calls:
            self.assertIn("card.outerHTML", line, f"pls-card rendered into a template: {line}")
        # …and its only anchor id is produced by itself, so the branch is unreachable.
        emitters = [
            line for line in js.splitlines()
            if 'id="pls-card"' in line
        ]
        self.assertLessEqual(len(emitters), 1)

    def test_task_rail_offers_due_and_overdue(self):
        js = asset("js/today.js")
        self.assertIn('["due_today", "Due"], ["overdue", "Overdue"]', js)
        self.assertIn('if (f === "overdue")', js)

    def test_day_grade_badge_gated_to_evening(self):
        js = asset("js/today.js")
        self.assertRegex(js, r"new Date\(\)\.getHours\(\) >= 19")

    def test_no_suggest_social_anywhere(self):
        for path in sorted(STATIC.glob("js/*.js")):
            text = path.read_text(encoding="utf-8", errors="replace")
            self.assertNotRegex(text, r"suggest[-_]?social", f"suggest-social survives in {path.name}")

    def test_arcade_has_no_hub_road_and_exactly_one_skin_road_inside_the_lab(self):
        js = asset("js/practice.js")
        self.assertNotIn("rwdHubRoadHtml", js)

        self.assertEqual(js.count("&#127912; Skin Road"), 1, "expected exactly one Skin Road header")
        # The Skin Road lives in the rewards panel…
        rewards = slice_between(js, "function rwdRewardsPanelHtml(", "function praxOpenDailyCheckStage")
        self.assertIn("rwdRoadHtml(points, unlocked)", rewards)
        self.assertEqual(js.count("rwdRoadHtml("), 2)  # definition + single call site

        # …and the rewards panel is only mounted inside the collapsible Training Lab.
        self.assertEqual(js.count("${rwdRewardsPanelHtml("), 1)
        lab_open = js.index('class="arc-lab-panel')
        lab_close = js.index('<div id="practice-play-area">', lab_open)
        panel_call = js.index("${rwdRewardsPanelHtml(")
        self.assertLess(lab_open, panel_call, "rewards panel mounted outside the Training Lab")
        self.assertLess(panel_call, lab_close)

    def test_next_reward_caption_mentions_skins_not_rivals(self):
        js = asset("js/practice.js")
        block = slice_between(js, "function rwdPlayBlockHtml(", "function rwdRoadHtml(")
        self.assertIn("Next skin", block)
        self.assertNotIn("rival", block.lower())
        self.assertNotIn("elo", block.lower())

    def test_inactive_launcher_dock_tabs_are_transparent(self):
        css = slice_between(asset("js/core.js"), ".launcher-dock-tab {", ".launcher-dock-panel {")
        base = slice_between(css, ".launcher-dock-tab {", ".launcher-dock-tab:hover")
        self.assertIn("background: transparent", base)
        active = slice_between(css, ".launcher-dock-tab.active {", "}")
        self.assertIn("background: var(--accent)", active)

    def test_my_apps_dock_tab_hidden_when_no_custom_apps(self):
        launcher = slice_between(
            asset("js/core.js"), "async function renderLauncher()", "function stopLauncherAmbient",
        )
        self.assertIn("const myAppsTab = customApps.length", launcher)
        self.assertIn('LAUNCHER_DOCK_TAB = "workspace"', launcher)
        # Empty custom apps yields an empty string for the tab markup.
        self.assertRegex(launcher, r"customApps\.length\s*\n?\s*\?[\s\S]*?:\s*\"\";")

    def test_reset_pins_button_exists_only_in_customize_mode(self):
        core = asset("js/core.js")
        spots = slice_between(core, "function launcherSpotsHtml()", "function updateLauncherSpotCustomizeUi")
        self.assertRegex(
            spots,
            r"LAUNCHER_SPOTS_CUSTOMIZE\s*\?\s*`<button[^`]*launcher-spots-reset[^`]*`\s*:\s*\"\"",
        )
        toggle = slice_between(core, "function updateLauncherSpotCustomizeUi", "function cycleHomeSpot")
        self.assertIn("if (LAUNCHER_SPOTS_CUSTOMIZE) {", toggle)
        self.assertIn("if (resetBtn) resetBtn.remove();", toggle)


if __name__ == "__main__":
    unittest.main()
