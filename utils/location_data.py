"""
Location and spatial data helpers for project-location selection and EPC coverage.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from math import cos, radians
from typing import Any

import requests


DB_PATH = Path(__file__).resolve().parents[1] / "data" / "sensitivity" / "epc_sweden.duckdb"

# Pattern: optional words then digits:digits — matches Swedish cadastral designations like "JÄRNBROTT 758:68"
_CADASTRAL_RE = re.compile(r'^.+\s+\d+:\d+\s*$')


def _is_cadastral_id(addr: str | None, fastbet: str | None = None) -> bool:
    """Return True when addr is a Swedish cadastral property designation, not a street address."""
    if not addr:
        return False
    addr_s = str(addr).strip()
    if fastbet and addr_s == str(fastbet).strip():
        return True
    return bool(_CADASTRAL_RE.match(addr_s))


@lru_cache(maxsize=512)
def _reverse_geocode_nominatim(lat: float, lon: float) -> str | None:
    """Attempt Nominatim reverse geocode; return 'Road HouseNumber' or None on failure."""
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lon, "format": "json"},
            headers={"User-Agent": "project-planning-guide/1.0"},
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
        parts = data.get("address", {})
        road = (
            parts.get("road")
            or parts.get("pedestrian")
            or parts.get("footway")
            or parts.get("path")
            or ""
        )
        house = parts.get("house_number", "")
        if road:
            return f"{road} {house}".strip() if house else road
    except Exception:
        pass
    return None


def _resolve_sample_addresses(df: Any) -> Any:
    """Post-process a sample DataFrame: replace cadastral IDs with reverse-geocoded addresses."""
    if df is None or df.empty:
        return df
    if "address" not in df.columns:
        return df
    for idx, row in df.iterrows():
        addr = row.get("address")
        fastbet = row.get("cadastral_id")
        if not _is_cadastral_id(addr, fastbet):
            continue
        lat = row.get("lat")
        lon = row.get("lon")
        if lat is not None and lon is not None:
            resolved = _reverse_geocode_nominatim(float(lat), float(lon))
            df.at[idx, "address"] = resolved if resolved else f"(property in {row.get('post_town', '?')})"
        else:
            df.at[idx, "address"] = f"(property in {row.get('post_town', '?')})"
    return df


def _connect_duckdb():
    """Open DuckDB connection and ensure spatial extension is available."""
    import duckdb

    con = duckdb.connect(str(DB_PATH), read_only=True)
    try:
        con.execute("LOAD spatial")
    except Exception:
        # First run on a machine may need install.
        con.execute("INSTALL spatial")
        con.execute("LOAD spatial")
    return con


@lru_cache(maxsize=512)
def geocode_address(address: str, country_hint: str | None = None) -> dict[str, Any] | None:
    """Geocode an address using OpenStreetMap Nominatim."""
    q = (address or "").strip()
    if not q:
        return None

    if country_hint:
        q = f"{q}, {country_hint}"

    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": q,
            "format": "jsonv2",
            "limit": 1,
            "addressdetails": 1,
        },
        headers={"User-Agent": "project-planning-guide/1.0"},
        timeout=12,
    )
    response.raise_for_status()
    data = response.json()
    if not data:
        return None

    first = data[0]
    return {
        "lat": float(first["lat"]),
        "lon": float(first["lon"]),
        "display_name": first.get("display_name", address),
    }


@lru_cache(maxsize=256)
def get_nearby_epc_snapshot(
    lat: float,
    lon: float,
    radius_m: int = 800,
    point_limit: int = 1200,
) -> dict[str, Any]:
    """Return nearby footprint points plus EPC availability summary."""
    lat_delta = radius_m / 111_320
    lon_delta = radius_m / (111_320 * max(cos(radians(lat)), 0.1))

    query_nearby_cte = """
    WITH pts AS (
      SELECT FormularId,
             st_x(st_centroid(st_geomfromwkb(geom))) AS lon,
             st_y(st_centroid(st_geomfromwkb(geom))) AS lat
      FROM footprints
    ), nearby AS (
      SELECT FormularId, lon, lat,
      6371000 * acos(
          least(1.0, greatest(-1.0,
              cos(radians(?)) * cos(radians(lat)) * cos(radians(lon) - radians(?)) +
              sin(radians(?)) * sin(radians(lat))
          ))
      ) AS distance_m
      FROM pts
      WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
    )
    """
    params_base = [
        lat,
        lon,
        lat,
        lat - lat_delta,
        lat + lat_delta,
        lon - lon_delta,
        lon + lon_delta,
    ]

    con = _connect_duckdb()
    try:
        points_df = con.execute(
            query_nearby_cte
            + """
            SELECT
                n.FormularId,
                n.lat,
                n.lon,
                n.distance_m,
                e.IdAdr AS address,
                e.IdFastBet AS cadastral_id,
                e.IdPostort AS post_town,
                e.IdKommun AS municipality,
                e.EgiEnergiklass AS energy_class,
                e.EgiEnergiPrestanda AS energy_performance,
                e.EgenNybyggAr AS build_year,
                e.EgenAtemp AS atemp
            FROM nearby n
            LEFT JOIN epc e USING (FormularId)
            WHERE distance_m <= ?
            ORDER BY distance_m
            LIMIT ?
            """,
            [*params_base, radius_m, point_limit],
        ).fetchdf()

        summary = con.execute(
            query_nearby_cte
            + """
            SELECT
                count(*) FILTER (WHERE n.distance_m <= ?) AS footprint_points,
                count(DISTINCT n.FormularId) FILTER (WHERE n.distance_m <= ?) AS footprint_buildings,
                count(DISTINCT n.FormularId) FILTER (WHERE n.distance_m <= ? AND e.FormularId IS NOT NULL) AS epc_linked_buildings,
                count(e.FormularId) FILTER (WHERE n.distance_m <= ?) AS epc_records,
                count(e.EgiEnergiklass) FILTER (WHERE n.distance_m <= ?) AS has_energy_class,
                count(e.EgiEnergiPrestanda) FILTER (WHERE n.distance_m <= ?) AS has_energy_performance,
                count(e.EgenNybyggAr) FILTER (WHERE n.distance_m <= ?) AS has_build_year,
                count(e.EgenAtemp) FILTER (WHERE n.distance_m <= ?) AS has_atemp
            FROM nearby n
            LEFT JOIN epc e USING (FormularId)
            """,
            [*params_base, radius_m, radius_m, radius_m, radius_m, radius_m, radius_m, radius_m, radius_m],
        ).fetchone()

        classes_df = con.execute(
            query_nearby_cte
            + """
            SELECT
                COALESCE(e.EgiEnergiklass, 'Unknown') AS energy_class,
                count(*) AS records
            FROM nearby n
            JOIN epc e USING (FormularId)
            WHERE n.distance_m <= ?
            GROUP BY 1
            ORDER BY records DESC
            LIMIT 8
            """,
            [*params_base, radius_m],
        ).fetchdf()

        sample_df = con.execute(
            query_nearby_cte
            + """
            SELECT
                n.lat,
                n.lon,
                e.IdAdr AS address,
                e.IdFastBet AS cadastral_id,
                e.IdPostort AS post_town,
                e.IdKommun AS municipality,
                e.EgiEnergiklass AS energy_class,
                e.EgiEnergiPrestanda AS energy_performance,
                n.distance_m
            FROM nearby n
            JOIN epc e USING (FormularId)
            WHERE n.distance_m <= ?
              AND e.IdAdr IS NOT NULL
            ORDER BY n.distance_m
            LIMIT 30
            """,
            [*params_base, radius_m],
        ).fetchdf()
    finally:
        con.close()

    summary_dict = {
        "footprint_points": int(summary[0] or 0),
        "footprint_buildings": int(summary[1] or 0),
        "epc_linked_buildings": int(summary[2] or 0),
        "epc_records": int(summary[3] or 0),
        "has_energy_class": int(summary[4] or 0),
        "has_energy_performance": int(summary[5] or 0),
        "has_build_year": int(summary[6] or 0),
        "has_atemp": int(summary[7] or 0),
        "radius_m": int(radius_m),
    }

    _resolve_sample_addresses(sample_df)
    sample_df.drop(columns=[c for c in ("lat", "lon", "cadastral_id") if c in sample_df.columns], inplace=True)

    return {
        "summary": summary_dict,
        "points": points_df,
        "classes": classes_df,
        "sample": sample_df,
    }


@lru_cache(maxsize=256)
def get_epc_snapshot_for_bbox(
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
    point_limit: int = 2500,
) -> dict[str, Any]:
    """Return footprint points + EPC availability summary for a drawn bbox."""
    lo_lat, hi_lat = sorted([min_lat, max_lat])
    lo_lon, hi_lon = sorted([min_lon, max_lon])

    query_bbox_cte = """
    WITH pts AS (
      SELECT FormularId,
             st_x(st_centroid(st_geomfromwkb(geom))) AS lon,
             st_y(st_centroid(st_geomfromwkb(geom))) AS lat
      FROM footprints
    ), in_box AS (
      SELECT FormularId, lon, lat
      FROM pts
      WHERE lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
    )
    """

    con = _connect_duckdb()
    try:
        points_df = con.execute(
            query_bbox_cte
            + """
            SELECT
                b.FormularId,
                b.lat,
                b.lon,
                e.IdAdr AS address,
                e.IdFastBet AS cadastral_id,
                e.IdPostort AS post_town,
                e.IdKommun AS municipality,
                e.EgiEnergiklass AS energy_class,
                e.EgiEnergiPrestanda AS energy_performance,
                e.EgenNybyggAr AS build_year,
                e.EgenAtemp AS atemp
            FROM in_box b
            LEFT JOIN epc e USING (FormularId)
            LIMIT ?
            """,
            [lo_lat, hi_lat, lo_lon, hi_lon, point_limit],
        ).fetchdf()

        summary = con.execute(
            query_bbox_cte
            + """
            SELECT
                count(*) AS footprint_points,
                count(DISTINCT b.FormularId) AS footprint_buildings,
                count(DISTINCT b.FormularId) FILTER (WHERE e.FormularId IS NOT NULL) AS epc_linked_buildings,
                count(e.FormularId) AS epc_records,
                count(e.EgiEnergiklass) AS has_energy_class,
                count(e.EgiEnergiPrestanda) AS has_energy_performance,
                count(e.EgenNybyggAr) AS has_build_year,
                count(e.EgenAtemp) AS has_atemp
            FROM in_box b
            LEFT JOIN epc e USING (FormularId)
            """,
            [lo_lat, hi_lat, lo_lon, hi_lon],
        ).fetchone()

        classes_df = con.execute(
            query_bbox_cte
            + """
            SELECT
                COALESCE(e.EgiEnergiklass, 'Unknown') AS energy_class,
                count(*) AS records
            FROM in_box b
            JOIN epc e USING (FormularId)
            GROUP BY 1
            ORDER BY records DESC
            LIMIT 8
            """,
            [lo_lat, hi_lat, lo_lon, hi_lon],
        ).fetchdf()

        sample_df = con.execute(
            query_bbox_cte
            + """
            SELECT
                b.lat,
                b.lon,
                e.IdAdr AS address,
                e.IdFastBet AS cadastral_id,
                e.IdPostort AS post_town,
                e.IdKommun AS municipality,
                e.EgiEnergiklass AS energy_class,
                e.EgiEnergiPrestanda AS energy_performance
            FROM in_box b
            JOIN epc e USING (FormularId)
            WHERE e.IdAdr IS NOT NULL
            LIMIT 30
            """,
            [lo_lat, hi_lat, lo_lon, hi_lon],
        ).fetchdf()
    finally:
        con.close()

    summary_dict = {
        "footprint_points": int(summary[0] or 0),
        "footprint_buildings": int(summary[1] or 0),
        "epc_linked_buildings": int(summary[2] or 0),
        "epc_records": int(summary[3] or 0),
        "has_energy_class": int(summary[4] or 0),
        "has_energy_performance": int(summary[5] or 0),
        "has_build_year": int(summary[6] or 0),
        "has_atemp": int(summary[7] or 0),
        "bbox": {
            "min_lat": float(lo_lat),
            "max_lat": float(hi_lat),
            "min_lon": float(lo_lon),
            "max_lon": float(hi_lon),
        },
    }

    _resolve_sample_addresses(sample_df)
    sample_df.drop(columns=[c for c in ("lat", "lon", "cadastral_id") if c in sample_df.columns], inplace=True)

    return {
        "summary": summary_dict,
        "points": points_df,
        "classes": classes_df,
        "sample": sample_df,
    }


def has_location_database() -> bool:
    """Whether the EPC DuckDB file is available locally."""
    return DB_PATH.exists()


@lru_cache(maxsize=512)
def get_epc_building_passport(formular_id: int | str) -> dict[str, Any] | None:
    """Return a full EPC record for a single building plus derived helper fields."""
    try:
        formular_id_int = int(formular_id)
    except (TypeError, ValueError):
        return None

    con = _connect_duckdb()
    try:
        cur = con.execute(
            """
            SELECT *
            FROM epc
            WHERE FormularId = ?
            LIMIT 1
            """,
            [formular_id_int],
        )
        row = cur.fetchone()
        if row is None:
            return None
        columns = [d[0] for d in cur.description]
        passport = dict(zip(columns, row))

        def _is_missing_local(value: Any) -> bool:
            text = str(value).strip().lower()
            return value is None or text in {"", "<na>", "nan", "none"}

        def _is_active(value: Any) -> bool:
            if _is_missing_local(value):
                return False
            text = str(value).strip().lower()
            if text in {"nej", "no", "false", "0"}:
                return False
            try:
                return float(value) > 0
            except (TypeError, ValueError):
                return True

        energy_systems: list[str] = []
        system_map = {
            "District heating": passport.get("EgiFjarrvarme"),
            "District cooling": passport.get("EgiFjarrkyla"),
            "Oil": passport.get("EgiOlja"),
            "Gas": passport.get("EgiGas"),
            "Wood": passport.get("EgiVed"),
            "Wood chips": passport.get("EgiFlis"),
            "Other biofuel": passport.get("EgiOvrBiobransle"),
            "Electric water heating": passport.get("EgiElVatten"),
            "Direct electric": passport.get("EgiElDirekt"),
            "Electric air heating": passport.get("EgiElLuft"),
            "Ground-source heat pump": passport.get("EgiPumpMark"),
            "Exhaust air heat pump": passport.get("EgiPumpFranluft"),
            "Air-to-water heat pump": passport.get("EgiPumpLuftVatten"),
            "Air-to-air heat pump": passport.get("EgiPumpLuftLuft"),
            "Solar thermal": passport.get("EgiSolvarme"),
            "Solar PV": passport.get("EgiSolcell"),
        }
        for label, value in system_map.items():
            if _is_active(value):
                energy_systems.append(label)
        passport["energy_systems"] = energy_systems

        ventilation_modes: list[str] = []
        ventilation_map = {
            "FTX": passport.get("VentTypFTX"),
            "F": passport.get("VentTypF"),
            "FT": passport.get("VentTypFT"),
            "F with heat recovery": passport.get("VentTypFmed"),
            "Natural ventilation": passport.get("VentTypSjalvdrag"),
        }
        for label, value in ventilation_map.items():
            if _is_active(value):
                ventilation_modes.append(label)
        passport["ventilation_modes"] = ventilation_modes

        available_fields = sum(1 for _, value in passport.items() if not _is_missing_local(value))
        passport["available_field_count"] = available_fields
        passport["total_field_count"] = len(columns)

        return passport
    finally:
        con.close()
