"""Data Explorer - read-only views of the datasets the tool itself uses.

Every loader opens its source read-only and caches the result; nothing here
writes to the repository. Each explorer shows what a dataset holds (counts,
distributions, a map where it has coordinates) and the rows themselves, with
the filtered rows downloadable as CSV.
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import altair as alt
import numpy as np
import pandas as pd
import pydeck as pdk
import streamlit as st

from scripts.ui_utils import REPO_ROOT, file_link_html, show_dataframe_safe

# EU energy-label colours, A (best) to G (worst)
EPC_COLORS = {"A": "#009036", "B": "#55AB26", "C": "#C8D200", "D": "#FFED00",
              "E": "#FBBA00", "F": "#EB6909", "G": "#E2001A"}
CLASSES = list(EPC_COLORS)
GREY = [170, 170, 170]

USE_LABELS = {
    "bostad_enfamilj": "Single-family housing",
    "bostad_flerfamilj": "Multi-family housing",
    "verksamhet": "Business",
    "samhalle": "Public",
    "industri": "Industrial",
    "komplement": "Ancillary",
    "ovrigt": "Other",
}
USE_COLORS = {
    "Single-family housing": "#4C78A8", "Multi-family housing": "#F58518",
    "Business": "#E45756", "Public": "#72B7B2", "Industrial": "#54A24B",
    "Ancillary": "#B279A2", "Other": "#9D755D", "Unknown": "#BAB0AC",
}
YEAR_BINS = [(0, 1929, "before 1930"), (1930, 1945, "1930–45"), (1946, 1960, "1946–60"),
             (1961, 1975, "1961–75"), (1976, 1990, "1976–90"), (1991, 2005, "1991–2005"),
             (2006, 3000, "2006 and later")]
YEAR_COLORS = ["#440154", "#443A83", "#31688E", "#21908C", "#35B779", "#8FD744", "#FDE725"]


def _hex_rgb(h: str) -> list[int]:
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def source_line(*rels: str, note: str = "") -> None:
    links = " · ".join(file_link_html(r) for r in rels)
    st.markdown(f"<span class='lb-dim'>Source:</span> {links}"
                + (f" <span class='lb-dim'>- {note}</span>" if note else ""),
                unsafe_allow_html=True)


def download_csv(df: pd.DataFrame, name: str, key: str) -> None:
    st.download_button(f"Download these {len(df):,} rows as CSV",
                       df.to_csv(index=False).encode("utf-8"),
                       file_name=name, mime="text/csv", key=key)


def _chart(ch: alt.Chart) -> None:
    try:
        st.altair_chart(ch, width="stretch")
    except TypeError:
        st.altair_chart(ch, use_container_width=True)


def _map(df: pd.DataFrame, tooltip: str, key: str, height: int = 520,
         radius: float = 6, max_points: int = 60000, zoom: float | None = None) -> None:
    """Scatter map of lon/lat rows with an 'rgb' colour column (Carto basemap,
    no token needed). Large sets are sampled so the page stays responsive."""
    d = df.dropna(subset=["lon", "lat"])
    if d.empty:
        st.info("No rows with coordinates to map.")
        return
    if len(d) > max_points:
        d = d.sample(max_points, random_state=1)
        st.caption(f"Map shows a random sample of {max_points:,} of {len(df):,} rows; "
                   "the charts and table use all of them.")
    view = pdk.ViewState(latitude=float(d["lat"].median()), longitude=float(d["lon"].median()),
                         zoom=zoom if zoom is not None else (11 if len(d) > 2000 else 12))
    layer = pdk.Layer("ScatterplotLayer", data=d, get_position=["lon", "lat"],
                      get_fill_color="rgb", get_radius=radius, radius_min_pixels=1.4,
                      radius_max_pixels=8, pickable=True, opacity=0.85)
    deck = pdk.Deck(layers=[layer], initial_view_state=view, map_provider="carto",
                    map_style="light", tooltip={"text": tooltip})
    st.pydeck_chart(deck, height=height, key=key)


def _legend(items: list[tuple[str, str]]) -> None:
    chips = "".join(
        f"<span style='display:inline-flex;align-items:center;margin:0 12px 4px 0;font-size:0.85rem'>"
        f"<span style='width:12px;height:12px;border-radius:3px;background:{c};margin-right:5px;"
        f"border:1px solid #0002'></span>{lab}</span>" for lab, c in items)
    st.markdown(f"<div>{chips}</div>", unsafe_allow_html=True)


# ═════════════════════════════════════════════════════════════════════════════
# Buildings (both countries)
# ═════════════════════════════════════════════════════════════════════════════

@st.cache_data(show_spinner="Loading the building model…")
def load_buildings(rel: str) -> pd.DataFrame:
    raw = json.loads((REPO_ROOT / rel).read_text(encoding="utf-8-sig"))
    rows = []
    for b in raw:
        c = b.get("coordinates") or []
        ring = c[0] if c and isinstance(c[0][0], (list, tuple)) else c
        r = {k: v for k, v in b.items() if k not in ("coordinates", "color", "eclass_color")}
        if ring:
            r["lon"] = sum(p[0] for p in ring) / len(ring)
            r["lat"] = sum(p[1] for p in ring) / len(ring)
        rows.append(r)
    df = pd.DataFrame(rows)
    df["use"] = df.get("use_cat", pd.Series(index=df.index, dtype=object)).map(USE_LABELS).fillna("Unknown")
    df["eclass"] = df["eclass"].where(df["eclass"].isin(CLASSES), None)
    df["year"] = pd.to_numeric(df.get("year"), errors="coerce")
    df.loc[(df["year"] < 1500) | (df["year"] > 2030), "year"] = np.nan
    df["has_epc"] = df.get("has_epc", False).fillna(False).astype(bool)
    return df


def _year_band(y: float) -> str:
    if pd.isna(y):
        return "unknown"
    for lo, hi, lab in YEAR_BINS:
        if lo <= y <= hi:
            return lab
    return "unknown"


def buildings_explorer(rel: str, key: str, energy_col: str | None, energy_label: str,
                       extra_cols: list[str]) -> None:
    df = load_buildings(rel)
    source_line(rel, note="one record per building, exactly as the viewer and the wizard read it")

    with st.container(border=True):
        c1, c2, c3, c4 = st.columns([1.3, 1.1, 1.4, 0.9])
        uses = sorted(df["use"].unique())
        pick_use = c1.multiselect("Use", uses, key=f"{key}_use", placeholder="all uses")
        pick_cls = c2.multiselect("Energy class", CLASSES + ["none"], key=f"{key}_cls",
                                  placeholder="all classes")
        ymin = int(df["year"].min()) if df["year"].notna().any() else 1800
        ymax = int(df["year"].max()) if df["year"].notna().any() else 2025
        yr = c3.slider("Construction year", ymin, ymax, (ymin, ymax), key=f"{key}_yr")
        keep_unknown = c3.checkbox("include buildings with unknown year", True, key=f"{key}_yu")
        cert = c4.radio("Certificate", ["all", "with", "without"], key=f"{key}_cert")
        text = st.text_input("Address contains", key=f"{key}_addr", placeholder="e.g. Vasagatan")

    f = df
    if pick_use:
        f = f[f["use"].isin(pick_use)]
    if pick_cls:
        mask = f["eclass"].isin([c for c in pick_cls if c != "none"])
        if "none" in pick_cls:
            mask |= f["eclass"].isna()
        f = f[mask]
    ymask = f["year"].between(*yr)
    if keep_unknown:
        ymask |= f["year"].isna()
    f = f[ymask]
    if cert != "all":
        f = f[f["has_epc"] == (cert == "with")]
    if text:
        f = f[f["address"].astype(str).str.contains(text, case=False, na=False, regex=False)]

    n = len(f)
    m = st.columns(5)
    m[0].metric("Buildings", f"{n:,}", help=f"of {len(df):,} in the file")
    pct = (lambda s: f"{100 * s.mean():.0f}%" if n else "-")
    m[1].metric("With construction year", pct(f["year"].notna()))
    m[2].metric("With energy class", pct(f["eclass"].notna()))
    m[3].metric("With a certificate", pct(f["has_epc"]))
    m[4].metric("Median height", f"{f['height'].median():.1f} m" if n else "-")
    if not n:
        st.info("No buildings match these filters.")
        return

    colour_by = st.radio("Colour the map by", ["Energy class", "Construction year", "Use", "Height"],
                         horizontal=True, key=f"{key}_col")
    mdf = f[["lon", "lat", "address", "use", "eclass", "year", "height"]].copy()
    if colour_by == "Energy class":
        mdf["rgb"] = [_hex_rgb(EPC_COLORS[c]) if c in EPC_COLORS else GREY for c in mdf["eclass"]]
        legend = [(c, EPC_COLORS[c]) for c in CLASSES] + [("no class", "#AAAAAA")]
    elif colour_by == "Construction year":
        bands = [lab for _, _, lab in YEAR_BINS]
        cmap = dict(zip(bands, YEAR_COLORS))
        mdf["rgb"] = [_hex_rgb(cmap[b]) if b in cmap else GREY for b in map(_year_band, mdf["year"])]
        legend = list(cmap.items()) + [("unknown", "#AAAAAA")]
    elif colour_by == "Use":
        mdf["rgb"] = [_hex_rgb(USE_COLORS.get(u, "#BAB0AC")) for u in mdf["use"]]
        legend = [(u, c) for u, c in USE_COLORS.items() if u in set(mdf["use"])]
    else:
        h = mdf["height"].fillna(0).clip(0, 40) / 40
        mdf["rgb"] = [[int(30 + 220 * t), int(60 + 120 * (1 - abs(2 * t - 1))), int(200 - 180 * t)] for t in h]
        legend = [("0 m", "#1E3CC8"), ("20 m", "#7CB46E"), ("40 m and taller", "#FA3C14")]
    mdf["year_txt"] = mdf["year"].map(lambda y: "" if pd.isna(y) else f"{int(y)}")
    mdf["eclass_txt"] = mdf["eclass"].fillna("–")
    _map(mdf, "{address}\n{use} · built {year_txt} · class {eclass_txt}", key=f"{key}_map")
    _legend(legend)

    st.markdown("##### What the selection holds")
    a, b = st.columns(2)
    cls = (f["eclass"].fillna("none").value_counts().reindex(CLASSES + ["none"], fill_value=0)
           .rename_axis("class").reset_index(name="buildings"))
    with a:
        _chart(alt.Chart(cls, title="Energy class").mark_bar().encode(
            x=alt.X("class:N", sort=CLASSES + ["none"], title=None),
            y=alt.Y("buildings:Q", title="buildings"),
            color=alt.Color("class:N", scale=alt.Scale(domain=CLASSES + ["none"],
                            range=list(EPC_COLORS.values()) + ["#AAAAAA"]), legend=None),
            tooltip=["class", "buildings"]).properties(height=260))
    dec = f.dropna(subset=["year"]).assign(decade=lambda d: (d["year"] // 10 * 10).astype(int))
    with b:
        if dec.empty:
            st.info("No construction years in this selection.")
        else:
            dd = dec.groupby("decade").size().reset_index(name="buildings")
            _chart(alt.Chart(dd, title="Construction decade").mark_bar(color="#6E2AAE").encode(
                x=alt.X("decade:O", title=None), y=alt.Y("buildings:Q"),
                tooltip=["decade", "buildings"]).properties(height=260))
    c, d = st.columns(2)
    with c:
        uc = f["use"].value_counts().rename_axis("use").reset_index(name="buildings")
        _chart(alt.Chart(uc, title="Use").mark_bar().encode(
            y=alt.Y("use:N", sort="-x", title=None), x="buildings:Q",
            color=alt.Color("use:N", scale=alt.Scale(domain=list(USE_COLORS),
                            range=list(USE_COLORS.values())), legend=None),
            tooltip=["use", "buildings"]).properties(height=260))
    with d:
        if energy_col and energy_col in f and pd.to_numeric(f[energy_col], errors="coerce").notna().any():
            e = f.assign(val=pd.to_numeric(f[energy_col], errors="coerce")).dropna(subset=["val", "eclass"])
            e = e[e["val"].between(1, 600)]
            _chart(alt.Chart(e, title=energy_label).mark_boxplot(extent="min-max", size=22).encode(
                x=alt.X("eclass:N", sort=CLASSES, title="energy class"),
                y=alt.Y("val:Q", title="kWh/m² per year"),
                color=alt.Color("eclass:N", scale=alt.Scale(domain=CLASSES,
                                range=list(EPC_COLORS.values())), legend=None)).properties(height=260))
        else:
            hh = f.dropna(subset=["height"])
            _chart(alt.Chart(hh[hh["height"] < 80], title="Height").mark_bar(color="#0F766E").encode(
                x=alt.X("height:Q", bin=alt.Bin(step=3), title="m"), y="count()").properties(height=260))

    st.markdown("##### The records")
    cols = [c for c in ["address", "use", "year", "eclass", "has_epc", "height", "floors",
                        "footprint_m2", *extra_cols] if c in f.columns]
    show_dataframe_safe(f[cols].head(2000))
    st.caption(f"Showing the first {min(2000, n):,} of {n:,} matching rows.")
    download_csv(f.drop(columns=["lon", "lat"], errors="ignore"), f"{key}_buildings.csv", f"{key}_dl")


# ═════════════════════════════════════════════════════════════════════════════
# Swedish energy certificates (national register, DuckDB)
# ═════════════════════════════════════════════════════════════════════════════

EPC_DB = "data/sensitivity/epc_sweden.duckdb"
HEAT_CARRIERS = {
    "EgiFjarrvarme": "District heating", "EgiOlja": "Oil", "EgiGas": "Gas",
    "EgiVed": "Firewood", "EgiFlis": "Wood chips", "EgiOvrBiobransle": "Other biofuel",
    "EgiElVatten": "Electric boiler (water-borne)", "EgiElDirekt": "Direct electric",
    "EgiElLuft": "Electric (air-borne)", "EgiPumpMark": "Ground-source heat pump",
    "EgiPumpFranluft": "Exhaust-air heat pump", "EgiPumpLuftLuft": "Air-to-air heat pump",
    "EgiPumpLuftVatten": "Air-to-water heat pump",
}


@st.cache_resource(show_spinner=False)
def _epc_con():
    import duckdb
    return duckdb.connect(str(REPO_ROOT / EPC_DB), read_only=True)


def _q(sql: str, params: list | None = None) -> pd.DataFrame:
    cur = _epc_con().cursor()
    try:
        return cur.execute(sql, params or []).df()
    finally:
        cur.close()


@st.cache_data(show_spinner=False)
def _epc_municipalities() -> pd.DataFrame:
    return _q("select IdKommun as kommun, count(*) as n from epc group by 1 order by n desc")


@st.cache_data(show_spinner="Querying the certificate register…")
def _epc_summary(kommun: str, cats: tuple, y0: int, y1: int) -> dict:
    where = "IdKommun = ? and EgenNybyggAr between ? and ?"
    params: list = [kommun, y0, y1]
    if cats:
        where += f" and EgenByggnadsKat in ({','.join('?' * len(cats))})"
        params += list(cats)
    out = {}
    out["kpi"] = _q(f"""select count(*) n, median(EgiEnergiPrestanda) ep, median(EgenAtemp) atemp,
                        avg(case when EgiEnergiklass in ('A','B','C') then 1.0 else 0 end) abc,
                        median(EgenNybyggAr) yr
                        from epc where {where}""", params)
    out["cls"] = _q(f"select EgiEnergiklass as class, count(*) n from epc where {where} group by 1", params)
    out["dec"] = _q(f"""select (EgenNybyggAr // 10) * 10 as decade, count(*) n,
                        median(EgiEnergiPrestanda) ep from epc where {where} group by 1 order by 1""", params)
    sums = ", ".join(f"sum(coalesce({c},0)) as {c}" for c in HEAT_CARRIERS)
    out["heat"] = _q(f"select {sums} from epc where {where}", params)
    out["hist"] = _q(f"""select least(greatest(EgiEnergiPrestanda, 0), 400) // 10 * 10 as ep, count(*) n
                         from epc where {where} group by 1 order by 1""", params)
    out["rows"] = _q(f"""select IdAdr as address, IdPostort as town, EgenByggnadsKat as category,
                         EgenNybyggAr as built, EgenAtemp as heated_area_m2, EgiEnergiPrestanda as
                         energy_performance, EgiEnergiklass as class, EgiVersion as rules_version
                         from epc where {where} limit 3000""", params)
    return out


def epc_explorer() -> None:
    if not (REPO_ROOT / EPC_DB).exists():
        st.warning(f"`{EPC_DB}` is not on this computer.")
        return
    source_line(EPC_DB, note="Boverket's national register of energy declarations, opened read-only")
    mun = _epc_municipalities()
    names = mun["kommun"].tolist()
    with st.container(border=True):
        c1, c2, c3 = st.columns([1, 1.4, 1.3])
        kommun = c1.selectbox("Municipality", names,
                              index=names.index("Göteborg") if "Göteborg" in names else 0,
                              format_func=lambda k: f"{k} ({int(mun.set_index('kommun').at[k, 'n']):,})",
                              key="epc_mun")
        cats = c2.multiselect("Building category",
                              ["Flerbostadshus", "En- och tvåbostadshus", "Lokalbyggnader"],
                              key="epc_cat", placeholder="all categories",
                              help="Flerbostadshus = multi-family; En- och tvåbostadshus = one- and "
                                   "two-family; Lokalbyggnader = non-residential")
        y0, y1 = c3.slider("Construction year", 1800, 2026, (1800, 2026), key="epc_yr")
    s = _epc_summary(kommun, tuple(cats), y0, y1)
    k = s["kpi"].iloc[0]
    if not k["n"]:
        st.info("No certificates match these filters.")
        return
    m = st.columns(5)
    m[0].metric("Certificates", f"{int(k['n']):,}")
    m[1].metric("Median energy performance", f"{k['ep']:.0f} kWh/m²",
                help="EgiEnergiPrestanda: energy performance per heated floor area (Atemp) and year; "
                     "primary energy under the 2019+ rules, specific use before")
    m[2].metric("Class A–C", f"{100 * k['abc']:.0f}%")
    m[3].metric("Median heated area", f"{k['atemp']:,.0f} m²")
    m[4].metric("Median construction year", f"{k['yr']:.0f}")

    a, b = st.columns(2)
    cls = s["cls"].dropna().set_index("class").reindex(CLASSES, fill_value=0).reset_index()
    with a:
        _chart(alt.Chart(cls, title="Energy class").mark_bar().encode(
            x=alt.X("class:N", sort=CLASSES, title=None), y=alt.Y("n:Q", title="certificates"),
            color=alt.Color("class:N", scale=alt.Scale(domain=CLASSES, range=list(EPC_COLORS.values())),
                            legend=None), tooltip=["class", "n"]).properties(height=260))
    with b:
        _chart(alt.Chart(s["hist"], title="Energy performance (kWh/m² per year; 400 = 400 or more)")
               .mark_bar(color="#6E2AAE").encode(x=alt.X("ep:Q", title="kWh/m² per year",
               bin=alt.Bin(binned=True, step=10)), x2="ep2:Q", y=alt.Y("n:Q", title="certificates"))
               .transform_calculate(ep2="datum.ep + 10").properties(height=260))
    c, d = st.columns(2)
    with c:
        dec = s["dec"][s["dec"]["decade"].between(1850, 2030) & (s["dec"]["n"] >= 20)]
        _chart(alt.Chart(dec, title="Median energy performance by construction decade "
                                    "(decades with 20+ certificates)")
               .mark_line(point=True, color="#E2001A").encode(
                   x=alt.X("decade:O", title=None),
                   y=alt.Y("ep:Q", title="median kWh/m² per year"),
                   tooltip=[alt.Tooltip("decade:O"), alt.Tooltip("ep:Q", title="median kWh/m²", format=".0f"),
                            alt.Tooltip("n:Q", title="certificates", format=",")])
               .properties(height=260))
    with d:
        heat = s["heat"].T.reset_index()
        heat.columns = ["col", "kwh"]
        heat["carrier"] = heat["col"].map(HEAT_CARRIERS)
        heat = heat[heat["kwh"] > 0]
        heat["share"] = heat["kwh"] / heat["kwh"].sum()
        _chart(alt.Chart(heat, title="Energy for heating, by carrier (share of kWh)").mark_bar(
            color="#0F766E").encode(y=alt.Y("carrier:N", sort="-x", title=None),
            x=alt.X("share:Q", axis=alt.Axis(format="%"), title=None),
            tooltip=["carrier", alt.Tooltip("kwh:Q", format=",.0f"), alt.Tooltip("share:Q", format=".1%")])
            .properties(height=260))
    st.markdown("##### The records")
    show_dataframe_safe(s["rows"])
    st.caption(f"The first {len(s['rows']):,} matching certificates.")
    download_csv(s["rows"], f"epc_{kommun}.csv", "epc_dl")


# ═════════════════════════════════════════════════════════════════════════════
# Housing market (Booli sales, Boplats rentals)
# ═════════════════════════════════════════════════════════════════════════════

def _sqlite(rel: str, sql: str) -> pd.DataFrame:
    con = sqlite3.connect(f"file:{(REPO_ROOT / rel).as_posix()}?mode=ro", uri=True)
    try:
        return pd.read_sql_query(sql, con)
    finally:
        con.close()


@st.cache_data(show_spinner=False, ttl=600)
def _booli() -> pd.DataFrame:
    return _sqlite("booli_listings.db", """select id, status, address, area_name, object_type, tenure,
        construction_year, rooms, living_area_m2, floor, list_price, sold_price, sold_date, monthly_fee,
        sqm_price, energy_class, agency_name, latitude as lat, longitude as lon, is_new_construction,
        url, first_seen, last_seen from listings""")


@st.cache_data(show_spinner=False, ttl=600)
def _boplats() -> pd.DataFrame:
    return _sqlite("boplats_apartments.db", """select id, address, area_name, rooms, size_m2,
        floor_current, floor_total, rent_sek, move_in_date, apply_by, url, first_seen, last_seen
        from apartments""")


def _norm_addr(s: str) -> str:
    """Street address in the form both datasets agree on: lowercase, single spaces,
    without the trailing postcode Boplats sometimes appends."""
    s = str(s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return re.sub(r"\s+\d{4}$", "", s)


@st.cache_data(show_spinner="Placing rentals on the map…", ttl=600)
def _boplats_located() -> pd.DataFrame:
    """Boplats listings with the coordinates and energy class of the building they sit in.

    Boplats publishes an address but no coordinates, so each listing is matched to a
    building in the Gothenburg model by address - including every entrance in
    ``all_addresses``, since one building often lists several. Listings that match no
    building keep their row but have no lat/lon, and the page says how many.
    """
    df = _boplats()
    b = load_buildings("frontend/public/buildings.json")
    have = b.dropna(subset=["lat", "lon"])

    lookup: dict[str, dict] = {}
    for rec in have.to_dict("records"):
        keys = {_norm_addr(rec.get("address"))}
        keys.update(_norm_addr(a) for a in str(rec.get("all_addresses") or "").split("|"))
        for k in keys:
            # Keep the first match, but prefer one that carries an energy class.
            if k and (k not in lookup or (rec.get("eclass") and not lookup[k].get("eclass"))):
                lookup[k] = rec

    hit = df["address"].map(lambda a: lookup.get(_norm_addr(a)))
    return df.assign(
        lat=hit.map(lambda r: r.get("lat") if r else np.nan),
        lon=hit.map(lambda r: r.get("lon") if r else np.nan),
        eclass=hit.map(lambda r: r.get("eclass") if r else None),
        building_year=hit.map(lambda r: r.get("year") if r else np.nan),
        building_kwh_m2=hit.map(lambda r: r.get("energy") if r else np.nan),
    )


# Rent-per-m² ramp: five quantile bins, low to high (ColorBrewer RdYlBu reversed).
RENT_COLORS = ["#2C7BB6", "#ABD9E9", "#FFFFBF", "#FDAE61", "#D7191C"]


def _boplats_map(df: pd.DataFrame) -> None:
    """Map of rental listings, coloured by the building's energy class or by rent per m²."""
    placed = df.dropna(subset=["lat", "lon"])
    st.markdown("#### Where the rentals are")
    if placed.empty:
        st.info("No listing address matched a building in the model, so there is nothing to map.")
        return

    mode = st.radio("Colour by", ["Energy class", "Rent per m²"], horizontal=True,
                    key="bop_map_mode", label_visibility="collapsed")

    if mode == "Energy class":
        rgb = [_hex_rgb(EPC_COLORS[c]) if c in EPC_COLORS else GREY for c in placed["eclass"]]
        legend = [(c, EPC_COLORS[c]) for c in CLASSES if (placed["eclass"] == c).any()]
        if placed["eclass"].isna().any():
            legend.append(("no certificate", "#AAAAAA"))
    else:
        # A few listings record size 0, which makes rent/m² infinite - drop those to
        # NaN so they colour as "no rent" instead of dragging the top bin to infinity.
        rent_m2 = placed["rent_m2"].replace([np.inf, -np.inf], np.nan)
        vals = rent_m2.dropna()
        cuts = vals.quantile([0.2, 0.4, 0.6, 0.8]).tolist() if len(vals) else []
        idx = rent_m2.map(lambda v: -1 if pd.isna(v) else sum(v > c for c in cuts))
        rgb = [GREY if i < 0 else _hex_rgb(RENT_COLORS[i]) for i in idx]
        edges = ([vals.min()] + cuts + [vals.max()]) if len(vals) else []
        legend = [(f"{edges[i]:.0f}–{edges[i + 1]:.0f}", RENT_COLORS[i]) for i in range(len(edges) - 1)]
        if (idx < 0).any():
            legend.append(("no rent per m²", "#AAAAAA"))

    d = placed.assign(
        rgb=rgb,
        rent_txt=placed["rent_sek"].map(lambda v: "–" if pd.isna(v) else f"{v:,.0f}"),
        rent_m2_txt=placed["rent_m2"].map(lambda v: "–" if pd.isna(v) else f"{v:.0f}"),
        class_txt=placed["eclass"].fillna("no certificate"),
    )
    # Rentals sit right across the municipality, so start wider than the default.
    _map(d, "{address}\n{rent_txt} SEK/month · {rent_m2_txt} SEK/m² · class {class_txt}",
         key="boplats_map", radius=45, zoom=10.2)
    _legend(legend)
    st.caption(
        f"{len(placed):,} of {len(df):,} listings are placed - the other "
        f"{len(df) - len(placed):,} have an address that matches no building in the model. "
        "Energy class is the **building's** certificate, not the individual apartment's."
    )


def market_explorer() -> None:
    which = st.radio("Dataset", ["Booli - homes for sale", "Boplats - rental apartments"],
                     horizontal=True, key="mkt_which")
    if which.startswith("Booli"):
        df = _booli()
        source_line("booli_listings.db", note="scraped weekly; see **4. Scraped Market Data**")
        m = st.columns(4)
        m[0].metric("Listings", f"{len(df):,}")
        m[1].metric("Median price per m²", f"{df['sqm_price'].median():,.0f} SEK")
        m[2].metric("Median living area", f"{df['living_area_m2'].median():.0f} m²")
        m[3].metric("Last seen", str(df["last_seen"].max())[:10])
        q = df["sqm_price"].quantile([0.05, 0.95]).tolist()
        t = ((df["sqm_price"] - q[0]) / max(1, q[1] - q[0])).clip(0, 1).fillna(0.5)
        df = df.assign(rgb=[[int(40 + 215 * v), int(90 + 60 * (1 - v)), int(220 - 200 * v)] for v in t],
                       price_txt=df["sqm_price"].map(lambda v: "–" if pd.isna(v) else f"{v:,.0f}"))
        _map(df, "{address}\n{price_txt} SEK/m² · {rooms} rooms", key="booli_map", radius=25)
        _legend([("low price per m²", "#285ADC"), ("high", "#FF3C14")])
        _chart(alt.Chart(df.dropna(subset=["living_area_m2", "list_price"]), title="Asking price and size")
               .mark_circle(size=60, opacity=0.7).encode(
                   x=alt.X("living_area_m2:Q", title="living area (m²)"),
                   y=alt.Y("list_price:Q", title="asking price (SEK)"),
                   color=alt.Color("object_type:N", title="type"),
                   tooltip=["address", "rooms", "living_area_m2", "list_price", "sqm_price"])
               .properties(height=320))
        show_dataframe_safe(df.drop(columns=["rgb", "price_txt"]))
        download_csv(df.drop(columns=["rgb", "price_txt"]), "booli.csv", "booli_dl")
    else:
        df = _boplats_located()
        source_line("boplats_apartments.db", "frontend/public/buildings.json",
                    note="rentals scraped daily (see **4. Scraped Market Data**), placed on "
                         "the building model by address")
        df["rent_m2"] = df["rent_sek"] / df["size_m2"]
        m = st.columns(4)
        m[0].metric("Apartments", f"{len(df):,}")
        m[1].metric("Median rent", f"{df['rent_sek'].median():,.0f} SEK/month")
        m[2].metric("Median rent per m²", f"{df['rent_m2'].median():.0f} SEK/month")
        m[3].metric("Last seen", str(df["last_seen"].max())[:10])
        _boplats_map(df)
        a, b = st.columns(2)
        with a:
            _chart(alt.Chart(df.dropna(subset=["size_m2", "rent_sek"]), title="Rent and size")
                   .mark_circle(size=40, opacity=0.6, color="#6E2AAE").encode(
                       x=alt.X("size_m2:Q", title="m²"), y=alt.Y("rent_sek:Q", title="SEK per month"),
                       tooltip=["address", "area_name", "rooms", "size_m2", "rent_sek"])
                   .properties(height=320))
        with b:
            top = (df.groupby("area_name").agg(n=("id", "size"), rent_m2=("rent_m2", "median"))
                   .query("n >= 5").sort_values("rent_m2", ascending=False).head(20).reset_index())
            _chart(alt.Chart(top, title="Median rent per m² by area (areas with 5+ listings)")
                   .mark_bar(color="#0F766E").encode(y=alt.Y("area_name:N", sort="-x", title=None),
                   x=alt.X("rent_m2:Q", title="SEK/m² per month"), tooltip=["area_name", "n", "rent_m2"])
                   .properties(height=320))
        show_dataframe_safe(df)
        download_csv(df, "boplats.csv", "boplats_dl")


# ═════════════════════════════════════════════════════════════════════════════
# Simulation results (EPSM store)
# ═════════════════════════════════════════════════════════════════════════════

SIM_DB = "data/simulation_database.sqlite3"


def _loads(s) -> dict:
    """JSON text column -> dict; NULL (NaN in pandas) or bad JSON -> {}."""
    if not isinstance(s, str) or not s:
        return {}
    try:
        v = json.loads(s)
    except ValueError:
        return {}
    return v if isinstance(v, dict) else {}


@st.cache_data(show_spinner="Reading the simulation store…", ttl=300)
def _sims() -> pd.DataFrame:
    df = _sqlite(SIM_DB, """select id, country, city_id, address, package_id, package_label, batch_id,
        status, submitted_at, completed_at, results, building_info, error from simulations""")
    res = df["results"].map(_loads)
    for k in ("total_kwh_m2_yr", "heating_kwh_m2_yr", "total_floor_area_m2", "floors"):
        df[k] = pd.to_numeric(res.map(lambda r: r.get(k) if isinstance(r, dict) else None), errors="coerce")
    info = df["building_info"].map(_loads)
    df["year"] = pd.to_numeric(info.map(lambda d: d.get("year") if isinstance(d, dict) else None), errors="coerce")
    df["eclass"] = info.map(lambda d: d.get("eclass") if isinstance(d, dict) else None)
    df["kind"] = np.where(df["package_id"].fillna("").str.startswith("baseline"), "baseline", "renovation package")
    df["scenario"] = df["package_id"].fillna("").map(
        lambda p: p.split("__", 1)[1] if "__" in p else "today's climate")
    return df.drop(columns=["results", "building_info"])


def sims_explorer(country: str) -> None:
    if not (REPO_ROOT / SIM_DB).exists():
        st.warning(f"`{SIM_DB}` is not on this computer.")
        return
    source_line(SIM_DB, note="every EnergyPlus run the tool has sent to EPSM, with its results; "
                             "see **6. Energy Simulation - EPSM & IDF**")
    df = _sims()
    df = df[df["country"] == country]
    if df.empty:
        st.info("No simulations stored for this country.")
        return
    done = df[df["status"] == "completed"]
    m = st.columns(5)
    m[0].metric("Simulations", f"{len(df):,}")
    m[1].metric("Completed", f"{len(done):,}")
    m[2].metric("Queued, never run", f"{(df['status'] == 'queued').sum():,}")
    m[3].metric("Failed", f"{(df['status'] == 'failed').sum():,}")
    m[4].metric("Median total (completed)", f"{done['total_kwh_m2_yr'].median():.0f} kWh/m²"
                if len(done) else "-")
    if len(done):
        a, b = st.columns(2)
        with a:
            h = done.dropna(subset=["total_kwh_m2_yr"])
            h = h[h["total_kwh_m2_yr"] < 600]
            _chart(alt.Chart(h, title="Simulated total energy (kWh/m² per year)").mark_bar(opacity=0.8)
                   .encode(x=alt.X("total_kwh_m2_yr:Q", bin=alt.Bin(step=20), title="kWh/m² per year"),
                           y=alt.Y("count()", stack=None, title="simulations"),
                           color=alt.Color("kind:N", title=None,
                                           scale=alt.Scale(range=["#94A3B8", "#6E2AAE"])))
                   .properties(height=280))
        with b:
            t = done.assign(day=pd.to_datetime(done["completed_at"], errors="coerce").dt.to_period("W")
                            .dt.start_time).dropna(subset=["day"])
            w = t.groupby(["day", "kind"]).size().reset_index(name="runs")
            _chart(alt.Chart(w, title="Completed runs per week").mark_bar().encode(
                x=alt.X("day:T", title=None), y=alt.Y("runs:Q"),
                color=alt.Color("kind:N", title=None, scale=alt.Scale(range=["#94A3B8", "#6E2AAE"])))
                .properties(height=280))
        sc = done.groupby("scenario")["total_kwh_m2_yr"].agg(["count", "median"]).reset_index()
        if len(sc) > 1:
            st.caption("By climate scenario (package id suffix):")
            show_dataframe_safe(sc.rename(columns={"count": "runs", "median": "median kWh/m²·yr"}))
    st.markdown("##### The records")
    status = st.multiselect("Status", sorted(df["status"].unique()), key=f"sim_st_{country}",
                            placeholder="all statuses")
    view = df[df["status"].isin(status)] if status else df
    show_dataframe_safe(view.sort_values("submitted_at", ascending=False).head(2000))
    download_csv(view, f"simulations_{country}.csv", f"sim_dl_{country}")


# ═════════════════════════════════════════════════════════════════════════════
# Weather files (EPW)
# ═════════════════════════════════════════════════════════════════════════════

@st.cache_data(show_spinner=False)
def _epw_monthly(rel: str) -> tuple[pd.DataFrame, dict]:
    lines = (REPO_ROOT / rel).read_text(encoding="utf-8", errors="ignore").splitlines()
    loc = lines[0].split(",")
    rows = []
    for ln in lines[8:]:
        p = ln.split(",")
        if len(p) < 22:
            continue
        try:
            rows.append((int(p[1]), int(p[2]), float(p[6]), float(p[8]), float(p[13]),
                         float(p[14]), float(p[15]), float(p[21])))
        except ValueError:
            continue
    h = pd.DataFrame(rows, columns=["month", "day", "t", "rh", "ghi", "dni", "dhi", "wind"])
    daily = h.groupby(["month", "day"])["t"].mean()
    hdd = (17 - daily).clip(lower=0).groupby(level=0).sum()
    mon = h.groupby("month").agg(t_mean=("t", "mean"), t_min=("t", "min"), t_max=("t", "max"),
                                 rh=("rh", "mean"), wind=("wind", "mean"),
                                 ghi=("ghi", "sum"), dni=("dni", "sum"), dhi=("dhi", "sum")).reset_index()
    for c in ("ghi", "dni", "dhi"):
        mon[c] = mon[c] / 1000
    mon["hdd17"] = mon["month"].map(hdd)
    meta = {"station": loc[1] if len(loc) > 1 else "", "lat": loc[6] if len(loc) > 6 else "",
            "lon": loc[7] if len(loc) > 7 else "", "elev": loc[9] if len(loc) > 9 else "",
            "t_mean": h["t"].mean(), "t_min": h["t"].min(), "t_max": h["t"].max(),
            "ghi": h["ghi"].sum() / 1000, "dni": h["dni"].sum() / 1000, "dhi": h["dhi"].sum() / 1000,
            "wind": h["wind"].mean(), "hdd17": float(hdd.sum()), "hours_above_25": int((h["t"] > 25).sum())}
    return mon, meta


def _epw_label(name: str) -> str:
    m = re.search(r"_(ssp\d{3})_(\d{4})", name)
    model = re.search(r"AP_([A-Za-z0-9\-]+)_ssp", name)
    if m:
        return f"{name.split('_')[2].split('.')[0]} · future {m.group(2)} {m.group(1).upper()}" + \
               (f" ({model.group(1)})" if model else "")
    t = re.search(r"TMYx\.(\d{4}-\d{4})", name)
    return f"{name.split('_')[2].split('.')[0]} · typical year {t.group(1) if t else ''}"


def weather_explorer(prefix: str, in_use: list[str]) -> None:
    files = sorted(p.name for p in (REPO_ROOT / "data" / "epw").glob(f"{prefix}*.epw"))
    if not files:
        st.info("No weather files for this country.")
        return
    default = [f for f in in_use if f in files][:1] or files[:1]
    pick = st.multiselect("Weather files to compare (up to four)", files, default=default,
                          max_selections=4, format_func=_epw_label, key=f"epw_{prefix}")
    if not pick:
        return
    source_line(*[f"data/epw/{f}" for f in pick],
                note="files marked ★ are the ones the tool uses; the others sit unused on disk")
    st.caption("In use: " + ", ".join(f"★ {_epw_label(f)}" for f in in_use if f in files))
    mons, metas = [], []
    for f in pick:
        mon, meta = _epw_monthly(f"data/epw/{f}")
        mons.append(mon.assign(file=_epw_label(f)))
        metas.append({"file": ("★ " if f in in_use else "") + _epw_label(f), **meta})
    summ = pd.DataFrame(metas)
    show = summ[["file", "station", "t_mean", "t_min", "t_max", "hdd17", "hours_above_25",
                 "ghi", "dni", "dhi", "wind"]].rename(columns={
        "t_mean": "mean °C", "t_min": "min °C", "t_max": "max °C", "hdd17": "degree-days (17 °C)",
        "hours_above_25": "hours > 25 °C", "ghi": "global kWh/m²", "dni": "direct normal kWh/m²",
        "dhi": "diffuse kWh/m²", "wind": "mean wind m/s"})
    show_dataframe_safe(show.round(1))
    allm = pd.concat(mons)
    a, b = st.columns(2)
    with a:
        _chart(alt.Chart(allm, title="Monthly mean air temperature (°C)").mark_line(point=True).encode(
            x=alt.X("month:O"), y=alt.Y("t_mean:Q", title="°C"), color=alt.Color("file:N", title=None,
            legend=alt.Legend(orient="bottom", columns=1))).properties(height=300))
    with b:
        _chart(alt.Chart(allm, title="Monthly global horizontal radiation (kWh/m²)").mark_bar().encode(
            x=alt.X("month:O"), xOffset="file:N", y=alt.Y("ghi:Q", title="kWh/m²"),
            color=alt.Color("file:N", title=None, legend=alt.Legend(orient="bottom", columns=1)))
            .properties(height=300))


# ═════════════════════════════════════════════════════════════════════════════
# Trafikverket snapshot (Sweden)
# ═════════════════════════════════════════════════════════════════════════════

def _pt(wkt: str) -> tuple[float | None, float | None]:
    m = re.match(r"POINT\s*\(([-\d.]+)\s+([-\d.]+)\)", str(wkt or ""))
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def traffic_explorer() -> None:
    source_line("trafikverket.db", note="the last snapshot the Trafikverket collector stored")
    cams = _sqlite("trafikverket.db", "select name, type, description, active, photo_time, geometry_wgs84 from cameras")
    flow = _sqlite("trafikverket.db", """select site_id, vehicle_type, flow_rate, avg_speed,
                   measurement_time, geometry_wgs84 from traffic_flow""")
    for d in (cams, flow):
        xy = d["geometry_wgs84"].map(_pt)
        d["lon"], d["lat"] = xy.map(lambda t: t[0]), xy.map(lambda t: t[1])
    m = st.columns(4)
    m[0].metric("Road cameras", f"{len(cams):,}")
    m[1].metric("Flow measurements", f"{len(flow):,}")
    m[2].metric("Median speed", f"{flow['avg_speed'].median():.0f} km/h" if len(flow) else "-")
    m[3].metric("Measured at", str(flow["measurement_time"].max())[:16] if len(flow) else "-")
    v = flow["avg_speed"].clip(0, 110) / 110
    flow = flow.assign(rgb=[[int(230 - 200 * t), int(40 + 170 * t), 60] for t in v.fillna(0.5)])
    cams = cams.assign(rgb=[[80, 80, 90]] * len(cams))
    st.caption("Flow sites coloured by average speed (red slow → green fast); cameras in grey.")
    both = pd.concat([cams.assign(label=cams["name"]),
                      flow.assign(label=flow["vehicle_type"] + " · " + flow["avg_speed"].round(0).astype(str)
                                  + " km/h · " + flow["flow_rate"].round(0).astype(str) + " veh/h")])
    _map(both, "{label}", key="traffic_map", radius=60)
    show_dataframe_safe(flow.drop(columns=["rgb", "geometry_wgs84"]))


# ═════════════════════════════════════════════════════════════════════════════
# Reference tables
# ═════════════════════════════════════════════════════════════════════════════

def _json(rel: str):
    return json.loads((REPO_ROOT / rel).read_text(encoding="utf-8"))


def _meta_line(d: dict) -> None:
    bits = [f"**{k}:** {d[k]}" for k in ("dataset", "publisher", "source", "licence", "currency") if d.get(k)]
    if bits:
        st.caption(" · ".join(bits))
    if d.get("note"):
        st.caption(d["note"])


def reference_se() -> None:
    rel = "data/wikells_catalogue.json"
    source_line(rel, note="construction elements with cost and U-value, used by the optimiser")
    d = _json(rel)
    cat = st.radio("Element", list(d), horizontal=True, key="wik_cat")
    df = pd.DataFrame(d[cat])
    a, b = st.columns([1.3, 1])
    with a:
        show_dataframe_safe(df)
    with b:
        _chart(alt.Chart(df, title=f"{cat}: cost against U-value").mark_circle(size=90, color="#6E2AAE")
               .encode(x=alt.X("u_value:Q", title="U-value (W/m²K)"),
                       y=alt.Y("cost_sek_m2:Q", title="SEK per m²"),
                       tooltip=["code", "description", "u_value", "cost_sek_m2"]).properties(height=320))


def reference_uk() -> None:
    choice = st.radio("Table", ["TABULA archetypes (England)", "EPC band priors (EHS)",
                                "Cost of reaching band C (EHS)", "EHS headline figures"],
                      horizontal=True, key="uk_ref")
    if choice.startswith("TABULA"):
        rel = "frontend/public/uk/tabula_gb.json"
        d = _json(rel)
        source_line(rel)
        _meta_line(d)
        show_dataframe_safe(pd.json_normalize(d["archetypes"]))
    elif choice.startswith("EPC band"):
        rel = "frontend/public/uk/epc_band_priors.json"
        d = _json(rel)
        source_line(rel, note="used to estimate a band where no certificate matches")
        _meta_line(d)
        dim = st.selectbox("Split by", list(d["priors"]), key="uk_prior_dim")
        rows = [{"group": g, "class": c, "share": s}
                for g, v in d["priors"][dim].items() for c, s in (v.get("bands") or {}).items()]
        df = pd.DataFrame(rows)
        _chart(alt.Chart(df, title=f"Share of dwellings in each band, by {dim}").mark_bar().encode(
            y=alt.Y("group:N", title=None), x=alt.X("share:Q", stack="normalize", axis=alt.Axis(format="%"),
                                                     title=None),
            color=alt.Color("class:N", scale=alt.Scale(domain=CLASSES, range=list(EPC_COLORS.values()))),
            order=alt.Order("class:N"), tooltip=["group", "class", alt.Tooltip("share:Q", format=".1%")])
            .properties(height=max(200, 26 * df["group"].nunique())))
    elif choice.startswith("Cost"):
        rel = "frontend/public/uk/retrofit_cost_band_c.json"
        d = _json(rel)
        source_line(rel)
        _meta_line(d)
        dim = st.selectbox("Split by", list(d["costs"]), key="uk_cost_dim")
        df = pd.DataFrame([{"group": g, **v} for g, v in d["costs"][dim].items() if isinstance(v, dict)])
        if {"mean_gbp", "median_gbp"} <= set(df.columns):
            long = df.melt(id_vars="group", value_vars=["mean_gbp", "median_gbp"], var_name="stat", value_name="gbp")
            _chart(alt.Chart(long, title=f"Cost of improving to band C, by {dim} (GBP)").mark_bar().encode(
                y=alt.Y("group:N", title=None), x=alt.X("gbp:Q", title="GBP"), yOffset="stat:N",
                color=alt.Color("stat:N", title=None)).properties(height=max(200, 40 * len(df))))
        show_dataframe_safe(df)
    else:
        rel = "frontend/public/uk/ehs_2024_25.json"
        d = _json(rel)
        source_line(rel)
        _meta_line(d)
        show_dataframe_safe(pd.DataFrame(d.get("kpis", [])))
