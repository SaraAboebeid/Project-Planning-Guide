#!/usr/bin/env python3
"""Per-building roof metrics from the DTCC LiDAR → pitched-roof rendering.

For every building footprint (buildings.json, index i), collect the LiDAR points
that fall inside it, measure their height-above-ground, and derive:
  • eave_h  — lower roof height (≈ wall top)      P30 of roof points
  • ridge_h — roof apex height                    P92 of roof points
  • az      — ridge azimuth (footprint long axis, from PCA), degrees
Buildings whose roof barely rises (ridge-eave < 1.5 m) are treated as flat and
omitted (the viewer keeps its flat top). Output feeds a "Pitched roofs" viewer
layer that draws a ridge-draped gable cap between eave and ridge.

    python tools/se/dtcc_roofs.py

Output: data/dtcc/roofs_gothenburg.json (+ assets/ + frontend/public copies),
        {roofs: [{i, eave, ridge, az}, …]}.
Host deps: laspy, numpy, pyproj, scipy, rasterio, shapely.
"""
from __future__ import annotations

import glob
import json
import math
import sys
from pathlib import Path

import laspy
import numpy as np
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import Polygon
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent.parent
TILES = sorted(glob.glob(str(ROOT / "data" / "dtcc" / "pointcloud" / "*.laz")))
BUILDINGS = ROOT / "frontend" / "public" / "buildings.json"
OUT = [ROOT / "data" / "dtcc" / "roofs_gothenburg.json",
       ROOT / "assets" / "roofs_gothenburg.json",
       ROOT / "frontend" / "public" / "roofs_gothenburg.json"]

CELL = 1.0          # raster resolution (m)
NBINS = 61          # height histogram bins (0..60 m, 1 m each)
MIN_PTS = 25        # min roof points to trust a building
MIN_RISE = 1.5      # ridge-eave below this ⇒ treated as flat (omitted)


def _load_footprints():
    """(poly3006, index, azimuth_deg) for every building with a valid ring."""
    t = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    arr = json.loads(BUILDINGS.read_text(encoding="utf-8"))
    out = []
    for i, b in enumerate(arr):
        c = b.get("coordinates") or []
        if not c or len(c[0]) < 3:
            continue
        ring = [t.transform(lon, lat) for lon, lat in c[0]]
        try:
            poly = Polygon(ring)
            if not poly.is_valid or poly.area < 6:
                continue
        except Exception:
            continue
        pts = np.array(ring)
        # ridge runs along the footprint's long axis (major PCA axis)
        d = pts - pts.mean(0)
        cov = d.T @ d
        w, v = np.linalg.eigh(cov)
        major = v[:, int(np.argmax(w))]
        az = math.degrees(math.atan2(major[1], major[0]))
        out.append((poly, i, az))
    return out, len(arr)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if not TILES:
        print("ERROR: no tiles", file=sys.stderr); return 1
    print(f"[tiles] {len(TILES)}", flush=True)
    foots, n_all = _load_footprints()
    print(f"[foot] {len(foots)} valid footprints of {n_all}", flush=True)
    geoms = [f[0] for f in foots]
    idxs = np.array([f[1] for f in foots])
    tree = STRtree(geoms)

    hist = np.zeros((n_all, NBINS), dtype=np.int32)

    for ti, f in enumerate(TILES):
        try:
            las = laspy.read(f)
        except Exception as ex:  # noqa: BLE001
            print(f"[tile {ti+1}] SKIP {ex}", flush=True); continue
        cls = np.asarray(las.classification)
        x = np.asarray(las.x); y = np.asarray(las.y); z = np.asarray(las.z)
        x0, x1 = x.min(), x.max(); y0, y1 = y.min(), y.max()
        ncol = int(math.ceil((x1 - x0) / CELL)); nrow = int(math.ceil((y1 - y0) / CELL))
        if ncol < 2 or nrow < 2:
            continue

        # ground DEM (min z of class 2, gap-filled by tile median)
        g = cls == 2
        ground = np.full(nrow * ncol, np.inf, dtype="float32")
        if g.any():
            gc = ((x[g] - x0) / CELL).astype(np.int64); gr = ((y1 - y[g]) / CELL).astype(np.int64)
            ok = (gc >= 0) & (gc < ncol) & (gr >= 0) & (gr < nrow)
            np.minimum.at(ground, gr[ok] * ncol + gc[ok], z[g][ok].astype("float32"))
        ground = ground.reshape(nrow, ncol)
        ground[~np.isfinite(ground)] = np.nan
        med = float(np.nanmedian(ground)) if np.isfinite(ground).any() else 0.0
        ground = np.where(np.isfinite(ground), ground, med)

        # rasterize the footprints intersecting this tile, burning building index+1
        transform = from_origin(x0, y1, CELL, CELL)
        cand = tree.query(Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)]))
        shapes = [(geoms[k], int(idxs[k]) + 1) for k in np.atleast_1d(cand)]
        if not shapes:
            continue
        idgrid = rasterize(shapes, out_shape=(nrow, ncol), transform=transform,
                           fill=0, all_touched=False, dtype="int32")

        # roof points = above-ground non-ground/water returns inside a footprint
        roof = (cls == 1)
        if not roof.any():
            continue
        rc = ((x[roof] - x0) / CELL).astype(np.int64); rr = ((y1 - y[roof]) / CELL).astype(np.int64)
        ok = (rc >= 0) & (rc < ncol) & (rr >= 0) & (rr < nrow)
        rc, rr = rc[ok], rr[ok]
        bid = idgrid[rr, rc]                       # building index+1 (0 = none)
        inb = bid > 0
        rc, rr, bid = rc[inb], rr[inb], bid[inb]
        hag = z[roof][ok][inb] - ground[rr, rc]
        good = (hag >= 1.0) & (hag < 60.0)
        binv = np.clip(hag[good].astype(np.int64), 0, NBINS - 1)
        np.add.at(hist, (bid[good] - 1, binv), 1)
        if (ti + 1) % 10 == 0 or ti + 1 == len(TILES):
            print(f"[tile {ti+1}/{len(TILES)}]", flush=True)

    # derive eave/ridge percentiles from each building's height histogram
    az_by_idx = {f[1]: f[2] for f in foots}
    roofs = []
    edges = np.arange(NBINS)
    for i in range(n_all):
        h = hist[i]
        tot = int(h.sum())
        if tot < MIN_PTS:
            continue
        cdf = np.cumsum(h) / tot
        eave = float(np.interp(0.30, cdf, edges))
        ridge = float(np.interp(0.92, cdf, edges))
        if ridge - eave < MIN_RISE:
            continue
        roofs.append({"i": i, "eave": round(eave, 1), "ridge": round(ridge, 1),
                      "az": round(az_by_idx.get(i, 0.0), 1)})
    print(f"[roofs] {len(roofs)} pitched roofs of {n_all} buildings", flush=True)

    payload = json.dumps({"roofs": roofs}, ensure_ascii=False)
    for out in OUT:
        out.write_text(payload, encoding="utf-8")
    print(f"[write] {len(OUT)} files", flush=True)
    print("[done]", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
