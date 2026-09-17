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


def plan_tiles(pano_lat: float, pano_lon: float, wall_lat: float, wall_lon: float,
               normal_deg: float, width_m: float, height_m: float, max_tiles: int = 9) -> dict:
    """Wall corners in the panorama's frame, and the (heading, pitch) tiles covering them."""
    mx, my = _enu(pano_lat, pano_lon, wall_lat, wall_lon)
    tx, ty = _dir(normal_deg + 90.0)
    p1 = (mx - tx * width_m / 2, my - ty * width_m / 2)
    p2 = (mx + tx * width_m / 2, my + ty * width_m / 2)
    # Order the corners left-to-right as the camera sees them.
    rx, ry = my, -mx
    if p1[0] * rx + p1[1] * ry > p2[0] * rx + p2[1] * ry:
        p1, p2 = p2, p1
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
    return {"p1": p1, "p2": p2, "z_bot": z_bot, "z_top": z_top, "fov": fov, "tiles": tiles,
            "width_m": width_m, "dist_m": math.hypot(mx, my)}


def rectify(plan: dict, tile_jpegs: list[bytes | None], max_px: int = 1600) -> dict | None:
    """Resample the tiles onto the wall plane. Returns JPEG bytes + scale + coverage."""
    fov = plan["fov"]
    focal = (TILE_PX / 2) / math.tan(math.radians(fov) / 2)
    wall_w, wall_h = plan["width_m"], plan["z_top"] - plan["z_bot"]
    # Native resolution at the wall's middle; never upsample beyond it.
    m_per_px = max(plan["dist_m"] * math.radians(fov) / TILE_PX, max(wall_w, wall_h) / max_px)
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
    buf = io.BytesIO()
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(buf, "JPEG", quality=90)
    return {"jpeg": buf.getvalue(), "width": W, "height": H,
            "mm_per_px": m_per_px * 1000.0, "coverage": covered}
