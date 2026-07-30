"""Send a failure-alert email for the boplats pipeline.

    python boplats_notify.py "<subject>" "<body>"

SMTP settings are read from the project .env (which is git-ignored — never
commit credentials). Required keys:

    SMTP_HOST        e.g. smtp.office365.com  or  smtp.gmail.com
    SMTP_USER        the sending mailbox / login
    SMTP_PASSWORD    password or (recommended) an app password
    SMTP_PORT        optional, default 587 (STARTTLS); 465 uses implicit SSL
    SMTP_FROM        optional, default = SMTP_USER
    ALERT_EMAIL      optional, default saraabo@chalmers.se  (the recipient)

If SMTP isn't configured, this prints a notice and exits 0 — a missing/failed
alert must never break the pipeline itself.
"""
import os
import ssl
import sys
import smtplib
from email.message import EmailMessage
from pathlib import Path

DEFAULT_RECIPIENT = "saraabo@chalmers.se"


def _load_env() -> dict:
    """.env values, with real environment variables taking precedence."""
    env = {}
    p = Path(__file__).with_name(".env")
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k, v in os.environ.items():
        if k.startswith("SMTP_") or k == "ALERT_EMAIL":
            env[k] = v
    return env


def main() -> int:
    subject = sys.argv[1] if len(sys.argv) > 1 else "Boplats pipeline alert"
    body = sys.argv[2] if len(sys.argv) > 2 else subject

    env = _load_env()
    host = env.get("SMTP_HOST")
    user = env.get("SMTP_USER")
    pw = env.get("SMTP_PASSWORD")
    port = int(env.get("SMTP_PORT", "587") or "587")
    sender = env.get("SMTP_FROM") or user
    recipient = env.get("ALERT_EMAIL", DEFAULT_RECIPIENT)

    if not (host and user and pw and sender):
        print("[notify] SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASSWORD "
              "in .env); skipping email.")
        return 0

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient
    msg.set_content(body)

    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=30, context=ctx) as s:
                s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.ehlo()
                s.starttls(context=ctx)
                s.login(user, pw)
                s.send_message(msg)
        print(f"[notify] alert emailed to {recipient}")
    except Exception as e:  # noqa: BLE001 — alerting must never crash the pipeline
        print(f"[notify] FAILED to send email: {type(e).__name__}: {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
