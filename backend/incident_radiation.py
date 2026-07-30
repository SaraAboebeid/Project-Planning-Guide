"""Incident solar radiation on a ground disc — MIT clean-room.

The method is the standard one (not Ladybug code, which is AGPL): discretise the
sky into Tregenza patches, build a *cumulative sky matrix* from an EPW weather
file (per-patch kWh/m² of energy arriving over a chosen period), then for every
ground cell sum

    incident = Σ_patches  patch_kWh · cos(incidence) · visibility

where `visibility` is a 2.5-D height-field ray-march against the surrounding
buildings (a patch is blocked if a building rises above the ray on its way to
that patch). Because our buildings are extruded footprints, this same height
field will later serve roof and facade points too.

    from backend.incident_radiation import compute_incident
    r = compute_incident(lat, lon, radius_m, grid_m, buildings, epw_path)

Radiation numbers come entirely from the EPW (real typical-year climate). No
fabricated irradiance.
"""
from __future__ import annotations

import math
import os
from datetime import datetime, timedelta

import numpy as np
from shapely.geometry import Polygon
from shapely import contains as _contains, points as _points

from backend.sun_hours import sun_alt_az   # reuse the solar-position algorithm


# Season → set of months. "year" is the full annual total.
SEASONS = {
    "summer": {6, 7, 8},
    "equinox": {3, 4, 5, 9, 10, 11},
    "winter": {12, 1, 2},
    "year": set(range(1, 13)),
}
SEASON_ORDER = ["year", "summer", "equinox", "winter"]

_EPW_CACHE: dict[str, tuple] = {}
_SKY_CACHE: dict[tuple, np.ndarray] = {}


# ── Tregenza sky dome (145 patches) ───────────────────────────────────────────
def _tregenza_dome():
    """(alt_rad, az_rad, solid_angle_sr) per patch — 7 altitude bands + a zenith
    cap, the standard 145-patch Tregenza subdivision. Azimuth is from North."""
    band_alt = [6, 18, 30, 42, 54, 66, 78]     # band centre altitudes (deg)
    band_cnt = [30, 30, 24, 24, 18, 12, 6]
    span = math.radians(12)                     # each band is 12° tall
    alts, azs, omg = [], [], []
    for alt_deg, cnt in zip(band_alt, band_cnt):
        a = math.radians(alt_deg)
        ring = 2 * math.pi * (math.sin(a + span / 2) - math.sin(a - span / 2))
        per = ring / cnt
        for k in range(cnt):
            alts.append(a)
            azs.append(2 * math.pi * (k + 0.5) / cnt)
            omg.append(per)
    cap_lo = math.radians(84)                   # zenith cap 84°–90°
    alts.append(math.radians(90)); azs.append(0.0)
    omg.append(2 * math.pi * (1 - math.sin(cap_lo)))
    return np.array(alts), np.array(azs), np.array(omg)


def _patch_vectors(alts, azs):
    """Unit vectors (East, North, Up) for each patch direction."""
    ca = np.cos(alts)
    return np.stack([ca * np.sin(azs), ca * np.cos(azs), np.sin(alts)], axis=1)


# ── EPW parsing + cumulative sky matrix ───────────────────────────────────────
def _parse_epw(path: str):
    if path in _EPW_CACHE:
        return _EPW_CACHE[path]
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.read().splitlines()
    loc = lines[0].split(",")
    lat, lon, tz = float(loc[6]), float(loc[7]), float(loc[8])
    rows = []
    for ln in lines[8:]:
        p = ln.split(",")
        if len(p) < 16:
            continue
        try:
            mo, dy, hr = int(p[1]), int(p[2]), int(p[3])
            dni, dhi = float(p[14]), float(p[15])   # W/m² (Wh over the hour)
        except ValueError:
            continue
        rows.append((mo, dy, hr, dni, dhi))
    out = (lat, lon, tz, rows)
    _EPW_CACHE[path] = out
    return out


def _sky_matrix(path: str, season: str, alts, azs, omg):
    """Per-patch cumulative radiation (kWh/m² arriving head-on) over the season.
    Direct beam → the patch nearest the sun; diffuse → isotropic over the dome."""
    key = (path, season)
    if key in _SKY_CACHE:
        return _SKY_CACHE[key]
    lat, lon, tz, rows = _parse_epw(path)
    months = SEASONS[season]
    pvec = _patch_vectors(alts, azs)
    direct = np.zeros(len(alts))   # Wh/m² head-on, summed into nearest patch
    dhi_sum = 0.0
    for mo, dy, hr, dni, dhi in rows:
        if mo not in months:
            continue
        if dhi > 0:
            dhi_sum += dhi
        if dni > 0:
            # sun position at the hour midpoint, converted local-standard → UTC
            local = datetime(2021, mo, dy) + timedelta(hours=hr - 0.5)
            alt, az = sun_alt_az(lat, lon, local - timedelta(hours=tz))
            if alt > 0:
                sv = np.array([math.cos(math.radians(alt)) * math.sin(math.radians(az)),
                               math.cos(math.radians(alt)) * math.cos(math.radians(az)),
                               math.sin(math.radians(alt))])
                direct[int(np.argmax(pvec @ sv))] += dni
    # isotropic diffuse: a head-on surface sees (DHI/π)·Ω from each patch
    diffuse = (dhi_sum / math.pi) * omg
    patch_kwh = (direct + diffuse) / 1000.0
    _SKY_CACHE[key] = patch_kwh
    return patch_kwh


# ── Building height field (mirrors backend/sun_hours rasterisation) ────────────
def _height_field(lat, lon, radius_m, grid_m, buildings):
    m_per_lat = 110540.0
    m_per_lon = 111320.0 * math.cos(math.radians(lat))
    ctx_scan = radius_m + 550
    polys, heights, max_h = [], [], 3.0
    for b in buildings:
        c = b.get("coordinates") or []
        ring = c[0] if c and isinstance(c[0][0], (list, tuple)) else c
        if not ring or len(ring) < 3:
            continue
        clon = sum(p[0] for p in ring) / len(ring)
        clat = sum(p[1] for p in ring) / len(ring)
        dx = (clon - lon) * m_per_lon
        dy = (clat - lat) * m_per_lat
        if dx * dx + dy * dy > (ctx_scan + 60) ** 2:
            continue
        h = b.get("height")
        h = float(h) if h else (float(b.get("floors") or 2) * 3.0)
        pts = [((p[0] - lon) * m_per_lon, (p[1] - lat) * m_per_lat) for p in ring]
        try:
            poly = Polygon(pts)
            if not poly.is_valid or poly.area <= 0:
                continue
        except Exception:
            continue
        polys.append(poly); heights.append(h); max_h = max(max_h, h)

    ctx_r = radius_m + min(500.0, max_h / math.tan(math.radians(12)) + 20)
    n = int(math.ceil(2 * ctx_r / grid_m))
    origin = -ctx_r
    H = np.zeros((n, n), dtype="float32")
    for poly, h in zip(polys, heights):
        minx, miny, maxx, maxy = poly.bounds
        c0 = max(0, int((minx - origin) / grid_m)); c1 = min(n - 1, int((maxx - origin) / grid_m) + 1)
        r0 = max(0, int((miny - origin) / grid_m)); r1 = min(n - 1, int((maxy - origin) / grid_m) + 1)
        if c1 < c0 or r1 < r0:
            continue
        cols = np.arange(c0, c1 + 1); rows = np.arange(r0, r1 + 1)
        gx, gy = np.meshgrid(origin + (cols + 0.5) * grid_m, origin + (rows + 0.5) * grid_m)
        inside = _contains(poly, _points(gx.ravel(), gy.ravel())).reshape(gy.shape)
        sub = H[r0:r1 + 1, c0:c1 + 1]
        block = inside & (sub < h)
        sub[block] = h
        H[r0:r1 + 1, c0:c1 + 1] = sub
    return H, n, origin, ctx_r, max_h, m_per_lon, m_per_lat, len(polys)


def compute_incident(lat: float, lon: float, radius_m: float, grid_m: float,
                     buildings: list, epw_path: str) -> dict:
    radius_m = float(max(20, min(400, radius_m)))
    grid_m = float(max(2, min(20, grid_m)))
    alts, azs, omg = _tregenza_dome()
    cos_inc = np.sin(alts)   # ground normal is up → incidence cosine = sin(patch altitude)

    # per-season sky matrices (cheap, cached); visibility is shared across seasons
    sky = {s: _sky_matrix(epw_path, s, alts, azs, omg) for s in SEASON_ORDER}

    H, n, origin, ctx_r, max_h, m_per_lon, m_per_lat, n_ctx = \
        _height_field(lat, lon, radius_m, grid_m, buildings)

    # ground cells inside the radius, skipping cells inside a building footprint
    s = int(math.ceil(2 * radius_m / grid_m))
    xs, ys, cell_lonlat = [], [], []
    for j in range(s):
        yy = -radius_m + (j + 0.5) * grid_m
        for i in range(s):
            xx = -radius_m + (i + 0.5) * grid_m
            if xx * xx + yy * yy <= radius_m * radius_m:
                ci = int((xx - origin) / grid_m); ri = int((yy - origin) / grid_m)
                if 0 <= ci < n and 0 <= ri < n and H[ri, ci] > 0.5:
                    continue
                xs.append(xx); ys.append(yy)
                cell_lonlat.append((lon + xx / m_per_lon, lat + yy / m_per_lat))
    xs = np.asarray(xs); ys = np.asarray(ys)
    M = len(xs)

    incident = {s: np.zeros(M, dtype="float32") for s in SEASON_ORDER}
    for pi in range(len(alts)):
        alt = alts[pi]
        tan_alt = math.tan(alt)
        if tan_alt <= 1e-6:               # zenith cap — never blocked by buildings
            for sname in SEASON_ORDER:
                incident[sname] += sky[sname][pi] * cos_inc[pi]
            continue
        dxu, dyu = math.sin(azs[pi]), math.cos(azs[pi])
        reach = max_h / tan_alt           # beyond this a building can't reach the ray
        steps = min(int(math.ceil(ctx_r / grid_m)), int(math.ceil(reach / grid_m)) + 1)
        shaded = np.zeros(M, dtype=bool)
        for k in range(1, steps + 1):
            dist = k * grid_m
            col = ((xs + dist * dxu - origin) / grid_m).astype(np.int32)
            row = ((ys + dist * dyu - origin) / grid_m).astype(np.int32)
            inb = (col >= 0) & (col < n) & (row >= 0) & (row < n)
            idx = np.where(inb & ~shaded)[0]
            if idx.size:
                hit = H[row[idx], col[idx]] > dist * tan_alt
                shaded[idx[hit]] = True
            if shaded.all():
                break
        vis = (~shaded).astype("float32")
        for sname in SEASON_ORDER:
            incident[sname] += sky[sname][pi] * cos_inc[pi] * vis

    pts_out = [[round(lo, 6), round(la, 6)] for (lo, la) in cell_lonlat]
    radiation = {s: [round(float(v), 1) for v in incident[s]] for s in SEASON_ORDER}
    maxima = {s: round(float(incident[s].max()) if M else 0, 1) for s in SEASON_ORDER}
    return {
        "points": pts_out,
        "radiation": radiation,
        "seasons": SEASON_ORDER,
        "max": maxima,
        "grid_m": grid_m,
        "radius_m": radius_m,
        "n_cells": M,
        "n_context_buildings": n_ctx,
        "center": [lon, lat],
    }


_TREE_CACHE: dict[str, list] = {}


def _load_trees(veg_path: str) -> list:
    """[(lon, lat, h, crown)] from dtcc_vegetation.json (cached; Gothenburg-only)."""
    if not veg_path or not os.path.exists(veg_path):
        return []
    if veg_path in _TREE_CACHE:
        return _TREE_CACHE[veg_path]
    import json as _json
    d = _json.loads(open(veg_path, "r", encoding="utf-8").read())
    out = [(t["lon"], t["lat"], float(t.get("h") or 0), float(t.get("crown") or 2.0))
           for t in d.get("trees", []) if t.get("h")]
    _TREE_CACHE[veg_path] = out
    return out


def compute_incident_surfaces(lat: float, lon: float, radius_m: float, grid_m: float,
                              buildings: list, epw_path: str, veg_path: str = "",
                              tree_transmittance: float = 0.3) -> dict:
    """Incident solar radiation (kWh/m²) on building ROOFS and FACADES within the
    radius, shaded by surrounding buildings (opaque) and tree crowns (semi-
    transparent). Returns per-surface-cell quads with per-season values."""
    import os as _os
    radius_m = float(max(20, min(250, radius_m)))
    grid_m = float(max(2, min(10, grid_m)))
    alts, azs, omg = _tregenza_dome()
    pvec = _patch_vectors(alts, azs)   # (P,3) East/North/Up
    sky = {s: _sky_matrix(epw_path, s, alts, azs, omg) for s in SEASON_ORDER}

    m_per_lat = 110540.0
    m_per_lon = 111320.0 * math.cos(math.radians(lat))

    # buildings near the point in a local metre frame
    ctx_scan = radius_m + 400
    polys, heights, max_h = [], [], 3.0
    for b in buildings:
        c = b.get("coordinates") or []
        ring = c[0] if c and isinstance(c[0][0], (list, tuple)) else c
        if not ring or len(ring) < 3:
            continue
        clon = sum(p[0] for p in ring) / len(ring); clat = sum(p[1] for p in ring) / len(ring)
        if ((clon - lon) * m_per_lon) ** 2 + ((clat - lat) * m_per_lat) ** 2 > (ctx_scan + 60) ** 2:
            continue
        h = b.get("height"); h = float(h) if h else float(b.get("floors") or 2) * 3.0
        pts = [((p[0] - lon) * m_per_lon, (p[1] - lat) * m_per_lat) for p in ring]
        try:
            poly = Polygon(pts)
            if not poly.is_valid or poly.area <= 0:
                continue
        except Exception:
            continue
        polys.append((poly, pts)); heights.append(h); max_h = max(max_h, h)

    ctx_r = radius_m + min(400.0, max_h / math.tan(math.radians(12)) + 20)
    n = int(math.ceil(2 * ctx_r / grid_m)); origin = -ctx_r
    Hb = np.zeros((n, n), dtype="float32")     # opaque buildings
    Ht = np.zeros((n, n), dtype="float32")     # semi-transparent tree tops
    for (poly, _pts), h in zip(polys, heights):
        minx, miny, maxx, maxy = poly.bounds
        c0 = max(0, int((minx - origin) / grid_m)); c1 = min(n - 1, int((maxx - origin) / grid_m) + 1)
        r0 = max(0, int((miny - origin) / grid_m)); r1 = min(n - 1, int((maxy - origin) / grid_m) + 1)
        if c1 < c0 or r1 < r0:
            continue
        cols = np.arange(c0, c1 + 1); rows = np.arange(r0, r1 + 1)
        gx, gy = np.meshgrid(origin + (cols + 0.5) * grid_m, origin + (rows + 0.5) * grid_m)
        inside = _contains(poly, _points(gx.ravel(), gy.ravel())).reshape(gy.shape)
        sub = Hb[r0:r1 + 1, c0:c1 + 1]; sub[inside & (sub < h)] = h; Hb[r0:r1 + 1, c0:c1 + 1] = sub
    # tree crowns → Ht (max tree top over each cell it covers)
    for tlon, tlat, th, tcr in _load_trees(veg_path):
        tx = (tlon - lon) * m_per_lon; ty = (tlat - lat) * m_per_lat
        if tx * tx + ty * ty > (ctx_scan + 20) ** 2:
            continue
        rr = max(grid_m, tcr)
        c0 = max(0, int((tx - rr - origin) / grid_m)); c1 = min(n - 1, int((tx + rr - origin) / grid_m))
        r0 = max(0, int((ty - rr - origin) / grid_m)); r1 = min(n - 1, int((ty + rr - origin) / grid_m))
        for rc in range(r0, r1 + 1):
            for cc in range(c0, c1 + 1):
                if Ht[rc, cc] < th:
                    Ht[rc, cc] = th

    # ── build surface cells (roofs + facades) for buildings within the radius ──
    cx, cy, cz, nx, ny, nz, quads, kinds = [], [], [], [], [], [], [], []
    r2 = radius_m * radius_m
    for (poly, pts), h in zip(polys, heights):
        ce = poly.centroid
        if ce.x * ce.x + ce.y * ce.y > (radius_m + 30) ** 2:
            continue
        # ROOF: grid cells inside the footprint at z=h, normal up
        minx, miny, maxx, maxy = poly.bounds
        ii = np.arange(minx + grid_m / 2, maxx, grid_m); jj = np.arange(miny + grid_m / 2, maxy, grid_m)
        for yy in jj:
            for xx in ii:
                if xx * xx + yy * yy > r2 or not poly.contains(_points([xx], [yy])[0]):
                    continue
                cx.append(xx); cy.append(yy); cz.append(h); nx.append(0.0); ny.append(0.0); nz.append(1.0)
                g = grid_m / 2
                quads.append([(xx - g, yy - g, h), (xx + g, yy - g, h), (xx + g, yy + g, h), (xx - g, yy + g, h)])
                kinds.append("roof")
        # FACADES: per edge, grid horizontally × vertically, outward normal
        ring = pts if pts[0] == pts[-1] else pts + [pts[0]]
        for a, bb in zip(ring[:-1], ring[1:]):
            ex, ey = bb[0] - a[0], bb[1] - a[1]; L = math.hypot(ex, ey)
            if L < 0.5:
                continue
            ux, uy = ex / L, ey / L
            nrx, nry = uy, -ux                      # perpendicular
            mx, my = (a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2
            if (mx + nrx) ** 2 + (my + nry) ** 2 < mx * mx + my * my:  # point outward
                nrx, nry = -nrx, -nry
            n_h = max(1, int(math.ceil(L / grid_m))); n_v = max(1, int(math.ceil(h / grid_m)))
            sh, sv = L / n_h, h / n_v
            for i in range(n_h):
                for j in range(n_v):
                    px = a[0] + (i + 0.5) * sh * ux + nrx * 0.1
                    py = a[1] + (i + 0.5) * sh * uy + nry * 0.1
                    z = (j + 0.5) * sv
                    if px * px + py * py > r2:
                        continue
                    cx.append(px); cy.append(py); cz.append(z); nx.append(nrx); ny.append(nry); nz.append(0.0)
                    hx, hy = ux * sh / 2, uy * sh / 2; vz = sv / 2
                    quads.append([(px - hx, py - hy, z - vz), (px + hx, py + hy, z - vz),
                                  (px + hx, py + hy, z + vz), (px - hx, py - hy, z + vz)])
                    kinds.append("facade")

    M = len(cx)
    cxa = np.asarray(cx); cya = np.asarray(cy); cza = np.asarray(cz)
    nxa = np.asarray(nx); nya = np.asarray(ny); nza = np.asarray(nz)
    incident = {s: np.zeros(M, dtype="float32") for s in SEASON_ORDER}
    K = int(math.ceil(ctx_r / grid_m))
    for pi in range(len(alts)):
        alt = float(alts[pi]); tan_alt = math.tan(alt)
        px, py, pz = float(pvec[pi, 0]), float(pvec[pi, 1]), float(pvec[pi, 2])
        cos_inc = np.clip(nxa * px + nya * py + nza * pz, 0.0, None)
        active = cos_inc > 1e-6
        if not active.any():
            continue
        blocked = np.zeros(M, dtype=bool); canopy = np.zeros(M, dtype=bool)
        if tan_alt > 1e-6:
            dxu, dyu = math.sin(azs[pi]), math.cos(azs[pi])
            steps = min(K, int(math.ceil((max_h / tan_alt) / grid_m)) + 1)
            for k in range(1, steps + 1):
                dist = k * grid_m
                col = ((cxa + dist * dxu - origin) / grid_m).astype(np.int32)
                row = ((cya + dist * dyu - origin) / grid_m).astype(np.int32)
                inb = (col >= 0) & (col < n) & (row >= 0) & (row < n)
                idx = np.where(inb & active & ~blocked)[0]
                if not idx.size:
                    break
                rh = cza[idx] + dist * tan_alt
                hb = Hb[row[idx], col[idx]]; ht = Ht[row[idx], col[idx]]
                blocked[idx[hb > rh]] = True
                canopy[idx[(ht > rh) & (hb <= rh)]] = True
        vis = np.where(blocked, 0.0, np.where(canopy, tree_transmittance, 1.0)) * active
        contrib = cos_inc * vis
        for s in SEASON_ORDER:
            incident[s] += float(sky[s][pi]) * contrib

    # emit cells with lon/lat/z quad corners
    out_cells = []
    for i in range(M):
        corners = [[round(lon + q[0] / m_per_lon, 6), round(lat + q[1] / m_per_lat, 6), round(q[2], 2)]
                   for q in quads[i]]
        out_cells.append({"c": corners, "k": kinds[i],
                          "v": {s: round(float(incident[s][i]), 1) for s in SEASON_ORDER}})
    maxima = {s: round(float(incident[s].max()) if M else 0, 1) for s in SEASON_ORDER}
    return {"cells": out_cells, "seasons": SEASON_ORDER, "max": maxima,
            "n_cells": M, "n_context_buildings": len(polys), "center": [lon, lat],
            "radius_m": radius_m, "grid_m": grid_m}


if __name__ == "__main__":
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    epw = os.path.join(root, "data", "epw", "SWE_VG_Goteborg.City.AP.025120_TMYx.2009-2023.epw")
    lat, lon = 57.7089, 11.9746
    demo = [{"coordinates": [[[11.9746, 57.7090], [11.9752, 57.7090],
                              [11.9752, 57.7093], [11.9746, 57.7093], [11.9746, 57.7090]]],
             "height": 30}]
    r = compute_incident(lat, lon, 100, 5, demo, epw)
    print("cells", r["n_cells"], "ctx", r["n_context_buildings"])
    for s in r["seasons"]:
        vals = r["radiation"][s]
        print(f"  {s:8s} max {r['max'][s]:7.1f}  open-cell≈{max(vals):7.1f}  min {min(vals):6.1f} kWh/m2")
