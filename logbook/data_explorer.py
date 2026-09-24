"""Data Explorer - browse the tool's own datasets, read-only.

Layout only; the loaders and charts live in ``scripts/explorer.py``.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import streamlit as st  # noqa: E402

from scripts import explorer as ex  # noqa: E402
from scripts.ui_utils import REPO_ROOT, inject_css  # noqa: E402

st.set_page_config(page_title="Data Explorer", layout="wide")
inject_css()
st.title("Data Explorer")
st.markdown(
    "Browse the datasets the tool actually runs on - the same files the viewer, the "
    "wizard and the analyses read. Filter them, see what they hold on a map and in "
    "charts, and download the rows you selected. Everything is opened **read-only**; "
    "nothing here changes the data. Where each dataset comes from is on "
    "**1. Data Sources**, how complete it is on **2. Coverage & Quality**."
)

SE_DATASETS = {
    "Buildings - Gothenburg model": "b",
    "Energy certificates - national register": "epc",
    "Housing market - Booli and Boplats": "mkt",
    "Simulation results": "sim",
    "Weather files": "epw",
    "Traffic - Trafikverket snapshot": "traf",
    "Cost catalogue - Wikells": "ref",
}
UK_DATASETS = {
    "Buildings - district models": "b",
    "Survey tables - EHS and TABULA": "ref",
    "Simulation results": "sim",
    "Weather files": "epw",
}

se_tab, uk_tab = st.tabs(["Sweden", "United Kingdom"])

with se_tab:
    pick = st.radio("Dataset", list(SE_DATASETS), horizontal=True, key="se_ds",
                    label_visibility="collapsed")
    kind = SE_DATASETS[pick]
    st.subheader(pick)
    if kind == "b":
        ex.buildings_explorer("frontend/public/buildings.json", key="se_b", energy_col="energy",
                              energy_label="Certificate energy use by class",
                              extra_cols=["energy", "andamal", "tabula_period", "tabula_u_wall",
                                          "tabula_u_roof", "tabula_u_win"])
    elif kind == "epc":
        ex.epc_explorer()
    elif kind == "mkt":
        ex.market_explorer()
    elif kind == "sim":
        ex.sims_explorer("se")
    elif kind == "epw":
        ex.weather_explorer("SWE_", ["SWE_VG_Gothenburg-Landvetter.AP.025260_TMYx.2011-2025.epw"])
    elif kind == "traf":
        ex.traffic_explorer()
    else:
        ex.reference_se()

with uk_tab:
    pick = st.radio("Dataset", list(UK_DATASETS), horizontal=True, key="uk_ds",
                    label_visibility="collapsed")
    kind = UK_DATASETS[pick]
    st.subheader(pick)
    if kind == "b":
        files = sorted(p.name for p in (REPO_ROOT / "frontend/public/uk").glob("buildings_*.json"))
        label = {f: f.removeprefix("buildings_").removesuffix(".json").replace("_", " ").title()
                 for f in files}
        f = st.selectbox("District", files, format_func=label.get, key="uk_district",
                         index=files.index("buildings_rotherham.json")
                         if "buildings_rotherham.json" in files else 0)
        ex.buildings_explorer(f"frontend/public/uk/{f}", key=f"uk_b_{f}",
                              energy_col="energy_consumption_kwh_m2_yr",
                              energy_label="Certificate energy use by band",
                              extra_cols=["postcode", "sap", "epc_source", "main_fuel", "property_type",
                                          "built_form", "tabula_period", "tabula_kwh_m2_yr",
                                          "energy_consumption_kwh_m2_yr"])
    elif kind == "ref":
        ex.reference_uk()
    elif kind == "sim":
        ex.sims_explorer("gb")
    else:
        ex.weather_explorer("GBR_", ["GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw",
                                     "GBR_ENG_Doncaster.Sheffield-Hood.AP.034054_TMYx.2011-2025.epw"])
