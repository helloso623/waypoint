"""Contracts for local habit learning and relevant daily pursuits."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HABITS = ROOT / "static" / "js" / "habits.js"
MISC = ROOT / "static" / "js" / "misc.js"
INDEX = ROOT / "static" / "index.html"


def run_habits(expression: str):
    script = f"""
const fs = require("fs");
const vm = require("vm");
const values = new Map();
const localStorage = {{
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value))
}};
const context = {{ Date, window: {{ localStorage }} }};
vm.createContext(context);
vm.runInContext(fs.readFileSync({json.dumps(str(HABITS))}, "utf8"), context);
process.stdout.write(JSON.stringify(vm.runInContext({json.dumps(expression)}, context)));
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_habits_observe_snapshot_and_relevant_suggestions():
    result = run_habits(
        """(() => {
          window.WaypointHabits.observe("tab", "Today");
          window.WaypointHabits.observe("tab", "Today");
          window.WaypointHabits.observe("paint", 4);
          window.WaypointHabits.observe("practice", "memory");
          window.WaypointHabits.observe("quest-selected", "match1");
          window.WaypointHabits.observe("pulse");
          window.WaypointHabits.observe("skin", "volt");
          return {
            snapshot: window.WaypointHabits.snapshot(),
            suggested: window.WaypointHabits.suggestQuestKeys(
              ["paint6", "tasks3", "pulse2", "match1", "reflect1", "showup1", "addtask2"], 3
            ),
            defaultTab: window.WaypointHabits.suggestDefaultTab()
          };
        })()"""
    )
    snapshot = result["snapshot"]
    assert snapshot["counts"]["tabs"]["Today"] == 2
    assert snapshot["counts"]["paintHours"] == 4
    assert snapshot["counts"]["pulse"] == 1
    assert snapshot["counts"]["practice"]["memory"] == 1
    assert snapshot["counts"]["skins"]["volt"] == 1
    assert {"paint6", "match1"}.issubset(result["suggested"])
    assert len(result["suggested"]) == len(set(result["suggested"])) == 3
    assert result["defaultTab"] == "Today"


def test_habits_are_silent_local_and_loaded_before_game_layer():
    habits = HABITS.read_text(encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")
    assert 'const STORAGE_KEY = "waypointHabitsV1"' in habits
    assert "showToast" not in habits
    assert "fetch(" not in habits
    assert index.index("/js/habits.js") < index.index("/js/misc.js")


def test_daily_pool_stays_complete_and_selection_is_habit_weighted():
    misc = MISC.read_text(encoding="utf-8")
    block = re.search(r"const GAME_QUEST_POOL = \{(.*?)\n\};", misc, re.S)
    assert block
    keys = set(re.findall(r"^\s{2}([a-z0-9]+):", block.group(1), re.M))
    assert keys >= {
        "pulse2", "tasks3", "addtask2", "reflect1", "contract1", "contact1",
        "match1", "paint6", "showup1",
    }
    expected = {
        "pulse2": ("Log 3 day pulses", 3),
        "tasks3": ("Finish 2 tasks", 2),
        "addtask2": ("Add 2 tasks", 2),
        "reflect1": ("Write a reflection", 1),
        "contract1": ("Keep today's contract", 1),
        "contact1": ("Log a contact follow-up", 1),
        "match1": ("Play a brain game", 1),
        "paint6": ("Paint 2 honest hours", 2),
        "showup1": ("Show up: pulse + one painted hour", 1),
    }
    for key, (label, target) in expected.items():
        assert f'{key}: {{ label: "{label}", target: {target} }}' in block.group(0)
    assert "yesterday" not in block.group(0).lower()
    selector = misc[misc.index("function gameSelectDailyQuests("):misc.index("function gameQuestSelectionLimit(")]
    assert "window.WaypointHabits" in selector
    assert "suggestQuestKeys" in selector
    assert "habitRank" in selector
    assert "gameHashDate(dateStr)" in selector
    assert 'const coreKeys = ["pulse2", "tasks3", "addtask2", "reflect1", "contract1", "match1", "showup1"]' in selector
    assert "picked.push(corePick)" in selector
    assert "gameQuestEligible" in selector
    assert "blueprint1" in misc[misc.index("function gameQuestEligible("):misc.index("function gameQuestLabel(")]
    assert 'data-quest-jump="${escapeHtml(jumpTab)}"' in misc
    assert 'setMax("book1", readingLogs)' in misc
    assert 'setMax("capture3", capturedNotes)' in misc
    assert 'setMax("overdue1", overdueDone)' in misc
    assert 'typeof gameEffectiveStreak === "function"' in misc
    assert "setInterval(gamePollQuestProgress, 10000)" in misc
    assert 'document.addEventListener("visibilitychange"' in misc
