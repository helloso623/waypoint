import os
import threading
import time
from datetime import datetime, timedelta

import db
import email_sender
import orchestrator
import rules

CHECK_INTERVAL_SECONDS = 60
SEND_HOUR = int(os.environ.get("DAILY_EMAIL_HOUR", "7"))  # local hour, 24h clock

_last_sent_date = None


def _yesterday_summary():
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    day = db.get_day(yesterday)
    if not day["metrics"]:
        return ""
    hours_by_category = {}
    for h in day["hours"].values():
        cat = h.get("category")
        if cat:
            hours_by_category[cat] = hours_by_category.get(cat, 0) + 1
    try:
        return orchestrator.run(
            "daily_reflector", date=yesterday, metrics=day["metrics"], hours_by_category=hours_by_category
        )
    except Exception as exc:
        print(f"[scheduler] daily_reflector failed: {exc}")
        return ""


def _tick():
    global _last_sent_date
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    if now.hour == SEND_HOUR and _last_sent_date != today:
        result = email_sender.send_daily_form(today, _yesterday_summary())
        print(f"[scheduler] daily email: ok={result.ok} detail={result.detail}")
        _last_sent_date = today
        # Fire schedule.daily rules once per day alongside the email tick.
        rules_daily_last = (db.get_settings().get("rules_daily_last") or "")
        if rules_daily_last != today:
            try:
                summaries = rules.emit("schedule.daily", {"date": today})
                print(f"[scheduler] schedule.daily rules fired: {len(summaries)} rule(s)")
                db.save_settings({"rules_daily_last": today})
            except Exception as exc:
                print(f"[scheduler] schedule.daily rules error: {exc}")

            # Keep the activity log from growing without bound. Same once-a-day gate as the
            # rules above, so it costs one DELETE per day rather than one per tick.
            try:
                removed = db.prune_activity()
                removed += db.prune_api_usage()
                removed += db.prune_agent_log()
                if removed:
                    print(f"[scheduler] pruned {removed} old activity/usage/log row(s)")
            except Exception as exc:
                print(f"[scheduler] activity prune error: {exc}")


def _loop():
    while True:
        try:
            _tick()
        except Exception as exc:
            print(f"[scheduler] tick failed: {exc}")
        time.sleep(CHECK_INTERVAL_SECONDS)


def start():
    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
    return thread
