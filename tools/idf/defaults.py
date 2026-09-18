"""
defaults.py - fallback constants for the shoebox IDF generator, used whenever
a building's own record is missing a value the real TABULA/EPC data would
otherwise supply (e.g. Sweden's buildings.json has no per-building SHGC or
window-to-wall-ratio field at all).
"""
from __future__ import annotations

import math

FLOOR_HEIGHT_M = 3.2  # matches buildings.json's own floors-from-height convention

# Envelope U-values (W/m2K), used only when the building record's own
# tabula_u_* field is null.
DEFAULT_U_WALL = 0.40
DEFAULT_U_ROOF = 0.30
DEFAULT_U_WIN = 1.80
DEFAULT_U_FLOOR = 0.40  # uninsulated slab-on-grade approximation ("Ground" boundary)

DEFAULT_SHGC = 0.60

# Window-to-wall ratio by use_cat, applied to every exterior wall when no
# saved WWR-tool estimate exists for a building.
DEFAULT_WWR_BY_USE: dict[str, float] = {
    "bostad_enfamilj": 0.15,
    "bostad_flerfamilj": 0.20,
    "verksamhet": 0.30,
    "samhalle": 0.25,
    "industri": 0.08,
    "ovrigt": 0.15,
    "komplement": 0.08,
}
DEFAULT_WWR_FALLBACK = 0.15

# ASHRAE-typical film resistances (m2K/W), folded into each Material:NoMass's
# thermal resistance so tabula_u_* (a whole-assembly U-value) isn't double
# counted against EnergyPlus's own surface film calculation. Applied
# uniformly to wall/roof/floor - a deliberate shoebox-level simplification,
# not per-surface-type film coefficients.
R_SI = 0.13  # internal surface resistance
R_SE = 0.04  # external surface resistance
MIN_LAYER_R = 0.01  # floor for Material:NoMass resistance, avoids <=0 inputs

# Internal gains by use_cat: floor area per person (m2), lighting/equipment
# (W/m2). Applied to a building's TOTAL floor area (floors x footprint_m2),
# not just the footprint - the shoebox is one thermal zone spanning the
# building's full real height regardless of actual floor count, so intensity
# x footprint alone would understate a multi-storey building's real
# occupancy/equipment load by a factor of its floor count.
_RESIDENTIAL = {"m2_per_person": 35.0, "lighting_w_m2": 5.0, "equipment_w_m2": 4.0, "schedule": "residential"}
_COMMERCIAL = {"m2_per_person": 15.0, "lighting_w_m2": 10.0, "equipment_w_m2": 10.0, "schedule": "commercial"}
_CIVIC = {"m2_per_person": 8.0, "lighting_w_m2": 9.0, "equipment_w_m2": 6.0, "schedule": "commercial"}
_LOW_USE = {"m2_per_person": 100.0, "lighting_w_m2": 3.0, "equipment_w_m2": 2.0, "schedule": "other"}

INTERNAL_GAINS_BY_USE: dict[str, dict] = {
    "bostad_enfamilj": _RESIDENTIAL,
    "bostad_flerfamilj": _RESIDENTIAL,
    "verksamhet": _COMMERCIAL,
    "samhalle": _CIVIC,
    "industri": _LOW_USE,
    "ovrigt": _LOW_USE,
    "komplement": _LOW_USE,
}
DEFAULT_INTERNAL_GAINS = _LOW_USE

# ── Domestic hot water ───────────────────────────────────────────────────
# The shoebox models DHW as a stand-alone WaterHeater:Mixed drawing
# DistrictHeatingWater, so EnergyPlus reports it under the "Water Systems"
# end use alongside Heating/Lighting/Equipment.
#
# BE HONEST ABOUT WHAT THIS IS: EnergyPlus does not *predict* hot-water use,
# it plays back the draw profile we hand it. The annual figure out is the
# annual figure in - a standard assumption, not a simulation result. Its
# value is that the building's total energy then covers the same end uses as
# a Swedish energideklaration (which includes tappvarmvatten), so the two are
# finally comparable; before this, our totals were structurally low.
#
# Intensities are Sveby "Brukarindata" standard values (kWh per m2 Atemp per
# year). The 25 for dwellings is corroborated by the national EPC register:
# Goteborg's 72,133 declared hot-water figures have a median of 23.6
# (p25 14.9, p75 25.0). Includes circulation (VVC) losses, which is why the
# water heater below is modelled with no separate standby loss.
DHW_KWH_M2_YR_BY_USE: dict[str, float] = {
    "bostad_enfamilj": 25.0,
    "bostad_flerfamilj": 25.0,
    "verksamhet": 2.0,      # Sveby kontor - washrooms only
    "samhalle": 10.0,       # schools/care: showers + commercial kitchens
    "industri": 2.0,
    "ovrigt": 2.0,
    "komplement": 0.0,      # garages/sheds: no hot water at all
}
DEFAULT_DHW_KWH_M2_YR = 2.0
# NOTE: the UK datasets reuse this same use_cat taxonomy, so UK buildings get
# the Swedish Sveby intensities too. For dwellings the magnitude is close
# enough for screening, but it is a Swedish standard applied to UK stock -
# swap in SAP/BREDEM figures if UK results ever need defending on their own.

DHW_SUPPLY_TEMP_C = 55.0      # BBR minimum at the tap to control legionella
DHW_DEADBAND_K = 2.0
# The tank cycles across the deadband rather than sitting exactly on setpoint,
# so water leaves at the MEAN tank temperature (setpoint - deadband/2), not at
# setpoint. Sizing the draw on the setpoint therefore under-delivers by
# deadband/(2*dT) - measured at 2.3% against a real EnergyPlus run before this
# was accounted for. The generator sizes on the mean instead, which removes it.
DHW_COLD_TEMP_C = 10.0        # incoming mains, Swedish annual mean
# Fixed rather than left blank on purpose: blank makes EnergyPlus use the
# site's own varying mains temperature, which would drift the annual total
# away from the intensity we are calibrating to.

# Daily draw profile (fraction of peak): morning and evening peaks, the
# classic residential tapping pattern. The generator derives the peak flow
# rate from this profile's own annual mean, so editing the shape here keeps
# the annual total on target automatically.
DHW_DAY_PATTERN: list[tuple[str, float]] = [
    ("06:00", 0.20), ("08:00", 1.00), ("11:00", 0.40),
    ("17:00", 0.30), ("21:00", 0.90), ("24:00", 0.30),
]

WATER_DENSITY_KG_M3 = 1000.0
WATER_SPECIFIC_HEAT_J_KGK = 4186.0

HEATING_SETPOINT_C = 21.0
COOLING_SETPOINT_C = 25.0

# UK homes (country "gb", residential use) follow SAP 10.2's standard heating
# pattern instead of continuous 21 °C (the Gothenburg default above):
#   - demand temperature 21 °C in the living area, 18 °C elsewhere (SAP Table 9);
#     the single-zone shoebox uses the area-weighted mean with a typical
#     living-area fraction of 0.3 (SAP Table 27 gives 0.2-0.35 by room count),
#   - heating periods: weekdays 07:00-09:00 and 16:00-23:00 (9 h), weekends
#     07:00-23:00 (16 h) (SAP Table 9),
#   - outside those hours heating is off; a 10 °C frost setback stands in for
#     "off" so an unheated zone can't free-fall unrealistically.
UK_SAP_LIVING_AREA_FRACTION = 0.3
# CALIBRATED (tools/uk/calibrate_rotherham.py, 2026-09-17) against DESNZ 2024
# metered postcode gas: gas-boiler model at the heated (EPC) floor area, boiler
# efficiency from each EPC's heating rating. SAP's area-weighted demand
# temperature (18.9 °C) is kept; only infiltration is fitted. Held-out 60
# houses: simulated space-heating gas / (0.75 x metered median) = 1.03 median,
# interquartile 0.85-1.39, 53% within +/-25% (SAP defaults 0.5 ACH: 0.61, 22%).
# 1.25 ACH is high for real airtightness, and it did NOT come down once the
# uninsulated-wall corrections below were added: refitting the two jointly
# (tools/uk/calibrate_wall_factor.py) still picked 1.25 over 1.0 and 0.75. So it
# is not standing in for the wall error - it is the whole-model ventilation term,
# and in a single-zone shoebox with no mechanical ventilation, no chimney and no
# purpose-provided vents it absorbs every air-movement loss at once. Treat it as
# a calibration constant for this model, not as a measurable air change rate.
UK_SAP_HEATING_C = round(UK_SAP_LIVING_AREA_FRACTION * 21.0 + (1 - UK_SAP_LIVING_AREA_FRACTION) * 18.0, 1)
UK_INFILTRATION_ACH = 1.25
UK_SAP_SETBACK_C = 10.0
# ── Poorly insulated UK homes: two separate corrections ──────────────────
# Certificates describe an uninsulated wall with a GENERIC DEFAULT (solid brick
# 2.0, unfilled cavity 1.5 W/m2K), not a measurement. Against DESNZ metered gas
# those houses came out 1.5-2.2x over-predicted while insulated-wall houses sat
# at 1.0 - so the model loses too much heat through exactly the walls a retrofit
# tool is asked about. Two DIFFERENT things cause that, and they are kept apart
# on purpose because they behave differently after a retrofit:
#
# 1. FABRIC. In-situ U-value measurements of solid walls come out well below the
#    RdSAP default (Rye & Scott, SPAB Research Report 1, 2011: measured means
#    ~1.3-1.6 against an assumed 2.1; BRE/Leeds Beckett in-situ surveys agree).
#    A 0.7 factor sits inside that measured range. NOT fitted - fitting it is
#    what the note below warns against.
# 2. BEHAVIOUR (the "prebound effect"). Households in poor-fabric homes heat to
#    lower temperatures and heat fewer rooms than any standard schedule assumes;
#    measured consumption in such homes runs ~30% below calculated (Sunikka-Blank
#    & Galvin, Building Research & Information 40(3), 2012). This is modelled as
#    a drop in the SAP demand temperature for these homes only - CALIBRATED
#    (tools/uk/calibrate_wall_factor.py).
#
# WHY NOT ONE FITTED FACTOR: fitting a single wall factor to the meters put the
# optimum at 0.3-0.5 with accuracy FLAT across that whole range (held-out mean
# abs log error 0.309-0.313, against 0.369 uncorrected). At 0.3 a solid brick
# wall becomes 0.6 W/m2K - better than a filled cavity, i.e. physically absurd.
# The meters cannot separate "this wall loses less heat" from "this house is
# heated less", so the split above is made on published evidence instead of on
# the fit, and only the behavioural half is calibrated.
#
# This matters for savings, not just for the baseline: a wall-insulation measure
# states its own U-value, so correcting the baseline downwards shrinks the
# predicted saving for solid-wall homes - which is the direction real evaluations
# report (measured savings from solid-wall insulation typically fall well short
# of calculated ones).
#
# RESULT on the 60 held-out houses (half of them uninsulated-wall by design),
# against 0.75 x the DESNZ postcode median gas meter:
#                       uncorrected   0.7 + 2 K
#   mean abs log error      0.369        0.302
#   within +/-25%             47%          53%
#   median, uninsulated      1.54         1.05
#   median, insulated        0.93         0.93   (unchanged - nothing applies here)
# The 2 K drop is not sharply identified: 2 K and 3 K score the same within
# noise (the calibration half narrowly prefers 3 K, the held-out half 2 K), so
# the tie is broken on measured internal temperatures rather than on the fit -
# 2 K puts these homes at 16.9 C while heating, 3 K at 15.9 C, below what field
# surveys of the English stock report.
UK_UNINSULATED_WALL_U_THRESHOLD = 1.0
UK_UNINSULATED_WALL_FACTOR = 0.7
UK_PREBOUND_SETPOINT_DROP_K = 2.0

# Seasonal efficiency of an existing gas boiler when the certificate gives none
# (typical in-use value; the metered-gas calibration also used 0.85).
UK_BOILER_EFFICIENCY = 0.85
# Hourly outputs read back from EPSM's hourly_timeseries for the gas-boiler plant.
GAS_BOILER_OUTPUT_VARIABLES = [
    "Water Heater NaturalGas Energy",
    "Water Heater Heating Energy",
    "Boiler NaturalGas Energy",
    "Boiler Heating Energy",
    "Baseboard Total Heating Energy",
    "Pump Electricity Energy",
]
def uk_sap_dhw_kwh_per_dwelling(tfa_m2: float) -> float:
    """Annual hot-water heat (kWh) for one dwelling, SAP 2012 Appendix J:
      occupancy N = 1 + 1.76(1 - exp(-0.000349 (TFA-13.9)^2)) + 0.0013 (TFA-13.9)  (TFA > 13.9, else 1)
      daily volume V = 25 N + 36 litres
      energy content = 4.190 x V x 365 x dT / 3600, dT = 37.0 K (annual mean of Table J1)
      plus distribution loss 15% of the energy content.
    Storage/combi losses are left to the heater efficiency."""
    n = 1.0 if tfa_m2 <= 13.9 else (1 + 1.76 * (1 - math.exp(-0.000349 * (tfa_m2 - 13.9) ** 2)) + 0.0013 * (tfa_m2 - 13.9))
    litres_day = 25 * n + 36
    content = 4.190 * litres_day * 365 * 37.0 / 3600
    return content * 1.15


UK_SAP_WEEKDAY_HEATING: list[tuple[str, float]] = [
    ("07:00", UK_SAP_SETBACK_C), ("09:00", UK_SAP_HEATING_C),
    ("16:00", UK_SAP_SETBACK_C), ("23:00", UK_SAP_HEATING_C), ("24:00", UK_SAP_SETBACK_C),
]
UK_SAP_WEEKEND_HEATING: list[tuple[str, float]] = [
    ("07:00", UK_SAP_SETBACK_C), ("23:00", UK_SAP_HEATING_C), ("24:00", UK_SAP_SETBACK_C),
]
ACTIVITY_LEVEL_W_PER_PERSON = 120.0
INFILTRATION_ACH = 0.5  # generic natural-infiltration default; no per-building airtightness data exists

# Output block copied verbatim (object types + Output:Variable names) from
# EPSM's own real building fixture (frontend/public/idf/test.idf in its
# repo) so its results parser - which keys off these exact names - recognizes
# our simulation's output. Do not "clean up" this list without re-diffing
# against that fixture.
OUTPUT_VARIABLE_NAMES = [
    "Baseboard Electricity Energy",
    "District Cooling Water Energy",
    "District Heating Water Energy",
    "Evaporative Cooler Electricity Energy",
    "Fan Electricity Energy",
    "Heating Coil Electricity Energy",
    "Heating Coil NaturalGas Energy",
    "Heating Coil Total Heating Energy",
    "Humidifier Electricity Energy",
    "Pump Electricity Energy",
    "Boiler Electricity Energy",
    "VRF Heat Pump Cooling Electricity Energy",
    "VRF Heat Pump Crankcase Heater Electricity Energy",
    "VRF Heat Pump Defrost Electricity Energy",
    "VRF Heat Pump Heating Electricity Energy",
    "Water Heater Electricity Energy",
    "Water Heater NaturalGas Energy",
    # Our DHW heater burns DistrictHeatingWater, so neither of the two above
    # ever fires. These two give the hourly trace behind the "Water Systems"
    # end use; runs made before they were added simply have no DHW series and
    # the load-profile chart reports it as unavailable rather than as zero.
    "Water Heater DistrictHeatingWater Energy",
    "Water Heater Heating Energy",
    "Water Use Equipment Heating Energy",
    "Zone Electric Equipment Electricity Energy",
    "Zone Gas Equipment NaturalGas Energy",
    "Zone Ideal Loads Supply Air Total Cooling Energy",
    "Boiler NaturalGas Energy",
    "Zone Ideal Loads Supply Air Total Heating Energy",
    "Zone Lights Electricity Energy",
    "Zone Other Equipment Lost Heat Energy",
    "Zone Other Equipment Total Heating Energy",
    "Zone VRF Air Terminal Cooling Electricity Energy",
    "Zone VRF Air Terminal Heating Electricity Energy",
    "Zone Ventilation Fan Electricity Energy",
    "Chiller Electricity Energy",
    "Chiller Heater System Cooling Electricity Energy",
    "Chiller Heater System Heating Electricity Energy",
    "Cooling Coil Electricity Energy",
    "Cooling Coil Water Heating Electricity Energy",
    "Cooling Tower Fan Electricity Energy",
]
