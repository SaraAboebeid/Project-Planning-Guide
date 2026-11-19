"""Poseidon building stock: the user's manual corrections to the Boplats-derived
list shown on the Poseidon map (poseidon/ app).

One row per building outline the user has touched:
  status 'added'   = Poseidon owns it, though no Boplats floor plan showed it
  status 'removed' = matched from Boplats plans, but the user says it isn't Poseidon's

Buildings are keyed by the outline id used in poseidon/public/data/poseidon_map.json
(the centroid "lat,lon" to 5 decimals), and the addresses are stored alongside
so the list stays readable and usable if the outlines are ever rebuilt.

Stored in data/poseidon_stock.sqlite3.
"""
from __future__ import annotations

import datetime as _dt
import sqlite3
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "poseidon_stock.sqlite3"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS stock_edits (
    building_id   TEXT PRIMARY KEY,
    status        TEXT NOT NULL CHECK (status IN ('added', 'removed')),
    address       TEXT,
    all_addresses TEXT,
    lat           REAL,
    lon           REAL,
    updated_at    TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(_SCHEMA)
    return con


class Edit(BaseModel):
    id: str = Field(max_length=40)
    address: str | None = Field(default=None, max_length=300)
    all_addresses: str | None = Field(default=None, max_length=4000)
    lat: float | None = None
    lon: float | None = None


class EditSet(BaseModel):
    added: list[Edit] = Field(default_factory=list, max_length=20000)
    removed: list[Edit] = Field(default_factory=list, max_length=20000)


def _read() -> dict:
    with _connect() as con:
        rows = con.execute("SELECT * FROM stock_edits ORDER BY address").fetchall()
    out: dict = {"added": [], "removed": [], "updated_at": None}
    for r in rows:
        out[r["status"]].append({"id": r["building_id"], "address": r["address"], "all_addresses": r["all_addresses"],
                                 "lat": r["lat"], "lon": r["lon"], "updated_at": r["updated_at"]})
        out["updated_at"] = max(out["updated_at"] or "", r["updated_at"])
    return out


def _replace(body: EditSet) -> dict:
    """The map always sends its whole edit set, so saving = replace."""
    ids = [e.id for e in body.added] + [e.id for e in body.removed]
    if len(ids) != len(set(ids)):
        raise HTTPException(400, "A building cannot be both added and removed")
    now = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with _connect() as con:
        old = {r["building_id"]: r for r in con.execute("SELECT * FROM stock_edits")}
        con.execute("DELETE FROM stock_edits")
        for status, edits in (("added", body.added), ("removed", body.removed)):
            for e in edits:
                prev = old.get(e.id)
                # keep the original timestamp for rows that did not change
                ts = prev["updated_at"] if prev is not None and prev["status"] == status else now
                con.execute(
                    "INSERT INTO stock_edits VALUES (?,?,?,?,?,?,?)",
                    (e.id, status, e.address, e.all_addresses, e.lat, e.lon, ts),
                )
    return _read()


class AddressList(BaseModel):
    addresses: list[str] = Field(default_factory=list, max_length=20000)


def _epc_details(addresses: list[str]) -> dict:
    """Per address: heating system + certificate issue/expiry (the planner's own
    /api/epc/heating logic) and the property designation (fastighetsbeteckning,
    IdFastBet) from the Boverket EPC register. Gothenburg only."""
    import re
    from backend import main as m   # lazy: main imports this module

    heat = m.epc_heating(m.EpcHeatingRequest(addresses=addresses, city_id="gothenburg"))
    out = {a: dict(v) if v else {} for a, v in heat.get("results", {}).items()}
    if not heat.get("available", True):
        return {"results": out, "available": False}

    norm = lambda s: re.sub(r"\s+", "", (s or "").lower())
    wanted = {norm(a): a for a in addresses if norm(a)}
    if wanted:
        con = m._epc_con()
        try:
            keys = list(wanted)
            ph = ", ".join(["?"] * len(keys))
            rows = con.execute(
                "SELECT lower(regexp_replace(IdAdr, '\\s+', '', 'g')) AS k, IdFastBet, CAST(Godkand AS VARCHAR) "
                f"FROM epc WHERE IdKommun = ? AND lower(regexp_replace(IdAdr, '\\s+', '', 'g')) IN ({ph})",
                ["Göteborg", *keys],
            ).fetchall()
        finally:
            con.close()
        newest: dict[str, tuple[str, str]] = {}
        for k, fast, god in rows:
            if fast and (k not in newest or (god or "") > newest[k][1]):
                newest[k] = (fast, god or "")
        for k, (fast, _) in newest.items():
            out.setdefault(wanted[k], {})["property"] = fast
    return {"results": out, "available": True}


router = APIRouter(prefix="/api/poseidon")


@router.post("/epc-details")
async def epc_details(body: AddressList):
    return await run_in_threadpool(_epc_details, body.addresses)


@router.get("/stock-edits")
async def get_stock_edits():
    return await run_in_threadpool(_read)


@router.put("/stock-edits")
async def put_stock_edits(body: EditSet):
    return await run_in_threadpool(_replace, body)
