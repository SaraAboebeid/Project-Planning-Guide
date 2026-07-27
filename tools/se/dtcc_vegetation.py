"""
Vegetation (trees + shrubs) for Gothenburg from DTCC LiDAR.

The DTCC laser tiles (compute.dtcc.chalmers.se:8000, open, EPSG:3006 / SWEREF99
TM) are NOT classified for vegetation — points are only ground / unclassified /
water / noise / bridge. So we separate vegetation ourselves:

  vegetation candidate = classification 1 (unclassified)
                       AND number_of_returns >= 2   (laser penetrated foliage —
                           the classic canopy signal; hard roofs/ground are
                           mostly single-return)
                       AND height-above-ground in [0.5, 45] m

Then, to stop building edges/antennas (which can give a 2nd return) from being
called "trees", we drop candidates whose grid cell lies inside a building
footprint (from buildings.json).

Output (EPSG:4326, for the 3D viewer):
  trees  : individual stems from local maxima of a 1 m canopy height model
           [{lon, lat, h, crown}]
  shrubs : low vegetation 0.5–2.5 m, as a downsampled grid [{lon, lat, h}]

Usage:
  python tools/se/dtcc_vegetation.py                # default central-Gothenburg proof box
  python tools/se/dtcc_vegetation.py --full         # whole Gothenburg pipeline bbox
"""
from __future__ import annotations
import argparse, json, sys, io, urllib.request, concurrent.futures
from pathlib import Path
import numpy as np
import laspy
from pyproj import Transformer

try:
    from scipy.ndimage import maximum_filter, gaussian_filter
    HAVE_SCIPY = True
except Exception:
    HAVE_SCIPY = False

try:
    import rasterio
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from shapely.geometry import Polygon
    HAVE_RASTER = True
except Exception:
    HAVE_RASTER = False

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE = "http://compute.dtcc.chalmers.se:8000"
ROOT = Path(__file__).resolve().parents[2]
PC = ROOT / "data" / "dtcc" / "pointcloud"; PC.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "data" / "dtcc"

# Gothenburg pipeline bbox (matches data_pipeline.py), EPSG:4326
FULL_BBOX_4326 = (11.85, 57.62, 12.10, 57.80)          # lon_min, lat_min, lon_max, lat_max
PROOF_BBOX_4326 = (11.955, 57.700, 11.985, 57.712)     # small central box (4 tiles)

CELL = 1.0            # canopy height model resolution (m)
TREE_MIN_H = 2.5      # trees taller than this (m)
TREE_MAX_H = 35.0     # taller than this in "veg" ≈ mast/crane/spire, not a tree
SHRUB_MIN_H = 0.5     # shrubs from here up to TREE_MIN_H
VEG_MAX_H = 45.0      # discard absurd returns
MIN_PTS = 4           # outlier filter: min points per cell to count as veg
SHRUB_STEP = 4        # downsample shrub cells (every Nth) to keep the file small

_t46 = Transformer.from_crs(4326, 3006, always_xy=True)
_t64 = Transformer.from_crs(3006, 4326, always_xy=True)


def list_tiles(box3006: dict) -> list[dict]:
    req = urllib.request.Request(BASE + "/get_lidar", data=json.dumps(box3006).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    resp = json.load(urllib.request.urlopen(req, timeout=90))
    seen = {}
    for x in resp.get("tiles", []):
        seen.setdefault(x["filename"], x)
    return list(seen.values())


def download_tiles(tiles: list[dict], workers: int = 6) -> None:
    def fetch(tile):
        fn = tile["filename"]; dest = PC / fn
        r = urllib.request.urlopen(urllib.request.Request(f"{BASE}/get/lidar/{fn}"), timeout=600)
        total = int(r.headers.get("Content-Length") or 0)
        if dest.exists() and total and dest.stat().st_size == total:
            return fn, "cached"
        part = dest.with_suffix(".laz.part")
        with open(part, "wb") as f:
            while True:
                chunk = r.read(262144)
                if not chunk:
                    break
                f.write(chunk)
        part.replace(dest)
        return fn, "downloaded"
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        for fn, st in ex.map(fetch, tiles):
            print(f"    {st:10} {fn}")


def _load_footprints_3006(box3006):
    """Building footprints (buildings.json) within the bbox as (buffered_poly3006, bounds)."""
    if not HAVE_RASTER:
        return []
    bj = ROOT / "frontend" / "public" / "buildings.json"
    if not bj.exists():
        return []
    lon_min, lat_min = _t64.transform(box3006["xmin"], box3006["ymin"])
    lon_max, lat_max = _t64.transform(box3006["xmax"], box3006["ymax"])
    out = []
    for b in json.load(open(bj, encoding="utf-8")):
        c = b.get("coordinates") or []
        if not c:
            continue
        ring = c[0] if (c and isinstance(c[0][0], (list, tuple))) else c
        clon = sum(p[0] for p in ring) / len(ring); clat = sum(p[1] for p in ring) / len(ring)
        if not (lon_min - 0.01 < clon < lon_max + 0.01 and lat_min - 0.01 < clat < lat_max + 0.01):
            continue
        try:
            poly = Polygon([_t46.transform(lon, lat) for lon, lat in ring]).buffer(1.5)
        except Exception:
            continue
        if poly.is_empty:
            continue
        out.append((poly, poly.bounds))
    return out


def _process_tile(path, tb, footprints, min_dist):
    """One 2500 m tile -> (trees, shrubs). Only this tile is held in RAM."""
    las = laspy.read(path)
    c = np.asarray(las.classification)
    x = np.asarray(las.x); y = np.asarray(las.y); z = np.asarray(las.z)
    x0, y1 = tb["xmin"], tb["ymax"]
    ncol = int(round((tb["xmax"] - tb["xmin"]) / CELL)); nrow = int(round((tb["ymax"] - tb["ymin"]) / CELL))
    if ncol <= 0 or nrow <= 0:
        return [], []
    # ground grid (min z per cell) + median gap-fill
    g = c == 2
    gc = ((x[g] - x0) / CELL).astype(int); gr = ((y1 - y[g]) / CELL).astype(int); gz = z[g]
    ok = (gc >= 0) & (gc < ncol) & (gr >= 0) & (gr < nrow)
    ground = np.full((nrow, ncol), np.inf, dtype="float32")
    np.minimum.at(ground.reshape(-1), gr[ok] * ncol + gc[ok], gz[ok].astype("float32"))
    ground[~np.isfinite(ground)] = np.nan
    med = float(np.nanmedian(ground)) if np.isfinite(ground).any() else 0.0
    groundf = np.where(np.isfinite(ground), ground, med)
    # candidates = unclassified, above ground
    cand = (c == 1) & (z > -10) & (z < 400)
    vx = x[cand]; vy = y[cand]; vz = z[cand]
    vc = ((vx - x0) / CELL).astype(int); vr = ((y1 - vy) / CELL).astype(int)
    okv = (vc >= 0) & (vc < ncol) & (vr >= 0) & (vr < nrow)
    vc, vr, vz = vc[okv], vr[okv], vz[okv]
    hag = vz - groundf[vr, vc]
    m = (hag >= SHRUB_MIN_H) & (hag <= VEG_MAX_H)
    vc, vr, hag = vc[m], vr[m], hag[m]
    # remove buildings: rasterize footprints intersecting this tile
    if footprints and HAVE_RASTER:
        subset = [p for p, (bx0, by0, bx1, by1) in footprints
                  if not (bx1 < tb["xmin"] or bx0 > tb["xmax"] or by1 < tb["ymin"] or by0 > tb["ymax"])]
        if subset:
            bmask = rasterize(((p, 1) for p in subset), out_shape=(nrow, ncol),
                              transform=from_origin(x0, y1, CELL, CELL), fill=0, all_touched=True, dtype="uint8").astype(bool)
            keep = ~bmask[vr, vc]
            vc, vr, hag = vc[keep], vr[keep], hag[keep]
    # outlier removal: sparse cells
    cnt = np.zeros(nrow * ncol, dtype="int32"); fl = vr * ncol + vc; np.add.at(cnt, fl, 1)
    dense = cnt[fl] >= MIN_PTS
    vc, vr, hag = vc[dense], vr[dense], hag[dense]
    # canopy height model (max height per cell)
    chm = np.zeros((nrow, ncol), dtype="float32"); np.maximum.at(chm.reshape(-1), vr * ncol + vc, hag.astype("float32"))
    # trees = local maxima of the tall canopy
    trees = []
    tchm = np.where(chm >= TREE_MIN_H, chm, 0.0)
    if HAVE_SCIPY:
        sm = gaussian_filter(tchm, 0.8); win = int(2 * (min_dist / CELL) + 1); mx = maximum_filter(sm, size=win)
        rr, cc = np.where((sm == mx) & (sm >= TREE_MIN_H) & (chm >= TREE_MIN_H))
    else:
        rr, cc = np.where(tchm >= TREE_MIN_H)
    for r, cx in zip(rr, cc):
        h = float(chm[r, cx])
        if h < TREE_MIN_H or h > TREE_MAX_H:
            continue
        lon, lat = _t64.transform(x0 + (cx + 0.5) * CELL, y1 - (r + 0.5) * CELL)
        trees.append({"lon": round(lon, 6), "lat": round(lat, 6), "h": round(h, 1),
                      "crown": round(min(6.0, max(1.5, 1.2 + 0.14 * h)), 1)})
    # shrubs = low-canopy cells, downsampled
    shrubs = []
    sr, sc = np.where((chm >= SHRUB_MIN_H) & (chm < TREE_MIN_H))
    for r, cx in zip(sr, sc):
        if r % SHRUB_STEP or cx % SHRUB_STEP:
            continue
        lon, lat = _t64.transform(x0 + (cx + 0.5) * CELL, y1 - (r + 0.5) * CELL)
        shrubs.append({"lon": round(lon, 6), "lat": round(lat, 6), "h": round(float(chm[r, cx]), 1)})
    return trees, shrubs


def run(box3006, label):
    tiles = list_tiles(box3006)
    print(f"[veg] {label}  {len(tiles)} tiles  EPSG:3006 {box3006}")
    download_tiles(tiles)
    footprints = _load_footprints_3006(box3006)
    print(f"[foot] {len(footprints)} building footprints for masking")
    min_dist = 6.0 if label == "full" else 3.0   # thin forests on the city-wide run
    all_trees, all_shrubs = [], []
    for i, tile in enumerate(tiles, 1):
        tb = {k: tile[k] for k in ("xmin", "ymin", "xmax", "ymax")}
        try:
            tr, sh = _process_tile(PC / tile["filename"], tb, footprints, min_dist)
        except Exception as exc:
            print(f"    [{i}/{len(tiles)}] {tile['filename']}  ERROR {exc}")
            continue
        all_trees += tr; all_shrubs += sh
        print(f"    [{i}/{len(tiles)}] {tile['filename']}: +{len(tr)} trees +{len(sh)} shrubs  (total {len(all_trees):,} trees)")
    # de-duplicate trees that fall on a tile border
    seen = set(); trees = []
    for t in all_trees:
        k = (round(t["lon"], 5), round(t["lat"], 5))
        if k in seen:
            continue
        seen.add(k); trees.append(t)
    out = {"meta": {"source": "DTCC LiDAR (compute.dtcc.chalmers.se)", "crs_in": "EPSG:3006",
                    "bbox_3006": box3006, "cell_m": CELL, "tree_min_dist_m": min_dist},
           "trees": trees, "shrubs": all_shrubs}
    dest = OUT / ("vegetation_proof.json" if label == "proof" else "vegetation_gothenburg.json")
    dest.write_text(json.dumps(out), encoding="utf-8")
    th = [t["h"] for t in trees]
    print(f"[done] {len(trees):,} trees" + (f" (median {np.median(th):.1f} m)" if th else "") +
          f", {len(all_shrubs):,} shrubs -> {dest.name} ({dest.stat().st_size/1e6:.1f} MB)")


def bbox_3006(bbox4326):
    lo, la, LO, LA = bbox4326
    xmin, ymin = _t46.transform(lo, la); xmax, ymax = _t46.transform(LO, LA)
    return {"xmin": int(xmin), "ymin": int(ymin), "xmax": int(xmax), "ymax": int(ymax), "buffer": 0}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="whole Gothenburg bbox (many GB)")
    a = ap.parse_args()
    if a.full:
        run(bbox_3006(FULL_BBOX_4326), "full")
    else:
        run(bbox_3006(PROOF_BBOX_4326), "proof")
