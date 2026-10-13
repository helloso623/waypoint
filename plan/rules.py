"""When-then automation rules engine.

Triggers fire events; matching rules run their action lists deterministically.
LLM is only used via the optional `ai_step` action type.
"""
import json
import re
import threading

import db

TRIGGER_TYPES = {
    "task.completed",
    "task.created",
    "day.saved",
    "note.created",
    "idea.created",
    "calendar.created",
    "schedule.daily",
}

SAFE_ACTIONS = {
    "notify_discord",
    "add_task",
    "add_note",
    "add_idea",
    "add_calendar_event",
    "add_pulse",
    "ai_step",
}

# Prevent infinite loops if a future action path starts emitting events.
_emit_depth = threading.local()
_MAX_EMIT_DEPTH = 2


def _get_nested(obj, path):
    """Walk dot-separated key path into a nested dict; return None if missing."""
    parts = path.split(".")
    cur = obj
    for part in parts:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def match_condition(event_payload: dict, condition: dict) -> bool:
    """Return True when event_payload satisfies all conditions.

    Empty condition always matches.
    Each key in condition may use:
      - equality: {"urgency": "critical"}
      - "contains" operator: {"title": {"contains": "bug"}}
    Dot-path keys like "task.urgency" walk nested dicts.
    """
    if not condition:
        return True
    for key, expected in condition.items():
        actual = _get_nested(event_payload, key)
        if isinstance(expected, dict) and "contains" in expected:
            substring = str(expected["contains"])
            if actual is None or substring.lower() not in str(actual).lower():
                return False
        else:
            if actual != expected:
                return False
    return True


def render_template(text: str, ctx: dict) -> str:
    """Replace {{key}} and {{nested.key}} tokens from ctx."""
    def _replacer(m):
        key = m.group(1).strip()
        val = _get_nested(ctx, key)
        return str(val) if val is not None else m.group(0)

    return re.sub(r"\{\{([^}]+)\}\}", _replacer, text or "")


def _action_notify_discord(params: dict, ctx: dict) -> dict:
    import notify
    message = render_template(params.get("message", ""), ctx)
    if not notify.is_configured():
        return {"ok": False, "note": "Discord webhook not configured"}
    ok = notify.send_discord(message)
    return {"ok": ok}


def _action_add_task(params: dict, ctx: dict) -> dict:
    title = render_template(params.get("title", ""), ctx)
    if not title:
        return {"ok": False, "error": "title is required for add_task"}
    notes = render_template(params.get("notes", ""), ctx)
    urgency = params.get("urgency", "medium")
    task_id = db.insert_task(title, notes=notes, urgency=urgency)
    return {"ok": True, "task_id": task_id}


def _action_add_note(params: dict, ctx: dict) -> dict:
    list_type = params.get("list_type", "thinking")
    title = render_template(params.get("title", ""), ctx)
    body = render_template(params.get("body", ""), ctx)
    if not title and not body:
        return {"ok": False, "error": "title or body required for add_note"}
    if not title:
        title = (body[:50] + "...") if len(body) > 50 else body
    note_id = db.insert_note(list_type, title, body, source="rule")
    return {"ok": True, "note_id": note_id}


def _action_add_idea(params: dict, ctx: dict) -> dict:
    title = render_template(params.get("title", ""), ctx)
    body = render_template(params.get("body", ""), ctx)
    if not title:
        return {"ok": False, "error": "title is required for add_idea"}
    idea_id = db.insert_idea(title, body, source="rule")
    return {"ok": True, "idea_id": idea_id}


def _action_add_calendar_event(params: dict, ctx: dict) -> dict:
    title = render_template(params.get("title", ""), ctx)
    date = render_template(params.get("date", ""), ctx)
    if not title or not date:
        return {"ok": False, "error": "title and date required for add_calendar_event"}
    event_id = db.insert_calendar_event(
        title, date,
        params.get("start_time"), params.get("end_time"),
        params.get("category"), render_template(params.get("notes", ""), ctx),
    )
    return {"ok": True, "event_id": event_id}


def _action_add_pulse(params: dict, ctx: dict) -> dict:
    happiness = params.get("happiness", 5)
    note = render_template(params.get("note", ""), ctx)
    try:
        pulse_id = db.insert_mood_pulse(int(happiness), note=note or None)
        return {"ok": True, "pulse_id": pulse_id}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _action_ai_step(params: dict, ctx: dict) -> dict:
    import ai
    prompt = render_template(params.get("prompt", ""), ctx)
    if not prompt:
        return {"ok": False, "error": "prompt is required for ai_step"}
    backend = (params.get("backend") or "cloud").lower()
    output_key = params.get("output_key", "ai_result")
    if backend == "local":
        if not ai.local_model_available():
            return {"ok": False, "note": "local model not available — skipping ai_step", "output_key": output_key}
        try:
            result = ai._call_local_model(prompt, max_tokens=600)
            return {"ok": True, "output_key": output_key, "result": result}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "output_key": output_key}
    # cloud (default)
    try:
        result = ai.route_text("tasks", prompt, max_tokens=600)
        return {"ok": True, "output_key": output_key, "result": result}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "output_key": output_key}


_ACTION_DISPATCH = {
    "notify_discord": _action_notify_discord,
    "add_task": _action_add_task,
    "add_note": _action_add_note,
    "add_idea": _action_add_idea,
    "add_calendar_event": _action_add_calendar_event,
    "add_pulse": _action_add_pulse,
    "ai_step": _action_ai_step,
}


def run_action(action: dict, ctx: dict) -> dict:
    """Dispatch one action by type; return {ok, result/error}."""
    action_type = action.get("type", "")
    if action_type not in SAFE_ACTIONS:
        return {"ok": False, "error": f"unknown or unsafe action type: {action_type!r}"}
    handler = _ACTION_DISPATCH.get(action_type)
    if handler is None:
        return {"ok": False, "error": f"no handler for action type: {action_type!r}"}
    try:
        result = handler(action, ctx)
        if result.get("ok") and action_type == "ai_step":
            output_key = result.get("output_key", "ai_result")
            ctx[output_key] = result.get("result", "")
        return result
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _run_rule(rule: dict, event_type: str, payload: dict) -> dict:
    """Execute one rule against an event payload; return a run summary."""
    try:
        condition = json.loads(rule.get("condition_json") or "{}")
    except (json.JSONDecodeError, TypeError):
        condition = {}
    if not match_condition(payload, condition):
        return {"rule_id": rule["id"], "matched": False}

    try:
        actions = json.loads(rule.get("actions_json") or "[]")
    except (json.JSONDecodeError, TypeError):
        actions = []

    ctx = dict(payload)
    action_results = []
    error_msg = None
    for action in actions:
        try:
            res = run_action(action, ctx)
            action_results.append(res)
            if not res.get("ok"):
                error_msg = res.get("error") or res.get("note") or "action failed"
        except Exception as exc:
            action_results.append({"ok": False, "error": str(exc)})
            error_msg = str(exc)

    return {
        "rule_id": rule["id"],
        "rule_name": rule.get("name"),
        "matched": True,
        "actions": action_results,
        "error": error_msg,
    }


def emit(event_type: str, payload: dict | None = None) -> list:
    """Fire event_type; run all enabled matching rules.

    Never raises — errors are caught per-rule and recorded.
    Returns list of run summaries.
    """
    depth = getattr(_emit_depth, "n", 0)
    if depth >= _MAX_EMIT_DEPTH:
        print(f"[rules] emit skipped (depth {depth}): {event_type}")
        return []
    if payload is None:
        payload = {}
    summaries = []
    _emit_depth.n = depth + 1
    try:
        try:
            rules = [r for r in db.list_automation_rules()
                     if r.get("enabled") and r.get("trigger_type") == event_type]
        except Exception as exc:
            print(f"[rules] emit: failed to load rules: {exc}")
            return summaries

        for rule in rules:
            try:
                summary = _run_rule(rule, event_type, payload)
                summaries.append(summary)
                if summary.get("matched"):
                    db.touch_automation_rule_run(rule["id"], error=summary.get("error"))
            except Exception as exc:
                print(f"[rules] rule {rule.get('id')} raised unexpectedly: {exc}")
                try:
                    db.touch_automation_rule_run(rule["id"], error=str(exc))
                except Exception:
                    pass
                summaries.append({"rule_id": rule.get("id"), "matched": True, "error": str(exc)})
    finally:
        _emit_depth.n = depth

    return summaries
