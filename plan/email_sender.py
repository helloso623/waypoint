import os
import smtplib
from email.mime.text import MIMEText

EMAIL_MODE = os.environ.get("EMAIL_MODE", "smtp")  # "smtp" (local Mailpit) or "gmail"

SMTP_HOST = os.environ.get("SMTP_HOST", "localhost")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "1025"))
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "planner@localhost")
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "false").lower() == "true"

TO_EMAIL = os.environ.get("PLANNER_TO_EMAIL", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://127.0.0.1:5099")


class SendResult:
    def __init__(self, ok, detail):
        self.ok = ok
        self.detail = detail


def send(to_email, subject, body):
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM_EMAIL
    msg["To"] = to_email

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=4) as smtp:
            if SMTP_USE_TLS:
                smtp.starttls()
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        print(f"[smtp] sent to {to_email} via {SMTP_HOST}:{SMTP_PORT}: {subject!r}")
        return SendResult(True, f"sent via smtp ({SMTP_HOST}:{SMTP_PORT})")
    except (OSError, smtplib.SMTPException) as exc:
        print(f"[smtp] send to {to_email} FAILED: {exc}")
        return SendResult(False, str(exc))


def send_daily_form(date, yesterday_summary=""):
    """Sends the link to fill in today's hour grid + yesterday's AI summary."""
    if not TO_EMAIL:
        return SendResult(False, "PLANNER_TO_EMAIL not set")

    link = f"{APP_BASE_URL}/?date={date}"
    body_lines = [
        f"Today: {date}",
        "",
        f"Fill in your day: {link}",
        "",
    ]
    if yesterday_summary:
        body_lines += ["Yesterday's summary:", yesterday_summary, ""]

    body = "\n".join(body_lines)
    return send(TO_EMAIL, f"Daily planner - {date}", body)
