"""
trafikverket_scraper.py

Fetches traffic / road data for Gothenburg from Trafikverket's Open Data API
and stores it in trafikverket.db as a rolling snapshot (tables are wiped and
refreshed on every run — no historical accumulation).

Usage:
    python trafikverket_scraper.py               # scrape and save to DB
    python trafikverket_scraper.py --export      # scrape, save, then write assets/
    python trafikverket_scraper.py --export-only # skip scrape, just refresh assets/

API docs:  https://data.trafikverket.se/documentation/datacache
Register:  https://data.trafikverket.se/oauth2/Account/register
"""

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

import requests

# ── CONFIGURATION ─────────────────────────────────────────────────────────────

API_KEY = "64e892805470459eb06323a1f29f86d2"   # <── paste your Trafikverket API key here

API_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json"
DB_PATH = Path("trafikverket.db")

# Bounding box covering greater Gothenburg municipality in SWEREF99TM
# Format: "min_easting min_northing, max_easting max_northing"
GOTHENBURG_BOX = "270000 6380000, 360000 6445000"

# ── HTTP ──────────────────────────────────────────────────────────────────────

_session = requests.Session()
_session.headers.update({"Content-Type": "text/xml"})


def _post(xml_body: str) -> dict:
    resp = _session.post(API_URL, data=xml_body.encode("utf-8"), timeout=30)
    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:400]}")
    return resp.json()


def _geo(obj: dict, key: str = "SWEREF99TM") -> str | None:
    return (obj.get("Geometry") or {}).get(key)


# ── FETCH FUNCTIONS ───────────────────────────────────────────────────────────

def fetch_cameras() -> list[dict]:
    """Traffic cameras with live photo URLs."""
    xml = f"""<REQUEST>
  <LOGIN authenticationkey="{API_KEY}"/>
  <QUERY objecttype="Camera" schemaversion="1" limit="1000">
    <FILTER>
      <WITHIN name="Geometry.SWEREF99TM" shape="box" value="{GOTHENBURG_BOX}"/>
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>Name</INCLUDE>
    <INCLUDE>Type</INCLUDE>
    <INCLUDE>Description</INCLUDE>
    <INCLUDE>HasFullSizePhoto</INCLUDE>
    <INCLUDE>PhotoUrl</INCLUDE>
    <INCLUDE>PhotoTime</INCLUDE>
    <INCLUDE>Active</INCLUDE>
    <INCLUDE>Geometry.SWEREF99TM</INCLUDE>
    <INCLUDE>Geometry.WGS84</INCLUDE>
  </QUERY>
</REQUEST>"""
    data = _post(xml)
    return data.get("RESPONSE", {}).get("RESULT", [{}])[0].get("Camera", [])


def fetch_traffic_flow() -> list[dict]:
    """Vehicle counts and average speeds per road segment."""
    xml = f"""<REQUEST>
  <LOGIN authenticationkey="{API_KEY}"/>
  <QUERY objecttype="TrafficFlow" schemaversion="1.4" limit="2000">
    <FILTER>
      <WITHIN name="Geometry.SWEREF99TM" shape="box" value="{GOTHENBURG_BOX}"/>
    </FILTER>
  </QUERY>
</REQUEST>"""
    data = _post(xml)
    return data.get("RESPONSE", {}).get("RESULT", [{}])[0].get("TrafficFlow", [])


def fetch_road_conditions() -> list[dict]:
    """Road surface conditions: ice, wet, dry, warnings."""
    xml = f"""<REQUEST>
  <LOGIN authenticationkey="{API_KEY}"/>
  <QUERY objecttype="RoadCondition" schemaversion="1" limit="500">
    <FILTER>
      <WITHIN name="Geometry.SWEREF99TM" shape="box" value="{GOTHENBURG_BOX}"/>
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>ConditionCode</INCLUDE>
    <INCLUDE>ConditionText</INCLUDE>
    <INCLUDE>LocationText</INCLUDE>
    <INCLUDE>RoadNumber</INCLUDE>
    <INCLUDE>Geometry.SWEREF99TM</INCLUDE>
    <INCLUDE>Geometry.WGS84</INCLUDE>
  </QUERY>
</REQUEST>"""
    data = _post(xml)
    return data.get("RESPONSE", {}).get("RESULT", [{}])[0].get("RoadCondition", [])


def fetch_parking() -> list[dict]:
    """Parking facilities with capacity and free spaces."""
    xml = f"""<REQUEST>
  <LOGIN authenticationkey="{API_KEY}"/>
  <QUERY objecttype="Parking" schemaversion="1.4" limit="500">
    <FILTER>
      <WITHIN name="Geometry.SWEREF99TM" shape="box" value="{GOTHENBURG_BOX}"/>
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>Name</INCLUDE>
    <INCLUDE>OpenStatus</INCLUDE>
    <INCLUDE>OperationStatus</INCLUDE>
    <INCLUDE>Description</INCLUDE>
    <INCLUDE>UsageSenario</INCLUDE>
    <INCLUDE>VehicleCharacteristics</INCLUDE>
    <INCLUDE>Geometry.SWEREF99TM</INCLUDE>
    <INCLUDE>Geometry.WGS84</INCLUDE>
  </QUERY>
</REQUEST>"""
    data = _post(xml)
    return data.get("RESPONSE", {}).get("RESULT", [{}])[0].get("Parking", [])


# ── DATABASE ──────────────────────────────────────────────────────────────────

def init_db(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        DROP TABLE IF EXISTS cameras;
        DROP TABLE IF EXISTS traffic_flow;
        DROP TABLE IF EXISTS road_conditions;
        DROP TABLE IF EXISTS parking;

        CREATE TABLE cameras (
            id               TEXT PRIMARY KEY,
            name             TEXT,
            type             TEXT,
            description      TEXT,
            has_fullsize     INTEGER,
            photo_url        TEXT,
            photo_time       TEXT,
            active           INTEGER,
            geometry_sweref  TEXT,
            geometry_wgs84   TEXT
        );

        CREATE TABLE traffic_flow (
            id               TEXT PRIMARY KEY,
            site_id          INTEGER,
            vehicle_type     TEXT,
            specific_lane    TEXT,
            flow_rate        REAL,
            avg_speed        REAL,
            measurement_time TEXT,
            geometry_sweref  TEXT,
            geometry_wgs84   TEXT
        );

        CREATE TABLE road_conditions (
            id               TEXT PRIMARY KEY,
            condition_code   INTEGER,
            condition_text   TEXT,
            location_text    TEXT,
            road_number      TEXT,
            geometry_sweref  TEXT,
            geometry_wgs84   TEXT
        );

        CREATE TABLE parking (
            id               TEXT PRIMARY KEY,
            name             TEXT,
            open_status      TEXT,
            operation_status TEXT,
            description      TEXT,
            usage_scenario   TEXT,
            total_capacity   INTEGER,
            geometry_sweref  TEXT,
            geometry_wgs84   TEXT
        );
    """)
    conn.commit()
    return conn


def _clear_tables(conn: sqlite3.Connection) -> None:
    """Wipe all tables so each scrape run is a fresh snapshot."""
    for table in ("cameras", "traffic_flow", "road_conditions", "parking"):
        conn.execute(f"DELETE FROM {table}")
    conn.commit()


def _insert(conn: sqlite3.Connection, table: str, record_id: str,
            fields: dict) -> None:
    """Insert one row (tables are wiped before each scrape, so no conflicts)."""
    cols = ["id"] + list(fields.keys())
    vals = [record_id] + list(fields.values())
    placeholders = ", ".join(["?"] * len(cols))
    col_names = ", ".join(cols)
    conn.execute(
        f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})",
        vals,
    )
    conn.commit()


# ── SCRAPE ────────────────────────────────────────────────────────────────────

def _first_record(obj: dict | list | None) -> dict:
    """Return first element if list, or the dict itself, or {}."""
    if isinstance(obj, list):
        return obj[0] if obj else {}
    return obj or {}


def run_scrape(conn: sqlite3.Connection) -> dict:
    stats = {}

    # Wipe previous snapshot so DB always reflects current API state
    _clear_tables(conn)

    # ── Cameras ──────────────────────────────────────────────────────────────
    print("Fetching cameras ...", end=" ", flush=True)
    cameras = fetch_cameras()
    for c in cameras:
        _insert(conn, "cameras", c["Id"], {
            "name":           c.get("Name"),
            "type":           c.get("Type"),
            "description":    c.get("Description"),
            "has_fullsize":   int(bool(c.get("HasFullSizePhoto"))),
            "photo_url":      c.get("PhotoUrl"),
            "photo_time":     c.get("PhotoTime"),
            "active":         int(bool(c.get("Active"))),
            "geometry_sweref": _geo(c, "SWEREF99TM"),
            "geometry_wgs84":  _geo(c, "WGS84"),
        })
    stats["cameras"] = len(cameras)
    print(f"{len(cameras)} records")

    # ── Traffic flow ──────────────────────────────────────────────────────────
    print("Fetching traffic flow ...", end=" ", flush=True)
    flows = fetch_traffic_flow()
    for f in flows:
        synthetic_id = f"{f.get('SiteId')}-{f.get('SpecificLane','')}-{f.get('VehicleType','')}"
        _insert(conn, "traffic_flow", synthetic_id, {
            "site_id":          f.get("SiteId"),
            "vehicle_type":     f.get("VehicleType"),
            "specific_lane":    f.get("SpecificLane"),
            "flow_rate":        f.get("VehicleFlowRate"),
            "avg_speed":        f.get("AverageVehicleSpeed"),
            "measurement_time": f.get("MeasurementTime"),
            "geometry_sweref":  _geo(f, "SWEREF99TM"),
            "geometry_wgs84":   _geo(f, "WGS84"),
        })
    stats["traffic_flow"] = len(flows)
    print(f"{len(flows)} records")

    # ── Road conditions ──────────────────────────────────────────────────────────
    print("Fetching road conditions ...", end=" ", flush=True)
    conditions = fetch_road_conditions()
    for c in conditions:
        _insert(conn, "road_conditions", str(c["Id"]), {
            "condition_code":  c.get("ConditionCode"),
            "condition_text":  c.get("ConditionText"),
            "location_text":   c.get("LocationText"),
            "road_number":     c.get("RoadNumber"),
            "geometry_sweref": _geo(c, "SWEREF99TM"),
            "geometry_wgs84":  _geo(c, "WGS84"),
        })
    stats["road_conditions"] = len(conditions)
    print(f"{len(conditions)} records")

    # ── Parking ───────────────────────────────────────────────────────────────
    print("Fetching parking ...", end=" ", flush=True)
    parkings = fetch_parking()
    for p in parkings:
        chars = p.get("VehicleCharacteristics") or []
        if isinstance(chars, dict):
            chars = [chars]
        total_cap = sum(vc.get("NumberOfSpaces", 0) for vc in chars if isinstance(vc, dict))
        scenarios = p.get("UsageSenario") or []
        if isinstance(scenarios, str):
            scenarios = [scenarios]
        _insert(conn, "parking", p["Id"], {
            "name":             p.get("Name"),
            "open_status":      p.get("OpenStatus"),
            "operation_status": p.get("OperationStatus"),
            "description":      p.get("Description"),
            "usage_scenario":   ", ".join(str(s) for s in scenarios),
            "total_capacity":   total_cap or None,
            "geometry_sweref":  _geo(p, "SWEREF99TM"),
            "geometry_wgs84":   _geo(p, "WGS84"),
        })
    stats["parking"] = len(parkings)
    print(f"{len(parkings)} records")

    return stats


# ── EXPORT ────────────────────────────────────────────────────────────────────

def _parse_wgs84(wkt: str | None) -> tuple[float, float] | None:
    """Extract first (lon, lat) from a WGS84 WKT POINT or LINESTRING."""
    if not wkt:
        return None
    m = re.search(r"(-?\d+\.\d+)\s+(-?\d+\.\d+)", wkt)
    return (float(m.group(1)), float(m.group(2))) if m else None


def export_to_assets(conn: sqlite3.Connection, assets_dir: Path) -> None:
    """Write assets/trafikverket_data.json for the 3D viewer."""
    out: dict[str, list] = {
        "cameras": [],
        "traffic_flow": [],
        "road_conditions": [],
        "parking": [],
    }

    for row in conn.execute(
        "SELECT id, name, type, description, photo_url, photo_time, active, geometry_wgs84 "
        "FROM cameras"
    ):
        pt = _parse_wgs84(row[7])
        if pt:
            out["cameras"].append({
                "id": row[0], "name": row[1], "type": row[2],
                "description": row[3], "photo_url": row[4],
                "photo_time": row[5], "active": bool(row[6]),
                "lon": pt[0], "lat": pt[1],
            })

    for row in conn.execute(
        "SELECT id, site_id, vehicle_type, specific_lane, flow_rate, avg_speed, measurement_time, geometry_wgs84 "
        "FROM traffic_flow"
    ):
        pt = _parse_wgs84(row[7])
        if pt:
            out["traffic_flow"].append({
                "id": row[0], "site_id": row[1], "vehicle_type": row[2],
                "lane": row[3], "flow_rate": row[4], "avg_speed": row[5],
                "time": row[6], "lon": pt[0], "lat": pt[1],
            })

    for row in conn.execute(
        "SELECT id, condition_code, condition_text, location_text, road_number, geometry_wgs84 "
        "FROM road_conditions"
    ):
        pt = _parse_wgs84(row[5])
        if pt:
            out["road_conditions"].append({
                "id": row[0], "condition_code": row[1], "condition_text": row[2],
                "location": row[3], "road_number": row[4],
                "lon": pt[0], "lat": pt[1],
            })

    for row in conn.execute(
        "SELECT id, name, open_status, operation_status, description, usage_scenario, total_capacity, geometry_wgs84 "
        "FROM parking"
    ):
        pt = _parse_wgs84(row[7])
        if pt:
            out["parking"].append({
                "id": row[0], "name": row[1], "open_status": row[2],
                "operation_status": row[3], "description": row[4],
                "usage": row[5], "total_capacity": row[6],
                "lon": pt[0], "lat": pt[1],
            })

    assets_dir.mkdir(parents=True, exist_ok=True)
    out_path = assets_dir / "trafikverket_data.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    size_kb = out_path.stat().st_size // 1024
    print(
        f"\nExported → {out_path}  ({size_kb} KB)\n"
        f"  {len(out['cameras'])} cameras  |  {len(out['traffic_flow'])} flow points  |  "
        f"{len(out['road_conditions'])} road conditions  |  {len(out['parking'])} parking"
    )


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(
        description="Scrape Trafikverket traffic data for Gothenburg"
    )
    parser.add_argument(
        "--export", action="store_true",
        help="Also export to assets/trafikverket_data.json after scraping",
    )
    parser.add_argument(
        "--export-only", action="store_true",
        help="Skip scraping; just regenerate assets/ from the existing DB",
    )
    args = parser.parse_args()

    conn = init_db(DB_PATH)

    if not args.export_only:
        print("Scraping Trafikverket API — Gothenburg bounding box\n")
        stats = run_scrape(conn)
        print(
            f"\nDone.  cameras={stats['cameras']}  "
            f"flow={stats['traffic_flow']}  "
            f"road_conditions={stats['road_conditions']}  "
            f"parking={stats['parking']}"
        )

    if args.export or args.export_only:
        export_to_assets(conn, Path("assets"))

    conn.close()


if __name__ == "__main__":
    main()
