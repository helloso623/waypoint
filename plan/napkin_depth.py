"""Third napkin pass: real integrations, stoppable jobs, upgrades, analysis."""
from __future__ import annotations

import json
import math
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import db
import napkin_remaining

SKIN_POWERS = {
    "ember": {"coin_mult": 1.18, "label": "Forge yield: +18% day coins"},
    "glow": {"coin_mult": 1.1, "label": "Solar mint: +10% day coins"},
    "volt": {"arcade_depth": 2, "label": "Arcade thinks two plies deeper"},
    "frost": {"pity_bonus": 2, "label": "Pity climbs twice as fast"},
    "aurora": {"forecast_extra": 3, "label": "+3 day forecast horizon"},
    "bloom": {"paint_bonus": 0.25, "label": "Painted hours mint more"},
    "tide": {"cart_hint": True, "label": "Cart orchestrator surfaces cheaper finds"},
    "void": {"rag_k": 8, "label": "Napkin RAG retrieves more notes"},
    "prism": {"coin_mult": 1.25, "forecast_extra": 7, "label": "Sovereign: coins + forecast"},
    "signal": {"preflight_discount": 0.15, "label": "Predicted token cost shown 15% kinder"},
    "pulse": {"streak_coins": 4, "label": "Pulse streak pays extra coins"},
    "magma": {"chest_extra": 1, "label": "Caches drop one extra common"},
    "chrome": {"hud_compact": True, "label": "HUD stays quiet"},
    "sand": {"paint_bonus": 0.1, "label": "Survey bonus on painted hours"},
    "sparkle": {"luck": 0.01, "label": "Tiny luck bump on caches"},
}

UPGRADES = (
    {"id": "luck", "name": "Lucky compass", "cost": 80, "effect": "pity", "note": "Each cache tick adds extra pity."},
    {"id": "yield", "name": "Day mint", "cost": 60, "effect": "coins", "note": "+20% coins from the day formula."},
    {"id": "brain", "name": "Arcade brain", "cost": 90, "effect": "arcade", "note": "Local chess/Go search one ply deeper."},
    {"id": "lens", "name": "Quartz lens", "cost": 70, "effect": "forecast", "note": "Month outlook uses a wider window."},
    {"id": "pouch", "name": "Ticket pouch", "cost": 50, "effect": "tickets", "note": "Arcade clears mint a ticket."},
)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _integration_payload(name):
    settings = db.get_settings()
    raw = settings.get(f"integration_{name}") or ""
    if isinstance(raw, dict):
        return raw
    text = str(raw).strip()
    if not text:
        extras = {}
        if name == "claude":
            extras["token"] = settings.get("anthropic_api_key") or ""
        if name == "chatgpt":
            extras["token"] = settings.get("openai_api_key") or ""
        if name == "obsidian":
            extras["path"] = settings.get("obsidian_vault_path") or ""
        return extras
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {"token": text}


def _http_json(url, headers=None, timeout=8):
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(4000)
            status = getattr(resp, "status", 200)
            try:
                data = json.loads(body.decode("utf-8", "replace") or "{}")
            except json.JSONDecodeError:
                data = {"raw": body.decode("utf-8", "replace")[:400]}
            return {"ok": 200 <= status < 300, "status": status, "data": data}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "error": str(exc.reason)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def use_integration(name, action="", payload=None):
    """Run a saved SDK/token against the real service. Never executes shell."""
    name = str(name or "").strip().lower()
    known = {item["id"] for item in napkin_remaining.INTEGRATIONS}
    if name not in known:
        return {"error": "unknown integration", "id": name}
    cfg = _integration_payload(name)
    token = str(cfg.get("token") or "").strip()
    action = str(action or "status").strip().lower() or "status"
    payload = payload if isinstance(payload, dict) else {}

    if name == "obsidian":
        vault = Path(str(cfg.get("path") or token or "")).expanduser()
        if not vault.exists():
            return {"ok": False, "id": name, "error": "vault path missing or not found"}
        files = []
        for path in vault.rglob("*.md"):
            files.append(str(path.relative_to(vault)))
            if len(files) >= 40:
                break
        return {"ok": True, "id": name, "action": action, "files": files, "count": len(files)}

    if name in ("vscode", "cursor", "codex"):
        if not token:
            return {"ok": False, "id": name, "error": "paste a token or binary path in Settings"}
        return {
            "ok": True,
            "id": name,
            "action": action,
            "configured": True,
            "note": "Token stored. Agent can propose_command / propose_file_edit using this toolchain; nothing is executed without your confirm.",
        }

    if name == "n8n":
        base = str(payload.get("url") or cfg.get("url") or "http://127.0.0.1:5678").rstrip("/")
        if not token:
            return {"ok": False, "id": name, "error": "n8n API key missing"}
        probe = _http_json(f"{base}/api/v1/workflows?limit=5", {"X-N8N-API-KEY": token})
        return {"ok": probe.get("ok"), "id": name, "action": action, "result": probe}

    if name == "huggingface":
        if not token:
            return {"ok": False, "id": name, "error": "Hugging Face token missing"}
        probe = _http_json("https://huggingface.co/api/whoami-v2", {"Authorization": f"Bearer {token}"})
        return {"ok": probe.get("ok"), "id": name, "action": action, "result": probe}

    if name == "claude":
        if not token:
            return {"ok": False, "id": name, "error": "Anthropic key missing"}
        probe = _http_json(
            "https://api.anthropic.com/v1/models",
            {"x-api-key": token, "anthropic-version": "2023-06-01"},
        )
        return {"ok": probe.get("ok"), "id": name, "action": action, "result": probe}

    if name == "chatgpt":
        if not token:
            return {"ok": False, "id": name, "error": "OpenAI key missing"}
        probe = _http_json("https://api.openai.com/v1/models", {"Authorization": f"Bearer {token}"})
        return {"ok": probe.get("ok"), "id": name, "action": action, "result": probe}

    return {"ok": bool(token), "id": name, "configured": bool(token), "action": action}


def load_upgrades():
    settings = db.get_settings()
    raw = settings.get("loot_upgrades") or "[]"
    try:
        owned = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        owned = []
    if not isinstance(owned, list):
        owned = []
    return [str(item) for item in owned]


def list_upgrades():
    owned = set(load_upgrades())
    return [{**item, "owned": item["id"] in owned} for item in UPGRADES]


def buy_upgrade(upgrade_id, coins=0):
    upgrade_id = str(upgrade_id or "").strip()
    match = next((item for item in UPGRADES if item["id"] == upgrade_id), None)
    if not match:
        return {"error": "unknown upgrade"}
    owned = load_upgrades()
    if upgrade_id in owned:
        return {"ok": True, "already": True, "id": upgrade_id}
    if int(coins or 0) < match["cost"]:
        return {"error": "not enough coins", "cost": match["cost"], "have": int(coins or 0)}
    owned.append(upgrade_id)
    db.save_settings({"loot_upgrades": json.dumps(owned)})
    return {"ok": True, "id": upgrade_id, "owned": owned, "spent": match["cost"]}


def active_skin_id():
    state = napkin_remaining.load_loot_state() or {}
    return str(state.get("activeSkin") or "trailblazer")


def skin_power(skin_id=None):
    skin_id = skin_id or active_skin_id()
    power = dict(SKIN_POWERS.get(skin_id) or {})
    # Fall back to the equipped skin's CSS effect name if loot stored that.
    if not power:
        state = napkin_remaining.load_loot_state() or {}
        effect = str(state.get("skinEffect") or "")
        power = dict(SKIN_POWERS.get(effect) or {})
    owned = set(load_upgrades())
    if "yield" in owned:
        power["coin_mult"] = round(float(power.get("coin_mult") or 1) * 1.2, 4)
    if "luck" in owned:
        power["pity_bonus"] = int(power.get("pity_bonus") or 0) + 2
    if "brain" in owned:
        power["arcade_depth"] = int(power.get("arcade_depth") or 1) + 1
    if "lens" in owned:
        power["forecast_extra"] = int(power.get("forecast_extra") or 0) + 4
    if "pouch" in owned:
        power["ticket_on_clear"] = True
    power["skin"] = skin_id
    power.setdefault("coin_mult", 1.0)
    power.setdefault("label", "Starter kit — equip a skin with a power")
    return power


def apply_coin_powers(formula):
    """Multiply a happiness_coin_formula result by equipped skin + upgrades."""
    formula = dict(formula or {})
    power = skin_power()
    mult = float(power.get("coin_mult") or 1)
    paint_bonus = float(power.get("paint_bonus") or 0)
    base = int(formula.get("coins") or 0)
    extra = 0
    parts = list(formula.get("parts") or [])
    if paint_bonus and any(p.get("signal") == "painted_hours" for p in parts):
        extra += int(round(sum(p.get("coins") or 0 for p in parts if p.get("signal") == "painted_hours") * paint_bonus))
        parts.append({"signal": "skin_paint", "value": paint_bonus, "coins": extra})
    boosted = int(round((base + extra) * mult)) if base or extra else 0
    if mult != 1 and boosted:
        parts.append({"signal": "skin_mult", "value": mult, "coins": boosted - base - extra})
    formula["coins"] = boosted
    formula["parts"] = parts
    formula["power"] = {"skin": power.get("skin"), "label": power.get("label"), "mult": mult}
    return formula


def weekday_seasonality(rows, value_key="value"):
    """Mean by weekday (Mon=0). Ignores nulls. Used for Trends + forecast."""
    buckets = [[] for _ in range(7)]
    for row in rows or []:
        raw = row.get("date")
        val = row.get(value_key)
        if raw is None or val is None:
            continue
        try:
            day = datetime.fromisoformat(str(raw)[:10]).weekday()
            buckets[day].append(float(val))
        except (TypeError, ValueError):
            continue
    means = []
    for bucket in buckets:
        means.append(round(sum(bucket) / len(bucket), 4) if bucket else None)
    labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return [{"weekday": i, "label": labels[i], "mean": means[i], "n": len(buckets[i])} for i in range(7)]


def residual_band(values, window=7):
    """Simple residual std around a moving mean — confidence ribbon, not a toy slope."""
    clean = [None if v is None else float(v) for v in values or []]
    n = len(clean)
    if n < 3:
        return {"std": 0, "lo": [], "hi": []}
    lo, hi = [], []
    residuals = []
    for i, val in enumerate(clean):
        if val is None:
            lo.append(None)
            hi.append(None)
            continue
        start = max(0, i - window)
        chunk = [clean[j] for j in range(start, i + 1) if clean[j] is not None]
        mean = sum(chunk) / len(chunk)
        residuals.append(val - mean)
        spread = (sum((x - mean) ** 2 for x in chunk) / max(1, len(chunk) - 1)) ** 0.5
        lo.append(round(mean - 1.28 * spread, 4))
        hi.append(round(mean + 1.28 * spread, 4))
    std = round((sum(r * r for r in residuals) / max(1, len(residuals))) ** 0.5, 4) if residuals else 0
    return {"std": std, "lo": lo, "hi": hi}


def pearson(xs, ys):
    pairs = [(float(a), float(b)) for a, b in zip(xs, ys) if a is not None and b is not None]
    n = len(pairs)
    if n < 4:
        return None
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    cov = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    vx = sum((p[0] - mx) ** 2 for p in pairs)
    vy = sum((p[1] - my) ** 2 for p in pairs)
    if vx <= 0 or vy <= 0:
        return None
    return round(cov / math.sqrt(vx * vy), 4)


def analyze_series(rows, value_key="value"):
    values = [row.get(value_key) for row in rows or []]
    return {
        "weekday": weekday_seasonality(rows, value_key),
        "band": residual_band(values),
        "n": sum(1 for v in values if v is not None),
    }
