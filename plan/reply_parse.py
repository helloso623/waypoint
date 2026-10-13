"""Auto-parsers for model replies: local thinking blocks and follow-up suggestions."""
from __future__ import annotations

import json
import re


_THINK_TAG_RE = re.compile(
    r"<think(?:ing)?>(.*?)</think(?:ing)?>",
    re.IGNORECASE | re.DOTALL,
)
_THOUGHTS_HEADER_RE = re.compile(
    r"(?is)^\s*(?:thoughts?|reasoning)\s*:\s*(.+?)(?:\n\s*\n|\Z)",
)
_FOLLOWUPS_BRACKET_RE = re.compile(
    r"\[followups?\s*:\s*([^\]]+)\]\s*$",
    re.IGNORECASE,
)
_FOLLOWUPS_JSON_RE = re.compile(
    r"\n?\s*(\{\s*\"followups?\"\s*:\s*\[.*?\]\s*\})\s*$",
    re.IGNORECASE | re.DOTALL,
)


def parse_local_thinking(text: str) -> tuple[str, str]:
    """Split local-model output into (thinking, answer).

    Supports <think>...</think>, <thinking>...</thinking>, and a leading
    `Thoughts:` / `Reasoning:` section ended by a blank line.
    """
    raw = text or ""
    thinking_parts: list[str] = []

    def _collect(match: re.Match) -> str:
        bit = (match.group(1) or "").strip()
        if bit:
            thinking_parts.append(bit)
        return ""

    cleaned = _THINK_TAG_RE.sub(_collect, raw).strip()
    if not thinking_parts:
        header = _THOUGHTS_HEADER_RE.match(cleaned)
        if header:
            thinking_parts.append(header.group(1).strip())
            cleaned = cleaned[header.end() :].strip()
    return ("\n\n".join(thinking_parts).strip(), cleaned)


def parse_followups(text: str) -> tuple[str, list[str]]:
    """Strip a follow-ups trailer and return (clean_reply, followups).

    Formats:
      [followups: Ask A | Ask B | Ask C]
      {"followups": ["Ask A", "Ask B"]}
    """
    raw = (text or "").rstrip()
    if not raw:
        return "", []

    followups: list[str] = []

    m = _FOLLOWUPS_BRACKET_RE.search(raw)
    if m:
        raw = raw[: m.start()].rstrip()
        followups = [p.strip() for p in m.group(1).split("|") if p.strip()]
    else:
        jm = _FOLLOWUPS_JSON_RE.search(raw)
        if jm:
            try:
                data = json.loads(jm.group(1))
                items = data.get("followups") or data.get("followup") or []
                if isinstance(items, list):
                    followups = [str(x).strip() for x in items if str(x).strip()]
                    raw = raw[: jm.start()].rstrip()
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    # Cap to 3 short suggestions
    cleaned = []
    for item in followups[:3]:
        cleaned.append(item[:140])
    return raw, cleaned


def finalize_reply(text: str, *, parse_thinking: bool = False) -> dict:
    """Run thinking + followups parsers. Returns reply/thinking/followups."""
    thinking = ""
    body = text or ""
    if parse_thinking:
        thinking, body = parse_local_thinking(body)
    body, followups = parse_followups(body)
    return {"reply": body, "thinking": thinking, "followups": followups}
