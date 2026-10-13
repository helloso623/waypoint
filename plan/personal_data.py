"""Keep personal content out of the git checkout.

The repo is shareable; a journal is not. Daily notes, goals and the planning spreadsheet were
tracked in git, so handing someone the repo handed them those too. They belong next to the
database in WAYPOINT_DATA_DIR, which is already the home for everything durable and private
(planner.db, .env, attachments, napkin and game state).

migrate() runs at startup and is idempotent, so this fixes an existing checkout automatically
rather than needing a manual move. It never overwrites: if a copy already exists in the data
dir, the repo copy is left alone and reported, so nothing can be silently clobbered.
"""
import os
import shutil
from pathlib import Path

_PLAN_DIR = Path(__file__).parent

# Paths that hold the user's own content rather than app code. Relative to plan/.
PERSONAL_PATHS = ("obsidian_vault", "MASTER_planning_v3.xlsx")


def data_dir():
    value = os.environ.get("WAYPOINT_DATA_DIR")
    return Path(value) if value else _PLAN_DIR


def target_for(name):
    return data_dir() / name


def vault_path():
    """Where the Obsidian vault lives. Explicit setting wins, else the data dir."""
    configured = (os.environ.get("OBSIDIAN_VAULT_PATH") or "").strip()
    if configured:
        return Path(configured)
    return target_for("obsidian_vault")


def migrate():
    """Move personal content out of the checkout into the data dir. Returns a report list."""
    moved = []
    if data_dir().resolve() == _PLAN_DIR.resolve():
        # No separate data dir configured; moving would achieve nothing.
        return moved

    for name in PERSONAL_PATHS:
        source = _PLAN_DIR / name
        target = target_for(name)
        if not source.exists():
            continue
        if target.exists():
            # Never overwrite the live copy with a stale checked-out one.
            moved.append(f"{name}: already in the data dir, left the repo copy in place")
            continue
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
            moved.append(f"{name}: moved out of the repo into {target.parent}")
        except Exception as exc:
            moved.append(f"{name}: could not move ({exc})")
    return moved


def migrate_and_log():
    for line in migrate():
        print(f"[personal_data] {line}", flush=True)
