"""
SQLite-backed simulation datastore - replaces the old flat
data/simulation_database.json file.

The flat-JSON version did a full read-modify-write on every submit/status
update with no locking - fine for one interactive user, but concurrent
writes (e.g. a batch of 10 buildings all completing around the same time)
can race and silently drop records. SQLite's own file-level locking (plus
WAL mode, which lets reads proceed alongside a writer) makes concurrent
access safe without any external DB server.

Schema mirrors the old flat record shape exactly, plus two new columns
for multi-building batch runs (see backend/main.py's
/api/simulation-batch-submit):
  - batch_id: groups every building that was submitted together in one
    EPSM call (EPSM runs multiple IDFs under a single simulation_id, so
    batch_id == epsm_simulation_id for batch submissions; single-building
    submissions leave it NULL).
  - idf_idx: this building's position within its batch's idf_files list -
    EPSM's /parallel-results/ endpoint tags each result row with the same
    idf_idx, which is how a batch's results get mapped back to the right
    building.
"""

from __future__ import annotations

import json
import sqlite3
from math import radians, sin, cos, asin, sqrt
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "simulation_database.sqlite3"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    address TEXT,
    country TEXT NOT NULL,
    city_id TEXT,
    building_info TEXT NOT NULL,
    package_id TEXT NOT NULL DEFAULT 'baseline',
    package_label TEXT,
    batch_id TEXT,
    idf_idx INTEGER NOT NULL DEFAULT 0,
    epsm_simulation_id TEXT,
    epsm_task_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    submitted_at TEXT NOT NULL,
    completed_at TEXT,
    results TEXT,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_sim_epsm_id ON simulations(epsm_simulation_id);
CREATE INDEX IF NOT EXISTS idx_sim_batch_id ON simulations(batch_id);
CREATE INDEX IF NOT EXISTS idx_sim_latlon ON simulations(lat, lon);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(_SCHEMA)
    return con


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlmb = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlmb / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["building_info"] = json.loads(d["building_info"]) if d.get("building_info") else {}
    d["results"] = json.loads(d["results"]) if d.get("results") else None
    return d


def _bbox(lat: float, lon: float, radius_m: float) -> tuple[float, float, float, float]:
    """A loose lat/lon bounding box a bit wider than radius_m, as a cheap SQL
    pre-filter - exact distance is still checked in Python afterward."""
    lat_delta = (radius_m * 1.5) / 111_320
    lon_delta = (radius_m * 1.5) / (111_320 * max(cos(radians(lat)), 0.1))
    return lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta


def insert(record: dict) -> int:
    con = _connect()
    try:
        cur = con.execute(
            """INSERT INTO simulations
               (lat, lon, address, country, city_id, building_info, package_id, package_label,
                batch_id, idf_idx, epsm_simulation_id, epsm_task_id, status, submitted_at,
                completed_at, results, error)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                record["lat"], record["lon"], record.get("address"), record["country"], record.get("city_id"),
                json.dumps(record.get("building_info") or {}), record.get("package_id", "baseline"),
                record.get("package_label"), record.get("batch_id"), record.get("idf_idx", 0),
                record.get("epsm_simulation_id"), record.get("epsm_task_id"),
                record.get("status", "queued"), record["submitted_at"], record.get("completed_at"),
                json.dumps(record["results"]) if record.get("results") is not None else None,
                record.get("error"),
            ),
        )
        con.commit()
        return cur.lastrowid
    finally:
        con.close()


def evict_queued(lat: float, lon: float, package_id: str, radius_m: float = 20) -> None:
    """Delete previously-queued records for the SAME package at this
    location (mirrors submit_simulation()'s old eviction logic - a re-run
    of the same package shouldn't leave a stale queued row behind)."""
    con = _connect()
    try:
        lo_lat, hi_lat, lo_lon, hi_lon = _bbox(lat, lon, radius_m)
        rows = con.execute(
            """SELECT id, lat, lon FROM simulations
               WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                 AND package_id = ? AND status = 'queued'""",
            (lo_lat, hi_lat, lo_lon, hi_lon, package_id),
        ).fetchall()
        to_delete = [r["id"] for r in rows if _haversine_m(r["lat"], r["lon"], lat, lon) <= radius_m]
        if to_delete:
            con.executemany("DELETE FROM simulations WHERE id = ?", [(i,) for i in to_delete])
            con.commit()
    finally:
        con.close()


def update_by_epsm_id(epsm_simulation_id: str, idf_idx: Optional[int] = None, **fields: Any) -> None:
    """Update one (single-building) or one specific idf_idx row (batch) for
    a given epsm_simulation_id. Batch rows share the same epsm_simulation_id,
    so idf_idx must be given to target just one building's row in that case."""
    if not fields:
        return
    if "results" in fields and fields["results"] is not None:
        fields = {**fields, "results": json.dumps(fields["results"])}
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    params = list(fields.values()) + [epsm_simulation_id]
    where = "epsm_simulation_id = ?"
    if idf_idx is not None:
        where += " AND idf_idx = ?"
        params.append(idf_idx)
    con = _connect()
    try:
        con.execute(f"UPDATE simulations SET {set_clause} WHERE {where}", params)
        con.commit()
    finally:
        con.close()


def get_by_epsm_id(epsm_simulation_id: str) -> list[dict]:
    """All rows for a simulation_id - a single row for a normal submission,
    or one row per building for a batch submission."""
    con = _connect()
    try:
        rows = con.execute(
            "SELECT * FROM simulations WHERE epsm_simulation_id = ? ORDER BY idf_idx",
            (epsm_simulation_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        con.close()


def get_by_batch_id(batch_id: str) -> list[dict]:
    con = _connect()
    try:
        rows = con.execute(
            "SELECT * FROM simulations WHERE batch_id = ? ORDER BY idf_idx", (batch_id,)
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        con.close()


def find_nearest(lat: float, lon: float, radius_m: float, package_id: Optional[str] = None) -> Optional[dict]:
    con = _connect()
    try:
        lo_lat, hi_lat, lo_lon, hi_lon = _bbox(lat, lon, radius_m)
        query = "SELECT * FROM simulations WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?"
        params: list[Any] = [lo_lat, hi_lat, lo_lon, hi_lon]
        if package_id is not None:
            query += " AND package_id = ?"
            params.append(package_id)
        rows = con.execute(query, params).fetchall()
        best, best_dist = None, radius_m
        for r in rows:
            d = _haversine_m(r["lat"], r["lon"], lat, lon)
            if d <= best_dist:
                best_dist, best = d, r
        return {"record": _row_to_dict(best), "dist_m": round(best_dist, 1)} if best is not None else None
    finally:
        con.close()


def find_all_near(lat: float, lon: float, radius_m: float) -> list[dict]:
    con = _connect()
    try:
        lo_lat, hi_lat, lo_lon, hi_lon = _bbox(lat, lon, radius_m)
        rows = con.execute(
            "SELECT * FROM simulations WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (lo_lat, hi_lat, lo_lon, hi_lon),
        ).fetchall()
        hits = []
        for r in rows:
            d = _haversine_m(r["lat"], r["lon"], lat, lon)
            if d <= radius_m:
                hits.append((d, _row_to_dict(r)))
        hits.sort(key=lambda t: t[0])
        return [{"dist_m": round(d, 1), **rec} for d, rec in hits]
    finally:
        con.close()


def latest_batch_near(lat: float, lon: float, radius_m: float, package_id: str) -> Optional[dict]:
    """The most recent batch id covering this point for one package.

    Selects only the few columns it needs - unlike find_all_near, which returns
    whole records including the 8760-hour trace inside `results` and would be
    megabytes per building.
    """
    con = _connect()
    try:
        lo_lat, hi_lat, lo_lon, hi_lon = _bbox(lat, lon, radius_m)
        rows = con.execute(
            """SELECT lat, lon, epsm_simulation_id, submitted_at, status
               FROM simulations
               WHERE package_id = ? AND epsm_simulation_id IS NOT NULL
                 AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
               ORDER BY submitted_at DESC""",
            (package_id, lo_lat, hi_lat, lo_lon, hi_lon),
        ).fetchall()
        for r in rows:
            if _haversine_m(r["lat"], r["lon"], lat, lon) <= radius_m:
                return {"batch_id": r["epsm_simulation_id"], "submitted_at": r["submitted_at"], "status": r["status"]}
        return None
    finally:
        con.close()


def all_records() -> list[dict]:
    con = _connect()
    try:
        rows = con.execute("SELECT * FROM simulations ORDER BY id").fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        con.close()
