"""Extrude Simrishamn building footprints to their EUBUCCO heights → Rhino .3dm.

Steps:
  1. Read the footprint polygons (WGS84).
  2. Read EUBUCCO SE22 (Sydsverige) building heights.
  3. Reproject both to SWEREF99 TM (EPSG:3006, metres).
  4. Match each footprint to the nearest EUBUCCO building centroid → height.
  5. Extrude every footprint straight up to its height as a capped solid.
  6. Write one .3dm, offset to a local origin (anchor recorded in the notes so
     the model can be georeferenced back to SWEREF99 TM).

Usage: python extrude_simrishamn.py
"""
from __future__ import annotations

import math
from pathlib import Path

import geopandas as gpd
import pandas as pd
import rhino3dm as r3
import trimesh
from shapely.geometry.polygon import orient

DESKTOP    = Path(r"C:/Users/saraabo/Desktop/Project Planning Guide")
FOOTPRINTS = DESKTOP / "simrishamn_footprint_Flavia.geojson"
EUBUCCO    = DESKTOP / "data" / "eubucco" / "SE22.parquet"
OUT_3DM    = DESKTOP / "simrishamn_buildings_3d.3dm"
OUT_OBJ    = DESKTOP / "simrishamn_buildings_3d.obj"

METRIC_CRS   = 3006     # SWEREF99 TM
MATCH_DIST_M = 30.0     # footprint↔EUBUCCO centroid match radius
MIN_HEIGHT_M = 3.0      # floor for missing / degenerate heights


def _rings(geom):
    """Yield (exterior, [interiors]) for Polygon / MultiPolygon.

    Each polygon is oriented CCW (exterior) so its plane normal points +Z and the
    extrusion rises above the ground plane instead of sinking below it.
    """
    if geom is None or geom.is_empty:
        return
    parts = [geom] if geom.geom_type == "Polygon" else (
        list(geom.geoms) if geom.geom_type == "MultiPolygon" else [])
    for part in parts:
        part = orient(part, sign=1.0)   # exterior CCW, holes CW
        yield part.exterior, list(part.interiors), part


def _polyline_curve(coords, offx, offy):
    pl = r3.Polyline()
    for x, y in coords:
        pl.Add(x - offx, y - offy, 0.0)
    # ensure closed
    if (coords[0][0], coords[0][1]) != (coords[-1][0], coords[-1][1]):
        pl.Add(coords[0][0] - offx, coords[0][1] - offy, 0.0)
    return pl.ToPolylineCurve()


def main() -> None:
    print("Reading footprints ...")
    fp = gpd.read_file(FOOTPRINTS)
    if fp.crs is None:
        fp = fp.set_crs(4326)
    fp = fp.to_crs(METRIC_CRS)
    fp = fp[fp.geometry.notna() & ~fp.geometry.is_empty].copy()
    # repair any self-intersections
    fp["geometry"] = fp.geometry.buffer(0)
    fp = fp[~fp.geometry.is_empty].reset_index(drop=True)
    print(f"  {len(fp):,} footprints")

    print("Reading EUBUCCO SE22 heights ...")
    eu = gpd.read_parquet(EUBUCCO, columns=["height", "geometry"]).to_crs(METRIC_CRS)
    # crop to footprint area (+200 m) to keep the spatial join light
    minx, miny, maxx, maxy = fp.total_bounds
    eu = eu.cx[minx - 200:maxx + 200, miny - 200:maxy + 200].copy()
    eu = eu[eu.geometry.notna() & ~eu.geometry.is_empty].reset_index(drop=True)
    eu_cent = eu.copy()
    eu_cent["geometry"] = eu.geometry.centroid
    print(f"  {len(eu):,} EUBUCCO buildings near Simrishamn")

    print("Matching footprints -> nearest EUBUCCO height ...")
    fp_cent = fp[["geometry"]].copy()
    fp_cent["fp_idx"] = range(len(fp))
    fp_cent["geometry"] = fp.geometry.centroid
    joined = gpd.sjoin_nearest(fp_cent, eu_cent[["height", "geometry"]],
                               how="left", max_distance=MATCH_DIST_M, distance_col="dist_m")
    joined = joined.sort_values("dist_m").drop_duplicates("fp_idx").set_index("fp_idx")
    fp["height"] = joined["height"].reindex(range(len(fp))).values

    med = float(pd.to_numeric(fp["height"], errors="coerce").dropna().median() or MIN_HEIGHT_M)
    matched = int(fp["height"].notna().sum())
    print(f"  matched {matched:,}/{len(fp):,} ({matched/len(fp)*100:.1f}%) | median height {med:.1f} m")

    def clean_height(h):
        if h is None or (isinstance(h, float) and math.isnan(h)) or h <= 0:
            return max(med, MIN_HEIGHT_M)
        return max(float(h), MIN_HEIGHT_M)

    # Local origin so the model isn't 6 million metres from (0,0)
    offx, offy = math.floor(minx), math.floor(miny)

    print("Building extrusions ...")
    model = r3.File3dm()
    model.Settings.ModelUnitSystem = r3.UnitSystem.Meters

    made = fell_back = skipped = 0
    meshes = []   # trimesh watertight solids for the .obj
    for h_raw, geom in zip(fp["height"], fp.geometry):
        h = clean_height(h_raw)
        if h_raw is None or (isinstance(h_raw, float) and math.isnan(h_raw)):
            fell_back += 1
        for ext_ring, holes, poly in _rings(geom):
            try:
                outer = _polyline_curve(list(ext_ring.coords), offx, offy)
                if not outer.IsClosed:
                    skipped += 1
                    continue
                ext = r3.Extrusion.Create(outer, h, True)
                if ext is None:
                    skipped += 1
                    continue
                for hole in holes:
                    try:
                        inner = _polyline_curve(list(hole.coords), offx, offy)
                        ext.AddInnerProfile(inner)
                    except Exception:
                        pass  # courtyard hole optional; keep solid massing
                model.Objects.AddExtrusion(ext)
                made += 1
                # matching watertight mesh for the .obj
                try:
                    m = trimesh.creation.extrude_polygon(poly, h)
                    m.apply_translation([-offx, -offy, 0.0])
                    meshes.append(m)
                except Exception:
                    pass
            except Exception:
                skipped += 1

    print(f"  extrusions: {made:,} | height fallback used: {fell_back:,} | skipped: {skipped:,}")

    print(f"Writing {OUT_3DM.name} ...")
    ok = model.Write(str(OUT_3DM), 7)
    print(f"  write {'OK' if ok else 'FAILED'} -> {OUT_3DM}  ({OUT_3DM.stat().st_size/1e6:.1f} MB)" if ok else "  write FAILED")

    print(f"Writing {OUT_OBJ.name} ...")
    scene = trimesh.util.concatenate(meshes)
    scene.export(str(OUT_OBJ))
    print(f"  write OK -> {OUT_OBJ}  ({OUT_OBJ.stat().st_size/1e6:.1f} MB, {len(meshes):,} solids)")

    # Sidecar georeferencing note (rhino3dm has no document-notes setter)
    sidecar = OUT_3DM.with_suffix(".README.txt")
    sidecar.write_text(
        "Simrishamn building massing\n"
        "===========================\n"
        f"{made:,} building extrusions from {len(fp):,} footprints.\n"
        "Footprints extruded straight up to EUBUCCO SE22 (v0.2) building heights.\n\n"
        f"CRS: SWEREF99 TM (EPSG:{METRIC_CRS}), units = metres.\n"
        f"Model is offset to a local origin. To georeference, add this anchor to X,Y:\n"
        f"    X + {offx}\n    Y + {offy}\n\n"
        f"Height match radius: {MATCH_DIST_M:.0f} m ({matched:,}/{len(fp):,} matched).\n"
        f"Missing/zero heights set to {MIN_HEIGHT_M:.0f} m (fallback used on {fell_back:,}).\n",
        encoding="utf-8",
    )
    print(f"  wrote georeferencing note -> {sidecar.name}")


if __name__ == "__main__":
    main()
