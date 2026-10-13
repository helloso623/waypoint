"""Local online preference learner for section / app routing.

Uses a lightweight exponential moving average (GRU-like gate) over local
signals: mood pulses, explicit agent text rewards, and visited tabs.
No cloud calls — all state lives under WAYPOINT_DATA_DIR.
"""
from __future__ import annotations

import json
import math
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

_PROJECT_DIR = Path(__file__).parent
_DATA_DIR = (
    Path(os.environ["WAYPOINT_DATA_DIR"])
    if os.environ.get("WAYPOINT_DATA_DIR")
    else _PROJECT_DIR
)
_STATE_FILE = _DATA_DIR / "happiness_policy.json"
_lock = threading.RLock()

# Sections the learner can bias toward (matches WORKSPACE_APPS-ish ids / tabs).
DEFAULT_SECTIONS = [
    "Today", "Tasks", "Goals", "Trends",
    "Ideas", "Thinking", "Funny", "Repository",
    "Projects", "Code", "Blueprint",
    "Practice", "Parallel",
    "Contacts", "Agent", "Hub",
]

POS_RE = re.compile(
    r"\b(good|great|love|happy|nice|perfect|thanks|awesome|better|yes|helpful|works)\b",
    re.I,
)
NEG_RE = re.compile(
    r"\b(bad|hate|awful|wrong|broken|worse|no|annoying|useless|frustrated|angry)\b",
    re.I,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_state() -> dict:
    return {
        "version": 1,
        "updated_at": _now(),
        "scores": {s: 0.0 for s in DEFAULT_SECTIONS},
        "visits": {s: 0 for s in DEFAULT_SECTIONS},
        "rewards": [],
        "lr": 0.12,
        "decay": 0.985,
    }


def _load() -> dict:
    if not _STATE_FILE.exists():
        return _default_state()
    try:
        data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        base = _default_state()
        base.update({k: v for k, v in data.items() if k in base or k in ("scores", "visits", "rewards", "lr", "decay", "updated_at", "version")})
        for s in DEFAULT_SECTIONS:
            base["scores"].setdefault(s, 0.0)
            base["visits"].setdefault(s, 0)
        return base
    except Exception:
        return _default_state()


def _save(state: dict) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = _now()
    tmp = _STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(_STATE_FILE)


def _gru_step(prev: float, reward: float, lr: float, decay: float) -> float:
    """Tiny gated update: update gate mixes new reward; decay forgets slowly."""
    z = 1.0 / (1.0 + math.exp(-(reward)))  # update gate in (0,1)
    blended = (1 - z) * prev + z * reward
    return decay * ((1 - lr) * prev + lr * blended)


def reward_from_text(text: str) -> float:
    """Map free-text feedback to a scalar reward in [-1, 1]."""
    text = (text or "").strip()
    if not text:
        return 0.0
    pos = len(POS_RE.findall(text))
    neg = len(NEG_RE.findall(text))
    if pos == 0 and neg == 0:
        return 0.05  # mild engage signal for any feedback
    raw = (pos - neg) / max(pos + neg, 1)
    return max(-1.0, min(1.0, raw))


def observe_pulse(happiness: int, energy: int | None = None, section: str | None = None) -> dict:
    """Online update from a mood pulse (happiness 1-10)."""
    h = max(1, min(10, int(happiness)))
    # Center around 6 → reward in [-1, 1]
    reward = (h - 6) / 4.0
    if energy is not None:
        e = max(1, min(10, int(energy)))
        reward = 0.7 * reward + 0.3 * ((e - 6) / 4.0)
    target = section if section in DEFAULT_SECTIONS else "Today"
    return apply_reward(target, reward, source="pulse", note=f"happiness={h}")


def apply_reward(section: str, reward: float, *, source: str = "manual", note: str = "") -> dict:
    with _lock:
        state = _load()
        section = section if section in state["scores"] else "Today"
        reward = max(-1.0, min(1.0, float(reward)))
        prev = float(state["scores"].get(section, 0.0))
        state["scores"][section] = _gru_step(prev, reward, float(state["lr"]), float(state["decay"]))
        state["visits"][section] = int(state["visits"].get(section, 0)) + 1
        state["rewards"].append(
            {
                "at": _now(),
                "section": section,
                "reward": round(reward, 4),
                "source": source,
                "note": (note or "")[:200],
            }
        )
        state["rewards"] = state["rewards"][-400:]
        _save(state)
        return suggest(state)


def observe_text_feedback(text: str, section: str | None = None) -> dict:
    reward = reward_from_text(text)
    return apply_reward(section or "Agent", reward, source="agent_text", note=text[:160])


def observe_visit(section: str) -> dict:
    with _lock:
        state = _load()
        if section in state["visits"]:
            state["visits"][section] = int(state["visits"].get(section, 0)) + 1
            # Mild positive for returning to a section (engagement).
            prev = float(state["scores"].get(section, 0.0))
            state["scores"][section] = _gru_step(prev, 0.08, float(state["lr"]) * 0.5, float(state["decay"]))
            _save(state)
        return suggest(state)


def suggest(state: dict | None = None) -> dict:
    with _lock:
        state = state or _load()
        ranked = sorted(
            state["scores"].items(),
            key=lambda kv: (kv[1], state["visits"].get(kv[0], 0)),
            reverse=True,
        )
        top = [{"section": s, "score": round(v, 4), "visits": state["visits"].get(s, 0)} for s, v in ranked[:8]]
        return {
            "updated_at": state.get("updated_at"),
            "top_sections": top,
            "recommended": top[0]["section"] if top else "Today",
            "method": "local-gru-ema",
        }
