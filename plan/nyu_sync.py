"""NYU Brightspace + campus-app integrations.

What this can actually do
-------------------------
- Import a Brightspace calendar feed (ICS). Any student can enable this in
  Brightspace → Calendar → Settings → Enable Calendar Feeds.
- Optionally talk to the official D2L Brightspace Valence API if NYU IT
  issued OAuth client credentials (students cannot self-register an app).
- Open official NYU apps (Albert, NYU Home, email, libraries, …).

What this cannot do
-------------------
There is no public “all NYU apps” student API. Albert, NYU Home, NYU Card,
and most campus tools do not expose a student token we can poll. We launch
those apps and, for Albert, still accept a pasted schedule.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import db
from school_sync import _calendar_exists, _task_exists

DEFAULT_HOST = "brightspace.nyu.edu"
OAUTH_AUTHORIZE = "https://auth.brightspace.com/oauth2/auth"
OAUTH_TOKEN = "https://auth.brightspace.com/core/connect/token"
OAUTH_SCOPES = "core:*:* enrollment:orgunit:read calendar:events:read dropboxes:folders:read"
LP_VERSION_DEFAULT = "1.43"
LE_VERSION_DEFAULT = "1.75"

_STATIC_APPS: list[dict[str, str]] = [
    {
        "id": "brightspace",
        "name": "Brightspace",
        "kind": "lms",
        "path": "/d2l/home",
        "blurb": "Courses, assignments, grades, and the calendar feed.",
    },
    {
        "id": "albert",
        "name": "Albert",
        "kind": "sis",
        "url": "https://albert.nyu.edu/student",
        "blurb": "Registration and official schedule. No student API — paste or export.",
    },
    {
        "id": "home",
        "name": "NYU Home",
        "kind": "portal",
        "url": "https://home.nyu.edu/",
        "blurb": "Campus portal. SSO launchpad, not a data API.",
    },
    {
        "id": "email",
        "name": "NYU Email",
        "kind": "mail",
        "url": "https://mail.nyu.edu/",
        "blurb": "Google Workspace. Connect Google in Settings for mail/calendar.",
    },
    {
        "id": "servicelink",
        "name": "ServiceLink",
        "kind": "it",
        "url": "https://nyu.service-now.com/sp",
        "blurb": "IT tickets and NYU-issued Brightspace API access requests.",
    },
    {
        "id": "libraries",
        "name": "NYU Libraries",
        "kind": "library",
        "url": "https://library.nyu.edu/",
        "blurb": "Catalog, reserves, and research help.",
    },
    {
        "id": "zoom",
        "name": "NYU Zoom",
        "kind": "class",
        "url": "https://nyu.zoom.us/",
        "blurb": "Class meetings. Sign in with NYU.",
    },
    {
        "id": "bookstore",
        "name": "NYU Bookstore",
        "kind": "campus",
        "url": "https://www.bkstr.com/nyustore/home",
        "blurb": "Course materials.",
    },
    {
        "id": "nyucard",
        "name": "NYU Card",
        "kind": "campus",
        "url": "https://www.nyu.edu/life/campus-resources/nyu-card.html",
        "blurb": "ID and access. No student data API.",
    },
    {
        "id": "albert-browse",
        "name": "Albert course search",
        "kind": "sis",
        "url": "https://sis.nyu.edu/psc/csprod/EMPLOYEE/SA/c/NYU_SR.NYU_CLS_SRCH.GBL",
        "blurb": "Public class search (no login required for browsing).",
    },
]


def brightspace_host() -> str:
    return os.environ.get("NYU_BRIGHTSPACE_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST


def lp_version() -> str:
    return os.environ.get("NYU_BRIGHTSPACE_LP_VERSION", LP_VERSION_DEFAULT).strip() or LP_VERSION_DEFAULT


def le_version() -> str:
    return os.environ.get("NYU_BRIGHTSPACE_LE_VERSION", LE_VERSION_DEFAULT).strip() or LE_VERSION_DEFAULT


def nyu_apps() -> list[dict[str, str]]:
    host = brightspace_host()
    apps: list[dict[str, str]] = []
    for raw in _STATIC_APPS:
        item = dict(raw)
        if item.get("path"):
            item["url"] = f"https://{host}{item.pop('path')}"
        apps.append(item)
    return apps


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: str | None) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    raw = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _data_dir() -> Path:
    return Path(os.environ.get("WAYPOINT_DATA_DIR") or Path(__file__).parent / "data")


def _oauth_state_path() -> Path:
    return _data_dir() / "nyu_brightspace_oauth_state.json"


def _token_path() -> Path:
    return _data_dir() / "nyu_brightspace_tokens.json"


def apply_stored_credentials() -> None:
    settings = db.get_settings()
    cid = str(settings.get("nyu_brightspace_client_id") or "").strip()
    secret = str(settings.get("nyu_brightspace_client_secret") or "").strip()
    if cid and not os.environ.get("NYU_BRIGHTSPACE_CLIENT_ID", "").strip():
        os.environ["NYU_BRIGHTSPACE_CLIENT_ID"] = cid
    if secret and not os.environ.get("NYU_BRIGHTSPACE_CLIENT_SECRET", "").strip():
        os.environ["NYU_BRIGHTSPACE_CLIENT_SECRET"] = secret


def client_id() -> str:
    apply_stored_credentials()
    return os.environ.get("NYU_BRIGHTSPACE_CLIENT_ID", "").strip()


def client_secret() -> str:
    apply_stored_credentials()
    return os.environ.get("NYU_BRIGHTSPACE_CLIENT_SECRET", "").strip()


def oauth_configured() -> bool:
    return bool(client_id())


def tokens_present() -> bool:
    return _token_path().is_file()


def load_tokens() -> dict[str, Any] | None:
    path = _token_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) and data.get("access_token") else None


def save_tokens(payload: dict[str, Any]) -> None:
    path = _token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def clear_tokens() -> None:
    path = _token_path()
    if path.is_file():
        path.unlink()


def saved_ics_url() -> str:
    return str(db.get_settings().get("nyu_brightspace_ics_url") or "").strip()


def save_ics_url(url: str) -> str:
    target = (url or "").strip()
    if target:
        _assert_ics_url(target)
    db.save_settings({"nyu_brightspace_ics_url": target})
    return target


def _redirect_uri() -> str:
    explicit = os.environ.get("NYU_BRIGHTSPACE_REDIRECT_URI", "").strip()
    if explicit:
        return explicit
    base = (os.environ.get("APP_BASE_URL") or "http://127.0.0.1:5099").rstrip("/")
    return f"{base}/api/nyu/brightspace/oauth/callback"


def authorization_url() -> str:
    cid = client_id()
    if not cid:
        raise ValueError("Set NYU_BRIGHTSPACE_CLIENT_ID (issued by NYU IT / D2L), or save it in Settings → NYU.")
    state = secrets.token_urlsafe(24)
    _oauth_state_path().parent.mkdir(parents=True, exist_ok=True)
    _oauth_state_path().write_text(
        json.dumps({"state": state, "created_at": _utc_now().isoformat()}),
        encoding="utf-8",
    )
    query = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": cid,
            "redirect_uri": _redirect_uri(),
            "scope": os.environ.get("NYU_BRIGHTSPACE_SCOPES", OAUTH_SCOPES).strip() or OAUTH_SCOPES,
            "state": state,
        }
    )
    return f"{OAUTH_AUTHORIZE}?{query}"


def consume_oauth_state(state: str) -> bool:
    path = _oauth_state_path()
    if not path.is_file():
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    created = _parse_dt(str(payload.get("created_at") or ""))
    if created and _utc_now() - created > timedelta(minutes=15):
        path.unlink(missing_ok=True)
        return False
    ok = secrets.compare_digest(str(payload.get("state") or ""), state or "")
    if ok:
        path.unlink(missing_ok=True)
    return ok


def _http_json(url: str, *, data: dict[str, str] | None = None, headers: dict[str, str] | None = None) -> Any:
    body = None
    req_headers = {"Accept": "application/json", "User-Agent": "Waypoint/NYU"}
    if headers:
        req_headers.update(headers)
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        req_headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=body, headers=req_headers, method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Brightspace HTTP {exc.code}: {detail or exc.reason}") from exc
    if not raw.strip():
        return {}
    return json.loads(raw)


def exchange_code(code: str) -> dict[str, Any]:
    cid = client_id()
    secret = client_secret()
    if not cid or not secret:
        raise ValueError("NYU_BRIGHTSPACE_CLIENT_ID and NYU_BRIGHTSPACE_CLIENT_SECRET are required.")
    payload = _http_json(
        OAUTH_TOKEN,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
            "client_id": cid,
            "client_secret": secret,
        },
    )
    return _store_token_response(payload)


def refresh_access_token(tokens: dict[str, Any]) -> dict[str, Any]:
    refresh = str(tokens.get("refresh_token") or "").strip()
    cid = client_id()
    secret = client_secret()
    if not refresh or not cid or not secret:
        raise RuntimeError("Brightspace token expired and cannot be refreshed.")
    payload = _http_json(
        OAUTH_TOKEN,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "client_id": cid,
            "client_secret": secret,
        },
    )
    if not payload.get("refresh_token"):
        payload["refresh_token"] = refresh
    return _store_token_response(payload)


def _store_token_response(payload: dict[str, Any]) -> dict[str, Any]:
    access = str(payload.get("access_token") or "").strip()
    if not access:
        raise RuntimeError("Brightspace token response had no access_token.")
    expires_in = int(payload.get("expires_in") or 3600)
    stored = {
        "access_token": access,
        "refresh_token": str(payload.get("refresh_token") or "").strip(),
        "scope": str(payload.get("scope") or ""),
        "expires_at": _iso(_utc_now() + timedelta(seconds=max(60, expires_in - 45))),
    }
    save_tokens(stored)
    return stored


def _valid_access_token() -> str:
    tokens = load_tokens()
    if not tokens:
        raise RuntimeError("Brightspace is not connected.")
    expires = _parse_dt(str(tokens.get("expires_at") or ""))
    if expires and expires <= _utc_now() + timedelta(seconds=30):
        tokens = refresh_access_token(tokens)
    return str(tokens["access_token"])


def _api(path: str, *, token: str | None = None) -> Any:
    access = token or _valid_access_token()
    url = path if path.startswith("https://") else f"https://{brightspace_host()}{path}"
    try:
        return _http_json(url, headers={"Authorization": f"Bearer {access}"})
    except RuntimeError as exc:
        if "HTTP 401" not in str(exc):
            raise
        tokens = refresh_access_token(load_tokens() or {})
        return _http_json(url, headers={"Authorization": f"Bearer {tokens['access_token']}"})


def _as_items(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("Items", "Objects", "items", "objects"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def whoami() -> dict[str, Any]:
    payload = _api(f"/d2l/api/lp/{lp_version()}/users/whoami")
    return payload if isinstance(payload, dict) else {}


def my_enrollments() -> list[dict[str, Any]]:
    payload = _api(f"/d2l/api/lp/{lp_version()}/enrollments/myenrollments/?orgUnitTypeId=3&isActive=true")
    courses: list[dict[str, Any]] = []
    for item in _as_items(payload):
        if not isinstance(item, dict):
            continue
        org = item.get("OrgUnit") if isinstance(item.get("OrgUnit"), dict) else {}
        ident = org.get("Id") or org.get("Identifier")
        name = str(org.get("Name") or "").strip()
        code = str(org.get("Code") or "").strip()
        if ident is None or not name:
            continue
        courses.append({"id": int(ident), "name": name, "code": code})
    return courses


def my_calendar_events(org_unit_ids: list[int]) -> list[dict[str, Any]]:
    start = _utc_now() - timedelta(days=7)
    end = _utc_now() + timedelta(days=120)
    query = urllib.parse.urlencode(
        {
            "startDateTime": _iso(start),
            "endDateTime": _iso(end),
            "orgUnitIdsCSV": ",".join(str(i) for i in org_unit_ids[:24]),
        }
    )
    payload = _api(f"/d2l/api/le/{le_version()}/calendar/events/myEvents/?{query}")
    return [item for item in _as_items(payload) if isinstance(item, dict)]


def dropbox_folders(org_unit_id: int) -> list[dict[str, Any]]:
    payload = _api(f"/d2l/api/le/{le_version()}/{org_unit_id}/dropbox/folders/")
    return [item for item in _as_items(payload) if isinstance(item, dict)]


def ics_host_ok(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    allowed = {brightspace_host().lower(), "brightspace.nyu.edu", "nyu.brightspace.com", "calendar.google.com"}
    extra = [part.strip().lower() for part in os.environ.get("NYU_ICS_ALLOWED_HOSTS", "").split(",") if part.strip()]
    allowed.update(extra)
    if host in allowed:
        return True
    return host.endswith(".brightspace.com") or host.endswith(".nyu.edu")


def _assert_ics_url(url: str) -> None:
    target = (url or "").strip()
    if not target.startswith(("https://", "http://")):
        raise ValueError("Calendar feed must be an http(s) URL.")
    parsed = urlparse(target)
    if parsed.username or parsed.password:
        raise ValueError("Calendar feed URL cannot include credentials.")
    if not ics_host_ok(target):
        raise ValueError(f"Only Brightspace / NYU / Google Calendar hosts are allowed (got {parsed.hostname}).")


def fetch_ics(url: str) -> str:
    _assert_ics_url(url)
    request = urllib.request.Request(
        url.strip(),
        headers={"User-Agent": "Waypoint/NYU", "Accept": "text/calendar, text/plain, */*"},
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read(2_000_000)
    text = raw.decode("utf-8", errors="replace")
    if "BEGIN:VCALENDAR" not in text:
        raise ValueError("That URL did not return an iCalendar feed.")
    return text


def _unfold_ics(text: str) -> str:
    return re.sub(r"\r?\n[ \t]", "", text.replace("\r\n", "\n"))


def _ics_unescape(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def parse_ics_blocks(text: str) -> list[dict[str, str]]:
    unfolded = _unfold_ics(text)
    blocks: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    kind = ""
    for line in unfolded.split("\n"):
        if line == "BEGIN:VEVENT":
            current = {}
            kind = "VEVENT"
            continue
        if line == "BEGIN:VTODO":
            current = {}
            kind = "VTODO"
            continue
        if line in {"END:VEVENT", "END:VTODO"} and current is not None:
            current["__kind"] = kind
            blocks.append(current)
            current = None
            kind = ""
            continue
        if current is None or ":" not in line:
            continue
        key, value = line.split(":", 1)
        name = key.split(";", 1)[0].upper()
        current[name] = _ics_unescape(value)
    return blocks


def _ics_datetime(value: str | None) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if raw.endswith("Z") and re.fullmatch(r"\d{8}T\d{6}Z", raw):
        return datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    if re.fullmatch(r"\d{8}T\d{6}", raw):
        return datetime.strptime(raw, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
    if re.fullmatch(r"\d{8}", raw):
        return datetime.strptime(raw, "%Y%m%d").replace(tzinfo=timezone.utc)
    return _parse_dt(raw)


def _notes_has_uid(uid: str) -> bool:
    marker = (uid or "").strip()
    if not marker:
        return False
    conn = db.get_conn()
    try:
        row = conn.execute(
            "SELECT 1 FROM calendar_events WHERE notes LIKE ? LIMIT 1",
            (f"%Brightspace UID: {marker}%",),
        ).fetchone()
        task = conn.execute(
            "SELECT 1 FROM tasks WHERE notes LIKE ? LIMIT 1",
            (f"%Brightspace UID: {marker}%",),
        ).fetchone()
    finally:
        conn.close()
    return row is not None or task is not None


def _insert_school_event(title: str, start: datetime, end: datetime, notes: str, *, all_day: bool = False) -> bool:
    event_date = start.date().isoformat()
    start_time = "00:00" if all_day else _fmt_time(start)
    end_time = "00:00" if all_day else _fmt_time(end)
    if _calendar_exists(title, event_date, start_time):
        return False
    db.insert_calendar_event(title[:180], event_date, start_time, end_time, "School", notes[:2000])
    return True


def _insert_school_task(title: str, due: datetime, notes: str) -> bool:
    due_date = due.date().isoformat()
    if _task_exists(title, due_date):
        return False
    db.insert_task(title[:180], notes=notes[:2000], urgency="high", due_date=due_date, category="School")
    return True


def import_ics_feed(*, ics_text: str) -> dict[str, int]:
    added_events = 0
    added_tasks = 0
    for block in parse_ics_blocks(ics_text):
        title = (block.get("SUMMARY") or "Brightspace item").strip()
        description = (block.get("DESCRIPTION") or "").strip()
        uid = (block.get("UID") or "").strip()
        notes = description
        if uid:
            if _notes_has_uid(uid):
                continue
            notes = (notes + f"\n\nBrightspace UID: {uid}").strip()
        kind = block.get("__kind")
        if kind == "VTODO":
            due = _ics_datetime(block.get("DUE") or block.get("DTSTART"))
            if not due:
                continue
            if _insert_school_task(title, due, notes):
                added_tasks += 1
            continue
        start = _ics_datetime(block.get("DTSTART"))
        end = _ics_datetime(block.get("DTEND")) or (start + timedelta(hours=1) if start else None)
        if not start or not end:
            continue
        all_day = len(block.get("DTSTART") or "") == 8
        if _insert_school_event(title, start, end, notes, all_day=all_day):
            added_events += 1
    return {"events": added_events, "tasks": added_tasks}


def import_ics_url(url: str, *, persist: bool = True) -> dict[str, int]:
    target = (url or "").strip()
    text = fetch_ics(target)
    if persist:
        save_ics_url(target)
    return import_ics_feed(ics_text=text)


def sync_brightspace_api() -> dict[str, Any]:
    profile = whoami()
    courses = my_enrollments()
    events = my_calendar_events([course["id"] for course in courses]) if courses else []
    added_events = 0
    added_tasks = 0
    for event in events:
        title = str(event.get("Title") or event.get("OrgUnitName") or "Brightspace event").strip()
        start = _parse_dt(str(event.get("StartDateTime") or event.get("StartDate") or ""))
        end = _parse_dt(str(event.get("EndDateTime") or event.get("EndDate") or "")) or (
            start + timedelta(hours=1) if start else None
        )
        if not start or not end:
            continue
        notes = str(event.get("Description") or event.get("OrgUnitName") or "")
        ident = str(event.get("CalendarEventId") or event.get("Id") or "").strip()
        if ident:
            if _notes_has_uid(f"api-{ident}"):
                continue
            notes = (notes + f"\n\nBrightspace UID: api-{ident}").strip()
        if _insert_school_event(title, start, end, notes, all_day=bool(event.get("IsAllDay"))):
            added_events += 1
    for course in courses[:16]:
        try:
            folders = dropbox_folders(course["id"])
        except RuntimeError:
            continue
        for folder in folders:
            due = _parse_dt(str(folder.get("DueDate") or ""))
            name = str(folder.get("Name") or "").strip()
            if not due or not name:
                continue
            title = f"{course.get('code') or course['name']}: {name}"
            notes = f"Brightspace assignment · {course['name']}"
            ident = str(folder.get("Id") or "").strip()
            if ident:
                if _notes_has_uid(f"dropbox-{ident}"):
                    continue
                notes = f"{notes}\n\nBrightspace UID: dropbox-{ident}"
            if _insert_school_task(title, due, notes):
                added_tasks += 1
    return {
        "whoami": {
            "id": profile.get("Identifier"),
            "name": " ".join(part for part in [profile.get("FirstName"), profile.get("LastName")] if part).strip(),
            "unique_name": profile.get("UniqueName"),
        },
        "courses": len(courses),
        "events": added_events,
        "tasks": added_tasks,
    }


def can_sync() -> bool:
    return bool(saved_ics_url()) or tokens_present()


def sync_all() -> dict[str, Any]:
    payload: dict[str, Any] = {"events": 0, "tasks": 0, "sources": []}
    errors: list[str] = []
    if tokens_present():
        try:
            api_result = sync_brightspace_api()
            payload["api"] = api_result
            payload["events"] += int(api_result.get("events") or 0)
            payload["tasks"] += int(api_result.get("tasks") or 0)
            payload["sources"].append("brightspace_api")
        except Exception as exc:
            errors.append(str(exc))
    ics_url = saved_ics_url()
    if ics_url:
        try:
            ics_result = import_ics_url(ics_url, persist=False)
            payload["ics"] = ics_result
            payload["events"] += int(ics_result.get("events") or 0)
            payload["tasks"] += int(ics_result.get("tasks") or 0)
            payload["sources"].append("brightspace_ics")
        except Exception as exc:
            errors.append(str(exc))
    if not payload["sources"] and not errors:
        payload["error"] = (
            "Add a Brightspace calendar feed in Settings → NYU, or connect Brightspace "
            "OAuth if NYU IT issued credentials."
        )
        return payload
    if errors:
        payload["error"] = "; ".join(errors)
    return payload


def status_payload() -> dict[str, Any]:
    ics = saved_ics_url()
    return {
        "brightspace_host": brightspace_host(),
        "oauth_configured": oauth_configured(),
        "connected": tokens_present(),
        "ics_saved": bool(ics),
        "ics_url": ics,
        "can_sync": can_sync(),
        "redirect_uri": _redirect_uri(),
        "apps": nyu_apps(),
        "limits": {
            "albert_api": False,
            "nyu_home_api": False,
            "master_campus_api": False,
            "student_self_serve_oauth": False,
        },
    }
