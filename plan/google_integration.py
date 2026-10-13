"""Google account integration: Gmail send, Docs read, Sheets read/write, Calendar
sync -- all gated on the same thing, a free OAuth client you create yourself in
Google Cloud Console (a few clicks, no cost, no server hosting required).

This uses the "installed app" OAuth flow: `run_local_server()` opens your browser
for the Google consent screen, then catches the redirect on a random local port on
your own machine. No public/hosted server is needed for this to work -- that was a
wrong assumption to correct, not a missing feature.

Setup (one-time, you do this once in a browser):
1. https://console.cloud.google.com/ -> create a project (free)
2. APIs & Services -> OAuth consent screen -> External -> fill the required fields
3. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID -> Desktop app
4. Copy the Client ID and Client Secret into Planner's Settings -> Integrations tab
5. Click "Connect Google Account" -- a browser window opens, you approve, done
"""
import base64
import csv
import io
import json
from email.mime.text import MIMEText

import db

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.readonly",
]

GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet"
GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"


class NotConfigured(Exception):
    """Raised when no Google client ID/secret has been entered in Settings yet."""


class NotConnected(Exception):
    """Raised when the client ID/secret exist but you haven't clicked Connect yet."""


def _client_config():
    settings = db.get_settings()
    client_id = settings.get("google_client_id")
    client_secret = settings.get("google_client_secret")
    if not client_id or not client_secret:
        raise NotConfigured("Enter a Google OAuth client ID + secret in Settings -> Integrations first.")
    return {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }


def is_configured():
    settings = db.get_settings()
    return bool(settings.get("google_client_id") and settings.get("google_client_secret"))


def is_connected():
    return bool(db.get_settings().get("google_credentials"))


def connect():
    """Blocking: opens your browser for the consent screen, waits for you to
    approve, then stores the resulting tokens. Called from a button click, not
    automatically -- this is a one-time interactive step. Bounded to 3 minutes so
    a browser window that never gets approved (or never opens) fails with a clear
    error instead of hanging the request forever.
    """
    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_config(_client_config(), SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True, timeout_seconds=180)
    db.save_settings({"google_credentials": creds.to_json()})
    return True


def disconnect():
    db.save_settings({"google_credentials": ""})


def get_credentials():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    raw = db.get_settings().get("google_credentials")
    if not raw:
        raise NotConnected("Click 'Connect Google Account' in Settings -> Integrations first.")
    creds = Credentials.from_authorized_user_info(json.loads(raw), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        db.save_settings({"google_credentials": creds.to_json()})
    return creds


def _service(name, version):
    from googleapiclient.discovery import build
    return build(name, version, credentials=get_credentials())


def send_gmail(to, subject, body):
    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return _service("gmail", "v1").users().messages().send(userId="me", body={"raw": raw}).execute()


def read_doc(doc_id):
    doc = _service("docs", "v1").documents().get(documentId=doc_id).execute()
    text = []
    for element in doc.get("body", {}).get("content", []):
        para = element.get("paragraph")
        if not para:
            continue
        for run in para.get("elements", []):
            text.append(run.get("textRun", {}).get("content", ""))
    return "".join(text)


def read_sheet(spreadsheet_id, cell_range):
    result = _service("sheets", "v4").spreadsheets().values().get(
        spreadsheetId=spreadsheet_id, range=cell_range
    ).execute()
    return result.get("values", [])


def write_sheet(spreadsheet_id, cell_range, values):
    return _service("sheets", "v4").spreadsheets().values().update(
        spreadsheetId=spreadsheet_id, range=cell_range,
        valueInputOption="USER_ENTERED", body={"values": values},
    ).execute()


def list_calendar_events(max_results=20):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    result = _service("calendar", "v3").events().list(
        calendarId="primary", timeMin=now, maxResults=max_results, singleEvents=True, orderBy="startTime",
    ).execute()
    return result.get("items", [])


def create_calendar_event(title, start_iso, end_iso, description=""):
    body = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_iso},
        "end": {"dateTime": end_iso},
    }
    return _service("calendar", "v3").events().insert(calendarId="primary", body=body).execute()


def _stored_scopes():
    raw = db.get_settings().get("google_credentials")
    if not raw:
        return set()
    try:
        payload = json.loads(raw)
        scopes = payload.get("scopes") or []
        if isinstance(scopes, str):
            scopes = scopes.split()
        return set(scopes)
    except (json.JSONDecodeError, TypeError):
        return set()


def drive_scope_status():
    """Report whether the stored OAuth token includes Drive read access."""
    stored = _stored_scopes()
    drive_scope = "https://www.googleapis.com/auth/drive.readonly"
    if drive_scope in stored:
        return {
            "drive_readonly": True,
            "reconnect_required": False,
            "message": "Drive read-only scope is authorized.",
        }
    return {
        "drive_readonly": False,
        "reconnect_required": True,
        "message": (
            "Drive import needs the drive.readonly scope. Reconnect Google in "
            "Settings → Integrations to grant it (Docs/Sheets API scopes alone are not enough "
            "for listing arbitrary Drive files)."
        ),
    }


def _drive_service():
    return _service("drive", "v3")


def list_drive_files(page_size=50, max_results=100):
    """List Drive files (metadata only). Skips folders."""
    service = _drive_service()
    files = []
    page_token = None
    while len(files) < max_results:
        resp = service.files().list(
            pageSize=min(page_size, max_results - len(files)),
            fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
            q="trashed=false",
            pageToken=page_token,
        ).execute()
        for item in resp.get("files", []):
            if item.get("mimeType") == GOOGLE_FOLDER_MIME:
                continue
            files.append(item)
            if len(files) >= max_results:
                break
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def iter_drive_files_for_import(max_results=50):
    """Yield Drive file metadata up to max_results (read-only listing)."""
    status = drive_scope_status()
    if not status.get("drive_readonly"):
        raise NotConnected(status["message"])
    yielded = 0
    for item in list_drive_files(max_results=max_results):
        yield item
        yielded += 1
        if yielded >= max_results:
            break


def _sheet_values_to_csv(values):
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in values or []:
        writer.writerow(row)
    return buf.getvalue().encode("utf-8")


def export_drive_file_copy(file_meta):
    """Download or export a Drive file as local bytes. Never mutates the original."""
    file_id = file_meta["id"]
    name = file_meta.get("name") or "untitled"
    mime = file_meta.get("mimeType") or ""

    if mime == GOOGLE_DOC_MIME:
        text = read_doc(file_id)
        safe_name = name if name.lower().endswith(".txt") else f"{name}.txt"
        return safe_name, (text or "").encode("utf-8"), "text/plain"

    if mime == GOOGLE_SHEET_MIME:
        values = read_sheet(file_id, "A1:ZZ2000")
        safe_name = name if name.lower().endswith(".csv") else f"{name}.csv"
        return safe_name, _sheet_values_to_csv(values), "text/csv"

    service = _drive_service()
    content = service.files().get_media(fileId=file_id).execute()
    if isinstance(content, str):
        content = content.encode("utf-8")
    return name, content, mime or "application/octet-stream"
