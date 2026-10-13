"""Accepted napkin/issues from 2026-09-16–19: bets, prereqs, alarms, recurrence, sync."""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import db

EVENT_UPDATE_FIELDS = (
    "title", "description", "date", "end_date", "start_time", "end_time",
    "all_day", "location", "url", "status",
)


def _now():
    return datetime.now(timezone.utc).isoformat()


def migrate_napkin_issues(conn):
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(calendar_events)").fetchall()}
    if "status" not in cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN status TEXT DEFAULT 'planned'")
    if "rrule" not in cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN rrule TEXT")
    if "series_id" not in cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN series_id TEXT")
    task_cols = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "prerequisite_id" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN prerequisite_id INTEGER")
    if "hard_mode" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN hard_mode INTEGER DEFAULT 0")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS task_bets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            due_date TEXT NOT NULL,
            coins INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL,
            settled_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS alarms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            fire_at TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'math',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS instance_sync (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            role TEXT DEFAULT 'peer',
            last_seen TEXT
        )
        """
    )
    _ensure_instance_sync_columns(conn)
    cats = {row["key"] for row in conn.execute("SELECT key FROM categories").fetchall()} if _has_categories(conn) else set()
    if "travel" not in cats and _has_categories(conn):
        conn.execute(
            "INSERT INTO categories (key, label, color) VALUES (?, ?, ?)",
            ("travel", "Travel", "#111111"),
        )


def _has_categories(conn):
    try:
        conn.execute("SELECT 1 FROM categories LIMIT 1")
        return True
    except Exception:
        return False


def event_is_actionable(event, today=None):
    """Weekly/future events stay hidden until the last two days (or they have started)."""
    today = today or date.today()
    raw = event.get("date") or event.get("start_date")
    if not raw:
        return True
    try:
        start = date.fromisoformat(str(raw)[:10])
    except ValueError:
        return True
    rrule = str(event.get("rrule") or "")
    weekly = "WEEKLY" in rrule.upper() or bool(event.get("weekly"))
    if not weekly:
        return start <= today + timedelta(days=14)
    return start <= today + timedelta(days=2)


def filter_actionable_events(events, today=None):
    return [ev for ev in events if event_is_actionable(ev, today)]


def complete_calendar_event(event_id):
    event = db.get_calendar_event(event_id)
    if not event:
        return {"error": "unknown event"}
    db.update_calendar_event(event_id, status="done")
    return {"ok": True, "id": event_id, "status": "done", "title": event.get("title")}


def safe_update_interest_event(event_id, **fields):
    cleaned = {k: v for k, v in fields.items() if k in EVENT_UPDATE_FIELDS and v is not None}
    if not cleaned:
        return {"error": "no fields to update"}
    if "all_day" in cleaned:
        cleaned["all_day"] = int(bool(cleaned["all_day"]))
    db.update_event(event_id, **cleaned)
    return {"ok": True, "id": event_id, "fields": sorted(cleaned)}


def place_bet(task_id, due_date, coins):
    task = db.get_task(task_id)
    if not task:
        return {"error": "unknown task"}
    coins = max(1, int(coins or 0))
    due = str(due_date or task.get("due_date") or "")
    if not due:
        return {"error": "due_date required"}
    conn = db.get_conn()
    cur = conn.execute(
        "INSERT INTO task_bets (task_id, due_date, coins, status, created_at) VALUES (?, ?, ?, 'open', ?)",
        (task_id, due, coins, _now()),
    )
    conn.commit()
    bet_id = cur.lastrowid
    conn.close()
    missed = (not (task and task.get("status") == "done")) and due < date.today().isoformat()
    return {"ok": True, "id": bet_id, "coins": coins, "due_date": due, "task_id": task_id, "forfeit": missed}


def forfeit_missed_task(task_id, coins=None, today=None):
    """Stake-on-miss path: put money away into the pool when a task's due date has passed."""
    placed = place_bet(task_id, None, coins or 10)
    if placed.get("error"):
        return placed
    settled = settle_bets(today)
    return {**placed, "status": "forfeit", "pool": settled.get("pool") or 0, "settled": settled.get("settled")}


def list_bets(status=None):
    conn = db.get_conn()
    if status:
        rows = conn.execute("SELECT * FROM task_bets WHERE status = ? ORDER BY id DESC", (status,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM task_bets ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def settle_bets(today=None):
    today = (today or date.today()).isoformat() if not isinstance(today, str) else today
    conn = db.get_conn()
    open_rows = [dict(r) for r in conn.execute("SELECT * FROM task_bets WHERE status = 'open'").fetchall()]
    settled = []
    pool = 0
    for bet in open_rows:
        task = db.get_task(bet["task_id"])
        won = bool(task and task.get("status") == "done")
        missed = (not won) and bet["due_date"] < today
        if not won and not missed:
            continue
        status = "won" if won else "forfeit"
        conn.execute(
            "UPDATE task_bets SET status = ?, settled_at = ? WHERE id = ?",
            (status, _now(), bet["id"]),
        )
        if status == "forfeit":
            pool += int(bet["coins"] or 0)
        settled.append({**bet, "status": status})
    conn.commit()
    conn.close()
    return {"ok": True, "settled": settled, "pool": pool}


def set_prerequisite(task_id, prerequisite_id):
    if not db.get_task(task_id):
        return {"error": "unknown task"}
    if prerequisite_id and not db.get_task(prerequisite_id):
        return {"error": "unknown prerequisite"}
    conn = db.get_conn()
    conn.execute("UPDATE tasks SET prerequisite_id = ? WHERE id = ?", (prerequisite_id or None, task_id))
    conn.commit()
    conn.close()
    return {"ok": True, "id": task_id, "prerequisite_id": prerequisite_id}


def task_is_blocked(task):
    pre = task.get("prerequisite_id")
    if not pre:
        return False
    parent = db.get_task(pre)
    return bool(parent and parent.get("status") != "done")


def add_recurring_event(title, start_date, start_time, end_time, weekday, weeks=8, **extra):
    """Materialize a weekly event for `weeks` occurrences. Stops at extra end_date if given.

    Without an explicit term end, never invent more than 16 weeks of classes (the overshoot that
    left Tue/Wed/Thu/Fri rows sitting in January after the semester ended).
    """
    title = (title or "").strip()
    if not title or not start_date:
        return {"error": "title and start_date required"}
    start = date.fromisoformat(str(start_date)[:10])
    weeks_n = max(1, int(weeks or 8))
    cap = extra.get("end_date")
    if cap:
        cap_date = date.fromisoformat(str(cap)[:10])
    else:
        weeks_n = min(weeks_n, 16)
        cap_date = start + timedelta(days=7 * (weeks_n - 1))
    series = f"wk-{start.isoformat()}-{title[:12]}"
    created = []
    skipped = 0
    for i in range(weeks_n):
        day = start + timedelta(days=7 * i)
        if cap_date and day > cap_date:
            break
        existing = None
        if hasattr(db, "find_similar_calendar_slot"):
            existing = db.find_similar_calendar_slot(title, day.isoformat(), start_time or "09:00")
        eid = db.insert_calendar_event(
            title, day.isoformat(), start_time or "09:00", end_time or "10:00",
            extra.get("category"), extra.get("notes"),
        )
        if existing and eid == existing.get("id"):
            skipped += 1
        try:
            db.update_calendar_event(eid, rrule="FREQ=WEEKLY", series_id=series, kind=extra.get("kind") or "event")
        except Exception:
            pass
        created.append(eid)
    return {
        "ok": True,
        "ids": created,
        "series_id": series,
        "count": len(created),
        "end_date": cap_date.isoformat() if cap_date else None,
        "skipped_duplicates": skipped,
    }


def list_alarms():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM alarms WHERE enabled = 1 ORDER BY fire_at").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_alarm(title, fire_at, kind="math"):
    kind = kind if kind in ("math", "memory") else "math"
    if not title or not fire_at:
        return {"error": "title and fire_at required"}
    conn = db.get_conn()
    cur = conn.execute(
        "INSERT INTO alarms (title, fire_at, kind, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
        (title, fire_at, kind, _now()),
    )
    conn.commit()
    alarm_id = cur.lastrowid
    conn.close()
    return {"ok": True, "id": alarm_id, "kind": kind}


def due_alarms(now=None):
    now = now or _now()
    return [a for a in list_alarms() if str(a.get("fire_at") or "") <= now]


def _ensure_instance_sync_columns(conn):
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(instance_sync)").fetchall()}
    if "role" not in cols:
        conn.execute("ALTER TABLE instance_sync ADD COLUMN role TEXT DEFAULT 'peer'")
    if "last_seen" not in cols:
        conn.execute("ALTER TABLE instance_sync ADD COLUMN last_seen TEXT")


def _normalize_sync_role(role):
    raw = str(role or "peer").strip().lower()
    return "server" if raw in ("server", "1", "true", "yes", "on") else "peer"


def _is_unusable_bind_host(host):
    text = str(host or "").strip().lower()
    if not text or text in ("*", "::", "[::]", "tailscale", "tailnet"):
        return True
    parts = text.split(".")
    return len(parts) == 4 and parts == ["0", "0", "0", "0"]


def advertised_bind_host():
    """Host another instance should open. Loopback if Tailscale is not up; never a wildcard."""
    host = (os.environ.get("FLASK_HOST") or "").strip()
    if not _is_unusable_bind_host(host):
        return host
    try:
        import tailscale_net
        ip = tailscale_net.tailscale_ipv4()
        if ip and not _is_unusable_bind_host(ip):
            return ip
    except Exception:
        pass
    return "127.0.0.1"


def union_rows_by_id(*groups):
    """Additive union keyed by id. First occurrence wins — never wipe an existing row."""
    by_id = {}
    extras = []
    for group in groups:
        for row in group or []:
            if not isinstance(row, dict):
                continue
            rid = row.get("id")
            if rid is None or rid == "":
                extras.append(row)
                continue
            key = str(rid)
            if key not in by_id:
                by_id[key] = row
    return list(by_id.values()) + extras


def _row_id_key(row):
    if not isinstance(row, dict) or row.get("id") is None or row.get("id") == "":
        return None
    return str(row.get("id"))


def _existing_ids(rows):
    return {key for key in (_row_id_key(row) for row in rows or []) if key}


def _is_planner_bundle(payload):
    if not isinstance(payload, dict):
        return False
    if payload.get("kind") == "planner-bundle":
        return True
    return any(payload.get(key) for key in ("tasks", "calendar", "events", "napkins", "bets"))


def _list_napkins():
    try:
        import napkin_sync
        state = napkin_sync._read_state()
        return list(state.get("entries") or [])
    except Exception:
        return []


def _union_snapshot_payloads(existing, incoming):
    existing = existing if isinstance(existing, dict) else {}
    incoming = incoming if isinstance(incoming, dict) else {}
    if not _is_planner_bundle(incoming):
        return existing or incoming
    merged = {**existing, **incoming, "kind": "planner-bundle"}
    for key in ("tasks", "calendar", "events", "napkins", "bets", "activity"):
        if existing.get(key) or incoming.get(key):
            merged[key] = union_rows_by_id(existing.get(key), incoming.get(key))
    return merged


def _decode_sync_row(row):
    data = dict(row) if row else {"payload": {}, "role": "peer"}
    try:
        data["payload"] = json.loads(data.get("payload") or "{}")
    except json.JSONDecodeError:
        data["payload"] = {}
    data["role"] = _normalize_sync_role(data.get("role"))
    data["bind_host"] = advertised_bind_host()
    data["last_seen"] = data.get("last_seen") or data.get("updated_at")
    return data


def save_sync_snapshot(payload, role="peer"):
    role = _normalize_sync_role(role)
    now = _now()
    incoming = payload if isinstance(payload, dict) else {}
    conn = db.get_conn()
    try:
        _ensure_instance_sync_columns(conn)
        row = conn.execute("SELECT * FROM instance_sync WHERE id = 1").fetchone()
        existing_payload = {}
        if row:
            try:
                existing_payload = json.loads(dict(row).get("payload") or "{}")
            except json.JSONDecodeError:
                existing_payload = {}
        if _is_planner_bundle(incoming):
            merged = _union_snapshot_payloads(existing_payload, incoming)
            blob = json.dumps(merged, default=str)
            conn.execute(
                """
                INSERT INTO instance_sync (id, payload, updated_at, role, last_seen)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at,
                    role = excluded.role,
                    last_seen = excluded.last_seen
                """,
                (blob, now, role, now),
            )
            updated_at = now
        else:
            blob = json.dumps(existing_payload if existing_payload else incoming, default=str)
            existing_updated = dict(row).get("updated_at") if row else now
            conn.execute(
                """
                INSERT INTO instance_sync (id, payload, updated_at, role, last_seen)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    role = excluded.role,
                    last_seen = excluded.last_seen
                """,
                (blob, existing_updated or now, role, now),
            )
            updated_at = existing_updated or now
        conn.commit()
    finally:
        conn.close()
    return {
        "ok": True,
        "updated_at": updated_at,
        "last_seen": now,
        "role": role,
        "bind_host": advertised_bind_host(),
    }


def set_sync_role(role):
    """Mark this machine as server or peer without wiping the stored snapshot."""
    return save_sync_snapshot({}, role=role)


def load_sync_snapshot():
    conn = db.get_conn()
    try:
        _ensure_instance_sync_columns(conn)
        row = conn.execute("SELECT * FROM instance_sync WHERE id = 1").fetchone()
    finally:
        conn.close()
    if not row:
        return {
            "payload": {},
            "role": "peer",
            "bind_host": advertised_bind_host(),
            "last_seen": None,
            "updated_at": None,
        }
    return _decode_sync_row(row)


def planner_sync_bundle():
    """Compact planner snapshot another instance can merge."""
    today = date.today().isoformat()
    settings = db.get_settings() if hasattr(db, "get_settings") else {}
    profile = settings.get("user_profile") if isinstance(settings, dict) else None
    calendar = db.list_calendar_events() if hasattr(db, "list_calendar_events") else []
    events = db.list_events()[:400] if hasattr(db, "list_events") else []
    activity = db.list_activity(limit=400) if hasattr(db, "list_activity") else []
    return {
        "date": today,
        "kind": "planner-bundle",
        "tasks": db.list_tasks()[:400],
        "calendar": calendar[:800],
        "events": events,
        "napkins": _list_napkins(),
        "bets": list_bets(),
        "profile": profile,
        "activity": activity,
    }


def _task_title_key(title):
    return db.normalize_event_title(title) if hasattr(db, "normalize_event_title") else str(title or "").strip().lower()


def apply_sync_snapshot(payload, role="peer"):
    """Merge a planner bundle from another instance. Additive union by id: never wipe local rows."""
    payload = payload if isinstance(payload, dict) else {}
    role = _normalize_sync_role(role)
    created_tasks = 0
    created_events = 0
    created_napkins = 0
    skipped = 0
    local_tasks = db.list_tasks() if hasattr(db, "list_tasks") else []
    local_task_ids = _existing_ids(local_tasks)
    existing_titles = {_task_title_key(t.get("title")) for t in local_tasks}
    for task in payload.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        title = (task.get("title") or "").strip()
        if not title:
            continue
        tid = _row_id_key(task)
        if tid and tid in local_task_ids:
            skipped += 1
            continue
        key = _task_title_key(title)
        if key in existing_titles or any(
            db.titles_are_similar(title, t) for t in existing_titles
        ):
            skipped += 1
            continue
        due = task.get("due_date") or None
        new_id = db.insert_task(
            title,
            notes=task.get("notes") or "",
            urgency=task.get("urgency") or "medium",
            due_date=due,
            deadline_dismissed=not due,
            category=task.get("category"),
            created_by="sync",
        )
        existing_titles.add(key)
        local_task_ids.add(str(new_id))
        created_tasks += 1
    local_cal = db.list_calendar_events() if hasattr(db, "list_calendar_events") else []
    local_cal_ids = _existing_ids(local_cal)
    for event in payload.get("calendar") or []:
        if not isinstance(event, dict):
            continue
        title = (event.get("title") or "").strip()
        day = str(event.get("date") or "")[:10]
        if not title or not day:
            continue
        eid = _row_id_key(event)
        if eid and eid in local_cal_ids:
            skipped += 1
            continue
        start = event.get("start_time")
        if hasattr(db, "find_similar_calendar_slot") and db.find_similar_calendar_slot(title, day, start):
            skipped += 1
            continue
        new_id = db.insert_calendar_event(
            title, day, start, event.get("end_time"),
            event.get("category"), event.get("notes"),
            class_id=event.get("class_id"),
            url=event.get("url"),
            kind=event.get("kind"),
            lane=event.get("lane"),
        )
        local_cal_ids.add(str(new_id))
        created_events += 1
    local_events = db.list_events() if hasattr(db, "list_events") else []
    local_event_ids = _existing_ids(local_events)
    existing_event_keys = {
        (_task_title_key(ev.get("title")), str(ev.get("date") or "")[:10])
        for ev in local_events
    }
    for event in payload.get("events") or []:
        if not isinstance(event, dict):
            continue
        title = (event.get("title") or "").strip()
        day = str(event.get("date") or "")[:10]
        if not title or not day:
            continue
        eid = _row_id_key(event)
        if eid and eid in local_event_ids:
            skipped += 1
            continue
        key = (_task_title_key(title), day)
        if key in existing_event_keys:
            skipped += 1
            continue
        if hasattr(db, "insert_event"):
            new_id = db.insert_event(
                title,
                event.get("description") or "",
                day,
                event.get("location"),
                event.get("url"),
                event.get("source") or "sync",
                status=event.get("status") or "suggested",
                end_date=event.get("end_date"),
                start_time=event.get("start_time"),
                end_time=event.get("end_time"),
                all_day=event.get("all_day"),
            )
            local_event_ids.add(str(new_id))
            existing_event_keys.add(key)
            created_events += 1
            continue
        start = event.get("start_time")
        if hasattr(db, "find_similar_calendar_slot") and db.find_similar_calendar_slot(title, day, start):
            skipped += 1
            continue
        new_id = db.insert_calendar_event(
            title, day, start, event.get("end_time"),
            event.get("category"), event.get("notes"),
            class_id=event.get("class_id"),
            url=event.get("url"),
            kind=event.get("kind"),
            lane=event.get("lane"),
        )
        created_events += 1
        local_cal_ids.add(str(new_id))
    napkins = [row for row in (payload.get("napkins") or []) if isinstance(row, dict) and row.get("id")]
    if napkins:
        try:
            import napkin_sync
            before = {str(entry.get("id")) for entry in (_list_napkins())}
            merged = napkin_sync.sync(napkins)
            after = {str(entry.get("id")) for entry in merged}
            created_napkins = len(after - before)
            skipped += max(0, len(napkins) - created_napkins)
        except Exception:
            skipped += len(napkins)
    if payload.get("profile") and hasattr(db, "save_settings"):
        current = (db.get_settings() or {}).get("user_profile") or ""
        incoming = str(payload.get("profile") or "").strip()
        if incoming and incoming not in current:
            merged_profile = (current + ("\n\n" if current else "") + incoming).strip()
            db.save_settings({"user_profile": merged_profile[:20000]})
    saved = save_sync_snapshot(payload, role=role)
    return {
        "ok": True,
        "role": role,
        "created_tasks": created_tasks,
        "created_events": created_events,
        "created_napkins": created_napkins,
        "skipped": skipped,
        "last_seen": saved.get("last_seen"),
        "updated_at": saved.get("updated_at"),
        "bind_host": saved.get("bind_host") or advertised_bind_host(),
    }


def push_instance_sync(role="server"):
    bundle = planner_sync_bundle()
    saved = save_sync_snapshot(bundle, role=role)
    return {**saved, "ok": True, "pushed": True, "counts": {
        "tasks": len(bundle.get("tasks") or []),
        "calendar": len(bundle.get("calendar") or []),
        "events": len(bundle.get("events") or []),
        "napkins": len(bundle.get("napkins") or []),
    }}


def pull_instance_sync():
    snap = load_sync_snapshot()
    applied = apply_sync_snapshot(snap.get("payload") or {}, role=snap.get("role") or "peer")
    return {**snap, **applied, "pulled": True}


def loot_quiet_mode():
    """Fewer caches: one daily at most, no ticket-window spam."""
    return {"max_daily_chests": 1, "hide_ticket_window": True, "road_chest_every": 3}
