"""
ingest_urbis3d.py - building heights for Brussels districts from UrbIS 3D (CC0)

The UrbIS WFS footprints carry no height. UrbIS Buildings3D (LoD2, photogrammetry,
paradigm.brussels) does, implicitly: BuildingSolids (MultiPatchZ, absolute
altitude) with BU_ID = the https://databrussels.be/id/building/<n> the WFS
Buildings layer calls INSPIRE_ID, and BuildingFaces typed GROUNDSURFACE /
ROOFSURFACE / WALLSURFACE / ... keyed to their solid by BUSOLID_ID.

The datastore's ATOM feed lists every release as direct zips; region-wide files
are ~440 MB, so we take only the small SHP tiles (6-digit zone codes) whose
WGS84 bbox overlaps a district, latest release per tile.

Two heights per building, both above the lowest ground point:
  ridge      highest point of any solid - what the eye sees
  roof_mean  plan-area-weighted mean altitude of the ROOFSURFACE faces - the
             flat-roof height with the same volume, which is what the extruded
             viewer block and the EnergyPlus shoebox represent. Using the ridge
             instead counts a pitched Brussels roof as two extra storeys.
Falls back to the solid's Z range when a building has no typed roof faces.
Read straight from the .shp records plus the .dbf - no pyshp/GDAL needed.

    python tools/be/ingest_urbis3d.py [--city brussels_saint_gilles]
Writes data/be_raw/heights_<city>.json ({BU_ID: {"roof_mean": m, "ridge": m}});
be_data_pipeline.py picks it up as height_source=register_3d.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import re
import struct
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cities as be_cities  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "be_raw"
TILE_DIR = RAW_DIR / "urbis3d"
ATOM_URL = "https://urbisdownload.datastore.brussels/atomfeed/e9ec2aa4-cffd-11ee-bccc-00090ffe0001-en.xml"
HEADERS = {"User-Agent": "project-planning-guide/1.0 (retrofit dashboard; research)"}
LINK_RE = re.compile(r'href="([^"]+_SHP_(\d{6})_(\d{8})\.zip)"[^>]*bbox="([\d. ]+)"')


def latest_tiles(feed: str) -> dict[str, tuple[str, tuple[float, float, float, float]]]:
    """zone -> (url, (lat0, lon0, lat1, lon1)) for the newest release of each SHP tile."""
    best: dict[str, tuple[str, str, tuple]] = {}
    for url, zone, date, bbox in LINK_RE.findall(feed):
        if zone not in best or date > best[zone][1]:
            best[zone] = (url, date, tuple(float(v) for v in bbox.split()))
    return {z: (u, b) for z, (u, _, b) in best.items()}


def city_bbox(city: dict) -> tuple[float, float, float, float]:
    dlat = city["radius_m"] / 110_540
    dlon = city["radius_m"] / (111_320 * math.cos(math.radians(city["lat"])))
    return city["lat"] - dlat, city["lon"] - dlon, city["lat"] + dlat, city["lon"] + dlon


def _overlaps(a, b) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def read_dbf(data: bytes) -> list[dict]:
    n, hlen, rlen = struct.unpack("<IHH", data[4:12])
    fields, off = [], 32
    while data[off] != 0x0D:
        name = data[off:off + 11].split(b"\0", 1)[0].decode("ascii")
        fields.append((name, data[off + 16]))
        off += 32
    rows = []
    for i in range(n):
        rec = data[hlen + i * rlen: hlen + (i + 1) * rlen]
        pos, row = 1, {}
        for name, flen in fields:
            row[name] = rec[pos:pos + flen].decode("utf-8", "replace").strip()
            pos += flen
        rows.append(row)
    return rows


def read_multipatch(data: bytes, with_area: bool = False) -> list[tuple | None]:
    """Per record of a MultiPatch (type 31) .shp: (zmin, zmax[, plan_area, mean_z])."""
    out, off = [], 100
    while off < len(data):
        _, clen = struct.unpack(">ii", data[off:off + 8])
        rec = data[off + 8: off + 8 + clen * 2]
        off += 8 + clen * 2
        if struct.unpack("<i", rec[:4])[0] != 31:
            out.append(None)
            continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        xy_off = 44 + 8 * nparts                 # parts + part types (4+4 bytes each)
        zoff = xy_off + 16 * npts
        zmin, zmax = struct.unpack("<dd", rec[zoff:zoff + 16])
        if not with_area:
            out.append((zmin, zmax))
            continue
        xy = struct.unpack(f"<{2 * npts}d", rec[xy_off:zoff])
        zs = struct.unpack(f"<{npts}d", rec[zoff + 16: zoff + 16 + 8 * npts])
        # Faces are single rings: shoelace on the plan projection.
        a = sum(xy[2 * i] * xy[2 * i + 3] - xy[2 * i + 2] * xy[2 * i + 1] for i in range(npts - 1))
        out.append((zmin, zmax, abs(a) / 2, sum(zs) / npts))
    return out


def buildings_in_zip(raw: bytes) -> dict[str, dict]:
    """BU_ID -> {ground, ridge, roof_area, roof_zsum} for the solids in one tile."""
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = {Path(n).name.lower(): n for n in z.namelist()}

    def member(suffix):
        return next((names[k] for k in names if k.endswith(suffix)), None)

    if not member("buildingsolids.shp"):
        return {}
    solids = read_dbf(z.read(member("buildingsolids.dbf")))
    sz = read_multipatch(z.read(member("buildingsolids.shp")))
    solid_bu = {}
    acc: dict[str, dict] = {}
    for row, zz in zip(solids, sz):
        bu = row.get("BU_ID")
        if not bu or not zz:
            continue
        solid_bu[row["INSPIRE_ID"]] = bu
        a = acc.setdefault(bu, {"ground": zz[0], "ridge": zz[1], "roof_area": 0.0, "roof_zsum": 0.0})
        a["ground"], a["ridge"] = min(a["ground"], zz[0]), max(a["ridge"], zz[1])
    if member("buildingfaces.shp"):
        faces = read_dbf(z.read(member("buildingfaces.dbf")))
        fz = read_multipatch(z.read(member("buildingfaces.shp")), with_area=True)
        for row, zz in zip(faces, fz):
            bu = solid_bu.get(row.get("BUSOLID_ID"))
            if not bu or not zz:
                continue
            if row.get("TYPE") == "ROOFSURFACE" and zz[2] > 0.05:
                acc[bu]["roof_area"] += zz[2]
                acc[bu]["roof_zsum"] += zz[2] * zz[3]
            elif row.get("TYPE") == "GROUNDSURFACE":
                acc[bu]["ground"] = min(acc[bu]["ground"], zz[0])
    return acc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city")
    args = ap.parse_args()
    targets = [be_cities.get(args.city)] if args.city else [c for c in be_cities.CITIES if c["source"] == "urbis"]

    feed_path = RAW_DIR / "urbis3d_atom.xml"
    if not feed_path.exists():
        feed_path.write_bytes(requests.get(ATOM_URL, headers=HEADERS, timeout=120).content)
    tiles = latest_tiles(feed_path.read_text(encoding="utf-8"))
    print(f"{len(tiles)} UrbIS 3D SHP tiles in the feed")
    TILE_DIR.mkdir(parents=True, exist_ok=True)

    for city in targets:
        bb = city_bbox(city)
        chosen = {z: v for z, v in tiles.items() if _overlaps(bb, v[1])}
        merged: dict[str, dict] = defaultdict(lambda: {"ground": 1e9, "ridge": -1e9, "roof_area": 0.0, "roof_zsum": 0.0})
        for zone, (url, _) in sorted(chosen.items()):
            local = TILE_DIR / Path(url).name
            if not local.exists():
                r = requests.get(url, headers=HEADERS, timeout=300)
                r.raise_for_status()
                local.write_bytes(r.content)
            # A building straddling two tiles appears in both: merge, don't overwrite.
            for bu, a in buildings_in_zip(local.read_bytes()).items():
                m = merged[bu]
                m["ground"], m["ridge"] = min(m["ground"], a["ground"]), max(m["ridge"], a["ridge"])
                m["roof_area"] += a["roof_area"]
                m["roof_zsum"] += a["roof_zsum"]
        heights = {}
        for bu, m in merged.items():
            ridge = m["ridge"] - m["ground"]
            if ridge <= 1.0:
                continue
            roof_mean = (m["roof_zsum"] / m["roof_area"] - m["ground"]) if m["roof_area"] else ridge
            heights[bu] = {"roof_mean": round(max(1.0, min(roof_mean, ridge)), 2), "ridge": round(ridge, 2)}
        out = RAW_DIR / f"heights_{city['id']}.json"
        out.write_text(json.dumps(heights), encoding="utf-8")
        rm = sorted(h["roof_mean"] for h in heights.values())
        rg = sorted(h["ridge"] for h in heights.values())
        print(f"  {city['id']}: {len(chosen)} tiles, {len(heights):,} buildings; median roof-mean "
              f"{rm[len(rm) // 2] if rm else None} m, ridge {rg[len(rg) // 2] if rg else None} m -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
