#!/usr/bin/env python3
"""Write LOCAL_MODEL_* into the durable .env so local AI still works after a pull.

Safe to re-run. Does not install Ollama — that is a host app — but it:
  * copies plan/.env.example keys that are missing
  * writes LOCAL_MODEL_URL / OLLAMA_URL / LOCAL_MODEL_NAME
  * probes http://127.0.0.1:11434 and prints the next command if Ollama is down
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

PLAN_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PLAN_DIR.parent
EXAMPLE = PLAN_DIR / ".env.example"
DEFAULT_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "llama3.2:3b"


def data_dir() -> Path:
    raw = (os.environ.get("WAYPOINT_DATA_DIR") or "").strip()
    return Path(raw) if raw else PLAN_DIR


def env_path() -> Path:
    return data_dir() / ".env"


def read_env_map(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, _, value = stripped.partition("=")
            values[key.strip()] = value
    return values


def merge_env(path: Path, updates: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                out.append(f"{key}={updates[key]}")
                seen.add(key)
                continue
        out.append(line)
    for key, value in updates.items():
        if key not in seen:
            out.append(f"{key}={value}")
    path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def seed_from_example(path: Path) -> list[str]:
    if not path.exists() and EXAMPLE.exists():
        path.write_text(EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
        return sorted(read_env_map(EXAMPLE))
    if not EXAMPLE.exists():
        return []
    existing = set(read_env_map(path))
    additions = {
        key: value
        for key, value in read_env_map(EXAMPLE).items()
        if key not in existing
    }
    if additions:
        merge_env(path, additions)
    return sorted(additions)


def probe_ollama(url: str) -> tuple[bool, list[str]]:
    try:
        import requests
        resp = requests.get(f"{url.rstrip('/')}/api/tags", timeout=1.5)
        if not resp.ok:
            return False, []
        names = [m.get("name") for m in (resp.json().get("models") or []) if m.get("name")]
        return True, names
    except Exception:
        return False, []


def main() -> int:
    path = env_path()
    added = seed_from_example(path)
    current = read_env_map(path)
    url = (
        os.environ.get("LOCAL_MODEL_URL")
        or os.environ.get("OLLAMA_URL")
        or current.get("LOCAL_MODEL_URL")
        or current.get("OLLAMA_URL")
        or DEFAULT_URL
    ).rstrip("/")
    model = (
        os.environ.get("LOCAL_MODEL_NAME")
        or current.get("LOCAL_MODEL_NAME")
        or DEFAULT_MODEL
    ).strip()
    merge_env(path, {
        "LOCAL_MODEL_URL": url,
        "OLLAMA_URL": url,
        "LOCAL_MODEL_NAME": model,
        "LOCAL_MODEL_ENABLED": "true",
    })
    reachable, models = probe_ollama(url)
    print(f"env: {path}")
    if added:
        print(f"added example keys: {', '.join(added)}")
    print(f"LOCAL_MODEL_URL={url}")
    print(f"LOCAL_MODEL_NAME={model}")
    if reachable and models:
        print(f"Ollama reachable — {len(models)} model(s): {', '.join(models[:8])}")
        print("Restart Waypoint, then tap the HUD AI chip and choose Local.")
        return 0
    if reachable:
        print("Ollama is running but has no models.")
        print(f"  ollama pull {model}")
        return 1
    print("Ollama is not reachable.")
    print("  1. Install from https://ollama.com and leave the app running")
    print(f"  2. ollama pull {model}")
    print("  3. Restart Waypoint (python desktop.py or python app.py)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
