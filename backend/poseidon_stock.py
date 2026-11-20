"""Poseidon building stock: the user's manual corrections to the Boplats-derived
list shown on the Poseidon map (poseidon/ app).

One row per building outline the user has touched:
  status 'added'   = Poseidon owns it, though no Boplats floor plan showed it
  status 'removed' = matched from Boplats plans, but the user says it isn't Poseidon's

Buildings are keyed by the outline id used in poseidon/public/data/poseidon_map.json
(the centroid "lat,lon" to 5 decimals), and the addresses are stored alongside
so the list stays readable and usable if the outlines are ever rebuilt.

Also: values the user edits in the Building Table that feed the EPSM RC model
(building_edits), and the RC results per building body (rc_results, reused
while the inputs are unchanged) — see /rc-run.

Stored in data/poseidon_stock.sqlite3.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

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
-- Values the user typed into the Building Table that feed the RC model
-- (floors, height_m, building_use, footprint_m2, u_wall, u_window, u_roof),
-- one JSON object per table row (keyed by the row's first outline id).
CREATE TABLE IF NOT EXISTS building_edits (
    row_id     TEXT PRIMARY KEY,
    edits      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- RC results per building body AND input set (the body's edits + the model's
-- source + the weather file), so going back to an earlier value is instant too.
CREATE TABLE IF NOT EXISTS rc_cache (
    body_id     TEXT NOT NULL,
    inputs_key  TEXT NOT NULL,
    result      TEXT NOT NULL,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (body_id, inputs_key)
);
-- Certificate details per address (heating, dates, property designation) from
-- the Boverket register, a static extract: looked up once, kept.
CREATE TABLE IF NOT EXISTS epc_cache (
    address TEXT PRIMARY KEY,
    info    TEXT NOT NULL
);
-- Renovation wizard data, per table row (first outline id):
--   history: past renovations [{id, component, year, uValue?, note?}] — a
--            recorded U-value becomes today's U in the RC model
--   facade:  façade-inspection summary (defect counts per class, photo count,
--            street-view-only / low-detail flags) — the F criterion
CREATE TABLE IF NOT EXISTS renovation_history (
    row_id     TEXT PRIMARY KEY,
    history    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facade_inspections (
    row_id     TEXT PRIMARY KEY,
    summary    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- Saved renovation reports (the wizard's snapshot: ranking, measures, method).
CREATE TABLE IF NOT EXISTS reports (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    content    TEXT NOT NULL
);
-- Shared wizard settings (weights, AHP judgements, flagged buildings).
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(_SCHEMA)
    # Earlier builds kept one result per body (rc_results); carry those over once.
    if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rc_results'").fetchone():
        con.execute("INSERT OR IGNORE INTO rc_cache SELECT body_id, inputs_key, result, computed_at FROM rc_results")
        con.execute("DROP TABLE rc_results")
        con.commit()
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


# The register is a static yearly extract and the lookup takes 5–20 s for the
# whole stock (it also slowed every other request while it ran), so answers are
# saved in epc_cache and only new addresses are looked up.
_EPC_MEMO: dict[str, dict] = {}


def _epc_details(addresses: list[str]) -> dict:
    """Per address: heating system + certificate issue/expiry (the planner's own
    /api/epc/heating logic) and the property designation (fastighetsbeteckning,
    IdFastBet) from the Boverket EPC register. Gothenburg only."""
    if not _EPC_MEMO:
        with _connect() as con:
            _EPC_MEMO.update({r["address"]: json.loads(r["info"]) for r in con.execute("SELECT * FROM epc_cache")})
    todo = [a for a in addresses if a not in _EPC_MEMO]
    if todo:
        got = _epc_details_uncached(todo)
        if not got.get("available", True):
            return got
        rows = []
        for a in todo:
            _EPC_MEMO[a] = got["results"].get(a) or {}
            rows.append((a, json.dumps(_EPC_MEMO[a])))
        with _connect() as con:
            con.executemany("INSERT OR REPLACE INTO epc_cache VALUES (?,?)", rows)
    return {"results": {a: _EPC_MEMO[a] for a in addresses if _EPC_MEMO.get(a)}, "available": True}


def _epc_details_uncached(addresses: list[str]) -> dict:
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


# ── Building Table edits + EPSM RC runs ──────────────────────────────────────

# Table fields the RC model reads (backend/main.py _EDITABLE_MODEL_FIELDS + footprint).
MODEL_FIELDS = ("floors", "height_m", "building_use", "footprint_m2", "u_wall", "u_window", "u_roof", "u_floor")

# Bump when the stored result's shape changes, so older cache rows are redone.
RESULT_VERSION = "4"   # 2: + U-values used and their source; 3: floors/height checked against Atemp; 4: + envelope areas


def _clean_edits(edits: dict) -> dict:
    out = {}
    for k in MODEL_FIELDS:
        v = edits.get(k)
        if v is None or v == "":
            continue
        if k == "building_use":
            out[k] = str(v)[:40]
        else:
            try:
                fv = float(v)
            except (TypeError, ValueError):
                raise HTTPException(400, f"{k} must be a number")
            if not (0 < fv < 100000):
                raise HTTPException(400, f"{k} is out of range")
            out[k] = fv
    return out


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_building_edits() -> dict:
    with _connect() as con:
        return {r["row_id"]: json.loads(r["edits"]) for r in con.execute("SELECT * FROM building_edits")}


class RowEdits(BaseModel):
    edits: dict[str, Any] = Field(default_factory=dict)


def _put_building_edits(row_id: str, body: RowEdits) -> dict:
    e = _clean_edits(body.edits)
    with _connect() as con:
        if e:
            con.execute("INSERT OR REPLACE INTO building_edits VALUES (?,?,?)", (row_id, json.dumps(e), _now()))
        else:
            con.execute("DELETE FROM building_edits WHERE row_id = ?", (row_id,))
    return {"row_id": row_id, "edits": e}


class RcBody(BaseModel):
    id: str = Field(max_length=40)          # outline id ("lat,lon" centroid)
    lat: float
    lon: float
    address: str | None = None
    edits: dict[str, Any] = Field(default_factory=dict)
    # U-values from recorded renovations ("wall"/"roof"/"win"/"floor"); a value
    # typed into the table (edits) still wins, as in the planner.
    recorded_u: dict[str, float] = Field(default_factory=dict)
    # This body's share of the certificate's heated area (Atemp, m²) — the
    # measured floor area the geometry check holds floors and height against.
    atemp: float | None = None


# Floors/height sanity check against the certificate's Atemp. The building
# register's floor counts and heights disagree with each other for some
# buildings (1 floor at 21 m), and the model then gets a fraction of the real
# floor area — heating per m² comes out 3–6× too high and the building tops the
# ranking for the wrong reason. Atemp is measured, so it decides the floors.
STOREY_MIN_M, STOREY_MAX_M, STOREY_TYPICAL_M = 2.3, 4.5, 3.0


def _atemp_geometry(building: dict, atemp: float | None) -> tuple[dict, str]:
    """→ (building, flag). Flags: ok | floors_from_atemp | height_from_floors |
    floors_from_atemp+height | outline_mismatch (outline can't be this building)."""
    if not atemp or atemp <= 0:
        return building, "ok"
    try:
        fp = float(building.get("footprint_m2") or 0)
        floors = int(round(float(building.get("floors") or 0)))
        h = float(building.get("height") or 0)
    except (TypeError, ValueError):
        return building, "ok"
    if fp <= 0:
        return building, "ok"
    fl_a = atemp / fp
    if fl_a < 0.6 or fl_a > 40:        # e.g. a 6 m² fragment carrying an 8,000 m² certificate
        return building, "outline_mismatch"
    b, flag = dict(building), "ok"
    if floors <= 0 or abs(floors - fl_a) / fl_a > 0.35:
        b["floors"] = max(1, round(fl_a))
        flag = "floors_from_atemp"
    per = h / b["floors"] if h > 0 else 0
    if h > 0 and not (STOREY_MIN_M <= per <= STOREY_MAX_M):
        b["height"] = round(b["floors"] * STOREY_TYPICAL_M, 1)
        flag = "height_from_floors" if flag == "ok" else flag + "+height"
    return b, flag


def _clean_recorded(r: dict) -> dict:
    out = {}
    for k in ("wall", "roof", "win", "floor"):
        try:
            v = float(r.get(k)) if r.get(k) not in (None, "") else None
        except (TypeError, ValueError):
            v = None
        if v is not None and 0 < v < 10:
            out[k] = round(v, 4)
    return out


class RcRun(BaseModel):
    bodies: list[RcBody] = Field(max_length=200)
    force: bool = False


@lru_cache(maxsize=1)
def _model_token() -> str:
    """Changes when the RC model's code changes, so cached results are redone."""
    src = Path(__file__).with_name("rc_engine.py")
    return hashlib.sha1(src.read_bytes()).hexdigest()[:12] if src.exists() else "none"


def _epw_name() -> str:
    from backend import main as m
    m._se_cities()
    return m.CITY_TO_EPW.get("gothenburg")


def _inputs_key(b: "RcBody", epw_name: str) -> str:
    rec = _clean_recorded(b.recorded_u)
    parts = [_clean_edits(b.edits), _model_token(), epw_name, RESULT_VERSION,
             round(b.atemp) if b.atemp else None]
    if rec:   # only when present, so results cached before history existed stay valid
        parts.append(rec)
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()


def _u_sources(building: dict, edits: dict, archetype: str | None) -> dict:
    """Where each U-value the RC model used came from — the same precedence as
    rc_engine.model_inputs' today(): user/recorded > EPC > EPSM archetype > TABULA > default."""
    from tools.idf import defaults as D
    parts = set(D.EPSM_ARCHETYPE_PARTS) if archetype else set()
    out = {}
    for part, field in (("wall", "u_wall"), ("roof", "u_roof"), ("win", "u_window"), ("floor", "u_floor")):
        if edits.get(field):
            src = "you"
        elif building.get(f"u_{part}_recorded"):
            src = "recorded"
        elif building.get(f"u_{part}_epc"):
            src = "epc"
        elif part != "floor" and "fabric" in parts:
            src = "epsm"
        elif part == "floor" and "ground" in parts:
            src = "epsm"      # ISO 13370 slab from the archetype's floor construction
        elif building.get(f"tabula_u_{part}"):
            src = "tabula"
        else:
            src = "default"
        out[part] = src
    return out


def _saved_results(bodies: list["RcBody"], epw_name: str) -> tuple[dict, dict]:
    """Saved results still valid for these bodies' current inputs → (results, keys)."""
    keys = {b.id: _inputs_key(b, epw_name) for b in bodies}
    out: dict = {}
    wanted = list(keys.values())
    with _connect() as con:
        for i in range(0, len(wanted), 900):         # SQLite's bound-parameter limit
            part = wanted[i:i + 900]
            for r in con.execute(f"SELECT * FROM rc_cache WHERE inputs_key IN ({','.join('?' * len(part))})", part):
                if keys.get(r["body_id"]) == r["inputs_key"]:
                    out[r["body_id"]] = {**json.loads(r["result"]), "computed_at": r["computed_at"], "cached": True}
    return out, keys


class RcCachedRequest(BaseModel):
    bodies: list[RcBody] = Field(max_length=20000)


def _rc_cached(req: RcCachedRequest) -> dict:
    """Load saved RC results without simulating anything; list what needs a run
    (never run, or inputs changed since)."""
    res, _ = _saved_results(req.bodies, _epw_name())
    return {"results": res, "missing": [b.id for b in req.bodies if b.id not in res]}


def _rc_run(req: RcRun) -> dict:
    from backend import main as m
    from backend import rc_engine

    epw_name = _epw_name()
    epw = str(m.EPW_DIR / epw_name)
    cached, keys = _saved_results(req.bodies, epw_name) if not req.force else ({}, {b.id: _inputs_key(b, epw_name) for b in req.bodies})

    out, fresh = {}, []
    for b in req.bodies:
        if b.id in cached:
            out[b.id] = cached[b.id]
            continue
        try:
            e = _clean_edits(b.edits)
            building = m._resolve_sim_building("se", "gothenburg", b.lat, b.lon, None)
            c_lat, c_lon = m._polygon_centroid(building.get("coordinates") or [])
            # Recorded renovations first, then the table's own values on top (a
            # typed value wins). u_floor is not a Step 2 table field, so it goes
            # through the planner's recorded-U path too.
            rec = _clean_recorded(b.recorded_u)
            if e.get("u_floor"):
                rec["floor"] = e["u_floor"]
            building = m._with_recorded_u(building, rec or None)
            building = m._with_user_edits_then_fix(building, e or None, "se", "gothenburg")
            geometry = "ok"
            if not (e.get("floors") or e.get("height_m")):   # a value the user typed is the answer
                building, geometry = _atemp_geometry(building, b.atemp)
            r = rc_engine.simulate(building, "se", epw, {}, hourly=False)
            inp = r.get("inputs") or {}
            res = {
                "heating_kwh": r.get("heating_kwh"), "heating_kwh_m2_yr": r.get("heating_kwh_m2_yr"),
                "peak_heating_kw": r.get("peak_heating_kw"), "peak_heating_w_m2": r.get("peak_heating_w_m2"),
                "dhw_kwh": r.get("dhw_kwh"), "floor_area_m2": r.get("floor_area_m2"),
                # which outline the model used, so a wrong match can be spotted
                "model_address": building.get("address"),
                "model_offset_m": round(m._haversine_m(b.lat, b.lon, c_lat, c_lon), 1),
                # what the model actually used, so the table can show it (transparency)
                "u_used": inp.get("u"),
                "u_source": _u_sources(building, e, inp.get("archetype")),
                "archetype": inp.get("archetype"),
                "floors_used": building.get("floors"), "height_used": building.get("height"),
                "ach": inp.get("ach"), "setpoint_c": inp.get("setpoint_c"),
                "geometry": geometry, "atemp": b.atemp,
                # envelope areas the model used — the quantities measures are costed on
                "wall_area_m2": inp.get("wall_area_m2"), "window_area_m2": inp.get("window_area_m2"),
                "roof_area_m2": inp.get("roof_area_m2"),
            }
        except HTTPException as exc:
            res = {"error": str(exc.detail)}
        except Exception as exc:  # noqa: BLE001 — one odd outline must not sink the batch
            res = {"error": f"{type(exc).__name__}: {exc}"}
        now = _now()
        out[b.id] = {**res, "computed_at": now, "cached": False}
        if "error" not in res:
            fresh.append((b.id, keys[b.id], json.dumps(res), now))
    if fresh:
        with _connect() as con:
            con.executemany("INSERT OR REPLACE INTO rc_cache VALUES (?,?,?,?)", fresh)
    return {"engine": "EPSM RC (epsm_rc 5R1C)", "weather": epw_name, "results": out}


# ── Renovation wizard storage ────────────────────────────────────────────────

_KV_TABLES = {"history": ("renovation_history", "history"), "facade": ("facade_inspections", "summary")}


def _kv_all(kind: str) -> dict:
    table, col = _KV_TABLES[kind]
    with _connect() as con:
        return {r["row_id"]: json.loads(r[col]) for r in con.execute(f"SELECT row_id, {col} FROM {table}")}


def _kv_put(kind: str, row_id: str, value: Any) -> dict:
    table, col = _KV_TABLES[kind]
    if len(row_id) > 40:
        raise HTTPException(400, "bad row id")
    blob = json.dumps(value)
    if len(blob) > 200_000:
        raise HTTPException(413, "too large")
    empty = value in (None, {}, []) or (kind == "history" and not (value or {}).get("renovations"))
    with _connect() as con:
        if empty:
            con.execute(f"DELETE FROM {table} WHERE row_id = ?", (row_id,))
        else:
            con.execute(f"INSERT OR REPLACE INTO {table} (row_id, {col}, updated_at) VALUES (?,?,?)", (row_id, blob, _now()))
    return {"row_id": row_id, "value": None if empty else value}


def _settings_get(key: str) -> Any:
    with _connect() as con:
        r = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(r["value"]) if r else None


def _settings_put(key: str, value: Any) -> Any:
    if len(key) > 60 or len(json.dumps(value)) > 100_000:
        raise HTTPException(400, "bad setting")
    with _connect() as con:
        con.execute("INSERT OR REPLACE INTO settings VALUES (?,?,?)", (key, json.dumps(value), _now()))
    return value


class AnyValue(BaseModel):
    value: Any = None


class NewReport(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: dict[str, Any]


def _reports_list() -> list:
    with _connect() as con:
        rows = con.execute("SELECT id, title, created_at, content FROM reports ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        c = json.loads(r["content"])
        out.append({"id": r["id"], "title": r["title"], "created_at": r["created_at"],
                    "buildings": len(c.get("ranking") or []), "measures": len(c.get("measures") or [])})
    return out


def _report_get(rid: str) -> dict:
    with _connect() as con:
        r = con.execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()
    if not r:
        raise HTTPException(404, "No such report")
    return {"id": r["id"], "title": r["title"], "created_at": r["created_at"], "content": json.loads(r["content"])}


def _report_create(body: NewReport) -> dict:
    import uuid
    blob = json.dumps(body.content)
    if len(blob) > 5_000_000:
        raise HTTPException(413, "report too large")
    rid = uuid.uuid4().hex[:12]
    with _connect() as con:
        con.execute("INSERT INTO reports VALUES (?,?,?,?)", (rid, body.title.strip(), _now(), blob))
    return _report_get(rid)


def _report_delete(rid: str) -> dict:
    with _connect() as con:
        con.execute("DELETE FROM reports WHERE id = ?", (rid,))
    return {"deleted": rid}


router = APIRouter(prefix="/api/poseidon")


@router.get("/history")
async def get_history():
    return await run_in_threadpool(_kv_all, "history")


@router.put("/history/{row_id}")
async def put_history(row_id: str, body: AnyValue):
    return await run_in_threadpool(_kv_put, "history", row_id, body.value)


@router.get("/facade")
async def get_facade():
    return await run_in_threadpool(_kv_all, "facade")


@router.put("/facade/{row_id}")
async def put_facade(row_id: str, body: AnyValue):
    return await run_in_threadpool(_kv_put, "facade", row_id, body.value)


@router.get("/reports")
async def list_reports():
    return await run_in_threadpool(_reports_list)


@router.get("/reports/{rid}")
async def get_report(rid: str):
    return await run_in_threadpool(_report_get, rid)


@router.post("/reports")
async def create_report(body: NewReport):
    return await run_in_threadpool(_report_create, body)


@router.delete("/reports/{rid}")
async def delete_report(rid: str):
    return await run_in_threadpool(_report_delete, rid)


@router.get("/settings/{key}")
async def get_setting(key: str):
    return {"key": key, "value": await run_in_threadpool(_settings_get, key)}


@router.put("/settings/{key}")
async def put_setting(key: str, body: AnyValue):
    return {"key": key, "value": await run_in_threadpool(_settings_put, key, body.value)}


@router.get("/building-edits")
async def get_building_edits():
    return await run_in_threadpool(_get_building_edits)


@router.put("/building-edits/{row_id}")
async def put_building_edits(row_id: str, body: RowEdits):
    if len(row_id) > 40:
        raise HTTPException(400, "bad row id")
    return await run_in_threadpool(_put_building_edits, row_id, body)


@router.post("/rc-run")
async def rc_run(body: RcRun):
    return await run_in_threadpool(_rc_run, body)


@router.post("/rc-cached")
async def rc_cached(body: RcCachedRequest):
    return await run_in_threadpool(_rc_cached, body)


@router.post("/epc-details")
async def epc_details(body: AddressList):
    return await run_in_threadpool(_epc_details, body.addresses)


@router.get("/stock-edits")
async def get_stock_edits():
    return await run_in_threadpool(_read)


@router.put("/stock-edits")
async def put_stock_edits(body: EditSet):
    return await run_in_threadpool(_replace, body)
