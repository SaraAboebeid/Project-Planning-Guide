"""
geometry.py - lon/lat footprint ring -> local-meter EnergyPlus surface vertices.

Reuses the equirectangular local-meter projection already established in
tools/uk/uk_data_pipeline.py (mx=111320*cos(lat), my=110540) so a building's
IDF geometry is derived the same way its own footprint_m2 was computed.

EnergyPlus requires surface vertices "as viewed from outside the surface,
listed counterclockwise" (see the GlobalGeometryRules object). For a
footprint ring ordered so that walking vertex-to-vertex keeps the building
interior on the LEFT (a mathematically counterclockwise polygon, positive
shoelace area), this reduces to a fixed per-surface-type rule - confirmed by
hand against both EPSM's own minimal test fixture and a real building export
from its own repo (frontend/public/idf/test.idf):

  - roof/ceiling: footprint ring, in order,        all at z = height
  - floor:        footprint ring, REVERSED,         all at z = 0
  - each wall:    for edge (Pi -> Pi+1):
                  (Pi, zmax), (Pi, zmin), (Pi+1, zmin), (Pi+1, zmax)

A silently-reversed footprint (interior on the right instead of the left)
flips every wall's outward normal - EnergyPlus won't error, it'll just
compute solar/convection as if each wall faces the opposite direction. That's
why ensure_ccw() defensively corrects winding rather than trusting the input.
"""
from __future__ import annotations

import math

Point2D = tuple[float, float]
Point3D = tuple[float, float, float]


def _signed_area(ring: list[Point2D]) -> float:
    """Shoelace signed area; positive => counterclockwise."""
    total = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        total += x0 * y1 - x1 * y0
    return total / 2.0


def project_ring(ring_lonlat: list[list[float]]) -> list[Point2D]:
    """Project a closed [lon, lat] ring to local meters, origin at the
    ring's own centroid (keeps coordinates small; irrelevant to physics)."""
    pts = ring_lonlat[:-1] if ring_lonlat[0] == ring_lonlat[-1] else ring_lonlat
    lon0 = sum(p[0] for p in pts) / len(pts)
    lat0 = sum(p[1] for p in pts) / len(pts)
    mx = 111_320.0 * math.cos(math.radians(lat0))
    my = 110_540.0
    return [((p[0] - lon0) * mx, (p[1] - lat0) * my) for p in pts]


def ensure_ccw(ring2d: list[Point2D]) -> list[Point2D]:
    if _signed_area(ring2d) < 0:
        return list(reversed(ring2d))
    return ring2d


def roof_vertices(ring2d: list[Point2D], z: float) -> list[Point3D]:
    return [(x, y, z) for x, y in ring2d]


def floor_vertices(ring2d: list[Point2D], z: float = 0.0) -> list[Point3D]:
    return [(x, y, z) for x, y in reversed(ring2d)]


def edge_length(p0: Point2D, p1: Point2D) -> float:
    return math.hypot(p1[0] - p0[0], p1[1] - p0[1])


def wall_vertices(p0: Point2D, p1: Point2D, zmin: float, zmax: float) -> list[Point3D]:
    x0, y0 = p0
    x1, y1 = p1
    return [(x0, y0, zmax), (x0, y0, zmin), (x1, y1, zmin), (x1, y1, zmax)]


def window_geometry_for_wwr(width: float, height: float, wwr: float) -> tuple[float, float, float] | None:
    """Given a wall's width/height (m) and a target window-to-wall-area
    ratio, return (sill_height, head_height, window_width) centered on the
    wall - or None if the wall is too small to fit a window with margin."""
    if wwr <= 0 or width < 1.5 or height < 1.2:
        return None
    target_area = wwr * width * height
    win_height = min(height * 0.65, height - 0.6)
    if win_height <= 0.4:
        return None
    win_width = min(target_area / win_height, width - 0.6)
    if win_width <= 0.4:
        return None
    win_height = min(win_height, target_area / win_width)
    sill = max(0.3, (height - win_height) / 2)
    head = sill + win_height
    if head >= height - 0.05:
        return None
    return sill, head, win_width


def window_vertices(p0: Point2D, p1: Point2D, sill: float, head: float, win_width: float) -> list[Point3D]:
    """Centered rectangular window inset in the wall spanning p0 -> p1,
    following the same (top-start, bottom-start, bottom-end, top-end)
    vertex order as the wall itself."""
    width = edge_length(p0, p1)
    t0 = (width - win_width) / 2.0 / width
    t1 = 1.0 - t0
    x0, y0 = p0
    x1, y1 = p1

    def lerp(t: float) -> Point2D:
        return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)

    q0 = lerp(t0)
    q1 = lerp(t1)
    return [(q0[0], q0[1], head), (q0[0], q0[1], sill), (q1[0], q1[1], sill), (q1[0], q1[1], head)]
