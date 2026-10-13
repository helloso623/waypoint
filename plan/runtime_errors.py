"""Ring buffer of swallowed exceptions so silent `except Exception` is visible in /api/about."""
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

_ERRORS = deque(maxlen=40)


def note(where, exc):
    text = str(exc)
    print(f"[{where}] {text}")
    entry = {
        "where": where,
        "error": text[:400],
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
    }
    _ERRORS.append(entry)
    try:
        from os import environ
        data = Path(environ.get("WAYPOINT_DATA_DIR") or "." )
        log = data / "runtime_errors.log"
        with log.open("a", encoding="utf-8") as handle:
            handle.write(f"{entry['at']} {where}: {entry['error']}\n")
    except Exception:
        pass


def swallow(where, exc=None):
    """Call from `except Exception as exc` so silent catches still show in /api/about."""
    if exc is None:
        import sys
        exc = sys.exc_info()[1] or "unknown"
    note(where, exc)


def recent():
    return list(_ERRORS)
