"""Companion chat history and titled memories under WAYPOINT_DATA_DIR."""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

_DATA_DIR = (
    Path(os.environ["WAYPOINT_DATA_DIR"])
    if os.environ.get("WAYPOINT_DATA_DIR")
    else Path(__file__).parent
)
COMPANION_DIR = _DATA_DIR / "companion"
HISTORY_FILE = COMPANION_DIR / "chat_history.json"
MEMORIES_FILE = COMPANION_DIR / "memories.json"
MAX_HISTORY = 400
MAX_MEMORIES = 300
CONTEXT_WINDOW_MESSAGES = 120
CONTEXT_MEMORY_LIMIT = 20
TITLE_MAX = 300
BODY_MAX = 4000
SPEAKER_MAX = 120
QUOTE_MAX = 800
CHAT_CONTENT_MAX = 8000
DEFAULT_RECALL_WEIGHT = 1.0
CORE_RECALL_WEIGHT = 1.0
DECAY_PER_DAY = 0.015
MIN_RECALL_WEIGHT = 0.05
FORGET_THRESHOLD = 0.08
# Minimum relevance score to treat a memory as related to the current action/query.
RELEVANCE_FLOOR = 0.55

ROUTE_FAST = "fast"
ROUTE_NORMAL = "normal"
ROUTE_STRONG = "strong"
VALID_ROUTE_STRENGTHS = frozenset({ROUTE_FAST, ROUTE_NORMAL, ROUTE_STRONG})

# fast = chat only; normal/strong = agent tools that auto-apply ordinary writes.
# Deletes, create_situation, and repeated-title warnings still confirm regardless of route.
TOOL_POLICY_NONE = "none"
TOOL_POLICY_CONFIRM = "confirm"
TOOL_POLICY_AUTO = "auto"

_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it", "my", "me",
    "you", "we", "i", "this", "that", "with", "at", "as", "be", "by", "from", "are", "was",
    "do", "if", "not", "your", "our", "their", "they", "he", "she", "his", "her", "its",
    "can", "will", "just", "have", "has", "had", "been", "but", "so", "than", "then",
    "about", "into", "over", "also", "any", "all", "some", "more", "most", "very", "too",
    "here", "there", "what", "when", "where", "who", "how", "why", "which", "please",
    "thanks", "thank", "ok", "okay", "yes", "no", "hey", "hi", "hello", "user", "page",
    "route", "fast", "normal", "strong", "companion", "memories", "context", "primary",
    "actions", "why", "help", "make", "use", "using", "add", "create", "update", "set",
})

_TOKEN_RE = re.compile(r"[a-z0-9_]{2,}")


def normalize_route_strength(value) -> str:
    route = str(value or ROUTE_NORMAL).strip().lower()
    return route if route in VALID_ROUTE_STRENGTHS else ROUTE_NORMAL


def tool_policy_for_route(route_strength: str) -> str:
    route = normalize_route_strength(route_strength)
    if route == ROUTE_FAST:
        return TOOL_POLICY_NONE
    return TOOL_POLICY_AUTO


def uses_agent_tools(route_strength: str) -> bool:
    return tool_policy_for_route(route_strength) != TOOL_POLICY_NONE


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_ts(value) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _days_since(ts: str | None) -> float:
    dt = _parse_ts(ts)
    if not dt:
        return 0.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    return max(0.0, delta.total_seconds() / 86400.0)


def _ensure_dir() -> None:
    COMPANION_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, default):
    try:
        if path.is_file():
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
    except Exception:
        pass
    return default


def _write_json(path: Path, data) -> None:
    _ensure_dir()
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)


def tokenize(text: str) -> set[str]:
    words = _TOKEN_RE.findall((text or "").lower())
    return {w for w in words if w not in _STOPWORDS and not w.isdigit()}


def _normalize_memory(entry: dict, *, decay: bool = True) -> dict:
    item = dict(entry or {})
    item.setdefault("id", uuid.uuid4().hex[:12])
    item["title"] = str(item.get("title") or "Untitled").strip()[:TITLE_MAX] or "Untitled"
    item["body"] = str(item.get("body") or "").strip()[:BODY_MAX]
    if item.get("speaker"):
        item["speaker"] = str(item["speaker"])[:SPEAKER_MAX]
    if item.get("quote"):
        item["quote"] = str(item["quote"])[:QUOTE_MAX]
    item.setdefault("created_at", _now())
    item.setdefault("updated_at", item["created_at"])
    item.setdefault("reinforced_at", item.get("updated_at") or item["created_at"])
    item.setdefault("core", bool(item.get("core")))
    try:
        weight = float(item.get("recall_weight", DEFAULT_RECALL_WEIGHT))
    except (TypeError, ValueError):
        weight = DEFAULT_RECALL_WEIGHT
    if decay and not item.get("core"):
        days = _days_since(item.get("reinforced_at"))
        if days > 0:
            weight = max(MIN_RECALL_WEIGHT, weight - (DECAY_PER_DAY * days))
    item["recall_weight"] = round(max(MIN_RECALL_WEIGHT, min(1.0, weight)), 3)
    return item


def _load_memories_raw() -> list:
    data = _read_json(MEMORIES_FILE, {"memories": []})
    memories = data.get("memories") if isinstance(data, dict) else []
    if not isinstance(memories, list):
        return []
    return memories


def _save_memories(memories: list) -> list:
    normalized = [_normalize_memory(m, decay=False) for m in memories if isinstance(m, dict)]
    normalized = normalized[-MAX_MEMORIES:]
    _write_json(MEMORIES_FILE, {"updated_at": _now(), "memories": normalized})
    return normalized


def get_chat_history() -> dict:
    data = _read_json(HISTORY_FILE, {"messages": []})
    messages = data.get("messages") if isinstance(data, dict) else []
    if not isinstance(messages, list):
        messages = []
    return {"messages": messages[-MAX_HISTORY:], "updated_at": data.get("updated_at")}


def save_chat_history(messages: list) -> list:
    cleaned = []
    for item in messages or []:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        entry = {"role": role, "content": content[:CHAT_CONTENT_MAX]}
        if item.get("speaker"):
            entry["speaker"] = str(item["speaker"])[:SPEAKER_MAX]
        steps = item.get("steps")
        if isinstance(steps, list) and steps:
            entry["steps"] = [str(s)[:500] for s in steps[:20]]
        cleaned.append(entry)
    trimmed = cleaned[-MAX_HISTORY:]
    _write_json(HISTORY_FILE, {"updated_at": _now(), "messages": trimmed})
    return trimmed


def append_chat_turn(role: str, content: str, speaker: str | None = None, **extras) -> list:
    history = get_chat_history().get("messages") or []
    entry: dict = {"role": role, "content": str(content or "").strip()[:CHAT_CONTENT_MAX]}
    if speaker:
        entry["speaker"] = str(speaker)[:SPEAKER_MAX]
    entry.update({k: v for k, v in extras.items() if k not in entry})
    history.append(entry)
    return save_chat_history(history)[-CONTEXT_WINDOW_MESSAGES:]


def get_memories(*, apply_decay: bool = True, include_forgotten: bool = True) -> list:
    memories = [_normalize_memory(m, decay=apply_decay) for m in _load_memories_raw()]
    if include_forgotten:
        return memories[-MAX_MEMORIES:]
    return [m for m in memories if m.get("recall_weight", 0) >= FORGET_THRESHOLD][-MAX_MEMORIES:]


def memory_blob(memory: dict) -> str:
    return " ".join(
        str(memory.get(k) or "")
        for k in ("title", "body", "speaker", "quote")
    )


def score_memory_relevance(memory: dict, query_tokens: set[str]) -> float:
    """Higher = more related to the current query/action."""
    weight = float(memory.get("recall_weight") or 0)
    core_bonus = 0.4 if memory.get("core") else 0.0
    if not query_tokens:
        return weight + core_bonus
    blob = memory_blob(memory).lower()
    mem_tokens = tokenize(blob)
    if not mem_tokens and not blob:
        return 0.0
    overlap = len(query_tokens & mem_tokens)
    soft = 0.0
    if overlap == 0:
        soft = sum(0.55 for t in query_tokens if len(t) >= 3 and t in blob)
        if soft <= 0:
            return 0.0
    return (overlap * 1.75) + soft + weight + core_bonus


def get_memories_for_context(
    limit: int = CONTEXT_MEMORY_LIMIT,
    query: str | None = None,
    *,
    prefer_relevant: bool = True,
) -> list:
    """Pick memories for injection. When query is set, rank by relevance to that text/action."""
    memories = get_memories(apply_decay=True, include_forgotten=False)
    if not memories:
        return []
    limit = max(1, int(limit or CONTEXT_MEMORY_LIMIT))
    q_tokens = tokenize(query or "") if prefer_relevant else set()

    if q_tokens:
        scored = []
        for item in memories:
            score = score_memory_relevance(item, q_tokens)
            if score >= RELEVANCE_FLOOR:
                scored.append((score, item))
        scored.sort(
            key=lambda pair: (
                pair[0],
                float(pair[1].get("recall_weight") or 0),
                pair[1].get("reinforced_at") or "",
            ),
            reverse=True,
        )
        picked = [item for _, item in scored[:limit]]
        # Keep a few durable cores visible even when the query is sparse.
        if len(picked) < min(4, limit):
            have = {m.get("id") for m in picked}
            cores = sorted(
                [m for m in memories if m.get("core") and m.get("id") not in have],
                key=lambda m: float(m.get("recall_weight") or 0),
                reverse=True,
            )
            for item in cores:
                picked.append(item)
                if len(picked) >= min(4, limit):
                    break
        return picked[:limit]

    ranked = sorted(
        memories,
        key=lambda m: (
            1 if m.get("core") else 0,
            float(m.get("recall_weight") or 0),
            m.get("reinforced_at") or "",
        ),
        reverse=True,
    )
    return ranked[:limit]


def format_memory_bits(memories: list) -> list[str]:
    bits = []
    for item in memories or []:
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()
        speaker = str(item.get("speaker") or "").strip()
        if speaker:
            if title and body:
                bits.append(f"{speaker} said: {title}: {body}")
            elif title:
                bits.append(f"{speaker} said: {title}")
        elif title and body:
            bits.append(f"You: {title}: {body}")
        elif title:
            bits.append(title)
    return bits


def build_memory_context_prefix(
    limit: int = CONTEXT_MEMORY_LIMIT,
    query: str | None = None,
) -> str:
    ranked = get_memories_for_context(limit=limit, query=query)
    bits = format_memory_bits(ranked)
    if not bits:
        return ""
    return (
        "[Companion memories — auto-recalled for this turn/action; apply before acting when relevant; "
        f"do not wait for the user to ask: {'; '.join(bits)}] "
    )


def memories_for_action(action_text: str, limit: int = 5) -> list:
    """Memories related to an imminent tool/action payload (title, notes, name, etc.)."""
    return get_memories_for_context(limit=limit, query=action_text, prefer_relevant=True)


def attach_recalled_memories(payload: dict | None, action_text: str, *, limit: int = 5) -> dict:
    """Annotate a tool result / confirmation with related memories (before/with the action)."""
    result = dict(payload or {})
    recalled = memories_for_action(action_text, limit=limit)
    if not recalled:
        return result
    # Only attach memories that actually scored as related (skip pure core-fill).
    q_tokens = tokenize(action_text or "")
    related = []
    for item in recalled:
        if q_tokens and score_memory_relevance(item, q_tokens) < RELEVANCE_FLOOR:
            continue
        related.append({
            "id": item.get("id"),
            "title": item.get("title"),
            "body": item.get("body"),
            "speaker": item.get("speaker"),
            "core": bool(item.get("core")),
        })
    if not related:
        return result
    result["recalled_memories"] = related
    result["recalled_note"] = (
        "Auto-recalled before this action — incorporate if relevant; "
        "do not wait for the user to ask about these."
    )
    return result


def add_memory(title: str, body: str = "", *, core: bool = False, speaker: str | None = None, quote: str | None = None) -> dict:
    return _add_memory_entry(title, body, core=core, speaker=speaker, quote=quote)


def add_core_memory(title: str, body: str = "", *, speaker: str | None = None, quote: str | None = None) -> dict:
    return _add_memory_entry(title, body, core=True, speaker=speaker, quote=quote)


def _add_memory_entry(title: str, body: str, *, core: bool, speaker: str | None = None, quote: str | None = None) -> dict:
    entry = {
        "id": uuid.uuid4().hex[:12],
        "title": str(title or "Untitled").strip()[:TITLE_MAX] or "Untitled",
        "body": str(body or "").strip()[:BODY_MAX],
        "created_at": _now(),
        "updated_at": _now(),
        "reinforced_at": _now(),
        "recall_weight": CORE_RECALL_WEIGHT if core else DEFAULT_RECALL_WEIGHT,
        "core": core,
    }
    if speaker:
        entry["speaker"] = str(speaker)[:SPEAKER_MAX]
    if quote:
        entry["quote"] = str(quote)[:QUOTE_MAX]
    memories = get_memories(apply_decay=False)
    memories.append(entry)
    _save_memories(memories)
    return entry


def update_memory(memory_id: str, title: str | None = None, body: str | None = None, *, reinforce: bool = True) -> dict:
    memory_id = (memory_id or "").strip()
    memories = get_memories(apply_decay=False)
    found = None
    for item in memories:
        if item.get("id") != memory_id:
            continue
        if title is not None:
            item["title"] = str(title or "Untitled").strip()[:TITLE_MAX] or "Untitled"
        if body is not None:
            item["body"] = str(body or "").strip()[:BODY_MAX]
        item["updated_at"] = _now()
        if reinforce:
            item["reinforced_at"] = _now()
            try:
                weight = float(item.get("recall_weight", DEFAULT_RECALL_WEIGHT))
            except (TypeError, ValueError):
                weight = DEFAULT_RECALL_WEIGHT
            item["recall_weight"] = round(min(1.0, weight + 0.2), 3)
        found = item
        break
    if not found:
        return {"ok": False, "error": "memory not found"}
    _save_memories(memories)
    return {"ok": True, "memory": found}


def reinforce_memory(memory_id: str) -> dict:
    return update_memory(memory_id, reinforce=True)


def delete_memory(memory_id: str) -> dict:
    memory_id = (memory_id or "").strip()
    before = len(get_memories(apply_decay=False))
    memories = [m for m in get_memories(apply_decay=False) if m.get("id") != memory_id]
    _save_memories(memories)
    return {"ok": True, "deleted": memory_id, "removed": before - len(memories)}
