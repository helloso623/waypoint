"""Commit a single generated file into the repo, safely.

Extracted so more than one syncer can share it (napkin_sync was the first; game_sync is the
second). The rules that matter, and why:

  * path-limited add AND commit -- an unrelated dirty file must never ride along in a commit
    the user did not ask for;
  * never --force, and never auto-rebase -- a rejected push leaves the commit local for the
    next attempt rather than risking the user's history;
  * refuse to commit while a merge/rebase is in flight, because committing into one of those
    is how you strand a working tree.
"""
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import proc_util

AUTO_COMMIT = (os.environ.get("NAPKIN_AUTO_COMMIT", "true").strip().lower()
               not in ("0", "false", "no", "off"))
AUTO_PUSH = (os.environ.get("NAPKIN_AUTO_PUSH", "true").strip().lower()
             not in ("0", "false", "no", "off"))
# "live" commits shortly after each change; "exit" only on shutdown/next startup.
COMMIT_MODE = os.environ.get("NAPKIN_COMMIT_MODE", "live").strip().lower()


def git(repo_dir, *args, check=False):
    """Run a git command in repo_dir. Returns (ok, combined output)."""
    try:
        proc = proc_util.run(
            ["git", *args], cwd=str(repo_dir), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=120,
        )
    except Exception as exc:
        return False, str(exc)
    output = f"{proc.stdout or ''}{proc.stderr or ''}".strip()
    if check and proc.returncode != 0:
        return False, output
    return proc.returncode == 0, output


def mid_operation(repo_dir):
    git_dir = Path(repo_dir) / ".git"
    return any((git_dir / m).exists() for m in
               ("MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"))


def has_uncommitted(repo_dir, file_path):
    """True when file_path on disk differs from what git has recorded."""
    repo_dir, file_path = Path(repo_dir), Path(file_path)
    if not (repo_dir / ".git").exists() or not file_path.exists():
        return False
    rel = file_path.relative_to(repo_dir).as_posix()
    tracked, _ = git(repo_dir, "ls-files", "--error-unmatch", rel)
    if not tracked:
        return True
    unchanged, _ = git(repo_dir, "diff", "--quiet", "HEAD", "--", rel)
    return not unchanged


def has_unpushed(repo_dir):
    ok, out = git(repo_dir, "rev-list", "--count", "@{upstream}..HEAD")
    if not ok:
        return False
    try:
        return int((out or "0").strip()) > 0
    except ValueError:
        return False


def commit_file(repo_dir, file_path, message_prefix, push=None):
    """Commit exactly file_path and (optionally) push. Returns a {ok, reason} dict."""
    repo_dir, file_path = Path(repo_dir), Path(file_path)
    if not (repo_dir / ".git").exists():
        return {"ok": False, "reason": "not a git repository"}
    if mid_operation(repo_dir):
        return {"ok": False, "reason": "git operation in progress"}

    rel = file_path.relative_to(repo_dir).as_posix()
    unchanged, _ = git(repo_dir, "diff", "--quiet", "HEAD", "--", rel)
    tracked, _ = git(repo_dir, "ls-files", "--error-unmatch", rel)
    if unchanged and tracked:
        return {"ok": True, "reason": "no change"}

    added, out = git(repo_dir, "add", "--", rel, check=True)
    if not added:
        return {"ok": False, "reason": f"git add failed: {out}"}

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    committed, out = git(repo_dir, "commit", "-m", f"{message_prefix} ({stamp})", "--", rel)
    if not committed:
        if "nothing to commit" in (out or "").lower():
            return {"ok": True, "reason": "no change"}
        return {"ok": False, "reason": f"git commit failed: {out}"}

    if push is None:
        push = AUTO_PUSH
    if not push:
        return {"ok": True, "reason": "committed (push disabled)"}

    _, branch = git(repo_dir, "rev-parse", "--abbrev-ref", "HEAD")
    branch = (branch or "main").strip()
    pushed, out = git(repo_dir, "push", "origin", branch)
    if not pushed:
        print(f"[repo_commit] committed locally but push failed, will retry later: {out}")
        return {"ok": True, "reason": "committed; push deferred", "push_error": out}
    return {"ok": True, "reason": "committed and pushed", "branch": branch}
