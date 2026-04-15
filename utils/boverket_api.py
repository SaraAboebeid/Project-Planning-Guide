"""
Boverket Klimatdatabas API client.

Provides cached access to Boverket's open climate database for building
materials (>200 generic building resources with GWP data).

API Documentation: https://api-portal.boverket.se/reference#api=klimatdatabas
"""

import json
import urllib.request
import urllib.error
import streamlit as st

BASE_URL = "https://api.boverket.se/klimatdatabas/api/Klimat/v2"

# ── Category ID → English name mapping ─────────────────────────────
CATEGORY_NAMES_EN = {
    2:  "Mineral materials",
    3:  "Energy and fuel",
    4:  "Windows, doors and glass",
    5:  "Paints and sealants",
    6:  "Concrete",
    7:  "Insulation",
    8:  "Steel and other metals",
    9:  "Blocks and tiles",
    10: "Building boards",
    11: "Waterproofing",
    12: "Solid woods",
    13: "Construction product",      # parent
    14: "Energy services",            # parent
    15: "Reused building products",
}


def _api_get(path: str, timeout: int = 12) -> dict | list | str | None:
    """Low-level GET request to the Boverket API.  Returns parsed JSON or None on error."""
    url = f"{BASE_URL}/{path}"
    try:
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, Exception):
        return None


# ── Cached public API functions ────────────────────────────────────

@st.cache_data(ttl=86400, show_spinner=False)
def get_latest_version() -> str | None:
    """Return the latest database version string, e.g. '02.07.000'."""
    data = _api_get("GetLatestVersion/sv/json")
    if isinstance(data, dict):
        return data.get("Version")
    return None


@st.cache_data(ttl=86400, show_spinner=False)
def get_all_versions() -> list[str]:
    """Return list of all available version strings."""
    data = _api_get("GetAllVersions/sv/json")
    if isinstance(data, list):
        return data
    return []


@st.cache_data(ttl=86400, show_spinner=False)
def get_categories(version: str | None = None, culture: str = "en") -> list[dict]:
    """
    Return flat list of subcategories.
    Each dict: {"Id": int, "Title": str, "ParentTitle": str}
    """
    ver = version or get_latest_version() or "02.07.000"
    data = _api_get(f"GetAllCategories/{ver}/{culture}/json")
    if not isinstance(data, dict):
        return []
    result = []
    for parent in data.get("Categories", []):
        parent_title = parent.get("Title", "")
        for child in parent.get("Children", []):
            result.append({
                "Id": child.get("Id"),
                "Title": child.get("Title", ""),
                "ParentTitle": parent_title,
            })
    return result


@st.cache_data(ttl=86400, show_spinner=False)
def get_resources_by_category(
    category_id: int,
    version: str | None = None,
    culture: str = "en",
) -> list[dict]:
    """
    Return resources for one category.
    Each resource is the raw API dict with keys like Name, DataItems,
    Conversions, InventoryUnit, etc.
    """
    ver = version or get_latest_version() or "02.07.000"
    data = _api_get(f"GetResourcesByCategory/{ver}/{culture}/json?code={category_id}")
    if isinstance(data, dict):
        return data.get("Resources", [])
    return []


@st.cache_data(ttl=86400, show_spinner=False)
def get_all_resources(version: str | None = None, culture: str = "en") -> list[dict]:
    """Return every resource in the database (all categories)."""
    ver = version or get_latest_version() or "02.07.000"
    data = _api_get(f"GetAllResources/{ver}/{culture}/json")
    if isinstance(data, dict):
        return data.get("Resources", [])
    return []


# ── Convenience helpers ────────────────────────────────────────────

def extract_gwp(resource: dict) -> dict:
    """
    Extract GWP values from a resource's DataItems.
    Returns dict like:
        {
            "A1-A3 Conservative": 0.122,
            "A1-A3 Typical": 0.0977,
            "A4": 0.00472,
            "A5.1": 0.00381,
        }
    """
    for di in resource.get("DataItems", []):
        if "GWP" in di.get("PropertyCode", ""):
            return {
                dv["DataModuleCode"]: dv["Value"]
                for dv in di.get("DataValueItems", [])
            }
    return {}


def resource_summary(resource: dict) -> dict:
    """
    Flatten a resource into a summary dict suitable for display in a DataFrame.
    Includes both individual lifecycle module values and calculated totals.
    """
    gwp = extract_gwp(resource)
    conversions = {
        c.get("Field", ""): f"{c.get('Value', '')} {c.get('Unit', '')}"
        for c in resource.get("Conversions", [])
    }
    # Get the Boverket classification text
    bov_cat = next(
        (c.get("Text", "") for c in resource.get("Categories", [])
         if c.get("ClassificationType") == "Boverket"),
        "—",
    )

    # Extract individual GWP values
    gwp_cons = gwp.get("A1-A3 Conservative")
    gwp_typ = gwp.get("A1-A3 Typical")
    gwp_a4 = gwp.get("A4", 0)
    gwp_a5 = gwp.get("A5.1", 0)

    # Calculate totals (Maximum = Conservative + A4 + A5, Minimum = Typical + A4 + A5)
    gwp_max = None
    gwp_min = None
    if gwp_cons not in (None, "—") and isinstance(gwp_cons, (int, float)):
        try:
            gwp_a4_val = float(gwp_a4) if gwp_a4 not in (None, "—", 0) else 0.0
            gwp_a5_val = float(gwp_a5) if gwp_a5 not in (None, "—", 0) else 0.0
            gwp_max = round(float(gwp_cons) + gwp_a4_val + gwp_a5_val, 5)
        except (ValueError, TypeError):
            gwp_max = None
    if gwp_typ not in (None, "—") and isinstance(gwp_typ, (int, float)):
        try:
            gwp_a4_val = float(gwp_a4) if gwp_a4 not in (None, "—", 0) else 0.0
            gwp_a5_val = float(gwp_a5) if gwp_a5 not in (None, "—", 0) else 0.0
            gwp_min = round(float(gwp_typ) + gwp_a4_val + gwp_a5_val, 5)
        except (ValueError, TypeError):
            gwp_min = None

    return {
        "Name": resource.get("Name", ""),
        "Unit": resource.get("InventoryUnit", ""),
        "Category": bov_cat,
        # Individual lifecycle modules
        "GWP A1-A3 (Conservative)": gwp.get("A1-A3 Conservative", "—"),
        "GWP A1-A3 (Typical)": gwp.get("A1-A3 Typical", "—"),
        "GWP A4 (Transport)": gwp.get("A4", "—"),
        "GWP A5.1 (Installation)": gwp.get("A5.1", "—"),
        # Calculated totals
        "GWP Max (Cons+A4+A5)": gwp_max if gwp_max is not None else "—",
        "GWP Min (Typ+A4+A5)": gwp_min if gwp_min is not None else "—",
        # Supporting data
        "Density / Conversion": conversions.get("Volume", conversions.get("Area", "—")),
        "Waste Factor": resource.get("WasteFactor", "—"),
    }


# ── Renovation component → Boverket material mapping ──────────────

# Each building component maps to a list of
# (boverket_category_id, name_filter_keywords) tuples.
# name_filter_keywords is a list of regex-style lowercase patterns;
# if empty, all resources in that category are included.

COMPONENT_MATERIAL_MAP: dict[str, list[tuple[int, list[str]]]] = {
    "Walls": [
        (6,  ["wall panel", "sandwich", "thin-shell"]),       # Concrete
        (9,  ["brick", "block", "aac", "sand lime"]),         # Blocks and tiles
        (10, ["facade", "sheathing", "fibre cement"]),        # Building boards
        (12, ["timber", "cross-laminated", "glulam", "lvl"]), # Solid woods
        (7,  ["wall", "facade", "batts", "rolls", "eps", "xps", "pir", "phenolic", "stone wool", "glasswool"]),  # Insulation
        (2,  ["plaster", "mortar", "render"]),                # Mineral materials
        (8,  ["steel sheet", "cladding", "light-weight"]),    # Steel
        (5,  []),                                              # Paints & sealants
    ],
    "Windows": [
        (4, ["window"]),                                       # Windows, doors & glass
    ],
    "Doors": [
        (4, ["door"]),                                         # Windows, doors & glass
    ],
    "Structure (Columns & Beams)": [
        (6,  ["column", "beam", "prestress"]),                # Concrete
        (8,  ["structural steel", "rebar", "prestress"]),     # Steel
        (12, ["glulam", "lvl", "cross-laminated", "i-joist"]), # Solid woods
    ],
    "Floor": [
        (6,  ["floor", "hollowcore", "solid floor", "tt concrete"]),  # Concrete
        (10, ["floorboard", "particle board", "osb", "plywood"]),      # Building boards
        (2,  ["floor screed", "rapid floor"]),                         # Mineral materials
        (7,  ["floor", "ground board"]),                               # Insulation
        (11, []),                                                       # Waterproofing
    ],
    "Roof": [
        (9,  ["roof tile"]),                                   # Blocks and tiles
        (7,  ["roof board", "attic"]),                         # Insulation
        (11, ["bitumen", "waterproofing"]),                    # Waterproofing
        (8,  ["steel sheet", "cladding"]),                     # Steel
    ],
    "Balcony": [
        (6,  ["balcon", "stair"]),                            # Concrete
        (8,  ["structural steel", "galvanised"]),             # Steel
        (11, []),                                              # Waterproofing
    ],
    "Insulation": [
        (7, []),                                               # All insulation
    ],
}

# User-friendly labels
RENOVATION_COMPONENTS = [
    "Walls",
    "Windows",
    "Doors",
    "Structure (Columns & Beams)",
    "Floor",
    "Roof",
    "Balcony",
    "Insulation",
]


@st.cache_data(ttl=86400, show_spinner=False)
def get_resources_for_component(
    component: str,
    version: str | None = None,
    culture: str = "en",
) -> list[dict]:
    """
    Return Boverket resources relevant to a specific renovation component.
    Filters by category and name keywords from COMPONENT_MATERIAL_MAP.
    """
    import re
    mappings = COMPONENT_MATERIAL_MAP.get(component, [])
    if not mappings:
        return []

    ver = version or get_latest_version() or "02.07.000"
    results: list[dict] = []
    seen_ids: set[int] = set()

    for cat_id, keywords in mappings:
        resources = get_resources_by_category(cat_id, version=ver, culture=culture)
        for res in resources:
            rid = res.get("ResourceId")
            if rid in seen_ids:
                continue
            if keywords:
                name_lower = res.get("Name", "").lower()
                if not any(re.search(kw, name_lower) for kw in keywords):
                    continue
            seen_ids.add(rid)
            results.append(res)

    return results
