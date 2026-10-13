"""Run child processes without flashing a console window.

The app is launched with pythonw.exe, which deliberately has no console of its own. On Windows
that means every child process the app starts -- git, tailscale, pip, node -- gets a brand new
console window instead, which pops to the front and steals focus. With git running on every
napkin and game-state sync, and tailscale queried at startup, that is a window appearing
repeatedly while you are trying to use the computer.

CREATE_NO_WINDOW fixes it at the source. Use these wrappers for the app's own housekeeping
processes. Deliberately NOT used for user-initiated launches (running a project, opening VS
Code): there a visible window is the point.
"""
import os
import subprocess

# 0x08000000. Only defined on Windows, so look it up defensively.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if os.name == "nt" else 0


def hidden_kwargs(kwargs=None):
    """Add the no-console flag on Windows, leaving other platforms untouched."""
    out = dict(kwargs or {})
    if os.name == "nt":
        out["creationflags"] = out.get("creationflags", 0) | _NO_WINDOW
    return out


def run(*args, **kwargs):
    """subprocess.run that never opens a console window."""
    return subprocess.run(*args, **hidden_kwargs(kwargs))


def popen(*args, **kwargs):
    """subprocess.Popen that never opens a console window."""
    return subprocess.Popen(*args, **hidden_kwargs(kwargs))
