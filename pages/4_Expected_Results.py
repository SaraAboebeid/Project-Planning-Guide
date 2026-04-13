"""
Page 4: Expected Results

Displays the concrete report deliverables the client can expect,
specific to the selected analysis type(s) and focus/sub-types.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_confidence
from utils.shared_css import inject_shared_css, render_step_indicator, render_top_cards

st.set_page_config(page_title="Expected Results", layout="wide")

# Inject shared MD3 button / theme CSS
inject_shared_css()

# Hide the sidebar pages navigation
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
</style>
""", unsafe_allow_html=True)

# Persistent step progress indicator
render_step_indicator(4)

is_plus_mode = st.session_state.get("pipeline_mode") == "step1plus"
step1_page = "pages/0_Define_Project.py" if is_plus_mode else "pages/1_Define_Scope_and_Context.py"

# ============================================================================
# EXPECTED DELIVERABLES CATALOG
# ============================================================================

# Each entry: (deliverable name, short description)
DELIVERABLES = {
    # ── Energy & Carbon Performance ──────────────────────────────────────
    ("Energy & Carbon Performance", "Electricity"): [
        ("Annual Electricity Demand", "Total kWh consumption per year"),
        ("Monthly / Hourly Load Profile", "Electricity demand curves over time"),
        ("Peak Demand (kW)", "Maximum instantaneous electrical load"),
        ("Grid Emission Factor Impact", "CO₂ intensity of consumed grid electricity"),
        ("Operational Carbon Emissions", "Annual kgCO₂e from electricity use"),
        ("Energy Use Intensity (EUI)", "kWh/m² benchmarking metric"),
        ("Benchmarking vs Standards", "Comparison against local/national benchmarks"),
    ],
    ("Energy & Carbon Performance", "Heating/Cooling"): [
        ("Annual Heating Demand", "Total heating energy per year (kWh)"),
        ("Annual Cooling Demand", "Total cooling energy per year (kWh)"),
        ("Peak Heating / Cooling Load", "Design-day peak thermal loads (kW)"),
        ("Degree-Day Analysis", "HDD/CDD breakdown for the location"),
        ("System Efficiency Assessment", "COP / seasonal performance of H&C systems"),
        ("Operational Carbon from Heating & Cooling", "Annual kgCO₂e from thermal energy"),
        ("Energy Use Intensity (EUI)", "kWh/m² for heating and cooling"),
    ],
    ("Energy & Carbon Performance", "Whole system interaction"): [
        ("Total Annual Energy Demand", "All energy carriers combined (kWh)"),
        ("Energy Balance (all carriers)", "Electricity, heating, cooling, DHW breakdown"),
        ("Peak Demand Profile", "Combined peak demand across systems"),
        ("Total Operational Carbon", "Annual kgCO₂e from all energy use"),
        ("Embodied Carbon Estimate", "kgCO₂e from construction materials (indicative)"),
        ("Energy Use Intensity (EUI)", "kWh/m² across all systems"),
        ("Benchmarking vs Standards", "Comparison against local/national benchmarks"),
        ("Recommended Efficiency Measures", "Priority list of energy-saving interventions"),
    ],

    # ── Renewable Energy & Local Production ──────────────────────────────
    ("Renewable Energy & Local Production", "Solar PV"): [
        ("Incident Radiation Analysis", "Annual & seasonal solar irradiance maps (kWh/m²)"),
        ("Sun Hours Map", "Hours of direct sunlight per roof/façade surface"),
        ("Optimal PV Panel Placement & Coverage %", "Best tilt, azimuth, and usable area"),
        ("Energy Yield Estimate", "Annual PV production (kWh/yr)"),
        ("Self-Consumption Ratio", "Share of PV output consumed on-site"),
        ("Grid Export Profile", "Surplus electricity fed back to the grid"),
        ("ROI / Payback Period", "Return on investment and simple payback (years)"),
        ("LCOE (Levelized Cost of Energy)", "Cost per kWh produced over system lifetime"),
        ("Embodied Carbon of PV System", "kgCO₂e from panel manufacturing & installation"),
        ("Operational Carbon Savings", "Annual avoided kgCO₂e vs grid electricity"),
    ],
    ("Renewable Energy & Local Production", "Solar Thermal"): [
        ("Solar Thermal Yield", "Annual thermal energy collected (kWh/yr)"),
        ("Collector Sizing & Placement", "Optimal area, tilt, and orientation"),
        ("Hot Water / Heating Coverage %", "Share of DHW or space heating met by solar"),
        ("ROI / Payback Period", "Return on investment timeline"),
        ("Embodied Carbon", "kgCO₂e of collector system"),
    ],
    ("Renewable Energy & Local Production", "Onshore Wind"): [
        ("Wind Resource Assessment", "Mean wind speed, Weibull distribution at hub height"),
        ("Annual Energy Production (AEP)", "Expected kWh/yr from selected turbine(s)"),
        ("Turbine Siting Recommendations", "Optimal placement considering terrain & obstacles"),
        ("Capacity Factor", "Actual vs rated output ratio"),
        ("Noise & Visual Impact", "Predicted noise contours and visual assessment"),
        ("ROI / Payback Period", "Financial return timeline"),
        ("Embodied Carbon", "Lifecycle carbon of turbine & foundations"),
    ],
    ("Renewable Energy & Local Production", "Offshore Wind"): [
        ("Offshore Wind Resource Assessment", "Wind speed & direction at hub height"),
        ("Annual Energy Production (AEP)", "Expected kWh/yr from offshore turbine(s)"),
        ("Capacity Factor", "Actual vs rated output ratio"),
        ("ROI / Payback Period", "Financial return timeline"),
        ("Embodied Carbon", "Lifecycle carbon including subsea infrastructure"),
    ],
    ("Renewable Energy & Local Production", "Geothermal"): [
        ("Ground Temperature Profile", "Borehole temperature at depth"),
        ("Heat Pump Sizing", "Recommended capacity and configuration"),
        ("Annual Heating / Cooling Coverage", "Share of demand met by geothermal"),
        ("COP Estimate", "Seasonal coefficient of performance"),
        ("ROI / Payback Period", "Financial return timeline"),
        ("Embodied Carbon", "kgCO₂e from drilling and equipment"),
    ],
    ("Renewable Energy & Local Production", "Hydropower"): [
        ("Flow & Head Analysis", "Available water resource characterization"),
        ("Energy Yield Estimate", "Annual kWh from micro/small hydro"),
        ("Environmental Impact Assessment", "Ecological considerations"),
        ("ROI / Payback Period", "Financial return timeline"),
    ],
    ("Renewable Energy & Local Production", "Biomass"): [
        ("Fuel Availability Assessment", "Local biomass resource potential"),
        ("Energy Output Estimate", "Annual kWh thermal/electrical"),
        ("Emissions Profile", "Particulate, NOx, and CO₂ emissions"),
        ("ROI / Payback Period", "Financial return timeline"),
    ],
    ("Renewable Energy & Local Production", "Battery Storage"): [
        ("Optimal Battery Size", "Recommended capacity (kWh) and power (kW)"),
        ("Self-Consumption Improvement", "Increase in on-site use with storage"),
        ("Peak Shaving Potential", "Demand charge reduction estimate"),
        ("ROI / Payback Period", "Financial return timeline"),
        ("Embodied Carbon", "kgCO₂e from battery manufacturing"),
    ],

    # ── Climate Resilience ───────────────────────────────────────────────
    ("Climate Resilience", "Extreme Heat Analysis"): [
        ("Overheating Hours Analysis", "Hours above comfort thresholds per zone"),
        ("Indoor Temperature Exceedance", "Peak indoor temps under heat-wave scenarios"),
        ("Vulnerable Zone Mapping", "Rooms/areas most at risk of overheating"),
        ("Adaptive Capacity Assessment", "Effectiveness of passive/active cooling measures"),
        ("Future Climate Impact", "Projected overheating under SSP/RCP scenarios"),
    ],
    ("Climate Resilience", "Cooling Demand Impact"): [
        ("Future Cooling Demand Projections", "kWh increase under warming scenarios"),
        ("Peak Cooling Load Under Climate Scenarios", "Design-day load in 2050/2080"),
        ("HVAC Adequacy Assessment", "Whether current systems cope with future loads"),
        ("Cost Impact of Increased Cooling", "Estimated operational cost change"),
    ],
    ("Climate Resilience", "Flood Risk Assessment"): [
        ("Flood Risk Mapping", "Spatial flood hazard under different return periods"),
        ("Return Period Analysis", "Probability of flooding events"),
        ("Damage Potential Assessment", "Estimated damage to buildings and infrastructure"),
        ("Drainage Capacity Analysis", "Stormwater system adequacy"),
        ("Adaptation Recommendations", "SuDS, barriers, and design interventions"),
    ],
    ("Climate Resilience", "Wind & Ventilation Analysis"): [
        ("Wind Comfort Assessment", "Pedestrian-level wind conditions (Lawson criteria)"),
        ("Natural Ventilation Potential", "Achievable air change rates by wind-driven flow"),
        ("Pedestrian Wind Analysis", "Comfort and safety around buildings"),
        ("Pressure Distribution", "Surface pressure coefficients for design"),
    ],
    ("Climate Resilience", "Climate Projections"): [
        ("Temperature Trends (SSP/RCP)", "Mean and extreme temperature projections"),
        ("Precipitation Changes", "Rainfall intensity and pattern shifts"),
        ("Design Parameter Shifts", "Updated design temps, wind speeds, snow loads"),
        ("Building Lifetime Risk Profile", "Climate hazards over 30-60 year horizon"),
    ],

    # ── Urban Design Support ─────────────────────────────────────────────
    ("Urban Design Support", "Urban Heat Island"): [
        ("Urban Heat Island Intensity Map", "Temperature differential vs rural reference"),
        ("Hot-Spot Identification", "Most affected areas and surfaces"),
        ("Mitigation Strategy Assessment", "Cool roofs, green infrastructure, albedo"),
        ("Scenario Comparison", "Before/after intervention modeling"),
    ],
    ("Urban Design Support", "Traffic & Congestion"): [
        ("Traffic Flow Analysis", "Vehicle counts, peak-hour LOS"),
        ("Congestion Mapping", "Bottleneck identification"),
        ("Active Mobility Assessment", "Cycling and pedestrian infrastructure gaps"),
        ("Intervention Recommendations", "Signal timing, lane allocation, mode shift"),
    ],
    ("Urban Design Support", "Noise"): [
        ("Noise Level Mapping", "dB contours from traffic, industry, construction"),
        ("Façade Noise Exposure", "Noise levels at building surfaces"),
        ("Mitigation Measures", "Barriers, setbacks, building orientation"),
    ],
    ("Urban Design Support", "Parking Studies"): [
        ("Parking Demand Forecast", "Required spaces based on use and location"),
        ("Utilization Analysis", "Occupancy rates and turnover"),
        ("Optimization Recommendations", "Shared parking, pricing, EV charging"),
    ],
    ("Urban Design Support", "Accessibility"): [
        ("Accessibility Audit", "Compliance with universal design standards"),
        ("Barrier Mapping", "Physical barriers to movement"),
        ("Improvement Recommendations", "Priority interventions for inclusive design"),
    ],
    ("Urban Design Support", "Amenities Demand"): [
        ("Amenities Gap Analysis", "Under-served areas and service gaps"),
        ("Demand Forecasting", "Population-based amenity needs"),
        ("Planning Recommendations", "Optimal locations for new amenities"),
    ],
    ("Urban Design Support", "Ecosystem & Habitat"): [
        ("Green Infrastructure Assessment", "Tree canopy, green space coverage"),
        ("Habitat Connectivity Analysis", "Ecological corridors and fragmentation"),
        ("Biodiversity Net Gain Estimate", "BNG metric calculation"),
        ("Enhancement Recommendations", "Planting, rewilding, green roofs"),
    ],

    # ── Retrofit & Transformation ────────────────────────────────────────
    ("Retrofit & Transformation", None): [
        ("Building Condition Assessment", "Current state of fabric, systems, and services"),
        ("Energy Performance Baseline", "Current EUI and carbon intensity"),
        ("Retrofit Measure Catalog", "Prioritized list of improvement interventions"),
        ("Energy Savings Potential", "kWh and % reduction per measure"),
        ("Carbon Reduction Pathway", "kgCO₂e savings per intervention"),
        ("Cost-Benefit Analysis", "CAPEX, payback, NPV per measure"),
        ("EPC / Certification Impact", "Predicted rating improvement"),
        ("Embodied Carbon of Retrofit", "kgCO₂e from new materials and works"),
    ],

    # ── Infrastructure Planning ──────────────────────────────────────────
    ("Infrastructure Planning", None): [
        ("Infrastructure Capacity Assessment", "Current load vs capacity headroom"),
        ("Demand Growth Projections", "Future energy, water, transport demand"),
        ("Network Gap Analysis", "Under-served areas and bottlenecks"),
        ("Capital Investment Requirements", "Infrastructure upgrade cost estimates"),
        ("Phased Implementation Plan", "Priority and sequencing of interventions"),
    ],

    # ── Equity & Social Impact ───────────────────────────────────────────
    ("Equity & Social Impact", None): [
        ("Demographic Vulnerability Mapping", "Populations most at risk"),
        ("Energy Poverty Assessment", "Fuel cost burden and affordability analysis"),
        ("Accessibility & Inclusion Audit", "Barriers to equitable access"),
        ("Social Impact Scoring", "Quantified equity metrics per intervention"),
        ("Recommendations for Equitable Design", "Priority actions for inclusive outcomes"),
    ],
}

# Cross-cutting deliverables appended to every analysis
CROSS_CUTTING = [
    ("Executive Summary", "High-level findings and recommendations for decision-makers"),
    ("Limitations & Assumptions", "Methodology caveats, data gaps, and proxy impacts"),
    ("Methodology Statement", "Tools, standards, and data sources used"),
]


def _get_deliverables(analysis_types, focus, renewable_types, urban_design_types,
                      climate_resilience_types):
    """Return a list of (section_title, deliverables_list) tuples."""
    sections = []

    for atype in analysis_types:
        if atype == "Energy & Carbon Performance":
            key = (atype, focus)
            if key in DELIVERABLES:
                sections.append((f"{atype} — {focus}", DELIVERABLES[key]))
            else:
                # Fallback to Whole system if focus missing
                fallback = (atype, "Whole system interaction")
                sections.append((atype, DELIVERABLES.get(fallback, [])))

        elif atype == "Renewable Energy & Local Production":
            for rtype in (renewable_types or []):
                key = (atype, rtype)
                if key in DELIVERABLES:
                    sections.append((f"{atype} — {rtype}", DELIVERABLES[key]))

        elif atype == "Climate Resilience":
            for ctype in (climate_resilience_types or []):
                key = (atype, ctype)
                if key in DELIVERABLES:
                    sections.append((f"{atype} — {ctype}", DELIVERABLES[key]))

        elif atype == "Urban Design Support":
            for utype in (urban_design_types or []):
                key = (atype, utype)
                if key in DELIVERABLES:
                    sections.append((f"{atype} — {utype}", DELIVERABLES[key]))

        else:
            # Retrofit, Infrastructure, Equity — no sub-types
            key = (atype, None)
            if key in DELIVERABLES:
                sections.append((atype, DELIVERABLES[key]))

    return sections


# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("Please complete Step 1 first.")
    if st.button("Go to Step 1"):
        st.switch_page(step1_page)
    st.stop()

# ============================================================================
# GET SESSION STATE
# ============================================================================

analysis_type = st.session_state.get("analysis_type", [])
if isinstance(analysis_type, str):
    analysis_type = [analysis_type]
analysis_type_str = analysis_type[0] if analysis_type else "None"

analysis_focus = st.session_state.get("analysis_focus") or st.session_state.get("energy_system_focus", "")
analysis_scale = st.session_state.get("analysis_scale") or st.session_state.get("project_scale", "")
analysis_context = st.session_state.get("analysis_context") or st.session_state.get("country", "")
renewable_types = st.session_state.get("renewable_types", [])
urban_design_types = st.session_state.get("urban_design_types", [])
climate_resilience_types = st.session_state.get("climate_resilience_types", [])

# ============================================================================
# REBUILD DATA FROM EARLIER STEPS (for card counts)
# ============================================================================

data_inputs = get_data_inputs(
    analysis_type, analysis_focus, analysis_scale, analysis_context,
    renewable_types, urban_design_types, climate_resilience_types
)

# ── Read persisted choices from Step 2 ──────────────────────────────
# Page 2 saves a plain dict (not widget keys) to session state so that
# the data-availability selections survive page navigation.
step2_choices = st.session_state.get("step2_data_choices", {})

# Count available / missing
all_items = []
for cat in (data_inputs or []):
    all_items.extend(cat["items"])
total_count = len(all_items)

available_count = 0
missing_count = 0
for item in all_items:
    choice = step2_choices.get(item["key"], {})
    has_data = choice.get("has_data", "Yes")
    if has_data == "Yes":
        available_count += 1
    else:
        missing_count += 1

data_coverage_pct = (available_count / total_count * 100) if total_count > 0 else 0

# ============================================================================
# BUILD DELIVERABLES
# ============================================================================

sections = _get_deliverables(
    analysis_type, analysis_focus, renewable_types,
    urban_design_types, climate_resilience_types
)

total_deliverables = sum(len(items) for _, items in sections) + len(CROSS_CUTTING)

# ============================================================================
# PAGE HEADER
# ============================================================================

st.markdown(
    "<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; letter-spacing:-0.01em; margin-bottom:0.5rem;'>"
    "Step 4: Expected Results</h2>",
    unsafe_allow_html=True
)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>"
    "These are the deliverables that will be included in the final report, "
    "based on your selected analysis type and focus.</p>",
    unsafe_allow_html=True
)

# Context bar
context_info = f"<span style='font-size:0.88rem; color:#475569;'><b>Analysis:</b> {analysis_type_str}"
if analysis_focus:
    context_info += f" / <b>{analysis_focus}</b>"
if analysis_scale:
    context_info += f" | <b>Scale:</b> {analysis_scale}"
if analysis_context:
    context_info += f" | <b>Context:</b> {analysis_context}"
context_info += "</span>"
st.markdown(context_info, unsafe_allow_html=True)

# ============================================================================
# SUMMARY CARDS
# ============================================================================

render_top_cards([
    {"value": str(total_deliverables), "label": "Report Deliverables",
     "color": "#33528A", "bg": "rgba(51,82,138,0.10)", "border": "rgba(51,82,138,0.25)"},
    {"value": str(len(sections)), "label": "Analysis Sections",
     "color": "#33A9A0", "bg": "rgba(51,169,160,0.10)", "border": "rgba(51,169,160,0.25)"},
    {"value": f"{data_coverage_pct:.0f}%", "label": "Data Coverage",
     "color": "#8AB62E", "bg": "rgba(138,182,46,0.10)", "border": "rgba(138,182,46,0.25)"},
])

# ============================================================================
# DELIVERABLES BY SECTION
# ============================================================================

if not sections:
    st.warning(
        "No deliverables mapped for this analysis combination yet. "
        "The deliverables catalog will be expanded — please proceed to Step 5."
    )
else:
    for section_title, items in sections:
        with st.expander(f"{section_title}  ({len(items)} deliverables)", expanded=True):
            for name, description in items:
                st.markdown(
                    f"<div style='display:flex; align-items:flex-start; gap:10px; "
                    f"padding:8px 12px; margin-bottom:4px; "
                    f"background:#f8fafc; border-radius:8px; border-left:3px solid #33A9A0;'>"
                    f"<div>"
                    f"<div style='font-weight:600; font-size:0.95rem; color:#1e293b;'>{name}</div>"
                    f"<div style='font-size:0.85rem; color:#64748b;'>{description}</div>"
                    f"</div>"
                    f"</div>",
                    unsafe_allow_html=True
                )

# ── Cross-cutting deliverables ──
with st.expander(f"Cross-Cutting Deliverables  ({len(CROSS_CUTTING)} items)", expanded=False):
    for name, description in CROSS_CUTTING:
        st.markdown(
            f"<div style='display:flex; align-items:flex-start; gap:10px; "
            f"padding:8px 12px; margin-bottom:4px; "
            f"background:#f8fafc; border-radius:8px; border-left:3px solid #94a3b8;'>"
            f"<div>"
            f"<div style='font-weight:600; font-size:0.95rem; color:#1e293b;'>{name}</div>"
            f"<div style='font-size:0.85rem; color:#64748b;'>{description}</div>"
            f"</div>"
            f"</div>",
            unsafe_allow_html=True
        )

# ============================================================================
# DATA COVERAGE NOTE
# ============================================================================

st.markdown(
    "<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

if missing_count > 0:
    st.info(
        f"**Note:** {missing_count} of {total_count} data inputs are currently "
        f"using proxy data. This may affect the precision of some deliverables above. "
        f"Review Step 2 and Step 3 for details."
    )
else:
    st.success("All data inputs are available — deliverables will be produced at full confidence.")

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3, col4 = st.columns([1, 1, 1, 2])

with col1:
    if st.button("Home", use_container_width=True, key="s4_home"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Back", use_container_width=True):
        st.switch_page("pages/3_Analysis_Method.py")

with col3:
    if st.button("Continue", type="primary", use_container_width=True):
        st.switch_page("pages/5_Project_Timeline.py")

with col4:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
        "Step 4 of 6</div>",
        unsafe_allow_html=True
    )
