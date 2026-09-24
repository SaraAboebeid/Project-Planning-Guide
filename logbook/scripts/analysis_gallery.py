"""Analysis Inventory gallery - one card per analysis the tool can run.

Each card says where the analysis lives in the tool, what it computes and
which page documents its method; most carry a recording of it running in the
3D viewer. Where the backend can run it without writing anything, the card has
a live example: it sends the same request the tool sends and draws the answer.
If the backend is not reachable (or lacks a library), the card shows a stored
result computed by the same code, and says so.
"""
from __future__ import annotations

import colorsys
import json
import math
import time
from pathlib import Path

import altair as alt
import numpy as np
import pandas as pd
import pydeck as pdk
import streamlit as st

from scripts import live_requests as lr
from scripts.ui_utils import REPO_ROOT, file_link_html, show_dataframe_safe

ASSETS = REPO_ROOT / "logbook" / "assets" / "analysis"
EXAMPLES = ASSETS / "examples"

BUILDING_FILES = {
    "gothenburg": "frontend/public/buildings.json",
    "london_westminster": "frontend/public/uk/buildings_london_westminster.json",
    "rotherham": "frontend/public/uk/buildings_rotherham.json",
}
UTCI_PAL = ["#08306b", "#2171b5", "#4292c6", "#6baed6", "#9ecae1",
            "#66bd63", "#fee08b", "#fdae61", "#f46d43", "#a50026"]
UTCI_LABELS = ["extreme cold", "very strong cold", "strong cold", "moderate cold", "slight cold",
               "no thermal stress", "moderate heat", "strong heat", "very strong heat", "extreme heat"]
DATES = {"21 June": "2026-06-21", "21 March": "2026-03-21", "21 December": "2026-12-21"}


# ── helpers ──────────────────────────────────────────────────────────────────

def _hex(h: str) -> list[int]:
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def _hue(t: float, h0: float, h1: float) -> list[int]:
    t = 0.0 if t is None or not math.isfinite(t) else max(0.0, min(1.0, t))
    r, g, b = colorsys.hls_to_rgb(h0 + (h1 - h0) * t, 0.5, 0.95)
    return [int(r * 255), int(g * 255), int(b * 255)]


def _legend(items: list[tuple[str, str]]) -> None:
    chips = "".join(
        f"<span style='display:inline-flex;align-items:center;margin:0 12px 4px 0;font-size:0.85rem'>"
        f"<span style='width:12px;height:12px;border-radius:3px;background:{c};margin-right:5px;"
        f"border:1px solid #0002'></span>{lab}</span>" for lab, c in items)
    st.markdown(chips, unsafe_allow_html=True)


def _ramp_legend(lo: str, hi: str, h0: float, h1: float) -> None:
    stops = ", ".join("rgb({},{},{})".format(*_hue(i / 10, h0, h1)) for i in range(11))
    st.markdown(
        f"<div style='display:flex;align-items:center;gap:8px;font-size:0.85rem'>{lo}"
        f"<span style='flex:0 0 220px;height:10px;border-radius:5px;background:linear-gradient(90deg,{stops})'>"
        f"</span>{hi}</div>", unsafe_allow_html=True)


def _chart(ch) -> None:
    try:
        st.altair_chart(ch, width="stretch")
    except TypeError:
        st.altair_chart(ch, use_container_width=True)


def _image(path: Path) -> None:
    try:
        st.image(str(path), width="stretch")
    except TypeError:
        st.image(str(path), use_container_width=True)


@st.cache_data(show_spinner=False)
def _example(name: str) -> dict | None:
    p = EXAMPLES / f"{name}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


@st.cache_data(show_spinner=False, ttl=20)
def _backend_up() -> bool:
    return lr.backend_up()


@st.cache_resource(show_spinner="Loading building footprints for the map…")
def _footprints(rel: str):
    raw = json.loads((REPO_ROOT / rel).read_text(encoding="utf-8-sig"))
    cx, cy, rings, hs = [], [], [], []
    for b in raw:
        c = b.get("coordinates") or []
        ring = c[0] if c and isinstance(c[0][0], (list, tuple)) else c
        if not ring or len(ring) < 3:
            continue
        h = b.get("height") or ((b.get("floors") or 2) * 3.0)
        cx.append(sum(p[0] for p in ring) / len(ring))
        cy.append(sum(p[1] for p in ring) / len(ring))
        rings.append([[p[0], p[1]] for p in ring])
        hs.append(float(h))
    return np.asarray(cx), np.asarray(cy), rings, np.asarray(hs)


def _nearby(city_id: str, lat: float, lon: float, r: float) -> pd.DataFrame:
    rel = BUILDING_FILES.get(city_id)
    if not rel:
        return pd.DataFrame(columns=["polygon", "height"])
    cx, cy, rings, hs = _footprints(rel)
    dx = (cx - lon) * 111320 * math.cos(math.radians(lat))
    dy = (cy - lat) * 110540
    idx = np.where(dx * dx + dy * dy < r * r)[0]
    return pd.DataFrame({"polygon": [rings[i] for i in idx], "height": hs[idx]})


def _deck(lat, lon, layers, zoom=16.3, pitch=45, bearing=-12, tooltip="{tip}", height=520, key=None):
    deck = pdk.Deck(layers=layers,
                    initial_view_state=pdk.ViewState(latitude=lat, longitude=lon, zoom=zoom,
                                                     pitch=pitch, bearing=bearing),
                    map_provider="carto", map_style="light",
                    tooltip={"text": tooltip} if tooltip else None)
    st.pydeck_chart(deck, height=height, key=key)


def _buildings_layer(df: pd.DataFrame, opacity: float = 0.85):
    return pdk.Layer("PolygonLayer", data=df, get_polygon="polygon", get_elevation="height",
                     extruded=True, get_fill_color=[200, 202, 212], opacity=opacity, pickable=False)


def _points_layer(df: pd.DataFrame, radius: float):
    return pdk.Layer("ScatterplotLayer", data=df, get_position=["lon", "lat"], get_fill_color="rgb",
                     get_radius=radius, radius_min_pixels=1.5, pickable=True, opacity=0.95)


def _place_picker(key: str) -> tuple[str, dict]:
    name = st.selectbox("Where", list(lr.PLACES), key=f"{key}_place")
    return name, lr.PLACES[name]


def _status_line(state: dict) -> None:
    if state["source"] == "live":
        st.success(f"Live result from the backend at `{lr.API}` - {state['seconds']:.1f} s.", icon="✅")
    else:
        msg = state.get("note") or "Stored example."
        st.info(msg + f" Computed by: {state.get('computed_by', 'the tool')}, {state.get('computed_at', '')}.",
                icon="📦")


def _run(state_key: str, fn, example: str) -> None:
    """Run `fn` live; on failure fall back to the stored example."""
    t = time.time()
    try:
        res = fn()
        st.session_state[state_key] = {"res": res, "seconds": time.time() - t, "source": "live"}
    except lr.ApiError as e:
        ex = _example(example)
        if ex is None:
            st.error(f"Live run failed - {e}. No stored example is available.")
            return
        st.session_state[state_key] = {
            "res": ex["result"], "source": "stored", "computed_by": ex["computed_by"],
            "computed_at": ex["computed_at"], "req": ex["request"],
            "note": f"Live run failed - {e}. Showing the stored example for "
                    f"Gothenburg - Vasastaden instead."}


def _state(state_key: str, example: str) -> dict | None:
    if state_key not in st.session_state:
        ex = _example(example)
        if ex is None:
            return None
        st.session_state[state_key] = {"res": ex["result"], "source": "stored",
                                       "computed_by": ex["computed_by"], "computed_at": ex["computed_at"],
                                       "req": ex["request"],
                                       "note": "Stored example (Gothenburg - Vasastaden). Press *Run live* "
                                               "to compute your own."}
    return st.session_state[state_key]


def _center(state: dict, fallback: dict) -> tuple[float, float, str]:
    r = state["res"]
    if r.get("center"):
        lon, lat = r["center"]
    else:
        lat, lon = fallback["lat"], fallback["lon"]
    city = (state.get("req") or {}).get("city_id") or state.get("city_id") or fallback.get("city_id")
    return lat, lon, city


# ═════════════════════════════════════════════════════════════════════════════
# Live examples
# ═════════════════════════════════════════════════════════════════════════════

@st.fragment
def live_sun_hours() -> None:
    c1, c2, c3 = st.columns([1.4, 1, 1])
    with c1:
        pname, place = _place_picker("sun")
    date = c2.radio("Day", list(DATES), key="sun_date", horizontal=True)
    radius = c3.slider("Radius (m)", 60, 300, 150, 30, key="sun_r")
    if st.button("Run live", key="sun_run", type="primary"):
        body = {"lat": place["lat"], "lon": place["lon"], "radius_m": radius, "grid_m": 5,
                "date": DATES[date], "base_tz": place["tz"], "country": place["country"],
                "city_id": place["city_id"]}
        with st.spinner("Computing sun hours…"):
            _run("sun_state", lambda: lr.post("/api/analysis/sun-hours", body), "sun_hours")
        if st.session_state.get("sun_state", {}).get("source") == "live":
            st.session_state["sun_state"]["city_id"] = place["city_id"]
    s = _state("sun_state", "sun_hours")
    if not s:
        return
    _status_line(s)
    r = s["res"]
    pts = pd.DataFrame(r["points"], columns=["lon", "lat", "hours"])
    m = st.columns(5)
    m[0].metric("Ground cells", f"{r['n_cells']:,}")
    m[1].metric("Buildings shading", f"{r['n_context_buildings']:,}")
    m[2].metric("Possible sun", f"{r['possible_hours']:.1f} h", help=f"day of {r['date']}")
    m[3].metric("Best cell", f"{r['max_hours']:.1f} h")
    m[4].metric("Mean cell", f"{pts['hours'].mean():.1f} h")
    view = st.radio("Show", ["Hours over the day", "Shadow at a time"], horizontal=True, key="sun_view")
    if view == "Shadow at a time" and r.get("frames"):
        times = [f["t"] for f in r["frames"]]
        t = st.select_slider("Time (local clock)", times, value=times[len(times) // 2], key="sun_t")
        fr = r["frames"][times.index(t)]
        pts["rgb"] = [[255, 200, 61] if v else [30, 58, 138] for v in fr["lit"]]
        pts["tip"] = ["sun" if v else "shade" for v in fr["lit"]]
        st.caption(f"Sun {fr['alt']}° high, azimuth {fr['az']}° from north.")
    else:
        mx = max(0.5, r["max_hours"])
        pts["rgb"] = [_hue(h / mx, 0.66, 0.09) for h in pts["hours"]]
        pts["tip"] = [f"{h:.1f} h of direct sun" for h in pts["hours"]]
    lat, lon, city = _center(s, place)
    b = _nearby(city, lat, lon, r["radius_m"] + 80)
    _deck(lat, lon, [_buildings_layer(b), _points_layer(pts, 2.6)], key="sun_map")
    if view == "Shadow at a time":
        _legend([("in sun", "#FFC83D"), ("in shade", "#1E3A8A")])
    else:
        _ramp_legend("0 h", f"{r['max_hours']:.1f} h (best cell)", 0.66, 0.09)


@st.fragment
def live_incident() -> None:
    c1, c2, c3 = st.columns([1.4, 1.2, 1])
    with c1:
        pname, place = _place_picker("inc")
    mode = c2.radio("Surfaces", ["Ground", "Roofs & façades"], horizontal=True, key="inc_mode")
    radius = c3.slider("Radius (m)", 60, 250 if mode == "Ground" else 150, 150 if mode == "Ground" else 90,
                       10, key="inc_r")
    example = "incident_ground" if mode == "Ground" else "incident_surfaces"
    skey = f"inc_state_{example}"
    if st.button("Run live", key="inc_run", type="primary"):
        body = {"lat": place["lat"], "lon": place["lon"], "radius_m": radius, "grid_m": 5,
                "country": place["country"], "city_id": place["city_id"]}
        path = "/api/analysis/incident-radiation" if mode == "Ground" else "/api/analysis/incident-surfaces"
        with st.spinner("Computing incident radiation…"):
            _run(skey, lambda: lr.post(path, body, timeout=600), example)
        if st.session_state.get(skey, {}).get("source") == "live":
            st.session_state[skey]["city_id"] = place["city_id"]
    s = _state(skey, example)
    if not s:
        return
    _status_line(s)
    r = s["res"]
    season = st.radio("Season", ["year", "summer", "equinox", "winter"], horizontal=True, key="inc_season",
                      format_func={"year": "Full year", "summer": "Summer (Jun–Aug)",
                                   "equinox": "Spring + autumn", "winter": "Winter (Dec–Feb)"}.get)
    mx = max(1.0, r["max"][season])
    lat, lon, city = _center(s, place)
    if mode == "Ground":
        pts = pd.DataFrame(r["points"], columns=["lon", "lat"])
        pts["v"] = r["radiation"][season]
        pts["rgb"] = [_hue(v / mx, 0.66, 0.0) for v in pts["v"]]
        pts["tip"] = [f"{v:,.0f} kWh/m²" for v in pts["v"]]
        m = st.columns(4)
        m[0].metric("Ground cells", f"{r['n_cells']:,}")
        m[1].metric("Best cell", f"{mx:,.0f} kWh/m²")
        m[2].metric("Mean", f"{pts['v'].mean():,.0f} kWh/m²")
        m[3].metric("Lowest", f"{pts['v'].min():,.0f} kWh/m²")
        b = _nearby(city, lat, lon, r["radius_m"] + 80)
        _deck(lat, lon, [_buildings_layer(b), _points_layer(pts, 2.6)], key="inc_map_g")
    else:
        rows = []
        for c in r["cells"]:
            xs = [p[0] for p in c["c"]]
            ys = [p[1] for p in c["c"]]
            zs = [p[2] for p in c["c"]]
            v = c["v"][season]
            rows.append({"pos": [sum(xs) / 4, sum(ys) / 4, sum(zs) / 4 + (0.4 if c["k"] == "roof" else 0)],
                         "kind": c["k"], "v": v, "rgb": _hue(v / mx, 0.66, 0.0),
                         "tip": f"{c['k']}: {v:,.0f} kWh/m²"})
        cells = pd.DataFrame(rows)
        m = st.columns(4)
        m[0].metric("Roof tiles", f"{(cells['kind'] == 'roof').sum():,}")
        m[1].metric("Façade tiles", f"{(cells['kind'] == 'facade').sum():,}")
        m[2].metric("Roofs, mean", f"{cells.loc[cells['kind'] == 'roof', 'v'].mean():,.0f} kWh/m²")
        m[3].metric("Façades, mean", f"{cells.loc[cells['kind'] == 'facade', 'v'].mean():,.0f} kWh/m²")
        b = _nearby(city, lat, lon, r["radius_m"] + 60)
        layer = pdk.Layer("PointCloudLayer", data=cells, get_position="pos", get_color="rgb",
                          point_size=4, pickable=True)
        _deck(lat, lon, [_buildings_layer(b, opacity=0.25), layer], zoom=17, pitch=55, key="inc_map_s")
    _ramp_legend("0", f"{mx:,.0f} kWh/m² (season maximum)", 0.66, 0.0)


@st.fragment
def live_comfort() -> None:
    c1, c2, c3 = st.columns([1.4, 1.2, 1])
    with c1:
        pname, place = _place_picker("tc")
    mode = c2.radio("Mode", ["Hour of day", "Season comfort %"], horizontal=True, key="tc_mode")
    date = c3.radio("Day", list(DATES), key="tc_date", disabled=mode != "Hour of day")
    example = "thermal_comfort" if mode == "Hour of day" else "thermal_comfort_seasons"
    skey = f"tc_state_{example}"
    if st.button("Run live", key="tc_run", type="primary"):
        body = {"lat": place["lat"], "lon": place["lon"], "radius_m": 150, "grid_m": 5,
                "date": DATES[date], "mode": "hourly" if mode == "Hour of day" else "seasonal",
                "country": place["country"], "city_id": place["city_id"]}
        with st.spinner("Computing thermal comfort…"):
            _run(skey, lambda: lr.post("/api/analysis/thermal-comfort", body, timeout=600), example)
        if st.session_state.get(skey, {}).get("source") == "live":
            st.session_state[skey]["city_id"] = place["city_id"]
    s = _state(skey, example)
    if not s:
        return
    _status_line(s)
    r = s["res"]
    pts = pd.DataFrame(r["points"], columns=["lon", "lat"])
    lat, lon, city = _center(s, place)
    if mode == "Hour of day":
        times = [f["t"] for f in r["frames"]]
        t = st.select_slider("Hour (local standard time)", times, value=times[12] if len(times) > 12 else times[0],
                             key="tc_t")
        fr = r["frames"][times.index(t)]
        pts["rgb"] = [_hex(UTCI_PAL[c]) for c in fr["cat"]]
        pts["tip"] = [f"UTCI {u:.1f} °C - {UTCI_LABELS[c]}" for u, c in zip(fr["utci"], fr["cat"])]
        m = st.columns(5)
        m[0].metric("Air", f"{fr['ta']} °C")
        m[1].metric("Humidity", f"{fr['rh']:.0f}%")
        m[2].metric("Wind (10 m)", f"{fr['wind']} m/s")
        m[3].metric("Sun", f"{fr['sun_alt']}°")
        m[4].metric("UTCI across the disc", f"{min(fr['utci']):.0f} to {max(fr['utci']):.0f} °C")
        _deck(lat, lon, [_buildings_layer(_nearby(city, lat, lon, 230)), _points_layer(pts, 2.6)], key="tc_map_h")
        present = sorted(set(fr["cat"]))
        _legend([(UTCI_LABELS[c], UTCI_PAL[c]) for c in present])
    else:
        season = st.radio("Season", r["seasons"], horizontal=True, key="tc_season")
        vals = r["comfort_pct"][season]
        pts["rgb"] = [_hue(v / 100, 0.0, 0.33) for v in vals]
        pts["tip"] = [f"comfortable {v:.0f}% of daytime hours" for v in vals]
        m = st.columns(3)
        m[0].metric("Daytime hours in the season", f"{r['hours'][season]:,}")
        m[1].metric("Comfortable, mean cell", f"{np.mean(vals):.1f}%")
        m[2].metric("Range across cells", f"{min(vals):.0f}–{max(vals):.0f}%")
        _deck(lat, lon, [_buildings_layer(_nearby(city, lat, lon, 230)), _points_layer(pts, 2.6)], key="tc_map_s")
        _ramp_legend("0% comfortable", "100%", 0.0, 0.33)


@st.fragment
def live_optimiser() -> None:
    st.caption("A typical 1961–75 multi-family block from the Gothenburg model (the medians of its 1,604 "
               "such buildings): 4 floors, 748 m² footprint, 2,992 m² floor area, 123 kWh/m²·yr, "
               "U-values wall 0.41 · roof 0.20 · windows 2.22 · floor 0.30 (assumed). Every Wikells "
               "element is an option. Embodied carbon is left out here; the wizard adds it from Boverket.")
    c1, c2, c3 = st.columns(3)
    price = c1.slider("Energy price (SEK/kWh)", 0.3, 2.5, 0.8, 0.1, key="opt_price")
    rate = c2.slider("Real discount rate (%)", 1.0, 7.0, 3.0, 0.5, key="opt_rate")
    hdd = c3.slider("Heating degree-days", 2000, 4500, 3300, 100, key="opt_hdd")
    if st.button("Run live", key="opt_run", type="primary"):
        body = lr.optimiser_request(price, rate / 100, hdd)
        with st.spinner("Optimising…"):
            _run("opt_state", lambda: lr.post("/api/optimize", body), "optimise")
    s = _state("opt_state", "optimise")
    if not s:
        return
    _status_line(s)
    r = s["res"]
    m = st.columns(4)
    m[0].metric("Combinations evaluated", f"{r['evaluated']:,}")
    m[1].metric("On the Pareto front", f"{r['pareto_count']:,}")
    m[2].metric("Options dropped (worse than as-built)", f"{len(r.get('excluded_options', [])):,}")
    m[3].metric("Baseline", f"{r['baseline']['energy_kwh_m2_yr']:.0f} kWh/m²")
    cloud = pd.DataFrame(r.get("cloud", []))
    front = pd.DataFrame(r["pareto"])
    front["picks"] = front["selection_labels"].map(lambda d: " · ".join(f"{k}: {v}" for k, v in d.items()))
    front["tag"] = front.get("tags", pd.Series([None] * len(front))).map(
        lambda v: ", ".join(v) if isinstance(v, list) else "")
    layers = []
    if not cloud.empty:
        layers.append(alt.Chart(cloud).mark_circle(size=10, opacity=0.25, color="#94A3B8").encode(
            x=alt.X("energy_kwh_m2_yr:Q", title="energy after renovation (kWh/m² per year)",
                    scale=alt.Scale(zero=False)),
            y=alt.Y("total_cost:Q", title="30-year cost: investment + discounted energy (SEK)")))
    layers.append(alt.Chart(front).mark_line(point=alt.OverlayMarkDef(color="#E2001A", size=50),
                                             color="#E2001A").encode(
        x="energy_kwh_m2_yr:Q", y="total_cost:Q",
        tooltip=["energy_kwh_m2_yr", alt.Tooltip("total_cost:Q", format=",.0f"),
                 alt.Tooltip("initial_cost:Q", format=",.0f"), "tag", "picks"]))
    base = pd.DataFrame([r["baseline"]])
    layers.append(alt.Chart(base).mark_point(shape="diamond", size=160, filled=True, color="#111827").encode(
        x="energy_kwh_m2_yr:Q", y="total_cost:Q", tooltip=[alt.Tooltip("total_cost:Q", format=",.0f")]))
    _chart(alt.layer(*layers).properties(height=380,
                                         title="Every combination (grey), the Pareto front (red), as-built (black)"))
    show_dataframe_safe(front[["tag", "energy_kwh_m2_yr", "initial_cost", "total_cost", "total_carbon",
                               "picks"]].rename(columns={"energy_kwh_m2_yr": "kWh/m²·yr",
                                                         "initial_cost": "investment (SEK)",
                                                         "total_cost": "30-yr cost (SEK)",
                                                         "total_carbon": "30-yr kg CO₂e"}))


@st.fragment
def live_pvgis() -> None:
    c1, c2 = st.columns([1.4, 1])
    with c1:
        pname, place = _place_picker("pv")
    roof = c2.slider("Roof footprint (m²)", 100, 2000, 600, 50, key="pv_roof")
    kwp = round(roof * 0.8 * 0.2, 1)
    st.caption(f"As the viewer does it: 80% of the footprint usable, 0.2 kWp per m² → **{kwp} kWp**, "
               "14% system loss, 35° tilt, facing south.")
    if st.button("Run live", key="pv_run", type="primary"):
        params = {"lat": place["lat"], "lon": place["lon"], "peakpower": kwp, "loss": 14, "angle": 35, "aspect": 0}
        with st.spinner("Asking PVGIS…"):
            _run("pv_state", lambda: lr.get("/api/pvgis", params, timeout=60), "pvgis")
    s = _state("pv_state", "pvgis")
    if not s:
        return
    _status_line(s)
    r = s["res"]
    out = r.get("outputs", {})
    tot = (out.get("totals") or {}).get("fixed", {})
    mon = pd.DataFrame((out.get("monthly") or {}).get("fixed", []))
    inp = (r.get("inputs") or {}).get("pv_module", {})
    m = st.columns(3)
    m[0].metric("Annual yield", f"{tot.get('E_y', 0) / 1000:,.1f} MWh")
    kwp_used = inp.get("peak_power") or kwp
    m[1].metric("Specific yield", f"{tot.get('E_y', 0) / max(1e-9, kwp_used):,.0f} kWh/kWp")
    m[2].metric("In-plane irradiation", f"{tot.get('H(i)_y', 0):,.0f} kWh/m²")
    if not mon.empty:
        _chart(alt.Chart(mon, title="Monthly PV yield (kWh)").mark_bar(color="#F59E0B").encode(
            x=alt.X("month:O"), y=alt.Y("E_m:Q", title="kWh")).properties(height=260))


@st.fragment
def live_space_syntax() -> None:
    c1, c2 = st.columns([1.4, 1])
    with c1:
        pname, place = _place_picker("ss")
    metric = c2.radio("Measure", ["betweenness", "integration", "reach"], horizontal=True, key="ss_metric")
    if st.button("Run live", key="ss_run", type="primary"):
        q = {"south": place["lat"] - 0.006, "north": place["lat"] + 0.006,
             "west": place["lon"] - 0.011, "east": place["lon"] + 0.011, "metric": metric}
        with st.spinner("Fetching the street network and computing centrality…"):
            _run("ss_state", lambda: lr.get("/api/urban/space-syntax", q, timeout=300), "space_syntax")
        if st.session_state.get("ss_state", {}).get("source") == "live":
            st.session_state["ss_state"]["center"] = [place["lon"], place["lat"]]
    s = _state("ss_state", "space_syntax")
    if not s:
        return
    _status_line(s)
    r = s["res"]
    feats = r.get("features", [])
    rows = [{"path": f["geometry"]["coordinates"], "v": f["properties"].get("value_norm") or 0,
             "tip": f"{f['properties'].get('name') or f['properties'].get('highway', '')}: "
                    f"{f['properties'].get('value_norm', 0):.2f}"} for f in feats
            if f.get("geometry", {}).get("type") == "LineString"]
    df = pd.DataFrame(rows)
    df["rgb"] = [_hue(v, 0.66, 0.0) for v in df["v"]]
    df["w"] = 1.5 + 5 * df["v"]
    st.metric("Street segments", f"{len(df):,}")
    lon, lat = s.get("center") or [lr.PLACES[next(iter(lr.PLACES))]["lon"], lr.PLACES[next(iter(lr.PLACES))]["lat"]]
    layer = pdk.Layer("PathLayer", data=df, get_path="path", get_color="rgb", get_width="w",
                      width_units="pixels", pickable=True)
    _deck(lat, lon, [layer], zoom=14.3, pitch=0, bearing=0, key="ss_map")
    _ramp_legend("low", f"high {r.get('metric', '')}", 0.66, 0.0)


# ═════════════════════════════════════════════════════════════════════════════
# The cards
# ═════════════════════════════════════════════════════════════════════════════

CARDS = [
    ("Environmental - 3D viewer", [
        dict(title="Direct sun hours", gif="sun_hours",
             where="3D viewer → Environmental Analysis → *Sun-hours* (both viewers)",
             runs="Backend `/api/analysis/sun-hours` · `backend/sun_hours.py`",
             what="Hours of direct sun on every 5 m ground cell around a clicked point on one day, "
                  "shaded by the surrounding buildings. A slider replays the shadows through the day.",
             method=("climate-env", "11. Climate & Environmental Analysis"), live=live_sun_hours),
        dict(title="Incident solar radiation", gif="incident_radiation",
             where="3D viewer → Environmental Analysis → *Incident radiation* (ground, or roofs & façades)",
             runs="Backend `/api/analysis/incident-radiation`, `/api/analysis/incident-surfaces` · "
                  "`backend/incident_radiation.py`",
             what="kWh/m² per season from the typical-year weather file: a 145-patch sky, each patch "
                  "checked for visibility from every ground cell or roof and façade tile.",
             method=("climate-env", "11. Climate & Environmental Analysis"), live=live_incident),
        dict(title="Outdoor thermal comfort (UTCI)", gif="thermal_comfort",
             where="3D viewer → Environmental Analysis → *Thermal comfort*",
             runs="Backend `/api/analysis/thermal-comfort` · `backend/thermal_comfort.py` (pythermalcomfort)",
             what="The 'feels-like' temperature hour by hour, or the share of comfortable daytime hours per "
                  "season, from air temperature, humidity, wind and each spot's sun and sky view.",
             method=("climate-env", "11. Climate & Environmental Analysis"), live=live_comfort,
             status="The locally running backend is missing `pythermalcomfort`, so a live run falls back "
                    "to the stored example until it is installed from `requirements.txt`."),
    ]),
    ("Building energy and cost", [
        dict(title="EnergyPlus simulation (EPSM)",
             where="3D viewer → *Run Energy Simulation*; wizard Steps 3–4",
             runs="Backend `/api/simulation-submit` → EPSM (Docker, port 8010) → EnergyPlus",
             what="A single-zone shoebox model per building (geometry, TABULA or chosen U-values, window "
                  "ratio, hot water) simulated for a year: heating, cooling, lighting, equipment and total "
                  "kWh/m²·yr. About 12 s per building.",
             method=("shoebox-idf", "6. Energy Simulation - EPSM & IDF"),
             status="Not run from here: every run is written to the simulation store. All stored runs "
                    "can be browsed in the **Data Explorer → Simulation results**."),
        dict(title="Renovation optimiser (Pareto front)",
             where="Wizard Step 4 - the trade-off curve under the package builder",
             runs="Backend `/api/optimize`",
             what="Every combination of wall, roof, window and floor options is scored with degree-day "
                  "physics anchored to the EnergyPlus baseline; the non-dominated set on cost, carbon and "
                  "energy is returned for validation in EPSM.",
             method=("optimisation", "8. Optimisation Process"), live=live_optimiser),
        dict(title="Rooftop PV potential (PVGIS)",
             where="3D viewer → Building Analysis → *Rooftop PV Estimate*",
             runs="Backend `/api/pvgis` → EU JRC PVGIS v5.2 (live external service)",
             what="Annual and monthly yield of a south-facing 35° system sized from the roof footprint.",
             method=("data-sources", "1. Data Sources"), live=live_pvgis),
        dict(title="Heating-system comparison",
             where="Wizard Step 4", runs="In the browser",
             what="Swapping the heating system on top of an unchanged heat demand: seasonal performance "
                  "factors, running cost and carbon per system from a Swedish catalogue.",
             method=None),
        dict(title="Life-cycle assessment",
             where="Wizard Step 4", runs="In the browser + Boverket's climate database (live API)",
             what="Embodied carbon of the chosen materials plus operational carbon over the study period.",
             method=None),
    ]),
    ("Decision support", [
        dict(title="Retrofit prioritisation (AHP)",
             where="Wizard Step 2", runs="In the browser",
             what="Ranks the selected buildings by a weighted score of energy, fabric, carbon and risk "
                  "criteria, with weights from pairwise (AHP) comparison; the top buildings go on to "
                  "Steps 3–4.",
             method=("prioritisation", "7. Retrofit Prioritisation")),
        dict(title="Decision analysis under uncertainty",
             where="Wizard Step 4", runs="In the browser",
             what="Tests each package in three energy-price futures and reads the payoff matrix with "
                  "minimax regret, uncertainty range and the Hurwicz criterion.",
             method=("decision", "9. Decision Analysis under Uncertainty")),
    ]),
    ("Urban - 3D viewer", [
        dict(title="Space syntax (street-network centrality)",
             where="3D viewer → Urban Analysis → *Space Syntax* (Gothenburg)",
             runs="Backend `/api/urban/space-syntax` · `backend/space_syntax.py` (networkx) over OSM streets",
             what="Betweenness, integration or reach of every street segment in the view.",
             method=("viewer-layers", "12. Viewer Layers & Visualisation"), live=live_space_syntax,
             status="Reconnected in the viewer on 2026-09-16 (its script was never loaded, and the "
                    "backend environment was missing networkx). The analysis area is clamped to about "
                    "0.9 km each way: betweenness takes ~17 s, reach ~40 s, integration ~98 s."),
        dict(title="Green index, green accessibility, heat-island proxy",
             where="3D viewer → Urban Analysis", runs="In the browser (`urban_analysis.js`)",
             what="City-wide indices from OpenStreetMap green areas and the building data - not "
                  "temperature models.",
             method=("climate-env", "11. Climate & Environmental Analysis")),
    ]),
    ("AI and data", [
        dict(title="Façade defect detection",
             where="3D viewer → Façade Inspection; wizard Step 2 photo upload",
             runs="Local ML service (port 8020, not running) + a vision-language model as second opinion",
             what="Finds cracks, leakage, spalling, corrosion and bulges in façade images.",
             method=("facade-ml", "10. AI, ML & Vision Models")),
        dict(title="Window-to-wall ratio estimate",
             where="3D viewer → Façade Inspection → *AI Estimate*",
             runs="Backend `/api/estimate-wwr` → hosted vision models (API keys)",
             what="Estimates the glazed share of each façade and counts balconies; saved values feed "
                  "the energy simulation.",
             method=("facade-ml", "10. AI, ML & Vision Models"),
             status="Not run from here: each call is a paid request to a hosted model."),
        dict(title="Data assistant",
             where="Chat widget", runs="Backend `/api/chat` → tool-calling language model",
             what="Answers questions from the project's own data (buildings, certificates, market, SCB).",
             method=("facade-ml", "10. AI, ML & Vision Models"),
             status="Not run from here: each call is a paid request to a hosted model."),
        dict(title="TABULA archetype matching",
             where="Pipelines; every building record", runs="Build pipelines + backend lookup",
             what="Assigns construction-period U-values and reference demand to buildings without "
                  "measured data.",
             method=("pipelines", "3. Pipelines")),
    ]),
]


def _card(c: dict, key: str) -> None:
    with st.container(border=True):
        gif = ASSETS / f"{c['gif']}.gif" if c.get("gif") else None
        cols = st.columns([1, 1.15]) if gif and gif.exists() else [st.container()]
        with cols[0]:
            st.markdown(f"#### {c['title']}")
            st.markdown(f"**Where:** {c['where']}  \n**Runs in:** {c['runs']}")
            st.markdown(c["what"])
            if c.get("method"):
                url, label = c["method"]
                st.markdown(f"Method, equations and sources: [{label}]({url})")
            if c.get("status"):
                st.caption(c["status"])
        if gif and gif.exists():
            with cols[1]:
                _image(gif)
                st.caption("Recorded in the 3D viewer, driven by a script (sidebar cropped).")
        if c.get("live"):
            # A toggle, not an expander: Streamlit runs an expander's contents
            # even when it is collapsed, which drew every example's map on
            # every page load. Each example is also a fragment, so moving one
            # of its sliders reruns only that example.
            if st.toggle("▶ Try it - live example", key=f"tg_{key}"):
                c["live"]()


def render() -> None:
    up = _backend_up()
    st.markdown(
        f"<div style='margin:0.6rem 0 0.2rem 0;font-size:0.9rem'>Backend for the live examples: "
        f"<code>{lr.API}</code> - "
        + ("<b style='color:#15803d'>reachable</b>" if up else
           "<b style='color:#b91c1c'>not reachable</b>; the examples show stored results") +
        " <span class='lb-dim'>(set <code>PPG_API</code> to point elsewhere)</span></div>",
        unsafe_allow_html=True)
    tabs = st.tabs([f for f, _ in CARDS])
    for tab, (family, cards) in zip(tabs, CARDS):
        with tab:
            for i, c in enumerate(cards):
                _card(c, key=f"{family}_{i}")
