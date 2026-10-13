"""Parallel — AI-GM'd parallel-life roleplay engine.

One in-world day equals one IRL day. World state lives in the DB (not chat history).
Canon is grounded in the Obsidian World Bible; practice points from the main app
translate into bounded off-screen outcomes.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import struct
import threading
import zlib
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import ai
import db
import personal_data

_PLAN_DIR = Path(__file__).parent
_DATA_DIR = Path(os.environ["WAYPOINT_DATA_DIR"]) if os.environ.get("WAYPOINT_DATA_DIR") else _PLAN_DIR
SEED_PATH = _PLAN_DIR / "game_seed.json"
# The vault lives in WAYPOINT_DATA_DIR since personal content left the checkout; reading
# plan/obsidian_vault silently found nothing, so the game ran with no canon at all.
WORLD_BIBLE_PATH = personal_data.vault_path() / "World Bible.md"
IMAGE_CACHE_DIR = _DATA_DIR / "parallel_images"
SCENES_DIR = IMAGE_CACHE_DIR / "scenes"
PORTRAITS_DIR = IMAGE_CACHE_DIR / "portraits"
ITEMS_DIR = IMAGE_CACHE_DIR / "items"
LEGACY_STATIC = _PLAN_DIR / "static"
WORLD_MAP_PATH = SCENES_DIR / "world-map.png"
SCENE_STYLE = "moody painted concept art, muted palette, cinematic lighting, no text"
PORTRAIT_STYLE = (
    "painted fantasy character portrait, expressive face, 3/4 view, "
    "dramatic rim light, parchment UI compatible, no text, no watermark"
)
ITEM_STYLE = (
    "painted fantasy inventory icon, centered object on dark parchment, "
    "clear silhouette, subtle rim light, no text, no watermark"
)
MAP_STYLE = (
    "top-down fantasy parchment map, readable regions, roads, coastlines, "
    "landmarks, blank label spaces, no text, no watermark"
)
SCENES_DAILY_CAP = 24
BUSY_STALE_SECONDS = 180
MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024

_world_bible_cache = None
_DAYS_PER_MONTH = 30
_MONTHS_PER_YEAR = 12
_PREGEN_LOCK = threading.Lock()
_PREGEN_THREAD = None
_PREGEN_PROGRESS = {
    "running": False,
    "done": 0,
    "total": 0,
    "generated": 0,
    "skipped": 0,
    "failed": 0,
    "message": "",
}


def _today_iso():
    return date.today().isoformat()


def _deep_merge(base, updates):
    if not isinstance(updates, dict):
        return base
    result = deepcopy(base) if isinstance(base, dict) else {}
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def _parse_world_date_to_day_index(world_date):
    """Map a seed world_date string to a deterministic day index for calendar math."""
    if not world_date:
        return 0
    text = str(world_date).strip()
    iso_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", text)
    if iso_match:
        y, m, d = (int(iso_match.group(i)) for i in range(1, 4))
        return (y - 1) * _DAYS_PER_MONTH * _MONTHS_PER_YEAR + (m - 1) * _DAYS_PER_MONTH + (d - 1)
    day_match = re.search(r"day\s+(\d+)", text, re.I)
    month_match = re.search(r"month\s+(?:of\s+)?(\w+|\d+)", text, re.I)
    year_match = re.search(r"year\s+(\d+)", text, re.I)
    day_n = int(day_match.group(1)) if day_match else 1
    month_n = 1
    if month_match:
        token = month_match.group(1)
        month_n = int(token) if token.isdigit() else (sum(ord(c) for c in token.lower()) % _MONTHS_PER_YEAR) + 1
    year_n = int(year_match.group(1)) if year_match else 1
    return (year_n - 1) * _DAYS_PER_MONTH * _MONTHS_PER_YEAR + (month_n - 1) * _DAYS_PER_MONTH + (day_n - 1)


def _day_index_to_world_date(day_index, seed_world_date):
    """Format a day index back into a human-readable world date."""
    text = str(seed_world_date or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        base = date.fromisoformat(text)
        current = base + timedelta(days=day_index - _parse_world_date_to_day_index(text))
        return current.isoformat()
    day_index = max(0, int(day_index))
    year = day_index // (_DAYS_PER_MONTH * _MONTHS_PER_YEAR) + 1
    rem = day_index % (_DAYS_PER_MONTH * _MONTHS_PER_YEAR)
    month = rem // _DAYS_PER_MONTH + 1
    day = rem % _DAYS_PER_MONTH + 1
    if re.search(r"day\s+\d+", text, re.I):
        return re.sub(r"day\s+\d+", f"Day {day}", text, count=1, flags=re.I)
    return f"Year {year}, Month {month}, Day {day}"


def current_world_date(state):
    if not state:
        return None
    meta = state.get("_meta") or {}
    seed_date = state.get("world_date") or meta.get("seed_world_date") or "Year 1, Month 1, Day 1"
    anchor = meta.get("irl_anchor") or _today_iso()
    elapsed = (date.fromisoformat(_today_iso()) - date.fromisoformat(anchor)).days
    base_index = meta.get("world_day_index")
    if base_index is None:
        base_index = _parse_world_date_to_day_index(seed_date)
    return _day_index_to_world_date(base_index + elapsed, seed_date)


def _world_bible_excerpt():
    global _world_bible_cache
    if _world_bible_cache is not None:
        return _world_bible_cache
    if not WORLD_BIBLE_PATH.is_file():
        _world_bible_cache = ""
        return _world_bible_cache
    text = WORLD_BIBLE_PATH.read_text(encoding="utf-8", errors="ignore")
    parts = [text[:4000]]
    canon_match = re.search(
        r"(#+\s*Canon Rules for the GM[\s\S]*)",
        text,
        re.I,
    )
    if canon_match and canon_match.group(1) not in parts[0]:
        parts.append(canon_match.group(1)[:4000])
    _world_bible_cache = "\n\n---\n\n".join(parts)
    return _world_bible_cache


def _canon_rules_text():
    if not WORLD_BIBLE_PATH.is_file():
        return ""
    text = WORLD_BIBLE_PATH.read_text(encoding="utf-8", errors="ignore")
    match = re.search(r"^(#+)\s*(?:\d+\.\s*)?Canon Rules for the GM\s*$", text, re.I | re.M)
    if not match:
        return ""
    level = len(match.group(1))
    next_heading = re.search(rf"^#{{1,{level}}}\s+", text[match.end():], re.M)
    end = match.end() + next_heading.start() if next_heading else len(text)
    return text[match.start():end].strip()


def rules_summary():
    state = db.rp_get_state() or {}
    threads = state.get("threads") or state.get("open_threads") or []
    if isinstance(threads, list):
        active_threads_count = len([t for t in threads if isinstance(t, dict)])
    else:
        active_threads_count = 0
    if not active_threads_count:
        quests = state.get("quests") or {}
        active = quests.get("active") if isinstance(quests, dict) else []
        if isinstance(active, list):
            active_threads_count = len([q for q in active if isinstance(q, dict)])
    return {
        "rules_text": _player_facing_rules_text(state),
        "world_date": current_world_date(state) if state else None,
        "active_threads_count": active_threads_count,
    }


def _gm_charter():
    bible = _world_bible_excerpt()
    bible_block = bible if bible else "(World Bible not yet written — infer cautiously from state only.)"
    return f"""You are the Game Master for Parallel, a brutally-fair parallel-life roleplay.

Rules you must obey:
- Causality is real: actions have proportionate consequences, never plot armor.
- NPCs act from their own motives; they are not vending machines for the player.
- World consistency is sacred — if it is not in state or canon, it does not exist until earned.
- Teach-to-advance: when the player attempts advancement or claims capability, pose a real
  concept check drawn from physics, electrical engineering, chemistry, or business as appropriate
  to a hardware-founder and student life. Adjudicate honestly; partial credit only for partial understanding.
- Permanent consequences: failures, burns, and missed deadlines stick unless legitimately repaired in-world.
- No windfalls: practice and luck yield modest, plausible gains only.
- Never narrate facts the player has not earned; keep secrets secret until revealed in play.
  Player only learns what they perceive.

Canon excerpt (World Bible):
{bible_block}
"""


def _parse_choices_from_reply(text):
    """Pull 2-4 suggested actions from explicit bullet/numbered lists at the end of GM prose."""
    if not text:
        return []
    lines = str(text).strip().splitlines()
    choices = []
    for line in reversed(lines[-10:]):
        stripped = line.strip()
        if not stripped:
            if choices:
                break
            continue
        match = re.match(r"^(?:[-•*]|\d+[.)])\s+(.+)$", stripped)
        if match:
            choice = match.group(1).strip()
            if choice:
                choices.insert(0, choice)
            continue
        if choices:
            break
    return choices[:4] if len(choices) >= 2 else []


def _stakes_line(state):
    """One honest line of current pressure: wounds, urgent thread, location."""
    if not state:
        return None
    player = state.get("player") or {}
    parts = []
    wounds = player.get("wounds") or []
    if isinstance(wounds, list) and wounds:
        wound_text = ", ".join(str(w) for w in wounds[:2])
        if len(wounds) > 2:
            wound_text += f" (+{len(wounds) - 2})"
        parts.append(f"Wounds: {wound_text}")
    elif isinstance(wounds, str) and wounds.strip():
        parts.append(f"Condition: {wounds.strip()}")
    threads = _open_threads(state, 1)
    if threads:
        title = (threads[0].get("title") or threads[0].get("summary") or "").strip()
        if title:
            parts.append(f"Pressure: {title[:80]}")
    loc = (player.get("location") or "").replace("_", " ").strip()
    if loc and not threads:
        parts.append(f"At: {loc[:60]}")
    return " · ".join(parts) if parts else None


def _open_threads(state, limit=8):
    threads = state.get("threads") or state.get("open_threads") or []
    if not isinstance(threads, list):
        return []
    urgent = [t for t in threads if isinstance(t, dict)]
    urgent.sort(key=lambda t: {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(
        str(t.get("urgency", "medium")).lower(), 2
    ))
    return urgent[:limit]


def _synthesize_appearance(name="", role="", status="", stage=""):
    """Short visual sheet from public fields — never includes secrets."""
    parts = []
    if name:
        parts.append(str(name).strip())
    if role:
        parts.append(str(role).replace("_", " ").strip())
    if status:
        parts.append(str(status).replace("_", " ").strip())
    if stage:
        parts.append(str(stage).replace("_", " ").strip()[:80])
    text = ". ".join(p for p in parts if p)
    return text[:240] if text else "indistinct figure"


def _ensure_entity_appearance(entity, *, stage=""):
    if not isinstance(entity, dict):
        return ""
    appearance = (entity.get("appearance") or "").strip()
    if appearance:
        return appearance
    synthesized = _synthesize_appearance(
        entity.get("name", ""),
        entity.get("role") or entity.get("archetype", ""),
        entity.get("status") or entity.get("wounds", ""),
        stage or entity.get("stage", ""),
    )
    entity["appearance"] = synthesized
    return synthesized


def _mc_character_id(state):
    player = (state or {}).get("player") or {}
    for ch in (state or {}).get("characters") or []:
        if isinstance(ch, dict) and ch.get("disposition_to_player") == "self":
            return ch.get("id") or "mc"
    return "mc"


def _get_appearance(state, character_id):
    if not state:
        return ""
    player = state.get("player") or {}
    mc_id = _mc_character_id(state)
    if character_id in ("mc", "player") or character_id == mc_id or character_id == player.get("name"):
        return _ensure_entity_appearance(player, stage=player.get("stage", ""))
    for ch in state.get("characters") or []:
        if isinstance(ch, dict) and ch.get("id") == character_id:
            return _ensure_entity_appearance(ch)
    return ""


def _characters_in_scene(state, gm_content=""):
    """MC plus NPCs at player location or mentioned in scene text."""
    if not state:
        return []
    player = state.get("player") or {}
    player_loc = (player.get("location") or "").strip()
    text = (gm_content or "").lower()
    seen = set()
    result = []

    def _add(ch):
        if not isinstance(ch, dict):
            return
        cid = ch.get("id") or ch.get("name")
        if not cid or cid in seen:
            return
        seen.add(cid)
        result.append(ch)

    mc_id = _mc_character_id(state)
    for ch in state.get("characters") or []:
        if isinstance(ch, dict) and ch.get("id") == mc_id:
            _add(ch)
            break
    if not any(ch.get("id") == mc_id for ch in result if isinstance(ch, dict)):
        _add({"id": mc_id, "name": player.get("name", "MC"), "role": "player_character"})

    for ch in state.get("characters") or []:
        if not isinstance(ch, dict):
            continue
        cid = ch.get("id", "")
        if ch.get("disposition_to_player") == "self":
            continue
        loc = (ch.get("location") or "").strip()
        name = (ch.get("name") or "").strip()
        if loc and player_loc and loc == player_loc:
            _add(ch)
            continue
        if name and name.lower() in text:
            _add(ch)
            continue
        if cid and cid.replace("_", " ") in text:
            _add(ch)
    return result


def chrome_party(state, gm_content=""):
    """HUD party plate from characters already in the scene. Passes names through; adds no lore."""
    party = []
    player_loc = ((state or {}).get("player") or {}).get("location")
    for ch in _characters_in_scene(state, gm_content):
        facing = _player_facing_character(ch)
        facing["location"] = ch.get("location") or player_loc
        party.append(facing)
    return party


def chrome_shop_stalls(state):
    """Shop chrome: known map places as stalls, existing inventory as wares. No new plot copy."""
    state = state or {}
    game_map = _filter_map_for_player(state.get("map") or {})
    player = state.get("player") or {}
    inventory = _carried_inventory(player.get("inventory") or state.get("inventory") or [])
    stalls = []
    for loc in game_map.get("locations") or []:
        if not isinstance(loc, dict):
            continue
        loc_id = loc.get("id") or ""
        loc_name = loc.get("name") or loc_id
        loc_key = str(loc_name or "").strip().lower()
        loc_id_key = str(loc_id or "").strip().lower()
        wares = []
        for item in inventory:
            origin = str(item.get("origin") or "").strip().lower()
            if origin and origin in (loc_key, loc_id_key):
                wares.append(item)
        stalls.append({
            "id": loc_id,
            "name": loc_name,
            "description": loc.get("description") or "",
            "wares": wares,
            "current": loc_id == game_map.get("current_location_id"),
        })
    return stalls


def _inventory_by_id(items):
    by_id = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or item.get("name", "")
        if not item_id:
            continue
        by_id[item_id] = item
    return by_id


def _carried_inventory(items):
    carried = []
    for item in _normalize_inventory_items(items):
        if str(item.get("status", "carried")).lower() != "carried":
            continue
        carried.append(item)
    return carried


def _infer_removal_action(note_text, gm_reply=""):
    text = f"{note_text or ''} {gm_reply or ''}".lower()
    if any(w in text for w in (
        "drop", "dropped", "drops", "discard", "discarded", "left behind",
        "leave behind", "abandoned", "set down", "tossed", "toss ",
    )):
        return "dropped"
    if any(w in text for w in ("eat", "ate", "drank", "consumed", "used up", "spent", "burned")):
        return "consumed"
    if any(w in text for w in ("used", "applied", "activated", "fired", "cast")):
        return "used"
    return "lost"


def _append_inventory_log(state, entry):
    log = state.setdefault("inventory_log", [])
    if not isinstance(log, list):
        log = []
        state["inventory_log"] = log
    log.append(entry)
    if len(log) > 200:
        state["inventory_log"] = log[-200:]


def _reconcile_inventory(state, prev_inventory, gm_reply, world_date, inventory_delta=None):
    """Compare before/after inventories and append ledger events."""
    player = state.setdefault("player", {})
    current = _carried_inventory(player.get("inventory") or state.get("inventory") or [])
    player["inventory"] = current
    state["inventory"] = list(current)

    prev_by_id = _inventory_by_id(_carried_inventory(prev_inventory))
    curr_by_id = _inventory_by_id(current)
    location = player.get("location")
    delta_by_id = {}
    if isinstance(inventory_delta, list):
        for d in inventory_delta:
            if not isinstance(d, dict):
                continue
            iid = d.get("item_id") or d.get("id")
            if iid:
                delta_by_id[iid] = d

    all_ids = set(prev_by_id) | set(curr_by_id) | set(delta_by_id)
    for item_id in all_ids:
        prev_item = prev_by_id.get(item_id, {})
        curr_item = curr_by_id.get(item_id, {})
        prev_qty = int(prev_item.get("qty", 0) or 0)
        curr_qty = int(curr_item.get("qty", 0) or 0)
        name = curr_item.get("name") or prev_item.get("name") or item_id
        delta = delta_by_id.get(item_id, {})

        if curr_qty > prev_qty:
            _append_inventory_log(state, {
                "at": _now_iso(),
                "world_date": world_date,
                "item_id": item_id,
                "name": name,
                "action": delta.get("action") or "gained",
                "note": delta.get("note", ""),
                "location": location,
                "qty": curr_qty - prev_qty,
            })
        elif curr_qty < prev_qty:
            action = delta.get("action") or _infer_removal_action(delta.get("note", ""), gm_reply)
            _append_inventory_log(state, {
                "at": _now_iso(),
                "world_date": world_date,
                "item_id": item_id,
                "name": name,
                "action": action,
                "note": delta.get("note", ""),
                "location": location,
                "qty": prev_qty - curr_qty,
            })
        elif item_id not in curr_by_id and item_id in prev_by_id:
            action = delta.get("action") or _infer_removal_action(delta.get("note", ""), gm_reply)
            _append_inventory_log(state, {
                "at": _now_iso(),
                "world_date": world_date,
                "item_id": item_id,
                "name": name,
                "action": action,
                "note": delta.get("note", ""),
                "location": location,
                "qty": prev_qty,
            })


def _lost_items_from_log(state, current_inventory):
    carried_ids = {item.get("id") for item in _carried_inventory(current_inventory)}
    seen = set()
    lost = []
    for entry in reversed(state.get("inventory_log") or []):
        if not isinstance(entry, dict):
            continue
        action = str(entry.get("action", "")).lower()
        if action not in ("dropped", "lost", "consumed", "used"):
            continue
        item_id = entry.get("item_id")
        if not item_id or item_id in carried_ids or item_id in seen:
            continue
        seen.add(item_id)
        lost.append({
            "id": item_id,
            "name": entry.get("name", item_id),
            "last_action": action,
            "world_date": entry.get("world_date"),
            "note": entry.get("note", ""),
        })
    return lost


def _migrate_equipment_to_inventory(player):
    if _carried_inventory(player.get("inventory")):
        return False
    resources = player.get("resources") or {}
    items = []
    for eq in resources.get("equipment") or []:
        eq_id = str(eq)
        items.append({
            "id": eq_id,
            "name": eq_id.replace("_", " "),
            "qty": 1,
            "rarity": "common",
            "effect": "",
            "origin": "starting_equipment",
            "status": "carried",
        })
    for sup in resources.get("supplies") or []:
        sup_id = str(sup)
        items.append({
            "id": sup_id,
            "name": sup_id.replace("_", " "),
            "qty": 1,
            "rarity": "common",
            "effect": "",
            "origin": "starting_supplies",
            "status": "carried",
        })
    if items:
        player["inventory"] = items
        return True
    return False


def _player_known_location_ids(game_map):
    discovered = set(game_map.get("discovered") or [])
    known_ids = set()
    for loc in game_map.get("locations") or []:
        if not isinstance(loc, dict):
            continue
        loc_id = loc.get("id")
        if not loc_id:
            continue
        if loc.get("known") or loc_id in discovered:
            known_ids.add(loc_id)
    current = game_map.get("current_location_id")
    if current:
        known_ids.add(current)
    return known_ids


def _filter_map_for_player(game_map):
    if not isinstance(game_map, dict):
        return {}
    known_ids = _player_known_location_ids(game_map)
    filtered_locs = []
    for loc in game_map.get("locations") or []:
        if not isinstance(loc, dict):
            continue
        loc_id = loc.get("id")
        if loc_id not in known_ids:
            continue
        entry = {
            "id": loc_id,
            "name": loc.get("name", loc_id),
            "known": bool(loc.get("known")),
            "x": loc.get("x", 0),
            "y": loc.get("y", 0),
        }
        if loc.get("known"):
            desc = (loc.get("description") or "").strip()
            if desc:
                entry["description"] = desc
        filtered_locs.append(entry)
    routes = []
    for route in game_map.get("routes") or []:
        if isinstance(route, (list, tuple)) and len(route) >= 2:
            if route[0] in known_ids and route[1] in known_ids:
                routes.append(list(route[:2]))
    discovered = [d for d in (game_map.get("discovered") or []) if d in known_ids]
    current = game_map.get("current_location_id")
    if current and current not in discovered and current in known_ids:
        discovered = list(discovered) + [current]
    return {
        "locations": filtered_locs,
        "discovered": discovered,
        "current_location_id": current if current in known_ids else None,
        "routes": routes,
    }


def _is_character_known_to_player(ch, player=None):
    if not isinstance(ch, dict):
        return False
    if ch.get("known_to_player"):
        return True
    disp = str(ch.get("disposition_to_player", "")).lower()
    if disp in ("self", "ally", "trusted", "trusted_uneven", "trusted_guarded", "recognized"):
        return True
    if disp.startswith("ally") or disp.startswith("trusted"):
        return True
    role = str(ch.get("role", "")).lower()
    if role == "player_character":
        return True
    known_set = set()
    if isinstance(player, dict):
        for k in player.get("knowledge") or []:
            if isinstance(k, str):
                known_set.add(k.lower())
    name = (ch.get("name") or "").lower().replace(" ", "_")
    cid = (ch.get("id") or "").lower()
    return name in known_set or cid in known_set


def _player_facing_character(ch):
    return {
        "id": ch.get("id", ""),
        "name": ch.get("name", ""),
        "role": ch.get("role") or ch.get("archetype", ""),
        "traits": ch.get("traits") or [],
        "wounds": ch.get("wounds") or ch.get("status", ""),
        "relationships": ch.get("relationships") or ch.get("disposition_to_player", ""),
        "objective": ch.get("objective") or (ch.get("goals") or [""])[0] if ch.get("goals") else "",
        "known_to_player": bool(ch.get("known_to_player")),
        "appearance": (ch.get("appearance") or "").strip() or None,
    }


def _player_facing_quests(quests):
    if not isinstance(quests, dict):
        return {"active": [], "rumors": [], "consequences": [], "completed": []}
    rumors = []
    for r in quests.get("rumors") or []:
        if not isinstance(r, dict):
            continue
        if r.get("player_known") is False:
            continue
        rumors.append(r)
    return {
        "active": [q for q in (quests.get("active") or []) if isinstance(q, dict)],
        "rumors": rumors,
        "consequences": [q for q in (quests.get("consequences") or []) if isinstance(q, dict)],
        "completed": [q for q in (quests.get("completed") or []) if isinstance(q, dict)],
    }


def _player_facing_rules_text(state):
    player = (state or {}).get("player") or {}
    knowledge = player.get("knowledge") or []
    lines = []
    if knowledge:
        lines.append("What you know:")
        for fact in knowledge[:24]:
            if isinstance(fact, str) and fact.strip():
                lines.append(f"- {fact.replace('_', ' ')}")
        lines.append("")
    lines.extend([
        "House rules (public):",
        "- Causality is real: actions have proportionate consequences.",
        "- No plot armor: failures, wounds, and missed deadlines stick unless legitimately repaired.",
        "- The world is consistent — you only learn what you perceive or earn in play.",
    ])
    return "\n".join(lines)


def state_summary(state):
    if not state:
        return {}
    world_date = current_world_date(state)
    player = state.get("player") or {}
    inventory = _carried_inventory(player.get("inventory") or state.get("inventory") or [])
    knowledge = player.get("knowledge") or []
    if not isinstance(knowledge, list):
        knowledge = []
    player_summary = {
        "stage": player.get("stage") or player.get("life_stage"),
        "location": player.get("location"),
        "resources": player.get("resources") or {},
        "reputation": player.get("reputation") or {},
        "inventory": inventory,
        "wounds": player.get("wounds") or [],
        "name": player.get("name"),
        "objective": player.get("objective") or player.get("goal"),
        "knowledge": [k for k in knowledge if isinstance(k, str) and k.strip()],
    }
    journal = db.rp_recent_journal(3)
    meta = state.get("_meta") or {}
    pending_choices = meta.get("pending_choices") or []
    if not isinstance(pending_choices, list):
        pending_choices = []
    pending_choices = [str(c).strip() for c in pending_choices if str(c).strip()][:4]
    beat_summary = (meta.get("last_beat_summary") or "").strip() or None

    visible_characters = []
    appearances = {}
    mc_id = _mc_character_id(state)
    mc_appearance = _get_appearance(state, mc_id)
    if mc_appearance:
        appearances[mc_id] = mc_appearance
    for ch in _normalize_characters(state.get("characters")):
        full_ch = next(
            (c for c in (state.get("characters") or []) if isinstance(c, dict) and c.get("id") == ch.get("id")),
            ch,
        )
        if not _is_character_known_to_player(full_ch, player):
            continue
        visible_characters.append(_player_facing_character(full_ch))
        app = (full_ch.get("appearance") or "").strip()
        if app:
            appearances[full_ch.get("id", "")] = app

    inv_log = state.get("inventory_log") or []
    if not isinstance(inv_log, list):
        inv_log = []
    recent_log = [e for e in inv_log[-20:] if isinstance(e, dict)]

    return {
        "world_date": world_date,
        "player": player_summary,
        "inventory": inventory,
        "inventory_log": recent_log,
        "lost_items": _lost_items_from_log(state, inventory),
        "characters": visible_characters,
        "appearances": appearances,
        "quests": _player_facing_quests(state.get("quests") or {}),
        "map": _filter_map_for_player(state.get("map") or {}),
        "urgent_threads": _open_threads(state, 5),
        "stakes_line": _stakes_line(state),
        "pending_choices": pending_choices,
        "beat_summary": beat_summary,
        "party": chrome_party(state),
        "shop_stalls": chrome_shop_stalls(state),
        "recent_journal": [
            {"world_date": j["world_date"], "entry": j["entry"], "kind": j.get("kind", "event")}
            for j in reversed(journal)
        ],
    }


def _grid_coords(index, total):
    cols = max(1, int(total ** 0.5) + 1)
    row = index // cols
    col = index % cols
    margin = 10
    span = 80
    rows = max(1, (total + cols - 1) // cols)
    x = margin + (col * span // max(cols - 1, 1)) if cols > 1 else 50
    y = margin + (row * span // max(rows - 1, 1)) if rows > 1 else 50
    return min(100, max(0, x)), min(100, max(0, y))


def _quests_from_threads(threads):
    active = []
    for t in threads or []:
        if not isinstance(t, dict):
            continue
        active.append({
            "id": t.get("id", ""),
            "title": t.get("title", ""),
            "stakes": t.get("summary", ""),
            "next_move": "",
            "risk": t.get("urgency", "medium"),
        })
    return {
        "active": active,
        "rumors": [],
        "consequences": [],
        "completed": [],
    }


def _map_from_locations(locations, start_location_id):
    locs = []
    for i, loc in enumerate(locations or []):
        if not isinstance(loc, dict):
            continue
        loc_id = loc.get("id", "")
        x, y = _grid_coords(i, len(locations))
        locs.append({
            "id": loc_id,
            "name": loc.get("name", loc_id),
            "known": loc_id == start_location_id,
            "x": x,
            "y": y,
            "description": loc.get("description", ""),
        })
    return {
        "locations": locs,
        "current_location_id": start_location_id,
        "routes": [],
    }


def _normalize_inventory_items(items):
    normalized = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        normalized.append({
            "id": item.get("id") or item.get("name", ""),
            "name": item.get("name", ""),
            "qty": int(item.get("qty", 1) or 1),
            "rarity": item.get("rarity", "common"),
            "effect": item.get("effect", ""),
            "origin": item.get("origin", ""),
            "status": item.get("status", "carried"),
        })
    return normalized


def _normalize_characters(characters):
    normalized = []
    for ch in characters or []:
        if not isinstance(ch, dict):
            continue
        normalized.append({
            "id": ch.get("id", ""),
            "name": ch.get("name", ""),
            "role": ch.get("role") or ch.get("archetype", ""),
            "traits": ch.get("traits") or [],
            "wounds": ch.get("wounds") or ch.get("status", ""),
            "relationships": ch.get("relationships") or ch.get("disposition_to_player", ""),
            "objective": ch.get("objective") or (ch.get("goals") or [""])[0] if ch.get("goals") else "",
            "appearance": ch.get("appearance", ""),
            "known_to_player": ch.get("known_to_player"),
            "location": ch.get("location"),
            "disposition_to_player": ch.get("disposition_to_player", ""),
        })
    return normalized


def _migrate_rpg_state(state, seed=None):
    """Ensure structured RPG fields exist; derive missing values from seed data."""
    changed = False
    player = state.setdefault("player", {})
    seed_data = seed or state

    if "inventory" not in player:
        player["inventory"] = []
        changed = True
    if _migrate_equipment_to_inventory(player):
        changed = True
    player["inventory"] = _normalize_inventory_items(player.get("inventory"))

    if "inventory" not in state:
        state["inventory"] = list(_carried_inventory(player["inventory"]))
        changed = True
    elif not state.get("inventory") and player.get("inventory"):
        state["inventory"] = list(_carried_inventory(player["inventory"]))
        changed = True
    else:
        state["inventory"] = _carried_inventory(_normalize_inventory_items(state.get("inventory")))

    if "inventory_log" not in state:
        state["inventory_log"] = []
        changed = True
    elif not isinstance(state.get("inventory_log"), list):
        state["inventory_log"] = []
        changed = True

    if "knowledge" not in player:
        player["knowledge"] = list(seed_data.get("player", {}).get("knowledge") or [])
        changed = True

    player_stage = player.get("stage") or player.get("life_stage") or ""
    if not (player.get("appearance") or "").strip():
        player["appearance"] = _synthesize_appearance(
            player.get("name", ""),
            "player_character",
            ", ".join(player.get("wounds") or []) if isinstance(player.get("wounds"), list) else "",
            player_stage,
        )
        changed = True

    if "characters" not in state:
        state["characters"] = _normalize_characters(seed_data.get("characters") or [])
        changed = True
    elif not state.get("characters"):
        seed_chars = seed_data.get("characters") or []
        if not seed_chars and SEED_PATH.is_file():
            try:
                seed_file = json.loads(SEED_PATH.read_text(encoding="utf-8"))
                seed_chars = seed_file.get("characters") or []
            except (OSError, json.JSONDecodeError):
                seed_chars = []
        if seed_chars:
            state["characters"] = _normalize_characters(seed_chars)
            changed = True
        else:
            state["characters"] = _normalize_characters(state.get("characters"))
    else:
        state["characters"] = _normalize_characters(state.get("characters"))

    start_loc = player.get("location")
    for ch in state.get("characters") or []:
        if not isinstance(ch, dict):
            continue
        if "known_to_player" not in ch or ch.get("known_to_player") is None:
            if ch.get("disposition_to_player") == "self":
                ch["known_to_player"] = True
                changed = True
            elif start_loc and ch.get("location") == start_loc:
                ch["known_to_player"] = True
                changed = True
            else:
                ch["known_to_player"] = False
                changed = True
        if not (ch.get("appearance") or "").strip():
            ch["appearance"] = _synthesize_appearance(
                ch.get("name", ""),
                ch.get("role", ""),
                ch.get("status", ""),
            )
            changed = True

    if "wounds" not in player:
        if "conditions" in player:
            player["wounds"] = player.pop("conditions")
        else:
            player["wounds"] = []
        changed = True

    if "quests" not in state:
        threads = seed_data.get("threads") or state.get("threads") or []
        if not threads and SEED_PATH.is_file():
            try:
                seed_file = json.loads(SEED_PATH.read_text(encoding="utf-8"))
                threads = seed_file.get("threads") or []
            except (OSError, json.JSONDecodeError):
                threads = []
        state["quests"] = _quests_from_threads(threads)
        changed = True
    else:
        quests = state.setdefault("quests", {})
        for key in ("active", "rumors", "consequences", "completed"):
            if key not in quests:
                quests[key] = []
                changed = True
        if not quests.get("active"):
            threads = seed_data.get("threads") or state.get("threads") or []
            if not threads and SEED_PATH.is_file():
                try:
                    seed_file = json.loads(SEED_PATH.read_text(encoding="utf-8"))
                    threads = seed_file.get("threads") or []
                except (OSError, json.JSONDecodeError):
                    threads = []
            if threads:
                state["quests"] = _quests_from_threads(threads)
                changed = True

    if "map" not in state:
        locations = seed_data.get("locations") or state.get("locations") or []
        start_id = player.get("location") or (locations[0]["id"] if locations else None)
        state["map"] = _map_from_locations(locations, start_id)
        changed = True
    else:
        game_map = state["map"]
        if "current_location_id" not in game_map:
            game_map["current_location_id"] = player.get("location")
            changed = True
        if "routes" not in game_map:
            game_map["routes"] = []
            changed = True
        if "discovered" not in game_map:
            game_map["discovered"] = [
                loc.get("id")
                for loc in (game_map.get("locations") or [])
                if isinstance(loc, dict) and loc.get("known") and loc.get("id")
            ]
            changed = True
        if not game_map.get("locations"):
            locations = seed_data.get("locations") or state.get("locations") or []
            if not locations and SEED_PATH.is_file():
                try:
                    seed_file = json.loads(SEED_PATH.read_text(encoding="utf-8"))
                    locations = seed_file.get("locations") or []
                except (OSError, json.JSONDecodeError):
                    locations = []
            start_id = game_map.get("current_location_id") or player.get("location")
            if locations:
                game_map.update(_map_from_locations(locations, start_id))
                changed = True

    return state, changed


def sync_wallet():
    """Track practice-point baseline; earned coins come from practice_totals, not ledger credits."""
    db.init_db()
    state = db.rp_get_state() or {}
    meta = state.setdefault("_meta", {})
    current_points = db.practice_totals().get("points", 0)
    meta["last_seen_practice_points"] = current_points
    db.rp_save_state(state)


def get_coins():
    """Shared currency facade: balance = practice points + coin ledger deltas."""
    db.init_db()
    sync_wallet()
    points = db.practice_totals().get("points", 0)
    ledger_sum = db.coin_ledger_sum()
    balance = points + ledger_sum
    ledger = db.coin_ledger_recent(30)
    return {
        "points": points,
        "ledger_sum": ledger_sum,
        "balance": balance,
        "ledger": ledger,
    }


def get_wallet():
    """Legacy wallet endpoint — reconciles to shared coin balance."""
    coins = get_coins()
    recent = [
        {
            "id": row["id"],
            "amount": row["delta"],
            "reason": row["reason"],
            "source": "ledger",
            "created_at": row["created_at"],
        }
        for row in coins["ledger"]
    ]
    return {"balance": coins["balance"], "recent": recent, "points": coins["points"]}


def ensure_initialized():
    db.init_db()
    existing = db.rp_get_state()
    if existing:
        migrated, changed = _migrate_rpg_state(existing)
        if changed:
            db.rp_save_state(migrated)
        return {"ready": True, "initialized": False}

    if not SEED_PATH.is_file():
        return {"ready": False, "reason": "world not initialized yet — game_seed.json is missing"}

    try:
        seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"ready": False, "reason": f"world not initialized yet — could not read seed: {exc}"}

    if not isinstance(seed, dict):
        return {"ready": False, "reason": "world not initialized yet — game_seed.json must be a JSON object"}

    today = _today_iso()
    points = db.practice_totals().get("points", 0)
    seed_date = seed.get("world_date", "Year 1, Month 1, Day 1")
    state = deepcopy(seed)
    state["_meta"] = {
        "irl_anchor": today,
        "last_tick": today,
        "last_points": points,
        "seed_world_date": seed_date,
        "world_day_index": _parse_world_date_to_day_index(seed_date),
    }
    state, _ = _migrate_rpg_state(state, seed=seed)
    db.rp_save_state(state)
    return {"ready": True, "initialized": True}


def _apply_tick_result(state, result, world_date):
    if not isinstance(result, dict):
        return state
    updates = result.get("state_updates")
    if isinstance(updates, dict) and updates:
        state = _deep_merge(state, updates)
    for entry in result.get("journal") or []:
        if not isinstance(entry, dict):
            continue
        text = (entry.get("entry") or "").strip()
        if not text:
            continue
        wd = entry.get("world_date") or world_date
        kind = entry.get("kind") or "event"
        db.rp_add_journal(wd, text, kind)
    opening = (result.get("gm_opening") or "").strip()
    if opening:
        db.rp_add_message("gm", opening, world_date)
    return state


def _advance_meta_after_tick(state, today):
    meta = state.setdefault("_meta", {})
    meta["last_tick"] = today
    meta["last_points"] = db.practice_totals().get("points", 0)
    return state


def daily_tick():
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    state = db.rp_get_state()
    if not state:
        return {"ready": False, "reason": "world state missing"}

    meta = state.setdefault("_meta", {})
    today = _today_iso()
    last_tick = meta.get("last_tick") or today
    if last_tick >= today:
        return {"ticked": False, "world_date": current_world_date(state)}

    days_elapsed = (date.fromisoformat(today) - date.fromisoformat(last_tick)).days
    current_points = db.practice_totals().get("points", 0)
    last_points = meta.get("last_points", 0)
    points_delta = current_points - last_points
    world_date = current_world_date(state)
    threads = _open_threads(state)

    prompt = f"""You are simulating off-screen time in Parallel while the player was away.

IRL days elapsed since last tick: {days_elapsed}
Practice-points delta since last tick: {points_delta}
(Points reflect cognitive drills in the real app — translate into how competently the parallel
self handled routine affairs: emails, lab prep, small repairs, scheduling. Bounded and plausible;
never jackpots, never undo major failures.)

Current world state JSON:
{json.dumps({k: v for k, v in state.items() if k != "_meta"}, indent=2)}

Open threads:
{json.dumps(threads, indent=2)}

Respond with ONLY a JSON object of this exact shape:
{{
  "journal": [{{"world_date": "...", "entry": "...", "kind": "event|consequence|advancement"}}],
  "state_updates": {{}},
  "gm_opening": "Short in-character scene setting where the player left off — 2-4 sentences."
}}

Cover the full elapsed interval in journal entries (one per in-world day if multiple days).
Keep state_updates partial — only fields that actually changed."""

    try:
        # Through the router, not ai.client(): roleplay is allowed to fall back now, so a
        # dead Anthropic key downgrades the GM to another backend instead of killing the tick.
        result = ai.route_json("roleplay", prompt, max_tokens=1200, system=_gm_charter())
        state = _apply_tick_result(state, result, world_date)
    except Exception as exc:
        print(f"[parallel_life] daily_tick AI failed: {exc}")
        db.rp_add_journal(
            world_date,
            "The world turned quietly while you were away — routines held, nothing dramatic surfaced.",
            "event",
        )

    state = _advance_meta_after_tick(state, today)
    _world_sim_tick(state, days_elapsed=days_elapsed)
    db.rp_save_state(state)
    return {"ticked": True, "world_date": current_world_date(state), "days_elapsed": days_elapsed}


def _format_messages_for_prompt(messages):
    lines = []
    for m in messages:
        role = m.get("role", "user")
        label = "Player" if role == "user" else "GM"
        lines.append(f"{label}: {m.get('content', '')}")
    return "\n\n".join(lines)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(ts):
    if not ts:
        return None
    text = str(ts).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _get_meta():
    state = db.rp_get_state() or {}
    return state.setdefault("_meta", {})


def _is_busy():
    meta = _get_meta()
    if not meta.get("busy"):
        return False
    busy_since = meta.get("busy_since")
    since = _parse_iso(busy_since)
    if since and (datetime.now(timezone.utc) - since).total_seconds() > BUSY_STALE_SECONDS:
        return False
    return True


def _set_busy(busy=True):
    state = db.rp_get_state() or {}
    meta = state.setdefault("_meta", {})
    if busy:
        meta["busy"] = True
        meta["busy_since"] = _now_iso()
    else:
        meta.pop("busy", None)
        meta.pop("busy_since", None)
    db.rp_save_state(state)


def parallel_status():
    meta = _get_meta()
    busy = _is_busy()
    provider = _image_provider()
    if provider == "openai":
        img_ok, img_reason = _image_budget_ok()
    else:
        img_ok, img_reason = True, None
    return {
        "busy": busy,
        "busy_since": meta.get("busy_since") if busy else None,
        "last_message_id": db.rp_last_message_id(),
        "image_gen": {"available": img_ok, "reason": img_reason, "provider": provider},
        "pregen": _pregen_snapshot(),
    }


def _auto_illustrate_enabled():
    return db.get_settings().get("parallel_auto_illustrate", "true") != "false"


def _image_daily_limit_reached():
    return _image_provider() == "openai" and db.rp_images_today_count() >= SCENES_DAILY_CAP


def _maybe_auto_illustrate(message_id):
    if not _auto_illustrate_enabled():
        return

    def _run():
        try:
            illustrate_scene(message_id)
        except Exception as exc:
            print(f"[parallel_life] auto-illustrate failed for msg {message_id}: {exc}")

    threading.Thread(target=_run, daemon=True).start()


def _maybe_auto_map():
    if image_cached("scenes/world-map.png") or image_cached("scenes/world-map.jpg"):
        return

    def _run():
        try:
            generate_map()
        except Exception as exc:
            print(f"[parallel_life] auto-map failed: {exc}")

    threading.Thread(target=_run, daemon=True).start()


def _maybe_auto_item_images(item_ids):
    ids = [i for i in (item_ids or []) if i]
    if not ids:
        return

    def _run():
        for item_id in ids:
            try:
                if db.rp_item_for_id(item_id):
                    continue
                if _image_daily_limit_reached():
                    break
                illustrate_item(item_id)
            except Exception as exc:
                print(f"[parallel_life] auto-item-image failed for {item_id}: {exc}")

    threading.Thread(target=_run, daemon=True).start()


def _maybe_refresh_mc_portrait(state):
    mc_id = _mc_character_id(state)
    appearance = _get_appearance(state, mc_id)
    if not appearance:
        return
    prompt = f"{PORTRAIT_STYLE}. Character: {_character_description(state, mc_id)}."
    prompt_hash = _prompt_hash(prompt)
    existing = db.rp_portrait_for_character(mc_id)
    if existing and existing.get("prompt_hash") == prompt_hash:
        return
    if _image_daily_limit_reached():
        return

    def _run():
        try:
            illustrate_portrait(mc_id, regenerate=True)
        except Exception as exc:
            print(f"[parallel_life] auto MC portrait refresh failed: {exc}")

    threading.Thread(target=_run, daemon=True).start()


def _world_sim_heuristic(state, prev_snapshot=None):
    """Light off-screen nudges when AI is unavailable."""
    meta = state.setdefault("_meta", {})
    sim = meta.setdefault("world_sim", {})
    sim["last_tick"] = _today_iso()
    sim.setdefault("offscreen_rumors", [])
    player_loc = (state.get("player") or {}).get("location")
    nudged = 0
    for ch in state.get("characters") or []:
        if not isinstance(ch, dict):
            continue
        if ch.get("disposition_to_player") == "self":
            continue
        if ch.get("known_to_player"):
            continue
        loc = ch.get("location")
        if loc and player_loc and loc != player_loc and nudged < 2:
            goals = ch.get("goals") or []
            if goals:
                sim.setdefault("character_nudges", []).append({
                    "character_id": ch.get("id"),
                    "note": "continued off-screen pursuit",
                    "at": _now_iso(),
                })
                nudged += 1
    if len(sim.get("character_nudges") or []) > 30:
        sim["character_nudges"] = sim["character_nudges"][-30:]
    return state


def _world_sim_tick(state, prev_snapshot=None, days_elapsed=1):
    """Update hidden world_sim; may nudge off-screen characters. Never writes player journal."""
    meta = state.setdefault("_meta", {})
    compact = {k: v for k, v in state.items() if k != "_meta"}
    prompt = f"""Simulate hidden off-screen world activity for Parallel (player cannot see this directly).

Days elapsed: {days_elapsed}
Previous snapshot (partial): {json.dumps(prev_snapshot or {}, indent=2)[:2000]}
Current state JSON:
{json.dumps(compact, indent=2)[:3500]}

Respond with ONLY JSON:
{{
  "world_sim": {{
    "offscreen_notes": ["brief GM-only note"],
    "character_nudges": [{{"character_id":"...", "location":"...", "goal_shift":"..."}}],
    "thread_nudges": [{{"thread_id":"...", "note":"..."}}]
  }},
  "state_updates": {{
    "characters": [{{"id":"...", "location":"...", "objective":"..."}}]
  }}
}}

Rules: do NOT add journal entries or player-visible messages. Never expose secrets to the player.
Only nudge characters/locations plausibly off-screen. Omit unchanged fields."""

    try:
        if not db.is_api_enabled():
            return _world_sim_heuristic(state, prev_snapshot)
        result = ai.route_json("tasks", prompt, max_tokens=500)
        if not isinstance(result, dict):
            return _world_sim_heuristic(state, prev_snapshot)
        ws = result.get("world_sim")
        if isinstance(ws, dict):
            meta["world_sim"] = _deep_merge(meta.get("world_sim") or {}, ws)
        updates = result.get("state_updates")
        if isinstance(updates, dict) and updates:
            for ch_upd in updates.get("characters") or []:
                if not isinstance(ch_upd, dict) or not ch_upd.get("id"):
                    continue
                for ch in state.get("characters") or []:
                    if isinstance(ch, dict) and ch.get("id") == ch_upd["id"]:
                        if ch.get("known_to_player"):
                            break
                        for key in ("location", "objective"):
                            if ch_upd.get(key):
                                ch[key] = ch_upd[key]
                        break
    except Exception as exc:
        print(f"[parallel_life] world_sim tick failed: {exc}")
        return _world_sim_heuristic(state, prev_snapshot)
    return state


def _run_world_sim_background(prev_snapshot):
    try:
        state = db.rp_get_state()
        if not state:
            return
        state = _world_sim_tick(state, prev_snapshot=prev_snapshot, days_elapsed=0)
        db.rp_save_state(state)
    except Exception as exc:
        print(f"[parallel_life] background world_sim failed: {exc}")


def _complete_play(user_message):
    """GM call + extraction + journal + state updates + GM message (user msg already stored)."""
    state = db.rp_get_state()
    world_date = current_world_date(state)
    recent = db.rp_recent_messages(16)
    today_journal = db.rp_journal_for(world_date)
    journal_text = "\n".join(
        f"[{j.get('kind', 'event')}] {j['entry']}" for j in today_journal
    ) or "(nothing notable logged yet today)"

    compact_state = {k: v for k, v in state.items() if k != "_meta"}
    history = _format_messages_for_prompt(recent)

    prev_inventory = _carried_inventory(
        (state.get("player") or {}).get("inventory") or state.get("inventory") or []
    )
    prev_knowledge = list((state.get("player") or {}).get("knowledge") or [])

    system = _gm_charter()
    user_prompt = f"""World state JSON:
{json.dumps(compact_state, indent=2)}

Today's world date: {world_date}

Today's journal so far:
{journal_text}

Recent conversation (oldest first):
{history}

Player says:
{user_message}

Reply in character as GM. Be concise but vivid (under ~400 words). Honor causality and canon."""

    reply = ai.route_text("roleplay", user_prompt, max_tokens=1000, system=system)

    extract_prompt = f"""From this Parallel roleplay exchange, extract structured updates CONSERVATIVELY.
Only add or modify fields the narration clearly established — never invent items, quests, or map reveals.

World date: {world_date}

Player message:
{user_message}

GM reply:
{reply}

Respond with ONLY JSON:
{{
  "state_updates": {{
    "player": {{
      "inventory": [{{"id":"...","name":"...","qty":1,"rarity":"common|uncommon|rare|legendary","effect":"...","origin":"...","status":"carried"}}],
      "wounds": ["..."],
      "location": "...",
      "appearance": "optional visual sheet update",
      "knowledge": ["short newly learned fact strings"]
    }},
    "inventory": [{{"id":"...","name":"...","qty":1,"rarity":"common|uncommon|rare|legendary","effect":"...","origin":"...","status":"carried"}}],
    "inventory_delta": [{{"item_id":"...","action":"gained|dropped|lost|consumed|used","qty":1,"note":""}}],
    "characters": [{{"id":"...","name":"...","role":"...","traits":[],"wounds":"","relationships":"","objective":"...","appearance":"optional","known_to_player":true}}],
    "quests": {{
      "active": [{{"id":"...","title":"...","stakes":"...","last_event":"...","next_move":"...","risk":"low|medium|high"}}],
      "rumors": [{{"id":"...","title":"...","player_known":true}}],
      "consequences": [],
      "completed": []
    }},
    "map": {{
      "locations": [{{"id":"...","name":"...","known":true,"x":0,"y":0,"description":"..."}}],
      "discovered": ["loc_id"],
      "current_location_id": "...",
      "routes": [["loc_a","loc_b"]]
    }}
  }},
  "journal": [{{"world_date": "...", "entry": "...", "kind": "event|consequence|advancement"}}],
  "choices": ["short action the player could take", "another option"],
  "beat_summary": "Plain one-sentence status: what changed and what's at stake."
}}

state_updates: partial merge only — omit unchanged sections entirely. inventory: add/update items explicitly
mentioned; list inventory_delta or removals when items leave play. characters: only add/update NPCs clearly
introduced or changed; set known_to_player:true when the player meets someone; optional appearance updates.
Never include secrets in player.knowledge. wounds: only new injuries/conditions stated.
quests: only modify threads clearly advanced or resolved; rumors need player_known:true when the player learns them.
map: set known:true and add to discovered only for locations the player has now discovered.
journal: 0-2 brief world-log entries.
choices: 0-4 short imperative actions the player could take next (grounded in the scene; omit if unclear).
beat_summary: one plain sentence on what changed and what's at stake now (no hype)."""
    try:
        extracted = ai.route_json("tasks", extract_prompt, max_tokens=700)
        inventory_delta = None
        if isinstance(extracted, dict):
            su = extracted.get("state_updates") or {}
            if isinstance(su, dict):
                inventory_delta = su.pop("inventory_delta", None)
        state = _apply_tick_result(state, extracted, world_date)
        _reconcile_inventory(state, prev_inventory, reply, world_date, inventory_delta=inventory_delta)
        player = state.setdefault("player", {})
        if isinstance(extracted, dict):
            su = extracted.get("state_updates") or {}
            if isinstance(su, dict):
                new_knowledge = (su.get("player") or {}).get("knowledge")
                if isinstance(new_knowledge, list) and new_knowledge:
                    merged = list(prev_knowledge)
                    for fact in new_knowledge:
                        if isinstance(fact, str) and fact.strip() and fact.strip() not in merged:
                            merged.append(fact.strip())
                    player["knowledge"] = merged
                for ch_upd in su.get("characters") or []:
                    if not isinstance(ch_upd, dict):
                        continue
                    if ch_upd.get("appearance"):
                        for ch in state.get("characters") or []:
                            if isinstance(ch, dict) and ch.get("id") == ch_upd.get("id"):
                                ch["appearance"] = ch_upd["appearance"]
                                break
                if su.get("player", {}).get("appearance"):
                    player["appearance"] = su["player"]["appearance"]
        meta = state.setdefault("_meta", {})
        choices = extracted.get("choices") if isinstance(extracted, dict) else None
        if isinstance(choices, list):
            parsed = [str(c).strip() for c in choices if str(c).strip()][:4]
            if parsed:
                meta["pending_choices"] = parsed
        if not meta.get("pending_choices"):
            fallback = _parse_choices_from_reply(reply)
            if fallback:
                meta["pending_choices"] = fallback
        beat = (extracted.get("beat_summary") or "").strip() if isinstance(extracted, dict) else ""
        if beat:
            meta["last_beat_summary"] = beat
        elif extracted.get("journal") if isinstance(extracted, dict) else None:
            entries = extracted.get("journal") or []
            if entries and isinstance(entries[0], dict):
                entry_text = (entries[0].get("entry") or "").strip()
                if entry_text:
                    meta["last_beat_summary"] = entry_text[:160]
        state, _ = _migrate_rpg_state(state)
        db.rp_save_state(state)
    except Exception as exc:
        print(f"[parallel_life] play extraction failed: {exc}")

    current_inventory = _carried_inventory(
        (state.get("player") or {}).get("inventory") or state.get("inventory") or []
    )
    prev_ids = set(_inventory_by_id(prev_inventory))
    new_item_ids = [
        item.get("id") for item in current_inventory
        if item.get("id") and item.get("id") not in prev_ids
    ]

    gm_msg_id = db.rp_add_message("gm", reply, world_date)
    return gm_msg_id, reply, world_date, new_item_ids


def _run_play_background(user_message, prev_snapshot=None):
    try:
        if prev_snapshot is None:
            state = db.rp_get_state()
            prev_snapshot = {k: v for k, v in (state or {}).items() if k != "_meta"}
        threading.Thread(
            target=_run_world_sim_background, args=(prev_snapshot,), daemon=True
        ).start()
        gm_msg_id, _reply, _world_date, new_item_ids = _complete_play(user_message)
        _maybe_auto_illustrate(gm_msg_id)
        _maybe_auto_map()
        _maybe_auto_item_images(new_item_ids)
    except Exception as exc:
        print(f"[parallel_life] background play failed: {exc}")
        state = db.rp_get_state()
        world_date = current_world_date(state) if state else None
        short_err = str(exc).split("\n")[0][:120]
        db.rp_add_message(
            "gm",
            f"(the world stutters — {short_err}; try again)",
            world_date,
        )
    finally:
        _set_busy(False)


def start_play(user_message):
    """Validate, store user message, set busy, spawn background GM job."""
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    user_message = (user_message or "").strip()
    if not user_message:
        return {"error": "message is required"}

    if _is_busy():
        return {"accepted": False, "reason": "the world is still resolving your last action"}

    daily_tick()
    state = db.rp_get_state()
    meta = state.setdefault("_meta", {})
    meta.pop("pending_choices", None)
    db.rp_save_state(state)
    world_date = current_world_date(state)
    db.rp_add_message("user", user_message, world_date)
    _set_busy(True)
    prev_snapshot = {k: v for k, v in state.items() if k != "_meta"}

    threading.Thread(
        target=_run_play_background, args=(user_message, prev_snapshot), daemon=True
    ).start()
    return {"accepted": True, "busy": True}


def _scene_visual_prompt(gm_content, state, extra_prompt=None):
    player = (state or {}).get("player") or {}
    location = player.get("location") or "an indistinct urban ruin"
    scene_text = (gm_content or "").strip()[:600]
    appearance_lines = []
    for ch in _characters_in_scene(state, gm_content):
        cid = ch.get("id") or "npc"
        app = _get_appearance(state, cid)
        name = ch.get("name") or cid
        if app:
            appearance_lines.append(f"{name}: {app}")
    appearance_block = ""
    if appearance_lines:
        appearance_block = " Character appearances: " + "; ".join(appearance_lines) + "."
    base = (
        f"Scene illustration for a dark gaslamp-meets-ruins roleplay world. "
        f"Location: {location}. Tone: weary, consequential, no plot armor. "
        f"Moment: {scene_text}.{appearance_block} "
        f"Style: {SCENE_STYLE}."
    )
    extra = (extra_prompt or "").strip()[:400]
    if extra:
        return f"{base} Additional direction: {extra}"
    return base


def _illustrate_request_options():
    """Read optional illustrate overrides from the active Flask request when present."""
    prompt = None
    regenerate = False
    try:
        from flask import has_request_context, request
        if has_request_context():
            data = request.get_json(silent=True) or {}
            prompt = (data.get("prompt") or "").strip() or None
            regenerate = bool(data.get("regenerate"))
    except Exception:
        pass
    return prompt, regenerate


def _ensure_image_dirs():
    for folder in (SCENES_DIR, PORTRAITS_DIR, ITEMS_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def _safe_image_rel(rel_path):
    rel = str(rel_path or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in Path(rel).parts:
        return None
    kind = rel.split("/", 1)[0]
    if kind not in ("scenes", "portraits", "items"):
        return None
    return rel


def resolve_image_path(rel_path):
    """Prefer the durable data-dir cache; copy leftover static/ files there on first read."""
    rel = _safe_image_rel(rel_path)
    if not rel:
        return None
    durable = IMAGE_CACHE_DIR / rel
    if durable.is_file():
        return durable
    legacy = LEGACY_STATIC / rel
    if legacy.is_file():
        durable.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(legacy, durable)
            return durable if durable.is_file() else legacy
        except OSError:
            return legacy
    return None


def image_cached(rel_path):
    return resolve_image_path(rel_path) is not None


def annotate_messages_with_scenes(messages):
    """has_scene is only true when the PNG is actually on disk."""
    for msg in messages or []:
        if not msg.get("has_scene"):
            continue
        existing = db.rp_scene_for_message(msg.get("id"))
        path = (existing or {}).get("path") or f"scenes/{msg.get('id')}.png"
        if not image_cached(path):
            msg["has_scene"] = False
            msg["scene_missing"] = True
    return messages


def _clear_scene(message_id):
    existing = db.rp_scene_for_message(message_id)
    if not existing:
        return
    _unlink_static_rel(existing.get("path") or "")
    conn = db.get_conn()
    conn.execute("DELETE FROM rp_scenes WHERE message_id = ?", (message_id,))
    conn.commit()
    conn.close()


def _unlink_static_rel(rel_path):
    rel = _safe_image_rel(rel_path)
    if not rel:
        return
    for base in (IMAGE_CACHE_DIR, LEGACY_STATIC):
        full = base / rel
        if full.is_file():
            try:
                full.unlink()
            except OSError:
                pass


def _image_public_url(rel_path):
    return f"/{rel_path.lstrip('/')}" if rel_path else None


def _decode_uploaded_image(image_data):
    """Accept data URL (data:image/...;base64,...) or raw base64. Return bytes or raise ValueError."""
    if image_data is None:
        raise ValueError("image data is required")
    text = str(image_data).strip()
    if not text:
        raise ValueError("image data is required")
    if text.lower().startswith("data:"):
        comma = text.find(",")
        if comma == -1:
            raise ValueError("invalid data URL")
        text = text[comma + 1 :]
    try:
        raw = base64.b64decode(text, validate=True)
    except Exception as exc:
        raise ValueError("invalid base64 image data") from exc
    if not raw:
        raise ValueError("empty image data")
    return raw


def _validate_image_bytes(raw):
    """Accept PNG/JPEG/WebP/GIF by magic bytes. Max 8MB. Return (ext, bytes)."""
    if len(raw) > MAX_IMAGE_UPLOAD_BYTES:
        raise ValueError(f"image exceeds maximum size ({MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)}MB)")
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", raw
    if raw[:3] == b"\xff\xd8\xff":
        return "jpeg", raw
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", raw
    if raw[:4] == b"RIFF" and len(raw) >= 12 and raw[8:12] == b"WEBP":
        return "webp", raw
    raise ValueError("unsupported image format (use PNG, JPEG, WebP, or GIF)")


def _convert_to_png_bytes(raw, ext):
    if ext == "png":
        return raw
    try:
        import io
        from PIL import Image
    except ImportError as exc:
        raise ValueError(
            "non-PNG uploads require Pillow to convert; install Pillow or upload a PNG"
        ) from exc
    img = Image.open(io.BytesIO(raw))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _prepare_uploaded_png(image_data):
    raw = _decode_uploaded_image(image_data)
    ext, validated = _validate_image_bytes(raw)
    return _convert_to_png_bytes(validated, ext)


def _write_static_png(rel_path, png_bytes):
    rel = _safe_image_rel(rel_path)
    if not rel:
        raise ValueError("invalid image path")
    _ensure_image_dirs()
    out_path = IMAGE_CACHE_DIR / rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(png_bytes)
    return rel


def _save_or_update_scene(message_id, rel_path):
    existing = db.rp_scene_for_message(message_id)
    if existing:
        old_path = existing.get("path")
        if old_path and old_path != rel_path:
            _unlink_static_rel(old_path)
        conn = db.get_conn()
        conn.execute(
            "UPDATE rp_scenes SET path = ?, created_at = ? WHERE message_id = ?",
            (rel_path, db.now_iso(), message_id),
        )
        conn.commit()
        conn.close()
    else:
        db.rp_save_scene(message_id, rel_path)


def upload_scene_image(message_id, image_data):
    """Replace/set scene PNG for GM message. No AI budget. Returns {ok, path, url}."""
    msg = db.rp_get_message(message_id)
    if not msg:
        return {"ok": False, "reason": "message not found"}
    if msg.get("role") != "gm":
        return {"ok": False, "reason": "only GM messages can have scene images"}

    try:
        png_bytes = _prepare_uploaded_png(image_data)
    except ValueError as exc:
        return {"ok": False, "reason": str(exc)}

    rel_path = f"scenes/{message_id}.png"
    existing = db.rp_scene_for_message(message_id)
    if existing and existing.get("path") and existing["path"] != rel_path:
        _unlink_static_rel(existing["path"])
    _write_static_png(rel_path, png_bytes)
    _save_or_update_scene(message_id, rel_path)
    return {"ok": True, "path": rel_path, "url": _image_public_url(rel_path)}


def upload_portrait_image(character_id, image_data):
    """Replace/set portrait. prompt_hash = 'upload'. Returns {ok, path, url}."""
    character_id = (character_id or "").strip()
    if not character_id:
        return {"ok": False, "reason": "character_id is required"}

    try:
        png_bytes = _prepare_uploaded_png(image_data)
    except ValueError as exc:
        return {"ok": False, "reason": str(exc)}

    rel_path = f"portraits/{character_id}.png"
    existing = db.rp_portrait_for_character(character_id)
    if existing and existing.get("path") and existing["path"] != rel_path:
        _unlink_static_rel(existing["path"])
    _write_static_png(rel_path, png_bytes)
    prompt_hash = "upload"
    if existing:
        db.rp_update_portrait(character_id, rel_path, prompt_hash)
    else:
        db.rp_save_portrait(character_id, rel_path, prompt_hash)
    return {"ok": True, "path": rel_path, "url": _image_public_url(rel_path)}


def upload_item_image(item_id, image_data):
    """Replace/set item image. prompt_hash = 'upload'."""
    item_id = (item_id or "").strip()
    if not item_id:
        return {"ok": False, "reason": "item_id is required"}

    try:
        png_bytes = _prepare_uploaded_png(image_data)
    except ValueError as exc:
        return {"ok": False, "reason": str(exc)}

    rel_path = f"items/{item_id}.png"
    existing = db.rp_item_for_id(item_id)
    if existing and existing.get("path") and existing["path"] != rel_path:
        _unlink_static_rel(existing["path"])
    _write_static_png(rel_path, png_bytes)
    prompt_hash = "upload"
    if existing:
        db.rp_update_item(item_id, rel_path, prompt_hash)
    else:
        db.rp_save_item(item_id, rel_path, prompt_hash)
    return {"ok": True, "path": rel_path, "url": _image_public_url(rel_path)}


def upload_map_image(image_data):
    """Replace/set world-map.png."""
    try:
        png_bytes = _prepare_uploaded_png(image_data)
    except ValueError as exc:
        return {"ok": False, "reason": str(exc)}

    rel_path = "scenes/world-map.png"
    _unlink_static_rel("scenes/world-map.jpg")
    _write_static_png(rel_path, png_bytes)

    state = db.rp_get_state() or {}
    meta = state.setdefault("_meta", {})
    meta["map_image"] = rel_path
    db.rp_save_state(state)
    return {"ok": True, "path": rel_path, "url": _image_public_url(rel_path)}


def upload_parallel_image(kind, target_id, image_data):
    """kind in scene|portrait|item|map. Dispatch. For map, target_id ignored."""
    kind = (kind or "").strip().lower()
    if kind == "scene":
        if target_id in (None, ""):
            return {"ok": False, "reason": "id (message_id) is required for scene upload"}
        return upload_scene_image(int(target_id), image_data)
    if kind == "portrait":
        if not target_id:
            return {"ok": False, "reason": "id (character_id) is required for portrait upload"}
        return upload_portrait_image(str(target_id), image_data)
    if kind == "item":
        if not target_id:
            return {"ok": False, "reason": "id (item_id) is required for item upload"}
        return upload_item_image(str(target_id), image_data)
    if kind == "map":
        return upload_map_image(image_data)
    return {"ok": False, "reason": "kind must be scene, portrait, item, or map"}


def illustrate_scene(message_id, prompt=None, regenerate=False):
    """Generate and persist a scene image for a GM message. Returns {path} or {reason}."""
    req_prompt, req_regenerate = _illustrate_request_options()
    if prompt is None:
        prompt = req_prompt
    if not regenerate:
        regenerate = req_regenerate

    msg = db.rp_get_message(message_id)
    if not msg:
        return {"reason": "message not found", "ok": False}
    if msg.get("role") != "gm":
        return {"reason": "only GM messages can be illustrated", "ok": False}

    existing = db.rp_scene_for_message(message_id)
    if existing and regenerate:
        _clear_scene(message_id)
        existing = None
    rel_path = (existing or {}).get("path") or f"scenes/{message_id}.png"
    if existing and not regenerate and image_cached(rel_path):
        return {"path": rel_path, "ok": True, "cached": True, "url": _image_public_url(rel_path)}

    if _image_daily_limit_reached():
        return {"reason": f"daily image cap reached ({SCENES_DAILY_CAP} images per day)", "ok": False}

    state = db.rp_get_state()
    visual_prompt = _scene_visual_prompt(msg.get("content", ""), state, extra_prompt=prompt)

    _ensure_image_dirs()
    err = _generate_image(visual_prompt, SCENES_DIR / f"{message_id}.png")
    if err:
        return {"reason": err, "ok": False, "retryable": True}

    rel_path = f"scenes/{message_id}.png"
    try:
        db.rp_save_scene(message_id, rel_path)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            existing = db.rp_scene_for_message(message_id)
            if existing and image_cached(existing.get("path") or rel_path):
                return {"path": existing["path"], "ok": True, "cached": True,
                        "url": _image_public_url(existing["path"])}
        raise
    state = db.rp_get_state()
    _maybe_refresh_mc_portrait(state)
    return {"path": rel_path, "ok": True, "cached": False, "url": _image_public_url(rel_path)}


def list_scene_urls():
    out = []
    for scene in db.rp_list_scenes():
        if not image_cached(scene["path"]):
            continue
        out.append({
            "message_id": scene["message_id"],
            "url": _image_public_url(scene["path"]),
            "created_at": scene.get("created_at"),
        })
    return out


def _character_description(state, character_id):
    appearance = _get_appearance(state, character_id)
    for ch in (state or {}).get("characters") or []:
        if isinstance(ch, dict) and ch.get("id") == character_id:
            parts = [
                ch.get("name", character_id),
                ch.get("role", ""),
                ch.get("status", ""),
                f"disposition: {ch.get('disposition_to_player', '')}",
            ]
            if ch.get("goals"):
                parts.append(f"goals: {', '.join(ch['goals'][:3])}")
            desc = ". ".join(p for p in parts if p)
            if appearance:
                return f"{desc}. Appearance: {appearance}"
            return desc
    player = (state or {}).get("player") or {}
    mc_id = _mc_character_id(state)
    if character_id in ("mc", "player") or character_id == mc_id or character_id == player.get("name"):
        desc = f"{player.get('name', 'Player')}. {player.get('stage', '')}. Location: {player.get('location', '')}"
        if appearance:
            return f"{desc}. Appearance: {appearance}"
        return desc
    if appearance:
        return f"{character_id}. Appearance: {appearance}"
    return character_id


def _item_description(state, item_id):
    for item in _normalize_inventory_items(
        (state.get("player") or {}).get("inventory") or state.get("inventory") or []
    ):
        if item.get("id") == item_id or item.get("name") == item_id:
            parts = [item.get("name", item_id), item.get("rarity", "common")]
            if item.get("effect"):
                parts.append(item["effect"])
            return ". ".join(p for p in parts if p)
    return item_id.replace("_", " ")


def _image_budget_ok():
    import budget
    spent = budget.spent_today()
    cap = budget.daily_cap()
    if cap > 0 and spent >= cap:
        return False, "daily AI budget exceeded — image generation skipped"
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return False, "OPENAI_API_KEY not configured"
    if not db.is_api_enabled():
        return False, "API is disabled"
    return True, None


def _pregen_snapshot():
    with _PREGEN_LOCK:
        return dict(_PREGEN_PROGRESS)


def _pregen_set(**updates):
    with _PREGEN_LOCK:
        _PREGEN_PROGRESS.update(updates)


def _stored_image_exists(record):
    if not isinstance(record, dict):
        return False
    rel_path = record.get("path")
    return bool(rel_path and (Path(__file__).parent / "static" / rel_path).is_file())


def _pregen_missing_image_tasks():
    """Snapshot every currently image-less Parallel entity in a stable order."""
    state = db.rp_get_state() or {}
    tasks = []

    seen_items = set()
    player_items = ((state.get("player") or {}).get("inventory") or [])
    for item in _normalize_inventory_items(list(player_items) + list(state.get("inventory") or [])):
        item_id = str(item.get("id") or item.get("name") or "").strip()
        if not item_id or item_id in seen_items:
            continue
        seen_items.add(item_id)
        existing = db.rp_item_for_id(item_id)
        if not _stored_image_exists(existing):
            tasks.append({
                "kind": "item",
                "id": item_id,
                "label": item.get("name") or item_id,
                "regenerate": bool(existing),
            })

    seen_characters = set()
    character_ids = []
    for character in state.get("characters") or []:
        if not isinstance(character, dict):
            continue
        character_id = str(character.get("id") or character.get("name") or "").strip()
        if character_id and character_id not in seen_characters:
            seen_characters.add(character_id)
            character_ids.append((character_id, character.get("name") or character_id))
    mc_id = str(_mc_character_id(state) or "mc").strip()
    if mc_id and mc_id not in seen_characters:
        player_name = (state.get("player") or {}).get("name") or "main character"
        character_ids.append((mc_id, player_name))

    for character_id, label in character_ids:
        existing = db.rp_portrait_for_character(character_id)
        if not _stored_image_exists(existing):
            tasks.append({
                "kind": "portrait",
                "id": character_id,
                "label": label,
                "regenerate": bool(existing),
            })

    for message in db.rp_recent_messages(limit=1_000_000):
        if message.get("role") != "gm" or not message.get("id"):
            continue
        message_id = int(message["id"])
        existing = db.rp_scene_for_message(message_id)
        if not _stored_image_exists(existing):
            tasks.append({
                "kind": "scene",
                "id": message_id,
                "label": f"scene {message_id}",
                "regenerate": bool(existing),
            })

    if not get_map_info().get("image"):
        tasks.append({"kind": "map", "id": "world-map", "label": "world map", "regenerate": False})
    return tasks


def _pregen_task_has_image(task):
    kind = task["kind"]
    target_id = task["id"]
    if kind == "item":
        return _stored_image_exists(db.rp_item_for_id(target_id))
    if kind == "portrait":
        return _stored_image_exists(db.rp_portrait_for_character(target_id))
    if kind == "scene":
        return _stored_image_exists(db.rp_scene_for_message(target_id))
    if kind == "map":
        return bool(get_map_info().get("image"))
    return True


def _run_pregen_images(tasks):
    generated = 0
    skipped = 0
    failed = 0
    done = 0
    total = len(tasks)
    try:
        for task in tasks:
            if _pregen_task_has_image(task):
                done += 1
                _pregen_set(done=done, message=f"Skipping existing {task['label']}…")
                continue

            if _image_daily_limit_reached():
                skipped += total - done
                done = total
                _pregen_set(
                    done=done,
                    skipped=skipped,
                    message=f"{generated} generated / {skipped} skipped: daily image cap reached",
                )
                break

            _pregen_set(message=f"Generating {task['label']} ({done + 1}/{total})…")
            kind = task["kind"]
            if kind == "item":
                result = illustrate_item(task["id"], regenerate=task["regenerate"])
            elif kind == "portrait":
                result = illustrate_portrait(task["id"], regenerate=task["regenerate"])
            elif kind == "scene":
                result = illustrate_scene(task["id"], regenerate=task["regenerate"])
            else:
                result = generate_map(regenerate=task["regenerate"])

            done += 1
            if isinstance(result, dict) and result.get("path") and not result.get("reason"):
                generated += 1
            else:
                failed += 1
                reason = (result or {}).get("reason") if isinstance(result, dict) else None
                print(f"[parallel_life] pregen failed for {task['label']}: {reason or 'unknown error'}")
            _pregen_set(done=done, generated=generated, failed=failed)
    except Exception as exc:
        failed += 1
        print(f"[parallel_life] image pregen stopped unexpectedly: {exc}")
    finally:
        final_message = f"{generated} generated / {skipped} skipped (budget)"
        if failed:
            final_message += f" / {failed} failed"
        _pregen_set(
            running=False,
            done=done,
            generated=generated,
            skipped=skipped,
            failed=failed,
            message=final_message,
        )


def pregen_all_images():
    """Queue all missing Parallel art on one sequential background worker."""
    global _PREGEN_THREAD

    init = ensure_initialized()
    if not init.get("ready"):
        return init

    with _PREGEN_LOCK:
        if _PREGEN_PROGRESS["running"]:
            return {"accepted": False, "pregen": dict(_PREGEN_PROGRESS)}
        _PREGEN_PROGRESS.update({
            "running": True,
            "done": 0,
            "total": 0,
            "generated": 0,
            "skipped": 0,
            "failed": 0,
            "message": "Finding missing art…",
        })

    try:
        tasks = _pregen_missing_image_tasks()
    except Exception as exc:
        _pregen_set(running=False, message=f"Could not queue art: {exc}")
        return {"accepted": False, "reason": str(exc), "pregen": _pregen_snapshot()}

    if not tasks:
        _pregen_set(running=False, message="0 generated / 0 skipped (budget) — all art already exists.")
        return {"accepted": True, "pregen": _pregen_snapshot()}

    _pregen_set(total=len(tasks), message=f"Queued {len(tasks)} missing images.")
    _PREGEN_THREAD = threading.Thread(
        target=_run_pregen_images,
        args=(tasks,),
        name="parallel-image-pregen",
        daemon=True,
    )
    try:
        _PREGEN_THREAD.start()
    except Exception as exc:
        _pregen_set(running=False, message=f"Could not start art generation: {exc}")
        return {"accepted": False, "reason": str(exc), "pregen": _pregen_snapshot()}
    return {"accepted": True, "pregen": _pregen_snapshot()}


def _image_provider():
    provider = str(db.get_settings().get("parallel_image_provider", "local")).strip().lower()
    return provider if provider in ("local", "openai", "auto") else "local"


def _png_chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def _procedural_image_bytes(prompt, width=512, height=512):
    """Deterministic abstract fallback requiring only the Python standard library."""
    digest = hashlib.sha256(prompt.encode("utf-8")).digest()
    colors = [
        (24 + digest[0] % 72, 24 + digest[1] % 72, 36 + digest[2] % 96),
        (70 + digest[3] % 140, 48 + digest[4] % 150, 80 + digest[5] % 150),
        (90 + digest[6] % 150, 80 + digest[7] % 150, 70 + digest[8] % 150),
    ]
    centers = [
        (
            (digest[9 + i * 3] / 255) * width,
            (digest[10 + i * 3] / 255) * height,
            width * (0.16 + digest[11 + i * 3] / 700),
        )
        for i in range(4)
    ]
    rows = []
    for y in range(height):
        row = bytearray([0])
        vertical = y / max(1, height - 1)
        for x in range(width):
            horizontal = x / max(1, width - 1)
            blend = (horizontal * 0.55 + vertical * 0.45)
            rgb = [
                int(colors[0][channel] * (1 - blend) + colors[1][channel] * blend)
                for channel in range(3)
            ]
            for idx, (cx, cy, radius) in enumerate(centers):
                distance = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                glow = max(0.0, 1.0 - distance / radius) ** 2
                accent = colors[2 if idx % 2 == 0 else 1]
                for channel in range(3):
                    rgb[channel] = min(255, int(rgb[channel] + accent[channel] * glow * 0.55))
            grain = ((x * 17 + y * 31 + digest[(x + y) % len(digest)]) % 13) - 6
            row.extend(max(0, min(255, value + grain)) for value in rgb)
        rows.append(bytes(row))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(b"".join(rows), 7))
        + _png_chunk(b"IEND", b"")
    )


def _generate_local_image(prompt, out_path):
    """Try a local diffusion server, then guarantee a deterministic PNG."""
    base_url = os.environ.get("LOCAL_IMAGE_URL", "http://127.0.0.1:7860").strip().rstrip("/")
    try:
        import requests
    except ImportError:
        requests = None
    if base_url and requests is not None:
        try:
            health = requests.get(f"{base_url}/sdapi/v1/options", timeout=1.5)
            if health.ok:
                response = requests.post(
                    f"{base_url}/sdapi/v1/txt2img",
                    json={
                        "prompt": prompt,
                        "negative_prompt": "text, watermark, logo, low detail",
                        "steps": 22,
                        "width": 768,
                        "height": 768,
                        "sampler_name": "DPM++ 2M",
                    },
                    timeout=180,
                )
                if response.ok:
                    images = response.json().get("images") or []
                    if images:
                        raw = base64.b64decode(images[0].split(",", 1)[-1])
                        ext, validated = _validate_image_bytes(raw)
                        png_bytes = _convert_to_png_bytes(validated, ext)
                        out_path.parent.mkdir(parents=True, exist_ok=True)
                        out_path.write_bytes(png_bytes)
                        return None
        except Exception:
            pass

    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(_procedural_image_bytes(prompt))
        return None
    except Exception as exc:
        return f"local procedural image failed: {exc}"


def _generate_openai_image(prompt, out_path):
    import requests
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return "OpenAI image provider selected, but OPENAI_API_KEY is not configured"
    resp = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": "gpt-image-1", "prompt": prompt, "size": "1024x1024", "n": 1},
        timeout=120,
    )
    if not resp.ok:
        return f"image API error ({resp.status_code})"

    data = resp.json()
    items = data.get("data") or []
    if not items:
        return "image API returned no data"

    item = items[0]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        img_resp = requests.get(item["url"], timeout=60)
        img_resp.raise_for_status()
        raw = img_resp.content
    else:
        return "image API response missing b64_json and url"
    try:
        ext, validated = _validate_image_bytes(raw)
        out_path.write_bytes(_convert_to_png_bytes(validated, ext))
    except ValueError as exc:
        return f"image API returned invalid image data: {exc}"

    db.log_api_usage("openai:gpt-image-1", 4000, 0)
    return None


def _generate_image(prompt, out_path):
    """Generate with the configured provider and persist under the durable image cache."""
    provider = _image_provider()
    if provider == "openai":
        if not os.environ.get("OPENAI_API_KEY", "").strip():
            return "OpenAI image provider selected, but OPENAI_API_KEY is not configured"
        ok, reason = _image_budget_ok()
        return _generate_openai_image(prompt, out_path) if ok else reason

    local_error = _generate_local_image(prompt, out_path)
    if not local_error:
        return None
    if provider == "auto" and os.environ.get("OPENAI_API_KEY", "").strip():
        ok, reason = _image_budget_ok()
        return _generate_openai_image(prompt, out_path) if ok else reason
    return local_error


def _prompt_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def illustrate_portrait(character_id, regenerate=False):
    """Generate and persist a character portrait. Returns {path} or {reason}."""
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    character_id = (character_id or "").strip()
    if not character_id:
        return {"reason": "character_id is required"}

    state = db.rp_get_state()
    desc = _character_description(state, character_id)
    prompt = f"{PORTRAIT_STYLE}. Character: {desc}."
    prompt_hash = _prompt_hash(prompt)

    existing = db.rp_portrait_for_character(character_id)
    if existing and not regenerate:
        stored_hash = existing.get("prompt_hash")
        cached_path = existing.get("path") or f"portraits/{character_id}.png"
        if (not stored_hash or stored_hash == prompt_hash) and image_cached(cached_path):
            return {"path": cached_path, "cached": True, "ok": True, "url": _image_public_url(cached_path)}

    if _image_daily_limit_reached():
        return {"reason": f"daily image cap reached ({SCENES_DAILY_CAP} images per day)"}

    _ensure_image_dirs()
    out_path = PORTRAITS_DIR / f"{character_id}.png"
    err = _generate_image(prompt, out_path)
    if err:
        return {"reason": err}

    rel_path = f"portraits/{character_id}.png"
    try:
        if existing:
            db.rp_update_portrait(character_id, rel_path, prompt_hash)
        else:
            db.rp_save_portrait(character_id, rel_path, prompt_hash)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            existing = db.rp_portrait_for_character(character_id)
            if existing:
                return {"path": existing["path"]}
        raise
    return {"path": rel_path, "cached": False, "ok": True, "url": _image_public_url(rel_path)}


def list_portrait_urls():
    return [
        {"character_id": p["character_id"], "url": _image_public_url(p["path"])}
        for p in db.rp_list_portraits()
        if image_cached(p.get("path"))
    ]


def illustrate_item(item_id, regenerate=False):
    """Generate and persist an inventory item icon. Returns {path} or {reason}."""
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    item_id = (item_id or "").strip()
    if not item_id:
        return {"reason": "item_id is required"}

    state = db.rp_get_state()
    desc = _item_description(state, item_id)
    prompt = f"{ITEM_STYLE}. Item: {desc}."
    prompt_hash = _prompt_hash(prompt)

    existing = db.rp_item_for_id(item_id)
    if existing and not regenerate:
        stored_hash = existing.get("prompt_hash")
        cached_path = existing.get("path") or f"items/{item_id}.png"
        if (not stored_hash or stored_hash == prompt_hash) and image_cached(cached_path):
            return {"path": cached_path, "cached": True, "ok": True, "url": _image_public_url(cached_path)}

    if _image_daily_limit_reached():
        return {"reason": f"daily image cap reached ({SCENES_DAILY_CAP} images per day)"}

    _ensure_image_dirs()
    out_path = ITEMS_DIR / f"{item_id}.png"
    err = _generate_image(prompt, out_path)
    if err:
        return {"reason": err}

    rel_path = f"items/{item_id}.png"
    try:
        if existing:
            db.rp_update_item(item_id, rel_path, prompt_hash)
        else:
            db.rp_save_item(item_id, rel_path, prompt_hash)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            existing = db.rp_item_for_id(item_id)
            if existing:
                return {"path": existing["path"]}
        raise
    return {"path": rel_path, "cached": False, "ok": True, "url": _image_public_url(rel_path)}


def list_item_urls():
    return [
        {"item_id": i["item_id"], "url": _image_public_url(i["path"])}
        for i in db.rp_list_items()
        if image_cached(i.get("path"))
    ]


def get_map_info():
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    state = db.rp_get_state() or {}
    game_map = _filter_map_for_player(state.get("map") or {})
    meta = state.get("_meta") or {}
    map_rel = meta.get("map_image") or "scenes/world-map.png"
    if image_cached(map_rel):
        image = _image_public_url(map_rel)
    elif image_cached("scenes/world-map.png"):
        image = _image_public_url("scenes/world-map.png")
    elif image_cached("scenes/world-map.jpg"):
        image = _image_public_url("scenes/world-map.jpg")
    else:
        image = None
    return {
        "ready": True,
        "image": image,
        "locations": game_map.get("locations", []),
        "discovered": game_map.get("discovered", []),
        "current_location_id": game_map.get("current_location_id"),
        "routes": game_map.get("routes", []),
    }


def generate_map(regenerate=False):
    """Generate world-map.png (budget-gated). Returns {path} or {reason}."""
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    if image_cached("scenes/world-map.png") and not regenerate:
        return {"path": "scenes/world-map.png", "cached": True, "ok": True,
                "url": _image_public_url("scenes/world-map.png")}

    if regenerate:
        _unlink_static_rel("scenes/world-map.png")
        _unlink_static_rel("scenes/world-map.jpg")

    if _image_daily_limit_reached():
        return {"reason": f"daily image cap reached ({SCENES_DAILY_CAP} images per day)"}

    state = db.rp_get_state() or {}
    game_map = _filter_map_for_player(state.get("map") or {})
    loc_names = [
        f"{loc.get('name', loc.get('id', ''))}"
        for loc in (game_map.get("locations") or [])[:12]
        if isinstance(loc, dict)
    ]
    loc_hint = ", ".join(loc_names) if loc_names else "fantasy ruins and tower regions"
    prompt = f"{MAP_STYLE}. Regions include: {loc_hint}."

    _ensure_image_dirs()
    err = _generate_image(prompt, WORLD_MAP_PATH)
    if err:
        return {"reason": err}
    return {"path": "scenes/world-map.png", "ok": True, "cached": False,
            "url": _image_public_url("scenes/world-map.png")}


_BEND_BASE = {
    "cosmetic": lambda age: 10 + 2 * age,
    "minor": lambda age: 30 + 5 * age,
    "relationship": lambda age: 80 + 10 * age,
    "major": lambda age: 180 + 25 * age,
}


def _compute_bend_price(classified):
    severity = str(classified.get("severity", "minor")).lower()
    if severity not in _BEND_BASE:
        severity = "minor"
    scene_age = max(0, int(classified.get("scene_age") or 0))
    price = float(_BEND_BASE[severity](scene_age))
    if classified.get("affects_other_character"):
        price *= 1.5
    if classified.get("removes_consequence"):
        price *= 2.0
    if classified.get("clarifies_ambiguity"):
        price *= 0.5
    return severity, int(round(price))


def _fallback_bend_classification(request_text, message_count):
    """Heuristic classifier when AI is unavailable."""
    text = request_text.lower()
    scene_age = min(message_count, 20)
    severity = "minor"
    if any(w in text for w in ("actually", "kindly", "recognized", "remembered", "clarif")):
        severity = "relationship"
    if any(w in text for w in ("never happened", "undo", "erase", "remove consequence")):
        severity = "major"
    if any(w in text for w in ("color", "appearance", "detail", "cosmetic")):
        severity = "cosmetic"
    return {
        "severity": severity,
        "scene_age": scene_age,
        "affects_other_character": any(w in text for w in ("guard", "npc", "ally", "character", "they", "he ", "she ")),
        "removes_consequence": "remove" in text or "never" in text,
        "clarifies_ambiguity": any(w in text for w in ("actually", "clarif", "meant", "recognized")),
        "blocked": False,
        "before_after_summary": f"Retroactive clarification: {request_text[:120]}",
    }


def _fairness_warning(classified, severity):
    if classified.get("removes_consequence"):
        return "Removes a consequence — future NPCs may remember the inconsistency."
    if classified.get("affects_other_character"):
        return "Affects another character's agency — they may resist or notice the shift."
    if severity == "major":
        return "Major outcome rewrite — causality debt may surface later in the story."
    if classified.get("clarifies_ambiguity"):
        return "Clarification only — minimal fairness cost."
    if severity == "cosmetic":
        return "Cosmetic change — low impact on story fairness."
    return "Minor retcon — proportionate coin cost applies."


def _affected_scenes_from_request(request_text, limit=5):
    """Return recent GM scene snippets plausibly affected by the bend."""
    messages = db.rp_recent_messages(40)
    gm_msgs = [m for m in messages if m.get("role") == "gm"]
    if not gm_msgs:
        return []
    keywords = {w.lower() for w in re.findall(r"[a-z]{4,}", request_text or "")}
    scored = []
    for msg in reversed(gm_msgs[-20:]):
        content = (msg.get("content") or "")[:300]
        overlap = sum(1 for w in keywords if w in content.lower())
        scored.append((overlap, msg))
    scored.sort(key=lambda x: (-x[0], -x[1].get("id", 0)))
    scenes = []
    for _score, msg in scored[:limit]:
        snippet = (msg.get("content") or "").strip()[:160]
        if snippet:
            scenes.append({
                "message_id": msg.get("id"),
                "world_date": msg.get("world_date"),
                "snippet": snippet,
            })
    if not scenes and gm_msgs:
        last = gm_msgs[-1]
        scenes.append({
            "message_id": last.get("id"),
            "world_date": last.get("world_date"),
            "snippet": (last.get("content") or "")[:160],
        })
    return scenes


def price_bend(request_text):
    """Classify a reality-bend request and return price + metadata."""
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    request_text = (request_text or "").strip()
    if not request_text:
        return {"error": "request is required"}

    recent = _format_messages_for_prompt(db.rp_recent_messages(20))
    bible = _world_bible_excerpt()[:2500]
    state = db.rp_get_state() or {}
    compact = {k: v for k, v in state.items() if k != "_meta"}

    prompt = f"""Classify this reality-bend (plot edit) request for a roleplay game.

World Bible canon excerpt:
{bible}

Current state JSON:
{json.dumps(compact, indent=2)[:3000]}

Recent conversation:
{recent}

Bend request:
{request_text}

Respond with ONLY JSON:
{{
  "severity": "cosmetic|minor|relationship|major",
  "scene_age": <integer: messages since the referenced event, 0 if current scene>,
  "affects_other_character": true/false,
  "removes_consequence": true/false,
  "clarifies_ambiguity": true/false,
  "blocked": true/false,
  "block_reason": "",
  "affected": "what is changed",
  "before_after_summary": "one sentence before → after"
}}

severity guide: cosmetic=flavor/detail; minor=small convenience; relationship=NPC/quest shift;
major=outcome rewrite. blocked=true ONLY if request contradicts hard canon from World Bible."""

    try:
        classified = ai.route_json("tasks", prompt, max_tokens=500)
    except Exception as exc:
        print(f"[parallel_life] bend classification AI failed, using heuristic: {exc}")
        classified = _fallback_bend_classification(
            request_text, len(db.rp_recent_messages(500))
        )

    if classified.get("blocked"):
        return {
            "request": request_text,
            "price": 0,
            "severity": classified.get("severity"),
            "summary": classified.get("before_after_summary", ""),
            "before_after_summary": classified.get("before_after_summary", ""),
            "affected_scenes": _affected_scenes_from_request(request_text),
            "fairness_warning": "Blocked — this change contradicts established canon.",
            "blocked": True,
            "block_reason": classified.get("block_reason", "contradicts hard canon"),
        }

    severity, price = _compute_bend_price(classified)
    affected = _affected_scenes_from_request(request_text)
    summary = classified.get("before_after_summary", "")
    warning = _fairness_warning(classified, severity)

    return {
        "request": request_text,
        "price": price,
        "severity": severity,
        "summary": summary,
        "before_after_summary": summary,
        "affected_scenes": affected,
        "fairness_warning": warning,
        "blocked": False,
    }


def _run_bend_background(request_text):
    try:
        state = db.rp_get_state()
        world_date = current_world_date(state)
        compact = {k: v for k, v in state.items() if k != "_meta"}

        prompt = f"""You are the GM for Parallel. The player spent coins to BEND REALITY retroactively.

Bend request: {request_text}

Current state JSON:
{json.dumps(compact, indent=2)[:4000]}

Narrate the reality-bend as authoritative GM prose (2-5 sentences): how the world shifts, what is now
true, and the immediate consequence. Honor causality where possible; this is a paid retcon.

Respond with ONLY JSON:
{{
  "gm_narration": "...",
  "state_updates": {{}},
  "journal": [{{"world_date": "{world_date}", "entry": "...", "kind": "bend"}}]
}}"""

        extracted = ai.route_json("tasks", prompt, max_tokens=900)
        narration = (extracted.get("gm_narration") or "").strip()
        if narration:
            bend_text = f"[Reality bends] {narration}"
            db.rp_add_message("gm", bend_text, world_date)

        state = db.rp_get_state()
        journal = extracted.get("journal") or []
        if not journal and narration:
            journal = [{"world_date": world_date, "entry": narration[:200], "kind": "bend"}]
        for entry in journal:
            if isinstance(entry, dict):
                entry["kind"] = "bend"
        extracted["journal"] = journal
        state = _apply_tick_result(state, extracted, world_date)
        db.rp_save_state(state)
    except Exception as exc:
        print(f"[parallel_life] background bend failed: {exc}")
        state = db.rp_get_state()
        world_date = current_world_date(state) if state else None
        db.rp_add_message("gm", f"(the bend falters — {str(exc)[:120]})", world_date)
    finally:
        _set_busy(False)


def confirm_bend(request_text, price):
    """Deduct coins and apply a reality-bend in the background."""
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    request_text = (request_text or "").strip()
    if not request_text:
        return {"error": "request is required"}

    try:
        price = int(price)
    except (TypeError, ValueError):
        return {"error": "price is required"}

    sync_wallet()
    coins = get_coins()
    balance = coins["balance"]
    if balance < price:
        return {"error": "insufficient balance", "balance": balance, "price": price}

    if _is_busy():
        return {"accepted": False, "reason": "the world is still resolving your last action"}

    trimmed = request_text[:120]
    db.coin_ledger_insert(-price, f"Bend Reality: {trimmed}")
    _set_busy(True)
    threading.Thread(target=_run_bend_background, args=(request_text,), daemon=True).start()
    return {"accepted": True, "busy": True, "balance": get_coins()["balance"]}


def play(user_message):
    init = ensure_initialized()
    if not init.get("ready"):
        return init

    user_message = (user_message or "").strip()
    if not user_message:
        return {"error": "message is required"}

    daily_tick()
    state = db.rp_get_state()
    world_date = current_world_date(state)
    db.rp_add_message("user", user_message, world_date)
    gm_msg_id, reply, world_date, _new_items = _complete_play(user_message)

    return {
        "reply": reply,
        "world_date": world_date,
        "state_summary": state_summary(db.rp_get_state()),
        "gm_message_id": gm_msg_id,
    }
