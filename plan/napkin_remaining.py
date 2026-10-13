"""Second napkin pass: loot sync, cart, agents, forecast fill, usage, integrations."""
from __future__ import annotations

import json
import math
import random
import re
import threading
import uuid
from datetime import date, datetime, timedelta, timezone

import db

_agent_lock = threading.RLock()
_spawned_agents: dict[str, dict] = {}

WORK_TITLE_RE = re.compile(
    r"\b(class|lecture|seminar|lab|exam|office|work|meeting|shift|homework|hw)\b",
    re.I,
)

MEME_ACHIEVEMENTS = (
    {"id": "first-paint", "title": "I painted a rectangle", "hint": "Paint any hour today", "coins": 12},
    {"id": "pulse-twice", "title": "Feelings merchant", "hint": "Log two pulses in one day", "coins": 18},
    {"id": "zero-formula", "title": "Trust the vibe", "hint": "Open Today after dusk without peeking urgency math", "coins": 9},
    {"id": "napkin-hoarder", "title": "Crumple later, maybe", "hint": "Keep 20 open napkin notes", "coins": 25},
    {"id": "chess-mate", "title": "Local grandmaster (sort of)", "hint": "Win a local chess game", "coins": 40},
    {"id": "solitaire-clear", "title": "Patience is a lootbox", "hint": "Clear a Klondike game", "coins": 35},
    {"id": "go-stone", "title": "One stone at a time", "hint": "Play 20 stones in local Go", "coins": 22},
    {"id": "cart-yes", "title": "Add to cart energy", "hint": "Validate a cart item the agent queued", "coins": 15},
    {"id": "locked-in", "title": "Locked in, actually", "hint": "Paint 10 hours and log a pulse the same day", "coins": 30},
    {"id": "no-data-no-coin", "title": "Honest economy", "hint": "Open the coin ledger with no day metrics logged", "coins": 5},
)


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def migrate_napkin_remaining(conn):
    cal_cols = {row["name"] for row in conn.execute("PRAGMA table_info(calendar_events)").fetchall()}
    if "url" not in cal_cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN url TEXT")
    if "kind" not in cal_cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN kind TEXT DEFAULT 'event'")
    if "lane" not in cal_cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN lane TEXT")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cart_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            created_by TEXT DEFAULT 'user',
            created_at TEXT NOT NULL,
            validated_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS loot_sync (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS meme_achievements (
            id TEXT PRIMARY KEY,
            unlocked_at TEXT NOT NULL,
            coins INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_jobs (
            id TEXT PRIMARY KEY,
            title TEXT,
            prompt TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            result TEXT,
            created_at TEXT NOT NULL,
            finished_at TEXT
        )
        """
    )


def infer_event_kind(title="", class_id=None, kind=None):
    if kind in ("class", "event"):
        return kind
    if class_id:
        return "class"
    if re.search(r"\b(class|lecture|seminar|lab|recitation)\b", title or "", re.I):
        return "class"
    return "event"


def infer_event_lane(title="", category="", lane=None):
    if lane in ("work", "passion"):
        return lane
    blob = f"{title} {category}"
    if WORK_TITLE_RE.search(blob or ""):
        return "work"
    return "passion"


def usage_day_and_month():
    """Token/cost totals for today and the current calendar month."""
    import budget
    today = date.today().isoformat()
    month_prefix = today[:7]
    conn = db.get_conn()
    def _sum(where, param):
        rows = conn.execute(
            """
            SELECT model, SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok
            FROM api_usage WHERE """ + where + """
            GROUP BY model
            """,
            (param,),
        ).fetchall()
        tokens = 0
        cost = 0.0
        by_model = []
        for row in rows:
            in_tok = row["in_tok"] or 0
            out_tok = row["out_tok"] or 0
            tokens += in_tok + out_tok
            piece = budget._model_cost(row["model"], in_tok, out_tok)
            cost += piece
            by_model.append({
                "model": row["model"],
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "estimated_cost_usd": round(piece, 4),
            })
        return {"tokens": tokens, "estimated_cost_usd": round(cost, 4), "by_model": by_model}
    day = _sum("substr(created_at, 1, 10) = ?", today)
    month = _sum("substr(created_at, 1, 7) = ?", month_prefix)
    conn.close()
    return {"today": today, "month": month_prefix, "day": day, "month_total": month}


def interpolate_series(points):
    """Linear-fill gaps in [{date, value}] so Trends can draw the in-between days."""
    cleaned = []
    for item in points or []:
        if not isinstance(item, dict):
            continue
        day = str(item.get("date") or "")[:10]
        if not re.match(r"\d{4}-\d{2}-\d{2}$", day):
            continue
        raw = item.get("value")
        try:
            value = None if raw is None or raw == "" else float(raw)
        except (TypeError, ValueError):
            value = None
        if value is not None and (math.isnan(value) or math.isinf(value)):
            value = None
        cleaned.append({"date": day, "value": value, "observed": value is not None})
    cleaned.sort(key=lambda row: row["date"])
    if len(cleaned) < 2:
        return cleaned
    out = []
    start = date.fromisoformat(cleaned[0]["date"])
    end = date.fromisoformat(cleaned[-1]["date"])
    by_day = {row["date"]: row for row in cleaned}
    known = [row for row in cleaned if row["value"] is not None]
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        if key in by_day and by_day[key]["value"] is not None:
            out.append({"date": key, "value": by_day[key]["value"], "observed": True})
        else:
            prev = next((row for row in reversed(known) if row["date"] < key), None)
            nxt = next((row for row in known if row["date"] > key), None)
            if prev and nxt:
                span = (date.fromisoformat(nxt["date"]) - date.fromisoformat(prev["date"])).days
                step = (cursor - date.fromisoformat(prev["date"])).days
                mix = prev["value"] + (nxt["value"] - prev["value"]) * (step / span)
                out.append({"date": key, "value": round(mix, 4), "observed": False, "interpolated": True})
            elif prev:
                out.append({"date": key, "value": prev["value"], "observed": False, "forward_filled": True})
            elif nxt:
                out.append({"date": key, "value": nxt["value"], "observed": False, "back_filled": True})
        cursor += timedelta(days=1)
    return out


def predict_next_values(series, horizon=7):
    """Simple slope projection from the last observed points — not a trained model."""
    observed = [row for row in (series or []) if row.get("observed") and row.get("value") is not None]
    if len(observed) < 2:
        return []
    last = observed[-min(14, len(observed)):]
    n = len(last)
    xs = list(range(n))
    ys = [row["value"] for row in last]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    slope = 0.0 if denom == 0 else sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    intercept = mean_y - slope * mean_x
    start = date.fromisoformat(last[-1]["date"])
    out = []
    for i in range(1, horizon + 1):
        day = start + timedelta(days=i)
        out.append({
            "date": day.isoformat(),
            "value": round(intercept + slope * (n - 1 + i), 4),
            "predicted": True,
        })
    return out


def happiness_coin_formula(day_row=None, painted_hours=0, played_game=False):
    """Coins from logged day metrics only. No data → no coins. Games add a small bonus."""
    day_row = day_row or {}
    happiness = day_row.get("happiness")
    energy = day_row.get("energy")
    if happiness is None and energy is None and not painted_hours and not played_game:
        return {"coins": 0, "reason": "no_data", "parts": []}
    parts = []
    coins = 0.0
    if happiness is not None:
        h = max(0.0, min(10.0, float(happiness)))
        piece = h * 1.6
        coins += piece
        parts.append({"signal": "happiness", "value": h, "coins": round(piece, 2)})
    if energy is not None:
        e = max(0.0, min(10.0, float(energy)))
        piece = e * 0.8
        coins += piece
        parts.append({"signal": "energy", "value": e, "coins": round(piece, 2)})
    if painted_hours:
        piece = min(24, int(painted_hours)) * 0.45
        coins += piece
        parts.append({"signal": "painted_hours", "value": painted_hours, "coins": round(piece, 2)})
    if played_game:
        coins += 6
        parts.append({"signal": "game", "value": 1, "coins": 6})
    return {"coins": int(round(coins)), "reason": "formula", "parts": parts}


def chest_odds(pity, owned_count=0):
    """Base gacha table. Pity rises slowly; rare stays rare. Low inventory slightly helps."""
    pity = pity or {}
    rare = max(0, int(pity.get("rare") or 0))
    epic = max(0, int(pity.get("epic") or 0))
    legendary = max(0, int(pity.get("legendary") or 0))
    scarcity = max(0.0, 8 - int(owned_count or 0)) * 0.0015
    return {
        "common": round(0.78 - scarcity, 4),
        "rare": round(0.16 + rare * 0.002 + scarcity, 4),
        "epic": round(0.045 + epic * 0.0008, 4),
        "legendary": round(0.015 + legendary * 0.00025, 4),
    }


def roll_chest(rarity="common", pity=None, owned_count=0):
    table = chest_odds(pity, owned_count)
    if rarity in ("epic", "legendary"):
        table["legendary"] = min(0.08, table["legendary"] + 0.01)
        table["epic"] = min(0.18, table["epic"] + 0.03)
    roll = random.random()
    acc = 0.0
    picked = "common"
    for name in ("legendary", "epic", "rare", "common"):
        acc += table[name]
        if roll <= acc:
            picked = name
            break
    return {"rarity": picked, "roll": round(roll, 4), "table": table}


def load_loot_state():
    conn = db.get_conn()
    row = conn.execute("SELECT payload FROM loot_sync WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return None
    try:
        return json.loads(row["payload"])
    except (TypeError, json.JSONDecodeError):
        return None


def save_loot_state(payload):
    blob = json.dumps(payload if isinstance(payload, dict) else {}, default=str)
    conn = db.get_conn()
    conn.execute(
        """
        INSERT INTO loot_sync (id, payload, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
        """,
        (blob, _now()),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "updated_at": _now()}


CLEAN_LOOT_STATE = {
    "version": 4, "unlockedSkins": ["trailblazer"], "activeSkin": "trailblazer",
    "chests": [], "activeOpening": None, "claims": [], "unlocks": [],
    "pins": [], "stamps": [], "charms": [], "titles": [],
    "activeTitle": "", "activeCharm": "", "companionTheme": "", "tickets": 0,
    "pity": {"rare": 0, "epic": 0, "legendary": 0, "world": 0},
    "pieces": {"prism": 0, "moon": 0, "phantom": 0, "royal": 0},
    "pieceCursor": 0, "boosts": {},
}


def reset_loot_state(note=""):
    """Clear the server loot copy and stamp the moment, so clients must re-sync to it.

    Without the stamp a reset cannot hold: merge_loot_state unions chests, claims and
    unlockedSkins, so those arrays only ever grow. A browser posting its old state would
    restore every skin and chest the reset just cleared, and opened chests were never removed
    either, which is why the count kept climbing.
    """
    clean = dict(CLEAN_LOOT_STATE)
    clean["resetAt"] = _now()
    clean["resetNote"] = note
    save_loot_state(clean)
    return clean


def merge_loot_state(incoming):
    current = load_loot_state() or {}
    incoming = incoming if isinstance(incoming, dict) else {}
    reset_at = str(current.get("resetAt") or "")
    ack = str(incoming.get("resetAck") or "")
    if reset_at and ack < reset_at:
        # The client has not acknowledged the reset. Merging its payload would undo the reset
        # outright, so hand back the current state and let it pull and adopt first.
        return current
    merged = {**current, **incoming}
    # `chests` is deliberately NOT unioned. It is a consumable queue, not a permanent
    # collection: opening a cache removes it client-side, but a union can only ever grow, so
    # the server kept every chest ever granted and handed the whole history straight back on
    # the next sync. That is why caches stacked up and why logging in re-awarded the
    # cumulative total. The client that just opened one holds the real queue, so its list wins.
    for key in ("claims", "unlocks", "unlockedSkins"):
        left = current.get(key) or []
        right = incoming.get(key) or []
        if isinstance(left, list) and isinstance(right, list):
            seen = []
            ids = set()
            for item in left + right:
                marker = json.dumps(item, sort_keys=True, default=str) if not isinstance(item, str) else item
                if marker in ids:
                    continue
                ids.add(marker)
                seen.append(item)
            merged[key] = seen
    merged["resetAt"] = reset_at
    save_loot_state(merged)
    return merged


def list_cart(status=None):
    conn = db.get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM cart_items WHERE status = ? ORDER BY id DESC",
            (status,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM cart_items ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_cart_item(title, url="", notes="", created_by="user"):
    title = (title or "").strip()
    if not title:
        return {"error": "title required"}
    conn = db.get_conn()
    cur = conn.execute(
        """
        INSERT INTO cart_items (title, url, notes, status, created_by, created_at)
        VALUES (?, ?, ?, 'queued', ?, ?)
        """,
        (title, (url or "").strip(), (notes or "").strip(), created_by, _now()),
    )
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return {"ok": True, "id": item_id, "title": title, "status": "queued"}


def set_cart_status(item_id, status):
    if status not in ("queued", "validated", "rejected"):
        return {"error": "invalid status"}
    conn = db.get_conn()
    extra = _now() if status == "validated" else None
    conn.execute(
        "UPDATE cart_items SET status = ?, validated_at = COALESCE(?, validated_at) WHERE id = ?",
        (status, extra, item_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "id": item_id, "status": status}


def list_achievements():
    conn = db.get_conn()
    unlocked = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM meme_achievements").fetchall()}
    conn.close()
    out = []
    for item in MEME_ACHIEVEMENTS:
        row = dict(item)
        hit = unlocked.get(item["id"])
        row["unlocked"] = bool(hit)
        row["unlocked_at"] = hit["unlocked_at"] if hit else None
        out.append(row)
    return out


def unlock_achievement(ach_id):
    match = next((item for item in MEME_ACHIEVEMENTS if item["id"] == ach_id), None)
    if not match:
        return {"error": "unknown achievement"}
    conn = db.get_conn()
    existing = conn.execute("SELECT id FROM meme_achievements WHERE id = ?", (ach_id,)).fetchone()
    if existing:
        conn.close()
        return {"ok": True, "already": True, "id": ach_id, "coins": 0}
    conn.execute(
        "INSERT INTO meme_achievements (id, unlocked_at, coins) VALUES (?, ?, ?)",
        (ach_id, _now(), match["coins"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "id": ach_id, "coins": match["coins"], "title": match["title"]}


INTEGRATIONS = (
    {"id": "cursor", "label": "Cursor", "kind": "sdk"},
    {"id": "claude", "label": "Claude", "kind": "sdk"},
    {"id": "chatgpt", "label": "ChatGPT", "kind": "sdk"},
    {"id": "codex", "label": "Codex", "kind": "sdk"},
    {"id": "vscode", "label": "VS Code", "kind": "editor"},
    {"id": "huggingface", "label": "Hugging Face", "kind": "sdk"},
    {"id": "n8n", "label": "n8n", "kind": "automation"},
    {"id": "obsidian", "label": "Obsidian", "kind": "vault"},
)


def list_integrations():
    settings = db.get_settings()
    out = []
    for item in INTEGRATIONS:
        key = f"integration_{item['id']}"
        raw = settings.get(key) or ""
        configured = bool(str(raw).strip())
        if item["id"] == "claude":
            configured = configured or bool(settings.get("anthropic_api_key"))
        if item["id"] == "chatgpt":
            configured = configured or bool(settings.get("openai_api_key"))
        if item["id"] == "obsidian":
            configured = configured or bool(settings.get("obsidian_vault_path"))
        out.append({**item, "configured": configured})
    return out


def save_integration(name, token="", extra=None):
    name = str(name or "").strip().lower()
    if name not in {item["id"] for item in INTEGRATIONS}:
        return {"error": "unknown integration"}
    payload = {"token": (token or "").strip(), **(extra or {})}
    db.save_settings({f"integration_{name}": json.dumps(payload)})
    return {"ok": True, "id": name, "configured": bool(payload.get("token") or extra)}


def list_spawned_agents():
    with _agent_lock:
        live = []
        for job in _spawned_agents.values():
            live.append({k: job[k] for k in ("id", "title", "status", "created_at") if k in job})
        return live


def spawn_agent_job(prompt, title=""):
    prompt = (prompt or "").strip()
    if not prompt:
        return {"error": "prompt required"}
    job_id = uuid.uuid4().hex[:12]
    cancel_event = threading.Event()
    record = {
        "id": job_id,
        "title": (title or prompt[:80]).strip(),
        "prompt": prompt,
        "status": "running",
        "created_at": _now(),
        "result": None,
        "cancel": cancel_event,
    }
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO agent_jobs (id, title, prompt, status, created_at) VALUES (?, ?, ?, 'running', ?)",
        (job_id, record["title"], prompt, record["created_at"]),
    )
    conn.commit()
    conn.close()
    with _agent_lock:
        _spawned_agents[job_id] = record

    def _run():
        text = ""
        status = "done"
        try:
            if cancel_event.is_set():
                status = "stopped"
                text = "Stopped by you."
            else:
                import agent as agent_mod
                result = agent_mod.chat(
                    prompt,
                    tool_policy="auto",
                    cancel_event=cancel_event,
                    background=True,
                )
                if cancel_event.is_set() or (isinstance(result, dict) and result.get("cancelled")):
                    status = "stopped"
                    text = (result.get("reply") if isinstance(result, dict) else None) or "Stopped by you."
                elif isinstance(result, tuple):
                    result = result[0]
                    text = str(result)[:4000]
                elif isinstance(result, dict):
                    text = result.get("text") or result.get("reply") or json.dumps(result, default=str)[:4000]
                else:
                    text = str(result)[:4000]
        except Exception as exc:
            status = "error"
            text = str(exc)
        finished = _now()
        with _agent_lock:
            job = _spawned_agents.get(job_id) or record
            job["status"] = status
            job["result"] = text
            job["finished_at"] = finished
            _spawned_agents[job_id] = job
        conn2 = db.get_conn()
        conn2.execute(
            "UPDATE agent_jobs SET status = ?, result = ?, finished_at = ? WHERE id = ?",
            (status, text, finished, job_id),
        )
        conn2.commit()
        conn2.close()

    thread = threading.Thread(target=_run, name=f"waypoint-agent-{job_id}", daemon=True)
    thread.start()
    with _agent_lock:
        _spawned_agents[job_id]["thread"] = thread
    return {"ok": True, "id": job_id, "status": "running", "title": record["title"]}


def stop_spawned_agent(job_id):
    with _agent_lock:
        job = _spawned_agents.get(job_id)
        if not job:
            return {"error": "unknown agent"}
        cancel = job.get("cancel")
        if cancel is not None:
            cancel.set()
        job["status"] = "stopped"
        job["finished_at"] = _now()
    conn = db.get_conn()
    conn.execute(
        "UPDATE agent_jobs SET status = 'stopped', finished_at = ? WHERE id = ?",
        (_now(), job_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "id": job_id, "status": "stopped"}


def predicted_cost_usd(prompt, history_len=0):
    """Rough preflight: ~4 chars/token, strong route uses a capable model."""
    chars = len(prompt or "") + history_len * 400
    tokens = max(200, chars / 4)
    in_cost = tokens / 1_000_000 * 3.0
    out_cost = 800 / 1_000_000 * 15.0
    return round(in_cost + out_cost, 4)
