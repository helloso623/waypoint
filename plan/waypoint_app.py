"""Entry point for the installed (packaged) Waypoint.

desktop.py is how you run it from the git checkout. This wraps it for the PyInstaller build
handed to people who do not code, and fixes the things that only hold on your machine:

- Data goes to %LOCALAPPDATA%\\Waypoint. Several modules fall back to writing next to their own
  .py file when WAYPOINT_DATA_DIR is unset, and inside Program Files that folder is read-only,
  so the first save would crash.
- Git auto-commit and push are off. There is no repo in an install, and a friend's notes have
  no business going anywhere near your GitHub.
- The server binds to 127.0.0.1 only, so nothing is reachable from the network.
- stdout/stderr go to a log file. A windowed build has no console, so prints would vanish and
  a startup crash would be invisible; the log is what they send you when it breaks.

Every value uses setdefault, so an explicit environment variable still wins for testing.
"""
import os
import sys


def _prepare_environment():
    if not getattr(sys, "frozen", False):
        return
    root = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Waypoint")
    os.makedirs(root, exist_ok=True)
    os.environ.setdefault("WAYPOINT_DATA_DIR", root)
    os.environ.setdefault("NAPKIN_AUTO_COMMIT", "false")
    os.environ.setdefault("NAPKIN_AUTO_PUSH", "false")
    os.environ.setdefault("FLASK_HOST", "127.0.0.1")
    os.environ.setdefault("WAYPOINT_TAILSCALE", "0")
    log_path = os.path.join(os.environ["WAYPOINT_DATA_DIR"], "waypoint.log")
    try:
        # Line-buffered, so the log is complete up to the moment of a crash.
        log = open(log_path, "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log
    except OSError:
        pass


def _main():
    _prepare_environment()
    # Imported only after the environment is set: desktop.py and app.py read
    # WAYPOINT_DATA_DIR, the bind host and the git flags at import time.
    import desktop
    desktop.main()


if __name__ == "__main__":
    try:
        _main()
    except Exception:
        import traceback
        traceback.print_exc()
        raise
