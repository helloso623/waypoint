"""Helpers for the remaining napkin items: recovery, export, calendar conflicts, tasks."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone

import db

def personal_napkin_tasks():
    """Titles of the napkin notes explicitly marked as tasks.

    `private` used to be the selector, which was wrong: it means "keep this out of the shared
    napkin", not "this is a task". Every private note -- including long free-form brain dumps
    holding several unrelated thoughts -- was promoted into Tasks as one unwieldy row. Only an
    entry you actually marked as a task is promoted now.

    Read from the local napkin state rather than hardcoded: these are real names and this file
    is committed, so listing them here put personal data in the repo.
    """
    try:
        import napkin_sync
        entries = napkin_sync._read_state().get("entries") or []
    except Exception:
        return ()
    return tuple(
        (e.get("title") or "").strip()
        for e in entries
        if isinstance(e, dict) and is_napkin_task(e) and (e.get("title") or "").strip()
    )


def is_napkin_task(entry):
    """True only when the entry carries an explicit task marker.

    Accepts a few spellings because the napkin UI and the sync payload have each grown their
    own; anything without one is a note and is left alone.
    """
    if not isinstance(entry, dict):
        return False
    if entry.get("task") is True or entry.get("isTask") is True:
        return True
    kind = str(entry.get("kind") or entry.get("type") or "").strip().lower()
    return kind == "task"

SPEAKING_TAG_RE = re.compile(
    r"\b(speak|speaking|talk|call|phone|present|presentation|pitch|interview|oral)\b",
    re.I,
)

EXPORT_TABLES = (
    "tasks", "calendar_events", "events", "contacts", "ideas", "projects",
    "goals", "notes_lists", "classes", "hours", "agent_bugs", "observations",
)


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def migrate_napkin_complete(conn):
    """Idempotent schema for the remaining napkin pass."""
    task_cols = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "created_by" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN created_by TEXT DEFAULT 'user'")
    if "tags" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN tags TEXT")
    if "deadline_kind" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN deadline_kind TEXT DEFAULT 'indefinite'")
    if "estimate_minutes" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN estimate_minutes INTEGER")
    if "rolled_from" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN rolled_from TEXT")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS recovery_snapshots (
            kind TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS task_time_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            title TEXT,
            estimated_minutes INTEGER,
            actual_minutes INTEGER,
            kind TEXT DEFAULT 'minigame',
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            detail TEXT,
            extra TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_events_slot ON calendar_events(date, start_time, title)"
    )
    try:
        import napkin_remaining
        napkin_remaining.migrate_napkin_remaining(conn)
    except Exception as exc:
        print(f"[napkin_remaining] migrate: {exc}")
    try:
        import napkin_issues
        napkin_issues.migrate_napkin_issues(conn)
    except Exception as exc:
        print(f"[napkin_issues] migrate: {exc}")


def _hhmm_to_minutes(value):
    text = str(value or "").strip()
    if not text or ":" not in text:
        return None
    try:
        hour, minute = text.split(":", 1)
        return int(hour) * 60 + int(minute[:2])
    except (TypeError, ValueError):
        return None


def calendar_conflicts(date_value, start_time=None, end_time=None, title=None, exclude_id=None):
    """Return overlapping and duplicate-slot calendar events for a proposed booking."""
    date_value = str(date_value or "").strip()
    start_time = str(start_time or "").strip() or None
    end_time = str(end_time or "").strip() or None
    title_key = re.sub(r"\s+", " ", (title or "").strip().lower())
    overlaps = []
    duplicates = []
    if not date_value:
        return {"overlaps": overlaps, "duplicates": duplicates}
    start_m = _hhmm_to_minutes(start_time)
    end_m = _hhmm_to_minutes(end_time)
    if start_m is not None and end_m is None:
        end_m = start_m + 60
    for event in db.list_calendar_events(start=date_value, end=date_value):
        if exclude_id is not None and event.get("id") == exclude_id:
            continue
        other_start = str(event.get("start_time") or "").strip() or None
        other_title = re.sub(r"\s+", " ", (event.get("title") or "").strip().lower())
        if title_key and other_title == title_key and (other_start or "") == (start_time or ""):
            duplicates.append(event)
        other_start_m = _hhmm_to_minutes(event.get("start_time"))
        other_end_m = _hhmm_to_minutes(event.get("end_time"))
        if other_start_m is not None and other_end_m is None:
            other_end_m = other_start_m + 60
        if start_m is None or other_start_m is None:
            continue
        if start_m < other_end_m and other_start_m < end_m:
            overlaps.append(event)
    return {"overlaps": overlaps, "duplicates": duplicates}


def ensure_personal_napkin_tasks():
    """Promote personal napkin to-dos into Tasks once, tagged so they stay identifiable."""
    existing = {(t.get("title") or "").strip().lower() for t in db.list_tasks()}
    created = []
    for title in personal_napkin_tasks():
        if title.lower() in existing:
            continue
        task_id = db.insert_task(
            title,
            notes="Promoted from the personal napkin to-do list.",
            urgency="medium",
            deadline_dismissed=True,
            created_by="napkin",
            tags="personal",
            deadline_kind="indefinite",
        )
        created.append(task_id)
    return created


def save_recovery_snapshot(kind, payload):
    kind = (kind or "draft").strip() or "draft"
    conn = db.get_conn()
    conn.execute(
        """INSERT INTO recovery_snapshots (kind, payload, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(kind) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at""",
        (kind, json.dumps(payload, default=str), _now()),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "kind": kind}


def list_recovery_snapshots():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM recovery_snapshots ORDER BY updated_at DESC").fetchall()
    conn.close()
    out = []
    for row in rows:
        item = dict(row)
        try:
            item["payload"] = json.loads(item.get("payload") or "{}")
        except (TypeError, json.JSONDecodeError):
            item["payload"] = {}
        out.append(item)
    return out


def delete_recovery_snapshot(kind):
    conn = db.get_conn()
    conn.execute("DELETE FROM recovery_snapshots WHERE kind = ?", (kind,))
    conn.commit()
    conn.close()
    return {"ok": True}


def rollover_incomplete_tasks(from_date=None):
    """Push unfinished dated tasks to tomorrow. Incomplete stays incomplete."""
    today = from_date or date.today()
    if isinstance(today, str):
        today = date.fromisoformat(today)
    tomorrow = (today + timedelta(days=1)).isoformat()
    today_s = today.isoformat()
    moved = []
    for task in db.list_tasks():
        if task.get("status") in ("done",):
            continue
        due = task.get("due_date")
        if not due or due > today_s:
            continue
        db.update_task(task["id"], due_date=tomorrow, rolled_from=due)
        moved.append(task["id"])
    return {"ok": True, "moved": moved, "count": len(moved), "to": tomorrow}


def reorganise_task_dates(from_date=None):
    """Pack hard-deadline open tasks into upcoming days, leaving indefinite tasks undated."""
    today = from_date or date.today()
    if isinstance(today, str):
        today = date.fromisoformat(today)
    hard = [
        t for t in db.list_tasks()
        if t.get("status") != "done"
        and (t.get("deadline_kind") == "hard" or t.get("due_date"))
        and not t.get("deadline_dismissed")
    ]

    def sort_key(task):
        due = task.get("due_date") or "9999-12-31"
        urgency = {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(task.get("urgency"), 2)
        return (due, urgency, task.get("id") or 0)

    hard.sort(key=sort_key)
    cursor = today
    updated = []
    for task in hard:
        due = task.get("due_date")
        if due and due >= cursor.isoformat():
            cursor = date.fromisoformat(due)
        else:
            db.update_task(task["id"], due_date=cursor.isoformat(), deadline_kind="hard")
            updated.append({"id": task["id"], "due_date": cursor.isoformat()})
        estimate = int(task.get("estimate_minutes") or task.get("progress_total") or 60)
        if estimate >= 240:
            cursor = cursor + timedelta(days=1)
    return {"ok": True, "updated": updated, "count": len(updated)}


def log_task_time(task_id=None, title="", estimated_minutes=None, actual_minutes=None, kind="minigame"):
    conn = db.get_conn()
    cur = conn.execute(
        """INSERT INTO task_time_logs
           (task_id, title, estimated_minutes, actual_minutes, kind, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (task_id, title, estimated_minutes, actual_minutes, kind, _now()),
    )
    conn.commit()
    log_id = cur.lastrowid
    conn.close()
    if task_id and actual_minutes:
        existing = db.get_task(task_id)
        if existing:
            prior = existing.get("estimate_minutes")
            blended = int(actual_minutes) if not prior else int(round((prior + actual_minutes) / 2))
            db.update_task(task_id, estimate_minutes=blended, progress_total=blended, progress_unit="min")
    return {"ok": True, "id": log_id}


def log_ai_failure(kind, detail, extra=None):
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO ai_failures (kind, detail, extra, created_at) VALUES (?, ?, ?, ?)",
        (kind, str(detail or "")[:2000], json.dumps(extra, default=str) if extra is not None else None, _now()),
    )
    conn.commit()
    conn.close()
    try:
        import runtime_errors
        runtime_errors.note(f"ai.{kind}", detail)
    except Exception:
        print(f"[ai_failure] {kind}: {detail}")


def list_ai_failures(limit=40):
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT * FROM ai_failures ORDER BY id DESC LIMIT ?",
        (max(1, min(int(limit or 40), 200)),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def export_everything():
    """Full personal export (no secret settings)."""
    payload = {
        "exported_at": _now(),
        "settings": {
            k: v for k, v in db.get_settings().items()
            if not re.search(r"(secret|password|token|api_key|_key)$", k or "", re.I)
        },
        "tables": {},
    }
    conn = db.get_conn()
    try:
        for table in EXPORT_TABLES:
            try:
                rows = conn.execute(f"SELECT * FROM {table}").fetchall()
            except Exception:
                continue
            payload["tables"][table] = [dict(r) for r in rows]
        hours = conn.execute("SELECT * FROM hours ORDER BY date, hour").fetchall()
        payload["tables"]["hours"] = [dict(r) for r in hours]
    finally:
        conn.close()
    try:
        import napkin_sync
        payload["napkin"] = napkin_sync.read_raw_markdown() if hasattr(napkin_sync, "read_raw_markdown") else None
    except Exception:
        payload["napkin"] = None
    return payload


def parse_bulk_lines(text, kind="task"):
    """Split a pasted list into proposed tasks or events for preview."""
    items = []
    for raw in (text or "").splitlines():
        line = raw.strip().lstrip("-*•").strip()
        if not line or line.startswith("#"):
            continue
        if kind == "event":
            date_m = re.search(r"(\d{4}-\d{2}-\d{2})", line)
            time_m = re.search(r"(\d{1,2}:\d{2})", line)
            title = re.sub(r"\d{4}-\d{2}-\d{2}", "", line)
            title = re.sub(r"\d{1,2}:\d{2}(-\d{1,2}:\d{2})?", "", title).strip(" —,-")
            items.append({
                "title": title or line,
                "date": date_m.group(1) if date_m else None,
                "start_time": time_m.group(1) if time_m else None,
            })
        else:
            items.append({"title": line[:180], "notes": ""})
    return items


def parse_course_schedule(text, end_date=None):
    """Parse weekday + time + name lines into recurring class payloads."""
    weekday_map = {
        "mon": 0, "monday": 0, "tue": 1, "tues": 1, "tuesday": 1,
        "wed": 2, "wednesday": 2, "thu": 3, "thur": 3, "thurs": 3, "thursday": 3,
        "fri": 4, "friday": 4, "sat": 5, "saturday": 5, "sun": 6, "sunday": 6,
    }
    classes = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        weekday = None
        for name, idx in weekday_map.items():
            if re.search(rf"\b{name}\b", lower):
                weekday = idx
                break
        times = re.findall(r"(\d{1,2}:\d{2})", line)
        title = re.sub(r"\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b",
                       "", line, flags=re.I)
        title = re.sub(r"\d{1,2}:\d{2}", "", title)
        title = re.sub(r"[-–—]+", " ", title).strip(" ,")
        if weekday is None or len(times) < 2 or not title:
            continue
        classes.append({
            "name": title[:160],
            "weekday": weekday,
            "start_time": times[0],
            "end_time": times[1],
            "end_date": end_date,
        })
    return classes


def speaking_tasks():
    rows = []
    for task in db.list_tasks():
        tags = (task.get("tags") or "").lower()
        blob = f"{task.get('title') or ''} {task.get('notes') or ''} {task.get('description') or ''} {tags}"
        if "speaking" in tags.split(",") or SPEAKING_TAG_RE.search(blob):
            rows.append(task)
    return rows


def suggest_napkin_title(details):
    text = re.sub(r"\s+", " ", (details or "").strip())
    if not text:
        return ""
    first = text.split(".")[0].strip()
    return first[:80]


def extract_legacy_doc_text(data: bytes) -> str:
    """Best-effort .doc (OLE Word) text extractor without extra deps."""
    if not data:
        return ""
    if data[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        try:
            return data.decode("utf-8", errors="ignore")
        except Exception:
            return data.decode("latin-1", errors="ignore")
    chunks = []
    i = 0
    while i < len(data) - 1:
        if data[i] != 0 and data[i + 1] == 0 and 32 <= data[i] < 127:
            run = []
            while i < len(data) - 1 and data[i + 1] == 0 and 32 <= data[i] < 127:
                run.append(chr(data[i]))
                i += 2
            if len(run) >= 4:
                chunks.append("".join(run))
            continue
        i += 1
    text = "\n".join(chunks)
    if len(text) < 20:
        printable = "".join(chr(b) if 32 <= b < 127 else "\n" if b in (10, 13) else "" for b in data)
        text = re.sub(r"\n{3,}", "\n\n", printable)
    return text.strip()
