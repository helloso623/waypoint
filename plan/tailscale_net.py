"""Tailscale helpers for binding and trust checks.

Used by app.py (auth bypass for Tailnet peers) and run_tailscale.py (launch).
"""
from __future__ import annotations

import ipaddress
import json
import os
import shutil
import subprocess
from typing import Optional

import proc_util


TAILSCALE_V4 = ipaddress.ip_network("100.64.0.0/10")
TAILSCALE_V6 = ipaddress.ip_network("fd7a:115c:a1e0::/48")


def _truthy(value: Optional[str], default: str = "false") -> bool:
    return str(value if value is not None else default).strip().lower() in ("1", "true", "yes", "on")


def trust_tailscale_enabled() -> bool:
    return _truthy(os.environ.get("APP_TRUST_TAILSCALE"), "false")


def is_tailscale_addr(addr: Optional[str]) -> bool:
    if not addr:
        return False
    text = str(addr).strip()
    if text.startswith("::ffff:"):
        text = text.split("::ffff:", 1)[1]
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return False
    if ip.version == 4:
        return ip in TAILSCALE_V4
    return ip in TAILSCALE_V6


def tailscale_cli() -> Optional[str]:
    return shutil.which("tailscale") or shutil.which("tailscale.exe")


def _run_ts(*args: str, timeout: float = 4.0) -> subprocess.CompletedProcess:
    cli = tailscale_cli()
    if not cli:
        raise FileNotFoundError("tailscale CLI not found on PATH")
    return proc_util.run(
        [cli, *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def tailscale_ipv4() -> Optional[str]:
    try:
        proc = _run_ts("ip", "-4")
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        return None
    for line in (proc.stdout or "").splitlines():
        candidate = line.strip()
        if candidate and is_tailscale_addr(candidate):
            return candidate
    return None


def tailscale_status() -> dict:
    try:
        proc = _run_ts("status", "--json", timeout=6.0)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return {}
    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return {}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def tailscale_dns_name() -> Optional[str]:
    status = tailscale_status()
    self_node = status.get("Self") or {}
    dns = (self_node.get("DNSName") or "").rstrip(".")
    return dns or None


def public_urls(port: int) -> list[str]:
    """URLs other Tailnet devices can use (direct IP / MagicDNS)."""
    urls: list[str] = []
    dns = tailscale_dns_name()
    if dns:
        urls.append(f"http://{dns}:{port}")
    ip = tailscale_ipv4()
    if ip:
        urls.append(f"http://{ip}:{port}")
    return urls


def serve_https_urls() -> list[str]:
    """URLs from `tailscale serve` HTTPS (no port)."""
    dns = tailscale_dns_name()
    if not dns:
        return []
    return [f"https://{dns}"]


def enable_serve(port: int) -> tuple[bool, str]:
    """Point Tailscale Serve at the local Flask port. Returns (ok, message)."""
    try:
        proc = _run_ts("serve", "--bg", f"http://127.0.0.1:{port}", timeout=12.0)
    except FileNotFoundError:
        return False, "tailscale CLI not found — install Tailscale and ensure `tailscale` is on PATH"
    except (subprocess.TimeoutExpired, OSError) as exc:
        return False, f"tailscale serve failed: {exc}"
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "unknown error").strip()
        return False, f"tailscale serve failed: {detail}"
    urls = serve_https_urls()
    if urls:
        return True, f"Tailscale Serve ready: {urls[0]}"
    return True, f"Tailscale Serve enabled for http://127.0.0.1:{port}"
