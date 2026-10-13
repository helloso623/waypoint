"""OpenAI-compatible tool-use chat, normalized to the Anthropic response shape.

The Agent tab's tool loop in agent.py is written against Anthropic's API: content blocks,
`stop_reason == "tool_use"`, `tool_use` / `tool_result` pairs. Rewriting that loop to be
backend-agnostic would mean touching every branch of the most safety-sensitive path in the
app, so instead the transcript stays canonically Anthropic-shaped and this module translates
only at the boundary:

    Anthropic messages ---> OpenAI chat-completions request
    OpenAI response     ---> Anthropic-shaped blocks the loop already understands

That keeps the tool loop single-path, and means a backend swap can't change tool semantics.

Fallback is first-class: this module is the production OpenAI/Grok path when Anthropic
cannot be minted or is unauthorized. Do not require Anthropic — Agent chat must keep
working on the fallback backend.

Covers OpenAI and xAI/Grok (both speak the OpenAI chat-completions dialect). Ollama is
deliberately not wired up here -- local tool-calling support varies per model, and a silently
dropped tool call in a *write*-capable agent is worse than a clear failure.
"""
import json
import os

import ai
import db
import model_roles

# Anthropic exposes web search as a server-side tool. OpenAI/Grok get an explicit function
# tool when a Brave/Tavily/SerpAPI key is configured; otherwise search is disabled and the
# prompt must say so, or the model invents sources.
WEB_SEARCH_KEY_ENVS = (
    "BRAVE_SEARCH_API_KEY",
    "TAVILY_API_KEY",
    "SERPAPI_KEY",
    "SERPAPI_API_KEY",
)

NO_WEB_SEARCH_NOTE = (
    "\n\n[Backend note] You are NOT running on Claude for this turn. Live web research "
    "is available via the web_search tool — call it when you need current sources. "
    "Do not claim you searched unless that tool returned results. Every other tool "
    "listed above works exactly as described -- use them normally."
)

WEB_SEARCH_DISABLED_NOTE = (
    "\n\n[Backend note] You are NOT running on Claude for this turn. Live web_search is "
    "DISABLED — no Brave/Tavily/SerpAPI key is configured. Do not claim you searched. "
    "Say search is unavailable and answer from the tools you do have."
)


def web_search_keys_present():
    return any((os.environ.get(name) or "").strip() for name in WEB_SEARCH_KEY_ENVS)


def tools_include_web_search(tools):
    for tool in tools or []:
        if not isinstance(tool, dict):
            continue
        if tool.get("name") == "web_search" and tool.get("input_schema"):
            return True
    return False


class _Usage:
    __slots__ = ("input_tokens", "output_tokens")

    def __init__(self, input_tokens=0, output_tokens=0):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _Block:
    """Duck-type of an Anthropic content block (.type plus the fields that type carries)."""

    def __init__(self, **fields):
        for key, value in fields.items():
            setattr(self, key, value)

    def __repr__(self):
        return f"<_Block {getattr(self, 'type', '?')}>"


class _Response:
    """Duck-type of an Anthropic Message: .content, .stop_reason, .usage, .model."""

    def __init__(self, content, stop_reason, usage, model):
        self.content = content
        self.stop_reason = stop_reason
        self.usage = usage
        self.model = model


def _btype(block):
    """Block type, whether the block is a dict we built or an SDK object."""
    if isinstance(block, dict):
        return block.get("type")
    return getattr(block, "type", None)


def _bget(block, name, default=None):
    if isinstance(block, dict):
        return block.get(name, default)
    return getattr(block, name, default)


def to_openai_tools(tools):
    """Anthropic {name, description, input_schema} -> OpenAI {type: function, function: {...}}.

    Server-side tools (web search) carry a "type" and no input_schema; they have no
    OpenAI equivalent and are skipped.
    """
    converted = []
    for tool in tools:
        schema = tool.get("input_schema")
        if not schema:
            continue
        converted.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description") or "",
                "parameters": schema,
            },
        })
    return converted


def to_openai_messages(system, messages):
    """Anthropic-shaped transcript -> OpenAI chat-completions messages.

    The orderings OpenAI requires fall out of this naturally: an assistant message carrying
    tool_calls is emitted immediately before the tool messages answering it, because the loop
    appends the assistant turn and then the tool_result turn in that order.
    """
    out = []
    if system:
        out.append({"role": "system", "content": system})

    for message in messages:
        role = message.get("role")
        content = message.get("content")

        # Plain history rows from the DB are already flat strings.
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue
        if not isinstance(content, (list, tuple)):
            continue

        if role == "assistant":
            text_parts = []
            tool_calls = []
            for block in content:
                kind = _btype(block)
                if kind == "text":
                    text_parts.append(_bget(block, "text") or "")
                elif kind == "tool_use":
                    tool_calls.append({
                        "id": _bget(block, "id"),
                        "type": "function",
                        "function": {
                            "name": _bget(block, "name"),
                            "arguments": json.dumps(_bget(block, "input") or {}, default=str),
                        },
                    })
                # thinking / server_tool_use blocks have no OpenAI counterpart -> dropped.
            # content=None is only legal alongside tool_calls. An assistant turn with
            # neither text nor a tool call (an empty model reply, which the fake-tool retry
            # path appends verbatim) must serialize as "" -- null there is a hard 400.
            text = "".join(text_parts)
            assistant = {"role": "assistant", "content": text or (None if tool_calls else "")}
            if tool_calls:
                assistant["tool_calls"] = tool_calls
            out.append(assistant)
            continue

        # A user turn in this loop is the tool_result carrier.
        spare_text = []
        for block in content:
            kind = _btype(block)
            if kind == "tool_result":
                out.append({
                    "role": "tool",
                    "tool_call_id": _bget(block, "tool_use_id"),
                    "content": _bget(block, "content") or "",
                })
            elif kind == "text":
                spare_text.append(_bget(block, "text") or "")
        if spare_text:
            out.append({"role": "user", "content": "\n".join(spare_text)})

    return out


def from_openai_response(data, model):
    """OpenAI chat-completions payload -> Anthropic-shaped _Response."""
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("chat backend returned no choices.")
    choice = choices[0]
    message = choice.get("message") or {}

    blocks = []
    text = (message.get("content") or "").strip()
    if text:
        blocks.append(_Block(type="text", text=text))

    raw_calls = message.get("tool_calls") or []
    for call in raw_calls:
        function = call.get("function") or {}
        raw_args = function.get("arguments") or "{}"
        try:
            arguments = json.loads(raw_args)
        except (json.JSONDecodeError, TypeError):
            # A malformed argument blob must not crash the turn: hand the loop an empty
            # input so the tool reports its own validation error the normal way.
            print(f"[chat_backends] unparseable tool arguments for {function.get('name')!r}")
            arguments = {}
        if not isinstance(arguments, dict):
            arguments = {}
        blocks.append(_Block(
            type="tool_use",
            id=call.get("id"),
            name=function.get("name"),
            input=arguments,
        ))

    stop_reason = "tool_use" if raw_calls or choice.get("finish_reason") == "tool_calls" else "end_turn"

    usage = data.get("usage") or {}
    return _Response(
        content=blocks,
        stop_reason=stop_reason,
        usage=_Usage(
            input_tokens=usage.get("prompt_tokens") or usage.get("input_tokens") or 0,
            output_tokens=usage.get("completion_tokens") or usage.get("output_tokens") or 0,
        ),
        model=model,
    )


def _endpoint(backend):
    if backend == "grok":
        base = os.environ.get("XAI_API_BASE", "https://api.x.ai/v1").rstrip("/")
        return f"{base}/chat/completions", ai._xai_api_key(), "XAI_API_KEY"
    return "https://api.openai.com/v1/chat/completions", ai._openai_api_key(), "OPENAI_API_KEY"


def complete(backend, messages, system, tools, max_tokens=2000, force_any_tool=False):
    """One assistant turn from an OpenAI-compatible backend, in Anthropic response shape.

    Raises on transport/auth failure so the caller owns re-routing -- the retry policy lives
    in one place (agent._chat_model_call) rather than being duplicated per backend.
    """
    import requests

    if not db.is_api_enabled():
        raise RuntimeError("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    ai._block_paid_cloud_if_offline("this feature requires cloud AI.")
    # role="chat" matches agent.client() -- chat gets the more generous budget threshold.
    ai.check_daily_budget(role="chat")

    endpoint, key, key_name = _endpoint(backend)
    if not key:
        raise RuntimeError(f"{key_name} is not configured.")

    model = model_roles.model_for("chat", backend=backend)
    search_note = NO_WEB_SEARCH_NOTE if tools_include_web_search(tools) else WEB_SEARCH_DISABLED_NOTE
    payload = {
        "model": model,
        "messages": to_openai_messages((system or "") + search_note, messages),
    }
    # "tool_choice is only allowed when tools are specified" -- send neither when the
    # converted list came back empty rather than a 400.
    converted_tools = to_openai_tools(tools)
    if converted_tools:
        payload["tools"] = converted_tools
        payload["tool_choice"] = "required" if force_any_tool else "auto"
    if backend == "grok":
        payload["max_tokens"] = max(800, max_tokens)
    else:
        # gpt-5 spends hidden reasoning tokens out of the SAME budget as the reply, and this
        # loop ships a ~16k-char system prompt. At a 2000 cap, reasoning consumed all 2000 and
        # the API returned finish_reason="length" with content_len=0 -- an empty assistant
        # turn, which is what surfaced to the user as a blank answer. Give reasoning real
        # headroom and hold it to "low": this path picks tools, it does not need deep thought.
        payload["max_completion_tokens"] = max(8000, max_tokens * 4)
        # Forced-tool retries stay "low" so the model picks a tool instead of
        # spending the budget on hidden reasoning. Ordinary turns use "medium"
        # so write lists and lookups actually get thought through.
        payload["reasoning_effort"] = "low" if force_any_tool else "medium"

    response = requests.post(
        endpoint,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=75,
    )
    if response.status_code >= 400:
        # raise_for_status() drops the response body, which is the only part that says WHICH
        # field the provider rejected -- keep it, or a 400 here is undebuggable.
        detail = ""
        try:
            payload_error = response.json().get("error") or {}
            detail = payload_error.get("message") or ""
            if payload_error.get("param"):
                detail = f"{detail} (param: {payload_error['param']})"
        except Exception:
            detail = (response.text or "")[:400]
        raise requests.HTTPError(
            f"{response.status_code} from {backend}: {detail}", response=response
        )
    data = response.json()
    result = from_openai_response(data, f"{backend}:{model}")
    if not result.content:
        # No text and no tool call: the turn produced literally nothing. Returning it would
        # put an empty reply in front of the user, so say what happened instead.
        finish = ((data.get("choices") or [{}])[0]).get("finish_reason")
        usage = data.get("usage") or {}
        reasoning = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
        raise RuntimeError(
            f"{backend} returned an empty turn (finish_reason={finish}, "
            f"reasoning_tokens={reasoning}, cap={payload.get('max_completion_tokens') or payload.get('max_tokens')}). "
            "Raise the token cap or lower reasoning_effort for this role."
        )
    ai.mark_live_source("chat", backend)
    return result
