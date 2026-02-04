import streamlit as st

# ----- Data requirements & proxy definitions -----
ANALYSIS_DATA_REQUIREMENTS = {
    "Energy & Carbon Performance": {
        "required_items": [
            "building_footprints",
            "number_of_floors",
            "roof_shape_angle",
            "window_to_wall_ratio",
            "building_location",
            "climate_data",
            "building_materials",
            "construction_age",
            "building_use_type",
            "occupancy_data",
            "internal_gains",
            "dhw_demand",
            "hvac_systems",
            "infiltration_rate",
            "emission_factors",
            "hourly_heating_demand",
            "hourly_electricity_consumption",
        ],
        "optional_items": [
            "surroundings_data",
            "window_properties",
            "architectural_drawings",
        ],
    },
    "Renewable Energy & Local Production": {
        "required_items": [
            "roof_shape_angle",
            "roof_area",
            "surroundings_data",
            "climate_data",
            "pv_system_params",
            "occupancy_data",
            "hourly_electricity_consumption",
        ],
        "optional_items": [
            "building_footprints",
            "building_location",
            "battery_storage",
        ],
    },
    "Climate Resilience": {
        "required_items": [
            "climate_data",
            "future_climate_data",
            "building_orientation",
            "window_to_wall_ratio",
            "surroundings_data",
            "thermal_mass",
            "building_materials",
            "window_properties",
            "occupancy_data",
            "comfort_thresholds",
            "cooling_systems",
            "ventilation_strategy",
        ],
        "optional_items": [
            "building_footprints",
            "construction_age",
            "hvac_systems",
        ],
    },
}

DATA_ITEMS_WITH_PROXIES = {
    "Building Geometry": [
        {
            "label": "Architectural drawings",
            "key": "architectural_drawings",
            "proxy_tiers": {
                "tier1": {
                    "name": "Google Earth + Street View measurements",
                    "description": "Extract dimensions from satellite imagery and street-level photos",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Neighboring building averages",
                    "description": "Use average dimensions from similar nearby buildings",
                    "confidence_impact": -30,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Building dimensions",
            "key": "building_footprints",
            "proxy_tiers": {
                "tier1": {
                    "name": "GIS cadastral data",
                    "description": "Use building footprints from cadastral/property records",
                    "confidence_impact": -10,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "OpenStreetMap data",
                    "description": "Extract building outlines from OpenStreetMap",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Number of floors",
            "key": "number_of_floors",
            "proxy_tiers": {
                "tier1": {
                    "name": "Visual estimation from imagery",
                    "description": "Count floors from Google Street View or site photos",
                    "confidence_impact": -12,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Roof shape and roof angle",
            "key": "roof_shape_angle",
            "proxy_tiers": {
                "tier1": {
                    "name": "Aerial imagery analysis",
                    "description": "Determine roof characteristics from satellite/drone imagery",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Window to wall ratio (all facades)",
            "key": "window_to_wall_ratio",
            "proxy_tiers": {
                "tier1": {
                    "name": "Photo analysis estimation",
                    "description": "Estimate WWR from building facade photos",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                },
                "tier2": {
                    "name": "Building type defaults",
                    "description": "Apply typical WWR values for building type and age",
                    "confidence_impact": -35,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Building orientation",
            "key": "building_orientation",
            "proxy_tiers": {
                "tier1": {
                    "name": "GIS/Map-based measurement",
                    "description": "Calculate orientation from map data or satellite imagery",
                    "confidence_impact": -5,
                    "uncertainty": "Low",
                }
            },
        },
    ],
    "Building Fabric and Construction": [
        {
            "label": "Construction materials",
            "key": "building_materials",
            "proxy_tiers": {
                "tier1": {
                    "name": "National construction standards by decade",
                    "description": "Use typical construction practices from national building codes",
                    "confidence_impact": -20,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Thermal imaging sample extrapolation",
                    "description": "Extrapolate from thermal imaging survey of representative buildings",
                    "confidence_impact": -25,
                    "uncertainty": "Medium-High",
                },
                "tier3": {
                    "name": "Climate zone defaults",
                    "description": "Apply typical envelope values for climate zone",
                    "confidence_impact": -40,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Year of construction/renovation",
            "key": "construction_age",
            "proxy_tiers": {
                "tier1": {
                    "name": "Municipal building permits",
                    "description": "Obtain construction dates from building permit archives",
                    "confidence_impact": -8,
                    "uncertainty": "Low-Medium",
                },
                "tier2": {
                    "name": "Architectural style dating",
                    "description": "Estimate age from architectural characteristics and local development patterns",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
                "tier3": {
                    "name": "Regional average by area",
                    "description": "Apply average building age from regional statistics",
                    "confidence_impact": -35,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Windows properties",
            "key": "window_properties",
            "proxy_tiers": {
                "tier1": {
                    "name": "Age-based window standards",
                    "description": "Infer window properties from construction age and building codes",
                    "confidence_impact": -18,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Thermal mass",
            "key": "thermal_mass",
            "proxy_tiers": {
                "tier1": {
                    "name": "Construction type estimation",
                    "description": "Estimate thermal mass from building type and construction era",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                },
                "tier2": {
                    "name": "Generic thermal mass values",
                    "description": "Apply standard thermal mass values for building category",
                    "confidence_impact": -35,
                    "uncertainty": "High",
                },
            },
        },
    ],
    "Building System": [
        {
            "label": "HVAC system type",
            "key": "hvac_systems",
            "proxy_tiers": {
                "tier1": {
                    "name": "Age-based system assumptions",
                    "description": "Infer HVAC type from building age and type",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                },
                "tier2": {
                    "name": "Regional typical systems",
                    "description": "Apply most common system types for region",
                    "confidence_impact": -35,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Infiltration rate",
            "key": "infiltration_rate",
            "proxy_tiers": {
                "tier1": {
                    "name": "Building age defaults",
                    "description": "Use typical infiltration rates based on construction period",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Cooling systems",
            "key": "cooling_systems",
            "proxy_tiers": {
                "tier1": {
                    "name": "Climate zone typical systems",
                    "description": "Infer cooling system type based on climate and building age",
                    "confidence_impact": -18,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Regional cooling standards",
                    "description": "Apply typical cooling solutions for region",
                    "confidence_impact": -30,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Ventilation strategy",
            "key": "ventilation_strategy",
            "proxy_tiers": {
                "tier1": {
                    "name": "Building type defaults",
                    "description": "Assume typical ventilation for building type and age",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                }
            },
        },
    ],
    "Location Context": [
        {
            "label": "Buildings location",
            "key": "building_location",
            "proxy_tiers": {
                "tier1": {
                    "name": "Address geocoding",
                    "description": "Convert addresses to coordinates using geocoding services",
                    "confidence_impact": -5,
                    "uncertainty": "Low",
                }
            },
        },
        {
            "label": "Surroundings height and location",
            "key": "surroundings_data",
            "proxy_tiers": {
                "tier1": {
                    "name": "3D city model or LiDAR",
                    "description": "Use available 3D building data or aerial LiDAR scans",
                    "confidence_impact": -12,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Simplified shading analysis",
                    "description": "Estimate shading using 2D maps and typical building heights",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
            },
        },
    ],
    "Measured Energy Data": [
        {
            "label": "Hourly heating demand",
            "key": "hourly_heating_demand",
            "proxy_tiers": {
                "tier1": {
                    "name": "Monthly/annual utility data",
                    "description": "Use monthly utility bills with load profile estimation",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                },
                "tier2": {
                    "name": "Benchmark data by building type",
                    "description": "Apply typical heating profiles from similar buildings",
                    "confidence_impact": -35,
                    "uncertainty": "High",
                },
                "tier3": {
                    "name": "Physics-based simulation",
                    "description": "Calculate heating demand from building model and weather",
                    "confidence_impact": -50,
                    "uncertainty": "Very High",
                },
            },
        },
        {
            "label": "Hourly electricity consumption",
            "key": "hourly_electricity_consumption",
            "proxy_tiers": {
                "tier1": {
                    "name": "Monthly/annual utility data",
                    "description": "Use monthly utility bills with load profile estimation",
                    "confidence_impact": -18,
                    "uncertainty": "Medium-High",
                },
                "tier2": {
                    "name": "Benchmark load profiles",
                    "description": "Apply standard electricity profiles for building type",
                    "confidence_impact": -40,
                    "uncertainty": "High",
                },
            },
        },
    ],
    "Climate Data": [
        {
            "label": "Weather file (EPW/TMY)",
            "key": "climate_data",
            "proxy_tiers": {
                "tier1": {
                    "name": "Nearby weather station data",
                    "description": "Use weather data from nearest meteorological station",
                    "confidence_impact": -8,
                    "uncertainty": "Low-Medium",
                },
                "tier2": {
                    "name": "Climate zone typical year",
                    "description": "Use typical meteorological year for climate zone",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                },
            },
        },
        {
            "label": "Future climate scenarios (SSP/RCP)",
            "key": "future_climate_data",
            "proxy_tiers": {
                "tier1": {
                    "name": "Regional climate projections",
                    "description": "Use downscaled regional climate model projections",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Morphed weather files",
                    "description": "Apply climate change factors to current weather data",
                    "confidence_impact": -30,
                    "uncertainty": "High",
                },
            },
        },
    ],
    "Carbon Accounting": [
        {
            "label": "Emission factors for energy carriers",
            "key": "emission_factors",
            "proxy_tiers": {
                "tier1": {
                    "name": "National grid emission factors",
                    "description": "Use national/regional emission factors from official sources",
                    "confidence_impact": -10,
                    "uncertainty": "Low-Medium",
                },
                "tier2": {
                    "name": "Default IPCC factors",
                    "description": "Apply generic IPCC emission factors",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Roof area / solar potential",
            "key": "roof_area",
            "proxy_tiers": {
                "tier1": {
                    "name": "Aerial imagery estimation",
                    "description": "Calculate roof area from satellite/aerial imagery",
                    "confidence_impact": -10,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Solar potential assessment",
            "key": "solar_potential",
            "proxy_tiers": {
                "tier1": {
                    "name": "GIS-based solar mapping",
                    "description": "Use available solar potential maps or calculations",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                }
            },
        },
    ],
    "Renewable Energy Systems": [
        {
            "label": "PV system parameters",
            "key": "pv_system_params",
            "proxy_tiers": {
                "tier1": {
                    "name": "Regional typical PV systems",
                    "description": "Use typical panel efficiency, inverter specs for region",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Generic PV system defaults",
                    "description": "Apply standard industry defaults for PV systems",
                    "confidence_impact": -30,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Battery storage parameters",
            "key": "battery_storage",
            "proxy_tiers": {
                "tier1": {
                    "name": "Standard battery system specs",
                    "description": "Use typical battery capacity and efficiency values",
                    "confidence_impact": -20,
                    "uncertainty": "Medium-High",
                }
            },
        },
    ],
    "Building Use and Operation": [
        {
            "label": "Building use type",
            "key": "building_use_type",
            "proxy_tiers": {
                "tier1": {
                    "name": "Municipal zoning records",
                    "description": "Obtain building use classification from zoning database",
                    "confidence_impact": -8,
                    "uncertainty": "Low",
                }
            },
        },
        {
            "label": "Occupancy patterns",
            "key": "occupancy_data",
            "proxy_tiers": {
                "tier1": {
                    "name": "Census data by building type",
                    "description": "Use census occupancy statistics for building category",
                    "confidence_impact": -12,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Standard occupancy schedules",
                    "description": "Apply typical occupancy patterns from standards (ASHRAE, ISO)",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
            },
        },
        {
            "label": "Internal gains",
            "key": "internal_gains",
            "proxy_tiers": {
                "tier1": {
                    "name": "Building standard defaults",
                    "description": "Use standard internal gain values from energy codes",
                    "confidence_impact": -15,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Domestic hot water demand",
            "key": "dhw_demand",
            "proxy_tiers": {
                "tier1": {
                    "name": "Occupancy-based estimation",
                    "description": "Calculate DHW from occupancy and building standards",
                    "confidence_impact": -18,
                    "uncertainty": "Medium",
                }
            },
        },
        {
            "label": "Comfort thresholds",
            "key": "comfort_thresholds",
            "proxy_tiers": {
                "tier1": {
                    "name": "Standard comfort ranges",
                    "description": "Apply ASHRAE/EN comfort standards for building type",
                    "confidence_impact": -12,
                    "uncertainty": "Medium",
                },
                "tier2": {
                    "name": "Climate-based defaults",
                    "description": "Use typical comfort ranges for climate zone",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
            },
        },
    ],
}


def get_filtered_data_items(analysis_types):
    if isinstance(analysis_types, str):
        analysis_types = [analysis_types]

    valid_types = [a for a in analysis_types if a in ANALYSIS_DATA_REQUIREMENTS]
    if not valid_types:
        return DATA_ITEMS_WITH_PROXIES

    required_keys = set()
    optional_keys = set()
    item_to_analyses = {}

    for a in valid_types:
        reqs = ANALYSIS_DATA_REQUIREMENTS[a]
        req_items = set(reqs.get("required_items", []))
        opt_items = set(reqs.get("optional_items", []))
        required_keys.update(req_items)
        optional_keys.update(opt_items)

        for key in req_items:
            item_to_analyses.setdefault(key, {"required_in": [], "optional_in": []})
            item_to_analyses[key]["required_in"].append(a)
        for key in opt_items:
            item_to_analyses.setdefault(key, {"required_in": [], "optional_in": []})
            item_to_analyses[key]["optional_in"].append(a)

    optional_keys -= required_keys
    needed_keys = required_keys | optional_keys

    filtered = {}
    for category, items in DATA_ITEMS_WITH_PROXIES.items():
        keep = []
        for item in items:
            if item["key"] in needed_keys:
                item_copy = item.copy()
                item_copy["is_required"] = item["key"] in required_keys
                item_copy["analyses"] = item_to_analyses.get(item["key"], {"required_in": [], "optional_in": []})
                keep.append(item_copy)
        if keep:
            filtered[category] = keep

    return filtered


st.set_page_config(layout="wide")

st.title("Step 2: Review Data Inputs")
st.markdown("<p style='font-size: 1.05rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.2rem;'>Mark what you have and pick proxies for gaps.</p>", unsafe_allow_html=True)

if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 2

analysis_types = st.session_state.get("analysis_type", [])

nav_col1, nav_col2 = st.columns([1, 1])
with nav_col1:
    if st.button("⬅️ Previous Step", use_container_width=True):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
with nav_col2:
    if st.button("Next Step ➡️", type="primary", use_container_width=True):
        st.switch_page("pages/3_Confidence_and_Recommendations.py")

if not analysis_types:
    st.warning("Select at least one analysis type in Step 1 to see the required inputs.")
    st.stop()

filtered_items = get_filtered_data_items(analysis_types)

if "data_inputs" not in st.session_state:
    st.session_state.data_inputs = {}
if "selected_proxies" not in st.session_state:
    st.session_state.selected_proxies = {}

for _, items in filtered_items.items():
    for item in items:
        st.session_state.data_inputs.setdefault(item["key"], False)
        st.session_state.selected_proxies.setdefault(item["key"], None)

total_items = sum(len(items) for items in filtered_items.values())
available_items = sum(
    1 for items in filtered_items.values() for item in items if st.session_state.data_inputs.get(item["key"], False)
)
proxy_items = sum(
    1
    for items in filtered_items.values()
    for item in items
    if not st.session_state.data_inputs.get(item["key"], False)
    and st.session_state.selected_proxies.get(item["key"]) is not None
)
missing_items = max(0, total_items - available_items - proxy_items)

met_col1, met_col2, met_col3 = st.columns(3)
with met_col1:
    st.metric("Available", f"{available_items}/{total_items}")
with met_col2:
    st.metric("Using proxy", proxy_items)
with met_col3:
    st.metric("Missing", missing_items)

abbrev = {
    "Energy & Carbon Performance": "E&C",
    "Renewable Energy & Local Production": "RE&LP",
    "Climate Resilience": "CR",
}

for category, items in filtered_items.items():
    st.markdown(f"### {category}")
    for item in items:
        info_parts = []
        analyses_meta = item.get("analyses", {"required_in": [], "optional_in": []})
        if analyses_meta["required_in"]:
            codes = [abbrev.get(a, a) for a in analyses_meta["required_in"]]
            info_parts.append(f"<span style='color:#059669; font-weight:600;'>Required: {', '.join(codes)}</span>")
        if analyses_meta["optional_in"]:
            codes = [abbrev.get(a, a) for a in analyses_meta["optional_in"]]
            info_parts.append(f"<span style='color:#2563eb; font-weight:600;'>Optional: {', '.join(codes)}</span>")
        badge = f"<span style='font-size:0.75rem; color:#475569;'>({' | '.join(info_parts)})</span>" if info_parts else ""

        st.markdown(
            f"<p style='font-weight:600; margin-bottom:0.2rem; color:#334155;'>{item['label']} {badge}</p>",
            unsafe_allow_html=True,
        )

        col_radio, col_proxy = st.columns([1, 2])

        with col_radio:
            current_has = st.session_state.data_inputs[item["key"]]
            choice = st.radio(
                "Data available?",
                ["Yes", "No"],
                index=0 if current_has else 1,
                key=f"radio_{item['key']}",
                horizontal=True,
                label_visibility="collapsed",
            )
            st.session_state.data_inputs[item["key"]] = choice == "Yes"

        has_data = st.session_state.data_inputs[item["key"]]

        with col_proxy:
            if has_data:
                st.success("Data available")
                st.session_state.selected_proxies[item["key"]] = None
            elif "proxy_tiers" in item:
                proxy_options = ["None (missing)"]
                for tier_key in sorted(item["proxy_tiers"].keys()):
                    tier_num = tier_key.replace("tier", "")
                    info = item["proxy_tiers"][tier_key]
                    proxy_options.append(f"Tier {tier_num}: {info['name']} ({info['confidence_impact']}%)")

                selected = st.selectbox(
                    "Use proxy:",
                    options=proxy_options,
                    key=f"proxy_select_{item['key']}",
                    label_visibility="visible",
                )

                if selected != "None (missing)":
                    tier_num = selected.split(":")[0].replace("Tier", "").strip()
                    st.session_state.selected_proxies[item["key"]] = item["proxy_tiers"][f"tier{tier_num}"]
                else:
                    st.session_state.selected_proxies[item["key"]] = None

        if not has_data and "proxy_tiers" in item:
            selected_proxy = st.session_state.selected_proxies.get(item["key"])
            if selected_proxy:
                st.info(
                    f"{selected_proxy['name']} • Impact {selected_proxy['confidence_impact']}% • Uncertainty {selected_proxy['uncertainty']}",
                    icon="ℹ️",
                )
            else:
                st.warning("No proxy selected for this missing input.")

        st.markdown("<div style='border-bottom:1px solid #e2e8f0; margin:0.5rem 0'></div>", unsafe_allow_html=True)

bottom_nav1, bottom_nav2 = st.columns([1, 1])
with bottom_nav1:
    if st.button("⬅️ Back to Step 1", use_container_width=True, key="back_bottom"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
with bottom_nav2:
    if st.button("Next: Confidence ➡️", type="primary", use_container_width=True, key="next_bottom"):
        st.switch_page("pages/3_Confidence_and_Recommendations.py")
