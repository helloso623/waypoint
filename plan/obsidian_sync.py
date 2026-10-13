"""Mirrors the DB into Markdown files inside an Obsidian vault so you can read/
write your days and goals directly in Obsidian.

Writing here is DB -> Markdown, overwritten on every save. The other direction
(hand-edits to Daily/<date>.md flowing back into the DB) is handled by
obsidian_watcher.py, which polls for changes and parses this module's own
Daily note format back out -- see that file for the details and for why
Project Plan.md and Goals notes aren't part of that loop.

Set OBSIDIAN_VAULT_PATH in .env to point at your real vault; defaults to the
bundled obsidian_vault/ folder so this works with zero setup.
"""
import os
from pathlib import Path

from categories import CATEGORY_BY_KEY

import personal_data

# Defaults to WAYPOINT_DATA_DIR/obsidian_vault, not the git checkout: a journal is
# personal and must not be shareable just because the repo is.
VAULT_PATH = personal_data.vault_path()
DAILY_DIR = VAULT_PATH / "Daily"
GOALS_DIR = VAULT_PATH / "Goals"


def _ensure_dirs():
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    GOALS_DIR.mkdir(parents=True, exist_ok=True)


def _safe_filename(title):
    return "".join(c for c in title if c.isalnum() or c in " -_").strip()[:80] or "untitled"


def write_day_note(date, metrics, hours, summary=""):
    _ensure_dirs()
    lines = [f"# {date}", ""]
    if summary:
        lines += [summary, ""]

    lines += ["## Hours", "", "| Hour | Category | Note |", "|---|---|---|"]
    for hour in range(24):
        h = hours.get(hour, {})
        cat_key = h.get("category")
        cat = CATEGORY_BY_KEY.get(cat_key)
        label = cat["label"] if cat else "-"
        lines.append(f"| {hour:02d}:00 | {label} | {h.get('note') or ''} |")

    lines += ["", "## Metrics", ""]
    for key in ("happiness", "volatility", "motivation", "focus", "work_time", "effective_work_time", "sports"):
        lines.append(f"- **{key}**: {metrics.get(key, '')}")
    lines += ["", "## Notes", "", metrics.get("notes") or "", ""]

    (DAILY_DIR / f"{date}.md").write_text("\n".join(lines), encoding="utf-8")


def write_goal_note(goal):
    _ensure_dirs()
    lines = [f"# {goal['title']}", "", f"Deadline: {goal.get('deadline') or '-'}", "", "## Chunks", ""]
    for chunk in goal["chunks"]:
        box = "x" if chunk.get("done") else " "
        due = f" (due {chunk['due_date']})" if chunk.get("due_date") else ""
        lines.append(f"- [{box}] {chunk['title']}{due}")

    filename = _safe_filename(f"{goal['id']}-{goal['title']}")
    (GOALS_DIR / f"{filename}.md").write_text("\n".join(lines), encoding="utf-8")


def write_agent_activity(logs):
    """Overwrites Agent Activity.md with the most recent subagent runs, so you can
    watch what each agent is doing live from Obsidian instead of the app.
    """
    _ensure_dirs()
    lines = ["# Agent Activity", "", "Most recent subagent runs (auto-updated on every run).", ""]
    for log in logs:
        lines.append(f"- `{log['created_at']}` **{log['subagent']}** -- {log['summary']}")
    (VAULT_PATH / "Agent Activity.md").write_text("\n".join(lines), encoding="utf-8")
