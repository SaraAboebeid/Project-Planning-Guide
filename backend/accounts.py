"""
Email sign-in and saved projects.

Sign-in is passwordless: the user types an email from an allowed organisation,
gets a one-time link (15 min), and opening it starts a 30-day session held in
an HttpOnly cookie. Each account sees only its own saved projects.

Storage is a separate SQLite file, data/accounts.sqlite3 (git-ignored: it holds
email addresses and project contents such as building owners). Tokens are
stored only as SHA-256 hashes, so a copy of the database cannot be used to
sign in.

Settings (.env):
  AUTH_ALLOWED_DOMAINS  comma-separated; subdomains are allowed too
                        (default: the partner organisations below)
  APP_BASE_URL          where the sign-in link points, e.g. https://planner.example.se
                        (default: the requesting localhost origin, for development)
  SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_PORT / SMTP_FROM
                        same names as boplats_notify.py. Without them the link is
                        printed to the backend log instead of emailed.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "accounts.sqlite3"

DEFAULT_DOMAINS = "chalmers.se,framtiden.se,poseidon.goteborg.se,nacka.se,chalmersnextlabs.se,hsb.se"
LINK_TTL_S = 15 * 60
SESSION_TTL_S = 30 * 24 * 3600
COOKIE = "ppg_session"
MAX_PROJECT_BYTES = 25 * 1024 * 1024

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at REAL NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    summary TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_email ON projects(email, updated_at);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(_SCHEMA)
    return con


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── Who may sign up ───────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@([A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+)$")


def allowed_domains() -> list[str]:
    raw = os.getenv("AUTH_ALLOWED_DOMAINS", "").strip() or DEFAULT_DOMAINS
    return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]


def email_allowed(email: str) -> bool:
    m = _EMAIL_RE.match(email)
    if not m:
        return False
    domain = m.group(1).lower()
    return any(domain == d or domain.endswith("." + d) for d in allowed_domains())


# Not a security boundary on its own (tokens are), just keeps the form from
# being used to flood someone's inbox.
_RATE: dict[str, list[float]] = {}


def _rate_ok(key: str, limit: int, window_s: int = 900) -> bool:
    now = time.time()
    hits = [t for t in _RATE.get(key, []) if now - t < window_s]
    if len(hits) >= limit:
        _RATE[key] = hits
        return False
    _RATE[key] = hits + [now]
    return True


# ── Sending the link ──────────────────────────────────────────────────────────

_LOCAL_ORIGINS = {
    "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5180",
    "http://127.0.0.1:5180", "http://localhost:8080", "http://127.0.0.1:8080",
}


def _base_url(request: Request) -> str:
    # Never build the link from an arbitrary Host/Origin header: a forged one
    # would mail the victim a link that hands their token to another site.
    configured = os.getenv("APP_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    origin = (request.headers.get("origin") or "").rstrip("/")
    return origin if origin in _LOCAL_ORIGINS else "http://localhost:5173"


def _smtp_settings() -> Optional[dict]:
    host, user, pw = os.getenv("SMTP_HOST"), os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")
    if not (host and user and pw):
        return None
    return {"host": host, "user": user, "pw": pw,
            "port": int(os.getenv("SMTP_PORT", "587") or "587"),
            "sender": os.getenv("SMTP_FROM") or user}


def _send_link(email: str, link: str) -> str:
    """Email the link; returns "email", or "log" when SMTP isn't configured."""
    cfg = _smtp_settings()
    if cfg is None:
        print(f"[auth] SMTP not configured — sign-in link for {email}: {link}", flush=True)
        return "log"
    msg = EmailMessage()
    msg["Subject"] = "Sign in to the Renovation Planning Toolbox"
    msg["From"] = cfg["sender"]
    msg["To"] = email
    msg.set_content(
        "Click the link below to sign in. It works once and expires in 15 minutes.\n\n"
        f"{link}\n\n"
        "If you didn't ask to sign in, you can ignore this email.\n"
    )
    ctx = ssl.create_default_context()
    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=30, context=ctx) as s:
            s.login(cfg["user"], cfg["pw"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as s:
            s.starttls(context=ctx)
            s.login(cfg["user"], cfg["pw"])
            s.send_message(msg)
    return "email"


# ── Sessions ──────────────────────────────────────────────────────────────────

def current_email(request: Request) -> Optional[str]:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    con = _connect()
    try:
        row = con.execute("SELECT email, expires_at FROM sessions WHERE token_hash = ?", (_hash(token),)).fetchone()
    finally:
        con.close()
    if not row or row["expires_at"] < time.time():
        return None
    return row["email"]


def _require_email(request: Request) -> str:
    email = current_email(request)
    if not email:
        raise HTTPException(401, "Sign in to use saved projects.")
    return email


def _secure(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return proto == "https"


router = APIRouter(prefix="/api")


class LinkRequest(BaseModel):
    email: str


@router.post("/auth/request-link")
async def request_link(req: LinkRequest, request: Request):
    email = req.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "That doesn't look like an email address.")
    if not email_allowed(email):
        raise HTTPException(403, "Sign-in is limited to partner organisations for now. "
                                 "Ask the project team if your organisation should be added.")
    ip = request.client.host if request.client else "?"
    if not (_rate_ok(f"e:{email}", 5) and _rate_ok(f"i:{ip}", 20)):
        raise HTTPException(429, "Too many sign-in links requested — wait a few minutes and try again.")

    token = secrets.token_urlsafe(32)
    con = _connect()
    try:
        con.execute("DELETE FROM login_tokens WHERE expires_at < ?", (time.time(),))
        con.execute("INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)",
                    (_hash(token), email, time.time() + LINK_TTL_S))
        con.commit()
    finally:
        con.close()
    link = f"{_base_url(request)}/login/verify?token={token}"
    try:
        delivery = await run_in_threadpool(_send_link, email, link)
    except Exception as exc:  # noqa: BLE001
        print(f"[auth] sending the sign-in email failed: {exc!r}", flush=True)
        raise HTTPException(502, "The sign-in email could not be sent. Try again later.")
    return {"ok": True, "delivery": delivery}


class VerifyRequest(BaseModel):
    token: str


@router.post("/auth/verify")
async def verify(req: VerifyRequest, request: Request, response: Response):
    con = _connect()
    try:
        row = con.execute("SELECT email, expires_at, used FROM login_tokens WHERE token_hash = ?",
                          (_hash(req.token),)).fetchone()
        if not row or row["used"] or row["expires_at"] < time.time():
            raise HTTPException(400, "This sign-in link has expired or was already used. Request a new one.")
        email = row["email"]
        con.execute("UPDATE login_tokens SET used = 1 WHERE token_hash = ?", (_hash(req.token),))
        session = secrets.token_urlsafe(32)
        con.execute("INSERT INTO sessions (token_hash, email, expires_at) VALUES (?, ?, ?)",
                    (_hash(session), email, time.time() + SESSION_TTL_S))
        con.execute("INSERT INTO users (email, created_at, last_login_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at",
                    (email, _now_iso(), _now_iso()))
        con.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        con.commit()
    finally:
        con.close()
    response.set_cookie(COOKIE, session, max_age=SESSION_TTL_S, httponly=True,
                        samesite="lax", secure=_secure(request), path="/")
    return {"email": email}


@router.get("/auth/me")
async def me(request: Request):
    return {"email": current_email(request)}


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        con = _connect()
        try:
            con.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash(token),))
            con.commit()
        finally:
            con.close()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


# ── Saved projects ────────────────────────────────────────────────────────────

class ProjectBody(BaseModel):
    name: str
    data: dict[str, Any]
    summary: Optional[dict[str, Any]] = None


def _row_meta(r: sqlite3.Row) -> dict:
    return {"id": r["id"], "name": r["name"], "summary": json.loads(r["summary"] or "{}"),
            "created_at": r["created_at"], "updated_at": r["updated_at"]}


def _encode(body: ProjectBody) -> tuple[str, str, str]:
    name = body.name.strip()[:120] or "Untitled project"
    data = json.dumps(body.data, ensure_ascii=False)
    if len(data.encode()) > MAX_PROJECT_BYTES:
        raise HTTPException(413, "This project is too large to save (over 25 MB).")
    return name, data, json.dumps(body.summary or {}, ensure_ascii=False)


@router.get("/projects")
async def list_projects(request: Request):
    email = _require_email(request)
    con = _connect()
    try:
        rows = con.execute("SELECT id, name, summary, created_at, updated_at FROM projects "
                           "WHERE email = ? ORDER BY updated_at DESC", (email,)).fetchall()
    finally:
        con.close()
    return {"projects": [_row_meta(r) for r in rows]}


@router.post("/projects")
async def create_project(body: ProjectBody, request: Request):
    email = _require_email(request)
    name, data, summary = _encode(body)
    pid, now = secrets.token_hex(8), _now_iso()
    con = _connect()
    try:
        con.execute("INSERT INTO projects (id, email, name, summary, data, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)", (pid, email, name, summary, data, now, now))
        con.commit()
    finally:
        con.close()
    return {"id": pid, "name": name, "updated_at": now}


def _owned(con: sqlite3.Connection, pid: str, email: str) -> sqlite3.Row:
    # Someone else's project answers exactly like a missing one.
    row = con.execute("SELECT * FROM projects WHERE id = ? AND email = ?", (pid, email)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found.")
    return row


@router.get("/projects/{pid}")
async def get_project(pid: str, request: Request):
    email = _require_email(request)
    con = _connect()
    try:
        row = _owned(con, pid, email)
    finally:
        con.close()
    return {**_row_meta(row), "data": json.loads(row["data"])}


@router.put("/projects/{pid}")
async def update_project(pid: str, body: ProjectBody, request: Request):
    email = _require_email(request)
    name, data, summary = _encode(body)
    now = _now_iso()
    con = _connect()
    try:
        _owned(con, pid, email)
        con.execute("UPDATE projects SET name = ?, summary = ?, data = ?, updated_at = ? WHERE id = ?",
                    (name, summary, data, now, pid))
        con.commit()
    finally:
        con.close()
    return {"id": pid, "name": name, "updated_at": now}


class RenameBody(BaseModel):
    name: str


@router.patch("/projects/{pid}")
async def rename_project(pid: str, body: RenameBody, request: Request):
    email = _require_email(request)
    name = body.name.strip()[:120] or "Untitled project"
    con = _connect()
    try:
        _owned(con, pid, email)
        con.execute("UPDATE projects SET name = ? WHERE id = ?", (name, pid))
        con.commit()
    finally:
        con.close()
    return {"id": pid, "name": name}


@router.delete("/projects/{pid}")
async def delete_project(pid: str, request: Request):
    email = _require_email(request)
    con = _connect()
    try:
        _owned(con, pid, email)
        con.execute("DELETE FROM projects WHERE id = ?", (pid,))
        con.commit()
    finally:
        con.close()
    return {"ok": True}
