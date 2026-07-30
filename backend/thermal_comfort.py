"""Outdoor thermal comfort (UTCI) + solar mean radiant temperature over a ground
disc — MIT clean-room + the MIT-licensed `pythermalcomfort` library.

No Ladybug code. The models are published standards:
  • UTCI  — Bröde et al. 2012 polynomial            (pythermalcomfort.utci)
  • Solar MRT — SolarCal, ASHRAE-55 / Arens et al.  (pythermalcomfort.solar_gain)

Per ground cell, at a chosen hour:
    MRT  = air_temp + ΔMRT_solar        (ΔMRT_solar from SolarCal where sunlit)
    UTCI = utci(air_temp, MRT, wind, rh)

The two geometric inputs SolarCal needs — is the cell in sun, and how much sky it
sees (sky-view-factor) — come from the same building height-field ray-march the
sun-hours and incident-radiation engines use. Base (longwave) MRT is approximated
by air temperature for now; sky/surface temperatures can refine it later.

Climate (air temp, humidity, wind, direct-normal irradiance) is read from the EPW
— real typical-year data, nothing fabricated.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np

from backend.sun_hours import sun_alt_az
from backend.incident_radiation import _tregenza_dome, _height_field, _patch_vectors

# UTCI thermal-stress assessment scale (°C) — standard 10-category breakpoints.
UTCI_BINS = [-40, -27, -13, 0, 9, 26, 32, 38, 46]
UTCI_LABELS = [
    "extreme cold stress", "very strong cold stress", "strong cold stress",
    "moderate cold stress", "slight cold stress", "no thermal stress",
    "moderate heat stress", "strong heat stress", "very strong heat stress",
    "extreme heat stress",
]

GROUND_REFLECTANCE = 0.25   # urban ground (asphalt/paving) shortwave reflectance
BODY_ABSORPTANCE = 0.7      # SolarCal default shortwave absorptivity of a person

_EPW_FULL_CACHE: dict[str, tuple] = {}


def _parse_epw_full(path: str):
    """(lat, lon, tz, rows), rows = (month, day, hour, Ta, RH, wind, DNI, IRsky)."""
    if path in _EPW_FULL_CACHE:
        return _EPW_FULL_CACHE[path]
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.read().splitlines()
    loc = lines[0].split(",")
    lat, lon, tz = float(loc[6]), float(loc[7]), float(loc[8])
    rows = []
    for ln in lines[8:]:
        p = ln.split(",")
        if len(p) < 22:
            continue
        try:
            mo, dy, hr = int(p[1]), int(p[2]), int(p[3])
            ta, rh = float(p[6]), float(p[8])     # dry-bulb °C, RH %
            ir = float(p[12])                     # horizontal infrared from sky W/m²
            dni = float(p[14])                    # direct normal W/m²
            wind = float(p[21])                   # wind speed m/s (10 m)
        except (ValueError, IndexError):
            continue
        rows.append((mo, dy, hr, ta, rh, wind, dni, ir))
    out = (lat, lon, tz, rows)
    _EPW_FULL_CACHE[path] = out
    return out


_SIGMA = 5.670374419e-8   # Stefan–Boltzmann


def _mrt_longwave(ta, ir, svf):
    """Longwave mean radiant temperature (°C, per cell) from the sky radiant
    temperature and the surrounding surfaces, weighted by sky-view-factor.
    A standing person sees ~half sky when fully open, so f_sky = 0.5·SVF; the
    rest is terrestrial surfaces taken at air temperature."""
    ta_k = ta + 273.15
    t_sky_k = (ir / _SIGMA) ** 0.25 if ir and ir > 0 else (ta_k - 20.0)
    f_sky = 0.5 * svf
    mrt_k = (f_sky * t_sky_k ** 4 + (1.0 - f_sky) * ta_k ** 4) ** 0.25
    return mrt_k - 273.15


def _march_shaded(xs, ys, H, n, origin, grid_m, ctx_r, max_h, alt, az):
    """Boolean per cell: is the ray toward (alt, az) blocked by a building?"""
    M = len(xs)
    tan_alt = math.tan(alt)
    if tan_alt <= 1e-6:
        return np.zeros(M, dtype=bool)   # overhead — nothing blocks it
    dxu, dyu = math.sin(az), math.cos(az)
    reach = max_h / tan_alt
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
    return shaded


def compute_comfort(lat: float, lon: float, radius_m: float, grid_m: float,
                    buildings: list, epw_path: str, date: str) -> dict:
    from pythermalcomfort.models import utci, solar_gain

    radius_m = float(max(20, min(400, radius_m)))
    grid_m = float(max(2, min(20, grid_m)))
    alts, azs, omg = _tregenza_dome()
    total_omega = float(omg.sum())

    H, n, origin, ctx_r, max_h, m_per_lon, m_per_lat, n_ctx = \
        _height_field(lat, lon, radius_m, grid_m, buildings)

    # ground cells, skipping building footprints
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

    # sky-view-factor per cell (solid-angle-weighted fraction of visible sky) —
    # geometry only, computed once and reused for every hour.
    vis_omega = np.zeros(M, dtype="float64")
    for pi in range(len(alts)):
        shaded = _march_shaded(xs, ys, H, n, origin, grid_m, ctx_r, max_h, alts[pi], azs[pi])
        vis_omega += omg[pi] * (~shaded)
    svf = np.clip(vis_omega / total_omega, 0.0, 1.0) if M else np.zeros(0)

    _, _, tz, rows = _parse_epw_full(epw_path)
    base = datetime.strptime(date, "%Y-%m-%d")
    mo, dy = base.month, base.day
    svf_samples = np.linspace(0.0, 1.0, 41)

    sharp_avg = (0.0, 45.0, 90.0, 135.0, 180.0)          # average over body orientation
    frames = []
    for (rmo, rdy, hr, ta, rh, wind, dni, ir) in rows:
        if rmo != mo or rdy != dy:
            continue
        local = base + timedelta(hours=hr - 0.5)         # hour midpoint
        sun_alt, sun_az = sun_alt_az(lat, lon, local - timedelta(hours=tz))
        wind_eff = max(0.5, wind)                         # UTCI wind floor

        # longwave MRT (per cell) from sky radiant temp + surroundings, always
        mrt = _mrt_longwave(ta, ir, svf) if M else np.zeros(0)
        in_sun = np.zeros(M, dtype=bool)
        if sun_alt > 0 and M:
            in_sun = ~_march_shaded(xs, ys, H, n, origin, grid_m, ctx_r, max_h,
                                    math.radians(sun_alt), math.radians(sun_az))
            # ΔMRT_solar vs sky-view-factor, orientation-averaged, then interpolate
            dmrt_curve = np.array([
                float(np.mean([
                    solar_gain(sol_altitude=sun_alt, sharp=sh, sol_radiation_dir=dni,
                               sol_transmittance=1.0, f_svv=float(f), f_bes=1.0,
                               asw=BODY_ABSORPTANCE, posture="standing",
                               floor_reflectance=GROUND_REFLECTANCE)["delta_mrt"]
                    for sh in sharp_avg]))
                for f in svf_samples])
            mrt = mrt + np.interp(svf, svf_samples, dmrt_curve) * in_sun

        if M:
            u = utci(tdb=ta, tr=mrt, v=wind_eff, rh=rh, limit_inputs=False)
            u = np.asarray(u, dtype="float64")
            cat = np.digitize(u, UTCI_BINS).astype(int)
            hh = (int((hr - 1)) % 24)                     # EPW hour 1..24 → clock hour
            frames.append({
                "t": f"{hh:02d}:00",
                "ta": round(ta, 1), "rh": round(rh, 0), "wind": round(wind, 1),
                "sun_alt": round(sun_alt, 1),
                "utci": [round(float(v), 1) for v in u],
                "cat": [int(c) for c in cat],
            })

    frames.sort(key=lambda f: f["t"])
    pts_out = [[round(lo, 6), round(la, 6)] for (lo, la) in cell_lonlat]
    return {
        "points": pts_out,
        "frames": frames,
        "labels": UTCI_LABELS,
        "bins": UTCI_BINS,
        "date": date,
        "grid_m": grid_m,
        "radius_m": radius_m,
        "n_cells": M,
        "n_context_buildings": n_ctx,
        "center": [lon, lat],
    }


SEASON_OF_MONTH = {6: "summer", 7: "summer", 8: "summer",
                   12: "winter", 1: "winter", 2: "winter",
                   3: "equinox", 4: "equinox", 5: "equinox",
                   9: "equinox", 10: "equinox", 11: "equinox"}


def compute_comfort_seasons(lat: float, lon: float, radius_m: float, grid_m: float,
                            buildings: list, epw_path: str) -> dict:
    """Per-cell share of daytime hours in the comfortable UTCI band (no thermal
    stress, 9–26 °C) for each season. Reuses per-patch sky visibility so no hour
    needs its own ray-march, and a ΔMRT lookup table so SolarCal is called only a
    few thousand times total rather than per hour."""
    from pythermalcomfort.models import utci, solar_gain

    radius_m = float(max(20, min(400, radius_m)))
    grid_m = float(max(2, min(20, grid_m)))
    alts, azs, omg = _tregenza_dome()
    pvec = _patch_vectors(alts, azs)
    total_omega = float(omg.sum())

    H, n, origin, ctx_r, max_h, m_per_lon, m_per_lat, n_ctx = \
        _height_field(lat, lon, radius_m, grid_m, buildings)

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

    # per-patch visibility (kept) + sky-view-factor
    vis_masks = []
    vis_omega = np.zeros(M, dtype="float64")
    for pi in range(len(alts)):
        vis = ~_march_shaded(xs, ys, H, n, origin, grid_m, ctx_r, max_h, alts[pi], azs[pi])
        vis_masks.append(vis)
        vis_omega += omg[pi] * vis
    svf = np.clip(vis_omega / total_omega, 0.0, 1.0) if M else np.zeros(0)

    # ΔMRT_solar lookup [sun-altitude bin, sky-view sample] at a reference DNI,
    # orientation-averaged. ΔMRT scales ~linearly with DNI, so scale per hour.
    DNI_REF = 1000.0
    alt_bins = np.arange(2.0, 90.0, 4.0)
    svf_samples = np.linspace(0.0, 1.0, 41)
    sharp_avg = (0.0, 45.0, 90.0, 135.0, 180.0)
    table = np.zeros((len(alt_bins), len(svf_samples)))
    for ai, a in enumerate(alt_bins):
        for si, f in enumerate(svf_samples):
            table[ai, si] = float(np.mean([
                solar_gain(sol_altitude=float(a), sharp=sh, sol_radiation_dir=DNI_REF,
                           sol_transmittance=1.0, f_svv=float(f), f_bes=1.0,
                           asw=BODY_ABSORPTANCE, posture="standing",
                           floor_reflectance=GROUND_REFLECTANCE)["delta_mrt"]
                for sh in sharp_avg]))

    _, _, tz, rows = _parse_epw_full(epw_path)
    three = ("summer", "equinox", "winter")
    comfort = {s: np.zeros(M, dtype="float64") for s in three}
    total = {s: 0 for s in three}

    for (mo, dy, hr, ta, rh, wind, dni, ir) in rows:
        if M == 0:
            break
        local = datetime(2021, mo, dy) + timedelta(hours=hr - 0.5)
        sun_alt, sun_az = sun_alt_az(lat, lon, local - timedelta(hours=tz))
        if sun_alt <= 0:                       # daytime only
            continue
        season = SEASON_OF_MONTH[mo]
        total[season] += 1
        wind_eff = max(0.5, wind)
        # in-sun from the sky patch containing the sun (no per-hour ray-march)
        sv = np.array([math.cos(math.radians(sun_alt)) * math.sin(math.radians(sun_az)),
                       math.cos(math.radians(sun_alt)) * math.cos(math.radians(sun_az)),
                       math.sin(math.radians(sun_alt))])
        in_sun = vis_masks[int(np.argmax(pvec @ sv))]
        mrt = _mrt_longwave(ta, ir, svf)
        if dni > 0:
            ai = int(np.argmin(np.abs(alt_bins - sun_alt)))
            mrt = mrt + np.interp(svf, svf_samples, table[ai]) * (dni / DNI_REF) * in_sun
        u = np.asarray(utci(tdb=ta, tr=mrt, v=wind_eff, rh=rh, limit_inputs=False), dtype="float64")
        comfort[season] += ((u >= 9.0) & (u <= 26.0))

    pct = {s: (comfort[s] / max(1, total[s]) * 100.0) for s in three}
    yc = comfort["summer"] + comfort["equinox"] + comfort["winter"]
    yt = total["summer"] + total["equinox"] + total["winter"]
    pct["year"] = yc / max(1, yt) * 100.0
    seasons = ["year", "summer", "equinox", "winter"]
    hours = {s: int(total[s]) for s in three}
    hours["year"] = int(yt)

    pts_out = [[round(lo, 6), round(la, 6)] for (lo, la) in cell_lonlat]
    return {
        "points": pts_out,
        "comfort_pct": {s: [round(float(v), 1) for v in pct[s]] for s in seasons},
        "seasons": seasons,
        "hours": hours,
        "max": {s: round(float(pct[s].max()) if M else 0, 1) for s in seasons},
        "grid_m": grid_m,
        "radius_m": radius_m,
        "n_cells": M,
        "n_context_buildings": n_ctx,
        "center": [lon, lat],
    }


if __name__ == "__main__":
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    epw = os.path.join(root, "data", "epw", "SWE_VG_Goteborg.City.AP.025120_TMYx.2009-2023.epw")
    lat, lon = 57.7089, 11.9746
    demo = [{"coordinates": [[[11.9746, 57.7090], [11.9752, 57.7090],
                              [11.9752, 57.7093], [11.9746, 57.7093], [11.9746, 57.7090]]],
             "height": 30}]
    r = compute_comfort(lat, lon, 100, 5, demo, epw, "2026-06-21")
    print("cells", r["n_cells"], "ctx", r["n_context_buildings"], "frames", len(r["frames"]))
    for f in r["frames"]:
        if f["t"] in ("06:00", "13:00", "18:00"):
            u = f["utci"]
            import statistics as st
            print(f"  {f['t']}  Ta={f['ta']}°C wind={f['wind']} sun={f['sun_alt']}° | "
                  f"UTCI min {min(u):.1f} / mean {st.mean(u):.1f} / max {max(u):.1f} °C")
