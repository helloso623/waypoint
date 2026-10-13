"""School integrations — Pronote connector (optional pronotepy dependency)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import db

try:
    import pronotepy
    from pronotepy import CryptoError, ENTLoginError, PronoteAPIError

    PRONOTEPY_AVAILABLE = True
except ImportError:
    pronotepy = None
    CryptoError = ENTLoginError = PronoteAPIError = Exception  # type: ignore
    PRONOTEPY_AVAILABLE = False

PRONOTE_KEYS = ("pronote_url", "pronote_username", "pronote_password", "pronote_school_name")


def _settings():
    return db.get_settings()


def _normalize_pronote_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return url
    if not url.startswith("http"):
        url = "https://" + url
    if "eleve.html" in url:
        return url
    url = url.rstrip("/")
    if url.endswith("/pronote"):
        return f"{url}/eleve.html"
    if "/pronote" in url:
        return f"{url}/eleve.html"
    return url


def _pronote_client():
    if not PRONOTEPY_AVAILABLE:
        raise RuntimeError("pronotepy is not installed — run pip install pronotepy in the app venv.")
    settings = _settings()
    url = _normalize_pronote_url(settings.get("pronote_url") or "")
    username = (settings.get("pronote_username") or "").strip()
    password = settings.get("pronote_password") or ""
    if not url or not username or not password:
        raise RuntimeError("Pronote is not configured — enter URL, username, and password, then Connect.")
    try:
        client = pronotepy.Client(url, username=username, password=password)
    except CryptoError:
        raise RuntimeError("Pronote login failed — check username and password.") from None
    except ENTLoginError:
        raise RuntimeError(
            "Pronote ENT login failed — some schools require an ENT portal; "
            "this connector only supports direct eleve.html URLs."
        ) from None
    except PronoteAPIError as exc:
        raise RuntimeError(f"Pronote API error: {exc}") from None
    except Exception as exc:
        raise RuntimeError(f"Could not connect to Pronote: {exc}") from None
    if not client.logged_in:
        raise RuntimeError("Pronote login failed — credentials were rejected.")
    return client


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _calendar_exists(title: str, event_date: str, start_time: str) -> bool:
    conn = db.get_conn()
    row = conn.execute(
        "SELECT 1 FROM calendar_events WHERE title = ? AND date = ? AND start_time = ? LIMIT 1",
        (title, event_date, start_time),
    ).fetchone()
    conn.close()
    return row is not None


def _task_exists(title: str, due_date: str) -> bool:
    conn = db.get_conn()
    row = conn.execute(
        "SELECT 1 FROM tasks WHERE title = ? AND due_date = ? LIMIT 1",
        (title, due_date),
    ).fetchone()
    conn.close()
    return row is not None


def pronote_status() -> dict:
    settings = _settings()
    configured = bool(
        (settings.get("pronote_url") or "").strip()
        and (settings.get("pronote_username") or "").strip()
        and (settings.get("pronote_password") or "").strip()
    )
    school = (settings.get("pronote_school_name") or "").strip() or None
    return {
        "library_available": PRONOTEPY_AVAILABLE,
        "configured": configured,
        "connected_school": school,
    }


def pronote_connect(url: str, username: str, password: str) -> dict:
    if not PRONOTEPY_AVAILABLE:
        return {"error": "pronotepy is not installed — run pip install pronotepy in the app venv."}
    url = _normalize_pronote_url(url)
    username = (username or "").strip()
    password = password or ""
    if not url or not username or not password:
        return {"error": "URL, username, and password are required."}
    try:
        client = pronotepy.Client(url, username=username, password=password)
    except CryptoError:
        return {"error": "Login failed — check username and password."}
    except ENTLoginError:
        return {
            "error": (
                "ENT login failed — some schools require an ENT portal; "
                "this connector only supports direct eleve.html URLs."
            )
        }
    except PronoteAPIError as exc:
        return {"error": f"Pronote API error: {exc}"}
    except Exception as exc:
        return {"error": f"Could not connect: {exc}"}
    if not client.logged_in:
        return {"error": "Login failed — credentials were rejected."}
    school_name = None
    try:
        if client.info and getattr(client.info, "establishment", None):
            school_name = str(client.info.establishment)
        elif client.info and getattr(client.info, "name", None):
            school_name = str(client.info.name)
    except Exception:
        school_name = None
    db.save_settings({
        "pronote_url": url,
        "pronote_username": username,
        "pronote_password": password,
        "pronote_school_name": school_name or "",
    })
    return {"ok": True, "connected_school": school_name}


def pronote_sync(days: int = 14) -> dict:
    if not PRONOTEPY_AVAILABLE:
        return {"error": "pronotepy is not installed — run pip install pronotepy in the app venv."}
    days = max(1, min(int(days or 14), 60))
    try:
        client = _pronote_client()
    except RuntimeError as exc:
        return {"error": str(exc)}
    today = date.today()
    end = today + timedelta(days=days)
    calendar_created = 0
    tasks_created = 0
    try:
        lessons = client.lessons(today, end)
    except Exception as exc:
        return {"error": f"Could not fetch timetable: {exc}"}
    for lesson in lessons or []:
        try:
            start = lesson.start
            end_dt = lesson.end
            if isinstance(start, datetime):
                event_date = start.date().isoformat()
                start_time = _fmt_time(start)
                end_time = _fmt_time(end_dt) if isinstance(end_dt, datetime) else None
            else:
                continue
            subject = "Class"
            if lesson.subject and getattr(lesson.subject, "name", None):
                subject = str(lesson.subject.name).strip() or subject
            title = subject
            notes_parts = []
            if getattr(lesson, "classroom", None):
                notes_parts.append(f"Room: {lesson.classroom}")
            teacher = getattr(lesson, "teacher_name", None) or ""
            if teacher:
                notes_parts.append(f"Teacher: {teacher}")
            notes = " · ".join(notes_parts)
            class_id = db.upsert_class_slot(
                subject,
                start.date().weekday(),
                start_time,
                end_time or _fmt_time(start + timedelta(hours=1)),
                location=str(getattr(lesson, "classroom", None) or ""),
                notes=f"Teacher: {teacher}" if teacher else "",
                source="pronote",
            )
            if _calendar_exists(title, event_date, start_time):
                continue
            db.insert_calendar_event(
                title, event_date, start_time, end_time, "School", notes, class_id=class_id
            )
            calendar_created += 1
        except Exception:
            continue
    try:
        homework_list = client.homework(today, end)
    except Exception as exc:
        return {
            "error": f"Timetable synced ({calendar_created} events) but homework fetch failed: {exc}",
            "calendar_created": calendar_created,
            "tasks_created": tasks_created,
        }
    for hw in homework_list or []:
        try:
            subject = "Unknown"
            if hw.subject and getattr(hw.subject, "name", None):
                subject = str(hw.subject.name).strip() or subject
            desc = (getattr(hw, "description", None) or "").strip()
            if len(desc) > 120:
                desc = desc[:117] + "..."
            title = f"HW {subject}: {desc}" if desc else f"HW {subject}"
            due = getattr(hw, "date", None)
            if isinstance(due, datetime):
                due_date = due.date().isoformat()
            elif isinstance(due, date):
                due_date = due.isoformat()
            else:
                continue
            if _task_exists(title, due_date):
                continue
            db.insert_task(title, notes="", urgency="medium", due_date=due_date, category="School")
            tasks_created += 1
        except Exception:
            continue
    return {"calendar_created": calendar_created, "tasks_created": tasks_created}
