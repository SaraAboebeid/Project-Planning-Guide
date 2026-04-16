"""
Unified data-requirements registry for Renovation Planning.

Each data input is mapped to:
- potential sources (EPC field, TABULA field, synthetic generation, user upload)
- confidence weight (how much it affects overall analysis accuracy)
- category grouping for display

The main entry point is ``assess_coverage(passport, tabula_match, ...)``
which returns the full list with live status for each input.
"""

from __future__ import annotations

# ────────────────────────────────────────────────────────────────────
# DATA REQUIREMENT DEFINITIONS
# ────────────────────────────────────────────────────────────────────
# Each tuple:
#   (key, label, category, epc_field, tabula_field,
#    synthetic_possible, confidence_weight, unit)
#
# epc_field / tabula_field: the dict key to look up in the EPC passport
# or TABULA archetype dict.  ``None`` means not available from that source.
# synthetic_possible: True if a synthetic proxy can be generated when missing.

_REQUIREMENTS: list[tuple] = [
    # ── Building Identity ───────────────────────────────────────────
    ("construction_year",   "Construction year",       "Building Identity",
     "EgenNybyggAr",  "period",  False, 5, "year"),
    ("building_type",       "Building type",           "Building Identity",
     "EgenByggnadsTyp", "type_label", False, 3, ""),
    ("building_category",   "Building category",       "Building Identity",
     "EgenByggnadsKat", None, False, 2, ""),
    ("num_floors",          "Number of floors",        "Building Identity",
     "EgenAntalPlan",  None, False, 4, "floors"),
    ("num_apartments",      "Number of apartments",    "Building Identity",
     "EgenAntalBolgh", None, False, 2, "units"),
    ("atemp",               "Heated floor area (Atemp)","Building Identity",
     "EgenAtemp",      "areas.total", False, 8, "m²"),

    # ── Energy Performance ──────────────────────────────────────────
    ("energy_class",        "Energy class",            "Energy Performance",
     "EgiEnergiklass", None, False, 4, ""),
    ("energy_performance",  "Energy performance (kWh/m²)", "Energy Performance",
     "EgiEnergiPrestanda", None, False, 7, "kWh/m²"),
    ("specific_energy_use", "Specific energy use",     "Energy Performance",
     "EgiSpecifikEnergianvandning", None, False, 6, "kWh/m²"),
    ("primary_energy",      "Primary energy use",      "Energy Performance",
     "EgiPrimarenergianvandning", None, False, 5, "kWh/m²"),
    ("heating_demand",      "Annual heating demand",   "Energy Performance",
     None, "energy_demand_net", True, 7, "kWh/m²"),
    ("hourly_energy",       "Hourly energy profile",   "Energy Performance",
     None, None, True, 10, "kWh"),

    # ── Building Envelope ───────────────────────────────────────────
    ("u_wall",    "Wall U-value",    "Building Envelope",
     None, "u_values.wall",   False, 6, "W/m²K"),
    ("u_roof",    "Roof U-value",    "Building Envelope",
     None, "u_values.roof",   False, 5, "W/m²K"),
    ("u_floor",   "Floor U-value",   "Building Envelope",
     None, "u_values.floor",  False, 5, "W/m²K"),
    ("u_window",  "Window U-value",  "Building Envelope",
     None, "u_values.window", False, 6, "W/m²K"),
    ("u_door",    "Door U-value",    "Building Envelope",
     None, "u_values.door",   False, 3, "W/m²K"),

    # ── Geometry & Areas ────────────────────────────────────────────
    ("wall_area",   "Wall area",     "Geometry & Areas",
     None, "areas.wall",   True, 5, "m²"),
    ("roof_area",   "Roof area",     "Geometry & Areas",
     None, "areas.roof",   True, 5, "m²"),
    ("floor_area",  "Floor area",    "Geometry & Areas",
     None, "areas.floor",  True, 5, "m²"),
    ("window_area", "Window area",   "Geometry & Areas",
     None, "areas.window", True, 4, "m²"),

    # ── Systems ─────────────────────────────────────────────────────
    ("heating_system",      "Heating system type",     "Systems",
     "energy_systems", None, False, 4, ""),
    ("ventilation_type",    "Ventilation type",        "Systems",
     "ventilation_modes", None, False, 4, ""),

    # ── Materials & Cost ────────────────────────────────────────────
    ("material_options",    "Renovation material options", "Materials & Cost",
     None, None, False, 6, ""),
    ("material_gwp",        "Material GWP data",       "Materials & Cost",
     None, None, False, 7, "kg CO₂ eq."),
    ("material_pricing",    "Material unit pricing",   "Materials & Cost",
     None, None, False, 5, "SEK"),
]

# Boverket-provided data (always available when API is reachable)
_BOVERKET_KEYS = {"material_options", "material_gwp"}

# Wikells pricing (placeholder — mark as known-available when we integrate)
_WIKELLS_KEYS = {"material_pricing"}


# ────────────────────────────────────────────────────────────────────
# HELPERS
# ────────────────────────────────────────────────────────────────────

def _resolve_nested(d: dict | None, dotpath: str | None):
    """Resolve a dot-separated key path like 'u_values.wall' in a dict."""
    if d is None or dotpath is None:
        return None
    parts = dotpath.split(".")
    cur = d
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


def _is_present(value) -> bool:
    """Return True if the value is non-empty / non-null."""
    if value is None:
        return False
    s = str(value).strip().lower()
    return s not in {"", "<na>", "nan", "none", "0", "0.0"}


# ────────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ────────────────────────────────────────────────────────────────────

def assess_coverage(
    passport: dict | None = None,
    tabula_match: dict | None = None,
    boverket_available: bool = True,
    wikells_available: bool = False,
    envelope_components: list[str] | None = None,
) -> list[dict]:
    """Assess data coverage for each requirement.

    Returns a list of dicts, one per requirement, with keys:
        key, label, category, unit, confidence_weight,
        status  ("covered" | "available_synthetic" | "missing"),
        source  ("EPC" | "TABULA" | "Boverket" | "Wikells" | "Synthetic" | None),
        value   (the actual value if covered, else None),
    """
    passport = passport or {}
    results = []

    for (key, label, category, epc_field, tabula_field,
         synthetic_ok, weight, unit) in _REQUIREMENTS:

        # Skip envelope items not in scope
        if key.startswith("u_") or key.endswith("_area"):
            comp_name = key.replace("u_", "").replace("_area", "").capitalize()
            if comp_name == "Window":
                comp_name = "Windows"
            elif comp_name == "Wall":
                comp_name = "Walls"
            elif comp_name == "Roof":
                comp_name = "Roof"
            elif comp_name == "Floor":
                comp_name = "Floor"
            elif comp_name == "Door":
                comp_name = "Doors"
            # Don't filter if no envelope_components specified
            if envelope_components and comp_name not in envelope_components:
                continue

        status = "missing"
        source = None
        value = None

        # 1. Check EPC passport
        if epc_field:
            epc_val = passport.get(epc_field)
            # Handle list fields (energy_systems, ventilation_modes)
            if isinstance(epc_val, list):
                if epc_val:
                    status = "covered"
                    source = "EPC"
                    value = ", ".join(str(v) for v in epc_val)
            elif _is_present(epc_val):
                status = "covered"
                source = "EPC"
                value = epc_val

        # 2. Check TABULA match (only if not already covered by EPC)
        if status == "missing" and tabula_field:
            tab_val = _resolve_nested(tabula_match, tabula_field)
            if _is_present(tab_val):
                status = "covered"
                source = "TABULA"
                value = tab_val

        # 3. Boverket API
        if status == "missing" and key in _BOVERKET_KEYS and boverket_available:
            status = "covered"
            source = "Boverket"
            value = "Available via API"

        # 4. Wikells pricing
        if status == "missing" and key in _WIKELLS_KEYS:
            if wikells_available:
                status = "covered"
                source = "Wikells"
                value = "Available"
            else:
                # Placeholder — will be integrated
                status = "missing"
                source = None

        # 5. Synthetic fallback
        if status == "missing" and synthetic_ok:
            status = "available_synthetic"
            source = "Synthetic"

        results.append({
            "key": key,
            "label": label,
            "category": category,
            "unit": unit,
            "confidence_weight": weight,
            "status": status,
            "source": source,
            "value": value,
        })

    return results


def compute_confidence_score(coverage: list[dict]) -> float:
    """Weighted confidence score (0–100) based on coverage status.

    - covered → full weight
    - available_synthetic → 50% weight
    - missing → 0% weight
    """
    total_w = sum(r["confidence_weight"] for r in coverage)
    if total_w == 0:
        return 0.0
    earned = 0.0
    for r in coverage:
        w = r["confidence_weight"]
        if r["status"] == "covered":
            earned += w
        elif r["status"] == "available_synthetic":
            earned += w * 0.5
    return round(earned / total_w * 100, 1)


def group_by_category(coverage: list[dict]) -> dict[str, list[dict]]:
    """Group coverage results by category, preserving insertion order."""
    groups: dict[str, list[dict]] = {}
    for r in coverage:
        groups.setdefault(r["category"], []).append(r)
    return groups
