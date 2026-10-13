"""Discord webhook notifications — never raises; no-op when unconfigured."""
import os

import db


def _webhook_url():
    url = (db.get_settings().get("discord_webhook_url") or "").strip()
    if not url:
        url = (os.environ.get("DISCORD_WEBHOOK_URL") or "").strip()
    return url or None


def is_configured():
    return bool(_webhook_url())


def send_discord(message):
    """Post message to Discord webhook. Returns True on success, False otherwise."""
    url = _webhook_url()
    if not url:
        return False
    try:
        import requests

        resp = requests.post(
            url,
            json={"content": (message or "")[:1900]},
            timeout=5,
        )
        if resp.status_code >= 400:
            print(f"[notify] Discord webhook failed: HTTP {resp.status_code} {resp.text[:200]}")
            return False
        return True
    except Exception as exc:
        print(f"[notify] Discord webhook failed: {exc}")
        return False
