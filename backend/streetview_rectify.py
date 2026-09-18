"""Whole-facade image from Street View: stitch tiles, then rectify to a flat wall.

Street View Static caps an image at 640x640, and one wide, tilted shot of a tall
building from a panorama ~10 m away is badly keystoned and coarse. Instead:

1. `plan_tiles` works out the angular extent of the wall (from its footprint edge
   and height, as seen from the panorama) and covers it with a small grid of
   overlapping narrower shots - all from the SAME panorama, so they share one
   centre of projection and stitch without parallax.
2. `rectify` lays a metric grid over the wall plane (metres along the wall x
   metres up it), projects every grid cell into whichever tile sees it most
   head-on, and samples it. The result is a fronto-parallel facade image with
   straight verticals and a known mm-per-pixel scale.

Geometry uses a local flat east/north/up frame centred on the panorama. The camera
height is assumed; ground slope between car and wall is not modelled, so the
vertical extent carries a margin.
"""
from __future__ import annotations

import io
import math

import numpy as np
from PIL import Image

TILE_PX = 640
CAMERA_HEIGHT_M = 2.5
_FOV_STEPS = (45.0, 60.0, 75.0, 90.0)
_OVERLAP = 0.8          # tile centres are 0.8 x FOV apart, so neighbours overlap 20%


def _enu(lat0: float, lon0: float, lat: float, lon: float) -> tuple[float, float]:
    return ((lon - lon0) * 111320.0 * math.cos(math.radians(lat0)), (lat - lat0) * 110540.0)


def _dir(bearing_deg: float) -> tuple[float, float]:
    b = math.radians(bearing_deg)
    return math.sin(b), math.cos(b)


def _ground_sampling(px: float, py: float, nx: float, ny: float, fov_deg: float) -> float:
    """Metres of wall per source pixel at wall point (px, py), wall normal (nx, ny).

    Two effects: distance (far wall = fewer pixels per metre) and foreshortening (a
    wall seen at a sharp angle is squeezed into few pixels, which un-squeezing it
    cannot undo - it only stretches them back out as blur).
    """
    d = math.hypot(px, py)
    if d < 1e-6:
        return float("inf")
    cos_inc = abs((-px * nx - py * ny) / d)     # normal vs the ray back to the camera
    return d * math.radians(fov_deg) / TILE_PX / max(cos_inc, 0.05)


def plan_tiles(pano_lat: float, pano_lon: float, wall_lat: float, wall_lon: float,
               normal_deg: float, width_m: float, height_m: float, max_tiles: int = 9,
               max_stretch: float = 2.5) -> dict:
    """Wall corners in the panorama's frame, and the (heading, pitch) tiles covering them.

    Only the stretch of wall this panorama actually resolves is kept. Standing 15 m
    off a 27 m wall at 47 deg, the far end arrives as a handful of grazing pixels;
    rectifying it produced a melted, blurred image that looked like a bad zoom. The
    fix is to photograph less wall, not to invent pixels for the rest.
    """
    mx, my = _enu(pano_lat, pano_lon, wall_lat, wall_lon)
    tx, ty = _dir(normal_deg + 90.0)
    nx, ny = _dir(normal_deg)
    p1 = (mx - tx * width_m / 2, my - ty * width_m / 2)
    p2 = (mx + tx * width_m / 2, my + ty * width_m / 2)
    # Order the corners left-to-right as the camera sees them.
    rx, ry = my, -mx
    if p1[0] * rx + p1[1] * ry > p2[0] * rx + p2[1] * ry:
        p1, p2 = p2, p1

    # Longest run of wall sampled no worse than `max_stretch` x its best point.
    S = 121
    gsd = [_ground_sampling(p1[0] + (p2[0] - p1[0]) * i / (S - 1),
                            p1[1] + (p2[1] - p1[1]) * i / (S - 1), nx, ny, _FOV_STEPS[0])
           for i in range(S)]
    limit = min(gsd) * max_stretch
    best, start = (0, 1), None
    for i, g in enumerate(gsd + [float("inf")]):
        if g <= limit and start is None:
            start = i
        elif g > limit and start is not None:
            if i - start > best[1] - best[0]:
                best = (start, i)
            start = None
    a, b = best[0] / (S - 1), (best[1] - 1) / (S - 1)
    full_width_m, kept = width_m, max(b - a, 1.0 / (S - 1))
    p1, p2 = ((p1[0] + (p2[0] - p1[0]) * a, p1[1] + (p2[1] - p1[1]) * a),
              (p1[0] + (p2[0] - p1[0]) * b, p1[1] + (p2[1] - p1[1]) * b))
    width_m = full_width_m * kept
    z_bot, z_top = -1.0, height_m + 1.5

    aim = math.degrees(math.atan2(mx, my))
    heads, elevs = [], []
    for s in np.linspace(0, 1, 9):
        x, y = p1[0] + (p2[0] - p1[0]) * s, p1[1] + (p2[1] - p1[1]) * s
        for z in (z_bot, z_top):
            dz = z - CAMERA_HEIGHT_M
            heads.append((math.degrees(math.atan2(x, y)) - aim + 180.0) % 360.0 - 180.0)
            elevs.append(math.degrees(math.atan2(dz, math.hypot(x, y))))
    h_lo, h_hi, e_lo, e_hi = min(heads), max(heads), min(elevs), max(elevs)

    def centres(lo: float, hi: float, fov: float) -> list[float]:
        span = hi - lo
        if span <= fov:
            return [(lo + hi) / 2]
        n = math.ceil((span - fov) / (fov * _OVERLAP)) + 1
        return list(np.linspace(lo + fov / 2, hi - fov / 2, n))

    for fov in _FOV_STEPS:
        hs, ps = centres(h_lo, h_hi, fov), centres(e_lo, e_hi, fov)
        if len(hs) * len(ps) <= max_tiles:
            break
    tiles = [((aim + h) % 360.0, max(-89.0, min(89.0, p))) for p in ps for h in hs]
    # Coarsest sampling over the kept span sets the output scale, so nothing in the
    # image is upsampled beyond what Street View actually delivered.
    worst_gsd = max(_ground_sampling(p1[0] + (p2[0] - p1[0]) * s, p1[1] + (p2[1] - p1[1]) * s, nx, ny, fov)
                    for s in (0.0, 0.25, 0.5, 0.75, 1.0))
    return {"p1": p1, "p2": p2, "z_bot": z_bot, "z_top": z_top, "fov": fov, "tiles": tiles,
            "width_m": width_m, "dist_m": math.hypot(mx, my), "worst_gsd": worst_gsd,
            "wall_shown": kept, "full_width_m": full_width_m}


def assign_columns(cameras: list[dict], wall_lat: float, wall_lon: float, normal_deg: float,
                   width_m: float, columns: int = 24, max_stretch: float = 2.5,
                   min_run: int = 2) -> list[dict]:
    """Split a wall into segments, each shot from the panorama that sees it best.

    A car drives PAST a building, so on a narrow street no single panorama sees the
    whole wall square-on - but two or three together do, each covering the stretch
    it faces. Every camera must already be checked for line of sight; `ok(frac)`
    re-checks per column, since a neighbour can block one end and not the other.

    `cameras`: [{lat, lon, meta, ok(frac)->bool}]. Returns segments
    [{camera, a, b, gsd}] with a,b as fractions (0..1) along the wall.
    """
    if not cameras or width_m <= 0:
        return []
    nx, ny = _dir(normal_deg)
    best: list[tuple[float, int] | None] = []
    for i in range(columns):
        frac = (i + 0.5) / columns
        c_lat, c_lon = _offset_latlon(wall_lat, wall_lon, normal_deg + 90.0, (frac - 0.5) * width_m)
        pick = None
        for ci, cam in enumerate(cameras):
            if not cam["ok"](frac):
                continue
            px, py = _enu(cam["lat"], cam["lon"], c_lat, c_lon)
            g = _ground_sampling(px, py, nx, ny, _FOV_STEPS[0])
            if pick is None or g < pick[0]:
                pick = (g, ci)
        best.append(pick)

    good = [b[0] for b in best if b]
    if not good:
        return []
    limit = min(good) * max_stretch
    best = [b if (b and b[0] <= limit) else None for b in best]

    segments: list[dict] = []
    i = 0
    while i < columns:
        if best[i] is None:
            i += 1
            continue
        j = i
        while j + 1 < columns and best[j + 1] and best[j + 1][1] == best[i][1]:
            j += 1
        if j - i + 1 >= min_run:
            segments.append({"camera": cameras[best[i][1]], "a": i / columns, "b": (j + 1) / columns,
                             "gsd": max(best[k][0] for k in range(i, j + 1) if best[k])})
        i = j + 1
    return segments


def _offset_latlon(lat: float, lon: float, bearing_deg: float, meters: float) -> tuple[float, float]:
    b = math.radians(bearing_deg)
    r = 6371000.0
    dlat = math.degrees((meters * math.cos(b)) / r)
    dlon = math.degrees((meters * math.sin(b)) / (r * math.cos(math.radians(lat))))
    return lat + dlat, lon + dlon


def mosaic(parts: list[tuple[int, dict]], total_w: int, height: int, m_per_px: float) -> dict:
    """Lay each segment's rectified array into one image of the whole wall."""
    canvas = np.zeros((height, total_w, 3), dtype=np.uint8)
    filled = np.zeros((height, total_w), dtype=bool)
    for x0, part in parts:
        arr, msk = part["array"], part["filled"]
        h, w = arr.shape[:2]
        x0 = max(0, min(total_w - 1, x0))
        w = min(w, total_w - x0)
        h = min(h, height)
        take = msk[:h, :w] & ~filled[:h, x0:x0 + w]
        canvas[:h, x0:x0 + w][take] = arr[:h, :w][take]
        filled[:h, x0:x0 + w] |= msk[:h, :w]

    coverage = float(filled.mean())
    # Trim rows/columns that no panorama reached: a half-black canvas reads as a
    # broken image, and the black area is not part of the wall that was seen.
    cols = np.where(filled.mean(axis=0) > 0.2)[0]
    rows = np.where(filled.mean(axis=1) > 0.2)[0]
    if cols.size and rows.size:
        canvas = canvas[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        filled = filled[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        coverage = float(filled.mean())
    buf = io.BytesIO()
    Image.fromarray(canvas).save(buf, "JPEG", quality=90)
    return {"jpeg": buf.getvalue(), "width": canvas.shape[1], "height": canvas.shape[0],
            "mm_per_px": m_per_px * 1000.0, "coverage": coverage,
            # Width actually shown, relative to the wall the footprint claims.
            "width_shown": canvas.shape[1] / max(total_w, 1)}


def rectify(plan: dict, tile_jpegs: list[bytes | None], max_px: int = 1600,
            m_per_px: float | None = None, as_array: bool = False) -> dict | None:
    """Resample the tiles onto the wall plane. Returns JPEG bytes + scale + coverage.

    `m_per_px` forces the scale, so several panoramas' pieces of one wall come out
    at the same size and can be laid side by side (see `mosaic`).
    """
    fov = plan["fov"]
    focal = (TILE_PX / 2) / math.tan(math.radians(fov) / 2)
    wall_w, wall_h = plan["width_m"], plan["z_top"] - plan["z_bot"]
    # Scale from the COARSEST point of the kept span, not the middle: sizing by the
    # middle upsampled the far end into smear.
    if m_per_px is None:
        m_per_px = max(plan["worst_gsd"], max(wall_w, wall_h) / max_px)
    W, H = max(1, round(wall_w / m_per_px)), max(1, round(wall_h / m_per_px))

    (x1, y1), (x2, y2) = plan["p1"], plan["p2"]
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    X = np.broadcast_to(x1 + (x2 - x1) * u, (H, W))
    Y = np.broadcast_to(y1 + (y2 - y1) * u, (H, W))
    Z = np.broadcast_to((plan["z_top"] - v * wall_h - CAMERA_HEIGHT_M)[:, None], (H, W))
    norm = np.sqrt(X * X + Y * Y + Z * Z)
    D = np.stack([X / norm, Y / norm, Z / norm], axis=-1)

    out = np.zeros((H, W, 3), dtype=np.float32)
    best = np.full((H, W), -np.inf, dtype=np.float32)
    for (heading, pitch), jpeg in zip(plan["tiles"], tile_jpegs):
        if not jpeg:
            continue
        img = np.asarray(Image.open(io.BytesIO(jpeg)).convert("RGB"), dtype=np.float32)
        th, tw = img.shape[:2]
        h, p = math.radians(heading), math.radians(pitch)
        f = np.array([math.sin(h) * math.cos(p), math.cos(h) * math.cos(p), math.sin(p)])
        r = np.array([math.cos(h), -math.sin(h), 0.0])
        up = np.cross(r, f)
        zc, xc, yc = D @ f, D @ r, D @ up
        with np.errstate(divide="ignore", invalid="ignore"):
            px = tw / 2 + focal * (tw / TILE_PX) * xc / zc - 0.5
            py = th / 2 - focal * (th / TILE_PX) * yc / zc - 0.5
        # Each wall cell comes from the tile that sees it most centrally.
        ok = (zc > 0.1) & (px >= 0) & (px <= tw - 1.001) & (py >= 0) & (py <= th - 1.001) & (zc > best)
        if not ok.any():
            continue
        qx, qy = px[ok], py[ok]
        x0, y0 = np.floor(qx).astype(int), np.floor(qy).astype(int)
        fx, fy = (qx - x0)[:, None], (qy - y0)[:, None]
        out[ok] = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
                   + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
        best[ok] = zc[ok]

    covered = float(np.isfinite(best).mean())
    if covered == 0.0:
        return None
    if as_array:
        return {"array": out.clip(0, 255).astype(np.uint8), "filled": np.isfinite(best),
                "width": W, "height": H, "mm_per_px": m_per_px * 1000.0, "coverage": covered}
    buf = io.BytesIO()
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(buf, "JPEG", quality=90)
    return {"jpeg": buf.getvalue(), "width": W, "height": H,
            "mm_per_px": m_per_px * 1000.0, "coverage": covered,
            # Share of the wall's width this panorama resolves well enough to show.
            "wall_shown": plan["wall_shown"], "wall_width_m": wall_w, "full_width_m": plan["full_width_m"]}
