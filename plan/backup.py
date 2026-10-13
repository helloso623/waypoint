"""Safety net for AI-proposed changes: a full project snapshot before every applied
command or file edit. Backups are never auto-deleted -- they accumulate in backups/
until you clean them up yourself once you're confident a change is final.
"""
import shutil
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
BACKUPS_DIR = PROJECT_ROOT / "backups"

_IGNORE = shutil.ignore_patterns("backups", "__pycache__", "*.pyc", ".git")


def create_backup(reason=""):
    """Snapshot the whole project (minus backups/__pycache__/.git) before a
    modification is applied. Returns the backup folder path.
    """
    BACKUPS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    label = f"{timestamp}_{reason}" if reason else timestamp
    label = "".join(c for c in label if c.isalnum() or c in "-_").strip()[:100]
    dest = BACKUPS_DIR / label
    shutil.copytree(PROJECT_ROOT, dest, ignore=_IGNORE)
    return str(dest)


def is_path_inside_project(path_str):
    """True only if path_str resolves to somewhere inside the project directory --
    the enforcement for "the agent can only modify itself, nothing more".
    """
    try:
        target = (PROJECT_ROOT / path_str).resolve()
    except (OSError, ValueError):
        return False, None
    try:
        target.relative_to(PROJECT_ROOT)
    except ValueError:
        return False, None
    return True, target
