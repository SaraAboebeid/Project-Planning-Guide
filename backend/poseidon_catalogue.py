"""Poseidon catalogue: the user's changes to the Wikells Sektionsdata catalogue,
their own catalogues (uploaded files) and supplier catalogues fetched from an
API with the user's key.

  edits        one JSON document: extra columns, cell overrides per item, rows
               the user added  (GET/PUT /api/poseidon/catalogue/edits)
  sources      one row per extra catalogue (kind 'upload' or 'api') with its
               items, already mapped to the catalogue fields
  connectors   for kind 'api': endpoint, how to send the key, where the item
               list is in the response and which response field is which
               catalogue field. The API KEY is kept apart, in
               data/poseidon_secrets.sqlite3 (git-ignored — the stock database
               is shared through git), and NEVER sent back to the browser (only
               its last 4 characters); the backend calls the supplier itself, so
               the key never leaves the server.

Supplier APIs differ, so the connector is generic: any HTTPS endpoint that
returns JSON (a list of items, or an object holding one under `items_path`).
Stored in data/poseidon_stock.sqlite3 next to the stock data.
"""
from __future__ import annotations

import ipaddress
import json
import socket
import uuid
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

import sqlite3

from backend import poseidon_stock as ps
from backend.poseidon_stock import _connect, _now

_SCHEMA = """
CREATE TABLE IF NOT EXISTS catalogue_edits (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_sources (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('upload', 'api')),
    items      TEXT NOT NULL,
    columns    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_connectors (
    source_id   TEXT PRIMARY KEY REFERENCES catalogue_sources(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    auth        TEXT NOT NULL,
    auth_name   TEXT,
    api_key     TEXT,          -- unused: keys live in data/poseidon_secrets.sqlite3
    items_path  TEXT,
    mapping     TEXT NOT NULL,
    last_sync   TEXT,
    last_error  TEXT
);
"""

# Catalogue fields an item can carry; anything else is kept as an extra column.
FIELDS = ("id", "desc", "unit", "cost", "u", "co2", "group", "part")
NUMERIC = {"cost", "u", "co2"}
PARTS = {"Walls", "Windows", "Roof", "Floor"}
MAX_ITEMS = 20_000


def _db():
    con = _connect()
    con.executescript(_SCHEMA)
    con.execute("PRAGMA foreign_keys=ON")
    return con


# ── API keys: a separate, git-ignored database (data/poseidon_secrets.sqlite3) ──
def _secrets():
    path = ps.DB_PATH.parent / "poseidon_secrets.sqlite3"   # follows DB_PATH (tests point it elsewhere)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=10)
    con.execute("CREATE TABLE IF NOT EXISTS api_keys (source_id TEXT PRIMARY KEY, api_key TEXT NOT NULL)")
    return con


def _get_key(sid: str) -> str | None:
    with _secrets() as con:
        r = con.execute("SELECT api_key FROM api_keys WHERE source_id = ?", (sid,)).fetchone()
    return r[0] if r else None


def _set_key(sid: str, key: str | None) -> None:
    with _secrets() as con:
        if key:
            con.execute("INSERT OR REPLACE INTO api_keys VALUES (?, ?)", (sid, key))
        else:
            con.execute("DELETE FROM api_keys WHERE source_id = ?", (sid,))


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(" ", "").replace(" ", "")
    if "," in s and "." not in s:
        s = s.replace(",", ".")          # Swedish decimal comma
    s = s.replace(",", "")               # thousands separators
    try:
        return float(s)
    except ValueError:
        return None


def normalise_items(items: list[dict], columns: list[str] | None = None) -> tuple[list[dict], list[str]]:
    """Clean mapped items: numbers parsed, ids unique, extras kept as strings."""
    if len(items) > MAX_ITEMS:
        raise HTTPException(413, f"at most {MAX_ITEMS} items")
    out, seen, extra_cols = [], set(), list(columns or [])
    for n, raw in enumerate(items, 1):
        if not isinstance(raw, dict):
            continue
        it: dict[str, Any] = {}
        for k, v in raw.items():
            k = str(k)[:60]
            if k in NUMERIC:
                it[k] = _num(v)
            elif k == "part":
                it[k] = v if v in PARTS else None
            elif k in FIELDS:
                it[k] = None if v is None else str(v).strip()[:500]
            elif v not in (None, ""):
                it.setdefault("extra", {})[k] = str(v)[:500]
                if k not in extra_cols:
                    extra_cols.append(k)
        if not it.get("desc"):
            continue                      # a row without a description is not an item
        iid = it.get("id") or f"row-{n}"
        while iid in seen:
            iid += "'"
        seen.add(iid)
        it["id"] = iid
        out.append(it)
    return out, extra_cols[:40]


def _dig(obj: Any, path: str | None) -> Any:
    for part in [p for p in (path or "").split(".") if p]:
        obj = obj.get(part) if isinstance(obj, dict) else None
    return obj


def map_response(payload: Any, items_path: str | None, mapping: dict[str, str]) -> list[dict]:
    """Supplier JSON → catalogue items. `mapping` is catalogue field → response
    field (dotted paths allowed); unmapped response fields become extra columns."""
    rows = _dig(payload, items_path) if items_path else payload
    if isinstance(rows, dict):            # common shapes: {"items": [...]}, {"data": [...]}
        rows = next((v for k, v in rows.items() if isinstance(v, list)), None)
    if not isinstance(rows, list):
        raise HTTPException(502, "The response holds no list of items (check 'Item list path').")
    used = set(mapping.values())
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        it = {f: _dig(r, src) for f, src in mapping.items() if src}
        for k, v in r.items():
            if k not in used and not isinstance(v, (dict, list)):
                it[k] = v
        out.append(it)
    return out


def _check_url(url: str) -> None:
    """HTTPS only, and not to this machine or the private network: the backend
    makes the call, so a stored connector must not reach internal services."""
    u = urlparse(url)
    if u.scheme != "https" or not u.hostname:
        raise HTTPException(400, "The API address must start with https://")
    try:
        addrs = {a[4][0] for a in socket.getaddrinfo(u.hostname, u.port or 443)}
    except socket.gaierror:
        raise HTTPException(400, f"Cannot resolve {u.hostname}")
    for a in addrs:
        ip = ipaddress.ip_address(a)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(400, "The API address points to a private or local network")


def fetch_supplier(url: str, auth: str, auth_name: str | None, key: str | None) -> Any:
    _check_url(url)
    headers, params = {"Accept": "application/json"}, {}
    if key:
        if auth == "bearer":
            headers["Authorization"] = f"Bearer {key}"
        elif auth == "header":
            headers[auth_name or "X-API-Key"] = key
        elif auth == "query":
            params[auth_name or "api_key"] = key
    try:
        r = httpx.get(url, headers=headers, params=params, timeout=30, follow_redirects=False)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach the supplier: {type(e).__name__}")
    if r.status_code in (401, 403):
        raise HTTPException(502, f"The supplier refused the key (HTTP {r.status_code})")
    if r.status_code >= 400:
        raise HTTPException(502, f"The supplier answered HTTP {r.status_code}")
    if len(r.content) > 20_000_000:
        raise HTTPException(413, "The supplier response is larger than 20 MB")
    try:
        return r.json()
    except ValueError:
        raise HTTPException(502, "The supplier did not return JSON")


# ── storage ──────────────────────────────────────────────────────────────────
def _mask(key: str | None) -> str | None:
    return None if not key else ("•" * 6 + key[-4:] if len(key) > 4 else "•" * 6)


def _source_out(row, con) -> dict:
    s = {"id": row["id"], "name": row["name"], "kind": row["kind"], "updated_at": row["updated_at"],
         "items": json.loads(row["items"]), "columns": json.loads(row["columns"])}
    c = con.execute("SELECT * FROM catalogue_connectors WHERE source_id = ?", (row["id"],)).fetchone()
    if c:
        s["connector"] = {"url": c["url"], "auth": c["auth"], "auth_name": c["auth_name"], "key_hint": _mask(_get_key(row["id"])),
                          "items_path": c["items_path"], "mapping": json.loads(c["mapping"]),
                          "last_sync": c["last_sync"], "last_error": c["last_error"]}
    return s


def get_state() -> dict:
    with _db() as con:
        e = con.execute("SELECT value FROM catalogue_edits WHERE id = 1").fetchone()
        rows = con.execute("SELECT * FROM catalogue_sources ORDER BY updated_at").fetchall()
        return {"edits": json.loads(e["value"]) if e else None, "sources": [_source_out(r, con) for r in rows]}


def put_edits(value: Any) -> Any:
    blob = json.dumps(value)
    if len(blob) > 5_000_000:
        raise HTTPException(413, "edits too large")
    with _db() as con:
        con.execute("INSERT OR REPLACE INTO catalogue_edits VALUES (1, ?, ?)", (blob, _now()))
    return value


def _get_source(con, sid: str) -> dict:
    r = con.execute("SELECT * FROM catalogue_sources WHERE id = ?", (sid,)).fetchone()
    if not r:
        raise HTTPException(404, "No such catalogue")
    return _source_out(r, con)


class UploadIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    items: list[dict]
    columns: list[str] = []


def create_upload(body: UploadIn) -> dict:
    items, cols = normalise_items(body.items, body.columns)
    if not items:
        raise HTTPException(400, "No rows with a description — check the column mapping")
    sid = uuid.uuid4().hex[:10]
    with _db() as con:
        con.execute("INSERT INTO catalogue_sources VALUES (?,?,?,?,?,?)",
                    (sid, body.name.strip(), "upload", json.dumps(items), json.dumps(cols), _now()))
        return _get_source(con, sid)


class ConnectorIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=8, max_length=2000)
    auth: Literal["bearer", "header", "query", "none"] = "bearer"
    auth_name: str | None = Field(default=None, max_length=80)
    api_key: str | None = Field(default=None, max_length=4000)   # None/"" on update = keep the stored key
    items_path: str | None = Field(default=None, max_length=200)
    mapping: dict[str, str] = {}


def _clean_mapping(m: dict[str, str]) -> dict[str, str]:
    return {k: v.strip()[:200] for k, v in m.items() if k in FIELDS and isinstance(v, str) and v.strip()}


def save_connector(body: ConnectorIn, sid: str | None = None) -> dict:
    urlparse(body.url)                    # syntax; reachability is checked on sync
    if not body.url.lower().startswith("https://"):
        raise HTTPException(400, "The API address must start with https://")
    mapping = json.dumps(_clean_mapping(body.mapping))
    with _db() as con:
        if sid is None:
            sid = uuid.uuid4().hex[:10]
            con.execute("INSERT INTO catalogue_sources VALUES (?,?,?,?,?,?)", (sid, body.name.strip(), "api", "[]", "[]", _now()))
            con.execute("INSERT INTO catalogue_connectors (source_id, url, auth, auth_name, api_key, items_path, mapping) VALUES (?,?,?,?,?,?,?)",
                        (sid, body.url, body.auth, body.auth_name, None, body.items_path, mapping))
            _set_key(sid, body.api_key or None)
        else:
            if not con.execute("SELECT 1 FROM catalogue_connectors WHERE source_id = ?", (sid,)).fetchone():
                raise HTTPException(404, "No such connection")
            con.execute("UPDATE catalogue_sources SET name = ? WHERE id = ?", (body.name.strip(), sid))
            con.execute("UPDATE catalogue_connectors SET url=?, auth=?, auth_name=?, items_path=?, mapping=? WHERE source_id=?",
                        (body.url, body.auth, body.auth_name, body.items_path, mapping, sid))
            if body.api_key:
                _set_key(sid, body.api_key)
        return _get_source(con, sid)


def sync_connector(sid: str, fetch=fetch_supplier) -> dict:
    with _db() as con:
        c = con.execute("SELECT * FROM catalogue_connectors WHERE source_id = ?", (sid,)).fetchone()
    if not c:
        raise HTTPException(404, "No such connection")
    try:
        payload = fetch(c["url"], c["auth"], c["auth_name"], _get_key(sid))
        items, cols = normalise_items(map_response(payload, c["items_path"], json.loads(c["mapping"])))
    except HTTPException as e:
        with _db() as con:
            con.execute("UPDATE catalogue_connectors SET last_error = ? WHERE source_id = ?", (str(e.detail), sid))
        raise
    with _db() as con:
        con.execute("UPDATE catalogue_sources SET items = ?, columns = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(items), json.dumps(cols), _now(), sid))
        con.execute("UPDATE catalogue_connectors SET last_sync = ?, last_error = NULL WHERE source_id = ?", (_now(), sid))
        return _get_source(con, sid)


def delete_source(sid: str) -> dict:
    with _db() as con:
        con.execute("DELETE FROM catalogue_connectors WHERE source_id = ?", (sid,))
        con.execute("DELETE FROM catalogue_sources WHERE id = ?", (sid,))
    _set_key(sid, None)
    return {"deleted": sid}


class AnyValue(BaseModel):
    value: Any = None


router = APIRouter(prefix="/api/poseidon/catalogue")


@router.get("")
async def catalogue_state():
    return await run_in_threadpool(get_state)


@router.put("/edits")
async def catalogue_edits(body: AnyValue):
    return {"value": await run_in_threadpool(put_edits, body.value)}


@router.post("/sources")
async def catalogue_upload(body: UploadIn):
    return await run_in_threadpool(create_upload, body)


@router.delete("/sources/{sid}")
async def catalogue_delete(sid: str):
    return await run_in_threadpool(delete_source, sid)


@router.post("/connectors")
async def connector_create(body: ConnectorIn):
    return await run_in_threadpool(save_connector, body)


@router.put("/connectors/{sid}")
async def connector_update(sid: str, body: ConnectorIn):
    return await run_in_threadpool(save_connector, body, sid)


@router.post("/connectors/{sid}/sync")
async def connector_sync(sid: str):
    return await run_in_threadpool(sync_connector, sid)
