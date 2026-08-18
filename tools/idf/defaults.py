"""
defaults.py - fallback constants for the shoebox IDF generator, used whenever
a building's own record is missing a value the real TABULA/EPC data would
otherwise supply (e.g. Sweden's buildings.json has no per-building SHGC or
window-to-wall-ratio field at all).
"""
from __future__ import annotations

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
