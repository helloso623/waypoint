"""Launches the planner as a desktop window instead of a browser tab. Wraps the
exact same Flask app (app.py) in a native window via pywebview -- no rewrite,
just no browser chrome and its own taskbar entry.
"""
import os
import threading
from urllib.parse import quote

import webview

# Windows groups a taskbar button by the process's Application User Model ID. Without one,
# pythonw.exe supplies it, so the taskbar shows the generic Python icon and groups Waypoint
# with any other Python program. Claiming our own ID makes it a real app with its own icon.
if os.name == "nt":
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Waypoint.Planner")
    except Exception as exc:
        print(f"[waypoint] could not set the taskbar app id: {exc}", flush=True)

import app as flask_app
import game_sync
import napkin_sync
import obsidian_watcher
import personal_data
import scheduler

# app.py already knows how to choose the bind address (FLASK_HOST=tailscale,
# WAYPOINT_TAILSCALE=1, or an explicit host), so reuse that instead of pinning
# 127.0.0.1 -- which made the desktop window, the way this app is actually
# launched, unreachable from the phone even with Tailscale configured.
PORT = int(os.environ.get("PORT", "5099"))
HOST = flask_app._resolve_bind_host()


def _window_url():
    """Address the window itself should load."""
    # 0.0.0.0 is a bind wildcard, not something you can navigate to.
    host = "127.0.0.1" if HOST in ("0.0.0.0", "::", "") else HOST
    url = f"http://{host}:{PORT}"
    token = (os.environ.get("APP_ACCESS_TOKEN") or "").strip()
    # The gate exempts loopback always, and tailnet peers when APP_TRUST_TAILSCALE
    # is on; without that the window would land on the sign-in page on its own machine.
    if host != "127.0.0.1" and token and not flask_app._trust_tailscale():
        url += "?token=" + quote(token, safe="")
    return url

# Taskbar/title-bar icon. On Windows, pywebview's `icon=` kwarg is read by
# webview.start() (not create_window()) and only takes effect on the winforms
# backend -- which is what pywebview uses for *all* Windows GUIs (including
# the edgechromium/WebView2 renderer this app runs on: the WebView2 content
# is hosted inside a System.Windows.Forms.Form, and it's that Form's .Icon
# that the OS shows in the taskbar). See
# site-packages/webview/platforms/winforms.py -- BrowserForm reads
# `_state['icon']` and does `self.Icon = Icon(_state['icon'])` when the path
# exists, falling back to the interpreter's own icon otherwise (which is the
# default Python icon this change replaces). The pywebview docstring for
# `icon` claims it's "Supported only on GTK/QT", which is stale/wrong for the
# version installed here (pywebview 6.2.1) -- the winforms.py source is the
# source of truth and clearly wires it up on Windows too.
ICON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "icons", "waypoint.ico")


def _run_flask():
    # threaded=True is required -- without it Flask's dev server handles one
    # request at a time, so any slow call (an email send waiting on a timeout, a
    # Google OAuth connect waiting on your browser) freezes the *entire* app,
    # including tabs/polling that have nothing to do with that action.
    try:
        flask_app.seed_personal_napkin_tasks()
        flask_app.app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
    except OSError as exc:
        # The tailnet address can vanish between resolution and bind (Tailscale
        # reconnecting after sleep). Losing the phone beats refusing to start.
        if HOST == "127.0.0.1":
            raise
        print(f"[waypoint] cannot bind {HOST}:{PORT} ({exc}) -- falling back to 127.0.0.1", flush=True)
        flask_app.app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False, threaded=True)


def main():
    # Move personal content out of the checkout before anything reads it.
    personal_data.migrate_and_log()
    scheduler.start()
    obsidian_watcher.start()
    # Commit anything the previous session pinned but never got to commit (the debounce is
    # a daemon timer, so closing the app inside that window would otherwise lose it), and
    # retry a push that was deferred while offline. Threaded so git never delays startup.
    threading.Thread(target=napkin_sync.startup_sync, daemon=True).start()
    threading.Thread(target=game_sync.startup_sync, daemon=True).start()
    threading.Thread(target=_run_flask, daemon=True).start()
    flask_app._print_listen_hints(HOST, PORT)
    flask_app.serve_tailnet_when_ready(PORT, HOST)
    webview.create_window("Waypoint", _window_url(), width=1280, height=860, min_size=(900, 600))
    webview.start(icon=ICON_PATH if os.path.isfile(ICON_PATH) else None)
    # start() returns when the window closes. Compile accepted napkins + bugs into
    # ISSUES.md and drain the git debounce so a later "work" pass has the queue.
    try:
        napkin_sync.shutdown_compile()
    except Exception as exc:
        print(f"[napkin] shutdown compile failed: {exc}", flush=True)


if __name__ == "__main__":
    main()
