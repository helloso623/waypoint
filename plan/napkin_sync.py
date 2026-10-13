"""Persist Napkin quick-capture entries to a git-tracked file.

Napkin is a browser-only feature: entries live in localStorage under "waypointNapkin" and
never reach the server, so nothing about them is durable, shareable between the laptop and
the phone, or readable by an agent doing a later improvement pass. This module gives them a
server side.

Two files, on purpose:

  WAYPOINT_DATA_DIR/napkin_state.json  authoritative state (durable, not in the repo)
    <repo>/plan/NAPKIN.md                rendered backlog, committed to git
    <repo>/plan/ISSUES.md                accepted notes + agent bugs (work queue)

State is merged rather than overwritten. Both devices post their whole local list, so a plain
overwrite would mean whichever synced last silently deleted the other's entries. Deletions
travel as explicit tombstones instead, which is the only way a union-merge can still honour
"crumple this note".
"""
import json
import os
import re
import subprocess

import proc_util
import threading
from datetime import datetime, timezone
from pathlib import Path

_PLAN_DIR = Path(__file__).parent
_REPO_DIR = _PLAN_DIR.parent
_DATA_DIR = Path(os.environ["WAYPOINT_DATA_DIR"]) if os.environ.get("WAYPOINT_DATA_DIR") else _PLAN_DIR

STATE_FILE = _DATA_DIR / "napkin_state.json"
MARKDOWN_FILE = _PLAN_DIR / "NAPKIN.md"
ISSUES_FILE = _PLAN_DIR / "ISSUES.md"

# Rapid edits (typing several notes in a row) must not become several commits.
COMMIT_DEBOUNCE_SECONDS = float(os.environ.get("NAPKIN_COMMIT_DEBOUNCE", "90"))
AUTO_COMMIT = (os.environ.get("NAPKIN_AUTO_COMMIT", "true").strip().lower()
               not in ("0", "false", "no", "off"))
AUTO_PUSH = (os.environ.get("NAPKIN_AUTO_PUSH", "false").strip().lower()
             not in ("0", "false", "no", "off"))
# "live"  -- commit shortly after each change (debounced).
# "exit"  -- never commit while the app is running: pin as many notes as you like and they are
#            committed once, on shutdown, or on the next startup if the app was killed instead
#            of closed. Notes are always written to disk immediately either way; this only
#            controls when git is touched.
COMMIT_MODE = os.environ.get("NAPKIN_COMMIT_MODE", "live").strip().lower()

_lock = threading.RLock()
_timer = None


def _read_state():
    try:
        blob = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if isinstance(blob, dict):
            return {
                "entries": blob.get("entries") or [],
                "deleted": blob.get("deleted") or [],
            }
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"[napkin] unreadable state file, starting fresh: {exc}")
    return {"entries": [], "deleted": []}


def _write_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")


def _entry_sort_key(entry):
    return str(entry.get("createdAt") or "")


def _title_from_details(details):
    first = (details or "").strip().splitlines()[0].strip() if details else ""
    return first[:140]


def _coerce_entry(entry, previous=None):
    """Keep extra fields (accepted, acceptedAt) across device merges.

    An empty title becomes the first line of details so untitled pins still have a heading.
    Incoming payloads that omit `accepted` do not un-accept a note the other device already accepted.
    """
    previous = previous if isinstance(previous, dict) else {}
    incoming = entry if isinstance(entry, dict) else {}
    combined = {**previous, **{k: v for k, v in incoming.items() if v is not None}}
    title = str(incoming.get("title") or previous.get("title") or "").strip()
    if incoming.get("details") is None:
        details = str(previous.get("details") or "").strip()
    else:
        details = str(incoming.get("details") or "").strip()
    if not title:
        title = _title_from_details(details)
    out = {
        "id": str(combined.get("id") or "").strip(),
        "title": title,
        "details": details,
        "createdAt": combined.get("createdAt") or previous.get("createdAt") or "",
        # Private notes stay in the local state file and are kept out of NAPKIN.md, which is
        # committed and therefore shareable.
        "private": bool(combined.get("private")),
        # Marked as a to-do rather than a note. This is what promotes an entry into Tasks;
        # `private` used to stand in for it, which swept plain notes -- including long
        # free-form brain dumps -- into the task list. Kept separate from `private`: a note
        # can be personal without being a task, and a task need not be personal.
        "task": bool(combined.get("task") or combined.get("isTask")),
    }
    accepted_in = incoming.get("accepted")
    if accepted_in is False:
        return out
    if accepted_in or previous.get("accepted"):
        out["accepted"] = True
        out["acceptedAt"] = (
            incoming.get("acceptedAt")
            or previous.get("acceptedAt")
            or datetime.now(timezone.utc).isoformat()
        )
    return out


def merge(incoming, deleted_ids=()):
    """Union incoming entries into stored state; tombstoned ids stay gone.

    Returns the merged, newest-first entry list.
    """
    state = _read_state()
    tombstones = set(state["deleted"]) | {str(i) for i in (deleted_ids or []) if i}

    by_id = {}
    for entry in list(state["entries"]) + list(incoming or []):
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        if not entry_id or entry_id in tombstones:
            continue
        by_id[entry_id] = _coerce_entry({**entry, "id": entry_id}, by_id.get(entry_id))

    entries = sorted(by_id.values(), key=_entry_sort_key, reverse=True)
    _write_state({"entries": entries, "deleted": sorted(tombstones)})
    return entries


def accept_entries(incoming, deleted_ids=()):
    """Mark the given notes accepted, merge, rewrite markdown, and return the list."""
    now = datetime.now(timezone.utc).isoformat()
    stamped = []
    for entry in incoming or []:
        if not isinstance(entry, dict):
            continue
        stamped.append({**entry, "accepted": True, "acceptedAt": entry.get("acceptedAt") or now})
    return sync(stamped, deleted_ids)


def _heading_count(text):
    """Count napkin entries in a rendered markdown file (each note is a ## heading)."""
    return sum(1 for line in (text or "").splitlines() if line.startswith("## "))


def _committed_markdown():
    """HEAD version of the git-tracked napkin, or '' if this file is not in the repo."""
    rel = _repo_rel(MARKDOWN_FILE)
    if not rel:
        return ""
    ok, text = _git("show", f"HEAD:{rel}")
    return text if ok else ""


def would_clobber_committed_napkin(rendered):
    """True when committing *rendered* would wipe a real backlog (harness / temp-data-dir bug).

    Crumpling a handful of notes is fine. Replacing dozens of entries with a one-line fixture
    is how PR #34 deleted the live napkin. Refuse that class of write.
    """
    if _repo_rel(MARKDOWN_FILE) is None:
        return False
    if _temp_data_dir_must_not_touch_repo():
        return True
    old_n = _heading_count(_committed_markdown())
    new_n = _heading_count(rendered)
    if old_n >= 3 and new_n == 0:
        return True
    if old_n >= 8 and new_n <= 2:
        return True
    if old_n >= 10 and new_n < old_n * 0.25:
        return True
    if old_n >= 20 and new_n < old_n * 0.5:
        return True
    return False


def _temp_data_dir_must_not_touch_repo():
    """Tests/harness with a temp WAYPOINT_DATA_DIR must never write the git-tracked napkin."""
    if _repo_rel(MARKDOWN_FILE) is None:
        return False
    try:
        state_parent = STATE_FILE.resolve().parent
        repo_napkin = (_PLAN_DIR / "NAPKIN.md").resolve()
        if MARKDOWN_FILE.resolve() != repo_napkin:
            return False
        env_data = os.environ.get("WAYPOINT_DATA_DIR", "").strip()
        if not env_data:
            return False
        env_path = Path(env_data).resolve()
        # Real app data dirs are named WaypointData (or the plan dir itself).
        if env_path == _PLAN_DIR.resolve():
            return False
        if "waypointdata" in env_path.name.lower() or "waypoint_data" in env_path.name.lower():
            return False
        return True
    except (OSError, ValueError):
        return True


def _strip_stamp(text):
    """Markdown minus its 'last synced' line, so timestamps alone never count as a change."""
    return "\n".join(l for l in (text or "").splitlines() if not l.startswith("_0 open")
                      and " open · last synced " not in l)


def _content_changed(rendered):
    try:
        current = MARKDOWN_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return True
    return _strip_stamp(current) != _strip_stamp(rendered)


# NAPKIN.md and ISSUES.md are committed, and the repo is public. Private notes are already left
# out of them, but an ordinary note can still quote something identifying -- one already quoted
# this machine's tailnet IP from a log line. Masking at render time, rather than editing the
# notes, covers every future note too, and the local state file keeps the original text.
_REDACTIONS = (
    # Tailscale's CGNAT range, 100.64.0.0/10.
    (re.compile(r"\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b"), "<tailnet-ip>"),
    (re.compile(r"\b[\w-]+\.tail[0-9a-f]+\.ts\.net\b", re.I), "<tailnet-host>"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "<email>"),
    (re.compile(r"\b([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s]+", re.I), r"\1<user>"),
    (re.compile(r"\b(sk-ant-|sk-proj-|sk-|xai-)[A-Za-z0-9_-]{16,}"), r"\1<redacted>"),
    # University course codes ("MATH-UA 101"): with a school name elsewhere they identify
    # exactly which classes you take.
    (re.compile(r"\b[A-Z]{2,6}-(?:UA|UG|GA|UY|SHU|AD)\s?\d{2,4}\b"), "<course>"),
)


def redact_public(text):
    """Mask identifying details in text bound for a committed (public) file."""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def render_markdown(entries):
    # NAPKIN.md goes to git, so private notes are excluded. They stay in
    # napkin_state.json and are rendered to NAPKIN_PRIVATE.md in the data dir.
    entries = [e for e in entries if not e.get("private")]
    lines = [
        "# Napkin",
        "",
        "Quick-capture notes from the Waypoint app -- the running list of things to improve.",
        "Written automatically by `napkin_sync.py`; edit in the app's Napkin airlock, not here.",
        "",
        f"_{len(entries)} open · last synced {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
    ]
    if not entries:
        lines += ["_Nothing pinned right now._", ""]
        return redact_public("\n".join(lines))

    for entry in entries:
        title = entry.get("title") or "(untitled)"
        lines.append(f"## {title}")
        created = (entry.get("createdAt") or "")[:16].replace("T", " ")
        bits = []
        if created:
            bits.append(f"pinned {created} UTC")
        if entry.get("accepted"):
            accepted = (entry.get("acceptedAt") or "")[:16].replace("T", " ")
            bits.append(f"accepted {accepted} UTC" if accepted else "accepted")
        bits.append(f"`{entry.get('id')}`")
        lines.append(f"_{' · '.join(bits)}_")
        details = (entry.get("details") or "").strip()
        if details:
            lines += ["", details]
        lines.append("")
    return redact_public("\n".join(lines))


def _git(*args, check=False):
    """Run a git command in the repo. Returns (ok, output)."""
    try:
        proc = proc_util.run(
            ["git", *args],
            cwd=str(_REPO_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
    except Exception as exc:
        return False, str(exc)
    output = f"{proc.stdout or ''}{proc.stderr or ''}".strip()
    if check and proc.returncode != 0:
        return False, output
    return proc.returncode == 0, output


def _mid_operation():
    """True while a merge/rebase/cherry-pick is in flight -- never commit into one of those."""
    git_dir = _REPO_DIR / ".git"
    return any((git_dir / marker).exists() for marker in
               ("MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"))


def _repo_rel(path):
    """Return the posix path relative to the repo, or None if it lives elsewhere."""
    try:
        return path.resolve().relative_to(_REPO_DIR.resolve()).as_posix()
    except (ValueError, OSError):
        return None


def _files_to_commit():
    """NAPKIN.md plus ISSUES.md when that file exists inside this repo."""
    files = []
    for path in (MARKDOWN_FILE, ISSUES_FILE):
        rel = _repo_rel(path)
        if rel and path.exists():
            files.append((path, rel))
    return files


def compile_work_queue(entries=None):
    """Write ISSUES.md from accepted napkins and agent bugs so a later 'work' pass can run.

    Disk write is unconditional. Git is left to commit_and_push / shutdown_compile.
    """
    if entries is None:
        entries = _read_state().get("entries") or []
    # ISSUES.md is committed too, so private notes are excluded here exactly as they are from
    # NAPKIN.md. Without this the personal to-dos leak straight back in on the next compile.
    entries = [e for e in entries if isinstance(e, dict) and not e.get("private")]
    accepted = [e for e in entries if isinstance(e, dict) and e.get("accepted")]
    remaining = [e for e in entries if isinstance(e, dict) and not e.get("accepted")]
    bugs = []
    try:
        import db as planner_db
        for status in ("pending", "accepted"):
            try:
                bugs.extend(planner_db.list_agent_bugs(status=status) or [])
            except Exception as exc:
                print(f"[napkin] could not list {status} bugs: {exc}")
    except Exception as exc:
        print(f"[napkin] agent bugs unavailable while compiling ISSUES.md: {exc}")

    lines = [
        "# Work queue",
        "",
        "Compiled automatically when Waypoint quits (and when you Accept a napkin note).",
        "When the user says **work**, implement these items. Do not hand-edit `NAPKIN.md`",
        "to crumple notes — say what is done and let the user crumple them in the app.",
        "",
        f"_last compiled {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · "
        f"{len(entries)} napkin note(s) · {len(accepted)} accepted · {len(bugs)} agent bug(s)_",
        "",
    ]
    if accepted:
        lines += ["## Accepted napkins", ""]
        for entry in accepted:
            title = entry.get("title") or "(untitled)"
            lines.append(f"### {title}")
            meta = [f"`{entry.get('id')}`"]
            if entry.get("acceptedAt"):
                meta.append(f"accepted {(entry.get('acceptedAt') or '')[:16].replace('T', ' ')} UTC")
            lines.append(f"_{' · '.join(meta)}_")
            details = (entry.get("details") or "").strip()
            if details:
                lines += ["", details]
            lines.append("")
    else:
        lines += ["## Accepted napkins", "", "_Nothing accepted yet. Use Accept on a napkin note._", ""]

    if remaining:
        lines += ["## Open napkin", ""]
        for entry in remaining:
            title = entry.get("title") or "(untitled)"
            lines.append(f"### {title}")
            created = (entry.get("createdAt") or "")[:16].replace("T", " ")
            lines.append(f"_`{entry.get('id')}`" + (f" · pinned {created} UTC_" if created else "_"))
            details = (entry.get("details") or "").strip()
            if details:
                lines += ["", details]
            lines.append("")
    else:
        lines += ["## Open napkin", "", "_No other open notes._", ""]

    if bugs:
        lines += ["## Agent bugs", ""]
        for bug in bugs:
            title = (bug.get("title") or "Untitled").strip()
            lines.append(f"### {title}")
            status = bug.get("status") or "pending"
            lines.append(f"_bug `{bug.get('id')}` · {status}_")
            details = (bug.get("details") or "").strip()
            if details:
                lines += ["", details]
            lines.append("")
    else:
        lines += ["## Agent bugs", "", "_No pending or accepted agent bugs._", ""]

    rendered = redact_public("\n".join(lines))
    ISSUES_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        current = ISSUES_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        current = None
    if current != rendered:
        ISSUES_FILE.write_text(rendered, encoding="utf-8")
    return {
        "ok": True,
        "accepted": len(accepted),
        "open": len(remaining),
        "all": len(entries),
        "bugs": len(bugs),
        "path": str(ISSUES_FILE),
    }


def commit_and_push():
    """Commit NAPKIN.md and ISSUES.md (when present) and push them. Never force."""
    # Every commit path funnels through here: the debounce, flush_now on shutdown, the exit
    # hook and startup_sync. Only the debounce used to check AUTO_COMMIT, so switching it off
    # still let the other three commit -- the test suite was committing to the real repo on
    # exit. With a public repo, "off" has to mean off everywhere.
    if not AUTO_COMMIT:
        return {"ok": True, "reason": "no change"}
    if not (_REPO_DIR / ".git").exists():
        return {"ok": False, "reason": "not a git repository"}
    if _mid_operation():
        print("[napkin] merge/rebase in progress -- leaving napkin files uncommitted for now")
        return {"ok": False, "reason": "git operation in progress"}

    tracked = _files_to_commit()
    if not tracked:
        return {"ok": True, "reason": "no change"}

    try:
        rendered_now = MARKDOWN_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        rendered_now = ""
    if would_clobber_committed_napkin(rendered_now):
        print("[napkin] refusing commit: rendered NAPKIN.md would wipe committed entries")
        return {"ok": False, "reason": "refusing lossy napkin commit (would clobber committed entries)"}

    rels = [rel for _, rel in tracked]
    pending = []
    for _path, rel in tracked:
        unchanged, _ = _git("diff", "--quiet", "HEAD", "--", rel)
        untracked_ok, _ = _git("ls-files", "--error-unmatch", rel)
        if not (unchanged and untracked_ok):
            pending.append(rel)
    if not pending:
        return {"ok": True, "reason": "no change"}

    added, out = _git("add", "--", *rels, check=True)
    if not added:
        return {"ok": False, "reason": f"git add failed: {out}"}

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    committed, out = _git("commit", "-m", f"napkin: sync ({stamp})", "--", *rels)
    if not committed:
        if "nothing to commit" in (out or "").lower():
            return {"ok": True, "reason": "no change"}
        return {"ok": False, "reason": f"git commit failed: {out}"}

    if not AUTO_PUSH:
        return {"ok": True, "reason": "committed (push disabled)"}

    ok_branch, branch = _git("rev-parse", "--abbrev-ref", "HEAD")
    branch = (branch or "main").strip()
    pushed, out = _git("push", "origin", branch)
    if not pushed:
        print(f"[napkin] committed locally but push failed (will retry next sync): {out}")
        return {"ok": True, "reason": "committed; push deferred", "push_error": out}
    return {"ok": True, "reason": "committed and pushed", "branch": branch}


def _flush():
    global _timer
    with _lock:
        _timer = None
    try:
        commit_and_push()
    except Exception as exc:
        print(f"[napkin] commit/push failed: {exc}")


def _schedule_commit():
    global _timer
    if not AUTO_COMMIT or COMMIT_MODE == "exit":
        return
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(COMMIT_DEBOUNCE_SECONDS, _flush)
        _timer.daemon = True
        _timer.start()


def sync(entries, deleted_ids=()):
    """Merge entries, rewrite NAPKIN.md, and schedule the commit+push.

    The disk write is unconditional and immediate -- a note is never at the mercy of git.
    """
    with _lock:
        merged = merge(entries, deleted_ids)
        rendered = render_markdown(merged)
        _write_private_copy(merged)
        # Only rewrite when the NOTES changed. render_markdown() stamps "last synced <time>",
        # so an unconditional write would dirty the file on every sync -- including the empty
        # sync the client sends on page load -- and produce a git commit that contains nothing
        # but a new timestamp.
        if _content_changed(rendered):
            if _temp_data_dir_must_not_touch_repo():
                print("[napkin] skipping repo NAPKIN.md write — temp WAYPOINT_DATA_DIR must not clobber git")
            elif would_clobber_committed_napkin(rendered):
                print("[napkin] skipping repo NAPKIN.md write — would wipe committed entries")
            else:
                MARKDOWN_FILE.write_text(rendered, encoding="utf-8")
    _register_exit_flush()
    _schedule_commit()
    return merged


def flush_now():
    """Commit immediately instead of waiting out the debounce (used by tests and shutdown)."""
    global _timer
    with _lock:
        if _timer is not None:
            _timer.cancel()
            _timer = None
    return commit_and_push()


def shutdown_compile():
    """Compile the work queue then drain git. Called when the desktop window closes."""
    try:
        compile_work_queue()
    except Exception as exc:
        print(f"[napkin] compile on shutdown failed: {exc}")
    return flush_now()


# --- Draining work the last session left behind --------------------------------------------
# The debounce is a daemon timer, so closing the app inside that window kills a pending commit
# outright. And a push that was rejected (offline, or origin moved) leaves the commit sitting
# locally with nothing scheduled to retry it. Both are recovered here.
_atexit_registered = False


def _flush_on_exit():
    try:
        compile_work_queue()
    except Exception as exc:
        print(f"[napkin] exit compile failed: {exc}")
    try:
        result = flush_now()
        reason = result.get("reason")
        if reason and reason != "no change":
            print(f"[napkin] on exit: {reason}")
    except Exception as exc:
        print(f"[napkin] exit flush failed: {exc}")


def _register_exit_flush():
    global _atexit_registered
    if _atexit_registered or not AUTO_COMMIT:
        return
    import atexit
    atexit.register(_flush_on_exit)
    _atexit_registered = True


def has_uncommitted_changes():
    """True when NAPKIN.md or ISSUES.md on disk differs from what git has recorded."""
    if not (_REPO_DIR / ".git").exists():
        return False
    for path, rel in _files_to_commit():
        tracked, _ = _git("ls-files", "--error-unmatch", rel)
        if not tracked:
            return True
        unchanged, _ = _git("diff", "--quiet", "HEAD", "--", rel)
        if not unchanged:
            return True
    if MARKDOWN_FILE.exists() and _repo_rel(MARKDOWN_FILE):
        rel = _repo_rel(MARKDOWN_FILE)
        tracked, _ = _git("ls-files", "--error-unmatch", rel)
        if not tracked:
            return True
    return False


def has_unpushed_commits():
    """True when the branch is ahead of its upstream (a deferred push is waiting)."""
    ok, out = _git("rev-list", "--count", "@{upstream}..HEAD")
    if not ok:
        return False
    try:
        return int((out or "0").strip()) > 0
    except ValueError:
        return False


def startup_sync():
    """Commit and push whatever the previous session left uncommitted.

    This is what makes "pin a note, close the app straight away" reliable: the note is already
    on disk, and the commit it never got to make happens on the next launch instead.
    """
    _register_exit_flush()
    if not AUTO_COMMIT:
        return {"ok": False, "reason": "auto-commit disabled"}
    try:
        if has_uncommitted_changes():
            result = commit_and_push()
            print(f"[napkin] startup: {result.get('reason')}")
            return result
        if AUTO_PUSH and has_unpushed_commits():
            ok_branch, branch = _git("rev-parse", "--abbrev-ref", "HEAD")
            pushed, out = _git("push", "origin", (branch or "main").strip())
            if pushed:
                print("[napkin] startup: pushed a commit deferred from an earlier session")
                return {"ok": True, "reason": "deferred push sent"}
            print(f"[napkin] startup: deferred push still failing: {out}")
            return {"ok": True, "reason": "push still deferred", "push_error": out}
    except Exception as exc:
        print(f"[napkin] startup sync failed: {exc}")
        return {"ok": False, "reason": str(exc)}
    return {"ok": True, "reason": "nothing pending"}


def _write_private_copy(entries):
    """Render private notes to a file in the data dir, which is never part of the repo."""
    private = [e for e in entries if e.get("private")]
    if not private:
        return
    lines = [
        "# Napkin (private)",
        "",
        "Personal notes, deliberately kept out of the git copy. Local to this machine only.",
        "",
    ]
    for entry in private:
        lines.append("## " + (entry.get("title") or "(untitled)"))
        details = (entry.get("details") or "").strip()
        if details:
            lines += ["", details]
        lines.append("")
    try:
        (_DATA_DIR / "NAPKIN_PRIVATE.md").write_text("\n".join(lines), encoding="utf-8")
    except Exception as exc:
        print(f"[napkin] could not write the private copy: {exc}")
