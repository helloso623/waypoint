"""Watches the Obsidian vault for hand-edits and syncs them back into the DB.

Narrow and one-direction-in: only `Daily/<date>.md` round-trips, because
`write_day_note` (obsidian_sync.py) is the only writer whose format is known
well enough to parse back safely, and its own save path (api_save_day in
app.py) always calls db.save_day() immediately before write_day_note(), so a
file that differs from the DB can only mean a human edited it by hand.

`Project Plan.md` has no DB representation at all -- api_get_plan/api_save_plan
in app.py already read/write it straight from/to disk on every request, so
there's no derived copy that could ever clobber it. This module just notices
external edits to it and logs them (Agent Activity), it never writes to it.

Goals/<title>.md is intentionally left out: a chunk checkbox line has no
stable per-line identity to match back to a chunk_id (only title text and
position), so a hand-edit (retitle, reorder, add a line) is genuinely
ambiguous to reverse -- guessing wrong there silently reassigns someone
else's checkbox, which is worse than not syncing it at all.

Poll-based (mtime comparison) rather than `watchdog`: a personal daily note
changes at most a handful of times a day, so a short poll loop is plenty
responsive without adding a dependency.
"""
import os
import re
import threading
import time

import db
import obsidian_sync
from categories import METRICS

POLL_INTERVAL_SECONDS = int(os.environ.get("OBSIDIAN_WATCH_INTERVAL", "5"))
PLAN_PATH = obsidian_sync.VAULT_PATH / "Project Plan.md"

_METRIC_TYPE = {m["key"]: m["type"] for m in METRICS}
_DAILY_NOTE_METRIC_FIELDS = (
    "happiness", "volatility", "motivation", "focus", "work_time", "effective_work_time", "sports",
)

_HOUR_RE = re.compile(r"^\|\s*(\d{2}):00\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$")
_METRIC_RE = re.compile(r"^-\s*\*\*(\w+)\*\*:\s*(.*)$")

_INVALID = object()  # value present but couldn't be parsed -- keep the DB's existing value
_UNKNOWN_CATEGORY = object()  # label doesn't match any known category -- keep the DB's existing value

_seen_mtimes = {}  # path -> last mtime we've reacted to


def _label_to_key():
    return {c["label"]: c["key"] for c in db.list_categories()}


def _coerce_metric(key, raw):
    raw = raw.strip()
    if raw in ("", "None"):
        return None
    caster = int if _METRIC_TYPE.get(key) == "scale" else float
    try:
        return caster(raw)
    except ValueError:
        return _INVALID


def _parse_day_note(text, expected_date):
    """Best-effort reverse of obsidian_sync.write_day_note. Raises ValueError if the
    file doesn't even look like a Daily note we generated, so a hand-rewritten/garbled
    file gets skipped (logged) instead of misparsed into the DB.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != f"# {expected_date}":
        raise ValueError(f"first line isn't '# {expected_date}'")

    label_to_key = _label_to_key()
    hours = {}
    metrics_raw = {}
    for line in lines:
        m = _HOUR_RE.match(line)
        if m:
            hour = int(m.group(1))
            label, note = m.group(2).strip(), m.group(3).strip()
            if label in ("", "-"):
                category = None
            elif label in label_to_key:
                category = label_to_key[label]
            else:
                category = _UNKNOWN_CATEGORY
            hours[hour] = (category, note or None)
            continue
        m = _METRIC_RE.match(line)
        if m:
            metrics_raw[m.group(1)] = m.group(2)

    notes_text = None
    if "## Notes" in text:
        notes_text = text.split("## Notes", 1)[1].strip("\n")

    return hours, metrics_raw, notes_text


def _sync_daily_file(path):
    date = path.stem
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return

    try:
        parsed_hours, metrics_raw, notes_text = _parse_day_note(text, date)
    except ValueError as exc:
        print(f"[obsidian_watcher] skipping {path.name}: {exc}")
        return

    existing = db.get_day(date)
    existing_metrics = existing["metrics"] or {}
    existing_hours = existing["hours"]

    merged_metrics = dict(existing_metrics)
    changed_metric_keys = []
    for key in _DAILY_NOTE_METRIC_FIELDS:
        if key not in metrics_raw:
            continue
        value = _coerce_metric(key, metrics_raw[key])
        if value is _INVALID:
            print(f"[obsidian_watcher] {path.name}: unparseable value for {key!r} "
                  f"({metrics_raw[key]!r}), keeping existing DB value")
            continue
        if value != existing_metrics.get(key):
            merged_metrics[key] = value
            changed_metric_keys.append(key)

    if notes_text is not None:
        notes_value = notes_text or None
        if notes_value != (existing_metrics.get("notes") or None):
            merged_metrics["notes"] = notes_value
            changed_metric_keys.append("notes")

    merged_hours = {}
    changed_hours = 0
    for hour, (category, note) in parsed_hours.items():
        current = existing_hours.get(hour, {})
        if category is _UNKNOWN_CATEGORY:
            print(f"[obsidian_watcher] {path.name}: unrecognized category label at "
                  f"{hour:02d}:00, keeping existing DB value")
            category = current.get("category")
        merged_hours[hour] = {"category": category, "note": note}
        if (category or None) != (current.get("category") or None) or note != (current.get("note") or None):
            changed_hours += 1

    if not changed_metric_keys and not changed_hours:
        return

    db.save_day(date, merged_metrics, merged_hours)
    parts = []
    if changed_metric_keys:
        parts.append(f"{len(changed_metric_keys)} metric field(s) ({', '.join(changed_metric_keys)})")
    if changed_hours:
        parts.append(f"{changed_hours} hour row(s)")
    summary = f"Daily/{path.name} edited externally -- synced {' + '.join(parts)} into the DB"
    print(f"[obsidian_watcher] {summary}")
    db.insert_agent_log("obsidian_watcher", summary)
    obsidian_sync.write_agent_activity(db.recent_agent_logs())


def _check_plan_file():
    if not PLAN_PATH.exists():
        return
    mtime = PLAN_PATH.stat().st_mtime
    first_sighting = PLAN_PATH not in _seen_mtimes
    if _seen_mtimes.get(PLAN_PATH) == mtime:
        return
    _seen_mtimes[PLAN_PATH] = mtime
    if first_sighting:
        return  # just establishing a baseline on startup, not an edit
    summary = "Project Plan.md edited externally (no DB mirror -- file is already the source of truth)"
    print(f"[obsidian_watcher] {summary}")
    db.insert_agent_log("obsidian_watcher", summary)
    obsidian_sync.write_agent_activity(db.recent_agent_logs())


def _tick():
    if obsidian_sync.DAILY_DIR.exists():
        for path in obsidian_sync.DAILY_DIR.glob("*.md"):
            try:
                mtime = path.stat().st_mtime
            except FileNotFoundError:
                continue
            if _seen_mtimes.get(path) == mtime:
                continue
            _seen_mtimes[path] = mtime
            try:
                _sync_daily_file(path)
            except Exception as exc:
                print(f"[obsidian_watcher] failed syncing {path.name}: {exc}")

    try:
        _check_plan_file()
    except Exception as exc:
        print(f"[obsidian_watcher] failed checking Project Plan.md: {exc}")


def _loop():
    while True:
        try:
            _tick()
        except Exception as exc:
            print(f"[obsidian_watcher] tick failed: {exc}")
        time.sleep(POLL_INTERVAL_SECONDS)


def start():
    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
    return thread
