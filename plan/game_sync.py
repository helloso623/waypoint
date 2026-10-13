"""Persist cash (gems, coins, XP) and achievements (trophies, unlocks, levels) server-side.

Same problem the Napkin had: all of it lived in localStorage only. That means it is lost when
browser data is cleared, it never matches between the laptop and the phone, and nothing outside
the browser can see it. This module gives it a durable home and a git-tracked summary.

  WAYPOINT_DATA_DIR/game_state.json   authoritative state (durable, not in the repo)
  WAYPOINT_DATA_DIR/GAME_STATE.md     readable summary (local only, never committed)

MERGING IS THE WHOLE PROBLEM. Both devices post their entire blob, so a plain overwrite would
let whichever synced last erase the other's progress. Each key therefore declares how it
combines, and the rule is chosen so that the failure mode is "keeps too much" rather than
"silently loses progress":

  MAX        monotonic counters that only ever climb (trophies, coins earned)
  UNION_SET  achievement sets -- an achievement earned anywhere is earned everywhere
  UNION_MAP  unlock maps, truthy wins per key
  DAY_MAX    per-day counters ({date, amount}); newer date wins, same date takes the max
  LATEST     genuine balances and opaque blobs, resolved by the client's updatedAt

LATEST is the honest compromise for `gameGems`: it is a balance that goes DOWN when spent, so
MAX would resurrect spent gems and a blind overwrite would drop earnings. Playing on two
devices at once can still lose gems here. The real fix is the coin_ledger table that already
exists in db.py -- record spends and earns as events and sum them -- which is a bigger change
than this sync.
"""
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

import repo_commit

_PLAN_DIR = Path(__file__).parent
_REPO_DIR = _PLAN_DIR.parent
_DATA_DIR = Path(os.environ["WAYPOINT_DATA_DIR"]) if os.environ.get("WAYPOINT_DATA_DIR") else _PLAN_DIR

STATE_FILE = _DATA_DIR / "game_state.json"
# Local only. This is personal progress -- gems, coins, trophies -- so it does not belong in a
# shareable repo. Committing it also diverged the branch: with auto-push off the commits piled
# up locally forever and the launcher's `git pull --ff-only` then refused every update.
MARKDOWN_FILE = _DATA_DIR / "GAME_STATE.md"
COMMIT_DEBOUNCE_SECONDS = float(os.environ.get("GAME_COMMIT_DEBOUNCE", "300"))

MAX, UNION_SET, UNION_MAP, DAY_MAX, LATEST = "max", "union_set", "union_map", "day_max", "latest"

RULES = {
    # cash and progress counters
    "arcadeCoinsBonus": MAX,
    "arcadeTrophies": MAX,
    "arcadeTrophyRoad": MAX,
    "gameGems": LATEST,
    "gameXpToday": DAY_MAX,
    # achievements
    "arcadeUnlocks": UNION_MAP,
    "seenLevels": UNION_SET,
    "seenStreakMilestones": UNION_SET,
    "arcadeTrophyRoadClaimed": UNION_SET,
    # opaque per-device blobs
    "gameQuests": LATEST,
    "gameTodayCompleteDate": LATEST,
    "arcadeSkillHist": LATEST,
    "arcadeCanvasStats": LATEST,
    "arcadePlayerName": LATEST,
    "arcadeRival": LATEST,
    "dailyCheckHistory": LATEST,

    # Loot: the boxes, the coin high-water marks and the skins you own. These live under
    # constant-named keys in loot.js, which is why a scan for literal localStorage strings
    # missed them and they went unsynced until now.
    "waypointLootStateV1": LATEST,
    "waypointGemCapV1": LATEST,
    "waypointDailyMetaV1": LATEST,
    "waypointCustomSkinsV1": UNION_SET,
    "waypointCoinHighWater": MAX,
    "waypointCoinSourceHighWaterV2": MAX,
    "waypointCoinRoadScaleVersion": MAX,
    "waypointLootCoinBonusV1": MAX,
    "lootSkinTutorialSeen": LATEST,
    "waypointLootSoundsMuted": LATEST,

    # Eggs and achievements
    "waypointEggsV1": LATEST,
    "waypointAchievementsV1": UNION_SET,
    "seenUnlocks": UNION_SET,
    "triumphSeen": UNION_SET,
    "unlockedThemes": UNION_SET,

    # Other earned progress
    "waypointHabitsV1": LATEST,
    "gameQuestRotationV1": LATEST,
    "founderOpsStreak": MAX,
    "arcadePlayTimeMs": MAX,
    "hardwareTrackLevel": MAX,
    "hardwareStageClears": UNION_SET,
    "pulseHonestyDates": UNION_SET,
    "goalProgressToday": LATEST,
    "dailyContract": LATEST,
    "lateLogs": LATEST,
    "perkConfetti": LATEST,
    "perkMidnight": LATEST,
    "tskDoneToday": LATEST,
    "tskPowerCaptureDay": LATEST,

    # Look and view preferences. Not "progress", but losing them on a cache clear or having
    # them differ between laptop and phone is exactly the "store all info" complaint.
    "activeTheme": LATEST,
    "activeWallpaper": LATEST,
    "unlockedThemes": UNION_SET,
    "stylePaintConfig": LATEST,
    "style_paint_config": LATEST,
    "homeSpots": LATEST,
    "hubPins": LATEST,
    "hubReading": LATEST,
    "taskSortMode": LATEST,
    "todayWeekMode": LATEST,
    "todayWeekOpen": LATEST,
    "calendarView": LATEST,
    "calendarWeekStart": LATEST,
    "settings_density": LATEST,
    "hiddenAppIds": UNION_SET,
    "calmMode": LATEST,
    "quickCaptureType": LATEST,
    "dayTemplates": LATEST,
    "wfSplitView": LATEST,
}

_lock = threading.RLock()
_timer = None
_atexit_registered = False


def _read_state():
    try:
        blob = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if isinstance(blob, dict):
            return {
                "values": blob.get("values") or {},
                "updatedAt": blob.get("updatedAt") or {},
                "resetEpoch": blob.get("resetEpoch") or "",
                "resetKeys": blob.get("resetKeys") or [],
                "resets": blob.get("resets") or [],
            }
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"[game_sync] unreadable state file, starting fresh: {exc}")
    return {"values": {}, "updatedAt": {}, "resetEpoch": "", "resetKeys": [], "resets": []}


def _write_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str, sort_keys=True), encoding="utf-8")


def _as_number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _combine(rule, old, new, old_at, new_at):
    if old is None:
        return new
    if new is None:
        return old

    if rule == MAX:
        # Keep whole numbers whole: float() would hand the client 12.0 for a trophy count.
        best = max(_as_number(old), _as_number(new))
        return int(best) if float(best).is_integer() else best

    if rule == UNION_SET:
        # If neither side is actually a list, unioning would produce [] and destroy the value.
        # Some of these keys turn out to hold objects on some versions, so degrade to LATEST.
        if not isinstance(old, list) and not isinstance(new, list):
            return new if new_at >= old_at else old
        if not isinstance(old, list):
            return new
        if not isinstance(new, list):
            return old
        merged = set()
        for side in (old, new):
            if isinstance(side, list):
                merged.update(json.dumps(x, sort_keys=True) if isinstance(x, (dict, list)) else x
                              for x in side)
        out = [json.loads(x) if isinstance(x, str) and x[:1] in "[{" else x for x in merged]
        try:
            return sorted(out)
        except TypeError:
            return out

    if rule == UNION_MAP:
        if not isinstance(old, dict) or not isinstance(new, dict):
            return new if new_at >= old_at else old
        merged = dict(old)
        for k, v in new.items():
            # An unlock earned on either device stays unlocked.
            merged[k] = v if v else merged.get(k, v)
        return merged

    if rule == DAY_MAX:
        if not isinstance(old, dict) or not isinstance(new, dict):
            return new
        if str(new.get("date") or "") > str(old.get("date") or ""):
            return new
        if str(new.get("date") or "") < str(old.get("date") or ""):
            return old
        return {"date": new.get("date"),
                "amount": max(_as_number(old.get("amount")), _as_number(new.get("amount")))}

    return new if new_at >= old_at else old


def merge(incoming, updated_at=None):
    """Merge a client's whole game-state blob into stored state. Returns the merged values."""
    state = _read_state()
    values, stamps = dict(state["values"]), dict(state["updatedAt"])
    incoming = incoming if isinstance(incoming, dict) else {}
    now = datetime.now(timezone.utc).isoformat()
    client_at = str(updated_at or now)

    # A reset has to beat the merge rules. waypointCoinHighWater merges with MAX, so a browser
    # that still holds the old figure would simply restore it on the next sync and the reset
    # would look like it never happened. Values posted from before the reset are ignored for
    # the keys it cleared, until that client acknowledges the epoch.
    reset_epoch = str(state.get("resetEpoch") or "")
    reset_keys = set(state.get("resetKeys") or [])
    stale = bool(reset_epoch) and client_at < reset_epoch

    for key, new_value in incoming.items():
        if key not in RULES:
            continue  # only sync keys we know how to combine
        if stale and key in reset_keys:
            continue  # pre-reset value from a client that has not caught up
        old_at = str(stamps.get(key) or "")
        values[key] = _combine(RULES[key], values.get(key), new_value, old_at, client_at)
        stamps[key] = client_at

    _write_state({
        "values": values, "updatedAt": stamps, "syncedAt": now,
        "resetEpoch": reset_epoch, "resetKeys": sorted(reset_keys),
        "resets": state.get("resets") or [],
    })
    return values


def reset(keys, note=""):
    """Clear the given keys and record what was cleared.

    Keeps a ledger entry with the previous values, because wiping progress silently leaves no
    way to tell what was lost or to argue with the result later.
    """
    state = _read_state()
    values, stamps = dict(state["values"]), dict(state["updatedAt"])
    keys = [k for k in keys if k in RULES]
    previous = {k: values.get(k) for k in keys if k in values}
    for key in keys:
        values.pop(key, None)
        stamps.pop(key, None)
    epoch = datetime.now(timezone.utc).isoformat()
    resets = list(state.get("resets") or [])
    resets.append({"at": epoch, "note": note, "keys": keys, "previous": previous})
    _write_state({
        "values": values, "updatedAt": stamps, "syncedAt": epoch,
        "resetEpoch": epoch, "resetKeys": sorted(keys), "resets": resets,
    })
    with _lock:
        rendered = render_markdown(values)
        if _content_changed(rendered):
            MARKDOWN_FILE.write_text(rendered, encoding="utf-8")
    return {"ok": True, "epoch": epoch, "cleared": keys, "previous": previous}


def reset_info():
    state = _read_state()
    return {"resetEpoch": state.get("resetEpoch") or "", "resetKeys": state.get("resetKeys") or []}


def _fmt(value):
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, (dict, list)):
        return f"{len(value)} entries"
    return str(value)


def render_markdown(values):
    lines = [
        "# Game state",
        "",
        "Cash and achievements mirrored out of the browser by `game_sync.py`.",
        "Generated file: play in the app, do not edit this by hand.",
        "",
        f"_last synced {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
    ]
    if not values:
        lines += ["_Nothing synced yet._", ""]
        return "\n".join(lines)

    groups = [("Cash", ["gameGems", "arcadeCoinsBonus", "gameXpToday", "waypointCoinHighWater",
                        "waypointCoinSourceHighWaterV2", "waypointLootCoinBonusV1"]),
              ("Loot", ["waypointLootStateV1", "waypointGemCapV1", "waypointCustomSkinsV1",
                        "waypointEggsV1", "waypointDailyMetaV1"]),
              ("Achievements", ["arcadeTrophies", "arcadeTrophyRoad", "arcadeUnlocks",
                                "waypointAchievementsV1", "seenUnlocks", "triumphSeen",
                                "unlockedThemes", "seenLevels", "seenStreakMilestones"]),
              ("Progress", ["gameQuests", "gameTodayCompleteDate", "arcadeSkillHist",
                            "arcadeCanvasStats", "arcadePlayerName", "arcadeRival",
                            "dailyCheckHistory"])]
    shown = set()
    for title, keys in groups:
        rows = [(k, values[k]) for k in keys if k in values]
        if not rows:
            continue
        lines += [f"## {title}", ""]
        for k, v in rows:
            shown.add(k)
            lines.append(f"- **{k}**: {_fmt(v)}")
        lines.append("")
    rest = [k for k in sorted(values) if k not in shown]
    if rest:
        lines += ["## Other", ""] + [f"- **{k}**: {_fmt(values[k])}" for k in rest] + [""]
    return "\n".join(lines)


def _strip_stamp(text):
    return "\n".join(l for l in (text or "").splitlines() if not l.startswith("_last synced "))


def _content_changed(rendered):
    try:
        current = MARKDOWN_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return True
    return _strip_stamp(current) != _strip_stamp(rendered)


def _flush():
    global _timer
    with _lock:
        _timer = None
    # Deliberately not committed; the file is local progress. Kept as a hook so the
    # debounce/exit machinery around it stays intact.
    return


def _flush_on_exit():
    try:
        result = flush_now()
        reason = result.get("reason")
        if reason and reason != "no change":
            print(f"[game_sync] on exit: {reason}")
    except Exception as exc:
        print(f"[game_sync] exit flush failed: {exc}")


def _register_exit_flush():
    global _atexit_registered
    if _atexit_registered or not repo_commit.AUTO_COMMIT:
        return
    import atexit
    atexit.register(_flush_on_exit)
    _atexit_registered = True


def _schedule_commit():
    global _timer
    if not repo_commit.AUTO_COMMIT or repo_commit.COMMIT_MODE == "exit":
        return
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(COMMIT_DEBOUNCE_SECONDS, _flush)
        _timer.daemon = True
        _timer.start()


def sync(incoming, updated_at=None):
    """Merge, rewrite GAME_STATE.md if the numbers changed, schedule the commit."""
    with _lock:
        values = merge(incoming, updated_at)
        rendered = render_markdown(values)
        if _content_changed(rendered):
            MARKDOWN_FILE.write_text(rendered, encoding="utf-8")
    _register_exit_flush()
    _schedule_commit()
    return values


def current():
    return _read_state()["values"]


def flush_now():
    global _timer
    with _lock:
        if _timer is not None:
            _timer.cancel()
            _timer = None
    return {"ok": True, "reason": "game state is local only"}


def startup_sync():
    """Commit anything the previous session left behind, and retry a deferred push."""
    _register_exit_flush()
    return {"ok": True, "reason": "game state is local only"}
