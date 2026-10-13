#!/usr/bin/env python3
"""Start Waypoint on your Tailnet.

Preferred path (HTTPS via Tailscale Serve — Flask stays on localhost):
  python run_tailscale.py

Direct bind on the Tailscale interface / all interfaces:
  python run_tailscale.py --direct

Requires the Tailscale client logged in on this machine (`tailscale status`).
"""
from __future__ import annotations

import argparse
import os
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Waypoint reachable over Tailscale")
    parser.add_argument(
        "--direct",
        action="store_true",
        help="Bind Flask on 0.0.0.0 (or the Tailscale IP) instead of using `tailscale serve`",
    )
    parser.add_argument(
        "--no-serve",
        action="store_true",
        help="Skip `tailscale serve` even in default mode",
    )
    parser.add_argument(
        "--trust",
        action="store_true",
        help="Set APP_TRUST_TAILSCALE=true so Tailnet peers skip APP_ACCESS_TOKEN",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="Override FLASK_HOST (default: 127.0.0.1 with Serve, 0.0.0.0 with --direct)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Override PORT (default from env or 5099)",
    )
    args = parser.parse_args(argv)

    os.chdir(ROOT)
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    port = int(args.port or os.environ.get("PORT", "5099"))
    os.environ["PORT"] = str(port)
    os.environ["WAYPOINT_TAILSCALE"] = "1"

    if args.trust:
        os.environ["APP_TRUST_TAILSCALE"] = "true"

    import tailscale_net

    if not tailscale_net.tailscale_cli():
        print(
            "[waypoint] Tailscale CLI not found. Install Tailscale, log in, then retry.\n"
            "  https://tailscale.com/download",
            file=sys.stderr,
        )
        return 1

    ip = None
    dns = None
    import time
    for _attempt in range(8):
        ip = tailscale_net.tailscale_ipv4()
        dns = tailscale_net.tailscale_dns_name()
        if ip or dns:
            break
        time.sleep(0.4)
    if not ip and not dns:
        print(
            "[waypoint] Tailscale is installed but no Tailnet IP/DNS was found.\n"
            "  Run `tailscale up` / `tailscale status` and try again.",
            file=sys.stderr,
        )
        return 1

    use_serve = not args.direct and not args.no_serve
    if use_serve:
        os.environ["FLASK_HOST"] = args.host or "127.0.0.1"
        os.environ["WAYPOINT_TAILSCALE_SERVE"] = "1"
        ok, message = tailscale_net.enable_serve(port)
        print(f"[waypoint] {message}", flush=True)
        if not ok:
            print("[waypoint] falling back to Tailscale IP bind (not 0.0.0.0)", flush=True)
            use_serve = False

    if not use_serve:
        os.environ["FLASK_HOST"] = args.host or ip or "127.0.0.1"
        os.environ.pop("WAYPOINT_TAILSCALE_SERVE", None)
        os.environ.setdefault("APP_TRUST_TAILSCALE", "true")
        for url in tailscale_net.public_urls(port):
            print(f"[waypoint] open on another device: {url}", flush=True)

    if use_serve:
        for url in tailscale_net.serve_https_urls():
            print(f"[waypoint] open on another device: {url}", flush=True)

    if not os.environ.get("APP_ACCESS_TOKEN") and not tailscale_net.trust_tailscale_enabled():
        print(
            "[waypoint] note: no APP_ACCESS_TOKEN and APP_TRUST_TAILSCALE is off.\n"
            "  With Serve, peers usually hit localhost via the proxy (token skipped if APP_TRUST_LOCALHOST).\n"
            "  For --direct access, pass --trust or set APP_ACCESS_TOKEN.",
            flush=True,
        )

    runpy.run_path(str(ROOT / "app.py"), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
