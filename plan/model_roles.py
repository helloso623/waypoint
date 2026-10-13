"""Central model-role routing for Waypoint.

Every role can run on Claude, ChatGPT (OpenAI), or Grok when that key exists.
Defaults still prefer Claude for tool-use and judgment. If the chosen API
fails, `fallback_chain()` is the ordered list `ai.py` walks so the app keeps
working and the HUD can show who actually answered.
"""
import os


ROLE_ORDER = ["chat", "planning", "judgment", "tasks", "practice", "coding", "roleplay"]

_pressure_reroute_logged = False

# configured_backend() runs on every AI call, and the reachability probe is a
# network round trip, so the answer is cached briefly rather than re-asked each time.
_local_probe = {"checked_at": 0.0, "ok": False}


def local_model_available(ttl=30.0):
    """Cached 'is Ollama up right now' check."""
    import time
    now = time.monotonic()
    if now - _local_probe["checked_at"] < ttl:
        return _local_probe["ok"]
    try:
        import ai
        ok = ai.local_model_available()
    except Exception:
        ok = False
    _local_probe.update(checked_at=now, ok=ok)
    return ok

ROLE_DESCRIPTIONS = {
    "chat": "Agent tab tool-use chat",
    "planning": "Goal chunking and schedule planning",
    "judgment": "Reviews, validation, idea/document judgment",
    "tasks": "Task parsing, urgency, contact/category helpers",
    "practice": "AI practice game generation and grading",
    "coding": "Code tab Q&A and coding assistance",
    "roleplay": "Parallel-life game master narration",
}

DEFAULT_BACKENDS = {
    "chat": "auto",
    "planning": "auto",
    "judgment": "auto",
    "tasks": "auto",
    "practice": "auto",
    "coding": "auto",
    "roleplay": "auto",
}

CLOUD_BACKENDS = ("claude", "openai", "grok")

# Claude stays the DEFAULT for the judgment-heavy roles (see DEFAULT_BACKENDS); this is
# only about what they may fall back to when Claude cannot serve -- no key, revoked key,
# or offline. Refusing to fall back doesn't protect quality, it just breaks the feature.
#
# `chat` reaches OpenAI/Grok through chat_backends.py, which translates the tool-use loop
# into the OpenAI dialect. Ollama is deliberately absent from chat: local tool-calling
# support varies per model, and a silently dropped tool call in a write-capable agent is
# worse than a clear failure. Web search is Claude-only and is dropped on the others.
SAFE_BACKENDS = {
    "chat": {"auto", "claude", "openai", "grok"},
    "planning": {"auto", "claude", "openai", "grok", "ollama"},
    "judgment": {"auto", "claude", "openai", "grok", "ollama"},
    "tasks": {"auto", "claude", "openai", "grok", "ollama"},
    "practice": {"auto", "claude", "openai", "grok", "ollama"},
    "coding": {"auto", "claude", "openai", "grok", "ollama"},
    "roleplay": {"auto", "claude", "openai", "grok", "ollama"},
}


def _env(name, default=""):
    return os.environ.get(name) or default


def _settings():
    try:
        import db
        return db.get_settings()
    except Exception:
        return {}


def openai_configured():
    settings = _settings()
    key = (settings.get("openai_api_key") or "").strip() or _env("OPENAI_API_KEY")
    return bool(key)


def grok_configured():
    """True when an xAI / Grok API key is present (settings or XAI_API_KEY)."""
    settings = _settings()
    key = (
        (settings.get("xai_api_key") or "").strip()
        or (settings.get("grok_api_key") or "").strip()
        or _env("XAI_API_KEY")
        or _env("GROK_API_KEY")
    )
    return bool(key)


def anthropic_model(role="orchestrator"):
    settings = _settings()
    base = (settings.get("claude_model") or "").strip() or _env("CLAUDE_MODEL", "claude-sonnet-5")
    env_names = {
        "chat": "AGENT_CHAT_MODEL",
        "orchestrator": "ORCHESTRATOR_MODEL",
        "planning": "ORCHESTRATOR_MODEL",
        "judgment": "ORCHESTRATOR_MODEL",
        "coding": "CODE_CLAUDE_MODEL",
        "roleplay": "ROLEPLAY_MODEL",
    }
    return _env(env_names.get(role, "ORCHESTRATOR_MODEL"), base)


def openai_model(role="tasks"):
    settings = _settings()
    default = (settings.get("openai_model") or "").strip() or _env("OPENAI_MODEL", "gpt-5-mini")
    if role == "coding":
        return _env("CODE_OPENAI_MODEL", _env("OPENAI_CODE_MODEL", default if "codex" in default else "gpt-5-codex"))
    if role == "practice":
        return (settings.get("practice_ai_model") or "").strip() or _env("PRACTICE_AI_MODEL", default)
    return _env(f"{role.upper()}_AI_MODEL", default)


def grok_model(role="tasks"):
    """xAI Grok model id for a role (OpenAI-compatible chat completions)."""
    settings = _settings()
    default = (
        (settings.get("grok_model") or "").strip()
        or _env("GROK_MODEL", _env("XAI_MODEL", "grok-4.5"))
    )
    if role == "coding":
        return _env("CODE_GROK_MODEL", _env("GROK_CODE_MODEL", default))
    if role == "practice":
        return _env("PRACTICE_GROK_MODEL", default)
    return _env(f"{role.upper()}_GROK_MODEL", default)


def local_model_name_configured():
    """Explicit user/env Ollama model only — empty when unset (allows auto-pick)."""
    settings = _settings()
    return (settings.get("local_model_name") or "").strip() or _env("LOCAL_MODEL_NAME", "")


def local_model_name():
    """Resolved Ollama model: explicit setting if set, else auto-pick best installed tag."""
    configured = local_model_name_configured()
    if configured:
        return configured
    try:
        import ai
        return ai.pick_ollama_model()
    except Exception:
        return _env("LOCAL_MODEL_NAME", "llama3.2:3b")


def backend_usable(backend):
    """Can this backend actually serve a request right now?

    Key present AND not recently rejected -- ai.backend_key_rejected() remembers a 401 for a
    few minutes so we don't re-attempt a known-dead key on every single call.
    """
    try:
        import ai
        if ai.backend_key_rejected(backend):
            return False
    except Exception:
        pass
    if backend == "openai":
        return openai_configured()
    if backend == "grok":
        return grok_configured()
    if backend == "claude":
        return anthropic_configured()
    if backend == "ollama":
        return local_model_available()
    return False


def configured_backend(role):
    role = role if role in DEFAULT_BACKENDS else "tasks"
    # Offline gate: never report Claude/OpenAI while offline mode is on.
    try:
        import ai
        if ai.offline_mode_enabled():
            return "ollama"
    except Exception:
        pass
    settings = _settings()
    requested = (
        settings.get(f"route_{role}")
        or _env(f"ROUTE_{role.upper()}")
        or DEFAULT_BACKENDS[role]
    ).lower()
    if requested not in SAFE_BACKENDS[role]:
        requested = DEFAULT_BACKENDS[role]
    if requested == "auto":
        requested = _auto_backend(role)
    if requested == "openai" and not openai_configured():
        requested = "grok" if grok_configured() else "claude"
    if requested == "grok" and not grok_configured():
        requested = "openai" if openai_configured() else "claude"
    # Claude now gets the same usability test the others already had. Without this a missing
    # or revoked Anthropic key still returned "claude", so the call went out and came back a
    # 401 -- while a perfectly good OpenAI key sat unused.
    if requested == "claude" and not backend_usable("claude"):
        for alt in ("openai", "grok", "ollama"):
            if alt in SAFE_BACKENDS[role] and backend_usable(alt):
                requested = alt
                break
    # Under daily budget pressure, shed low-stakes spend first (tasks/practice only).
    if role in {"tasks", "practice"}:
        import budget
        if budget.cap_pressure() > 0.7:
            global _pressure_reroute_logged
            # A reachable local model is the only option that costs nothing, so it
            # outranks merely-cheaper paid APIs once the daily cap is under strain.
            if local_model_available():
                preferred = "ollama"
            elif openai_configured() or grok_configured():
                preferred = "openai" if openai_configured() else "grok"
            else:
                preferred = requested
            if requested != preferred:
                if not _pressure_reroute_logged:
                    print(
                        f"[model_roles] daily budget pressure >70% — routing tasks/practice to {preferred}"
                    )
                    _pressure_reroute_logged = True
                requested = preferred
    return requested


def _auto_backend(role):
    """Prefer Claude for high-stakes roles, cheapest configured cloud otherwise."""
    if role in {"chat", "planning", "judgment", "roleplay"}:
        if anthropic_configured():
            return "claude"
        if openai_configured():
            return "openai"
        if grok_configured():
            return "grok"
        return "claude"
    if openai_configured():
        return "openai"
    if grok_configured():
        return "grok"
    if anthropic_configured():
        return "claude"
    return "openai"


def provider_ready(backend):
    backend = (backend or "").lower()
    if backend == "claude":
        return anthropic_configured()
    if backend == "openai":
        return openai_configured()
    if backend == "grok":
        return grok_configured()
    if backend == "ollama":
        try:
            import ai
            return bool(ai.local_model_available())
        except Exception:
            return False
    return False


def fallback_chain(role):
    """Ordered backends to try when the preferred API dies mid-call."""
    role = role if role in DEFAULT_BACKENDS else "tasks"
    preferred = configured_backend(role)
    allowed = set(SAFE_BACKENDS.get(role) or CLOUD_BACKENDS)
    ordered = []
    for backend in (preferred, *CLOUD_BACKENDS, "ollama"):
        if backend == "auto":
            continue
        if backend != "ollama" and backend not in allowed and backend != preferred:
            continue
        if backend in ordered:
            continue
        if backend == preferred or provider_ready(backend):
            ordered.append(backend)
    return ordered or [preferred]


def model_for(role, backend=None):
    backend = backend or configured_backend(role)
    if backend == "openai":
        return openai_model(role)
    if backend == "grok":
        return grok_model(role)
    if backend == "ollama":
        return local_model_name()
    if role == "chat":
        return anthropic_model("chat")
    if role == "coding":
        return anthropic_model("coding")
    if role == "roleplay":
        return anthropic_model("roleplay")
    return anthropic_model("orchestrator")


def routing_snapshot():
    return {
        role: {
            "description": ROLE_DESCRIPTIONS[role],
            "backend": configured_backend(role),
            "model": model_for(role),
            "default_backend": DEFAULT_BACKENDS[role],
            "safe_backends": sorted(SAFE_BACKENDS[role]),
            "fallback": fallback_chain(role),
        }
        for role in ROLE_ORDER
    }


def anthropic_configured():
    settings = _settings()
    key = (settings.get("anthropic_api_key") or "").strip() or _env("ANTHROPIC_API_KEY")
    return bool(key)


def _truthy_setting(key, default="false"):
    value = (_settings().get(key) or default).strip().lower()
    return value in ("1", "true", "yes", "on")


def vibecode_enabled():
    """User opt-in for vibecode endpoints (default off)."""
    return _truthy_setting("vibecode_enabled", "false")


def is_strong_coding_model(role="chat"):
    """True only when the role routes to Claude — not OpenAI, Grok, Ollama, or auto→cheap."""
    role = role if role in DEFAULT_BACKENDS else "chat"
    return configured_backend(role) == "claude"


def vibecode_allowed():
    """Vibecode toggle on AND judgment-class Claude backend is available."""
    return (
        vibecode_enabled()
        and anthropic_configured()
        and is_strong_coding_model("judgment")
    )


def vibecode_permitted():
    """Alias used by API gates — same policy as vibecode_allowed()."""
    return vibecode_allowed()
