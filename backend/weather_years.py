"""
Real weather years for Swedish cities, from SMHI open data (smhi2epw, SB-Chalmers/epsm).

The simulations normally use a *typical* year (TMYx 2011–2025): good for annual
energy, but it smooths out cold spells, so it understates what a building or a
district heating network has to deliver in a hard winter. smhi2epw compiles an
actual year (e.g. the cold winter of 2010) from SMHI station observations, filling
gaps from nearby stations and ERA5, into a standard EPW file.

Files are compiled once and cached in data/epw/smhi/<city>_<year>.epw, next to a
JSON provenance receipt (sources, hashes, gap filling) that smhi2epw writes.
"""

from __future__ import annotations

import json
import threading
from datetime import date
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "epw" / "smhi"
FIRST_YEAR = 1999           # smhi2epw supports completed years from 1999 on

# Years worth offering by name (Gothenburg/Västra Götaland, SMHI climate summaries).
NOTABLE = {
    2010: "coldest winter in decades (very cold December)",
    2018: "hot, dry summer",
    2020: "very mild winter",
    2023: "recent year",
}

_locks: dict[str, threading.Lock] = {}
_status: dict[str, dict] = {}


def last_complete_year() -> int:
    return date.today().year - 1


def epw_path(city_id: str, year: int) -> Path:
    return OUT_DIR / f"{city_id}_{year}.epw"


def available(city_id: str) -> list[int]:
    if not OUT_DIR.exists():
        return []
    out = []
    for p in OUT_DIR.glob(f"{city_id}_*.epw"):
        try:
            out.append(int(p.stem.rsplit("_", 1)[1]))
        except ValueError:
            pass
    return sorted(out)


def notable_years() -> list[dict]:
    return [{"year": y, "note": n} for y, n in sorted(NOTABLE.items())
            if n and FIRST_YEAR <= y <= last_complete_year()]


def status(city_id: str, year: int) -> dict:
    key = f"{city_id}_{year}"
    if epw_path(city_id, year).exists():
        receipt = epw_path(city_id, year).with_suffix(".epw.json")
        return {"state": "ready", "provenance": receipt.name if receipt.exists() else None}
    return _status.get(key, {"state": "missing"})


def compile_year(city_id: str, year: int, lat: float, lon: float, city_name: str) -> Path:
    """Compile (or return the cached) EPW for one city and calendar year. Blocking (~20 s)."""
    if not FIRST_YEAR <= year <= last_complete_year():
        raise ValueError(f"Year must be between {FIRST_YEAR} and {last_complete_year()}.")
    path = epw_path(city_id, year)
    key = f"{city_id}_{year}"
    lock = _locks.setdefault(key, threading.Lock())
    with lock:
        if path.exists():
            return path
        from smhi2epw import EPWConfig, compile_epw
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        _status[key] = {"state": "compiling"}
        tmp = path.with_name(path.stem + ".partial.epw")
        try:
            # No station id: smhi2epw picks the nearest SMHI station with data for
            # that year and evaluates sun and sky at the city's own coordinates.
            name = "".join(ch for ch in city_name if ch not in ",\n") or city_id
            res = compile_epw(EPWConfig(year=year, output_path=str(tmp), city=name, country="SWE",
                                        latitude=lat, longitude=lon, cache_dir=str(OUT_DIR / "_cache")))
            tmp.replace(path)
            receipt = tmp.with_name(tmp.name + ".json")
            if receipt.exists():
                receipt.replace(path.with_name(path.name + ".json"))
            summary = {"station": getattr(res.station, "name", None),
                       "station_distance_km": res.coordinate_distance_km,
                       "filled_fraction": res.interpolated_fraction}
            path.with_name(path.name + ".summary.json").write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")
            _status.pop(key, None)
            return path
        except Exception as exc:
            _status[key] = {"state": "failed", "error": f"{type(exc).__name__}: {exc}"}
            tmp.unlink(missing_ok=True)
            raise


def summary(city_id: str, year: int) -> Optional[dict]:
    p = epw_path(city_id, year).with_name(f"{city_id}_{year}.epw.summary.json")
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
