#!/usr/bin/env python3
"""One pass over the DTCC LiDAR tiles → (1) water mask that removes trees on
water, and (2) a shaded-relief terrain image for the viewer.

Reads every downloaded tile once (data/dtcc/pointcloud/*.laz, EPSG:3006):
  • class 9 (water)  → a water cell mask; any tree/shrub on a water cell is
                       dropped (fixes "trees in the river").
  • class 2 (ground) → a min-z DEM, turned into a hillshaded + elevation-tinted
                       PNG (reprojected to WGS84) for a "Terrain (LiDAR)" basemap.

    python tools/se/dtcc_terrain_water.py

Outputs (all overwritten in place; a one-time veg backup is kept):
  data/dtcc/vegetation_gothenburg.json  (+ assets/ + frontend/public copies)
  assets/terrain_hillshade.png + terrain_meta.json  (+ frontend/public copies)
Host deps: laspy, numpy, pyproj, scipy, rasterio.
"""
from __future__ import annotations

import glob
import json
import math
import sys
from pathlib import Path

import laspy
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import calculate_default_transform, reproject, Resampling
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent.parent
TILES = sorted(glob.glob(str(ROOT / "data" / "dtcc" / "pointcloud" / "*.laz")))
VEG_MASTER = ROOT / "data" / "dtcc" / "vegetation_gothenburg.json"
VEG_OUT = [VEG_MASTER, ROOT / "assets" / "dtcc_vegetation.json",
           ROOT / "frontend" / "public" / "dtcc_vegetation.json"]
PNG_OUT = [ROOT / "assets" / "terrain_hillshade.png",
           ROOT / "frontend" / "public" / "terrain_hillshade.png"]
META_OUT = [ROOT / "assets" / "terrain_meta.json",
            ROOT / "frontend" / "public" / "terrain_meta.json"]

CELL_DEM = 10.0     # DEM resolution (m)
CELL_WATER = 5.0    # water-mask resolution (m)


def _global_bounds() -> tuple[float, float, float, float]:
    xmin = ymin = math.inf
    xmax = ymax = -math.inf
    for f in TILES:
        with laspy.open(f) as fh:
            h = fh.header
            xmin = min(xmin, h.x_min); ymin = min(ymin, h.y_min)
            xmax = max(xmax, h.x_max); ymax = max(ymax, h.y_max)
    return xmin, ymin, xmax, ymax


def main() -> int:
    # Windows consoles default to cp1252 and choke on →/·/× in the logs.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if not TILES:
        print("ERROR: no tiles in data/dtcc/pointcloud", file=sys.stderr)
        return 1
    print(f"[tiles] {len(TILES)} tiles", flush=True)
    x0, y0, x1, y1 = _global_bounds()
    print(f"[bounds 3006] x {x0:.0f}..{x1:.0f}  y {y0:.0f}..{y1:.0f}  "
          f"({(x1-x0)/1000:.1f}×{(y1-y0)/1000:.1f} km)", flush=True)

    nc_d = int(math.ceil((x1 - x0) / CELL_DEM)); nr_d = int(math.ceil((y1 - y0) / CELL_DEM))
    nc_w = int(math.ceil((x1 - x0) / CELL_WATER)); nr_w = int(math.ceil((y1 - y0) / CELL_WATER))
    dem = np.full(nr_d * nc_d, np.inf, dtype="float32")     # min ground z per cell
    water = np.zeros(nr_w * nc_w, dtype=bool)               # any class-9 point
    print(f"[grid] DEM {nr_d}×{nc_d} @ {CELL_DEM}m · water {nr_w}×{nc_w} @ {CELL_WATER}m", flush=True)

    for i, f in enumerate(TILES):
        try:
            las = laspy.read(f)
        except Exception as ex:  # noqa: BLE001
            print(f"[tile {i+1}/{len(TILES)}] SKIP ({ex})", flush=True)
            continue
        cls = np.asarray(las.classification)
        x = np.asarray(las.x); y = np.asarray(las.y); z = np.asarray(las.z)

        g = cls == 2
        if g.any():
            gc = ((x[g] - x0) / CELL_DEM).astype(np.int64)
            gr = ((y1 - y[g]) / CELL_DEM).astype(np.int64)
            ok = (gc >= 0) & (gc < nc_d) & (gr >= 0) & (gr < nr_d)
            idx = gr[ok] * nc_d + gc[ok]
            np.minimum.at(dem, idx, z[g][ok].astype("float32"))

        w = cls == 9
        if w.any():
            wc = ((x[w] - x0) / CELL_WATER).astype(np.int64)
            wr = ((y1 - y[w]) / CELL_WATER).astype(np.int64)
            ok = (wc >= 0) & (wc < nc_w) & (wr >= 0) & (wr < nr_w)
            water[wr[ok] * nc_w + wc[ok]] = True
        if (i + 1) % 10 == 0 or i + 1 == len(TILES):
            print(f"[tile {i+1}/{len(TILES)}] processed", flush=True)

    water = water.reshape(nr_w, nc_w)
    # Bridges/piers occlude the water return, leaving holes in the mask where false
    # "trees" survive. Close gaps (~20 m) then add a small edge margin (~5 m).
    water = ndimage.binary_closing(water, iterations=4)
    water = ndimage.binary_dilation(water, iterations=1)
    print(f"[water] {int(water.sum()):,} water cells (gap-filled)", flush=True)

    # ── 1. filter vegetation against the water mask ────────────────────────────
    data = json.loads(VEG_MASTER.read_text(encoding="utf-8"))
    to3006 = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)

    def drop_water(items):
        if not items:
            return items, 0
        lon = np.array([o["lon"] for o in items]); lat = np.array([o["lat"] for o in items])
        ex, ey = to3006.transform(lon, lat)
        c = ((ex - x0) / CELL_WATER).astype(np.int64)
        r = ((y1 - ey) / CELL_WATER).astype(np.int64)
        inb = (c >= 0) & (c < nc_w) & (r >= 0) & (r < nr_w)
        on_water = np.zeros(len(items), dtype=bool)
        on_water[inb] = water[r[inb], c[inb]]
        kept = [o for o, bad in zip(items, on_water) if not bad]
        return kept, int(on_water.sum())

    trees, tdrop = drop_water(data.get("trees", []))
    shrubs, sdrop = drop_water(data.get("shrubs", []))
    print(f"[veg] trees {len(data.get('trees', []))}→{len(trees)} (-{tdrop}) · "
          f"shrubs {len(data.get('shrubs', []))}→{len(shrubs)} (-{sdrop})", flush=True)

    bak = VEG_MASTER.with_suffix(".json.prewater.bak")
    if not bak.exists():
        bak.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"[backup] {bak.name}", flush=True)
    data["trees"] = trees; data["shrubs"] = shrubs
    veg_payload = json.dumps(data, ensure_ascii=False)
    for out in VEG_OUT:
        out.write_text(veg_payload, encoding="utf-8")
    print(f"[veg] written to {len(VEG_OUT)} files", flush=True)

    # ── 2. DEM → hillshade PNG (reprojected to WGS84) ──────────────────────────
    dem = dem.reshape(nr_d, nc_d)
    dem[~np.isfinite(dem)] = np.nan
    mask = np.isnan(dem)
    if mask.all():
        print("[dem] no ground cells — skipping terrain image", flush=True)
        return 0
    # nearest-neighbour fill of gaps (buildings/water/no-return) so relief is smooth
    fill_idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
    demf = dem[tuple(fill_idx)]

    # shaded relief (computed in metres → correct slopes)
    gy, gx = np.gradient(demf, CELL_DEM)
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az = np.radians(360 - 315 + 90); alt = np.radians(45)
    shade = np.clip(np.sin(alt) * np.sin(slope) + np.cos(alt) * np.cos(slope) * np.cos(az - aspect), 0, 1)

    # hypsometric tint (low green → mid khaki → high pale) over 2–98 percentiles
    lo, hi = np.nanpercentile(demf, 2), np.nanpercentile(demf, 98)
    t = np.clip((demf - lo) / max(1e-6, hi - lo), 0, 1)
    stops = np.array([[58, 107, 74], [120, 140, 90], [176, 160, 96], [232, 224, 208]]) / 255.0
    pos = np.array([0.0, 0.4, 0.7, 1.0])
    tint = np.stack([np.interp(t, pos, stops[:, k]) for k in range(3)], axis=-1)
    rgb = np.clip(tint * (0.35 + 0.65 * shade[..., None]), 0, 1)
    rgba = np.concatenate([rgb, np.ones((*rgb.shape[:2], 1))], axis=-1)
    rgba = (rgba * 255).astype("uint8")

    src_transform = from_origin(x0, y1, CELL_DEM, CELL_DEM)
    dst_transform, dw, dh = calculate_default_transform(
        "EPSG:3006", "EPSG:4326", nc_d, nr_d, left=x0, bottom=y0, right=x1, top=y1)
    bands = np.zeros((4, dh, dw), dtype="uint8")
    for b in range(4):
        reproject(source=np.ascontiguousarray(rgba[..., b]), destination=bands[b],
                  src_transform=src_transform, src_crs="EPSG:3006",
                  dst_transform=dst_transform, dst_crs="EPSG:4326",
                  resampling=Resampling.bilinear)
    west = dst_transform.c; north = dst_transform.f
    east = west + dw * dst_transform.a; south = north + dh * dst_transform.e
    for out in PNG_OUT:
        with rasterio.open(out, "w", driver="PNG", width=dw, height=dh, count=4, dtype="uint8") as ds:
            ds.write(bands)
    meta = {"rect": [west, south, east, north], "cell_m": CELL_DEM}
    for out in META_OUT:
        out.write_text(json.dumps(meta), encoding="utf-8")
    print(f"[terrain] {dw}×{dh} PNG · rect {west:.4f},{south:.4f},{east:.4f},{north:.4f}", flush=True)
    print("[done]", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
