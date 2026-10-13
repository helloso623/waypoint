"""AI backend routing for the Code tab -- lets you pick which model handles a
question instead of always spending Claude API tokens, since routine stuff often
doesn't need it ("ai salad... not killing my token account"). Three backends:

- claude: the same Anthropic API used everywhere else in Planner (costs tokens,
  logged in api_usage like every other call)
- ollama: whatever local model you've pulled (free, runs on your machine,
  needs Ollama running -- http://127.0.0.1:11434 by default, auto-detected)
- cursor: NOT YET WIRED UP. A Cursor API key exists in .env from earlier this
  session, but Cursor's programmatic API contract for triggering background
  coding agents needs to be verified against their current docs before sending
  real requests -- guessing at the request shape risks silently-wrong behavior,
  which is worse than not having the option yet. The key is detected and shown
  as available in the UI, but calling it raises a clear "not implemented" error
  rather than pretending to work.
"""
import json
import os

import requests

import agent
import ai
import db
import model_roles

OLLAMA_URL = (
    os.environ.get("OLLAMA_URL")
    or os.environ.get("LOCAL_MODEL_URL")
    or "http://127.0.0.1:11434"
).rstrip("/")

MAX_TOOL_ROUNDS = 4
_cloud_reachable_cache = None

OFFLINE_BLOCKED_MSG = ai.OFFLINE_BLOCKED_MSG


def _backend_result(response, actions=None, source=None):
    """Normalize Code-tab responses with honest backend labeling."""
    src = source or ai.LAST_SOURCE or "unknown"
    ai.LAST_SOURCE = src
    return {"response": response, "actions": actions or [], "source": src, "backend": src}


def _default_ollama_model(ollama_model=None):
    if ollama_model:
        return ollama_model
    models = list_ollama_models()
    return ai.pick_ollama_model(available=models) if models else ai._live_local_model_name()


def _offline_ollama_model(ollama_model=None):
    models = list_ollama_models()
    if ollama_model and ollama_model in models:
        return ollama_model
    if not models:
        return None
    return ai.pick_ollama_model(available=models)


def _label_offline_response(text):
    return ai._append_offline_label(text)


def _cloud_reachable():
    """Lazy, cheap probe: can we reach a cloud AI endpoint at all right now?"""
    global _cloud_reachable_cache
    if _cloud_reachable_cache is not None:
        return _cloud_reachable_cache
    try:
        resp = requests.head("https://api.anthropic.com", timeout=1.5)
        _cloud_reachable_cache = resp.status_code < 500
    except requests.RequestException:
        _cloud_reachable_cache = False
    return _cloud_reachable_cache


# Claude answering in the Code tab gets the same self-coding tools agent.py's chat uses
# (read_project_file, propose_file_edit, propose_command) when Developer mode is on -- routed
# through agent._execute_tool, the exact same staging/approval/backup mechanism, not a parallel
# one. Ollama/Cursor don't get tool-use here (not wired up for either backend).
def _code_tools():
    if not agent.self_coding_enabled():
        return []
    return [t for t in agent.TOOLS if t["name"] in agent.SELF_CODING_TOOL_NAMES]


CODE_SYSTEM_PROMPT_ON = """You are answering a question in the Code tab of Waypoint, a personal
life-OS app, about its own codebase. If the question is informational, just answer in plain text.

If it asks you to fix, change, or add something in the code: read the relevant file with
read_project_file first, then stage the change with propose_file_edit (or propose_command for
shell actions). Never claim a change is made -- propose_file_edit and propose_command only STAGE
the change for the user to review and approve elsewhere in the UI; nothing touches disk until they
approve it. Say what you proposed, not that it's done.

If the question includes a "the user has selected ... in the Code tab's file viewer" block, that's
a specific highlighted region the user picked -- answer about that region specifically (you already
have its content, no need to re-read the whole file with read_project_file unless you need more
surrounding context than what's shown)."""

CODE_SYSTEM_PROMPT_OFF = """You are answering a question in the Code tab of Waypoint, a personal
life-OS app, about its own codebase. Self-coding mode is OFF -- you cannot read project files,
stage edits, or propose commands. Answer informational questions in plain text using any selection
context provided.

If the user asks you to fix, change, or add something in the code, explain at a high level what
you would do, but you MUST include this exact sentence: "Self-coding mode is off — enable it in
Settings to let me stage edits."

If the question includes a "the user has selected ... in the Code tab's file viewer" block, that's
a specific highlighted region the user picked -- answer about that region specifically."""

CODE_SYSTEM_PROMPT_EDIT_ON = """You are in Edit mode in the Code tab of Waypoint. The user wants
code changes staged for their approval — not just an explanation.

For every request that implies fixing, changing, refactoring, or adding code: read the relevant
file with read_project_file first (unless the selection block already has enough context), then
stage the change with propose_file_edit (or propose_command for shell actions). Briefly say what
you proposed — never claim it is already applied. propose_file_edit and propose_command only STAGE
changes; nothing touches disk until the user approves elsewhere in the UI.

Only answer in plain text without staging when the user clearly asks a purely informational
question (explain, review, compare) with no change requested.

If the question includes a "the user has selected ... in the Code tab's file viewer" block, treat
that region as the primary edit target."""

CODE_SYSTEM_PROMPT_EDIT_OFF = """You are in Edit mode in the Code tab of Waypoint, but self-coding
is OFF — you cannot read project files, stage edits, or propose commands. Explain at a high level
what you would change, but you MUST include this exact sentence: "Self-coding mode is off — enable
it in Settings to let me stage edits."

If the question includes a "the user has selected ... in the Code tab's file viewer" block, ground
your answer in that region specifically."""


class BackendUnavailable(Exception):
    pass


def list_ollama_models():
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        resp.raise_for_status()
        return [m["name"] for m in resp.json().get("models", [])]
    except requests.RequestException:
        return []


def available_backends():
    backends = ["auto"]
    offline = ai.offline_mode_enabled()
    if not offline:
        backends.append("claude")
        if os.environ.get("OPENAI_API_KEY"):
            backends.append("openai")
        if model_roles.grok_configured() or os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY"):
            backends.append("grok")
        if os.environ.get("CURSOR_API_KEY"):
            backends.append("cursor")
    if list_ollama_models():
        backends.append("ollama")
    return backends


def ask_openai(prompt):
    """Codex-class model (claude_notes 2026-07-16: "use codex more freely than claude ...
    bad in costs"). Plain Q&A -- no self-coding tool-use wired for this backend (that stays
    Claude-only, same as Ollama), so it can't stage edits, just answer.
    """
    if ai.offline_mode_enabled():
        raise BackendUnavailable(ai.OFFLINE_CLOUD_BLOCKED_MSG)
    if not db.is_api_enabled():
        raise BackendUnavailable("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    model = model_roles.openai_model("coding")
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
        json={"model": model,
              "messages": [{"role": "user", "content": prompt}], "max_completion_tokens": 2000},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        db.log_api_usage(f"openai:{data.get('model') or model}", data["usage"]["prompt_tokens"], data["usage"]["completion_tokens"])
    except Exception:
        pass
    return _backend_result(data["choices"][0]["message"]["content"].strip(), source="openai")


def ask_grok(prompt):
    """xAI Grok code Q&A (OpenAI-compatible). No staged edits — Claude-only for self-coding."""
    if ai.offline_mode_enabled():
        raise BackendUnavailable(ai.OFFLINE_CLOUD_BLOCKED_MSG)
    if not db.is_api_enabled():
        raise BackendUnavailable("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    key = (os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY") or "").strip()
    if not key:
        raise BackendUnavailable("XAI_API_KEY is not configured.")
    model = model_roles.grok_model("coding")
    base = (os.environ.get("XAI_API_BASE") or "https://api.x.ai/v1").rstrip("/")
    resp = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 2000},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        usage = data.get("usage") or {}
        db.log_api_usage(
            f"grok:{data.get('model') or model}",
            usage.get("prompt_tokens") or usage.get("input_tokens") or 0,
            usage.get("completion_tokens") or usage.get("output_tokens") or 0,
        )
    except Exception:
        pass
    choices = data.get("choices") or []
    if not choices:
        raise BackendUnavailable("Grok API returned no choices.")
    content = (choices[0].get("message") or {}).get("content") or ""
    return _backend_result(content.strip(), source="grok")


def ask_claude(prompt, mode=None):
    if ai.offline_mode_enabled():
        raise BackendUnavailable(ai.OFFLINE_CLOUD_BLOCKED_MSG)
    coding_on = agent.self_coding_enabled()
    if mode == "edit":
        system = CODE_SYSTEM_PROMPT_EDIT_ON if coding_on else CODE_SYSTEM_PROMPT_EDIT_OFF
    else:
        system = CODE_SYSTEM_PROMPT_ON if coding_on else CODE_SYSTEM_PROMPT_OFF
    code_tools = _code_tools()
    messages = [{"role": "user", "content": prompt}]
    actions = []
    for _ in range(MAX_TOOL_ROUNDS):
        kwargs = {
            "model": model_roles.anthropic_model("coding"),
            "max_tokens": 2000,
            "system": system,
            "messages": messages,
        }
        if code_tools:
            kwargs["tools"] = code_tools
        resp = ai.client().messages.create(**kwargs)
        ai._log_usage(resp)
        if resp.stop_reason != "tool_use":
            text = "".join(b.text for b in resp.content if b.type == "text").strip()
            return _backend_result(text, actions=actions, source="claude")

        messages.append({"role": "assistant", "content": resp.content})
        tool_results = []
        for block in resp.content:
            if block.type == "tool_use":
                result = agent._execute_tool(block.name, block.input)
                actions.append({"tool": block.name, "input": block.input})
                tool_results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": json.dumps(result, default=str),
                })
        messages.append({"role": "user", "content": tool_results})

    return _backend_result(
        "Hit the tool-call limit for this question -- try asking again, more narrowly.",
        actions=actions,
        source="claude",
    )


def ask_ollama(prompt, model, offline_labeled=False):
    resp = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=120,
    )
    resp.raise_for_status()
    text = resp.json().get("response", "").strip()
    if offline_labeled:
        text = _label_offline_response(text)
    ai.LAST_SOURCE = "ollama"
    return _backend_result(text, source="ollama")


def ask_cursor(prompt):
    raise BackendUnavailable(
        "Cursor routing isn't wired up yet -- the API key is saved and detected, but the "
        "exact request contract for Cursor's background-agent API needs to be confirmed "
        "against their current docs before this can send real requests."
    )


def _format_selection(selection):
    """Turns a Code-tab text selection ({path, start_line, end_line, content}) into a context
    block prepended to the question, so the answer is grounded in that exact region instead of
    the AI guessing which part of a large file the user means. Returns None for anything
    incomplete/malformed -- selection context is a nice-to-have, never a hard requirement.
    """
    if not isinstance(selection, dict):
        return None
    path = (selection.get("path") or "").strip()
    content = selection.get("content") or ""
    if not path or not content.strip():
        return None
    start, end = selection.get("start_line"), selection.get("end_line")
    where = f"lines {start}-{end} of `{path}`" if start and end else f"a selection in `{path}`"
    return (
        f"The user has selected {where} in the Code tab's file viewer, and their question below "
        f"is about that selection specifically -- ground your answer in this exact code, not the "
        f"rest of the file:\n\n```\n{content}\n```"
    )


def ask(backend, prompt, ollama_model=None, selection=None, mode=None):
    """Returns {"response": str, "actions": [...], "source": str, "backend": str}."""
    edit_mode = (mode or "").strip().lower() == "edit"
    selection_block = _format_selection(selection)
    full_prompt = f"{selection_block}\n\nQuestion: {prompt}" if selection_block else prompt
    offline = ai.offline_mode_enabled()

    if edit_mode:
        if offline:
            raise BackendUnavailable(
                "Edit mode requires Claude (self-coding tools) — cloud AI is blocked in offline mode."
            )
        backend = "claude"

    if offline and backend in ("claude", "openai", "grok", "cursor", "auto"):
        model = _offline_ollama_model(ollama_model)
        if not model:
            raise BackendUnavailable(OFFLINE_BLOCKED_MSG)
        return ask_ollama(full_prompt, model, offline_labeled=True)

    if backend == "auto":
        backend = model_roles.configured_backend("coding")
        if backend == "ollama" and not ollama_model:
            if model_roles.openai_configured():
                backend = "openai"
            elif model_roles.grok_configured():
                backend = "grok"
            else:
                backend = "claude"
        if ai.local_model_available() and not _cloud_reachable():
            ollama_model = _default_ollama_model(ollama_model)
            backend = "ollama"
    if backend == "claude":
        return ask_claude(full_prompt, mode="edit" if edit_mode else mode)
    if backend == "openai":
        return ask_openai(full_prompt)
    if backend == "grok":
        return ask_grok(full_prompt)
    if backend == "ollama":
        model = ollama_model or _default_ollama_model()
        if not model:
            raise BackendUnavailable("Pick an Ollama model first.")
        return ask_ollama(full_prompt, model, offline_labeled=offline)
    if backend == "cursor":
        return ask_cursor(full_prompt)
    raise BackendUnavailable(f"Unknown backend: {backend}")
