"""Direct sun-hours analysis over a ground disc around a clicked point.

MIT-clean (no Ladybug/AGPL): sun position via a compact astronomical algorithm,
shading via a ray-marched height-map shadow test. Given a point + radius, lays a
ground grid, and for each cell counts the hours of a chosen day the sun reaches
it unobstructed by surrounding buildings.

    from backend.sun_hours import compute_sun_hours
    result = compute_sun_hours(lat, lon, radius_m, grid_m, buildings, "2026-06-21")

`buildings` are records with `coordinates` (lon/lat rings) and `height` (m).
Flat ground is assumed (building bases at 0) — good enough for a first pass.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np
from shapely.geometry import Polygon
from shapely.prepared import prep


# ── Sun position (low-precision astronomical algorithm, ~0.01° good) ──────────
def sun_alt_az(lat: float, lon: float, dt: datetime) -> tuple[float, float]:
    """Solar altitude and azimuth (deg) for a naive-UTC datetime.
    Azimuth is measured clockwise from North (N=0, E=90, S=180, W=270)."""
    y, mo, d = dt.year, dt.month, dt.day
    h = dt.hour + dt.minute / 60 + dt.second / 3600
    if mo <= 2:
        y -= 1
        mo += 12
    A = y // 100
    B = 2 - A + A // 4
    jd = math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (mo + 1)) + d + B - 1524.5 + h / 24
    n = jd - 2451545.0
    L = math.radians((280.460 + 0.9856474 * n) % 360)
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = L + math.radians(1.915) * math.sin(g) + math.radians(0.020) * math.sin(2 * g)
    eps = math.radians(23.439 - 0.0000004 * n)
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    gmst = (6.697375 + 0.0657098242 * n + h) % 24
    lst = math.radians((gmst * 15 + lon) % 360)
    ha = lst - ra
    latr = math.radians(lat)
    alt = math.asin(math.sin(latr) * math.sin(dec) + math.cos(latr) * math.cos(dec) * math.cos(ha))
    # azimuth from South, then rotate to from-North-clockwise
    az_s = math.atan2(math.sin(ha), math.cos(ha) * math.sin(latr) - math.tan(dec) * math.cos(latr))
    az = (math.degrees(az_s) + 180.0) % 360.0
    return math.degrees(alt), az


def _euro_dst(date: str) -> bool:
    """Rough European DST: last Sun of March 01:00 UTC → last Sun of October.
    Good enough for labelling clock hours (never affects the geometry)."""
    dt = datetime.strptime(date, "%Y-%m-%d")
    y = dt.year
    # last Sunday of a month
    def last_sun(mo):
        d = datetime(y, mo, 31)
        while d.month != mo:
            d = datetime(y, mo, d.day - 1)
        return d - timedelta(days=(d.weekday() + 1) % 7)
    return last_sun(3) <= dt < last_sun(10)


def _daylight_positions(lat: float, lon: float, date: str, step_min: int = 30):
    """(alt_rad, az_rad, hours, utc_minute) for each daytime step of YYYY-MM-DD."""
    base = datetime.strptime(date, "%Y-%m-%d")
    out = []
    hours_per = step_min / 60.0
    # sweep the whole UTC day at step_min; keep steps where the sun is up
    for m in range(0, 24 * 60, step_min):
        alt, az = sun_alt_az(lat, lon, base + timedelta(minutes=m))
        if alt > 0.5:  # above the horizon (small guard)
            out.append((math.radians(alt), math.radians(az), hours_per, m))
    return out


def compute_sun_hours(lat: float, lon: float, radius_m: float, grid_m: float,
                      buildings: list, date: str, base_tz: float = 1.0) -> dict:
    radius_m = float(max(20, min(500, radius_m)))
    grid_m = float(max(2, min(20, grid_m)))
    m_per_lat = 110540.0
    m_per_lon = 111320.0 * math.cos(math.radians(lat))

    # buildings near the point, in a local metre frame (x=East, y=North from centre)
    ctx_scan = radius_m + 550
    polys, heights = [], []
    max_h = 3.0
    for b in buildings:
        c = b.get("coordinates") or []
        ring = c[0] if c and isinstance(c[0][0], (list, tuple)) else c
        if not ring or len(ring) < 3:
            continue
        # quick reject by centroid distance
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
        polys.append(poly)
        heights.append(h)
        max_h = max(max_h, h)

    # context radius: study area + how far the tallest building can cast a shadow
    # at a low but useful sun altitude (~12°). Cheap to include, correct at edges.
    ctx_r = radius_m + min(500.0, max_h / math.tan(math.radians(12)) + 20)
    n = int(math.ceil(2 * ctx_r / grid_m))
    origin = -ctx_r  # local coord of raster index 0

    # rasterise building heights onto the context grid (vectorised shapely.contains
    # over each building's candidate cells → max height per cell).
    from shapely import contains as _contains, points as _points
    H = np.zeros((n, n), dtype="float32")
    for poly, h in zip(polys, heights):
        minx, miny, maxx, maxy = poly.bounds
        c0 = max(0, int((minx - origin) / grid_m)); c1 = min(n - 1, int((maxx - origin) / grid_m) + 1)
        r0 = max(0, int((miny - origin) / grid_m)); r1 = min(n - 1, int((maxy - origin) / grid_m) + 1)
        if c1 < c0 or r1 < r0:
            continue
        cols = np.arange(c0, c1 + 1)
        rows = np.arange(r0, r1 + 1)
        cx = origin + (cols + 0.5) * grid_m
        cy = origin + (rows + 0.5) * grid_m
        gx, gy = np.meshgrid(cx, cy)
        pts = _points(gx.ravel(), gy.ravel())
        inside = _contains(poly, pts).reshape(gy.shape)
        block = inside & (H[r0:r1 + 1, c0:c1 + 1] < h)
        sub = H[r0:r1 + 1, c0:c1 + 1]
        sub[block] = h
        H[r0:r1 + 1, c0:c1 + 1] = sub

    # study cells (inside the study radius)
    s = int(math.ceil(2 * radius_m / grid_m))
    xs, ys, cell_lonlat = [], [], []
    for j in range(s):
        yy = -radius_m + (j + 0.5) * grid_m
        for i in range(s):
            xx = -radius_m + (i + 0.5) * grid_m
            if xx * xx + yy * yy <= radius_m * radius_m:
                xs.append(xx); ys.append(yy)
                cell_lonlat.append((lon + xx / m_per_lon, lat + yy / m_per_lat))
    xs = np.asarray(xs); ys = np.asarray(ys)
    M = len(xs)

    # Coarser time sampling for big grids keeps the per-timestep payload bounded.
    step_min = 60 if M > 5000 else 30
    positions = _daylight_positions(lat, lon, date, step_min=step_min)
    tz_offset = base_tz + (1.0 if _euro_dst(date) else 0.0)

    hours = np.zeros(M, dtype="float32")
    K = int(math.ceil(ctx_r / grid_m))
    frames = []  # per-timestep lit/shaded snapshot for the hour slider
    for alt, az, hpp, minute in positions:
        dxu, dyu = math.sin(az), math.cos(az)   # horizontal unit vector toward the sun
        tan_alt = math.tan(alt)
        shaded = np.zeros(M, dtype=bool)
        for k in range(1, K + 1):
            dist = k * grid_m
            sx = xs + dist * dxu
            sy = ys + dist * dyu
            col = ((sx - origin) / grid_m).astype(np.int32)
            row = ((sy - origin) / grid_m).astype(np.int32)
            inb = (col >= 0) & (col < n) & (row >= 0) & (row < n)
            ray_h = dist * tan_alt
            hit = np.zeros(M, dtype=bool)
            idx = np.where(inb & ~shaded)[0]
            if idx.size:
                hh = H[row[idx], col[idx]]
                hit[idx] = hh > ray_h
            shaded |= hit
            if shaded.all():
                break
        lit = ~shaded
        hours += lit * hpp
        local_min = minute + tz_offset * 60.0
        hh_i = int(local_min // 60) % 24
        mm_i = int(round(local_min - int(local_min // 60) * 60))
        if mm_i == 60:
            hh_i = (hh_i + 1) % 24; mm_i = 0
        frames.append({
            "t": f"{hh_i:02d}:{mm_i:02d}",
            "alt": round(math.degrees(alt), 1),
            "az": round(math.degrees(az), 1),
            "lit": lit.astype(np.uint8).tolist(),
        })

    total_possible = sum(hpp for _, _, _, _ in positions)
    pts_out = [[round(lo, 6), round(la, 6), round(float(h), 2)]
               for (lo, la), h in zip(cell_lonlat, hours)]
    return {
        "points": pts_out,
        "grid_m": grid_m,
        "radius_m": radius_m,
        "date": date,
        "tz_offset": tz_offset,
        "frames": frames,
        "max_hours": round(float(hours.max()) if M else 0, 2),
        "possible_hours": round(total_possible, 2),
        "n_cells": M,
        "n_context_buildings": len(polys),
        "center": [lon, lat],
    }


if __name__ == "__main__":
    # self-test: solar geometry sanity + a tiny run
    lat, lon = 57.7089, 11.9746  # Gothenburg
    print("noon-ish altitudes (should peak ~55.7° on Jun 21, ~9° on Dec 21):")
    for date in ["2026-06-21", "2026-12-21"]:
        best = max((sun_alt_az(lat, lon, datetime.strptime(date, "%Y-%m-%d")
                               .replace(hour=11, minute=int(m)))
                    for m in range(0, 60, 10)), key=lambda t: t[0])
        print(f"  {date}: alt={best[0]:.1f}°  az={best[1]:.0f}° (should be ~180=S)")
    demo = [{"coordinates": [[[11.9746, 57.7090], [11.9752, 57.7090],
                              [11.9752, 57.7093], [11.9746, 57.7093], [11.9746, 57.7090]]],
             "height": 30}]
    r = compute_sun_hours(lat, lon, 80, 5, demo, "2026-06-21")
    print("demo run:", {k: v for k, v in r.items() if k != "points"})
    hrs = [p[2] for p in r["points"]]
    print(f"  sun-hours range across cells: {min(hrs):.1f} .. {max(hrs):.1f}")
