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
    "charts, and download the rows you selected. Everything is opened read-only; "
    "nothing here changes the data. Where each dataset comes from is on "
    "1. Data Sources, how complete it is on 2. Coverage & Quality."
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
BE_DATASETS = {
    "Buildings - city models": "b",
    "Reference tables - TABULA, Statbel, Walloon EPB": "ref",
    "Simulation results": "sim",
    "Weather files": "epw",
}

se_tab, uk_tab, be_tab = st.tabs(["Sweden", "United Kingdom", "Belgium"])

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

with be_tab:
    pick = st.radio("Dataset", list(BE_DATASETS), horizontal=True, key="be_ds",
                    label_visibility="collapsed")
    kind = BE_DATASETS[pick]
    st.subheader(pick)
    if kind == "b":
        st.caption(
            "No Belgian region publishes open per-building certificates, so the energy-class "
            "filter and the class chart are empty for every city here - that is the data, not "
            "a fault. What stands in for it, for Wallonia, is under Reference tables."
        )
        files = sorted(p.name for p in (REPO_ROOT / "frontend/public/be").glob("buildings_*.json"))
        # cities.json is what the app actually serves; anything else on disk is a
        # superseded build (the two old Liège districts) and is not offered here.
        served = {c["data_file"].split("/")[-1]
                  for c in ex._json("frontend/public/be/cities.json")["cities"]}
        files = [f for f in files if f in served] or files
        label = {f: f.removeprefix("buildings_").removesuffix(".json").replace("_", " ").title()
                 for f in files}
        # Default to a small district: Liège is 123 MB and would be parsed every
        # time someone opened this tab. It is one click away, with a warning.
        default = "buildings_brussels_saint_gilles.json"
        f = st.selectbox("City", files, format_func=label.get, key="be_city",
                         index=files.index(default) if default in files else 0)
        if f == "buildings_liege.json":
            st.warning("Liège is the whole municipality - 129,899 buildings, a 123 MB payload. "
                       "The first load takes a minute or so; it is cached afterwards.", icon="⏳")
        ex.buildings_explorer(f"frontend/public/be/{f}", key=f"be_b_{f}",
                              energy_col="tabula_kwh_m2_yr",
                              energy_label="TABULA archetype energy use (modelled, not measured)",
                              extra_cols=["postcode", "register_class", "attached_neighbours",
                                          "dwellings_est", "height_source", "year_source",
                                          "tabula_code", "tabula_kwh_m2_yr",
                                          "peb_ref_e_spec_median", "peb_ref_label_mode"],
                              # Colouring by energy class would paint every
                              # Belgian building grey.
                              colour_default="Use")
    elif kind == "ref":
        ex.reference_be()
    elif kind == "sim":
        ex.sims_explorer("be")
    else:
        ex.weather_explorer("BEL_", ["BEL_VLG_Uccle.064470_TMYx.2011-2025.epw",
                                     "BEL_WAL_Liege.AP.064780_TMYx.2011-2025.epw"])
