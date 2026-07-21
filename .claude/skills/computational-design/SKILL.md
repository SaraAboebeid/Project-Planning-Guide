---
description: Computational and parametric design for this project — building geometry processing, CRS handling, area/volume derivation, 3D viewer performance, mesh/CAD export, and multi-objective optimisation (Pareto/MILP). Use when working with building footprints, polygons, geometry maths, the Cesium 3D viewer, IDF shoebox generation, Rhino/OBJ export, or the optimiser.
when_to_use: footprint geometry, centroid/area/perimeter, spatial joins, EPSG/CRS conversion, extrusion, Cesium viewer, 3D model export, Pareto front, MILP, parametric massing
---

# Computational design — geometry & optimisation

## Coordinate reference systems

- **All app geometry is WGS84 (`EPSG:4326`)** — `buildings.json`, the DuckDB `footprints.geom`, EUBUCCO.
- Swedish national grid is **SWEREF99 TM (`EPSG:3006`)** — reproject before doing metric work on raw Lantmäteriet data.
- Quick metric approximations at Gothenburg's latitude (57.7°): 1° lat ≈ 111 320 m, 1° lon ≈ 59 400 m. Fine for tolerances/bboxes, **not** for areas — use a projected CRS or the shoelace helpers.

DuckDB needs `LOAD spatial;` before `ST_*` functions.

## Geometry helpers (reuse, don't rewrite)

Backend (`backend/main.py`): `_polygon_centroid`, `_shoelace_m2`, `_ring_perimeter_m`, `_haversine_m`, `_point_in_poly` (ray casting), `_parse_polygon`.

Frontend (`utils/componentAreas.ts`): `resolveBuildingGeometry` normalises the two building shapes into one; `computeAreaForLineItem` derives per-component areas.

**Storey convention:** `floors = max(1, round(height / 3.2))` — `FLOOR_HEIGHT_M = 3.2` in `tools/idf/defaults.py`. Total floor area = `footprint × floors`. Keep this consistent; the whole energy normalisation depends on it.

## 3D viewer performance — the hard rule

`viewer/js/` are **classic scripts** compiled by `build.py` into `assets/*_3d.html`.

**Never create one Cesium `Entity` per building.** ~186k entities exhausts memory and crashes the tab. Use a **single batched `Cesium.Primitive`** with `GeometryInstance`s carrying per-instance colour, and attach `id: { _dataIdx: i }` for picking. Also: fetch the large `buildings.json` with `cache: 'default'` (not `'no-store'`) — it's ~58 MB.

## Parametric massing & export

`extrude_simrishamn.py` shows the pattern: read footprint GeoJSON → extrude to a per-building height → write `.3dm` (rhino3dm) and `.obj`. Keep extrusion heights sourced from real data (EUBUCCO `height`), not invented.

## Shoebox abstraction — know its limits

`tools/idf/generate_idf.py` builds a **single-zone** shoebox: one thermal zone spanning full building height, `ZoneHVAC:IdealLoadsAirSystem`, `Material:NoMass` layers derived from U-values, `WindowMaterial:SimpleGlazingSystem`.

**Documented limitation: cooling demand is always 0.** The single over-exposed zone (roof + all walls `Outdoors`/`SunExposed`/`WindExposed`, floor `Ground`) sheds heat faster than it can reach the 25 °C setpoint — even under 2080 SSP5-8.5 with a deep retrofit. This is a model-abstraction consequence, **not** a config or reporting bug. Don't "fix" it by tweaking setpoints; fixing it properly means multi-zone with a core zone.

## Multi-objective optimisation

`POST /api/optimize` enumerates every material combination, scores each on the degree-day physics, and returns the **Pareto-optimal front** over (cost, carbon, energy). Then the winners are validated in real EnergyPlus — a deliberate **hybrid**: cheap analytic search, expensive verification only on the survivors.

Implementation notes:
- Each component contributes exactly one option, plus a synthetic `__keep__` (as-built U, zero cost) so the optimiser can decline to touch a component.
- **Anchor to reality:** `q_fixed = baseline_total − baseline_H_tr · F_dh`, derived from the measured EPSM baseline, so the analytic curve passes through the known baseline point. Verify by checking the all-`__keep__` combination reproduces the baseline exactly.
- Pareto uses a **skyline sweep** (sort by first objective, then 2-D dominance against kept points) — not the naïve O(n²) pairwise scan, which is far too slow at 10k+ points. De-duplicate identical objective triples first.
- Guard combinatorial blow-up with an enumeration cap and report truncation rather than silently sampling.

Model attribution: the MILP formulation and objective functions are based on the work of **Jenny Enerbäck and Ann-Brith Strömberg** — keep that credit on any surface that shows the equations.

## Principles

Derive geometry from real source data; never fabricate a dimension to make a model run. When you must approximate, name the approximation in a comment and surface it in the UI. Prefer vectorised/batched operations — this codebase routinely handles 90k–370k features.
