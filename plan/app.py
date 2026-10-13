import ast
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import threading
import sys
import uuid
from html.parser import HTMLParser
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
from datetime import date as date_cls, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

# Fixed external data folder shared across every branch/copy of this app -- see
# info/CANONICAL_COPY.md and db.py's matching DB_PATH logic.
_PLAN_DIR = Path(__file__).parent
_DATA_DIR = Path(os.environ["WAYPOINT_DATA_DIR"]) if os.environ.get("WAYPOINT_DATA_DIR") else _PLAN_DIR
_ENV_PATH = _DATA_DIR / ".env"
_PLAN_ENV_PATH = _PLAN_DIR / ".env"
_ENV_EXAMPLE_PATH = _PLAN_DIR / ".env.example"


def _ensure_env_file():
    """Keep keys in WAYPOINT_DATA_DIR/.env so a git pull cannot wipe local AI setup."""
    if _ENV_PATH.exists():
        return
    _ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _PLAN_ENV_PATH.exists() and _PLAN_ENV_PATH.resolve() != _ENV_PATH.resolve():
        _ENV_PATH.write_text(_PLAN_ENV_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        return
    if _ENV_EXAMPLE_PATH.exists():
        _ENV_PATH.write_text(_ENV_EXAMPLE_PATH.read_text(encoding="utf-8"), encoding="utf-8")


_ensure_env_file()
load_dotenv(_ENV_PATH)
if _PLAN_ENV_PATH.exists() and _PLAN_ENV_PATH.resolve() != _ENV_PATH.resolve():
    load_dotenv(_PLAN_ENV_PATH, override=False)

import numpy as np
from docx import Document
from flask import Flask, Response, jsonify, redirect, request, send_from_directory, session
from pypdf import PdfReader
from scipy.interpolate import griddata
import requests

import agent
import ai
import backup
import blueprint_quests
import budget
import code_backends
import companion_memory
import db
import email_sender
import embeddings
import google_integration
import model_roles
import game_sync
import napkin_sync
import notify
import nyu_sync
import obsidian_sync
import obsidian_watcher
import personal_data
import proc_util
import orchestrator
import practice_games
import repository
import rules
import scheduler
import school_sync
import workflow
from categories import METRICS

PLAN_PATH = personal_data.vault_path() / "Project Plan.md"
COMMAND_TIMEOUT_SECONDS = 120
GIT_UPDATE_TIMEOUT_SECONDS = 60

CUSTOMER_STALE_DAYS = 14
RECEIPT_SOURCES = {"planner", "arcade", "blueprint", "parallel", "docs", "system"}

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

db.init_db()


def seed_personal_napkin_tasks():
    """Promote personal napkin to-dos into Tasks. Call at process start, not on import."""
    try:
        import napkin_complete
        napkin_complete.ensure_personal_napkin_tasks()
    except Exception as exc:
        print(f"[napkin_complete] seed personal tasks: {exc}")


def _apply_runtime_env(updates):
    """Keep process-local module constants in sync after .env writes."""
    url = (updates.get("LOCAL_MODEL_URL") or updates.get("OLLAMA_URL") or "").strip()
    if url:
        ai.LOCAL_MODEL_URL = url.rstrip("/")
        code_backends.OLLAMA_URL = url.rstrip("/")


def _merge_env_file(updates):
    """Update or append KEY=value lines in the durable data-dir .env."""
    updates = {k: (v or "").strip() for k, v in updates.items() if k}
    if not updates:
        return
    _ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    seen = set()
    if _ENV_PATH.exists():
        lines = _ENV_PATH.read_text(encoding="utf-8").splitlines()
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                out.append(f"{key}={updates[key]}")
                seen.add(key)
                continue
        out.append(line)
    for key, value in updates.items():
        if key not in seen:
            out.append(f"{key}={value}")
    text = "\n".join(out).rstrip() + "\n"
    _ENV_PATH.write_text(text, encoding="utf-8")
    for key, value in updates.items():
        if value:
            os.environ[key] = value
        else:
            os.environ.pop(key, None)
    _apply_runtime_env(updates)


def _env_keys_present():
    keys = set()
    if not _ENV_PATH.exists():
        return keys
    for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            keys.add(stripped.split("=", 1)[0].strip())
    return keys


def _merge_missing_env_defaults():
    """Add new .env.example keys after a pull without overwriting existing values."""
    if not _ENV_EXAMPLE_PATH.exists():
        return []
    existing = _env_keys_present()
    additions = {}
    for line in _ENV_EXAMPLE_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, _, value = stripped.partition("=")
            key = key.strip()
            if key and key not in existing:
                additions[key] = value
    if additions:
        _merge_env_file(additions)
    return sorted(additions)


def _runtime_python():
    override = (os.environ.get("WAYPOINT_PYTHON") or "").strip()
    if override and Path(override).is_file():
        return override
    return sys.executable


def _local_ai_health():
    url = (
        os.environ.get("LOCAL_MODEL_URL")
        or os.environ.get("OLLAMA_URL")
        or "http://127.0.0.1:11434"
    ).rstrip("/")
    models = []
    reachable = False
    try:
        models = ai.list_ollama_model_names()
        reachable = ai.local_model_available()
    except Exception:
        reachable = False
    settings = db.get_settings()
    mode = (settings.get("inference_mode") or "").strip().lower()
    if mode not in ("cloud", "local", "custom"):
        offline = str(settings.get("offline_mode") or "").strip().lower() in ("1", "true", "yes", "on")
        mode = "local" if offline else "cloud"
    steps = []
    if not reachable:
        steps.append("Install Ollama from https://ollama.com and leave it running")
        steps.append("Then run: ollama pull llama3.2:3b")
    elif not models:
        steps.append("Ollama is running but has no models — run: ollama pull llama3.2:3b")
    if not _ENV_PATH.exists():
        steps.append(f"Create {_ENV_PATH} (copy plan/.env.example) and set LOCAL_MODEL_*")
    if reachable and models:
        steps.append("Ollama is ready — tap the HUD AI chip and choose Local")
    return {
        "ollama_reachable": reachable,
        "ollama_url": url,
        "models": models,
        "local_model_name": model_roles.local_model_name(),
        "env_path": str(_ENV_PATH),
        "env_exists": _ENV_PATH.exists(),
        "python": _runtime_python(),
        "inference_mode": mode,
        "setup_steps": steps,
        "ready": bool(reachable and models),
        "restart_required": False,
    }


def _setup_local_ai_env(model_name=""):
    """Write LOCAL_MODEL_* so local AI still resolves after a pull or data-dir move."""
    _ensure_env_file()
    added = _merge_missing_env_defaults()
    url = (
        os.environ.get("LOCAL_MODEL_URL")
        or os.environ.get("OLLAMA_URL")
        or "http://127.0.0.1:11434"
    ).rstrip("/")
    name = (model_name or os.environ.get("LOCAL_MODEL_NAME") or "llama3.2:3b").strip()
    _merge_env_file({
        "LOCAL_MODEL_URL": url,
        "OLLAMA_URL": url,
        "LOCAL_MODEL_NAME": name,
        "LOCAL_MODEL_ENABLED": "true",
    })
    health = _local_ai_health()
    health["added_env_keys"] = added
    health["wrote_env"] = True
    return health


def _normalize_inference_settings(data):
    """Map inference_mode ↔ offline_mode for Settings and HUD quick actions."""
    mode = (data.get("inference_mode") or "").strip().lower()
    if mode in ("cloud", "local", "custom"):
        data["inference_mode"] = mode
        if mode == "local":
            data["offline_mode"] = "true"
        else:
            data["offline_mode"] = "false"
    elif "offline_mode" in data:
        offline = str(data.get("offline_mode", "")).strip().lower() in ("1", "true", "yes", "on")
        data["offline_mode"] = "true" if offline else "false"
        if offline:
            data["inference_mode"] = "local"
        elif data.get("inference_mode") not in ("cloud", "custom"):
            data["inference_mode"] = "cloud"
    return data


def _vibecode_blocked_response():
    """Return a 403 JSON response when vibecode is not permitted, else None."""
    if not model_roles.vibecode_enabled():
        return jsonify({
            "error": "Vibecode is disabled — enable it in Settings to use this feature",
            "code": "vibecode_disabled",
        }), 403
    if not model_roles.vibecode_allowed():
        return jsonify({
            "error": "Vibecode requires Claude (judgment-class model). OpenAI mini and Ollama cannot vibecode.",
            "code": "weak_model",
        }), 403
    return None


def _access_token():
    return (os.environ.get("APP_ACCESS_TOKEN") or "").strip() or None


def _trust_localhost():
    return os.environ.get("APP_TRUST_LOCALHOST", "true").lower() in ("1", "true", "yes", "on")


def _trust_tailscale():
    try:
        import tailscale_net
        return tailscale_net.trust_tailscale_enabled()
    except Exception:
        return os.environ.get("APP_TRUST_TAILSCALE", "false").lower() in ("1", "true", "yes", "on")


def _configure_secret_key():
    secret = (os.environ.get("APP_SECRET_KEY") or "").strip()
    token = _access_token()
    if secret:
        app.secret_key = secret
    elif token:
        app.secret_key = hashlib.sha256(token.encode()).hexdigest()
    else:
        app.secret_key = secrets.token_hex(32)


_configure_secret_key()


def _is_loopback():
    return (request.remote_addr or "") in ("127.0.0.1", "::1")


def _is_trusted_remote():
    if _trust_localhost() and _is_loopback():
        return True
    if _trust_tailscale():
        try:
            import tailscale_net
            return tailscale_net.is_tailscale_addr(request.remote_addr)
        except Exception:
            return False
    return False


def _tokens_match(provided, expected):
    a = (provided or "").encode("utf-8")
    b = (expected or "").encode("utf-8")
    if not a or not b or len(a) != len(b):
        hmac.compare_digest(b or b"x", b or b"x")
        return False
    return hmac.compare_digest(a, b)


def _auth_ok(token):
    if session.get("authenticated"):
        return True
    query_token = request.args.get("token")
    if _tokens_match(query_token, token):
        session["authenticated"] = True
        session.permanent = True
        return True
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer = auth_header[7:].strip()
        if _tokens_match(bearer, token):
            session["authenticated"] = True
            session.permanent = True
            return True
    return False


_LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Waypoint — sign in</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f1115; color: #e8eaed; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  main { width: min(360px, 92vw); padding: 28px; border: 1px solid #2a2f3a; border-radius: 12px; background: #171a21; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 13px; color: #9aa0a6; margin: 0 0 16px; line-height: 1.45; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #3c4048; background: #0f1115; color: #e8eaed; font-size: 14px; }
  button { margin-top: 12px; width: 100%; padding: 10px 12px; border: none; border-radius: 8px; background: #4c8bf5; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  button:hover { background: #3b7ae8; }
</style>
</head>
<body>
<main>
  <h1>Waypoint</h1>
  <p>Access token required. Paste the value of <code>APP_ACCESS_TOKEN</code> to continue.</p>
  <form method="post" action="/">
    <input type="password" name="token" placeholder="Access token" autocomplete="current-password" required autofocus>
    <button type="submit">Continue</button>
  </form>
</main>
</body>
</html>"""


@app.before_request
def require_access_token():
    token = _access_token()
    if not token:
        return None
    if request.path == "/api/nyu/brightspace/oauth/callback":
        return None
    if _is_trusted_remote():
        return None
    if request.path == "/" and request.method == "POST":
        provided = request.form.get("token") or ""
        if _tokens_match(provided, token):
            session["authenticated"] = True
            session.permanent = True
            return redirect("/")
        return _LOGIN_HTML, 401
    if _auth_ok(token):
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "unauthorized"}), 401
    if request.path == "/":
        return _LOGIN_HTML, 200
    return jsonify({"error": "unauthorized"}), 401


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plot.ly; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' https:; "
        "media-src 'self' blob:; "
        "frame-ancestors 'none'"
    )
    return response


def _git_repo_root():
    for candidate in (Path(__file__).parent.parent, Path(__file__).parent):
        if (candidate / ".git").exists():
            return candidate
    return None


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/api/config")
def api_config():
    return jsonify({"categories": db.list_categories(), "metrics": METRICS})


@app.get("/api/receipts")
def api_list_receipts():
    date_prefix = request.args.get("date")
    if date_prefix:
        try:
            date_cls.fromisoformat(date_prefix)
        except ValueError:
            return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    return jsonify(db.list_receipts(limit=request.args.get("limit", 50), date_prefix=date_prefix))


@app.post("/api/receipts")
def api_create_receipt():
    data = request.get_json(force=True) or {}
    source = (data.get("source") or "").strip()
    kind = (data.get("kind") or "").strip()
    summary = (data.get("summary") or "").strip()
    entity_id = data.get("entity_id")
    if source not in RECEIPT_SOURCES:
        return jsonify({"error": "invalid source"}), 400
    if not kind:
        return jsonify({"error": "kind is required"}), 400
    if not summary:
        return jsonify({"error": "summary is required"}), 400
    if entity_id is not None:
        entity_id = str(entity_id)
    return jsonify(db.insert_receipt(source, kind, summary, entity_id=entity_id)), 201


@app.delete("/api/receipts/<int:receipt_id>")
def api_delete_receipt(receipt_id):
    db.delete_receipt(receipt_id)
    return jsonify({"ok": True})


@app.post("/api/categories/vibecode")
def api_vibecode_category():
    blocked = _vibecode_blocked_response()
    if blocked:
        return blocked
    data = request.get_json(force=True)
    instruction = (data.get("instruction") or "").strip()
    if not instruction:
        return jsonify({"error": "instruction is required"}), 400
    try:
        category = orchestrator.run("vibecode_category", instruction=instruction)
        db.upsert_category(category["key"], category["label"], category["color"])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    return jsonify({"category": category, "categories": db.list_categories()}), 201


# --- Today tab ---------------------------------------------------------

@app.get("/api/day/<date>")
def api_get_day(date):
    return jsonify(db.get_day(date))


@app.post("/api/day/<date>")
def api_save_day(date):
    data = request.get_json(force=True)
    quiet = data.get("quiet") is True
    metrics = data.get("metrics") if isinstance(data.get("metrics"), dict) else data
    hours = {int(k): v for k, v in data.get("hours", {}).items()}
    db.save_day(date, metrics, hours)

    day = db.get_day(date)
    if quiet:
        return jsonify({"day": day, "summary": "", "validated_tasks": [], "quiet": True})

    hours_by_category = {}
    for h in day["hours"].values():
        cat = h.get("category")
        if cat:
            hours_by_category[cat] = hours_by_category.get(cat, 0) + 1
    try:
        painted_hours = sum(hours_by_category.values())
        db.insert_receipt(
            "planner",
            "day_saved",
            f"Saved {date}: {painted_hours} hours painted",
            entity_id=date,
        )
    except Exception as exc:
        print(f"[app] receipt insert failed: {exc}")

    summary = ""
    validated_tasks = []
    if os.environ.get("ANTHROPIC_API_KEY"):
        notes = (day["metrics"] or {}).get("notes") or ""
        open_tasks = db.list_tasks(status="todo") + db.list_tasks(status="partial")

        # daily_reflector and task_validator don't depend on each other's output, so they
        # run concurrently instead of one after another -- both are just waiting on the
        # Anthropic API most of the time, so a thread each overlaps that wait.
        with ThreadPoolExecutor(max_workers=2) as pool:
            summary_future = pool.submit(
                orchestrator.run, "daily_reflector",
                date=date, metrics=day["metrics"] or {}, hours_by_category=hours_by_category,
            )
            tasks_future = None
            if notes and open_tasks:
                tasks_future = pool.submit(
                    orchestrator.run, "task_validator", day_notes=notes,
                    open_tasks=[{"id": t["id"], "title": t["title"], "notes": t["notes"]} for t in open_tasks],
                )

            try:
                summary = summary_future.result()
            except Exception as exc:
                print(f"[app] daily_reflector failed: {exc}")

            if tasks_future:
                try:
                    updates = tasks_future.result()
                    for u in updates:
                        fields = {"status": u.get("status")}
                        if u.get("progress_done") is not None:
                            fields["progress_done"] = u["progress_done"]
                        db.update_task(u["task_id"], **fields)
                        validated_tasks.append({**u, "task": db.get_task(u["task_id"])})
                except Exception as exc:
                    print(f"[app] task_validator failed: {exc}")

    obsidian_sync.write_day_note(date, day["metrics"] or {}, day["hours"], summary)
    try:
        rules.emit("day.saved", {"date": date, **(day["metrics"] or {})})
    except Exception as _re:
        print(f"[rules] day.saved hook error: {_re}")
    return jsonify({"day": day, "summary": summary, "validated_tasks": validated_tasks})


@app.post("/api/today/suggest-schedule")
def api_suggest_schedule():
    """Happiness-maximizing scheduler (backlog item): proposes a suggested allocation for
    tomorrow, grounded only in Pearson correlations actually computed from this user's own
    days/hours history -- same math as /api/trends/correlations, computed fresh here (not
    imported from that route) so this endpoint's stats can be shaped for the prompt instead
    of the correlation-matrix UI. Suggestion-only: doesn't write to days/hours/calendar/tasks,
    doesn't run automatically -- only ever triggered by an explicit button click on the Today
    tab, since it costs a real Claude API call.
    """
    import numpy as np

    days = db.list_days(limit=5000)
    metric_keys = ["work_time", "effective_work_time", "sports", "volatility", "motivation", "focus"]
    stats = []
    for key in metric_keys:
        pairs = [(d[key], d["happiness"]) for d in days if d.get(key) is not None and d.get("happiness") is not None]
        if len(pairs) < 8:
            continue
        xs, ys = zip(*pairs)
        if np.std(xs) == 0 or np.std(ys) == 0:
            continue
        corr = float(np.corrcoef(xs, ys)[0, 1])
        if corr != corr:  # NaN guard, same as /api/trends/correlations
            continue
        by_happiness = sorted(pairs, key=lambda p: p[1])
        half = len(by_happiness) // 2
        low_vals = [p[0] for p in by_happiness[:half]]
        high_vals = [p[0] for p in by_happiness[len(by_happiness) - half:]]
        stats.append({
            "metric": key,
            "n": len(pairs),
            "correlation_with_happiness": round(corr, 3),
            "mean_on_happier_half": round(sum(high_vals) / len(high_vals), 2),
            "mean_on_less_happy_half": round(sum(low_vals) / len(low_vals), 2),
        })
    stats.sort(key=lambda s: -abs(s["correlation_with_happiness"]))

    if not stats:
        return jsonify({"error": "Not enough logged history yet to find a real pattern -- log more days on the Today tab first."}), 200

    recent_days = days[:14]  # list_days is already ORDER BY date DESC
    category_labels = [c["label"] for c in db.list_categories()]
    try:
        suggestion = orchestrator.run(
            "schedule_optimizer", stats=stats, recent_days=recent_days, category_labels=category_labels,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    return jsonify({"suggestion": suggestion, "stats": stats})


@app.post("/api/today/social-suggestions")
def api_social_suggestions():
    """Backlog item: "social-posting suggestions after the daily summary" -- turns a day's
    already-logged activity into copyable caption ideas. Opt-in, button-triggered (real API
    call), never posts anywhere itself -- this app has no social integration.
    """
    data = request.get_json(silent=True) or {}
    date = data.get("date") or date_cls.today().isoformat()
    day = db.get_day(date)
    if not day.get("metrics"):
        return jsonify({"error": "No logged activity for this day yet.", "suggestions": []}), 200

    hours_by_category = {}
    hour_notes = {}
    for hour, info in day["hours"].items():
        cat = info.get("category")
        if cat:
            hours_by_category[cat] = hours_by_category.get(cat, 0) + 1
        if info.get("note"):
            hour_notes[hour] = info["note"]

    try:
        suggestions = orchestrator.run(
            "social_post_suggester", date=date, metrics=day["metrics"],
            hours_by_category=hours_by_category, day_notes=day["metrics"].get("notes"),
            hour_notes=hour_notes,
        )
    except Exception as exc:
        return jsonify({"error": str(exc), "suggestions": []}), 200
    return jsonify({"suggestions": suggestions})


@app.get("/api/days")
def api_list_days():
    limit = int(request.args.get("limit", 30))
    return jsonify(db.list_days(limit=limit))


PULSE_COOLDOWN = timedelta(minutes=db.MOOD_PULSE_COOLDOWN_MINUTES)


def _pulse_next_allowed_at(last_at=None, today_count=None):
    """Earliest UTC instant when another pulse is allowed (cooldown + daily cap)."""
    now = datetime.now(timezone.utc)
    candidates = []
    if last_at:
        try:
            last_dt = datetime.fromisoformat(last_at)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            candidates.append(last_dt + PULSE_COOLDOWN)
        except ValueError:
            pass
    if today_count is None:
        today_count = db.pulses_today_count()
    if today_count >= db.MOOD_PULSE_DAILY_LIMIT:
        tomorrow = (now.date() + timedelta(days=1)).isoformat()
        candidates.append(datetime.fromisoformat(f"{tomorrow}T00:00:00+00:00"))
    if not candidates:
        return None
    return max(candidates).isoformat()


@app.get("/api/pulses")
def api_list_pulses():
    date = request.args.get("date") or date_cls.today().isoformat()
    pulses = db.list_mood_pulses(date_prefix=date)
    today_count = db.pulses_today_count() if date == date_cls.today().isoformat() else len(pulses)
    next_allowed = _pulse_next_allowed_at(db.last_pulse_time())
    details_editable = False
    editable_pulse_id = None
    if pulses and date == date_cls.today().isoformat():
        latest = pulses[-1]
        try:
            created_dt = datetime.fromisoformat(latest["created_at"])
            if created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - created_dt <= PULSE_COOLDOWN:
                details_editable = True
                editable_pulse_id = latest["id"]
        except (TypeError, ValueError, KeyError):
            pass
    return jsonify({
        "pulses": pulses,
        "today_count": today_count,
        "next_allowed_at": next_allowed,
        "details_editable": details_editable,
        "editable_pulse_id": editable_pulse_id,
        "cooldown_minutes": db.MOOD_PULSE_COOLDOWN_MINUTES,
    })


@app.post("/api/pulses")
def api_create_pulse():
    data = request.get_json(force=True)
    try:
        happiness = int(data.get("happiness"))
    except (TypeError, ValueError):
        return jsonify({"error": "happiness must be an integer 1-10"}), 400
    if not 1 <= happiness <= 10:
        return jsonify({"error": "happiness must be an integer 1-10"}), 400

    energy = data.get("energy")
    if energy is not None and energy != "":
        try:
            energy = int(energy)
        except (TypeError, ValueError):
            return jsonify({"error": "energy must be an integer 1-10"}), 400
        if not 1 <= energy <= 10:
            return jsonify({"error": "energy must be an integer 1-10"}), 400
    else:
        energy = None

    note = (data.get("note") or "").strip() or None

    today_count = db.pulses_today_count()
    last_at = db.last_pulse_time()
    next_allowed = _pulse_next_allowed_at(last_at, today_count)
    now = datetime.now(timezone.utc)

    if today_count >= db.MOOD_PULSE_DAILY_LIMIT:
        return jsonify({
            "error": "daily limit reached — max 6 pulses per day",
            "today_count": today_count,
            "next_allowed_at": next_allowed,
        }), 429

    if last_at:
        try:
            last_dt = datetime.fromisoformat(last_at)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if now - last_dt < PULSE_COOLDOWN:
                return jsonify({
                    "error": f"cooldown — wait at least {db.MOOD_PULSE_COOLDOWN_MINUTES} minutes between pulses",
                    "today_count": today_count,
                    "next_allowed_at": next_allowed,
                }), 429
        except ValueError:
            pass

    pulse = db.insert_mood_pulse(happiness, note, energy)
    today_count = db.pulses_today_count()
    policy = None
    try:
        import happiness_policy
        policy = happiness_policy.observe_pulse(happiness, energy, section="Today")
    except Exception:
        policy = None
    return jsonify({
        "pulse": pulse,
        "today_count": today_count,
        "next_allowed_at": _pulse_next_allowed_at(pulse["created_at"], today_count),
        "happiness_policy": policy,
    }), 201


@app.patch("/api/pulses/<int:pulse_id>")
def api_patch_pulse(pulse_id):
    """Attach energy/note to a pulse while happiness stays locked (during 2h window)."""
    pulse = db.get_mood_pulse(pulse_id)
    if not pulse:
        return jsonify({"error": "pulse not found"}), 404

    created = pulse.get("created_at")
    try:
        created_dt = datetime.fromisoformat(created)
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid pulse timestamp"}), 400

    now = datetime.now(timezone.utc)
    if now - created_dt > PULSE_COOLDOWN:
        return jsonify({
            "error": "detail window closed — energy/notes can only be edited within 2 hours of logging",
            "next_allowed_at": _pulse_next_allowed_at(db.last_pulse_time()),
        }), 429

    data = request.get_json(force=True) or {}
    clear_energy = False
    clear_note = False
    energy_arg = None
    note_arg = None
    if "energy" in data:
        raw = data.get("energy")
        if raw is None or raw == "":
            clear_energy = True
        else:
            try:
                energy_arg = int(raw)
            except (TypeError, ValueError):
                return jsonify({"error": "energy must be an integer 1-10"}), 400
            if not 1 <= energy_arg <= 10:
                return jsonify({"error": "energy must be an integer 1-10"}), 400
    if "note" in data:
        raw_note = data.get("note")
        if raw_note is None or (isinstance(raw_note, str) and not raw_note.strip()):
            clear_note = True
            note_arg = None
        else:
            note_arg = str(raw_note).strip()

    if "energy" not in data and "note" not in data:
        return jsonify({"error": "provide energy and/or note"}), 400

    updated = db.update_mood_pulse_details(
        pulse_id,
        energy=energy_arg,
        note=note_arg,
        clear_energy=clear_energy,
        clear_note=clear_note,
    )
    today_count = db.pulses_today_count()
    return jsonify({
        "pulse": updated,
        "today_count": today_count,
        "next_allowed_at": _pulse_next_allowed_at(db.last_pulse_time(), today_count),
        "details_editable": True,
    })


@app.get("/api/pulses/summary")
def api_pulses_summary():
    days = int(request.args.get("days", 30))
    if days < 1:
        days = 1
    if days > 366:
        days = 366
    summary = db.mood_pulses_summary(days)
    coverage = sum(1 for row in summary if row["count"] >= 2)
    return jsonify({"days": summary, "pulse_coverage": coverage})


@app.delete("/api/day/<date>")
def api_delete_day(date):
    db.delete_day(date)
    return jsonify({"ok": True})


@app.get("/api/trends/correlations")
def api_trends_correlations():
    """Correlation between every pair of metrics across all logged days -- pure
    local math (numpy/scipy), no API call, works no matter how the kill switch is
    set. Pearson (linear relationship) by default; ?method=spearman for a rank
    correlation, which catches monotonic-but-not-linear relationships Pearson
    misses (e.g. "more sports always helps focus, but with diminishing returns").
    """
    import numpy as np
    method = request.args.get("method", "pearson")

    days = db.list_days(limit=5000)
    metric_keys = ["happiness", "volatility", "motivation", "focus", "work_time",
                   "effective_work_time", "sports", "eating"]
    results = []
    for i, a in enumerate(metric_keys):
        for b in metric_keys[i + 1:]:
            pairs = [(d[a], d[b]) for d in days if d.get(a) is not None and d.get(b) is not None]
            if len(pairs) < 5:
                continue
            xs, ys = zip(*pairs)
            if np.std(xs) == 0 or np.std(ys) == 0:
                continue
            if method == "spearman":
                from scipy.stats import spearmanr
                corr = float(spearmanr(xs, ys).correlation)
            else:
                corr = float(np.corrcoef(xs, ys)[0, 1])
            if corr != corr:  # NaN guard (e.g. spearman on constant/degenerate input)
                continue
            results.append({"a": a, "b": b, "correlation": round(corr, 3), "n": len(pairs)})
    results.sort(key=lambda r: -abs(r["correlation"]))
    return jsonify(results)


@app.post("/api/trends/engrave-title")
def api_trends_engrave_title():
    """Engrave a short day title from receipt summaries; cached by date + receipt-id hash."""
    data = request.get_json(silent=True) or {}
    date_str = (data.get("date") or "").strip()
    try:
        date_cls.fromisoformat(date_str)
    except ValueError:
        return jsonify({"title": None, "reason": "invalid date", "cached": False})

    try:
        receipts = db.list_receipts(limit=500, date_prefix=date_str)
    except Exception as exc:
        return jsonify({"title": None, "reason": str(exc), "cached": False})

    if len(receipts) < 2:
        return jsonify({"title": None, "reason": "not enough receipts", "cached": False})

    receipts_sorted = sorted(receipts, key=lambda r: r.get("id", 0))
    ids_hash = hashlib.md5(",".join(str(r["id"]) for r in receipts_sorted).encode()).hexdigest()
    cache_key = f"engraved_title_{date_str}_{ids_hash}"
    settings = db.get_settings()
    cached_raw = settings.get(cache_key)
    if cached_raw:
        try:
            cached = json.loads(cached_raw)
            if cached.get("hash") == ids_hash:
                return jsonify({"title": cached.get("title"), "cached": True, "hash": ids_hash})
        except (json.JSONDecodeError, TypeError):
            pass

    summaries = [
        {"source": r.get("source"), "kind": r.get("kind"), "summary": r.get("summary")}
        for r in sorted(receipts_sorted, key=lambda r: r.get("created_at") or "")
    ]
    try:
        result = orchestrator.run("day_title_engraver", receipt_summaries=summaries)
        title = None
        if isinstance(result, dict):
            title = (result.get("title") or "").strip().strip("\"'") or None
            if title:
                words = title.split()
                if len(words) > 8:
                    title = " ".join(words[:8])
    except Exception as exc:
        return jsonify({"title": None, "reason": str(exc), "cached": False})

    try:
        db.save_settings({cache_key: json.dumps({"title": title, "hash": ids_hash})})
    except Exception as exc:
        return jsonify({"title": None, "reason": str(exc), "cached": False})

    return jsonify({"title": title, "cached": False, "hash": ids_hash})


@app.get("/api/trends/hours-history")
def api_trends_hours_history():
    """Per-day hour-category counts for the Trends hours breakdown chart."""
    limit = int(request.args.get("limit", 90))
    conn = db.get_conn()
    date_rows = conn.execute(
        "SELECT DISTINCT date FROM hours ORDER BY date DESC LIMIT ?",
        (limit,),
    ).fetchall()
    if not date_rows:
        conn.close()
        return jsonify([])
    dates = [r["date"] for r in date_rows]
    placeholders = ",".join("?" * len(dates))
    rows = conn.execute(
        f"""SELECT date, category, COUNT(*) AS hours
            FROM hours
            WHERE date IN ({placeholders})
              AND category IS NOT NULL AND category != ''
            GROUP BY date, category
            ORDER BY date ASC""",
        dates,
    ).fetchall()
    conn.close()
    by_date = {}
    for row in rows:
        entry = by_date.setdefault(row["date"], {"date": row["date"], "counts": {}})
        entry["counts"][row["category"]] = row["hours"]
    return jsonify([by_date[d] for d in sorted(by_date)])


# --- Goals tab ---------------------------------------------------------

def _coach_text(value, limit=500):
    return str(value or "").strip()[:limit]


def _normalize_goal_coach_proposal(raw):
    """Keep the AI response on a small, stable proposal-only API schema."""
    raw = raw if isinstance(raw, dict) else {}
    ideas = []
    for item in raw.get("ideas") or []:
        if not isinstance(item, dict):
            continue
        title = _coach_text(item.get("title"), 120)
        first_move = _coach_text(item.get("first_move"), 500)
        if title and first_move:
            ideas.append({
                "title": title,
                "why": _coach_text(item.get("why"), 500),
                "first_move": first_move,
            })
    quests = []
    for item in raw.get("quests") or []:
        if not isinstance(item, dict):
            continue
        title = _coach_text(item.get("title"), 120)
        success = _coach_text(item.get("success_criteria"), 500)
        if title and success:
            quests.append({
                "title": title,
                "description": _coach_text(item.get("description"), 800),
                "success_criteria": success,
                "difficulty": _coach_text(item.get("difficulty"), 40),
            })
    allocations = []
    for item in raw.get("time_allocations") or []:
        if not isinstance(item, dict):
            continue
        title = _coach_text(item.get("title"), 120)
        try:
            minutes = int(item.get("minutes"))
        except (TypeError, ValueError):
            continue
        due_date = _coach_text(item.get("due_date"), 10)
        if due_date:
            try:
                date_cls.fromisoformat(due_date)
            except ValueError:
                due_date = ""
        if title and 15 <= minutes <= 480:
            allocations.append({
                "title": title,
                "minutes": minutes,
                "cadence": _coach_text(item.get("cadence"), 120),
                "rationale": _coach_text(item.get("rationale"), 500),
                "due_date": due_date or None,
            })
    return {
        "ideas": ideas[:4],
        "quests": quests[:4],
        "time_allocations": allocations[:4],
    }


@app.get("/api/goals")
def api_list_goals():
    return jsonify(db.list_goals())


@app.post("/api/goals")
def api_create_goal():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    deadline = (data.get("deadline") or "").strip()
    if not title or not deadline:
        return jsonify({"error": "title and deadline are required"}), 400

    try:
        chunks = orchestrator.run(
            "goal_chunker", title=title, deadline=deadline, today=date_cls.today().isoformat()
        )
    except Exception as exc:
        print(f"[app] goal_chunker failed: {exc}")
        chunks = []

    goal_id = db.create_goal(title, deadline, chunks)
    goal = db.get_goal(goal_id)
    obsidian_sync.write_goal_note(goal)
    return jsonify(goal), 201


@app.patch("/api/goals/<int:goal_id>")
def api_update_goal(goal_id):
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object required"}), 400
    fields = {}
    if "title" in data:
        title = str(data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "title cannot be empty"}), 400
        fields["title"] = title
    if "deadline" in data:
        value = data.get("deadline")
        fields["deadline"] = None if value is None else str(value).strip()
    if "notes" in data:
        value = data.get("notes")
        fields["notes"] = None if value is None else str(value)
    if "progress_pct" in data:
        value = data.get("progress_pct")
        if value is None or value == "":
            fields["progress_pct"] = None
        else:
            try:
                progress_pct = int(value)
            except (TypeError, ValueError):
                return jsonify({"error": "progress_pct must be a whole number from 0 to 100"}), 400
            if progress_pct < 0 or progress_pct > 100:
                return jsonify({"error": "progress_pct must be between 0 and 100"}), 400
            fields["progress_pct"] = progress_pct
    if not fields:
        return jsonify({"error": "provide title, deadline, notes, or progress_pct"}), 400
    goal = db.update_goal(goal_id, **fields)
    if not goal:
        return jsonify({"error": "goal not found"}), 404
    return jsonify(goal)


@app.patch("/api/goals/chunks/<int:chunk_id>")
def api_update_chunk(chunk_id):
    data = request.get_json(force=True)
    fields = {k: v for k, v in data.items() if k in ("title", "due_date", "done")}
    db.update_chunk(chunk_id, **fields)
    return jsonify({"ok": True})


@app.delete("/api/goals/<int:goal_id>")
def api_delete_goal(goal_id):
    db.delete_goal(goal_id)
    return jsonify({"ok": True})


@app.post("/api/goals/<int:goal_id>/coach")
def api_coach_goal(goal_id):
    goal = db.get_goal(goal_id)
    if not goal:
        return jsonify({"error": "goal not found"}), 404
    try:
        raw = orchestrator.run(
            "goal_coach",
            goal={
                "id": goal["id"],
                "title": goal["title"],
                "deadline": goal.get("deadline"),
                "chunks": goal.get("chunks") or [],
                "existing_quests": goal.get("coach_quests") or [],
            },
            today=date_cls.today().isoformat(),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502
    proposal = _normalize_goal_coach_proposal(raw)
    if not any(proposal.values()):
        return jsonify({"error": "coach returned no usable proposals"}), 502
    return jsonify({
        "goal_id": goal_id,
        "goal_title": goal["title"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "writes_committed": False,
        **proposal,
    })


@app.post("/api/goals/<int:goal_id>/coach/confirm")
def api_confirm_goal_coach_proposal(goal_id):
    goal = db.get_goal(goal_id)
    if not goal:
        return jsonify({"error": "goal not found"}), 404
    data = request.get_json(force=True) or {}
    if data.get("confirmed") is not True:
        return jsonify({"error": "explicit confirmation is required"}), 400
    kind = data.get("kind")
    proposal = data.get("proposal") if isinstance(data.get("proposal"), dict) else {}
    normalized = _normalize_goal_coach_proposal({
        "quests": [proposal] if kind == "quest" else [],
        "time_allocations": [proposal] if kind == "time_allocation" else [],
    })
    if kind == "quest":
        if not normalized["quests"]:
            return jsonify({"error": "invalid quest proposal"}), 400
        quest = normalized["quests"][0]
        return jsonify({
            "kind": "quest",
            "quest": db.insert_goal_coach_quest(goal_id, **quest),
        }), 201
    if kind == "time_allocation":
        if not normalized["time_allocations"]:
            return jsonify({"error": "invalid time allocation proposal"}), 400
        allocation = normalized["time_allocations"][0]
        due_date = allocation.get("due_date") or goal.get("deadline")
        notes = (
            f"Accepted Goal Coach allocation for “{goal['title']}”.\n"
            f"Time box: {allocation['minutes']} minutes"
            f"{f' · {allocation['cadence']}' if allocation.get('cadence') else ''}.\n"
            f"{allocation.get('rationale') or ''}"
        ).strip()
        task_id = db.insert_task(
            f"{goal['title']}: {allocation['title']}",
            notes=notes,
            urgency="medium",
            progress_total=allocation["minutes"],
            progress_unit="minutes",
            due_date=due_date,
            category="Goals",
        )
        task = db.get_task(task_id)
        try:
            rules.emit("task.created", dict(task))
        except Exception as exc:
            print(f"[rules] task.created hook error: {exc}")
        return jsonify({"kind": "time_allocation", "task": task}), 201
    return jsonify({"error": "kind must be quest or time_allocation"}), 400


@app.post("/api/goals/<int:goal_id>/quests")
def api_create_custom_goal_quest(goal_id):
    """Create a checkable goal quest directly, without invoking Goal Coach."""
    if not db.get_goal(goal_id):
        return jsonify({"error": "goal not found"}), 404
    data = request.get_json(silent=True) or {}
    title = _coach_text(data.get("title"), 160)
    if not title:
        return jsonify({"error": "title is required"}), 400
    quest = db.insert_goal_coach_quest(
        goal_id,
        title=title,
        description=_coach_text(data.get("description"), 500),
        success_criteria=_coach_text(data.get("success_criteria"), 300),
        difficulty=_coach_text(data.get("difficulty"), 40),
    )
    return jsonify(quest), 201


@app.patch("/api/goals/quests/<int:quest_id>")
def api_update_goal_coach_quest(quest_id):
    data = request.get_json(force=True) or {}
    if not isinstance(data.get("done"), bool):
        return jsonify({"error": "done must be a boolean"}), 400
    quest = db.update_goal_coach_quest(quest_id, data["done"])
    if not quest:
        return jsonify({"error": "quest not found"}), 404
    return jsonify(quest)


@app.delete("/api/goals/quests/<int:quest_id>")
def api_delete_goal_coach_quest(quest_id):
    if not db.delete_goal_coach_quest(quest_id):
        return jsonify({"error": "quest not found"}), 404
    return jsonify({"ok": True})


# --- Team tab ---------------------------------------------------------

@app.get("/api/team")
def api_list_team():
    return jsonify(db.list_team_members())


@app.post("/api/team")
def api_create_team_member():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    member_id = db.insert_team_member(name, data.get("email"), data.get("role"))
    return jsonify({"id": member_id}), 201


@app.delete("/api/team/<int:member_id>")
def api_delete_team_member(member_id):
    db.delete_team_member(member_id)
    return jsonify({"ok": True})


@app.patch("/api/team/<int:member_id>")
def api_update_team_member(member_id):
    data = request.get_json(force=True)
    fields = {k: v for k, v in data.items() if k in ("name", "email", "role", "permission")}
    db.update_team_member(member_id, **fields)
    return jsonify({"ok": True})


@app.get("/api/team/<int:member_id>/messages")
def api_list_team_messages(member_id):
    return jsonify(db.list_team_messages(member_id))


@app.post("/api/team/<int:member_id>/messages")
def api_create_team_message(member_id):
    data = request.get_json(force=True)
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "body is required"}), 400
    db.insert_team_message(member_id, "you", body)
    return jsonify(db.list_team_messages(member_id)), 201


@app.post("/api/team/<int:member_id>/invite")
def api_invite_team_member(member_id):
    """Sends an actual email invite -- Gmail if you've connected Google, otherwise
    falls back to the local SMTP sender already used for daily reminders.
    """
    member = next((m for m in db.list_team_members() if m["id"] == member_id), None)
    if not member or not member.get("email"):
        return jsonify({"error": "this team member has no email on file"}), 400
    data = request.get_json(force=True) or {}
    permission = data.get("permission", member.get("permission", "viewer"))
    subject = "You've been added to my Planner"
    body = (data.get("message") or "").strip() or (
        f"Hi {member['name']},\n\nYou've been added as a collaborator ({permission}) on my Planner.\n\n"
        "-- sent from Planner"
    )
    if google_integration.is_connected():
        try:
            google_integration.send_gmail(member["email"], subject, body)
            sent_via = "gmail"
        except Exception as exc:
            return jsonify({"error": f"Gmail send failed: {exc}"}), 400
    else:
        result = email_sender.send(member["email"], subject, body)
        if not result.ok:
            return jsonify({"error": f"Email send failed: {result.detail}"}), 400
        sent_via = "smtp"
    db.update_team_member(member_id, permission=permission)
    db.insert_team_message(member_id, "you", f"[invite sent via {sent_via}] {body}")
    return jsonify({"ok": True, "sent_via": sent_via})


# --- Team channels (group chats) ---------------------------------------------------------

@app.get("/api/team/channels")
def api_list_team_channels():
    return jsonify(db.list_team_channels())


@app.post("/api/team/channels")
def api_create_team_channel():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    member_ids = data.get("member_ids") or []
    channel_id = db.insert_team_channel(name, member_ids)
    return jsonify(db.get_team_channel(channel_id)), 201


@app.delete("/api/team/channels/<int:channel_id>")
def api_delete_team_channel(channel_id):
    db.delete_team_channel(channel_id)
    return jsonify({"ok": True})


@app.post("/api/team/channels/<int:channel_id>/members")
def api_add_team_channel_member(channel_id):
    data = request.get_json(force=True)
    member_id = data.get("team_member_id")
    if not member_id:
        return jsonify({"error": "team_member_id is required"}), 400
    db.add_channel_member(channel_id, member_id)
    return jsonify(db.get_team_channel(channel_id)), 201


@app.delete("/api/team/channels/<int:channel_id>/members/<int:member_id>")
def api_remove_team_channel_member(channel_id, member_id):
    db.remove_channel_member(channel_id, member_id)
    return jsonify({"ok": True})


@app.get("/api/team/channels/<int:channel_id>/messages")
def api_list_team_channel_messages(channel_id):
    return jsonify(db.list_channel_messages(channel_id))


@app.post("/api/team/channels/<int:channel_id>/messages")
def api_create_team_channel_message(channel_id):
    data = request.get_json(force=True)
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "body is required"}), 400
    sender = (data.get("sender") or "you").strip() or "you"
    db.insert_channel_message(channel_id, sender, body)
    return jsonify(db.list_channel_messages(channel_id)), 201


# --- Automation tab (visual node-graph -> Python) ---------------------------------------------------------

GENERATED_SCRIPTS_DIR = Path(__file__).parent / "generated_scripts"
WORKFLOW_RUN_PYTHON = Path(os.environ.get("WAYPOINT_PYTHON") or (Path(__file__).parent.parent / ".venv" / "bin" / "python"))


def _workflow_script_path(wf):
    safe_name = "".join(c for c in wf["name"] if c.isalnum() or c in " -_").strip().replace(" ", "_") or f"workflow_{wf['id']}"
    return GENERATED_SCRIPTS_DIR / f"{safe_name}.py"


def _workflow_node_catalog():
    catalog = []
    for type_name, meta in workflow.NODE_TYPES.items():
        params = []
        for p in meta.get("params", []):
            params.append(p.get("name") if isinstance(p, dict) else p)
        pins = {
            "exec_outputs": meta.get("outputs", []),
            "data_inputs": [p.get("name") for p in meta.get("params", []) if isinstance(p, dict) and p.get("wire")],
            "data_outputs": [p.get("port") for p in meta.get("dataOutputs", [])],
        }
        catalog.append({"type": type_name, "params": params, "pins": pins})
    return catalog


def _node(node_id, type_name, params=None, x=80, y=0, **extra):
    node = {"id": node_id, "type": type_name, "params": params or {}, "x": x, "y": y}
    node.update(extra)
    return node


def _edge(from_id, to_id, from_port="next", kind="exec", to_port=None):
    edge = {"from": from_id, "to": to_id, "fromPort": from_port, "kind": kind}
    if to_port:
        edge["toPort"] = to_port
    return edge


def _source_segment(code, stmt):
    return (ast.get_source_segment(code, stmt) or "").strip()


def _expr_source(code, expr):
    return (ast.get_source_segment(code, expr) or ast.unparse(expr)).strip()


def _literal_or_expr(code, expr):
    try:
        value = ast.literal_eval(expr)
        return repr(value)
    except (ValueError, SyntaxError):
        return _expr_source(code, expr)


def _repr_param_value(code, expr):
    try:
        value = ast.literal_eval(expr)
        if isinstance(value, str):
            return value
    except (ValueError, SyntaxError):
        pass
    return _expr_source(code, expr)


def _is_requests_call(expr):
    if not isinstance(expr, ast.Call) or not isinstance(expr.func, ast.Attribute):
        return None
    if expr.func.attr not in ("get", "post"):
        return None
    target = expr.func.value
    if isinstance(target, ast.Name) and target.id == "requests":
        return expr.func.attr.upper()
    return None


def _call_first_arg_source(code, call):
    if call.args:
        return _repr_param_value(code, call.args[0])
    for kw in call.keywords:
        if kw.arg == "url":
            return _repr_param_value(code, kw.value)
    return '""'


def _assign_target_names(target):
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, ast.Tuple):
        return [elt.id for elt in target.elts if isinstance(elt, ast.Name)]
    return []


def _infer_var_type(value):
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, list):
        return "list"
    if isinstance(value, str):
        return "string"
    return "string"


def _default_for_literal(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return repr(value)
    return ""


def _register_var(var_info, name, literal_value):
    var_info[name] = {
        "type": _infer_var_type(literal_value),
        "default": _default_for_literal(literal_value),
    }


def _try_unpack_literal_assign(stmt):
    if len(stmt.targets) != 1:
        return None
    target = stmt.targets[0]
    names = _assign_target_names(target)
    if not names:
        return None
    try:
        value = ast.literal_eval(stmt.value)
    except (ValueError, SyntaxError):
        return None
    if isinstance(target, ast.Name):
        return [(names[0], value)]
    if isinstance(target, ast.Tuple):
        if not isinstance(value, tuple) or len(names) != len(value):
            return None
        return list(zip(names, value))
    return None


def _python_statements_to_nodes(statements, code, start_id, prefix, y_counter, unmapped, x=80, var_info=None):
    nodes = []
    edges = []
    previous_id = start_id
    previous_port = "next"

    def add_exec_node(type_name, params=None, **extra):
        nonlocal previous_id, previous_port
        idx = y_counter["n"]
        node_id = f"{prefix}_{idx}"
        y_counter["n"] += 1
        node = _node(node_id, type_name, params, x=x, y=idx * 120, **extra)
        nodes.append(node)
        edges.append(_edge(previous_id, node_id, previous_port))
        previous_id = node_id
        previous_port = "next"
        return node

    for stmt in statements:
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
            call = stmt.value
            method = _is_requests_call(call)
            if method:
                add_exec_node("http_request", {"method": method, "url": _call_first_arg_source(code, call)})
                continue
            if isinstance(call.func, ast.Name) and call.func.id == "print":
                message = ", ".join(_repr_param_value(code, a) for a in call.args) or ""
                add_exec_node("print", {"message": message})
                continue

        if isinstance(stmt, ast.Assign):
            unpacked = _try_unpack_literal_assign(stmt)
            if unpacked:
                if var_info is not None:
                    for name, val in unpacked:
                        _register_var(var_info, name, val)
                    continue
                if len(unpacked) == 1:
                    var_name, lit_val = unpacked[0]
                    add_exec_node(
                        "set_var",
                        {"value": _literal_or_expr(code, stmt.value)},
                        varName=var_name,
                    )
                    continue
                raw = _source_segment(code, stmt) or ast.unparse(stmt)
                add_exec_node("custom", {"code": raw})
                continue

        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
            var_name = stmt.targets[0].id
            if isinstance(stmt.value, ast.BinOp) and type(stmt.value.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod):
                math_type = {
                    ast.Add: "add",
                    ast.Sub: "subtract",
                    ast.Mult: "multiply",
                    ast.Div: "divide",
                    ast.Mod: "modulo",
                }[type(stmt.value.op)]
                math_node = add_exec_node(
                    math_type,
                    {
                        "a": _expr_source(code, stmt.value.left),
                        "b": _expr_source(code, stmt.value.right),
                        "variable": f"_{var_name}_value",
                    },
                )
                set_node = add_exec_node("set_var", {"value": "None"}, varName=var_name)
                edges.append(_edge(math_node["id"], set_node["id"], "result", kind="data", to_port="value"))
                continue
            try:
                ast.literal_eval(stmt.value)
                add_exec_node("set_var", {"value": _literal_or_expr(code, stmt.value)}, varName=var_name)
                continue
            except (ValueError, SyntaxError):
                pass

        if isinstance(stmt, ast.If):
            if_node = add_exec_node("if", {"condition": _expr_source(code, stmt.test)})
            endif_idx = y_counter["n"]
            y_counter["n"] += 1
            endif_id = f"{prefix}_{endif_idx}"
            endif_node = _node(endif_id, "endif", {}, x=x, y=endif_idx * 120)
            if_node["pairId"] = endif_id
            nodes.append(endif_node)
            if stmt.body:
                body_nodes, body_edges, body_last, body_port = _python_statements_to_nodes(
                    stmt.body, code, if_node["id"], f"{prefix}_if{endif_idx}", y_counter, unmapped, x=x
                )
                nodes.extend(body_nodes)
                for e in body_edges:
                    if e["from"] == if_node["id"] and e.get("fromPort") == "next":
                        e["fromPort"] = "true"
                    edges.append(e)
                edges.append(_edge(body_last, endif_id, body_port))
            else:
                edges.append(_edge(if_node["id"], endif_id, "true"))
            if stmt.orelse:
                else_nodes, else_edges, else_last, else_port = _python_statements_to_nodes(
                    stmt.orelse, code, if_node["id"], f"{prefix}_else{endif_idx}", y_counter, unmapped, x=x
                )
                nodes.extend(else_nodes)
                for e in else_edges:
                    if e["from"] == if_node["id"] and e.get("fromPort") == "next":
                        e["fromPort"] = "false"
                    edges.append(e)
                edges.append(_edge(else_last, endif_id, else_port))
            previous_id = endif_id
            continue

        if isinstance(stmt, ast.For) and isinstance(stmt.target, ast.Name):
            iter_expr = _expr_source(code, stmt.iter)
            if isinstance(stmt.iter, ast.Call) and isinstance(stmt.iter.func, ast.Name) and stmt.iter.func.id == "range":
                loop_node = add_exec_node("for", {"variable": stmt.target.id, "iterable": iter_expr})
                if stmt.body:
                    body_nodes, body_edges, _, _ = _python_statements_to_nodes(
                        stmt.body, code, loop_node["id"], f"{prefix}_loop{y_counter['n']}", y_counter, unmapped, x=x
                    )
                    nodes.extend(body_nodes)
                    for e in body_edges:
                        if e["from"] == loop_node["id"] and e.get("fromPort") == "next":
                            e["fromPort"] = "loop"
                        edges.append(e)
                previous_id = loop_node["id"]
                previous_port = "done"
                continue

        if isinstance(stmt, ast.While):
            condition = _expr_source(code, stmt.test)
            if isinstance(stmt.test, ast.Constant) and stmt.test.value is True:
                condition = "True"
            loop_node = add_exec_node("while_loop", {"condition": condition})
            if stmt.body:
                body_nodes, body_edges, _, _ = _python_statements_to_nodes(
                    stmt.body, code, loop_node["id"], f"{prefix}_while{y_counter['n']}", y_counter, unmapped, x=x
                )
                nodes.extend(body_nodes)
                for e in body_edges:
                    if e["from"] == loop_node["id"] and e.get("fromPort") == "next":
                        e["fromPort"] = "loop"
                    edges.append(e)
            previous_id = loop_node["id"]
            previous_port = "done"
            continue

        raw = _source_segment(code, stmt) or ast.dump(stmt)
        unmapped.append(f"line {getattr(stmt, 'lineno', '?')}: {type(stmt).__name__} -> custom")
        add_exec_node("custom", {"code": raw})

    return nodes, edges, previous_id, previous_port


def _python_to_workflow_graph(code):
    tree = ast.parse(code)
    nodes = [_node("start_1", "start", {}, x=80, y=0)]
    edges = []
    var_info = {}
    functions = []
    unmapped = []
    module_body = []
    y_counter = {"n": 1}

    for stmt in tree.body:
        if isinstance(stmt, ast.Assign):
            unpacked = _try_unpack_literal_assign(stmt)
            if unpacked:
                for name, val in unpacked:
                    _register_var(var_info, name, val)
            else:
                for target in stmt.targets:
                    for name in _assign_target_names(target):
                        var_info.setdefault(name, {"type": "string", "default": ""})
        if isinstance(stmt, ast.FunctionDef):
            entry_id = f"fn_{stmt.name}_entry"
            return_id = f"fn_{stmt.name}_return"
            functions.append({
                "name": stmt.name,
                "params": [{"name": arg.arg, "type": "any"} for arg in stmt.args.args],
                "returns": False,
                "entryId": entry_id,
            })
            entry_idx = y_counter["n"]
            y_counter["n"] += 1
            nodes.append(_node(entry_id, "func_entry", {}, x=80, y=entry_idx * 120, funcName=stmt.name, pairId=return_id))
            body_nodes, body_edges, body_last, body_port = _python_statements_to_nodes(
                stmt.body, code, entry_id, f"fn_{stmt.name}", y_counter, unmapped, x=80
            )
            nodes.extend(body_nodes)
            edges.extend(body_edges)
            return_idx = y_counter["n"]
            y_counter["n"] += 1
            nodes.append(_node(return_id, "func_return", {}, x=80, y=return_idx * 120, funcName=stmt.name))
            edges.append(_edge(body_last, return_id, body_port))
        else:
            module_body.append(stmt)

    body_nodes, body_edges, _, _ = _python_statements_to_nodes(
        module_body, code, "start_1", "node", y_counter, unmapped, x=80, var_info=var_info
    )
    nodes.extend(body_nodes)
    edges.extend(body_edges)
    variables = [
        {"name": name, "type": info["type"], "default": info["default"]}
        for name, info in sorted(var_info.items())
    ]
    return {"nodes": nodes, "edges": edges, "variables": variables, "functions": functions}, unmapped


@app.get("/api/workflows/node-types")
def api_workflow_node_types():
    return jsonify(workflow.NODE_TYPES)


@app.get("/api/workflows/quests")
def api_blueprint_quests():
    return jsonify(blueprint_quests.list_quests())


@app.post("/api/workflows/quests/<quest_id>/grade")
def api_grade_blueprint_quest(quest_id):
    data = request.get_json(force=True) or {}
    try:
        result = blueprint_quests.grade_quest(quest_id, data.get("graph"))
    except KeyError:
        return jsonify({"error": "quest not found"}), 404
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@app.get("/api/workflows")
def api_list_workflows():
    return jsonify(db.list_workflows())


@app.get("/api/workflows/<int:workflow_id>")
def api_get_workflow(workflow_id):
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    wf["graph"] = json.loads(wf["graph_json"])
    return jsonify(wf)


@app.post("/api/workflows")
def api_create_workflow():
    data = request.get_json(force=True)
    name = (data.get("name") or "Untitled workflow").strip()
    graph = data.get("graph", {"nodes": [], "edges": []})
    workflow_id = db.insert_workflow(name, json.dumps(graph))
    return jsonify(db.get_workflow(workflow_id)), 201


@app.patch("/api/workflows/<int:workflow_id>")
def api_update_workflow(workflow_id):
    data = request.get_json(force=True)
    graph = data.get("graph")
    db.update_workflow(
        workflow_id,
        graph_json=json.dumps(graph) if graph is not None else None,
        name=data.get("name"),
    )
    return jsonify({"ok": True})


@app.delete("/api/workflows/<int:workflow_id>")
def api_delete_workflow(workflow_id):
    db.delete_workflow(workflow_id)
    return jsonify({"ok": True})


@app.post("/api/workflows/<int:workflow_id>/run-python")
def api_run_workflow_python(workflow_id):
    data = request.get_json(force=True) or {}
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    graph = json.loads(wf["graph_json"])
    if data.get("graph") is not None:
        graph = data["graph"]
    if data.get("code") is not None:
        code = data["code"]
    else:
        code = workflow.generate_code(graph)
        db.update_workflow(workflow_id, generated_code=code)
    if data.get("check_only"):
        try:
            compile(code, f"<workflow {workflow_id}>", "exec")
            return jsonify({"ok": True, "error": None, "line": None})
        except SyntaxError as exc:
            return jsonify({"ok": False, "error": str(exc), "line": exc.lineno})
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc), "line": getattr(exc, "lineno", None)})

    # This endpoint intentionally executes user-confirmed local workflow code on the owner's machine.
    try:
        completed = proc_util.run(
            [_runtime_python() if not WORKFLOW_RUN_PYTHON.is_file() else str(WORKFLOW_RUN_PYTHON), "-c", code],
            cwd=Path(__file__).parent,
            capture_output=True,
            text=True,
            timeout=60,
        )
        stdout = completed.stdout or ""
        result = {
            "stdout": stdout[:20000],
            "stderr": (completed.stderr or "")[:10000],
            "exit_code": completed.returncode,
        }
        trace = {
            "run_id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "exit_code": completed.returncode,
            "stdout_tail": stdout[-2000:],
            "events": [],
        }
        if not isinstance(graph.get("meta"), dict):
            graph["meta"] = {}
        graph["meta"]["last_trace"] = trace
        db.update_workflow(workflow_id, graph_json=json.dumps(graph))
        try:
            db.insert_receipt(
                "blueprint",
                "run",
                f"{wf['name']}: exit {completed.returncode}",
                entity_id=str(workflow_id),
            )
        except Exception as exc:
            print(f"[app] receipt insert failed: {exc}")
        return jsonify(result)
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        stderr = (stderr + "\nTimed out after 60 seconds.").strip()
        trace = {
            "run_id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "exit_code": -1,
            "stdout_tail": stdout[-2000:],
            "events": [],
        }
        if not isinstance(graph.get("meta"), dict):
            graph["meta"] = {}
        graph["meta"]["last_trace"] = trace
        db.update_workflow(workflow_id, graph_json=json.dumps(graph))
        try:
            db.insert_receipt(
                "blueprint",
                "run",
                f"{wf['name']}: exit -1",
                entity_id=str(workflow_id),
            )
        except Exception as receipt_exc:
            print(f"[app] receipt insert failed: {receipt_exc}")
        return jsonify({"stdout": stdout[:20000], "stderr": stderr[:10000], "exit_code": -1})


@app.post("/api/workflows/<int:workflow_id>/generate")
def api_generate_workflow_code(workflow_id):
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    graph = json.loads(wf["graph_json"])
    code = workflow.generate_code(graph)
    db.update_workflow(workflow_id, generated_code=code)
    return jsonify({"code": code})


@app.post("/api/workflows/<int:workflow_id>/generate-cpp")
def api_generate_workflow_cpp(workflow_id):
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    graph = data.get("graph") or json.loads(wf["graph_json"])
    code = workflow.generate_cpp(graph)
    return jsonify({"code": code, "language": "cpp"})


@app.post("/api/workflows/preview")
def api_preview_workflow_code():
    """Stateless codegen for the Automation Studio's live preview -- runs the same
    generate_code() as the real Generate/Save actions, just without touching the
    DB, so the preview can refresh on every graph edit without a save each time.
    """
    data = request.get_json(force=True)
    graph = data.get("graph", {"nodes": [], "edges": []})
    lang = (data.get("language") or "python").lower()
    if lang in ("cpp", "c++", "cxx"):
        return jsonify({"code": workflow.generate_cpp(graph), "language": "cpp"})
    return jsonify({"code": workflow.generate_code(graph), "language": "python"})


@app.post("/api/workflows/<int:workflow_id>/diagnostics")
def api_workflow_diagnostics(workflow_id):
    data = request.get_json(force=True) or {}
    if "graph" in data:
        graph = data["graph"]
    else:
        wf = db.get_workflow(workflow_id)
        if not wf:
            return jsonify({"error": "not found"}), 404
        graph = json.loads(wf["graph_json"])
    return jsonify(workflow.diagnose_graph(graph))


@app.get("/api/workflows/<int:workflow_id>/health")
def api_workflow_health(workflow_id):
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    graph = json.loads(wf["graph_json"])
    return jsonify(workflow.graph_health(graph))


@app.get("/api/workflows/<int:workflow_id>/trace/latest")
def api_workflow_trace_latest(workflow_id):
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    graph = json.loads(wf["graph_json"])
    meta = graph.get("meta") if isinstance(graph.get("meta"), dict) else {}
    trace = meta.get("last_trace")
    if not trace:
        return jsonify({"none": True})
    return jsonify(trace)


@app.get("/api/workflows/<int:workflow_id>/script-content")
def api_workflow_script_content(workflow_id):
    wf = db.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "not found"}), 404
    path = _workflow_script_path(wf)
    if not path.is_file():
        return jsonify({"error": "script not found"}), 404
    return jsonify({"content": path.read_text(encoding="utf-8"), "path": str(path)})


@app.post("/api/workflows/import-python")
def api_import_workflow_python():
    data = request.get_json(force=True) or {}
    code = data.get("code") or ""
    if not code.strip():
        return jsonify({"error": "code is required"}), 400
    try:
        graph, unmapped = _python_to_workflow_graph(code)
    except SyntaxError as exc:
        return jsonify({"error": str(exc), "line": exc.lineno}), 400
    return jsonify({"graph": graph, "unmapped": unmapped})


@app.post("/api/workflows/export-markdown")
def api_export_workflow_markdown():
    data = request.get_json(force=True) or {}
    graph = data.get("graph", {"nodes": [], "edges": []})
    name = (data.get("name") or graph.get("name") or "Untitled workflow").strip()
    return jsonify({"markdown": workflow.graph_to_markdown(graph, name=name)})


@app.post("/api/workflows/import-markdown")
def api_import_workflow_markdown():
    data = request.get_json(force=True) or {}
    md = data.get("markdown") or data.get("content") or ""
    if not md.strip():
        return jsonify({"error": "markdown is required"}), 400
    try:
        graph = workflow.markdown_to_graph(md)
    except (json.JSONDecodeError, ValueError) as exc:
        return jsonify({"error": f"parse error: {exc}"}), 400
    name = (data.get("name") or graph.pop("name", None) or "Imported workflow").strip()
    return jsonify({"graph": graph, "name": name})


@app.post("/api/workflows/vibecode")
def api_vibecode_workflow():
    blocked = _vibecode_blocked_response()
    if blocked:
        return blocked
    data = request.get_json(force=True) or {}
    description = (data.get("description") or "").strip()
    if not description:
        return jsonify({"error": "description is required"}), 400
    try:
        result = orchestrator.run(
            "workflow_vibecoder",
            description=description,
            node_catalog=_workflow_node_catalog(),
        )
    except Exception as exc:
        return jsonify({"error": str(exc), "graph": {"nodes": [], "edges": [], "variables": [], "functions": []}, "warnings": []}), 200
    return jsonify({"graph": result.get("graph", {}), "warnings": result.get("warnings", [])})


@app.post("/api/workflows/suggest-improvements")
def api_suggest_workflow_improvements():
    data = request.get_json(force=True)
    code = (data.get("code") or "").strip()
    if not code:
        return jsonify({"error": "code is required"}), 400
    try:
        suggestions = orchestrator.run("workflow_code_reviewer", code=code)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    return jsonify({"suggestions": suggestions})


@app.post("/api/workflows/explain-selection")
def api_explain_workflow_selection():
    data = request.get_json(force=True)
    full_code = (data.get("full_code") or "").strip()
    selection = (data.get("selection") or "").strip()
    if not full_code or not selection:
        return jsonify({"error": "full_code and selection are required"}), 400
    try:
        explanation = orchestrator.run("workflow_code_explainer", full_code=full_code, selection=selection)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    return jsonify({"explanation": explanation})


@app.post("/api/workflows/<int:workflow_id>/save-script")
def api_save_workflow_script(workflow_id):
    """Direct save (you clicking a button), not an AI proposal -- no approval gate needed,
    same as editing Project Plan.md directly. Always lands in generated_scripts/, never
    overwrites existing project files.
    """
    wf = db.get_workflow(workflow_id)
    if not wf or not wf.get("generated_code"):
        return jsonify({"error": "generate the code first"}), 400
    GENERATED_SCRIPTS_DIR.mkdir(exist_ok=True)
    path = _workflow_script_path(wf)
    path.write_text(wf["generated_code"], encoding="utf-8")
    return jsonify({"ok": True, "path": str(path)})


# --- Custom apps registry ---------------------------------------------------------

@app.get("/api/apps")
def api_list_apps():
    return jsonify(db.list_custom_apps())


@app.post("/api/apps")
def api_create_app():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    emoji = (data.get("emoji") or "").strip()
    workflow_id = data.get("workflow_id")
    if workflow_id is not None:
        try:
            workflow_id = int(workflow_id)
        except (TypeError, ValueError):
            return jsonify({"error": "workflow_id must be an integer"}), 400
    app_id = db.insert_custom_app(name, emoji, workflow_id)
    return jsonify(db.get_custom_app(app_id)), 201


@app.delete("/api/apps/<int:app_id>")
def api_delete_app(app_id):
    db.delete_custom_app(app_id)
    return jsonify({"ok": True})


def _app_data_api_row(row):
    return {"id": row["id"], "row": row["row"], "created_at": row["created_at"]}


@app.get("/api/apps/<int:app_id>/data")
def api_list_app_data(app_id):
    return jsonify([_app_data_api_row(row) for row in db.list_app_data(app_id)])


@app.post("/api/apps/<int:app_id>/data")
def api_create_app_data(app_id):
    data = request.get_json(force=True) or {}
    row = data.get("row")
    if not isinstance(row, dict):
        return jsonify({"error": "row must be an object"}), 400
    return jsonify(_app_data_api_row(db.insert_app_data(app_id, row))), 201


@app.patch("/api/apps/<int:app_id>/data/<int:row_id>")
def api_update_app_data(app_id, row_id):
    data = request.get_json(force=True) or {}
    row = data.get("row")
    if not isinstance(row, dict):
        return jsonify({"error": "row must be an object"}), 400
    updated = db.update_app_data(app_id, row_id, row)
    if not updated:
        return jsonify({"error": "not found"}), 404
    return jsonify(_app_data_api_row(updated))


@app.delete("/api/apps/<int:app_id>/data/<int:row_id>")
def api_delete_app_data(app_id, row_id):
    db.delete_app_data(app_id, row_id)
    return jsonify({"ok": True})


# --- Contacts tab ---------------------------------------------------------

@app.get("/api/contacts")
def api_list_contacts():
    return jsonify(db.list_contacts())


@app.post("/api/contacts")
def api_create_contact():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    contact_id = db.upsert_contact(
        None,
        name=name,
        description=data.get("description", ""),
        met_where=data.get("met_where", ""),
        met_when=data.get("met_when", ""),
        what_they_do=data.get("what_they_do", ""),
        notes=data.get("notes", ""),
        email=data.get("email", ""),
        phone=data.get("phone", ""),
        linkedin_url=data.get("linkedin_url", ""),
        closeness=data.get("closeness") or "contact",
    )
    return jsonify({"id": contact_id}), 201


@app.patch("/api/contacts/<int:contact_id>")
def api_update_contact(contact_id):
    data = request.get_json(force=True)
    fields = {k: v for k, v in data.items()
              if k in ("name", "description", "met_where", "met_when", "what_they_do",
                        "notes", "email", "phone", "linkedin_url", "closeness")}
    db.upsert_contact(contact_id, **fields)
    return jsonify({"ok": True})


@app.delete("/api/contacts/<int:contact_id>")
def api_delete_contact(contact_id):
    db.delete_contact(contact_id)
    return jsonify({"ok": True})


@app.get("/api/contacts/suggestions")
def api_contact_suggestions():
    contacts = db.list_contacts()
    try:
        suggestions = orchestrator.run("contact_scout", contacts=contacts)
    except Exception as exc:
        return jsonify({"error": str(exc), "suggestions": []}), 200
    return jsonify({"suggestions": suggestions})


# --- Attachments (files/images on tasks, Agent chat messages, etc.) ---------------------------------------------------------

ATTACHMENTS_DIR = _DATA_DIR / "attachments"


@app.get("/api/attachments")
def api_list_attachments():
    entity_type = request.args.get("entity_type")
    entity_id = request.args.get("entity_id")
    if not entity_type or not entity_id:
        return jsonify({"error": "entity_type and entity_id are required"}), 400
    return jsonify(db.list_attachments(entity_type, int(entity_id)))


@app.post("/api/attachments")
def api_upload_attachment():
    file = request.files.get("file")
    entity_type = request.form.get("entity_type")
    entity_id = request.form.get("entity_id")
    if not file or not entity_type or not entity_id:
        return jsonify({"error": "file, entity_type, and entity_id are required"}), 400

    ATTACHMENTS_DIR.mkdir(exist_ok=True)
    original_name = file.filename or "upload"
    suffix = Path(original_name).suffix
    stored_filename = f"{uuid.uuid4().hex}{suffix}"
    file.save(ATTACHMENTS_DIR / stored_filename)

    attachment_id = db.insert_attachment(
        entity_type, int(entity_id), original_name, stored_filename, file.content_type,
    )
    stored_path = ATTACHMENTS_DIR / stored_filename
    extracted_text, text_chars, text_truncated, readable = _extract_attachment_text(
        stored_path, original_name,
    )
    payload = db.get_attachment(attachment_id)
    payload["extracted_text"] = extracted_text
    payload["text_chars"] = text_chars
    payload["text_truncated"] = text_truncated
    payload["readable"] = readable
    return jsonify(payload), 201


@app.get("/api/attachments/<int:attachment_id>/file")
def api_get_attachment_file(attachment_id):
    attachment = db.get_attachment(attachment_id)
    if not attachment:
        return jsonify({"error": "not found"}), 404
    return send_from_directory(
        ATTACHMENTS_DIR, attachment["stored_filename"],
        download_name=attachment["filename"], as_attachment=False,
    )


@app.delete("/api/attachments/<int:attachment_id>")
def api_delete_attachment(attachment_id):
    attachment = db.get_attachment(attachment_id)
    if attachment:
        try:
            (ATTACHMENTS_DIR / attachment["stored_filename"]).unlink(missing_ok=True)
        except OSError:
            pass
        db.delete_attachment(attachment_id)
    return jsonify({"ok": True})


# --- field_history (generic version history for tracked rich-editable fields) -------------------------------------------
# Snapshots are recorded server-side, right before a save overwrites the old value (see e.g.
# api_update_idea above), so history survives a closed tab. Up to 3 prior versions are kept per
# (entity_type, entity_id, field_name); see db.record_field_history / db.FIELD_HISTORY_LIMIT.

@app.get("/api/field-history/<entity_type>/<int:entity_id>/<field_name>")
def api_list_field_history(entity_type, entity_id, field_name):
    return jsonify(db.list_field_history(entity_type, entity_id, field_name))


# --- Tasks tab ---------------------------------------------------------

TASK_URGENCIES = ("low", "medium", "high", "critical")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _parse_task_importance(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError
    if isinstance(value, float) and not value.is_integer():
        raise ValueError
    importance = int(value)
    if not 0 <= importance <= 100:
        raise ValueError
    return importance


def _suggested_task_deadline(urgency):
    return db.suggest_task_deadline(urgency)


def _valid_time(value):
    return value is None or value == "" or bool(TIME_RE.fullmatch(str(value)))


@app.get("/api/tasks")
def api_list_tasks():
    return jsonify(db.list_tasks(search=request.args.get("search"), status=request.args.get("status")))


@app.post("/api/tasks")
def api_create_task():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    urgency = data.get("urgency") if data.get("urgency") in TASK_URGENCIES else "medium"
    try:
        importance = _parse_task_importance(data.get("importance"))
    except (TypeError, ValueError):
        return jsonify({"error": "importance must be an integer 0-100"}), 400
    goal_id = data.get("goal_id")
    try:
        goal_id = int(goal_id) if goal_id not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "goal_id must be an integer"}), 400
    if goal_id is not None and not db.get_goal(goal_id):
        return jsonify({"error": "goal not found"}), 404
    tags = data.get("tags")
    if isinstance(tags, list):
        tags = ",".join(str(t).strip() for t in tags if str(t).strip())
    task_id = db.insert_task(
        title, description=data.get("description", ""), notes=data.get("notes", ""),
        urgency=urgency, importance=importance,
        progress_total=data.get("progress_total"), progress_unit=data.get("progress_unit"),
        contact_id=data.get("contact_id"), project_id=data.get("project_id"),
        due_date=data.get("due_date"), category=data.get("category"),
        assignee_id=data.get("assignee_id"),
        deadline_dismissed=True if not data.get("due_date") else data.get("deadline_dismissed") is True,
        goal_id=goal_id,
        created_by=data.get("created_by") or "user",
        tags=tags,
        deadline_kind=data.get("deadline_kind"),
        estimate_minutes=data.get("estimate_minutes"),
    )
    result = db.get_task(task_id)
    if urgency == "critical":
        if os.environ.get("PLANNER_TO_EMAIL"):
            email_sender.send(
                os.environ["PLANNER_TO_EMAIL"], f"[critical] New task: {title}",
                f"{title}\n\n{data.get('notes', '')}",
            )
        notify.send_discord(f"🚨 Critical task: {title}")
    try:
        rules.emit("task.created", dict(result))
    except Exception as _re:
        print(f"[rules] task.created hook error: {_re}")
    return jsonify(result), 201


@app.post("/api/tasks/suggest-urgency")
def api_suggest_task_urgency():
    data = request.get_json(force=True)
    try:
        urgency = orchestrator.run(
            "suggest_urgency", title=data.get("title", ""), notes=data.get("notes", "")
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    return jsonify({"urgency": urgency, "suggested_deadline": _suggested_task_deadline(urgency)})


@app.post("/api/tasks/check-similar")
def api_check_similar_task():
    """Local TF-IDF similarity against your other open tasks -- no API call, no cost.
    Catches "didn't I already add this" before you add a near-duplicate.
    """
    data = request.get_json(force=True)
    text = f"{data.get('title', '')} {data.get('notes', '')}".strip()
    existing = db.list_tasks(status="todo") + db.list_tasks(status="partial")
    if not text or not existing:
        return jsonify({"similar": []})
    corpus = [f"{t['title']} {t.get('notes') or ''}" for t in existing]
    sims = embeddings.similarity(text, corpus)
    similar = sorted(
        ({"task": t, "score": round(s, 3)} for t, s in zip(existing, sims) if s > 0.4),
        key=lambda x: -x["score"],
    )[:3]
    return jsonify({"similar": similar})


@app.post("/api/tasks/estimate-reference")
def api_task_estimate_reference():
    """Local TF-IDF similarity against your *completed* tasks -- shows how long similar past
    tasks actually took (completed_at - created_at) as a calibration reference for a new
    estimate. No API call, no cost.
    """
    data = request.get_json(force=True)
    text = f"{data.get('title', '')} {data.get('notes', '')}".strip()
    done = [t for t in db.list_tasks(status="done") if t.get("completed_at")]
    if not text or not done:
        return jsonify({"reference": []})
    corpus = [f"{t['title']} {t.get('notes') or ''}" for t in done]
    sims = embeddings.similarity(text, corpus)
    reference = []
    for t, s in sorted(zip(done, sims), key=lambda x: -x[1]):
        if s <= 0.3:
            continue
        elapsed = datetime.fromisoformat(t["completed_at"]) - datetime.fromisoformat(t["created_at"])
        reference.append({
            "task": t, "score": round(float(s), 3),
            "elapsed_hours": round(elapsed.total_seconds() / 3600, 1),
        })
        if len(reference) >= 3:
            break
    return jsonify({"reference": reference})


@app.patch("/api/tasks/<int:task_id>")
def api_update_task(task_id):
    data = request.get_json(force=True)
    existing = db.get_task(task_id)
    if not existing:
        return jsonify({"error": "not found"}), 404
    fields = {k: v for k, v in data.items()
              if k in ("title", "description", "notes", "status", "progress_done", "progress_total",
                        "progress_unit", "urgency", "importance", "due_date", "deadline_dismissed",
                        "category", "assignee_id", "contact_id", "project_id", "goal_id",
                        "created_by", "tags", "deadline_kind", "estimate_minutes",
                        "prerequisite_id", "hard_mode")}
    if "tags" in fields and isinstance(fields["tags"], list):
        fields["tags"] = ",".join(str(t).strip() for t in fields["tags"] if str(t).strip())
    if "importance" in fields:
        try:
            fields["importance"] = _parse_task_importance(fields["importance"])
        except (TypeError, ValueError):
            return jsonify({"error": "importance must be an integer 0-100"}), 400
    if "goal_id" in fields:
        try:
            raw_goal = fields["goal_id"]
            fields["goal_id"] = int(raw_goal) if raw_goal not in (None, "") else None
        except (TypeError, ValueError):
            return jsonify({"error": "goal_id must be an integer"}), 400
        if fields["goal_id"] is not None and not db.get_goal(fields["goal_id"]):
            return jsonify({"error": "goal not found"}), 404
    if "due_date" in data:
        if data.get("due_date"):
            fields["deadline_dismissed"] = 0
            fields["deadline_kind"] = fields.get("deadline_kind") or "hard"
        else:
            fields["due_date"] = None
            fields["deadline_dismissed"] = 1
            fields["deadline_kind"] = fields.get("deadline_kind") or "indefinite"
    elif data.get("deadline_dismissed") is True:
        fields["due_date"] = None
        fields["deadline_dismissed"] = 1
        fields["deadline_kind"] = fields.get("deadline_kind") or "indefinite"
    db.update_task(task_id, **fields)
    result = db.get_task(task_id)
    if fields.get("status") == "done":
        try:
            rules.emit("task.completed", dict(result))
        except Exception as _re:
            print(f"[rules] task.completed hook error: {_re}")
        try:
            import napkin_issues
            napkin_issues.settle_bets()
        except Exception:
            pass
    return jsonify(result)


@app.patch("/api/tasks/reorder")
def api_reorder_tasks():
    """Persists a manual drag-reorder from the Tasks tab. Body: {"ids": [task_id, ...]} in the
    new display order -- normally just the tasks within one status group (Open/Partial/Done),
    since that's the unit the UI drags within.
    """
    data = request.get_json(force=True)
    ids = data.get("ids") or []
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "ids must be a list of task ids"}), 400
    db.reorder_tasks(ids)
    return jsonify({"ok": True})


@app.post("/api/tasks/cleanup")
def api_cleanup_tasks():
    """AI cleanup for open tasks: rewrite titles, notes/help, estimates, urgency, project links."""
    data = request.get_json(force=True) or {}
    raw_ids = data.get("task_ids")
    all_open = [t for t in db.list_tasks() if t["status"] in ("todo", "partial")]

    if raw_ids is None:
        targets = all_open[:40]
    elif isinstance(raw_ids, list) and len(raw_ids) == 0:
        targets = all_open[:40]
    else:
        try:
            id_set = {int(i) for i in raw_ids}
        except (TypeError, ValueError):
            return jsonify({"error": "task_ids must be a list of integers"}), 400
        targets = [t for t in all_open if t["id"] in id_set][:40]

    if not targets:
        return jsonify({"updated": [], "skipped": 0})

    projects = db.list_projects()
    try:
        proposals = ai.cleanup_tasks(targets, projects)
    except Exception as exc:
        return jsonify({"error": str(exc), "updated": [], "skipped": len(targets)}), 200

    updated = []
    skipped = 0
    allowed_ids = {t["id"] for t in targets}
    seen = set()

    for prop in proposals or []:
        if not isinstance(prop, dict):
            skipped += 1
            continue
        try:
            tid = int(prop.get("id"))
        except (TypeError, ValueError):
            skipped += 1
            continue
        if tid not in allowed_ids or tid in seen:
            skipped += 1
            continue
        seen.add(tid)

        fields = {}
        title = prop.get("title")
        if title:
            title = str(title).strip()
            if title:
                fields["title"] = title

        desc = prop.get("description")
        help_text = prop.get("help")
        if desc or help_text:
            parts = []
            if desc and str(desc).strip():
                parts.append(str(desc).strip())
            if help_text and str(help_text).strip():
                parts.append("How to:\n" + str(help_text).strip())
            if parts:
                fields["notes"] = "\n\n".join(parts)

        urgency = prop.get("urgency")
        if urgency in TASK_URGENCIES:
            fields["urgency"] = urgency

        est = prop.get("estimate_hours")
        if est is not None:
            try:
                est = round(float(est), 1)
                if est > 0:
                    fields["progress_total"] = est
                    fields["progress_unit"] = "h"
            except (TypeError, ValueError):
                pass

        proj_id = prop.get("project_id")
        if proj_id is not None:
            try:
                proj_id = int(proj_id)
                if any(p["id"] == proj_id for p in projects):
                    fields["project_id"] = proj_id
            except (TypeError, ValueError):
                pass

        if not fields:
            skipped += 1
            continue
        db.update_task(tid, **fields)
        updated.append(db.get_task(tid))

    skipped += len(targets) - len(seen)
    return jsonify({"updated": updated, "skipped": skipped})


@app.post("/api/tasks/parse-freeform")
def api_parse_freeform_tasks():
    """Tasks tab "quick capture": takes a rambling, unpunctuated brain-dump and asks the
    freeform_task_parser subagent to split it into distinct clean task proposals (title, notes,
    urgency, rough hour estimate). Proposals only -- nothing is created here, same
    review-before-commit pattern as /api/documents/classify; a separate plain POST /api/tasks
    call per confirmed item is what actually creates each task.
    """
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    try:
        items = orchestrator.run("freeform_task_parser", text=text)
    except Exception as exc:
        return jsonify({"error": str(exc), "items": []}), 200
    return jsonify({"items": items})


@app.delete("/api/tasks/<int:task_id>")
def api_delete_task(task_id):
    # Clean up any files on disk for this task's attachments before the DB rows
    # (which db.delete_task removes) disappear -- same pattern as api_delete_attachment.
    for attachment in db.list_attachments("task", task_id):
        try:
            (ATTACHMENTS_DIR / attachment["stored_filename"]).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete_task(task_id)
    return jsonify({"ok": True})


@app.get("/api/task-schedule")
def api_list_task_schedule():
    date_value = (request.args.get("date") or "").strip()
    if not date_value:
        return jsonify({"error": "date is required"}), 400
    return jsonify(db.list_task_schedule(date_value))


@app.post("/api/task-schedule")
def api_schedule_task():
    data = request.get_json(force=True)
    date_value = (data.get("date") or "").strip()
    try:
        task_id = int(data.get("task_id"))
        hours = sorted({int(hour) for hour in data.get("hours", [])})
    except (TypeError, ValueError):
        return jsonify({"error": "task_id and integer hours are required"}), 400
    if not db.get_task(task_id):
        return jsonify({"error": "task not found"}), 404
    if not date_value or not hours or any(hour < 0 or hour > 23 for hour in hours):
        return jsonify({"error": "date and hours between 0 and 23 are required"}), 400
    db.schedule_task(task_id, date_value, hours)
    return jsonify(db.list_task_schedule(date_value))


@app.delete("/api/task-schedule/<int:task_id>")
def api_unschedule_task(task_id):
    date_value = (request.args.get("date") or "").strip()
    if not date_value:
        return jsonify({"error": "date is required"}), 400
    db.unschedule_task(task_id, date_value)
    return jsonify({"ok": True})


# --- Events tab ---------------------------------------------------------

@app.get("/api/events")
def api_list_events():
    return jsonify(db.list_events())


@app.post("/api/events")
def api_create_event():
    data = request.get_json(force=True)
    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "title required"}), 400
    date_value = (data.get("date") or "").strip()
    all_day = data.get("all_day") is True
    start_time = (data.get("start_time") or "").strip() or None
    end_time = (data.get("end_time") or "").strip() or None
    if not date_value:
        return jsonify({"error": "date required"}), 400
    if not all_day and (not start_time or not end_time):
        return jsonify({"error": "start_time and end_time are required unless all_day is explicit"}), 400
    if not _valid_time(start_time) or not _valid_time(end_time):
        return jsonify({"error": "times must use HH:MM"}), 400
    if not all_day and not data.get("end_date") and end_time <= start_time:
        return jsonify({"error": "end_time must be after start_time"}), 400
    event_id = db.insert_event(
        title, data.get("description", ""), data.get("date", ""),
        data.get("location", ""), data.get("url", ""),
        source="human", status=data.get("status") or "interested",
        end_date=data.get("end_date") or None,
        start_time=None if all_day else start_time,
        end_time=None if all_day else end_time,
        all_day=all_day,
    )
    return jsonify(db.get_event(event_id)), 201


@app.patch("/api/events/<int:event_id>")
def api_update_event(event_id):
    """From claude_notes: "events can carry through multiple days" -- lets an event's date range
    be edited after creation (end_date null/blank means single-day, same as before this existed).
    """
    data = request.get_json(force=True)
    existing = db.get_event(event_id)
    if not existing:
        return jsonify({"error": "not found"}), 404
    fields = {k: v for k, v in data.items()
              if k in ("title", "description", "date", "end_date", "start_time", "end_time",
                        "all_day", "location", "url", "status")}
    merged = {**existing, **fields}
    all_day = bool(merged.get("all_day"))
    if all_day:
        fields["start_time"] = None
        fields["end_time"] = None
        fields["all_day"] = 1
    else:
        start_time = merged.get("start_time")
        end_time = merged.get("end_time")
        if not start_time or not end_time or not _valid_time(start_time) or not _valid_time(end_time):
            return jsonify({"error": "timed events require start_time and end_time in HH:MM"}), 400
        if not merged.get("end_date") and end_time <= start_time:
            return jsonify({"error": "end_time must be after start_time"}), 400
        fields["all_day"] = 0
    db.update_event(event_id, **fields)
    return jsonify(db.get_event(event_id))


@app.post("/api/events/<int:event_id>/status")
def api_set_event_status(event_id):
    data = request.get_json(force=True)
    db.set_event_status(event_id, data.get("status", "suggested"))
    return jsonify({"ok": True})


@app.delete("/api/events/<int:event_id>")
def api_delete_event(event_id):
    db.delete_event(event_id)
    return jsonify({"ok": True})


@app.get("/api/events/settings")
def api_get_event_settings():
    settings = db.get_settings()
    return jsonify({
        "interests": settings.get("events_interests", ""),
        "location": settings.get("events_location", ""),
    })


@app.post("/api/events/scan")
def api_scan_events():
    data = request.get_json(force=True)
    settings = db.get_settings()
    interests = (data.get("interests") or settings.get("events_interests", "")).strip()
    location = (data.get("location") or settings.get("events_location", "")).strip()
    if not interests or not location:
        return jsonify({"error": "interests and location are both required"}), 400

    db.save_settings({"events_interests": interests, "events_location": location})
    results = orchestrator.run("event_scout", location=location, interests=interests)
    for r in results:
        db.insert_event(
            r.get("title", ""), r.get("description", ""), r.get("date", ""),
            r.get("location", ""), r.get("url", ""), source="ai", status="suggested",
        )
    return jsonify(db.list_events())


# --- Ideas tab: 3D semantic map ---------------------------------------------------------

@app.get("/api/ideas")
def api_list_ideas():
    return jsonify(db.list_ideas())


@app.post("/api/ideas")
def api_create_idea():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title and not body:
        return jsonify({"error": "title or body is required"}), 400
    if not title:
        title = (body[:50] + "...") if len(body) > 50 else body
    idea_id = db.insert_idea(title, body, source=data.get("source", "human"))

    ideas = db.list_ideas()
    texts = [f"{i['title']} {i.get('body') or ''}" for i in ideas]
    coords = embeddings.texts_to_3d(texts)
    for idea, (x, y, z) in zip(ideas, coords):
        db.update_idea_coords(idea["id"], x, y, z)

    try:
        rules.emit("idea.created", {"id": idea_id, "title": title, "body": body})
    except Exception as _re:
        print(f"[rules] idea.created hook error: {_re}")
    return jsonify(db.list_ideas()), 201


@app.patch("/api/ideas/reorder")
def api_reorder_ideas():
    data = request.get_json(force=True)
    ids = data.get("ids") or []
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "ids must be a list of idea ids"}), 400
    db.reorder_ideas(ids)
    return jsonify({"ok": True})


@app.get("/api/ideas/<int:idea_id>")
def api_get_idea(idea_id):
    idea = db.get_idea(idea_id)
    if not idea:
        return jsonify({"error": "not found"}), 404
    return jsonify(idea)


@app.post("/api/ideas/<int:idea_id>/promote-to-project")
def api_promote_idea_to_project(idea_id):
    """From claude_notes: "link the idea list and projects simply because all projects are
    ideas". Creates a real project seeded from the idea's title/body, and keeps a pointer back
    (source_idea_id) so the Projects tab can show where it came from.
    """
    idea = db.get_idea(idea_id)
    if not idea:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    kind = data.get("kind") or "software"
    project_id = db.insert_project(idea["title"], idea.get("body") or "", kind, source_idea_id=idea_id)
    return jsonify({"project": db.get_project(project_id)}), 201


@app.patch("/api/ideas/<int:idea_id>/link-project")
def api_link_idea_project(idea_id):
    if not db.get_idea(idea_id):
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True)
    project_id = data.get("project_id")
    if project_id in ("", None):
        for project in db.list_projects():
            if project.get("source_idea_id") == idea_id:
                db.update_project(project["id"], source_idea_id=None)
        return jsonify({"ok": True})
    try:
        project_id = int(project_id)
    except (TypeError, ValueError):
        return jsonify({"error": "project_id must be an integer"}), 400
    if not db.get_project(project_id):
        return jsonify({"error": "project not found"}), 404
    db.update_project(project_id, source_idea_id=idea_id)
    return jsonify({"project": db.get_project(project_id)})


@app.patch("/api/ideas/<int:idea_id>")
def api_update_idea(idea_id):
    data = request.get_json(force=True)
    existing = db.get_idea(idea_id)
    if not existing:
        return jsonify({"error": "not found"}), 404
    if "body" in data and (data.get("body") or "") != (existing.get("body") or ""):
        db.record_field_history("idea", idea_id, "body", existing.get("body") or "")

    idea = db.update_idea(idea_id, data)
    if not idea:
        return jsonify({"error": "not found"}), 404

    ideas = db.list_ideas()
    texts = [f"{i['title']} {i.get('body') or ''}" for i in ideas]
    coords = embeddings.texts_to_3d(texts)
    for i, (x, y, z) in zip(ideas, coords):
        db.update_idea_coords(i["id"], x, y, z)

    return jsonify(db.get_idea(idea_id))


@app.delete("/api/ideas/<int:idea_id>")
def api_delete_idea(idea_id):
    db.delete_idea(idea_id)
    return jsonify({"ok": True})


@app.post("/api/ideas/<int:idea_id>/evaluate")
def api_evaluate_idea(idea_id):
    idea = db.get_idea(idea_id)
    if not idea:
        return jsonify({"error": "not found"}), 404
    result = orchestrator.run("idea_evaluator", title=idea["title"], body=idea.get("body") or "")
    return jsonify(result)


@app.post("/api/ideas/<int:idea_id>/pitch-reply")
def api_idea_pitch_reply(idea_id):
    idea = db.get_idea(idea_id)
    if not idea:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True)
    question = (data.get("question") or "").strip()
    user_reply = (data.get("reply") or "").strip()
    if not question or not user_reply:
        return jsonify({"error": "question and reply are required"}), 400
    reply = orchestrator.run(
        "investor_pitch_reply", title=idea["title"], body=idea.get("body") or "",
        question=question, user_reply=user_reply,
    )
    return jsonify({"reply": reply})


@app.get("/api/ideas/<int:idea_id>/similar")
def api_get_idea_similar(idea_id):
    return jsonify(db.list_idea_similarity_results(idea_id))


@app.post("/api/ideas/<int:idea_id>/scan-similar")
def api_scan_idea_similar(idea_id):
    """Opt-in, per-idea web search for existing similar products/projects -- a real API +
    web-search call, so only ever runs when the human clicks the button on that one idea.
    """
    idea = db.get_idea(idea_id)
    if not idea:
        return jsonify({"error": "not found"}), 404
    try:
        results = orchestrator.run("idea_similarity_scout", title=idea["title"], body=idea.get("body") or "")
    except Exception as exc:
        return jsonify({"error": str(exc), "results": []}), 200
    db.replace_idea_similarity_results(idea_id, results)
    return jsonify({"results": db.list_idea_similarity_results(idea_id)})


# --- Projects tab: registry + live similarity flagging ---------------------------------------------------------

_PROJECT_EVENT_TITLES = {
    "status_change": "Status changed",
    "progress_change": "Progress updated",
    "created": "Project created",
    "note_milestone": "Milestone",
}


def _log_project_event(project_id, kind, detail=None):
    try:
        db.insert_project_event(project_id, kind, detail)
    except Exception:
        pass


def _build_project_timeline(project_id):
    project = db.get_project(project_id)
    if not project:
        return None

    entries = []

    if project.get("created_at"):
        entries.append({
            "when": project["created_at"],
            "type": "created",
            "title": "Project created",
            "detail": project.get("name") or "",
        })

    if project.get("completed_at"):
        parts = []
        if project.get("grade"):
            parts.append(f"Grade: {project['grade']}")
        if project.get("archive_notes"):
            parts.append(project["archive_notes"])
        entries.append({
            "when": project["completed_at"],
            "type": "archived",
            "title": "Project archived",
            "detail": " — ".join(parts),
        })

    for ev in db.list_project_events(project_id):
        entries.append({
            "when": ev["created_at"],
            "type": ev["kind"],
            "title": _PROJECT_EVENT_TITLES.get(ev["kind"], ev["kind"].replace("_", " ").title()),
            "detail": ev.get("detail") or "",
        })

    for note in db.list_project_notes(project_id):
        cat = note.get("category") or "general"
        entries.append({
            "when": note["created_at"],
            "type": f"note:{cat}",
            "title": f"Note ({cat})",
            "detail": note.get("body") or "",
        })

    for task in db.list_completed_tasks_for_project(project_id):
        entries.append({
            "when": task["completed_at"],
            "type": "task_done",
            "title": task.get("title") or "Task completed",
            "detail": task.get("notes") or "",
        })

    for comp in db.list_competitions_for_project(project_id):
        status = comp.get("status") or "found"
        title = comp.get("title") or "Competition"
        entries.append({
            "when": comp["created_at"],
            "type": "competition",
            "title": f"{title} ({status})",
            "detail": comp.get("description") or "",
        })

    for receipt in db.list_receipts_for_project(project_id, project.get("name") or ""):
        entries.append({
            "when": receipt["created_at"],
            "type": "receipt",
            "title": f"{receipt.get('source', 'receipt')}: {receipt.get('kind', '')}",
            "detail": receipt.get("summary") or "",
        })

    entries.sort(key=lambda e: e.get("when") or "")
    return entries[:500]


def _format_chronicle_markdown(project_id):
    project = db.get_project(project_id)
    if not project:
        return None

    name = project.get("name") or "Untitled"
    lines = [f"# {name} — chronicle", ""]

    lines.append("## Overview")
    lines.append(f"- **Status:** {project.get('status') or 'active'}")
    lines.append(f"- **Progress:** {project.get('progress') if project.get('progress') is not None else 0}%")
    if project.get("grade"):
        lines.append(f"- **Grade:** {project['grade']}")
    lines.append(f"- **Created:** {project.get('created_at') or '—'}")
    if project.get("completed_at"):
        lines.append(f"- **Completed:** {project['completed_at']}")
    if project.get("description"):
        lines.append("")
        lines.append(project["description"])
    if project.get("archive_notes"):
        lines.append("")
        lines.append(f"**Archive notes:** {project['archive_notes']}")
    lines.append("")

    lines.append("## Timeline")
    timeline = _build_project_timeline(project_id)
    if timeline:
        for entry in timeline:
            when = (entry.get("when") or "")[:10]
            lines.append(f"- **{when}** — {entry.get('title', '')} (`{entry.get('type', '')}`)")
            detail = (entry.get("detail") or "").strip()
            if detail:
                for detail_line in detail.splitlines():
                    lines.append(f"  {detail_line}")
    else:
        lines.append("_No timeline entries yet._")
    lines.append("")

    lines.append("## Pinned notes")
    notes = db.list_project_notes(project_id)
    pinned = [n for n in notes if n.get("pinned")]
    if pinned:
        for note in sorted(pinned, key=lambda n: n.get("created_at") or ""):
            cat = note.get("category") or "general"
            when = (note.get("created_at") or "")[:10]
            lines.append(f"- **{when}** [{cat}] {(note.get('body') or '').strip()}")
    else:
        lines.append("_No pinned notes._")
    lines.append("")

    lines.append("## Devlog")
    by_category = {}
    for note in notes:
        cat = note.get("category") or "general"
        by_category.setdefault(cat, []).append(note)
    if by_category:
        for cat in sorted(by_category.keys()):
            lines.append(f"### {cat}")
            for note in sorted(by_category[cat], key=lambda n: n.get("created_at") or ""):
                when = (note.get("created_at") or "")[:10]
                pin = " 📌" if note.get("pinned") else ""
                lines.append(f"- **{when}**{pin} {(note.get('body') or '').strip()}")
            lines.append("")
    else:
        lines.append("_No devlog entries yet._")

    return "\n".join(lines).rstrip() + "\n"


@app.get("/api/projects")
def api_list_projects():
    return jsonify(db.list_projects())


@app.patch("/api/projects/reorder")
def api_reorder_projects():
    """Persists a manual drag-reorder from the Projects tab. Body: {"ids": [project_id, ...]}
    in the new display order -- normally just the active or archived group, matching how the
    tab visually separates them.
    """
    data = request.get_json(force=True)
    ids = data.get("ids") or []
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "ids must be a list of project ids"}), 400
    db.reorder_projects(ids)
    return jsonify({"ok": True})


@app.post("/api/projects")
def api_create_project():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    kind = data.get("kind") or "software"
    if not name:
        return jsonify({"error": "name is required"}), 400

    existing = db.list_projects()
    similar = []
    if description and existing:
        sims = embeddings.similarity(description, [p.get("description") or "" for p in existing])
        similar = sorted(
            (
                {"project": p, "score": round(score, 3)}
                for p, score in zip(existing, sims)
                if score > 0.25
            ),
            key=lambda s: -s["score"],
        )[:5]

    project_id = db.insert_project(name, description, kind)
    return jsonify({"project": db.get_project(project_id), "similar": similar}), 201


@app.patch("/api/projects/<int:project_id>")
def api_update_project(project_id):
    data = request.get_json(force=True)
    existing = db.get_project(project_id)
    if not existing:
        return jsonify({"error": "not found"}), 404
    if "description" in data and (data.get("description") or "") != (existing.get("description") or ""):
        db.record_field_history("project", project_id, "description", existing.get("description") or "")
    if "archive_notes" in data and (data.get("archive_notes") or "") != (existing.get("archive_notes") or ""):
        db.record_field_history("project", project_id, "archive_notes", existing.get("archive_notes") or "")
    fields = {k: v for k, v in data.items()
              if k in ("name", "status", "progress", "description", "kind", "path", "run_command",
                        "source_idea_id", "grade", "archive_notes", "completed_at")}
    db.update_project(project_id, **fields)
    try:
        if "status" in fields and fields["status"] != existing.get("status"):
            old_status = existing.get("status") or "active"
            new_status = fields["status"]
            _log_project_event(project_id, "status_change", f"{old_status} → {new_status}")
        if "progress" in fields:
            old_progress = existing.get("progress")
            if old_progress is None:
                old_progress = 0
            try:
                new_progress = int(fields["progress"])
                old_progress = int(old_progress)
            except (TypeError, ValueError):
                new_progress = None
            if new_progress is not None and abs(new_progress - old_progress) >= 5:
                _log_project_event(
                    project_id, "progress_change", f"{old_progress}% → {new_progress}%"
                )
    except Exception:
        pass
    return jsonify({"ok": True})


@app.delete("/api/projects/<int:project_id>")
def api_delete_project(project_id):
    """Removes the Planner's own record only -- never touches the actual project folder on disk."""
    db.delete_project(project_id)
    return jsonify({"ok": True})


@app.post("/api/projects/<int:project_id>/team")
def api_add_project_team_member(project_id):
    data = request.get_json(force=True)
    member_id = data.get("team_member_id")
    if not member_id:
        return jsonify({"error": "team_member_id is required"}), 400
    db.add_project_team_member(project_id, member_id)
    return jsonify(db.get_project(project_id)), 201


@app.delete("/api/projects/<int:project_id>/team/<int:member_id>")
def api_remove_project_team_member(project_id, member_id):
    db.remove_project_team_member(project_id, member_id)
    return jsonify({"ok": True})


@app.get("/api/projects/<int:project_id>/notes")
def api_list_project_notes(project_id):
    return jsonify(db.list_project_notes(project_id))


@app.post("/api/projects/<int:project_id>/notes")
def api_create_project_note(project_id):
    data = request.get_json(force=True)
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "body is required"}), 400
    category = data.get("category", "general")
    note_id = db.insert_project_note(project_id, category, body)
    if category == "milestone":
        try:
            _log_project_event(project_id, "note_milestone", body[:500])
        except Exception:
            pass
    return jsonify(db.list_project_notes(project_id)), 201


@app.patch("/api/project-notes/<int:note_id>")
def api_update_project_note(note_id):
    data = request.get_json(force=True)
    if not any(k in data for k in ("pinned", "body", "category")):
        return jsonify({"error": "pinned, body, or category is required"}), 400
    existing = db.get_project_note(note_id)
    if not existing:
        return jsonify({"error": "not found"}), 404
    updates = {}
    if "body" in data:
        updates["body"] = data.get("body") or ""
    if "category" in data:
        updates["category"] = data.get("category") or "general"
    if "pinned" in data:
        try:
            updates["pinned"] = 1 if int(data.get("pinned")) else 0
        except (TypeError, ValueError):
            return jsonify({"error": "pinned must be 0 or 1"}), 400
    note = db.update_project_note(note_id, **updates)
    return jsonify(note)


@app.delete("/api/project-notes/<int:note_id>")
def api_delete_project_note(note_id):
    db.delete_project_note(note_id)
    return jsonify({"ok": True})


@app.get("/api/projects/<int:project_id>/timeline")
def api_project_timeline(project_id):
    if not db.get_project(project_id):
        return jsonify({"error": "not found"}), 404
    return jsonify(_build_project_timeline(project_id))


@app.get("/api/projects/<int:project_id>/chronicle.md")
def api_project_chronicle_md(project_id):
    md = _format_chronicle_markdown(project_id)
    if md is None:
        return jsonify({"error": "not found"}), 404
    return Response(md, mimetype="text/markdown")


@app.get("/api/projects/deadlines")
def api_project_deadlines():
    return jsonify(db.project_deadlines())


@app.post("/api/projects/<int:project_id>/run")
def api_run_project(project_id):
    project = db.get_project(project_id)
    if not project or not project.get("path"):
        return jsonify({"error": "no path set for this project"}), 400
    path = Path(project["path"])
    if not path.is_dir():
        return jsonify({"error": f"path does not exist: {path}"}), 400
    command = project.get("run_command") or "python app.py"
    data = request.get_json(silent=True) or {}
    if not data.get("confirm"):
        return jsonify({
            "error": "confirmation required to run a project command",
            "confirm_required": True,
            "command": command,
            "cwd": str(path),
        }), 409
    try:
        argv = shlex.split(command, posix=(os.name != "nt"))
    except ValueError as exc:
        return jsonify({"error": f"could not parse command: {exc}"}), 400
    if not argv:
        return jsonify({"error": "empty command"}), 400
    try:
        # Hidden window, but the output is NOT thrown away: with no console there would be no
        # feedback at all from a project run, so it goes to a per-project log instead.
        log_dir = _DATA_DIR / "project-runs"
        log_dir.mkdir(parents=True, exist_ok=True)
        run_log = log_dir / f"{project_id}.log"
        with open(run_log, "ab", buffering=0) as sink:
            proc_util.popen(argv, cwd=path, stdout=sink, stderr=subprocess.STDOUT, shell=False)
    except FileNotFoundError:
        return jsonify({"error": f"command not found: {argv[0]}"}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, "ran": command, "argv": argv,
                    "cwd": str(path), "log": str(run_log)})


@app.post("/api/projects/<int:project_id>/open-folder")
def api_open_project_folder(project_id):
    project = db.get_project(project_id)
    if not project or not project.get("path"):
        return jsonify({"error": "no path set for this project"}), 400
    path = Path(project["path"])
    if not path.is_dir():
        return jsonify({"error": f"path does not exist: {path}"}), 400
    os.startfile(path)
    return jsonify({"ok": True})


@app.post("/api/code/open-in-vscode")
def api_open_in_vscode():
    """From claude_notes: "add the regular vs code as a tab [...] i can code with the widget i
    know". Can't embed the real VS Code app inside a web page, so this opens it for real via its
    own `code` CLI instead -- the actually-buildable version of that ask. Opens the whole project,
    or a specific file (optionally at a line) if one's currently loaded in the file viewer.
    """
    data = request.get_json(silent=True) or {}
    rel_path = data.get("path")
    target = backup.PROJECT_ROOT
    if rel_path:
        candidate = (backup.PROJECT_ROOT / rel_path).resolve()
        if backup.PROJECT_ROOT.resolve() not in candidate.parents and candidate != backup.PROJECT_ROOT.resolve():
            return jsonify({"error": "path escapes the project directory"}), 400
        target = candidate
    line = data.get("line")
    code_bin = shutil.which("code")
    if not code_bin:
        return jsonify({"error": "VS Code's 'code' command wasn't found on PATH"}), 400
    args = [code_bin, str(target)]
    if line and rel_path:
        args = [code_bin, "--goto", f"{target}:{line}"]
    try:
        proc = proc_util.popen(args, shell=False)
    except FileNotFoundError:
        return jsonify({"error": "VS Code's 'code' command wasn't found on PATH"}), 400
    import time
    time.sleep(0.35)
    if proc.poll() not in (None, 0):
        return jsonify({"error": f"VS Code exited immediately (code {proc.returncode})"}), 400
    return jsonify({"ok": True, "pid": proc.pid})


CODE_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".md", ".html", ".css", ".go", ".rs",
                   ".java", ".cpp", ".c", ".h", ".kv"}
CODE_SCAN_SKIP_DIRS = {"__pycache__", "node_modules", ".git", "venv", ".venv", "env", "build",
                        "dist", "target", "backups", "models", "output", "outputs", "runs", "data"}
CODE_SCAN_MAX_CHARS = 30000
CODE_SCAN_MAX_FILES = 15


def _sample_project_files(path):
    files = []
    total_chars = 0
    for f in sorted(path.rglob("*")):
        if len(files) >= CODE_SCAN_MAX_FILES or total_chars >= CODE_SCAN_MAX_CHARS:
            break
        if not f.is_file() or f.suffix not in CODE_EXTENSIONS:
            continue
        if any(part in CODE_SCAN_SKIP_DIRS for part in f.parts):
            continue
        try:
            content = f.read_text(encoding="utf-8", errors="ignore")[:3000]
        except OSError:
            continue
        files.append({"path": str(f.relative_to(path)), "content": content})
        total_chars += len(content)
    return files


@app.post("/api/projects/<int:project_id>/describe-from-readme")
def api_describe_project_from_readme(project_id):
    project = db.get_project(project_id)
    if not project or not project.get("path"):
        return jsonify({"error": "no path set for this project"}), 400
    path = Path(project["path"])
    if not path.is_dir():
        return jsonify({"error": f"path does not exist: {path}"}), 400

    readme_path = next(
        (path / name for name in ("README.md", "readme.md", "README.txt", "README")
         if (path / name).is_file()),
        None,
    )
    if not readme_path:
        return jsonify({"error": "no README found in this project's folder"}), 400

    readme_text = readme_path.read_text(encoding="utf-8", errors="ignore").strip()
    if not readme_text:
        return jsonify({"error": "README is empty"}), 400

    try:
        description = orchestrator.run(
            "project_description_from_readme", project_name=project["name"], readme_text=readme_text
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200

    db.update_project(project_id, description=description)
    return jsonify({"description": description})


@app.post("/api/projects/<int:project_id>/scan-code")
def api_scan_project_code(project_id):
    project = db.get_project(project_id)
    if not project or not project.get("path"):
        return jsonify({"error": "no path set for this project"}), 400
    path = Path(project["path"])
    if not path.is_dir():
        return jsonify({"error": f"path does not exist: {path}"}), 400

    file_samples = _sample_project_files(path)
    if not file_samples:
        return jsonify({"error": "no recognized source files found (see CODE_EXTENSIONS)"}), 400

    try:
        summary = orchestrator.run("codebase_summarizer", project_name=project["name"], file_samples=file_samples)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200

    db.update_project(project_id, code_summary=summary)

    others = [p for p in db.list_projects() if p["id"] != project_id and p.get("code_summary")]
    similar = []
    if others:
        sims = embeddings.similarity(summary, [p["code_summary"] for p in others])
        similar = sorted(
            ({"project": p, "score": round(s, 3)} for p, s in zip(others, sims) if s > 0.25),
            key=lambda x: -x["score"],
        )[:5]

    return jsonify({"summary": summary, "files_scanned": len(file_samples), "similar_by_code": similar})


# --- Customers tab ---------------------------------------------------------

def _is_stale(last_update):
    if not last_update:
        return True
    try:
        dt = datetime.fromisoformat(last_update)
    except ValueError:
        return True
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt) > timedelta(days=CUSTOMER_STALE_DAYS)


@app.get("/api/customers")
def api_list_customers():
    customers = db.list_customers()
    for c in customers:
        c["stale"] = _is_stale(c.get("last_update"))
    return jsonify(customers)


@app.post("/api/customers")
def api_create_customer():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    customer_id = db.insert_customer(name, data.get("company", ""), data.get("notes", ""))
    return jsonify(db.get_customer(customer_id)), 201


@app.patch("/api/customers/<int:customer_id>")
def api_update_customer(customer_id):
    data = request.get_json(force=True)
    fields = {k: v for k, v in data.items() if k in ("status", "notes", "company")}
    if fields:
        fields["last_update"] = db.now_iso()
    db.update_customer(customer_id, **fields)
    return jsonify({"ok": True})


@app.delete("/api/customers/<int:customer_id>")
def api_delete_customer(customer_id):
    db.delete_customer(customer_id)
    return jsonify({"ok": True})


# --- Calendar tab ---------------------------------------------------------

@app.get("/api/calendar")
def api_list_calendar():
    return jsonify(db.list_calendar_events(request.args.get("start"), request.args.get("end")))


@app.post("/api/calendar")
def api_create_calendar_event():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    date = (data.get("date") or "").strip()
    if not title or not date:
        return jsonify({"error": "title and date are required"}), 400
    import napkin_complete
    conflicts = napkin_complete.calendar_conflicts(
        date, data.get("start_time"), data.get("end_time"), title=title,
    )
    similar = None
    if hasattr(db, "find_similar_calendar_slot"):
        similar = db.find_similar_calendar_slot(title, date, data.get("start_time"))
        if similar and similar not in (conflicts.get("duplicates") or []):
            conflicts.setdefault("duplicates", []).append(similar)
    if (conflicts["overlaps"] or conflicts["duplicates"]) and not data.get("force"):
        return jsonify({
            "error": "calendar_conflict",
            "needs_confirmation": True,
            "overlaps": conflicts["overlaps"],
            "duplicates": conflicts["duplicates"],
        }), 409
    event_id = db.insert_calendar_event(
        title, date, data.get("start_time"), data.get("end_time"), data.get("category"), data.get("notes"),
        class_id=data.get("class_id"),
        url=data.get("url"),
        kind=data.get("kind"),
        lane=data.get("lane"),
    )
    _cal_ev = db.get_calendar_event(event_id)
    try:
        rules.emit("calendar.created", dict(_cal_ev))
    except Exception as _re:
        _note_runtime("rules.calendar.created", _re)
    return jsonify(_cal_ev), 201


@app.patch("/api/calendar/<int:event_id>")
def api_update_calendar_event(event_id):
    data = request.get_json(force=True)
    fields = {k: v for k, v in data.items()
              if k in ("title", "date", "start_time", "end_time", "category", "notes",
                       "url", "kind", "lane", "class_id", "status", "rrule", "series_id")}
    if "kind" in fields:
        fields["kind"] = "class" if fields["kind"] == "class" else "event"
    if "lane" in fields:
        fields["lane"] = "work" if fields["lane"] == "work" else "passion"
    db.update_calendar_event(event_id, **fields)
    return jsonify({"ok": True})


@app.delete("/api/calendar/<int:event_id>")
def api_delete_calendar_event(event_id):
    db.delete_calendar_event(event_id)
    return jsonify({"ok": True})


@app.post("/api/calendar/import-ics")
def api_import_ics():
    """Import a .ics file (university schedule export, Google/Outlook calendar export, etc.)
    -- works for any source that produces standard iCalendar, so there's no need to know which
    specific system you're pulling from.
    """
    from icalendar import Calendar

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "no file uploaded"}), 400
    try:
        cal = Calendar.from_ical(file.read())
    except Exception as exc:
        return jsonify({"error": f"could not parse .ics file: {exc}"}), 400

    imported = 0
    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        title = str(component.get("summary", "Untitled"))
        dtstart = component.get("dtstart")
        if not dtstart:
            continue
        start = dtstart.dt
        date = start.date().isoformat() if hasattr(start, "date") else start.isoformat()
        start_time = start.strftime("%H:%M") if hasattr(start, "hour") else None
        dtend = component.get("dtend")
        end_time = None
        if dtend and hasattr(dtend.dt, "hour"):
            end_time = dtend.dt.strftime("%H:%M")
        notes = str(component.get("description", "")) or None
        db.insert_calendar_event(title, date, start_time, end_time, None, notes)
        imported += 1

    return jsonify({"ok": True, "imported": imported})


@app.post("/api/calendar/<int:event_id>/sync-to-google")
def api_sync_calendar_event_to_google(event_id):
    """Creates (or re-creates) this Planner event on your connected Google Calendar."""
    event = db.get_calendar_event(event_id)
    if not event:
        return jsonify({"error": "not found"}), 404
    start_time = event.get("start_time") or "09:00"
    end_time = event.get("end_time") or start_time
    start_iso = f"{event['date']}T{start_time}:00"
    end_iso = f"{event['date']}T{end_time}:00"
    try:
        result = google_integration.create_calendar_event(
            event["title"], start_iso, end_iso, event.get("notes") or "",
        )
        db.update_calendar_event(event_id, google_event_id=result.get("id"))
        return jsonify({"ok": True, "google_event_id": result.get("id")})
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/calendar/pull-from-google")
def api_pull_calendar_from_google():
    """Imports upcoming events from your connected Google Calendar -- skips ones
    already pulled in before (matched by Google's event id)."""
    try:
        events = google_integration.list_calendar_events(max_results=50)
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    existing_ids = {e.get("google_event_id") for e in db.list_calendar_events() if e.get("google_event_id")}
    imported = 0
    for ev in events:
        if ev["id"] in existing_ids:
            continue
        start = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date")
        end = ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date")
        if not start:
            continue
        date = start[:10]
        start_time = start[11:16] if "T" in start else None
        end_time = end[11:16] if end and "T" in end else None
        new_id = db.insert_calendar_event(
            ev.get("summary", "Untitled"), date, start_time, end_time, None, ev.get("description"),
        )
        db.update_calendar_event(new_id, google_event_id=ev["id"])
        imported += 1

    return jsonify({"ok": True, "imported": imported})


# --- Competitions / hackathons tab ---------------------------------------------------------

@app.get("/api/competitions")
def api_list_competitions():
    return jsonify(db.list_competitions())


@app.post("/api/competitions/scan")
def api_scan_competitions():
    data = request.get_json(force=True)
    description = (data.get("description") or "").strip()
    if not description:
        return jsonify({"error": "description is required"}), 400
    try:
        results = orchestrator.run("competition_scout", project_description=description)
    except Exception as exc:
        return jsonify({"error": str(exc), "results": []}), 200
    for r in results:
        db.insert_competition(r.get("title", ""), r.get("description", ""), r.get("type", ""), r.get("url", ""))
    return jsonify({"results": results})


@app.post("/api/competitions")
def api_create_competition():
    """Manual entry -- ones you already did or want to attend, not found by the AI scan."""
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    status = data.get("status") or "interested"
    comp_id = db.insert_competition(
        title, data.get("description", ""), data.get("type", ""), data.get("url", ""),
        status=status, source="human",
    )
    return jsonify(db.list_competitions()), 201


COMPETITION_STATUSES = ("found", "interested", "attended", "won", "grade_only")


@app.patch("/api/competitions/<int:competition_id>")
def api_update_competition(competition_id):
    data = request.get_json(force=True)
    if "status" in data and data["status"] not in COMPETITION_STATUSES:
        return jsonify({"error": f"status must be one of {COMPETITION_STATUSES}"}), 400
    fields = {k: v for k, v in data.items()
              if k in ("title", "description", "type", "url", "status", "project_id", "personal_credit")}
    db.update_competition(competition_id, **fields)
    return jsonify({"ok": True})


@app.delete("/api/competitions/<int:competition_id>")
def api_delete_competition(competition_id):
    db.delete_competition(competition_id)
    return jsonify({"ok": True})


# --- Undo-delete ("Recently Deleted") ---------------------------------------------------------
# From claude_notes ("if i accidentally delete a big selection it still saved somewhere") --
# covers tasks/projects/ideas/notes/contacts/competitions specifically, see db.RESTORE_TABLES.

@app.get("/api/trash")
def api_list_trash():
    return jsonify(db.list_trash())


@app.post("/api/trash/<int:trash_id>/restore")
def api_restore_deletion(trash_id):
    result = db.restore_deletion(trash_id)
    if not result:
        return jsonify({"error": "not found"}), 404
    return jsonify(result)


# --- Practice tab (cognitive drill minigames) ---------------------------------------------------------
# Category A of the Practice/Minigames platform spec'd in Project Plan.md (2026-07-14). Zero API
# cost by design -- practice_games.py generates everything in plain Python. The frontend computes
# its own score client-side and POSTs it to /submit (single-user local app, nothing to protect the
# answers from) -- /submit is what actually persists the attempt and adjusts difficulty.

PRACTICE_GENERATORS = {
    "memory": practice_games.generate_memory_round,
    "working_memory": practice_games.generate_working_memory_round,
    "math": practice_games.generate_math_round,
    "logic": practice_games.generate_logic_round,
    "time_estimation": practice_games.generate_time_estimation_round,
    "spelling": practice_games.generate_spelling_round,
    "hardware": practice_games.generate_hardware_round,
}


@app.get("/api/practice/games")
def api_list_practice_games():
    leaderboard = db.practice_leaderboard()
    games = []
    for key, meta in practice_games.GAMES.items():
        stats = leaderboard.get(key, {})
        games.append({
            "key": key, "label": meta["label"], "category": meta["category"], "mode": meta["mode"],
            "icon": meta.get("icon"), "desc": meta.get("desc"),
            "difficulty": db.get_practice_difficulty(key),
            "best_ratio": stats.get("best_ratio"), "attempts": stats.get("attempts", 0),
        })
    return jsonify(games)


@app.get("/api/practice/ai-models")
def api_practice_ai_models():
    return jsonify(practice_games.ai_models_catalog_response())


@app.post("/api/practice/<game_key>/start")
def api_start_practice_round(game_key):
    meta = practice_games.GAMES.get(game_key)
    if not meta:
        return jsonify({"error": "unknown game"}), 400
    body = request.get_json(silent=True) or {}

    if game_key == "neural_net_fix":
        try:
            picked = practice_games.pick_ai_model(body.get("model_key"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        model_key = picked["model_key"]
        difficulty = picked["difficulty"]
        try:
            if body.get("difficulty_override") is not None:
                difficulty = max(1, min(10, int(body["difficulty_override"])))
        except (TypeError, ValueError):
            return jsonify({"error": "difficulty_override must be an integer from 1 to 10"}), 400
        weakness = practice_games.weakness_context(model_key)
        try:
            # Convention exception: orchestrator.py is not owned here; flagship judgment calls
            # go direct to ai.py (same pattern as longterm fact generation above).
            challenge_data = ai.generate_ai_trainer_challenge(
                model_key, picked["model_name"], difficulty, weakness,
            )
        except Exception as exc:
            return jsonify({"error": str(exc)}), 200
        round_data = {
            **challenge_data,
            "model_key": model_key,
            "model_name": picked["model_name"],
            "chosen_by": picked["chosen_by"],
            "probabilities": picked["probabilities"],
            "selection_formula": picked["selection_formula"],
            "weakness_context": weakness or None,
        }
        return jsonify({"difficulty": difficulty, "round": round_data})

    difficulty = db.get_practice_difficulty(game_key)
    try:
        if body.get("difficulty_override") is not None:
            difficulty = max(1, min(10, int(body["difficulty_override"])))
    except (TypeError, ValueError):
        return jsonify({"error": "difficulty_override must be an integer from 1 to 10"}), 400
    if meta["mode"] == "longterm":
        due = db.get_due_longterm_fact()
        if due:
            round_data = {"phase": "recall", "fact_id": due["id"],
                          "challenge": "Earlier I gave you a fact to remember. Write down everything you recall of it.",
                          "reference": due["fact"]}
        else:
            try:
                fact = ai.generate_longterm_fact()
            except Exception as exc:
                return jsonify({"error": str(exc)}), 200
            due_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
            db.insert_longterm_fact(fact, due_at)
            round_data = {"phase": "learn", "fact": fact, "pending": db.count_pending_longterm()}
    elif meta["mode"] == "ai":
        try:
            round_data = orchestrator.run("practice_challenge", game_key=game_key, difficulty=difficulty)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 200
    else:
        if game_key == "hardware":
            stage = body.get("stage")
            mode = body.get("mode")
            round_data = PRACTICE_GENERATORS[game_key](difficulty, stage=stage, mode=mode)
        else:
            round_data = PRACTICE_GENERATORS[game_key](difficulty)
    return jsonify({"difficulty": difficulty, "round": round_data})


@app.get("/api/practice/summary")
def api_practice_summary():
    return jsonify(db.practice_totals())


@app.post("/api/practice/<game_key>/grade")
def api_grade_practice_round(game_key):
    """AI-graded games (incl. long-term recall): grades the free-text answer against the round's
    hidden grading key, records the attempt, and adjusts difficulty -- server-side in one call.
    """
    meta = practice_games.GAMES.get(game_key)
    if not meta or meta["mode"] not in ("ai", "longterm"):
        return jsonify({"error": "not an AI-graded game"}), 400
    data = request.get_json(force=True)
    answer = (data.get("answer") or "").strip()
    if not answer:
        return jsonify({"error": "answer is required"}), 400
    try:
        result = orchestrator.run(
            "practice_grader", game_key=game_key,
            challenge=data.get("challenge") or "", reference=data.get("reference") or "", answer=answer,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    if meta["mode"] == "longterm" and data.get("fact_id"):
        db.mark_longterm_done(int(data["fact_id"]))
    difficulty = data.get("difficulty") or db.get_practice_difficulty(game_key)
    new_difficulty = db.record_practice_attempt(game_key, result["score"], 10, difficulty)
    review_id = None
    if game_key == "neural_net_fix":
        model_key = (data.get("model_key") or "").strip()
        if not model_key:
            return jsonify({"error": "model_key is required for neural_net_fix grading"}), 400
        composite_key = practice_games.composite_difficulty_key(model_key)
        try:
            review_id = db.insert_practice_review(
                game_key=game_key,
                model_key=model_key,
                difficulty=difficulty,
                challenge=data.get("challenge") or "",
                user_answer=answer,
                score=result["score"],
                max_score=10,
                feedback=result["feedback"],
                reference=data.get("reference") or "",
            )
            new_difficulty = db.bump_practice_difficulty(composite_key, result["score"], 10)
        except Exception as exc:
            return jsonify({"error": f"review storage failed: {exc}"}), 200
    try:
        db.insert_receipt(
            "arcade",
            "match_played",
            f"{game_key}: {result['score']}/10",
            entity_id=game_key,
        )
    except Exception as exc:
        print(f"[app] receipt insert failed: {exc}")
    payload = {
        "score": result["score"],
        "max_score": 10,
        "feedback": result["feedback"],
        "new_difficulty": new_difficulty,
        "reference": data.get("reference") or "",
    }
    if review_id is not None:
        payload["review_id"] = review_id
    return jsonify(payload)


@app.post("/api/practice/<game_key>/submit")
def api_submit_practice_round(game_key):
    if game_key not in practice_games.GAMES:
        return jsonify({"error": "unknown game"}), 400
    data = request.get_json(force=True)
    score = data.get("score")
    max_score = data.get("max_score")
    difficulty = data.get("difficulty")
    if score is None or max_score is None or difficulty is None:
        return jsonify({"error": "score, max_score, and difficulty are required"}), 400
    new_difficulty = db.record_practice_attempt(game_key, score, max_score, difficulty, details=data.get("details"))
    try:
        db.insert_receipt(
            "arcade",
            "match_played",
            f"{game_key}: {score}/{max_score}",
            entity_id=game_key,
        )
    except Exception as exc:
        print(f"[app] receipt insert failed: {exc}")
    return jsonify({"new_difficulty": new_difficulty})


@app.get("/api/practice/<game_key>/history")
def api_practice_history(game_key):
    return jsonify(db.list_practice_attempts(game_key))


@app.get("/api/practice/reviews")
def api_list_practice_reviews():
    game_key = request.args.get("game_key") or None
    model_key = request.args.get("model_key") or None
    try:
        limit = int(request.args.get("limit", 30))
    except (TypeError, ValueError):
        limit = 30
    rows = db.list_practice_reviews(game_key=game_key, model_key=model_key, limit=limit)
    out = []
    for r in rows:
        fb = (r.get("feedback") or "")
        out.append({
            "id": r["id"],
            "model_key": r["model_key"],
            "score": r["score"],
            "max_score": r["max_score"],
            "created_at": r["created_at"],
            "has_detail": bool(r.get("detailed_review")),
            "feedback": fb[:120] + ("..." if len(fb) > 120 else ""),
        })
    return jsonify(out)


@app.get("/api/practice/reviews/<int:review_id>")
def api_get_practice_review(review_id):
    row = db.get_practice_review(review_id)
    if not row:
        return jsonify({"error": "review not found"}), 404
    if row.get("detailed_review"):
        try:
            row["detailed_review"] = json.loads(row["detailed_review"])
        except (TypeError, json.JSONDecodeError):
            pass
    return jsonify(row)


@app.post("/api/practice/reviews/<int:review_id>/deepen")
def api_deepen_practice_review(review_id):
    row = db.get_practice_review(review_id)
    if not row:
        return jsonify({"error": "review not found"}), 404
    if row.get("detailed_review"):
        try:
            cached = json.loads(row["detailed_review"])
        except (TypeError, json.JSONDecodeError):
            cached = row["detailed_review"]
        return jsonify({"review_id": review_id, "detailed_review": cached, "cached": True})
    try:
        # Convention exception: see neural_net_fix start route — direct ai call, not orchestrator.
        deep = ai.generate_review_deepdive(
            row["challenge"],
            row.get("reference") or "",
            row["user_answer"],
            row["score"],
            grading_feedback=row.get("feedback", ""),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    db.update_practice_review_detailed(review_id, json.dumps(deep))
    return jsonify({"review_id": review_id, "detailed_review": deep, "cached": False})


# --- Prompts page (claude_notes 2026-07-16: "search online for the best prompts [...] add it
# in a tab in the app as a page i can edit") -- one editable settings-backed document, seeded
# with a starter cheat sheet the first time it's read.

PROMPTS_PAGE_SEED = """# Prompt cheat sheet (edit me -- this page is yours)

Distilled from Anthropic's prompt-engineering docs + community best practice. Sources:
docs.anthropic.com/en/docs/build-with-claude/prompt-engineering, code.claude.com/docs/en/memory.

## The rules that matter most
1. Be explicit about the output you want (format, length, what to include/exclude). Vague ask = vague answer.
2. Give the model something to ground on: paste the actual data/code/text, don't describe it from memory.
3. For anything multi-step: ask it to state a short plan first, then execute. Catches misunderstandings early.
4. Examples beat instructions. One good input->output example outperforms a paragraph of rules.
5. Tell it what to do when unsure ("say 'not enough info' instead of guessing") -- kills most hallucination.
6. Assign a role only when it changes behavior ("you are a demanding code reviewer"), not as decoration.
7. Put long context first, the question/instruction last -- models weight the end of the prompt heavily.

## Cost control
- Route high-volume/low-stakes calls to a cheap model (this app: OpenAI gpt-5-mini via ai._cheap_json),
  keep the expensive model for judgment-heavy work.
- Cap max_tokens to what the task actually needs; don't default to huge limits.
- Reuse one well-tested prompt template per job instead of freeform per-call phrasing.

## Templates that work
- Extraction: "From the text below, extract X as JSON matching exactly this schema: {...}. Text: ..."
- Rewrite: "Rewrite the text below to be X. Keep Y unchanged. Do not add new claims. Text: ..."
- Critique: "List the 3 biggest problems with the following, most severe first, one sentence each + a fix."
- Grading: "Score 0-10 against this rubric: [...]. Justify in 2 sentences, naming rubric items hit/missed."
"""


@app.get("/api/prompts-page")
def api_get_prompts_page():
    content = db.get_settings().get("prompts_page")
    if not content:
        db.save_settings({"prompts_page": PROMPTS_PAGE_SEED})
        content = PROMPTS_PAGE_SEED
    return jsonify({"content": content})


@app.post("/api/prompts-page")
def api_save_prompts_page():
    data = request.get_json(force=True)
    db.save_settings({"prompts_page": data.get("content") or ""})
    return jsonify({"ok": True})


# --- Companion memory + history ----------------------------------------

_COMPANION_CONVERSATION_PREFIX = "Companion · "


def _is_companion_conversation(row):
    title = str((row or {}).get("title") or "")
    return title == "Companion" or title.startswith(_COMPANION_CONVERSATION_PREFIX)


def _public_companion_conversation(row):
    item = dict(row or {})
    stored_title = str(item.get("title") or "")
    if stored_title.startswith(_COMPANION_CONVERSATION_PREFIX):
        title = stored_title[len(_COMPANION_CONVERSATION_PREFIX):].strip() or "New chat"
    else:
        title = "Earlier chat" if item.get("message_count") else "New chat"
    item["title"] = title
    return item


def _list_companion_conversations():
    return [
        _public_companion_conversation(row)
        for row in db.list_agent_conversations(limit=100)
        if _is_companion_conversation(row)
    ]


def _ensure_companion_conversation(conversation_id=None):
    if conversation_id is not None:
        try:
            conversation_id = int(conversation_id)
        except (TypeError, ValueError):
            conversation_id = None
        row = db.get_agent_conversation(conversation_id) if conversation_id is not None else None
        if row and _is_companion_conversation(row):
            return row["id"]
    existing = _list_companion_conversations()
    if existing:
        return existing[0]["id"]
    return db.create_agent_conversation(
        f"{_COMPANION_CONVERSATION_PREFIX}New chat"
    )["id"]


def _clean_conversation_title_text(text):
    value = str(text or "").strip()
    # UI route/page context prefixes are transport context, not useful chat titles.
    while re.match(r"^\[[^\]]+\]\s*", value):
        value = re.sub(r"^\[[^\]]+\]\s*", "", value, count=1).strip()
    value = re.sub(r"--- BEGIN FILE CONTENT ---.*", "", value, flags=re.S).strip()
    value = re.sub(r"\s+", " ", value).strip(" \t\r\n-–—:;,.!?\"'")
    return value


def _maybe_autotitle_companion_conversation(conversation_id, user_message, reply=""):
    row = db.get_agent_conversation(conversation_id)
    if not row:
        return None
    stored_title = str(row.get("title") or "").strip()
    if stored_title not in (
        "Companion",
        f"{_COMPANION_CONVERSATION_PREFIX}New chat",
        f"{_COMPANION_CONVERSATION_PREFIX}Chat",
    ):
        return _public_companion_conversation(row)
    user_text = _clean_conversation_title_text(user_message)
    reply_text = _clean_conversation_title_text(reply)
    generic = user_text.casefold() in {
        "hi", "hello", "hey", "help", "thanks", "thank you", "ok", "okay",
    }
    candidate = reply_text if generic and reply_text else user_text
    if not candidate:
        candidate = reply_text
    if not candidate:
        return _public_companion_conversation(row)
    if len(candidate) > 48:
        candidate = candidate[:48].rsplit(" ", 1)[0].rstrip(" \t\r\n-–—:;,.!?") + "…"
    renamed = db.rename_agent_conversation(
        conversation_id,
        f"{_COMPANION_CONVERSATION_PREFIX}{candidate}",
    )
    return _public_companion_conversation(renamed)


def _companion_result_with_conversation(result, conversation_id, user_message, reply=""):
    titled = _maybe_autotitle_companion_conversation(
        conversation_id, user_message, reply=reply,
    )
    result["conversation_id"] = conversation_id
    result["conversation_title"] = (titled or {}).get("title") or "New chat"
    return result


@app.get("/api/companion/conversations")
def api_companion_conversations():
    try:
        conversations = _list_companion_conversations()
        if not conversations:
            cid = _ensure_companion_conversation()
            conversations = [_public_companion_conversation(db.get_agent_conversation(cid))]
        return jsonify({"conversations": conversations})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/companion/conversations")
def api_create_companion_conversation():
    try:
        row = db.create_agent_conversation(
            f"{_COMPANION_CONVERSATION_PREFIX}New chat"
        )
        return jsonify(_public_companion_conversation(row))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.patch("/api/companion/conversations/<int:conversation_id>")
def api_patch_companion_conversation(conversation_id):
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    try:
        row = db.get_agent_conversation(conversation_id)
        if not row or not _is_companion_conversation(row):
            return jsonify({"error": "companion conversation not found"}), 404
        renamed = db.rename_agent_conversation(
            conversation_id,
            f"{_COMPANION_CONVERSATION_PREFIX}{title}",
        )
        return jsonify(_public_companion_conversation(renamed))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.delete("/api/companion/conversations/<int:conversation_id>")
def api_delete_companion_conversation(conversation_id):
    try:
        row = db.get_agent_conversation(conversation_id)
        if not row or not _is_companion_conversation(row):
            return jsonify({"error": "companion conversation not found"}), 404
        db.delete_agent_conversation(conversation_id)
        conversations = _list_companion_conversations()
        if not conversations:
            cid = _ensure_companion_conversation()
            conversations = [_public_companion_conversation(db.get_agent_conversation(cid))]
        return jsonify({
            "ok": True,
            "deleted_id": conversation_id,
            "active_id": conversations[0]["id"],
            "conversations": conversations,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/companion/history")
def api_companion_history():
    conversation_id = request.args.get("conversation_id", type=int)
    if conversation_id is not None:
        try:
            cid = _ensure_companion_conversation(conversation_id)
            row = db.get_agent_conversation(cid) or {}
            messages = db.list_agent_messages(
                limit=companion_memory.MAX_HISTORY,
                conversation_id=cid,
            )
            for item in messages:
                if item.get("role") == "user" and item.get("content") != "Confirmed.":
                    item["content"] = _clean_conversation_title_text(item.get("content"))
            return jsonify({
                "conversation_id": cid,
                "messages": messages,
                "updated_at": row.get("updated_at"),
            })
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    return jsonify(companion_memory.get_chat_history())


@app.put("/api/companion/history")
def api_companion_history_put():
    data = request.get_json(force=True) or {}
    messages = data.get("messages") or []
    conversation_id = data.get("conversation_id")
    if conversation_id is not None:
        # Text turns are already persisted by /api/companion/chat in agent_messages.
        # The browser keeps richer display metadata (Thoughts/cards) per conversation.
        cid = _ensure_companion_conversation(conversation_id)
        return jsonify({
            "ok": True,
            "conversation_id": cid,
            "messages": messages[-companion_memory.MAX_HISTORY:],
        })
    saved = companion_memory.save_chat_history(messages)
    return jsonify({"ok": True, "messages": saved})


@app.get("/api/companion/memories")
def api_companion_memories():
    return jsonify({"memories": companion_memory.get_memories()})


@app.post("/api/companion/memories")
def api_companion_memories_post():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    speaker = (data.get("speaker") or "").strip() or None
    quote = (data.get("quote") or "").strip() or None
    entry = companion_memory.add_memory(title, data.get("body") or "", speaker=speaker, quote=quote)
    return jsonify({"ok": True, "memory": entry})


@app.delete("/api/companion/memories/<memory_id>")
def api_companion_memories_delete(memory_id):
    return jsonify(companion_memory.delete_memory(memory_id))


@app.put("/api/companion/memories/<memory_id>")
def api_companion_memories_put(memory_id):
    data = request.get_json(force=True) or {}
    result = companion_memory.update_memory(
        memory_id,
        data.get("title"),
        data.get("body"),
        reinforce=bool(data.get("reinforce", True)),
    )
    if not result.get("ok"):
        return jsonify(result), 404
    return jsonify(result)


@app.post("/api/companion/memories/<memory_id>/reinforce")
def api_companion_memories_reinforce(memory_id):
    result = companion_memory.reinforce_memory(memory_id)
    if not result.get("ok"):
        return jsonify(result), 404
    return jsonify(result)


@app.post("/api/companion/add_core_memory")
def api_companion_add_core_memory():
    """Tool-like endpoint for rare, important companion facts."""
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    speaker = (data.get("speaker") or "").strip() or None
    quote = (data.get("quote") or "").strip() or None
    entry = companion_memory.add_core_memory(
        title, data.get("body") or "", speaker=speaker, quote=quote
    )
    return jsonify({"ok": True, "memory": entry})


def _companion_recent_turns(limit: int | None = None) -> list:
    messages = companion_memory.get_chat_history().get("messages") or []
    n = limit if limit is not None else companion_memory.CONTEXT_WINDOW_MESSAGES
    return messages[-n:]


def _companion_history_block(turns: list) -> str:
    if not turns:
        return ""
    lines = []
    for item in turns:
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        speaker = item.get("speaker") or ("You" if role == "user" else "Companion")
        lines.append(f"{speaker}: {content[:1200]}")
    if not lines:
        return ""
    return "Recent companion chat:\n" + "\n".join(lines) + "\n\n"


@app.post("/api/companion/chat")
def api_companion_chat():
    data = request.get_json(force=True) or {}
    raw_message = (data.get("message") or "").strip()
    if not raw_message:
        return jsonify({"error": "message is required"}), 400
    route_strength = companion_memory.normalize_route_strength(data.get("route_strength"))
    tool_policy = companion_memory.tool_policy_for_route(route_strength)
    user_speaker = (data.get("speaker") or "You").strip() or "You"
    is_tool_confirmation = raw_message.startswith(agent.CONFIRM_TOOL_PREFIX)
    requested_conversation_id = data.get("conversation_id")
    companion_cid = _ensure_companion_conversation(requested_conversation_id)

    stored_message = "Confirmed." if is_tool_confirmation else raw_message
    companion_memory.append_chat_turn("user", stored_message, speaker=user_speaker)

    # Relevance-ranked recall for this message/action — applied before tools/answers, not on ask.
    memory_prefix = companion_memory.build_memory_context_prefix(query=raw_message)

    try:
        if is_tool_confirmation:
            result = agent.chat(
                raw_message,
                tool_policy=companion_memory.TOOL_POLICY_AUTO,
                conversation_id=companion_cid,
            )
            result["route_strength"] = route_strength
            result["tool_policy"] = companion_memory.TOOL_POLICY_AUTO
            reply = result.get("reply", "")
            if reply:
                companion_memory.append_chat_turn("assistant", reply, speaker="Agent")
            return jsonify(_companion_result_with_conversation(
                result, companion_cid, stored_message, reply=reply,
            ))

        if companion_memory.uses_agent_tools(route_strength):
            # agent.chat injects relevance-ranked memories before tool use.
            result = agent.chat(
                raw_message,
                tool_policy=tool_policy,
                conversation_id=companion_cid,
            )
            result["route_strength"] = route_strength
            result["tool_policy"] = tool_policy
            reply = result.get("reply", "")
            if reply:
                companion_memory.append_chat_turn("assistant", reply, speaker="Agent")
            return jsonify(_companion_result_with_conversation(
                result, companion_cid, raw_message, reply=reply,
            ))

        prior_turns = db.list_agent_messages(
            limit=companion_memory.CONTEXT_WINDOW_MESSAGES,
            conversation_id=companion_cid,
        )
        prior_turns = prior_turns[-companion_memory.CONTEXT_WINDOW_MESSAGES:]
        history = _companion_history_block(prior_turns)
        db.insert_agent_message("user", raw_message, conversation_id=companion_cid)
        refresh = ""
        try:
            refresh = agent._waypoint_capabilities_refresh()
        except Exception:
            refresh = "You are Waypoint's page companion."
        prompt = (
            f"{history}"
            f"{memory_prefix}"
            f"{refresh}\n\n"
            "You are the Waypoint page companion: concise, helpful, scoped to the user's current tab. "
            "This turn has no tools (fast route) — answer directly. "
            "If the user asks to add/save/update/delete planner data (contacts, tasks, events, etc.), "
            "do NOT claim Waypoint cannot write and do NOT invent a paste/manual-entry workaround — "
            "tell them briefly you'll need a stronger tool turn, and ask them to restate the save "
            "request (e.g. 'add contact Ada …') so tools can run. "
            "Track who said what when speaker names appear. "
            "Companion memories above were auto-recalled for this turn — use them before answering or "
            "suggesting actions when relevant; do not wait for the user to ask if you remember. "
            "Prefer saving durable facts: append one line when you learn something worth keeping — "
            "[remember: speaker | short title | detail] (3 parts) or [remember: short title | detail] (2 parts). "
            "Optionally end with [followups: next ask | another | third]. "
            "If you reason privately, wrap it in <think>...</think> then give the user-facing answer.\n\n"
            f"You: {raw_message}"
        )
        max_tokens = 500 if route_strength == companion_memory.ROUTE_FAST else 900
        role = "tasks" if route_strength == companion_memory.ROUTE_FAST else "practice"
        agent.begin_chat_turn()
        try:
            raw_reply = ai.route_text(role, prompt, max_tokens=max_tokens)
            if agent.chat_cancel_requested():
                reply = "Stopped by you."
                db.insert_agent_message("assistant", reply, conversation_id=companion_cid)
                companion_memory.append_chat_turn("assistant", reply, speaker="Companion")
                return jsonify(_companion_result_with_conversation({
                    "reply": reply,
                    "actions": [],
                    "steps": [],
                    "cancelled": True,
                    "route_strength": route_strength,
                    "tool_policy": companion_memory.TOOL_POLICY_NONE,
                }, companion_cid, raw_message, reply=reply))
        finally:
            agent.finish_chat_turn()
        parse_thinking = (ai.LAST_SOURCE == "ollama") or ai.offline_mode_enabled()
        finalized = __import__("reply_parse").finalize_reply(raw_reply, parse_thinking=parse_thinking)
        reply = finalized["reply"]
        db.insert_agent_message("assistant", reply, conversation_id=companion_cid)
        companion_memory.append_chat_turn("assistant", reply, speaker="Companion")
        result = {
            "reply": reply,
            "actions": [],
            "steps": [],
            "route_strength": route_strength,
            "tool_policy": companion_memory.TOOL_POLICY_NONE,
            "model_role": role,
            "thinking": finalized.get("thinking") or "",
            "followups": finalized.get("followups") or [],
            "source": ai.LAST_SOURCE,
        }
        return jsonify(_companion_result_with_conversation(
            result, companion_cid, raw_message, reply=reply,
        ))
    except Exception as exc:
        return jsonify({
            "error": str(exc),
            "route_strength": route_strength,
            "tool_policy": tool_policy,
            "conversation_id": companion_cid,
            "conversation_title": (
                _public_companion_conversation(
                    db.get_agent_conversation(companion_cid)
                ).get("title")
            ),
        }), 200


# --- About tab ---------------------------------------------------------

@app.get("/api/agent/conversations")
def api_agent_conversations():
    """List Agent chats, last-talked-to first."""
    try:
        conversations = db.list_agent_conversations(limit=100)
        if not any(not _is_companion_conversation(row) for row in conversations):
            db.create_agent_conversation("New chat")
            conversations = db.list_agent_conversations(limit=100)
        return jsonify(conversations)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/agent/conversations")
def api_create_agent_conversation():
    """Start a new chat (fresh context window; companion memories still apply)."""
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "New chat").strip() or "New chat"
    try:
        return jsonify(db.create_agent_conversation(title))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.patch("/api/agent/conversations/<int:conversation_id>")
def api_patch_agent_conversation(conversation_id):
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    try:
        row = db.rename_agent_conversation(conversation_id, title)
        if not row:
            return jsonify({"error": "conversation not found"}), 404
        return jsonify(row)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.delete("/api/agent/conversations/<int:conversation_id>")
def api_delete_agent_conversation(conversation_id):
    try:
        result = db.delete_agent_conversation(conversation_id)
        active = db.get_agent_conversation(result.get("active_id"))
        if active and _is_companion_conversation(active):
            replacement = next(
                (
                    row for row in db.list_agent_conversations(limit=100)
                    if not _is_companion_conversation(row)
                ),
                None,
            )
            if replacement is None:
                replacement = db.create_agent_conversation("New chat")
            result["active_id"] = replacement["id"]
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/agent/messages")
def api_agent_messages():
    conversation_id = request.args.get("conversation_id", type=int)
    limit = request.args.get("limit", default=80, type=int) or 80
    try:
        cid = db.ensure_agent_conversation(conversation_id)
        return jsonify({
            "conversation_id": cid,
            "messages": db.list_agent_messages(limit=min(limit, 200), conversation_id=cid),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.delete("/api/agent/messages")
def api_clear_agent_messages():
    data = request.get_json(silent=True) or {}
    conversation_id = data.get("conversation_id") or request.args.get("conversation_id", type=int)
    try:
        if conversation_id is None:
            conversation_id = db.ensure_agent_conversation(None)
        db.clear_agent_messages(conversation_id=int(conversation_id))
        return jsonify({"ok": True, "conversation_id": int(conversation_id)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/happiness-policy")
def api_happiness_policy():
    try:
        import happiness_policy
        return jsonify(happiness_policy.suggest())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/happiness-policy/reward")
def api_happiness_policy_reward():
    data = request.get_json(force=True) or {}
    try:
        import happiness_policy
        if data.get("text"):
            return jsonify(happiness_policy.observe_text_feedback(data.get("text"), data.get("section")))
        section = data.get("section") or "Today"
        reward = float(data.get("reward", 0))
        return jsonify(happiness_policy.apply_reward(section, reward, source=data.get("source") or "manual", note=data.get("note") or ""))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/agent/chat")
def api_agent_chat():
    data = request.get_json(force=True)
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400
    attachment_ids = data.get("attachment_ids") or []
    if attachment_ids and "BEGIN FILE CONTENT" not in message:
        message = _enrich_message_with_attachments(message, attachment_ids)
    source = (data.get("source") or "").strip().lower()
    route_strength = (data.get("route_strength") or "normal").strip().lower()
    if source == "companion":
        return api_companion_chat()
    try:
        conversation_id = data.get("conversation_id")
        if conversation_id is not None:
            conversation_id = int(conversation_id)
        result = agent.chat(message, conversation_id=conversation_id)
        if route_strength in ("fast", "normal", "strong"):
            result["route_strength"] = route_strength
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    try:
        import happiness_policy
        result["happiness_policy"] = happiness_policy.observe_text_feedback(message, data.get("section") or "Agent")
    except Exception as exc:
        _note_runtime("agent_chat.happiness_policy", exc)
    try:
        db.record_conversation("agent", "user", message)
        if result.get("reply"):
            db.record_conversation("agent", "assistant", result["reply"])
    except Exception as exc:
        _note_runtime("agent_chat.record_conversation", exc)
    return jsonify(result)


@app.post("/api/agent/steer")
def api_agent_steer():
    data = request.get_json(force=True)
    message = data.get("message") or ""
    try:
        return jsonify(agent.steer(message))
    except Exception as exc:
        return jsonify({"queued": False, "note": str(exc)})


@app.get("/api/agent/running")
def api_agent_running():
    try:
        return jsonify(agent.get_running_state())
    except Exception as exc:
        return jsonify({"in_flight": False, "running_agents": [], "error": str(exc)})


def _api_agent_cancel(agent_id):
    agent_id = (agent_id or "").strip()
    if not agent_id:
        return jsonify({"ok": False, "error": "agent_id required"}), 400
    if agent_id == "chat":
        return jsonify(agent.request_chat_cancel())
    try:
        return jsonify(orchestrator.request_cancel(agent_id))
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.post("/api/agent/cancel")
def api_agent_cancel():
    data = request.get_json(force=True) or {}
    agent_id = (data.get("agent_id") or data.get("id") or "").strip()
    return _api_agent_cancel(agent_id)


@app.post("/api/agent/<agent_id>/cancel")
def api_agent_cancel_path(agent_id):
    return _api_agent_cancel(agent_id)


@app.get("/api/agent/activity")
def api_agent_activity():
    logs = db.recent_agent_logs(limit=100)
    texts = [f"{l['subagent']} {l['summary']}" for l in logs]
    for log, (x, y) in zip(logs, embeddings.texts_to_2d(texts)):
        log["x"] = x
        log["y"] = y
    return jsonify(logs)


@app.get("/api/agent/activity/running")
def api_agent_activity_running():
    """Polled by the Agent tab to show what's genuinely in flight right now --
    separate from the historical map, which only ever shows finished runs."""
    return jsonify(db.currently_running_agent_logs())


@app.route("/api/agent/bugs", methods=["GET", "POST"])
def api_agent_bugs():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        action = str(data.get("action") or "").strip()
        try:
            bug_id = int(data.get("id") or 0)
        except (TypeError, ValueError):
            bug_id = 0
        if not bug_id or action not in ("accept", "dismiss"):
            return jsonify({"ok": False, "error": "need action accept/dismiss and id"}), 400
        bug = db.get_agent_bug(bug_id)
        if not bug:
            return jsonify({"ok": False, "error": "not found"}), 404
        if action == "accept":
            title = str(bug.get("title") or "Untitled").strip()
            details = str(bug.get("details") or "").strip()
            napkin_sync.sync([{
                "id": f"agent-bug-{bug_id}",
                "title": title,
                "details": details,
                "createdAt": bug.get("created_at") or "",
                "accepted": True,
            }])
            try:
                napkin_sync.compile_work_queue()
            except Exception as exc:
                print(f"[napkin] compile after bug accept failed: {exc}")
            updated = db.set_agent_bug_status(bug_id, "accepted")
            return jsonify({"ok": True, "accepted": True, "bug": updated})
        updated = db.set_agent_bug_status(bug_id, "dismissed")
        return jsonify({"ok": True, "dismissed": True, "bug": updated})
    status = request.args.get("status")
    if status == "all":
        status = None
    elif not status:
        status = "pending"
    return jsonify({"ok": True, "bugs": db.list_agent_bugs(status=status)})


# --- Pending actions: AI-proposed commands/file-edits awaiting approval ---------------------------------------------------------

@app.get("/api/actions")
def api_list_actions():
    actions = db.list_pending_actions(status=request.args.get("status"))
    for a in actions:
        a["payload"] = json.loads(a["payload"])
        if a.get("risk_summary"):
            try:
                a["risk_summary"] = json.loads(a["risk_summary"])
            except (TypeError, ValueError):
                a["risk_summary"] = None
    return jsonify(actions)


@app.post("/api/actions/<int:action_id>/approve")
def api_approve_action(action_id):
    action = db.get_pending_action(action_id)
    if not action or action["status"] != "pending":
        return jsonify({"error": "not found or already resolved"}), 404
    payload = json.loads(action["payload"])

    backup_path = backup.create_backup(reason=action["action_type"])

    if action["action_type"] == "file_edit":
        ok, target = backup.is_path_inside_project(payload["path"])
        if not ok:
            db.resolve_pending_action(action_id, "rejected", output="path outside project directory")
            return jsonify({"error": "path outside project directory"}), 400

        old_string = payload.get("old_string", "")
        new_string = payload["new_string"]
        if old_string:
            if not target.is_file():
                db.resolve_pending_action(action_id, "rejected", output="file no longer exists")
                return jsonify({"error": "file no longer exists"}), 400
            current = target.read_text(encoding="utf-8", errors="ignore")
            if current.count(old_string) != 1:
                db.resolve_pending_action(action_id, "rejected", output="old_string no longer matches exactly once -- file changed since this was proposed")
                return jsonify({"error": "old_string no longer matches exactly once in the file -- it may have changed since this was proposed"}), 400
            target.write_text(current.replace(old_string, new_string), encoding="utf-8")
            output = f"Replaced text in {payload['path']}. Backup: {backup_path}"
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(new_string, encoding="utf-8")
            output = f"Created {payload['path']} ({len(new_string)} bytes). Backup: {backup_path}"

    elif action["action_type"] == "command":
        try:
            proc = proc_util.run(
                payload["command"], shell=True, cwd=Path(__file__).parent,
                capture_output=True, text=True, timeout=COMMAND_TIMEOUT_SECONDS,
            )
            output = f"exit {proc.returncode}\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}\nBackup: {backup_path}"
        except subprocess.TimeoutExpired:
            output = f"Timed out after {COMMAND_TIMEOUT_SECONDS}s. Backup: {backup_path}"
    else:
        return jsonify({"error": f"unknown action type {action['action_type']}"}), 400

    db.resolve_pending_action(action_id, "approved", output=output)
    reason = payload.get("reason") or "(no reason given)"
    notify.send_discord(f"✅ Self-coding approved ({action['action_type']}): {reason}")
    return jsonify(db.get_pending_action(action_id))


@app.post("/api/actions/<int:action_id>/reject")
def api_reject_action(action_id):
    db.resolve_pending_action(action_id, "rejected")
    return jsonify({"ok": True})


# --- Project Plan (direct editing -- no approval gate, this is you editing, not the AI) ---------------------------------------------------------

@app.get("/api/plan")
def api_get_plan():
    return jsonify({"content": PLAN_PATH.read_text(encoding="utf-8") if PLAN_PATH.exists() else ""})


@app.post("/api/plan")
def api_save_plan():
    data = request.get_json(force=True)
    PLAN_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLAN_PATH.write_text(data.get("content", ""), encoding="utf-8")
    return jsonify({"ok": True})


NOTE_LIST_TYPES = ("skill", "problem", "thinking", "funny", "essay")

_SKILL_TOKEN_STOPWORDS = {
    "and", "for", "from", "into", "learn", "learning", "practice", "skill", "skills",
    "the", "this", "with", "basic", "basics", "advanced",
}
_PRACTICE_SKILL_ALIASES = {
    "memory": {"memorization", "recall", "vocabulary"},
    "working_memory": {"attention", "digits", "focus"},
    "math": {"arithmetic", "calculation", "numeracy"},
    "logic": {"deduction", "reasoning", "puzzles"},
    "spelling": {"orthography", "writing"},
    "time_estimation": {"timing", "estimation"},
    "comprehension": {"reading", "comprehension"},
    "summarizing": {"summary", "summarization", "synthesis"},
    "precise_word": {"vocabulary", "language", "wording"},
    "code_exercise": {
        "coding", "programming", "software", "javascript", "typescript", "java", "rust",
        "python", "assembly",
    },
    "pitch": {"pitching", "presentation", "persuasion", "sales"},
    "video_understanding": {"studying", "teaching", "learning"},
    "neural_net_fix": {"neural", "network", "machine", "deep"},
    "startup_sim": {"startup", "entrepreneurship", "business", "founder", "strategy"},
    "longterm": {"memory", "retention", "recall"},
    "hardware": {"electronics", "circuits", "robotics", "electrical", "hardware"},
}


def _skill_tokens(text):
    return {
        token for token in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(token) >= 3 and token not in _SKILL_TOKEN_STOPWORDS
    }


def _enrich_skill_notes(skills):
    trends = db.skill_proficiency_trends()
    attempts = db.latest_practice_attempts()
    enriched = []
    for skill in skills:
        item = dict(skill)
        item["proficiency_trend"] = trends.get(skill["id"], [])[-12:]
        title_tokens = _skill_tokens(skill.get("title"))
        best = None
        best_score = 0
        for attempt in attempts:
            game_key = attempt.get("game_key")
            meta = practice_games.GAMES.get(game_key) or {}
            game_tokens = _skill_tokens(
                f"{game_key or ''} {meta.get('label') or ''} {meta.get('desc') or ''}"
            ) | _PRACTICE_SKILL_ALIASES.get(game_key, set())
            score = len(title_tokens & game_tokens)
            if score > best_score:
                best_score = score
                best = {
                    "game_key": game_key,
                    "game_label": meta.get("label") or game_key,
                    "at": attempt.get("created_at"),
                    "score": attempt.get("score"),
                    "max_score": attempt.get("max_score"),
                }
        item["last_practiced"] = best if best_score else None
        enriched.append(item)
    return enriched


def _skill_coordinates(texts):
    """Use the shared embedding helper first; retain an isolated TF-IDF fallback."""
    try:
        coordinates = np.asarray(embeddings.texts_to_2d(texts), dtype=float)
        if coordinates.shape != (len(texts), 2) or not np.isfinite(coordinates).all():
            raise ValueError("embedding helper returned invalid coordinates")
        return coordinates.tolist(), "embeddings.py"
    except Exception as exc:
        print(f"[app] skill embeddings unavailable, using TF-IDF fallback: {exc}")
    try:
        from sklearn.decomposition import TruncatedSVD
        from sklearn.feature_extraction.text import TfidfVectorizer

        matrix = TfidfVectorizer(stop_words="english", max_features=2000).fit_transform(texts)
        components = min(2, len(texts) - 1, matrix.shape[1])
        coordinates = TruncatedSVD(n_components=components, random_state=0).fit_transform(matrix)
        if coordinates.shape[1] < 2:
            coordinates = np.hstack([coordinates, np.zeros((len(texts), 2 - coordinates.shape[1]))])
    except Exception:
        angles = np.linspace(0, 2 * np.pi, len(texts), endpoint=False)
        coordinates = np.column_stack([np.cos(angles), np.sin(angles)])
    return np.asarray(coordinates, dtype=float).tolist(), "tfidf-fallback"


@app.get("/api/lists/<list_type>")
def api_list_notes(list_type):
    if list_type not in NOTE_LIST_TYPES:
        return jsonify({"error": "unknown list type"}), 400
    notes = db.list_notes(list_type)
    return jsonify(_enrich_skill_notes(notes) if list_type == "skill" else notes)


@app.post("/api/lists/<list_type>")
def api_create_note(list_type):
    if list_type not in NOTE_LIST_TYPES:
        return jsonify({"error": "unknown list type"}), 400
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title and not body:
        return jsonify({"error": "title or body is required"}), 400
    if not title:
        title = (body[:50] + "...") if len(body) > 50 else body
    note_id = db.insert_note(list_type, title, body, source=data.get("source", "human"))
    try:
        rules.emit("note.created", {"id": note_id, "list_type": list_type, "title": title, "body": body})
    except Exception as _re:
        print(f"[rules] note.created hook error: {_re}")
    return jsonify({"id": note_id}), 201


@app.delete("/api/lists/<list_type>/<int:note_id>")
def api_delete_note(list_type, note_id):
    db.delete_note(note_id)
    return jsonify({"ok": True})


@app.patch("/api/lists/<list_type>/<int:note_id>")
def api_update_note_status(list_type, note_id):
    data = request.get_json(force=True)
    if not any(k in data for k in ("status", "proficiency", "title", "body")):
        return jsonify({"error": "status, proficiency, title or body is required"}), 400
    if "title" in data or "body" in data:
        existing = db.get_note(note_id)
        if not existing:
            return jsonify({"error": "not found"}), 404
        if "body" in data and (data.get("body") or "") != (existing.get("body") or ""):
            db.record_field_history("note", note_id, "body", existing.get("body") or "")
        db.update_note(note_id, data)
    if "status" in data:
        status = data.get("status")
        if status not in ("open", "done"):
            return jsonify({"error": "status must be 'open' or 'done'"}), 400
        db.set_note_status(note_id, status)
    if "proficiency" in data:
        try:
            proficiency = int(data.get("proficiency"))
        except (TypeError, ValueError):
            return jsonify({"error": "proficiency must be an integer 1-10"}), 400
        if not 1 <= proficiency <= 10:
            return jsonify({"error": "proficiency must be an integer 1-10"}), 400
        db.set_note_proficiency(note_id, proficiency)
    result = {"ok": True}
    if list_type == "skill":
        skill = db.get_note(note_id)
        if skill:
            result["skill"] = _enrich_skill_notes([skill])[0]
    return jsonify(result)


@app.patch("/api/lists/<list_type>/reorder")
def api_reorder_notes(list_type):
    if list_type not in NOTE_LIST_TYPES:
        return jsonify({"error": "unknown list type"}), 400
    data = request.get_json(force=True)
    ids = data.get("ids") or []
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "ids must be a list of note ids"}), 400
    db.reorder_notes(ids)
    return jsonify({"ok": True})


@app.get("/api/skills/heightmap")
def api_skills_heightmap():
    skills = _enrich_skill_notes(db.list_notes("skill"))
    if len(skills) < 3:
        return jsonify({"error": "need at least 3 skills"})

    texts = [f"{s['title']} {s.get('body') or ''}" for s in skills]
    coordinates, embedding_source = _skill_coordinates(texts)
    xs, ys = zip(*coordinates)
    xs = np.array(xs)
    ys = np.array(ys)
    zs = np.array([s.get("proficiency") or 5 for s in skills], dtype=float)

    x_pad = (xs.max() - xs.min()) * 0.1 or 1.0
    y_pad = (ys.max() - ys.min()) * 0.1 or 1.0
    grid_x = np.linspace(xs.min() - x_pad, xs.max() + x_pad, 30)
    grid_y = np.linspace(ys.min() - y_pad, ys.max() + y_pad, 30)
    mesh_x, mesh_y = np.meshgrid(grid_x, grid_y)

    try:
        mesh_z = griddata((xs, ys), zs, (mesh_x, mesh_y), method="cubic")
    except Exception:
        mesh_z = griddata((xs, ys), zs, (mesh_x, mesh_y), method="nearest")
    if mesh_z is None:
        mesh_z = np.full_like(mesh_x, float(np.mean(zs)), dtype=float)
    nan_mask = np.isnan(mesh_z)
    if nan_mask.any():
        nearest = griddata((xs, ys), zs, (mesh_x, mesh_y), method="nearest")
        mesh_z[nan_mask] = nearest[nan_mask] if nearest is not None else float(np.mean(zs))

    points = [
        {"id": s["id"], "title": s["title"], "x": float(x), "y": float(y), "z": float(z)}
        for s, x, y, z in zip(skills, xs, ys, zs)
    ]
    return jsonify({
        "points": points,
        "grid_x": grid_x.tolist(),
        "grid_y": grid_y.tolist(),
        "grid_z": mesh_z.tolist(),
        "embedding_source": embedding_source,
    })


# --- Document upload -> auto-classify into Ideas/Skills/Problems/Thinking ---------------------------------------------------------

DOCUMENT_CLASSIFY_LIST_TYPES = ("idea", "skill", "problem", "thinking", "funny", "essay")

ATTACHMENT_PLAIN_TEXT_EXTENSIONS = frozenset({
    ".txt", ".md", ".text", ".markdown", ".csv", ".json", ".py", ".tex", ".html",
})
ATTACHMENT_UPLOAD_TEXT_CAP = 250_000
AGENT_CHAT_ATTACHMENT_TEXT_CAP = 300_000


def _extract_pdf_text(stream):
    reader = PdfReader(stream)
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx_text(stream):
    document = Document(stream)
    return "\n".join(p.text for p in document.paragraphs)


def _extract_attachment_text(stored_path, original_name, cap=ATTACHMENT_UPLOAD_TEXT_CAP):
    """Return (text, text_chars, text_truncated, readable) for an attachment on disk."""
    suffix = Path(original_name).suffix.lower()
    try:
        if suffix == ".pdf":
            with open(stored_path, "rb") as stream:
                text = _extract_pdf_text(stream)
            readable = True
        elif suffix == ".docx":
            with open(stored_path, "rb") as stream:
                text = _extract_docx_text(stream)
            readable = True
        elif suffix == ".doc":
            import napkin_complete as _nc
            text = _nc.extract_legacy_doc_text(Path(stored_path).read_bytes())
            readable = bool(text.strip())
        elif suffix in ATTACHMENT_PLAIN_TEXT_EXTENSIONS:
            text = stored_path.read_text(encoding="utf-8", errors="ignore")
            readable = True
        else:
            return "", 0, False, False
    except Exception as exc:
        _note_runtime("attachment_text", exc)
        return "", 0, False, False

    text_truncated = len(text) > cap
    if text_truncated:
        text = text[:cap]
    return text, len(text), text_truncated, readable


def _enrich_message_with_attachments(message, attachment_ids, cap=AGENT_CHAT_ATTACHMENT_TEXT_CAP):
    if not attachment_ids:
        return message
    blocks = []
    total_chars = 0
    for raw_id in attachment_ids:
        try:
            attachment_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        attachment = db.get_attachment(attachment_id)
        if not attachment:
            continue
        stored_path = ATTACHMENTS_DIR / attachment["stored_filename"]
        if not stored_path.is_file():
            continue
        remaining = cap - total_chars
        if remaining <= 0:
            break
        text, _, _, readable = _extract_attachment_text(
            stored_path, attachment["filename"], cap=remaining,
        )
        name = attachment["filename"]
        if readable and text.strip():
            block = (
                f"[Attached file: {name} | attachment_id={attachment_id}]\n"
                f"--- BEGIN FILE CONTENT ---\n{text}\n--- END FILE CONTENT ---"
            )
        else:
            block = (
                f"[Attached file: {name} | attachment_id={attachment_id} | "
                "no extractable text — binary/image]"
            )
        if total_chars + len(block) > cap:
            overflow = total_chars + len(block) - cap
            if overflow >= len(block):
                break
            block = block[:-overflow] + "\n--- END FILE CONTENT ---"
        blocks.append(block)
        total_chars += len(block)
    if not blocks:
        return message
    return message + "\n\n" + "\n\n".join(blocks)


_BLOCK_END_TAGS = frozenset(
    ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "blockquote")
)


class _HtmlToDocxParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks = []
        self._runs = []
        self._text = ""
        self._bold = 0
        self._italic = 0

    def _flush_run(self):
        if self._text:
            self._runs.append({
                "text": self._text,
                "bold": self._bold > 0,
                "italic": self._italic > 0,
            })
            self._text = ""

    def _flush_block(self):
        self._flush_run()
        if self._runs:
            self.blocks.append(self._runs)
            self._runs = []

    def handle_data(self, data):
        self._text += data

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("b", "strong"):
            self._flush_run()
            self._bold += 1
        elif tag in ("i", "em"):
            self._flush_run()
            self._italic += 1
        elif tag == "br":
            self._flush_run()
            self._runs.append({"text": "\n", "bold": False, "italic": False})
        elif tag in _BLOCK_END_TAGS:
            self._flush_block()

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("b", "strong"):
            self._flush_run()
            self._bold = max(0, self._bold - 1)
        elif tag in ("i", "em"):
            self._flush_run()
            self._italic = max(0, self._italic - 1)
        elif tag in _BLOCK_END_TAGS:
            self._flush_block()

    def close(self):
        super().close()
        self._flush_block()


def _fill_docx_from_html(document, html):
    parser = _HtmlToDocxParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        return False
    added = False
    for runs in parser.blocks:
        text_only = "".join(r["text"] for r in runs).strip()
        if not text_only:
            continue
        para = document.add_paragraph()
        for run in runs:
            if not run["text"]:
                continue
            r = para.add_run(run["text"])
            if run["bold"]:
                r.bold = True
            if run["italic"]:
                r.italic = True
        added = True
    return added


def _fill_docx_from_text(document, text):
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        for line in text.splitlines():
            document.add_paragraph(line)
        return
    for para in paragraphs:
        document.add_paragraph(para)


def _safe_export_filename(title):
    safe = re.sub(r"[^\w\- ]+", "", (title or "document").strip()).strip()
    safe = re.sub(r"\s+", "-", safe).lower() or "document"
    return f"{safe}.docx"


@app.post("/api/export/docx")
def api_export_docx():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "document").strip() or "document"
    html = (data.get("html") or "").strip()
    text = (data.get("text") or "").strip()

    doc = Document()
    if html:
        if not _fill_docx_from_html(doc, html):
            fallback = text or re.sub(r"<[^>]+>", "", html)
            if fallback.strip():
                _fill_docx_from_text(doc, fallback)
    elif text:
        _fill_docx_from_text(doc, text)
    if not doc.paragraphs:
        doc.add_paragraph("")

    buf = BytesIO()
    doc.save(buf)
    filename = _safe_export_filename(title)
    return Response(
        buf.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/documents/classify")
def api_classify_document():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400

    bias_list = (request.form.get("bias_list") or "").strip() or None
    if bias_list not in DOCUMENT_CLASSIFY_LIST_TYPES:
        bias_list = None

    suffix = Path(file.filename).suffix.lower()
    try:
        if suffix == ".pdf":
            text = _extract_pdf_text(file.stream)
        elif suffix == ".docx":
            text = _extract_docx_text(file.stream)
        elif suffix == ".doc":
            import napkin_complete as _nc
            text = _nc.extract_legacy_doc_text(file.stream.read())
        elif suffix in (".txt", ".md"):
            text = file.stream.read().decode("utf-8", errors="replace")
        else:
            return jsonify({"error": "only .pdf, .docx, .doc, .txt, and .md files are supported"}), 400
    except Exception as exc:
        return jsonify({"error": f"could not read file: {exc}"}), 400

    text = text.strip()
    if not text:
        return jsonify({"error": "no extractable text found in this file"}), 400

    CHUNK = 12000
    chunks = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)] or [text]
    items = []
    truncated = len(chunks) > 8
    chunks = chunks[:8]
    last_error = None
    for idx, chunk in enumerate(chunks):
        try:
            result = ai.classify_document(
                f"{file.filename} [pass {idx + 1}/{len(chunks)}]",
                chunk,
                bias_list=bias_list,
            )
        except Exception as exc:
            last_error = str(exc)
            _note_runtime("documents.classify", exc)
            continue
        part = result.get("items") if isinstance(result, dict) else result
        if isinstance(part, list):
            items.extend(part)
    return jsonify({
        "items": items,
        "chunks_processed": len(chunks),
        "truncated": truncated,
        "error": last_error,
    })


@app.post("/api/documents/classify/confirm")
def api_confirm_document_classify():
    data = request.get_json(force=True)
    items = data.get("items") or []
    inserted = []
    for item in items:
        list_type = item.get("list_type")
        title = (item.get("title") or "").strip()
        body = (item.get("body") or "").strip()
        if list_type not in DOCUMENT_CLASSIFY_LIST_TYPES or not title:
            continue
        if list_type == "idea":
            note_id = db.insert_idea(title, body, source="ai")
        else:
            note_id = db.insert_note(list_type, title, body, source="ai")
        inserted.append({"id": note_id, "list_type": list_type, "title": title, "body": body})

    if any(i["list_type"] == "idea" for i in inserted):
        ideas = db.list_ideas()
        texts = [f"{i['title']} {i.get('body') or ''}" for i in ideas]
        coords = embeddings.texts_to_3d(texts)
        for idea, (x, y, z) in zip(ideas, coords):
            db.update_idea_coords(idea["id"], x, y, z)

    return jsonify({"inserted": inserted}), 201


@app.route("/api/client-error", methods=["POST"])
def api_client_error():
    """Receive browser crashes.

    Nothing recorded JS exceptions before this, so every crash the app suffered left no trace
    anywhere and could only be reported as "it crashed". Errors arrive via sendBeacon during
    teardown, so this stays cheap and always answers 204: a failure here must never itself
    become an error the page has to handle.
    """
    try:
        payload = request.get_json(silent=True) or {}
        where = str(payload.get("where") or "client")[:80]
        message = str(payload.get("message") or "")[:400]
        stack = str(payload.get("stack") or "")[:600]
        detail = f"{message} | {payload.get('source') or ''} | {stack}".strip()
        _note_runtime(f"client.{where}", detail)
    except Exception as exc:
        _note_runtime("client_error.handler", exc)
    return ("", 204)


_SECRET_SETTING_RE = re.compile(r"(secret|password|token|api_key)$", re.I)
_GIT_PULL_LOG = _PLAN_DIR / "last-git-pull.log"


def _note_runtime(where, exc):
    try:
        import runtime_errors
        runtime_errors.note(where, exc)
    except Exception:
        print(f"[{where}] {exc}")


def _is_secret_setting_key(key):
    k = (key or "").lower()
    if _SECRET_SETTING_RE.search(k):
        return True
    if k.endswith("_key"):
        return True
    return False


# Future secret-bearing settings stay private by default. Only keys listed here (or matching
# a public prefix) are returned by /api/about — a denylist of known secret names leaked
# google_client_secret, grok_api_key, and pronote_password.
_ABOUT_ALLOWLIST = frozenset({
    "user_profile", "inference_mode", "offline_mode", "self_coding_enabled",
    "vibecode_enabled", "local_model_name", "discord_webhook_url",
    "daily_budget_usd", "budget_usd_month", "github_repo",
    "nyu_brightspace_client_id", "pronote_url", "pronote_username",
    "hidden_apps", "style_paint_config", "game_features", "last_export_at",
    "api_enabled", "claude_model", "openai_model", "grok_model",
    "events_interests", "events_location", "local_model_url",
    "code_self_summary", "code_self_summary_at", "prompts_page",
    "project_description", "why", "bio", "claude_notes", "waypoint_lang",
    "parallel_auto_illustrate", "parallel_image_provider",
})
_ABOUT_ALLOWLIST_PREFIXES = ("route_", "parallel_")


def _git_pull_status():
    try:
        if not _GIT_PULL_LOG.exists():
            return None
        text = _GIT_PULL_LOG.read_text(encoding="utf-8", errors="replace")[-4000:]
        stripped = text.strip()
        failed = bool(re.search(r"(fatal:|error:|rejected|not possible to fast-forward|not recognized)", text, re.I))
        exit_m = re.search(r"EXIT=(\d+)", text)
        if exit_m and exit_m.group(1) not in ("0",):
            failed = True
        noop = (not stripped) or bool(re.search(r"Already up to date", text, re.I))
        return {
            "ok": not failed,
            "noop": noop and not failed,
            "log": stripped[-800:] or "(empty log — pull may have been skipped)",
            "mtime": _GIT_PULL_LOG.stat().st_mtime,
        }
    except Exception as exc:
        _note_runtime("git_pull_status", exc)
        return None


def _public_about_payload(settings):
    public = {}
    for key, value in (settings or {}).items():
        if _is_secret_setting_key(key):
            continue
        if key in _ABOUT_ALLOWLIST or any(str(key).startswith(p) for p in _ABOUT_ALLOWLIST_PREFIXES):
            public[key] = value
    return public


@app.get("/api/about")
def api_get_about():
    settings = db.get_settings()
    payload = _public_about_payload(settings)
    payload["claude_model"] = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")
    payload["openai_model"] = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
    payload["grok_model"] = os.environ.get("GROK_MODEL") or os.environ.get("XAI_MODEL", "grok-4.5")
    payload["github_repo"] = (
        (payload.get("github_repo") or "").strip()
        or os.environ.get("WAYPOINT_GITHUB_REPO", "helloso623/plan")
    )
    payload["github_token_configured"] = bool(
        (settings.get("github_token") or os.environ.get("GITHUB_TOKEN") or "").strip()
    )
    payload["local_model_url"] = (
        os.environ.get("LOCAL_MODEL_URL")
        or os.environ.get("OLLAMA_URL")
        or "http://127.0.0.1:11434"
    )
    try:
        import runtime_errors
        payload["recent_errors"] = runtime_errors.recent()
    except Exception:
        payload["recent_errors"] = []
    pull = _git_pull_status()
    if pull:
        payload["git_pull"] = pull
    payload["anthropic_configured"] = bool((os.environ.get("ANTHROPIC_API_KEY") or "").strip())
    payload["anthropic_fallback"] = not payload["anthropic_configured"]
    payload["game_features"] = settings.get("game_features", "on")
    return jsonify(payload)


@app.post("/api/recovery")
def api_save_recovery():
    import napkin_complete
    data = request.get_json(force=True) or {}
    kind = (data.get("kind") or "draft").strip()
    return jsonify(napkin_complete.save_recovery_snapshot(kind, data.get("payload") or {}))


@app.get("/api/recovery")
def api_list_recovery():
    import napkin_complete
    return jsonify({"snapshots": napkin_complete.list_recovery_snapshots()})


@app.delete("/api/recovery/<kind>")
def api_delete_recovery(kind):
    import napkin_complete
    return jsonify(napkin_complete.delete_recovery_snapshot(kind))


@app.get("/api/export/me")
def api_export_me():
    import napkin_complete
    payload = napkin_complete.export_everything()
    payload["profile"] = (db.get_settings() or {}).get("user_profile")
    payload["activity"] = db.list_activity(limit=1000) if hasattr(db, "list_activity") else []
    db.save_settings({"last_export_at": db.now_iso()})
    return jsonify(payload)


@app.get("/api/export/profile")
def api_export_profile():
    settings = db.get_settings() or {}
    usage = db.total_api_usage() if hasattr(db, "total_api_usage") else {}
    try:
        import napkin_remaining
        usage.update(napkin_remaining.usage_day_and_month())
    except Exception:
        pass
    payload = {
        "exported_at": db.now_iso(),
        "profile": settings.get("user_profile") or "",
        "activity": db.list_activity(limit=1000) if hasattr(db, "list_activity") else [],
        "usage": {
            "day": usage.get("day"),
            "month_total": usage.get("month_total"),
            "today": usage.get("today"),
            "month": usage.get("month"),
            "lifetime_tokens": usage.get("total_tokens"),
            "lifetime_cost_usd": usage.get("estimated_cost_usd"),
        },
    }
    db.save_settings({"last_export_at": db.now_iso()})
    return jsonify(payload)


@app.get("/api/share/app")
def api_share_app():
    # The PUBLIC repo, deliberately separate from WAYPOINT_GITHUB_REPO. That one is where
    # feedback gets filed as issues, and it must stay private: pointing it at the public repo
    # would publish your feedback notes. Sharing only ever needs the public download page.
    repo = os.environ.get("WAYPOINT_PUBLIC_REPO", "helloso623/waypoint")
    download = f"https://github.com/{repo}/releases/latest"
    message = (
        "Waypoint is the planner I use. To install it on Windows:\n"
        f"1. Download Waypoint-Setup.exe from {download}\n"
        "2. Double-click it (if Windows warns, click More info → Run anyway)\n"
        "3. Paste an AI key when it asks, or skip -- the planner works without one.\n\n"
        "Everything you put in it stays on your own computer."
    )
    return jsonify({"ok": True, "repo": repo, "message": message, "url": download})


@app.post("/api/tasks/rollover")
def api_rollover_tasks():
    import napkin_complete
    return jsonify(napkin_complete.rollover_incomplete_tasks())


@app.post("/api/tasks/reorganise")
def api_reorganise_tasks():
    import napkin_complete
    return jsonify(napkin_complete.reorganise_task_dates())


@app.get("/api/tasks/speaking")
def api_speaking_tasks():
    import napkin_complete
    return jsonify(napkin_complete.speaking_tasks())


@app.post("/api/tasks/time-log")
def api_task_time_log():
    import napkin_complete
    data = request.get_json(force=True) or {}
    return jsonify(napkin_complete.log_task_time(
        task_id=data.get("task_id"),
        title=data.get("title") or "",
        estimated_minutes=data.get("estimated_minutes"),
        actual_minutes=data.get("actual_minutes"),
        kind=data.get("kind") or "minigame",
    ))


@app.post("/api/tasks/bulk-preview")
def api_bulk_preview_tasks():
    import napkin_complete
    data = request.get_json(force=True) or {}
    kind = data.get("kind") or "task"
    items = napkin_complete.parse_bulk_lines(data.get("text") or "", kind=kind)
    existing = {(t.get("title") or "").strip().lower() for t in db.list_tasks()}
    for item in items:
        item["duplicate"] = (item.get("title") or "").strip().lower() in existing
    return jsonify({"items": items, "kind": kind})


@app.post("/api/tasks/bulk-import")
def api_bulk_import_tasks():
    data = request.get_json(force=True) or {}
    created = []
    skipped = []
    for item in data.get("items") or []:
        if item.get("skip") or item.get("duplicate"):
            skipped.append(item)
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        task_id = db.insert_task(
            title,
            notes=item.get("notes") or "",
            urgency=item.get("urgency") or "medium",
            due_date=item.get("due_date"),
            deadline_dismissed=not item.get("due_date"),
            created_by=data.get("created_by") or "user",
            tags=item.get("tags"),
            deadline_kind="hard" if item.get("due_date") else "indefinite",
        )
        created.append(db.get_task(task_id))
    return jsonify({"ok": True, "created": created, "skipped": skipped, "count": len(created)})


@app.post("/api/schedule/import")
def api_import_course_schedule():
    import napkin_complete
    data = request.get_json(force=True) or {}
    if not data.get("confirm"):
        proposed = napkin_complete.parse_course_schedule(data.get("text") or "", end_date=data.get("end_date"))
        return jsonify({"needs_confirmation": True, "classes": proposed, "count": len(proposed)})
    created = []
    for item in data.get("classes") or napkin_complete.parse_course_schedule(data.get("text") or "", end_date=data.get("end_date")):
        class_id = db.upsert_class_slot(
            item["name"], int(item["weekday"]), item["start_time"], item["end_time"],
            source="import", end_date=item.get("end_date") or data.get("end_date"),
            horizon_weeks=int(item.get("horizon_weeks") or 16),
        )
        events_created = db.materialize_class_events(class_id)
        created.append({"class_id": class_id, "events_created": events_created})
    return jsonify({"ok": True, "created": created, "count": len(created)})


@app.get("/api/calendar/conflicts")
def api_calendar_conflicts():
    import napkin_complete
    exclude = request.args.get("exclude_id", type=int)
    payload = napkin_complete.calendar_conflicts(
        request.args.get("date"), request.args.get("start_time"),
        request.args.get("end_time"), title=request.args.get("title"),
        exclude_id=exclude,
    )
    similar = None
    if hasattr(db, "find_similar_calendar_slot"):
        similar = db.find_similar_calendar_slot(
            request.args.get("title"), request.args.get("date"),
            request.args.get("start_time"), exclude_id=exclude,
        )
        if similar and all(e.get("id") != similar.get("id") for e in payload.get("duplicates") or []):
            payload.setdefault("duplicates", []).append(similar)
    return jsonify(payload)


@app.post("/api/calendar/check")
def api_calendar_check():
    import napkin_complete
    data = request.get_json(force=True) or {}
    return jsonify(napkin_complete.calendar_conflicts(
        data.get("date"), data.get("start_time"), data.get("end_time"),
        title=data.get("title"), exclude_id=data.get("exclude_id"),
    ))


@app.post("/api/napkin/title")
def api_napkin_title():
    import napkin_complete
    data = request.get_json(force=True) or {}
    details = data.get("details") or data.get("text") or ""
    title = napkin_complete.suggest_napkin_title(details)
    return jsonify({"title": title})


@app.get("/api/ai/failures")
def api_ai_failures():
    import napkin_complete
    return jsonify({"failures": napkin_complete.list_ai_failures()})


@app.post("/api/ai/failures")
def api_log_ai_failure():
    import napkin_complete
    data = request.get_json(force=True) or {}
    napkin_complete.log_ai_failure(
        data.get("kind") or "manual",
        data.get("detail") or "",
        extra=data.get("extra"),
    )
    return jsonify({"ok": True, "failures": napkin_complete.list_ai_failures(limit=10)})


@app.get("/api/trends/interpolate")
def api_trends_interpolate():
    import napkin_remaining
    data = request.args
    raw = data.get("points") or "[]"
    try:
        points = json.loads(raw)
    except json.JSONDecodeError:
        points = []
    series = napkin_remaining.interpolate_series(points)
    return jsonify({
        "series": series,
        "predicted": napkin_remaining.predict_next_values(series, horizon=int(data.get("horizon") or 7)),
    })


@app.post("/api/trends/interpolate")
def api_trends_interpolate_post():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    series = napkin_remaining.interpolate_series(data.get("points") or [])
    return jsonify({
        "series": series,
        "predicted": napkin_remaining.predict_next_values(series, horizon=int(data.get("horizon") or 7)),
    })


@app.post("/api/trends/analyze")
def api_trends_analyze():
    import napkin_depth
    data = request.get_json(force=True) or {}
    return jsonify(napkin_depth.analyze_series(data.get("points") or [], value_key=data.get("value_key") or "value"))


@app.get("/api/loot/state")
def api_loot_state():
    import napkin_remaining
    return jsonify({"state": napkin_remaining.load_loot_state() or {}})


@app.post("/api/loot/state")
def api_loot_state_save():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    merged = napkin_remaining.merge_loot_state(data.get("state") or data)
    return jsonify({"ok": True, "state": merged})


@app.post("/api/loot/roll")
def api_loot_roll():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    return jsonify(napkin_remaining.roll_chest(
        rarity=data.get("rarity") or "common",
        pity=data.get("pity"),
        owned_count=int(data.get("owned_count") or 0),
    ))


@app.get("/api/cart")
def api_cart_list():
    import napkin_remaining
    return jsonify({"items": napkin_remaining.list_cart(request.args.get("status"))})


@app.post("/api/cart")
def api_cart_add():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    result = napkin_remaining.add_cart_item(
        data.get("title"), data.get("url") or "", data.get("notes") or "",
        created_by=data.get("created_by") or "user",
    )
    code = 400 if result.get("error") else 201
    return jsonify(result), code


@app.post("/api/cart/<int:item_id>/status")
def api_cart_status(item_id):
    import napkin_remaining
    data = request.get_json(force=True) or {}
    return jsonify(napkin_remaining.set_cart_status(item_id, data.get("status") or "validated"))


@app.get("/api/achievements")
def api_achievements():
    import napkin_remaining
    return jsonify({"achievements": napkin_remaining.list_achievements()})


@app.post("/api/achievements/<ach_id>")
def api_unlock_achievement(ach_id):
    import napkin_remaining
    return jsonify(napkin_remaining.unlock_achievement(ach_id))


@app.post("/api/coins/from-day")
def api_coins_from_day():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    day = db.get_day(data.get("date") or date_cls.today().isoformat()) if hasattr(db, "get_day") else {}
    metrics = (day or {}).get("metrics") or day or {}
    painted = int(data.get("painted_hours") or 0)
    import napkin_depth
    formula = napkin_remaining.happiness_coin_formula(
        {"happiness": metrics.get("happiness") or data.get("happiness"),
         "energy": metrics.get("energy") or data.get("energy")},
        painted_hours=painted,
        played_game=bool(data.get("played_game")),
    )
    return jsonify(napkin_depth.apply_coin_powers(formula))


@app.get("/api/integrations")
def api_integrations():
    import napkin_remaining
    return jsonify({"integrations": napkin_remaining.list_integrations()})


@app.post("/api/integrations")
def api_save_integration():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    return jsonify(napkin_remaining.save_integration(
        data.get("id") or data.get("name"),
        token=data.get("token") or "",
        extra=data.get("extra") or {},
    ))


@app.post("/api/integrations/use")
def api_use_integration():
    import napkin_depth
    data = request.get_json(force=True) or {}
    result = napkin_depth.use_integration(
        data.get("id") or data.get("name"),
        action=data.get("action") or "status",
        payload=data.get("payload") or {},
    )
    code = 400 if result.get("error") and not result.get("ok") else 200
    return jsonify(result), code


@app.get("/api/upgrades")
def api_list_upgrades():
    import napkin_depth
    return jsonify({"upgrades": napkin_depth.list_upgrades(), "power": napkin_depth.skin_power()})


@app.post("/api/upgrades")
def api_buy_upgrade():
    import napkin_depth
    data = request.get_json(force=True) or {}
    return jsonify(napkin_depth.buy_upgrade(data.get("id"), coins=data.get("coins") or 0))


@app.get("/api/events/actionable")
def api_events_actionable():
    import napkin_issues
    today = request.args.get("today")
    events = db.list_events()
    return jsonify(napkin_issues.filter_actionable_events(events, today))


@app.post("/api/calendar/<int:event_id>/complete")
def api_complete_calendar_event(event_id):
    import napkin_issues
    result = napkin_issues.complete_calendar_event(event_id)
    code = 404 if result.get("error") else 200
    return jsonify(result), code


@app.post("/api/calendar/recurring")
def api_add_recurring_calendar():
    import napkin_issues
    data = request.get_json(force=True) or {}
    result = napkin_issues.add_recurring_event(
        data.get("title"), data.get("start_date") or data.get("date"),
        data.get("start_time"), data.get("end_time"),
        data.get("weekday"), weeks=data.get("weeks") or 8,
        category=data.get("category"), notes=data.get("notes"),
        kind=data.get("kind"), end_date=data.get("end_date"),
    )
    code = 400 if result.get("error") else 201
    return jsonify(result), code


@app.get("/api/bets")
def api_list_bets():
    import napkin_issues
    napkin_issues.settle_bets()
    return jsonify({"bets": napkin_issues.list_bets(request.args.get("status"))})


@app.post("/api/bets")
def api_place_bet():
    import napkin_issues
    data = request.get_json(force=True) or {}
    result = napkin_issues.place_bet(data.get("task_id"), data.get("due_date"), data.get("coins"))
    code = 400 if result.get("error") else 201
    return jsonify(result), code


@app.post("/api/bets/settle")
def api_settle_bets():
    import napkin_issues
    return jsonify(napkin_issues.settle_bets(request.get_json(silent=True) and (request.get_json() or {}).get("today")))


@app.post("/api/tasks/<int:task_id>/prerequisite")
def api_set_prerequisite(task_id):
    import napkin_issues
    data = request.get_json(force=True) or {}
    return jsonify(napkin_issues.set_prerequisite(task_id, data.get("prerequisite_id")))


@app.get("/api/alarms")
def api_list_alarms():
    import napkin_issues
    return jsonify({"alarms": napkin_issues.list_alarms(), "due": napkin_issues.due_alarms()})


@app.post("/api/alarms")
def api_add_alarm():
    import napkin_issues
    data = request.get_json(force=True) or {}
    result = napkin_issues.add_alarm(data.get("title"), data.get("fire_at"), data.get("kind") or "math")
    code = 400 if result.get("error") else 201
    return jsonify(result), code


@app.get("/api/sync")
def api_sync_load():
    import napkin_issues
    return jsonify(napkin_issues.load_sync_snapshot())


@app.post("/api/sync")
def api_sync_save():
    import napkin_issues
    data = request.get_json(force=True) or {}
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else data
    return jsonify(napkin_issues.save_sync_snapshot(payload, role=data.get("role") or "peer"))


@app.get("/api/sync/bundle")
def api_sync_bundle():
    import napkin_issues
    return jsonify(napkin_issues.planner_sync_bundle())


@app.post("/api/sync/push")
def api_sync_push():
    import napkin_issues
    data = request.get_json(silent=True) or {}
    return jsonify(napkin_issues.push_instance_sync(role=data.get("role") or "server"))


@app.post("/api/sync/pull")
def api_sync_pull():
    import napkin_issues
    return jsonify(napkin_issues.pull_instance_sync())


@app.get("/api/loot/quiet")
def api_loot_quiet():
    import napkin_issues
    return jsonify(napkin_issues.loot_quiet_mode())


@app.get("/api/agents")
def api_list_agents():
    import napkin_remaining
    import orchestrator
    spawned = napkin_remaining.list_spawned_agents()
    try:
        running = orchestrator.list_running()
    except Exception:
        running = []
    return jsonify({"spawned": spawned, "orchestrator": running})


@app.post("/api/agents/spawn")
def api_spawn_agent():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    result = napkin_remaining.spawn_agent_job(data.get("prompt") or "", title=data.get("title") or "")
    code = 400 if result.get("error") else 201
    return jsonify(result), code


@app.post("/api/agents/<job_id>/stop")
def api_stop_spawned_agent(job_id):
    import napkin_remaining
    import orchestrator
    spawned = napkin_remaining.stop_spawned_agent(job_id)
    if spawned.get("ok"):
        return jsonify(spawned)
    try:
        return jsonify(orchestrator.request_cancel(job_id))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/ai/preflight")
def api_ai_preflight():
    import napkin_remaining
    data = request.get_json(force=True) or {}
    cost = napkin_remaining.predicted_cost_usd(
        data.get("prompt") or "",
        history_len=int(data.get("history_len") or 0),
    )
    return jsonify({"estimated_usd": cost, "needs_confirm": cost >= 0.10})


@app.post("/api/about")
def api_save_about():
    data = _normalize_inference_settings(request.get_json(force=True) or {})
    env_updates = {}
    if "claude_model" in data:
        env_updates["CLAUDE_MODEL"] = (data.pop("claude_model") or "").strip()
    if "openai_model" in data:
        env_updates["OPENAI_MODEL"] = (data.pop("openai_model") or "").strip()
    if "grok_model" in data:
        env_updates["GROK_MODEL"] = (data.pop("grok_model") or "").strip()
    if "github_repo" in data:
        env_updates["WAYPOINT_GITHUB_REPO"] = (data.pop("github_repo") or "").strip()
    if "local_model_url" in data:
        url = (data.pop("local_model_url") or "").strip()
        if url:
            env_updates["LOCAL_MODEL_URL"] = url
            env_updates["OLLAMA_URL"] = url
    if env_updates:
        try:
            _merge_env_file(env_updates)
        except OSError as exc:
            return jsonify({"error": f"Could not write .env: {exc}"}), 500
    db.save_settings(data)
    return jsonify({"ok": True})


@app.get("/api/settings/api-keys")
def api_get_api_keys_status():
    return jsonify({
        "anthropic_configured": model_roles.anthropic_configured(),
        "openai_configured": model_roles.openai_configured(),
        "grok_configured": model_roles.grok_configured(),
    })


@app.post("/api/activity")
def api_log_activity():
    """Record a batch of client activity events (navigation, actions, short text context).

    Batched on purpose: the client buffers and flushes on a timer and on page-hide, so normal
    use costs a handful of requests per session rather than one per click.
    """
    data = request.get_json(force=True, silent=True) or {}
    events = data.get("events")
    if not isinstance(events, list):
        return jsonify({"error": "events must be a list"}), 400
    try:
        written = db.log_activity_batch(events[:200])
    except Exception as exc:
        print(f"[activity] log failed: {exc}")
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True, "written": written})


@app.get("/api/activity")
def api_list_activity():
    return jsonify(db.list_activity(
        limit=min(int(request.args.get("limit") or 200), 1000),
        kind=request.args.get("kind") or None,
        since=request.args.get("since") or None,
    ))


@app.post("/api/game-state/sync")
def api_game_state_sync():
    """Mirror the browser's cash and achievements into durable storage.

    The client posts its whole blob; the server MERGES per key rather than overwriting, because
    the laptop and the phone each hold a full copy and a blind overwrite would let whichever
    synced last erase the other's progress. Returns the merged values so the caller can adopt
    them.
    """
    data = request.get_json(force=True, silent=True) or {}
    values = data.get("values")
    if not isinstance(values, dict):
        return jsonify({"error": "values must be an object"}), 400
    try:
        merged = game_sync.sync(values, data.get("updatedAt"))
    except Exception as exc:
        print(f"[game_sync] sync failed: {exc}")
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True, "values": merged, **game_sync.reset_info()})


@app.post("/api/game-state/reset")
def api_game_state_reset():
    """Clear chosen game-state keys and record what was cleared.

    The reset has to outrank the merge rules: counters combine with MAX, so a browser still
    holding the old value would restore it on its next sync. game_sync stamps an epoch and
    ignores pre-epoch values for the cleared keys until each client acknowledges it.
    """
    data = request.get_json(force=True, silent=True) or {}
    keys = data.get("keys")
    if not isinstance(keys, list) or not keys:
        return jsonify({"error": "keys must be a non-empty list"}), 400
    try:
        out = game_sync.reset(keys, note=str(data.get("note") or ""))
        # Loot lives in TWO places: the browser copy synced through game_sync, and a server copy
        # behind /api/loot/state that pullLootSync merges back in on every load. Clearing only
        # the first is why skins and 14 chests kept reappearing after a reset, and why a chest
        # left mid-reveal came back and crashed the cache screen.
        if "waypointLootStateV1" in out.get("cleared", []):
            import napkin_remaining
            # Stamped reset: merge_loot_state unions chests/claims/skins, so without a stamp a
            # browser posting its old copy restores everything the reset just cleared.
            napkin_remaining.reset_loot_state(note=str(data.get("note") or ""))
            out["serverLoot"] = {"ok": True, "reset": True}
        return jsonify(out)
    except Exception as exc:
        print(f"[game_sync] reset failed: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.get("/api/game-state")
def api_game_state():
    return jsonify(game_sync.current())


@app.post("/api/napkin/sync")
def api_napkin_sync():
    """Mirror the browser's Napkin list into a git-tracked NAPKIN.md.

    The client owns the list (localStorage), so it posts the whole thing plus any ids it just
    crumpled. The server unions rather than overwrites -- laptop and phone both post their own
    full list, and a straight overwrite would let whichever synced last wipe the other's notes.
    """
    data = request.get_json(force=True, silent=True) or {}
    entries = data.get("entries")
    if not isinstance(entries, list):
        return jsonify({"error": "entries must be a list"}), 400
    deleted = data.get("deleted") or []
    if not isinstance(deleted, list):
        deleted = []
    try:
        merged = napkin_sync.sync(entries, deleted)
    except Exception as exc:
        print(f"[napkin] sync failed: {exc}")
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True, "count": len(merged), "entries": merged})


@app.post("/api/napkin/accept")
def api_napkin_accept():
    """Mark napkin notes accepted so quit-time compile puts them on ISSUES.md."""
    data = request.get_json(force=True, silent=True) or {}
    incoming = []
    if isinstance(data.get("entries"), list):
        incoming.extend(e for e in data["entries"] if isinstance(e, dict))
    entry_id = str(data.get("id") or "").strip()
    if entry_id:
        incoming.append({
            "id": entry_id,
            "title": data.get("title") or "",
            "details": data.get("details") or "",
            "createdAt": data.get("createdAt") or "",
        })
    for extra_id in data.get("ids") or []:
        extra_id = str(extra_id or "").strip()
        if extra_id:
            incoming.append({"id": extra_id})
    if not incoming:
        return jsonify({"error": "id or entries required"}), 400
    try:
        merged = napkin_sync.accept_entries(incoming)
        compiled = napkin_sync.compile_work_queue(merged)
        if data.get("flush"):
            napkin_sync.flush_now()
    except Exception as exc:
        print(f"[napkin] accept failed: {exc}")
        return jsonify({"error": str(exc)}), 500
    accepted_ids = {e.get("id") for e in incoming if e.get("id")}
    accepted = [e for e in merged if e.get("id") in accepted_ids]
    return jsonify({
        "ok": True,
        "count": len(merged),
        "entries": merged,
        "accepted": accepted,
        "compiled": compiled,
    })


@app.post("/api/napkin/compile")
def api_napkin_compile():
    """Rewrite ISSUES.md from accepted napkins + agent bugs and commit when git is ready."""
    data = request.get_json(force=True, silent=True) or {}
    entries = data.get("entries")
    if entries is not None and not isinstance(entries, list):
        return jsonify({"error": "entries must be a list"}), 400
    try:
        if isinstance(entries, list):
            napkin_sync.sync(entries)
        compiled = napkin_sync.compile_work_queue()
        git_result = napkin_sync.flush_now() if data.get("flush", True) else {"ok": True, "reason": "not flushed"}
    except Exception as exc:
        print(f"[napkin] compile failed: {exc}")
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True, "compiled": compiled, "git": git_result})


@app.post("/api/settings/api-keys")
def api_save_api_keys():
    data = request.get_json(force=True) or {}
    updates = {}
    if "anthropic_api_key" in data:
        updates["ANTHROPIC_API_KEY"] = (data.get("anthropic_api_key") or "").strip()
    if "openai_api_key" in data:
        updates["OPENAI_API_KEY"] = (data.get("openai_api_key") or "").strip()
    if "xai_api_key" in data or "grok_api_key" in data:
        updates["XAI_API_KEY"] = (
            (data.get("xai_api_key") or data.get("grok_api_key") or "")
        ).strip()
    if not updates:
        return jsonify({"error": "No API keys provided"}), 400
    try:
        _merge_env_file(updates)
    except OSError as exc:
        return jsonify({"error": f"Could not write .env: {exc}"}), 500
    # A backend demoted for a rejected key must become eligible again the instant the user
    # supplies a new one -- otherwise the fix looks like it didn't take for ten minutes.
    ai.reset_backend_health()
    return jsonify({
        "ok": True,
        "anthropic_configured": model_roles.anthropic_configured(),
        "openai_configured": model_roles.openai_configured(),
        "grok_configured": model_roles.grok_configured(),
        "restart_recommended": True,
    })


def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _detect_key_provider(key):
    """Work out which provider a pasted key belongs to from its prefix.

    Someone who does not code should not have to know which box their key goes in; the
    prefixes are distinctive enough to route it automatically.
    """
    k = (key or "").strip()
    if k.startswith("sk-ant-"):
        return "anthropic"
    if k.startswith("xai-"):
        return "xai"
    if k.startswith("sk-"):
        return "openai"
    return ""


def _verify_api_key(provider, key):
    """Call the provider's cheapest real endpoint to prove the key works.

    Saving an unverified key is what makes setup feel broken later: the app looks configured
    and then every request fails. Returns (ok, message).
    """
    try:
        if provider == "anthropic":
            r = requests.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                timeout=12,
            )
        elif provider == "openai":
            r = requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=12,
            )
        elif provider == "xai":
            r = requests.get(
                "https://api.x.ai/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=12,
            )
        else:
            return False, "Unrecognised key format"
    except requests.RequestException as exc:
        return False, f"Could not reach {provider}: {exc}"
    if r.status_code == 200:
        return True, "Key verified"
    if r.status_code in (401, 403):
        return False, "That key was rejected by the provider"
    return False, f"{provider} returned HTTP {r.status_code}"


@app.get("/api/setup/state")
def api_setup_state():
    """What first-run setup still needs. Drives the setup tab."""
    configured = {
        "anthropic": model_roles.anthropic_configured(),
        "openai": model_roles.openai_configured(),
        "grok": model_roles.grok_configured(),
    }
    return jsonify({
        "any_configured": any(configured.values()),
        "configured": configured,
        "data_dir": str(_DATA_DIR),
        "complete": _setup_marker().exists(),
    })


def _setup_marker():
    return _DATA_DIR / ".setup-complete"


@app.post("/api/setup/api-key")
def api_setup_api_key():
    """Take one pasted key, work out whose it is, verify it, save it, and finish setup.

    This is the whole configuration step for a non-technical user: paste, press go.
    """
    data = request.get_json(force=True) or {}
    key = (data.get("key") or "").strip()
    if not key:
        return jsonify({"error": "Paste an API key first"}), 400
    provider = _detect_key_provider(key)
    if not provider:
        return jsonify({
            "error": "That does not look like an API key. Anthropic keys start with "
                     "sk-ant-, OpenAI with sk-, xAI with xai-.",
        }), 400
    ok, message = _verify_api_key(provider, key)
    if not ok:
        return jsonify({"error": message, "provider": provider}), 400
    env_name = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY",
                "xai": "XAI_API_KEY"}[provider]
    try:
        _merge_env_file({env_name: key})
    except OSError as exc:
        return jsonify({"error": f"Could not save the key: {exc}"}), 500
    os.environ[env_name] = key  # so this process works without a restart
    ai.reset_backend_health()
    try:
        _setup_marker().parent.mkdir(parents=True, exist_ok=True)
        _setup_marker().write_text(_now_iso(), encoding="utf-8")
    except OSError:
        pass  # a missing marker only means the setup tab offers itself again
    return jsonify({"ok": True, "provider": provider, "message": message})


@app.post("/api/setup/skip")
def api_setup_skip():
    """Finish setup without a key. The planner works fully; only AI features stay off."""
    try:
        _setup_marker().parent.mkdir(parents=True, exist_ok=True)
        _setup_marker().write_text(_now_iso(), encoding="utf-8")
    except OSError as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True})


@app.post("/api/notify/test")
def api_notify_test():
    configured = notify.is_configured()
    ok = notify.send_discord("Waypoint test notification ✓")
    return jsonify({"ok": ok, "configured": configured})


@app.get("/api/system/security")
def api_system_security():
    urls = []
    try:
        import tailscale_net
        port = int(os.environ.get("PORT", "5099"))
        urls = tailscale_net.public_urls(port)
        if os.environ.get("WAYPOINT_TAILSCALE_SERVE", "").lower() in ("1", "true", "yes", "on"):
            urls = tailscale_net.serve_https_urls() + urls
    except Exception:
        urls = []
    return jsonify({
        "gate_enabled": bool(_access_token()),
        "trust_localhost": _trust_localhost(),
        "trust_tailscale": _trust_tailscale(),
        "tailscale_urls": urls,
    })


@app.get("/api/system/version")
def api_system_version():
    repo = _git_repo_root()
    if not repo:
        return jsonify({"hash": None, "branch": None})
    try:
        hash_proc = proc_util.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo, capture_output=True, text=True, timeout=10,
        )
        branch_proc = proc_util.run(
            ["git", "branch", "--show-current"],
            cwd=repo, capture_output=True, text=True, timeout=10,
        )
        return jsonify({
            "hash": hash_proc.stdout.strip() if hash_proc.returncode == 0 else None,
            "branch": branch_proc.stdout.strip() if branch_proc.returncode == 0 else None,
        })
    except (subprocess.TimeoutExpired, OSError) as exc:
        return jsonify({"hash": None, "branch": None, "error": str(exc)})


@app.post("/api/system/update-from-git")
def api_update_from_git():
    repo = _git_repo_root()
    if not repo:
        return jsonify({"output": "No git repository found.", "updated": False})
    try:
        proc = proc_util.run(
            ["git", "pull", "--ff-only"],
            cwd=repo, capture_output=True, text=True, timeout=GIT_UPDATE_TIMEOUT_SECONDS,
        )
        output = ((proc.stdout or "") + (proc.stderr or "")).strip()
        if proc.returncode != 0:
            return jsonify({
                "output": output,
                "updated": False,
                "deps_ok": False,
                "restart_required": False,
                "local_ai": _local_ai_health(),
            })
        added_keys = _merge_missing_env_defaults()
        req = _PLAN_DIR / "requirements.txt"
        deps_ok = False
        if req.is_file():
            pip = proc_util.run(
                [_runtime_python(), "-m", "pip", "install", "-r", str(req), "-q"],
                cwd=repo, capture_output=True, text=True, timeout=180,
            )
            pip_text = ((pip.stdout or "") + (pip.stderr or "")).strip()
            deps_ok = pip.returncode == 0
            if pip_text:
                output = f"{output}\n{pip_text}".strip()
            elif deps_ok:
                output = f"{output}\nPython deps reinstalled from requirements.txt.".strip()
        health = _local_ai_health()
        health["added_env_keys"] = added_keys
        health["restart_required"] = True
        return jsonify({
            "output": output,
            "updated": "Already up to date" not in output,
            "deps_ok": deps_ok,
            "restart_required": True,
            "local_ai": health,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"output": f"Timed out after {GIT_UPDATE_TIMEOUT_SECONDS}s", "updated": False})


@app.get("/api/system/local-ai")
def api_local_ai_health():
    return jsonify(_local_ai_health())


@app.post("/api/system/local-ai/setup")
def api_local_ai_setup():
    data = request.get_json(silent=True) or {}
    model_name = (data.get("local_model_name") or data.get("model") or "").strip()
    try:
        health = _setup_local_ai_env(model_name)
    except OSError as exc:
        return jsonify({"error": f"Could not write .env: {exc}"}), 500
    return jsonify(health)


# --- Google integration: Gmail send, Docs/Sheets read/write, Calendar ------------------------
# All gated on you creating a free OAuth client in Google Cloud Console -- see
# google_integration.py's module docstring for the exact steps. No hosted server needed.

@app.get("/api/google/status")
def api_google_status():
    return jsonify({"configured": google_integration.is_configured(), "connected": google_integration.is_connected()})


@app.post("/api/google/settings")
def api_google_settings():
    data = request.get_json(force=True)
    db.save_settings({
        "google_client_id": data.get("client_id", ""),
        "google_client_secret": data.get("client_secret", ""),
    })
    return jsonify({"ok": True})


@app.post("/api/google/connect")
def api_google_connect():
    """Blocking -- opens your browser for the consent screen and waits for you to
    approve. Fine for a local desktop app; this is a one-time interactive step,
    not something called on every request.
    """
    try:
        google_integration.connect()
        return jsonify({"ok": True})
    except google_integration.NotConfigured as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/google/disconnect")
def api_google_disconnect():
    google_integration.disconnect()
    return jsonify({"ok": True})


@app.post("/api/google/send-mail")
def api_google_send_mail():
    data = request.get_json(force=True)
    to = (data.get("to") or "").strip()
    subject = data.get("subject", "")
    body = data.get("body", "")
    if not to:
        return jsonify({"error": "to is required"}), 400
    try:
        google_integration.send_gmail(to, subject, body)
        return jsonify({"ok": True})
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/google/doc/<doc_id>")
def api_google_read_doc(doc_id):
    try:
        return jsonify({"text": google_integration.read_doc(doc_id)})
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/google/sheet/<spreadsheet_id>")
def api_google_read_sheet(spreadsheet_id):
    cell_range = request.args.get("range", "A1:Z100")
    try:
        return jsonify({"values": google_integration.read_sheet(spreadsheet_id, cell_range)})
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/google/sheet/<spreadsheet_id>/write")
def api_google_write_sheet(spreadsheet_id):
    data = request.get_json(force=True)
    cell_range = data.get("range", "A1")
    values = data.get("values", [])
    try:
        google_integration.write_sheet(spreadsheet_id, cell_range, values)
        return jsonify({"ok": True})
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/google/calendar/events")
def api_google_calendar_events():
    try:
        return jsonify(google_integration.list_calendar_events())
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/google/calendar/events")
def api_google_create_calendar_event():
    data = request.get_json(force=True)
    try:
        result = google_integration.create_calendar_event(
            data.get("title", ""), data.get("start"), data.get("end"), data.get("description", ""),
        )
        return jsonify(result)
    except (google_integration.NotConfigured, google_integration.NotConnected) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


# --- Code tab: pick which AI backend answers a question -----------------------------------------

@app.get("/api/code/backends")
def api_code_backends():
    return jsonify({
        "backends": code_backends.available_backends(),
        "ollama_models": code_backends.list_ollama_models(),
    })


CODE_FILE_VIEW_MAX_CHARS = 400_000


@app.get("/api/code/files")
def api_code_files():
    """Lists source files under the project root so the Code tab can offer a file picker --
    same extension/skip-dir rules as the codebase summarizer's sampler, just not capped to a
    handful of files/chars since this is for browsing, not feeding to an LLM.
    """
    files = []
    for f in sorted(backup.PROJECT_ROOT.rglob("*")):
        if not f.is_file() or f.suffix not in CODE_EXTENSIONS:
            continue
        if any(part in CODE_SCAN_SKIP_DIRS for part in f.parts):
            continue
        files.append(str(f.relative_to(backup.PROJECT_ROOT)).replace("\\", "/"))
    return jsonify({"files": files})


@app.get("/api/code/file")
def api_code_file():
    """Reads a single project file for the Code tab's viewer -- same path-safety check
    (is_path_inside_project) the propose_file_edit/read_project_file tools use, so browsing
    can't escape the project directory any more than the AI tools can.
    """
    rel_path = request.args.get("path", "")
    ok, target = backup.is_path_inside_project(rel_path)
    if not ok:
        return jsonify({"error": "path is outside the project directory -- not allowed"}), 400
    if not target.is_file():
        return jsonify({"error": "no such file"}), 404
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return jsonify({"error": "not a text file"}), 400
    truncated = len(content) > CODE_FILE_VIEW_MAX_CHARS
    if truncated:
        content = content[:CODE_FILE_VIEW_MAX_CHARS]
    return jsonify({"path": rel_path, "content": content, "truncated": truncated})


@app.post("/api/code/ask")
def api_code_ask():
    data = request.get_json(force=True)
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    backend = data.get("backend", "claude")
    try:
        result = code_backends.ask(
            backend, prompt, ollama_model=data.get("ollama_model"), selection=data.get("selection"),
            mode=data.get("mode"),
        )
        try:
            db.record_conversation("code", "user", prompt)
            if result.get("response"):
                db.record_conversation("code", "assistant", result["response"])
        except Exception:
            pass
        return jsonify({"response": result["response"], "actions": result["actions"], "backend": backend})
    except code_backends.BackendUnavailable as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/code/summarize-codebase")
def api_code_summarize_self():
    """Points the same codebase_summarizer subagent the Projects tab uses at Waypoint's
    own project directory, so new projects can be checked against what already exists here.
    Cached in settings (like claude_notes) so it doesn't regenerate on every tab visit.
    """
    file_samples = _sample_project_files(backup.PROJECT_ROOT)
    if not file_samples:
        return jsonify({"error": "no recognized source files found (see CODE_EXTENSIONS)"}), 400
    try:
        summary = orchestrator.run("codebase_summarizer", project_name="Waypoint (this app)", file_samples=file_samples)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 200
    db.save_settings({"code_self_summary": summary, "code_self_summary_at": db.now_iso()})
    return jsonify({"summary": summary, "files_scanned": len(file_samples)})


# --- API usage / kill switch ---------------------------------------------------------

@app.get("/api/usage")
def api_get_usage():
    usage = db.total_api_usage()
    try:
        import napkin_remaining
        usage.update(napkin_remaining.usage_day_and_month())
    except Exception as exc:
        print(f"[usage] day/month split failed: {exc}")
    usage["api_enabled"] = db.is_api_enabled()
    usage["model"] = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")
    usage["routing"] = model_roles.routing_snapshot()
    usage["openai_configured"] = model_roles.openai_configured()
    usage["anthropic_configured"] = model_roles.anthropic_configured()
    usage["grok_configured"] = model_roles.grok_configured()
    usage["local_model_available"] = ai.local_model_available()
    usage["local_model_name"] = model_roles.local_model_name()
    settings = db.get_settings()
    usage["offline_mode"] = settings.get("offline_mode")
    usage["inference_mode"] = settings.get("inference_mode")
    usage["self_coding_enabled"] = agent.self_coding_enabled()
    usage["vibecode_enabled"] = model_roles.vibecode_enabled()
    usage["vibecode_allowed"] = model_roles.vibecode_allowed()
    usage["code_edit_policy"] = agent.code_edit_policy()
    usage["live_routing"] = ai.live_routing_status()
    usage["openai_model"] = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
    usage["grok_model"] = os.environ.get("GROK_MODEL") or os.environ.get("XAI_MODEL", "grok-4.5")
    usage["backend_health"] = {
        "claude": {"configured": model_roles.anthropic_configured(), "rejected": ai.backend_key_rejected("claude")},
        "openai": {"configured": model_roles.openai_configured(), "rejected": ai.backend_key_rejected("openai")},
        "grok": {"configured": model_roles.grok_configured(), "rejected": ai.backend_key_rejected("grok")},
        "ollama": {"configured": ai.local_model_available(), "rejected": False},
    }
    return jsonify(usage)


@app.post("/api/usage/toggle")
def api_toggle_usage():
    enabled = db.is_api_enabled()
    db.save_settings({"api_enabled": "false" if enabled else "true"})
    return jsonify({"api_enabled": not enabled})


@app.post("/api/backup")
def api_manual_backup():
    path = backup.create_backup(reason="manual")
    return jsonify({"ok": True, "path": path})


@app.get("/api/budget/report")
def api_budget_report():
    return jsonify(budget.usage_report())


@app.post("/api/budget/optimize")
def api_budget_optimize():
    return jsonify(orchestrator.run("budget_manager"))


# --- Hub tab (saved links / reading list) ---------------------------------------------------------

@app.get("/api/links")
def api_list_links():
    return jsonify(db.list_saved_links(
        kind=request.args.get("kind"),
        status=request.args.get("status"),
    ))


@app.post("/api/links")
def api_create_link():
    data = request.get_json(force=True)
    kind = (data.get("kind") or "later").strip() or "later"
    url = (data.get("url") or "").strip()
    title = (data.get("title") or "").strip()
    if kind == "book":
        if not title:
            return jsonify({"error": "title is required for books"}), 400
    elif not url:
        return jsonify({"error": "url is required"}), 400
    link_id = db.insert_saved_link(
        url=url or None,
        title=title or url,
        note=(data.get("note") or "").strip(),
        kind=kind,
        status=(data.get("status") or "open").strip() or "open",
    )
    return jsonify(db.get_saved_link(link_id)), 201


@app.patch("/api/links/<int:link_id>")
def api_update_link(link_id):
    data = request.get_json(force=True)
    fields = {k: v for k, v in data.items() if k in ("url", "title", "note", "kind", "status")}
    if not fields:
        return jsonify({"error": "no valid fields"}), 400
    db.update_saved_link(link_id, **fields)
    row = db.get_saved_link(link_id)
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(row)


@app.delete("/api/links/<int:link_id>")
def api_delete_link(link_id):
    db.delete_saved_link(link_id)
    return jsonify({"ok": True})


# --- Parallel roleplay (AI-GM parallel life) -----------------------------------------

import parallel_life


def _serve_parallel_image(kind, filename):
    """Serve generated Parallel art from the durable cache (legacy static/ as fallback)."""
    safe = Path(filename or "").name
    if not safe or safe.startswith("."):
        return ("", 404)
    path = parallel_life.resolve_image_path(f"{kind}/{safe}")
    if not path:
        return ("", 404)
    resp = send_from_directory(path.parent, path.name)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.get("/scenes/<path:filename>")
def serve_parallel_scene(filename):
    return _serve_parallel_image("scenes", filename)


@app.get("/portraits/<path:filename>")
def serve_parallel_portrait(filename):
    return _serve_parallel_image("portraits", filename)


@app.get("/items/<path:filename>")
def serve_parallel_item(filename):
    return _serve_parallel_image("items", filename)


@app.get("/api/parallel/state")
def api_parallel_state():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        parallel_life.sync_wallet()
        parallel_life.daily_tick()
        state = db.rp_get_state()
        return jsonify({
            "ready": True,
            "state_summary": parallel_life.state_summary(state),
            "world_date": parallel_life.current_world_date(state),
        })
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.get("/api/parallel/messages")
def api_parallel_messages():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        limit = int(request.args.get("limit", 50))
        return jsonify({"ready": True, "messages": parallel_life.annotate_messages_with_scenes(
            db.rp_recent_messages_with_scenes(limit=limit)
        )})
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.get("/api/parallel/status")
def api_parallel_status():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        return jsonify(parallel_life.parallel_status())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/pregen-images")
def api_parallel_pregen_images():
    pregen = getattr(parallel_life, "pregen_all_images", None)
    if not callable(pregen):
        return jsonify({
            "error": "parallel image pregeneration is not implemented",
            "supported": False,
        }), 501
    try:
        result = pregen()
    except Exception as exc:
        return jsonify({"error": str(exc), "supported": True}), 500
    if result is None:
        result = {"ok": True}
    elif not isinstance(result, (dict, list)):
        result = {"ok": True, "result": result}
    return jsonify(result)


@app.get("/api/parallel/rules")
def api_parallel_rules():
    try:
        return jsonify(parallel_life.rules_summary())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/say")
def api_parallel_say():
    try:
        data = request.get_json(force=True)
        message = (data.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message is required"}), 400
        result = parallel_life.start_play(message)
        if not result.get("ready", True) and result.get("reason"):
            return jsonify(result)
        if result.get("error"):
            return jsonify(result), 400
        if result.get("accepted") is False:
            return jsonify(result), 409
        return jsonify(result)
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/illustrate")
def api_parallel_illustrate():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        data = request.get_json(force=True) or {}
        message_id = data.get("message_id")
        if not message_id:
            return jsonify({"reason": "message_id is required"}), 400
        result = parallel_life.illustrate_scene(int(message_id))
        return jsonify(result)
    except Exception as exc:
        return jsonify({"reason": str(exc)})


@app.get("/api/parallel/scenes")
def api_parallel_scenes():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        return jsonify(parallel_life.list_scene_urls())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.get("/api/parallel/journal")
def api_parallel_journal():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        limit = int(request.args.get("limit", 30))
        return jsonify({"ready": True, "journal": db.rp_recent_journal(limit=limit)})
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.get("/api/wallet")
def api_wallet():
    try:
        return jsonify(parallel_life.get_wallet())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.get("/api/coins")
def api_coins():
    try:
        return jsonify(parallel_life.get_coins())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/bend")
def api_parallel_bend():
    try:
        data = request.get_json(force=True) or {}
        request_text = (data.get("request") or "").strip()
        if not request_text:
            return jsonify({"error": "request is required"}), 400
        result = parallel_life.price_bend(request_text)
        if result.get("error"):
            return jsonify(result), 400
        if not result.get("ready", True) and result.get("reason"):
            return jsonify(result)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/bend/confirm")
def api_parallel_bend_confirm():
    try:
        data = request.get_json(force=True) or {}
        request_text = (data.get("request") or "").strip()
        price = data.get("price")
        if not request_text:
            return jsonify({"error": "request is required"}), 400
        if price is None:
            return jsonify({"error": "price is required"}), 400
        result = parallel_life.confirm_bend(request_text, price)
        if result.get("error"):
            return jsonify(result), 400
        if not result.get("ready", True) and result.get("reason"):
            return jsonify(result)
        if result.get("accepted") is False:
            return jsonify(result), 409
        return jsonify(result)
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/portrait")
def api_parallel_portrait():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        data = request.get_json(force=True) or {}
        character_id = (data.get("character_id") or "").strip()
        if not character_id:
            return jsonify({"reason": "character_id is required"}), 400
        regenerate = bool(data.get("regenerate"))
        result = parallel_life.illustrate_portrait(character_id, regenerate=regenerate)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"reason": str(exc)})


@app.get("/api/parallel/portraits")
def api_parallel_portraits():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        return jsonify(parallel_life.list_portrait_urls())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.get("/api/parallel/map")
def api_parallel_map():
    try:
        result = parallel_life.get_map_info()
        if not result.get("ready", True) and result.get("reason"):
            return jsonify(result)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/map/generate")
def api_parallel_map_generate():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        data = request.get_json(force=True) or {}
        regenerate = bool(data.get("regenerate"))
        result = parallel_life.generate_map(regenerate=regenerate)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"reason": str(exc)})


@app.post("/api/parallel/item-image")
def api_parallel_item_image():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        data = request.get_json(force=True) or {}
        item_id = (data.get("item_id") or "").strip()
        if not item_id:
            return jsonify({"reason": "item_id is required"}), 400
        regenerate = bool(data.get("regenerate"))
        result = parallel_life.illustrate_item(item_id, regenerate=regenerate)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"reason": str(exc)})


@app.get("/api/parallel/items")
def api_parallel_items():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init)
        return jsonify(parallel_life.list_item_urls())
    except Exception as exc:
        return jsonify({"ready": False, "reason": str(exc)})


@app.post("/api/parallel/image/upload")
def api_parallel_image_upload():
    try:
        init = parallel_life.ensure_initialized()
        if not init.get("ready"):
            return jsonify(init), 400

        kind = None
        target_id = None
        image_data = None

        upload_file = request.files.get("file")
        if upload_file:
            kind = (request.form.get("kind") or "").strip()
            target_id = request.form.get("id")
            raw = upload_file.read()
            if not raw:
                return jsonify({"ok": False, "reason": "empty file"}), 400
            mime = upload_file.content_type or "image/png"
            image_data = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
        else:
            data = request.get_json(silent=True) or {}
            kind = (data.get("kind") or "").strip()
            target_id = data.get("id")
            image_data = data.get("image")

        if not kind:
            return jsonify({"ok": False, "reason": "kind is required"}), 400
        if image_data is None or (isinstance(image_data, str) and not image_data.strip()):
            return jsonify({"ok": False, "reason": "image is required"}), 400

        result = parallel_life.upload_parallel_image(kind, target_id, image_data)
        if not result.get("ok"):
            return jsonify(result), 400
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"ok": False, "reason": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "reason": str(exc)}), 400


# --- Atelier image generation (local-first, never runs out) ----------------

def _atelier_svg_from_prompt(prompt, width=640, height=400):
    """Deterministic SVG from prompt words. Infinite, free, no paid cap."""
    text = (prompt or "waypoint abstract atelier").strip() or "waypoint abstract atelier"
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    words = re.findall(r"[a-z0-9]+", text.lower()) or ["waypoint"]
    colors = []
    for i, word in enumerate(words[:8]):
        wdig = hashlib.sha256(f"{word}:{i}".encode("utf-8")).digest()
        hue = wdig[0] * 360 // 255
        sat = 42 + (wdig[1] % 38)
        lit = 28 + (wdig[2] % 36)
        colors.append(f"hsl({hue} {sat}% {lit}%)")
    while len(colors) < 4:
        colors.append(colors[-1] if colors else "hsl(220 30% 22%)")
    blobs = []
    for i in range(6):
        cx = (digest[9 + i] / 255) * width
        cy = (digest[15 + i] / 255) * height
        radius = 50 + (digest[21 + i] / 255) * 140
        blobs.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{radius:.1f}" '
            f'fill="{colors[i % len(colors)]}" opacity="0.55"/>'
        )
    label = " ".join(words[:3])[:40]
    safe_label = (
        label.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{colors[0]}"/>'
        f'<stop offset="1" stop-color="{colors[1]}"/>'
        f"</linearGradient></defs>"
        f'<rect width="100%" height="100%" fill="url(#g)"/>'
        + "".join(blobs)
        + f'<text x="24" y="{height - 28}" fill="rgba(255,255,255,0.82)" '
        f'font-family="Georgia,serif" font-size="22">{safe_label}</text></svg>'
    )


def _atelier_local_image_data_url(prompt):
    """Default local image: seeded SVG so generation cannot run out."""
    svg = _atelier_svg_from_prompt(prompt)
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")


def _atelier_try_openai_image_once(prompt):
    """One remote attempt. Any failure returns None so the caller falls back to local."""
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        gen = getattr(parallel_life, "_generate_openai_image", None)
        if callable(gen):
            import tempfile
            tmp_dir = Path(tempfile.mkdtemp(prefix="wp-img-"))
            out = tmp_dir / "out.png"
            err = gen(prompt, out)
            if not err and out.exists():
                raw = out.read_bytes()
                try:
                    out.unlink(missing_ok=True)
                    tmp_dir.rmdir()
                except OSError:
                    pass
                return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
            return None
    except Exception:
        return None
    try:
        import urllib.request
        payload = json.dumps({
            "model": "gpt-image-1",
            "prompt": prompt,
            "size": "1024x1024",
            "n": 1,
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.openai.com/v1/images/generations",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        item = (body.get("data") or [None])[0] or {}
        if item.get("b64_json"):
            return "data:image/png;base64," + item["b64_json"]
    except Exception:
        return None
    return None


@app.post("/api/images/generate")
def api_images_generate():
    """Always succeeds. Default is local procedural art; optional OpenAI try-once then fallback."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or data.get("text") or "").strip() or "waypoint abstract atelier"
    provider = (data.get("provider") or "local").strip().lower()
    image = None
    used = "local"
    if provider in ("openai", "auto"):
        image = _atelier_try_openai_image_once(prompt)
        if image:
            used = "openai"
    if not image:
        image = _atelier_local_image_data_url(prompt)
        used = "local"
    return jsonify({
        "ok": True,
        "image": image,
        "data_url": image,
        "provider": used,
        "prompt": prompt,
        "infinite": used == "local",
    })


# --- School integrations (Pronote, schedule paste) -------------------------

_SCHEDULE_DAY_WEEKDAY = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
_CLASS_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _class_payload(data, partial=False):
    fields = {}
    if not partial or "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return None, "name is required"
        fields["name"] = name
    if not partial or "weekday" in data:
        try:
            weekday = int(data.get("weekday"))
        except (TypeError, ValueError):
            return None, "weekday must be 0 (Monday) through 6 (Sunday)"
        if weekday < 0 or weekday > 6:
            return None, "weekday must be 0 (Monday) through 6 (Sunday)"
        fields["weekday"] = weekday
    for key in ("start_time", "end_time"):
        if not partial or key in data:
            value = (data.get(key) or "").strip()
            if not _CLASS_TIME_RE.match(value):
                return None, f"{key} must be HH:MM"
            fields[key] = value
    if "start_time" in fields and "end_time" in fields and fields["end_time"] <= fields["start_time"]:
        return None, "end_time must be after start_time"
    if not partial or "travel_minutes" in data:
        try:
            travel_minutes = int(data.get("travel_minutes") or 0)
        except (TypeError, ValueError):
            return None, "travel_minutes must be a number"
        if travel_minutes < 0 or travel_minutes > 360:
            return None, "travel_minutes must be between 0 and 360"
        fields["travel_minutes"] = travel_minutes
    for key in ("location", "notes"):
        if not partial or key in data:
            fields[key] = (data.get(key) or "").strip()
    for key in ("start_date", "end_date"):
        if not partial and key not in data:
            continue
        if partial and key not in data:
            continue
        value = (data.get(key) or "").strip() or None
        if value:
            try:
                date_cls.fromisoformat(value)
            except ValueError:
                return None, f"{key} must be YYYY-MM-DD"
        fields[key] = value
    if not partial or "horizon_weeks" in data:
        try:
            weeks = int(data.get("horizon_weeks") if data.get("horizon_weeks") not in (None, "") else 16)
        except (TypeError, ValueError):
            return None, "horizon_weeks must be a number"
        if weeks < 1 or weeks > 52:
            return None, "horizon_weeks must be between 1 and 52"
        fields["horizon_weeks"] = weeks
    return fields, None


@app.get("/api/classes")
def api_list_classes():
    return jsonify(db.list_classes())


@app.post("/api/classes")
def api_create_class():
    data = request.get_json(force=True) or {}
    fields, error = _class_payload(data)
    if error:
        return jsonify({"error": error}), 400
    class_id = db.upsert_class_slot(**fields, source="manual")
    events_created = db.materialize_class_events(class_id, weeks=fields.get("horizon_weeks"))
    return jsonify({"class": db.get_class(class_id), "events_created": events_created}), 201


@app.patch("/api/classes/<int:class_id>")
def api_update_class(class_id):
    existing = db.get_class(class_id)
    if not existing:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    fields, error = _class_payload(data, partial=True)
    if error:
        return jsonify({"error": error}), 400
    merged_start = fields.get("start_time", existing["start_time"])
    merged_end = fields.get("end_time", existing["end_time"])
    if merged_end <= merged_start:
        return jsonify({"error": "end_time must be after start_time"}), 400
    db.update_class(class_id, **fields)
    events_created = db.materialize_class_events(
        class_id, weeks=fields.get("horizon_weeks") or existing.get("horizon_weeks"), replace=True
    )
    return jsonify({"class": db.get_class(class_id), "events_created": events_created})


@app.delete("/api/classes/<int:class_id>")
def api_delete_class(class_id):
    if not db.get_class(class_id):
        return jsonify({"error": "not found"}), 404
    for attachment in db.class_attachment_rows(class_id):
        try:
            (ATTACHMENTS_DIR / attachment["stored_filename"]).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete_class(class_id)
    return jsonify({"ok": True})


@app.post("/api/classes/<int:class_id>/items")
def api_create_class_item(class_id):
    if not db.get_class(class_id):
        return jsonify({"error": "class not found"}), 404
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    item_type = (data.get("item_type") or "homework").strip().lower()
    if item_type not in ("homework", "document"):
        return jsonify({"error": "item_type must be homework or document"}), 400
    due_date = (data.get("due_date") or "").strip() or None
    if due_date:
        try:
            date_cls.fromisoformat(due_date)
        except ValueError:
            return jsonify({"error": "due_date must be YYYY-MM-DD"}), 400
    item_id = db.insert_class_item(
        class_id,
        title,
        item_type=item_type,
        due_date=due_date,
        notes=(data.get("notes") or "").strip(),
        url=(data.get("url") or "").strip(),
        create_task=bool(data.get("create_task", True)),
    )
    class_row = db.get_class(class_id)
    item = next((row for row in class_row["items"] if row["id"] == item_id), None)
    return jsonify(item), 201


@app.delete("/api/classes/<int:class_id>/items/<int:item_id>")
def api_delete_class_item(class_id, item_id):
    class_row = db.get_class(class_id)
    item = next((row for row in (class_row or {}).get("items", []) if row["id"] == item_id), None)
    if not item:
        return jsonify({"error": "not found"}), 404
    for attachment in item.get("attachments", []):
        try:
            (ATTACHMENTS_DIR / attachment["stored_filename"]).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete_class_item(item_id)
    return jsonify({"ok": True, "linked_task_retained": bool(item.get("task_id"))})


def _class_item_attachment_text(item):
    chunks = []
    for attachment in item.get("attachments") or []:
        stored = ATTACHMENTS_DIR / attachment.get("stored_filename", "")
        extracted, *_rest = _extract_attachment_text(stored, attachment.get("filename") or "")
        if extracted:
            chunks.append(f"{attachment.get('filename')}: {extracted[:4000]}")
        else:
            chunks.append(attachment.get("filename") or "attachment")
    return "\n".join(chunks)


@app.post("/api/classes/<int:class_id>/items/<int:item_id>/grade")
def api_grade_class_item(class_id, item_id):
    class_row = db.get_class(class_id)
    item = next((row for row in (class_row or {}).get("items", []) if row["id"] == item_id), None)
    if not item:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(silent=True) or {}
    answer = (data.get("answer") or item.get("student_answer") or "").strip()
    try:
        result = ai.grade_class_work(
            title=f"{class_row['name']}: {item['title']}",
            notes=item.get("notes") or "",
            answer=answer,
            attachments_text=_class_item_attachment_text(item),
            rubric=(data.get("rubric") or "").strip(),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    db.update_class_item_grade(
        item_id, result["score"], result["letter"], result["feedback"], student_answer=answer,
    )
    updated = db.get_class_item(item_id)
    return jsonify({"ok": True, "grade": result, "item": updated})


def _github_repo_slug():
    settings = db.get_settings()
    return (
        (settings.get("github_repo") or "").strip()
        or os.environ.get("WAYPOINT_GITHUB_REPO", "helloso623/plan")
    )


def _observation_issue_body(payload):
    quote = (payload.get("quote") or "").strip()
    note = (payload.get("note") or "").strip()
    tab = (payload.get("tab") or "").strip()
    images = payload.get("images") or []
    lines = [
        "## Observation",
        f"- Tab: `{tab or 'unknown'}`",
        f"- Sent from Waypoint",
        "",
    ]
    if quote:
        lines += ["## Quoted answer / UI", "```", quote[:8000], "```", ""]
    if note:
        lines += ["## Requested fix", note[:8000], ""]
    if images:
        lines += ["## Images", *[f"- {name}" for name in images], ""]
        lines.append("_Image files are stored on the local Waypoint instance; GitHub issue bodies cannot host them._")
    return "\n".join(lines).strip() + "\n"


def _observation_github_new_url(title, body, repo):
    from urllib.parse import quote
    return f"https://github.com/{repo}/issues/new?title={quote(title[:200])}&body={quote(body[:12000])}"


def _try_create_github_issue(title, body, repo, token):
    if not token:
        return None
    import requests
    try:
        resp = requests.post(
            f"https://api.github.com/repos/{repo}/issues",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"title": title[:200], "body": body[:60000]},
            timeout=20,
        )
        if resp.status_code >= 300:
            return {"error": f"{resp.status_code}: {(resp.text or '')[:240]}"}
        data = resp.json()
        return {"url": data.get("html_url"), "number": data.get("number")}
    except Exception as exc:
        return {"error": str(exc)}


@app.get("/api/observations")
def api_list_observations():
    rows = db.list_observations()
    for row in rows:
        row["attachments"] = db.list_attachments("observation", row["id"])
    return jsonify(rows)


@app.post("/api/observations")
def api_create_observation():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip() or "Waypoint observation"
    quote = (data.get("quote") or "").strip()
    note = (data.get("note") or "").strip()
    tab = (data.get("tab") or "").strip()
    if not quote and not note:
        return jsonify({"error": "quote or note is required"}), 400
    oid = db.insert_observation(title, quote=quote, note=note, tab=tab)
    images = []
    for attachment_id in data.get("attachment_ids") or []:
        try:
            attachment = db.get_attachment(int(attachment_id))
        except (TypeError, ValueError):
            continue
        if not attachment:
            continue
        images.append(attachment.get("filename") or "image")
        # Re-home uploads that were staged before the observation id existed.
        if attachment.get("entity_type") == "observation_draft":
            db.update_attachment_entity(attachment["id"], "observation", oid)
    body = _observation_issue_body({
        "quote": quote, "note": note, "tab": tab, "images": images,
        "id": oid,
    })
    repo = _github_repo_slug()
    settings = db.get_settings()
    token = (settings.get("github_token") or os.environ.get("GITHUB_TOKEN") or "").strip()
    created = _try_create_github_issue(title, body, repo, token) if token else None
    github_url = None
    github_issue = None
    if created and created.get("url"):
        github_url = created["url"]
        github_issue = created.get("number")
    else:
        github_url = _observation_github_new_url(title, body, repo)
    db.update_observation_github(oid, github_url, github_issue)
    row = db.get_observation(oid)
    row["attachments"] = db.list_attachments("observation", oid)
    row["opened_existing_issue"] = bool(github_issue)
    row["github_create_error"] = (created or {}).get("error") if created else None
    return jsonify(row), 201


@app.get("/api/school/pronote/status")
def api_school_pronote_status():
    return jsonify(school_sync.pronote_status())


@app.post("/api/school/pronote/connect")
def api_school_pronote_connect():
    data = request.get_json(force=True) or {}
    result = school_sync.pronote_connect(
        data.get("url") or "",
        data.get("username") or "",
        data.get("password") or "",
    )
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result)


@app.post("/api/school/pronote/sync")
def api_school_pronote_sync():
    data = request.get_json(force=True) or {}
    days = data.get("days", 14)
    result = school_sync.pronote_sync(days=days)
    if result.get("error") and not result.get("calendar_created") and not result.get("tasks_created"):
        return jsonify(result), 400
    return jsonify(result)


@app.post("/api/school/parse-schedule")
def api_school_parse_schedule():
    data = request.get_json(force=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required", "courses": []}), 400
    try:
        result = orchestrator.run(
            "class_schedule_parser",
            text=text,
            today=date_cls.today().isoformat(),
        )
    except Exception as exc:
        return jsonify({"error": str(exc), "courses": []}), 200
    return jsonify(result)


@app.post("/api/school/apply-schedule")
def api_school_apply_schedule():
    data = request.get_json(force=True) or {}
    courses = data.get("courses")
    if not isinstance(courses, list) or not courses:
        return jsonify({"error": "courses is required"}), 400
    try:
        weeks = int(data.get("weeks", 12))
    except (TypeError, ValueError):
        weeks = 12
    weeks = max(1, min(weeks, 20))
    created = 0
    class_ids = set()
    for course in courses:
        if not isinstance(course, dict):
            continue
        title = (course.get("name") or "").strip()
        if not title:
            continue
        days = []
        for d in course.get("days") or []:
            if d in _SCHEDULE_DAY_WEEKDAY and d not in days:
                days.append(d)
        if not days:
            continue
        start_time = (course.get("start_time") or "").strip()
        end_time = (course.get("end_time") or "").strip()
        if not start_time or not end_time:
            continue
        location = (course.get("location") or "").strip()
        start_bound = None
        end_bound = None
        if course.get("start_date"):
            try:
                start_bound = date_cls.fromisoformat(str(course["start_date"]))
            except ValueError:
                start_bound = None
        if course.get("end_date"):
            try:
                end_bound = date_cls.fromisoformat(str(course["end_date"]))
            except ValueError:
                end_bound = None
        for day in days:
            class_id = db.upsert_class_slot(
                title,
                _SCHEDULE_DAY_WEEKDAY[day],
                start_time,
                end_time,
                location=location,
                notes="",
                source="schedule",
                start_date=start_bound.isoformat() if start_bound else None,
                end_date=end_bound.isoformat() if end_bound else None,
            )
            class_ids.add(class_id)
            created += db.materialize_class_events(class_id, weeks=weeks)
    return jsonify({"created": created, "classes_upserted": len(class_ids)})


# --- NYU Brightspace + campus apps -------------------------------------------
# Honest limits: Albert / NYU Home have no student API. Brightspace ICS works
# for every student. Official D2L OAuth needs NYU IT client credentials.

_NYU_OAUTH_DONE_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>NYU Brightspace</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;line-height:1.5;">
<h1 style="font-size:1.2rem;">Brightspace connected</h1>
<p>You can close this tab and return to Waypoint Settings → NYU, then Sync.</p>
</body></html>
"""

_NYU_OAUTH_FAIL_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>NYU Brightspace</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;line-height:1.5;">
<h1 style="font-size:1.2rem;">Brightspace connection failed</h1>
<p>{detail}</p>
<p>Close this tab and try again from Settings → NYU.</p>
</body></html>
"""


@app.get("/api/nyu/status")
def api_nyu_status():
    return jsonify(nyu_sync.status_payload())


@app.get("/api/nyu/apps")
def api_nyu_apps():
    return jsonify({"apps": nyu_sync.nyu_apps()})


@app.post("/api/nyu/brightspace/settings")
def api_nyu_brightspace_settings():
    data = request.get_json(force=True) or {}
    updates = {}
    if "client_id" in data:
        updates["nyu_brightspace_client_id"] = (data.get("client_id") or "").strip()
    if "client_secret" in data:
        updates["nyu_brightspace_client_secret"] = (data.get("client_secret") or "").strip()
    if "ics_url" in data:
        try:
            nyu_sync.save_ics_url((data.get("ics_url") or "").strip())
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if updates:
        db.save_settings(updates)
        env_updates = {}
        if "nyu_brightspace_client_id" in updates:
            env_updates["NYU_BRIGHTSPACE_CLIENT_ID"] = updates["nyu_brightspace_client_id"]
        if "nyu_brightspace_client_secret" in updates:
            env_updates["NYU_BRIGHTSPACE_CLIENT_SECRET"] = updates["nyu_brightspace_client_secret"]
        if env_updates:
            try:
                _merge_env_file(env_updates)
            except OSError:
                pass
    return jsonify({"ok": True, **nyu_sync.status_payload()})


@app.post("/api/nyu/brightspace/ics")
def api_nyu_brightspace_ics():
    data = request.get_json(force=True) or {}
    url = (data.get("url") or data.get("ics_url") or "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400
    try:
        result = nyu_sync.import_ics_url(url, persist=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result})


@app.get("/api/nyu/brightspace/oauth/start")
def api_nyu_brightspace_oauth_start():
    try:
        url = nyu_sync.authorization_url()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"url": url, "redirect_uri": nyu_sync._redirect_uri()})


@app.get("/api/nyu/brightspace/oauth/callback")
def api_nyu_brightspace_oauth_callback():
    error = (request.args.get("error") or "").strip()
    if error:
        detail = request.args.get("error_description") or error
        return _NYU_OAUTH_FAIL_HTML.format(detail=detail), 400
    code = (request.args.get("code") or "").strip()
    state = (request.args.get("state") or "").strip()
    if not code or not nyu_sync.consume_oauth_state(state):
        return _NYU_OAUTH_FAIL_HTML.format(detail="Missing or expired OAuth state. Start Connect again from Settings."), 400
    try:
        nyu_sync.exchange_code(code)
    except Exception as exc:
        return _NYU_OAUTH_FAIL_HTML.format(detail=str(exc)), 400
    return _NYU_OAUTH_DONE_HTML


@app.post("/api/nyu/brightspace/sync")
def api_nyu_brightspace_sync():
    try:
        result = nyu_sync.sync_brightspace_api()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result})


@app.post("/api/nyu/sync")
def api_nyu_sync():
    result = nyu_sync.sync_all()
    if result.get("error") and not result.get("sources"):
        return jsonify(result), 400
    return jsonify({"ok": True, **result})


@app.post("/api/nyu/brightspace/disconnect")
def api_nyu_brightspace_disconnect():
    nyu_sync.clear_tokens()
    return jsonify({"ok": True, **nyu_sync.status_payload()})


# --- Repository dump (local file store + RAG) ---------------------------------

# List/preview only — full text comes from /content and agent read_repository_file.
REPO_TEXT_PREVIEW_CHARS = 8000
REPO_LIST_DEFAULT = 250
REPO_LIST_MAX = 500


def _repo_api_row(row):
    if not row:
        return row
    return {
        **row,
        "kind": repository.file_workspace_kind(row.get("filename")),
        "editor_kind": repository._file_kind(row.get("filename")),
    }


@app.post("/api/repo/files")
def api_repo_upload_files():
    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        files = [single] if single and single.filename else []
    if not files:
        return jsonify({"error": "files are required"}), 400
    results = []
    for f in files:
        if not f or not f.filename:
            results.append({"ok": False, "error": "empty file slot"})
            continue
        try:
            row = repository.ingest_file(f)
            if isinstance(row, dict) and row.get("rows"):
                for r in row["rows"]:
                    results.append({"ok": True, "row": _repo_api_row(r)})
            else:
                results.append({"ok": True, "row": _repo_api_row(row)})
        except Exception as exc:
            results.append({"ok": False, "filename": f.filename, "error": str(exc)})
    return jsonify({"results": results, "files": [r["row"] for r in results if r.get("ok")]})


@app.get("/api/repo/files")
def api_repo_list_files():
    category = request.args.get("category") or None
    kind = (request.args.get("kind") or "").strip().lower()
    if kind and kind not in repository.WORKSPACE_KINDS:
        return jsonify({"error": f"kind must be one of: {', '.join(repository.WORKSPACE_KINDS)}"}), 400
    try:
        limit = int(request.args.get("limit", REPO_LIST_DEFAULT))
    except (TypeError, ValueError):
        limit = REPO_LIST_DEFAULT
    limit = max(1, min(limit, REPO_LIST_MAX))
    rows = db.list_repo_files(category=category)
    rows = [_repo_api_row(row) for row in rows]
    if kind:
        rows = [row for row in rows if row["kind"] == kind]
    rows = rows[:limit]
    for row in rows:
        text = row.get("extracted_text") or ""
        if len(text) > REPO_TEXT_PREVIEW_CHARS:
            row["extracted_text"] = text[:REPO_TEXT_PREVIEW_CHARS]
            row["text_truncated"] = True
        else:
            row["text_truncated"] = False
    return jsonify(rows)


@app.get("/api/repo/files/<int:file_id>")
def api_repo_get_file(file_id):
    row = db.get_repo_file(file_id)
    if not row:
        return jsonify({"error": "not found"}), 404
    text = row.get("extracted_text") or ""
    preview = text[:REPO_TEXT_PREVIEW_CHARS]
    return jsonify({
        **_repo_api_row(row),
        "text_preview": preview,
        "text_truncated": len(text) > REPO_TEXT_PREVIEW_CHARS,
    })


@app.get("/api/repo/files/<int:file_id>/raw")
def api_repo_get_file_raw(file_id):
    row = db.get_repo_file(file_id)
    if not row:
        return jsonify({"error": "not found"}), 404
    path = repository.stored_file_path(file_id)
    if not path or not path.is_file():
        return jsonify({"error": "file missing on disk"}), 404
    return send_from_directory(
        path.parent, path.name, mimetype=row.get("mime") or "application/octet-stream",
        as_attachment=False, download_name=row["filename"],
    )


@app.get("/api/repo/files/<int:file_id>/content")
def api_repo_file_content(file_id):
    payload = repository.get_file_content(file_id)
    if payload is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(payload)


@app.patch("/api/repo/files/<int:file_id>/content")
def api_repo_patch_file_content(file_id):
    data = request.get_json(force=True) or {}
    text = data.get("text")
    if text is None:
        return jsonify({"error": "text is required"}), 400
    row, err = repository.update_file_content(file_id, text)
    if err == "not found":
        return jsonify({"error": "not found"}), 404
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"ok": True, "row": row})


@app.post("/api/repo/files/<int:file_id>/run")
def api_repo_run_file(file_id):
    # SECURITY: explicit user-triggered local execution only — client must confirm before calling.
    result, err = repository.run_python_file(file_id)
    if err == "not found":
        return jsonify({"error": "not found"}), 404
    if err:
        return jsonify({"error": err}), 400
    return jsonify(result)


@app.post("/api/repo/files/<int:file_id>/use-for-planning")
def api_repo_use_for_planning(file_id):
    data = request.get_json(force=True) or {}
    intent = (data.get("intent") or "tasks").strip()
    proposals, err = repository.propose_planning_from_file(file_id, intent=intent)
    if err == "not found":
        return jsonify({"error": "not found"}), 404
    if err:
        return jsonify({"error": err, "proposal_only": True}), 400
    return jsonify(proposals)


@app.post("/api/repo/files/<int:file_id>/extract")
def api_repo_reextract_file(file_id):
    row, err = repository.reextract_file(file_id)
    if err == "not found":
        return jsonify({"error": "not found"}), 404
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"ok": True, "row": row})


@app.post("/api/repo/files/<int:file_id>/promote-docs")
def api_repo_promote_extracted_to_docs(file_id):
    data = request.get_json(force=True) or {}
    title = data.get("title")
    row, err = repository.promote_extracted_to_docs(file_id, title=title)
    if err == "not found":
        return jsonify({"error": "not found"}), 404
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"ok": True, "row": row})


@app.post("/api/repo/docs")
def api_repo_create_blank_doc():
    data = request.get_json(force=True) or {}
    title = data.get("title") or "Untitled"
    kind = data.get("kind") or "docs"
    row, err = repository.create_blank_file(title=title, kind=kind)
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"ok": True, "row": _repo_api_row(row)})


@app.post("/api/repo/ask")
def api_repo_ask_docs():
    data = request.get_json(force=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400
    k = data.get("k", 6)
    file_id = data.get("file_id")
    return jsonify(repository.ask_docs(query, k=k, file_id=file_id))


@app.delete("/api/repo/files/<int:file_id>")
def api_repo_delete_file(file_id):
    if not repository.delete_file(file_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


@app.patch("/api/repo/files/<int:file_id>")
def api_repo_patch_file(file_id):
    row = db.get_repo_file(file_id)
    if not row:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    changed = False
    if "category" in data:
        category = str(data.get("category") or "").strip()
        if category not in repository.CATEGORIES:
            return jsonify({"error": f"category must be one of: {', '.join(repository.CATEGORIES)}"}), 400
        db.set_repo_file_category(file_id, category)
        changed = True
    if "title" in data or "filename" in data:
        title = data.get("title", data.get("filename"))
        renamed, err = repository.rename_file(file_id, title)
        if err:
            return jsonify({"error": err}), 400
        changed = True
    if not changed:
        return jsonify({"error": "provide category or title"}), 400
    return jsonify(_repo_api_row(db.get_repo_file(file_id)))


@app.get("/api/repo/categories")
def api_repo_categories():
    return jsonify(repository.list_repo_category_counts())


@app.post("/api/repo/search")
def api_repo_search():
    data = request.get_json(force=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400
    k = data.get("k", 8)
    return jsonify({"query": query, "results": repository.rag_search(query, k=k)})


@app.get("/api/repo/summary")
def api_repo_summary():
    force = request.args.get("force", "").lower() in ("1", "true", "yes")
    return jsonify(repository.rebuild_summary(force=force))


@app.get("/api/repo/google/available")
def api_repo_google_available():
    connected = google_integration.is_connected()
    if connected:
        scope = google_integration.drive_scope_status()
        return jsonify({
            "connected": True,
            "reason": None,
            "drive_readonly": scope.get("drive_readonly", False),
            "scope_message": scope.get("message"),
        })
    if not google_integration.is_configured():
        return jsonify({
            "connected": False,
            "reason": "Google OAuth client not configured. Set up in Settings → Integrations.",
        })
    return jsonify({
        "connected": False,
        "reason": "Connect Google in Settings → Integrations",
    })


@app.post("/api/repo/google/import")
def api_repo_google_import():
    data = request.get_json(force=True) or {}
    max_files = data.get("max_files", 50)
    try:
        result = repository.import_google_drive_files(max_files=max_files)
    except google_integration.NotConnected as exc:
        return jsonify({
            "ok": False,
            "needs_auth": True,
            "how": "Connect Google in Settings → Integrations",
            "error": str(exc),
        })
    except google_integration.NotConfigured as exc:
        return jsonify({
            "ok": False,
            "needs_auth": True,
            "how": "Connect Google in Settings → Integrations",
            "error": str(exc),
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    if not result.get("ok"):
        return jsonify(result)
    return jsonify(result)


@app.get("/api/conversations")
def api_list_conversations():
    source = request.args.get("source") or None
    limit = request.args.get("limit", 50)
    since = request.args.get("since") or None
    return jsonify(db.list_conversations(source=source, limit=limit, since=since))


@app.get("/api/forecast/today")
def api_forecast_today():
    """Local predictive forecast for the rest of today — no API keys, pure sqlite math."""
    import local_forecast

    date_str = (request.args.get("date") or "").strip() or date_cls.today().isoformat()
    try:
        date_cls.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "invalid date"}), 400
    return jsonify(local_forecast.build_forecast(date_str))


@app.post("/api/forecast/refresh")
def api_forecast_refresh():
    """Alias for forecast refresh (same payload as GET /api/forecast/today)."""
    import local_forecast

    data = request.get_json(silent=True) or {}
    date_str = (data.get("date") or request.args.get("date") or "").strip() or date_cls.today().isoformat()
    try:
        date_cls.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "invalid date"}), 400
    return jsonify(local_forecast.build_forecast(date_str))


# =============================================================================
# Automation rules API
# =============================================================================

_VALID_TRIGGER_TYPES = rules.TRIGGER_TYPES
_VALID_ACTION_TYPES = rules.SAFE_ACTIONS


def _validate_rule_body(data):
    """Return (error_str|None, parsed_condition, parsed_actions)."""
    trigger_type = (data.get("trigger_type") or "").strip()
    if trigger_type not in _VALID_TRIGGER_TYPES:
        return f"trigger_type must be one of: {', '.join(sorted(_VALID_TRIGGER_TYPES))}", None, None
    try:
        condition = data["condition"] if "condition" in data else {}
        if isinstance(condition, str):
            condition = json.loads(condition)
    except (json.JSONDecodeError, TypeError):
        return "condition must be a JSON object", None, None
    try:
        actions = data["actions"]
        if isinstance(actions, str):
            actions = json.loads(actions)
        if not isinstance(actions, list):
            return "actions must be a JSON array", None, None
    except (json.JSONDecodeError, TypeError, KeyError):
        return "actions is required and must be a JSON array", None, None
    for act in actions:
        atype = (act.get("type") or "")
        if atype not in _VALID_ACTION_TYPES:
            return f"action type {atype!r} is not in SAFE_ACTIONS", None, None
    return None, condition, actions


@app.get("/api/rules")
def api_list_rules():
    rows = db.list_automation_rules()
    return jsonify(rows)


@app.post("/api/rules")
def api_create_rule():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    err, condition, actions = _validate_rule_body(data)
    if err:
        return jsonify({"error": err}), 400
    ai_mode = data.get("ai_mode", "none")
    enabled = bool(data.get("enabled", True))
    rule_id = db.insert_automation_rule(
        name, data["trigger_type"], condition, actions,
        ai_mode=ai_mode, enabled=enabled,
    )
    return jsonify(db.get_automation_rule(rule_id)), 201


@app.get("/api/rules/<int:rule_id>")
def api_get_rule(rule_id):
    rule = db.get_automation_rule(rule_id)
    if not rule:
        return jsonify({"error": "not found"}), 404
    return jsonify(rule)


@app.patch("/api/rules/<int:rule_id>")
def api_update_rule(rule_id):
    if not db.get_automation_rule(rule_id):
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    updates = {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "name cannot be empty"}), 400
        updates["name"] = name
    if "trigger_type" in data:
        tt = (data["trigger_type"] or "").strip()
        if tt not in _VALID_TRIGGER_TYPES:
            return jsonify({"error": f"invalid trigger_type: {tt!r}"}), 400
        updates["trigger_type"] = tt
    if "condition" in data:
        try:
            cond = data["condition"]
            if isinstance(cond, str):
                cond = json.loads(cond)
            updates["condition_json"] = json.dumps(cond)
        except (json.JSONDecodeError, TypeError):
            return jsonify({"error": "condition must be a JSON object"}), 400
    if "actions" in data:
        try:
            acts = data["actions"]
            if isinstance(acts, str):
                acts = json.loads(acts)
            if not isinstance(acts, list):
                return jsonify({"error": "actions must be a JSON array"}), 400
            for act in acts:
                atype = act.get("type", "")
                if atype not in _VALID_ACTION_TYPES:
                    return jsonify({"error": f"action type {atype!r} not in SAFE_ACTIONS"}), 400
            updates["actions_json"] = json.dumps(acts)
        except (json.JSONDecodeError, TypeError):
            return jsonify({"error": "actions must be a JSON array"}), 400
    if "ai_mode" in data:
        updates["ai_mode"] = data["ai_mode"]
    if "enabled" in data:
        updates["enabled"] = 1 if data["enabled"] else 0
    db.update_automation_rule(rule_id, **updates)
    return jsonify(db.get_automation_rule(rule_id))


@app.delete("/api/rules/<int:rule_id>")
def api_delete_rule(rule_id):
    if not db.get_automation_rule(rule_id):
        return jsonify({"error": "not found"}), 404
    db.delete_automation_rule(rule_id)
    return jsonify({"ok": True})


@app.post("/api/rules/<int:rule_id>/enable")
def api_set_rule_enabled(rule_id):
    rule = db.get_automation_rule(rule_id)
    if not rule:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    enabled = bool(data.get("enabled", True))
    db.set_automation_rule_enabled(rule_id, enabled)
    return jsonify(db.get_automation_rule(rule_id))


@app.post("/api/rules/<int:rule_id>/test")
def api_test_rule(rule_id):
    """Dry-run or live-run one rule with a sample or provided payload.

    Provide {"payload": {...}, "dry_run": true} to simulate match without
    running actions. Omit dry_run (or set false) to actually run SAFE actions.
    """
    rule = db.get_automation_rule(rule_id)
    if not rule:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True) or {}
    payload = data.get("payload") or {}
    dry_run = bool(data.get("dry_run", False))
    try:
        import json as _json
        condition = _json.loads(rule.get("condition_json") or "{}")
    except Exception:
        condition = {}
    matched = rules.match_condition(payload, condition)
    if dry_run or not matched:
        return jsonify({"matched": matched, "dry_run": True, "rule_id": rule_id})
    try:
        summaries = rules.emit(rule["trigger_type"], payload)
        relevant = [s for s in summaries if s.get("rule_id") == rule_id]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"matched": matched, "dry_run": False, "rule_id": rule_id, "result": relevant})


@app.get("/api/local-rag/status")
def api_local_rag_status():
    import local_rag
    return jsonify(local_rag.status())


@app.post("/api/local-rag/rebuild")
def api_local_rag_rebuild():
    import local_rag
    try:
        stats = local_rag.rebuild_index()
        return jsonify({"ok": True, **stats})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/local-rag/search")
def api_local_rag_search():
    import local_rag
    data = request.get_json(force=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    k = min(int(data.get("k") or 5), 20)
    results = local_rag.search(query, k=k)
    return jsonify({"results": results})


@app.post("/api/local-rag/ask")
def api_local_rag_ask():
    import local_rag
    data = request.get_json(force=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    k = min(int(data.get("k") or 4), 10)
    try:
        result = local_rag.ask(query, k=k)
        return jsonify(result)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _is_wildcard_bind(host):
    return str(host or "").strip().lower() in ("0.0.0.0", "::", "*", "[::]")


def _resolve_bind_host():
    host = (os.environ.get("FLASK_HOST") or "").strip()
    tailscale_mode = os.environ.get("WAYPOINT_TAILSCALE", "").lower() in ("1", "true", "yes", "on")
    want_tailscale = host.lower() in ("tailscale", "tailnet") or (not host and tailscale_mode)
    if want_tailscale:
        import time
        last_exc = None
        try:
            attempts = max(1, int(os.environ.get("WAYPOINT_TAILSCALE_RETRY_ATTEMPTS", "60")))
        except ValueError:
            attempts = 60
        try:
            delay = float(os.environ.get("WAYPOINT_TAILSCALE_RETRY_DELAY", "1.0"))
        except ValueError:
            delay = 1.0
        for _attempt in range(attempts):
            try:
                import tailscale_net
                ip = tailscale_net.tailscale_ipv4()
                if ip and not _is_wildcard_bind(ip):
                    return ip
            except Exception as exc:
                last_exc = exc
                _note_runtime("tailscale_bind", exc)
            time.sleep(delay)
        if last_exc:
            _note_runtime("tailscale_bind_giveup", last_exc)
        print("[waypoint] Tailscale IP not ready after retries; binding 127.0.0.1 (not 0.0.0.0)", flush=True)
        return "127.0.0.1"
    if host and not _is_wildcard_bind(host):
        return host
    if _is_wildcard_bind(host):
        print("[waypoint] refusing wildcard bind; using 127.0.0.1 (not 0.0.0.0)", flush=True)
    return "127.0.0.1"


def serve_tailnet_when_ready(port, bound_host, attempts=120, delay=5.0):
    """Add a tailnet listener later if Tailscale was not up in time to bind at startup.

    At login the app usually wins the race against Tailscale, so it bound 127.0.0.1 and stayed
    there until someone restarted it by hand -- the phone simply could not reach it. Binding
    loopback immediately keeps the desktop window instant; this watches for the tailnet address
    and starts a second listener on it the moment it appears.
    """
    if bound_host not in ("127.0.0.1", "::1"):
        return  # already on the tailnet address
    host_pref = (os.environ.get("FLASK_HOST") or "").strip().lower()
    wanted = host_pref in ("tailscale", "tailnet") or         os.environ.get("WAYPOINT_TAILSCALE", "").lower() in ("1", "true", "yes", "on")
    if not wanted:
        return

    def _watch():
        import time
        from werkzeug.serving import make_server
        for _ in range(attempts):
            time.sleep(delay)
            try:
                import tailscale_net
                ip = tailscale_net.tailscale_ipv4()
            except Exception:
                ip = None
            if not ip:
                continue
            try:
                server = make_server(ip, port, app, threaded=True)
            except OSError as exc:
                print(f"[waypoint] could not add the tailnet listener on {ip}:{port} ({exc})",
                      flush=True)
                return
            print(f"[waypoint] Tailscale is up - also serving http://{ip}:{port}", flush=True)
            server.serve_forever()
            return
        print("[waypoint] Tailscale never appeared; staying on loopback only", flush=True)

    threading.Thread(target=_watch, daemon=True).start()


def _print_listen_hints(host, port):
    print(f"[waypoint] listening on http://{host}:{port}", flush=True)
    tailscale_mode = os.environ.get("WAYPOINT_TAILSCALE", "").lower() in ("1", "true", "yes", "on")
    if not tailscale_mode and host in ("127.0.0.1", "::1"):
        return
    try:
        import tailscale_net
        for url in tailscale_net.public_urls(port):
            print(f"[waypoint] Tailscale URL: {url}", flush=True)
        for url in tailscale_net.serve_https_urls():
            if os.environ.get("WAYPOINT_TAILSCALE_SERVE", "").lower() in ("1", "true", "yes", "on"):
                print(f"[waypoint] Tailscale Serve: {url}", flush=True)
        if _trust_tailscale():
            print("[waypoint] APP_TRUST_TAILSCALE=true — Tailnet peers skip the access token", flush=True)
        elif _access_token():
            print("[waypoint] APP_ACCESS_TOKEN set — phone/Tailnet clients must sign in", flush=True)
        else:
            print("[waypoint] tip: set APP_ACCESS_TOKEN or APP_TRUST_TAILSCALE=true for remote Tailnet access", flush=True)
    except Exception as exc:
        print(f"[waypoint] Tailscale status unavailable: {exc}", flush=True)


if __name__ == "__main__":
    # Move personal content out of the checkout before anything reads it.
    personal_data.migrate_and_log()
    scheduler.start()
    obsidian_watcher.start()
    # Commit anything the previous session pinned but never got to commit (the debounce is
    # a daemon timer, so closing the app inside that window would otherwise lose it), and
    # retry a push that was deferred while offline. Threaded so git never delays startup.
    threading.Thread(target=napkin_sync.startup_sync, daemon=True).start()
    threading.Thread(target=game_sync.startup_sync, daemon=True).start()
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    port = int(os.environ.get("PORT", "5099"))
    host = _resolve_bind_host()
    _print_listen_hints(host, port)
    serve_tailnet_when_ready(port, host)
    seed_personal_napkin_tasks()
    app.run(host=host, debug=debug, port=port, threaded=True)


# =============================================================================
# LOCAL AI — keep durable state in ONE fixed external folder (not the git checkout)
# =============================================================================
# Goal: planner data survives branch switches, re-clones, and fresh zip downloads.
# Set WAYPOINT_DATA_DIR to a permanent path (e.g. ~/WaypointData) and export it
# in the shell profile or launch script before starting Flask.
#
# All runtime state must live under WAYPOINT_DATA_DIR (via _DATA_DIR above):
#   planner.db     — db.py already uses Path(WAYPOINT_DATA_DIR) / "planner.db"
#   .env           — load_dotenv(_DATA_DIR / ".env") at top of this file
#   attachments/   — ATTACHMENTS_DIR = _DATA_DIR / "attachments"
#   repo_store/    — wire repository.py REPO_STORE to _DATA_DIR / "repo_store"
#   backups/exports — any new on-disk artifacts → _DATA_DIR subdirs, never plan/
#
# Do NOT scatter state into the repo tree (plan/.env, plan/planner.db,
# plan/attachments/, plan/repo_store/). Git checkout = code only.
#
# Local-only wiring checklist:
#   1. Create WAYPOINT_DATA_DIR; migrate existing db, .env, attachments if present.
#   2. _merge_env_file writes _DATA_DIR / ".env". After a git pull, Update from git
#      reinstalls requirements.txt and merges new .env.example keys.
#   3. repository.py uses WAYPOINT_PYTHON or sys.executable (not a hardcoded venv).
#   4. Keep LOCAL_MODEL_URL, OLLAMA_URL, WAYPOINT_OFFLINE_MODE in the durable .env.
#   5. Use PLANNER_DB_PATH only when the DB must differ; prefer WAYPOINT_DATA_DIR.
#
# _DATA_DIR is the in-app root — extend it, do not introduce parallel data paths.
# =============================================================================
